//! Supertonic 3 (Supertone, OpenRAIL-M): 31 languages, one voice set, four
//! ONNX graphs, 44.1 kHz. All inference is CPU-local, like the other backends.
//!
//! The pipeline mirrors Supertone's reference engines (the Python SDK and the
//! browser demo ship the same protocol):
//!
//! 1. `duration_predictor` — text ids + duration style -> seconds per chunk.
//! 2. `text_encoder`      — text ids + text style      -> text embedding.
//! 3. `vector_estimator`  — flow-matching denoiser run `DEFAULT_STEPS` times.
//! 4. `vocoder`           — latent -> waveform at `ae.sample_rate`.
//!
//! Text reaches the model NFKD-decomposed and wrapped in `<lang>...</lang>`;
//! the `unicode_indexer.json` table has combining marks but not precomposed
//! accents, which is why [`super::nfkd`] exists.

use super::{models_dir, Audio};
use crate::json::Value;
use ort::session::Session;
use ort::value::Tensor;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The 31 languages Supertonic 3 was trained on (ISO 639-1).
pub const LANGUAGES: [&str; 31] = [
    "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr",
    "hu", "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk",
    "vi",
];

/// Fallback language tag for text whose language the model does not list.
const UNKNOWN_LANG: &str = "na";

pub const DEFAULT_VOICE: &str = "M1";

/// Diffusion steps. The reference defaults to 8; fewer is faster and rougher.
const DEFAULT_STEPS: usize = 8;
/// Characters per synthesis chunk (Korean needs shorter ones).
const MAX_CHUNK: usize = 300;
const MAX_CHUNK_KO: usize = 120;
/// Silence inserted between sentence chunks, in seconds.
const SILENCE: f32 = 0.3;

// ---------- language / voice discovery ----------

/// True when all four graphs and the indexer are staged under `tts-models/s3`.
pub fn available() -> bool {
    let onnx = models_dir().join("s3").join("onnx");
    ["duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx"]
        .iter()
        .all(|f| onnx.join(f).exists())
        && onnx.join("unicode_indexer.json").exists()
}

/// Model dir: `tts-models/s3` (honours `SCREENWORDS_TTS_MODELS` via `models_dir`).
fn dir() -> PathBuf {
    models_dir().join("s3")
}

fn styles_dir() -> PathBuf {
    dir().join("voice_styles")
}

/// Shipped voice styles, sorted (F1..F5, M1..M5), plus any custom JSON dropped in.
pub fn voice_names() -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(styles_dir())
        .map(|rd| {
            rd.flatten()
                .filter_map(|e| {
                    let p = e.path();
                    (p.extension().and_then(|x| x.to_str()) == Some("json"))
                        .then(|| p.file_stem().and_then(|s| s.to_str()).map(str::to_string))
                        .flatten()
                })
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    if names.is_empty() {
        names = ["F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"]
            .iter()
            .map(|s| s.to_string())
            .collect();
    }
    names
}

/// A voice name belongs to this backend when it is one of the shipped styles
/// (M1..M9 / F1..F9) or a style file exists. Used for routing, so it avoids
/// turning every synthesis call into a `read_dir`.
pub fn is_voice(name: &str) -> bool {
    let b = name.as_bytes();
    let shipped = b.len() == 2 && matches!(b[0], b'M' | b'F') && b[1].is_ascii_digit();
    shipped || styles_dir().join(format!("{name}.json")).exists()
}

/// ISO code the model accepts, or `na`.
fn lang_tag(lang: &str) -> &'static str {
    LANGUAGES.iter().copied().find(|l| *l == lang).unwrap_or(UNKNOWN_LANG)
}

// ---------- engine ----------

struct Style {
    ttl_dims: Vec<usize>,
    ttl: Vec<f32>,
    dp_dims: Vec<usize>,
    dp: Vec<f32>,
}

impl Clone for Style {
    fn clone(&self) -> Self {
        Style {
            ttl_dims: self.ttl_dims.clone(),
            ttl: self.ttl.clone(),
            dp_dims: self.dp_dims.clone(),
            dp: self.dp.clone(),
        }
    }
}

