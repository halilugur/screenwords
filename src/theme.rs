//! Per-project visual themes: the palette is DOCUMENT DATA the AI chooses
//! through the `set_theme` MCP tool — the engine renders whatever it is
//! given and holds no video-specific look of its own. Named presets are
//! convenience starting points; every token can be overridden freely, and
//! component-level colour params still win over the theme.

use crate::json::Value;

#[derive(Debug)]
pub struct Preset {
    pub name: &'static str,
    pub description: &'static str,
    pub json: &'static str,
}

/// The fallback when a project carries no theme: the original midnight look.
pub const DEFAULT: &str = r##"{
  "paper": "#04070F", "ink": "#F4F8FF", "accent": "#38BDF8", "accent2": "#FFD54A",
  "accentInk": "#04101E",
  "bg": {
    "stars":   ["#070B16", "#0D1527", "#F4F8FF"],
    "grid":    ["#05070E", "rgba(56,189,248,0.22)", "rgba(56,189,248,0.14)"],
    "mesh":    ["#070A12", "#6366F1", "#06B6D4", "#EC4899"],
    "waves":   ["#050D1A", "#0B1D3A", "#38BDF8"],
    "sunset":  ["#0B0A1C", "#2E1038", "#7C1F38"],
    "studio":  ["#050811", "#0C1322", "#1E293B"]
  }
}"##;

pub const PRESETS: &[Preset] = &[
    Preset {
        name: "midnight",
        description: "deep night blue, cyan accent, gold second (the original look)",
        json: DEFAULT,
    },
    Preset {
        name: "editorial",
        description: "light warm paper, near-black ink, burnt-orange accent, teal second",
        json: r##"{
  "paper": "#F6F1E7", "ink": "#1A1714", "accent": "#C2410C", "accent2": "#0F766E",
  "accentInk": "#FFF7ED",
  "bg": {
    "stars":   ["#F6F1E7", "#EFE7D7", "#C2410C"],
    "grid":    ["#F6F1E7", "rgba(194,65,12,0.20)", "rgba(26,23,20,0.30)"],
    "mesh":    ["#F6F1E7", "#C2410C", "#0F766E", "#B45309"],
    "waves":   ["#F6F1E7", "#EADFC9", "#0F766E"],
    "sunset":  ["#F3E8D7", "#E7D3B3", "#C2410C"],
    "studio":  ["#F6F1E7", "#EDE4D2", "#D6C9AE"]
  }
        }"##,
    },
    Preset {
        name: "meadow",
        description: "deep forest green, mint accent, butter second",
        json: r##"{
  "paper": "#0B1F16", "ink": "#ECFDF5", "accent": "#34D399", "accent2": "#FDE68A",
  "accentInk": "#052E1B",
  "bg": {
    "stars":   ["#08170F", "#0F2A1D", "#ECFDF5"],
    "grid":    ["#08170F", "rgba(52,211,153,0.22)", "rgba(52,211,153,0.14)"],
    "mesh":    ["#08170F", "#10B981", "#34D399", "#A7F3D0"],
    "waves":   ["#08170F", "#0F2A1D", "#34D399"],
    "sunset":  ["#0B1F16", "#143D22", "#B45309"],
    "studio":  ["#08170F", "#0F2A1D", "#1C4D31"]
  }
        }"##,
    },
    Preset {
        name: "noir",
        description: "monochrome: near-black paper, silver ink, white accent, grey second",
        json: r##"{
  "paper": "#0A0A0A", "ink": "#EDEDED", "accent": "#EDEDED", "accent2": "#9CA3AF",
  "accentInk": "#111111",
  "bg": {
    "stars":   ["#0A0A0A", "#161616", "#EDEDED"],
    "grid":    ["#0A0A0A", "rgba(237,237,237,0.18)", "rgba(237,237,237,0.10)"],
    "mesh":    ["#0A0A0A", "#6B7280", "#9CA3AF", "#4B5563"],
    "waves":   ["#0A0A0A", "#1A1A1A", "#9CA3AF"],
    "sunset":  ["#0A0A0A", "#262626", "#6B7280"],
    "studio":  ["#0A0A0A", "#161616", "#2A2A2A"]
  }
        }"##,
    },
    Preset {
        name: "candy",
        description: "violet night, hot pink accent, mint second",
        json: r##"{
  "paper": "#1E1030", "ink": "#FDF4FF", "accent": "#FF6AD5", "accent2": "#77E4C8",
  "accentInk": "#2B0A22",
  "bg": {
    "stars":   ["#170B26", "#241238", "#FDF4FF"],
    "grid":    ["#170B26", "rgba(255,106,213,0.22)", "rgba(119,228,200,0.14)"],
    "mesh":    ["#170B26", "#FF6AD5", "#77E4C8", "#A855F7"],
    "waves":   ["#170B26", "#241238", "#FF6AD5"],
    "sunset":  ["#1E1030", "#3B1A50", "#FF6AD5"],
    "studio":  ["#170B26", "#241238", "#3B1A50"]
  }
        }"##,
    },
    Preset {
        name: "sunset",
        description: "warm plum, coral accent, amber second",
        json: r##"{
  "paper": "#1C0B14", "ink": "#FFF1F2", "accent": "#FB7185", "accent2": "#FBBF24",
  "accentInk": "#37050F",
  "bg": {
    "stars":   ["#150810", "#24101B", "#FFF1F2"],
    "grid":    ["#150810", "rgba(251,113,133,0.22)", "rgba(251,191,36,0.14)"],
    "mesh":    ["#150810", "#FB7185", "#FBBF24", "#F43F5E"],
    "waves":   ["#150810", "#24101B", "#FB7185"],
    "sunset":  ["#1C0B14", "#4C1D25", "#B45309"],
    "studio":  ["#150810", "#24101B", "#3B1520"]
  }
        }"##,
    },
    Preset {
        name: "glacier",
        description: "steel blue, ice accent, pale silver second",
        json: r##"{
  "paper": "#0B1524", "ink": "#F0F9FF", "accent": "#A5F3FC", "accent2": "#E2E8F0",
  "accentInk": "#06283A",
  "bg": {
    "stars":   ["#080F1B", "#122036", "#F0F9FF"],
    "grid":    ["#080F1B", "rgba(165,243,252,0.20)", "rgba(226,232,240,0.12)"],
    "mesh":    ["#080F1B", "#A5F3FC", "#E2E8F0", "#38BDF8"],
    "waves":   ["#080F1B", "#122036", "#A5F3FC"],
    "sunset":  ["#0B1524", "#1E3350", "#7DD3FC"],
    "studio":  ["#080F1B", "#122036", "#1D3050"]
  }
        }"##,
    },
];

