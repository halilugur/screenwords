//! Looking at the film before rendering it, and bringing pictures into it.
//!
//! `preview_frames` draws a handful of moments exactly as the MP4 render
//! would (tools/preview-frames.mjs: the same player page, the same
//! deterministic `t`) and returns them as one contact sheet, together with
//! what the pixels say: every component is also painted alone and the box it
//! really covered is measured, so "the title runs off the right edge" or
//! "this painted nothing" is a fact read from the frame, not an estimate
//! from its params. A component whose design is to cross the edge says so
//! with `params.bleed` and is not reported for it.
//!
//! `import_image` puts a picture into the bundle's `media/` folder — a local
//! file, an image URL, or a screenshot of a web page
//! (tools/capture-page.mjs) — and returns the short relative `src` a
//! component takes; the renderer embeds it when the film is exported.

use crate::json::Value;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// Where a tools/*.mjs script lives: next to the binary, or in the source
/// tree when running out of target/{debug,release}.
pub(crate) fn tool_path(name: &str) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())) {
        candidates.push(dir.join("tools").join(name));
        candidates.push(dir.join("..").join("..").join("tools").join(name));
    }
    candidates.push(Path::new(env!("CARGO_MANIFEST_DIR")).join("tools").join(name));
    candidates.push(PathBuf::from("tools").join(name));
    candidates
        .into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| format!("tools/{name} not found (run from the repository or install it next to the binary)"))
}

/// The moments worth looking at when the caller names none: one inside every
/// stretch of the timeline where the set of components on screen is the same,
/// a little past its middle so entrance animations have finished. At most
/// `max`, spread evenly over the film.
pub fn auto_times(data: &Value, max: usize) -> Vec<f64> {
    let duration = data.get("duration").and_then(Value::as_f64).unwrap_or(0.0).max(0.0);
    let mut cuts: Vec<f64> = vec![0.0, duration];
    for c in data.get("components").and_then(Value::as_array).unwrap_or(&[]) {
        for key in ["start", "end"] {
            if let Some(t) = c.get(key).and_then(Value::as_f64) {
                cuts.push(t.clamp(0.0, duration));
            }
        }
    }
    cuts.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mut times: Vec<f64> = Vec::new();
    for pair in cuts.windows(2) {
        let len = pair[1] - pair[0];
        if len >= 0.3 {
            times.push(((pair[0] + len * 0.6) * 100.0).round() / 100.0);
        }
    }
    if times.is_empty() {
        times.push((duration / 2.0 * 100.0).round() / 100.0);
    }
    if times.len() > max && max > 0 {
        let n = times.len();
        times = (0..max).map(|i| times[i * (n - 1) / (max - 1).max(1)]).collect();
        times.dedup();
    }
    times
}

struct Seen {
    id: String,
    component_id: String,
    rect: Option<[f64; 4]>,
    cover: f64,
    start: f64,
    end: f64,
    /// `params.bleed`: it is meant to run to, or past, the frame's edge.
    bleed: bool,
    error: Option<String>,
}

fn seen_of(row: &Value) -> Seen {
    let rect = row.get("box").filter(|b| !b.is_null()).map(|b| {
        let n = |k: &str| b.get(k).and_then(Value::as_f64).unwrap_or(0.0);
        [n("x"), n("y"), n("w"), n("h")]
    });
    Seen {
        id: row.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
        component_id: row.get("componentId").and_then(Value::as_str).unwrap_or("").to_string(),
        rect,
        cover: row.get("cover").and_then(Value::as_f64).unwrap_or(0.0),
        start: row.get("start").and_then(Value::as_f64).unwrap_or(0.0),
        end: row.get("end").and_then(Value::as_f64).unwrap_or(f64::MAX),
        bleed: row.get("bleed").and_then(Value::as_bool).unwrap_or(false),
        error: row.get("error").and_then(Value::as_str).map(str::to_string),
    }
}

/// Whether a component is something placed in the frame (a title, a card, a
/// drawing) rather than the frame itself (a background, a camera move, an
/// effect, a transition, a whole scene).
fn is_placed(s: &Seen) -> bool {
    let whole_frame = matches!(
        crate::catalog::category_of(&s.component_id),
        Some("background" | "transform" | "effect" | "transition" | "scene")
    );
    !whole_frame && s.cover < 0.8
}