struct Engine {
    dir: PathBuf,
    dp: Session,
    enc: Session,
    ve: Session,
    voc: Session,
    indexer: Vec<i32>,
    space_id: i64,
    sample_rate: u32,
    base_chunk: usize,
    compress: usize,
    ldim: usize,
    styles: HashMap<String, Style>,
}

/// Sessions are `Send`, so one engine serves every request thread; the lock
/// also keeps two 400 MB loads from racing. Synthesis is serialized, which is
/// what a single-user editor wants anyway.
static ENGINE: Mutex<Option<Engine>> = Mutex::new(None);

fn engine() -> Result<std::sync::MutexGuard<'static, Option<Engine>>, String> {
    let mut guard = ENGINE.lock().unwrap_or_else(|e| e.into_inner());
    let want = dir();
    if guard.as_ref().map(|e| e.dir != want).unwrap_or(true) {
        *guard = Some(Engine::load(&want)?);
    }
    Ok(guard)
}

impl Engine {
    fn load(dir: &Path) -> Result<Engine, String> {
        let onnx = dir.join("onnx");
        let session = |name: &str| {
            Session::builder()
                .and_then(|b| b.commit_from_file(onnx.join(name)))
                .map_err(|e| format!("{name}: {e}"))
        };
        let cfg_txt =
            std::fs::read_to_string(onnx.join("tts.json")).map_err(|e| format!("tts.json: {e}"))?;
        let cfg = Value::parse(&cfg_txt).map_err(|e| format!("tts.json: {e}"))?;
        let num = |section: &str, key: &str| -> Result<f64, String> {
            cfg.get(section)
                .and_then(|s| s.get(key))
                .and_then(Value::as_f64)
                .ok_or_else(|| format!("tts.json: {section}.{key}"))
        };

        let idx_txt = std::fs::read_to_string(onnx.join("unicode_indexer.json"))
            .map_err(|e| format!("unicode_indexer.json: {e}"))?;
        let idx = Value::parse(&idx_txt).map_err(|e| format!("unicode_indexer.json: {e}"))?;
        let indexer: Vec<i32> = idx
            .as_array()
            .ok_or("unicode_indexer.json: expected an array")?
            .iter()
            .map(|v| v.as_i64().unwrap_or(-1) as i32)
            .collect();

        Ok(Engine {
            dir: dir.to_path_buf(),
            dp: session("duration_predictor.onnx")?,
            enc: session("text_encoder.onnx")?,
            ve: session("vector_estimator.onnx")?,
            voc: session("vocoder.onnx")?,
            space_id: indexer.get(0x20).copied().filter(|&i| i >= 0).unwrap_or(0) as i64,
            indexer,
            sample_rate: num("ae", "sample_rate")? as u32,
            base_chunk: num("ae", "base_chunk_size")? as usize,
            compress: num("ttl", "chunk_compress_factor")? as usize,
            ldim: num("ttl", "latent_dim")? as usize,
            styles: HashMap::new(),
        })
    }

    fn style(&mut self, name: &str) -> Result<Style, String> {
        let name = if styles_dir().join(format!("{name}.json")).exists() {
            name.to_string()
        } else {
            DEFAULT_VOICE.to_string()
        };
        if !self.styles.contains_key(&name) {
            let style = load_style(&self.dir, &name)?;
            self.styles.insert(name.clone(), style);
        }
        Ok(self.styles[&name].clone())
    }

    /// Index one preprocessed string. Unsupported code points become a space so
    /// a stray symbol never fails an entire narration.
    fn index(&self, text: &str) -> Vec<i64> {
        text.chars()
            .map(|c| {
                let cp = c as usize;
                match self.indexer.get(cp) {
                    Some(&id) if id >= 0 => id as i64,
                    _ => self.space_id,
                }
            })
            .collect()
    }