/// Merge a theme choice into `settings.theme`: an optional preset as the
/// base, then any explicit token overrides (accent, accent2, ink, paper,
/// accentInk, bg.<style> as a colour array). Explicit component params
/// always win over the theme at render time.
pub fn apply(settings: &mut Value, args: &Value) -> Result<Value, String> {
    let mut theme: Value = settings
        .get("theme")
        .cloned()
        .or_else(|| Value::parse(DEFAULT).ok())
        .unwrap_or_else(Value::obj);
    if let Some(name) = args.get("preset").and_then(Value::as_str) {
        let preset = PRESETS
            .iter()
            .find(|p| p.name == name)
            .ok_or_else(|| {
                format!(
                    "no theme '{name}'; pick one of {}",
                    PRESETS.iter().map(|p| p.name).collect::<Vec<_>>().join(", ")
                )
            })?;
        theme = Value::parse(preset.json).map_err(|e| e.to_string())?;
    }
    for key in ["paper", "ink", "accent", "accent2", "accentInk"] {
        if let Some(v) = args.get(key) {
            if let Some(s) = v.as_str() {
                if !crate::catalog::is_hex_color(&Value::str(s)) {
                    return Err(format!("{key}: must be a hex color"));
                }
                theme.set(key, Value::str(s));
            }
        }
    }
    if let Some(bg) = args.get("bg").and_then(Value::as_object) {
        let mut cur = theme.get("bg").cloned().unwrap_or_else(Value::obj);
        for (style, colors) in bg {
            if let Some(arr) = colors.as_array() {
                let all_hex = arr
                    .iter()
                    .all(|c| c.as_str().map(|s| crate::catalog::is_hex_color(&Value::str(s))).unwrap_or(false));
                if !all_hex {
                    return Err(format!("bg.{style}: every entry must be a hex color"));
                }
                cur.set(style, colors.clone());
            }
        }
        theme.set("bg", cur);
    }
    settings.set("theme", theme.clone());
    Ok(theme)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_parse_and_carry_tokens() {
        for p in PRESETS {
            let v = Value::parse(p.json).unwrap();
            for key in ["paper", "ink", "accent", "accent2", "accentInk"] {
                assert!(v.get(key).and_then(Value::as_str).is_some(), "{p:?} missing {key}");
            }
            assert!(v.get("bg").and_then(|b| b.get("grid")).is_some(), "{p:?} missing bg.grid");
        }
    }

    #[test]
    fn merge_overrides_keep_the_rest() {
        let mut settings = Value::obj();
        let out = apply(&mut settings, &Value::parse(r##"{"preset": "editorial", "accent": "#123456"}"##).unwrap()).unwrap();
        assert_eq!(out.get("accent").and_then(Value::as_str), Some("#123456"));
        assert_eq!(out.get("paper").and_then(Value::as_str), Some("#F6F1E7"));
        assert!(settings.get("theme").is_some());
    }

    #[test]
    fn rejects_unknown_preset_and_bad_color() {
        let mut settings = Value::obj();
        assert!(apply(&mut settings, &Value::parse(r##"{"preset": "nope"}"##).unwrap()).is_err());
        assert!(apply(&mut settings, &Value::parse(r##"{"accent": "red"}"##).unwrap()).is_err());
    }
}
