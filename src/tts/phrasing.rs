//! How a text becomes speech with room to breathe, shared by every voice.
//!
//! A model speaks one sentence well: it rises, falls and lands. Handed a
//! paragraph in one pass it reads on without stopping, which is what a
//! listener hears as someone being chased. So a text is cut into sentences
//! ([`sentences`]), each is spoken on its own, and [`Spoken`] joins them with
//! the pause their punctuation asks for ([`pause_after`]), recording where
//! each one sits in the audio so captions can be laid onto the voice.
//!
//! [`Pace`] is the one speed control: 1.0 is calm narration for every voice
//! (each backend knows how far its own model is from that), below 1 is
//! slower, above is faster. Pauses stretch and shrink with it.

use super::{Audio, ChunkWindows, Speech};

/// Speaking rate relative to calm narration.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Pace(f32);

impl Pace {
    /// The default: an unhurried narrator.
    pub const NARRATION: Pace = Pace(1.0);
    const RANGE: std::ops::RangeInclusive<f64> = 0.6..=1.5;

    /// `rate` 0.6 (slow, deliberate) to 1.5 (brisk); 1 is narration.
    pub fn new(rate: f64) -> Result<Pace, String> {
        if !Self::RANGE.contains(&rate) {
            return Err(format!("rate must be {} to {} (1 is calm narration), got {rate}", Self::RANGE.start(), Self::RANGE.end()));
        }
        Ok(Pace(rate as f32))
    }

    pub fn rate(self) -> f32 {
        self.0
    }

    /// The factor a model's own durations are multiplied by, given how much
    /// longer than its own pace narration is for that model.
    pub fn stretch(self, narration: f32) -> f32 {
        narration / self.0
    }
}

/// Marks that close a sentence after its stop: `"Bitti."` ends one.
const CLOSERS: [char; 8] = ['"', '\'', ')', ']', '\u{201D}', '\u{2019}', '\u{00BB}', '\u{203A}'];

fn is_abbrev(word: &str) -> bool {
    let token = word.trim_end_matches('.');
    matches!(
        token,
        "Mr" | "Mrs" | "Ms" | "Dr" | "Prof" | "Sr" | "Jr" | "St" | "Ave" | "Blvd" | "Inc"
            | "Ltd" | "Co" | "Corp" | "vs" | "e.g" | "i.e" | "etc" | "Ph.D"
    ) || (token.chars().count() == 1 && token.chars().next().map(char::is_uppercase).unwrap_or(false))
}

/// Whether a sentence ends with `word` (its punctuation attached, as it is
/// written). The one definition: transcript segments and spoken sentences
/// are cut by it, so a segment's audio is always one sentence's window.
pub fn ends_sentence(word: &str) -> bool {
    let bare = word.trim_end_matches(CLOSERS);
    match bare.chars().last() {
        Some('!' | '?' | '\u{2026}' | '\u{3002}' | '\u{FF01}' | '\u{FF1F}') => true,
        Some('.') => !is_abbrev(bare),
        _ => false,
    }
}

/// One piece per sentence, so each piece's audio maps 1:1 to a transcript
/// segment; a line break ends one too. A sentence longer than `max_chars`
/// is cut between words (or inside a word, for scripts without spaces).
pub fn sentences(text: &str, max_chars: usize) -> Vec<String> {
    let mut whole: Vec<String> = Vec::new();
    for line in text.lines() {
        let mut cur = String::new();
        for word in line.split_whitespace() {
            if !cur.is_empty() {
                cur.push(' ');
            }
            cur.push_str(word);
            if ends_sentence(word) {
                whole.push(std::mem::take(&mut cur));
            }
        }
        if !cur.is_empty() {
            whole.push(cur);
        }
    }

    let mut out = Vec::new();
    for sentence in whole {
        if sentence.chars().count() <= max_chars {
            out.push(sentence);
            continue;
        }
        let mut line = String::new();
        for word in sentence.split_whitespace() {
            let len = word.chars().count();
            if len > max_chars {
                // No-space scripts (CJK) still have to be cut somewhere.
                if !line.is_empty() {
                    out.push(std::mem::take(&mut line));
                }
                let chars: Vec<char> = word.chars().collect();
                for part in chars.chunks(max_chars) {
                    out.push(part.iter().collect());
                }
                continue;
            }
            if !line.is_empty() && line.chars().count() + 1 + len > max_chars {
                out.push(std::mem::take(&mut line));
            }
            if !line.is_empty() {
                line.push(' ');
            }
            line.push_str(word);
        }
        if !line.is_empty() {
            out.push(line);
        }
    }
    out
}

