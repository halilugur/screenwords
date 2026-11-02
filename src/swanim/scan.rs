//! Heuristic code scan mirroring the Python validator's regex pass: what the
//! render sandbox blocks (network, remote URLs, media elements), what the
//! offline import map cannot resolve, missing package files, and patterns
//! that break determinism or performance. The matchers are hand-rolled
//! (word-boundary contains, tag/attr scanning, URL scanning) rather than
//! regex-driven, but accept the same things on real overlay code.

use super::{is_scene_sized, lib_files, Report};
use crate::json::Value;

// --- tiny matcher toolkit -----------------------------------------------------------

fn is_word(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

/// `re.search(r"\bword\b")`.
fn has_word(code: &str, word: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find(word) {
        let start = from + pos;
        let end = start + word.len();
        let before_ok =
            start == 0 || !code[..start].chars().next_back().map(is_word).unwrap_or(false);
        let after_ok = code[end..].chars().next().map(|c| !is_word(c)).unwrap_or(true);
        if before_ok && after_ok {
            return true;
        }
        from = start + word.len();
    }
    false
}

/// `\bnew\s+<ident>\b`, or with `paren` also `\bnew\s+<ident>\s*\(`.
fn has_new_ident(code: &str, ident: &str, paren: bool) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find("new") {
        let start = from + pos;
        let word_before =
            start == 0 || !code[..start].chars().next_back().map(is_word).unwrap_or(false);
        if word_before {
            let rest = &code[start + 3..];
            let ws = rest.len() - rest.trim_start().len();
            if ws > 0 {
                let rest = &rest[ws..];
                if let Some(after) = rest.strip_prefix(ident) {
                    let word_ends =
                        after.chars().next().map(|c| !is_word(c)).unwrap_or(true);
                    let ok = if paren {
                        let trimmed = after.trim_start();
                        word_ends && trimmed.starts_with('(')
                    } else {
                        word_ends
                    };
                    if ok {
                        return true;
                    }
                }
            }
        }
        from = start + 3;
    }
    false
}

/// `<\s*video\b` / `<\s*audio\b` tag starts.
fn has_open_tag(code: &str, tag: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find('<') {
        let start = from + pos;
        let rest = &code[start + 1..];
        let ws = rest.len() - rest.trim_start().len();
        let rest = &rest[ws..];
        if let Some(after) = rest.strip_prefix(tag) {
            if after.chars().next().map(|c| !is_word(c)).unwrap_or(true) {
                return true;
            }
        }
        from = start + 1;
    }
    false
}

/// `\bcaches\s*\.\s*open\b`.
fn has_caches_open(code: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find("caches") {
        let start = from + pos;
        if start == 0 || !code[..start].chars().next_back().map(is_word).unwrap_or(false) {
            let rest = code[start + 6..].trim_start();
            if let Some(rest) = rest.strip_prefix('.') {
                let rest = rest.trim_start();
                if let Some(after) = rest.strip_prefix("open") {
                    if after.chars().next().map(|c| !is_word(c)).unwrap_or(true) {
                        return true;
                    }
                }
            }
        }
        from = start + 6;
    }
    false
}

/// A remote URL match: `(?:https?:)?//[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s'"`)]*`.
pub struct RemoteMatch {
    pub start: usize,
    pub url: String,
}

