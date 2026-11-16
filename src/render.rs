//! The renderer: turns the document into a self-contained animated HTML
//! page — the story played on a 9:16 or 16:9 stage with kinetic words synced
//! to word timings, title cards, animated counters, punch-ins and chapter markers.
//! Served live at `/preview` and exportable with `screenwords render`.

use crate::json::Value;
use crate::project::Project;
use crate::rational::RationalTime;
use std::path::Path;

/// Everything the player needs, straight from the document.
pub fn render_data(p: &Project) -> Value {
    render_data_in(p, None)
}

/// `render_data` with the bundle folder for relative asset paths (audio is
/// inlined as a data: URI, so it has to be found before the page is built).
/// How long the film runs: its set length, or a second past the last word
/// when it has none, and never shorter than the speech or than the last
/// visible component.
pub fn film_duration(p: &Project) -> f64 {
    let speech_end = p.words().iter().map(|w| w.end().seconds()).fold(0.0_f64, f64::max);
    let visual_end = p
        .tracks()
        .into_iter()
        .filter(|t| !t.is_hidden())
        .flat_map(|t| t.components().iter())
        .filter(|c| c.get("isEnabled").and_then(Value::as_bool).unwrap_or(true))
        .filter_map(|c| p.component_window(c))
        .map(|(start, end)| end.unwrap_or(start).seconds())
        .fold(0.0_f64, f64::max);
    p.settings()
        .target_duration()
        .map(|t| t.seconds())
        .unwrap_or(speech_end + 1.0)
        .max(speech_end + 0.5)
        .max(visual_end)
}

