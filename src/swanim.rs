//! The `.swanim` animation-package validator: manifest rules, path / type /
//! size limits, the code scan for sandbox-blocked APIs, offline import-map
//! resolution and asset-reference checks. Levels are `error` / `warning` /
//! `info`; exit codes 0 = ok, 1 = errors, 2 = unreadable input.

mod scan;

use crate::json::Value;
use crate::regex::Regex;
use crate::zip;
use std::fs;
use std::path::{Path, PathBuf};

// --- Limits (kept in sync with validate_swanim.py) --------------------------------
pub const MAX_CODE_BYTES: usize = 512 * 1024;
pub const MIN_SIDE: i64 = 16;
pub const MAX_SIDE: i64 = 4096;
pub const MAX_DURATION: f64 = 600.0;
pub const MAX_FRAMES: i64 = 36_000;
pub const MAX_FPS: f64 = 120.0;
pub const MAX_ASSETS: usize = 48;
pub const MAX_FILES: usize = 64;
pub const MAX_DEPTH: usize = 4;
pub const MAX_PATH: usize = 200;
pub const MAX_TEXT_FILE: usize = 512 * 1024;
pub const MAX_TEXT_TOTAL: usize = 1 << 20;
pub const MAX_FILE: usize = 16 << 20;
pub const MAX_TOTAL: usize = 32 << 20;

const ASSET_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ttf", "otf", "woff", "woff2",
];
const TEXT_EXTENSIONS: &[&str] =
    &["html", "js", "mjs", "css", "json", "glsl", "frag", "vert", "txt", "md"];
const MANIFEST_KEYS: &[&str] = &[
    "format", "name", "title", "width", "height", "duration", "loop", "fps", "params",
    "paramsSchema", "entry", "$schema",
];
const SCHEMA_KEYWORDS: &[&str] = &[
    "type", "title", "description", "properties", "required", "enum", "minimum", "maximum",
    "minLength", "maxLength", "pattern", "format", "minItems", "maxItems", "items", "anyOf",
    "default", "additionalProperties", "$schema",
];

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

/// The bundled library files reachable through `screenwords-lib://`.
pub fn lib_files() -> Vec<String> {
    let mut files: Vec<String> = vec![
        "gsap/gsap.min.js".into(),
        "anime/anime.esm.min.js".into(),
        "anime/anime.umd.min.js".into(),
        "three/three.module.js".into(),
        "three/three.core.js".into(),
        "d3/d3.min.js".into(),
        "tone/Tone.js".into(),
        "tone/index.js".into(),
        "gsap/esm/index.js".into(),
        "gsap/esm/gsap-core.js".into(),
    ];
    for p in GSAP_PLUGINS {
        if *p != "CSSPlugin" {
            files.push(format!("gsap/{p}.min.js"));
        }
        files.push(format!("gsap/esm/{p}.js"));
    }
    for a in THREE_ADDONS {
        files.push(format!("three/addons/{a}"));
    }
    files
}

// --- Report ------------------------------------------------------------------------

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Item {
    pub level: &'static str, // "error" | "warning" | "info"
    pub where_: String,
    pub message: String,
}

#[derive(Debug, Clone, Default)]
pub struct Report {
    pub target: String,
    pub items: Vec<Item>,
}

impl Report {
    pub fn new(target: &str) -> Report {
        Report { target: target.to_string(), items: Vec::new() }
    }

    pub fn error(&mut self, where_: &str, message: String) {
        self.items.push(Item { level: "error", where_: where_.to_string(), message });
    }

    pub fn warn(&mut self, where_: &str, message: String) {
        self.items.push(Item { level: "warning", where_: where_.to_string(), message });
    }

    pub fn info(&mut self, where_: &str, message: String) {
        self.items.push(Item { level: "info", where_: where_.to_string(), message });
    }

    pub fn has_errors(&self) -> bool {
        self.items.iter().any(|i| i.level == "error")
    }

    pub fn has_warnings(&self) -> bool {
        self.items.iter().any(|i| i.level == "warning")
    }
}

// --- Package access -----------------------------------------------------------------

