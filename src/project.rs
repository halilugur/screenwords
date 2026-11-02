//! The `project.json` document model (schemaVersion 2), read as typed views
//! over the parsed JSON so every edit round-trips losslessly through
//! [`crate::json::Value`].
//!
//! Shapes follow the app exactly: prefixed ids (`prj_`, `ast_`, `trk_`,
//! `cmp_`, `clp_`, `aud_`, `seg_`, `w<n>`), tracks composited bottom → top
//! (video, overlay, caption, audio; role tracks like Scenes/Voice/Music/SFX),
//! components anchored to spoken words, and `wordCounter` as the next word id.

use crate::json::{JsonError, Value};
use crate::rational::RationalTime;
use std::fmt;

#[derive(Debug, Clone)]
pub struct ProjectError(pub String);

impl fmt::Display for ProjectError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ProjectError {}

impl From<JsonError> for ProjectError {
    fn from(e: JsonError) -> Self {
        ProjectError(format!("project.json is not valid JSON: {e}"))
    }
}

pub const SCHEMA_VERSION: i64 = 2;

/// A `.screenwords` bundle document: `project.json` plus the revision counter
/// the app keeps in `revision.json` next to it.
#[derive(Debug, Clone)]
pub struct Project {
    pub root: Value,
    pub revision: u64,
}

impl Project {
    pub fn parse(json_text: &str) -> Result<Project, ProjectError> {
        let root = Value::parse(json_text)?;
        if !matches!(root, Value::Object(_)) {
            return Err(ProjectError("project.json must be a JSON object".into()));
        }
        let version = root.get("schemaVersion").and_then(Value::as_i64).unwrap_or(0);
        if version != SCHEMA_VERSION {
            return Err(ProjectError(format!(
                "unsupported schemaVersion {version} (this model reads {SCHEMA_VERSION})"
            )));
        }
        for key in ["id", "name", "tracks", "settings"] {
            if root.get(key).is_none() {
                return Err(ProjectError(format!("project.json is missing '{key}'")));
            }
        }
        Ok(Project { root, revision: 1 })
    }

    pub fn with_revision(mut self, revision: u64) -> Project {
        self.revision = revision;
        self
    }

    pub fn id(&self) -> &str {
        self.root.get("id").and_then(Value::as_str).unwrap_or("")
    }

    pub fn name(&self) -> &str {
        self.root.get("name").and_then(Value::as_str).unwrap_or("")
    }

    pub fn word_counter(&self) -> i64 {
        self.root.get("wordCounter").and_then(Value::as_i64).unwrap_or(0)
    }

