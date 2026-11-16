//! The embedded MCP server — the Rust alternative's version of the role the
//! Swift app plays: hosting the tool surface agents connect to. Same wire
//! protocol (Streamable HTTP, Bearer token, session id, JSON or SSE), the
//! document-local tool set implemented on [`crate::edits`] and
//! [`crate::reads`], and the `ready.json` first line `screenwords-server`
//! prints (`{"port","project","token","url"}`).

use crate::edits::{Document, EditOp, EditError};
use crate::httpd::{self, Request, Response};
use crate::json::Value;
use crate::mcp::PROTOCOL_VERSION;
use crate::project::Project;
use crate::reads;
use std::io::{Read, Write};
use std::net::ToSocketAddrs;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct McpServer {
    pub document: std::sync::Arc<Mutex<Document>>,
    /// When set, every committed change is written back to
    /// `<bundle>/project.json` + `revision.json`, like the app.
    pub bundle_path: Option<std::path::PathBuf>,
    pub token: String,
    session_id: String,
}

/// A blank 9:16 project, like `screenwords-server --create --blank --format 9:16`.
pub fn blank_project(name: &str, vertical: bool) -> Project {
    let (width, height) = if vertical { (1080, 1920) } else { (1920, 1080) };
    let mut root = Value::obj();
    root.set("analysis", Value::parse(r#"{"audio":[],"masks":[],"scenes":[]}"#).unwrap());
    root.set("assets", Value::Array(Vec::new()));
    root.set("id", Value::str("prj_blank001"));
    root.set("name", Value::str(name));
    root.set("schemaVersion", Value::Int(2));
    let mut settings = Value::obj();
    settings.set("audioSampleRate", Value::Int(48000));
    settings.set("frameRate", Value::parse(r#"{"denominator":1,"numerator":30}"#).unwrap());
    settings.set("hdrPolicy", Value::str("toneMapToSDR"));
    settings.set(
        "loudness",
        Value::parse(r#"{"integratedLUFS":-14,"normalizeOnExport":true,"truePeakDBTP":-1}"#).unwrap(),
    );
    settings.set(
        "outputColor",
        Value::parse(
            r#"{"bitDepth":8,"fullRange":false,"matrix":"bt709","primaries":"bt709","transfer":"bt709"}"#,
        )
        .unwrap(),
    );
    settings.set(
        "resolution",
        Value::parse(&format!(r#"{{"height":{height},"width":{width}}}"#)).unwrap(),
    );
    settings.set("targetDuration", Value::parse(r#"{"timescale":30,"value":300}"#).unwrap());
    root.set("settings", settings);
    let mut tracks = Vec::new();
    let track_specs = [
        ("video", "Video", None),
        ("overlay", "Scenes", Some("scenes")),
        ("overlay", "Overlays", None),
        ("caption", "Captions", None),
        ("audio", "Voice", Some("voice")),
        ("audio", "Music", Some("music")),
        ("audio", "SFX", Some("sfx")),
    ];
    for (n, (kind, name, role)) in track_specs.iter().enumerate() {
        let mut t = Value::obj();
        t.set("audioEvents", Value::Array(Vec::new()));
        t.set("clips", Value::Array(Vec::new()));
        t.set("components", Value::Array(Vec::new()));
        t.set("id", Value::str(&format!("trk_blank{n}")));
        t.set("isHidden", Value::Bool(false));
        t.set("isMuted", Value::Bool(false));
        t.set("kind", Value::str(kind));
        t.set("name", Value::str(name));
        if let Some(r) = role {
            t.set("role", Value::str(r));
        }
        tracks.push(t);
    }
    root.set("tracks", Value::Array(tracks));
    root.set("transcripts", Value::Array(Vec::new()));
    root.set("wordCounter", Value::Int(0));
    Project::parse(&root.to_string()).unwrap().with_revision(1)
}

struct ToolSpec {
    name: &'static str,
    description: &'static str,
}

/// The arguments of a tool as JSON-schema properties, so an MCP client shows
/// (and a model fills) the right fields instead of guessing from the prose.
fn tool_properties(name: &str) -> &'static str {
    match name {
        "get_transcript" => r#"{"start": {"type": "number", "description": "window start, seconds"}, "end": {"type": "number", "description": "window end, seconds"}, "segmentId": {"type": "string"}}"#,
        "find_in_transcript" => r#"{"query": {"type": "string", "description": "a phrase"}, "queries": {"type": "array", "items": {"type": "string"}}, "kind": {"type": "string", "enum": ["number", "filler", "pause"]}}"#,
        "list_components" => r#"{"componentId": {"type": "string", "description": "one id: what it draws and every param its renderer reads, with defaults"}, "category": {"type": "string", "description": "only this category: title | caption | graphic | background | transform | effect | transition | lottie | scene"}}"#,
        "export_subtitles" => r#"{"format": {"type": "string", "enum": ["srt", "vtt"]}, "maxChars": {"type": "number"}}"#,
        "get_history" => r#"{"limit": {"type": "number"}}"#,
        "apply_edits" => r#"{"edits": {"type": "array", "description": "in order, all or nothing", "items": {"type": "object", "properties": {"tool": {"type": "string", "description": "add_component | update_component | remove_component | add_music | add_sound | update_audio | remove_audio | set_project_settings | set_theme | add_chapter | cut_range | ..."}, "arguments": {"type": "object", "description": "add_component: {componentId, start, end | duration, params, zIndex?, keyframes?, ref?}; start / end are {seconds} or {wordId, edge?, offset?}. update_component: {instanceId, params (merge patch), start?, end?}. remove_component: {instanceId}. add_music: {mood: calm | wonder | drive, gainDB?, start?, duration?} (to the end of the film, ducked under speech). add_sound: {kind: whoosh | impact | pop | rise | tick | shimmer, start: {seconds} | {wordId}, gainDB?}. update_audio / remove_audio: {eventId, ...}."}}, "required": ["tool", "arguments"]}}, "label": {"type": "string", "description": "the undo step's name"}, "ifRevision": {"type": "number"}}"#,
        "author_transcript" => r#"{"text": {"type": "string", "description": "the narration"}, "turns": {"type": "array", "description": "a conversation instead of text", "items": {"type": "object", "properties": {"speaker": {"type": "string"}, "text": {"type": "string"}, "gap": {"type": "number"}}}}, "language": {"type": "string", "description": "e.g. tr, en"}}"#,
        "set_theme" => r#"{"preset": {"type": "string", "enum": ["midnight", "editorial", "meadow", "noir", "candy", "sunset", "glacier"]}, "paper": {"type": "string"}, "ink": {"type": "string"}, "accent": {"type": "string"}, "accent2": {"type": "string"}, "accentInk": {"type": "string"}}"#,
        "synthesize_speech" => r#"{"lang": {"type": "string", "description": "e.g. tr, en"}, "text": {"type": "string", "description": "instead of the transcript"}, "voice": {"type": "string"}, "voices": {"type": "object", "description": "{speakerId: voice}"}, "seed": {"type": "number"}, "rate": {"type": "number", "description": "0.6 (slow) to 1.5 (brisk); 1 = calm narration"}, "bed": {"type": "string", "enum": ["calm", "wonder", "drive"], "description": "music under the speech"}}"#,
        "find_background" => r#"{"query": {"type": "string"}, "url": {"type": "string"}, "file": {"type": "string"}, "provider": {"type": "string", "enum": ["unsplash", "pexels"]}, "motion": {"type": "string"}, "atmosphere": {"type": "string"}, "grade": {"type": "string"}, "start": {"type": "number"}, "duration": {"type": "number"}}"#,
        "preview_frames" => r#"{"times": {"type": "array", "items": {"type": "number"}, "description": "seconds on the timeline; omit to look once inside every distinct stretch of the film (at most 12)"}, "scale": {"type": "number", "description": "0.1-1 of the frame size; chosen to fit the sheet when omitted"}}"#,
        "import_image" => r#"{"page": {"type": "string", "description": "an http(s) page to screenshot"}, "url": {"type": "string", "description": "an image URL"}, "file": {"type": "string", "description": "a local image path"}, "name": {"type": "string", "description": "the file name to keep it under"}, "width": {"type": "number", "description": "page: viewport width, CSS px (default 1280)"}, "height": {"type": "number", "description": "page: viewport height (default 800)"}, "scale": {"type": "number", "description": "page: device pixels per CSS px, 1-3 (default 2)"}, "wait": {"type": "number", "description": "page: ms to wait after load (default 1200)"}, "full": {"type": "boolean", "description": "page: the whole page, not the first screen"}}"#,
        "undo" => r#"{"expectLabel": {"type": "string"}}"#,
        _ => "{}",
    }
}

const TOOLS: &[ToolSpec] = &[
    ToolSpec { name: "get_project", description: "Project summary: settings, revision, assets, tracks with clips/components/audio, undo state." },
    ToolSpec { name: "get_transcript", description: "Transcript words with ids and times; a window or segmentId on long videos." },
    ToolSpec { name: "find_in_transcript", description: "Phrase search (case/diacritic-insensitive) or kind sweeps: number | filler | pause." },
    ToolSpec { name: "list_components", description: "The built-in component catalog (id, category, what it draws; category? narrows it), design (how to design a film scene by scene — read it first) and howTo for characters and conversations; componentId? returns that component's params." },
    ToolSpec { name: "list_chapters", description: "Chapters in timeline order with the YouTube description and issues." },
    ToolSpec { name: "list_notes", description: "The user's timeline notes." },
    ToolSpec { name: "export_subtitles", description: "SRT / WebVTT of the edited transcript (<= 2 lines, 1-7 s cues)." },
    ToolSpec { name: "get_history", description: "Undo / redo steps newest first: label, by, revision." },
    ToolSpec { name: "apply_edits", description: "Several edit tools as ONE atomic undo step; edits [{tool, arguments}] (<= 200), label?, ifRevision?. Tools include add_component / update_component / remove_component, add_music {mood} / add_sound {kind, start} (generated sound, mixed into the film's one track with the narration) and set_project_settings {name?, width?, height?, fps?, cast? {name: character | null}} — the cast is the project's characters (see list_components howTo)." },
    ToolSpec { name: "author_transcript", description: "From-zero authoring: create the transcript from plain text (or turns [{speaker, text, gap?}] for a conversation; a negative gap overlaps the previous turn) with TTS-like timing (the stand-in for the TTS job)." },
    ToolSpec { name: "set_theme", description: "Set the project's visual theme (document data, not engine defaults): preset? (midnight | editorial | meadow | noir | candy | sunset | glacier) and/or overrides paper/ink/accent/accent2/accentInk (hex) and bg.{style} color arrays. Component colour params still win over the theme." },
    ToolSpec { name: "synthesize_speech", description: "On-device TTS (ONNX): speak the transcript (or text?) in lang, voice?, seed?, rate? (0.6 slow to 1.5 brisk; 1, the default, is calm narration for every voice — the text is spoken sentence by sentence with a breath after each, and captions are re-timed onto the voice; the result reports sentences, wordsPerMinute while speaking and pauseSeconds in total); writes a WAV asset into the bundle, places it on the Voice track and fits the project duration. English uses Phonon and Turkish EMA unless a Supertonic voice is chosen; Supertonic 3 covers 31 languages with voices M1-M5 / F1-F5 (voices? {speakerId: voice} speaks a transcript authored with turns in one voice per speaker, levelled to one loudness; bed? calm | wonder | drive adds that music under the speech, as apply_edits add_music does): en ko ja ar bg cs da de el es et fi fr hi hr hu id it lt lv nl pl pt ro ru sk sl sv tr uk vi (anything else falls back to <na>)." },
    ToolSpec { name: "find_background", description: "Place a real photo behind the story as a full-frame, moving background. Providers: unsplash (Unsplash License, commercial use, no attribution required) or pexels; a query is searched with UNSPLASH_ACCESS_KEY / PEXELS_API_KEY in the environment. Or pass url (an image URL) or file (a local image path). The image is embedded as a data URI and animated: motion kenburns | zoomin | zoomout | panleft | panright | drift | parallax | ripple | pulse, atmosphere sheen | rain | snow | dust | embers | bokeh | rays | fog | none, grade dark | warm | cool | violet | green | light | none. Motion and atmosphere are inferred from the query when omitted." },
    ToolSpec { name: "export_html", description: "Write the self-contained HTML5 player next to the project (<name>.html): plays anywhere, narration embedded. Returns path, bytes, durationSeconds." },
    ToolSpec { name: "render_video", description: "Render the project to MP4 next to it (<name>.mp4): every frame drawn deterministically at the project fps by headless Chrome, encoded by ffmpeg with the narration. Takes about the video's length or longer; one render at a time. Returns path, bytes, durationSeconds." },
    ToolSpec { name: "preview_frames", description: "LOOK at the film before rendering it: draws moments exactly as render_video would and returns sheet (one PNG with every moment side by side, each under its time — open it), frames [{time, path, components [{id, componentId, box}]}], problems (a component runs off the frame or sits against its edge — unless its params say bleed: true — painted nothing, or threw; read from the pixels each component really painted) and overlaps (two placed components covering each other). times? [seconds]; without it, one moment inside every distinct stretch of the film. A few seconds per call: check after every round of edits, fix, look again." },
    ToolSpec { name: "import_image", description: "Bring a picture into the project: page (an http(s) URL — a screenshot of the real page, width? x height? CSS px at scale? 2, full? for the whole page), url (an image URL) or file (a local image). Saved under media/ in the project; returns src (e.g. media/home.png) for imageOverlay {src} or, in a code overlay, sw.image(ctx, params.image, x, y, w, h, {radius, fit, focus, zoom})." },
    ToolSpec { name: "undo", description: "One undo step; expectLabel? refuses unless the step has this label." },
    ToolSpec { name: "redo", description: "One redo step." },
];

/// The server's own `SCREENWORDS_MCP_TOKEN`: unset or blank means "draw a
/// random token"; otherwise it must be 16-128 characters of `A-Z a-z 0-9 - _`
/// (it is printed inside the ready line and compared with the Bearer header).
pub fn fixed_token(value: Option<&str>) -> Result<Option<String>, String> {
    let Some(token) = value.map(str::trim).filter(|t| !t.is_empty()) else {
        return Ok(None);
    };
    let ok_chars = token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !(16..=128).contains(&token.len()) || !ok_chars {
        return Err("SCREENWORDS_MCP_TOKEN must be 16-128 characters of A-Z a-z 0-9 - _".into());
    }
    Ok(Some(token.to_string()))
}

impl McpServer {
    pub fn new(document: Document) -> (Arc<McpServer>, String) {
        Self::new_shared(std::sync::Arc::new(Mutex::new(document)), None)
    }

    pub fn new_shared(
        document: std::sync::Arc<Mutex<Document>>,
        bundle_path: Option<std::path::PathBuf>,
    ) -> (Arc<McpServer>, String) {
        Self::new_with_token(document, bundle_path, None)
    }

    /// Like `new_shared`, with the Bearer token chosen by the caller: `Some`
    /// (already checked by `fixed_token`) stays the same across restarts, so
    /// an MCP client configured once keeps working; `None` draws a fresh one.
    pub fn new_with_token(
        document: std::sync::Arc<Mutex<Document>>,
        bundle_path: Option<std::path::PathBuf>,
        fixed: Option<String>,
    ) -> (Arc<McpServer>, String) {
        // Token: 32 hex chars of entropy, printed in ready.json.
        let mut seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x51ED270B)
            ^ (std::process::id() as u64) << 32;
        let mut token = String::new();
        for _ in 0..32 {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            token.push(format!("{:x}", seed % 16).chars().next().unwrap());
        }
        let session_id = format!("sess-{:016x}", seed);
        let server = Arc::new(McpServer {
            document,
            bundle_path,
            token: fixed.unwrap_or(token),
            session_id,
        });
        let ready = serde_ready(&server);
        (server, ready)
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }
}

/// One spoken segment of a multi-speaker transcript.
struct Turn {
    /// The words with their punctuation.
    text: String,
    voice: String,
    speaker: String,
    /// The authored pause before the segment (negative overlaps), if any.
    gap: Option<f64>,
}

/// The segments of a transcript authored with turns, each with the voice
/// its speaker maps to. Empty when no word carries a speaker.
fn speaker_segments(p: &crate::project::Project, voices: &Value, fallback: &str) -> Vec<Turn> {
    let Some(t) = p.transcripts().first() else { return Vec::new() };
    let words = t.get("words").and_then(Value::as_array).unwrap_or(&[]);
    if !words.iter().any(|w| w.get("speaker").is_some()) {
        return Vec::new();
    }
    let by_id: std::collections::HashMap<&str, &Value> =
        words.iter().filter_map(|w| Some((w.get("id")?.as_str()?, w))).collect();
    let mut out = Vec::new();
    for seg in t.get("segments").and_then(Value::as_array).unwrap_or(&[]) {
        let ids = seg.get("wordIds").and_then(Value::as_array).unwrap_or(&[]);
        let ws: Vec<&Value> = ids.iter().filter_map(|id| by_id.get(id.as_str()?).copied()).collect();
        let text = ws.iter().filter_map(|w| w.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join(" ");
        let speaker = ws
            .first()
            .and_then(|w| w.get("speaker"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let voice = voices.get(&speaker).and_then(Value::as_str).unwrap_or(fallback).to_string();
        let gap = seg.get("gap").and_then(|g| g.as_f64().or_else(|| g.as_i64().map(|v| v as f64)));
        out.push(Turn { text, voice, speaker, gap });
    }
    out
}

/// The pause before a segment when the script gives none, the way people
/// take turns: a short breath inside a turn; between speakers an answer
/// follows a question quickly and other replies a little later, varied so
/// the rhythm never sounds metronomic.
fn natural_gap(index: usize, prev: Option<&Turn>, this: &Turn) -> f64 {
    let Some(prev) = prev else { return 0.0 };
    if prev.speaker == this.speaker {
        return 0.16;
    }
    let base = if prev.text.trim_end().ends_with('?') { 0.2 } else { 0.32 };
    // Deterministic jitter in [-0.08, 0.08] from the segment index.
    let h = (index as u32).wrapping_mul(2_654_435_761) >> 16;
    base + (h % 1000) as f64 / 1000.0 * 0.16 - 0.08
}

/// Speak each segment in its own voice and lay them on one track: the
/// model's leading and trailing near-silence is trimmed, every clip is
/// levelled to one speech loudness, segments follow with their authored or
/// natural gap, and an overlapping one (negative gap) is mixed over the
/// previous voice through a soft limiter. Returns each segment's
/// `(start, duration)` window like a chunked backend does.
fn synthesize_turns(
    lang: &str,
    turns: &[Turn],
    seed: u32,
    pace: crate::tts::Pace,
) -> Result<(crate::tts::Audio, crate::tts::ChunkWindows), String> {
    let mut samples: Vec<f32> = Vec::new();
    let mut rate = 0u32;
    let mut windows = Vec::new();
    let mut cursor = 0.0f64;
    for (i, turn) in turns.iter().enumerate() {
        let audio = crate::tts::synthesize(lang, &turn.text, &turn.voice, seed, pace)?;
        if rate == 0 {
            rate = audio.rate;
        } else if audio.rate != rate {
            return Err(format!("voice '{}' speaks at {} Hz, the others at {rate} Hz", turn.voice, audio.rate));
        }
        let r = rate as f64;
        let dur = audio.samples.len() as f64 / r;
        let (a, b) = speech_span(&audio.samples, rate, 0.0, dur);
        let a = (a - 0.03).max(0.0);
        let b = (b + 0.06).min(dur);
        let mut clip = audio.samples[(a * r) as usize..((b * r) as usize).max((a * r) as usize)].to_vec();
        crate::audio::level_speech(&mut clip, rate, 0.1);
        let gap = turn.gap.unwrap_or_else(|| natural_gap(i, i.checked_sub(1).map(|j| &turns[j]), turn));
        let start = if i == 0 { 0.0 } else { (cursor + gap).max(0.0) };
        let s0 = (start * r) as usize;
        if samples.len() < s0 + clip.len() {
            samples.resize(s0 + clip.len(), 0.0);
        }
        for (k, v) in clip.iter().enumerate() {
            samples[s0 + k] += v;
        }
        let len = clip.len() as f64 / r;
        windows.push((start, len));
        cursor = cursor.max(start + len);
    }
    for s in samples.iter_mut() {
        *s = crate::audio::soft_limit(*s);
    }
    Ok((crate::tts::Audio { samples, rate: rate.max(1) }, windows))
}

/// The spoken part of a TTS chunk window: an energy-based trim of the
/// near-silence the model emits before and after the sentence. 20 ms
/// analysis frames; a frame counts as speech when its peak passes 6% of the
/// chunk's own peak, so a quiet voice trims as tightly as a loud one.
fn speech_span(samples: &[f32], rate: u32, wa: f64, wd: f64) -> (f64, f64) {
    let rate = rate as usize;
    let a = ((wa * rate as f64) as usize).min(samples.len());
    let b = (((wa + wd) * rate as f64) as usize).min(samples.len());
    if a >= b {
        return (wa, wa + wd);
    }
    let win = (rate / 50).max(1);
    let peak = samples[a..b].iter().fold(0.0f32, |m, s| m.max(s.abs()));
    let thresh = peak * 0.06;
    let n = (b - a) / win;
    let loud = |i: usize| {
        let s = a + i * win;
        let e = (s + win).min(b);
        samples[s..e].iter().fold(0.0f32, |m, x| m.max(x.abs())) > thresh
    };
    let first = (0..n).find(|&i| loud(i));
    let last = (0..n).rev().find(|&i| loud(i));
    match (first, last) {
        (Some(f), Some(l)) if l > f => (
            wa + f as f64 * win as f64 / rate as f64,
            wa + (l + 1) as f64 * win as f64 / rate as f64,
        ),
        _ => (wa, wa + wd),
    }
}

fn serde_ready(server: &McpServer) -> String {    // The ready.json first line the scripts expect.
    format!(
        "{{\"port\":__PORT__,\"project\":{{\"name\":\"{}\"}},\"token\":\"{}\",\"url\":\"http://127.0.0.1:__PORT__/mcp\"}}",
        server.document.lock().unwrap().project().name().replace('"', "\\\""),
        server.token
    )
}

fn rpc_ok(id: &Value, result: Value) -> String {
    let mut r = Value::obj();
    r.set("jsonrpc", Value::str("2.0"));
    r.set("id", id.clone());
    r.set("result", result);
    r.to_string()
}

fn rpc_error(id: &Value, code: i64, message: &str) -> String {
    let mut r = Value::obj();
    r.set("jsonrpc", Value::str("2.0"));
    r.set("id", id.clone());
    let mut e = Value::obj();
    e.set("code", Value::Int(code));
    e.set("message", Value::str(message));
    r.set("error", e);
    r.to_string()
}

/// Handles one HTTP request against the MCP endpoint (JSON responses; SSE not
/// needed for single answers).
pub fn handle_mcp(server: &Arc<McpServer>, request: &Request) -> Response {
    if request.path != "/mcp" {
        return Response::text(404, "not found");
    }
    if request.method != "POST" {
        return Response::text(405, "POST only");
    }
    let auth = request.header("authorization").unwrap_or("");
    let Some(token) = auth.strip_prefix("Bearer ").map(str::trim) else {
        return Response::text(401, "missing or invalid Authorization: Bearer token");
    };
    if token != server.token {
        return Response::text(403, "HTTP 403: check the token / URL");
    }
    let body = match String::from_utf8(request.body.clone()).ok().and_then(|s| Value::parse(&s).ok()) {
        Some(v) => v,
        None => return Response::text(400, "Bad Request: body is not JSON-RPC"),
    };
    let id = body.get("id").cloned().unwrap_or(Value::Null);
    let Some(method) = body.get("method").and_then(Value::as_str).map(str::to_string) else {
        return Response::json(200, rpc_error(&id, -32600, "not a JSON-RPC request"));
    };
    let params = body.get("params").cloned().unwrap_or_else(Value::obj);

    match method.as_str() {
        "initialize" => {
            let mut info = Value::obj();
            info.set("name", Value::str("screenwords"));
            info.set("version", Value::str(crate::VERSION));
            let mut result = Value::obj();
            result.set("protocolVersion", Value::str(PROTOCOL_VERSION));
            result.set("capabilities", Value::obj());
            result.set("serverInfo", info);
            let mut response = Response::json(200, rpc_ok(&id, result));
            response
                .extra_headers
                .push(("Mcp-Session-Id".into(), server.session_id().to_string()));
            response
        }
        "ping" => Response::json(200, rpc_ok(&id, Value::obj())),
        "notifications/initialized" | "notifications/cancelled" => Response::json(202, String::new()),
        "tools/list" => {
            let tools: Vec<Value> = TOOLS
                .iter()
                .map(|t| {
                    let mut o = Value::obj();
                    o.set("name", Value::str(t.name));
                    o.set("description", Value::str(t.description));
                    let mut schema = Value::obj();
                    schema.set("type", Value::str("object"));
                    schema.set("properties", Value::parse(tool_properties(t.name)).unwrap_or_else(|_| Value::obj()));
                    o.set("inputSchema", schema);
                    o
                })
                .collect();
            let mut result = Value::obj();
            result.set("tools", Value::Array(tools));
            Response::json(200, rpc_ok(&id, result))
        }
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            let arguments = params.get("arguments").cloned().unwrap_or_else(Value::obj);
            let mut doc = server.document.lock().unwrap();
            match call_tool(server, &mut doc, &name, &arguments) {
                Ok(result) => {
                    let mut r = Value::obj();
                    r.set("isError", Value::Bool(false));
                    r.set(
                        "content",
                        Value::Array(vec![{
                            let mut c = Value::obj();
                            c.set("type", Value::str("text"));
                            c.set("text", Value::str(&result.to_string_pretty(false)));
                            c
                        }]),
                    );
                    Response::json(200, rpc_ok(&id, r))
                }
                Err(e) => {
                    let mut r = Value::obj();
                    r.set("isError", Value::Bool(true));
                    let mut err = Value::obj();
                    err.set("error", Value::str(e.code()));
                    err.set("message", Value::str(&e.message()));
                    r.set(
                        "content",
                        Value::Array(vec![{
                            let mut c = Value::obj();
                            c.set("type", Value::str("text"));
                            c.set("text", Value::str(&err.to_string_pretty(false)));
                            c
                        }]),
                    );
                    Response::json(200, rpc_ok(&id, r))
                }
            }
        }
        other => Response::json(200, rpc_error(&id, -32601, &format!("unknown method {other}"))),
    }
}

/// The document-local tool dispatch (single-edit tools route through
/// `apply_edits` so every change is one undo step, like the app).
///
/// `pub(crate)` because the web editor's `/api/synthesize` drives the same
/// tool: one implementation of narration for MCP and the UI.
pub(crate) fn call_tool(server: &McpServer, doc: &mut Document, name: &str, args: &Value) -> Result<Value, EditError> {
    match name {
        "get_project" => Ok(project_summary(doc)),
        "get_transcript" => reads::get_transcript(doc.project(), args),
        "find_in_transcript" => reads::find_in_transcript(doc.project(), args),
        "list_chapters" => Ok(reads::list_chapters(doc.project())),
        "list_notes" => {
            let include = args.get("includeResolved").and_then(Value::as_bool).unwrap_or(false);
            Ok(reads::list_notes(doc.project(), include))
        }
        "export_subtitles" => reads::export_subtitles(doc.project(), args),
        "get_history" => Ok(reads::get_history(doc, args.get("limit").and_then(Value::as_i64).map(|l| l as usize))),
        "export_html" | "render_video" => {
            let Some(base) = server.bundle_path.clone() else {
                return Err(EditError::Validation {
                    path: "project".into(),
                    message: "exporting needs an on-disk project (screenwords app or screenwords mcp <bundle>)".into(),
                });
            };
            let project = doc.project().clone();
            let out = if name == "export_html" {
                crate::ui::export_player(&project, &base)
            } else {
                crate::ui::render_video(&project, &base)
            };
            out.map_err(|message| EditError::Validation { path: "project".into(), message })
        }
        "preview_frames" | "import_image" => {
            let Some(base) = server.bundle_path.clone() else {
                return Err(EditError::Validation {
                    path: "project".into(),
                    message: "this needs an on-disk project (screenwords app <project>)".into(),
                });
            };
            let out = if name == "preview_frames" {
                crate::preview::preview_frames(doc.project(), &base, args)
            } else {
                crate::preview::import_image(&base, args, &|url| fb_fetch(url, &[]).map_err(|e| e.message()))
            };
            out.map_err(|message| EditError::Validation { path: name.to_string(), message })
        }
        "list_components" => {
            if let Some(id) = args.get("componentId").and_then(Value::as_str) {
                if !crate::catalog::exists(id) {
                    return Err(EditError::NotFound { path: "componentId".into(), message: crate::catalog::not_found_message(id) });
                }
                return Ok(crate::catalog::describe(id));
            }
            let only = args.get("category").and_then(Value::as_str);
            let mut items = Vec::new();
            for id in crate::catalog::all_ids() {
                let category = crate::catalog::category_of(id).unwrap_or("other");
                if only.is_some_and(|c| c != category) {
                    continue;
                }
                let mut o = Value::obj();
                o.set("componentId", Value::str(id));
                o.set("category", Value::str(category));
                if let Some(draws) = crate::catalog::draws(id) {
                    o.set("draws", Value::str(draws));
                }
                items.push(o);
            }
            let mut r = Value::obj();
            r.set("components", Value::Array(items));
            r.set("design", Value::str(crate::catalog::DESIGN_HOW_TO));
            r.set("howTo", Value::str(crate::catalog::HOW_TO));
            Ok(r)
        }
        "author_transcript" => {
            let result = doc.apply_edits(
                Some("author_transcript"),
                args.get("ifRevision").and_then(Value::as_i64).map(|r| r as u64),
                &[EditOp::new("author_transcript", args.clone())],
            )?;
            persist(server, doc);
            let mut r = Value::obj();
            r.set("revision", Value::Int(result.revision as i64));
            Ok(r)
        }
        "apply_edits" => {
            let edits: Vec<EditOp> = args
                .get("edits")
                .and_then(Value::as_array)
                .ok_or_else(|| EditError::Validation { path: "edits".into(), message: "required".into() })?
                .iter()
                .map(|e| {
                    EditOp::new(
                        e.get("tool").and_then(Value::as_str).unwrap_or(""),
                        e.get("arguments").cloned().unwrap_or_else(Value::obj),
                    )
                })
                .collect();
            let label = args.get("label").and_then(Value::as_str);
            let if_revision = args.get("ifRevision").and_then(Value::as_i64).map(|r| r as u64);
            let result = doc.apply_edits(label, if_revision, &edits)?;
            persist(server, doc);
            let mut r = Value::obj();
            r.set("revision", Value::Int(result.revision as i64));
            r.set(
                "createdIds",
                Value::Array(result.created_ids.iter().map(|(n, id)| {
                    let mut pair = Value::obj();
                    pair.set(n.as_str(), Value::str(id));
                    pair
                }).collect()),
            );
            // Every id the batch made, in edit order, so a follow-up
            // update_component / remove_component needs no ref and no re-read.
            r.set(
                "created",
                Value::Array(result.created.iter().map(|(index, tool, id)| {
                    let mut one = Value::obj();
                    one.set("edit", Value::Int(*index as i64));
                    one.set("tool", Value::str(tool));
                    one.set("id", Value::str(id));
                    one
                }).collect()),
            );
            if !result.removed_ids.is_empty() {
                r.set(
                    "removedIds",
                    Value::Array(result.removed_ids.iter().map(|id| Value::str(id)).collect()),
                );
            }
            if !result.warnings.is_empty() {
                r.set("warnings", Value::Array(result.warnings.iter().map(|w| Value::str(w)).collect()));
            }
            Ok(r)
        }
        "set_theme" => {
            doc.apply_edits(Some("set_theme"), None, &[EditOp::new("set_theme", args.clone())])?;
            persist(server, doc);
            let mut applied = doc
                .project()
                .root
                .get("settings")
                .and_then(|s| s.get("theme"))
                .cloned()
                .unwrap_or_else(Value::obj);
            applied.set("revision", Value::Int(doc.revision() as i64));
            Ok(applied)
        }
        "synthesize_speech" => {
            let lang = args.get("lang").and_then(Value::as_str).unwrap_or("en").to_string();
            let voice = args.get("voice").and_then(Value::as_str).unwrap_or("easton").to_string();
            let seed = args.get("seed").and_then(Value::as_i64).unwrap_or(42) as u32;
            let pace = match args.get("rate").and_then(|r| r.as_f64().or_else(|| r.as_i64().map(|n| n as f64))) {
                Some(rate) => crate::tts::Pace::new(rate).map_err(|message| EditError::Validation { path: "rate".into(), message })?,
                None => crate::tts::Pace::NARRATION,
            };
            // bed: a quiet music bed under the speech — the generated music
            // add_music places ('ambient' is the calm mood), checked before
            // the minutes of synthesis rather than after.
            let bed = args.get("bed").and_then(Value::as_str).map(|b| if b == "ambient" { "calm" } else { b });
            if let Some(mood) = bed.filter(|m| !crate::audio::MOODS.contains(m)) {
                return Err(EditError::Validation { path: "bed".into(), message: format!("'{mood}' is not a mood (one of: {})", crate::audio::MOODS.join(", ")) });
            }
            let text = match args.get("text").and_then(Value::as_str) {
                Some(t) => t.to_string(),
                None => {
                    let p = doc.project();
                    let mut words: Vec<String> = Vec::new();
                    for t in p.transcripts() {
                        for w in t.get("words").and_then(Value::as_array).unwrap_or(&Vec::new()) {
                            if let Some(x) = w.get("text").and_then(Value::as_str) {
                                words.push(x.to_string());
                            }
                        }
                    }
                    if words.is_empty() {
                        return Err(EditError::Validation {
                            path: "text".into(),
                            message: "no transcript; pass text".into(),
                        });
                    }
                    words.join(" ")
                }
            };
            // A conversation (`voices: {speaker: voice}` over a transcript
            // authored with turns): every segment is spoken by its speaker's
            // voice, and its window feeds the same sentence alignment below.
            let turns = args
                .get("voices")
                .filter(|v| matches!(v, Value::Object(_)))
                .map(|voices| speaker_segments(doc.project(), voices, &voice))
                .filter(|t| !t.is_empty());
            // The voices it is read in stay with the project: the Script panel
            // shows them and the next take sounds the same.
            let spoken_voices = match (&turns, args.get("voices")) {
                (Some(_), Some(voices)) => voices.clone(),
                _ => {
                    let mut one = Value::obj();
                    one.set("narrator", Value::str(&voice));
                    one
                }
            };
            let crate::tts::Speech { audio, sentences: chunk_windows, words: word_spans } = match turns {
                // Several voices are levelled and trimmed into one take, which
                // moves every word; their times are not carried through.
                Some(turns) => synthesize_turns(&lang, &turns, seed, pace).map(|(audio, sentences)| crate::tts::Speech { audio, sentences, words: None }),
                None => crate::tts::synthesize_timed(&lang, &text, &voice, seed, pace),
            }
            .map_err(|e| EditError::Validation { path: "lang".into(), message: format!("tts failed: {e}") })?;
            if server.bundle_path.is_none() {
                return Err(EditError::Validation {
                    path: "lang".into(),
                    message: "speech needs an on-disk project (screenwords app)".into(),
                });
            }
            // The speech lives in the document, like the photo backgrounds:
            // a data URI, no sidecar file. A bundle opened anywhere (or copied
            // alone) still plays and renders.
            let wav = crate::tts::wav::wav_bytes(&audio.samples, audio.rate);
            let duration = audio.samples.len() as f64 / audio.rate as f64;
            let mut root = doc.project().root.clone();
            if let Some(settings) = root.get_mut("settings") {
                let mut kept = settings.get("voices").filter(|v| matches!(v, Value::Object(_))).cloned().unwrap_or_else(Value::obj);
                for (speaker, name) in spoken_voices.as_object().unwrap_or(&[]) {
                    if name.as_str().is_some() {
                        kept.set(speaker, name.clone());
                    }
                }
                settings.set("voices", kept);
            }
            let mut asset = Value::obj();
            let asset_id = format!("ast_{lang}");
            asset.set("id", Value::str(&asset_id));
            asset.set("kind", Value::str("audio"));
            asset.set("duration", crate::rational::RationalTime::from_seconds(duration, 1000).to_json());
            let mut source = Value::obj();
            source.set(
                "dataUri",
                Value::str(&format!("data:audio/wav;base64,{}", crate::render::base64_encode(&wav))),
            );
            asset.set("source", source);
            let mut assets: Vec<Value> = root.get("assets").and_then(Value::as_array).map(|a| a.to_vec()).unwrap_or_default();
            assets.retain(|a| a.get("id").and_then(Value::as_str) != Some(&asset_id));
            assets.push(asset);
            root.set("assets", Value::Array(assets));
            // voice-track event covering the narration
            let mut event = Value::obj();
            event.set("assetId", Value::str(&asset_id));
            event.set("duration", crate::rational::RationalTime::from_seconds(duration, 1000).to_json());
            event.set("fadeIn", crate::rational::RationalTime::ZERO.to_json());
            event.set("fadeOut", crate::rational::RationalTime::ZERO.to_json());
            event.set("gainDB", Value::from_f64(0.0));
            event.set("id", Value::str(&format!("aud_narration_{lang}")));
            event.set("loop", Value::Bool(false));
            event.set("role", Value::str("voice"));
            event.set("sourceStart", crate::rational::RationalTime::ZERO.to_json());
            event.set("start", crate::rational::RationalTime::ZERO.to_json());
            if let Some(tracks) = root.get_mut("tracks").and_then(Value::as_array_mut) {
                let idx = tracks
                    .iter()
                    .position(|t| t.get("role").and_then(Value::as_str) == Some("voice"))
                    .or_else(|| tracks.iter().position(|t| t.get("kind").and_then(Value::as_str) == Some("audio")));
                if let Some(i) = idx {
                    let tr = &mut tracks[i];
                    let mut events = tr.get("audioEvents").cloned().unwrap_or(Value::Array(Vec::new()));
                    if let Value::Array(list) = &mut events {
                        list.retain(|e| e.get("id").and_then(Value::as_str) != Some(event.get("id").and_then(Value::as_str).unwrap_or("")));
                        list.push(event);
                    }
                    tr.set("audioEvents", events);
                }
            }
            // Fit the timeline to the real speech. Every voice speaks sentence
            // by sentence with exactly known audio windows, so each SENTENCE
            // is mapped to its true window (piecewise-linear through the
            // boundaries) and captions land on the voice. Only when the
            // spoken sentences and the transcript's segments differ in number
            // (speech of a text other than the transcript) is one global
            // factor used instead.
            let segs: Vec<(f64, f64)> = root
                .get("transcripts")
                .and_then(Value::as_array)
                .and_then(|ts| ts.first())
                .and_then(|t| t.get("segments"))
                .and_then(Value::as_array)
                .map(|ss| {
                    ss.iter()
                        .map(|g| {
                            let s0 = g.get("start").and_then(|x| x.get("value")).and_then(Value::as_f64).unwrap_or(0.0) / 1000.0;
                            let e0 = g.get("end").and_then(|x| x.get("value")).and_then(Value::as_f64).unwrap_or(0.0) / 1000.0;
                            (s0, e0)
                        })
                        .collect()
                })
                .unwrap_or_default();
            let speech_end = segs.last().map(|(_, e)| *e).unwrap_or(0.0);
            // A sentence's window is its full audio span, including the
            // near-silence the model emits around it. Mapping onto the raw
            // window stretched every sentence over speech + pause, so captions
            // drifted late by up to the pause length. Trim each window to the
            // spoken part first; the pause then lands between sentences,
            // where no word needs it.
            let piecewise: Vec<((f64, f64), (f64, f64))> = if chunk_windows.len() == segs.len() {
                segs.iter()
                    .zip(chunk_windows.iter())
                    .map(|(seg, (start, length))| (*seg, speech_span(&audio.samples, audio.rate, *start, *length)))
                    .collect()
            } else {
                Vec::new()
            };
            let map_time = |secs: f64| -> f64 {
                if !piecewise.is_empty() {
                    // inside a sentence: linear to its window; in the gaps
                    // between sentences: carry the boundary offset
                    for ((s0, e0), (na, nb)) in &piecewise {
                        if secs <= *e0 + 1e-9 {
                            if secs < *s0 {
                                // before this sentence's start (a gap): clamp to window start
                                return *na;
                            }
                            let k = if (*e0 - *s0).abs() > 1e-9 { (secs - *s0) / (*e0 - *s0) } else { 0.0 };
                            return na + (nb - *na) * k;
                        }
                    }
                    let ((_, e0), (_, nb)) = piecewise[piecewise.len() - 1];
                    let _ = e0;
                    return nb + (secs - speech_end).max(0.0);
                }
                if speech_end > 0.05 && duration > 0.05 {
                    secs * (duration / speech_end)
                } else {
                    secs
                }
            };
            let rescale_doc = |root: &mut Value| {
                let scale_time = |t: &mut Value| {
                    let number = |x: &Value| x.as_f64().or_else(|| x.as_i64().map(|v| v as f64));
                    if let Some(ms) = t.get("value").and_then(&number) {
                        let mapped = map_time(ms / 1000.0) * 1000.0;
                        // integer ticks: the document model stores whole ms
                        *t.get_mut("value").unwrap() = Value::Int(mapped.round() as i64);
                    }
                };
                if let Some(ts) = root.get_mut("transcripts").and_then(Value::as_array_mut) {
                    for t in ts {
                        if let Some(words) = t.get_mut("words").and_then(Value::as_array_mut) {
                            for w in words {
                                if let Some(st) = w.get_mut("start") { scale_time(st); }
                                if let Some(en) = w.get_mut("end") { scale_time(en); }
                            }
                        }
                        if let Some(ss) = t.get_mut("segments").and_then(Value::as_array_mut) {
                            for seg in ss {
                                if let Some(st) = seg.get_mut("start") { scale_time(st); }
                                if let Some(en) = seg.get_mut("end") { scale_time(en); }
                            }
                        }
                    }
                }
                if let Some(chs) = root.get_mut("chapters").and_then(Value::as_array_mut) {
                    for c in chs {
                        if c.get("time").map(|t| t.get("seconds").is_some()).unwrap_or(false) {
                            if let Some(v) = c.get("time").and_then(|t| t.get("seconds")).and_then(Value::as_f64) {
                                let mapped = map_time(v);
                                *c.get_mut("time").unwrap().get_mut("seconds").unwrap() = Value::from_f64((mapped * 100.0).round() / 100.0);
                            }
                        }
                    }
                }
                if let Some(tracks) = root.get_mut("tracks").and_then(Value::as_array_mut) {
                    for tr in tracks {
                        if let Some(clips) = tr.get_mut("clips").and_then(Value::as_array_mut) {
                            for cl in clips {
                                let number = |x: &Value| x.as_f64().or_else(|| x.as_i64().map(|v| v as f64));
                                let start_s = cl
                                    .get("timelineStart")
                                    .and_then(|t| t.get("value"))
                                    .and_then(&number)
                                    .map(|ms| ms / 1000.0);
                                if let Some(st) = cl.get_mut("timelineStart") {
                                    scale_time(st);
                                }
                                // A duration stretches over the window it covers,
                                // measured from the clip's own timeline start.
                                if let Some(d) = cl.get_mut("sourceRange").and_then(|r| r.get_mut("duration")) {
                                    if let Some(ms) = d.get("value").and_then(&number) {
                                        let base = start_s.unwrap_or(0.0);
                                        let new_dur =
                                            (map_time(base + ms / 1000.0) - map_time(base)).max(0.0);
                                        *d.get_mut("value").unwrap() =
                                            Value::Int((new_dur * 1000.0).round() as i64);
                                    }
                                }
                            }
                        }
                        if let Some(comps) = tr.get_mut("components").and_then(Value::as_array_mut) {
                            for c in comps {
                                let anchored = c.get("timing")
                                    .and_then(|t| t.get("start"))
                                    .map(|x| x.get("wordId").is_some() || x.get("anchor").is_some())
                                    .unwrap_or(false);
                                if anchored { continue; }
                                if let Some(timing) = c.get_mut("timing") {
                                    let number = |x: &Value| x.as_f64().or_else(|| x.as_i64().map(|v| v as f64));
                                    // Read the start before writing: the duration's
                                    // factor depends on where the component begins.
                                    let start_s = timing
                                        .get("start")
                                        .and_then(|t| t.get("value"))
                                        .and_then(&number)
                                        .map(|ms| ms / 1000.0);
                                    if let Some(s) = start_s {
                                        *timing.get_mut("start").unwrap().get_mut("value").unwrap() =
                                            Value::Int((map_time(s) * 1000.0).round() as i64);
                                    }
                                    if let Some(ms) = timing.get("duration").and_then(|t| t.get("value")).and_then(&number) {
                                        let base = start_s.unwrap_or(0.0);
                                        let new_dur =
                                            (map_time(base + ms / 1000.0) - map_time(base)).max(0.0);
                                        *timing.get_mut("duration").unwrap().get_mut("value").unwrap() =
                                            Value::Int((new_dur * 1000.0).round() as i64);
                                    }
                                    if let Some(ms) = timing.get("end").and_then(|t| t.get("value")).and_then(&number) {
                                        *timing.get_mut("end").unwrap().get_mut("value").unwrap() =
                                            Value::Int((map_time(ms / 1000.0) * 1000.0).round() as i64);
                                    }
                                }
                            }
                        }
                        if let Some(evs) = tr.get_mut("audioEvents").and_then(Value::as_array_mut) {
                            for e in evs {
                                if e.get("id").and_then(Value::as_str)
                                    == Some(&format!("aud_narration_{lang}")) { continue; }
                                let number = |x: &Value| x.as_f64().or_else(|| x.as_i64().map(|v| v as f64));
                                let start_s = e
                                    .get("start")
                                    .and_then(|t| t.get("value"))
                                    .and_then(&number)
                                    .map(|ms| ms / 1000.0);
                                if let Some(st) = e.get_mut("start") {
                                    scale_time(st);
                                }
                                if let Some(ms) = e.get("duration").and_then(|t| t.get("value")).and_then(&number) {
                                    let base = start_s.unwrap_or(0.0);
                                    let new_dur =
                                        (map_time(base + ms / 1000.0) - map_time(base)).max(0.0);
                                    *e.get_mut("duration").unwrap().get_mut("value").unwrap() =
                                        Value::Int((new_dur * 1000.0).round() as i64);
                                }
                            }
                        }
                    }
                }
            };
            if speech_end > 0.05 {
                rescale_doc(&mut root);
            }
            // Word-exact sync: write the true time of every word straight into
            // the transcript. English force-aligns the known words to the
            // audio; a voice that reports its own word times (Turkish) is
            // taken at its word. Only when the count matches the transcript —
            // otherwise the sentence-exact mapping above stands.
            let doc_words: Vec<String> = root
                .get("transcripts")
                .and_then(Value::as_array)
                .and_then(|ts| ts.first())
                .and_then(|t| t.get("words"))
                .and_then(Value::as_array)
                .map(|ws| ws.iter().filter_map(|w| w.get("text").and_then(Value::as_str).map(str::to_string)).collect())
                .unwrap_or_default();
            let exact = if lang == "en" {
                let spoken_count = crate::tts::en_phonon::normalize_english(&text).split_whitespace().count();
                (doc_words.len() == spoken_count && !doc_words.is_empty())
                    .then(|| crate::tts::align::Aligner::new().and_then(|mut a| a.align(&audio.samples, &doc_words)).ok())
                    .flatten()
                    .map(|spans| spans.into_iter().map(|(a, b)| (a as f64, b as f64)).collect::<Vec<(f64, f64)>>())
            } else {
                word_spans.filter(|spans| spans.len() == doc_words.len() && !spans.is_empty())
            };
            if let Some(spans) = &exact {
                set_word_times(&mut root, spans);
            }
            // The story ends with the audio, or with the last spoken word
            // when the aligner put one past the tail sample.
            let mut total = duration;
            if let Some(words) = root
                .get("transcripts")
                .and_then(Value::as_array)
                .and_then(|ts| ts.first())
                .and_then(|t| t.get("words"))
                .and_then(Value::as_array)
            {
                for w in words {
                    if let Some(e) = w.get("end").and_then(|x| x.get("value")).and_then(Value::as_f64) {
                        total = total.max(e / 1000.0);
                    }
                }
            }
            if let Some(settings) = root.get_mut("settings") {
                settings.set(
                    "targetDuration",
                    crate::rational::RationalTime::from_seconds(total, 1000).to_json(),
                );
            }
            doc.project_mut().root = root;
            // One bed per film: asking again with speech re-made adds none.
            let has_music = doc.project().tracks().iter().any(|t| t.audio_events().iter().any(|e| e.get("role").and_then(Value::as_str) == Some("music")));
            if let Some(mood) = bed.filter(|_| !has_music) {
                let mut music = Value::obj();
                music.set("mood", Value::str(mood));
                doc.apply_edits(Some("music bed"), None, &[EditOp::new("add_music", music)])?;
            }
            persist(server, doc);
            let mut r = Value::obj();
            r.set("assetId", Value::str(&asset_id));
            r.set("embedded", Value::Bool(true));
            r.set("bytes", Value::Int(wav.len() as i64));
            r.set("durationSeconds", Value::from_f64((duration * 100.0).round() / 100.0));
            r.set("sampleRate", Value::Int(audio.rate as i64));
            r.set("lang", Value::str(&lang));
            r.set("voice", Value::str(&voice));
            // How it was read, for a caller that cannot listen: the pace
            // while speaking and the silence between sentences.
            let speaking: f64 = chunk_windows.iter().map(|w| w.1).sum();
            let spoken_words = text.split_whitespace().count() as f64;
            r.set("sentences", Value::Int(chunk_windows.len() as i64));
            r.set("wordTiming", Value::str(if exact.is_some() { "exact" } else { "spread within each sentence" }));
            if speaking > 0.0 {
                r.set("wordsPerMinute", Value::Int((spoken_words / speaking * 60.0).round() as i64));
                r.set("pauseSeconds", Value::from_f64(((duration - speaking).max(0.0) * 100.0).round() / 100.0));
            }
            Ok(r)
        }
        "find_background" => {
            let r = find_background(doc, args)?;
            persist(server, doc);
            Ok(r)
        }
        "undo" => {
            let label = doc.undo(args.get("expectLabel").and_then(Value::as_str))?;
            persist(server, doc);
            let mut r = Value::obj();
            r.set("undone", Value::str(&label));
            r.set("revision", Value::Int(doc.revision() as i64));
            Ok(r)
        }
        "redo" => {
            let label = doc.redo()?;
            persist(server, doc);
            let mut r = Value::obj();
            r.set("redone", Value::str(&label));
            r.set("revision", Value::Int(doc.revision() as i64));
            Ok(r)
        }
        other => Err(EditError::Unsupported {
            path: "name".into(),
            message: format!(
                "'{other}' needs the media stack; this server hosts the document-local tools"
            ),
        }),
    }
}

fn fb_err(path: &str, message: impl Into<String>) -> EditError {
    EditError::Validation { path: path.into(), message: message.into() }
}

fn fb_url_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            b' ' => out.push_str("%20"),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

fn fb_parse_url(url: &str) -> Result<(bool, String, u16, String), EditError> {
    let (https, rest) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("http://") {
        (false, r)
    } else {
        return Err(fb_err("url", format!("unsupported URL '{url}'; use http(s)")));
    };
    let (authority, path) = match rest.find('/') {
        Some(i) => (&rest[..i], rest[i..].to_string()),
        None => (rest, "/".to_string()),
    };
    if authority.is_empty() {
        return Err(fb_err("url", "missing host"));
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => (
            h.to_string(),
            p.parse::<u16>().map_err(|_| fb_err("url", format!("bad port in '{authority}'")))?,
        ),
        None => (authority.to_string(), if https { 443 } else { 80 }),
    };
    Ok((https, host, port, path))
}

fn fb_resolve_location(base: &str, location: &str) -> String {
    if location.starts_with("http://") || location.starts_with("https://") {
        return location.to_string();
    }
    if let Ok((https, host, port, _)) = fb_parse_url(base) {
        let scheme = if https { "https" } else { "http" };
        let default_port = (https && port == 443) || (!https && port == 80);
        let authority = if default_port {
            host
        } else {
            format!("{host}:{port}")
        };
        if location.starts_with('/') {
            return format!("{scheme}://{authority}{location}");
        }
        return format!("{scheme}://{authority}/{location}");
    }
    location.to_string()
}

/// One HTTPS (or HTTP) GET. TLS is done in-process with rustls and the webpki
/// roots, so no external binary is involved.
fn fb_get_once(url: &str, headers: &[(String, String)]) -> Result<(Vec<u8>, Option<String>), EditError> {
    let (https, host, port, path) = fb_parse_url(url)?;
    let addr = format!("{host}:{port}");
    let sock = addr
        .to_socket_addrs()
        .map_err(|e| fb_err("url", format!("cannot resolve {host}: {e}")))?
        .next()
        .ok_or_else(|| fb_err("url", format!("no address for {host}")))?;
    let stream = std::net::TcpStream::connect_timeout(&sock, Duration::from_secs(10))
        .map_err(|e| fb_err("url", format!("cannot connect to {host}: {e}")))?;
    stream.set_read_timeout(Some(Duration::from_secs(25))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

    let mut request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host}\r\nUser-Agent: screenwords/0.7 background-fetch\r\nAccept: image/*,*/*\r\nConnection: close\r\n"
    );
    for (k, v) in headers {
        request.push_str(&format!("{k}: {v}\r\n"));
    }
    request.push_str("\r\n");

    let raw = if https {
        let mut roots = rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let config = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        let name = rustls::pki_types::ServerName::try_from(host.clone())
            .map_err(|_| fb_err("tls", "invalid TLS server name"))?;
        let conn = rustls::ClientConnection::new(Arc::new(config), name)
            .map_err(|e| fb_err("tls", format!("TLS setup failed: {e}")))?;
        let mut tls = rustls::StreamOwned::new(conn, stream);
        tls.write_all(request.as_bytes())
            .and_then(|_| tls.flush())
            .map_err(|e| fb_err("tls", format!("TLS write failed: {e}")))?;
        let mut buf = Vec::new();
        tls.read_to_end(&mut buf)
            .map_err(|e| fb_err("tls", format!("TLS read failed: {e}")))?;
        buf
    } else {
        let mut plain = stream;
        plain
            .write_all(request.as_bytes())
            .and_then(|_| plain.flush())
            .map_err(|e| fb_err("url", format!("write failed: {e}")))?;
        let mut buf = Vec::new();
        plain
            .read_to_end(&mut buf)
            .map_err(|e| fb_err("url", format!("read failed: {e}")))?;
        buf
    };

    let resp = crate::http::parse_response(&raw)
        .map_err(|e| fb_err("url", format!("bad HTTP response: {e}")))?;
    if (300..400).contains(&resp.status) {
        if let Some(loc) = resp.header("location") {
            return Ok((Vec::new(), Some(loc.to_string())));
        }
        return Err(fb_err("url", format!("redirect {} without Location", resp.status)));
    }
    if !(200..300).contains(&resp.status) {
        return Err(fb_err("url", format!("HTTP {}", resp.status)));
    }
    Ok((resp.body, None))
}

fn fb_fetch(url: &str, headers: &[(String, String)]) -> Result<Vec<u8>, EditError> {
    let mut current = url.to_string();
    for _ in 0..5 {
        let (body, next) = fb_get_once(&current, headers)?;
        match next {
            Some(location) => current = fb_resolve_location(&current, &location),
            None => {
                if body.len() > 4 * 1024 * 1024 {
                    return Err(fb_err("url", "image is larger than 4 MB; pick a smaller size"));
                }
                return Ok(body);
            }
        }
    }
    Err(fb_err("url", "too many redirects"))
}

/// Picks the first portrait result out of a Pexels or Unsplash search response.
fn fb_provider_image(provider: &str, body: &str) -> Result<(String, String, String), EditError> {
    let v = Value::parse(body).map_err(|_| fb_err("provider", "the provider returned invalid JSON"))?;
    if provider == "unsplash" {
        let first = v
            .get("results")
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .ok_or_else(|| fb_err("query", "no Unsplash photo matched the query"))?;
        let url = first
            .get("urls")
            .and_then(|u| u.get("regular"))
            .and_then(Value::as_str)
            .ok_or_else(|| fb_err("provider", "Unsplash result has no image URL"))?;
        let credit = first
            .get("user")
            .and_then(|u| u.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("Unsplash contributor");
        let link = first
            .get("links")
            .and_then(|l| l.get("html"))
            .and_then(Value::as_str)
            .unwrap_or("");
        Ok((url.to_string(), credit.to_string(), link.to_string()))
    } else {
        let first = v
            .get("photos")
            .and_then(Value::as_array)
            .and_then(|a| a.first())
            .ok_or_else(|| fb_err("query", "no Pexels photo matched the query"))?;
        let url = first
            .get("src")
            .and_then(|s| s.get("large2x").or_else(|| s.get("portrait")).or_else(|| s.get("original")))
            .and_then(Value::as_str)
            .ok_or_else(|| fb_err("provider", "Pexels result has no image URL"))?;
        let credit = first.get("photographer").and_then(Value::as_str).unwrap_or("Pexels contributor");
        let link = first.get("url").and_then(Value::as_str).unwrap_or("");
        Ok((url.to_string(), credit.to_string(), link.to_string()))
    }
}

fn fb_infer_motion(query: &str) -> &'static str {
    let q = query.to_lowercase();
    if q.contains("driv") || q.contains("road") || q.contains("travel") || q.contains("train") {
        "panleft"
    } else if q.contains("ocean") || q.contains("wave") || q.contains("calm") || q.contains("lake") {
        "drift"
    } else if q.contains("product") || q.contains("studio") || q.contains("architecture") {
        "parallax"
    } else if q.contains("water") || q.contains("rain") || q.contains("reflection") {
        "ripple"
    } else {
        "kenburns"
    }
}

fn fb_infer_atmosphere(query: &str) -> &'static str {
    let q = query.to_lowercase();
    if q.contains("rain") || q.contains("storm") || q.contains("umbrella") {
        "rain"
    } else if q.contains("snow") || q.contains("winter") || q.contains("ski") {
        "snow"
    } else if q.contains("fire") || q.contains("ember") || q.contains("lava") || q.contains("candle") {
        "embers"
    } else if q.contains("night") || q.contains("city") || q.contains("neon") || q.contains("traffic") {
        "bokeh"
    } else if q.contains("forest") || q.contains("sun") || q.contains("light") || q.contains("window") {
        "rays"
    } else if q.contains("desert") || q.contains("dust") || q.contains("sand") || q.contains("fog") || q.contains("mist") {
        "dust"
    } else {
        "sheen"
    }
}

fn find_background(doc: &mut Document, args: &Value) -> Result<Value, EditError> {
    let provider = args.get("provider").and_then(Value::as_str).unwrap_or("unsplash").to_lowercase();
    let grade = args.get("grade").and_then(Value::as_str).unwrap_or("dark").to_lowercase();
    if !["dark", "warm", "cool", "violet", "green", "light", "none"].contains(&grade.as_str()) {
        return Err(fb_err("grade", "grade must be dark, warm, cool, violet, green, light or none"));
    }
    let motion_arg = args.get("motion").and_then(Value::as_str).unwrap_or("").to_lowercase();
    let atmo_arg = args.get("atmosphere").and_then(Value::as_str).unwrap_or("").to_lowercase();

    let mut credit = String::new();
    let mut source = String::new();
    let is_file = args.get("file").and_then(Value::as_str).is_some();
    let image_url: String;

    if let Some(file) = args.get("file").and_then(Value::as_str) {
        image_url = file.to_string();
    } else if let Some(url) = args.get("url").and_then(Value::as_str) {
        image_url = url.to_string();
    } else {
        let query = args.get("query").and_then(Value::as_str).unwrap_or("").trim();
        if query.is_empty() {
            return Err(fb_err("query", "pass query (with an API key), url, or file"));
        }
        let orientation = args.get("orientation").and_then(Value::as_str).unwrap_or("portrait");
        let (key_env, host, path, header_name) = if provider == "unsplash" {
            (
                "UNSPLASH_ACCESS_KEY",
                "api.unsplash.com",
                format!("/search/photos?query={}&orientation={}&per_page=1", fb_url_encode(query), orientation),
                "Authorization",
            )
        } else if provider == "pexels" {
            (
                "PEXELS_API_KEY",
                "api.pexels.com",
                format!("/v1/search?query={}&orientation={}&per_page=1", fb_url_encode(query), orientation),
                "Authorization",
            )
        } else {
            return Err(fb_err("provider", "provider must be unsplash or pexels"));
        };
        let key = std::env::var(key_env)
            .map_err(|_| fb_err("provider", format!("{key_env} is not set; pass url or file instead")))?;
        let auth = if provider == "unsplash" {
            format!("Client-ID {key}")
        } else {
            key
        };
        let body = fb_fetch(&format!("https://{host}{path}"), &[(header_name.to_string(), auth)])?;
        let text = String::from_utf8_lossy(&body);
        let (u, c, l) = fb_provider_image(&provider, &text)?;
        image_url = u;
        credit = c;
        source = l;
    }

    let bytes = if is_file {
        std::fs::read(&image_url).map_err(|e| fb_err("file", format!("cannot read {image_url}: {e}")))?
    } else {
        let fetched = fb_fetch(&image_url, &[])?;
        let head = &fetched[..fetched.len().min(64)];
        let text = String::from_utf8_lossy(head).to_lowercase();
        if text.contains("<!doctype") || text.contains("<html") {
            return Err(fb_err("url", "that URL is a page, not an image; use the image URL or query"));
        }
        fetched
    };
    if bytes.len() > 4 * 1024 * 1024 {
        return Err(fb_err("url", "image is larger than 4 MB"));
    }
    let mime = if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/jpeg"
    };
    let data_uri = format!("data:{mime};base64,{}", crate::render::base64_encode(&bytes));

    let start = args.get("start").and_then(Value::as_f64).unwrap_or(0.0).max(0.0);
    let duration = args
        .get("duration")
        .and_then(Value::as_f64)
        .unwrap_or_else(|| doc.project().settings().target_duration().map(|t| t.seconds()).unwrap_or(6.0))
        .max(0.1);

    let query_text = args.get("query").and_then(Value::as_str).unwrap_or("");
    let motion = if motion_arg.is_empty() {
        fb_infer_motion(query_text).to_string()
    } else {
        motion_arg
    };
    if !["kenburns", "zoomin", "zoomout", "panleft", "panright", "drift", "parallax", "ripple", "pulse"]
        .contains(&motion.as_str())
    {
        return Err(fb_err(
            "motion",
            "motion must be kenburns, zoomin, zoomout, panleft, panright, drift, parallax, ripple or pulse",
        ));
    }
    let atmosphere = if atmo_arg.is_empty() {
        fb_infer_atmosphere(query_text).to_string()
    } else {
        atmo_arg
    };
    if !["sheen", "rain", "snow", "dust", "embers", "bokeh", "rays", "fog", "none"]
        .contains(&atmosphere.as_str())
    {
        return Err(fb_err(
            "atmosphere",
            "atmosphere must be sheen, rain, snow, dust, embers, bokeh, rays, fog or none",
        ));
    }
    let intensity = args.get("intensity").and_then(Value::as_f64).unwrap_or(0.7).clamp(0.0, 1.5);

    let mut params = Value::obj();
    params.set("image", Value::str(&data_uri));
    params.set("grade", Value::str(&grade));
    params.set("motion", Value::str(&motion));
    params.set("atmosphere", Value::str(&atmosphere));
    params.set("intensity", Value::from_f64(intensity));
    params.set("style", Value::str("gradientWaves"));
    params.set("mode", Value::str(if grade == "light" { "light" } else { "dark" }));

    let mut add = Value::obj();
    add.set("componentId", Value::str("gradientBackground"));
    add.set("start", Value::from_f64(start));
    add.set("duration", Value::from_f64(duration));
    add.set("params", params);
    doc.apply_edits(Some("find_background"), None, &[EditOp::new("add_component", add)])?;

    let id = doc
        .project()
        .components()
        .iter()
        .rev()
        .find(|c| {
            c.get("componentId").and_then(Value::as_str) == Some("gradientBackground")
                && c.get("params").and_then(|p| p.get("image")).is_some()
        })
        .and_then(|c| c.get("id"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let mut r = Value::obj();
    r.set("componentId", Value::str(&id));
    r.set(
        "provider",
        Value::str(if is_file { "file" } else if source.is_empty() && credit.is_empty() { "url" } else { &provider }),
    );
    r.set("credit", Value::str(&credit));
    r.set("source", Value::str(&source));
    r.set("bytes", Value::Int(bytes.len() as i64));
    r.set("grade", Value::str(&grade));
    r.set("motion", Value::str(&motion));
    r.set("atmosphere", Value::str(&atmosphere));
    r.set("intensity", Value::from_f64(intensity));
    r.set("start", Value::from_f64(start));
    r.set("duration", Value::from_f64(duration));
    r.set(
        "license",
        Value::str("Unsplash License / Pexels License: free for commercial use, attribution not required (credit appreciated)."),
    );
    r.set("revision", Value::Int(doc.revision() as i64));
    Ok(r)
}

/// Writes the document back to its bundle, like the app does on every change.
/// Writes `(start, end)` seconds onto the transcript's words, in order, and
/// makes every segment span exactly its own words.
fn set_word_times(root: &mut Value, spans: &[(f64, f64)]) {
    let Some(transcript) = root.get_mut("transcripts").and_then(Value::as_array_mut).and_then(|ts| ts.first_mut()) else {
        return;
    };
    let ms = |seconds: f64| Value::Int((seconds * 1000.0).round() as i64);
    let mut times: std::collections::HashMap<String, (f64, f64)> = std::collections::HashMap::new();
    if let Some(words) = transcript.get_mut("words").and_then(Value::as_array_mut) {
        for (word, (start, end)) in words.iter_mut().zip(spans) {
            for (key, at) in [("start", start), ("end", end)] {
                if let Some(value) = word.get_mut(key).and_then(|t| t.get_mut("value")) {
                    *value = ms(*at);
                }
            }
            if let Some(id) = word.get("id").and_then(Value::as_str) {
                times.insert(id.to_string(), (*start, *end));
            }
        }
    }
    for segment in transcript.get_mut("segments").and_then(Value::as_array_mut).into_iter().flatten() {
        let own: Vec<(f64, f64)> = segment
            .get("wordIds")
            .and_then(Value::as_array)
            .map(|ids| ids.iter().filter_map(|id| times.get(id.as_str()?).copied()).collect())
            .unwrap_or_default();
        let (Some(first), Some(last)) = (own.first(), own.last()) else {
            continue;
        };
        for (key, at) in [("start", first.0), ("end", last.1)] {
            if let Some(value) = segment.get_mut(key).and_then(|t| t.get_mut("value")) {
                *value = ms(at);
            }
        }
    }
}

fn persist(server: &McpServer, doc: &Document) {
    let Some(bundle) = &server.bundle_path else {
        return;
    };
    let _ = std::fs::write(bundle.join("project.json"), doc.project().to_json_string());
    let mut rev = Value::obj();
    rev.set("revision", Value::Int(doc.revision() as i64));
    let _ = std::fs::write(bundle.join("revision.json"), format!("{rev}\n"));
}

pub fn project_summary(doc: &Document) -> Value {
    let p = doc.project();
    let s = p.settings();
    let mut r = Value::obj();
    r.set("name", Value::str(p.name()));
    r.set("id", Value::str(p.id()));
    r.set("revision", Value::Int(doc.revision() as i64));
    r.set("width", Value::Int(s.width()));
    r.set("height", Value::Int(s.height()));
    r.set("fps", Value::from_f64(s.fps()));
    r.set("loudnessTargetLUFS", Value::from_f64(s.lufs()));
    r.set("canUndo", Value::Bool(doc.can_undo()));
    r.set("canRedo", Value::Bool(doc.can_redo()));
    let mut tracks = Vec::new();
    for t in p.tracks() {
        let mut o = Value::obj();
        o.set("id", Value::str(t.id()));
        o.set("kind", Value::str(t.kind()));
        o.set("name", Value::str(t.name()));
        if let Some(role) = t.role() {
            o.set("role", Value::str(role));
        }
        o.set("isHidden", Value::Bool(t.is_hidden()));
        o.set("isMuted", Value::Bool(t.is_muted()));
        o.set("clips", Value::Int(t.clips().len() as i64));
        o.set("components", Value::Int(t.components().len() as i64));
        o.set("audioEvents", Value::Int(t.audio_events().len() as i64));
        tracks.push(o);
    }
    r.set("tracks", Value::Array(tracks));
    r.set("assets", Value::Int(p.assets().len() as i64));
    r.set("words", Value::Int(p.words().len() as i64));
    r
}

/// Runs the server on `listener`; `ready` is printed with the real port.
pub fn run_server(server: Arc<McpServer>, listener: std::net::TcpListener, mut ready_line: String, extra: Option<fn(&Request) -> Option<Response>>) {
    if let Ok(addr) = listener.local_addr() {
        ready_line = ready_line.replace("__PORT__", &addr.port().to_string());
    }
    println!("{ready_line}");
    let handler_server = server.clone();
    httpd::serve(listener, move |request| {
        if request.path.starts_with("/mcp") {
            return handle_mcp(&handler_server, request);
        }
        if let Some(extra) = extra {
            if let Some(response) = extra(request) {
                return response;
            }
        }
        Response::text(404, "not found")
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fixed_token_survives_restarts_and_guards_the_endpoint() {
        // Unset / blank keeps the random token; a bad one is refused, not ignored.
        assert_eq!(fixed_token(None), Ok(None));
        assert_eq!(fixed_token(Some("  ")), Ok(None));
        for bad in ["short", "has space in the token!", "quote\"in-the-token-value", &"x".repeat(129)] {
            assert!(fixed_token(Some(bad)).is_err(), "{bad} accepted");
        }
        let fixed = fixed_token(Some(" 0123456789abcdef-FIXED_token ")).unwrap().unwrap();
        assert_eq!(fixed, "0123456789abcdef-FIXED_token");

        let post = |server: &Arc<McpServer>, bearer: &str| {
            let request = Request {
                method: "POST".into(),
                path: "/mcp".into(),
                query: Vec::new(),
                headers: vec![("authorization".into(), format!("Bearer {bearer}"))],
                body: br#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#.to_vec(),
            };
            handle_mcp(server, &request)
        };
        // Two "restarts" with the same fixed token: the same client header works on both.
        for _ in 0..2 {
            let doc = std::sync::Arc::new(Mutex::new(Document::new(blank_project("t", true))));
            let (server, ready) = McpServer::new_with_token(doc, None, Some(fixed.clone()));
            assert!(ready.contains("\"token\":\"0123456789abcdef-FIXED_token\""), "{ready}");
            let ok = post(&server, &fixed);
            assert_eq!(ok.status, 200);
            assert!(String::from_utf8(ok.body).unwrap().contains("get_project"));
            assert_eq!(post(&server, "0123456789abcdef-WRONG_token").status, 403);
        }
        // Without one, two servers never share a token.
        let (a, _) = McpServer::new(Document::new(blank_project("t", true)));
        std::thread::sleep(std::time::Duration::from_millis(2));
        let (b, _) = McpServer::new(Document::new(blank_project("t", true)));
        assert_ne!(a.token, b.token);
        assert_eq!(post(&b, &a.token).status, 403);
    }

    #[test]
    fn exact_word_times_are_written_and_segments_follow_their_words() {
        // A transcript as author_transcript leaves it (evenly guessed times),
        // then the times the Turkish voice reported for the same five words.
        let mut doc = Document::new(blank_project("t", true));
        let mut args = Value::obj();
        args.set("text", Value::str("Merkezinde Güneş yandı. Dünya doğdu."));
        args.set("language", Value::str("tr"));
        doc.apply_edits(None, None, &[EditOp::new("author_transcript", args)]).unwrap();
        let mut root = doc.project().root.clone();
        let spans = [(0.0, 0.62), (0.62, 1.04), (1.04, 1.48), (1.93, 2.33), (2.33, 2.81)];
        set_word_times(&mut root, &spans);
        let transcript = &root.get("transcripts").and_then(Value::as_array).unwrap()[0];
        let ms = |v: &Value, key: &str| v.get(key).and_then(|t| t.get("value")).and_then(Value::as_i64).unwrap();
        let words = transcript.get("words").and_then(Value::as_array).unwrap();
        assert_eq!(words.iter().map(|w| (ms(w, "start"), ms(w, "end"))).collect::<Vec<_>>(), vec![(0, 620), (620, 1040), (1040, 1480), (1930, 2330), (2330, 2810)]);
        // Each sentence spans its own words, the breath between them left out.
        let segments = transcript.get("segments").and_then(Value::as_array).unwrap();
        assert_eq!(segments.iter().map(|g| (ms(g, "start"), ms(g, "end"))).collect::<Vec<_>>(), vec![(0, 1480), (1930, 2810)]);
        // Fewer spans than words: the words that have one get it, nothing panics.
        set_word_times(&mut root, &spans[..2]);
    }

    #[test]
    fn tools_declare_their_arguments_and_the_catalog_teaches_design() {
        let (server, _) = McpServer::new(Document::new(blank_project("t", true)));
        let token = server.token.clone();
        let request = Request {
            method: "POST".into(),
            path: "/mcp".into(),
            query: Vec::new(),
            headers: vec![("authorization".into(), format!("Bearer {token}"))],
            body: br#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#.to_vec(),
        };
        let listed = Value::parse(&String::from_utf8(handle_mcp(&server, &request).body).unwrap()).unwrap();
        let tools = listed.get("result").and_then(|r| r.get("tools")).and_then(Value::as_array).unwrap();
        let schema = |name: &str| {
            tools.iter().find(|t| t.get("name").and_then(Value::as_str) == Some(name)).and_then(|t| t.get("inputSchema")).cloned().unwrap_or_else(|| panic!("{name} is not listed"))
        };
        for (tool, arg) in [("apply_edits", "edits"), ("preview_frames", "times"), ("import_image", "page"), ("author_transcript", "text"), ("synthesize_speech", "lang"), ("list_components", "componentId")] {
            assert!(schema(tool).get("properties").and_then(|p| p.get(arg)).is_some(), "{tool} does not declare {arg}");
        }
        for spec in TOOLS {
            assert!(Value::parse(tool_properties(spec.name)).is_ok(), "{} has a broken schema", spec.name);
        }

        let mut doc = server.document.lock().unwrap();
        let all = call_tool(&server, &mut doc, "list_components", &Value::obj()).unwrap();
        let design = all.get("design").and_then(Value::as_str).unwrap();
        for needle in ["codeOverlay_", "preview_frames", "import_image", "transition", "animate"] {
            assert!(design.contains(needle), "design misses {needle}");
        }
        let items = all.get("components").and_then(Value::as_array).unwrap();
        let pill = items.iter().find(|c| c.get("componentId").and_then(Value::as_str) == Some("badgePill")).unwrap();
        assert_eq!(pill.get("draws").and_then(Value::as_str), Some("Pill badge"));
        let mut only = Value::obj();
        only.set("category", Value::str("transition"));
        let transitions = call_tool(&server, &mut doc, "list_components", &only).unwrap();
        let listed = transitions.get("components").and_then(Value::as_array).unwrap();
        assert!(listed.len() > 20 && listed.iter().all(|c| c.get("category").and_then(Value::as_str) == Some("transition")));

        // Looking and importing write next to the project, so they need one.
        for tool in ["preview_frames", "import_image"] {
            let err = call_tool(&server, &mut doc, tool, &Value::obj()).unwrap_err();
            assert!(err.message().contains("on-disk project"), "{}", err.message());
        }
    }

    #[test]
    fn export_html_is_an_mcp_tool_and_needs_a_bundle() {
        let (server, _) = McpServer::new(Document::new(blank_project("Bundle Test", true)));
        {
            let mut doc = server.document.lock().unwrap();
            let err = call_tool(&server, &mut doc, "export_html", &Value::obj()).unwrap_err();
            assert!(err.message().contains("on-disk project"), "{}", err.message());
        }
        let dir = std::env::temp_dir().join(format!("sw-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let shared = std::sync::Arc::new(Mutex::new(Document::new(blank_project("Bundle Test", true))));
        let (server, _) = McpServer::new_shared(shared, Some(dir.clone()));
        let mut doc = server.document.lock().unwrap();
        let out = call_tool(&server, &mut doc, "export_html", &Value::obj()).unwrap();
        let path = out.get("path").and_then(Value::as_str).unwrap().to_string();
        let html = std::fs::read_to_string(&path).unwrap();
        assert!(html.contains("<canvas") && html.len() as i64 == out.get("bytes").and_then(Value::as_i64).unwrap());
        assert!(TOOLS.iter().any(|t| t.name == "render_video"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn list_components_teaches_characters_and_component_params() {
        let (server, _) = McpServer::new(Document::new(blank_project("t", true)));
        let mut doc = server.document.lock().unwrap();
        let all = call_tool(&server, &mut doc, "list_components", &Value::obj()).unwrap();
        let how = all.get("howTo").and_then(Value::as_str).unwrap();
        for needle in ["cast", "kit: 'editorial'", "turns", "voices", "conversation"] {
            assert!(how.contains(needle), "howTo misses {needle}");
        }
        let mut one = Value::obj();
        one.set("componentId", Value::str("conversation"));
        let conv = call_tool(&server, &mut doc, "list_components", &one).unwrap();
        assert!(conv.get("notes").and_then(Value::as_str).unwrap().contains("seats"));
        assert!(conv.get("params").and_then(|p| p.get("seats")).is_some(), "the params the renderer reads are listed");
        one.set("componentId", Value::str("codeOverlay_presenter"));
        let code = call_tool(&server, &mut doc, "list_components", &one).unwrap();
        assert!(code.get("notes").and_then(Value::as_str).unwrap().contains("sw.character"));
        one.set("componentId", Value::str("noSuchThing"));
        assert!(call_tool(&server, &mut doc, "list_components", &one).is_err());
    }

    #[test]
    fn speech_span_trims_the_pause_around_a_sentence() {
        // 1.0 s silence, 1.0 s speech at half amplitude, 1.0 s silence at
        // 24 kHz — the chunk window covers all three; only the middle may
        // survive the trim (within one 20 ms frame).
        let rate = 24000u32;
        let mut samples = vec![0.0f32; rate as usize * 3];
        for s in samples.iter_mut().take(rate as usize * 2).skip(rate as usize) {
            *s = 0.5;
        }
        let (a, b) = speech_span(&samples, rate, 0.0, 3.0);
        assert!((a - 0.98).abs() < 0.03, "leading silence kept: {a}");
        assert!((b - 2.02).abs() < 0.03, "trailing silence kept: {b}");
        // A degenerate window (all silence) must not collapse to a point.
        let (a, b) = speech_span(&[0.0f32; 480], rate, 0.0, 0.02);
        assert_eq!((a, b), (0.0, 0.02));
    }

    #[test]
    fn provider_search_picks_the_first_portrait_photo() {
        let pexels = r#"{"photos":[{"src":{"large2x":"https://images.pexels.com/a.jpg"},"photographer":"Host","url":"https://pexels.com/p/1"}]}"#;
        let (url, credit, link) = fb_provider_image("pexels", pexels).unwrap();
        assert_eq!(url, "https://images.pexels.com/a.jpg");
        assert_eq!(credit, "Host");
        assert_eq!(link, "https://pexels.com/p/1");

        let unsplash = r#"{"results":[{"urls":{"regular":"https://images.unsplash.com/b.jpg"},"user":{"name":"Grace"},"links":{"html":"https://unsplash.com/photos/2"}}]}"#;
        let (url, credit, link) = fb_provider_image("unsplash", unsplash).unwrap();
        assert_eq!(url, "https://images.unsplash.com/b.jpg");
        assert_eq!(credit, "Grace");
        assert_eq!(link, "https://unsplash.com/photos/2");
    }

    #[test]
    fn provider_search_without_results_is_a_validation_error() {
        let err = fb_provider_image("unsplash", r#"{"results":[]}"#).unwrap_err();
        assert_eq!(err.code(), "validationFailed");
    }

    #[test]
    fn motion_and_atmosphere_are_inferred_from_the_topic() {
        assert_eq!(fb_infer_atmosphere("rainy Tokyo street at night"), "rain");
        assert_eq!(fb_infer_atmosphere("snowy mountain cabin"), "snow");
        assert_eq!(fb_infer_atmosphere("bonfire in a forest"), "embers");
        assert_eq!(fb_infer_atmosphere("calm desert dunes"), "dust");
        assert_eq!(fb_infer_atmosphere("modern office interior"), "sheen");
        assert_eq!(fb_infer_motion("driving down a mountain road"), "panleft");
        assert_eq!(fb_infer_motion("ocean waves at sunset"), "drift");
        assert_eq!(fb_infer_motion("studio product shot"), "parallax");
        assert_eq!(fb_infer_motion("rainy street"), "ripple");
    }

    #[test]
    fn url_parsing_and_redirect_resolution() {
        let (https, host, port, path) =
            fb_parse_url("https://images.unsplash.com/photo-1?w=900&q=70").unwrap();
        assert!(https);
        assert_eq!(host, "images.unsplash.com");
        assert_eq!(port, 443);
        assert_eq!(path, "/photo-1?w=900&q=70");

        let (https, host, port, path) = fb_parse_url("http://example.com:8080/a").unwrap();
        assert!(!https);
        assert_eq!(host, "example.com");
        assert_eq!(port, 8080);
        assert_eq!(path, "/a");

        assert_eq!(fb_resolve_location("https://a.com/x", "/b"), "https://a.com/b");
        assert_eq!(fb_resolve_location("https://a.com/x", "b"), "https://a.com/b");
        assert_eq!(fb_resolve_location("https://a.com/x", "https://b.com/y"), "https://b.com/y");
        assert_eq!(fb_resolve_location("http://a.com:8080/x", "/b"), "http://a.com:8080/b");
    }

    #[test]
    fn query_encoding_escapes_spaces() {
        assert_eq!(fb_url_encode("rainy tokyo street"), "rainy%20tokyo%20street");
        assert_eq!(fb_url_encode("café"), "caf%C3%A9");
    }
}
