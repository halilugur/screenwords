//! The revision-guarded edit engine: `apply_edits` as the app implements it —
//! several edit tools as ONE atomic undo step, each edit sees the previous
//! ones, one failure changes nothing, errors name `edits[i].<arg>`, and a
//! `ref` / `"$ref:name"` pair lets later edits use ids created earlier in the
//! same batch.
//!
//! Error codes and message wording mirror the app's MCP surface:
//! `conflict` ("the document changed (revision is N, you expected M);
//! re-read it with get_project / get_transcript and retry"),
//! `validationFailed`, `notFound`, `nothingToUndo`, `nothingToRedo`.

use crate::json::Value;
use crate::project::Project;
use crate::rational::RationalTime;
use std::time::{SystemTime, UNIX_EPOCH};

pub const MAX_EDITS: usize = 200;

/// Generates app-style ids: prefix + 8 lowercase base36 chars ("cmp_pb5jmy5f").
struct IdGen {
    rng: u64,
}

impl IdGen {
    fn gen(&mut self, prefix: &str) -> String {
        let mut out = String::new();
        for _ in 0..8 {
            self.rng ^= self.rng << 13;
            self.rng ^= self.rng >> 7;
            self.rng ^= self.rng << 17;
            let d = (self.rng % 36) as u8;
            out.push(if d < 10 { (b'0' + d) as char } else { (b'a' + d - 10) as char });
        }
        format!("{prefix}{out}")
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum EditError {
    /// `conflict`: the document changed under the caller (or undo label mismatch).
    Conflict { message: String },
    /// `validationFailed`: the edit would leave the project invalid; nothing changed.
    Validation { path: String, message: String },
    /// `notFound`: an id the caller referenced does not exist.
    NotFound { path: String, message: String },
    /// The tool is real in the app but needs live media / the renderer, or is unknown.
    Unsupported { path: String, message: String },
    Limit { message: String },
}

impl EditError {
    pub fn code(&self) -> &'static str {
        match self {
            EditError::Conflict { .. } => "conflict",
            EditError::Validation { .. } => "validationFailed",
            EditError::NotFound { .. } => "notFound",
            EditError::Unsupported { .. } | EditError::Limit { .. } => "validationFailed",
        }
    }

    pub fn message(&self) -> String {
        match self {
            EditError::Conflict { message } | EditError::Limit { message } => message.clone(),
            EditError::Validation { path, message }
            | EditError::NotFound { path, message }
            | EditError::Unsupported { path, message } => format!("{path}: {message}"),
        }
    }
}

impl std::fmt::Display for EditError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code(), self.message())
    }
}

impl std::error::Error for EditError {}

#[derive(Debug, Clone)]
pub struct EditOp {
    pub tool: String,
    pub arguments: Value,
}

impl EditOp {
    pub fn new(tool: &str, arguments: Value) -> EditOp {
        EditOp { tool: tool.to_string(), arguments }
    }
}

#[derive(Debug, Clone)]
pub struct ApplyResult {
    pub revision: u64,
    pub label: Option<String>,
    /// ref name → created id, in batch order.
    pub created_ids: Vec<(String, String)>,
    /// word ids removed by correct_transcript merges.
    pub removed_ids: Vec<String>,
    /// placement / readability style warnings (the app fills these from the
    /// renderer; the document engine reports what it can see).
    pub warnings: Vec<String>,
    /// new edit points a cut produced (transitions go there).
    pub cuts: Vec<f64>,
}

struct HistoryStep {
    label: String,
    revision_before: u64,
    root: Value,
}

/// Result details individual tools contribute beyond ids.
#[derive(Default)]
struct SideEffects {
    removed_ids: Vec<String>,
    warnings: Vec<String>,
    cuts: Vec<f64>,
}

/// The open project document: `project.json` + its revision + the undo /
/// redo stacks (the app stores lzfse snapshots; here plain JSON snapshots —
/// same semantics, labels and conflicts).
pub struct Document {
    project: Project,
    undo_stack: Vec<HistoryStep>,
    redo_stack: Vec<HistoryStep>,
    rng_state: u64,
}

impl Document {
    pub fn new(project: Project) -> Document {
        let seed = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0x9E3779B97F4A7C15);
        Document {
            project,
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
            rng_state: seed | 1,
        }
    }

    pub fn project(&self) -> &Project {
        &self.project
    }

    pub fn project_mut(&mut self) -> &mut Project {
        &mut self.project
    }

    pub fn revision(&self) -> u64 {
        self.project.revision
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    pub fn undo_labels(&self) -> Vec<&str> {
        self.undo_stack.iter().map(|s| s.label.as_str()).collect()
    }

    pub fn redo_labels(&self) -> Vec<&str> {
        self.redo_stack.iter().map(|s| s.label.as_str()).collect()
    }

    /// `apply_edits {label?, ifRevision?, edits: [...]}`.
    pub fn apply_edits(
        &mut self,
        label: Option<&str>,
        if_revision: Option<u64>,
        edits: &[EditOp],
    ) -> Result<ApplyResult, EditError> {
        if edits.len() > MAX_EDITS {
            return Err(EditError::Limit {
                message: format!("edits: {} entries; at most {MAX_EDITS}", edits.len()),
            });
        }
        if let Some(expected) = if_revision {
            if expected != self.project.revision {
                return Err(EditError::Conflict {
                    message: format!(
                        "the document changed (revision is {}, you expected {expected}); re-read it with get_project / get_transcript and retry",
                        self.project.revision
                    ),
                });
            }
        }
        // Work on a deep clone; commit only when every edit succeeded.
        let mut root = self.project.root.clone();
        let mut created_ids: Vec<(String, String)> = Vec::new();
        let mut idgen = IdGen { rng: self.rng_state };
        let mut side_effects = SideEffects::default();
        let label_owned = label
            .map(str::to_string)
            .or_else(|| edits.first().map(|e| e.tool.clone()));

        for (i, op) in edits.iter().enumerate() {
            apply_one(&mut root, &mut created_ids, &mut idgen, &mut side_effects, op).map_err(|e| {
                if let EditError::Validation { path, message } = &e {
                    let path = prefix_edit_path(i, path);
                    EditError::Validation { path, message: message.clone() }
                } else if let EditError::NotFound { path, message } = &e {
                    let path = prefix_edit_path(i, path);
                    EditError::NotFound { path, message: message.clone() }
                } else {
                    e
                }
            })?;
        }
        self.rng_state = idgen.rng;

        // Commit: bump revision, push one undo step.
        let revision_before = self.project.revision;
        self.undo_stack.push(HistoryStep {
            label: label_owned.clone().unwrap_or_else(|| "edit".into()),
            revision_before,
            root: self.project.root.clone(),
        });
        self.redo_stack.clear();
        self.project.root = root;
        self.project.revision += 1;
        Ok(ApplyResult {
            revision: self.project.revision,
            label: label_owned,
            created_ids,
            removed_ids: std::mem::take(&mut side_effects.removed_ids),
            warnings: std::mem::take(&mut side_effects.warnings),
            cuts: std::mem::take(&mut side_effects.cuts),
        })
    }

    /// `undo {expectLabel?}` — one step. Conflict wording from the app:
    /// "the last edit is 'X', not 'Y'".
    pub fn undo(&mut self, expect_label: Option<&str>) -> Result<String, EditError> {
        let step = self.undo_stack.pop().ok_or_else(|| EditError::Conflict {
            message: "nothingToUndo: the undo stack is empty".into(),
        })?;
        if let Some(expected) = expect_label {
            if step.label != expected {
                let message = format!("the last edit is '{}', not '{expected}'", step.label);
                self.undo_stack.push(step);
                return Err(EditError::Conflict { message });
            }
        }
        let label = step.label.clone();
        self.redo_stack.push(HistoryStep {
            label: label.clone(),
            revision_before: self.project.revision,
            root: self.project.root.clone(),
        });
        self.project.root = step.root;
        self.project.revision = step.revision_before.max(1);
        Ok(label)
    }

    /// `redo {}`.
    pub fn redo(&mut self) -> Result<String, EditError> {
        let step = self.redo_stack.pop().ok_or_else(|| EditError::Conflict {
            message: "nothingToRedo: the redo stack is empty".into(),
        })?;
        let label = step.label.clone();
        self.undo_stack.push(HistoryStep {
            label: label.clone(),
            revision_before: self.project.revision,
            root: self.project.root.clone(),
        });
        self.project.root = step.root;
        self.project.revision = step.revision_before;
        Ok(label)
    }
}

fn prefix_edit_path(i: usize, path: &str) -> String {
    if path.starts_with("edits[") {
        path.to_string()
    } else {
        format!("edits[{i}].{path}")
    }
}

/// Applies a single edit to `root`. `created` maps ref names to ids created
/// earlier in the same batch.
fn apply_one(
    root: &mut Value,
    created: &mut Vec<(String, String)>,
    gen_id: &mut IdGen,
    fx: &mut SideEffects,
    op: &EditOp,
) -> Result<(), EditError> {
    // Peel a `ref` out of the arguments (any tool may name its created id).
    let mut args = op.arguments.clone();
    let ref_name = args.get("ref").and_then(Value::as_str).map(str::to_string);
    if ref_name.is_some() {
        args.remove("ref");
    }
    let new_id = match op.tool.as_str() {
        "add_component" => add_component(root, gen_id, fx, &args)?,
        "add_track" => add_track(root, gen_id, &args)?,
        "add_audio" => add_audio(root, gen_id, fx, &args, created)?,
        "insert_clip" => insert_clip(root, gen_id, &args, created)?,
        "add_chapter" => add_chapter(root, gen_id, &args)?,
        _ => {
            // Mutating tools that create no id.
            match op.tool.as_str() {
                "update_component" => update_component(root, &args, created)?,
                "remove_component" => remove_by_id(root, &args, created, "components", "instanceId")?,
                "remove_clip" => remove_clip(root, fx, &args, created)?,
                "remove_audio" => remove_by_id(root, &args, created, "audioEvents", "eventId")?,
                "trim_clip" => trim_clip(root, &args, created)?,
                "update_clip" => update_clip(root, &args, created)?,
                "move_clip" => move_clip(root, &args, created)?,
                "set_clip_framing_keyframe" => set_clip_framing_keyframe(root, &args, created)?,
                "update_audio" => update_audio(root, &args, created)?,
                "update_track" => update_track(root, &args)?,
                "set_project_settings" => set_project_settings(root, &args)?,
                "set_theme" => set_theme_op(root, &args)?,
                "cut_range" => cut_range(root, fx, &args)?,
                "correct_transcript" => correct_transcript(root, fx, &args)?,
                "update_chapter" => update_chapter(root, &args)?,
                "remove_chapter" => remove_chapter(root, &args)?,
                "rename_speaker" => rename_speaker(root, &args)?,
                "resolve_note" => resolve_note(root, &args)?,
                "author_transcript" => author_transcript(root, &args)?,
                other => {
                    return Err(EditError::Unsupported {
                        path: "edits".into(),
                        message: format!(
                            "'{other}' needs live media or the renderer; the document-local edit set is: add/update/remove_component, add_track, update_track, add/update/remove_audio, insert_clip, update_clip, move_clip, remove_clip, trim_clip, set_clip_framing_keyframe, cut_range, set_project_settings, set_theme, correct_transcript, add/update/remove_chapter, rename_speaker, resolve_note, author_transcript"
                        ),
                    });
                }
            }
            return Ok(());
        }
    };
    if let Some(name) = ref_name {
        created.push((name, new_id));
    }
    Ok(())
}

/// Resolves an argument that may be `"$ref:name"` to a concrete id.
fn deref<'a>(s: &'a str, created: &'a [(String, String)]) -> Option<&'a str> {
    if let Some(name) = s.strip_prefix("$ref:") {
        return created.iter().find(|(n, _)| n == name).map(|(_, id)| id.as_str());
    }
    Some(s)
}

fn get_f64(args: &Value, key: &str) -> Result<Option<f64>, EditError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v.as_f64().map(Some).ok_or_else(|| EditError::Validation {
            path: key.into(),
            message: "expected a number".into(),
        }),
    }
}

fn get_str<'a>(args: &'a Value, key: &str) -> Result<Option<&'a str>, EditError> {
    match args.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(v) => v.as_str().map(Some).ok_or_else(|| EditError::Validation {
            path: key.into(),
            message: "expected a string".into(),
        }),
    }
}

/// A timing argument: a word anchor object, or seconds as a number.
fn timing_arg(args: &Value, key: &str, _created: &[(String, String)]) -> Result<Option<Value>, EditError> {
    let raw = args
        .get(key)
        .or_else(|| args.get("timing").and_then(|t| t.get(key)));
    match raw {
        None | Some(Value::Null) => Ok(None),
        Some(v @ Value::Object(_)) => {
            if v.get("wordId").is_some() {
                Ok(Some(v.clone())) // anchor spec, stored as-is
            } else if let Some(seconds) = v.get("seconds").and_then(Value::as_f64) {
                Ok(Some(RationalTime::from_seconds(seconds, 1000).to_json()))
            } else {
                Ok(Some(v.clone())) // already a rational object
            }
        }
        Some(n) => {
            let secs = n.as_f64().ok_or_else(|| EditError::Validation {
                path: key.into(),
                message: "expected seconds (number) or an anchor {wordId, edge?, offset?}".into(),
            })?;
            Ok(Some(RationalTime::from_seconds(secs, 1000).to_json()))
        }
    }
}

