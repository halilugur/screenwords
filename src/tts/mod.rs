//! On-device text-to-speech through ONNX Runtime — the crate's one and only
//! external dependency, added by explicit user request. Four models:
//!
//! - **en** — Phonon 31M (gradium/phonon-31m-en, Apache-2.0) via the ONNX
//!   export ai-ecoverse/phonon-31m-en-ONNX (q4 flow LM, fp32 Mimi decoder):
//!   four graphs (text_conditioner, flow_lm_main, flow_lm_flow, mimi_decoder),
//!   an autoregressive frame loop, 24 kHz. Keeps word-level alignment.
//! - **tr**, a speaking style named — Ahenk Cep (ozgurguler/ahenk-cep-tr, CC BY 4.0), EMA Lightning
//!   fine-tuned on Ahenk's designed voice: four graphs (text, cond, step,
//!   decoder), 16 guided flow steps per sentence, seven speaking styles,
//!   48 kHz. See [`tr_cep`].
//! - **tr** otherwise, when staged — Antalia-2 Mini (cloud0day3/
//!   antalia-mini, Apache-2.0), a synthetic male voice exported by
//!   `tools/export-antalia.py`: encoder, guided flow over log-mel, Vocos
//!   vocoder, 48 kHz, after its own normaliser ([`tr_normalize`]: numbers,
//!   amounts, dates, initialisms, English and brand words). See [`tr_antalia`].
//! - **31 languages** — Supertonic 3 (Supertone, OpenRAIL-M): duration
//!   predictor, text encoder, flow-matching vector estimator and vocoder,
//!   44.1 kHz, ten voice styles (M1..M5, F1..F5). See [`s3`].
//!
//! Model files live in `tts-models/{en,tr,antalia,s3}/` next to the binary (override
//! with `SCREENWORDS_TTS_MODELS`).

pub mod align;
pub mod denoise;
pub mod en_phonon;
pub mod nfkd;
pub mod phrasing;
pub mod s3;
pub mod tr_antalia;
pub mod tr_cep;
pub mod tr_normalize;
pub mod wav;

/// Synthesized audio: mono f32 samples in [-1, 1] plus the sample rate.
pub struct Audio {
    pub samples: Vec<f32>,
    pub rate: u32,
}

/// Which model speaks a `(lang, voice)` pair.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Backend {
    /// Phonon, English, with word-level alignment.
    Phonon,
    /// Ahenk Cep, Turkish, in one of its speaking styles.
    Cep,
    /// Antalia-2 Mini, Turkish, a male voice.
    Antalia,
    /// Supertonic 3, 31 languages.
    Supertonic,
}

/// Where the model files live.
pub fn models_dir() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("SCREENWORDS_TTS_MODELS") {
        return std::path::PathBuf::from(dir);
    }
    for base in [
        std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())),
        Some(std::path::PathBuf::from(".")),
    ]
    .into_iter()
    .flatten()
    {
        let models = base.join("tts-models");
        if ["en/flow_lm_main.onnx", "s3/onnx/vocoder.onnx", "tr/step.onnx"]
            .iter()
            .any(|marker| models.join(marker).exists())
        {
            return models;
        }
    }
    std::path::PathBuf::from("/tmp/tts-models")
}

/// Which optional models are staged.
#[derive(Debug, Clone, Copy)]
struct Staged {
    s3: bool,
    antalia: bool,
}

/// Route a request. An explicit Supertonic voice wins for every language
/// once those models are staged; otherwise English keeps Phonon (it has
/// word-level timings) and Turkish speaks Antalia-2 Mini when it is staged,
/// Ahenk Cep when one of Cep's speaking styles is asked for (or Antalia is
/// not staged). Any other language needs Supertonic 3 staged.
pub fn backend_for(lang: &str, voice: &str) -> Backend {
    route(lang, voice, Staged { s3: s3::available(), antalia: tr_antalia::available() })
}

/// The routing decision with staging as an input, so the whole matrix is
/// testable on a machine without models (CI stages nothing): the voice
/// naming alone must not promise Supertonic — `M1` on a bare install still
/// speaks the language default.
fn route(lang: &str, voice: &str, staged: Staged) -> Backend {
    if staged.s3 && s3::is_voice(voice) {
        return Backend::Supertonic;
    }
    match lang {
        "en" => Backend::Phonon,
        "tr" if staged.antalia && !tr_cep::STYLES.contains(&voice) => Backend::Antalia,
        "tr" => Backend::Cep,
        _ if staged.s3 => Backend::Supertonic,
        _ => Backend::Phonon,
    }
}

/// The Turkish voices to offer, the default first: Antalia when staged, then
/// Cep's speaking styles.
pub fn turkish_voices() -> Vec<String> {
    let antalia = tr_antalia::available().then(|| tr_antalia::VOICE.to_string());
    antalia.into_iter().chain(tr_cep::STYLES.iter().map(|s| s.to_string())).collect()
}

pub use phrasing::Pace;

