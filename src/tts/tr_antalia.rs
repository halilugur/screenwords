//! Antalia-2 Mini (Turkish, a synthetic male voice): cloud0day3/antalia-mini
//! (Apache-2.0) as the four ONNX graphs `tools/export-antalia.py` writes to
//! `tts-models/antalia`. The text is first normalised to its spoken form
//! ([`super::tr_normalize`]); the encoder gives each symbol a feature and a
//! log duration; each frame (93.75 Hz) takes its symbol's feature; `cond`
//! turns them into the flow's condition per two frames; a few guided flow
//! steps carry seeded noise to a log-mel; the vocoder (Vocos, inverse STFT
//! in the graph) makes 48 kHz audio. The release's own touches are kept: an
//! "ee." spoken after each sentence (and "ee, " before one that starts with
//! ö or ı) and cut away again so the edge words sound mid-utterance, longer
//! double letters, and its output EQ, de-esser and limiter, after the
//! vocoder's steady background hiss is turned down ([`super::denoise`]).

use super::phrasing::{sentences, Pace, Spoken};
use super::tr_normalize::model_text;
use super::{models_dir, Noise, Speech};
use crate::json::Value;
use ort::session::Session;
use ort::value::{DynValue, Tensor};
use std::path::PathBuf;

const SAMPLE_RATE: u32 = 48000;
/// Samples per mel frame.
const HOP: usize = 512;
/// Mel frames per generator token.
const STACK: usize = 2;
const MELS: usize = 128;
/// Longest sentence handed to the model in one pass, in characters.
const MAX_SENTENCE: usize = 300;
/// The fade over each cut edge, in seconds.
const FADE_SECONDS: f64 = 0.005;

/// The voice name that asks for Antalia.
pub const VOICE: &str = "antalia";

fn dir() -> PathBuf {
    models_dir().join("antalia")
}

/// Whether the exported graphs are staged in `tts-models/antalia`.
pub fn available() -> bool {
    dir().join("flow.onnx").exists()
}

/// One band of the output EQ, as config.json "options.curve" lists them.
enum Band {
    HighPass { hz: f64, q: f64 },
    LowShelf { hz: f64, db: f64, q: f64 },
    Peak { hz: f64, db: f64, q: f64 },
    HighShelf { hz: f64, db: f64, q: f64 },
}

struct Antalia {
    symbols: Vec<char>,
    steps: usize,
    cfg: f32,
    speed: f32,
    temperature: f32,
    max_dur: f32,
    mel_mean: f32,
    mel_std: f32,
    prefix: String,
    prefix_initials: String,
    suffix: String,
    gem_stretch: f32,
    curve: Vec<Band>,
    /// De-esser: band edge (Hz), threshold (dBFS RMS), ratio.
    deess: (f64, f64, f64),
    makeup_db: f64,
    encoder: Session,
    cond: Session,
    flow: Session,
    vocoder: Session,
}

const PAD_BOS_EOS: [&str; 3] = ["<pad>", "<bos>", "<eos>"];
const BOS: i64 = 1;
const EOS: i64 = 2;