    pub fn tracks(&self) -> Vec<Track<'_>> {
        self.root
            .get("tracks")
            .and_then(Value::as_array)
            .map(|a| a.iter().map(Track::new).collect())
            .unwrap_or_default()
    }

    pub fn track(&self, id: &str) -> Option<Track<'_>> {
        self.tracks().into_iter().find(|t| t.id() == id)
    }

    pub fn assets(&self) -> Vec<&Value> {
        self.root.get("assets").and_then(Value::as_array).map(|a| a.iter().collect()).unwrap_or_default()
    }

    pub fn asset(&self, id: &str) -> Option<&Value> {
        self.assets().into_iter().find(|a| a.get("id").and_then(Value::as_str) == Some(id))
    }

    pub fn transcripts(&self) -> &[Value] {
        self.root.get("transcripts").and_then(Value::as_array).unwrap_or(&[])
    }

    /// Looks a word id up across all transcripts.
    pub fn word(&self, word_id: &str) -> Option<Word<'_>> {
        for t in self.transcripts() {
            if let Some(words) = t.get("words").and_then(Value::as_array) {
                for w in words {
                    if w.get("id").and_then(Value::as_str) == Some(word_id) {
                        return Some(Word { raw: w });
                    }
                }
            }
        }
        None
    }

    /// Every word in speaking order (transcripts are stored in order).
    pub fn words(&self) -> Vec<Word<'_>> {
        let mut out = Vec::new();
        for t in self.transcripts() {
            if let Some(words) = t.get("words").and_then(Value::as_array) {
                out.extend(words.iter().map(Word::new));
            }
        }
        out
    }

    pub fn settings(&self) -> Settings<'_> {
        Settings { raw: self.root.get("settings") }
    }

    /// Resolves a word anchor to absolute timeline time: the word's start or
    /// end edge plus the (possibly negative) offset. The app stores anchors
    /// nested — `{"anchor": {"wordId", "edge"?, "offset"?}}` — and callers
    /// may pass either the wrapper or the bare anchor. `edge` defaults to
    /// "start".
    pub fn resolve_anchor(&self, spec: &Value) -> Option<RationalTime> {
        let anchor = spec.get("anchor").unwrap_or(spec);
        let word_id = anchor.get("wordId")?.as_str()?;
        let word = self.word(word_id)?;
        let edge = anchor.get("edge").and_then(Value::as_str).unwrap_or("start");
        let base = if edge == "end" { word.end() } else { word.start() };
        match anchor.get("offset") {
            Some(offset) => Some(base.add(&RationalTime::from_json(offset)?)),
            None => Some(base),
        }
    }

    /// True when a timing spec references a word (bare or nested anchor).
    pub fn is_word_anchored(spec: &Value) -> bool {
        let inner = spec.get("anchor").unwrap_or(spec);
        inner.get("wordId").is_some()
    }

    /// Resolves any timing spec the model uses: a rational object (absolute),
    /// `{"seconds": N}` (the tools' shorthand), or an anchor object
    /// (word-relative, bare or nested).
    pub fn resolve_time(&self, spec: &Value) -> Option<RationalTime> {
        if Self::is_word_anchored(spec) {
            return self.resolve_anchor(spec);
        }
        if let Some(seconds) = spec.get("seconds").and_then(Value::as_f64) {
            return Some(RationalTime::from_seconds(seconds, 1000));
        }
        RationalTime::from_json(spec)
    }

    /// A component's resolved [start, end] window; `end` may be open
    /// (duration-anchored components store a duration instead).
    pub fn component_window(&self, component: &Value) -> Option<(RationalTime, Option<RationalTime>)> {
        let timing = component.get("timing")?;
        let start = timing.get("start").and_then(|s| self.resolve_time(s))?;
        let end = timing
            .get("end")
            .and_then(|e| self.resolve_time(e))
            .or_else(|| {
                timing.get("duration").and_then(|d| {
                    RationalTime::from_json(d).map(|dur| start.add(&dur))
                })
            });
        Some((start, end))
    }

    /// All components on every track, flattened, in track order.
    pub fn components(&self) -> Vec<&Value> {
        let mut out = Vec::new();
        for t in self.tracks() {
            if let Some(cs) = t.raw.get("components").and_then(Value::as_array) {
                out.extend(cs.iter());
            }
        }
        out
    }

    pub fn component(&self, id: &str) -> Option<&Value> {
        self.components().into_iter().find(|c| c.get("id").and_then(Value::as_str) == Some(id))
    }

    /// Serialized project.json bytes, Swift-`JSONEncoder` pretty style with
    /// sorted keys — byte-comparable to how the app writes the file.
    pub fn to_json_string(&self) -> String {
        self.root.to_string_pretty(true)
    }
}

/// A track view. Kinds: `video` (bottom, ripples on insert), `overlay`,
/// `caption`, `audio`; optional roles: `scenes`, `voice`, `music`, `sfx`.
#[derive(Debug, Clone, Copy)]
pub struct Track<'a> {
    pub raw: &'a Value,
}

impl<'a> Track<'a> {
    pub fn new(raw: &'a Value) -> Track<'a> {
        Track { raw }
    }

    pub fn id(&self) -> &str {
        self.raw.get("id").and_then(Value::as_str).unwrap_or("")
    }

    pub fn kind(&self) -> &str {
        self.raw.get("kind").and_then(Value::as_str).unwrap_or("")
    }

    pub fn name(&self) -> &str {
        self.raw.get("name").and_then(Value::as_str).unwrap_or("")
    }

    pub fn role(&self) -> Option<&str> {
        self.raw.get("role").and_then(Value::as_str)
    }

    pub fn is_hidden(&self) -> bool {
        self.raw.get("isHidden").and_then(Value::as_bool).unwrap_or(false)
    }

    pub fn is_muted(&self) -> bool {
        self.raw.get("isMuted").and_then(Value::as_bool).unwrap_or(false)
    }

    pub fn clips(&self) -> &'a [Value] {
        self.raw.get("clips").and_then(Value::as_array).unwrap_or(&[])
    }

