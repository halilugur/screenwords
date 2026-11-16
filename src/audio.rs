//! The film's sound: narration, music and effects, mixed into the one track
//! the player plays and the render muxes.
//!
//! Narration is recorded speech (an embedded WAV). Music and effects are
//! *generated*: an asset holds a recipe (`source.synth`), not samples, so a
//! project stays small, a film re-voiced at another pace gets music of the
//! new length, and the same project always sounds the same. [`music`] makes a
//! bed in a mood, [`sound`] a short effect; both are plain synthesis — sines,
//! filtered noise, envelopes — with no samples and nothing to license.
//!
//! [`film_sound`] is the one place the track is put together: the editor's
//! audio route and the exported player both ask it. Music is ducked wherever
//! someone speaks; everything passes one soft limiter.

use crate::json::Value;
use crate::project::Project;
use std::f32::consts::TAU;
use std::path::{Path, PathBuf};

/// The rate everything is generated and mixed at.
pub const RATE: u32 = 48_000;
/// The moods [`music`] knows.
pub const MOODS: &[&str] = &["calm", "wonder", "drive"];
/// The effects [`sound`] knows, with their length in seconds.
pub const SOUNDS: &[(&str, f32)] =
    &[("whoosh", 0.7), ("impact", 1.0), ("pop", 0.14), ("rise", 1.6), ("tick", 0.05), ("shimmer", 1.5)];

/// Audio as it is served: a container's bytes and its content type.
pub struct Sound {
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// The finished track and anything that could not go into it.
pub struct FilmSound {
    pub sound: Option<Sound>,
    pub notes: Vec<String>,
}

// ---------- levels ----------

/// A soft knee above 0.8: overlapping sounds sum without hard clipping.
pub fn soft_limit(x: f32) -> f32 {
    let a = x.abs();
    if a <= 0.8 {
        x
    } else {
        x.signum() * (0.8 + 0.2 * ((a - 0.8) / 0.2).tanh())
    }
}

/// Bring a clip's speech to `target_rms` (measured over its loud frames, so
/// pauses do not count), so voices that render louder or softer sit at one
/// loudness. The gain stays within -14 dB..+10 dB so a near-silent clip is
/// not pumped into noise.
pub fn level_speech(clip: &mut [f32], rate: u32, target_rms: f32) {
    let win = (rate as usize / 50).max(1);
    let peak = clip.iter().fold(0.0f32, |m, s| m.max(s.abs()));
    if peak <= 1e-6 {
        return;
    }
    let (mut sum, mut n) = (0.0f64, 0usize);
    for frame in clip.chunks(win) {
        let fp = frame.iter().fold(0.0f32, |m, s| m.max(s.abs()));
        if fp > peak * 0.1 {
            sum += frame.iter().map(|s| (*s as f64) * (*s as f64)).sum::<f64>();
            n += frame.len();
        }
    }
    if n == 0 {
        return;
    }
    let rms = (sum / n as f64).sqrt() as f32;
    let gain = (target_rms / rms.max(1e-6)).clamp(0.2, 3.16);
    for s in clip.iter_mut() {
        *s *= gain;
    }
}

/// A gain per sample that drops music to about a third while `voice` is
/// speaking: down in 60 ms, back in 300 ms, so it never pumps on a comma.
fn duck_under(voice: &[f32], len: usize, rate: u32) -> Vec<f32> {
    let win = (rate as usize / 50).max(1);
    let mut gain = Vec::with_capacity(len);
    let mut g = 1.0f32;
    for frame in 0..len.div_ceil(win) {
        let s = frame * win;
        let e = (s + win).min(voice.len());
        let peak = if s < e { voice[s..e].iter().fold(0.0f32, |m, x| m.max(x.abs())) } else { 0.0 };
        let target = if peak > 0.02 { 0.32 } else { 1.0 };
        g += (target - g) * if target < g { 0.33 } else { 0.067 };
        gain.extend(std::iter::repeat(g).take(win.min(len - gain.len())));
    }
    gain
}

// ---------- synthesis ----------

fn midi_hz(note: f32) -> f32 {
    440.0 * 2f32.powf((note - 69.0) / 12.0)
}

/// Repeatable white noise in [-1, 1].
struct Noise(u64);

impl Noise {
    fn new(seed: u32) -> Noise {
        Noise(seed as u64 ^ 0x9E37_79B9_7F4A_7C15)
    }
    fn next(&mut self) -> f32 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        (self.0 >> 40) as f32 / (1u64 << 23) as f32 - 1.0
    }
}

/// Chords written as semitones above the key's tonic, close-voiced.
type Chord = [i8; 3];
const MAJ_I: Chord = [0, 4, 7];
const MAJ_II: Chord = [2, 5, 9];
const MAJ_IV: Chord = [0, 5, 9];
const MAJ_V: Chord = [-1, 2, 7];
const MAJ_VI: Chord = [-3, 0, 4];
const MIN_I: Chord = [0, 3, 7];
const MIN_III: Chord = [3, 7, 10];
const MIN_IV: Chord = [-7, -4, 0];
const MIN_VI: Chord = [-4, 0, 3];
const MIN_VII: Chord = [-2, 2, 5];

