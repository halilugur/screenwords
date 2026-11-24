//! Ahenk Cep (Turkish): EMA Lightning's architecture fine-tuned on Ahenk's
//! designed voice f022, with a speaking style. text.onnx turns letters and a
//! style into features and per-letter durations; the frame timeline comes
//! from rounding durations per word; cond.onnx lays the letters on that
//! timeline; step.onnx is one guided Euler step of the flow, run `steps`
//! times from seeded noise to latents; decoder.onnx maps latents to 48 kHz.
//! The decoder's background hiss is turned down over the finished take
//! ([`super::denoise`]).

use super::phrasing::{sentences, Pace, Spoken};
use super::{models_dir, Noise, Speech};

const SAMPLE_RATE: u32 = 48000;
/// One frame of the model's timeline: 1920 samples.
const FRAME_SECONDS: f64 = 1920.0 / SAMPLE_RATE as f64;
use crate::json::Value;
use ort::session::Session;
use ort::value::Tensor;

struct Tr {
    vocab: Vec<String>,
    /// The style id for `text.onnx`: its index in the config's `styles`.
    style: i64,
    /// Euler steps and classifier-free guidance scale (config `defaults`).
    steps: usize,
    cfg: f32,
    text: Session,
    cond: Session,
    step: Session,
    decoder: Session,
}

/// The styles the voice was trained in, in config order. "laughter" is in
/// the model's table but was never trained, so it is not offered.
pub const STYLES: [&str; 7] = ["neutral", "angry", "calm", "cheerful", "empathetic", "sad", "surprised"];

/// The style a voice name asks for: one of [`STYLES`], or neutral for any
/// other name (a voice picked for another language).
fn style_of(voice: &str) -> &'static str {
    STYLES.iter().copied().find(|s| s.eq_ignore_ascii_case(voice)).unwrap_or(STYLES[0])
}