fn load() -> Result<Antalia, String> {
    let dir = dir();
    let cfg = Value::parse(&std::fs::read_to_string(dir.join("config.json")).map_err(|e| format!("config.json: {e}"))?)
        .map_err(|e| e.to_string())?;
    let at = |path: &[&str]| path.iter().try_fold(&cfg, |v, k| v.get(k)).ok_or(format!("config {}", path.join(".")));
    let num = |path: &[&str]| at(path).and_then(|v| v.as_f64().ok_or(format!("config {}", path.join("."))));
    let text = |path: &[&str]| at(path).and_then(|v| v.as_str().map(str::to_string).ok_or(format!("config {}", path.join("."))));
    let symbols = at(&["symbols"])?
        .as_array()
        .ok_or("config symbols")?
        .iter()
        .map(|s| match s.as_str() {
            Some(name) if PAD_BOS_EOS.contains(&name) => Ok('\0'),
            Some(one) if one.chars().count() == 1 => Ok(one.chars().next().unwrap_or('\0')),
            _ => Err("config symbols: one character each".to_string()),
        })
        .collect::<Result<Vec<char>, String>>()?;
    let curve = at(&["options", "curve"])?
        .as_array()
        .ok_or("config options.curve")?
        .iter()
        .map(|band| {
            let b = band.as_array().ok_or("config curve band")?;
            let n = |i: usize| b.get(i).and_then(Value::as_f64).ok_or("config curve band value");
            Ok(match b.first().and_then(Value::as_str) {
                Some("hpf") => Band::HighPass { hz: n(1)?, q: n(2)? },
                Some("low") => Band::LowShelf { hz: n(1)?, db: n(2)?, q: n(3)? },
                Some("peak") => Band::Peak { hz: n(1)?, db: n(2)?, q: n(3)? },
                Some("high") => Band::HighShelf { hz: n(1)?, db: n(2)?, q: n(3)? },
                other => return Err(format!("config curve band {other:?}")),
            })
        })
        .collect::<Result<Vec<Band>, String>>()?;
    let session = |name: &str| {
        Session::builder()
            .and_then(|b| b.commit_from_file(dir.join(name)))
            .map_err(|e| format!("{name}: {e}"))
    };
    Ok(Antalia {
        symbols,
        steps: num(&["defaults", "steps"])? as usize,
        cfg: num(&["defaults", "cfg"])? as f32,
        speed: num(&["defaults", "speed"])? as f32,
        temperature: num(&["defaults", "temperature"])? as f32,
        max_dur: num(&["acoustic", "max_dur_frames"])? as f32,
        mel_mean: num(&["acoustic", "mel_mean"])? as f32,
        mel_std: num(&["acoustic", "mel_std"])? as f32,
        prefix: text(&["options", "prefix"])?,
        prefix_initials: text(&["options", "prefix_initials"])?,
        suffix: text(&["options", "suffix"])?,
        gem_stretch: num(&["options", "gem_stretch"])? as f32,
        curve,
        deess: (
            num(&["options", "deess", "f0"])?,
            num(&["options", "deess", "threshold_db"])?,
            num(&["options", "deess", "ratio"])?,
        ),
        makeup_db: num(&["options", "makeup_db"])?,
        encoder: session("encoder.onnx")?,
        cond: session("cond.onnx")?,
        flow: session("flow.onnx")?,
        vocoder: session("vocoder.onnx")?,
    })
}

fn err(e: ort::Error) -> String {
    e.to_string()
}

fn floats(v: &DynValue) -> Result<Vec<f32>, String> {
    v.try_extract_tensor::<f32>().map(|(_, data)| data.to_vec()).map_err(err)
}

/// One spoken sentence: its samples and, for each word of its model text,
/// where it starts and ends (seconds).
struct Utterance {
    samples: Vec<f32>,
    words: Vec<(f64, f64)>,
}

impl Antalia {
    fn symbol_ids(&self, text: &str) -> Vec<i64> {
        text.chars().filter_map(|c| self.symbols.iter().position(|&s| s == c).map(|i| i as i64)).collect()
    }