/// What a mood is made of: the progressions its sections are drawn from, a
/// tonic, a pace, and how much of each layer plays.
struct Mood {
    tonic: u8,
    progressions: &'static [[Chord; 4]],
    chord_seconds: f32,
    /// Sustained chord tones.
    pad: f32,
    /// Chord tones picked out one at a time, an octave or two up; `0` leaves
    /// them to the bridge only.
    notes: f32,
    /// How many of those per chord, and how fast each dies away.
    notes_per_chord: f32,
    note_decay: f32,
    /// The chord's root, low, on every beat.
    pulse: f32,
}

fn mood(name: &str) -> Option<Mood> {
    Some(match name {
        // Major and unhurried: a floor under speech.
        "calm" => Mood {
            tonic: 60,
            progressions: &[[MAJ_I, MAJ_VI, MAJ_IV, MAJ_V], [MAJ_I, MAJ_V, MAJ_VI, MAJ_IV], [MAJ_VI, MAJ_IV, MAJ_I, MAJ_V], [MAJ_IV, MAJ_I, MAJ_II, MAJ_V]],
            chord_seconds: 4.0, pad: 1.0, notes: 0.0, notes_per_chord: 4.0, note_decay: 3.0, pulse: 0.0,
        },
        // Minor and slow, with bell notes far apart: space, nature, history.
        "wonder" => Mood {
            tonic: 57,
            progressions: &[[MIN_I, MIN_VI, MIN_III, MIN_VII], [MIN_I, MIN_IV, MIN_VI, MIN_VII], [MIN_VI, MIN_VII, MIN_I, MIN_I], [MIN_I, MIN_VII, MIN_VI, MIN_VII]],
            chord_seconds: 5.0, pad: 0.8, notes: 0.55, notes_per_chord: 4.0, note_decay: 2.2, pulse: 0.0,
        },
        // About 100 beats a minute, a low pulse and plucked eighths: products, how-tos.
        "drive" => Mood {
            tonic: 50,
            progressions: &[[MIN_I, MIN_VI, MIN_III, MIN_VII], [MIN_I, MIN_VII, MIN_VI, MIN_VII], [MIN_VI, MIN_III, MIN_VII, MIN_I]],
            chord_seconds: 2.4, pad: 0.45, notes: 0.5, notes_per_chord: 8.0, note_decay: 9.0, pulse: 0.6,
        },
        _ => return None,
    })
}

/// One piece in a mood, decided by its seed: the key, the pace, and the two
/// progressions it plays as a song does — a verse twice, a bridge, the verse
/// again (A A B A, four chords each), so it moves instead of looping.
struct Tune {
    mood: Mood,
    transpose: i8,
    chord_seconds: f32,
    verse: usize,
    bridge: usize,
    seed: u32,
}

/// A repeatable spread of a seed: the `k`-th independent choice made from it.
fn pick(seed: u32, k: u32) -> u32 {
    let mut x = (seed as u64) ^ ((k as u64) << 32) ^ 0x9E37_79B9_7F4A_7C15;
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    ((x ^ (x >> 31)) >> 16) as u32
}

impl Tune {
    fn new(mood_name: &str, seed: u32) -> Option<Tune> {
        let mood = mood(mood_name)?;
        const KEYS: [i8; 8] = [0, 2, -3, 5, -2, 3, -5, 1];
        const PACE: [f32; 3] = [0.9, 1.0, 1.12];
        let n = mood.progressions.len();
        let verse = pick(seed, 1) as usize % n;
        let bridge = (verse + 1 + pick(seed, 2) as usize % (n - 1)) % n;
        Some(Tune {
            transpose: KEYS[pick(seed, 0) as usize % KEYS.len()],
            chord_seconds: mood.chord_seconds * PACE[pick(seed, 3) as usize % PACE.len()],
            verse,
            bridge,
            seed,
            mood,
        })
    }

    /// Whether the `index`-th chord falls in the bridge.
    fn in_bridge(index: usize) -> bool {
        (index / 4) % 4 == 2
    }

    /// The `index`-th chord as MIDI notes.
    fn chord(&self, index: usize) -> [f32; 3] {
        let progression = self.mood.progressions[if Tune::in_bridge(index) { self.bridge } else { self.verse }];
        let tonic = self.mood.tonic as i16 + self.transpose as i16;
        progression[index % 4].map(|step| (tonic + step as i16) as f32)
    }
}

