//! On-device text-to-speech through ONNX Runtime — the crate's one and only
//! external dependency, added by explicit user request. Three models:
//!
//! - **en** — Phonon 31M (gradium/phonon-31m-en, Apache-2.0) via the ONNX
//!   export ai-ecoverse/phonon-31m-en-ONNX (q4 flow LM, fp32 Mimi decoder):
//!   four graphs (text_conditioner, flow_lm_main, flow_lm_flow, mimi_decoder),
//!   an autoregressive frame loop, 24 kHz. Keeps word-level alignment.
//! - **tr** — EMA Lightning (canberkkkkkk/ema-lightning, Apache-2.0) via the
//!   ONNX export tedash34/ema-lightning-onnx: three graphs (text, sound,
//!   decoder), whole-utterance generation, 48 kHz.
//! - **31 languages** — Supertonic 3 (Supertone, OpenRAIL-M): duration
//!   predictor, text encoder, flow-matching vector estimator and vocoder,
//!   44.1 kHz, ten voice styles (M1..M5, F1..F5). See [`s3`].
//!
//! Model files live in `tts-models/{en,tr,s3}/` next to the binary (override
//! with `SCREENWORDS_TTS_MODELS`).

pub mod align;
pub mod en_phonon;
pub mod nfkd;
pub mod s3;
pub mod tr_ema;
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
    /// EMA Lightning, Turkish.
    Ema,
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
        if ["en/flow_lm_main.onnx", "s3/onnx/vocoder.onnx", "tr/text.onnx"]
            .iter()
            .any(|marker| models.join(marker).exists())
        {
            return models;
        }
    }
    std::path::PathBuf::from("/tmp/tts-models")
}

/// Route a request. An explicit Supertonic voice wins for every language
/// once those models are staged; otherwise English keeps Phonon (it has
/// word-level timings) and Turkish keeps EMA. Any other language needs
/// Supertonic 3 staged.
pub fn backend_for(lang: &str, voice: &str) -> Backend {
    route(lang, voice, s3::available())
}

/// The routing decision with staging as an input, so the whole matrix is
/// testable on a machine without models (CI stages nothing): the voice
/// naming alone must not promise Supertonic — `M1` on a bare install still
/// speaks the language default.
fn route(lang: &str, voice: &str, s3_staged: bool) -> Backend {
    if s3_staged && s3::is_voice(voice) {
        return Backend::Supertonic;
    }
    match lang {
        "en" => Backend::Phonon,
        "tr" => Backend::Ema,
        _ if s3_staged => Backend::Supertonic,
        _ => Backend::Phonon,
    }
}

/// Speak `text` in `lang`. `voice` is a Phonon file stem for English and a
/// Supertonic style (M1..F5) for everything else; `seed` drives the noise draw.
pub fn synthesize(lang: &str, text: &str, voice: &str, seed: u32) -> Result<Audio, String> {
    synthesize_timed(lang, text, voice, seed).map(|(audio, _)| audio)
}

/// Chunk timing spans `(start_seconds, duration_seconds)` reported by a TTS backend.
pub type ChunkWindows = Vec<(f64, f64)>;

/// As [`synthesize`], plus the `(start, duration)` window of each spoken chunk
/// when the backend can report one. Caption re-timing maps sentences onto these.
pub fn synthesize_timed(
    lang: &str,
    text: &str,
    voice: &str,
    seed: u32,
) -> Result<(Audio, Option<ChunkWindows>), String> {
    // Those two languages have a dedicated model; everything else is Supertonic
    // 3, and silently reading German with English rules would be worse than
    // telling the caller the models are missing.
    if !matches!(lang, "en" | "tr") && !s3::available() {
        return Err(format!(
            "language '{lang}' needs the Supertonic 3 models in tts-models/s3 (31 languages)"
        ));
    }
    match backend_for(lang, voice) {
        Backend::Supertonic => s3::speak_timed(text, voice, seed, lang).map(|(a, w)| (a, Some(w))),
        Backend::Phonon => en_phonon::speak_timed(text, voice, seed).map(|(a, w)| (a, Some(w))),
        Backend::Ema => tr_ema::speak(text, seed).map(|a| (a, None)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_supertonic_voice_wins_over_the_language_default() {
        // An M1..F5 style only reaches Supertonic when those models are
        // staged; without them the language default speaks instead (the
        // naming alone is not a promise).
        assert_eq!(route("en", "M1", true), Backend::Supertonic);
        assert_eq!(route("tr", "F3", true), Backend::Supertonic);
        assert_eq!(route("en", "M1", false), Backend::Phonon);
        assert_eq!(route("tr", "F3", false), Backend::Ema);
        // A Phonon voice name never leaves the language default.
        assert_eq!(route("en", "easton", true), Backend::Phonon);
        assert_eq!(route("tr", "easton", true), Backend::Ema);
        // A third language needs Supertonic staged; without it Phonon is the
        // least-wrong fallback (synthesize_timed rejects it earlier).
        assert_eq!(route("de", "any", true), Backend::Supertonic);
        assert_eq!(route("de", "any", false), Backend::Phonon);
    }
}