    /// One sentence of model text at `speed` (1 is the voice's own pace).
    fn utter(&mut self, text: &str, seed: u32, speed: f32) -> Result<Utterance, String> {
        let prefix = if text.starts_with(|c: char| self.prefix_initials.contains(c)) { self.prefix.clone() } else { String::new() };
        let (pre, body, suf) = (self.symbol_ids(&prefix), self.symbol_ids(text), self.symbol_ids(&self.suffix));
        let ids: Vec<i64> = std::iter::once(BOS).chain(pre.iter().chain(&body).chain(&suf).copied()).chain([EOS]).collect();
        let l = ids.len();
        let (h, mut logd) = {
            let out = self
                .encoder
                .run(ort::inputs!["ids" => Tensor::from_array(([1, l], ids.clone())).map_err(err)?])
                .map_err(err)?;
            (floats(&out["h"])?, floats(&out["logdur"])?)
        };
        // Turkish double sounds are long: the second of a pair inside a word
        // ("berraktı"), the gap between a pair across words ("alerjim mahvediyor").
        let space = self.symbol_ids(" ")[0];
        let gem = self.gem_stretch.ln();
        for j in 2..l - 1 {
            if ids[j] == ids[j - 1] && ids[j] != space {
                logd[j] += gem;
            } else if ids[j - 1] == space && ids[j] == ids[j - 2] {
                logd[j - 1] += gem;
            }
        }
        let dur: Vec<usize> = logd.iter().map(|d| (d.exp() / speed).round_ties_even().clamp(1.0, self.max_dur) as usize).collect();
        let frames: usize = dur.iter().sum();
        let t = frames.div_ceil(STACK) * STACK;
        // each frame takes its symbol's feature; the frame that evens the count repeats the last
        let d = h.len() / l;
        let mut cond = Vec::with_capacity(t * d);
        for (sym, &n) in dur.iter().enumerate() {
            for _ in 0..n {
                cond.extend_from_slice(&h[sym * d..(sym + 1) * d]);
            }
        }
        cond.extend_from_within(cond.len() - d * (t - frames)..);
        let (ctok, cnull) = {
            let out = self
                .cond
                .run(ort::inputs!["cond" => Tensor::from_array(([1, t, d], cond)).map_err(err)?])
                .map_err(err)?;
            (floats(&out["ctok"])?, floats(&out["cnull"])?)
        };
        let tokens = t / STACK;
        let width = MELS * STACK;
        let mut noise = Noise(seed as u64 ^ 0xA27A_11A2_0000_7A11);
        let mut x: Vec<f32> = (0..tokens * width).map(|_| noise.normal() * self.temperature).collect();
        let dt = 1.0 / self.steps as f32;
        let scalar = |v: f32| Tensor::from_array(([1], vec![v])).map_err(err);
        for i in 0..self.steps {
            let out = self
                .flow
                .run(ort::inputs![
                    "x" => Tensor::from_array(([1, tokens, width], x.clone())).map_err(err)?,
                    "t" => scalar(i as f32 * dt)?,
                    "d" => scalar(if self.steps > 1 { dt } else { 1.0 })?,
                    "ctok" => Tensor::from_array(([1, tokens, d], ctok.clone())).map_err(err)?,
                    "cnull" => Tensor::from_array(([1, tokens, d], cnull.clone())).map_err(err)?,
                    "cfg" => Tensor::from_array(((), vec![self.cfg])).map_err(err)?,
                ])
                .map_err(err)?;
            for (xi, vi) in x.iter_mut().zip(floats(&out["v"])?) {
                *xi += vi * dt;
            }
        }
        // tokens of two frames back to frames, channels first, out of the normalised space
        let mut mel = vec![0f32; MELS * t];
        for (frame, row) in x.chunks(MELS).enumerate() {
            for (m, v) in row.iter().enumerate() {
                mel[m * t + frame] = v * self.mel_std + self.mel_mean;
            }
        }
        let wav = {
            let out = self
                .vocoder
                .run(ort::inputs!["mel" => Tensor::from_array(([1, MELS, t], mel)).map_err(err)?])
                .map_err(err)?;
            floats(&out["audio"])?
        };
        // keep the sentence itself: after BOS and the prefix, before the suffix and EOS
        let mut end_of = Vec::with_capacity(l);
        let mut acc = 0;
        for &n in &dur {
            acc += n;
            end_of.push(acc);
        }
        let first = 1 + pre.len();
        let start_frame = if prefix.is_empty() { 0 } else { end_of[first - 1] };
        let end_frame = end_of[first + body.len() - 1];
        let mut samples = wav[start_frame * HOP..(end_frame * HOP).min(wav.len())].to_vec();
        let fade = (FADE_SECONDS * SAMPLE_RATE as f64) as usize;
        if samples.len() > 2 * fade {
            if !prefix.is_empty() {
                for (i, s) in samples[..fade].iter_mut().enumerate() {
                    *s *= i as f32 / (fade - 1) as f32;
                }
            }
            let n = samples.len();
            for (i, s) in samples[n - fade..].iter_mut().enumerate() {
                *s *= 1.0 - i as f32 / (fade - 1) as f32;
            }
        }
        // each word of the text: from its first symbol to the end of its last
        let seconds = |frame: usize| (frame - start_frame) as f64 * HOP as f64 / SAMPLE_RATE as f64;
        let mut words = Vec::new();
        let mut open: Option<usize> = None;
        for (k, &id) in body.iter().enumerate() {
            let sym = first + k;
            if id == space {
                if let Some(s) = open.take() {
                    words.push((seconds(s), seconds(end_of[sym - 1])));
                }
            } else if open.is_none() {
                open = Some(end_of[sym - 1]);
            }
        }
        if let Some(s) = open {
            words.push((seconds(s), seconds(end_frame)));
        }
        Ok(Utterance { samples, words })
    }