    /// One chunk of speech, without silence padding.
    fn synth(&mut self, text: &str, lang: &str, voice: &str, seed: u32) -> Result<Vec<f32>, String> {
        let style = self.style(voice)?;
        let prepared = preprocess(text, lang_tag(lang));
        if prepared.trim().is_empty() {
            return Ok(Vec::new());
        }
        let ids = self.index(&prepared);
        let len = ids.len();
        if len == 0 {
            return Ok(Vec::new());
        }

        let text_ids = Tensor::from_array(([1usize, len], ids)).map_err(|e| e.to_string())?;
        let text_mask =
            Tensor::from_array(([1usize, 1usize, len], vec![1f32; len])).map_err(|e| e.to_string())?;
        let style_dp = tensor(style.dp_dims.clone(), style.dp.clone())?;
        let style_ttl = tensor(style.ttl_dims.clone(), style.ttl.clone())?;

        let out = self
            .dp
            .run(ort::inputs![
                "text_ids" => text_ids.clone(),
                "style_dp" => style_dp,
                "text_mask" => text_mask.clone()
            ])
            .map_err(|e| format!("duration_predictor: {e}"))?;
        let dur = {
            let arr = out["duration"]
                .try_extract_array::<f32>()
                .map_err(|e| format!("duration: {e}"))?;
            arr.iter().next().copied().unwrap_or(0.0)
        };
        if !(dur > 0.0) || !dur.is_finite() {
            return Err(format!("duration_predictor returned {dur}"));
        }

        let out = self
            .enc
            .run(ort::inputs![
                "text_ids" => text_ids,
                "style_ttl" => style_ttl,
                "text_mask" => text_mask.clone()
            ])
            .map_err(|e| format!("text_encoder: {e}"))?;
        let (emb_dims, emb) = take(&out, "text_emb")?;

        let chunk = (self.base_chunk * self.compress) as f64;
        let latent_len =
            (((dur as f64 * self.sample_rate as f64) + chunk - 1.0) / chunk).floor().max(1.0) as usize;
        let latent_dim = self.ldim * self.compress;
        let mut latent = vec![0f32; latent_dim * latent_len];
        let mut rng = Rng::new(seed);
        for x in latent.iter_mut() {
            *x = rng.normal();
        }
        let latent_mask = vec![1f32; latent_len];

        let total = Tensor::from_array(([1usize], vec![DEFAULT_STEPS as f32]))
            .map_err(|e| e.to_string())?;
        for step in 0..DEFAULT_STEPS {
            let current = Tensor::from_array(([1usize], vec![step as f32]))
                .map_err(|e| e.to_string())?;
            let out = self
                .ve
                .run(ort::inputs![
                    "noisy_latent" => tensor(vec![1, latent_dim, latent_len], latent.clone())?,
                    "text_emb" => tensor(emb_dims.clone(), emb.clone())?,
                    "style_ttl" => tensor(style.ttl_dims.clone(), style.ttl.clone())?,
                    "text_mask" => text_mask.clone(),
                    "latent_mask" => tensor(vec![1, 1, latent_len], latent_mask.clone())?,
                    "current_step" => current,
                    "total_step" => total.clone()
                ])
                .map_err(|e| format!("vector_estimator step {step}: {e}"))?;
            let (_, next) = take(&out, "denoised_latent")?;
            if next.len() != latent.len() {
                return Err(format!(
                    "vector_estimator step {step}: {} values, expected {}",
                    next.len(),
                    latent.len()
                ));
            }
            latent = next;
        }

        let out = self
            .voc
            .run(ort::inputs!["latent" => tensor(vec![1, latent_dim, latent_len], latent)?])
            .map_err(|e| format!("vocoder: {e}"))?;
        let (_, mut pcm) = take(&out, "wav_tts")?;
        let want = (dur as f64 * self.sample_rate as f64) as usize;
        pcm.truncate(want.min(pcm.len()));
        Ok(pcm)
    }
}