fn require_timing(args: &Value, key: &str, created: &[(String, String)]) -> Result<Value, EditError> {
    timing_arg(args, key, created)?.ok_or_else(|| EditError::Validation {
        path: key.into(),
        message: "required".into(),
    })
}

fn tracks_mut(root: &mut Value) -> &mut Vec<Value> {
    root.get_mut("tracks").and_then(Value::as_array_mut).expect("validated at parse")
}

// --- add_component ------------------------------------------------------------

fn add_component(
    root: &mut Value,
    gen_id: &mut IdGen,
    fx: &mut SideEffects,
    args: &Value,
) -> Result<String, EditError> {
    let component_id = get_str(args, "componentId")?.ok_or_else(|| EditError::Validation {
        path: "componentId".into(),
        message: "required".into(),
    })?;
    if !crate::catalog::exists(component_id) {
        return Err(EditError::NotFound {
            path: "componentId".into(),
            message: crate::catalog::not_found_message(component_id),
        });
    }
    let start = require_timing(args, "start", &[])?;
    // A wordId anchor must exist and not have been cut.
    if let Some(anchor) = start.get("anchor").or(Some(&start)) {
        if let Some(wid) = anchor.get("wordId").and_then(Value::as_str) {
            let word_exists = root
                .get("transcripts")
                .and_then(Value::as_array)
                .map(|ts| {
                    ts.iter().any(|t| {
                        t.get("words").and_then(Value::as_array).map(|ws| {
                            ws.iter().any(|w| w.get("id").and_then(Value::as_str) == Some(wid))
                        }).unwrap_or(false)
                    })
                })
                .unwrap_or(false);
            if !word_exists {
                return Err(EditError::NotFound {
                    path: "start.wordId".into(),
                    message: format!("'{wid}' does not exist (or has been cut)"),
                });
            }
        }
    }
    let end = timing_arg(args, "end", &[])?;
    let duration = timing_arg(args, "duration", &[])?;
    if end.is_some() && duration.is_some() {
        return Err(EditError::Validation {
            path: "duration".into(),
            message: "give either end or duration, not both".into(),
        });
    }
    let mut timing = Value::obj();
    timing.set("start", start);
    if let Some(e) = end {
        timing.set("end", e);
    }
    if let Some(d) = duration {
        timing.set("duration", d);
    }
    let mut params = args.get("params").cloned().unwrap_or_else(Value::obj);
    if let Some(pos) = args.get("position") {
        if params.get("position").is_none() {
            params.set("position", pos.clone());
        }
    }
    let mut issues: Vec<(String, String)> = Vec::new();
    crate::catalog::check_common_params(&params, &mut issues);
    if let Some((path, message)) = issues.first() {
        return Err(EditError::Validation { path: path.clone(), message: message.clone() });
    }
    let id = gen_id.gen("cmp_");

    let mut component = Value::obj();
    component.set("componentId", Value::str(component_id));
    component.set("id", Value::str(&id));
    component.set("isEnabled", Value::Bool(true));
    component.set(
        "keyframes",
        args.get("keyframes").cloned().unwrap_or_else(|| Value::Array(Vec::new())),
    );
    let pos_from_params = params.get("position").cloned();
    component.set("params", params);
    component.set("timing", timing);
    component.set("zIndex", args.get("zIndex").cloned().unwrap_or(Value::Int(0)));
    if let Some(pos) = args.get("position").cloned().or(pos_from_params) {
        component.set("position", pos);
    }
    if let Some(mask) = args.get("mask") {
        component.set("mask", mask.clone());
    }
    // The renderer checks faces / overlaps; without it only this much:
    fx.warnings.push("faces were not checked".into());

    // Placement: explicit trackId, else the track matching the component's
    // category (backgrounds on the scenes track, captions on the caption
    // track, everything else on a plain overlay track).
    let tracks = tracks_mut(root);
    let track_idx = match args.get("trackId").and_then(Value::as_str) {
        Some(tid) => tracks
            .iter()
            .position(|t| t.get("id").and_then(Value::as_str) == Some(tid))
            .ok_or_else(|| EditError::NotFound {
                path: "trackId".into(),
                message: format!("no track '{tid}'"),
            })?,
        None => component_home(tracks, component_id),
    };
    if tracks[track_idx].get("kind").and_then(Value::as_str) == Some("audio") {
        return Err(EditError::Validation {
            path: "trackId".into(),
            message: "components cannot sit on an audio track".into(),
        });
    }
    tracks[track_idx]
        .get_mut("components")
        .and_then(Value::as_array_mut)
        .expect("track components")
        .push(component);
    Ok(id)
}

/// Where a component lives when no trackId is given: a caption goes on the
/// caption track, a background on the scenes overlay, anything else on a
/// plain overlay (never the scenes track, which holds the backdrop).
fn component_home(tracks: &[Value], component_id: &str) -> usize {
    let is_overlay = |t: &Value| t.get("kind").and_then(Value::as_str) == Some("overlay");
    let is_caption = |t: &Value| t.get("kind").and_then(Value::as_str) == Some("caption");
    let is_scenes = |t: &Value| t.get("role").and_then(Value::as_str) == Some("scenes");
    let is_plain = |t: &Value| is_overlay(t) && t.get("role").and_then(Value::as_str).is_none();
    let overlays: Vec<usize> = tracks
        .iter()
        .enumerate()
        .filter(|(_, t)| is_overlay(t))
        .map(|(i, _)| i)
        .collect();
    let pick = match crate::catalog::category_of(component_id) {
        Some("background") => overlays.iter().copied().find(|&i| is_scenes(&tracks[i])),
        Some("caption") => tracks
            .iter()
            .position(is_caption)
            .or_else(|| overlays.iter().copied().find(|&i| is_plain(&tracks[i]))),
        _ => overlays.iter().copied().find(|&i| is_plain(&tracks[i])),
    };
    pick.or_else(|| overlays.first().copied())
        .or_else(|| tracks.iter().position(|t| t.get("kind").and_then(Value::as_str) != Some("audio")))
        .unwrap_or(0)
}

fn find_component_mut<'a>(
    root: &'a mut Value,
    id: &str,
) -> Result<(usize, usize, &'a mut Value), EditError> {
    let tracks = tracks_mut(root);
    for (ti, track) in tracks.iter_mut().enumerate() {
        let components = track
            .get_mut("components")
            .and_then(Value::as_array_mut)
            .expect("track components");
        for (ci, c) in components.iter_mut().enumerate() {
            if c.get("id").and_then(Value::as_str) == Some(id) {
                return Ok((ti, ci, c));
            }
        }
    }
    Err(EditError::NotFound { path: "id".into(), message: format!("no component '{id}'") })
}

fn update_component(root: &mut Value, args: &Value, created: &[(String, String)]) -> Result<(), EditError> {
    let id_ref = args
        .get("instanceId")
        .or_else(|| args.get("id"))
        .ok_or_else(|| EditError::Validation {
            path: "instanceId".into(),
            message: "required".into(),
        })?;
    let id = deref(id_ref.as_str().unwrap_or(""), created)
        .ok_or_else(|| EditError::Validation { path: "instanceId".into(), message: "unknown $ref".into() })?
        .to_string();
    let (_, _, component) = find_component_mut(root, &id)?;
    if let Some(params) = args.get("params") {
        if !matches!(params, Value::Object(_)) {
            return Err(EditError::Validation { path: "params".into(), message: "expected an object (merge patch)".into() });
        }
        let mut issues: Vec<(String, String)> = Vec::new();
        crate::catalog::check_common_params(params, &mut issues);
        if let Some((path, message)) = issues.first() {
            return Err(EditError::Validation { path: path.clone(), message: message.clone() });
        }
        // Merge patch: a null resets the key, everything else replaces it.
        let existing = component
            .get_mut("params")
            .and_then(Value::as_object_mut)
            .expect("component params");
        for (k, v) in params.as_object().unwrap() {
            if v.is_null() {
                existing.retain(|(ek, _)| ek != k);
                continue;
            }
            let mut replaced = false;
            for (ek, ev) in existing.iter_mut() {
                if ek == k {
                    *ev = v.clone();
                    replaced = true;
                    break;
                }
            }
            if !replaced {
                existing.push((k.clone(), v.clone()));
            }
        }
    }
    if let Some(replace) = args.get("replaceParams") {
        component.set("params", replace.clone());
    }
    // keyframes REPLACE all.
    if let Some(kfs) = args.get("keyframes") {
        component.set("keyframes", kfs.clone());
    }
    for (arg, stored) in [
        ("enabled", "isEnabled"),
        ("isEnabled", "isEnabled"),
        ("zIndex", "zIndex"),
        ("position", "position"),
    ] {
        if let Some(v) = args.get(arg) {
            component.set(stored, v.clone());
        }
    }
    if let Some(pos) = args.get("position") {
        if let Some(p_obj) = component.get_mut("params") {
            p_obj.set("position", pos.clone());
        }
    } else if let Some(pos) = args.get("params").and_then(|p| p.get("position")).cloned() {
        component.set("position", pos);
    }
    if let Some(timing) = component.get_mut("timing") {
        for key in ["start", "end", "duration"] {
            if let Some(v) = timing_arg(args, key, created)? {
                timing.set(key, v);
            }
        }
    }
    if let Some(mask) = args.get("mask") {
        component.set("mask", mask.clone());
    }
    if args.get("clearMask").and_then(Value::as_bool) == Some(true) {
        component.remove("mask");
    }
    Ok(())
}

/// Removes an entity by id from whichever track holds it (components / clips /
/// audioEvents, selected by `list`).
fn remove_by_id(
    root: &mut Value,
    args: &Value,
    created: &[(String, String)],
    list: &str,
    arg_name: &str,
) -> Result<(), EditError> {
    let id_ref = args
        .get(arg_name)
        .or_else(|| args.get("id"))
        .ok_or_else(|| EditError::Validation {
            path: arg_name.into(),
            message: "required".into(),
        })?;
    let id = deref(id_ref.as_str().unwrap_or(""), created)
        .ok_or_else(|| EditError::Validation { path: arg_name.into(), message: "unknown $ref".into() })?
        .to_string();
    let tracks = tracks_mut(root);
    for track in tracks.iter_mut() {
        let items = track
            .get_mut(list)
            .and_then(Value::as_array_mut)
            .expect("track list");
        if let Some(pos) = items.iter().position(|c| c.get("id").and_then(Value::as_str) == Some(id.as_str())) {
            items.remove(pos);
            return Ok(());
        }
    }
    Err(EditError::NotFound { path: arg_name.into(), message: format!("no {list} item '{id}'") })
}

// --- tracks --------------------------------------------------------------------

fn add_track(root: &mut Value, gen_id: &mut IdGen, args: &Value) -> Result<String, EditError> {
    let kind = get_str(args, "kind")?.ok_or_else(|| EditError::Validation {
        path: "kind".into(),
        message: "required (video | overlay | caption | audio)".into(),
    })?;
    if !matches!(kind, "video" | "overlay" | "caption" | "audio") {
        return Err(EditError::Validation {
            path: "kind".into(),
            message: "kind must be video, overlay, caption or audio".into(),
        });
    }
    let name = get_str(args, "name")?.unwrap_or(kind);
    let id = gen_id.gen("trk_");
    let mut track = Value::obj();
    track.set("audioEvents", Value::Array(Vec::new()));
    track.set("clips", Value::Array(Vec::new()));
    track.set("components", Value::Array(Vec::new()));
    track.set("id", Value::str(&id));
    track.set("isHidden", Value::Bool(false));
    track.set("isMuted", Value::Bool(false));
    track.set("kind", Value::str(kind));
    track.set("name", Value::str(name));
    if let Some(role) = get_str(args, "role")? {
        track.set("role", Value::str(role));
    }
    // `index` places the track (default on top); tracks composite bottom → top.
    let tracks = tracks_mut(root);
    let index = args
        .get("index")
        .and_then(Value::as_i64)
        .map(|i| i.clamp(0, tracks.len() as i64) as usize)
        .unwrap_or(tracks.len());
    tracks.insert(index, track);
    Ok(id)
}

fn update_track(root: &mut Value, args: &Value) -> Result<(), EditError> {
    let track_id = get_str(args, "trackId")?
        .or(get_str(args, "id")?)
        .ok_or_else(|| EditError::Validation {
            path: "trackId".into(),
            message: "required".into(),
        })?;
    let tracks = tracks_mut(root);
    let track = tracks
        .iter_mut()
        .find(|t| t.get("id").and_then(Value::as_str) == Some(track_id))
        .ok_or_else(|| EditError::NotFound {
            path: "trackId".into(),
            message: format!("no track '{track_id}'"),
        })?;
    // Tool args are muted/hidden; the document stores isMuted/isHidden.
    for (arg, stored) in [
        ("name", "name"),
        ("muted", "isMuted"),
        ("isMuted", "isMuted"),
        ("hidden", "isHidden"),
        ("isHidden", "isHidden"),
    ] {
        if let Some(v) = args.get(arg) {
            track.set(stored, v.clone());
        }
    }
    Ok(())
}

