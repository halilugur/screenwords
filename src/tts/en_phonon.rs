//! Phonon 31M (English): four ONNX graphs driven as an autoregressive loop.
//! text_conditioner turns token ids into embeddings plus the BOS embedding;
//! flow_lm_main is one causal-transformer step with explicit past/present KV
//! caches; flow_lm_flow maps the hidden state plus noise to one 32-dim Mimi
//! latent and the next step's embedding; mimi_decoder streams latents to
//! 24 kHz audio with 13 carried state tensors. Loop protocol ported from the
//! ai-ecoverse reference engine (Apache-2.0), including its exact seeded
//! normal draw and end-of-speech policy.

use super::{models_dir, Audio};
use crate::json::Value;
use ort::session::Session;
use ort::value::Tensor;

const LAYERS: usize = 6;
const HEADS: usize = 8;
const HEAD_DIM: usize = 64;
const LATENT: usize = 32;
const EOS_THRESHOLD: f32 = 4.0;
const TEMPERATURE: f32 = 0.3;
pub const DEFAULT_SEED: u32 = 0x2A2A_2A2A;
const DECODE_BATCH: usize = 16;

// ---------- tokenizer: unigram Viterbi with byte fallback (metaspace) ----------

pub struct Tokenizer {
    pieces: Vec<String>,
    scores: Vec<f32>,
    piece_ids: std::collections::HashMap<String, usize>,
    byte_ids: Vec<Option<usize>>,
    unk: usize,
    unk_score: f32,
}

impl Tokenizer {
    pub fn from_json(txt: &str) -> Result<Tokenizer, String> {
        let v = Value::parse(txt).map_err(|e| e.to_string())?;
        let model = v.get("model").ok_or("tokenizer model")?;
        let vocab = model.get("vocab").and_then(Value::as_array).ok_or("vocab")?;
        let mut pieces = Vec::with_capacity(vocab.len());
        let mut scores = Vec::with_capacity(vocab.len());
        for e in vocab {
            let pair = e.as_array().ok_or("vocab entry")?;
            pieces.push(pair.first().and_then(Value::as_str).unwrap_or("").to_string());
            scores.push(pair.get(1).and_then(Value::as_f64).unwrap_or(-20.0) as f32);
        }
        let piece_ids: std::collections::HashMap<String, usize> = pieces
            .iter()
            .enumerate()
            .map(|(i, p)| (p.clone(), i))
            .collect();
        let byte_ids: Vec<Option<usize>> = (0..256usize)
            .map(|b| piece_ids.get(&format!("<0x{b:02X}>")).copied())
            .collect();
        let unk = model.get("unk_id").and_then(Value::as_i64).unwrap_or(0) as usize;
        let unk_score = scores.iter().cloned().fold(f32::INFINITY, f32::min) - 10.0;
        Ok(Tokenizer { pieces, scores, piece_ids, byte_ids, unk, unk_score })
    }

    /// Unigram Viterbi over bytes of each metaspace-split piece.
    pub fn encode(&self, text: &str) -> Vec<usize> {
        const SPACE: char = '\u{2581}';
        let spaced: String = format!("{SPACE}{}", text).replace(' ', &SPACE.to_string());
        let mut out = Vec::new();
        for word in spaced.split(SPACE).filter(|w| !w.is_empty()) {
            let with_space = format!("{SPACE}{word}");
            self.viterbi(with_space.as_bytes(), &mut out);
        }
        out
    }