/// Seconds of silence added after `sentence`: a full stop is a breath, a
/// question hangs a little longer, a colon or a cut mid-sentence only a
/// beat. A model trails each sentence with about 0.2 s of its own quiet, so
/// a full stop is heard as roughly 0.65 s. Slower speech pauses longer.
pub fn pause_after(sentence: &str, pace: Pace) -> f32 {
    let last = sentence.trim_end().trim_end_matches(CLOSERS).chars().last();
    let seconds = match last {
        Some('?' | '\u{FF1F}' | '\u{2026}') => 0.55,
        Some('.' | '!' | '\u{3002}' | '\u{FF01}') => 0.45,
        Some(':' | ';' | '\u{2014}') => 0.3,
        _ => 0.2,
    };
    seconds / pace.rate()
}

/// Sentences joined into one take, with the pause each one earned, the
/// `(start, duration)` window of every sentence and, while every sentence
/// came with them, the `(start, end)` of every word.
pub struct Spoken {
    samples: Vec<f32>,
    windows: ChunkWindows,
    words: Option<Vec<(f64, f64)>>,
    rate: u32,
    /// Silence owed before the next sentence; none is left after the last.
    owed: usize,
}

impl Spoken {
    pub fn new(rate: u32) -> Spoken {
        Spoken { samples: Vec::new(), windows: Vec::new(), words: Some(Vec::new()), rate, owed: 0 }
    }

    /// Adds one spoken sentence. `words` are its words' `(start, end)` within
    /// `pcm`, from a voice that knows them. An empty `pcm` (nothing readable
    /// in the sentence) is skipped and takes no pause.
    pub fn push(&mut self, pcm: &[f32], words: Option<Vec<(f64, f64)>>, sentence: &str, pace: Pace) {
        if pcm.is_empty() {
            // Its written words were never said: word times no longer line up.
            if sentence.split_whitespace().next().is_some() {
                self.words = None;
            }
            return;
        }
        self.samples.extend(std::iter::repeat(0.0).take(self.owed));
        let rate = self.rate as f64;
        let start = self.samples.len() as f64 / rate;
        self.windows.push((start, pcm.len() as f64 / rate));
        match (self.words.as_mut(), words) {
            (Some(all), Some(spans)) => all.extend(spans.iter().map(|(a, b)| (start + a, start + b))),
            _ => self.words = None,
        }
        self.samples.extend_from_slice(pcm);
        self.owed = (pause_after(sentence, pace) * self.rate as f32) as usize;
    }

