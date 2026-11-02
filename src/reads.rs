//! The document-local read tools: transcript views and search, history,
//! chapters (with YouTube validation), notes, subtitle export (SRT / WebVTT)
//! and the projects scan. These mirror what the app's read tools return from
//! an open project — no renderer, ML or media analysis involved.

use crate::edits::{Document, EditError};
use crate::json::Value;
use crate::project::{Project, Word};
use crate::rational::{format_clock, RationalTime};

// --- get_transcript -------------------------------------------------------------------

/// `get_transcript`: words as `id start end text` lines, `# seg_x` per
/// sentence; filter by time window, one segment, or speaker.
pub fn get_transcript(p: &Project, args: &Value) -> Result<Value, EditError> {
    let start = args.get("start").and_then(Value::as_f64);
    let end = args.get("end").and_then(Value::as_f64);
    let segment_id = args.get("segmentId").and_then(Value::as_str);
    let speaker = args.get("speaker").and_then(Value::as_str);

    let mut out = String::new();
    let mut count = 0i64;
    let empty = Vec::new();
    let mut result = Value::obj();
    for t in p.transcripts() {
        let segments = t.get("segments").and_then(Value::as_array).unwrap_or(&empty);
        let words = t.get("words").and_then(Value::as_array).unwrap_or(&empty);
        for seg in segments {
            let sid = seg.get("id").and_then(Value::as_str).unwrap_or("");
            if let Some(want) = segment_id {
                if sid != want {
                    continue;
                }
            }
            let seg_ids: Vec<&str> = seg
                .get("wordIds")
                .and_then(Value::as_array)
                .map(|a| a.iter().filter_map(Value::as_str).collect())
                .unwrap_or_default();
            let mut lines = Vec::new();
            for wid in &seg_ids {
                let Some(w) = words.iter().find(|w| w.get("id").and_then(Value::as_str) == Some(wid)) else {
                    continue;
                };
                let word = Word::new(w);
                if let Some(s0) = start {
                    if word.end().seconds() <= s0 {
                        continue;
                    }
                }
                if let Some(e0) = end {
                    if word.start().seconds() >= e0 {
                        continue;
                    }
                }
                if let Some(sp) = speaker {
                    if w.get("speaker").and_then(Value::as_str) != Some(sp) {
                        continue;
                    }
                }
                lines.push(format!(
                    "{} {:.3} {:.3} {}{}\n",
                    word.id(),
                    word.start().seconds(),
                    word.end().seconds(),
                    word.text(),
                    w.get("speaker")
                        .and_then(Value::as_str)
                        .map(|s| format!("  [{s}]"))
                        .unwrap_or_default()
                ));
                count += 1;
            }
            if !lines.is_empty() || segment_id == Some(sid) {
                out.push_str(&format!("# {sid}\n"));
                out.push_str(&lines.join(""));
            }
        }
    }
    if count == 0 && segment_id.is_none() && p.transcripts().is_empty() {
        return Err(EditError::Unsupported {
            path: "start".into(),
            message: "unavailable: no transcript yet".into(),
        });
    }
    result.set("words", Value::Int(count));
    result.set("transcript", Value::Str(out));
    Ok(result)
}

// --- find_in_transcript -----------------------------------------------------------------

fn fold_text(s: &str) -> String {
    // Case + diacritic-insensitive: lowercase, then fold accented Latin
    // letters to their base letter (Turkish set included: ç ğ ı İ ö ş ü …).
    s.to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' | 'ı' => 'i',
            'ó' | 'ò' | 'ô' | 'ö' | 'õ' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ğ' => 'g',
            'ş' => 's',
            'ñ' => 'n',
            'ÿ' => 'y',
            c if c.is_alphanumeric() => c,
            _ => ' ',
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<&str>>()
        .join(" ")
}

const FILLERS: &[&str] = &[
    "eee", "eğer", "ııı", "iii", "ihıh", "hıh", "hih", "mm", "mmm", "hmm", "um", "uh", "ää", "aa",
    "şey", "yani",
];