/// What the measured frames say is wrong (`problems`: a component leaves the
/// frame, painted nothing, or threw) and what is worth a look (`overlaps`:
/// two placed components covering each other — wanted for text on a card,
/// a mistake for a title under the captions). One line per finding, at the
/// first moment it shows.
pub fn layout_notes(frames: &[Value]) -> (Vec<String>, Vec<String>) {
    let mut problems: Vec<(String, String)> = Vec::new();
    let mut overlaps: Vec<(String, String)> = Vec::new();
    let note = |list: &mut Vec<(String, String)>, key: String, text: String| {
        if !list.iter().any(|(k, _)| *k == key) {
            list.push((key, text));
        }
    };
    for frame in frames {
        let t = frame.get("time").and_then(Value::as_f64).unwrap_or(0.0);
        let rows: Vec<Seen> = frame.get("components").and_then(Value::as_array).unwrap_or(&[]).iter().map(seen_of).collect();
        for s in &rows {
            let who = format!("{} ({})", s.component_id, s.id);
            if let Some(err) = &s.error {
                note(&mut problems, format!("{}:threw", s.id), format!("{who} threw at {t}s: {err}"));
            }
            if !is_placed(s) {
                continue;
            }
            match s.rect {
                // Where it sits against the edge is its design, not a slip.
                Some(_) if s.bleed => {}
                Some([x, y, w, h]) => {
                    let mut sides: Vec<String> = Vec::new();
                    let pct = |v: f64| (v * 100.0).round() as i64;
                    if x < -0.01 {
                        sides.push(format!("{}% of the width past the left edge", pct(-x)));
                    }
                    if x + w > 1.01 {
                        sides.push(format!("{}% of the width past the right edge", pct(x + w - 1.0)));
                    }
                    if y < -0.01 {
                        sides.push(format!("{}% of the height past the top edge", pct(-y)));
                    }
                    if y + h > 1.01 {
                        sides.push(format!("{}% of the height past the bottom edge", pct(y + h - 1.0)));
                    }
                    if !sides.is_empty() {
                        note(
                            &mut problems,
                            format!("{}:off", s.id),
                            format!("{who} runs off the frame at {t}s: {} (make it smaller or move it)", sides.join(", ")),
                        );
                    } else {
                        // Inside the frame but hard against one side: glow,
                        // stroke and the emphasised word's scale spill over,
                        // and a phone's rounded corners eat the rest.
                        let mut tight: Vec<&str> = Vec::new();
                        // Something that spans the frame evenly is meant to;
                        // one that is off-centre into a side is not.
                        let (left, right) = (x, 1.0 - (x + w));
                        if left < 0.015 && right - left > 0.02 {
                            tight.push("left");
                        }
                        if right < 0.015 && left - right > 0.02 {
                            tight.push("right");
                        }
                        if !tight.is_empty() {
                            note(
                                &mut problems,
                                format!("{}:tight", s.id),
                                format!("{who} sits against the {} edge at {t}s with no margin (make it smaller)", tight.join(" and ")),
                            );
                        }
                    }
                }
                None => {
                    // Captions are empty between phrases; anything else that
                    // is well inside its window and shows nothing is broken.
                    let caption = crate::catalog::category_of(&s.component_id) == Some("caption");
                    if !caption && t - s.start > 0.6 && s.end - t > 0.6 {
                        note(
                            &mut problems,
                            format!("{}:blank", s.id),
                            format!("{who} painted nothing at {t}s (list_components {{componentId}} shows the params it reads)"),
                        );
                    }
                }
            }
        }
        let placed: Vec<&Seen> = rows.iter().filter(|s| is_placed(s) && s.rect.is_some()).collect();
        for (i, a) in placed.iter().enumerate() {
            for b in placed.iter().skip(i + 1) {
                let (ra, rb) = (a.rect.unwrap(), b.rect.unwrap());
                let ix = (ra[0] + ra[2]).min(rb[0] + rb[2]) - ra[0].max(rb[0]);
                let iy = (ra[1] + ra[3]).min(rb[1] + rb[3]) - ra[1].max(rb[1]);
                let smaller = (ra[2] * ra[3]).min(rb[2] * rb[3]);
                if ix <= 0.0 || iy <= 0.0 || smaller <= 0.0 {
                    continue;
                }
                let share = ix * iy / smaller;
                if share >= 0.3 {
                    note(
                        &mut overlaps,
                        format!("{}+{}", a.id, b.id),
                        format!(
                            "{} ({}) and {} ({}) overlap at {t}s ({}% of the smaller one)",
                            a.component_id,
                            a.id,
                            b.component_id,
                            b.id,
                            (share * 100.0).round() as i64
                        ),
                    );
                }
            }
        }
    }
    (problems.into_iter().map(|(_, t)| t).collect(), overlaps.into_iter().map(|(_, t)| t).collect())
}