    fn viterbi(&self, bytes: &[u8], out: &mut Vec<usize>) {
        let n = bytes.len();
        let mut best = vec![f32::NEG_INFINITY; n + 1];
        let mut back = vec![(0usize, usize::MAX); n + 1]; // (start, token id; usize::MAX = unknown run)
        best[0] = 0.0;
        for i in 0..n {
            if best[i] == f32::NEG_INFINITY {
                continue;
            }
            let maxlen = (i + 24).min(n);
            for j in (i + 1)..=maxlen {
                if let Ok(piece) = std::str::from_utf8(&bytes[i..j]) {
                    if let Some(&id) = self.piece_ids.get(piece) {
                        let s = best[i] + self.scores[id];
                        if s > best[j] {
                            best[j] = s;
                            back[j] = (i, id);
                        }
                    }
                }
            }
            // unknown fallback: advance one UTF-8 character
            if best[i + 1] == f32::NEG_INFINITY {
                let step = utf8_len(bytes[i]);
                let j = (i + step).min(n);
                let s = best[i] + self.unk_score;
                if s > best[j] {
                    best[j] = s;
                    back[j] = (i, usize::MAX);
                }
            }
        }
        // walk back
        let mut path: Vec<(usize, usize)> = Vec::new(); // (start, id or MAX)
        let mut k = n;
        while k > 0 {
            let (i, id) = back[k];
            path.push((i, id));
            k = i;
        }
        path.reverse();
        for &(start, id) in &path {
            if id != usize::MAX {
                out.push(id);
            } else {
                // byte fallback
                let end_idx = path
                    .iter()
                    .find(|&&(s, _)| s > start)
                    .map(|&(s, _)| s)
                    .unwrap_or(n);
                let raw = &bytes[start..end_idx];
                if raw.iter().all(|b| self.byte_ids[*b as usize].is_some()) {
                    for b in raw {
                        out.push(self.byte_ids[*b as usize].unwrap());
                    }
                } else {
                    out.push(self.unk);
                }
            }
        }
    }

    pub fn piece(&self, id: usize) -> &str {
        self.pieces.get(id).map(String::as_str).unwrap_or("")
    }
}

fn utf8_len(b: u8) -> usize {
    if b < 0x80 { 1 } else if b < 0xE0 { 2 } else if b < 0xF0 { 3 } else { 4 }
}

// ---------- the exact seeded normal draw from the reference engine ----------

struct SeededNormal {
    state: u32,
    std: f64,
}

impl SeededNormal {
    fn new(seed: u32, temperature: f32) -> SeededNormal {
        SeededNormal { state: seed, std: (temperature as f64).sqrt() }
    }
    fn uniform(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6D2B_79F5);
        let mut t = self.state;
        t = (t ^ (t >> 15)).wrapping_mul(t | 1);
        t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        ((t ^ (t >> 14)) as f64 + 1.0) / 4294967297.0
    }
    fn draw(&mut self, n: usize) -> Vec<f32> {
        let mut out = vec![0f32; n];
        if self.std == 0.0 {
            return out;
        }
        let mut i = 0;
        while i < n {
            let r = (-2.0 * self.uniform().ln()).sqrt();
            let a = 2.0 * std::f64::consts::PI * self.uniform();
            out[i] = (r * a.cos() * self.std) as f32;
            if i + 1 < n {
                out[i + 1] = (r * a.sin() * self.std) as f32;
            }
            i += 2;
        }
        out
    }
}

// ---------- planning: sentence chunks, frame budgets, EOS frames ----------

struct Chunk {
    tokens: Vec<usize>,
    frame_budget: usize,
    frames_after_eos: usize,
}

fn plan(tk: &Tokenizer, text: &str) -> Vec<Chunk> {
    let mut chunks = Vec::new();
    let flush = |sentence: &mut String, chunks: &mut Vec<Chunk>| {
        let trimmed = sentence.trim();
        if !trimmed.is_empty() {
            let tokens = tk.encode(trimmed);
            let words = trimmed.split_whitespace().count();
            let frames_after_eos = if words <= 4 { 3 } else { 1 };
            let budget = (((tokens.len() as f64 / 3.0) + 2.0) * 12.5).ceil() as usize;
            chunks.push(Chunk { tokens, frame_budget: budget, frames_after_eos });
        }
        sentence.clear();
    };
    // One chunk per sentence: the audio window of each chunk then maps 1:1
    // to a transcript segment, which is what exact caption re-timing needs.
    let mut sentence = String::new();
    for ch in text.chars() {
        sentence.push(ch);
        if ch == '.' || ch == '!' || ch == '?' || ch == '\n' {
            flush(&mut sentence, &mut chunks);
        }
    }
    flush(&mut sentence, &mut chunks);
    chunks
}

// ---------- simple English number reading (subset of normalizeEnglish) ----------

