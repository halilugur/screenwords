//! A quiet ambient music bed under speech: slow sustained chords, made on the
//! device like the voices, ducked wherever someone talks. It is a floor for a
//! podcast or an explainer, not a score — a few sine partials, no samples.

use std::f32::consts::TAU;

/// Chords (MIDI notes) of a gentle I–vi–IV–V loop in C, one every 4 s.
const CHORDS: [[u8; 3]; 4] = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const CHORD_SECONDS: f32 = 4.0;

fn midi_hz(note: u8) -> f32 {
    440.0 * 2f32.powf((note as f32 - 69.0) / 12.0)
}

/// `duration` seconds of bed at `rate`, ducked under `voice` (the speech
/// track at the same rate): -10 dB while anyone speaks, eased in and out
/// over ~300 ms, with a 1 s fade in and a 2 s fade out.
pub fn ambient(duration: f32, rate: u32, voice: &[f32]) -> Vec<f32> {
    let r = rate as f32;
    let n = (duration.max(0.0) * r) as usize;
    // Speech envelope: 20 ms frame peaks, smoothed into a ducking gain.
    let win = (rate as usize / 50).max(1);
    let frames = n.div_ceil(win);
    let mut duck = vec![1.0f32; frames];
    let mut g = 1.0f32;
    for (f, slot) in duck.iter_mut().enumerate() {
        let s = f * win;
        let e = (s + win).min(voice.len());
        let peak = if s < e { voice[s..e].iter().fold(0.0f32, |m, x| m.max(x.abs())) } else { 0.0 };
        let target = if peak > 0.02 { 0.32 } else { 1.0 };
        // Duck fast (60 ms), recover slowly (300 ms).
        let k = if target < g { 0.33 } else { 0.067 };
        g += (target - g) * k;
        *slot = g;
    }
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let t = i as f32 / r;
        let pos = t / CHORD_SECONDS;
        let idx = pos.floor() as usize;
        let frac = pos - pos.floor();
        // Each chord swells in and overlaps the next by half a second.
        let mut v = 0.0f32;
        for (k, which) in [(0usize, idx), (1, idx + 1)] {
            let local = if k == 0 { frac } else { frac - 1.0 };
            let env = if k == 0 {
                let rise = (local * CHORD_SECONDS / 0.8).min(1.0);
                let fall = ((1.0 - local) * CHORD_SECONDS / 0.5).min(1.0);
                rise.min(fall.max(0.0))
            } else if local > -0.5 / CHORD_SECONDS {
                ((local * CHORD_SECONDS + 0.5) / 0.8).clamp(0.0, 1.0)
            } else {
                0.0
            };
            if env <= 0.0 {
                continue;
            }
            for (j, note) in CHORDS[which % CHORDS.len()].iter().enumerate() {
                let hz = midi_hz(*note);
                let ph = TAU * hz * t + j as f32;
                v += env * (ph.sin() + 0.18 * (2.0 * ph).sin()) / 3.0;
            }
        }
        let tremolo = 0.85 + 0.15 * (TAU * 0.11 * t).sin();
        let fade = (t / 1.0).min(1.0).min(((duration - t) / 2.0).max(0.0));
        out.push(0.055 * v * tremolo * fade * duck[i / win]);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rms(v: &[f32]) -> f32 {
        (v.iter().map(|s| s * s).sum::<f32>() / v.len().max(1) as f32).sqrt()
    }

    #[test]
    fn bed_is_quiet_fades_and_ducks_under_speech() {
        let rate = 16000u32;
        // Speech from 4 s to 8 s of a 12 s piece.
        let mut voice = vec![0.0f32; rate as usize * 12];
        for (i, s) in voice.iter_mut().enumerate().take(rate as usize * 8).skip(rate as usize * 4) {
            *s = 0.3 * (i as f32 * 0.07).sin();
        }
        let bed = ambient(12.0, rate, &voice);
        assert_eq!(bed.len(), rate as usize * 12);
        assert!(bed.iter().all(|s| s.abs() < 0.12), "the bed stays well under the voice");
        assert!(bed[0].abs() < 1e-3 && bed[bed.len() - 1].abs() < 1e-3, "it fades in and out");
        let sec = |a: f32, b: f32| &bed[(a * rate as f32) as usize..(b * rate as f32) as usize];
        let open = rms(sec(2.0, 3.5));
        let under = rms(sec(5.0, 7.5));
        let after = rms(sec(9.5, 9.9));
        assert!(under < open * 0.45, "ducked under speech: {under} vs {open}");
        assert!(after > under * 1.8, "recovers after speech: {after} vs {under}");
    }
}