/// One package file: size in bytes and whether it is a symlink / special file
/// (a link anywhere refuses the whole package).
#[derive(Debug, Clone, Copy)]
pub struct FileEntry {
    pub size: u64,
    pub link: bool,
}

pub struct Package {
    pub path: PathBuf,
    zip_data: Option<Vec<u8>>,
    zip_entries: Vec<zip::ZipEntry>,
    prefix: String,
}

/// Hidden entries and `__MACOSX/` are skipped like the importer does; `.` and
/// `..` are NOT hidden (they are traversal and must reach the path checks).
fn skipped(name: &str) -> bool {
    let parts: Vec<&str> = name.split('/').filter(|p| !p.is_empty()).collect();
    if parts.is_empty() || parts[0] == "__MACOSX" {
        return true;
    }
    parts.iter().any(|p| p.starts_with('.') && *p != "." && *p != "..")
}

impl Package {
    pub fn open(path: &Path) -> Result<Package, String> {
        let meta = fs::metadata(path).map_err(|e| e.to_string())?;
        if meta.is_file() {
            let data = fs::read(path).map_err(|e| e.to_string())?;
            let entries = zip::read_entries(&data).map_err(|e| e.to_string())?;
            let mut prefix = String::new();
            let names: Vec<&str> =
                entries.iter().map(|e| e.name.as_str()).filter(|n| !skipped(n) && !e_is_dir_name(n)).collect();
            let mut tops: Vec<&str> = names.iter().map(|n| n.split('/').next().unwrap_or("")).collect();
            tops.sort_unstable();
            tops.dedup();
            if tops.len() == 1 && names.iter().all(|n| n.contains('/')) {
                prefix = format!("{}/", tops[0]);
            }
            Ok(Package { path: path.to_path_buf(), zip_data: Some(data), zip_entries: entries, prefix })
        } else {
            Ok(Package { path: path.to_path_buf(), zip_data: None, zip_entries: Vec::new(), prefix: String::new() })
        }
    }

    /// Relative path → entry; sorted by path when iterated (callers sort).
    pub fn files(&self) -> Vec<(String, FileEntry)> {
        let mut out = Vec::new();
        if let Some(data) = &self.zip_data {
            for e in &self.zip_entries {
                if e.is_dir() || skipped(&e.name) || !e.name.starts_with(&self.prefix) {
                    continue;
                }
                let rel = e.name[self.prefix.len()..].to_string();
                out.push((rel, FileEntry { size: e.uncompressed_size, link: e.is_special_file() }));
            }
            // `_` keeps the data borrow clear; extraction goes through read().
            let _ = data;
            return out;
        }
        walk_folder(&self.path, &self.path, &mut out);
        out
    }

    pub fn read(&self, rel: &str) -> Result<Vec<u8>, String> {
        if let Some(data) = &self.zip_data {
            let name = format!("{}{}", self.prefix, rel);
            let entry = self
                .zip_entries
                .iter()
                .find(|e| e.name == name)
                .ok_or_else(|| format!("no entry '{name}'"))?;
            zip::extract(data, entry).map_err(|e| e.0)
        } else {
            fs::read(self.path.join(rel)).map_err(|e| e.to_string())
        }
    }
}

fn e_is_dir_name(name: &str) -> bool {
    name.ends_with('/')
}

fn walk_folder(root: &Path, dir: &Path, out: &mut Vec<(String, FileEntry)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let full = entry.path();
        let Ok(meta) = fs::symlink_metadata(&full) else {
            continue;
        };
        let ft = meta.file_type();
        let rel = full
            .strip_prefix(root)
            .unwrap_or(&full)
            .to_string_lossy()
            .replace(std::path::MAIN_SEPARATOR, "/");
        if ft.is_dir() {
            if ft.is_symlink() {
                out.push((format!("{rel}/"), FileEntry { size: 0, link: true }));
            } else {
                walk_folder(root, &full, out);
            }
        } else {
            out.push((rel, FileEntry { size: meta.len(), link: !ft.is_file() }));
        }
    }
}

// --- Path rules ----------------------------------------------------------------------