fn number_words_en(n: u64) -> String {
    const ONES: [&str; 20] = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
        "seventeen", "eighteen", "nineteen",
    ];
    const TENS: [&str; 10] = [
        "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    ];
    if n < 20 {
        return ONES[n as usize].into();
    }
    if n < 100 {
        let t = TENS[(n / 10) as usize];
        let r = n % 10;
        return if r == 0 { t.into() } else { format!("{t}-{}", ONES[r as usize]) };
    }
    let under1000 = |mut v: u64| -> Vec<String> {
        let mut p = Vec::new();
        let h = v / 100;
        v %= 100;
        if h > 0 {
            p.push(ONES[h as usize].into());
            p.push("hundred".into());
        }
        if v > 0 {
            p.push(number_words_en(v));
        }
        p
    };
    const UNITS: [&str; 4] = ["", "thousand", "million", "billion"];
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
        words.extend(under1000(v));
        let idx = rev.min(3);
        if idx > 0 {
            words.push(UNITS[idx].into());
        }
    }
    words.join(" ")
}

/// Read integers and decimal points aloud; fold some symbols.
pub fn normalize_english(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut run = String::new();
    let flush = |run: &mut String, out: &mut String| {
        if run.is_empty() {
            return;
        }
        if run.chars().all(|c| c.is_ascii_digit()) {
            out.push_str(&number_words_en(run.parse::<u64>().unwrap_or(0)));
        } else {
            out.push_str(run);
        }
        run.clear();
    };
    for ch in text.chars() {
        if ch.is_ascii_digit() {
            run.push(ch);
        } else {
            flush(&mut run, &mut out);
            match ch {
                '&' => out.push_str(" and "),
                '+' => out.push_str(" plus "),
                '=' => out.push_str(" equals "),
                '%' => out.push_str(" percent"),
                '$' => out.push_str(" dollars"),
                c => out.push(c),
            }
        }
    }
    flush(&mut run, &mut out);
    out
}

/// An owned f32 tensor: (shape, data).
type Owned = (Vec<i64>, Vec<f32>);

fn extract(v: &ort::session::SessionOutputs, name: &str) -> Result<Owned, String> {
    let arr = v[name].try_extract_array::<f32>().map_err(|e| format!("{name}: {e}"))?;
    let shape: Vec<i64> = arr.shape().iter().map(|&d| d as i64).collect();
    let data = arr.as_slice().map(<[f32]>::to_vec).ok_or_else(|| format!("{name}: non-contiguous"))?;
    Ok((shape, data))
}

fn scalar_f32(v: &ort::session::SessionOutputs, name: &str) -> Result<f32, String> {
    let arr = v[name].try_extract_array::<f32>().map_err(|e| format!("{name}: {e}"))?;
    Ok(arr.iter().next().copied().unwrap_or(0.0))
}

fn scalar_i64(v: &ort::session::SessionOutputs, name: &str) -> Result<i64, String> {
    let arr = v[name].try_extract_array::<i64>().map_err(|e| format!("{name}: {e}"))?;
    Ok(arr.iter().next().copied().unwrap_or(0))
}

fn tensor(owned: Owned) -> Result<Tensor<f32>, String> {
    let dims: Vec<usize> = owned.0.iter().map(|&d| d as usize).collect();
    Tensor::from_array((dims, owned.1)).map_err(|e| e.to_string())
}

const KV_NAMES: [&str; 12] = [
    "past_key_values.0.key", "past_key_values.0.value",
    "past_key_values.1.key", "past_key_values.1.value",
    "past_key_values.2.key", "past_key_values.2.value",
    "past_key_values.3.key", "past_key_values.3.value",
    "past_key_values.4.key", "past_key_values.4.value",
    "past_key_values.5.key", "past_key_values.5.value",
];
const PRESENT_NAMES: [&str; 12] = [
    "0.key", "0.value", "1.key", "1.value", "2.key", "2.value",
    "3.key", "3.value", "4.key", "4.value", "5.key", "5.value",
];

fn empty_past() -> Vec<Owned> {
    (0..2 * LAYERS)
        .map(|_| (vec![1, HEADS as i64, 0, HEAD_DIM as i64], Vec::new()))
        .collect()
}

/// One causal transformer step: (hidden, eos_logit, present KV).
fn kv_tensor(p: &Owned) -> Result<Tensor<f32>, String> {
    if p.1.is_empty() {
        // ort's from_array rejects zero-length dimensions; the allocator path
        // is happy to make an empty [1, 8, 0, 64] cache tensor.
        let alloc = ort::memory::Allocator::default();
        return Tensor::<f32>::new(&alloc, [1usize, HEADS, 0, HEAD_DIM]).map_err(|e| e.to_string());
    }
    tensor(p.clone())
}

