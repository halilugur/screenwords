//! The web editor UI: a local, std-only single page served by the Rust
//! binary — project overview, timeline tracks, transcript with live
//! find_in_transcript, chapters, subtitles, narration generation and a
//! dry-run cut. Everything is in-memory except narration: `synthesize_speech`
//! writes a WAV into the bundle and re-times the document, so it persists
//! the same way the MCP tool does.

use crate::edits::{Document, EditError, EditOp};
use crate::httpd::{Request, Response};
use crate::json::Value;
use crate::rational::RationalTime;
use crate::reads;
use crate::server::{project_summary, McpServer};
use std::sync::Mutex;

pub struct Ui {
    pub document: std::sync::Arc<Mutex<Document>>,
    /// The loaded project path (for display).
    pub project_path: String,
}

/// HEAD is served by running the GET route and returning its headers with the
/// body stripped, as HTTP requires.
pub fn handle(ui: &Ui, request: &Request) -> Response {
    let is_head = request.method == "HEAD";
    let shadow;
    let effective = if is_head {
        shadow = Request {
            method: "GET".into(),
            path: request.path.clone(),
            query: request.query.clone(),
            headers: request.headers.clone(),
            body: request.body.clone(),
        };
        &shadow
    } else {
        request
    };
    let mut response = route(ui, effective);
    if is_head {
        let len = response.body.len();
        response.body.clear();
        response
            .extra_headers
            .retain(|(k, _)| !k.eq_ignore_ascii_case("content-length"));
        response.extra_headers.push(("Content-Length".into(), len.to_string()));
    }
    response
}