static PREVIEW_BUSY: AtomicBool = AtomicBool::new(false);

/// `preview_frames {times?, scale?}`: PNGs of the given moments (or of every
/// distinct stretch of the film) in `<bundle>/.preview/`, one contact sheet
/// of all of them, the measured box of every component in each, and the
/// problems and overlaps read from those boxes.
pub fn preview_frames(project: &crate::project::Project, base: &Path, args: &Value) -> Result<Value, String> {
    let data = crate::render::render_data_in(project, Some(base));
    let duration = data.get("duration").and_then(Value::as_f64).unwrap_or(0.0);
    let mut times: Vec<f64> = match args.get("times") {
        Some(Value::Array(list)) => list.iter().filter_map(Value::as_f64).filter(|t| *t >= 0.0).collect(),
        Some(other) if !other.is_null() => return Err("times must be an array of seconds, e.g. [0.8, 3.2]".into()),
        _ => Vec::new(),
    };
    if times.is_empty() {
        times = auto_times(&data, 12);
    }
    if times.len() > 24 {
        return Err(format!("{} times; at most 24 per call", times.len()));
    }
    let width = project.settings().width().max(1) as f64;
    let height = project.settings().height().max(1) as f64;
    // A sheet about 2400 px wide however many frames it holds.
    let per_row = times.len().min(if width > height { 3 } else { 6 }) as f64;
    let scale = match args.get("scale").and_then(Value::as_f64) {
        Some(s) => s.clamp(0.1, 1.0),
        None => (2400.0 / per_row / width).clamp(0.15, 0.5),
    };
    if PREVIEW_BUSY.swap(true, Ordering::SeqCst) {
        return Err("a preview is already running".into());
    }
    let result = (|| -> Result<Value, String> {
        let tool = tool_path("preview-frames.mjs")?;
        let html = crate::render::render_html_in(project, Some(base));
        let player = base.join(".preview-player.html");
        std::fs::write(&player, html.as_bytes()).map_err(|e| format!("cannot write the player: {e}"))?;
        let out_dir = base.join(".preview");
        // Only this call's frames are in the folder afterwards.
        let _ = std::fs::remove_dir_all(&out_dir);
        let out = std::process::Command::new("node")
            .arg(&tool)
            .arg("--html")
            .arg(&player)
            .arg("--out-dir")
            .arg(&out_dir)
            .arg("--name")
            .arg("frame")
            .arg("--scale")
            .arg(format!("{scale:.3}"))
            .arg("--times")
            .arg(times.iter().map(|t| format!("{t:.3}")).collect::<Vec<_>>().join(","))
            .output()
            .map_err(|e| format!("cannot start node: {e}"));
        let _ = std::fs::remove_file(&player);
        let out = out?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(err.trim().lines().last().unwrap_or("preview failed with no output").to_string());
        }
        let stdout = String::from_utf8_lossy(&out.stdout);
        let report = stdout
            .lines()
            .rev()
            .find_map(|l| Value::parse(l.trim()).ok())
            .ok_or_else(|| "the preview tool printed no report".to_string())?;
        let frames: Vec<Value> = report.get("frames").and_then(Value::as_array).map(|f| f.to_vec()).unwrap_or_default();
        let (problems, overlaps) = layout_notes(&frames);
        let mut r = Value::obj();
        r.set("sheet", report.get("sheet").cloned().unwrap_or(Value::Null));
        r.set("durationSeconds", Value::from_f64((duration * 100.0).round() / 100.0));
        r.set("frames", Value::Array(frames.iter().map(slim_frame).collect()));
        r.set("problems", Value::Array(problems.iter().map(|p| Value::str(p)).collect()));
        r.set("overlaps", Value::Array(overlaps.iter().map(|p| Value::str(p)).collect()));
        r.set(
            "next",
            Value::str("Open the sheet image and look at it: the boxes catch what leaves the frame, not what looks dull or crowded. box is {x, y, w, h} in 0-1 of the frame, measured from the pixels the component painted."),
        );
        Ok(r)
    })();
    PREVIEW_BUSY.store(false, Ordering::SeqCst);
    result
}