fn step_main(en: &mut En, embeds: Tensor<f32>, past: &[Owned]) -> Result<(Owned, f32, Vec<Owned>), String> {
    let mut feeds: Vec<(&str, Tensor<f32>)> = vec![("inputs_embeds", embeds)];
    for (i, p) in past.iter().enumerate() {
        feeds.push((KV_NAMES[i], kv_tensor(p)?));
    }
    let out = en.main.run(feeds).map_err(|e| e.to_string())?;
    let hidden = extract(&out, "hidden")?;
    let eos = scalar_f32(&out, "eos_logit")?;
    let mut present = Vec::with_capacity(2 * LAYERS);
    for name in PRESENT_NAMES.iter().take(2 * LAYERS) {
        present.push(extract(&out, &format!("present.{name}"))?);
    }
    Ok((hidden, eos, present))
}

/// Stream a batch of latents through the Mimi decoder, carrying its state.
fn decode_mimi(
    en: &mut En,
    latents: &mut Vec<f32>,
    offset: &mut i64,
    mimi_state: &mut [Owned],
    pcm: &mut Vec<f32>,
) -> Result<(), String> {
    if latents.is_empty() {
        return Ok(());
    }
    let taken = std::mem::take(latents);
    let n = taken.len() / LATENT;
    let latent_t = Tensor::from_array(([1usize, n, LATENT], taken))
        .map_err(|e| e.to_string())?;
    let mut inputs: Vec<(String, ort::session::SessionInputValue)> =
        Vec::with_capacity(2 + mimi_state.len());
    inputs.push(("latent".to_string(), latent_t.into()));
    inputs.push((
        "offset".to_string(),
        Tensor::from_array((Vec::<usize>::new(), vec![*offset]))
            .map_err(|e| e.to_string())?
            .into(),
    ));
    for (i, st) in mimi_state.iter().enumerate() {
        inputs.push((
            format!("state.{}", en.state_names[i]),
            tensor(st.clone())?.into(),
        ));
    }
    let out = en.mimi.run(inputs).map_err(|e| e.to_string())?;
    *offset = scalar_i64(&out, "next_offset")?;
    for (i, state) in mimi_state.iter_mut().enumerate() {
        *state = extract(&out, &format!("next_state.{}", en.state_names[i]))?;
    }
    let audio = extract(&out, "audio")?;
    if std::env::var("SCREENWORDS_TTS_DEBUG").is_ok() {
        eprintln!("  mimi: {} latents -> shape {:?} ({} samples)", n, audio.0, audio.1.len());
    }
    pcm.extend_from_slice(&audio.1);
    Ok(())
}

struct En {
    cond: Session,
    main: Session,
    flow: Session,
    mimi: Session,
    state_names: Vec<String>,
    state_shapes: Vec<(String, Vec<usize>)>,
}

fn load() -> Result<En, String> {
    let dir = models_dir().join("en");
    let cfg_txt = std::fs::read_to_string(dir.join("config.json")).map_err(|e| e.to_string())?;
    let cfg = Value::parse(&cfg_txt).map_err(|e| e.to_string())?;
    let shapes: Vec<(String, Vec<usize>)> = cfg
        .get("onnx")
        .and_then(|o| o.get("mimi_state"))
        .and_then(Value::as_array)
        .ok_or("onnx.mimi_state")?
        .iter()
        .map(|e| {
            let pair = e.as_array()?;
            let name = pair.first()?.as_str()?.to_string();
            let dims = pair.get(1)?.as_array()?
                .iter().filter_map(|d| d.as_i64().map(|d| d as usize)).collect();
            Some((name, dims))
        })
        .collect::<Option<Vec<_>>>()
        .ok_or("mimi_state shape")?;
    let session = |name: &str| {
        Session::builder()
            .and_then(|b| b.commit_from_file(dir.join(name)))
            .map_err(|e| format!("{name}: {e}"))
    };
    let state_names = shapes.iter().map(|(n, _)| n.clone()).collect();
    Ok(En {
        cond: session("text_conditioner.onnx")?,
        main: session("flow_lm_main.onnx")?,
        flow: session("flow_lm_flow.onnx")?,
        mimi: session("mimi_decoder.onnx")?,
        state_names,
        state_shapes: shapes,
    })
}

