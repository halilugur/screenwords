//! EMA Lightning (Turkish): three ONNX graphs, one whole-utterance pass.
//! text.onnx turns letters into features and per-letter durations; the frame
//! timeline comes from rounding durations per word; sound.onnx runs the four
//! flow steps to latents; decoder.onnx maps latents to 48 kHz audio.

use super::{models_dir, Audio};
use crate::json::Value;
use ort::session::Session;
use ort::value::Tensor;

struct Tr {
    vocab: Vec<String>,
    text: Session,
    sound: Session,
    decoder: Session,
}

fn load() -> Result<Tr, String> {
    let dir = models_dir().join("tr");
    let cfg: Value = Value::parse(
        &std::fs::read_to_string(dir.join("config.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let vocab: Vec<String> = cfg
        .get("vocab")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .ok_or("config vocab")?;
    let session = |name: &str| {
        Session::builder()
            .and_then(|b| b.commit_from_file(dir.join(name)))
            .map_err(|e| format!("{name}: {e}"))
    };
    Ok(Tr {
        vocab,
        text: session("text.onnx")?,
        sound: session("sound.onnx")?,
        decoder: session("decoder.onnx")?,
    })
}

/// Turkish number reading (subset of normalizer-tr: integers, decimal commas).
fn number_words_tr(n: u64) -> String {
    const ONES: [&str; 10] = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
    const TENS: [&str; 10] = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
    if n == 0 {
        return "sıfır".into();
    }
    let under1000 = |mut v: u64| -> Vec<&'static str> {
        let mut p = Vec::new();
        let h = v / 100;
        v %= 100;
        if h > 0 {
            p.push(if h == 1 { "yüz" } else { ONES[h as usize] });
            if h > 1 {
                p.push("yüz");
            }
        }
        let (t, o) = ((v / 10) as usize, (v % 10) as usize);
        if t > 0 {
            p.push(TENS[t]);
        }
        if o > 0 {
            p.push(ONES[o]);
        }
        p
    };
    const UNITS: [&str; 4] = ["", "bin", "milyon", "milyar"];
    let mut groups: Vec<u64> = Vec::new();
    let mut n = n;
    while n > 0 {
        groups.push(n % 1000);
        n /= 1000;
    }
    let mut words: Vec<String> = Vec::new();
    for (rev, &v) in groups.iter().enumerate().rev() {
        if v == 0 {
            continue;
        }
        let idx = rev.min(3);
        if idx == 1 && v == 1 {
            words.push("bin".into());
            continue;
        }
        words.extend(under1000(v).into_iter().map(str::to_string));
        if idx > 0 {
            words.push(UNITS[idx].into());
        }
    }
    words.join(" ")
}

/// The model's 49-letter alphabet as a plain set (from the ONNX config).
const ALPHABET: &str = " !\"%&'(),-./:;?abcdefghijklmnopqrstuvwxyzçöüğış";

/// Written Turkish to the model's own alphabet: typographic folding, Turkish
/// lowercasing (I -> ı, İ -> i), base-letter folding for foreign accents,
/// everything unreadable to a space.
pub fn frontend(text: &str) -> String {
    let fold: &[(char, &str)] = &[
        ('\u{2019}', "'"), ('\u{2018}', "'"), ('\u{02BC}', "'"),
        ('\u{00B4}', "'"), ('\u{0060}', "'"),
        ('\u{201C}', "\""), ('\u{201D}', "\""), ('\u{201E}', "\""),
        ('\u{00AB}', "\""), ('\u{00BB}', "\""),
        ('\u{2013}', "-"), ('\u{2014}', "-"), ('\u{2212}', "-"),
        ('\u{2026}', "..."),
    ];
    let lower = |c: char| -> char {
        match c {
            'I' => '\u{131}',
            '\u{130}' => 'i',
            other => other.to_lowercase().next().unwrap_or(other),
        }
    };
    let base = |c: char| -> Option<char> {
        Some(match c {
            '\u{00E1}' | '\u{00E0}' | '\u{00E2}' | '\u{00E4}' => 'a',
            '\u{00E9}' | '\u{00E8}' | '\u{00EA}' | '\u{00EB}' => 'e',
            '\u{00ED}' | '\u{00EC}' | '\u{00EE}' | '\u{00EF}' => 'i',
            '\u{00F3}' | '\u{00F2}' | '\u{00F4}' => 'o',
            '\u{00FA}' | '\u{00F9}' | '\u{00FB}' => 'u',
            '\u{00F1}' => 'n',
            '\u{00E7}' => '\u{00E7}',
            '\u{011F}' => '\u{011F}',
            '\u{015F}' => '\u{015F}',
            '\u{0131}' => '\u{0131}',
            '\u{00F6}' => '\u{00F6}',
            '\u{00FC}' => '\u{00FC}',
            _ => return None,
        })
    };
    let mut out = String::with_capacity(text.len());
    let push_known = |piece: &str, out: &mut String| {
        if !piece.is_empty() && piece.chars().all(|c| ALPHABET.contains(c)) {
            out.push_str(piece);
        } else {
            out.push(' ');
        }
    };
    for ch in text.chars() {
        let mut replaced = false;
        for (from, to) in fold {
            if ch == *from {
                push_known(to, &mut out);
                replaced = true;
                break;
            }
        }
        if replaced {
            continue;
        }
        let low = lower(ch);
        if ALPHABET.contains(low) {
            out.push(low);
        } else if let Some(b) = base(low) {
            // fold accents to the base letter when the accented form is unknown
            let piece = b.to_string();
            if ALPHABET.contains(b) {
                out.push_str(&piece);
            } else {
                out.push(' ');
            }
        } else {
            out.push(' ');
        }
    }
    // collapse runs of spaces and trim
    let mut collapsed = String::with_capacity(out.len());
    let mut last_space = true;
    for ch in out.chars() {
        if ch == ' ' {
            if !last_space {
                collapsed.push(' ');
                last_space = true;
            }
        } else {
            collapsed.push(ch);
            last_space = false;
        }
    }
    collapsed.trim().to_string()
}

/// Seeded f32 gaussian (xorshift + Box-Muller) for the sound graph's noise.
struct Noise(u64);
impl Noise {
    fn next_u32(&mut self) -> u32 {
        // xorshift64*
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        (x.wrapping_mul(0x2545F4914F6CDD1D) >> 32) as u32
    }
    fn uniform(&mut self) -> f64 {
        (self.next_u32() as f64 + 0.5) / 4294967296.0
    }
    fn normal(&mut self) -> f32 {
        let u = self.uniform();
        let v = self.uniform();
        ((-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()) as f32
    }
}

pub fn speak(text: &str, seed: u32) -> Result<Audio, String> {
    let mut tr = load()?;
    // number reading pass, then alphabet
    let normalized = read_numbers(text);
    let alpha = frontend(&normalized);
    if alpha.is_empty() {
        return Err("nothing to say".into());
    }
    let stoi = |c: char| {
        tr.vocab
            .iter()
            .position(|v| v.starts_with(c))
            .unwrap_or(1)
    };
    let ids: Vec<i64> = alpha.chars().map(|c| stoi(c) as i64).collect();
    let l = ids.len();

    // text graph: h and per-letter durations
    let ids_t = Tensor::from_array(([1usize, l], ids)).map_err(|e| e.to_string())?;
    let (h_vec, dur_vec) = {
        let out = tr
            .text
            .run(ort::inputs!["ids" => ids_t])
            .map_err(|e| e.to_string())?;
        let h = out["h"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        let d = out["dur"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        (
            h.as_slice().map(<[f32]>::to_vec).ok_or("h")?,
            d.as_slice().map(<[f32]>::to_vec).ok_or("dur")?,
        )
    };

    // word spans (letters; spaces belong to the following word)
    let chars: Vec<char> = alpha.chars().collect();
    let mut bounds: Vec<usize> = Vec::new();
    for (i, &c) in chars.iter().enumerate() {
        if c != ' ' && (i == 0 || chars[i - 1] == ' ') {
            bounds.push(i);
        }
    }
    if bounds.is_empty() {
        bounds.push(0);
    }
    bounds.push(l);
    let mut cw: Vec<i64> = Vec::with_capacity(l);
    let mut wstart: Vec<i64> = Vec::with_capacity(l);
    for (w, pair) in bounds.windows(2).enumerate() {
        for _ in pair[0]..pair[1] {
            cw.push(w as i64);
            wstart.push(pair[0] as i64);
        }
    }
    let n_words = *cw.last().unwrap() as usize + 1;

    // per-word rounded frame counts
    let mut counts = vec![0f64; n_words];
    for (i, &w) in cw.iter().enumerate() {
        counts[w as usize] += dur_vec[i].max(1e-4) as f64;
    }
    let counts: Vec<usize> = counts
        .iter()
        .map(|c| (c.round() as usize).clamp(1, 250))
        .collect();
    if std::env::var("SCREENWORDS_TTS_DEBUG").is_ok() {
        eprintln!("letters={l} words={n_words} dur_sum={:.2} counts={counts:?}", dur_vec.iter().sum::<f32>());
    }
    let total: usize = counts.iter().sum::<usize>().min(3000);
    let mut fw: Vec<i64> = Vec::with_capacity(total);
    let mut fp: Vec<f32> = Vec::with_capacity(total);
    let mut word_start_frame = vec![0usize; n_words];
    let mut acc = 0;
    for (w, &c) in counts.iter().enumerate() {
        word_start_frame[w] = acc;
        acc += c;
    }
    for (w, &c) in counts.iter().enumerate() {
        for f in 0..c.min(total.saturating_sub(word_start_frame[w])) {
            fw.push(w as i64);
            fp.push(f as f32 / c as f32);
        }
    }
    let t = fw.len();

    // seeded noise [1,4,T,64]
    let mut noise = Noise(seed as u64 ^ 0xA5A5_1F2E_9D3C_7B4A);
    let mut noise_data = vec![0f32; 4 * t * 64];
    for v in noise_data.iter_mut() {
        *v = noise.normal();
    }

    let h_t = Tensor::from_array(([1usize, l, 224usize], h_vec)).map_err(|e| e.to_string())?;
    let dur_t = Tensor::from_array(([1usize, l], dur_vec)).map_err(|e| e.to_string())?;
    let cw_t = Tensor::from_array(([1usize, l], cw)).map_err(|e| e.to_string())?;
    let ws_t = Tensor::from_array(([1usize, l], wstart)).map_err(|e| e.to_string())?;
    let fw_t = Tensor::from_array(([1usize, t], fw)).map_err(|e| e.to_string())?;
    let fp_t = Tensor::from_array(([1usize, t], fp)).map_err(|e| e.to_string())?;
    let noise_t =
        Tensor::from_array(([1usize, 4, t, 64usize], noise_data)).map_err(|e| e.to_string())?;
    let (_lat, samples) = {
        let out = tr
            .sound
            .run(ort::inputs![
                "h" => h_t, "dur" => dur_t, "cw" => cw_t, "wstart" => ws_t,
                "fw" => fw_t, "fp" => fp_t, "noise" => noise_t,
            ])
            .map_err(|e| e.to_string())?;
        let lat_arr = out["latents"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        let lat: Vec<f32> = lat_arr.as_slice().map(<[f32]>::to_vec).ok_or("latents")?;
        drop(out);
        let z_t = Tensor::from_array(([1usize, t, 64usize], lat)).map_err(|e| e.to_string())?;
        let out2 = tr
            .decoder
            .run(ort::inputs!["z" => z_t])
            .map_err(|e| e.to_string())?;
        let audio_arr = out2["audio"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        let samples: Vec<f32> = audio_arr.as_slice().map(<[f32]>::to_vec).ok_or("audio")?;
        (Vec::<f32>::new(), samples)
    };
    Ok(Audio { samples, rate: 48000 })
}

/// Replace digit runs with Turkish words (integers + decimal commas).
fn read_numbers(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        if run.is_empty() {
            return;
        }
        if let Some((int_part, frac)) = run.split_once(',') {
            if !int_part.is_empty()
                && int_part.chars().all(|c| c.is_ascii_digit())
                && frac.chars().all(|c| c.is_ascii_digit())
            {
                let words = number_words_tr(int_part.parse::<u64>().unwrap_or(0));
                out.push_str(&words);
                out.push_str(" virgül ");
                for (i, d) in frac.chars().enumerate() {
                    if i > 0 {
                        out.push(' ');
                    }
                    out.push_str(&number_words_tr(d.to_digit(10).unwrap_or(0) as u64));
                }
                run.clear();
                return;
            }
        }
        if run.chars().all(|c| c.is_ascii_digit()) && !run.is_empty() {
            out.push_str(&number_words_tr(run.parse::<u64>().unwrap_or(0)));
            run.clear();
        }
    };
    for ch in text.chars() {
        if ch.is_ascii_digit() || (ch == ',' && !run.is_empty() && run.chars().all(|c| c.is_ascii_digit())) {
            run.push(ch);
        } else {
            flush(&mut run, &mut out);
            out.push(ch);
        }
    }
    flush(&mut run, &mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frontend_folds_to_the_model_alphabet() {
        assert_eq!(frontend("Merhaba!"), "merhaba!");
        // Turkish lowercase: I -> ı, İ -> i
        assert_eq!(frontend("İSTANBUL"), "istanbul");
        assert_eq!(frontend("KITAP"), "kıtap");
        // foreign accents fold to base letters, unreadables become spaces
        assert_eq!(frontend("café"), "cafe");
        assert!(frontend("\u{4e2d}\u{6587}").trim().is_empty());
        // typographic quotes fold to ascii
        assert_eq!(frontend("x\u{2019}y"), "x'y");
    }

    #[test]
    fn numbers_read_in_turkish() {
        assert_eq!(read_numbers("1823"), "bin sekiz yüz yirmi üç");
        assert_eq!(read_numbers("0"), "sıfır");
        assert!(read_numbers("14,30").contains("virgül"));
    }
}