// --- audio ---------------------------------------------------------------------

fn audio_role(v: Option<&str>) -> Result<&'static str, EditError> {
    match v {
        Some("sfx") => Ok("sfx"),
        Some("music") => Ok("music"),
        Some("voice") => Ok("voice"),
        Some(other) => Err(EditError::Validation {
            path: "role".into(),
            message: format!("role must be sfx, music or voice (got '{other}')"),
        }),
        None => Err(EditError::Validation { path: "role".into(), message: "required (sfx | music | voice)".into() }),
    }
}

fn add_audio(
    root: &mut Value,
    gen_id: &mut IdGen,
    _fx: &mut SideEffects,
    args: &Value,
    created: &[(String, String)],
) -> Result<String, EditError> {
    let asset_id = get_str(args, "assetId")?.ok_or_else(|| EditError::Validation {
        path: "assetId".into(),
        message: "required".into(),
    })?;
    let role = audio_role(get_str(args, "role")?)?;
    let asset = root
        .get("assets")
        .and_then(Value::as_array)
        .and_then(|a| {
            a.iter()
                .find(|x| x.get("id").and_then(Value::as_str) == Some(asset_id))
                .cloned()
        })
        .ok_or_else(|| EditError::NotFound { path: "assetId".into(), message: format!("no asset '{asset_id}'") })?;
    let start = require_timing(args, "start", created)?;
    let mut event = Value::obj();
    event.set("assetId", Value::str(asset_id));
    if let Some(d) = get_f64(args, "duration")? {
        event.set("duration", RationalTime::from_seconds(d, 1000).to_json());
    } else {
        event.set(
            "duration",
            asset.get("duration").cloned().unwrap_or_else(|| RationalTime::ZERO.to_json()),
        );
    }
    event.set("fadeIn", RationalTime::from_seconds(get_f64(args, "fadeIn")?.unwrap_or(0.0), 1000).to_json());
    event.set("fadeOut", RationalTime::from_seconds(get_f64(args, "fadeOut")?.unwrap_or(0.0), 1000).to_json());
    event.set("gainDB", Value::from_f64(get_f64(args, "gainDB")?.unwrap_or(0.0)));
    let id = gen_id.gen("aud_");
    event.set("id", Value::str(&id));
    event.set("loop", Value::Bool(args.get("loop").and_then(Value::as_bool).unwrap_or(false)));
    event.set("role", Value::str(role));
    event.set(
        "sourceStart",
        get_f64(args, "sourceStart")?
            .map(|s| RationalTime::from_seconds(s, 1000).to_json())
            .unwrap_or_else(|| RationalTime::ZERO.to_json()),
    );
    event.set("start", start);
    if let Some(ducking) = args.get("ducking") {
        event.set("ducking", ducking.clone());
    }

    // The role's audio track: explicit trackId, else the track with that
    // role, else the first audio track.
    let tracks = tracks_mut(root);
    let track_idx = match args.get("trackId").and_then(Value::as_str) {
        Some(tid) => tracks
            .iter()
            .position(|t| t.get("id").and_then(Value::as_str) == Some(tid))
            .ok_or_else(|| EditError::NotFound {
                path: "trackId".into(),
                message: format!("no track '{tid}'"),
            })?,
        None => tracks
            .iter()
            .position(|t| {
                t.get("kind").and_then(Value::as_str) == Some("audio")
                    && t.get("role").and_then(Value::as_str) == Some(role)
            })
            .or_else(|| tracks.iter().position(|t| t.get("kind").and_then(Value::as_str) == Some("audio")))
            .ok_or_else(|| EditError::Validation {
                path: "role".into(),
                message: "no audio track for this role; add_track {kind: \"audio\"} first".into(),
            })?,
    };
    if tracks[track_idx].get("kind").and_then(Value::as_str) != Some("audio") {
        return Err(EditError::Validation {
            path: "trackId".into(),
            message: "audio events live on audio tracks".into(),
        });
    }
    tracks[track_idx]
        .get_mut("audioEvents")
        .and_then(Value::as_array_mut)
        .expect("track audioEvents")
        .push(event);
    Ok(id)
}

/// `update_audio {eventId, …}` — the role changes in place (same id).
fn update_audio(root: &mut Value, args: &Value, created: &[(String, String)]) -> Result<(), EditError> {
    let id = args
        .get("eventId")
        .or_else(|| args.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| EditError::Validation { path: "eventId".into(), message: "required".into() })?;
    let concrete = deref(id, created).unwrap_or(id).to_string();
    let tracks = tracks_mut(root);
    for track in tracks.iter_mut() {
        let events = track.get_mut("audioEvents").and_then(Value::as_array_mut).expect("track audioEvents");
        for ev in events.iter_mut() {
            if ev.get("id").and_then(Value::as_str) == Some(concrete.as_str()) {
                for key in ["gainDB", "loop"] {
                    if let Some(v) = args.get(key) {
                        ev.set(key, v.clone());
                    }
                }
                if let Some(role) = get_str(args, "role")? {
                    audio_role(Some(role))?;
                    ev.set("role", Value::str(role)); // in place, same id
                }
                for key in ["duration", "sourceStart", "fadeIn", "fadeOut"] {
                    if let Some(v) = get_f64(args, key)? {
                        ev.set(key, RationalTime::from_seconds(v, 1000).to_json());
                    }
                }
                if let Some(s) = timing_arg(args, "start", created)? {
                    ev.set("start", s);
                }
                if let Some(ducking) = args.get("ducking") {
                    ev.set("ducking", ducking.clone());
                }
                if args.get("clearDucking").and_then(Value::as_bool) == Some(true) {
                    ev.remove("ducking");
                }
                return Ok(());
            }
        }
    }
    Err(EditError::NotFound { path: "eventId".into(), message: format!("no audio event '{concrete}'") })
}

// --- clips ---------------------------------------------------------------------

fn find_clip_mut<'a>(
    root: &'a mut Value,
    id: &str,
) -> Result<(usize, usize, &'a mut Value), EditError> {
    let tracks = tracks_mut(root);
    for (ti, track) in tracks.iter_mut().enumerate() {
        let clips = track.get_mut("clips").and_then(Value::as_array_mut).expect("track clips");
        for (ci, clip) in clips.iter_mut().enumerate() {
            if clip.get("id").and_then(Value::as_str) == Some(id) {
                return Ok((ti, ci, clip));
            }
        }
    }
    Err(EditError::NotFound { path: "clipId".into(), message: format!("no clip '{id}'") })
}

fn clip_id<'a>(args: &'a Value, created: &'a [(String, String)]) -> Result<String, EditError> {
    let v = args
        .get("clipId")
        .or_else(|| args.get("id"))
        .and_then(Value::as_str)
        .ok_or_else(|| EditError::Validation { path: "clipId".into(), message: "required".into() })?;
    deref(v, created)
        .map(str::to_string)
        .ok_or_else(|| EditError::Validation { path: "clipId".into(), message: "unknown $ref".into() })
}

/// The main (bottom) video track index, if any.
fn main_video_idx(root: &Value) -> Option<usize> {
    root.get("tracks")
        .and_then(Value::as_array)?
        .iter()
        .position(|t| t.get("kind").and_then(Value::as_str) == Some("video"))
}

/// Shifts clips that start at/after `from` by `dur` (negative pulls left).
fn ripple_later_clips(root: &mut Value, track_idx: usize, from: f64, dur: f64) {
    let shift = RationalTime::from_seconds(dur, 1000);
    let tracks = tracks_mut(root);
    let Some(track) = tracks.get_mut(track_idx) else {
        return;
    };
    let Some(clips) = track.get_mut("clips").and_then(Value::as_array_mut) else {
        return;
    };
    for clip in clips.iter_mut() {
        let start = RationalTime::from_json(clip.get("timelineStart").unwrap_or(&Value::Null))
            .unwrap_or(RationalTime::ZERO)
            .resampled(1000);
        if start.seconds() >= from - 1e-9 {
            clip.set("timelineStart", start.add(&shift).to_json());
        }
    }
}

/// `trim_clip {clipId, sourceStart?, sourceEnd?, ripple?}` — source in/out.
fn trim_clip(root: &mut Value, args: &Value, created: &[(String, String)]) -> Result<(), EditError> {
    let id = clip_id(args, created)?;
    let ripple = args.get("ripple").and_then(Value::as_bool).unwrap_or(true);
    let (ti, _, clip) = find_clip_mut(root, &id)?;
    let clip = clip.clone();
    let old_start = RationalTime::from_json(
        clip.get("sourceRange").and_then(|r| r.get("start")).unwrap_or(&Value::Null),
    )
    .unwrap_or(RationalTime::ZERO)
    .resampled(1000);
    let old_dur = RationalTime::from_json(
        clip.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
    )
    .unwrap_or(RationalTime::ZERO)
    .resampled(1000);
    let new_start = get_f64(args, "sourceStart")?
        .map(|s| RationalTime::from_seconds(s, 1000))
        .unwrap_or(old_start);
    let new_end = get_f64(args, "sourceEnd")?.map(|e| RationalTime::from_seconds(e, 1000));
    let new_dur = match new_end {
        Some(end) => end.sub(&new_start),
        None => old_dur.sub(&new_start.sub(&old_start)),
    };
    if new_dur.seconds() <= 0.0 {
        return Err(EditError::Validation {
            path: "sourceEnd".into(),
            message: "the clip would have no length".into(),
        });
    }
    let delta = new_dur.seconds() - old_dur.seconds();
    let timeline_at = RationalTime::from_json(clip.get("timelineStart").unwrap_or(&Value::Null))
        .unwrap_or(RationalTime::ZERO)
        .seconds();
    let (_, _, clip) = find_clip_mut(root, &id)?;
    if let Some(r) = clip.get_mut("sourceRange") {
        r.set("start", new_start.to_json());
        r.set("duration", new_dur.to_json());
    }
    if ripple && delta < 0.0 {
        ripple_later_clips(root, ti, timeline_at + new_dur.seconds() + 1e-9, delta);
    }
    Ok(())
}

/// `move_clip {clipId, start, trackId?}` — never ripples; overlaps refused.
fn move_clip(root: &mut Value, args: &Value, created: &[(String, String)]) -> Result<(), EditError> {
    let id = clip_id(args, created)?;
    let to = get_f64(args, "start")?
        .or(get_f64(args, "to").ok().flatten())
        .ok_or_else(|| EditError::Validation {
            path: "start".into(),
            message: "required (timeline seconds)".into(),
        })?;
    let (ti, _, clip) = find_clip_mut(root, &id)?;
    let dur = RationalTime::from_json(
        clip.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
    )
    .unwrap_or(RationalTime::ZERO)
    .seconds();
    let target_track = match args.get("trackId").and_then(Value::as_str) {
        Some(tid) => tid.to_string(),
        None => {
            let tracks = root.get("tracks").and_then(Value::as_array).expect("tracks");
            tracks[ti].get("id").and_then(Value::as_str).unwrap_or("").to_string()
        }
    };
    // Overlap check on the destination track.
    {
        let tracks = root.get("tracks").and_then(Value::as_array).expect("tracks");
        let track = tracks
            .iter()
            .find(|t| t.get("id").and_then(Value::as_str) == Some(target_track.as_str()))
            .ok_or_else(|| EditError::NotFound {
                path: "trackId".into(),
                message: format!("no track '{target_track}'"),
            })?;
        for other in crate::project::Track::new(track).clips() {
            let other_id = other.get("id").and_then(Value::as_str).unwrap_or("");
            if other_id == id {
                continue;
            }
            let os = RationalTime::from_json(other.get("timelineStart").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO)
                .seconds();
            let od = RationalTime::from_json(
                other.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
            )
            .unwrap_or(RationalTime::ZERO)
            .seconds();
            if to < os + od && os < to + dur {
                return Err(EditError::Validation {
                    path: "start".into(),
                    message: format!(
                        "would overlap clip '{other_id}' on that track (move_clip never ripples)"
                    ),
                });
            }
        }
    }
    if args.get("trackId").and_then(Value::as_str).is_some() {
        // Move between tracks: pull from the old, append to the new.
        let (_, _, clip) = find_clip_mut(root, &id)?;
        let clip = clip.clone();
        let tracks = tracks_mut(root);
        if let Some(track) = tracks
            .iter_mut()
            .find(|t| t.get("id").and_then(Value::as_str) == Some(target_track.as_str()))
        {
            let clips = track.get_mut("clips").and_then(Value::as_array_mut).expect("track clips");
            clips.retain(|c| c.get("id").and_then(Value::as_str) != Some(id.as_str()));
            clips.push(clip);
        }
    }
    let (_, _, clip) = find_clip_mut(root, &id)?;
    clip.set("timelineStart", RationalTime::from_seconds(to, 1000).to_json());
    Ok(())
}