pub fn render_data_in(p: &Project, base: Option<&Path>) -> Value {
    let s = p.settings();
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
    let mut components: Vec<Value> = p
        .tracks()
        .into_iter()
        .filter(|t| !t.is_hidden())
        .flat_map(|t| t.components().iter())
        .filter(|c| c.get("isEnabled").and_then(Value::as_bool).unwrap_or(true))
        .filter_map(|c| {
            let (start, end) = p.component_window(c)?;
            let end = end.unwrap_or(start);
            let mut o = Value::obj();
            o.set("id", Value::str(c.get("id").and_then(Value::as_str).unwrap_or("")));
            o.set("componentId", Value::str(c.get("componentId").and_then(Value::as_str).unwrap_or("")));
            o.set("start", Value::from_f64(start.seconds()));
            o.set("end", Value::from_f64(end.seconds()));
            o.set("params", c.get("params").cloned().unwrap_or_else(Value::obj));
            if let Some(pos) = c.get("position") {
                o.set("position", pos.clone());
            }
            if let Some(z) = c.get("zIndex") {
                o.set("zIndex", z.clone());
            }
            if let Some(kfs) = c.get("keyframes") {
                o.set("keyframes", kfs.clone());
            }
            Some(o)
        })
        .collect();
    // Pictures the project imported travel inside the page.
    if let Some(base) = base {
        for c in components.iter_mut() {
            if let Some(params) = c.get_mut("params") {
                crate::preview::embed_local_images(params, base);
            }
        }
    }
    let duration = film_duration(p);

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
            o.set("assetId", Value::str(asset_id));
            if let Some(ast) = p.asset(asset_id) {
                if let Some(name) = ast.get("name").and_then(Value::as_str) {
                    o.set("name", Value::str(name));
                }
            }
            o.set("start", Value::from_f64(start));
            o.set("end", Value::from_f64(start + dur));
            items.push(o);
        }
        for c in t.components() {
            if let Some((st, en)) = p.component_window(c) {
                let mut o = Value::obj();
                o.set("kind", Value::str("component"));
                o.set("id", Value::str(c.get("id").and_then(Value::as_str).unwrap_or("")));
                o.set(
                    "componentId",
                    Value::str(c.get("componentId").and_then(Value::as_str).unwrap_or("")),
                );
                o.set("start", Value::from_f64(st.seconds()));
                o.set("end", Value::from_f64(en.map(|x| x.seconds()).unwrap_or(st.seconds())));
                o.set("params", c.get("params").cloned().unwrap_or_else(Value::obj));
                if let Some(pos) = c.get("position") {
                    o.set("position", pos.clone());
                }
                if let Some(z) = c.get("zIndex") {
                    o.set("zIndex", z.clone());
                }
                if let Some(kfs) = c.get("keyframes") {
                    o.set("keyframes", kfs.clone());
                }
                items.push(o);
            }
        }
        for e in t.audio_events() {
            let start = p
                .resolve_time(e.get("start").unwrap_or(&Value::Null))
                .map(|tm| tm.seconds())
                .unwrap_or(0.0);
            // Music placed "to the end" is as long as what is left of the film.
            let dur = if e.get("toEnd").and_then(Value::as_bool).unwrap_or(false) {
                (duration - start).max(0.0)
            } else {
                RationalTime::from_json(e.get("duration").unwrap_or(&Value::Null)).unwrap_or(RationalTime::ZERO).seconds()
            };
            let mut o = Value::obj();
            o.set("kind", Value::str("audio"));
            o.set("id", Value::str(e.get("id").and_then(Value::as_str).unwrap_or("")));
            let asset_id = e.get("assetId").and_then(Value::as_str).unwrap_or("");
            o.set("assetId", Value::str(asset_id));
            if let Some(ast) = p.asset(asset_id) {
                if let Some(name) = ast.get("name").and_then(Value::as_str) {
                    o.set("name", Value::str(name));
                }
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
        if let Some(role) = t.role() {
            o.set("role", Value::str(role));
        }
        o.set("items", Value::Array(items));
        tracks.push(o);
    }

    let mut assets = Vec::new();
    for a in p.assets() {
        let mut o = Value::obj();
        o.set("id", Value::str(a.get("id").and_then(Value::as_str).unwrap_or("")));
        o.set("kind", Value::str(a.get("kind").and_then(Value::as_str).unwrap_or("")));
        o.set("name", Value::str(a.get("name").and_then(Value::as_str).unwrap_or("")));
        assets.push(o);
    }

    let mut segments = Vec::new();
    for t in p.transcripts() {
        if let Some(segs) = t.get("segments").and_then(Value::as_array) {
            for seg in segs {
                let mut o = Value::obj();
                o.set("id", Value::str(seg.get("id").and_then(Value::as_str).unwrap_or("")));
                let st = RationalTime::from_json(seg.get("start").unwrap_or(&Value::Null))
                    .unwrap_or(RationalTime::ZERO)
                    .seconds();
                let en = RationalTime::from_json(seg.get("end").unwrap_or(&Value::Null))
                    .unwrap_or(RationalTime::ZERO)
                    .seconds();
                o.set("start", Value::from_f64(st));
                o.set("end", Value::from_f64(en));
                o.set("text", Value::str(seg.get("text").and_then(Value::as_str).unwrap_or("")));
                if let Some(wids) = seg.get("wordIds") {
                    o.set("wordIds", wids.clone());
                }
                segments.push(o);
            }
        }
    }

    let mut r = Value::obj();
    r.set("name", Value::str(p.name()));
    r.set("width", Value::Int(s.width()));
    r.set("height", Value::Int(s.height()));
    r.set("fps", Value::from_f64(s.fps()));
    r.set("duration", Value::from_f64(duration));
    r.set("words", Value::Array(words));
    r.set("segments", Value::Array(segments));
    r.set("components", Value::Array(components));
    r.set("tracks", Value::Array(tracks));
    r.set("assets", Value::Array(assets));
    r.set("chapters", crate::reads::list_chapters(p).get("chapters").cloned().unwrap_or(Value::Array(Vec::new())));
    let theme = p
        .root
        .get("settings")
        .and_then(|st| st.get("theme"))
        .cloned()
        .or_else(|| Value::parse(crate::theme::DEFAULT).ok())
        .unwrap_or_else(Value::obj);
    r.set("theme", theme);
    // The spoken language: the player's text (CSS uppercase above all, where
    // Turkish i must become İ) follows it.
    r.set(
        "lang",
        Value::str(
            p.transcripts()
                .first()
                .and_then(|t| t.get("language"))
                .and_then(Value::as_str)
                .filter(|l| !l.is_empty() && l.len() <= 12 && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
                .unwrap_or("en"),
        ),
    );
    r.set(
        "cast",
        p.root.get("settings").and_then(|st| st.get("cast")).cloned().unwrap_or_else(Value::obj),
    );

    // The one track the player plays: narration, with music and effects
    // mixed in when the film has them.
    let track = crate::audio::film_sound(p, base, duration);
    if let Some(sound) = track.sound {
        r.set("audioData", Value::str(&format!("data:{};base64,{}", sound.mime, base64_encode(&sound.bytes))));
    }
    if !track.notes.is_empty() {
        r.set("soundNotes", Value::Array(track.notes.iter().map(|n| Value::str(n)).collect()));
    }
    r
}

/// Inverse of [`base64_encode`], used to serve embedded audio and images.
pub(crate) fn base64_decode(text: &str) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in text.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' | b' ' | b'\t' => continue,
            _ => return None,
        } as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Some(out)
}