fn load_style(dir: &Path, name: &str) -> Result<Style, String> {
    let path = dir.join("voice_styles").join(format!("{name}.json"));
    let txt = std::fs::read_to_string(&path)
        .map_err(|e| format!("voice style {}: {e}", path.display()))?;
    let v = Value::parse(&txt).map_err(|e| format!("voice style {name}: {e}"))?;
    let part = |key: &str| -> Result<(Vec<usize>, Vec<f32>), String> {
        let node = v.get(key).ok_or_else(|| format!("voice style {name}: {key}"))?;
        let dims: Vec<usize> = node
            .get("dims")
            .and_then(Value::as_array)
            .ok_or_else(|| format!("voice style {name}: {key}.dims"))?
            .iter()
            .filter_map(|d| d.as_i64().map(|d| d as usize))
            .collect();
        let mut data = Vec::new();
        if let Some(d) = node.get("data") {
            flatten(d, &mut data);
        }
        let want: usize = dims.iter().product();
        if data.len() != want {
            return Err(format!("voice style {name}: {key} has {} values, dims {dims:?}", data.len()));
        }
        Ok((dims, data))
    };
    let (ttl_dims, ttl) = part("style_ttl")?;
    let (dp_dims, dp) = part("style_dp")?;
    Ok(Style { ttl_dims, ttl, dp_dims, dp })
}

fn flatten(v: &Value, out: &mut Vec<f32>) {
    match v {
        Value::Array(items) => {
            for item in items {
                flatten(item, out);
            }
        }
        Value::Int(i) => out.push(*i as f32),
        Value::Float(f) => out.push(*f as f32),
        _ => {}
    }
}

fn tensor(dims: Vec<usize>, data: Vec<f32>) -> Result<Tensor<f32>, String> {
    Tensor::from_array((dims, data)).map_err(|e| e.to_string())
}

fn take(out: &ort::session::SessionOutputs, name: &str) -> Result<(Vec<usize>, Vec<f32>), String> {
    let arr = out[name].try_extract_array::<f32>().map_err(|e| format!("{name}: {e}"))?;
    let dims = arr.shape().to_vec();
    let data = arr.as_slice().map(<[f32]>::to_vec).ok_or_else(|| format!("{name}: non-contiguous"))?;
    Ok((dims, data))
}

// ---------- seeded noise ----------

struct Rng {
    state: u64,
}