pub fn speak(text: &str, voice: &str, seed: u32) -> Result<Audio, String> {
    let mut en = load()?;
    let dir = models_dir().join("en");
    let tk = Tokenizer::from_json(
        &std::fs::read_to_string(dir.join("tokenizer.json")).map_err(|e| e.to_string())?,
    )?;
    let voice_file = dir.join(format!("{voice}.bin"));
    let voice_path = if voice_file.exists() { voice_file } else { dir.join("easton.bin") };
    let voice_bytes = std::fs::read(&voice_path).map_err(|e| e.to_string())?;
    let mut voice_f32 = vec![0f32; voice_bytes.len() / 4];
    for (i, chunk) in voice_bytes.chunks_exact(4).enumerate() {
        voice_f32[i] = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
    }
    let voice_frames = voice_f32.len() / 512;
    let voice_t = Tensor::from_array(([1usize, voice_frames, 512usize], voice_f32))
        .map_err(|e| e.to_string())?;

    // the voice prompt builds the base KV cache once
    let (_, _, base_past) = step_main(&mut en, voice_t, &empty_past())?;

    let mut rng = SeededNormal::new(seed, TEMPERATURE);
    let chunks = plan(&tk, &normalize_english(text));
    if chunks.is_empty() {
        return Err("nothing to say".into());
    }

    let dbg = std::env::var("SCREENWORDS_TTS_DEBUG").is_ok();
    let mut pcm: Vec<f32> = Vec::new();
    // exact audio window of each chunk, for sentence-level caption sync
    let mut chunk_windows: Vec<(f64, f64)> = Vec::new();
    for chunk in &chunks {
        if dbg {
            eprintln!(
                "chunk tokens={:?} budget={} after_eos={}",
                chunk.tokens, chunk.frame_budget, chunk.frames_after_eos
            );
        }
        let ids: Vec<i64> = chunk.tokens.iter().map(|&t| t as i64).collect();
        let ids_t = Tensor::from_array(([1usize, ids.len()], ids)).map_err(|e| e.to_string())?;
        let delta = Tensor::from_array(([1usize], vec![0f32])).map_err(|e| e.to_string())?;
        let (text_embeds, bos_embeds) = {
            let out = en
                .cond
                .run(ort::inputs!["input_ids" => ids_t, "duration_delta" => delta.clone()])
                .map_err(|e| e.to_string())?;
            (extract(&out, "inputs_embeds")?, extract(&out, "bos_embeds")?)
        };

        let (_, _, mut past) = step_main(&mut en, tensor(text_embeds)?, &base_past)?;
        let mut step_embed = bos_embeds;

        let mut mimi_state: Vec<Owned> = en
            .state_shapes
            .iter()
            .map(|(_, dims)| {
                (
                    dims.iter().map(|&d| d as i64).collect(),
                    vec![0f32; dims.iter().product()],
                )
            })
            .collect();
        let mut offset: i64 = 0;
        let mut latents: Vec<f32> = Vec::new();
        let mut countdown: Option<usize> = None;

        let chunk_start = pcm.len();
        for _ in 0..chunk.frame_budget {
            let (hidden, eos, present) = step_main(&mut en, tensor(step_embed)?, &past)?;
            past = present;
            let noise = Tensor::from_array(([1usize, LATENT], rng.draw(LATENT)))
                .map_err(|e| e.to_string())?;
            let (next_embeds, lat) = {
                let out = en
                    .flow
                    .run(ort::inputs![
                        "hidden" => tensor(hidden)?,
                        "noise" => noise,
                        "duration_delta" => delta.clone(),
                    ])
                    .map_err(|e| e.to_string())?;
                (extract(&out, "next_embeds")?, extract(&out, "latent")?)
            };
            step_embed = next_embeds;
            latents.extend_from_slice(&lat.1);

            if dbg {
                eprintln!("  frame eos={eos:.3}");
            }
            let is_eos = eos > EOS_THRESHOLD;
            if is_eos && countdown.is_none() {
                countdown = Some(chunk.frames_after_eos);
            }
            let mut done = false;
            if let Some(c) = countdown.as_mut() {
                if *c == 0 {
                    done = true;
                } else {
                    *c -= 1;
                }
            }
            if latents.len() >= DECODE_BATCH * LATENT || done {
                decode_mimi(&mut en, &mut latents, &mut offset, &mut mimi_state, &mut pcm)?;
            }
            if done {
                break;
            }
        }
        decode_mimi(&mut en, &mut latents, &mut offset, &mut mimi_state, &mut pcm)?;
        let window = (
            chunk_start as f64 / 24000.0,
            (pcm.len() - chunk_start) as f64 / 24000.0,
        );
        chunk_windows.push(window);
        WINDOWS.with(|w| w.borrow_mut().push(window));
    }
    if std::env::var("SCREENWORDS_TTS_DEBUG").is_ok() {
        for (i, (a, d)) in chunk_windows.iter().enumerate() {
            eprintln!("chunk {i}: {a:.3}s +{d:.3}s");
        }
    }
    Ok(Audio { samples: pcm, rate: 24000 })
}