pub fn scan_remote(code: &str) -> Vec<RemoteMatch> {
    let bytes = code.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 1 < bytes.len() {
        if bytes[i] == b'/' && bytes[i + 1] == b'/' {
            let scheme_len = if code[..i].ends_with("https:") {
                6
            } else if code[..i].ends_with("http:") {
                5
            } else {
                0
            };
            let start = i - scheme_len;
            let host_start = i + 2;
            let mut j = host_start;
            while j < bytes.len()
                && (bytes[j].is_ascii_alphanumeric() || matches!(bytes[j], b'.' | b'-'))
            {
                j += 1;
            }
            let host = &code[host_start..j];
            // A '.' with ≥2 letters after it somewhere in the host run.
            let host_ok = host.match_indices('.').any(|(d, _)| {
                let mut chars = host[d + 1..].chars();
                chars.next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
                    && chars.next().map(|c| c.is_ascii_alphabetic()).unwrap_or(false)
            });
            if host_ok {
                let mut end = j;
                while end < bytes.len()
                    && !bytes[end].is_ascii_whitespace()
                    && !matches!(bytes[end], b'\'' | b'"' | b'`' | b')')
                {
                    end += 1;
                }
                out.push(RemoteMatch { start, url: code[start..end].to_string() });
                i = end;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// The Python context check:
/// `(src|href|url\(|import|from|fetch|@import)\s*[=(]?\s*['"]?\s*$`.
fn loads_context(code: &str, start: usize) -> bool {
    let ctx_start = start.saturating_sub(40);
    let ctx = code[ctx_start..start].to_lowercase();
    for kw in ["src", "href", "url(", "import", "from", "fetch", "@import"] {
        if let Some(pos) = ctx.rfind(kw) {
            if tail_matches_eq_quote(&ctx[pos + kw.len()..]) {
                return true;
            }
        }
    }
    false
}

/// `\s*[=(]?\s*['"]?\s*$`.
fn tail_matches_eq_quote(mut rest: &str) -> bool {
    rest = rest.trim_start();
    if let Some(stripped) = rest.strip_prefix(['=', '(']) {
        rest = stripped.trim_start();
    }
    if let Some(stripped) = rest.strip_prefix(['\'', '"']) {
        rest = stripped;
    }
    rest.trim_end().is_empty() && rest.chars().all(|c| c.is_whitespace())
}

/// Python's `resolve()`: package path of a relative URL, or None when it
/// leaves the package / is absolute / has a scheme.
pub fn resolve(base_file: &str, spec: &str) -> Option<String> {
    let spec = spec.split('?').next().unwrap_or("").split('#').next().unwrap_or("");
    if spec.starts_with('/') || has_scheme(spec) {
        return None;
    }
    let base_dir = match base_file.rfind('/') {
        Some(p) => &base_file[..p],
        None => "",
    };
    let joined = if base_dir.is_empty() {
        format!("./{spec}")
    } else {
        format!("{base_dir}/{spec}")
    };
    let mut parts: Vec<&str> = Vec::new();
    for part in joined.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if parts.is_empty() || parts.last() == Some(&"..") {
                    parts.push("..");
                } else {
                    parts.pop();
                }
            }
            p => parts.push(p),
        }
    }
    let path = parts.join("/");
    if path.starts_with("..") {
        None
    } else {
        Some(path)
    }
}

/// `^[a-z][a-z0-9+.-]*:`
fn has_scheme(spec: &str) -> bool {
    let bytes = spec.as_bytes();
    if bytes.is_empty() || !bytes[0].is_ascii_lowercase() {
        return false;
    }
    for &b in bytes.iter().skip(1) {
        if b == b':' {
            return true;
        }
        if !(b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'+' | b'-' | b'.')) {
            return false;
        }
    }
    false
}

// --- comment stripping (byte-exact, UTF-8 safe) --------------------------------------