/// A frame of the report without the fields only `layout_notes` needs.
fn slim_frame(frame: &Value) -> Value {
    let mut f = Value::obj();
    f.set("time", frame.get("time").cloned().unwrap_or(Value::Null));
    f.set("path", frame.get("path").cloned().unwrap_or(Value::Null));
    let rows = frame.get("components").and_then(Value::as_array).unwrap_or(&[]);
    f.set(
        "components",
        Value::Array(
            rows.iter()
                .map(|row| {
                    let mut o = Value::obj();
                    o.set("id", row.get("id").cloned().unwrap_or(Value::Null));
                    o.set("componentId", row.get("componentId").cloned().unwrap_or(Value::Null));
                    o.set("box", row.get("box").cloned().unwrap_or(Value::Null));
                    o
                })
                .collect(),
        ),
    );
    f
}

/// The image kinds a component can show, by the bytes they start with.
pub(crate) fn image_kind(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        Some(("png", "image/png"))
    } else if bytes.starts_with(&[0xFF, 0xD8]) {
        Some(("jpg", "image/jpeg"))
    } else if bytes.starts_with(b"RIFF") && bytes.len() > 12 && &bytes[8..12] == b"WEBP" {
        Some(("webp", "image/webp"))
    } else if bytes.starts_with(b"GIF8") {
        Some(("gif", "image/gif"))
    } else {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(400)]).to_lowercase();
        (head.contains("<svg")).then_some(("svg", "image/svg+xml"))
    }
}

/// The mime type of a bundle image path, from its extension.
pub(crate) fn image_mime_of(path: &str) -> Option<&'static str> {
    let ext = path.rsplit('.').next()?.to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}

/// PNG pixel size, read from the header.
fn png_size(bytes: &[u8]) -> Option<(i64, i64)> {
    if bytes.len() < 24 || !bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        return None;
    }
    let n = |i: usize| i64::from(u32::from_be_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]));
    Some((n(16), n(20)))
}

const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;