fn route(ui: &Ui, request: &Request) -> Response {
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/") => Response::html(page_html()),
        ("GET", "/preview") => {
            let p = ui.document.lock().unwrap().project().clone();
            Response::html(&crate::render::render_html_in(&p, project_base(&ui.project_path).as_deref()))
        }
        ("GET", "/api/audio") => {
            let base = project_base(&ui.project_path);
            let mut resolved: Option<(String, Vec<u8>)> = None;
            {
                let doc = ui.document.lock().unwrap();
                let p = doc.project();
                // The voice event wins, then the other audio assets, then a
                // sidecar voice.mp3 next to the bundle. Muted tracks are skipped.
                let voice_track_muted = p
                    .tracks()
                    .iter()
                    .any(|t| t.role() == Some("voice") && t.is_muted() && !t.audio_events().is_empty());
                let mut ids: Vec<String> = Vec::new();
                for t in p.tracks() {
                    if t.is_muted() {
                        continue;
                    }
                    for ev in t.audio_events() {
                        if ev.get("role").and_then(Value::as_str) == Some("voice") {
                            if let Some(aid) = ev.get("assetId").and_then(Value::as_str) {
                                if !ids.iter().any(|x| x == aid) {
                                    ids.push(aid.to_string());
                                }
                            }
                        }
                    }
                }
                if !voice_track_muted {
                    for a in p.assets() {
                        if a.get("kind").and_then(Value::as_str) == Some("audio") {
                            if let Some(aid) = a.get("id").and_then(Value::as_str) {
                                if !ids.iter().any(|x| x == aid) {
                                    ids.push(aid.to_string());
                                }
                            }
                        }
                    }
                }
                for id in ids {
                    let Some(a) = p.asset(&id) else { continue };
                    // Embedded narration (the normal case) carries its bytes.
                    if let Some(uri) = a.get("source").and_then(|s| s.get("dataUri")).and_then(Value::as_str) {
                        if let Some((mime, bytes)) = data_uri(uri) {
                            resolved = Some((mime, bytes));
                            break;
                        }
                    }
                    let Some(src) = a.get("source").and_then(|s| s.get("path")).and_then(Value::as_str) else {
                        continue;
                    };
                    let candidate = resolve_asset_path(src, base.as_deref());
                    if candidate.exists() {
                        let mime = audio_content_type(&candidate).to_string();
                        if let Ok(bytes) = std::fs::read(&candidate) {
                            resolved = Some((mime, bytes));
                            break;
                        }
                    }
                }
            }
            if resolved.is_none() {
                if let Some(base) = &base {
                    let default_voice = base.join("voice.mp3");
                    if default_voice.exists() {
                        if let Ok(bytes) = std::fs::read(&default_voice) {
                            resolved = Some((audio_content_type(&default_voice).to_string(), bytes));
                        }
                    }
                }
            }
            let Some((mime, bytes)) = resolved else {
                return Response::text(404, "no audio found");
            };
            let mut r = match parse_range(request.header("range"), bytes.len()) {
                RangeSpec::Unsatisfiable => {
                    let mut r = Response::text(416, "");
                    r.content_type = mime;
                    r.extra_headers
                        .push(("Content-Range".into(), format!("bytes */{}", bytes.len())));
                    r
                }
                RangeSpec::Partial(start, end) => {
                    let mut r = Response::binary(206, &mime, bytes[start..=end].to_vec());
                    r.extra_headers.push((
                        "Content-Range".into(),
                        format!("bytes {start}-{end}/{}", bytes.len()),
                    ));
                    r
                }
                RangeSpec::Full => Response::binary(200, &mime, bytes),
            };
            // A regenerated narration replaces the same file name: never let a
            // browser serve byte ranges from the previous take.
            r.extra_headers.push(("Cache-Control".into(), "no-store".into()));
            r
        }
        ("GET", "/api/summary") => {
            let doc = ui.document.lock().unwrap();
            let mut r = project_summary(&doc);
            r.set("path", Value::str(&ui.project_path));
            r.set(
                "theme",
                doc.project()
                    .root
                    .get("settings")
                    .and_then(|st| st.get("theme"))
                    .cloned()
                    .or_else(|| Value::parse(crate::theme::DEFAULT).ok())
                    .unwrap_or_else(Value::obj),
            );
            // The last MP4 the render button wrote, so the editor can offer it
            // for download without guessing.
            if let Some(base) = project_base(&ui.project_path) {
                let name = format!("{}.mp4", slug(doc.project().name()));
                let path = base.join(&name);
                if let Ok(meta) = std::fs::metadata(&path) {
                    let mut video = Value::obj();
                    video.set("name", Value::str(&name));
                    video.set("path", Value::str(&path.to_string_lossy()));
                    video.set("bytes", Value::Int(meta.len() as i64));
                    r.set("video", video);
                }
            }
            Response::json(200, r.to_string_pretty(false))
        }
        ("GET", "/api/words") => {
            let body = {
                let doc = ui.document.lock().unwrap();
                let p = doc.project();
                let words: Vec<Value> = p
                    .words()
                    .iter()
                    .map(|w| {
                        let mut o = Value::obj();
                        o.set("id", Value::str(w.id()));
                        o.set("start", Value::from_f64(w.start().seconds()));
                        o.set("end", Value::from_f64(w.end().seconds()));
                        o.set("text", Value::str(w.text()));
                        if let Some(sp) = w.speaker() {
                            o.set("speaker", Value::str(sp));
                        }
                        if let Some(n) = w.turn() {
                            o.set("turn", Value::Int(n));
                        }
                        o
                    })
                    .collect();
                let mut r = Value::obj();
                r.set("words", Value::Array(words));
                r.to_string_pretty(false)
            };
            Response::json(200, body)
        }
        ("GET", "/api/timeline") => {
            let body = {
                let doc = ui.document.lock().unwrap();
                let p = doc.project();
                let duration = p
                    .settings()
                    .target_duration()
                    .map(|t| t.seconds())
                    .unwrap_or(10.0)
                    .max(p.words().last().map(|w| w.end().seconds()).unwrap_or(0.0));
                let mut tracks = Vec::new();
                for t in p.tracks() {
                    let mut items = Vec::new();
                    for c in t.clips() {
                        let start = RationalTime::from_json(c.get("timelineStart").unwrap_or(&Value::Null))
                            .unwrap_or(RationalTime::ZERO)
                            .seconds();
                        let dur = RationalTime::from_json(
                            c.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
                        )
                        .unwrap_or(RationalTime::ZERO)
                        .seconds();
                        let mut o = Value::obj();
                        o.set("kind", Value::str("clip"));
                        o.set("id", Value::str(c.get("id").and_then(Value::as_str).unwrap_or("")));
                        let asset_id = c.get("assetId").and_then(Value::as_str).unwrap_or("");
                        if let Some(asset) = p.asset(asset_id) {
                            let name = asset_label(asset, asset_id);
                            o.set("name", Value::str(&name));
                        }
                        if let Some(params) = c.get("params") {
                            o.set("params", params.clone());
                        }
                        o.set("start", Value::from_f64(start));
                        o.set("end", Value::from_f64(start + dur));
                        items.push(o);
                    }
                    for c in t.components() {
                        if let Some((s, e)) = p.component_window(c) {
                            let mut o = Value::obj();
                            o.set("kind", Value::str("component"));
                            o.set("id", Value::str(c.get("id").and_then(Value::as_str).unwrap_or("")));
                            o.set(
                                "componentId",
                                Value::str(c.get("componentId").and_then(Value::as_str).unwrap_or("")),
                            );
                            if let Some(params) = c.get("params") {
                                o.set("params", params.clone());
                            }
                            if let Some(pos) = c.get("position") {
                                o.set("position", pos.clone());
                            }
                            if let Some(timing) = c.get("timing") {
                                o.set("timing", timing.clone());
                            }
                            o.set(
                                "isEnabled",
                                Value::Bool(c.get("isEnabled").and_then(Value::as_bool).unwrap_or(true)),
                            );
                            o.set("zIndex", c.get("zIndex").cloned().unwrap_or(Value::Int(0)));
                            o.set("start", Value::from_f64(s.seconds()));
                            o.set("end", Value::from_f64(e.map(|x| x.seconds()).unwrap_or(s.seconds())));
                            items.push(o);
                        }
                    }
                    for e in t.audio_events() {
                        let start = p
                            .resolve_time(e.get("start").unwrap_or(&Value::Null))
                            .map(|t| t.seconds())
                            .unwrap_or(0.0);
                        let dur = RationalTime::from_json(e.get("duration").unwrap_or(&Value::Null))
                            .unwrap_or(RationalTime::ZERO)
                            .seconds();
                        let mut o = Value::obj();
                        o.set("kind", Value::str("audio"));
                        o.set("id", Value::str(e.get("id").and_then(Value::as_str).unwrap_or("")));
                        let asset_id = e.get("assetId").and_then(Value::as_str).unwrap_or("");
                        if let Some(asset) = p.asset(asset_id) {
                            let name = asset_label(asset, asset_id);
                            o.set("name", Value::str(&name));
                        }
                        o.set(
                            "role",
                            Value::str(e.get("role").and_then(Value::as_str).unwrap_or("")),
                        );
                        o.set("start", Value::from_f64(start));
                        o.set("end", Value::from_f64(start + dur));
                        items.push(o);
                    }
                    let mut o = Value::obj();
                    o.set("id", Value::str(t.id()));
                    o.set("kind", Value::str(t.kind()));
                    o.set("name", Value::str(t.name()));
                    o.set("isHidden", Value::Bool(t.is_hidden()));
                    o.set("isMuted", Value::Bool(t.is_muted()));
                    if let Some(role) = t.role() {
                        o.set("role", Value::str(role));
                    }
                    o.set("items", Value::Array(items));
                    tracks.push(o);
                }
                let mut r = Value::obj();
                r.set("duration", Value::from_f64(duration));
                r.set("tracks", Value::Array(tracks));
                r.set(
                    "analysis",
                    p.root.get("analysis").cloned().unwrap_or_else(Value::obj),
                );
                r.set(
                    "cast",
                    p.root.get("settings").and_then(|st| st.get("cast")).cloned().unwrap_or_else(Value::obj),
                );
                r.set(
                    "theme",
                    p.root
                        .get("settings")
                        .and_then(|st| st.get("theme"))
                        .cloned()
                        .or_else(|| Value::parse(crate::theme::DEFAULT).ok())
                        .unwrap_or_else(Value::obj),
                );
                r.to_string_pretty(false)
            };
            Response::json(200, body)
        }
        ("GET", "/api/find") => {
            let mut args = Value::obj();
            if let Some(q) = request.query_param("q") {
                if !q.is_empty() {
                    args.set("query", Value::str(q));
                }
            }
            if let Some(kind) = request.query_param("kind") {
                if !kind.is_empty() {
                    args.set("kind", Value::str(kind));
                }
            }
            if let Some(min) = request.query_param("minPause").and_then(|v| v.parse::<f64>().ok()) {
                args.set("minPause", Value::from_f64(min));
            }
            let result = {
                let doc = ui.document.lock().unwrap();
                reads::find_in_transcript(doc.project(), &args)
            };
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(200, error_json(&e)),
            }
        }
        ("GET", "/api/voices") => {
            // English voice styles are files: list what is staged in
            // tts-models/en so the picker never drifts from disk. Turkish has
            // one sound (EMA Lightning takes no voice argument).
            let mut names: Vec<String> = std::fs::read_dir(crate::tts::models_dir().join("en"))
                .map(|rd| {
                    rd.flatten()
                        .filter_map(|e| {
                            let p = e.path();
                            (p.extension().and_then(|x| x.to_str()) == Some("bin"))
                                .then(|| p.file_stem().and_then(|s| s.to_str()).map(str::to_string))
                                .flatten()
                        })
                        .collect()
                })
                .unwrap_or_default();
            names.sort();
            if names.is_empty() {
                names.push("easton".into());
            }
            // easton is the take the project already speaks with: keep it first
            if let Some(pos) = names.iter().position(|n| n == "easton") {
                let easton = names.remove(pos);
                names.insert(0, easton);
            }
            // Supertonic 3 styles speak every language in its list; they are
            // ordinary files under tts-models/s3/voice_styles.
            let supertonic = crate::tts::s3::voice_names();
            for name in &supertonic {
                if !names.contains(name) {
                    names.push(name.clone());
                }
            }
            let mut r = Value::obj();
            r.set("voices", Value::Array(names.iter().map(|n| Value::str(n)).collect()));
            r.set(
                "supertonic",
                Value::Array(supertonic.iter().map(|n| Value::str(n)).collect()),
            );
            Response::json(200, r.to_string_pretty(false))
        }
        ("POST", "/api/export") => {
            // The deliverable: the same self-contained player `screenwords
            // render` writes, saved next to the project so it can be shipped.
            let Some(base) = project_base(&ui.project_path) else {
                return Response::json(
                    400,
                    json_error("badRequest", "the video needs an on-disk project (screenwords app)"),
                );
            };
            let project = ui.document.lock().unwrap().project().clone();
            match export_player(&project, &base) {
                Ok(r) => Response::json(200, r.to_string_pretty(false)),
                Err(message) => Response::json(400, json_error("io", &message)),
            }
        }
        ("POST", "/api/render-mp4") => {
            // A real render: headless Chrome draws every frame at i/fps, ffmpeg
            // encodes, and the narration embedded in the page is muxed in.
            let Some(base) = project_base(&ui.project_path) else {
                return Response::json(
                    400,
                    json_error("badRequest", "rendering needs an on-disk project (screenwords app)"),
                );
            };
            let project = ui.document.lock().unwrap().project().clone();
            let result = render_video(&project, &base);
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(message) => Response::json(400, json_error("renderFailed", &message)),
            }
        }
        ("GET", "/video") => {
            // The rendered MP4, inline to play or attachment to save.
            let Some(base) = project_base(&ui.project_path) else {
                return Response::text(404, "no project on disk");
            };
            let slug_name = slug(ui.document.lock().unwrap().project().name());
            let name = format!("{slug_name}.mp4");
            let path = base.join(&name);
            let Ok(bytes) = std::fs::read(&path) else {
                return Response::text(404, "no video yet — press Render MP4 in the editor");
            };
            let download = request.query_param("download").map(|v| v != "0").unwrap_or(false);
            let mut r = Response::binary(200, "video/mp4", bytes);
            r.extra_headers.push(("Cache-Control".into(), "no-store".into()));
            if download {
                r.extra_headers.push((
                    "Content-Disposition".into(),
                    format!("attachment; filename=\"{name}\""),
                ));
            }
            r
        }
        ("GET", "/render") => {
            // Serve the file the Create video button wrote — exactly the bytes
            // that were saved, not a fresh in-memory render.
            let Some(base) = project_base(&ui.project_path) else {
                return Response::text(404, "no project on disk");
            };
            let slug_name = slug(ui.document.lock().unwrap().project().name());
            let path = base.join(format!("{slug_name}.html"));
            let download = request.query_param("download").map(|v| v != "0").unwrap_or(false);
            match std::fs::read_to_string(&path) {
                Ok(html) => {
                    let mut r = Response::html(&html);
                    if download {
                        r.extra_headers.push((
                            "Content-Disposition".into(),
                            format!("attachment; filename=\"{slug_name}.html\""),
                        ));
                    }
                    r
                }
                Err(_) => Response::text(
                    404,
                    "no video yet — press Create video in the editor to write one",
                ),
            }
        }
        ("GET", "/api/chapters") => {
            let body = {
                let doc = ui.document.lock().unwrap();
                reads::list_chapters(doc.project()).to_string_pretty(false)
            };
            Response::json(200, body)
        }
        ("GET", "/api/srt") => {
            let mut args = Value::obj();
            if let Some(f) = request.query_param("format") {
                args.set("format", Value::str(f));
            }
            let result = {
                let doc = ui.document.lock().unwrap();
                reads::export_subtitles(doc.project(), &args)
            };
            match result {
                Ok(v) => Response::text(200, v.get("text").and_then(Value::as_str).unwrap_or("")),
                Err(e) => Response::text(200, &e.message()),
            }
        }
        ("POST", "/api/frame") => {
            // Frame size is project settings: 4 named presets, or any custom
            // even pair. Goes through apply_edits so it is one undo step and
            // autosaved like every other change.
            let body = String::from_utf8_lossy(&request.body);
            let args = match Value::parse(&body) {
                Ok(v) => v,
                Err(e) => return Response::json(400, json_error("badRequest", &format!("bad JSON: {e}"))),
            };
            let (w, h) = match frame_size(&args) {
                Ok(pair) => pair,
                Err(message) => return Response::json(400, json_error("validationFailed", &message)),
            };
            let fps = match frame_rate(&args) {
                Ok(fps) => fps,
                Err(message) => return Response::json(400, json_error("validationFailed", &message)),
            };
            let mut settings = Value::obj();
            settings.set("width", Value::from_f64(w));
            settings.set("height", Value::from_f64(h));
            if let Some(fps) = fps {
                settings.set("fps", Value::from_f64(fps));
            }
            let mut op = Value::obj();
            op.set("tool", Value::str("set_project_settings"));
            op.set("arguments", settings);
            let mut edit_args = Value::obj();
            edit_args.set("label", Value::str("set frame"));
            edit_args.set("edits", Value::Array(vec![op]));

            let Some(base) = project_base(&ui.project_path) else {
                return Response::json(
                    400,
                    json_error("badRequest", "a frame needs an on-disk project (screenwords app)"),
                );
            };
            let (server, _) = McpServer::new_shared(ui.document.clone(), Some(base));
            let result = {
                let mut doc = ui.document.lock().unwrap();
                match crate::server::call_tool(&server, &mut doc, "apply_edits", &edit_args) {
                    Ok(mut out) => {
                        let s = doc.project().settings();
                        out.set("width", Value::from_f64(s.width() as f64));
                        out.set("height", Value::from_f64(s.height() as f64));
                        out.set("fps", Value::from_f64(s.fps()));
                        Ok(out)
                    }
                    Err(e) => Err(e),
                }
            };
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(400, error_json(&e)),
            }
        }
        ("GET", "/api/script") => {
            // The whole narration, one sentence per line: what the Voice panel
            // edits and what TTS speaks in one pass.
            let doc = ui.document.lock().unwrap();
            let text = script_text(&doc);
            let mut r = Value::obj();
            r.set("text", Value::str(&text));
            r.set(
                "lines",
                Value::Int(text.lines().filter(|l| !l.trim().is_empty()).count() as i64),
            );
            r.set("words", Value::Int(doc.project().words().len() as i64));
            Response::json(200, r.to_string_pretty(false))
        }
        ("POST", "/api/synthesize") => {
            // The same tool the MCP server exposes: on-device TTS in this
            // process, a WAV in the bundle, the timeline re-fitted to it.
            let body = String::from_utf8_lossy(&request.body);
            let args = if body.trim().is_empty() {
                Value::obj()
            } else {
                match Value::parse(&body) {
                    Ok(v) => v,
                    Err(e) => {
                        return Response::json(400, json_error("badRequest", &format!("bad JSON: {e}")))
                    }
                }
            };
            let Some(base) = project_base(&ui.project_path) else {
                return Response::json(
                    400,
                    json_error("badRequest", "narration needs an on-disk project (screenwords app)"),
                );
            };
            let text = args
                .get("text")
                .and_then(Value::as_str)
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            // A throwaway server handle: `call_tool` only needs the bundle path
            // and the shared document, so the editor and MCP share one path.
            let (server, _) = McpServer::new_shared(ui.document.clone(), Some(base));
            let result = (|| -> Result<Value, EditError> {
                let mut doc = ui.document.lock().unwrap();
                let current = script_text(&doc);
                if text.is_empty() {
                    if current.trim().is_empty() {
                        return Err(EditError::Validation {
                            path: "text".into(),
                            message: "write the narration first".into(),
                        });
                    }
                } else if squeeze(&current) != squeeze(&text) {
                    // "Generate" writes the script too, so a new text is one
                    // action: transcript first, then the voice reads it. The
                    // replace flag is what makes it a rewrite, not a second
                    // transcript appended to the first.
                    let mut author = Value::obj();
                    author.set("text", Value::str(&text));
                    author.set("replace", Value::Bool(true));
                    doc.apply_edits(
                        Some("author_transcript"),
                        None,
                        &[EditOp::new("author_transcript", author)],
                    )?;
                }
                let mut synth = Value::obj();
                for key in ["lang", "voice", "voices", "bed", "seed"] {
                    if let Some(v) = args.get(key) {
                        synth.set(key, v.clone());
                    }
                }
                let mut out = crate::server::call_tool(&server, &mut doc, "synthesize_speech", &synth)?;
                out.set(
                    "transcriptUpdated",
                    Value::Bool(!text.is_empty() && squeeze(&current) != squeeze(&text)),
                );
                Ok(out)
            })();
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(400, error_json(&e)),
            }
        }
        ("POST", "/api/cut") => {
            // Dry run: a clone of the document; the file on disk never changes.
            let body = String::from_utf8_lossy(&request.body);
            let args = match Value::parse(&body) {
                Ok(v) => v,
                Err(e) => return Response::json(200, format!("{{\"error\":\"bad JSON: {e}\"}}")),
            };
            let doc = ui.document.lock().unwrap().project().clone();
            let words_before = doc.words().len();
            let mut document = Document::new(doc);
            let mut cut = Value::obj();
            cut.set(
                "start",
                args.get("start").cloned().unwrap_or(Value::Null),
            );
            cut.set("end", args.get("end").cloned().unwrap_or(Value::Null));
            match document.apply_edits(Some("dry-run cut"), None, &[EditOp::new("cut_range", cut)]) {
                Ok(result) => {
                    let after = document.project();
                    let mut r = Value::obj();
                    r.set("ok", Value::Bool(true));
                    r.set("revision", Value::Int(result.revision as i64));
                    r.set("wordsBefore", Value::Int(words_before as i64));
                    r.set("wordsAfter", Value::Int(after.words().len() as i64));
                    r.set(
                        "cutPoints",
                        Value::Array(result.cuts.iter().map(|c| Value::from_f64(*c)).collect()),
                    );
                    Response::json(200, r.to_string_pretty(false))
                }
                Err(e) => Response::json(200, error_json(&e)),
            }
        }
        ("GET", "/api/catalog") => {
            let cats: Vec<Value> = crate::catalog::CATALOG
                .iter()
                .map(|(cat, ids)| {
                    let mut o = Value::obj();
                    o.set("id", Value::str(cat));
                    o.set("category", Value::str(cat));
                    o.set("count", Value::Int(ids.len() as i64));
                    o
                })
                .collect();
            let total = crate::catalog::all_ids().len();
            let mut items = Vec::with_capacity(total);
            for (cat, ids) in crate::catalog::CATALOG {
                for id in *ids {
                    let mut o = Value::obj();
                    o.set("id", Value::str(id));
                    o.set("category", Value::str(cat));
                    o.set("summary", Value::str(&format!("{id} ({cat})")));
                    items.push(o);
                }
            }
            let mut r = Value::obj();
            r.set("total", Value::Int(total as i64));
            r.set("categories", Value::Array(cats));
            r.set("components", Value::Array(items));
            Response::json(200, r.to_string_pretty(false))
        }
        ("GET", "/api/themes") => {
            let mut presets = Vec::with_capacity(crate::theme::PRESETS.len());
            for p in crate::theme::PRESETS {
                let mut o = Value::obj();
                o.set("name", Value::str(p.name));
                o.set("description", Value::str(p.description));
                if let Ok(parsed) = Value::parse(p.json) {
                    for key in ["paper", "ink", "accent", "accent2", "accentInk"] {
                        if let Some(v) = parsed.get(key) {
                            o.set(key, v.clone());
                        }
                    }
                    o.set("theme", parsed);
                }
                presets.push(o);
            }
            let current = {
                let doc = ui.document.lock().unwrap();
                doc.project()
                    .root
                    .get("settings")
                    .and_then(|s| s.get("theme"))
                    .cloned()
                    .or_else(|| Value::parse(crate::theme::DEFAULT).ok())
                    .unwrap_or_else(Value::obj)
            };
            let mut r = Value::obj();
            r.set("presets", Value::Array(presets));
            r.set("current", current);
            Response::json(200, r.to_string_pretty(false))
        }
        ("POST", "/api/theme") => {
            let body = String::from_utf8_lossy(&request.body);
            let args = match Value::parse(&body) {
                Ok(v) => v,
                Err(e) => return Response::json(400, json_error("badRequest", &format!("bad JSON: {e}"))),
            };
            let base = project_base(&ui.project_path).filter(|p| !p.as_os_str().is_empty() && p.exists());
            let (server, _) = McpServer::new_shared(ui.document.clone(), base);
            let result = {
                let mut doc = ui.document.lock().unwrap();
                match crate::server::call_tool(&server, &mut doc, "set_theme", &args) {
                    Ok(mut out) => {
                        let theme_snapshot = out.clone();
                        out.set("theme", theme_snapshot);
                        out.set("canUndo", Value::Bool(doc.can_undo()));
                        out.set("canRedo", Value::Bool(doc.can_redo()));
                        Ok(out)
                    }
                    Err(e) => Err(e),
                }
            };
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(400, error_json(&e)),
            }
        }
        ("POST", "/api/edit") => {
            let body = String::from_utf8_lossy(&request.body);
            let args = match Value::parse(&body) {
                Ok(v) => v,
                Err(e) => return Response::json(400, json_error("badRequest", &format!("bad JSON: {e}"))),
            };
            let edit_args = if args.get("edits").is_some() {
                args
            } else if let Some(tool) = args.get("tool").and_then(Value::as_str) {
                let mut op_args = args.get("arguments").cloned().unwrap_or_else(Value::obj);
                if op_args.get("ref").is_none() {
                    op_args.set("ref", Value::str("item"));
                }
                let mut op = Value::obj();
                op.set("tool", Value::str(tool));
                op.set("arguments", op_args);
                let mut wrapped = Value::obj();
                wrapped.set(
                    "label",
                    Value::str(args.get("label").and_then(Value::as_str).unwrap_or(tool)),
                );
                if let Some(rev) = args.get("ifRevision") {
                    wrapped.set("ifRevision", rev.clone());
                }
                wrapped.set("edits", Value::Array(vec![op]));
                wrapped
            } else {
                return Response::json(
                    400,
                    json_error("validationFailed", "give {tool, arguments} or {edits: [...]}"),
                );
            };
            let base = project_base(&ui.project_path).filter(|p| !p.as_os_str().is_empty() && p.exists());
            let (server, _) = McpServer::new_shared(ui.document.clone(), base);
            let result = {
                let mut doc = ui.document.lock().unwrap();
                let words_before = doc.project().words().len();
                match crate::server::call_tool(&server, &mut doc, "apply_edits", &edit_args) {
                    Ok(mut out) => {
                        let words_after = doc.project().words().len();
                        let mut res_obj = Value::obj();
                        res_obj.set("wordsBefore", Value::Int(words_before as i64));
                        res_obj.set("wordsAfter", Value::Int(words_after as i64));
                        if let Some(first) = out
                            .get("createdIds")
                            .and_then(Value::as_array)
                            .and_then(|a| a.first())
                            .and_then(Value::as_object)
                            .and_then(|o| o.first())
                        {
                            res_obj.set("id", first.1.clone());
                        }
                        out.set("result", res_obj);
                        out.set("ok", Value::Bool(true));
                        out.set("canUndo", Value::Bool(doc.can_undo()));
                        out.set("canRedo", Value::Bool(doc.can_redo()));
                        Ok(out)
                    }
                    Err(e) => Err(e),
                }
            };
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(400, error_json(&e)),
            }
        }
        ("POST", "/api/undo") => {
            let body = String::from_utf8_lossy(&request.body);
            let args = if body.trim().is_empty() {
                Value::obj()
            } else {
                match Value::parse(&body) {
                    Ok(v) => v,
                    Err(e) => return Response::json(400, json_error("badRequest", &format!("bad JSON: {e}"))),
                }
            };
            let base = project_base(&ui.project_path).filter(|p| !p.as_os_str().is_empty() && p.exists());
            let (server, _) = McpServer::new_shared(ui.document.clone(), base);
            let result = {
                let mut doc = ui.document.lock().unwrap();
                match crate::server::call_tool(&server, &mut doc, "undo", &args) {
                    Ok(mut out) => {
                        out.set("ok", Value::Bool(true));
                        out.set("canUndo", Value::Bool(doc.can_undo()));
                        out.set("canRedo", Value::Bool(doc.can_redo()));
                        Ok(out)
                    }
                    Err(e) => Err(e),
                }
            };
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(400, error_json(&e)),
            }
        }
        ("POST", "/api/redo") => {
            let base = project_base(&ui.project_path).filter(|p| !p.as_os_str().is_empty() && p.exists());
            let (server, _) = McpServer::new_shared(ui.document.clone(), base);
            let result = {
                let mut doc = ui.document.lock().unwrap();
                match crate::server::call_tool(&server, &mut doc, "redo", &Value::obj()) {
                    Ok(mut out) => {
                        out.set("ok", Value::Bool(true));
                        out.set("canUndo", Value::Bool(doc.can_undo()));
                        out.set("canRedo", Value::Bool(doc.can_redo()));
                        Ok(out)
                    }
                    Err(e) => Err(e),
                }
            };
            match result {
                Ok(v) => Response::json(200, v.to_string_pretty(false)),
                Err(e) => Response::json(400, error_json(&e)),
            }
        }
        ("GET", "/api/history") => {
            let limit = request.query_param("limit").and_then(|v| v.parse::<usize>().ok());
            let body = {
                let doc = ui.document.lock().unwrap();
                reads::get_history(&doc, limit).to_string_pretty(false)
            };
            Response::json(200, body)
        }
        ("GET", _) => Response::text(404, "not found"),
        _ => Response::text(405, "method not allowed"),
    }
}