/// `seconds` of music in `mood`, at [`RATE`]: quiet enough to sit under a
/// voice, with no fades of its own (the mixer fades each event). `seed`
/// chooses the piece — its key, pace, verse and bridge, and the pattern of
/// picked notes — so two films in one mood need not sound alike.
pub fn music(mood: &str, seconds: f32, seed: u32) -> Option<Vec<f32>> {
    let tune = Tune::new(mood, seed)?;
    let m = &tune.mood;
    let r = RATE as f32;
    let cs = tune.chord_seconds;
    const OVERLAP: f32 = 0.6;
    let beat = cs / 4.0;
    let mut out = Vec::with_capacity((seconds.max(0.0) * r) as usize);
    for i in 0..(seconds.max(0.0) * r) as usize {
        let t = i as f32 / r;
        let idx = (t / cs).floor() as usize;
        let in_chord = t - idx as f32 * cs;
        let chord = tune.chord(idx);
        let bridge = Tune::in_bridge(idx);
        let mut v = 0.0f32;
        // Pad: this chord, and the next one rising under its last moments.
        let to_end = cs - in_chord;
        let next = if to_end < OVERLAP { 1.0 - to_end / OVERLAP } else { 0.0 };
        for (weight, tones) in [((1.0 - next).sqrt(), chord), (next.sqrt(), tune.chord(idx + 1))] {
            if weight <= 0.0 {
                continue;
            }
            for (j, note) in tones.iter().enumerate() {
                let ph = TAU * midi_hz(*note) * t + j as f32;
                v += m.pad * weight * (ph.sin() + 0.18 * (2.0 * ph).sin()) / 3.0;
            }
        }
        v *= 0.85 + 0.15 * (TAU * 0.11 * t).sin();
        // Picked notes: chord tones up high, twice as many in the bridge (and
        // only there for a mood that otherwise keeps to its pad).
        let notes = if bridge { m.notes.max(0.35) } else { m.notes };
        if notes > 0.0 {
            let note_len = cs / (m.notes_per_chord * if bridge { 2.0 } else { 1.0 });
            let step = (t / note_len).floor();
            let local = t - step * note_len;
            let choice = (step as usize).wrapping_mul(7).wrapping_add(tune.seed as usize) % 5;
            let note = chord[choice % 3] + if choice >= 3 { 24.0 } else { 12.0 };
            let env = (local / 0.008).min(1.0) * (-local * m.note_decay).exp();
            let ph = TAU * midi_hz(note) * local;
            v += notes * env * (ph.sin() + 0.3 * (3.0 * ph).sin() * (-local * 6.0).exp()) * 0.5;
        }
        // Pulse: the root two octaves down, once a beat.
        if m.pulse > 0.0 {
            let local = t - (t / beat).floor() * beat;
            let env = (local / 0.006).min(1.0) * (-local * 5.0).exp();
            v += m.pulse * env * (1.5 * (TAU * midi_hz(chord[0] - 24.0) * local).sin()).tanh();
        }
        out.push(0.055 * v);
    }
    Some(out)
}

/// One effect, at [`RATE`]: `whoosh` (something passing), `impact` (a low
/// hit), `pop` (something appearing), `rise` (a build-up into a moment),
/// `tick` (a count or a step), `shimmer` (a reveal). `seed` varies the noise.
pub fn sound(kind: &str, seed: u32) -> Option<Vec<f32>> {
    let seconds = SOUNDS.iter().find(|(name, _)| *name == kind)?.1;
    let r = RATE as f32;
    let n = (seconds * r) as usize;
    let mut noise = Noise::new(seed);
    let (mut low, mut slow, mut phase) = (0.0f32, 0.0f32, 0.0f32);
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f32 / r;
        let x = t / seconds;
        let white = noise.next();
        let v = match kind {
            "whoosh" => {
                // Noise through a band that sweeps up and back down.
                let cutoff = 300.0 + 3700.0 * (std::f32::consts::PI * x).sin();
                low += (white - low) * (TAU * cutoff / r).min(1.0);
                slow += (low - slow) * (TAU * cutoff * 0.25 / r).min(1.0);
                0.7 * (low - slow) * (std::f32::consts::PI * x).sin().powi(2)
            }
            "impact" => {
                phase += TAU * (38.0 + 60.0 * (-t * 18.0).exp()) / r;
                low += (white - low) * 0.25;
                0.55 * phase.sin() * (-t * 5.0).exp() + 0.3 * low * (-t * 60.0).exp()
            }
            "pop" => {
                phase += TAU * (420.0 + 700.0 * x) / r;
                0.5 * phase.sin() * (t / 0.004).min(1.0) * (-t * 30.0).exp()
            }
            "rise" => {
                phase += TAU * 180.0 * 2f32.powf(3.0 * x) / r;
                low += (white - low) * 0.2;
                let cut = if x > 0.92 { 1.0 - (x - 0.92) / 0.08 } else { 1.0 };
                (0.35 * phase.sin() + 0.3 * low * x) * x * x * cut
            }
            "tick" => 0.4 * (TAU * 2200.0 * t).sin() * (-t * 120.0).exp(),
            _ => {
                // shimmer: five high partials, entering one after another.
                [2093.0f32, 2637.0, 3136.0, 3951.0, 4699.0]
                    .iter()
                    .enumerate()
                    .map(|(k, hz)| {
                        let lt = t - k as f32 * 0.06;
                        if lt <= 0.0 { 0.0 } else { 0.1 * (TAU * hz * lt).sin() * (1.0 - (-lt * 80.0).exp()) * (-lt * 3.5).exp() }
                    })
                    .sum()
            }
        };
        out.push(v);
    }
    // Whatever the shape, it leaves and returns to silence without a click.
    let (attack, release) = ((0.003 * r) as usize, (0.008 * r) as usize);
    for i in 0..attack.min(n) {
        out[i] *= i as f32 / attack as f32;
    }
    for i in 0..release.min(n) {
        out[n - 1 - i] *= i as f32 / release as f32;
    }
    Some(out)
}