/// `import_image {file | url | page, name?, width?, height?, full?}`: the
/// picture lands in `<bundle>/media/<name>.<ext>` and the result carries the
/// relative `src` to give a component. `fetch` downloads an image URL (the
/// server's HTTPS client).
pub fn import_image(
    base: &Path,
    args: &Value,
    fetch: &dyn Fn(&str) -> Result<Vec<u8>, String>,
) -> Result<Value, String> {
    let text = |k: &str| args.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty());
    let (file, url, page) = (text("file"), text("url"), text("page"));
    if [file, url, page].iter().filter(|s| s.is_some()).count() != 1 {
        return Err("give exactly one of file (a local image), url (an image URL) or page (a web page to screenshot)".into());
    }
    let mut title = String::new();
    let bytes: Vec<u8> = if let Some(page) = page {
        if !(page.starts_with("https://") || page.starts_with("http://")) {
            return Err("page must be an http(s) URL".into());
        }
        let tool = tool_path("capture-page.mjs")?;
        let shot = std::env::temp_dir().join(format!("sw-shot-{}-{}.png", std::process::id(), base.to_string_lossy().len()));
        let mut cmd = std::process::Command::new("node");
        cmd.arg(&tool).arg("--url").arg(page).arg("--out").arg(&shot);
        for (key, flag) in [("width", "--width"), ("height", "--height"), ("scale", "--scale"), ("wait", "--wait")] {
            if let Some(n) = args.get(key).and_then(Value::as_f64) {
                cmd.arg(flag).arg(format!("{n}"));
            }
        }
        if args.get("full").and_then(Value::as_bool).unwrap_or(false) {
            cmd.arg("--full");
        }
        let out = cmd.output().map_err(|e| format!("cannot start node: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(err.trim().lines().last().unwrap_or("capture failed with no output").to_string());
        }
        if let Some(report) = String::from_utf8_lossy(&out.stdout).lines().rev().find_map(|l| Value::parse(l.trim()).ok()) {
            title = report.get("title").and_then(Value::as_str).unwrap_or("").to_string();
        }
        let bytes = std::fs::read(&shot).map_err(|e| format!("the screenshot was not written: {e}"))?;
        let _ = std::fs::remove_file(&shot);
        bytes
    } else if let Some(file) = file {
        std::fs::read(file).map_err(|e| format!("cannot read {file}: {e}"))?
    } else {
        fetch(url.unwrap())?
    };
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!("the image is {} MB; at most 12 MB", bytes.len() / (1024 * 1024)));
    }
    let Some((ext, _)) = image_kind(&bytes) else {
        return Err("that is not a PNG, JPEG, WebP, GIF or SVG image".into());
    };
    let wanted = text("name").map(str::to_string).unwrap_or_else(|| {
        let from = file.or(url).or(page).unwrap_or("image");
        let last = from.trim_end_matches('/').rsplit('/').next().unwrap_or("image");
        let last = last.split(['?', '#']).next().unwrap_or(last);
        let stem = last.rsplit_once('.').map(|(s, _)| s).unwrap_or(last);
        if page.is_some() { format!("page-{}", from.split("//").nth(1).unwrap_or(from)) } else { stem.to_string() }
    });
    let mut name = crate::ui::slug(&wanted);
    name.truncate(48);
    let dir = base.join("media");
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let path = dir.join(format!("{name}.{ext}"));
    std::fs::write(&path, &bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    let src = format!("media/{name}.{ext}");
    let mut r = Value::obj();
    r.set("src", Value::str(&src));
    r.set("path", Value::str(&path.to_string_lossy()));
    r.set("bytes", Value::Int(bytes.len() as i64));
    if let Some((w, h)) = png_size(&bytes) {
        r.set("width", Value::Int(w));
        r.set("height", Value::Int(h));
    }
    if !title.is_empty() {
        r.set("title", Value::str(&title));
    }
    r.set(
        "use",
        Value::str(&format!(
            "add_component imageOverlay {{params: {{src: '{src}', width, height}}}} shows it framed; in a code overlay pass it as a param ({{image: '{src}'}}) and draw it with sw.image(ctx, params.image, x, y, w, h, {{radius, fit: 'cover' | 'contain', focus: {{x, y}}, zoom}}) — focus and zoom move across a screenshot. It is embedded when the film is exported."
        )),
    );
    Ok(r)
}

/// A bundle-relative image path (`media/shot.png`) as the image itself, a
/// data URI. None for anything else: a URL, a data URI, a path that climbs
/// out of the bundle or is absolute, a missing or oversized file.
fn local_image_uri(path: &str, base: &Path) -> Option<String> {
    let local = !path.contains("://") && !path.starts_with("data:") && !path.contains("..") && path.len() < 300 && !path.contains('\n');
    let mime = image_mime_of(path).filter(|_| local && !Path::new(path).is_absolute())?;
    let bytes = std::fs::read(base.join(path)).ok().filter(|b| b.len() <= MAX_IMAGE_BYTES)?;
    Some(format!("data:{mime};base64,{}", crate::render::base64_encode(&bytes)))
}

/// Markup or CSS with the bundle images it points at (`src="media/a.png"`,
/// `url(media/a.png)`) embedded. None when it points at none.
fn embed_in_markup(text: &str, base: &Path) -> Option<String> {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    let mut changed = false;
    while let Some(at) = ["src=\"", "src='", "url(\"", "url('", "url("].iter().filter_map(|open| rest.find(open).map(|i| (i, *open))).min() {
        let (index, open) = at;
        let close = match open.chars().last() {
            Some('(') => ')',
            Some(quote) => quote,
            None => break,
        };
        let from = index + open.len();
        let Some(length) = rest[from..].find(close) else {
            break;
        };
        out.push_str(&rest[..from]);
        let path = &rest[from..from + length];
        match local_image_uri(path, base) {
            Some(uri) => {
                out.push_str(&uri);
                changed = true;
            }
            None => out.push_str(path),
        }
        rest = &rest[from + length..];
    }
    out.push_str(rest);
    changed.then_some(out)
}