fn error_json(e: &EditError) -> String {
    json_error(e.code(), &e.message())
}

/// The four frame presets the editor offers, as (label, width, height).
pub const FRAME_PRESETS: &[(&str, f64, f64)] = &[
    ("9:16", 1080.0, 1920.0),  // Shorts / Reels / TikTok
    ("16:9", 1920.0, 1080.0),  // YouTube / landscape
    ("1:1", 1080.0, 1080.0),   // square feed
    ("4:5", 1080.0, 1350.0),   // Instagram portrait
];

/// Resolve `{preset}` or `{width, height}` to an even frame within bounds.
fn frame_size(args: &Value) -> Result<(f64, f64), String> {
    let preset = args.get("preset").and_then(Value::as_str);
    let pair = match preset {
        Some(name) => FRAME_PRESETS
            .iter()
            .find(|(label, _, _)| *label == name)
            .map(|(_, w, h)| (*w, *h))
            .ok_or_else(|| {
                format!(
                    "no frame preset '{name}'; pick one of {}",
                    FRAME_PRESETS.iter().map(|(l, _, _)| *l).collect::<Vec<_>>().join(", ")
                )
            })?,
        None => {
            let number = |key: &str| args.get(key).and_then(Value::as_f64).or_else(|| args.get(key).and_then(Value::as_i64).map(|v| v as f64));
            match (number("width"), number("height")) {
                (Some(w), Some(h)) => (w, h),
                _ => return Err("give a preset, or width and height in pixels".into()),
            }
        }
    };
    let (w, h) = pair;
    for (label, v) in [("width", w), ("height", h)] {
        if !(16.0..=7680.0).contains(&v) {
            return Err(format!("{label} must be 16-7680 px"));
        }
        if v.fract() != 0.0 {
            return Err(format!("{label} must be a whole number of pixels"));
        }
        if (v as i64) % 2 != 0 {
            return Err(format!("{label} must be even (video encoders need it)"));
        }
    }
    Ok((w, h))
}