pub(crate) fn base64_encode(bytes: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };
        out.push(CHARSET[(b0 >> 2) as usize] as char);
        out.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(((b1 & 0x0f) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(b2 & 0x3f) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

/// The self-contained page: stage, virtual clock, and the component
/// renderers (titleCard, kineticWords/captions, numberCounter, punchIn,
/// lowerThird, chapter markers). No external assets; data is inlined.
pub fn render_html(p: &Project) -> String {
    render_html_in(p, None)
}

pub fn render_html_in(p: &Project, base: Option<&Path>) -> String {
    // HTML parses script closing tags even inside a JavaScript string.
    let data = render_data_in(p, base).to_string().replace('<', "\\u003c");
    page_html().replace("__DATA__", &data)
}

/// The player template; `__DATA__` is replaced with the render data and the
/// shared component library is injected at its marker.
const TEMPLATE: &str = include_str!("assets/player.html");

/// The one component library both pages embed: every component id the catalog
/// lists is implemented here, once. The source is split into ordered modules
/// under `assets/components/`; `concat!` assembles them byte-for-byte in the
/// same order as the original single file, so each page still receives one
/// script with one global scope.
pub const COMPONENTS: &str = concat!(
    include_str!("assets/components/00-registry.js"),
    include_str!("assets/components/00a-reset.js"),
    include_str!("assets/components/01-catalog.js"),
    include_str!("assets/components/02-helpers.js"),
    include_str!("assets/components/02a-vector.js"),
    include_str!("assets/components/02b-figure.js"),
    include_str!("assets/components/02c-toon.js"),
    include_str!("assets/components/02d-kit.js"),
    include_str!("assets/components/02e-conversation.js"),
    include_str!("assets/components/02f-sets.js"),
    include_str!("assets/components/02g-story.js"),
    include_str!("assets/components/02h-fx.js"),
    include_str!("assets/components/02i-scenery.js"),
    include_str!("assets/components/02j-profile.js"),
    include_str!("assets/components/02k-objects.js"),
    include_str!("assets/components/03-extras.js"),
    include_str!("assets/components/04-backdrop.js"),
    include_str!("assets/components/05-common.js"),
    include_str!("assets/components/06-title.js"),
    include_str!("assets/components/07-caption.js"),
    include_str!("assets/components/08-shape.js"),
    include_str!("assets/components/09-chart.js"),
    include_str!("assets/components/10-motion.js"),
    include_str!("assets/components/11-background.js"),
    include_str!("assets/components/12-effect.js"),
    include_str!("assets/components/13-ui.js"),
    include_str!("assets/components/14-transition.js"),
    include_str!("assets/components/15-transform.js"),
    include_str!("assets/components/16-lottie.js"),
    include_str!("assets/components/17-data.js"),
    include_str!("assets/components/18-dispatch.js"),
    include_str!("assets/components/19-base.js"),
    include_str!("assets/components/20-html.js"),
);

/// Where the library goes in a page asset.
pub const COMPONENTS_MARKER: &str = "/* @@COMPONENTS@@ */";
/// The font faces, inlined so the UI and the exported video never load a font
/// from the network (a missing face changes metrics and wraps captions).
pub const FONTS: &str = include_str!("assets/fonts.css");
pub const FONTS_MARKER: &str = "/* @@FONTS@@ */";

/// The player page with the shared library injected.
pub fn page_html() -> String {
    TEMPLATE
        .replace(COMPONENTS_MARKER, COMPONENTS)
        .replace(FONTS_MARKER, FONTS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_carry_their_fonts_and_never_fetch_them() {
        // The player and the editor must render with the same faces offline:
        // a missing face changes text metrics and wraps captions differently.
        let page = page_html();
        assert!(!page.contains("fonts.googleapis.com"), "the player still links Google Fonts");
        assert!(!page.contains("@import url"), "the player still imports fonts");
        assert!(page.contains("@font-face"), "no embedded faces in the player");
        assert!(page.contains("data:font/woff2;base64,"), "faces are not inlined");
        for family in ["Mona Sans", "Montserrat", "Space Grotesk", "Cinzel", "Outfit"] {
            assert!(page.contains(&format!("font-family: \"{family}\"")), "missing {family}");
        }

        let editor = include_str!("assets/editor.html");
        assert!(!editor.contains("fonts.googleapis.com"), "the editor still links Google Fonts");
        assert!(editor.contains(FONTS_MARKER), "the editor has no font marker");
    }

    #[test]
    fn player_data_carries_language_speakers_and_cast() {
        let p = Project::parse(r#"{"schemaVersion":2,"id":"p","name":"P","tracks":[],
            "settings":{"cast":{"host":{"style":"flat"}}},
            "transcripts":[{"language":"tr","segments":[],"words":[
              {"id":"w1","text":"Merhaba","speaker":"host","start":{"value":0,"timescale":1000},"end":{"value":500,"timescale":1000}},
              {"id":"w2","text":"selam","start":{"value":600,"timescale":1000},"end":{"value":900,"timescale":1000}}]}]}"#).unwrap();
        let d = render_data(&p);
        assert_eq!(d.get("lang").and_then(Value::as_str), Some("tr"));
        let words = d.get("words").and_then(Value::as_array).unwrap();
        assert_eq!(words[0].get("speaker").and_then(Value::as_str), Some("host"));
        assert!(words[1].get("speaker").is_none());
        assert_eq!(d.get("cast").and_then(|c| c.get("host")).and_then(|a| a.get("style")).and_then(Value::as_str), Some("flat"));
        assert!(include_str!("assets/player.html").contains("document.documentElement.lang = D.lang"));
    }

    #[test]
    fn duration_covers_visual_content_without_narration() {
        let p = Project::parse(r#"{"schemaVersion":2,"id":"p","name":"P","settings":{},"tracks":[
            {"components":[{"timing":{"start":{"seconds":0},"end":{"seconds":12}}},
            {"isEnabled":false,"timing":{"start":{"seconds":0},"end":{"seconds":50}}}]},
            {"isHidden":true,"components":[{"timing":{"start":{"seconds":0},"end":{"seconds":60}}}]}]}"#).unwrap();
        assert_eq!(render_data(&p).get("duration").and_then(Value::as_f64), Some(12.0));
    }

    #[test]
    fn duration_uses_the_latest_word_end_not_storage_order() {
        let p = Project::parse(r#"{"schemaVersion":2,"id":"p","name":"P","settings":{},"tracks":[],
            "transcripts":[{"words":[{"id":"late","end":{"value":10000,"timescale":1000}},
            {"id":"early","end":{"value":2000,"timescale":1000}}]}]}"#).unwrap();
        assert_eq!(render_data(&p).get("duration").and_then(Value::as_f64), Some(11.0));
    }

    #[test]
    fn hidden_and_disabled_components_are_not_rendered() {
        let p = Project::parse(r#"{"schemaVersion":2,"id":"p","name":"P","settings":{},"tracks":[
            {"isHidden":true,"components":[{"id":"hidden","timing":{"start":{"seconds":0},"end":{"seconds":2}}}]},
            {"components":[{"id":"disabled","isEnabled":false,"timing":{"start":{"seconds":0},"end":{"seconds":2}}},
            {"id":"visible","timing":{"start":{"seconds":0},"end":{"seconds":2}}}]}]}"#).unwrap();
        let data = render_data(&p);
        let components = data.get("components").unwrap().as_array().unwrap();
        assert_eq!(components.len(), 1);
        assert_eq!(components[0].get("id").and_then(Value::as_str), Some("visible"));
    }

    #[test]
    fn narration_audio_wins_over_an_earlier_music_asset() {
        let p = Project::parse(r#"{"schemaVersion":2,"id":"p","name":"P","settings":{},
            "tracks":[{"audioEvents":[{"assetId":"voice","role":"voice"}]}],
            "assets":[{"id":"music","kind":"audio","source":{"dataUri":"data:audio/wav;base64,bXVzaWM="}},
            {"id":"voice","kind":"audio","source":{"dataUri":"data:audio/wav;base64,dm9pY2U="}}]}"#).unwrap();
        assert_eq!(render_data(&p).get("audioData").and_then(Value::as_str),
            Some("data:audio/wav;base64,dm9pY2U="));
    }

    #[test]
    fn project_text_cannot_close_the_player_script() {
        let mut p = crate::server::blank_project("P", true);
        p.root.set("name", Value::str("</script><script>alert('injected')</script>"));
        let html = render_html(&p);
        assert!(!html.contains("</script><script>alert('injected')"));
        assert!(html.contains("\\u003c/script>"));
    }

    #[test]
    fn relative_audio_resolves_against_the_bundle() {
        let dir = std::env::temp_dir().join(format!(
            "screenwords-render-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        std::fs::create_dir_all(dir.join("assets")).unwrap();
        std::fs::write(dir.join("assets/voice.wav"), b"RIFF\x00\x00\x00\x00WAVE").unwrap();
        let src = r#"{"schemaVersion":2,"id":"p","name":"P","settings":{},
            "tracks":[],"assets":[{"id":"a1","kind":"audio","source":{"path":"assets/voice.wav"}}]}"#;
        let p = Project::parse(src).unwrap();
        // Without the bundle base the relative path does not exist here.
        assert!(render_data(&p).get("audioData").is_none());
        let data = render_data_in(&p, Some(&dir));
        let uri = data.get("audioData").and_then(Value::as_str).unwrap();
        assert!(uri.starts_with("data:audio/wav;base64,"), "got {uri}");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn quoted_ids(block: &str) -> Vec<&str> {
        let mut listed = Vec::new();
        let mut rest = block;
        while let Some(open) = rest.find('\'') {
            rest = &rest[open + 1..];
            let Some(close) = rest.find('\'') else { break };
            listed.push(&rest[..close]);
            rest = &rest[close + 1..];
        }
        listed
    }

    fn block_between<'a>(text: &'a str, start: &str, end: &str) -> &'a str {
        let from = text.find(start).unwrap_or_else(|| panic!("missing '{start}'"));
        let tail = &text[from..];
        &tail[..tail.find(end).unwrap_or_else(|| panic!("missing '{end}' after '{start}'"))]
    }

    fn pack_ids(text: &str) -> Vec<&str> {
        let mut ids = Vec::new();
        for family in [
            "EC_TITLE_IDS", "EC_CAPTION_IDS", "EC_SHAPE_IDS", "EC_CHART_IDS", "EC_UI_IDS",
            "EC_MOTION_IDS", "EC_BACKGROUND_IDS", "EC_EFFECT_IDS", "EC_TRANSITION_IDS",
            "EC2_TITLE_IDS", "EC2_CAPTION_IDS", "EC2_SHAPE_IDS", "EC2_CHART_IDS", "EC2_UI_IDS",
            "EC2_MOTION_IDS", "EC2_BACKGROUND_IDS", "EC2_EFFECT_IDS", "EC2_TRANSITION_IDS",
            "EC2_TRANSFORM_IDS", "EC2_LOTTIE_IDS",
            "EC3_TITLE_IDS", "EC3_CAPTION_IDS", "EC3_SHAPE_IDS", "EC3_CHART_IDS", "EC3_UI_IDS",
            "EC3_MOTION_IDS", "EC3_BACKGROUND_IDS", "EC3_EFFECT_IDS", "EC3_TRANSITION_IDS",
            "EC3_TRANSFORM_IDS", "EC3_LOTTIE_IDS", "EC3_DATA_IDS",
        ] {
            let start = format!("const {family} = [");
            ids.extend(quoted_ids(block_between(text, &start, "];")));
        }
        ids
    }

    #[test]
    fn drawing_toolkit_math_checks_pass() {
        // tools/test-draw.mjs runs the vector/figure modules' pure math (path
        // parse, trim, morph, viewBox fit, layout, springs, IK, visemes) in
        // node. Without node on PATH there is nothing to run it with.
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let out = match std::process::Command::new("node").arg(root.join("tools/test-draw.mjs")).output() {
            Ok(out) => out,
            Err(_) => return,
        };
        assert!(
            out.status.success(),
            "drawing toolkit checks failed:\n{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
    }

    #[test]
    fn components_embed_the_vector_and_figure_modules() {
        for api in ["SWDraw.character", "svgLayers:", "viseme:", "layout:", "follow:", "anatomicalLimb:", "hand:"] {
            assert!(COMPONENTS.contains(api), "the component library is missing {api}");
        }
    }

    #[test]
    fn a_throwing_code_overlay_cannot_abort_the_frame() {
        // User code runs inside try, so one bad overlay skips only itself.
        let call = COMPONENTS.find("c._compiled(ctx,").expect("code overlays are called");
        let try_at = COMPONENTS[..call].rfind("try {").expect("the call is guarded");
        assert_eq!(COMPONENTS[try_at..call].trim(), "try {", "the overlay call must open its try block");
    }

    #[test]
    fn the_browsers_own_styles_are_removed_once_for_pages_and_scenes() {
        // One reset, in the library both pages embed; HTML scenes start from
        // the same text, and no page keeps a partial copy of its own.
        assert_eq!(COMPONENTS.matches("const SW_RESET_CSS").count(), 1);
        assert!(COMPONENTS.contains("const SW_HTML_BASE = SW_RESET_CSS"), "HTML scenes start from the reset");
        assert!(COMPONENTS.contains("document.head.prepend(sheet)"), "the pages take it as their first sheet");
        let reset = block_between(COMPONENTS, "const SW_RESET_CSS = [", "].join(");
        for rule in ["margin: 0; padding: 0; border: 0", "font: inherit", "list-style: none", "appearance: none", "border-collapse: collapse"] {
            assert!(reset.contains(rule), "the reset misses {rule}");
        }
        // Zero specificity throughout, so any rule of ours wins: every
        // selector is `*`, a pseudo-element or inside :where().
        let mut rules = 0;
        for line in reset.lines().map(str::trim).filter(|l| l.starts_with('\'')) {
            let selector = line.trim_start_matches('\'').split('{').next().unwrap_or("");
            // What is left once every :where(...) group, `*` and the two
            // pseudo-elements are taken out carries weight.
            let mut rest = selector.to_string();
            while let Some(from) = rest.find(":where(") {
                let to = from + rest[from..].find(')').expect("a closed :where()") + 1;
                rest.replace_range(from..to, "");
            }
            let weight: String = rest.replace("::before", "").replace("::after", "").chars().filter(|c| !matches!(c, '*' | ',' | ' ')).collect();
            assert!(weight.is_empty(), "a reset selector with weight: {selector}");
            rules += 1;
        }
        assert!(rules >= 15, "only {rules} reset rules were read");
        for (page, name) in [(include_str!("assets/player.html"), "player"), (include_str!("assets/editor.html"), "editor")] {
            assert!(!page.contains("*, *::before, *::after { box-sizing: border-box; }"), "the {name} keeps its own copy of the reset");
            // The reset takes every control's own look; a page that uses a
            // checkbox draws one, or the box is invisible.
            if page.contains("type=\"checkbox\"") {
                assert!(page.contains("input[type=checkbox]:checked::after"), "the {name} has checkboxes with no look");
            }
        }
    }

    #[test]
    fn captions_are_scaled_one_way_in_the_editor_the_player_and_the_render() {
        // A landscape film's captions came out twice as large in the editor
        // as in the video: each place had its own formula. Now all ask one.
        assert_eq!(COMPONENTS.matches("function swOverlayScale(").count(), 1);
        for (text, name) in [(include_str!("assets/player.html"), "player"), (include_str!("assets/editor.html"), "editor"), (include_str!("../tools/stage-page.mjs"), "render")] {
            assert!(text.contains("swOverlayScale("), "the {name} does not use the shared overlay scale");
            assert!(!text.contains("setProperty('--sx', Math"), "the {name} still computes its own overlay scale");
        }
    }

    #[test]
    fn html_scenes_come_from_the_shared_library_in_both_pages() {
        // One implementation, called by the player and by the editor stage,
        // and left alone by the canvas chain.
        assert!(COMPONENTS.contains("function swHtmlOverlays(canvas, comps, time, env)"));
        assert!(COMPONENTS.contains("a.currentTime ="), "animations are set to the film's time");
        assert!(COMPONENTS.contains("indexOf(SW_HTML_PREFIX) !== 0"), "the canvas chain skips HTML scenes");
        for (page, name) in [(include_str!("assets/player.html"), "player"), (include_str!("assets/editor.html"), "editor")] {
            assert_eq!(page.matches("swHtmlOverlays(").count(), 1, "the {name} calls the library once");
            assert!(!page.contains("attachShadow"), "the {name} grew its own HTML scene code");
        }
        // A renderer that snapshots the DOM on change asks whether a scene is on show.
        assert!(include_str!("../tools/render-mp4.mjs").contains("swHtmlKey()"));
    }

    #[test]
    fn every_catalog_component_has_a_shared_renderer() {
        // An id neither registry paints can only produce a blank frame; keep
        // the catalog and the one shared library in lockstep.
        let mut rendered = quoted_ids(block_between(COMPONENTS, "const RENDERED_IDS", "];"));
        let extra = pack_ids(COMPONENTS);
        let scene = quoted_ids(block_between(COMPONENTS, "const SW_SCENE_IDS", "];"));
        assert_eq!(scene, ["conversation", "story"], "the scene registry");
        assert_eq!(rendered.len(), 68, "the legacy registry must list the original 68 ids");
        assert_eq!(extra.len(), 532, "the packs must declare exactly 532 ids (232 + 300 pack 3)");
        let unique: std::collections::HashSet<&&str> = extra.iter().collect();
        assert_eq!(unique.len(), extra.len(), "the pack repeats an id");
        let catalog = crate::catalog::all_ids();
        assert_eq!(catalog.len(), 602, "catalog size");
        rendered.extend(scene);
        for id in &catalog {
            assert!(
                rendered.contains(id) || extra.contains(id),
                "component '{id}' is in the catalog but in neither registry"
            );
            assert!(
                !(rendered.contains(id) && extra.contains(id)),
                "component '{id}' is listed in both registries"
            );
        }
        for id in rendered.iter().chain(extra.iter()) {
            assert!(
                catalog.contains(id),
                "registry id '{id}' is not in the catalog (typo?)"
            );
        }
        assert_eq!(rendered.len() + extra.len(), catalog.len(), "registries and catalog disagree");
    }

    #[test]
    fn both_pages_embed_the_one_component_library() {
        const EDITOR: &str = include_str!("assets/editor.html");
        for (name, page) in [("player.html", TEMPLATE), ("editor.html", EDITOR)] {
            assert_eq!(
                page.matches(COMPONENTS_MARKER).count(),
                1,
                "{name} must carry exactly one COMPONENTS marker"
            );
            assert!(
                !page.contains("const RENDERED_IDS"),
                "{name} still carries a private component registry"
            );
            assert!(
                !page.contains("c.componentId === 'circleShape'"),
                "{name} still duplicates a component renderer instead of using the shared library"
            );
        }
        assert!(!COMPONENTS.contains("__DATA__"), "the library must not consume render data");
        assert!(!COMPONENTS.contains("@@COMPONENTS@@"), "the library must not embed its own marker");
        assert_eq!(
            page_html().matches("function drawSharedComponents").count(),
            1,
            "the player page must receive the library exactly once"
        );
    }

    #[test]
    fn a_bare_scene_paints_a_flat_stage_not_a_default_clip() {
        // A project with no background used to silently resolve to the
        // animated gradientWaves clip — a "default background" the user
        // never added. The empty stage must be the theme base, flat.
        assert!(COMPONENTS.contains("function sbFlatStage"), "the flat-stage painter is missing");
        assert!(COMPONENTS.contains("if (!params.style)"), "a missing style must fall to the flat stage");
        assert!(
            !COMPONENTS.contains("sbResolve(params.style || '"),
            "a missing style must not silently resolve to a default clip"
        );
    }

    #[test]
    fn background_theme_table_is_complete() {
        let themes = block_between(COMPONENTS, "const SB_THEMES = {", "};");
        let mut keys = Vec::new();
        for line in themes.lines() {
            let t = line.trim();
            if let Some(colon) = t.find(':') {
                let key = &t[..colon];
                if !key.is_empty() && key.chars().all(|c| c.is_ascii_alphanumeric()) {
                    keys.push(key);
                }
            }
        }
        assert!(
            keys.len() >= 30,
            "expected at least 30 background themes, found {}",
            keys.len()
        );
        let unique: std::collections::HashSet<&&str> = keys.iter().collect();
        assert_eq!(unique.len(), keys.len(), "duplicate background theme");
        let paints = block_between(COMPONENTS, "const SB_PAINTS = {", "};");
        assert!(
            paints.matches(':').count() >= 30,
            "every theme needs a painter"
        );
        assert!(themes.contains("mode: 'light'"), "the set needs light themes");
        assert!(themes.contains("mode: 'dark'"), "the set needs dark themes");
    }

    #[test]
    fn a_throwing_component_cannot_corrupt_the_canvas() {
        // imageOverlay used an undeclared TS, threw mid-branch, and left a
        // scaled/translated save on the stack: every later frame was tiny.
        let overlay = block_between(
            COMPONENTS,
            "c.componentId === 'imageOverlay'",
            "c.componentId === 'quoteBox'",
        );
        assert!(overlay.contains("const TS"), "imageOverlay must declare its text scale");
        assert!(COMPONENTS.contains("ecTrackContext(ctx)"), "the loop must track save depth");
        assert!(COMPONENTS.contains("ecRestoreTo(ctx, baseDepth)"), "the loop must recover state");
        assert!(COMPONENTS.contains("component draw failed"), "component errors must be isolated");
        assert!(TEMPLATE.contains("ctx.reset()"), "player frames must start from a clean state");
        assert!(
            include_str!("assets/editor.html").contains("stageCtx.reset()"),
            "editor frames must start from a clean state"
        );
    }

    #[test]
    fn stat_delta_and_node_labels_scale_with_the_stage() {
        // The delta was a hard-coded 14px tag and link labels overflowed their
        // discs; both must scale with the component instead of the old sizes.
        let stat = block_between(COMPONENTS, "c.componentId === 'statBadge'", "// 5. chapterCard");
        assert!(stat.contains("deltaBand"), "the delta chip must own a reserved band");
        assert!(!stat.contains("700 14px"), "the delta still uses the 14px tag");
        let link = block_between(COMPONENTS, "c.componentId === 'flowConnector'", "// 14. typewriter");
        assert!(
            link.contains("measureText(label).width > nodeR * 1.7"),
            "link labels must shrink until they fit inside the node"
        );
    }

    #[test]
    fn quote_box_wraps_and_clamps_long_quotes() {
        // A single-line fillText ran off the card for any long quote; the
        // renderer must wrap the copy, fit it to an explicit height, and keep
        // everything inside the plate.
        let block = block_between(
            COMPONENTS,
            "c.componentId === 'quoteBox'",
            "c.componentId === 'statBadge'",
        );
        assert!(block.contains("ecWrap(ctx, quote"), "quoteBox must wrap its quote");
        assert!(block.contains("ctx.clip()"), "quoteBox must clamp text to its plate");
        assert!(!block.contains("fillText(p.quote"), "quoteBox still has the single-line draw");
    }

    #[test]
    fn player_has_no_placeholder_content_constants() {
        for needle in ["p.text || 'SA'", "'starlight'", "'SUBSCRIBE'", "p.chapter || 'chapter'"] {
            assert!(!TEMPLATE.contains(needle), "placeholder constant remains: {needle}");
        }
    }
}