fn part_ok(part: &str) -> bool {
    // ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$
    let bytes = part.as_bytes();
    if bytes.is_empty() || bytes.len() > 64 {
        return false;
    }
    if !(bytes[0].is_ascii_alphanumeric()) {
        return false;
    }
    bytes[1..]
        .iter()
        .all(|&b| b.is_ascii_alphanumeric() || b == b'.' || b == b'_' || b == b'-')
}

/// `CodeOverlayPackageLimits.pathIssue`: why `rel` cannot be a package file.
pub fn path_issue(rel: &str) -> Option<String> {
    if rel.len() > MAX_PATH {
        return Some(format!("longer than {MAX_PATH} characters"));
    }
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.len() > MAX_DEPTH {
        return Some(format!("at most {MAX_DEPTH} levels deep"));
    }
    for part in &parts {
        if *part == ".." || *part == "." {
            return Some("'..' and '.' are not allowed".into());
        }
        if !part_ok(part) {
            return Some(format!(
                "'{part}': use letters, digits, '.', '_' and '-' (starting with a letter or digit)"
            ));
        }
    }
    let last = parts[parts.len() - 1];
    let ext = last.rsplit('.').next().unwrap_or("").to_lowercase();
    let ext = if last.contains('.') { ext } else { String::new() };
    let mut allowed = TEXT_EXTENSIONS.iter().chain(ASSET_EXTENSIONS.iter());
    if !allowed.any(|e| *e == ext) {
        let mut all: Vec<&str> = TEXT_EXTENSIONS.iter().chain(ASSET_EXTENSIONS.iter()).copied().collect();
        all.sort_unstable();
        return Some(format!("'.{ext}' files are not allowed (allowed: {})", all.join(", ")));
    }
    None
}

fn extension_of(rel: &str) -> String {
    let last = rel.rsplit('/').next().unwrap_or(rel);
    match last.rfind('.') {
        Some(p) => last[p + 1..].to_lowercase(),
        None => String::new(),
    }
}

fn is_text_ext(ext: &str) -> bool {
    TEXT_EXTENSIONS.contains(&ext)
}

fn is_asset_ext(ext: &str) -> bool {
    ASSET_EXTENSIONS.contains(&ext)
}

// --- Manifest checks ------------------------------------------------------------------

fn is_int(v: &Value) -> bool {
    matches!(v, Value::Int(_))
}

fn is_number(v: &Value) -> bool {
    matches!(v, Value::Int(_) | Value::Float(_))
}

fn is_hex_color(v: &Value) -> bool {
    let Some(s) = v.as_str() else {
        return false;
    };
    let b = s.as_bytes();
    if s.len() != 7 && s.len() != 9 {
        return false;
    }
    b[0] == b'#' && b[1..].iter().all(|c| c.is_ascii_hexdigit())
}