/// Seeded f32 gaussian (xorshift + Box-Muller): the starting noise of the
/// Turkish voices' flows.
pub(crate) struct Noise(pub u64);
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
    pub fn normal(&mut self) -> f32 {
        let u = self.uniform();
        let v = self.uniform();
        ((-2.0 * u.ln()).sqrt() * (2.0 * std::f64::consts::PI * v).cos()) as f32
    }
}



/// Speak `text` in `lang`. `voice` is a Phonon file stem for English, a
/// speaking style for Turkish (neutral, angry, calm, cheerful, empathetic,
/// sad, surprised) and a Supertonic style (M1..F5) for every language; `seed` drives the noise
/// draw; `pace` is the speaking rate around calm narration.
pub fn synthesize(lang: &str, text: &str, voice: &str, seed: u32, pace: Pace) -> Result<Audio, String> {
    synthesize_timed(lang, text, voice, seed, pace).map(|speech| speech.audio)
}

/// Chunk timing spans `(start_seconds, duration_seconds)` reported by a TTS backend.
pub type ChunkWindows = Vec<(f64, f64)>;

/// A finished take: the audio, where each sentence sits in it and, when the
/// voice knows it, when each written word is said (`(start, end)` seconds,
/// one per whitespace-separated word of the text, in order).
pub struct Speech {
    pub audio: Audio,
    pub sentences: ChunkWindows,
    pub words: Option<Vec<(f64, f64)>>,
}

/// As [`synthesize`], plus where each sentence — and, from a voice that
/// knows, each word — sits in the audio. Caption re-timing uses both.
pub fn synthesize_timed(
    lang: &str,
    text: &str,
    voice: &str,
    seed: u32,
    pace: Pace,
) -> Result<Speech, String> {
    // Those two languages have a dedicated model; everything else is Supertonic
    // 3, and silently reading German with English rules would be worse than
    // telling the caller the models are missing.
    if !matches!(lang, "en" | "tr") && !s3::available() {
        return Err(format!(
            "language '{lang}' needs the Supertonic 3 models in tts-models/s3 (31 languages)"
        ));
    }
    match backend_for(lang, voice) {
        Backend::Supertonic => s3::speak_timed(text, voice, seed, lang, pace),
        // Phonon draws its own timing frame by frame; there is no duration
        // to scale, so a rate other than its own is refused, not ignored.
        Backend::Phonon if pace != Pace::NARRATION => Err(format!(
            "the English voice '{voice}' speaks at one pace; for a rate of {} pick a Supertonic voice (M1..M5, F1..F5)",
            pace.rate()
        )),
        // Its word times come from forced alignment of the audio instead.
        Backend::Phonon => en_phonon::speak_timed(text, voice, seed).map(|(audio, sentences)| Speech { audio, sentences, words: None }),
        Backend::Cep => tr_cep::speak_timed(text, voice, seed, pace),
        Backend::Antalia => tr_antalia::speak_timed(text, seed, pace),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BARE: Staged = Staged { s3: false, antalia: false };
    const ALL: Staged = Staged { s3: true, antalia: true };

    #[test]
    fn explicit_supertonic_voice_wins_over_the_language_default() {
        // An M1..F5 style only reaches Supertonic when those models are
        // staged; without them the language default speaks instead (the
        // naming alone is not a promise).
        assert_eq!(route("en", "M1", ALL), Backend::Supertonic);
        assert_eq!(route("tr", "F3", ALL), Backend::Supertonic);
        assert_eq!(route("en", "M1", BARE), Backend::Phonon);
        assert_eq!(route("tr", "F3", BARE), Backend::Cep);
        // A Phonon voice name never leaves the language default.
        assert_eq!(route("en", "easton", ALL), Backend::Phonon);
        assert_eq!(route("tr", "easton", ALL), Backend::Antalia);
        // A Turkish style is not a Supertonic voice.
        assert_eq!(route("tr", "sad", ALL), Backend::Cep);
        // A third language needs Supertonic staged; without it Phonon is the
        // least-wrong fallback (synthesize_timed rejects it earlier).
        assert_eq!(route("de", "any", ALL), Backend::Supertonic);
        assert_eq!(route("de", "any", BARE), Backend::Phonon);
    }

    #[test]
    fn turkish_is_antalia_unless_a_cep_style_is_asked_for() {
        // the default voice name and Antalia's own both speak Antalia
        assert_eq!(route("tr", "easton", ALL), Backend::Antalia);
        assert_eq!(route("tr", "antalia", ALL), Backend::Antalia);
        // Cep's speaking styles, the neutral one too, speak Cep
        assert_eq!(route("tr", "neutral", ALL), Backend::Cep);
        assert_eq!(route("tr", "cheerful", ALL), Backend::Cep);
        // not staged: Cep, not an error
        assert_eq!(route("tr", "antalia", BARE), Backend::Cep);
        // the name means nothing to another language
        assert_eq!(route("en", "antalia", ALL), Backend::Phonon);
    }
}
