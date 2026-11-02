//! Forced alignment: a wav2vec2 CTC model maps each already-known word to
//! its exact audio frames, so captions can land on the voice word by word.
//! The waveform runs through the encoder once; a Viterbi pass then aligns
//! the known token sequence to the CTC frames (the classic torchaudio
//! forced-alignment recipe, interleaved with blanks). English only — the
//! CTC vocabulary is the 26 letters, apostrophe and the word boundary.

use ort::session::Session;
use ort::value::Tensor;

const LABELS: [&str; 32] = [
    "<pad>", "<s>", "</s>", "<unk>", "|", "E", "T", "A", "O", "N", "I", "H", "S", "R", "D",
    "L", "U", "M", "W", "C", "F", "G", "Y", "P", "B", "V", "K", "'", "X", "J", "Q", "Z",
];
const BLANK: usize = 0; // <pad>
const WORD_SEP: usize = 4; // |
const FRAME: f32 = 1.0 / 50.0; // 16000 Hz / 320-sample stride

fn label_id(c: char) -> Option<usize> {
    if !c.is_ascii() {
        return None;
    }
    let up = c.to_ascii_uppercase();
    LABELS.iter().position(|&l| l.len() == 1 && l.as_bytes()[0] as char == up)
}

pub struct Aligner {
    session: Session,
}

impl Aligner {
    pub fn new() -> Result<Aligner, String> {
        let path = super::models_dir().join("align").join("w2v2_q.onnx");
        if !path.exists() {
            return Err("no alignment model".into());
        }
        let session = Session::builder()
            .and_then(|b| b.commit_from_file(path))
            .map_err(|e| e.to_string())?;
        Ok(Aligner { session })
    }

    /// Align `words` (in order) to `samples` (24 kHz mono) and return each
    /// word's (start seconds, end seconds) in the audio.
    pub fn align(&mut self, samples: &[f32], words: &[String]) -> Result<Vec<(f32, f32)>, String> {
        // 24 kHz -> 16 kHz linear resample
        let n16 = ((samples.len() as f64) * 16000.0 / 24000.0) as usize;
        if n16 < 400 || words.is_empty() {
            return Err("audio too short".into());
        }
        let mut x = vec![0f32; n16];
        for (i, v) in x.iter_mut().enumerate() {
            let pos = i as f64 * 24000.0 / 16000.0;
            let i0 = pos.floor() as usize;
            let i1 = (i0 + 1).min(samples.len() - 1);
            let frac = (pos - i0 as f64) as f32;
            *v = samples[i0] * (1.0 - frac) + samples[i1] * frac;
        }
        // zero-mean unit-variance, as the model was trained
        let mean = x.iter().sum::<f32>() / x.len() as f32;
        let var = x.iter().map(|v| (v - mean) * (v - mean)).sum::<f32>() / x.len() as f32;
        let inv = 1.0 / var.sqrt();
        for v in x.iter_mut() {
            *v = (*v - mean) * inv;
        }
        let input = Tensor::from_array(([1usize, x.len()], x)).map_err(|e| e.to_string())?;
        let out = self
            .session
            .run(ort::inputs!["input_values" => input])
            .map_err(|e| e.to_string())?;
        let logits = out["logits"].try_extract_array::<f32>().map_err(|e| e.to_string())?;
        let frames = logits.shape()[1];
        let data: Vec<f32> = logits
            .as_slice()
            .map(<[f32]>::to_vec)
            .ok_or("logits")?;

        // per-frame log-softmax
        let mut lp = vec![0f32; frames * 32];
        for f in 0..frames {
            let row = &data[f * 32..(f + 1) * 32];
            let max = row.iter().cloned().fold(f32::MIN, f32::max);
            let mut z = 0f32;
            for v in row.iter() {
                z += (v - max).exp();
            }
            let logz = max + z.ln();
            for (c, v) in row.iter().enumerate() {
                lp[f * 32 + c] = v - logz;
            }
        }

        // token sequence: labeled chars per word, '|' between words
        // (word index -1 marks a separator)
        let mut tokens: Vec<(usize, i64)> = Vec::new();
        let mut any = false;
        for (wi, w) in words.iter().enumerate() {
            if any {
                tokens.push((WORD_SEP, -1));
            }
            for ch in w.chars() {
                if let Some(id) = label_id(ch) {
                    tokens.push((id, wi as i64));
                    any = true;
                }
            }
        }
        if tokens.is_empty() {
            return Err("no alignable characters".into());
        }

        // interleaved CTC DP: states = blank, tok0, blank, tok1, ... blank
        let n = tokens.len();
        let s_len = 2 * n + 1;
        const NEG: f32 = -1e30;
        let state_label = |i: usize| -> usize {
            if i.is_multiple_of(2) {
                BLANK
            } else {
                tokens[(i - 1) / 2].0
            }
        };
        let mut alpha = vec![NEG; s_len];
        let mut back = vec![vec![0u8; s_len]; frames];
        alpha[0] = lp[state_label(0)];
        if s_len > 1 {
            alpha[1] = lp[state_label(1)];
        }
        for (t, back_row) in back.iter_mut().enumerate().take(frames).skip(1) {
            let mut next = vec![NEG; s_len];
            let row_base = t * 32;
            for i in 0..s_len {
                let lab = state_label(i);
                let mut best = alpha[i];
                let mut b = 0u8;
                if i > 0 && alpha[i - 1] > best {
                    best = alpha[i - 1];
                    b = 1;
                }
                if i > 1 && lab != state_label(i - 2) && alpha[i - 2] > best {
                    best = alpha[i - 2];
                    b = 2;
                }
                next[i] = best + lp[row_base + lab];
                back_row[i] = b;
            }
            alpha = next;
        }
        let mut i = if s_len >= 2 && alpha[s_len - 2] > alpha[s_len - 1] {
            s_len - 2
        } else {
            s_len - 1
        };
        let mut path = vec![0usize; frames];
        for t in (0..frames).rev() {
            path[t] = i;
            if t == 0 {
                break;
            }
            i = match back[t][i] {
                2 => i - 2,
                1 => i - 1,
                _ => i,
            };
        }

        // first/last frame per word from the path
        let mut spans: Vec<Option<(usize, usize)>> = vec![None; words.len()];
        for (t, &st) in path.iter().enumerate() {
            if st % 2 == 1 {
                let (_, wi) = tokens[(st - 1) / 2];
                if wi >= 0 {
                    let w = wi as usize;
                    match &mut spans[w] {
                        Some(e) => {
                            e.0 = e.0.min(t);
                            e.1 = e.1.max(t);
                        }
                        None => spans[w] = Some((t, t)),
                    }
                }
            }
        }
        let mut out_spans = Vec::with_capacity(words.len());
        let mut last_end = 0f32;
        for sp in &spans {
            match sp {
                Some((a, b)) => {
                    let s = (*a as f32) * FRAME;
                    let e = (*b as f32 + 1.0) * FRAME;
                    let s = s.max(last_end);
                    let e = e.max(s);
                    out_spans.push((s, e));
                    last_end = e;
                }
                None => {
                    // a word with no alignable letters: a hair after the last
                    out_spans.push((last_end, last_end + FRAME));
                    last_end += FRAME;
                }
            }
        }
        Ok(out_spans)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn label_map_covers_letters_and_boundary() {
        assert_eq!(label_id('e'), Some(5)); // E
        assert_eq!(label_id('T'), Some(6));
        assert_eq!(label_id('\''), Some(27));
        assert_eq!(label_id('ç'), None);
        assert_eq!(label_id('4'), None);
    }
}