struct Hit {
    word_ids: Vec<String>,
    start: f64,
    end: f64,
    text: String,
    kind: Option<(&'static str, f64)>,
    suspect: bool,
    suspect_reason: Option<String>,
    cut_range: Option<(f64, f64)>,
}

/// `find_in_transcript`: phrase search (case / diacritic-insensitive, over
/// consecutive words) or `kind` sweeps: `number` (numerals in any spelling
/// with suffixes, `suspect` heuristics), `filler` (ready cutRanges) and
/// `pause` (silences with padding). Ranges never overlap between the two cut
/// kinds.
pub fn find_in_transcript(p: &Project, args: &Value) -> Result<Value, EditError> {
    if p.transcripts().is_empty() {
        return Err(EditError::Unsupported {
            path: "query".into(),
            message: "unavailable: no transcript yet".into(),
        });
    }
    let max_results = args.get("maxResults").and_then(Value::as_i64).unwrap_or(20) as usize;
    let kind = args.get("kind").and_then(Value::as_str);
    let words = p.words();

    let hits: Vec<Hit> = match kind {
        Some("number") => number_hits(&words),
        Some("filler") => {
            let padding = args.get("padding").and_then(Value::as_f64).unwrap_or(0.0);
            filler_hits(&words, padding)
        }
        Some("pause") => {
            let min_pause = args.get("minPause").and_then(Value::as_f64).unwrap_or(0.6);
            let padding = args.get("padding").and_then(Value::as_f64).unwrap_or(0.1);
            pause_hits(&words, min_pause, padding)
        }
        Some(other) => {
            return Err(EditError::Validation {
                path: "kind".into(),
                message: format!("kind must be number, filler or pause (got '{other}')"),
            });
        }
        None => {
            let queries: Vec<String> = match args.get("queries").and_then(Value::as_array) {
                Some(list) => list.iter().filter_map(Value::as_str).map(str::to_string).collect(),
                None => args
                    .get("query")
                    .and_then(Value::as_str)
                    .map(|q| vec![q.to_string()])
                    .unwrap_or_default(),
            };
            if queries.is_empty() {
                return Err(EditError::Validation {
                    path: "query".into(),
                    message: "give query / queries, or kind: number | filler | pause".into(),
                });
            }
            let mut hits = Vec::new();
            for q in &queries {
                hits.extend(phrase_hits(&words, q));
            }
            hits
        }
    };

    let mut out = Value::obj();
    let mut results = Vec::new();
    for hit in hits.iter().take(max_results) {
        let mut r = Value::obj();
        r.set(
            "wordIds",
            Value::Array(hit.word_ids.iter().map(|id| Value::str(id)).collect()),
        );
        r.set("start", Value::from_f64(hit.start));
        r.set("end", Value::from_f64(hit.end));
        r.set("text", Value::str(&hit.text));
        r.set("time", Value::str(&format_clock(hit.start)));
        if let Some((kind, value)) = hit.kind {
            r.set("value", Value::from_f64(value));
            r.set("numberKind", Value::str(kind));
        }
        if hit.suspect {
            r.set("suspect", Value::Bool(true));
            if let Some(reason) = &hit.suspect_reason {
                r.set("suspectReason", Value::str(reason));
            }
        }
        if let Some((cs, ce)) = hit.cut_range {
            let mut cut = Value::obj();
            cut.set("start", Value::from_f64(cs));
            cut.set("end", Value::from_f64(ce));
            r.set("cutRange", cut);
        }
        results.push(r);
    }
    out.set("results", Value::Array(results));
    if matches!(kind, Some("filler") | Some("pause")) {
        let saved: f64 = hits
            .iter()
            .take(max_results)
            .filter_map(|h| h.cut_range.map(|(s, e)| (e - s).max(0.0)))
            .sum();
        out.set("savedSeconds", Value::from_f64((saved * 10.0).round() / 10.0));
    }
    Ok(out)
}

// The hit builders are free functions returning Vec<Hit>; phrase search runs
// inside find_in_transcript's scope below.

fn number_hits(words: &[Word]) -> Vec<Hit> {
    let mut hits = Vec::new();
    for (i, w) in words.iter().enumerate() {
        let text = w.text().trim();
        // Strip Turkish / English suffixes around the digits: "50'si", "2026'da", "3,5".
        let digits: String = text.chars().take_while(|c| c.is_ascii_digit() || *c == ',' || *c == '.').collect();
        let dcount = digits.chars().filter(|c| c.is_ascii_digit()).count();
        if dcount == 0 {
            continue;
        }
        let normalized = digits.replace(',', ".");
        let value: f64 = match normalized.parse() {
            Ok(v) => v,
            Err(_) => digits.replace('.', "").parse().unwrap_or(f64::NAN),
        };
        if value.is_nan() {
            continue;
        }
        let suffix = &text[digits.len()..];
        let (kind, also_percent) = classify_number(&digits, suffix);
        let mut suspect = false;
        let mut reason = None;
        // Suspect: digits split over two words ("22" then ".26").
        if let Some(next) = words.get(i + 1) {
            let next_digits = next.text().trim().chars().next().map(|c| c.is_ascii_digit() || c == '.').unwrap_or(false);
            if !digits.contains('.') && !digits.contains(',') && next_digits {
                suspect = true;
                reason = Some("digits continue in the next word (split number?)".into());
            }
        }
        let mut hit = base_hit(words, i..=i);
        hit.kind = Some((kind, value));
        if also_percent {
            hit.kind = Some(("percent", value));
        }
        hit.suspect = suspect;
        hit.suspect_reason = reason;
        hits.push(hit);
    }
    hits
}

fn classify_number(digits: &str, suffix: &str) -> (&'static str, bool) {
    let lower = suffix.to_lowercase();
    if lower.starts_with("'si") || lower.starts_with("\'i") || lower.starts_with("inci") || lower == "." || lower.starts_with("nd") || lower.starts_with("'ü") {
        return ("ordinal", false);
    }
    if lower.starts_with("%") || digits.starts_with('%') || lower.contains("yüzde") || lower.contains("percent") {
        return ("cardinal", true);
    }
    let looks_year = digits.len() == 4 && !digits.contains('.') && !digits.contains(',');
    if looks_year {
        return ("year", false);
    }
    if digits.contains('.') || digits.contains(',') {
        return ("decimal", false);
    }
    ("cardinal", false)
}

fn filler_hits(words: &[Word], padding: f64) -> Vec<Hit> {
    let mut hits = Vec::new();
    for (i, w) in words.iter().enumerate() {
        let folded = fold_text(w.text());
        if !FILLERS.contains(&folded.as_str()) {
            continue;
        }
        // Context rule from the docs: "bir şey" is not a filler.
        if folded == "şey" {
            let prev = words.get(i.wrapping_sub(1)).map(|p| fold_text(p.text())).unwrap_or_default();
            if prev == "bir" {
                continue;
            }
        }
        let mut hit = base_hit(words, i..=i);
        let s = (w.start().seconds() - padding).max(0.0);
        let e = w.end().seconds() + padding;
        hit.cut_range = Some((s, e));
        hits.push(hit);
    }
    hits
}

fn pause_hits(words: &[Word], min_pause: f64, padding: f64) -> Vec<Hit> {
    let mut hits = Vec::new();
    for pair in words.windows(2) {
        let gap = pair[1].start().seconds() - pair[0].end().seconds();
        if gap >= min_pause {
            let mut hit = base_hit(words, 0..=0);
            hit.word_ids = vec![pair[0].id().to_string(), pair[1].id().to_string()];
            hit.start = pair[0].end().seconds();
            hit.end = pair[1].start().seconds();
            hit.text = format!("silence {:.2} s", gap);
            let keep_s = pair[0].end().seconds() + padding;
            let keep_e = (pair[1].start().seconds() - padding).max(keep_s);
            hit.cut_range = Some((keep_s, keep_e));
            hits.push(hit);
        }
    }
    hits
}

fn base_hit(words: &[Word], range: std::ops::RangeInclusive<usize>) -> Hit {
    let mut ids = Vec::new();
    let mut text = String::new();
    for i in range {
        if let Some(w) = words.get(i) {
            ids.push(w.id().to_string());
            if !text.is_empty() {
                text.push(' ');
            }
            text.push_str(w.text());
        }
    }
    let start = words
        .iter()
        .find(|w| w.id() == ids[0])
        .map(|w| w.start().seconds())
        .unwrap_or(0.0);
    let end = words
        .iter()
        .find(|w| w.id() == ids.last().unwrap())
        .map(|w| w.end().seconds())
        .unwrap_or(start);
    Hit { word_ids: ids, start, end, text, kind: None, suspect: false, suspect_reason: None, cut_range: None }
}

fn phrase_hits(words: &[Word], query: &str) -> Vec<Hit> {
    let q = fold_text(query);
    let folded: Vec<String> = words.iter().map(|w| fold_text(w.text())).collect();
    let q_tokens: Vec<&str> = q.split_whitespace().collect();
    let mut hits = Vec::new();
    if q_tokens.is_empty() {
        return hits;
    }
    for i in 0..words.len().saturating_sub(q_tokens.len() - 1) {
        if (i..i + q_tokens.len()).all(|j| folded[j] == q_tokens[j - i]) {
            hits.push(base_hit(words, i..=(i + q_tokens.len() - 1)));
        }
    }
    hits
}

// --- get_history -------------------------------------------------------------------------

pub fn get_history(doc: &Document, limit: Option<usize>) -> Value {
    let mut steps = Vec::new();
    let undo = doc.undo_labels();
    let undo_len = undo.len() as u64;
    for (i, label) in undo.iter().enumerate().rev() {
        if let Some(limit) = limit {
            if steps.len() >= limit {
                break;
            }
        }
        let mut s = Value::obj();
        s.set("label", Value::str(label));
        s.set("by", Value::str("claude"));
        s.set(
            "revision",
            Value::Int((doc.revision().saturating_sub(undo_len.saturating_sub(i as u64 + 1))) as i64),
        );
        steps.push(s);
    }
    let mut redo_steps = Vec::new();
    let redo = doc.redo_labels();
    for (i, label) in redo.iter().rev().enumerate() {
        if let Some(limit) = limit {
            if redo_steps.len() >= limit {
                break;
            }
        }
        let mut s = Value::obj();
        s.set("label", Value::str(label));
        s.set("by", Value::str("claude"));
        s.set("revision", Value::Int((doc.revision() + i as u64 + 1) as i64));
        redo_steps.push(s);
    }
    let mut out = Value::obj();
    out.set("history", Value::Array(steps.clone()));
    out.set("undo", Value::Array(steps));
    out.set("redo", Value::Array(redo_steps));
    out.set("revision", Value::Int(doc.revision() as i64));
    out.set("canUndo", Value::Bool(doc.can_undo()));
    out.set("canRedo", Value::Bool(doc.can_redo()));
    out
}

// --- list_chapters -------------------------------------------------------------------------

/// Chapters in timeline order with the YouTube description and issues:
/// first at 0:00, ≥ 3 chapters, each ≥ 10 s.
pub fn list_chapters(p: &Project) -> Value {
    let chapters = p.root.get("chapters").and_then(Value::as_array).map(<[Value]>::to_vec).unwrap_or_default();
    let mut sorted: Vec<&Value> = chapters.iter().collect();
    sorted.sort_by(|a, b| {
        chapter_time(p, a)
            .unwrap_or(0.0)
            .partial_cmp(&chapter_time(p, b).unwrap_or(0.0))
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let duration = project_duration(p);
    let mut list = Vec::new();
    let mut description = String::new();
    for c in &sorted {
        let t = chapter_time(p, c).unwrap_or(0.0);
        let title = c.get("title").and_then(Value::as_str).unwrap_or("");
        let mut item = Value::obj();
        item.set("id", Value::str(c.get("id").and_then(Value::as_str).unwrap_or("")));
        item.set("title", Value::str(title));
        item.set("start", Value::from_f64(t));
        item.set("time", Value::str(&format_clock(t)));
        if let Some(w) = c.get("wordId").and_then(Value::as_str) {
            item.set("wordId", Value::str(w));
        }
        list.push(item);
        description.push_str(&format!("{} {}\n", youtube_clock(t), title));
    }
    let mut issues = Vec::new();
    if !sorted.is_empty() {
        let first = chapter_time(p, sorted[0]).unwrap_or(-1.0);
        if first > 0.0 {
            issues.push(format!("the first chapter is at {} — YouTube needs it at 0:00", youtube_clock(first)));
        }
        if sorted.len() < 3 {
            issues.push(format!("{} chapters — YouTube needs at least 3", sorted.len()));
        }
        for pair in sorted.windows(2) {
            let a = chapter_time(p, pair[0]).unwrap_or(0.0);
            let b = chapter_time(p, pair[1]).unwrap_or(0.0);
            if b - a < 10.0 {
                issues.push(format!("chapter at {} is less than 10 s after the previous", youtube_clock(b)));
            }
        }
    }
    let mut out = Value::obj();
    out.set("chapters", Value::Array(list));
    out.set("youtubeDescription", Value::Str(description));
    out.set("youtubeIssues", Value::Array(issues.into_iter().map(Value::Str).collect()));
    out.set("durationSeconds", Value::from_f64(duration));
    out
}

/// YouTube chapter lines: `m:ss` / `h:mm:ss`, whole seconds.
fn youtube_clock(t: f64) -> String {
    let total = t.max(0.0).round() as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m}:{s:02}")
    }
}

fn chapter_time(p: &Project, chapter: &Value) -> Option<f64> {
    // The stored shape is `time: {seconds}` or `time: {wordId}` (also a bare
    // wordId / seconds for robustness).
    let time = chapter.get("time").unwrap_or(chapter);
    let anchor = time.get("anchor").unwrap_or(time);
    if let Some(w) = anchor.get("wordId").and_then(Value::as_str) {
        return p.word(w).map(|w| w.start().seconds());
    }
    if let Some(s) = anchor.get("seconds").and_then(Value::as_f64) {
        return Some(s);
    }
    if let Some(rt) = RationalTime::from_json(anchor) {
        return Some(rt.seconds());
    }
    time.as_f64()
}

fn project_duration(p: &Project) -> f64 {
    if let Some(td) = p.settings().target_duration() {
        return td.seconds();
    }
    let last_word = p.words().last().map(|w| w.end().seconds()).unwrap_or(0.0);
    let last_event = p
        .tracks()
        .iter()
        .flat_map(|t| t.clips().iter().map(|c| {
            let start = RationalTime::from_json(c.get("timelineStart").unwrap_or(&Value::Null))
                .unwrap_or(RationalTime::ZERO);
            let dur = RationalTime::from_json(
                c.get("sourceRange").and_then(|r| r.get("duration")).unwrap_or(&Value::Null),
            )
            .unwrap_or(RationalTime::ZERO);
            start.add(&dur).seconds()
        }))
        .fold(0.0_f64, f64::max);
    last_word.max(last_event)
}

// --- list_notes -----------------------------------------------------------------------------

/// The user's timeline notes. Only the app creates them; this port reads and
/// resolves the shape the app reports: `{id, text, start, end, reply?,
/// resolvedBy?}`.
pub fn list_notes(p: &Project, include_resolved: bool) -> Value {
    let notes = p.root.get("notes").and_then(Value::as_array).map(<[Value]>::to_vec).unwrap_or_default();
    let mut list = Vec::new();
    let mut open = 0i64;
    for n in &notes {
        let resolved = n.get("resolvedBy").is_some();
        if resolved && !include_resolved {
            continue;
        }
        if !resolved {
            open += 1;
        }
        let mut item = n.clone();
        // `words`: the transcript inside the range (≤ 300 chars).
        let s = note_bound(p, n, "start");
        let e = note_bound(p, n, "end");
        let all_words = p.words();
        let words: Vec<&str> = all_words
            .iter()
            .filter(|w| w.end().seconds() > s && w.start().seconds() < e)
            .map(Word::text)
            .collect();
        let mut text = words.join(" ");
        text.truncate(text.char_indices().take(300).last().map(|(i, _)| i).unwrap_or(0));
        if !text.is_empty() {
            item.set("words", Value::str(&text));
        }
        list.push(item);
    }
    let mut out = Value::obj();
    out.set("notes", Value::Array(list));
    out.set("open", Value::Int(open));
    out.set("resolved", Value::Int((notes.len() as i64) - open));
    out
}

fn note_bound(p: &Project, note: &Value, key: &str) -> f64 {
    note.get(key)
        .and_then(|v| p.resolve_time(v))
        .map(|t| t.seconds())
        .unwrap_or(0.0)
}

// --- export_subtitles ------------------------------------------------------------------------

/// SRT / WebVTT of the edited transcript: ≤ 2 lines per cue, 1–7 s cues,
/// `maxCharsPerLine` (42) wrapping, optional speaker labels.
pub fn export_subtitles(p: &Project, args: &Value) -> Result<Value, EditError> {
    let format = args.get("format").and_then(Value::as_str).unwrap_or("srt");
    if !matches!(format, "srt" | "vtt") {
        return Err(EditError::Validation {
            path: "format".into(),
            message: format!("format must be srt or vtt (got '{format}')"),
        });
    }
    let max_chars = args.get("maxCharsPerLine").and_then(Value::as_i64).unwrap_or(42) as usize;
    let speaker_labels = args.get("speakerLabels").and_then(Value::as_bool).unwrap_or(false);
    let range_start = args.get("start").and_then(Value::as_f64);
    let range_end = args.get("end").and_then(Value::as_f64);

    let words = p.words();
    if words.is_empty() {
        return Err(EditError::Unsupported {
            path: "format".into(),
            message: "unavailable: no transcript yet".into(),
        });
    }
    // Cues from segments when available (sentence = cue), else 7 s windows.
    let mut cues: Vec<(f64, f64, String, Option<String>)> = Vec::new();
    for t in p.transcripts() {
        let seg_words: Vec<&Value> = t.get("words").and_then(Value::as_array).map(|a| a.iter().collect()).unwrap_or_default();
        let segments = t.get("segments").and_then(Value::as_array).map(<[Value]>::to_vec).unwrap_or_default();
        if !segments.is_empty() {
            for seg in &segments {
                let ids: Vec<&str> = seg
                    .get("wordIds")
                    .and_then(Value::as_array)
                    .map(|a| a.iter().filter_map(Value::as_str).collect())
                    .unwrap_or_default();
                let ws: Vec<&Value> = ids
                    .iter()
                    .filter_map(|id| {
                        seg_words
                            .iter()
                            .find(|w| w.get("id").and_then(Value::as_str) == Some(id))
                            .copied()
                    })
                    .collect();
                if ws.is_empty() {
                    let start = RationalTime::from_json(seg.get("start").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                    let end = RationalTime::from_json(seg.get("end").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                    let text = seg.get("text").and_then(Value::as_str).unwrap_or("");
                    if !text.is_empty() {
                        cues.push((start, end, text.to_string(), None));
                    }
                    continue;
                }
                let start = RationalTime::from_json(ws[0].get("start").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                let end = RationalTime::from_json(ws.last().unwrap().get("end").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                let speaker = ws[0].get("speaker").and_then(Value::as_str).map(str::to_string);
                cues.push((start, end, ws.iter().map(|w| w.get("text").and_then(Value::as_str).unwrap_or("")).collect::<Vec<&str>>().join(" "), speaker));
            }
        } else {
            // Split into ≤ 7 s cues at word boundaries.
            let mut chunk: Vec<&Value> = Vec::new();
            let mut chunk_start = 0.0;
            for w in &words_raw(&words) {
                let ws = RationalTime::from_json(w.get("start").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                let we = RationalTime::from_json(w.get("end").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                if !chunk.is_empty() && we - chunk_start > 7.0 {
                    let text = chunk.iter().map(|w| w.get("text").and_then(Value::as_str).unwrap_or("")).collect::<Vec<&str>>().join(" ");
                    let speaker = chunk[0].get("speaker").and_then(Value::as_str).map(str::to_string);
                    cues.push((chunk_start, RationalTime::from_json(chunk.last().unwrap().get("end").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds(), text, speaker));
                    chunk.clear();
                    chunk_start = ws;
                }
                if chunk.is_empty() {
                    chunk_start = ws;
                }
                chunk.push(w);
            }
            if !chunk.is_empty() {
                let text = chunk.iter().map(|w| w.get("text").and_then(Value::as_str).unwrap_or("")).collect::<Vec<&str>>().join(" ");
                let speaker = chunk[0].get("speaker").and_then(Value::as_str).map(str::to_string);
                let end = RationalTime::from_json(chunk.last().unwrap().get("end").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds();
                cues.push((chunk_start, end, text, speaker));
            }
        }
    }
    // Range filter + split over-long cues, wrap to ≤ 2 lines.
    let mut filtered = Vec::new();
    for (s, e, text, speaker) in cues {
        if let Some(rs) = range_start {
            if e <= rs {
                continue;
            }
        }
        if let Some(re) = range_end {
            if s >= re {
                continue;
            }
        }
        filtered.push((s, e, text, speaker));
    }
    let mut out = String::new();
    if format == "vtt" {
        out.push_str("WEBVTT\n\n");
    }
    let mut n = 0;
    for (s, e, text, speaker) in filtered {
        n += 1;
        let mut lines = wrap_lines(&text, max_chars, 2);
        if lines.is_empty() {
            lines.push(String::new());
        }
        if speaker_labels {
            if let Some(sp) = speaker {
                lines.insert(0, format!("[{sp}]"));
            }
        }
        if format == "srt" {
            out.push_str(&format!("{n}\n{} --> {}\n", srt_time(s), srt_time(e)));
        } else {
            out.push_str(&format!(
                "{} --> {}\n",
                srt_time(s).replace(',', "."),
                srt_time(e).replace(',', ".")
            ));
        }
        out.push_str(&lines.join("\n"));
        out.push_str("\n\n");
    }
    let mut result = Value::obj();
    result.set("cueCount", Value::Int(n));
    result.set("text", Value::Str(out));
    Ok(result)
}

fn words_raw<'a>(words: &'a [Word<'a>]) -> Vec<&'a Value> {
    words.iter().map(|w| w.raw).collect()
}

fn srt_time(t: f64) -> String {
    let ms = (t * 1000.0).round() as i64;
    format!("{:02}:{:02}:{:02},{:03}", ms / 3_600_000, (ms / 60_000) % 60, (ms / 1000) % 60, ms % 1000)
}

fn wrap_lines(text: &str, max_chars: usize, max_lines: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.chars().count() + word.chars().count() + 1 > max_chars && !current.is_empty() {
            lines.push(current.clone());
            current.clear();
        }
        if !current.is_empty() {
            current.push(' ');
        }
        current.push_str(word);
    }
    if !current.is_empty() {
        lines.push(current);
    }
    // Hard cap at 2 lines: merge the overflow into the last line.
    if lines.len() > max_lines {
        let kept: Vec<String> = lines.drain(..max_lines - 1).collect();
        let rest = lines.join(" ");
        let mut out = kept;
        out.push(rest);
        return out;
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::Project;

    /// One known take the transcript tools are tested against: ten plain
    /// words with millisecond timings — diacritics on w2/w3 for the
    /// diacritic-blind search, "40" on w6 for the number sweep, and the
    /// 85 ms gap between w7 and w8 for the pause sweep.
    fn demo() -> Project {
        const WORDS: [(&str, i64, i64); 10] = [
            ("one", 0, 400),
            ("naïve", 420, 800),
            ("café", 820, 1200),
            ("runs", 1220, 1600),
            ("simple", 1620, 2300),
            ("40", 2315, 2594),
            ("second", 2610, 3437),
            ("coffee", 3522, 4000),
            ("tests", 4020, 4600),
            ("today", 4620, 5228),
        ];
        let ms = |v: i64| format!("{{\"timescale\":1000,\"value\":{v}}}");
        let words: Vec<String> = WORDS
            .iter()
            .enumerate()
            .map(|(i, &(text, s, e))| {
                format!(
                    "{{\"id\":\"w{}\",\"text\":\"{text}\",\"start\":{},\"end\":{}}}",
                    i + 1,
                    ms(s),
                    ms(e)
                )
            })
            .collect();
        let ids: Vec<String> = (1..=WORDS.len()).map(|i| format!("\"w{i}\"")).collect();
        let script = WORDS.iter().map(|&(t, _, _)| t).collect::<Vec<_>>().join(" ");
        let end = WORDS[WORDS.len() - 1].2;
        Project::parse(&format!(
            "{{\"schemaVersion\":2,\"id\":\"p\",\"name\":\"Take\",\"settings\":{{}},\"tracks\":[],\"wordCounter\":{},\
             \"transcripts\":[{{\"assetId\":\"authoring\",\"language\":\"en\",\
             \"segments\":[{{\"id\":\"seg_1\",\"start\":{},\"end\":{},\"text\":\"{script}\",\"wordIds\":[{}]}}],\
             \"words\":[{}]}}]}}",
            WORDS.len(),
            ms(0),
            ms(end),
            ids.join(","),
            words.join(",")
        ))
        .unwrap()
    }

    #[test]
    fn transcript_lines_with_segment_headers() {
        let p = demo();
        let mut args = Value::obj();
        args.set("start", Value::from_f64(2.0));
        let r = get_transcript(&p, &args).unwrap();
        let text = r.get("transcript").unwrap().as_str().unwrap();
        assert!(text.contains("# seg_1"));
        assert!(text.contains("w6 2.315 2.594 40"));
        assert!(!text.contains("w1 "));
    }

    #[test]
    fn phrase_search_is_diacritic_blind() {
        let p = demo();
        let mut args = Value::obj();
        args.set("query", Value::str("naive cafe")); // no diacritics
        let r = find_in_transcript(&p, &args).unwrap();
        let results = r.get("results").unwrap().as_array().unwrap();
        assert_eq!(results.len(), 1);
        let ids = results[0].get("wordIds").unwrap().as_array().unwrap();
        assert_eq!(ids[0].as_str(), Some("w2"));
        assert_eq!(ids[1].as_str(), Some("w3"));
    }

    #[test]
    fn number_sweep_finds_40() {
        let p = demo();
        let mut args = Value::obj();
        args.set("kind", Value::str("number"));
        let r = find_in_transcript(&p, &args).unwrap();
        let results = r.get("results").unwrap().as_array().unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].get("wordIds").unwrap().as_array().unwrap()[0].as_str(), Some("w6"));
        assert_eq!(results[0].get("value").unwrap().as_f64().unwrap() as i64, 40);
    }

    #[test]
    fn pause_sweep_finds_the_gap() {
        // w7 ends 3.437, w8 starts 3.522 → 0.085 s gap: below default 0.6.
        let p = demo();
        let mut args = Value::obj();
        args.set("kind", Value::str("pause"));
        args.set("minPause", Value::from_f64(0.05));
        let r = find_in_transcript(&p, &args).unwrap();
        let results = r.get("results").unwrap().as_array().unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].get("cutRange").is_some());
    }

    #[test]
    fn srt_export_from_the_real_transcript() {
        let p = demo();
        let r = export_subtitles(&p, &Value::obj()).unwrap();
        let text = r.get("text").unwrap().as_str().unwrap();
        assert!(text.starts_with("1\n00:00:00,000 --> 00:00:05,228\n"));
        assert!(text.contains("simple"));
        assert!(r.get("cueCount").unwrap().as_i64() == Some(1));
    }
}