/// `remove_clip {clipId, ripple?}` — ripple by default; reports the new cut.
fn remove_clip(
    root: &mut Value,
    fx: &mut SideEffects,
    args: &Value,
    created: &[(String, String)],
) -> Result<(), EditError> {
    let id = clip_id(args, created)?;
    let ripple = args.get("ripple").and_then(Value::as_bool).unwrap_or(true);
    let (ti, _, clip) = find_clip_mut(root, &id)?;
    let at = RationalTime::from_json(clip.get("timelineStart").unwrap_or(&Value::Null))
        .unwrap_or(RationalTime::ZERO)
        .seconds();
    let dur = RationalTime::from_json(
        clip.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
    )
    .unwrap_or(RationalTime::ZERO)
    .seconds();
    {
        let tracks = tracks_mut(root);
        let track = &mut tracks[ti];
        let clips = track.get_mut("clips").and_then(Value::as_array_mut).expect("track clips");
        clips.retain(|c| c.get("id").and_then(Value::as_str) != Some(id.as_str()));
    }
    if ripple {
        ripple_later_clips(root, ti, at + dur, -dur);
        fx.cuts.push(at);
    }
    Ok(())
}

/// `update_clip {clipId, fit?, framing?, opacity?, gainDB?, enabled?}`.
fn update_clip(root: &mut Value, args: &Value, created: &[(String, String)]) -> Result<(), EditError> {
    let id = clip_id(args, created)?;
    let (_, _, clip) = find_clip_mut(root, &id)?;
    for key in ["fit", "opacity", "gainDB"] {
        if let Some(v) = args.get(key) {
            clip.set(key, v.clone());
        }
    }
    if let Some(v) = args.get("enabled") {
        clip.set("isEnabled", v.clone());
    }
    if let Some(framing) = args.get("framing") {
        if framing.is_null() {
            clip.remove("framing");
        } else {
            clip.set("framing", framing.clone());
        }
    }
    Ok(())
}