/// One render at a time: Chrome + ffmpeg are heavy and the second caller
/// would only fight the first for the debugging port.
static MP4_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// The deliverable player: the self-contained page `screenwords render`
/// writes, saved next to the project as `<slug>.html`.
pub fn export_player(project: &crate::project::Project, base: &std::path::Path) -> Result<Value, String> {
    let html = crate::render::render_html_in(project, Some(base));
    let name = format!("{}.html", slug(project.name()));
    let path = base.join(&name);
    std::fs::write(&path, html.as_bytes()).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    let mut r = Value::obj();
    r.set("name", Value::str(&name));
    r.set("path", Value::str(&path.to_string_lossy()));
    r.set("bytes", Value::Int(html.len() as i64));
    let duration = crate::render::render_data_in(project, Some(base)).get("duration").and_then(Value::as_f64).unwrap_or(0.0);
    r.set("durationSeconds", Value::from_f64((duration * 100.0).round() / 100.0));
    Ok(r)
}

/// A real render to `<slug>.mp4` next to the project: headless Chrome draws
/// every frame at i/fps, ffmpeg encodes, and the narration embedded in the
/// page is muxed in. One render at a time.
pub fn render_video(project: &crate::project::Project, base: &std::path::Path) -> Result<Value, String> {
    if MP4_BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return Err("a render is already running".into());
    }
    let result = (|| -> Result<Value, String> {
        let html = crate::render::render_html_in(project, Some(base));
        let slug = slug(project.name());
        let player = base.join(format!(".{slug}-player.html"));
        std::fs::write(&player, html.as_bytes()).map_err(|e| format!("cannot write the player: {e}"))?;
        let mp4 = base.join(format!("{slug}.mp4"));
        let tool = render_tool()?;
        let out = std::process::Command::new("node")
            .arg(&tool)
            .arg("--html")
            .arg(&player)
            .arg("--out")
            .arg(&mp4)
            .arg("--fps")
            .arg(format!("{:.0}", project.settings().fps()))
            // frames are independent: spread them over 4 browsers
            .arg("--workers")
            .arg("4")
            .output()
            .map_err(|e| format!("cannot start node: {e}"))?;
        let _ = std::fs::remove_file(&player);
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("render failed: {}", err.trim().lines().last().unwrap_or("no output")));
        }
        let bytes = std::fs::metadata(&mp4).map(|m| m.len()).unwrap_or(0);
        let mut r = Value::obj();
        r.set("name", Value::str(&format!("{slug}.mp4")));
        r.set("path", Value::str(&mp4.to_string_lossy()));
        r.set("bytes", Value::Int(bytes as i64));
        r.set(
            "durationSeconds",
            Value::from_f64(project.settings().target_duration().map(|t| t.seconds()).unwrap_or(0.0)),
        );
        Ok(r)
    })();
    MP4_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
    result
}