    /// The output processing over a whole take: the vocoder's hiss turned
    /// down, then the release's EQ curve, de-esser, make-up gain and a soft
    /// limiter below full scale.
    fn finish(&self, samples: &[f32]) -> Vec<f32> {
        let fs = SAMPLE_RATE as f64;
        let mut y: Vec<f64> = super::denoise::denoise(samples).iter().map(|&s| s as f64).collect();
        for band in &self.curve {
            let (b, a) = biquad(band, fs);
            let (mut x1, mut x2, mut y1, mut y2) = (0.0, 0.0, 0.0, 0.0);
            for v in y.iter_mut() {
                let o = b[0] * *v + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2;
                (x2, x1, y2, y1) = (x1, *v, y1, o);
                *v = o;
            }
        }
        let y = de_ess(&y, fs, self.deess);
        let gain = 10f64.powf(self.makeup_db / 20.0);
        y.iter().map(|&v| soft_limit(v * gain) as f32).collect()
    }
}

/// An RBJ-cookbook biquad: (b0, b1, b2) and (a1, a2), normalised by a0.
fn biquad(band: &Band, fs: f64) -> ([f64; 3], [f64; 2]) {
    let (hz, db, q) = match *band {
        Band::HighPass { hz, q } => (hz, 0.0, q),
        Band::LowShelf { hz, db, q } | Band::Peak { hz, db, q } | Band::HighShelf { hz, db, q } => (hz, db, q),
    };
    let a_ = 10f64.powf(db / 40.0);
    let w0 = 2.0 * std::f64::consts::PI * hz / fs;
    let (alpha, c) = (w0.sin() / (2.0 * q), w0.cos());
    let s = 2.0 * a_.sqrt() * alpha;
    let (b, a) = match band {
        Band::HighPass { .. } => ([(1.0 + c) / 2.0, -(1.0 + c), (1.0 + c) / 2.0], [1.0 + alpha, -2.0 * c, 1.0 - alpha]),
        Band::LowShelf { .. } => (
            [a_ * ((a_ + 1.0) - (a_ - 1.0) * c + s), 2.0 * a_ * ((a_ - 1.0) - (a_ + 1.0) * c), a_ * ((a_ + 1.0) - (a_ - 1.0) * c - s)],
            [(a_ + 1.0) + (a_ - 1.0) * c + s, -2.0 * ((a_ - 1.0) + (a_ + 1.0) * c), (a_ + 1.0) + (a_ - 1.0) * c - s],
        ),
        Band::HighShelf { .. } => (
            [a_ * ((a_ + 1.0) + (a_ - 1.0) * c + s), -2.0 * a_ * ((a_ - 1.0) + (a_ + 1.0) * c), a_ * ((a_ + 1.0) + (a_ - 1.0) * c - s)],
            [(a_ + 1.0) - (a_ - 1.0) * c + s, 2.0 * ((a_ - 1.0) - (a_ + 1.0) * c), (a_ + 1.0) - (a_ - 1.0) * c - s],
        ),
        Band::Peak { .. } => ([1.0 + alpha * a_, -2.0 * c, 1.0 - alpha * a_], [1.0 + alpha / a_, -2.0 * c, 1.0 - alpha / a_]),
    };
    ([b[0] / a[0], b[1] / a[0], b[2] / a[0]], [a[1] / a[0], a[2] / a[0]])
}