/// Python `f"{x:g}"` for the simple numbers that reach these messages.
fn gfmt(x: f64) -> String {
    if x == x.trunc() && x.abs() < 1e15 {
        format!("{}", x as i64)
    } else {
        let s = format!("{x}");
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

/// Python `round()` — banker's rounding (half to even).
fn round_half_even(x: f64) -> f64 {
    let floor = x.floor();
    let diff = x - floor;
    if diff > 0.5 {
        floor + 1.0
    } else if diff < 0.5 {
        floor
    } else if floor as i64 % 2 == 0 {
        floor
    } else {
        floor + 1.0
    }
}

fn check_value(value: &Value, schema: &Value, path: &str, r: &mut Report) {
    let Some(schema_obj) = schema.as_object() else {
        return;
    };
    let schema = Value::Object(schema_obj.to_vec());
    let types_val = schema.get("type");
    let types: Vec<String> = match types_val {
        Some(Value::Str(s)) => vec![s.clone()],
        Some(Value::Array(a)) => a.iter().filter_map(Value::as_str).map(str::to_string).collect(),
        _ => Vec::new(),
    };
    if !types.is_empty() {
        let mut ok = false;
        for t in &types {
            ok = match t.as_str() {
                "number" => is_number(value) && !matches!(value, Value::Bool(_)),
                "integer" => matches!(value, Value::Int(_)),
                "null" => value.is_null(),
                "string" => matches!(value, Value::Str(_)),
                "boolean" => matches!(value, Value::Bool(_)),
                "object" => matches!(value, Value::Object(_)),
                "array" => matches!(value, Value::Array(_)),
                _ => false,
            };
            if ok {
                break;
            }
        }
        if !ok {
            r.error(
                path,
                format!(
                    "default {} is not of type {}",
                    value.to_string(),
                    types.join("/")
                ),
            );
            return;
        }
    }
    if let Some(Value::Array(enum_)) = schema.get("enum") {
        if !enum_.iter().any(|e| e == value) {
            let items: Vec<String> = enum_.iter().map(|e| e.to_string()).collect();
            r.error(path, format!("default {} is not one of [{}]", value.to_string(), items.join(", ")));
        }
    }
    if is_number(value) {
        if let Some(min) = schema.get("minimum").and_then(Value::as_f64) {
            if value.as_f64().unwrap() < min {
                r.error(path, format!("default {} < minimum {min}", value.to_string()));
            }
        }
        if let Some(max) = schema.get("maximum").and_then(Value::as_f64) {
            if value.as_f64().unwrap() > max {
                r.error(path, format!("default {} > maximum {max}", value.to_string()));
            }
        }
    }
    if let Value::Str(s) = value {
        if let Some(max_len) = schema.get("maxLength").and_then(Value::as_i64) {
            if s.chars().count() as i64 > max_len {
                r.error(
                    path,
                    format!("default is {} characters, maxLength {max_len}", s.chars().count()),
                );
            }
        }
        if let Some(pattern) = schema.get("pattern").and_then(Value::as_str) {
            match Regex::compile(pattern) {
                Ok(re) => {
                    if !re.is_match(s) {
                        r.error(
                            path,
                            format!("default '{s}' does not match pattern {pattern}"),
                        );
                    }
                }
                Err(e) => {
                    r.error(&format!("{path}.pattern"), format!("invalid regular expression: {e}"));
                }
            }
        }
    }
}

fn scan_keywords(schema: &Value, path: &str, r: &mut Report) {
    let Some(obj) = schema.as_object() else {
        return;
    };
    let mut unknown: Vec<&str> = obj
        .iter()
        .map(|(k, _)| k.as_str())
        .filter(|k| !SCHEMA_KEYWORDS.contains(k))
        .collect();
    unknown.sort_unstable();
    if !unknown.is_empty() {
        r.warn(
            path,
            format!("keywords ignored by screenwords: {}", unknown.join(", ")),
        );
    }
    if let Some(props) = schema.get("properties").and_then(Value::as_object) {
        for (k, sub) in props {
            scan_keywords(sub, &format!("{path}.properties.{k}"), r);
        }
    }
    if let Some(items) = schema.get("items") {
        if items.as_object().is_some() {
            scan_keywords(items, &format!("{path}.items"), r);
        }
    }
    if let Some(any) = schema.get("anyOf").and_then(Value::as_array) {
        for (i, b) in any.iter().enumerate() {
            scan_keywords(b, &format!("{path}.anyOf[{i}]"), r);
        }
    }
}

pub fn check_manifest(m: &Value, r: &mut Report) {
    let Some(obj) = m.as_object() else {
        r.error("overlay.json", "must be a JSON object".into());
        return;
    };
    let mut unknown: Vec<&str> =
        obj.iter().map(|(k, _)| k.as_str()).filter(|k| !MANIFEST_KEYS.contains(k)).collect();
    unknown.sort_unstable();
    if !unknown.is_empty() {
        let mut known: Vec<&str> = MANIFEST_KEYS.iter().copied().filter(|k| *k != "$schema").collect();
        known.sort_unstable();
        r.error(
            &format!("overlay.json.{}", unknown[0]),
            format!(
                "unknown field: the importer refuses the package (known: {}); put notes in README.md or a code comment",
                known.join(", ")
            ),
        );
    }
    let fmt = m.get("format").cloned().unwrap_or(Value::Int(1));
    if !is_int(&fmt) {
        r.error("overlay.json.format", "expected an integer (1)".into());
    } else if fmt.as_i64().unwrap() > 1 {
        r.error(
            "overlay.json.format",
            format!("format {}: written by a newer screenwords (this one reads format 1)", fmt.as_i64().unwrap()),
        );
    }
    match m.get("name") {
        None | Some(Value::Null) => {
            r.info(
                "overlay.json.name",
                "no name: import_code_overlay uses the file name, put_code_overlay its name argument".into(),
            );
        }
        Some(Value::Str(name)) => {
            if name.trim().is_empty() {
                r.info(
                    "overlay.json.name",
                    "no name: import_code_overlay uses the file name, put_code_overlay its name argument".into(),
                );
            } else if name.trim().chars().count() > 60 {
                r.error(
                    "overlay.json.name",
                    "give a name of 1-60 characters (the component id becomes codeOverlay_<slug>)".into(),
                );
            }
        }
        Some(_) => {
            r.error(
                "overlay.json.name",
                "give a name of 1-60 characters (the component id becomes codeOverlay_<slug>)".into(),
            );
        }
    }
    for k in ["title", "entry"] {
        if let Some(v) = m.get(k) {
            if !v.is_null() && v.as_str().is_none() {
                r.error(&format!("overlay.json.{k}"), "expected a string".into());
            }
        }
    }
    for side in ["width", "height"] {
        let v = m.get(side);
        let ok = v.map(is_int).unwrap_or(false) && v.unwrap().as_i64().unwrap() >= MIN_SIDE
            && v.unwrap().as_i64().unwrap() <= MAX_SIDE;
        if !ok {
            r.error(
                &format!("overlay.json.{side}"),
                format!("must be an integer {MIN_SIDE}-{MAX_SIDE} (design px at a 1080-px short side)"),
            );
        }
    }
    let d = m.get("duration");
    let d_ok = d.map(|v| is_number(v) && v.as_f64().unwrap() > 0.0 && v.as_f64().unwrap() <= MAX_DURATION)
        .unwrap_or(false);
    if !d_ok {
        r.error(
            "overlay.json.duration",
            format!("must be more than 0 and at most {} seconds", MAX_DURATION as i64),
        );
    }
    if let Some(loop_v) = m.get("loop") {
        if loop_v.as_bool().is_none() {
            r.error("overlay.json.loop", "must be true or false".into());
        }
    }
    let fps = m.get("fps");
    let fps_num = fps.and_then(Value::as_f64);
    let fps_ok = fps.map(|v| is_number(v) && (1.0..=MAX_FPS).contains(&v.as_f64().unwrap())).unwrap_or(false);
    if fps.is_some() && !fps_ok {
        r.error("overlay.json.fps", "must be 1-120 (omit it to use the project frame rate)".into());
    } else if let (Some(fpsv), Some(dv)) = (fps_num, d.and_then(Value::as_f64)) {
        if d_ok {
            let frames = (dv * fpsv + 0.5).floor().max(1.0) as i64;
            if frames > MAX_FRAMES {
                r.error(
                    "overlay.json.fps",
                    format!(
                        "{} s at {} fps is {frames} frames; at most {MAX_FRAMES}: lower fps (or omit it for the project frame rate)",
                        gfmt(dv),
                        gfmt(fpsv)
                    ),
                );
            }
        }
    }

    let params = m.get("params").filter(|p| !p.is_null());
    let schema = m.get("paramsSchema").filter(|s| !s.is_null());
    let mut params_obj: Option<&[(String, Value)]> = None;
    if let Some(p) = params {
        if let Some(o) = p.as_object() {
            params_obj = Some(o);
        } else {
            r.error("overlay.json.params", "expected an object of default values".into());
        }
    }
    if let Some(s) = schema {
        if s.as_object().is_none() {
            r.error("overlay.json.paramsSchema", "expected a JSON Schema object".into());
            return;
        }
        scan_keywords(s, "overlay.json.paramsSchema", r);
        if s.get("type").and_then(Value::as_str).unwrap_or("object") != "object" {
            r.error("overlay.json.paramsSchema.type", "must be \"object\"".into());
        }
        let props = s.get("properties").and_then(Value::as_object);
        if props.is_none() {
            r.error(
                "overlay.json.paramsSchema.properties",
                "declare the params as properties ({\"color\": {\"type\": \"string\"}})".into(),
            );
            return;
        }
        let props = props.unwrap();
        if let Some(po) = params_obj {
            for (key, value) in po {
                if !props.iter().any(|(k, _)| k == key) {
                    let mut declared: Vec<&str> = props.iter().map(|(k, _)| k.as_str()).collect();
                    declared.sort_unstable();
                    r.error(
                        &format!("overlay.json.params.{key}"),
                        format!(
                            "not declared in paramsSchema.properties (declared: {})",
                            declared.join(", ")
                        ),
                    );
                } else {
                    let sub = props.iter().find(|(k, _)| k == key).map(|(_, v)| v).unwrap();
                    check_value(value, sub, &format!("overlay.json.params.{key}"), r);
                }
            }
        }
        let required: Vec<&str> = s
            .get("required")
            .and_then(Value::as_array)
            .map(|a| a.iter().filter_map(Value::as_str).collect())
            .unwrap_or_default();
        for (key, sub) in props {
            let has_default = params_obj.map(|p| p.iter().any(|(k, v)| k == key && !v.is_null())).unwrap_or(false)
                || sub.get("default").is_some();
            if !has_default {
                let message = format!(
                    "no default (give one in params): screenwords.params.{key} is undefined unless every placement sets values.{key}"
                );
                if required.contains(&key.as_str()) {
                    r.error(&format!("overlay.json.paramsSchema.properties.{key}"), message);
                } else {
                    r.warn(&format!("overlay.json.paramsSchema.properties.{key}"), message);
                }
            }
        }
    } else if let Some(p) = params {
        if p.as_object().map(|o| !o.is_empty()).unwrap_or(false) {
            let hexy = p.as_object().map(|o| {
                o.iter().any(|(_, v)| is_hex_color(v))
            });
            let hint = if hexy.unwrap_or(false) { " (#RRGGBB strings become colors)" } else { "" };
            r.info(
                "overlay.json.paramsSchema",
                format!("inferred from params{hint}; add a paramsSchema with descriptions / ranges so placements are validated"),
            );
        }
    }
}

fn is_scene_sized(m: &Value) -> bool {
    let (Some(w), Some(h)) = (m.get("width").and_then(Value::as_i64), m.get("height").and_then(Value::as_i64))
    else {
        return false;
    };
    let ratios = [(16.0, 9.0), (9.0, 16.0), (1.0, 1.0), (4.0, 5.0)];
    w.min(h) >= 1080 && ratios.iter().any(|&(a, b)| (w as f64 / h as f64 - a / b).abs() < 0.01)
}

// --- The package check ------------------------------------------------------------------

pub fn check_package(path: &Path) -> Report {
    let mut r = Report::new(&path.to_string_lossy());
    let pkg = match Package::open(path) {
        Ok(p) => p,
        Err(e) => {
            r.error(&r.target.clone(), format!("cannot read: {e}"));
            return r;
        }
    };
    let mut files = pkg.files();
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let names: Vec<&str> = files.iter().map(|(n, _)| n.as_str()).collect();
    if !names.contains(&"overlay.json") {
        r.error(&r.target.clone(), "no overlay.json (the manifest: width, height, duration)".into());
        return r;
    }
    let manifest_bytes = match pkg.read("overlay.json") {
        Ok(b) => b,
        Err(e) => {
            r.error("overlay.json", format!("cannot read: {e}"));
            return r;
        }
    };
    let manifest = match String::from_utf8(manifest_bytes)
        .map_err(|e| e.to_string())
        .and_then(|s| Value::parse(&s).map_err(|e| e.to_string()))
    {
        Ok(v) => v,
        Err(e) => {
            r.error("overlay.json", format!("not valid JSON: {e}"));
            return r;
        }
    };
    check_manifest(&manifest, &mut r);
    if manifest.as_object().is_none() {
        return r;
    }

    // Files: paths, types, sizes, counts; a link or special file refuses all.
    if files.len() > MAX_FILES {
        r.error(
            &r.target.clone(),
            format!("{} files; at most {MAX_FILES} per package (overlay.json included)", files.len()),
        );
    }
    let mut text_total: u64 = 0;
    let mut total: u64 = 0;
    let mut texts: Vec<(String, String)> = Vec::new();
    for (rel, entry) in &files {
        if entry.link {
            r.error(
                rel,
                "a symbolic link or special file: the whole package is refused (copy the real file in)".into(),
            );
            continue;
        }
        if rel == "overlay.json" {
            continue;
        }
        if let Some(problem) = path_issue(rel) {
            r.error(rel, problem);
            continue;
        }
        total += entry.size;
        let ext = extension_of(rel);
        if is_text_ext(&ext) {
            text_total += entry.size;
            if entry.size as usize > MAX_TEXT_FILE {
                r.error(
                    rel,
                    format!("{} KB; a text file may be at most {} KB", entry.size / 1024, MAX_TEXT_FILE / 1024),
                );
                continue;
            }
            match pkg.read(rel) {
                Ok(bytes) => match String::from_utf8(bytes) {
                    Ok(text) => texts.push((rel.clone(), text)),
                    Err(_) => r.error(rel, "not UTF-8 text".into()),
                },
                Err(e) => r.error(rel, format!("corrupt archive entry: {e}")),
            }
        } else if entry.size as usize > MAX_FILE {
            r.error(rel, format!("larger than {} MB", MAX_FILE >> 20));
        }
    }
    if text_total as usize > MAX_TEXT_TOTAL {
        r.error(
            &r.target.clone(),
            format!("the text files add up to {} KB; at most {} KB", text_total / 1024, MAX_TEXT_TOTAL / 1024),
        );
    }
    if total as usize > MAX_TOTAL {
        r.error(
            &r.target.clone(),
            format!("the package is {} MB; at most {} MB", total >> 20, MAX_TOTAL >> 20),
        );
    }

    // The entry: manifest.entry, else index.html when present, else main.js.
    let has_index = names.contains(&"index.html");
    let has_main = names.contains(&"main.js");
    let entry: String = match manifest.get("entry").and_then(Value::as_str) {
        Some(e) => e.to_string(),
        None => {
            if has_index || !has_main {
                "index.html".to_string()
            } else {
                "main.js".to_string()
            }
        }
    };
    let kind = extension_of(&entry);
    let entry_size = files
        .iter()
        .find(|(n, _)| *n == entry)
        .map(|(_, e)| e.size)
        .unwrap_or(0);
    let mut code_bytes = entry_size as usize;
    if kind == "js" || kind == "mjs" {
        if let Some((_, e)) = files.iter().find(|(n, _)| n == "style.css") {
            code_bytes += e.size as usize;
        }
    }
    if !matches!(kind.as_str(), "html" | "js" | "mjs") || path_issue(&entry).is_some() {
        r.error(
            "overlay.json.entry",
            "the entry must be a .html or .js file of the package (e.g. index.html or main.js)".into(),
        );
    } else if !names.contains(&entry.as_str()) {
        let hint = if manifest.get("entry").is_none() {
            " (add index.html or main.js, or name the entry in the manifest)"
        } else {
            ""
        };
        r.error(&entry, format!("the entry file is missing{hint}"));
    }
    if code_bytes > MAX_CODE_BYTES {
        r.error(
            &entry,
            format!(
                "the entry code is {} KB; at most {} KB (bundled libraries do not count: import them; split helpers into modules)",
                code_bytes / 1024,
                MAX_CODE_BYTES / 1024
            ),
        );
    }
    if kind == "html" && names.contains(&"style.css") {
        let entry_text = texts.iter().find(|(n, _)| n.as_str() == entry.as_str()).map(|(_, t)| t.as_str());
        if let Some(t) = entry_text {
            if !t.contains("style.css") {
                r.warn(
                    "style.css",
                    "index.html is the entry and does not link style.css (<link rel=\"stylesheet\" href=\"style.css\">)".into(),
                );
            }
        }
    }

    // Assets: files directly in assets/.
    let assets: Vec<(String, u64)> = files
        .iter()
        .filter_map(|(n, e)| n.strip_prefix("assets/").map(|a| (a.to_string(), e.size)))
        .collect();
    let direct: Vec<&str> = assets.iter().filter(|(a, _)| !a.contains('/')).map(|(a, _)| a.as_str()).collect();
    if direct.len() > MAX_ASSETS {
        r.error("assets/", format!("{} files; at most {MAX_ASSETS} assets", direct.len()));
    }
    for name in &direct {
        let ext = match name.rfind('.') {
            Some(p) => name[p + 1..].to_lowercase(),
            None => String::new(),
        };
        if !is_asset_ext(&ext) {
            r.warn(
                &format!("assets/{name}"),
                format!("not an image / font (.{ext}): served by its path, but not as an asset"),
            );
        }
    }

    // Code scan: every script / style / document of the package.
    for (rel, text) in &texts {
        let ext = extension_of(rel);
        let k = match ext.as_str() {
            "js" | "mjs" => Some("js"),
            "css" => Some("css"),
            "html" => Some("html"),
            _ => None,
        };
        if let Some(k) = k {
            scan::check_code(text, rel, &manifest, &mut r, k, &names);
        }
    }
    let code_all: String = texts
        .iter()
        .filter(|(rel, _)| {
            let ext = extension_of(rel);
            matches!(ext.as_str(), "js" | "mjs" | "css" | "html")
        })
        .map(|(_, t)| t.as_str())
        .collect::<Vec<&str>>()
        .join("\n");
    for m in scan::asset_refs(&code_all) {
        if !assets.iter().any(|(a, _)| a == &m) {
            r.error(&entry, format!("references assets/{m}, which is not in the package"));
        }
    }
    for m in scan::overlay_asset_refs(&code_all) {
        if !assets.iter().any(|(a, _)| a == &m) {
            r.error(&entry, format!("references asset {m}, which is not in assets/"));
        }
    }
    if manifest.get("params").map(|p| p.as_object().map(|o| !o.is_empty()).unwrap_or(false)).unwrap_or(false)
        && !code_all.contains("screenwords.params")
        && !code_all.contains("screenwords[\"params\"]")
    {
        r.warn(&entry, "declares params but the code never reads screenwords.params".into());
    }

    // Render estimate.
    if let (Some(w), Some(h), Some(d)) = (
        manifest.get("width").filter(|v| is_int(v)).and_then(Value::as_i64),
        manifest.get("height").filter(|v| is_int(v)).and_then(Value::as_i64),
        manifest.get("duration").filter(|v| is_number(v)).and_then(Value::as_f64),
    ) {
        let fps = manifest.get("fps").and_then(Value::as_f64).filter(|f| *f > 0.0).unwrap_or(30.0);
        let frames = round_half_even(d * fps).max(1.0) as i64;
        let mp = (w as f64 * h as f64) / 1e6;
        let ms = if mp <= 2.1 { 12 } else { 45 };
        let extra = if mp > 2.1 && !is_scene_sized(&manifest) {
            " — consider a smaller canvas"
        } else {
            ""
        };
        r.info(
            &r.target.clone(),
            format!(
                "{w}x{h}, {} s ≈ {frames} frames at {} fps; render ≈ {:.0} s at this size (≈{ms} ms/frame{extra})",
                gfmt(d),
                gfmt(fps),
                frames as f64 * ms as f64 / 1000.0
            ),
        );
    }
    r
}

/// Expands a directory of packages (every subfolder with an overlay.json).
pub fn expand(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    for p in paths {
        if p.is_dir() && !p.join("overlay.json").exists() {
            let mut subs: Vec<PathBuf> = Vec::new();
            if let Ok(rd) = fs::read_dir(p) {
                for e in rd.flatten() {
                    if e.path().join("overlay.json").exists() {
                        subs.push(e.path());
                    }
                }
            }
            subs.sort();
            if subs.is_empty() {
                out.push(p.clone());
            } else {
                out.extend(subs);
            }
        } else {
            out.push(p.clone());
        }
    }
    out
}