impl Rng {
    fn new(seed: u32) -> Rng {
        Rng { state: 0x9E37_79B9_7F4A_7C15 ^ seed as u64 }
    }
    fn next_u64(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    fn uniform(&mut self) -> f64 {
        ((self.next_u64() >> 11) as f64 + 0.5) / (1u64 << 53) as f64
    }
    /// Box-Muller, matching the reference engines' standard-normal latent draw.
    fn normal(&mut self) -> f32 {
        let u1 = self.uniform();
        let u2 = self.uniform();
        ((-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()) as f32
    }
}

// ---------- text ----------

fn is_emoji(c: char) -> bool {
    let cp = c as u32;
    matches!(cp,
        0x1F600..=0x1F64F | 0x1F300..=0x1F5FF | 0x1F680..=0x1F6FF |
        0x1F700..=0x1F77F | 0x1F780..=0x1F7FF | 0x1F800..=0x1F8FF |
        0x1F900..=0x1F9FF | 0x1FA00..=0x1FA6F | 0x1FA70..=0x1FAFF |
        0x2600..=0x26FF | 0x2700..=0x27BF | 0x1F1E6..=0x1F1FF)
}

/// Symbol normalization applied after NFKD, mirroring the reference engines.
fn symbol(c: char) -> Option<&'static str> {
    Some(match c {
        '\u{2013}' | '\u{2011}' | '\u{2014}' => "-",
        '\u{00AF}' | '_' | '[' | ']' | '|' | '/' | '#' | '\u{2192}' | '\u{2190}' => " ",
        '\u{201C}' | '\u{201D}' => "\"",
        '\u{2018}' | '\u{2019}' | '\u{00B4}' | '`' => "'",
        _ => return None,
    })
}

/// Normalize, clean and wrap `text` in `<lang>...</lang>` for the model.
fn preprocess(text: &str, lang: &str) -> String {
    // 1. NFKD: the indexer stores combining marks, not precomposed letters.
    let mut s = String::with_capacity(text.len() + 8);
    for c in text.chars() {
        super::nfkd::decompose(&mut s, c);
    }
    // 2. emoji, 3. symbols, 4. decorative leftovers.
    let mut t = String::with_capacity(s.len());
    for c in s.chars() {
        if is_emoji(c) || matches!(c, '©' | '\\') {
            continue;
        }
        match symbol(c) {
            Some(r) => t.push_str(r),
            None => t.push(c),
        }
    }
    // 5. expressions the model reads badly as symbols.
    t = t.replace('@', " at ");
    t = t.replace("e.g.,", "for example,");
    t = t.replace("i.e.,", "that is,");
    // 6. spacing around punctuation.
    for (from, to) in [(" ,", ","), (" .", "."), (" !", "!"), (" ?", "?"), (" ;", ";"), (" :", ":"), (" '", "'")] {
        t = t.replace(from, to);
    }
    // 7. duplicate quotes.
    for (from, to) in [("\"\"", "\""), ("''", "'"), ("``", "`")] {
        while t.contains(from) {
            t = t.replace(from, to);
        }
    }
    // 8. whitespace.
    let mut clean = t.split_whitespace().collect::<Vec<_>>().join(" ");
    // 9. a terminal mark keeps the prosody from cutting off.
    let ends = |c: char| ".!?;:,'\"')]}…。」』】〉》›»".contains(c);
    if !clean.chars().last().map(ends).unwrap_or(false) {
        clean.push('.');
    }
    // 10. language tag.
    format!("<{lang}>{clean}</{lang}>")
}

fn is_abbrev(s: &str) -> bool {
    let token = s.trim_end_matches('.').split_whitespace().last().unwrap_or("");
    matches!(
        token,
        "Mr" | "Mrs" | "Ms" | "Dr" | "Prof" | "Sr" | "Jr" | "St" | "Ave" | "Blvd" | "Inc"
            | "Ltd" | "Co" | "Corp" | "vs" | "e.g" | "i.e" | "etc" | "Ph.D"
    ) || (token.chars().count() == 1 && token.chars().next().map(char::is_uppercase).unwrap_or(false))
}

/// One chunk per sentence: the audio window of each chunk then maps 1:1 to a
/// transcript segment, which is what caption re-timing needs.
fn plan(text: &str, lang: &str) -> Vec<String> {
    let max = if lang == "ko" { MAX_CHUNK_KO } else { MAX_CHUNK };
    let mut sentences: Vec<String> = Vec::new();
    let mut cur = String::new();
    for c in text.chars() {
        cur.push(c);
        let boundary = matches!(c, '.' | '!' | '?' | '…' | '。' | '！' | '？') && !is_abbrev(&cur);
        if boundary || c == '\n' {
            let s = cur.trim();
            if !s.is_empty() {
                sentences.push(s.to_string());
            }
            cur.clear();
        }
    }
    if !cur.trim().is_empty() {
        sentences.push(cur.trim().to_string());
    }

    let mut out = Vec::new();
    for sentence in sentences {
        if sentence.chars().count() <= max {
            out.push(sentence);
            continue;
        }
        let mut line = String::new();
        for word in sentence.split_whitespace() {
            let len = word.chars().count();
            if len > max {
                // No-space scripts (CJK) still have to be cut somewhere.
                if !line.is_empty() {
                    out.push(std::mem::take(&mut line));
                }
                let chars: Vec<char> = word.chars().collect();
                for part in chars.chunks(max) {
                    out.push(part.iter().collect());
                }
                continue;
            }
            if !line.is_empty() && line.chars().count() + 1 + len > max {
                out.push(std::mem::take(&mut line));
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        if !line.is_empty() {
            out.push(line);
        }
    }
    out
}

// ---------- public entry points ----------

/// Speak `text` in `lang` with a Supertonic voice style.
pub fn speak(text: &str, voice: &str, seed: u32, lang: &str) -> Result<Audio, String> {
    speak_timed(text, voice, seed, lang).map(|(audio, _)| audio)
}

/// As [`speak`], plus the `(start, duration)` window of every sentence chunk so
/// the caller can map transcript times onto the real audio.
pub fn speak_timed(
    text: &str,
    voice: &str,
    seed: u32,
    lang: &str,
) -> Result<(Audio, Vec<(f64, f64)>), String> {
    let chunks = plan(text, lang);
    if chunks.is_empty() {
        return Err("nothing to say".into());
    }
    let mut guard = engine()?;
    let engine = guard.as_mut().ok_or("supertonic engine unavailable")?;
    let rate = engine.sample_rate;
    let silence = vec![0f32; (SILENCE * rate as f32) as usize];

    let mut samples: Vec<f32> = Vec::new();
    let mut windows: Vec<(f64, f64)> = Vec::new();
    for (i, chunk) in chunks.iter().enumerate() {
        let pcm = engine.synth(chunk, lang, voice, seed.wrapping_add(i as u32))?;
        if pcm.is_empty() {
            continue;
        }
        let start = samples.len() as f64 / rate as f64;
        windows.push((start, pcm.len() as f64 / rate as f64));
        samples.extend_from_slice(&pcm);
        if i + 1 < chunks.len() {
            samples.extend_from_slice(&silence);
        }
    }
    if samples.is_empty() {
        return Err("supertonic produced no audio".into());
    }
    Ok((Audio { samples, rate }, windows))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nfkd_reaches_combining_marks() {
        let s = preprocess("Şehir", "tr");
        assert!(s.starts_with("<tr>") && s.ends_with("</tr>"), "{s}");
        // S + combining cedilla, s + cedilla: the indexer has no precomposed Ş.
        assert!(s.contains('\u{0327}'), "{s:?}");
        assert!(!s.contains('Ş'), "{s:?}");
    }

    #[test]
    fn preprocess_adds_terminal_period_and_collapses_space() {
        assert_eq!(preprocess("hello   world", "en"), "<en>hello world.</en>");
        assert_eq!(preprocess("Done!", "en"), "<en>Done!</en>");
        // A closing quote is terminal punctuation, as in the reference engine.
        assert_eq!(preprocess("“hi”", "en"), "<en>\"hi\"</en>");
        assert_eq!(preprocess("“hi", "en"), "<en>\"hi.</en>");
    }

    #[test]
    fn unknown_language_falls_back_to_na() {
        assert_eq!(lang_tag("xx"), "na");
        assert_eq!(lang_tag("tr"), "tr");
    }

    #[test]
    fn plan_is_one_chunk_per_sentence() {
        let chunks = plan("One sentence. Two sentences here!\nThird?", "en");
        assert_eq!(chunks, vec!["One sentence.", "Two sentences here!", "Third?"]);
    }

    #[test]
    fn plan_keeps_abbreviations_together() {
        let chunks = plan("Dr. Smith arrived. He left.", "en");
        assert_eq!(chunks.len(), 2, "{chunks:?}");
        assert!(chunks[0].starts_with("Dr. Smith"));
    }

    #[test]
    fn long_sentences_are_split() {
        let text = "word ".repeat(200);
        let chunks = plan(text.trim(), "en");
        assert!(chunks.len() > 1);
        assert!(chunks.iter().all(|c| c.chars().count() <= MAX_CHUNK));
    }

    #[test]
    fn voice_names_and_routing() {
        assert!(is_voice("M1"));
        assert!(is_voice("F5"));
        assert!(!is_voice("easton"));
        assert!(!is_voice("M10"));
        assert!(!is_voice("x"));
    }

    #[test]
    fn synthesizes_when_models_are_staged() {
        if !available() {
            return; // models not staged: skip
        }
        let (audio, windows) = speak_timed("Hello there.", "M1", 7, "en").unwrap();
        assert_eq!(audio.rate, 44100);
        assert!(audio.samples.len() > 4410, "expected >0.1s of audio");
        assert_eq!(windows.len(), 1);
        assert!(audio.samples.iter().all(|s| s.is_finite()));
    }
}