/// Split-band de-esser: the band above `f0`, split off by a linear-phase FIR
/// (the input delayed to match), is turned down while its 2 ms RMS is above
/// the threshold, as a `ratio`:1 compressor with fast attack and slow release.
fn de_ess(y: &[f64], fs: f64, (f0, threshold_db, ratio): (f64, f64, f64)) -> Vec<f64> {
    const TAPS: usize = 127;
    let delay = (TAPS - 1) / 2;
    let centre = (TAPS - 1) as f64 / 2.0;
    let mut lp: Vec<f64> = (0..TAPS)
        .map(|i| {
            let n = i as f64 - centre;
            let x = 2.0 * f0 / fs * n;
            let sinc = if x == 0.0 { 1.0 } else { (std::f64::consts::PI * x).sin() / (std::f64::consts::PI * x) };
            let hann = 0.5 - 0.5 * (2.0 * std::f64::consts::PI * i as f64 / (TAPS - 1) as f64).cos();
            2.0 * f0 / fs * sinc * hann
        })
        .collect();
    let sum: f64 = lp.iter().sum();
    lp.iter_mut().for_each(|v| *v /= sum);
    let hp: Vec<f64> = lp.iter().enumerate().map(|(i, v)| if i == delay { 1.0 - v } else { -v }).collect();
    let band: Vec<f64> = (0..y.len())
        .map(|n| hp.iter().enumerate().filter(|(k, _)| *k <= n).map(|(k, h)| h * y[n - k]).sum())
        .collect();
    let thr = 10f64.powf(threshold_db / 20.0);
    let block = (0.002 * fs) as usize;
    let att = (-(block as f64) / (1.5e-3 * fs)).exp();
    let rel = (-(block as f64) / (60e-3 * fs)).exp();
    let (mut env, mut gain) = (0.0f64, 1.0f64);
    let mut out = Vec::with_capacity(y.len());
    for (b, seg) in band.chunks(block).enumerate() {
        let level = (seg.iter().map(|v| v * v).sum::<f64>() / seg.len() as f64).sqrt();
        let k = if level > env { att } else { rel };
        env = k * env + (1.0 - k) * level;
        let target = if env <= thr { 1.0 } else { (thr / env).powf(1.0 - 1.0 / ratio) };
        let n = seg.len();
        for (i, s) in seg.iter().enumerate() {
            let g = if n > 1 { gain + (target - gain) * i as f64 / n as f64 } else { target };
            let at = b * block + i;
            let delayed = if at >= delay { y[at - delay] } else { 0.0 };
            out.push(delayed + (g - 1.0) * s);
        }
        gain = target;
    }
    out
}

/// Identity below -1 dBFS; above it a tanh knee that never passes -0.1 dBFS.
fn soft_limit(x: f64) -> f64 {
    let threshold = 10f64.powf(-1.0 / 20.0);
    let room = 10f64.powf(-0.1 / 20.0) - threshold;
    if x.abs() <= threshold {
        x
    } else {
        x.signum() * (threshold + room * ((x.abs() - threshold) / room).tanh())
    }
}

/// The `(start, end)` seconds of each written word of `sentence`, from the
/// spoken words' times: a written word the normaliser reads as several ("1.250
/// TL") spans them all, one it drops spans nothing. None when the two readings
/// disagree (the normaliser read the sentence differently as a whole).
fn written_word_spans(sentence: &str, spoken: &[(f64, f64)]) -> Option<Vec<(f64, f64)>> {
    let per_written: Vec<usize> = sentence.split_whitespace().map(|w| model_text(w).split_whitespace().count()).collect();
    if per_written.iter().sum::<usize>() != spoken.len() {
        return None;
    }
    let mut at = 0;
    let mut last_end = 0.0;
    Some(
        per_written
            .iter()
            .map(|&n| {
                let span = if n == 0 { (last_end, last_end) } else { (spoken[at].0, spoken[at + n - 1].1) };
                at += n;
                last_end = span.1;
                span
            })
            .collect(),
    )
}