// ---------- reading audio ----------

/// 16-bit PCM WAV bytes as mono samples and their rate.
pub fn decode_wav(bytes: &[u8]) -> Option<(Vec<f32>, u32)> {
    if bytes.len() < 12 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let le16 = |i: usize| u16::from_le_bytes([bytes[i], bytes[i + 1]]);
    let le32 = |i: usize| u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
    let (mut channels, mut rate) = (0usize, 0u32);
    let mut at = 12;
    while at + 8 <= bytes.len() {
        let size = le32(at + 4) as usize;
        let body = at + 8;
        let end = (body + size).min(bytes.len());
        match &bytes[at..at + 4] {
            b"fmt " if size >= 16 && end >= body + 16 => {
                if le16(body) != 1 || le16(body + 14) != 16 {
                    return None;
                }
                channels = le16(body + 2) as usize;
                rate = le32(body + 4);
            }
            b"data" if channels > 0 && rate > 0 => {
                let samples = bytes[body..end]
                    .chunks_exact(2 * channels)
                    .map(|frame| {
                        frame.chunks_exact(2).map(|s| i16::from_le_bytes([s[0], s[1]]) as f32 / 32768.0).sum::<f32>() / channels as f32
                    })
                    .collect();
                return Some((samples, rate));
            }
            _ => {}
        }
        at = body + size + (size & 1);
    }
    None
}

/// `samples` at `from` Hz as [`RATE`], by linear interpolation.
fn to_mix_rate(samples: Vec<f32>, from: u32) -> Vec<f32> {
    if from == RATE || samples.is_empty() {
        return samples;
    }
    let step = from as f64 / RATE as f64;
    (0..(samples.len() as f64 / step) as usize)
        .map(|i| {
            let pos = i as f64 * step;
            let a = pos as usize;
            let b = (a + 1).min(samples.len() - 1);
            samples[a] + (samples[b] - samples[a]) * (pos - a as f64) as f32
        })
        .collect()
}

pub fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("wav") => "audio/wav",
        Some("mp3") => "audio/mpeg",
        Some("m4a") | Some("mp4") => "audio/mp4",
        Some("aac") => "audio/aac",
        Some("ogg") | Some("oga") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("aif") | Some("aiff") | Some("caf") => "audio/aiff",
        _ => "application/octet-stream",
    }
}

/// `data:<mime>;base64,<payload>` as its content type and bytes.
pub fn data_uri(uri: &str) -> Option<(String, Vec<u8>)> {
    let (meta, payload) = uri.strip_prefix("data:")?.split_once(',')?;
    Some((meta.strip_suffix(";base64")?.to_string(), crate::render::base64_decode(payload)?))
}

/// A bundle-relative or absolute asset path, resolved.
pub fn asset_path(src: &str, base: Option<&Path>) -> PathBuf {
    let path = Path::new(src);
    match base {
        Some(base) if !path.is_absolute() => base.join(path),
        _ => path.to_path_buf(),
    }
}

/// An asset's recorded audio: embedded (the normal case) or a file.
fn recorded(asset: &Value, base: Option<&Path>) -> Option<Sound> {
    let source = asset.get("source")?;
    if let Some((mime, bytes)) = source.get("dataUri").and_then(Value::as_str).and_then(data_uri) {
        return Some(Sound { mime, bytes });
    }
    let path = asset_path(source.get("path")?.as_str()?, base);
    let bytes = std::fs::read(&path).ok()?;
    Some(Sound { mime: content_type(&path).to_string(), bytes })
}

/// The recipe of a generated asset: `("music", mood)` or `("sound", kind)`.
fn recipe(asset: &Value) -> Option<(&str, &str)> {
    let synth = asset.get("source")?.get("synth")?;
    ["music", "sound"].into_iter().find_map(|what| Some((what, synth.get(what)?.as_str()?)))
}