/// Removes `//` and `/* */` comments outside strings (JS).
pub fn strip_js_comments(code: &str) -> String {
    let bytes = code.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    let mut quote: Option<u8> = None;
    while i < bytes.len() {
        let c = bytes[i];
        if let Some(q) = quote {
            out.push(c);
            if c == b'\\' && i + 1 < bytes.len() {
                out.push(bytes[i + 1]);
                i += 2;
                continue;
            }
            if c == q {
                quote = None;
            }
            i += 1;
            continue;
        }
        if c == b'\'' || c == b'"' || c == b'`' {
            quote = Some(c);
            out.push(c);
            i += 1;
            continue;
        }
        if c == b'/' && bytes.get(i + 1) == Some(&b'/') {
            match code[i..].find('\n') {
                Some(j) => i += j,
                None => break,
            }
            continue;
        }
        if c == b'/' && bytes.get(i + 1) == Some(&b'*') {
            match code[i + 2..].find("*/") {
                Some(j) => i = i + 2 + j + 2,
                None => break,
            }
            continue;
        }
        out.push(c);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn strip_block_comments(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut i = 0;
    while i < code.len() {
        if code[i..].starts_with("/*") {
            match code[i + 2..].find("*/") {
                Some(j) => i = i + 2 + j + 2,
                None => break,
            }
            continue;
        }
        let rest = &code[i..];
        let take = rest.char_indices().nth(1).map(|(n, _)| n).unwrap_or(rest.len());
        out.push_str(&rest[..take]);
        i += take;
    }
    out
}

fn strip_html_comments(code: &str) -> String {
    let mut out = String::with_capacity(code.len());
    let mut i = 0;
    while i < code.len() {
        if code[i..].starts_with("<!--") {
            match code[i + 4..].find("-->") {
                Some(j) => i = i + 4 + j + 3,
                None => break,
            }
            continue;
        }
        let rest = &code[i..];
        let take = rest.char_indices().nth(1).map(|(n, _)| n).unwrap_or(rest.len());
        out.push_str(&rest[..take]);
        i += take;
    }
    out
}

// --- imports ---------------------------------------------------------------------------

/// Every module specifier referenced from JS: `import 'x'`, `import … from
/// 'x'`, `import('x')`, `export … from 'x'`.
fn import_specs(js: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = js.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let chunk = &js[i..];
        let import_hit = chunk.starts_with("import")
            && chunk[6..].chars().next().map(|c| !is_word(c)).unwrap_or(true);
        let export_hit = chunk.starts_with("export")
            && chunk[6..].chars().next().map(|c| !is_word(c)).unwrap_or(true);
        if import_hit {
            let mut p = i + 6 + leading_ws(&chunk[6..]);
            if js[p..].starts_with('(') {
                p += 1 + leading_ws(&js[p + 1..]);
                if let Some(spec) = quoted_at(&js[p..]) {
                    out.push(spec);
                }
                i = p;
                continue;
            }
            if let Some(spec) = quoted_at(&js[p..]) {
                out.push(spec); // side-effect import
                i = p;
                continue;
            }
            if let Some(spec) = scan_from_clause(&js[p..]) {
                out.push(spec);
            }
            i = p;
            continue;
        }
        if export_hit {
            let p = i + 6;
            if let Some(spec) = scan_from_clause(&js[p..]) {
                out.push(spec);
            }
            i = p;
            continue;
        }
        i += 1;
    }
    out
}

fn leading_ws(s: &str) -> usize {
    s.len() - s.trim_start().len()
}

/// Reads a `'…'` / `"…"` string at the start of `s`.
fn quoted_at(s: &str) -> Option<String> {
    let first = s.as_bytes().first()?;
    if *first != b'\'' && *first != b'"' {
        return None;
    }
    let end = s[1..].find(*first as char)? + 1;
    Some(s[1..end].to_string())
}

/// `[\w*{}\s]+ \s*from \s* ['"]…['"]` (the run class already includes \s).
fn scan_from_clause(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b.is_ascii_alphanumeric()
            || matches!(b, b'_' | b'*' | b'{' | b'}' | b',')
            || b.is_ascii_whitespace()
        {
            i += 1;
            continue;
        }
        break;
    }
    let run = &s[..i];
    if let Some(pos) = run.rfind("from") {
        let boundary_before =
            pos == 0 || !is_word(run[..pos].chars().next_back().unwrap());
        let after = &run[pos + 4..];
        if boundary_before && after.chars().all(|c| c.is_whitespace()) {
            let p = i + leading_ws(&s[i..]);
            if let Some(spec) = quoted_at(&s[p..]) {
                return Some(spec);
            }
        }
    }
    None
}

// --- html -----------------------------------------------------------------------------