fn load(style: &str) -> Result<Tr, String> {
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
    let style = cfg
        .get("styles")
        .and_then(Value::as_array)
        .and_then(|a| a.iter().position(|v| v.as_str() == Some(style)))
        .ok_or_else(|| format!("config styles: no '{style}'"))? as i64;
    let default = |key: &str| cfg.get("defaults").and_then(|d| d.get(key)).and_then(Value::as_f64).ok_or(format!("config defaults.{key}"));
    let session = |name: &str| {
        Session::builder()
            .and_then(|b| b.commit_from_file(dir.join(name)))
            .map_err(|e| format!("{name}: {e}"))
    };
    Ok(Tr {
        vocab,
        style,
        steps: default("steps")? as usize,
        cfg: default("cfg")? as f32,
        text: session("text.onnx")?,
        cond: session("cond.onnx")?,
        step: session("step.onnx")?,
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

/// The model's own tempo is its narration tempo (measured on EMA Lightning,
/// whose durations Ahenk Cep keeps). Every stretch that was tried
/// (x1.24, x1.1, x1.05) was heard as slow; what made the model sound hurried
/// was reading a paragraph without a breath, which speaking sentence by
/// sentence with pauses already cures.
const NARRATION_STRETCH: f32 = 1.0;
/// Longest sentence handed to the model in one pass, in characters.
const MAX_SENTENCE: usize = 300;

/// Speak `text` in the style `voice` names (see [`STYLES`]) sentence by
/// sentence — each gets its own intonation and the pause its punctuation
/// asks for — and report where every sentence and every written word sits
/// in the audio.
pub fn speak_timed(text: &str, voice: &str, seed: u32, pace: Pace) -> Result<Speech, String> {
    let mut tr = load(style_of(voice))?;
    let mut take = Spoken::new(SAMPLE_RATE);
    for (i, sentence) in sentences(text, MAX_SENTENCE).iter().enumerate() {
        let (pcm, words) = utter(&mut tr, sentence, seed.wrapping_add(i as u32), pace.stretch(NARRATION_STRETCH))?;
        take.push(&pcm, words, sentence, pace);
    }
    let mut speech = take.finish()?;
    speech.audio.samples = super::denoise::denoise(&speech.audio.samples);
    Ok(speech)
}

/// How many words the model says for each written word of `sentence`: one,
/// several for a number ("4,6" is read as three), none for a symbol it has
/// no letter for.
fn spoken_per_written(sentence: &str) -> Vec<usize> {
    sentence.split_whitespace().map(|word| frontend(&read_numbers(word)).split_whitespace().count()).collect()
}

/// The `(start, end)` seconds of each written word, from the frames the
/// model gave each word it said. None when the two do not add up (the
/// frontend read the sentence differently as a whole than word by word).
fn written_word_spans(sentence: &str, frames: &[usize]) -> Option<Vec<(f64, f64)>> {
    let per_written = spoken_per_written(sentence);
    if per_written.iter().sum::<usize>() != frames.len() {
        return None;
    }
    let mut at = 0usize;
    let mut frame = 0usize;
    Some(
        per_written
            .iter()
            .map(|&said| {
                let start = frame;
                frame += frames[at..at + said].iter().sum::<usize>();
                at += said;
                (start as f64 * FRAME_SECONDS, frame as f64 * FRAME_SECONDS)
            })
            .collect(),
    )
}

/// One sentence in one pass, its letter durations multiplied by `stretch`,
/// with the time of each of its written words. Empty when nothing in it can
/// be read.
fn utter(tr: &mut Tr, sentence: &str, seed: u32, stretch: f32) -> Result<(Vec<f32>, Option<Vec<(f64, f64)>>), String> {
    // number reading pass, then alphabet
    let alpha = frontend(&read_numbers(sentence));
    // Punctuation alone has durations too; the model would voice them as noise.
    if !alpha.chars().any(char::is_alphabetic) {
        return Ok((Vec::new(), None));
    }
    let stoi = |c: char| {
        tr.vocab
            .iter()
            .position(|v| v.starts_with(c))
            .unwrap_or(1)
    };
    let ids: Vec<i64> = alpha.chars().map(|c| stoi(c) as i64).collect();
    let l = ids.len();

    // text graph: h and per-letter durations, in the asked style
    let ids_t = Tensor::from_array(([1usize, l], ids)).map_err(|e| e.to_string())?;
    let style_t = Tensor::from_array(([1usize], vec![tr.style])).map_err(|e| e.to_string())?;
    let (h_vec, dur_vec) = {
        let out = tr
            .text
            .run(ort::inputs!["ids" => ids_t, "style" => style_t])
            .map_err(|e| e.to_string())?;
        let h = out["h"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        let d = out["dur"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        (
            h.as_slice().map(<[f32]>::to_vec).ok_or("h")?,
            d.as_slice().ok_or("dur")?.iter().map(|frames| frames * stretch).collect::<Vec<f32>>(),
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

    let tensor_err = |e: ort::Error| e.to_string();
    let h_t = Tensor::from_array(([1usize, l, 224usize], h_vec)).map_err(tensor_err)?;
    let dur_t = Tensor::from_array(([1usize, l], dur_vec)).map_err(tensor_err)?;
    let cw_t = Tensor::from_array(([1usize, l], cw)).map_err(tensor_err)?;
    let ws_t = Tensor::from_array(([1usize, l], wstart)).map_err(tensor_err)?;
    let fw_t = Tensor::from_array(([1usize, t], fw)).map_err(tensor_err)?;
    let fp_t = Tensor::from_array(([1usize, t], fp)).map_err(tensor_err)?;
    // the letters laid on the frame timeline, once for every step
    let cond: Vec<f32> = {
        let out = tr
            .cond
            .run(ort::inputs!["h" => h_t, "dur" => dur_t, "cw" => cw_t, "wstart" => ws_t, "fw" => fw_t, "fp" => fp_t])
            .map_err(tensor_err)?;
        let c = out["cond"].try_extract_array::<f32>().map_err(tensor_err)?;
        c.as_slice().map(<[f32]>::to_vec).ok_or("cond")?
    };

    // seeded noise [1,T,64], carried to latents by the guided Euler steps
    let mut noise = Noise(seed as u64 ^ 0xA5A5_1F2E_9D3C_7B4A);
    let mut x: Vec<f32> = (0..t * 64).map(|_| noise.normal()).collect();
    let dt = 1.0 / tr.steps as f32;
    let scalar = |v: f32| Tensor::from_array(([1usize], vec![v])).map_err(tensor_err);
    for k in 0..tr.steps {
        let out = tr
            .step
            .run(ort::inputs![
                "x" => Tensor::from_array(([1usize, t, 64usize], x)).map_err(tensor_err)?,
                "cond" => Tensor::from_array(([1usize, t, 224usize], cond.clone())).map_err(tensor_err)?,
                "t" => scalar(k as f32 * dt)?, "dt" => scalar(dt)?, "cfg" => scalar(tr.cfg)?,
            ])
            .map_err(tensor_err)?;
        let next = out["x_next"].try_extract_array::<f32>().map_err(tensor_err)?;
        x = next.as_slice().map(<[f32]>::to_vec).ok_or("x_next")?;
    }

    // the decoder reads latents channel-first: [1,64,T]
    let z: Vec<f32> = (0..64).flat_map(|c| x.iter().skip(c).step_by(64).copied().collect::<Vec<f32>>()).collect();
    let samples = {
        let out = tr
            .decoder
            .run(ort::inputs!["z" => Tensor::from_array(([1usize, 64usize, t], z)).map_err(tensor_err)?])
            .map_err(tensor_err)?;
        let audio = out["audio"].try_extract_array::<f32>().map_err(tensor_err)?;
        audio.as_slice().map(<[f32]>::to_vec).ok_or("audio")?
    };
    Ok((samples, written_word_spans(sentence, &counts)))
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
    fn a_paragraph_is_spoken_sentence_by_sentence_at_the_asked_pace() {
        if !models_dir().join("tr").join("step.onnx").exists() {
            return; // models not staged: skip
        }
        // Three sentences of a real narration, with a number and a colon.
        let text = "4,6 milyar yıl önce bir gaz ve toz bulutu çöktü. Merkezinde Güneş yandı. Erimiş bir gezegen doğdu: Dünya.";
        let Speech { audio: calm, sentences: windows, words } = speak_timed(text, "neutral", 42, Pace::NARRATION).unwrap();
        assert_eq!(calm.rate, SAMPLE_RATE);
        // Every written word has its own time, in order, inside its sentence:
        // "4,6" (read as three words) is one span, "çöktü." ends sentence one.
        let words = words.expect("the Turkish voice knows its word times");
        assert_eq!(words.len(), text.split_whitespace().count());
        assert!(words.iter().all(|(a, b)| b > a), "{words:?}");
        assert!(words.windows(2).all(|p| p[1].0 >= p[0].1 - 1e-9), "{words:?}");
        assert!(words[0].1 - words[0].0 > 0.6, "the number takes as long as its three words: {:?}", words[0]);
        let first_end = windows[0].0 + windows[0].1;
        assert!((words[9].1 - first_end).abs() < 0.05, "sentence one ends with its last word: {} vs {first_end}", words[9].1);
        assert!((words[10].0 - windows[1].0).abs() < 1e-6, "sentence two starts with its first word");
        assert_eq!(windows.len(), 3, "one window per sentence: {windows:?}");
        assert!(calm.samples.iter().all(|s| s.is_finite()));
        // A breath between sentences: each starts after the last one ended.
        for pair in windows.windows(2) {
            let gap = pair[1].0 - (pair[0].0 + pair[0].1);
            assert!((gap - 0.45).abs() < 0.01, "pause of {gap}s");
        }
        // The model's own tempo while speaking, about 5.2 to 6.2 syllables a
        // second: not the stretched 4.6 that was heard as dragging.
        let syllables = text.chars().filter(|c| "aeıioöuü".contains(*c)).count() as f64 + 8.0; // "4,6" is read as four words
        let speaking: f64 = windows.iter().map(|w| w.1).sum();
        let pace = syllables / speaking;
        assert!((5.2..6.2).contains(&pace), "{pace:.2} syllables a second");
        // Asked to be brisk, the same text takes less time; nothing is cut.
        let Speech { audio: brisk, sentences: brisk_windows, .. } = speak_timed(text, "neutral", 42, Pace::new(1.3).unwrap()).unwrap();
        assert_eq!(brisk_windows.len(), 3);
        assert!((brisk.samples.len() as f64) < calm.samples.len() as f64 * 0.85, "{} vs {}", brisk.samples.len(), calm.samples.len());
        // A text with nothing readable is an error, not silence.
        assert!(speak_timed("… — …", "neutral", 42, Pace::NARRATION).is_err());
    }

    #[test]
    fn a_style_is_picked_by_name_and_anything_else_speaks_neutral() {
        assert_eq!(style_of("sad"), "sad");
        assert_eq!(style_of("Cheerful"), "cheerful");
        // A voice chosen for another language, and the untrained laughter.
        assert_eq!(style_of("easton"), "neutral");
        assert_eq!(style_of("laughter"), "neutral");
    }

    #[test]
    fn every_offered_style_is_the_one_the_model_was_trained_on() {
        if !models_dir().join("tr").join("step.onnx").exists() {
            return; // models not staged: skip
        }
        for (i, style) in STYLES.iter().enumerate() {
            assert_eq!(load(style).unwrap().style, i as i64, "{style}");
        }
    }

    #[test]
    fn a_sad_reading_is_slower_than_a_neutral_one() {
        if !models_dir().join("tr").join("step.onnx").exists() {
            return; // models not staged: skip
        }
        // The card measures "sad" about 8 % slower: the style reaches the
        // durations, not only the sound.
        let text = "Ne kadar uğraştıysam da yetişemedim, onunla son kez vedalaşamadım.";
        let speaking = |style: &str| -> f64 {
            speak_timed(text, style, 7, Pace::NARRATION).unwrap().sentences.iter().map(|w| w.1).sum()
        };
        let (neutral, sad) = (speaking("neutral"), speaking("sad"));
        assert!(sad > neutral * 1.03, "sad {sad:.2}s vs neutral {neutral:.2}s");
    }

    #[test]
    fn written_words_take_the_frames_of_what_was_said_for_them() {
        // "4,6" is said as "dört virgül altı" and the arrow, which the model
        // has no letter for, as nothing.
        assert_eq!(spoken_per_written("4,6 milyar yıl → önce"), vec![3, 1, 1, 0, 1]);
        // 25 frames a second: six said words, their frames summed per written word.
        let spans = written_word_spans("4,6 milyar yıl → önce", &[10, 8, 7, 20, 5, 25]).unwrap();
        assert_eq!(spans, vec![(0.0, 1.0), (1.0, 1.8), (1.8, 2.0), (2.0, 2.0), (2.0, 3.0)]);
        // The model said a different number of words than the text predicts:
        // no word times rather than wrong ones.
        assert_eq!(written_word_spans("iki kelime", &[10, 10, 10]), None);
    }

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