/// The narration: the asset of a voice event on an unmuted track first, then
/// any other recorded audio asset (unless the voice track itself is muted),
/// then a `voice.mp3` beside the bundle.
pub fn narration(p: &Project, base: Option<&Path>) -> Option<Sound> {
    let voice_muted = p.tracks().iter().any(|t| t.role() == Some("voice") && t.is_muted() && !t.audio_events().is_empty());
    let mut candidates: Vec<&Value> = Vec::new();
    for t in p.tracks().iter().filter(|t| !t.is_muted()) {
        for event in t.audio_events().iter().filter(|e| e.get("role").and_then(Value::as_str) == Some("voice")) {
            candidates.extend(event.get("assetId").and_then(Value::as_str).and_then(|id| p.asset(id)));
        }
    }
    if !voice_muted {
        candidates.extend(p.assets().into_iter().filter(|a| a.get("kind").and_then(Value::as_str) == Some("audio")));
    }
    candidates
        .into_iter()
        .filter(|a| recipe(a).is_none())
        .find_map(|a| recorded(a, base))
        .or_else(|| {
            let fallback = base?.join("voice.mp3");
            Some(Sound { mime: content_type(&fallback).to_string(), bytes: std::fs::read(&fallback).ok()? })
        })
}

/// One music or effect event, ready to lay on the track.
struct Layer {
    samples: Vec<f32>,
    start: usize,
    gain: f32,
    fade_in: usize,
    fade_out: usize,
    ducked: bool,
}