/// Speak and also return each chunk's exact audio window (start seconds,
/// duration seconds) — sentence-level sync for caption re-timing.
pub fn speak_timed(text: &str, voice: &str, seed: u32) -> Result<(Audio, Vec<(f64, f64)>), String> {
    // speak() records chunk windows as it goes; re-run would duplicate state,
    // so speak() itself is the implementation and we thread windows out.
    WINDOWS.with(|w| w.borrow_mut().clear());
    let audio = speak(text, voice, seed)?;
    let wins = WINDOWS.with(|w| w.borrow().clone());
    Ok((audio, wins))
}

thread_local! {
    static WINDOWS: std::cell::RefCell<Vec<(f64, f64)>> = const { std::cell::RefCell::new(Vec::new()) };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tokenizer() -> Tokenizer {
        let dir = models_dir().join("en");
        let txt = std::fs::read_to_string(dir.join("tokenizer.json")).unwrap_or_default();
        Tokenizer::from_json(&txt).expect("tokenizer")
    }

    #[test]
    fn chunk_windows_cover_the_audio() {
        // Every chunk window must be the real span of the samples it produced:
        // zero-width windows broke the sentence-to-audio timeline rescale.
        if !models_dir().join("en").join("flow_lm_main.onnx").exists() {
            return; // models not staged: skip
        }
        let (audio, wins) = speak_timed("One sentence. Two sentence.", "easton", 7).unwrap();
        assert_eq!(wins.len(), 2, "one window per sentence");
        for (i, (start, dur)) in wins.iter().enumerate() {
            assert!(*dur > 0.0, "chunk {i} produced no samples");
            if i > 0 {
                let prev_end = wins[i - 1].0 + wins[i - 1].1;
                assert!((prev_end - start).abs() < 1e-6, "windows must be contiguous");
            }
        }
        let total: f64 = wins.iter().map(|(_, d)| *d).sum();
        let audio_secs = audio.samples.len() as f64 / audio.rate as f64;
        assert!((total - audio_secs).abs() < 1e-6, "windows must cover the whole audio");
    }

    #[test]
    fn tokenizer_encodes_a_known_sentence() {
        let Some(tk) = (if models_dir().join("en").join("tokenizer.json").exists() {
            Some(tokenizer())
        } else {
            None
        }) else {
            return; // models not staged: skip
        };
        let ids = tk.encode("Hello from Phonon.");
        assert!(!ids.is_empty());
        // the metaspace marker heads the first piece; the full stop is its own piece
        assert!(tk.piece(ids[0]).ends_with("Hello"));
        assert_eq!(tk.piece(ids[ids.len() - 1]), ".");
    }

    #[test]
    fn numbers_are_read_aloud() {
        assert_eq!(normalize_english("42"), "forty-two");
        assert_eq!(normalize_english("7 and 3"), "seven and three");
        assert_eq!(normalize_english("100%"), "one hundred percent");
    }

    #[test]
    fn seeded_normal_is_deterministic() {
        let mut a = SeededNormal::new(42, 0.3);
        let mut b = SeededNormal::new(42, 0.3);
        assert_eq!(a.draw(32), b.draw(32));
    }
}