    pub fn finish(self) -> Result<Speech, String> {
        if self.samples.is_empty() {
            return Err("nothing to say".into());
        }
        Ok(Speech { audio: Audio { samples: self.samples, rate: self.rate }, sentences: self.windows, words: self.words })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_piece_per_sentence() {
        assert_eq!(sentences("One sentence. Two sentences here!\nThird?", 300), vec!["One sentence.", "Two sentences here!", "Third?"]);
        // The narration that was read in one breath: ten sentences, a colon
        // and commas staying inside theirs.
        let film = "On üç virgül sekiz milyar yıl önce, her şey tek bir noktadan genişlemeye başladı. Merkezinde Güneş yandı. Çevresindeki kayalar birleşti ve erimiş bir gezegen doğdu: Dünya.";
        let parts = sentences(film, 300);
        assert_eq!(parts.len(), 3, "{parts:?}");
        assert_eq!(parts[1], "Merkezinde Güneş yandı.");
        assert!(parts[2].ends_with("doğdu: Dünya."));
    }

    #[test]
    fn abbreviations_quotes_and_lines() {
        let parts = sentences("Dr. Smith arrived. He left.", 300);
        assert_eq!(parts.len(), 2, "{parts:?}");
        assert!(parts[0].starts_with("Dr. Smith"));
        // The closing quote belongs to the sentence it closes.
        assert_eq!(sentences("\"Bitti.\" dedi. Sonra gitti.", 300), vec!["\"Bitti.\"", "dedi.", "Sonra gitti."]);
        // A heading on its own line is its own sentence, stop or not.
        assert_eq!(sentences("Birinci bölüm\nHer şey burada başladı.", 300), vec!["Birinci bölüm", "Her şey burada başladı."]);
        for (word, ends) in [("başladı.", true), ("doğdu:", false), ("önce,", false), ("Dr.", false), ("A.", false), ("neden?", true), ("dur!\"", true), ("3.5", false)] {
            assert_eq!(ends_sentence(word), ends, "{word}");
        }
    }

    #[test]
    fn long_sentences_are_cut_between_words() {
        let text = "word ".repeat(200);
        let parts = sentences(text.trim(), 300);
        assert!(parts.len() > 1);
        assert!(parts.iter().all(|c| c.chars().count() <= 300));
        assert_eq!(parts.join(" "), text.trim(), "no word is lost or split");
    }

    #[test]
    fn pauses_follow_punctuation_and_pace() {
        let calm = Pace::NARRATION;
        assert_eq!(pause_after("Güneş yandı.", calm), 0.45);
        assert_eq!(pause_after("Peki sonra?", calm), 0.55);
        assert_eq!(pause_after("Bir gezegen doğdu:", calm), 0.3);
        assert_eq!(pause_after("\"Bitti.\"", calm), 0.45, "a closing quote does not hide the stop");
        assert_eq!(pause_after("cut mid sentence", calm), 0.2);
        let slow = Pace::new(0.75).unwrap();
        assert!((pause_after("Güneş yandı.", slow) - 0.6).abs() < 1e-6);
        assert!(Pace::new(0.5).is_err() && Pace::new(1.6).is_err() && Pace::new(f64::NAN).is_err());
        assert!(Pace::new(2.0).unwrap_err().contains("0.6 to 1.5"));
        // A model that speaks 1.24x faster than narration is stretched by
        // that much at rate 1, and less when asked to be brisk.
        assert!((calm.stretch(1.24) - 1.24).abs() < 1e-6);
        assert!((Pace::new(1.24).unwrap().stretch(1.24) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn sentences_are_joined_with_their_pauses_windows_and_words() {
        let mut take = Spoken::new(1000);
        take.push(&[0.5; 2000], Some(vec![(0.0, 0.9), (1.0, 1.9)]), "Güneş yandı.", Pace::NARRATION);
        take.push(&[0.5; 1000], Some(vec![(0.1, 0.4), (0.5, 0.9)]), "Peki sonra?", Pace::NARRATION);
        let speech = take.finish().unwrap();
        // 2 s of speech, 0.45 s after the full stop, 1 s of speech, and no
        // silence trailing the last sentence.
        assert_eq!(speech.sentences, vec![(0.0, 2.0), (2.45, 1.0)]);
        assert_eq!(speech.audio.samples.len(), 3450);
        assert!(speech.audio.samples[2000..2450].iter().all(|s| *s == 0.0));
        assert!(speech.audio.samples[2450..].iter().all(|s| *s == 0.5));
        // Word times move with their sentence into the take.
        let words = speech.words.expect("every sentence came with its words");
        let want = [(0.0, 0.9), (1.0, 1.9), (2.55, 2.85), (2.95, 3.35)];
        assert_eq!(words.len(), want.len());
        assert!(words.iter().zip(want).all(|(got, want)| (got.0 - want.0).abs() < 1e-9 && (got.1 - want.1).abs() < 1e-9), "{words:?}");

        // One sentence without word times, or one that could not be read,
        // and the take claims none: a partial list would land on wrong words.
        let mut mixed = Spoken::new(1000);
        mixed.push(&[0.5; 1000], Some(vec![(0.0, 1.0)]), "Bir.", Pace::NARRATION);
        mixed.push(&[0.5; 1000], None, "İki.", Pace::NARRATION);
        assert_eq!(mixed.finish().unwrap().words, None);
        let mut unread = Spoken::new(1000);
        unread.push(&[0.5; 1000], Some(vec![(0.0, 1.0)]), "Bir.", Pace::NARRATION);
        unread.push(&[], None, "…", Pace::NARRATION);
        let speech = unread.finish().unwrap();
        assert_eq!((speech.sentences.len(), speech.words), (1, None));
        assert!(Spoken::new(1000).finish().is_err());
    }
}