/// Text of `<script type="module">…</script>` blocks.
fn module_scripts(html: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(pos) = html[i..].find("<script") {
        let start = i + pos;
        let Some(tag_end) = html[start..].find('>') else {
            break;
        };
        let tag = &html[start..start + tag_end];
        let is_module = tag.contains("type=\"module\"") || tag.contains("type='module'");
        let body_start = start + tag_end + 1;
        if let Some(close) = html[body_start..].find("</script>") {
            if is_module {
                out.push(html[body_start..body_start + close].to_string());
            }
            i = body_start + close + 9;
        } else {
            break;
        }
    }
    out
}

/// `src` / `href` attribute values of `<script|link|img|source>` tags.
fn tag_urls(html: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(pos) = html[i..].find('<') {
        let start = i + pos;
        let rest = &html[start + 1..];
        let name: String =
            rest.chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        if matches!(name.as_str(), "script" | "link" | "img" | "source") {
            if let Some(tag_end) = rest.find('>') {
                let tag = &rest[..tag_end];
                for attr in ["src", "href"] {
                    if let Some(v) = attr_value(tag, attr) {
                        out.push(v);
                    }
                }
                i = start + 1 + tag_end + 1;
                continue;
            }
        }
        i = start + 1;
    }
    out
}

fn attr_value(tag: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=");
    let mut from = 0;
    while let Some(pos) = tag[from..].find(&needle) {
        let p = from + pos;
        if p > 0 {
            let prev = tag[..p].chars().next_back().unwrap();
            if is_word(prev) || prev == '-' {
                from = p + needle.len();
                continue;
            }
        }
        let rest = &tag[p + needle.len()..];
        for q in ['"', '\''] {
            if let Some(stripped) = rest.strip_prefix(q) {
                let end = stripped.find(q)?;
                return Some(stripped[..end].to_string());
            }
        }
        from = p + needle.len();
    }
    None
}

// --- fetch ------------------------------------------------------------------------------

/// `fetch('…')` first-argument URLs.
fn fetch_urls(code: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = code[from..].find("fetch") {
        let start = from + pos;
        if start == 0 || !is_word(code[..start].chars().next_back().unwrap()) {
            let rest = &code[start + 5..];
            let ws = leading_ws(rest);
            if let Some(after_ws) = rest[ws..].strip_prefix('(') {
                let ws2 = leading_ws(after_ws);
                if let Some(url) = quoted_at(&after_ws[ws2..]) {
                    out.push(url);
                }
            }
        }
        from = start + 5;
    }
    out
}

// --- asset references ---------------------------------------------------------------------

/// `['"(]\.?/?assets/<name>` references.
pub fn asset_refs(code: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = code.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if matches!(b, b'\'' | b'"' | b'(') {
            let mut p = i + 1;
            if bytes.get(p) == Some(&b'.') {
                p += 1;
            }
            if bytes.get(p) == Some(&b'/') {
                p += 1;
            }
            if code[p..].starts_with("assets/") {
                let mut end = p + 7;
                while end < bytes.len()
                    && (bytes[end].is_ascii_alphanumeric()
                        || matches!(bytes[end], b'.' | b'_' | b'/' | b'-'))
                {
                    end += 1;
                }
                out.push(code[p + 7..end].to_string());
                i = end;
                continue;
            }
        }
        i += 1;
    }
    out
}