    pub fn components(&self) -> &'a [Value] {
        self.raw.get("components").and_then(Value::as_array).unwrap_or(&[])
    }

    pub fn audio_events(&self) -> &'a [Value] {
        self.raw.get("audioEvents").and_then(Value::as_array).unwrap_or(&[])
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Word<'a> {
    pub raw: &'a Value,
}

impl<'a> Word<'a> {
    pub fn new(raw: &'a Value) -> Word<'a> {
        Word { raw }
    }

    pub fn id(&self) -> &str {
        self.raw.get("id").and_then(Value::as_str).unwrap_or("")
    }

    /// The speaker id of a multi-speaker transcript (`turns`), if any.
    pub fn speaker(&self) -> Option<&str> {
        self.raw.get("speaker").and_then(Value::as_str)
    }

    pub fn text(&self) -> &str {
        self.raw.get("text").and_then(Value::as_str).unwrap_or("")
    }

    pub fn start(&self) -> RationalTime {
        RationalTime::from_json(self.raw.get("start").unwrap_or(&Value::Null))
            .unwrap_or(RationalTime::ZERO)
    }

    pub fn end(&self) -> RationalTime {
        RationalTime::from_json(self.raw.get("end").unwrap_or(&Value::Null))
            .unwrap_or(RationalTime::ZERO)
    }

    pub fn confidence(&self) -> f64 {
        self.raw.get("confidence").and_then(Value::as_f64).unwrap_or(1.0)
    }
}

#[derive(Debug, Clone, Copy)]
pub struct Settings<'a> {
    pub raw: Option<&'a Value>,
}

impl<'a> Settings<'a> {
    pub fn width(&self) -> i64 {
        self.raw.and_then(|r| r.get("resolution")).and_then(|r| r.get("width")).and_then(Value::as_i64).unwrap_or(0)
    }

    pub fn height(&self) -> i64 {
        self.raw.and_then(|r| r.get("resolution")).and_then(|r| r.get("height")).and_then(Value::as_i64).unwrap_or(0)
    }

    /// Frames per second as f64 from the `frameRate` rational.
    pub fn fps(&self) -> f64 {
        self.raw
            .and_then(|r| r.get("frameRate"))
            .and_then(|fr| {
                let num = fr.get("numerator").and_then(Value::as_i64)?;
                let den = fr.get("denominator").and_then(Value::as_i64)?;
                Some(num as f64 / den.max(1) as f64)
            })
            .unwrap_or(30.0)
    }

    pub fn target_duration(&self) -> Option<RationalTime> {
        self.raw.and_then(|r| r.get("targetDuration")).and_then(RationalTime::from_json)
    }

    pub fn lufs(&self) -> f64 {
        self.raw
            .and_then(|r| r.get("loudness"))
            .and_then(|l| l.get("integratedLUFS"))
            .and_then(Value::as_f64)
            .unwrap_or(-14.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL: &str = r#"{
      "id": "prj_x", "name": "X", "schemaVersion": 2, "wordCounter": 0,
      "settings": {"resolution": {"width": 1080, "height": 1920},
                   "frameRate": {"numerator": 30, "denominator": 1}},
      "tracks": [{"id": "trk_v", "kind": "video", "name": "Video", "clips": [], "components": [], "audioEvents": []}]
    }"#;

    #[test]
    fn parse_minimal() {
        let p = Project::parse(MINIMAL).unwrap();
        assert_eq!(p.id(), "prj_x");
        assert_eq!(p.settings().fps(), 30.0);
        assert_eq!(p.settings().width(), 1080);
        assert_eq!(p.tracks().len(), 1);
        assert_eq!(p.tracks()[0].kind(), "video");
    }

    #[test]
    fn rejects_bad_documents() {
        assert!(Project::parse("{}").is_err());
        let v3 = MINIMAL.replace("\"schemaVersion\": 2", "\"schemaVersion\": 3");
        assert!(Project::parse(&v3).is_err());
        assert!(Project::parse("nope").is_err());
    }
}