/// Where tools/render-mp4.mjs lives: next to the binary, or in the source tree
/// when running out of target/debug.
fn render_tool() -> Result<std::path::PathBuf, String> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        candidates.push(dir.join("tools").join("render-mp4.mjs"));
        candidates.push(dir.join("..").join("..").join("tools").join("render-mp4.mjs"));
    }
    candidates.push(std::path::PathBuf::from("tools/render-mp4.mjs"));
    candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| "tools/render-mp4.mjs not found (run from the repository or install it next to the binary)".to_string())
}

/// A file-safe name for the exported video: "A Short History" ->
/// "a-short-history". Falls back to "story" when a name has no usable chars.
fn slug(name: &str) -> String {
    let mut out = String::new();
    let mut dash = false;
    for ch in name.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            dash = false;
        } else if !out.is_empty() && !dash {
            out.push('-');
            dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() { "story".into() } else { trimmed }
}

/// Optional frame rate: whole numbers only, 1-120, like `set_project_settings`.
fn frame_rate(args: &Value) -> Result<Option<f64>, String> {
    let Some(raw) = args.get("fps").and_then(Value::as_f64).or_else(|| args.get("fps").and_then(Value::as_i64).map(|v| v as f64)) else {
        return Ok(None);
    };
    if !(1.0..=120.0).contains(&raw) {
        return Err("fps must be 1-120".into());
    }
    if raw.fract() != 0.0 {
        return Err("fps must be a whole number".into());
    }
    Ok(Some(raw))
}