/// `screenwords-overlay://render/assets/<name>` references.
pub fn overlay_asset_refs(code: &str) -> Vec<String> {
    const PREFIX: &str = "screenwords-overlay://render/assets/";
    let mut out = Vec::new();
    let mut from = 0;
    while let Some(pos) = code[from..].find(PREFIX) {
        let start = from + pos + PREFIX.len();
        let rest = &code[start..];
        let end = rest
            .char_indices()
            .find(|(_, c)| !(c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')))
            .map(|(n, _)| n)
            .unwrap_or(rest.len());
        out.push(rest[..end].to_string());
        from = start + end.max(1);
    }
    out
}

// --- the main code check ---------------------------------------------------------------------

const GSAP_PLUGINS: &[&str] = &[
    "CustomEase", "DrawSVGPlugin", "EasePack", "MorphSVGPlugin", "MotionPathPlugin",
    "Physics2DPlugin", "ScrambleTextPlugin", "SplitText", "TextPlugin", "CSSPlugin",
];
const THREE_ADDONS: &[&str] = &[
    "environments/RoomEnvironment.js",
    "geometries/RoundedBoxGeometry.js",
    "postprocessing/EffectComposer.js",
    "postprocessing/MaskPass.js",
    "postprocessing/OutputPass.js",
    "postprocessing/Pass.js",
    "postprocessing/RenderPass.js",
    "postprocessing/ShaderPass.js",
    "postprocessing/UnrealBloomPass.js",
    "shaders/CopyShader.js",
    "shaders/LuminosityHighPassShader.js",
    "shaders/OutputShader.js",
];

const MEDIA_MESSAGE: &str = "no <video>/<audio> in overlays (sound: create_audio_code; footage: insert_clip / pictureInPicture)";

pub fn check_code(
    text: &str,
    where_: &str,
    manifest: &Value,
    r: &mut Report,
    kind: &str,
    files: &[&str],
) {
    let mut code = if kind == "js" {
        strip_js_comments(text)
    } else {
        strip_block_comments(text)
    };
    if kind == "html" {
        code = strip_html_comments(&code);
    }

    // Network / media APIs the sandbox blocks.
    let blocked_words = [
        ("XMLHttpRequest", "XMLHttpRequest: no network in overlays"),
        ("WebSocketStream", "WebSocket: blocked (no network)"),
        ("EventSource", "EventSource: blocked (no network)"),
        ("RTCPeerConnection", "WebRTC: switched off in the sandbox"),
        ("webkitRTCPeerConnection", "WebRTC: switched off in the sandbox"),
        ("RTCDataChannel", "WebRTC: switched off in the sandbox"),
        ("WebTransport", "WebTransport: switched off in the sandbox"),
        ("sendBeacon", "navigator.sendBeacon: blocked"),
        ("SharedWorker", "shared / service workers are switched off"),
        ("serviceWorker", "shared / service workers are switched off"),
        ("CacheStorage", "the Cache API is switched off"),
        ("getUserMedia", "media devices are switched off"),
        ("mediaDevices", "media devices are switched off"),
    ];
    for (word, message) in blocked_words {
        if has_word(&code, word) {
            r.error(where_, message.to_string());
        }
    }
    if has_new_ident(&code, "WebSocket", false) {
        r.error(where_, "WebSocket: blocked (no network)".into());
    }
    if has_caches_open(&code) {
        r.error(where_, "the Cache API is switched off".into());
    }
    for tag in ["video", "audio"] {
        if has_open_tag(&code, tag) {
            r.error(where_, MEDIA_MESSAGE.into());
        }
    }
    if has_new_ident(&code, "Audio", true) {
        r.error(where_, MEDIA_MESSAGE.into());
    }

    for url in fetch_urls(&code) {
        if url.starts_with("data:")
            || url.starts_with("blob:")
            || url.starts_with("screenwords-overlay:")
            || url.starts_with("screenwords-lib:")
            || url.contains("${")
        {
            continue;
        }
        if has_scheme(&url) || url.starts_with("//") {
            r.error(
                where_,
                format!("fetch('{url}'): only data:/blob: URLs and the package's own files load (no network)"),
            );
        } else {
            let target = resolve(where_, &url);
            if target.as_deref().map(|t| !files.contains(&t)).unwrap_or(true) {
                r.error(
                    where_,
                    format!("fetch('{url}'): no such file in the package (files are served by relative path)"),
                );
            }
        }
    }

    for m in scan_remote(&code) {
        let ctx_start = m.start.saturating_sub(40);
        let ctx = &code[ctx_start..m.start];
        if m.url.starts_with("//") && kind == "js" {
            continue; // probably a leftover comment marker inside a string
        }
        if loads_context(&code, m.start) {
            r.error(
                where_,
                format!("remote URL {}: blocked (fonts, images, scripts and styles must be bundled or in assets/)", m.url),
            );
        } else if kind != "js" || !ctx.contains("xmlns") {
            r.info(where_, format!("mentions {} (only shown as text? remote loads are blocked)", m.url));
        }
    }

    if kind == "js" || kind == "html" {
        if kind == "js" {
            check_imports(&code, where_, r, files);
        } else {
            for block in module_scripts(&code) {
                check_imports(&block, where_, r, files);
            }
            for url in tag_urls(&code) {
                if url.starts_with("//")
                    || url.starts_with("http://")
                    || url.starts_with("https://")
                    || url.starts_with("data:")
                    || url.starts_with("blob:")
                    || url.starts_with("screenwords-lib:")
                    || url.starts_with("screenwords-overlay:")
                    || url.starts_with("#")
                {
                    continue;
                }
                let target = resolve(where_, &url);
                if target.as_deref().map(|t| !files.contains(&t)).unwrap_or(true) {
                    r.error(
                        where_,
                        format!("'{url}' is not a file of the package (files are served by relative path)"),
                    );
                }
            }
        }
        if has_new_ident(&code, "Worker", true) {
            r.warn(
                where_,
                "Workers run on real threads, off the virtual clock: only wait for their result with screenwords.waitFor(...), never draw from them per frame".into(),
            );
        }
        if wait_on_timer(&code) {
            r.error(
                where_,
                "waiting on a timer before frame 0 never settles (virtual timers start at frame 0): the load fails after 2 s; wait only for real work (image decode, fonts, imports)".into(),
            );
        }
        for word in ["localStorage", "sessionStorage", "indexedDB"] {
            if has_word(&code, word) {
                r.warn(
                    where_,
                    "storage is not persistent here (nonPersistent data store); keep state in variables".into(),
                );
            }
        }
        if has_new_ident(&code, "AudioContext", false)
            || has_new_ident(&code, "webkitAudioContext", false)
        {
            r.warn(
                where_,
                "overlays have no sound; write audio with create_audio_code (OfflineAudioContext)".into(),
            );
        }
        if has_virtual_clock(&code) {
            r.info(
                where_,
                "Date / performance.now run on the virtual clock here; screenwords.time is clearer".into(),
            );
        }
        if on_frame_inner_html(&code) {
            r.warn(
                where_,
                "innerHTML inside onFrame rebuilds the DOM every frame: build once, update styles / text".into(),
            );
        }
        if has_get_context_2d(&code) && !code.contains("pixelRatio") {
            r.warn(
                where_,
                "canvas without screenwords.pixelRatio: it renders blurry at 4K (canvas.width = W * pixelRatio)".into(),
            );
        }
        if code.contains("WebGLRenderer") {
            if !code.contains("setPixelRatio") {
                r.warn(
                    where_,
                    "WebGLRenderer without renderer.setPixelRatio(screenwords.pixelRatio): blurry at 4K".into(),
                );
            }
            if !code.contains("alpha: true") && !code.contains("alpha:true") && !is_scene_sized(manifest) {
                r.warn(
                    where_,
                    "WebGLRenderer without {alpha: true} draws an opaque background over the video".into(),
                );
            }
        }
        if code.contains("screenwords.brand.") {
            r.warn(
                where_,
                "screenwords.brand is undefined when the project has no brand kit: read it as screenwords.brand?.colors.accent ?? '#FFCC00' (CSS: var(--brand-accent, #FFCC00))".into(),
            );
        }
        if has_dot_gif(&code) {
            r.info(where_, "animated GIFs show only their first frame (use a sprite sheet / canvas)".into());
        }
    }

    if (kind == "css" || kind == "html")
        && !is_scene_sized(manifest)
        && has_opaque_html_body(&code)
    {
        r.warn(
            where_,
            "html/body get a background: an overlay should stay transparent (scenes may be opaque)".into(),
        );
    }
}

/// `waitFor(… setTimeout|setInterval|requestAnimationFrame …)` or
/// `await new Promise(… setTimeout …)` before any ';'.
fn wait_on_timer(code: &str) -> bool {
    let timer_words = ["setTimeout", "setInterval", "requestAnimationFrame"];
    let mut from = 0;
    while let Some(pos) = code[from..].find("waitFor") {
        let start = from + pos;
        if start == 0 || !is_word(code[..start].chars().next_back().unwrap()) {
            if let Some(open) = code[start..].find('(') {
                let segment = &code[start + open..];
                let end = segment.find(';').unwrap_or(segment.len());
                let inner = &segment[..end];
                if timer_words.iter().any(|w| has_word(inner, w)) {
                    return true;
                }
            }
        }
        from = start + 7;
    }
    let mut from = 0;
    while let Some(pos) = code[from..].find("new Promise") {
        let start = from + pos;
        if code[..start].trim_end().ends_with("await") {
            if let Some(open) = code[start..].find('(') {
                let segment = &code[start + open..];
                let end = segment.find(';').unwrap_or(segment.len());
                if has_word(&segment[..end], "setTimeout") {
                    return true;
                }
            }
        }
        from = start + 11;
    }
    false
}

/// `(\bDate\.now|performance\.now)\s*\(` or `\bnew\s+Date\s*\(`.
fn has_virtual_clock(code: &str) -> bool {
    for needle in ["Date.now", "performance.now"] {
        let mut from = 0;
        while let Some(pos) = code[from..].find(needle) {
            let start = from + pos;
            if (start == 0 || !is_word(code[..start].chars().next_back().unwrap()))
                && code[start + needle.len()..].trim_start().starts_with('(')
            {
                return true;
            }
            from = start + needle.len();
        }
    }
    has_new_ident(code, "Date", true)
}

/// `onFrame\s*\(\s*\([^)]*\)\s*=>\s*\{[^}]*innerHTML`.
fn on_frame_inner_html(code: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find("onFrame") {
        let start = from + pos;
        let rest = code[start + 7..].trim_start();
        if let Some(open) = rest.strip_prefix('(') {
            let rest = open.trim_start();
            if let Some(close_paren) = rest.find(')') {
                if rest[..close_paren].contains('(') {
                    from = start + 7;
                    continue;
                }
                let after = rest[close_paren + 1..].trim_start();
                if let Some(arrow) = after.strip_prefix("=>") {
                    let after = arrow.trim_start();
                    if let Some(brace) = after.strip_prefix('{') {
                        let end = after.find('}').unwrap_or(after.len());
                        if brace[..end.saturating_sub(1)].contains("innerHTML") {
                            return true;
                        }
                    }
                }
            }
        }
        from = start + 7;
    }
    false
}

fn has_get_context_2d(code: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find(".getContext") {
        let start = from + pos;
        let rest = code[start + 11..].trim_start();
        if let Some(after) = rest.strip_prefix('(') {
            let after = after.trim_start();
            if after.starts_with("\"2d\"") || after.starts_with("'2d'") {
                return true;
            }
        }
        from = start + 11;
    }
    false
}

fn has_dot_gif(code: &str) -> bool {
    let mut from = 0;
    while let Some(pos) = code[from..].find(".gif") {
        let start = from + pos;
        let after = &code[start + 4..];
        if after.chars().next().map(|c| !is_word(c)).unwrap_or(true) {
            return true;
        }
        from = start + 4;
    }
    false
}

/// `(?:^|[},\s])(html|body)…{ … background(-color)?: (?!transparent|none)` —
/// in practice: a rule whose last simple selector is `html` or `body` with a
/// non-transparent background declaration.
fn has_opaque_html_body(code: &str) -> bool {
    let mut i = 0;
    while let Some(rel) = code[i..].find('{') {
        let brace = i + rel;
        let sel_start = code[..brace]
            .rfind(['}', '{', ';'])
            .map(|p| p + 1)
            .unwrap_or(0);
        let selector = code[sel_start..brace].trim();
        let last_token: Option<&str> = selector
            .split(|c: char| c.is_whitespace() || c == ',')
            .filter(|t| !t.is_empty())
            .next_back();
        if matches!(last_token, Some("html") | Some("body")) {
            let end = code[brace..].find('}').map(|p| brace + p).unwrap_or(code.len());
            let body = &code[brace..end];
            let mut from = 0;
            while let Some(pos) = body[from..].find("background") {
                let bstart = from + pos;
                let rest = body[bstart..].trim_start_matches("background");
                let rest = rest.strip_prefix("-color").unwrap_or(rest);
                let rest = rest.trim_start();
                if let Some(colon) = rest.strip_prefix(':') {
                    // The Python check's negative lookahead can backtrack
                    // through \s*, so only a value starting IMMEDIATELY with
                    // "transparent"/"none" (no space after the colon) is
                    // safe; "background: transparent" still warns.
                    let safe = colon.starts_with("transparent") || colon.starts_with("none");
                    if !safe {
                        return true;
                    }
                }
                from = bstart + 10;
            }
        }
        i = brace + 1;
    }
    false
}

/// Import-map resolution, mirroring the Python `check_imports`.
fn check_imports(js: &str, where_: &str, r: &mut Report, files: &[&str]) {
    let libs = lib_files();
    for spec in import_specs(js) {
        if spec == "three" || spec == "gsap" || spec == "animejs" {
            continue;
        }
        if let Some(addon) = spec.strip_prefix("three/addons/") {
            if !THREE_ADDONS.contains(&addon) {
                let mut sorted: Vec<&str> = THREE_ADDONS.to_vec();
                sorted.sort_unstable();
                r.error(
                    where_,
                    format!("import '{spec}': not bundled; three addons offline: {}", sorted.join(", ")),
                );
            }
            continue;
        }
        if let Some(plugin_path) = spec.strip_prefix("gsap/") {
            let plugin = plugin_path.strip_suffix(".js").unwrap_or(plugin_path);
            if !GSAP_PLUGINS.contains(&plugin) && !matches!(plugin, "index" | "gsap-core" | "all") {
                let mut sorted: Vec<&str> = GSAP_PLUGINS.to_vec();
                sorted.sort_unstable();
                r.error(
                    where_,
                    format!("import '{spec}': not bundled; GSAP plugins offline: {}", sorted.join(", ")),
                );
            }
            continue;
        }
        if let Some(file) = spec.strip_prefix("screenwords-lib://") {
            if !libs.iter().any(|l| l == file) {
                r.error(where_, format!("import '{spec}': no such bundled file"));
            }
            continue;
        }
        if spec.starts_with("http://") || spec.starts_with("https://") || spec.starts_with("//") {
            r.error(
                where_,
                format!("import '{spec}': remote modules are blocked (no network); use the bundled import map"),
            );
            continue;
        }
        if spec.starts_with('.') {
            let target = resolve(where_, &spec);
            if target.as_deref().map(|t| !files.contains(&t)).unwrap_or(true) {
                r.error(
                    where_,
                    format!("import '{spec}': no such file in the package (modules are served by relative path)"),
                );
            }
            continue;
        }
        if spec.starts_with('/') {
            r.error(
                where_,
                format!(
                    "import '{spec}': use a relative path ('./{}'); absolute paths do not resolve",
                    spec.trim_start_matches('/')
                ),
            );
            continue;
        }
        r.error(
            where_,
            format!(
                "import '{spec}': unknown bare specifier; offline import map: three, three/addons/…, gsap, gsap/<Plugin>, animejs, screenwords-lib://<file>, or a relative module of the package"
            ),
        );
    }
}