/// `set_clip_framing_keyframe {time, clipId?, x?, y?, scale?, easing?, moveSeconds?, remove?}`:
/// one pan-zoom keyframe; x/y = SOURCE point kept centred (0–1), scale ≥ 1.
fn set_clip_framing_keyframe(
    root: &mut Value,
    args: &Value,
    created: &[(String, String)],
) -> Result<(), EditError> {
    let time = get_f64(args, "time")?.ok_or_else(|| EditError::Validation {
        path: "time".into(),
        message: "required (seconds in the clip)".into(),
    })?;
    // Default: the top-most clip covering `time`.
    let id = match args.get("clipId").or_else(|| args.get("id")).and_then(Value::as_str) {
        Some(v) => deref(v, created)
            .map(str::to_string)
            .ok_or_else(|| EditError::Validation { path: "clipId".into(), message: "unknown $ref".into() })?,
        None => {
            let tracks = root.get("tracks").and_then(Value::as_array).expect("tracks");
            let mut found: Option<String> = None;
            for track in tracks.iter() {
                if track.get("kind").and_then(Value::as_str) != Some("video") {
                    continue;
                }
                for clip in crate::project::Track::new(track).clips() {
                    let s = RationalTime::from_json(clip.get("timelineStart").unwrap_or(&Value::Null))
                        .unwrap_or(RationalTime::ZERO)
                        .seconds();
                    let d = RationalTime::from_json(
                        clip.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
                    )
                    .unwrap_or(RationalTime::ZERO)
                    .seconds();
                    if time >= s && time <= s + d {
                        found = Some(clip.get("id").and_then(Value::as_str).unwrap_or("").to_string());
                    }
                }
            }
            found.ok_or_else(|| EditError::NotFound {
                path: "clipId".into(),
                message: format!("no clip at {time} s to keyframe"),
            })?
        }
    };
    let remove = args.get("remove").and_then(Value::as_bool).unwrap_or(false);
    let (_, _, clip) = find_clip_mut(root, &id)?;
    let mut framing = clip.get("framing").cloned().unwrap_or_else(Value::obj);
    let mut keyframes = framing
        .get("keyframes")
        .and_then(Value::as_array)
        .map(<[Value]>::to_vec)
        .unwrap_or_default();
    if remove {
        keyframes.retain(|k| {
            k.get("time").and_then(Value::as_f64).map(|t| (t - time).abs() > 1e-9).unwrap_or(true)
        });
    } else {
        if let Some(x) = get_f64(args, "x")? {
            if !(0.0..=1.0).contains(&x) {
                return Err(EditError::Validation {
                    path: "x".into(),
                    message: "x is the source point kept centred: 0-1".into(),
                });
            }
        }
        if let Some(scale) = get_f64(args, "scale")? {
            if scale < 1.0 {
                return Err(EditError::Validation { path: "scale".into(), message: "scale must be >= 1".into() });
            }
        }
        let mut kf = Value::obj();
        kf.set("time", Value::from_f64(time));
        for key in ["x", "y", "scale", "easing", "moveSeconds"] {
            if let Some(v) = args.get(key) {
                kf.set(key, v.clone());
            }
        }
        keyframes.retain(|k| {
            k.get("time").and_then(Value::as_f64).map(|t| (t - time).abs() > 1e-9).unwrap_or(true)
        });
        keyframes.push(kf);
        keyframes.sort_by(|a, b| {
            a.get("time")
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
                .partial_cmp(&b.get("time").and_then(Value::as_f64).unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }
    framing.set("keyframes", Value::Array(keyframes));
    clip.set("framing", framing);
    Ok(())
}

fn insert_clip(root: &mut Value, gen_id: &mut IdGen, args: &Value, created: &[(String, String)]) -> Result<String, EditError> {
    let asset_id = get_str(args, "assetId")?.ok_or_else(|| EditError::Validation {
        path: "assetId".into(),
        message: "required".into(),
    })?;
    let asset = {
        let assets = root.get("assets").and_then(Value::as_array).expect("assets");
        assets
            .iter()
            .find(|x| x.get("id").and_then(Value::as_str) == Some(asset_id))
            .cloned()
            .ok_or_else(|| EditError::NotFound {
                path: "assetId".into(),
                message: format!("no asset '{asset_id}'"),
            })?
    };
    let track_ref = args.get("trackId").and_then(Value::as_str).ok_or_else(|| EditError::Validation {
        path: "trackId".into(),
        message: "required".into(),
    })?;
    let track_id = deref(track_ref, created)
        .ok_or_else(|| EditError::Validation { path: "trackId".into(), message: "unknown $ref".into() })?
        .to_string();
    let at = get_f64(args, "at")?.ok_or_else(|| EditError::Validation {
        path: "at".into(),
        message: "required (seconds on the timeline)".into(),
    })?;
    let source_start = get_f64(args, "sourceStart")?.unwrap_or(0.0);
    let source_duration = get_f64(args, "sourceEnd")?
        .map(|end| (end - source_start).max(0.0))
        .or(get_f64(args, "duration").ok().flatten())
        .unwrap_or_else(|| {
            RationalTime::from_json(asset.get("duration").unwrap_or(&Value::Null))
                .map(|d| d.seconds())
                .unwrap_or(0.0)
        });
    if source_duration <= 0.0 {
        return Err(EditError::Validation {
            path: "sourceEnd".into(),
            message: "the clip would have no length".into(),
        });
    }
    let fit = get_str(args, "fit")?.unwrap_or("fit");
    if !matches!(fit, "fit" | "fill" | "stretch") {
        return Err(EditError::Validation {
            path: "fit".into(),
            message: "fit must be fit, fill or stretch".into(),
        });
    }
    let id = gen_id.gen("clp_");
    let mut clip = Value::obj();
    clip.set("assetId", Value::str(asset_id));
    clip.set("fit", Value::str(fit));
    clip.set("gainDB", Value::from_f64(get_f64(args, "gainDB")?.unwrap_or(0.0)));
    clip.set("id", Value::str(&id));
    clip.set("isEnabled", Value::Bool(true));
    clip.set("opacity", Value::from_f64(get_f64(args, "opacity")?.unwrap_or(1.0)));
    let mut source_range = Value::obj();
    source_range.set("duration", RationalTime::from_seconds(source_duration, 1000).to_json());
    source_range.set("start", RationalTime::from_seconds(source_start, 1000).to_json());
    clip.set("sourceRange", source_range);
    clip.set("timelineStart", RationalTime::from_seconds(at, 1000).to_json());

    let main_idx = main_video_idx(root);
    let track_idx = root
        .get("tracks")
        .and_then(Value::as_array)
        .expect("tracks")
        .iter()
        .position(|t| t.get("id").and_then(Value::as_str) == Some(track_id.as_str()))
        .ok_or_else(|| EditError::NotFound { path: "trackId".into(), message: format!("no track '{track_id}'") })?;
    if root
        .get("tracks")
        .and_then(Value::as_array)
        .expect("tracks")[track_idx]
        .get("kind")
        .and_then(Value::as_str)
        == Some("audio")
    {
        return Err(EditError::Validation {
            path: "trackId".into(),
            message: "video clips live on video / overlay tracks (audio goes through add_audio)".into(),
        });
    }
    // Ripple defaults to true on the MAIN (bottom) video track only.
    let is_main = track_idx == main_idx.unwrap_or(usize::MAX);
    let ripple = args.get("ripple").and_then(Value::as_bool).unwrap_or(is_main);
    if ripple {
        ripple_later_clips(root, track_idx, at, source_duration);
    }
    let tracks = tracks_mut(root);
    tracks[track_idx]
        .get_mut("clips")
        .and_then(Value::as_array_mut)
        .expect("track clips")
        .push(clip);
    Ok(id)
}

// --- settings ------------------------------------------------------------------

fn set_project_settings(root: &mut Value, args: &Value) -> Result<(), EditError> {
    if let Some(name) = get_str(args, "name")? {
        root.set("name", Value::str(name));
    }
    let mut settings = root.get_mut("settings").cloned().unwrap_or_else(Value::obj);
    let width = get_f64(args, "width")?;
    let height = get_f64(args, "height")?;
    match (width, height) {
        (Some(w), Some(h)) => {
            if w <= 0.0 || h <= 0.0 || w % 2.0 != 0.0 || h % 2.0 != 0.0 {
                return Err(EditError::Validation {
                    path: "width".into(),
                    message: "width and height must be positive even numbers".into(),
                });
            }
            let mut res = settings.get("resolution").cloned().unwrap_or_else(Value::obj);
            res.set("width", Value::from_f64(w));
            res.set("height", Value::from_f64(h));
            settings.set("resolution", res);
        }
        (None, None) => {}
        _ => {
            return Err(EditError::Validation {
                path: "height".into(),
                message: "width and height change together".into(),
            });
        }
    }
    if let Some(fps) = get_f64(args, "fps")? {
        if !(1.0..=120.0).contains(&fps) {
            return Err(EditError::Validation { path: "fps".into(), message: "fps must be 1-120".into() });
        }
        let mut fr = Value::obj();
        fr.set("numerator", Value::from_f64(fps));
        fr.set("denominator", Value::Int(1));
        settings.set("frameRate", fr);
    }
    if let Some(lufs) = get_f64(args, "loudnessTargetLUFS")? {
        if !(-40.0..=-5.0).contains(&lufs) {
            return Err(EditError::Validation {
                path: "loudnessTargetLUFS".into(),
                message: "loudnessTargetLUFS must be -40…-5".into(),
            });
        }
        let mut loud = settings.get("loudness").cloned().unwrap_or_else(Value::obj);
        loud.set("integratedLUFS", Value::from_f64(lufs));
        settings.set("loudness", loud);
    }
    if let Some(policy) = get_str(args, "hdrPolicy")? {
        if !matches!(policy, "toneMapToSDR" | "preserveHDR") {
            return Err(EditError::Validation {
                path: "hdrPolicy".into(),
                message: "hdrPolicy must be toneMapToSDR or preserveHDR".into(),
            });
        }
        settings.set("hdrPolicy", Value::str(policy));
    }
    if let Some(d) = get_f64(args, "durationSeconds")? {
        if d <= 0.0 {
            return Err(EditError::Validation {
                path: "durationSeconds".into(),
                message: "must be positive".into(),
            });
        }
        settings.set("targetDuration", RationalTime::from_seconds(d, 1000).to_json());
    }
    if let Some(cast) = args.get("cast") {
        let merged = merge_cast(settings.get("cast"), cast)?;
        settings.set("cast", merged);
    }
    *root.get_mut("settings").expect("settings") = settings;
    Ok(())
}

/// The project's cast: named characters every scene draws the same way
/// (`sw.character({ cast: 'host', pose })`). `cast` maps a name to the
/// member's look (style, colours, hair, outfit, or SVG `parts`); a member
/// set to null leaves the cast, and members not named are kept.
fn merge_cast(current: Option<&Value>, cast: &Value) -> Result<Value, EditError> {
    let Value::Object(entries) = cast else {
        return Err(EditError::Validation { path: "cast".into(), message: "cast must be an object of name → character".into() });
    };
    let mut out = match current {
        Some(v @ Value::Object(_)) => v.clone(),
        _ => Value::obj(),
    };
    for (name, member) in entries {
        let ok_name = !name.is_empty()
            && name.len() <= 40
            && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        if !ok_name {
            return Err(EditError::Validation {
                path: format!("cast.{name}"),
                message: "cast names are 1-40 letters, digits, _ or -".into(),
            });
        }
        match member {
            Value::Null => {
                out.remove(name);
            }
            Value::Object(_) => {
                if member.to_string_pretty(false).len() > 512 * 1024 {
                    return Err(EditError::Validation {
                        path: format!("cast.{name}"),
                        message: "a cast member is at most 512 KB".into(),
                    });
                }
                out.set(name, member.clone());
            }
            _ => {
                return Err(EditError::Validation {
                    path: format!("cast.{name}"),
                    message: "a cast member is an object (or null to remove it)".into(),
                });
            }
        }
    }
    Ok(out)
}

fn set_theme_op(root: &mut Value, args: &Value) -> Result<(), EditError> {
    let settings = root.get_mut("settings").ok_or_else(|| EditError::Validation {
        path: "settings".into(),
        message: "missing".into(),
    })?;
    crate::theme::apply(settings, args).map_err(|e| EditError::Validation {
        path: "preset".into(),
        message: e,
    })?;
    Ok(())
}

// --- cut_range -----------------------------------------------------------------

/// Ripple-removes `[start, end)` seconds from the timeline: the main track
/// ripples, words inside the range disappear (ids stay stable, later words
/// shift earlier), word-anchored components follow automatically and
/// absolute-timed items shift / drop.
fn cut_range(root: &mut Value, fx: &mut SideEffects, args: &Value) -> Result<(), EditError> {
    let (start_s, end_s) = match (
        get_f64(args, "start")?,
        get_f64(args, "end")?,
        get_str(args, "fromWordId")?,
        get_str(args, "toWordId")?,
    ) {
        (Some(s), Some(e), _, _) => (s, e),
        (None, None, Some(from), Some(to)) => {
            // Inclusive word range: from's start → to's end.
            let word_span = |id: &str| -> Option<(f64, f64)> {
                root.get("transcripts").and_then(Value::as_array).and_then(|ts| {
                    ts.iter().find_map(|t| {
                        t.get("words").and_then(Value::as_array).and_then(|ws| {
                            ws.iter().find(|w| w.get("id").and_then(Value::as_str) == Some(id)).and_then(|w| {
                                let s = RationalTime::from_json(w.get("start").unwrap_or(&Value::Null))?;
                                let e = RationalTime::from_json(w.get("end").unwrap_or(&Value::Null))?;
                                Some((s.seconds(), e.seconds()))
                            })
                        })
                    })
                })
            };
            let Some((fs, _)) = word_span(from) else {
                return Err(EditError::NotFound {
                    path: "fromWordId".into(),
                    message: format!("'{from}' does not exist (or has been cut)"),
                });
            };
            let Some((_, te)) = word_span(to) else {
                return Err(EditError::NotFound {
                    path: "toWordId".into(),
                    message: format!("'{to}' does not exist (or has been cut)"),
                });
            };
            (fs, te)
        }
        _ => {
            return Err(EditError::Validation {
                path: "start".into(),
                message: "give start or fromWordId".into(),
            });
        }
    };
    if end_s <= start_s {
        return Err(EditError::Validation { path: "end".into(), message: "end must be after start".into() });
    }
    let start = RationalTime::from_seconds(start_s, 1000);
    let end = RationalTime::from_seconds(end_s, 1000);
    let dur = RationalTime::from_seconds(end_s - start_s, 1000);

    // Clips: trim or remove the range, shift later ones.
    let tracks = tracks_mut(root);
    for track in tracks.iter_mut() {
        let Some(clips) = track.get_mut("clips").and_then(Value::as_array_mut) else {
            continue;
        };
        let mut keep = Vec::with_capacity(clips.len());
        for mut clip in clips.drain(..) {
            let tl_start = RationalTime::from_json(clip.get("timelineStart").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let src_dur = clip
                .get("sourceRange")
                .and_then(|r| r.get("duration"))
                .and_then(RationalTime::from_json)
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let tl_end = tl_start.add(&src_dur);
            let cmp = |a: &RationalTime, b: &RationalTime| a.cmp_time(b);
            if cmp(&tl_start, &end) != std::cmp::Ordering::Less {
                // Entirely after the cut: shift left.
                clip.set("timelineStart", tl_start.sub(&dur).to_json());
                keep.push(clip);
            } else if cmp(&tl_end, &start) != std::cmp::Ordering::Greater {
                // Entirely before the cut: untouched.
                keep.push(clip);
            } else {
                // Overlaps the cut: remove the overlapped part; a straddling
                // clip that still has length on both sides splits in two —
                // the right piece continues after the cut.
                let left_len = if cmp(&start, &tl_start) == std::cmp::Ordering::Greater {
                    start.sub(&tl_start)
                } else {
                    RationalTime::ZERO
                };
                let right_start = if cmp(&end, &tl_end) == std::cmp::Ordering::Less {
                    end
                } else {
                    tl_end
                };
                let right_len = tl_end.sub(&right_start);
                let mut changed = false;
                if left_len.value > 0 {
                    let mut left = clip.clone();
                    left.set("timelineStart", tl_start.to_json());
                    set_source_duration(&mut left, &left_len);
                    keep.push(left);
                    changed = true;
                }
                if right_len.value > 0 {
                    let mut right = clip.clone();
                    right.set(
                        "timelineStart",
                        right_start.sub(&dur).to_json(),
                    );
                    let src_start = RationalTime::from_json(
                        clip.get("sourceRange").and_then(|r| r.get("start")).unwrap_or(&Value::Null),
                    )
                    .unwrap_or(RationalTime::ZERO)
                    .resampled(1000);
                    let consumed = right_start.sub(&tl_start);
                    set_source_range(&mut right, &src_start.add(&consumed), &right_len);
                    keep.push(right);
                    changed = true;
                }
                if !changed {
                    // Fully inside the range: removed.
                }
            }
        }
        *clips = keep;

        // Audio events: same ripple.
        let Some(events) = track.get_mut("audioEvents").and_then(Value::as_array_mut) else {
            continue;
        };
        let mut keep = Vec::with_capacity(events.len());
        for ev in events.drain(..) {
            let ev_start = RationalTime::from_json(ev.get("start").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let ev_dur = RationalTime::from_json(ev.get("duration").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let ev_end = ev_start.add(&ev_dur);
            let cmp = |a: &RationalTime, b: &RationalTime| a.cmp_time(b);
            if crate::project::Project::is_word_anchored(ev.get("start").unwrap_or(&Value::Null)) {
                // Word-anchored audio follows the transcript shift below.
                keep.push(ev);
            } else if cmp(&ev_start, &end) != std::cmp::Ordering::Less {
                let mut shifted = ev.clone();
                shifted.set("start", ev_start.sub(&dur).to_json());
                keep.push(shifted);
            } else if cmp(&ev_end, &start) != std::cmp::Ordering::Greater {
                keep.push(ev);
            } else {
                // Overlaps: trim into the surviving piece(s) on either side.
                let left_len = if cmp(&start, &ev_start) == std::cmp::Ordering::Greater {
                    start.sub(&ev_start)
                } else {
                    RationalTime::ZERO
                };
                let right_start = if cmp(&end, &ev_end) == std::cmp::Ordering::Less {
                    end
                } else {
                    ev_end
                };
                let right_len = ev_end.sub(&right_start);
                if left_len.value > 0 {
                    let mut left = ev.clone();
                    left.set("duration", left_len.to_json());
                    keep.push(left);
                }
                if right_len.value > 0 {
                    let mut right = ev.clone();
                    right.set("start", right_start.sub(&dur).to_json());
                    right.set("duration", right_len.to_json());
                    keep.push(right);
                }
            }
        }
        *events = keep;
    }

    // Transcripts: drop words inside the range, clamp straddlers, shift the
    // rest. Segment times follow; word ids never change.
    if let Some(transcripts) = root.get_mut("transcripts").and_then(Value::as_array_mut) {
        for t in transcripts.iter_mut() {
            let Some(words) = t.get_mut("words").and_then(Value::as_array_mut) else {
                continue;
            };
            for w in words.iter_mut() {
                let ws = RationalTime::from_json(w.get("start").unwrap_or(&Value::Null))
                    .unwrap_or(RationalTime::ZERO)
                    .resampled(1000);
                let we = RationalTime::from_json(w.get("end").unwrap_or(&Value::Null))
                    .unwrap_or(RationalTime::ZERO)
                    .resampled(1000);
                let cmp = |a: &RationalTime, b: &RationalTime| a.cmp_time(b);
                // Words fully after the cut shift earlier; overlapping words
                // keep their surviving piece (the head is clamped to the cut
                // start, the tail lands right after it).
                let (ns, ne) = if cmp(&we, &start) != std::cmp::Ordering::Greater {
                    (ws, we) // entirely before the cut
                } else if cmp(&ws, &end) != std::cmp::Ordering::Less {
                    (ws.sub(&dur), we.sub(&dur)) // entirely after: shift
                } else {
                    let tail_start = if cmp(&we, &end) == std::cmp::Ordering::Greater {
                        we.sub(&dur) // has a tail after the cut: shift it back
                    } else {
                        start // ends inside the cut: clamp to its start
                    };
                    (if cmp(&ws, &start) == std::cmp::Ordering::Less { ws } else { start }, tail_start)
                };
                w.set("start", ns.to_json());
                w.set("end", ne.to_json());
            }
            let survivors: Vec<String> = words
                .iter()
                .filter_map(|w| {
                    let ws = RationalTime::from_json(w.get("start").unwrap_or(&Value::Null))
                        .unwrap_or(RationalTime::ZERO)
                        .resampled(1000);
                    let we = RationalTime::from_json(w.get("end").unwrap_or(&Value::Null))
                        .unwrap_or(RationalTime::ZERO)
                        .resampled(1000);
                    // A word with zero length after the cut is gone.
                    if we.cmp_time(&ws) != std::cmp::Ordering::Greater {
                        None
                    } else {
                        w.get("id").and_then(Value::as_str).map(str::to_string)
                    }
                })
                .collect();
            words.retain(|w| {
                let id = w.get("id").and_then(Value::as_str).unwrap_or("");
                survivors.iter().any(|s| s == id)
            });
            let words_clone = words.clone();
            // Rebuild segment bounds from surviving words.
            if let Some(segments) = t.get_mut("segments").and_then(Value::as_array_mut) {
                for seg in segments.iter_mut() {
                    let Some(ids) = seg.get_mut("wordIds").and_then(Value::as_array_mut) else {
                        continue;
                    };
                    ids.retain(|v| {
                        let id = v.as_str().unwrap_or("");
                        survivors.iter().any(|s| s == id)
                    });
                    let times: Vec<(RationalTime, RationalTime)> = ids
                        .iter()
                        .filter_map(|v| {
                            let id = v.as_str()?;
                            words_clone
                                .iter()
                                .find(|w| w.get("id").and_then(Value::as_str) == Some(id))
                                .map(|w| {
                                    (
                                        RationalTime::from_json(w.get("start").unwrap_or(&Value::Null))
                                            .unwrap_or(RationalTime::ZERO)
                                            .resampled(1000),
                                        RationalTime::from_json(w.get("end").unwrap_or(&Value::Null))
                                            .unwrap_or(RationalTime::ZERO)
                                            .resampled(1000),
                                    )
                                })
                        })
                        .collect();
                    if let Some((first, _)) = times.first() {
                        seg.set("start", first.to_json());
                    }
                    if let Some((_, last)) = times.last() {
                        seg.set("end", last.to_json());
                    }
                }
                segments.retain(|seg| {
                    seg.get("wordIds")
                        .and_then(Value::as_array)
                        .map(|ids| !ids.is_empty())
                        .unwrap_or(true)
                });
            }
        }
    }

    // Items anchored to REMOVED words are deleted (the documented
    // contract); surviving word anchors keep following their words.
    let removed_words: Vec<String> = root
        .get("transcripts")
        .and_then(Value::as_array)
        .map(|ts| {
            ts.iter()
                .flat_map(|t| t.get("words").and_then(Value::as_array).map(|a| a.iter().collect::<Vec<_>>()).unwrap_or_default())
                .map(|w| w.get("id").and_then(Value::as_str).unwrap_or("").to_string())
                .collect::<Vec<String>>()
        })
        .unwrap_or_default();
    let anchored_to_dead = |item: &Value| -> bool {
        let timing = item.get("timing").or_else(|| item.get("start")).unwrap_or(&Value::Null);
        let anchor = timing.get("anchor").or(Some(timing)).unwrap_or(timing);
        match anchor.get("wordId").and_then(Value::as_str) {
            Some(wid) => !removed_words.iter().any(|w| w == wid),
            None => false,
        }
    };
    let tracks = tracks_mut(root);
    for track in tracks.iter_mut() {
        if let Some(components) = track.get_mut("components").and_then(Value::as_array_mut) {
            components.retain(|c| !anchored_to_dead(c));
        }
        if let Some(events) = track.get_mut("audioEvents").and_then(Value::as_array_mut) {
            events.retain(|e| !anchored_to_dead(e));
        }
    }

    // Notes: a note entirely inside the cut becomes a point at the cut start.
    if let Some(notes) = root.get_mut("notes").and_then(Value::as_array_mut) {
        let cut_start_json = RationalTime::from_seconds(start_s, 1000).to_json();
        for note in notes.iter_mut() {
            let ns = note.get("start").and_then(RationalTime::from_json).map(|t| t.seconds()).unwrap_or(0.0);
            let ne = note.get("end").and_then(RationalTime::from_json).map(|t| t.seconds()).unwrap_or(0.0);
            if ns >= start_s && ne <= end_s {
                note.set("start", cut_start_json.clone());
                note.set("end", cut_start_json.clone());
            }
        }
    }

    // Absolute-timed components: drop fully-inside ones, shift later ones.
    // Word-anchored components already followed their words.
    let tracks = tracks_mut(root);
    for track in tracks.iter_mut() {
        let Some(components) = track.get_mut("components").and_then(Value::as_array_mut) else {
            continue;
        };
        let mut keep = Vec::with_capacity(components.len());
        for c in components.drain(..) {
            let anchored = c
                .get("timing")
                .and_then(|t| t.get("start"))
                .and_then(|s| s.get("wordId"))
                .is_some();
            if anchored {
                keep.push(c);
                continue;
            }
            let start_time = c
                .get("timing")
                .and_then(|t| t.get("start"))
                .and_then(RationalTime::from_json)
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let end_time = c
                .get("timing")
                .and_then(|t| t.get("end"))
                .and_then(RationalTime::from_json)
                .map(|e| e.resampled(1000));
            let cmp = |a: &RationalTime, b: &RationalTime| a.cmp_time(b);
            let fully_inside = cmp(&start_time, &start) != std::cmp::Ordering::Less
                && end_time
                    .as_ref()
                    .map(|e| cmp(e, &end) != std::cmp::Ordering::Greater)
                    .unwrap_or(false);
            if fully_inside {
                continue; // removed
            }
            if cmp(&start_time, &end) != std::cmp::Ordering::Less {
                let mut shifted = c.clone();
                if let Some(t) = shifted.get_mut("timing") {
                    if let Some(s) = t.get_mut("start") {
                        *s = start_time.sub(&dur).to_json();
                    }
                    if let (Some(t2), Some(e)) = (t.get_mut("end"), end_time) {
                        *t2 = e.sub(&dur).to_json();
                    }
                }
                keep.push(shifted);
            } else {
                keep.push(c);
            }
        }
        *components = keep;
    }

    // The target duration shrinks by the cut; the ripple closes the gap by
    // default (ripple: false leaves later items where they were).
    let ripple = args.get("ripple").and_then(Value::as_bool).unwrap_or(true);
    if !ripple {
        // Put shifted absolute items back by re-adding the cut length where
        // the ripple moved them: simplest faithful model is to re-run the
        // shift with the opposite sign on absolute items only.
        let add_back = RationalTime::from_seconds(end_s - start_s, 1000);
        let tracks = tracks_mut(root);
        for track in tracks.iter_mut() {
            if let Some(clips) = track.get_mut("clips").and_then(Value::as_array_mut) {
                for clip in clips.iter_mut() {
                    let t = clip.get("timelineStart").cloned().unwrap_or(Value::Null);
                    if let Some(rt) = RationalTime::from_json(&t) {
                        if rt.seconds() >= start_s - 1e-9 {
                            clip.set("timelineStart", rt.add(&add_back).to_json());
                        }
                    }
                }
            }
        }
    }
    if let Some(settings) = root.get_mut("settings") {
        if let Some(td) = settings.get_mut("targetDuration") {
            if let Some(t) = RationalTime::from_json(td) {
                *td = t.sub(&dur).to_json();
            }
        }
    }
    fx.cuts.push(start_s);
    Ok(())
}

fn set_source_duration(clip: &mut Value, len: &RationalTime) {
    if let Some(r) = clip.get_mut("sourceRange") {
        r.set("duration", len.to_json());
    }
}

fn set_source_range(clip: &mut Value, start: &RationalTime, len: &RationalTime) {
    if let Some(r) = clip.get_mut("sourceRange") {
        r.set("start", start.to_json());
        r.set("duration", len.to_json());
    }
}

// --- correct_transcript ----------------------------------------------------------

/// `correct_transcript {edits: [{wordId | fromWordId + toWordId, text}]}`:
/// same word count keeps ids and times; another count splits the replaced
/// span by word length — the first ids are kept, extra words get new ids
/// (`createdIds` via ref names `w<i>`), merged words disappear
/// (`removedIds`) — segments follow, `wordCounter` advances.
fn correct_transcript(root: &mut Value, fx: &mut SideEffects, args: &Value) -> Result<(), EditError> {
    let fixes = args
        .get("edits")
        .and_then(Value::as_array)
        .ok_or_else(|| EditError::Validation { path: "edits".into(), message: "required".into() })?;
    let mut word_counter = root.get("wordCounter").and_then(Value::as_i64).unwrap_or(0);
    let Some(transcripts) = root.get_mut("transcripts").and_then(Value::as_array_mut) else {
        return Err(EditError::NotFound { path: "edits".into(), message: "the project has no transcript".into() });
    };
    for fix in fixes {
        let text = get_str(fix, "text")?
            .ok_or_else(|| EditError::Validation { path: "edits.text".into(), message: "required".into() })?
            .to_string();
        let new_words: Vec<String> = text.split_whitespace().map(str::to_string).collect();
        if new_words.len() > 50 {
            return Err(EditError::Validation {
                path: "edits.text".into(),
                message: "at most 50 words per edit".into(),
            });
        }
        let mut applied = false;
        for t in transcripts.iter_mut() {
            let Some(words) = t.get_mut("words").and_then(Value::as_array_mut) else {
                continue;
            };
            let id_of = |v: &Value| v.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            let (a, b): (usize, usize) = if let Some(word_id) = get_str(fix, "wordId")? {
                match words.iter().position(|w| id_of(w) == word_id) {
                    Some(i) => (i, i),
                    None => {
                        return Err(EditError::NotFound {
                            path: "edits.wordId".into(),
                            message: format!("'{word_id}' does not exist"),
                        });
                    }
                }
            } else if let (Some(from_id), Some(to_id)) =
                (get_str(fix, "fromWordId")?, get_str(fix, "toWordId")?)
            {
                let from_pos = words.iter().position(|w| id_of(w) == from_id);
                let to_pos = words.iter().position(|w| id_of(w) == to_id);
                match (from_pos, to_pos) {
                    (Some(a), Some(b)) if a <= b => (a, b),
                    (Some(_), Some(_)) => {
                        return Err(EditError::Validation {
                            path: "edits.toWordId".into(),
                            message: format!("'{to_id}' comes before '{from_id}'"),
                        });
                    }
                    (None, _) => {
                        return Err(EditError::NotFound {
                            path: "edits.fromWordId".into(),
                            message: format!("'{from_id}' does not exist"),
                        });
                    }
                    (_, None) => {
                        return Err(EditError::NotFound {
                            path: "edits.toWordId".into(),
                            message: format!("'{to_id}' does not exist"),
                        });
                    }
                }
            } else {
                return Err(EditError::Validation {
                    path: "edits".into(),
                    message: "each edit needs wordId, or fromWordId + toWordId".into(),
                });
            };
            // The replaced span's time budget, split by word length.
            let span_start = RationalTime::from_json(words[a].get("start").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let span_end = RationalTime::from_json(words[b].get("end").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO)
                .resampled(1000);
            let total_secs = (span_end.seconds() - span_start.seconds()).max(0.0);
            let total_chars: usize = new_words.iter().map(|w| w.chars().count()).sum();
            let confidence = words[a].get("confidence").cloned().unwrap_or(Value::Int(1));
            let mut removed_ids: Vec<String> = Vec::new();
            if new_words.len() == b - a + 1 {
                // Same count: ids and times kept, texts replaced.
                for (i, w) in new_words.iter().enumerate() {
                    words[a + i].set("text", Value::str(w));
                }
            } else {
                let mut allocated = 0.0;
                let mut rebuilt: Vec<Value> = Vec::new();
                for (i, w) in new_words.iter().enumerate() {
                    let share = if total_chars == 0 {
                        total_secs / new_words.len() as f64
                    } else {
                        total_secs * w.chars().count() as f64 / total_chars as f64
                    };
                    let ws = RationalTime::from_seconds(span_start.seconds() + allocated, 1000);
                    allocated += share;
                    let we = if i == new_words.len() - 1 {
                        span_end
                    } else {
                        RationalTime::from_seconds(span_start.seconds() + allocated, 1000)
                    };
                    let mut word = Value::obj();
                    if i <= b - a {
                        word.set("id", Value::str(&id_of(&words[a + i])));
                    } else {
                        // New id from wordCounter.
                        word_counter += 1;
                        let new_id = format!("w{word_counter}");
                        fx.warnings.push(format!("createdIds: {new_id}"));
                        word.set("id", Value::str(&new_id));
                    }
                    word.set("confidence", confidence.clone());
                    word.set("end", we.to_json());
                    word.set("start", ws.to_json());
                    word.set("text", Value::str(w));
                    rebuilt.push(word);
                }
                for old in &words[a..=b] {
                    let oid = id_of(old);
                    if !rebuilt.iter().any(|w| w.get("id").and_then(Value::as_str) == Some(oid.as_str())) {
                        removed_ids.push(oid);
                    }
                }
                fx.removed_ids.extend(removed_ids.iter().cloned());
                words.splice(a..=b, rebuilt);
            }
            // Rebuild segment word lists from the surviving words in order.
            let words_snapshot: Vec<Value> = words.clone();
            if let Some(segments) = t.get_mut("segments").and_then(Value::as_array_mut) {
                for seg in segments.iter_mut() {
                    if let Some(ids) = seg.get_mut("wordIds").and_then(Value::as_array_mut) {
                        ids.retain(|v| {
                            let id = v.as_str().unwrap_or("").to_string();
                            !removed_ids.contains(&id)
                                && words_snapshot
                                    .iter()
                                    .any(|w| w.get("id").and_then(Value::as_str) == Some(id.as_str()))
                        });
                    }
                }
                segments.retain(|seg| {
                    seg.get("wordIds")
                        .and_then(Value::as_array)
                        .map(|ids| !ids.is_empty())
                        .unwrap_or(true)
                });
            }
            applied = true;
            if applied {
                break;
            }
        }
        if !applied {
            return Err(EditError::NotFound {
                path: "edits".into(),
                message: "no such word id in any transcript".into(),
            });
        }
    }
    root.set("wordCounter", Value::Int(word_counter));
    Ok(())
}

/// `author_transcript {text, replace?}` — the stand-in for the app's TTS job:
/// creates the transcript from plain text with TTS-like timing (each word ≈
/// 240 ms + 60 ms per character, a small gap, sentence breaks at `.!?`).
/// From-zero authoring in the Rust alternative goes through this, then every
/// other tool (word anchors, kinetic words, chapters, subtitles) works
/// unchanged. A second call appends a transcript; `replace: true` rewrites the
/// story in place (word ids restart at w1, so word-anchored scenes keep
/// pointing at the same ordinal word).
fn author_transcript(root: &mut Value, args: &Value) -> Result<(), EditError> {
    /* A conversation is `turns: [{speaker, text, gap?}, ...]`: every word
       carries its speaker and a turn always ends a segment, so each segment
       has one voice. `gap` (seconds, -1.5..3) is the pause before the turn;
       negative overlaps the previous one (a quick "Aynen!" over its end).
       Otherwise `text` is one narrator. */
    let mut tokens: Vec<(String, Option<String>, bool, Option<f64>, Option<usize>)> = Vec::new();
    if let Some(turns) = args.get("turns") {
        let list = turns.as_array().ok_or_else(|| EditError::Validation {
            path: "turns".into(),
            message: "turns is a list of {speaker, text}".into(),
        })?;
        for (i, turn) in list.iter().enumerate() {
            let speaker = turn.get("speaker").and_then(Value::as_str).unwrap_or("");
            let ok = !speaker.is_empty()
                && speaker.len() <= 40
                && speaker.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
            if !ok {
                return Err(EditError::Validation {
                    path: format!("turns[{i}].speaker"),
                    message: "a speaker id is 1-40 letters, digits, _ or -".into(),
                });
            }
            let text = turn.get("text").and_then(Value::as_str).unwrap_or("");
            let ws: Vec<&str> = text.split_whitespace().collect();
            if ws.is_empty() {
                return Err(EditError::Validation { path: format!("turns[{i}].text"), message: "empty".into() });
            }
            let gap = match turn.get("gap") {
                None | Some(Value::Null) => None,
                Some(g) => match g.as_f64().or_else(|| g.as_i64().map(|v| v as f64)) {
                    Some(v) if (-1.5..=3.0).contains(&v) => Some(v),
                    _ => {
                        return Err(EditError::Validation {
                            path: format!("turns[{i}].gap"),
                            message: "gap is seconds, -1.5 to 3".into(),
                        })
                    }
                },
            };
            let last = ws.len() - 1;
            for (j, w) in ws.into_iter().enumerate() {
                tokens.push((w.to_string(), Some(speaker.to_string()), j == last, if j == 0 { gap } else { None }, Some(i)));
            }
        }
    } else {
        let text = get_str(args, "text")?.ok_or_else(|| EditError::Validation {
            path: "text".into(),
            message: "required (the story), or turns".into(),
        })?;
        tokens = text.split_whitespace().map(|w| (w.to_string(), None, false, None, None)).collect();
    }
    let words = tokens;
    if words.is_empty() {
        return Err(EditError::Validation { path: "text".into(), message: "empty".into() });
    }
    if args.get("replace").and_then(Value::as_bool).unwrap_or(false) {
        root.set("transcripts", Value::Array(Vec::new()));
        root.set("wordCounter", Value::Int(0));
    }
    /* Long-form stories and episodes run to tens of minutes. */
    const MAX_WORDS: usize = 8000;
    if words.len() > MAX_WORDS {
        return Err(EditError::Validation {
            path: if args.get("turns").is_some() { "turns".into() } else { "text".into() },
            message: format!("{} words; at most {MAX_WORDS}", words.len()),
        });
    }
    let mut t = 0.0f64;
    let mut word_values: Vec<Value> = Vec::new();
    let mut segment_word_ids: Vec<Value> = Vec::new();
    let mut segments: Vec<Value> = Vec::new();
    let mut seg_start = 0.0f64;
    let mut seg_text = String::new();
    let mut counter = root.get("wordCounter").and_then(Value::as_i64).unwrap_or(0);
    let mut seg_speaker: Option<String> = None;
    let mut seg_gap: Option<f64> = None;
    for (w, speaker, turn_end, gap, turn) in words.iter() {
        if gap.is_some() {
            seg_gap = *gap;
        }
        let w = w.as_str();
        counter += 1;
        let id = format!("w{counter}");
        let dur = 0.24 + 0.06 * w.chars().count() as f64;
        let clean = w.trim_matches(|c: char| !c.is_alphanumeric()).to_string();
        let mut word = Value::obj();
        word.set("confidence", Value::Int(1));
        word.set("end", RationalTime::from_seconds(t + dur, 1000).to_json());
        word.set("id", Value::str(&id));
        word.set("start", RationalTime::from_seconds(t, 1000).to_json());
        word.set("text", Value::str(w));
        if let Some(sp) = speaker {
            word.set("speaker", Value::str(sp));
            seg_speaker = Some(sp.clone());
        }
        // The turn a word belongs to, so "line n" means the n-th turn as
        // written even when one speaker has two turns in a row.
        if let Some(n) = turn {
            word.set("turn", Value::Int(*n as i64));
        }
        word_values.push(word);
        segment_word_ids.push(Value::str(&id));
        if !seg_text.is_empty() {
            seg_text.push(' ');
        }
        seg_text.push_str(&clean);
        t += dur + 0.06;
        if w.ends_with(['.', '!', '?']) || *turn_end {
            let mut seg = Value::obj();
            seg.set("end", RationalTime::from_seconds(t - 0.06, 1000).to_json());
            seg.set("id", Value::str(&format!("seg_{}", segments.len() + 1)));
            if let Some(sp) = seg_speaker.take() {
                seg.set("speaker", Value::str(&sp));
            }
            if let Some(g) = seg_gap.take() {
                seg.set("gap", Value::from_f64(g));
            }
            seg.set("start", RationalTime::from_seconds(seg_start, 1000).to_json());
            seg.set("text", Value::str(&seg_text));
            seg.set("wordIds", Value::Array(std::mem::take(&mut segment_word_ids)));
            segments.push(seg);
            seg_text.clear();
            seg_start = t + 0.25; // breath between sentences
            t = seg_start;
        }
    }
    if !segment_word_ids.is_empty() {
        let mut seg = Value::obj();
        seg.set("end", RationalTime::from_seconds(t - 0.06, 1000).to_json());
        seg.set("id", Value::str(&format!("seg_{}", segments.len() + 1)));
        if let Some(sp) = seg_speaker.take() {
            seg.set("speaker", Value::str(&sp));
        }
        seg.set("start", RationalTime::from_seconds(seg_start, 1000).to_json());
        seg.set("text", Value::str(&seg_text));
        seg.set("wordIds", Value::Array(segment_word_ids));
        segments.push(seg);
    }
    root.set("wordCounter", Value::Int(counter));
    let mut transcript = Value::obj();
    transcript.set("assetId", Value::str("authoring"));
    transcript.set("engine", Value::str("author/rust"));
    transcript.set("language", Value::str(get_str(args, "language")?.unwrap_or("en")));
    transcript.set("segments", Value::Array(segments));
    transcript.set("words", Value::Array(word_values));
    if !matches!(root.get("transcripts"), Some(Value::Array(_))) {
        root.set("transcripts", Value::Array(Vec::new()));
    }
    root.get_mut("transcripts")
        .and_then(Value::as_array_mut)
        .expect("transcripts")
        .push(transcript);
    // The story now defines the timeline length.
    if let Some(settings) = root.get_mut("settings") {
        settings.set("targetDuration", RationalTime::from_seconds(t.ceil(), 1000).to_json());
    }
    Ok(())
}

// --- chapters, speakers, notes ----------------------------------------------------

/// `add_chapter {title, time, ref?}` — `time` is `{seconds}` or `{wordId}`.
fn add_chapter(root: &mut Value, gen_id: &mut IdGen, args: &Value) -> Result<String, EditError> {
    let title = get_str(args, "title")?.ok_or_else(|| EditError::Validation {
        path: "title".into(),
        message: "required".into(),
    })?;
    let time = args
        .get("time")
        .or_else(|| args.get("start"))
        .cloned()
        .ok_or_else(|| EditError::Validation {
            path: "time".into(),
            message: "required: {seconds: N} or {wordId: \"w12\"}".into(),
        })?;
    let anchor = time.get("anchor").unwrap_or(&time);
    if let Some(wid) = anchor.get("wordId").and_then(Value::as_str) {
        let exists = root
            .get("transcripts")
            .and_then(Value::as_array)
            .map(|ts| {
                ts.iter().any(|t| {
                    t.get("words")
                        .and_then(Value::as_array)
                        .map(|ws| ws.iter().any(|w| w.get("id").and_then(Value::as_str) == Some(wid)))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);
        if !exists {
            return Err(EditError::NotFound {
                path: "time.wordId".into(),
                message: format!("'{wid}' does not exist (chapters take seconds or wordId, not a beat)"),
            });
        }
    } else if anchor.get("seconds").is_none() && time.as_f64().is_none() {
        return Err(EditError::Validation {
            path: "time".into(),
            message: "chapters and scenes take seconds or a word anchor".into(),
        });
    }
    let mut stored = Value::obj();
    let id = gen_id.gen("chp_");
    stored.set("id", Value::str(&id));
    stored.set("title", Value::str(title));
    stored.set("time", time);
    if !matches!(root.get("chapters"), Some(Value::Array(_))) {
        root.set("chapters", Value::Array(Vec::new()));
    }
    root.get_mut("chapters")
        .and_then(Value::as_array_mut)
        .expect("chapters")
        .push(stored);
    Ok(id)
}

/// `update_chapter {chapterId, title?, time?}`.
fn update_chapter(root: &mut Value, args: &Value) -> Result<(), EditError> {
    let id = get_str(args, "chapterId")?
        .or(get_str(args, "id")?)
        .ok_or_else(|| EditError::Validation { path: "chapterId".into(), message: "required".into() })?;
    let chapters = root
        .get_mut("chapters")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| EditError::NotFound {
            path: "chapterId".into(),
            message: format!("chapter '{id}' not found; list_chapters lists them"),
        })?;
    let chapter = chapters
        .iter_mut()
        .find(|c| c.get("id").and_then(Value::as_str) == Some(id))
        .ok_or_else(|| EditError::NotFound {
            path: "chapterId".into(),
            message: format!("chapter '{id}' not found; list_chapters lists them"),
        })?;
    if let Some(title) = get_str(args, "title")? {
        chapter.set("title", Value::str(title));
    }
    if let Some(time) = args.get("time").or_else(|| args.get("start")) {
        chapter.set("time", time.clone());
    }
    Ok(())
}

/// `remove_chapter {chapterId}`.
fn remove_chapter(root: &mut Value, args: &Value) -> Result<(), EditError> {
    let id = get_str(args, "chapterId")?
        .or(get_str(args, "id")?)
        .ok_or_else(|| EditError::Validation { path: "chapterId".into(), message: "required".into() })?;
    let chapters = root
        .get_mut("chapters")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| EditError::NotFound {
            path: "chapterId".into(),
            message: format!("chapter '{id}' not found; list_chapters lists them"),
        })?;
    let before = chapters.len();
    chapters.retain(|c| c.get("id").and_then(Value::as_str) != Some(id));
    if chapters.len() == before {
        return Err(EditError::NotFound {
            path: "chapterId".into(),
            message: format!("chapter '{id}' not found; list_chapters lists them"),
        });
    }
    Ok(())
}

/// `rename_speaker {speakerId, name}` — "" clears.
fn rename_speaker(root: &mut Value, args: &Value) -> Result<(), EditError> {
    let speaker_id = get_str(args, "speakerId")?.ok_or_else(|| EditError::Validation {
        path: "speakerId".into(),
        message: "required (e.g. \"S2\")".into(),
    })?;
    let name = get_str(args, "name")?.unwrap_or("");
    if root.get("speakerNames").is_none() {
        root.set("speakerNames", Value::obj());
    }
    let names = root
        .get_mut("speakerNames")
        .and_then(Value::as_object_mut)
        .expect("speakerNames");
    names.retain(|(k, _)| k != speaker_id);
    if !name.is_empty() {
        names.push((speaker_id.to_string(), Value::str(name)));
    }
    Ok(())
}

/// `resolve_note {noteId, reply, keepOpen?}` — reply ≤ 500 chars; resolving
/// again replaces the reply. Only the app creates notes.
fn resolve_note(root: &mut Value, args: &Value) -> Result<(), EditError> {
    let note_id = get_str(args, "noteId")?.ok_or_else(|| EditError::Validation {
        path: "noteId".into(),
        message: "required".into(),
    })?;
    let reply = get_str(args, "reply")?.ok_or_else(|| EditError::Validation {
        path: "reply".into(),
        message: "required (what you changed and where, or why nothing; keepOpen to ask)".into(),
    })?;
    if reply.chars().count() > 500 {
        return Err(EditError::Validation {
            path: "reply".into(),
            message: format!("reply is {} characters; at most 500", reply.chars().count()),
        });
    }
    let keep_open = args.get("keepOpen").and_then(Value::as_bool).unwrap_or(false);
    let notes = root
        .get_mut("notes")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| EditError::NotFound { path: "noteId".into(), message: "the project has no notes".into() })?;
    let note = notes
        .iter_mut()
        .find(|n| n.get("id").and_then(Value::as_str) == Some(note_id))
        .ok_or_else(|| EditError::NotFound {
            path: "noteId".into(),
            message: format!("note '{note_id}' not found; list_notes lists them"),
        })?;
    note.set("reply", Value::str(reply));
    if keep_open {
        note.remove("resolvedBy");
    } else {
        note.set("resolvedBy", Value::str("claude"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::Project;

    fn doc() -> Document {
        let src = r#"{
          "id":"prj_t","name":"T","schemaVersion":2,"wordCounter":3,
          "assets":[{"id":"ast_a","kind":"audio","duration":{"timescale":10,"value":50},
                     "source":{"path":"/tmp/a.caf"},"name":"a"}],
          "settings":{"frameRate":{"numerator":30,"denominator":1},
                      "resolution":{"width":1920,"height":1080},
                      "targetDuration":{"timescale":1,"value":10}},
          "tracks":[
            {"id":"trk_v","kind":"video","name":"Video","isHidden":false,"isMuted":false,
             "clips":[{"assetId":"ast_a","fit":"fit","gainDB":0,"id":"clp_1","isEnabled":true,"opacity":1,
                       "sourceRange":{"duration":{"timescale":1,"value":10},"start":{"timescale":1,"value":0}},
                       "timelineStart":{"timescale":1,"value":0}}],
             "components":[],"audioEvents":[]},
            {"id":"trk_s","kind":"caption","name":"Captions","isHidden":false,"isMuted":false,
             "clips":[],"components":[],"audioEvents":[]},
            {"id":"trk_sfx","kind":"audio","name":"SFX","role":"sfx","isHidden":false,"isMuted":false,
             "clips":[],"components":[],"audioEvents":[]}
          ],
          "transcripts":[{"assetId":"ast_a","engine":"tts/x","language":"tr",
            "segments":[{"end":{"timescale":1000,"value":900},"id":"seg_1","start":{"timescale":1,"value":0},
                         "text":"bir iki üç","wordIds":["w1","w2","w3"]}],
            "words":[
              {"confidence":1,"end":{"timescale":1000,"value":300},"id":"w1","start":{"timescale":1,"value":0},"text":"bir"},
              {"confidence":1,"end":{"timescale":1000,"value":600},"id":"w2","start":{"timescale":1000,"value":300},"text":"iki"},
              {"confidence":1,"end":{"timescale":1000,"value":900},"id":"w3","start":{"timescale":1000,"value":600},"text":"üç"}
            ]}]
        }"#;
        Document::new(Project::parse(src).unwrap().with_revision(7))
    }

    #[test]
    fn conflict_message_matches_the_app() {
        let mut d = doc();
        let err = d
            .apply_edits(Some("x"), Some(8), &[EditOp::new("set_project_settings", crate::json::Value::obj())])
            .unwrap_err();
        assert_eq!(err.code(), "conflict");
        assert_eq!(
            err.message(),
            "the document changed (revision is 7, you expected 8); re-read it with get_project / get_transcript and retry"
        );
    }

    #[test]
    fn ref_chaining_and_revision_bump() {
        let mut d = doc();
        let mut add_track = crate::json::Value::obj();
        add_track.set("kind", Value::str("overlay"));
        add_track.set("name", Value::str("B-roll"));
        add_track.set("ref", Value::str("broll"));
        let mut ins = crate::json::Value::obj();
        ins.set("assetId", Value::str("ast_a"));
        ins.set("trackId", Value::str("$ref:broll"));
        ins.set("at", Value::from_f64(4.0));
        ins.set("duration", Value::from_f64(2.0));
        let result = d
            .apply_edits(Some("B-roll"), None, &[
                EditOp::new("add_track", add_track),
                EditOp::new("insert_clip", ins),
            ])
            .unwrap();
        assert_eq!(result.revision, 8);
        assert_eq!(result.created_ids.len(), 1);
        let track_id = &result.created_ids[0].1;
        let track = d.project().track(track_id).unwrap();
        assert_eq!(track.name(), "B-roll");
        assert_eq!(track.clips().len(), 1);
    }

    #[test]
    fn batch_is_atomic() {
        let mut d = doc();
        let mut bad = crate::json::Value::obj();
        bad.set("componentId", Value::str("lowerThird"));
        let mut start = crate::json::Value::obj();
        start.set("wordId", Value::str("w1"));
        bad.set("start", start);
        bad.set("trackId", Value::str("trk_nope"));
        let err = d
            .apply_edits(Some("bad"), None, &[EditOp::new("add_component", bad)])
            .unwrap_err();
        assert!(matches!(err, EditError::NotFound { ref path, .. } if path == "edits[0].trackId"));
        assert_eq!(d.revision(), 7); // nothing changed
        assert!(d.undo_labels().is_empty());
    }

    #[test]
    fn author_transcript_turns_tag_every_word_and_split_segments_by_speaker() {
        let mut d = doc();
        let mut a = crate::json::Value::obj();
        a.set(
            "turns",
            Value::parse(r#"[{"speaker":"host","text":"Merhaba! Hoş geldiniz"},{"speaker":"guest","text":"Selam herkese."}]"#).unwrap(),
        );
        a.set("language", Value::str("tr"));
        a.set("replace", Value::Bool(true));
        d.apply_edits(Some("turns"), None, &[EditOp::new("author_transcript", a)]).unwrap();
        let t = &d.project().transcripts()[0];
        let words = t.get("words").and_then(Value::as_array).unwrap();
        let speakers: Vec<&str> = words.iter().map(|w| w.get("speaker").and_then(Value::as_str).unwrap()).collect();
        assert_eq!(speakers, ["host", "host", "host", "guest", "guest"]);
        let turns: Vec<i64> = words.iter().map(|w| w.get("turn").and_then(Value::as_i64).unwrap()).collect();
        assert_eq!(turns, [0, 0, 0, 1, 1]);
        // "Merhaba!" ends a sentence, "geldiniz" ends host's turn without one.
        let segs = t.get("segments").and_then(Value::as_array).unwrap();
        let seg_speakers: Vec<&str> = segs.iter().map(|s| s.get("speaker").and_then(Value::as_str).unwrap()).collect();
        assert_eq!(seg_speakers, ["host", "host", "guest"]);
        let mut bad = crate::json::Value::obj();
        bad.set("turns", Value::parse(r#"[{"speaker":"a b","text":"x"}]"#).unwrap());
        let err = d.apply_edits(Some("bad"), None, &[EditOp::new("author_transcript", bad)]).unwrap_err();
        assert!(err.message().contains("speaker"), "{}", err.message());
    }

    #[test]
    fn author_transcript_takes_long_form_stories() {
        let mut d = doc();
        let line = "Bir varmış bir yokmuş, uzak bir şehirde yaşlı bir kâtip yaşarmış. ";
        let mut a = crate::json::Value::obj();
        a.set("text", Value::str(&line.repeat(250)));
        a.set("replace", Value::Bool(true));
        d.apply_edits(Some("long"), None, &[EditOp::new("author_transcript", a)]).unwrap();
        assert_eq!(d.project().words().len(), 2750);
        let mut too = crate::json::Value::obj();
        too.set("text", Value::str(&"söz ".repeat(8001)));
        let err = d.apply_edits(Some("too long"), None, &[EditOp::new("author_transcript", too)]).unwrap_err();
        assert!(err.message().contains("at most 8000"), "{}", err.message());
    }

    #[test]
    fn project_cast_merges_members_and_validates_names() {
        let mut d = doc();
        let cast_of = |d: &Document| d.project().root.get("settings").and_then(|s| s.get("cast")).cloned();
        let settings = |json: &str| {
            let mut s = crate::json::Value::obj();
            s.set("cast", Value::parse(json).unwrap());
            s
        };
        d.apply_edits(Some("cast"), None, &[EditOp::new("set_project_settings", settings(r##"{"host": {"style": "flat", "skinColor": "#E8B48F"}, "guest": {"style": "geo"}}"##))])
            .unwrap();
        // A later call replaces one member and removes another; the rest stays.
        d.apply_edits(Some("cast"), None, &[EditOp::new("set_project_settings", settings(r#"{"host": {"style": "cartoon"}, "guest": null}"#))])
            .unwrap();
        let cast = cast_of(&d).unwrap();
        assert_eq!(cast.get("host").and_then(|a| a.get("style")).and_then(Value::as_str), Some("cartoon"));
        assert!(cast.get("guest").is_none());
        // Bad names and non-object members are refused without a change.
        for bad in [r#"{"a b": {}}"#, r#"{"host": "flat"}"#, r#"["host"]"#] {
            let err = d.apply_edits(Some("cast"), None, &[EditOp::new("set_project_settings", settings(bad))]).unwrap_err();
            assert!(err.message().contains("cast"), "{bad}: {}", err.message());
        }
        assert_eq!(cast_of(&d).unwrap(), cast);
    }

    #[test]
    fn undo_redo_expect_label() {
        let mut d = doc();
        let mut s = crate::json::Value::obj();
        s.set("name", Value::str("Renamed"));
        d.apply_edits(Some("rename"), None, &[EditOp::new("set_project_settings", s)]).unwrap();
        assert_eq!(d.project().name(), "Renamed");
        let err = d.undo(Some("wrong")).unwrap_err();
        assert!(err.message().contains("the last edit is 'rename', not 'wrong'"));
        assert_eq!(d.undo(Some("rename")).unwrap(), "rename");
        assert_eq!(d.project().name(), "T");
        assert_eq!(d.redo().unwrap(), "rename");
        assert_eq!(d.project().name(), "Renamed");
    }

    #[test]
    fn cut_range_ripples_words_and_clips() {
        let mut d = doc();
        let mut cut = crate::json::Value::obj();
        cut.set("start", Value::from_f64(0.25));
        cut.set("end", Value::from_f64(0.55));
        d.apply_edits(Some("cut"), None, &[EditOp::new("cut_range", cut)]).unwrap();
        let p = d.project();
        // w2 (0.3-0.6) straddled the cut: clamped, then shifted.
        let w2 = p.word("w2").unwrap();
        assert!(w2.start().seconds() <= 0.25 + 1e-9);
        // w3 shifted 0.3 s earlier.
        let w3 = p.word("w3").unwrap();
        assert!((w3.start().seconds() - 0.3).abs() < 1e-9);
        // The single clip was ripple-cut into the surviving pieces:
        // [0, 0.25) plus the shifted tail, together 9.7 s.
        let video = p.tracks().into_iter().find(|t| t.kind() == "video").unwrap();
        assert_eq!(video.clips().len(), 2);
        let total: f64 = video
            .clips()
            .iter()
            .map(|c| {
                RationalTime::from_json(c.get("sourceRange").unwrap().get("duration").unwrap())
                    .unwrap()
                    .seconds()
            })
            .sum();
        assert!((total - 9.7).abs() < 1e-9);
        // Target duration shrank by 0.3 s.
        let td = p.settings().target_duration().unwrap();
        assert!((td.seconds() - 9.7).abs() < 1e-9);
    }

    #[test]
    fn correct_transcript_same_count_and_merge() {
        let mut d = doc();
        // Same word count: ids and times kept, texts replaced word-wise.
        let mut e = crate::json::Value::obj();
        let mut fix = crate::json::Value::obj();
        fix.set("fromWordId", Value::str("w1"));
        fix.set("toWordId", Value::str("w2"));
        fix.set("text", Value::str("tek cümle"));
        e.set("edits", Value::Array(vec![fix]));
        let result = d.apply_edits(Some("fix"), None, &[EditOp::new("correct_transcript", e)]).unwrap();
        assert!(result.removed_ids.is_empty());
        let p = d.project();
        assert_eq!(p.word("w1").unwrap().text(), "tek");
        assert_eq!(p.word("w2").unwrap().text(), "cümle");

        // Fewer words: the span merges into one word keeping the first id,
        // the rest disappear (removedIds), segments follow.
        let mut e2 = crate::json::Value::obj();
        let mut fix2 = crate::json::Value::obj();
        fix2.set("fromWordId", Value::str("w1"));
        fix2.set("toWordId", Value::str("w3"));
        fix2.set("text", Value::str("başlangıç"));
        e2.set("edits", Value::Array(vec![fix2]));
        let result2 =
            d.apply_edits(Some("merge"), None, &[EditOp::new("correct_transcript", e2)]).unwrap();
        assert_eq!(result2.removed_ids, vec!["w2".to_string(), "w3".to_string()]);
        let p2 = d.project();
        assert_eq!(p2.word("w1").unwrap().text(), "başlangıç");
        assert!(p2.word("w2").is_none() && p2.word("w3").is_none());
        // The merged word spans the whole replaced time budget.
        let w = p2.word("w1").unwrap();
        assert!((w.start().seconds() - 0.0).abs() < 1e-9);
        assert!((w.end().seconds() - 0.9).abs() < 1e-9);
    }

    #[test]
    fn authoring_with_replace_rewrites_instead_of_appending() {
        // The editor's Voice panel re-authors the script; without `replace`
        // the document ends up with two transcripts and TTS speaks both.
        let mut d = Document::new(crate::server::blank_project("Story", true));
        let author = |text: &str, replace: bool| {
            let mut args = Value::obj();
            args.set("text", Value::str(text));
            if replace {
                args.set("replace", Value::Bool(true));
            }
            EditOp::new("author_transcript", args)
        };
        d.apply_edits(Some("first"), None, &[author("One two.", false)]).unwrap();
        d.apply_edits(Some("second"), None, &[author("Three four five.", true)]).unwrap();

        let p = d.project();
        assert_eq!(p.transcripts().len(), 1, "replace must not append a transcript");
        assert_eq!(p.words().len(), 3);
        // word ids restart, so a scene anchored to w1 still means "the first word"
        assert_eq!(p.word("w1").unwrap().text(), "Three");
        assert_eq!(p.word("w3").unwrap().text(), "five.");
        // undo brings the old story back
        d.undo(Some("second")).unwrap();
        assert_eq!(d.project().word("w1").unwrap().text(), "One");
    }

    #[test]
    fn too_many_edits() {
        let mut d = doc();
        let ops: Vec<EditOp> = (0..=MAX_EDITS)
            .map(|_| EditOp::new("set_project_settings", crate::json::Value::obj()))
            .collect();
        let err = d.apply_edits(None, None, &ops).unwrap_err();
        assert!(matches!(err, EditError::Limit { .. }));
    }

    #[test]
    fn components_land_on_the_track_their_category_needs() {
        // A title is an overlay, a caption belongs on the caption track, and a
        // background belongs on the scenes track. Piling everything onto the
        // first overlay made title cards masquerade as scenes.
        let mut d = Document::new(crate::server::blank_project("Blank", true));
        let edits: Vec<EditOp> = [
            ("titleCard", "Overlays"),
            ("kineticWords", "Captions"),
            ("ambientBackground", "Scenes"),
            ("captions", "Captions"),
        ]
        .iter()
        .map(|(component, _)| {
            EditOp::new(
                "add_component",
                Value::parse(&format!(
                    r#"{{"componentId":"{component}","start":0,"duration":2}}"#
                ))
                .unwrap(),
            )
        })
        .collect();
        d.apply_edits(None, None, &edits).unwrap();
        let p = d.project();
        for (component, expected) in [
            ("titleCard", "Overlays"),
            ("kineticWords", "Captions"),
            ("ambientBackground", "Scenes"),
            ("captions", "Captions"),
        ] {
            let track = p
                .tracks()
                .into_iter()
                .find(|t| {
                    t.components()
                        .iter()
                        .any(|c| c.get("componentId").and_then(Value::as_str) == Some(component))
                })
                .unwrap_or_else(|| panic!("{component} was not placed"));
            assert_eq!(track.name(), expected, "{component} landed on the wrong track");
        }
    }
}