/// Replaces every bundle-relative image path in a component's params — a
/// param that is one (`media/shot.png`), or one named inside markup or CSS —
/// with the image itself, so the exported player and the rendered video
/// carry their pictures with them.
pub(crate) fn embed_local_images(value: &mut Value, base: &Path) {
    match value {
        Value::Str(s) => {
            if let Some(embedded) = local_image_uri(s, base).or_else(|| embed_in_markup(s, base)) {
                *s = embedded;
            }
        }
        Value::Array(items) => items.iter_mut().for_each(|v| embed_local_images(v, base)),
        Value::Object(entries) => entries.iter_mut().for_each(|(_, v)| embed_local_images(v, base)),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(time: f64, rows: &str) -> Value {
        Value::parse(&format!(r#"{{"time": {time}, "path": "f.png", "components": {rows}}}"#)).unwrap()
    }

    #[test]
    fn a_moment_is_picked_inside_every_distinct_stretch() {
        // The sample film: a background for all of it, a title over the
        // first words, four badges that pile up, a closing title.
        let data = Value::parse(
            r#"{"duration": 12.4, "components": [
            {"start": 0, "end": 12.4}, {"start": 0, "end": 1.68}, {"start": 1.85, "end": 4.23},
            {"start": 4.4, "end": 9.47}, {"start": 5.53, "end": 9.47}, {"start": 6.69, "end": 9.47},
            {"start": 8.18, "end": 9.47}, {"start": 9.64, "end": 12.3}]}"#,
        )
        .unwrap();
        let times = auto_times(&data, 12);
        // One per stretch that lasts: title, statement, 1..4 badges, closing.
        assert_eq!(times.len(), 7, "{times:?}");
        assert!(times[0] > 0.5 && times[0] < 1.68, "the first look is inside the title: {times:?}");
        assert!(times.iter().any(|t| *t > 8.18 && *t < 9.47), "all four badges are seen together: {times:?}");
        assert!(times.windows(2).all(|p| p[0] < p[1]));
        // A long film is thinned to the cap, first and last kept.
        let mut many = String::from(r#"{"duration": 100, "components": ["#);
        for i in 0..40 {
            many.push_str(&format!(r#"{{"start": {}, "end": {}}},"#, i * 2, i * 2 + 2));
        }
        many.push_str(r#"{"start": 80, "end": 100}]}"#);
        let thinned = auto_times(&Value::parse(&many).unwrap(), 12);
        assert!(thinned.len() <= 12 && thinned[0] < 2.0 && *thinned.last().unwrap() > 80.0, "{thinned:?}");
        assert_eq!(auto_times(&Value::parse(r#"{"duration": 4}"#).unwrap(), 12), vec![2.4]);
    }

    #[test]
    fn measured_boxes_become_problems_and_overlaps() {
        // Boxes as tools/preview-frames.mjs measured them on the sample film
        // while its title was too large: 104 px type ran off both sides.
        let frames = vec![
            frame(
                0.8,
                r#"[{"id": "cmp_bg", "componentId": "meshBackground", "box": null, "cover": 0, "start": 0, "end": 12.4},
                {"id": "cmp_t", "componentId": "kickerTitle", "box": {"x": -0.031, "y": 0.26, "w": 1.062, "h": 0.063}, "cover": 0.06, "start": 0, "end": 1.68},
                {"id": "cmp_k", "componentId": "kineticWords", "box": {"x": 0.082, "y": 0.771, "w": 0.85, "h": 0.051}, "cover": 0.043, "start": 0, "end": 12.2}]"#,
            ),
            frame(
                1.2,
                r#"[{"id": "cmp_t", "componentId": "kickerTitle", "box": {"x": -0.031, "y": 0.26, "w": 1.062, "h": 0.063}, "cover": 0.06, "start": 0, "end": 1.68}]"#,
            ),
        ];
        let (problems, overlaps) = layout_notes(&frames);
        assert_eq!(problems.len(), 1, "one line per component, not per frame: {problems:?}");
        assert!(problems[0].contains("kickerTitle (cmp_t)") && problems[0].contains("left edge") && problems[0].contains("right edge"), "{problems:?}");
        assert!(overlaps.is_empty(), "{overlaps:?}");

        // A title set where the captions are, a card that shows nothing, a
        // drawing that threw, and a background that is never a problem.
        let frames = vec![frame(
            5.0,
            r#"[{"id": "cmp_bg", "componentId": "auroraBackground", "box": {"x": -0.3, "y": -0.3, "w": 1.6, "h": 1.6}, "cover": 1, "start": 0, "end": 12},
            {"id": "cmp_t", "componentId": "gradientTitle", "box": {"x": 0.1, "y": 0.76, "w": 0.8, "h": 0.05}, "cover": 0.04, "start": 4, "end": 9},
            {"id": "cmp_k", "componentId": "kineticWords", "box": {"x": 0.08, "y": 0.75, "w": 0.85, "h": 0.1}, "cover": 0.085, "start": 0, "end": 12},
            {"id": "cmp_s", "componentId": "statBadge", "box": null, "cover": 0, "start": 2, "end": 9},
            {"id": "cmp_c", "componentId": "codeOverlay_intro", "box": null, "cover": 0, "start": 4.8, "end": 9, "error": "x is not defined"},
            {"id": "cmp_p", "componentId": "punchIn", "box": null, "cover": 0, "start": 2, "end": 9}]"#,
        )];
        let (problems, overlaps) = layout_notes(&frames);
        assert_eq!(overlaps.len(), 1, "{overlaps:?}");
        assert!(overlaps[0].contains("gradientTitle") && overlaps[0].contains("kineticWords") && overlaps[0].contains("100%"), "{overlaps:?}");
        assert!(problems.iter().any(|p| p.contains("statBadge (cmp_s) painted nothing")), "{problems:?}");
        assert!(problems.iter().any(|p| p.contains("codeOverlay_intro (cmp_c) threw") && p.contains("x is not defined")), "{problems:?}");
        assert!(!problems.iter().any(|p| p.contains("auroraBackground") || p.contains("punchIn")), "{problems:?}");
        // A caption whose emphasised last word reaches the right edge (as the
        // sample film's did at 12.55 s), next to one with room on both sides.
        let frames = vec![frame(
            12.55,
            r#"[{"id": "cmp_k", "componentId": "kineticWords", "box": {"x": 0.045, "y": 0.797, "w": 0.954, "h": 0.072}, "cover": 0.07, "start": 0, "end": 17},
            {"id": "cmp_ok", "componentId": "kickerTitle", "box": {"x": 0.08, "y": 0.3, "w": 0.84, "h": 0.06}, "cover": 0.05, "start": 0, "end": 17}]"#,
        )];
        let (tight, _) = layout_notes(&frames);
        assert_eq!(tight.len(), 1, "{tight:?}");
        assert!(tight[0].contains("kineticWords (cmp_k) sits against the right edge"), "{tight:?}");
        // A film strip that scrolls across the whole width and a body flying
        // in from outside the frame, both marked as meant to: no finding. The
        // same boxes unmarked are two.
        let rows = |bleed: bool| {
            vec![frame(
                13.4,
                &format!(
                    r#"[{{"id": "cmp_strip", "componentId": "codeOverlay_render", "box": {{"x": -0.3, "y": 0.5, "w": 1.54, "h": 0.12}}, "cover": 0.12, "start": 12, "end": 15, "bleed": {bleed}}},
                    {{"id": "cmp_theia", "componentId": "codeOverlay_gezegen", "box": {{"x": 0.004, "y": 0.2, "w": 0.6, "h": 0.4}}, "cover": 0.24, "start": 12, "end": 15, "bleed": {bleed}}}]"#
                ),
            )]
        };
        assert!(layout_notes(&rows(true)).0.is_empty());
        assert_eq!(layout_notes(&rows(false)).0.len(), 2);
        // The drawing only just started: blank is its entrance, not a fault.
        assert!(!problems.iter().any(|p| p.contains("cmp_c) painted nothing")), "{problems:?}");
    }

    #[test]
    fn an_imported_image_lands_in_media_and_is_embedded_on_export() {
        let dir = std::env::temp_dir().join(format!("sw-import-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        // A real 1x1 PNG, written as a file the user might hand over.
        let png: Vec<u8> = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0,
            0x1F, 0x15, 0xC4, 0x89, 0, 0, 0, 0x0D, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xF8, 0xCF, 0xC0, 0xF0, 0x1F, 0, 5, 0, 1,
            0xFF, 0x89, 0x99, 0x3D, 0x1D, 0, 0, 0, 0, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        let source = dir.join("Ana Ekran @2x.png");
        std::fs::write(&source, &png).unwrap();
        let no_fetch = |_: &str| -> Result<Vec<u8>, String> { Err("offline".into()) };

        let mut args = Value::obj();
        args.set("file", Value::str(&source.to_string_lossy()));
        let out = import_image(&dir, &args, &no_fetch).unwrap();
        assert_eq!(out.get("src").and_then(Value::as_str), Some("media/ana-ekran-2x.png"));
        assert_eq!(out.get("width").and_then(Value::as_i64), Some(1));
        assert_eq!(std::fs::read(dir.join("media/ana-ekran-2x.png")).unwrap(), png);

        // The same bytes from a URL, named by the caller.
        let mut args = Value::obj();
        args.set("url", Value::str("https://example.com/a/logo.png?v=3"));
        args.set("name", Value::str("Marka Logosu"));
        let fetched = import_image(&dir, &args, &|_| Ok(png.clone())).unwrap();
        assert_eq!(fetched.get("src").and_then(Value::as_str), Some("media/marka-logosu.png"));

        // Not an image, two sources, a non-web page: refused with the reason.
        let mut bad = Value::obj();
        bad.set("url", Value::str("https://example.com/page"));
        assert!(import_image(&dir, &bad, &|_| Ok(b"<!doctype html><html>".to_vec())).unwrap_err().contains("not a PNG"));
        bad.set("file", Value::str("x.png"));
        assert!(import_image(&dir, &bad, &no_fetch).unwrap_err().contains("exactly one"));
        let mut page = Value::obj();
        page.set("page", Value::str("file:///etc/passwd"));
        assert!(import_image(&dir, &page, &no_fetch).unwrap_err().contains("http(s)"));

        // On export the short path becomes the picture; code and URLs do not.
        let mut params = Value::parse(
            r#"{"src": "media/ana-ekran-2x.png", "layers": [{"image": "media/marka-logosu.png"}],
            "url": "https://example.com/a.png", "missing": "media/none.png", "up": "../secret.png",
            "code": "sw.image(ctx, 'media/ana-ekran-2x.png', 0, 0, 10, 10)"}"#,
        )
        .unwrap();
        embed_local_images(&mut params, &dir);
        let s = |k: &str| params.get(k).and_then(Value::as_str).unwrap().to_string();
        assert!(s("src").starts_with("data:image/png;base64,iVBORw0KGgo"), "{}", s("src"));
        let layer = params.get("layers").and_then(Value::as_array).unwrap()[0].get("image").and_then(Value::as_str).unwrap();
        assert!(layer.starts_with("data:image/png;base64,"));
        assert_eq!(s("url"), "https://example.com/a.png");
        assert_eq!(s("missing"), "media/none.png");
        assert_eq!(s("up"), "../secret.png");
        assert!(s("code").contains("'media/ana-ekran-2x.png'"));
        // An HTML scene names its pictures in markup and CSS; those are
        // embedded in place, and what is not a bundle image is left alone.
        let mut scene = Value::parse(
            r#"{"html": "<img src=\"media/ana-ekran-2x.png\" alt=\"a\"><img src='https://example.com/b.png'><img src=\"media/none.png\">",
            "css": ".hero { background: url(media/marka-logosu.png) center / cover; } .x { background: url('../up.png'); }"}"#,
        )
        .unwrap();
        embed_local_images(&mut scene, &dir);
        let html = scene.get("html").and_then(Value::as_str).unwrap();
        assert!(html.starts_with("<img src=\"data:image/png;base64,iVBORw0KGgo"), "{html}");
        assert!(html.contains("alt=\"a\"><img src='https://example.com/b.png'><img src=\"media/none.png\">"), "{html}");
        let css = scene.get("css").and_then(Value::as_str).unwrap();
        assert!(css.contains("url(data:image/png;base64,") && css.ends_with(".x { background: url('../up.png'); }"), "{css}");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