/// Speak `text` sentence by sentence, each with the pause its punctuation
/// asks for, at `pace` around the release's own narration speed; report where
/// each sentence and each written word sits in the audio.
pub fn speak_timed(text: &str, seed: u32, pace: Pace) -> Result<Speech, String> {
    let mut antalia = load()?;
    let speed = antalia.speed * pace.rate();
    let mut take = Spoken::new(SAMPLE_RATE);
    for (i, sentence) in sentences(text, MAX_SENTENCE).iter().enumerate() {
        let spoken = model_text(sentence);
        if !spoken.chars().any(char::is_alphabetic) {
            take.push(&[], None, sentence, pace);
            continue;
        }
        let said = antalia.utter(&spoken, seed.wrapping_add(i as u32), speed)?;
        let words = written_word_spans(sentence, &said.words);
        take.push(&said.samples, words, sentence, pace);
    }
    let mut speech = take.finish()?;
    speech.audio.samples = antalia.finish(&speech.audio.samples);
    Ok(speech)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_output_chain_leaves_quiet_audio_shaped_and_never_clips() {
        // A biquad at unity everywhere is the identity; the limiter keeps any
        // peak below full scale and leaves what is under -1 dBFS alone.
        let flat = Band::Peak { hz: 1000.0, db: 0.0, q: 1.0 };
        let (b, a) = biquad(&flat, 48000.0);
        assert!((b[0] - 1.0).abs() < 1e-12 && (b[1] - a[0]).abs() < 1e-12 && (b[2] - a[1]).abs() < 1e-12);
        assert_eq!(soft_limit(0.5), 0.5);
        let ceiling = 10f64.powf(-0.1 / 20.0);
        assert!(soft_limit(4.0) <= ceiling && soft_limit(-4.0) >= -ceiling && ceiling < 1.0);
        // The de-esser passes a quiet low tone through, delayed by its 63 samples.
        let tone: Vec<f64> = (0..4800).map(|n| 0.01 * (2.0 * std::f64::consts::PI * 200.0 * n as f64 / 48000.0).sin()).collect();
        let out = de_ess(&tone, 48000.0, (5500.0, -34.0, 3.0));
        let err = (1000..4800).map(|n| (out[n] - tone[n - 63]).abs()).fold(0.0, f64::max);
        assert!(err < 1e-4, "{err}");
    }

    #[test]
    fn written_words_take_the_times_of_what_was_said_for_them() {
        // "Ücret 1.250 TL" is read "ücret bin iki yüz elli lira": four said
        // words for "1.250", one for "TL".
        let said = [(0.0, 0.5), (0.5, 0.9), (0.9, 1.2), (1.2, 1.5), (1.5, 2.0), (2.1, 2.6)];
        assert_eq!(written_word_spans("Ücret 1.250 TL", &said), Some(vec![(0.0, 0.5), (0.5, 2.0), (2.1, 2.6)]));
        // a count that does not add up gives no word times rather than wrong ones
        assert_eq!(written_word_spans("Ücret 1.250", &said), None);
    }

    #[test]
    fn a_sentence_is_spoken_with_its_words_in_place() {
        if !available() {
            return; // models not staged: skip
        }
        let text = "Ölmez ağacın gölgesinde oturduk. Randevunuz yarın saat 15:30'da!";
        let Speech { audio, sentences, words } = speak_timed(text, 0, Pace::NARRATION).unwrap();
        assert_eq!(audio.rate, SAMPLE_RATE);
        assert_eq!(sentences.len(), 2, "{sentences:?}");
        assert!(audio.samples.iter().all(|s| s.is_finite() && s.abs() < 1.0));
        let words = words.expect("word times from the durations");
        assert_eq!(words.len(), text.split_whitespace().count());
        assert!(words.windows(2).all(|p| p[1].0 >= p[0].1 - 1e-9), "{words:?}");
        // about four to seven syllables a second while speaking
        let syllables = model_text(text).chars().filter(|c| "aeıioöuü".contains(*c)).count() as f64;
        let rate = syllables / sentences.iter().map(|w| w.1).sum::<f64>();
        assert!((4.0..7.5).contains(&rate), "{rate:.2} syllables a second");
        // brisker is shorter
        let brisk = speak_timed(text, 0, Pace::new(1.3).unwrap()).unwrap();
        assert!((brisk.audio.samples.len() as f64) < audio.samples.len() as f64 * 0.85);
    }
}