/// The narration as plain text, one sentence (segment) per line.
///
/// Built from the WORDS, not the segment copy: a segment's `text` is stored
/// with punctuation stripped, and punctuation is what tells the authoring step
/// where sentences end. Reading the words keeps the panel showing exactly what
/// the voice will speak.
fn script_text(doc: &Document) -> String {
    let p = doc.project();
    let p_words = p.words();
    let word_map: std::collections::HashMap<&str, &str> =
        p_words.iter().map(|w| (w.id(), w.text())).collect();
    let Some(segs) = p
        .transcripts()
        .first()
        .and_then(|t| t.get("segments"))
        .and_then(Value::as_array)
    else {
        return String::new();
    };
    let mut lines: Vec<String> = Vec::new();
    for seg in segs {
        let joined = seg
            .get("wordIds")
            .and_then(Value::as_array)
            .map(|ids| {
                ids.iter()
                    .filter_map(|v| v.as_str())
                    .filter_map(|id| word_map.get(id).copied())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        if !joined.is_empty() {
            lines.push(joined);
        } else if let Some(text) = seg.get("text").and_then(Value::as_str) {
            lines.push(text.to_string());
        }
    }
    lines.join("\n")
}

/// Compare scripts by content, not line breaks or double spaces: re-submitting
/// the untouched panel must not rewrite the transcript.
fn squeeze(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn json_error(code: &str, message: &str) -> String {
    let mut o = Value::obj();
    o.set("error", Value::str(code));
    o.set("message", Value::str(message));
    o.to_string_pretty(false)
}

/// The directory a bundle-relative asset path is resolved against: the bundle
/// folder itself, or the directory holding a bare `project.json`.
fn project_base(path: &str) -> Option<std::path::PathBuf> {
    let p = std::path::Path::new(path);
    if p.is_dir() {
        Some(p.to_path_buf())
    } else {
        p.parent().map(|d| d.to_path_buf())
    }
}

fn resolve_asset_path(src: &str, base: Option<&std::path::Path>) -> std::path::PathBuf {
    let p = std::path::Path::new(src);
    if p.is_absolute() {
        return p.to_path_buf();
    }
    match base {
        Some(base) => base.join(p),
        None => p.to_path_buf(),
    }
}

fn audio_content_type(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
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

/// Split `data:<mime>;base64,<payload>` into the media type and its bytes.
fn data_uri(uri: &str) -> Option<(String, Vec<u8>)> {
    let rest = uri.strip_prefix("data:")?;
    let (meta, payload) = rest.split_once(',')?;
    let mime = meta.strip_suffix(";base64")?;
    let bytes = crate::render::base64_decode(payload)?;
    Some((mime.to_string(), bytes))
}

fn asset_label(asset: &Value, fallback: &str) -> String {
    if let Some(name) = asset.get("name").and_then(Value::as_str) {
        if !name.is_empty() {
            return name.to_string();
        }
    }
    if let Some(src) = asset.get("source").and_then(|s| s.get("path")).and_then(Value::as_str) {
        if let Some(name) = std::path::Path::new(src).file_name().and_then(|n| n.to_str()) {
            return name.to_string();
        }
    }
    fallback.to_string()
}

enum RangeSpec {
    Full,
    Partial(usize, usize),
    Unsatisfiable,
}

/// RFC 7233 single range. Multiple ranges are answered with the first; a
/// syntactically invalid or out-of-bounds range is unsatisfiable.
fn parse_range(header: Option<&str>, len: usize) -> RangeSpec {
    let Some(value) = header else { return RangeSpec::Full };
    let Some(spec) = value.trim().strip_prefix("bytes=") else {
        return RangeSpec::Full;
    };
    let first = spec.split(',').next().unwrap_or("").trim();
    let Some((from, to)) = first.split_once('-') else {
        return RangeSpec::Unsatisfiable;
    };
    if len == 0 {
        return RangeSpec::Unsatisfiable;
    }
    let (start, end) = if from.is_empty() {
        let Ok(suffix) = to.trim().parse::<usize>() else {
            return RangeSpec::Unsatisfiable;
        };
        if suffix == 0 {
            return RangeSpec::Unsatisfiable;
        }
        (len.saturating_sub(suffix), len - 1)
    } else {
        let Ok(start) = from.trim().parse::<usize>() else {
            return RangeSpec::Unsatisfiable;
        };
        let end = if to.trim().is_empty() {
            len - 1
        } else {
            let Ok(end) = to.trim().parse::<usize>() else {
                return RangeSpec::Unsatisfiable;
            };
            end.min(len - 1)
        };
        (start, end)
    };
    if start >= len || start > end {
        RangeSpec::Unsatisfiable
    } else {
        RangeSpec::Partial(start, end)
    }
}

/// The editor page, kept as an asset so it stays plain HTML.
const PAGE: &str = include_str!("assets/editor.html");

/// The editor page with the shared component library injected.
fn page_html() -> &'static str {
    static PAGE_HTML: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    PAGE_HTML.get_or_init(|| {
        PAGE.replace(crate::render::COMPONENTS_MARKER, crate::render::COMPONENTS)
            .replace(crate::render::FONTS_MARKER, crate::render::FONTS)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges_resolve_like_a_browser_expects() {
        assert!(matches!(parse_range(None, 100), RangeSpec::Full));
        assert!(matches!(parse_range(Some("bytes=0-9"), 100), RangeSpec::Partial(0, 9)));
        assert!(matches!(parse_range(Some("bytes=10-"), 100), RangeSpec::Partial(10, 99)));
        assert!(matches!(parse_range(Some("bytes=-10"), 100), RangeSpec::Partial(90, 99)));
        assert!(matches!(parse_range(Some("bytes=0-500"), 100), RangeSpec::Partial(0, 99)));
        assert!(matches!(parse_range(Some("bytes=200-300"), 100), RangeSpec::Unsatisfiable));
        assert!(matches!(parse_range(Some("bytes=-0"), 100), RangeSpec::Unsatisfiable));
        assert!(matches!(parse_range(Some("bytes=x-y"), 100), RangeSpec::Unsatisfiable));
        assert!(matches!(parse_range(Some("bytes=0-0"), 0), RangeSpec::Unsatisfiable));
    }

    #[test]
    fn audio_content_types_follow_the_extension() {
        use std::path::Path;
        assert_eq!(audio_content_type(Path::new("a/b/narration.wav")), "audio/wav");
        assert_eq!(audio_content_type(Path::new("voice.MP3")), "audio/mpeg");
        assert_eq!(audio_content_type(Path::new("a.caf")), "audio/aiff");
        assert_eq!(audio_content_type(Path::new("blob")), "application/octet-stream");
    }

    #[test]
    fn editor_has_no_placeholder_content_constants() {
        for needle in ["p.text || 'SA'", "'starlight'", "'SUBSCRIBE'", "p.chapter || 'chapter'"] {
            assert!(!PAGE.contains(needle), "placeholder constant remains: {needle}");
        }
    }

    fn request(method: &str, path: &str, body: &str) -> Request {
        Request {
            method: method.into(),
            path: path.into(),
            query: Vec::new(),
            headers: vec![("content-type".into(), "application/json".into())],
            body: body.as_bytes().to_vec(),
        }
    }

    fn ui_for(document: Document, project_path: &str) -> Ui {
        Ui {
            document: std::sync::Arc::new(Mutex::new(document)),
            project_path: project_path.into(),
        }
    }

    #[test]
    fn the_editor_offers_narration_generation() {
        // Script box, one language picker, one button: the panel stays small.
        let page = page_html();
        assert!(page.contains("data-tab=\"voice\""), "no Voice tab");
        assert!(page.contains("id=\"tts-text\""), "no script box to write into");
        assert!(page.contains("id=\"tts-lang\""), "no language picker");
        assert!(page.contains("id=\"ttsgo\">Generate<"), "no generate button");
        assert!(page.contains("'/api/synthesize'"), "the button does not call the route");
        assert!(page.contains("'/api/script'"), "the script box is not hydrated");
        // Phonon has voice styles per .bin prompt; EMA Lightning has one sound.
        assert!(page.contains("id=\"tts-voice\""), "no English voice picker");
        assert!(page.contains("'/api/voices'"), "the voice picker is not hydrated");
    }

    fn authored(text: &str) -> Document {
        let mut args = Value::obj();
        args.set("text", Value::str(text));
        let mut doc = Document::new(crate::server::blank_project("script", true));
        doc.apply_edits(Some("author_transcript"), None, &[EditOp::new("author_transcript", args)])
            .unwrap();
        doc
    }

    #[test]
    fn the_voice_route_lists_the_staged_english_prompts() {
        let ui = ui_for(Document::new(crate::server::blank_project("voices", true)), "voices");
        let res = handle(&ui, &request("GET", "/api/voices", ""));
        assert_eq!(res.status, 200);
        let body = String::from_utf8_lossy(&res.body).to_string();
        let json = Value::parse(&body).unwrap();
        let voices: Vec<String> = json
            .get("voices")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
            .unwrap_or_default();
        assert!(voices.contains(&"easton".to_string()), "{body}");
        assert!(voices.len() >= 2, "only one English style staged: {body}");
    }

    #[test]
    fn the_script_route_returns_one_sentence_per_line() {
        let ui = ui_for(authored("First sentence. Second one here."), "script");
        let res = handle(&ui, &request("GET", "/api/script", ""));
        assert_eq!(res.status, 200);
        let body = String::from_utf8_lossy(&res.body);
        let json: Value = Value::parse(&body).unwrap();
        assert_eq!(json.get("lines").and_then(Value::as_i64), Some(2), "{body}");
        let text = json.get("text").and_then(Value::as_str).unwrap_or("");
        assert_eq!(text.lines().count(), 2, "{text}");
        assert!(text.contains("Second one here"), "{text}");
    }

    #[test]
    fn export_writes_the_deliverable_and_render_serves_it() {
        let dir = std::env::temp_dir().join(format!("sw-export-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut doc = Document::new(crate::server::blank_project("Blank", true));
        doc.apply_edits(
            Some("name"),
            None,
            &[EditOp::new(
                "set_project_settings",
                Value::parse("{\"name\":\"A Short History\"}").unwrap(),
            )],
        )
        .unwrap();
        let ui = ui_for(doc, &dir.to_string_lossy());

        // nothing written yet
        let res = handle(&ui, &request("GET", "/render", ""));
        assert_eq!(res.status, 404);

        let res = handle(&ui, &request("POST", "/api/export", ""));
        let body = String::from_utf8_lossy(&res.body).to_string();
        assert_eq!(res.status, 200, "{body}");
        let json = Value::parse(&body).unwrap();
        assert_eq!(json.get("name").and_then(Value::as_str), Some("a-short-history.html"));
        assert!(json.get("bytes").and_then(Value::as_i64).unwrap_or(0) > 10_000, "{body}");

        let file = dir.join("a-short-history.html");
        let written = std::fs::read_to_string(&file).expect("video file on disk");
        assert!(!written.contains("__DATA__"), "the template was not filled");
        assert!(written.contains("A Short History"), "the render has no project data");

        // served bytes are the saved file, byte for byte
        let res = handle(&ui, &request("GET", "/render", ""));
        assert_eq!(res.status, 200);
        assert_eq!(String::from_utf8_lossy(&res.body).len(), written.len());

        // ?download=1 on the HTML player still asks the browser to save
        let mut req = request("GET", "/render", "");   // path and query are split, as httpd does
        req.query = vec![("download".into(), "1".into())];
        let res = handle(&ui, &req);
        assert_eq!(res.status, 200);
        assert!(
            res.extra_headers.iter().any(|(k, v)| k.eq_ignore_ascii_case("content-disposition")
                && v.contains("attachment") && v.contains("a-short-history.html")),
            "no attachment header: {:?}",
            res.extra_headers
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_rendered_mp4_is_advertised_and_served() {
        let dir = std::env::temp_dir().join(format!("sw-mp4-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let mut doc = Document::new(crate::server::blank_project("Blank", true));
        doc.apply_edits(
            Some("name"),
            None,
            &[EditOp::new(
                "set_project_settings",
                Value::parse("{\"name\":\"A Short History\"}").unwrap(),
            )],
        )
        .unwrap();
        let ui = ui_for(doc, &dir.to_string_lossy());

        // before a render: no summary entry, 404 from the video route
        let res = handle(&ui, &request("GET", "/api/summary", ""));
        let early = Value::parse(&String::from_utf8_lossy(&res.body)).unwrap();
        assert!(early.get("video").is_none(), "summary claims a video before any render");
        assert_eq!(handle(&ui, &request("GET", "/video", "")).status, 404);

        std::fs::write(dir.join("a-short-history.mp4"), b"fake mp4 bytes").unwrap();

        let res = handle(&ui, &request("GET", "/api/summary", ""));
        let summary = Value::parse(&String::from_utf8_lossy(&res.body)).unwrap();
        let video = summary.get("video").expect("summary has no video after a render");
        assert_eq!(video.get("name").and_then(Value::as_str), Some("a-short-history.mp4"));

        let res = handle(&ui, &request("GET", "/video", ""));
        assert_eq!(res.status, 200);
        assert_eq!(res.content_type, "video/mp4");

        let mut req = request("GET", "/video", "");
        req.query = vec![("download".into(), "1".into())];
        let res = handle(&ui, &req);
        assert!(res.extra_headers.iter().any(|(k, v)| k.eq_ignore_ascii_case("content-disposition")
            && v.contains("attachment") && v.contains("a-short-history.mp4")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_render_helper_is_found_from_the_project() {
        assert!(render_tool().is_ok(), "tools/render-mp4.mjs is missing");
    }

    #[test]
    fn the_header_offers_a_download_once_a_video_exists() {
        let page = page_html();
        assert!(page.contains("id=\"dlbtn\""), "no download link");
        assert!(page.contains("'/video?download=1'"), "the link does not download the MP4");
        assert!(page.contains("s.video"), "the link is not driven by the summary");
    }

    #[test]
    fn the_header_offers_preview_and_create_video() {
        let page = page_html();
        assert!(page.contains("Open preview"), "the preview button keeps the old name");
        assert!(!page.contains("Open render"), "the old button name is still there");
        assert!(page.contains("id=\"exportbtn\""), "no render button");
        assert!(page.contains(">Render MP4<"), "the button is not named Render MP4");
        assert!(page.contains("'/api/render-mp4'"), "the button does not call the render route");
    }

    #[test]
    fn frame_rate_is_optional_whole_and_bounded() {
        let args = |json: &str| Value::parse(json).unwrap();
        assert_eq!(frame_rate(&args(r#"{}"#)).unwrap(), None);
        assert_eq!(frame_rate(&args(r#"{"fps":24}"#)).unwrap(), Some(24.0));
        assert_eq!(frame_rate(&args(r#"{"fps":59.94}"#)).unwrap_err(), "fps must be a whole number");
        assert_eq!(frame_rate(&args(r#"{"fps":0}"#)).unwrap_err(), "fps must be 1-120");
        assert_eq!(frame_rate(&args(r#"{"fps":240}"#)).unwrap_err(), "fps must be 1-120");
    }

    #[test]
    fn frame_route_also_sets_the_frame_rate() {
        let dir = std::env::temp_dir().join(format!("sw-fps-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ui = ui_for(Document::new(crate::server::blank_project("fps", true)), &dir.to_string_lossy());

        let res = handle(&ui, &request("POST", "/api/frame", "{\"preset\":\"9:16\",\"fps\":24}"));
        let body = String::from_utf8_lossy(&res.body).to_string();
        assert_eq!(res.status, 200, "{body}");
        let json = Value::parse(&body).unwrap();
        assert_eq!(json.get("fps").and_then(Value::as_f64), Some(24.0), "{body}");
        let saved = std::fs::read_to_string(dir.join("project.json")).unwrap();
        assert!(saved.contains("\"numerator\" : 24"), "fps was not persisted: {saved}");

        let res = handle(&ui, &request("POST", "/api/frame", "{\"preset\":\"9:16\",\"fps\":59.94}"));
        assert_eq!(res.status, 400);
        assert!(String::from_utf8_lossy(&res.body).contains("whole number"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn frame_presets_resolve_and_custom_sizes_are_checked() {
        let args = |json: &str| Value::parse(json).unwrap();
        assert_eq!(frame_size(&args(r#"{"preset":"9:16"}"#)).unwrap(), (1080.0, 1920.0));
        assert_eq!(frame_size(&args(r#"{"preset":"16:9"}"#)).unwrap(), (1920.0, 1080.0));
        assert_eq!(frame_size(&args(r#"{"preset":"1:1"}"#)).unwrap(), (1080.0, 1080.0));
        assert_eq!(frame_size(&args(r#"{"preset":"4:5"}"#)).unwrap(), (1080.0, 1350.0));
        assert_eq!(frame_size(&args(r#"{"width":720,"height":1280}"#)).unwrap(), (720.0, 1280.0));
        // odd, out of range, fractional, unknown preset, and nothing at all
        assert!(frame_size(&args(r#"{"width":1081,"height":1920}"#)).unwrap_err().contains("even"));
        assert!(frame_size(&args(r#"{"width":8,"height":1920}"#)).unwrap_err().contains("16-7680"));
        assert!(frame_size(&args(r#"{"width":1080.5,"height":1920}"#)).unwrap_err().contains("whole"));
        assert!(frame_size(&args(r#"{"preset":"21:9"}"#)).unwrap_err().contains("no frame preset"));
        assert!(frame_size(&args(r#"{}"#)).unwrap_err().contains("preset"));
    }

    #[test]
    fn the_frame_route_resizes_and_persists() {
        let dir = std::env::temp_dir().join(format!("sw-frame-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ui = ui_for(Document::new(crate::server::blank_project("frame", true)), &dir.to_string_lossy());

        let res = handle(&ui, &request("POST", "/api/frame", "{\"preset\":\"16:9\"}"));
        let body = String::from_utf8_lossy(&res.body).to_string();
        assert_eq!(res.status, 200, "{body}");
        let json = Value::parse(&body).unwrap();
        assert_eq!(json.get("width").and_then(Value::as_f64), Some(1920.0), "{body}");
        assert_eq!(json.get("height").and_then(Value::as_f64), Some(1080.0), "{body}");

        let saved = std::fs::read_to_string(dir.join("project.json")).unwrap();
        assert!(saved.contains("\"width\" : 1920"), "the new frame was not persisted");
        // one undo step, and odd sizes are refused before anything changes
        ui.document.lock().unwrap().undo(Some("set frame")).unwrap();
        let res = handle(&ui, &request("POST", "/api/frame", "{\"width\":1081,\"height\":1920}"));
        assert_eq!(res.status, 400);
        assert!(String::from_utf8_lossy(&res.body).contains("even"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_inspector_offers_frame_presets() {
        let page = page_html();
        assert!(page.contains("id=\"ratio-row\""), "no preset row");
        for ratio in ["1080x1920", "1920x1080", "1080x1080", "1080x1350"] {
            assert!(page.contains(&format!("data-ratio=\"{ratio}\"")), "missing preset {ratio}");
        }
        assert!(page.contains("id=\"frame-w\""), "no custom width");
        assert!(page.contains("'/api/frame'"), "the controls do not call the route");
    }

    #[test]
    fn an_unchanged_script_is_not_rewritten() {
        // Line breaks and runs of spaces are formatting, not content: pressing
        // Generate twice must not re-author the transcript.
        assert_eq!(squeeze("a b.\n\nc  d"), squeeze("a b. c d"));
        assert_ne!(squeeze("a b"), squeeze("a b c"));
        assert_eq!(squeeze("  \n "), "");
    }

    #[test]
    fn an_empty_script_is_refused_before_touching_anything() {
        let ui = ui_for(Document::new(crate::server::blank_project("empty", true)), "empty");
        let res = handle(&ui, &request("POST", "/api/synthesize", "{\"lang\":\"en\",\"text\":\"   \"}"));
        assert_eq!(res.status, 400, "{}", String::from_utf8_lossy(&res.body));
        assert!(
            String::from_utf8_lossy(&res.body).contains("write the narration first"),
            "{}",
            String::from_utf8_lossy(&res.body)
        );
    }

    #[test]
    fn narration_without_a_transcript_is_refused_with_a_reason() {
        let ui = ui_for(Document::new(crate::server::blank_project("empty", true)), "empty");
        let res = handle(&ui, &request("POST", "/api/synthesize", "{\"lang\":\"en\"}"));
        assert_eq!(res.status, 400, "{}", String::from_utf8_lossy(&res.body));
        let body = String::from_utf8_lossy(&res.body);
        assert!(body.contains("write the narration first"), "{body}");
    }

    #[test]
    fn narration_writes_the_wav_and_persists_the_retimed_project() {
        // The real route: on-device TTS, file on disk, document committed.
        if !crate::tts::models_dir().join("en").join("flow_lm_main.onnx").exists() {
            return; // models not staged: skip
        }
        let dir = std::env::temp_dir().join(format!("sw-narration-ui-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let mut doc = Document::new(crate::server::blank_project("narration", true));
        doc.apply_edits(
            Some("author_transcript"),
            None,
            &[EditOp::new(
                "author_transcript",
                Value::parse("{\"text\":\"A short test line. Then a second one.\"}").unwrap(),
            )],
        )
        .unwrap();
        let before = doc.project().settings().target_duration().map(|t| t.seconds()).unwrap_or(0.0);

        let ui = ui_for(doc, &dir.to_string_lossy());
        let res = handle(&ui, &request("POST", "/api/synthesize", "{\"lang\":\"en\",\"voice\":\"easton\"}"));
        let body = String::from_utf8_lossy(&res.body);
        assert_eq!(res.status, 200, "{body}");
        assert!(body.contains("\"assetId\" : \"ast_en\""), "{body}");
        assert!(body.contains("\"embedded\" : true"), "{body}");
        assert!(body.contains("\"sampleRate\" : 24000"), "{body}");

        // The narration is embedded in the document: no sidecar WAV, so a
        // bundle can be moved or opened from any directory.
        assert!(!dir.join("assets").join("narration-en.wav").exists(), "a sidecar wav was written");
        let saved = std::fs::read_to_string(dir.join("project.json")).expect("project.json persisted");
        assert!(saved.contains("data:audio/wav;base64,"), "narration was not embedded");
        assert!(!saved.contains("\"path\""), "the audio asset still points at a file");

        // The editor's player streams the same embedded bytes.
        let audio = handle(&ui, &request("GET", "/api/audio", ""));
        assert_eq!(audio.status, 200);
        assert_eq!(&audio.body[0..4], b"RIFF");
        assert!(audio.body.len() > 44, "embedded wav has no samples");
        assert!(saved.contains("aud_narration_en"), "voice event was not saved");
        let doc = ui.document.lock().unwrap();
        let after = doc.project().settings().target_duration().map(|t| t.seconds()).unwrap_or(0.0);
        assert!(after > 0.0, "target duration was not fitted to the audio");
        assert!((after - before).abs() > 0.001, "the story did not re-time to the real speech");
        drop(doc);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn generating_from_new_text_rewrites_the_transcript_and_speaks_it() {
        if !crate::tts::models_dir().join("en").join("flow_lm_main.onnx").exists() {
            return; // models not staged: skip
        }
        let dir = std::env::temp_dir().join(format!("sw-narration-new-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let ui = ui_for(authored("Old line."), &dir.to_string_lossy());
        let body = "{\"lang\":\"en\",\"text\":\"A brand new line. And one more.\"}";
        let res = handle(&ui, &request("POST", "/api/synthesize", body));
        let out = String::from_utf8_lossy(&res.body).to_string();
        assert_eq!(res.status, 200, "{out}");
        let json = Value::parse(&out).unwrap();
        assert_eq!(json.get("transcriptUpdated").and_then(Value::as_bool), Some(true), "{out}");
        assert!(json.get("durationSeconds").and_then(Value::as_f64).unwrap_or(0.0) > 0.0, "{out}");

        let doc = ui.document.lock().unwrap();
        let script = script_text(&doc);
        assert!(script.contains("brand new line"), "{script}");
        assert!(!script.contains("Old line"), "the old script survived: {script}");
        assert_eq!(doc.project().words().len(), 7, "the transcript was not re-authored");
        drop(doc);

        let saved = std::fs::read_to_string(dir.join("project.json")).unwrap();
        assert!(saved.contains("brand new line"), "the new script was not persisted");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_editor_script_only_references_elements_that_exist() {
        // A `$('#id')` for an id the page never declares aborts the whole
        // script at that point — keep the two in sync.
        let mut ids: Vec<&str> = Vec::new();
        for (offset, _) in PAGE.match_indices("id=\"") {
            let rest = &PAGE[offset + 4..];
            if let Some(end) = rest.find('"') {
                ids.push(&rest[..end]);
            }
        }
        for (offset, _) in PAGE.match_indices("$('#") {
            let rest = &PAGE[offset + 4..];
            let Some(end) = rest.find('\'') else { continue };
            let id = &rest[..end];
            assert!(ids.contains(&id), "editor.html references #{id} but never declares it");
        }
    }

    #[test]
    fn catalog_route_exposes_all_categories_and_components() {
        let ui = ui_for(Document::new(crate::server::blank_project("cat", true)), "cat");
        let res = handle(&ui, &request("GET", "/api/catalog", ""));
        assert_eq!(res.status, 200);
        let json = Value::parse(&String::from_utf8_lossy(&res.body)).unwrap();
        assert_eq!(json.get("total").and_then(Value::as_i64), Some(602));
        let cats = json.get("categories").and_then(Value::as_array).unwrap();
        assert_eq!(cats.len(), 9);
        let comps = json.get("components").and_then(Value::as_array).unwrap();
        assert_eq!(comps.len(), 602);
    }

    #[test]
    fn theme_routes_list_presets_and_apply_undoable_themes() {
        let dir = std::env::temp_dir().join(format!("sw-theme-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ui = ui_for(Document::new(crate::server::blank_project("theme", true)), &dir.to_string_lossy());

        let res = handle(&ui, &request("GET", "/api/themes", ""));
        assert_eq!(res.status, 200);
        let list = Value::parse(&String::from_utf8_lossy(&res.body)).unwrap();
        assert_eq!(list.get("presets").and_then(Value::as_array).map(<[Value]>::len), Some(8));

        let res = handle(&ui, &request("POST", "/api/theme", r##"{"preset":"editorial","accent":"#FF3366"}"##));
        let body = String::from_utf8_lossy(&res.body).to_string();
        assert_eq!(res.status, 200, "{body}");
        let applied = Value::parse(&body).unwrap();
        assert_eq!(applied.get("revision").and_then(Value::as_i64), Some(2));
        let theme = applied.get("theme").unwrap();
        assert_eq!(theme.get("accent").and_then(Value::as_str), Some("#FF3366"));
        assert_eq!(theme.get("paper").and_then(Value::as_str), Some("#F6F1E7"));

        // Undo restores the initial theme and revision 1
        let undo_res = handle(&ui, &request("POST", "/api/undo", "{}"));
        assert_eq!(undo_res.status, 200);
        let undo_json = Value::parse(&String::from_utf8_lossy(&undo_res.body)).unwrap();
        assert_eq!(undo_json.get("revision").and_then(Value::as_i64), Some(1));
        assert_eq!(undo_json.get("canRedo").and_then(Value::as_bool), Some(true));

        // Redo reapplies revision 2
        let redo_res = handle(&ui, &request("POST", "/api/redo", "{}"));
        assert_eq!(redo_res.status, 200);
        let redo_json = Value::parse(&String::from_utf8_lossy(&redo_res.body)).unwrap();
        assert_eq!(redo_json.get("revision").and_then(Value::as_i64), Some(2));

        let bad = handle(&ui, &request("POST", "/api/theme", r#"{"preset":"nonexistent"}"#));
        assert_eq!(bad.status, 400);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn edit_and_history_routes_support_component_track_and_chapter_workflows() {
        let dir = std::env::temp_dir().join(format!("sw-edit-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let ui = ui_for(authored("Hello world. Testing edits now."), &dir.to_string_lossy());

        // 1. Add a component via /api/edit
        let add_body = r##"{"tool":"add_component","arguments":{"componentId":"statBadge","timing":{"start":1.0,"end":3.5},"position":{"x":0.4,"y":0.6},"params":{"title":"99%"}},"label":"add statBadge"}"##;
        let res = handle(&ui, &request("POST", "/api/edit", add_body));
        let body = String::from_utf8_lossy(&res.body).to_string();
        assert_eq!(res.status, 200, "{body}");
        let json = Value::parse(&body).unwrap();
        let comp_id = json
            .get("result")
            .and_then(|r| r.get("id"))
            .and_then(Value::as_str)
            .unwrap()
            .to_string();

        // 2. Update the component via /api/edit
        let upd_body = format!(
            r##"{{"tool":"update_component","arguments":{{"id":"{comp_id}","zIndex":5,"params":{{"title":"100%"}}}},"label":"update statBadge"}}"##
        );
        let res = handle(&ui, &request("POST", "/api/edit", &upd_body));
        assert_eq!(res.status, 200);

        // 3. Add a chapter via /api/edit
        let chap_body = r#"{"tool":"add_chapter","arguments":{"title":"Intro","start":0.0},"label":"add Intro"}"#;
        let res = handle(&ui, &request("POST", "/api/edit", chap_body));
        assert_eq!(res.status, 200);

        // 4. Correct transcript word via /api/edit
        let corr_body = r#"{"tool":"correct_transcript","arguments":{"edits":[{"wordId":"w1","text":"Greetings"}]},"label":"fix w1"}"#;
        let res = handle(&ui, &request("POST", "/api/edit", corr_body));
        assert_eq!(res.status, 200);

        // 5. Check history endpoint
        let hist_res = handle(&ui, &request("GET", "/api/history", ""));
        assert_eq!(hist_res.status, 200);
        let hist_json = Value::parse(&String::from_utf8_lossy(&hist_res.body)).unwrap();
        let steps = hist_json.get("history").and_then(Value::as_array).unwrap();
        assert!(steps.len() >= 4);

        // 6. Verify timeline exposes position and zIndex on the updated component
        let tl_res = handle(&ui, &request("GET", "/api/timeline", ""));
        let tl_body = String::from_utf8_lossy(&tl_res.body);
        assert!(tl_body.contains("\"zIndex\" : 5"), "{tl_body}");
        assert!(tl_body.contains("\"100%\""), "{tl_body}");

        // 7. Remove the component
        let del_body = format!(r#"{{"tool":"remove_component","arguments":{{"id":"{comp_id}"}}}}"#);
        let res = handle(&ui, &request("POST", "/api/edit", &del_body));
        assert_eq!(res.status, 200);

        let _ = std::fs::remove_dir_all(&dir);
    }
}