/// The film's whole track for a film `duration` seconds long. With no music
/// or effects it is the narration exactly as recorded; otherwise everything
/// is mixed at [`RATE`] into one WAV. `notes` names what was left out.
pub fn film_sound(p: &Project, base: Option<&Path>, duration: f64) -> FilmSound {
    let voice = narration(p, base);
    let mut notes: Vec<String> = Vec::new();
    let seconds = |v: Option<&Value>| v.and_then(crate::rational::RationalTime::from_json).map(|t| t.seconds()).unwrap_or(0.0);
    let events: Vec<&Value> = p
        .tracks()
        .iter()
        .filter(|t| !t.is_muted())
        .flat_map(|t| t.audio_events().iter())
        .filter(|e| matches!(e.get("role").and_then(Value::as_str), Some("music" | "sfx")))
        .collect();
    if events.is_empty() {
        return FilmSound { sound: voice, notes };
    }
    let voice_pcm = match &voice {
        None => Vec::new(),
        Some(sound) => match decode_wav(&sound.bytes) {
            Some((samples, rate)) => to_mix_rate(samples, rate),
            None => {
                notes.push("the narration is not a 16-bit WAV, so music and effects could not be mixed with it and were left out".into());
                return FilmSound { sound: voice, notes };
            }
        },
    };
    let total = ((duration.max(0.0) * RATE as f64) as usize).max(voice_pcm.len());
    let mut layers: Vec<Layer> = Vec::new();
    for event in events {
        let id = event.get("id").and_then(Value::as_str).unwrap_or("?");
        let Some(asset) = event.get("assetId").and_then(Value::as_str).and_then(|a| p.asset(a)) else {
            notes.push(format!("{id}: its asset is missing"));
            continue;
        };
        let start = event.get("start").and_then(|s| p.resolve_time(s)).map(|t| t.seconds()).unwrap_or(0.0).max(0.0);
        let to_end = event.get("toEnd").and_then(Value::as_bool).unwrap_or(false);
        let length = if to_end { (total as f64 / RATE as f64 - start).max(0.0) } else { seconds(event.get("duration")) };
        let seed = asset.get("source").and_then(|s| s.get("synth")).and_then(|s| s.get("seed")).and_then(Value::as_i64).unwrap_or(0) as u32;
        let samples = match recipe(asset) {
            Some(("music", mood)) => music(mood, length as f32, seed),
            Some((_, kind)) => sound(kind, seed),
            None => recorded(asset, base).and_then(|s| decode_wav(&s.bytes)).map(|(samples, rate)| {
                let mut clip = to_mix_rate(samples, rate);
                if event.get("loop").and_then(Value::as_bool).unwrap_or(false) && !clip.is_empty() {
                    let once = clip.clone();
                    while clip.len() < (length * RATE as f64) as usize {
                        clip.extend_from_slice(&once);
                    }
                }
                clip
            }),
        };
        let Some(mut samples) = samples else {
            notes.push(format!("{id}: only generated sound and 16-bit WAV files can be mixed, so it was left out"));
            continue;
        };
        if length > 0.0 {
            samples.truncate((length * RATE as f64) as usize);
        }
        let is_music = event.get("role").and_then(Value::as_str) == Some("music");
        layers.push(Layer {
            samples,
            start: (start * RATE as f64) as usize,
            gain: 10f32.powf(event.get("gainDB").and_then(Value::as_f64).unwrap_or(0.0) as f32 / 20.0),
            fade_in: (seconds(event.get("fadeIn")) * RATE as f64) as usize,
            fade_out: (seconds(event.get("fadeOut")) * RATE as f64) as usize,
            ducked: is_music,
        });
    }
    let duck = duck_under(&voice_pcm, total, RATE);
    let mut mix = voice_pcm;
    mix.resize(total, 0.0);
    for layer in &layers {
        let n = layer.samples.len();
        for (i, s) in layer.samples.iter().enumerate() {
            let at = layer.start + i;
            if at >= total {
                break;
            }
            let mut g = layer.gain;
            if layer.fade_in > 0 {
                g *= (i as f32 / layer.fade_in as f32).min(1.0);
            }
            if layer.fade_out > 0 {
                g *= ((n - i) as f32 / layer.fade_out as f32).min(1.0);
            }
            mix[at] += s * g * if layer.ducked { duck[at] } else { 1.0 };
        }
    }
    for s in mix.iter_mut() {
        *s = soft_limit(*s);
    }
    FilmSound { sound: Some(Sound { mime: "audio/wav".into(), bytes: crate::tts::wav::wav_bytes(&mix, RATE) }), notes }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(v: &[f32]) -> f32 {
        (v.iter().map(|s| s * s).sum::<f32>() / v.len().max(1) as f32).sqrt()
    }

    /// Speech-like audio: a 180 Hz tone from `from` to `to` seconds.
    fn talk(seconds: f32, from: f32, to: f32) -> Vec<f32> {
        (0..(seconds * RATE as f32) as usize)
            .map(|i| {
                let t = i as f32 / RATE as f32;
                if t >= from && t < to { 0.3 * (TAU * 180.0 * t).sin() } else { 0.0 }
            })
            .collect()
    }

    #[test]
    fn voices_are_levelled_and_overlaps_limited_softly() {
        // A quiet and a loud voice (1 s of 220 Hz at 0.05 and 0.6 peak,
        // with a silent half second each side) come out at one speech level.
        let rate = 24000u32;
        let tone = |amp: f32| -> Vec<f32> {
            let mut v = vec![0.0f32; rate as usize / 2];
            v.extend((0..rate).map(|i| amp * (i as f32 * 220.0 * TAU / rate as f32).sin()));
            v.extend(vec![0.0f32; rate as usize / 2]);
            v
        };
        let rms = |v: &[f32]| {
            let speech: Vec<f32> = v.iter().copied().filter(|s| s.abs() > 1e-4).collect();
            (speech.iter().map(|s| s * s).sum::<f32>() / speech.len() as f32).sqrt()
        };
        let (mut quiet, mut loud) = (tone(0.05), tone(0.6));
        level_speech(&mut quiet, rate, 0.1);
        level_speech(&mut loud, rate, 0.1);
        assert!((rms(&loud) - 0.1).abs() < 0.01, "loud voice at {}", rms(&loud));
        // The quiet one is raised by at most +10 dB.
        assert!(rms(&quiet) > 0.1 && rms(&quiet) < 0.12, "quiet voice at {}", rms(&quiet));
        let mut silent = vec![0.0f32; 100];
        level_speech(&mut silent, rate, 0.1);
        assert!(silent.iter().all(|s| *s == 0.0));
        // The limiter is transparent below the knee and never exceeds 1.
        assert_eq!(soft_limit(0.5), 0.5);
        assert!(soft_limit(1.7) < 1.0 && soft_limit(1.7) > 0.95 && soft_limit(-1.7) > -1.0);
        assert!(soft_limit(0.9) < 0.9 && soft_limit(0.9) > soft_limit(0.85));
    }

    #[test]
    fn every_mood_is_music_that_stays_under_a_voice() {
        for mood in MOODS {
            let bed = music(mood, 12.0, 1).unwrap();
            assert_eq!(bed.len(), RATE as usize * 12, "{mood}");
            assert!(bed.iter().all(|s| s.is_finite() && s.abs() < 0.2), "{mood} is too loud for a bed");
            let level = rms(&bed);
            assert!((0.008..0.08).contains(&level), "{mood} sits at {level}");
            // It keeps playing: no second of it is silent, none much louder than the rest.
            for second in bed.chunks(RATE as usize) {
                let here = rms(second);
                assert!(here > level * 0.35 && here < level * 2.5, "{mood}: a second at {here} of {level}");
            }
            // The same mood and seed is the same music; another seed moves the notes.
            assert_eq!(music(mood, 1.0, 1), music(mood, 1.0, 1));
        }
        assert!(music("polka", 1.0, 0).is_none());
    }

    #[test]
    fn a_seed_is_a_different_piece_that_moves_like_a_song() {
        for name in MOODS {
            // Sixteen chords of each of twelve seeds: mostly different
            // pieces, in more than one key and at more than one pace.
            let pieces: Vec<Tune> = (0..12).map(|seed| Tune::new(name, seed).unwrap()).collect();
            let sequences: std::collections::HashSet<Vec<[i32; 3]>> =
                pieces.iter().map(|t| (0..16).map(|i| t.chord(i).map(|n| n as i32)).collect()).collect();
            assert!(sequences.len() >= 8, "{name}: only {} different pieces in 12 seeds", sequences.len());
            assert!(pieces.iter().map(|t| t.transpose).collect::<std::collections::HashSet<_>>().len() >= 3, "{name}: one key for every seed");
            assert!(pieces.iter().map(|t| (t.chord_seconds * 100.0) as i32).collect::<std::collections::HashSet<_>>().len() >= 2, "{name}: one pace for every seed");
            for tune in &pieces {
                // A A B A: the bridge is another progression, and the verse comes back.
                let verse: Vec<_> = (0..4).map(|i| tune.chord(i)).collect();
                assert_eq!((4..8).map(|i| tune.chord(i)).collect::<Vec<_>>(), verse);
                assert_ne!((8..12).map(|i| tune.chord(i)).collect::<Vec<_>>(), verse, "{name}: the bridge repeats the verse");
                assert_eq!((12..16).map(|i| tune.chord(i)).collect::<Vec<_>>(), verse);
                assert!(tune.chord(0).iter().all(|n| (36.0..=84.0).contains(n)), "{name}: a chord out of range");
            }
        }
        // A seed decides it, every time.
        assert_eq!(music("calm", 2.0, 5), music("calm", 2.0, 5));
        assert_ne!(music("calm", 2.0, 5), music("calm", 2.0, 6));
        // The bridge of a calm piece brings notes in over the pad.
        let tune = Tune::new("calm", 0).unwrap();
        let bed = music("calm", tune.chord_seconds * 12.0, 0).unwrap();
        let second = RATE as usize;
        let verse = &bed[(tune.chord_seconds * 1.5) as usize * second..(tune.chord_seconds * 1.5) as usize * second + second];
        let bridge_at = (tune.chord_seconds * 9.5) as usize * second;
        let crossings = |v: &[f32]| v.windows(2).filter(|p| (p[0] < 0.0) != (p[1] < 0.0)).count();
        assert!(crossings(&bed[bridge_at..bridge_at + second]) > crossings(verse), "the bridge is not brighter than the verse");
    }

    #[test]
    fn every_effect_has_its_length_starts_and_ends_quiet() {
        for (kind, seconds) in SOUNDS {
            let fx = sound(kind, 3).unwrap();
            assert_eq!(fx.len(), (seconds * RATE as f32) as usize, "{kind}");
            assert!(fx.iter().all(|s| s.is_finite() && s.abs() <= 1.0), "{kind} clips");
            assert!(rms(&fx) > 0.01, "{kind} is silent");
            // No click at either end.
            assert!(fx[0].abs() < 0.06, "{kind} starts at {}", fx[0]);
            assert!(fx[fx.len() - 1].abs() < 0.06, "{kind} ends at {}", fx[fx.len() - 1]);
        }
        // An impact is low, a tick is high: most of the energy in the first
        // sits below 200 Hz (few zero crossings), in the second far above.
        let crossings = |v: &[f32]| v.windows(2).filter(|p| (p[0] < 0.0) != (p[1] < 0.0)).count() as f32 / (v.len() as f32 / RATE as f32);
        assert!(crossings(&sound("impact", 1).unwrap()[RATE as usize / 5..]) < 400.0);
        assert!(crossings(&sound("tick", 1).unwrap()) > 3000.0);
        assert!(sound("kazoo", 0).is_none());
    }

    #[test]
    fn music_ducks_under_speech_and_comes_back() {
        // Someone talks from 4 s to 8 s of 12.
        let voice = talk(12.0, 4.0, 8.0);
        let gain = duck_under(&voice, voice.len(), RATE);
        assert_eq!(gain.len(), voice.len());
        let at = |seconds: f32| gain[(seconds * RATE as f32) as usize];
        assert!(at(2.0) > 0.98, "open before speech: {}", at(2.0));
        assert!(at(6.0) < 0.4, "ducked under speech: {}", at(6.0));
        assert!(at(9.5) > 0.9, "back after speech: {}", at(9.5));
        // A shorter voice than the film: the tail is open.
        assert!(duck_under(&voice[..RATE as usize], voice.len(), RATE)[voice.len() - 1] > 0.98);
    }

    #[test]
    fn content_types_follow_the_extension() {
        assert_eq!(content_type(Path::new("a/b/narration.wav")), "audio/wav");
        assert_eq!(content_type(Path::new("voice.MP3")), "audio/mpeg");
        assert_eq!(content_type(Path::new("a.caf")), "audio/aiff");
        assert_eq!(content_type(Path::new("blob")), "application/octet-stream");
        assert_eq!(asset_path("media/a.wav", Some(Path::new("/bundle"))), Path::new("/bundle/media/a.wav"));
        assert_eq!(asset_path("/abs/a.wav", Some(Path::new("/bundle"))), Path::new("/abs/a.wav"));
    }

    #[test]
    fn wav_round_trips_and_other_rates_are_brought_to_the_mix() {
        let tone: Vec<f32> = (0..2400).map(|i| 0.5 * (TAU * 440.0 * i as f32 / 24000.0).sin()).collect();
        let (back, rate) = decode_wav(&crate::tts::wav::wav_bytes(&tone, 24000)).unwrap();
        assert_eq!((back.len(), rate), (2400, 24000));
        assert!(back.iter().zip(&tone).all(|(a, b)| (a - b).abs() < 1e-3));
        // 0.1 s at 24 kHz is 0.1 s at 48 kHz, the same tone.
        let up = to_mix_rate(back, rate);
        assert_eq!(up.len(), 4800);
        assert!((rms(&up) - rms(&tone)).abs() < 0.01);
        assert!(decode_wav(b"RIFF\x00\x00\x00\x00WAVE").is_none());
        assert!(decode_wav(b"ID3\x03not a wav at all").is_none());
    }

    /// A project with a 3 s narration, as synthesize_speech leaves it.
    fn narrated() -> crate::edits::Document {
        let mut doc = crate::edits::Document::new(crate::server::blank_project("sound", true));
        let wav = crate::tts::wav::wav_bytes(&talk(3.0, 0.5, 2.0), RATE);
        let mut root = doc.project().root.clone();
        let asset = Value::parse(&format!(
            r#"{{"id": "ast_tr", "kind": "audio", "duration": {{"timescale": 1000, "value": 3000}}, "source": {{"dataUri": "data:audio/wav;base64,{}"}}}}"#,
            crate::render::base64_encode(&wav)
        ))
        .unwrap();
        root.set("assets", Value::Array(vec![asset]));
        let event = Value::parse(r#"{"assetId": "ast_tr", "id": "aud_narration_tr", "role": "voice", "start": {"timescale": 1, "value": 0}, "duration": {"timescale": 1000, "value": 3000}}"#).unwrap();
        for track in root.get_mut("tracks").and_then(Value::as_array_mut).unwrap() {
            if track.get("role").and_then(Value::as_str) == Some("voice") {
                track.set("audioEvents", Value::Array(vec![event.clone()]));
            }
        }
        doc.project_mut().root = root;
        doc
    }

    #[test]
    fn the_film_track_is_the_narration_until_music_and_effects_are_added() {
        let mut doc = narrated();
        // Narration alone is served as recorded, byte for byte.
        let plain = film_sound(doc.project(), None, 5.0);
        let recorded = plain.sound.unwrap();
        assert_eq!(recorded.mime, "audio/wav");
        assert_eq!(decode_wav(&recorded.bytes).unwrap().0.len(), RATE as usize * 3);
        assert!(plain.notes.is_empty());

        // Music for the whole film and a pop at 4 s, past the end of the voice.
        let op = |tool: &str, json: &str| crate::edits::EditOp::new(tool, Value::parse(json).unwrap());
        doc.apply_edits(None, None, &[op("add_music", r#"{"mood": "wonder"}"#), op("add_sound", r#"{"kind": "pop", "start": {"seconds": 4}}"#)]).unwrap();
        let mixed = film_sound(doc.project(), None, 5.0);
        assert!(mixed.notes.is_empty(), "{:?}", mixed.notes);
        let (track, rate) = decode_wav(&mixed.sound.unwrap().bytes).unwrap();
        assert_eq!((track.len(), rate), (RATE as usize * 5, RATE), "the track runs the film's length, not the voice's");
        let sec = |a: f32, b: f32| &track[(a * RATE as f32) as usize..(b * RATE as f32) as usize];
        assert!(rms(sec(1.0, 1.8)) > 0.15, "the voice is there");
        let open = rms(sec(3.3, 3.9));
        assert!(open > 0.005 && open < 0.1, "music alone after the voice: {open}");
        assert!(rms(sec(4.0, 4.1)) > open * 2.0, "the pop stands out of the music");
        assert!(track[0].abs() < 1e-3 && rms(sec(4.9, 5.0)) < open * 0.5, "music fades in and out");
        assert!(track.iter().all(|s| s.abs() <= 1.0));

        // Muting the music track takes the music out and leaves the pop.
        let mut root = doc.project().root.clone();
        for track in root.get_mut("tracks").and_then(Value::as_array_mut).unwrap() {
            if track.get("role").and_then(Value::as_str) == Some("music") {
                track.set("isMuted", Value::Bool(true));
            }
        }
        doc.project_mut().root = root;
        let (quiet, _) = decode_wav(&film_sound(doc.project(), None, 5.0).sound.unwrap().bytes).unwrap();
        assert!(rms(&quiet[(3.3 * RATE as f32) as usize..(3.9 * RATE as f32) as usize]) < 1e-4);
        assert!(rms(&quiet[4 * RATE as usize..(4.1 * RATE as f32) as usize]) > 0.02);
    }
}
