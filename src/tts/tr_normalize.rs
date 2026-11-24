//! Written Turkish to the spoken form Antalia-2 Mini was trained on: a port
//! of its serving normaliser (`antalia_mini.text`, Apache-2.0, after
//! Patientdesk's turkish-tts). Numbers, decimals, percentages, ordinals,
//! dates, times, amounts, units, ranges, fractions, Roman numerals,
//! abbreviations, initialisms, web and e-mail addresses and symbols become
//! words; a suffix written after a number joins the word it became
//! ("15:30'da" -> "on beş otuzda"); English and brand words are respelled the
//! way a Turkish speaker says them, from the CMU Pronouncing Dictionary, a
//! Turkish word-frequency list and a reviewed lexicon (data staged beside the
//! model). The normaliser's IBAN, telephone and medical readings are left
//! out: video narration does not say them.
//!
//! Each rule runs over the whole text in the original's order; [`rewrite`]
//! gives a rule the full text around its match, as the original's
//! look-arounds see it.

use crate::json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;

// ---------- scanning ----------

/// Rebuilds `text`: at each position `rule` may claim the characters up to
/// an end with a replacement; elsewhere a character is kept. Matches never
/// overlap and look-behind sees the original text.
fn rewrite(text: &str, mut rule: impl FnMut(&[char], usize) -> Option<(usize, String)>) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;
    while i < chars.len() {
        match rule(&chars, i) {
            Some((end, replacement)) if end > i => {
                out.push_str(&replacement);
                i = end;
            }
            _ => {
                out.push(chars[i]);
                i += 1;
            }
        }
    }
    out
}

fn word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn letter(c: char) -> bool {
    c.is_alphabetic()
}

fn at(chars: &[char], i: usize) -> Option<char> {
    chars.get(i).copied()
}

fn before(chars: &[char], i: usize) -> Option<char> {
    i.checked_sub(1).map(|j| chars[j])
}

/// `\b` before position i (the next character is a word character).
fn starts_word(chars: &[char], i: usize) -> bool {
    !before(chars, i).is_some_and(word_char)
}

/// `\b` after position i (the previous character is a word character).
fn ends_word(chars: &[char], i: usize) -> bool {
    !at(chars, i).is_some_and(word_char)
}

/// The end of a run of ASCII digits from i.
fn digits_end(chars: &[char], i: usize) -> usize {
    let mut j = i;
    while at(chars, j).is_some_and(|c| c.is_ascii_digit()) {
        j += 1;
    }
    j
}

fn skip_spaces(chars: &[char], mut i: usize) -> usize {
    while at(chars, i).is_some_and(char::is_whitespace) {
        i += 1;
    }
    i
}

fn text_of(chars: &[char], a: usize, b: usize) -> String {
    chars[a..b].iter().collect()
}

/// Whether `word` (lowercase ASCII or Turkish) follows at i, case-insensitively.
fn literal_at(chars: &[char], i: usize, word: &str) -> bool {
    let mut j = i;
    for w in word.chars() {
        match at(chars, j) {
            Some(c) if c.to_lowercase().eq(w.to_lowercase()) => j += 1,
            _ => return false,
        }
    }
    true
}

/// A number as written with thousands dots and an optional comma fraction:
/// `1.250`, `1.250,75`, `12`, `12,5` -> (end, whole digits, fraction digits).
fn grouped_number(chars: &[char], i: usize) -> Option<(usize, String, Option<String>)> {
    let first = digits_end(chars, i);
    if first == i {
        return None;
    }
    let mut whole = text_of(chars, i, first);
    let mut j = first;
    if first - i <= 3 {
        while at(chars, j) == Some('.') && digits_end(chars, j + 1) == j + 4 {
            whole.push_str(&text_of(chars, j + 1, j + 4));
            j += 4;
        }
    }
    if at(chars, j) == Some(',') && digits_end(chars, j + 1) > j + 1 {
        let e = digits_end(chars, j + 1);
        return Some((e, whole, Some(text_of(chars, j + 1, e))));
    }
    Some((j, whole, None))
}

// ---------- numbers ----------

const ONES: [&str; 10] = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"];
const TENS: [&str; 10] = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"];
const VOWELS: &str = "aeıioöuüAEIİOÖUÜ";

pub fn number_to_words(n: u64) -> String {
    if n < 10 {
        return ONES[n as usize].to_string();
    }
    if n < 100 {
        let (t, o) = (n / 10, n % 10);
        return if o == 0 { TENS[t as usize].to_string() } else { format!("{} {}", TENS[t as usize], ONES[o as usize]) };
    }
    if n < 1000 {
        let (h, r) = (n / 100, n % 100);
        let prefix = if h == 1 { "yüz".to_string() } else { format!("{} yüz", ONES[h as usize]) };
        return if r == 0 { prefix } else { format!("{prefix} {}", number_to_words(r)) };
    }
    for (scale, label) in [(1_000_000_000_000u64, "trilyon"), (1_000_000_000, "milyar"), (1_000_000, "milyon"), (1_000, "bin")] {
        if n >= scale {
            let (count, r) = (n / scale, n % scale);
            let prefix = if scale == 1000 && count == 1 { label.to_string() } else { format!("{} {label}", number_to_words(count)) };
            return if r == 0 { prefix } else { format!("{prefix} {}", number_to_words(r)) };
        }
    }
    n.to_string()
}

fn parse(digits: &str) -> u64 {
    digits.parse().unwrap_or(0)
}

fn digit_sequence(value: &str) -> String {
    value.chars().filter_map(|d| d.to_digit(10)).map(|d| ONES[d as usize]).collect::<Vec<_>>().join(" ")
}

/// A digit group as a number, each leading zero voiced ("045" -> "sıfır kırk beş").
fn digit_group(value: &str) -> String {
    let stripped = value.trim_start_matches('0');
    let mut words = vec!["sıfır".to_string(); value.len() - stripped.len()];
    if !stripped.is_empty() {
        words.push(number_to_words(parse(stripped)));
    }
    words.join(" ")
}

/// "2,5" is "iki buçuk", "2,75" "iki virgül yetmiş beş"; longer fractions digit by digit.
fn decimal_words(whole: &str, fraction: &str) -> String {
    let w = number_to_words(parse(whole));
    if fraction == "5" && parse(whole) != 0 {
        return format!("{w} buçuk");
    }
    let f = if fraction.len() <= 2 { digit_group(fraction) } else { digit_sequence(fraction) };
    format!("{w} virgül {f}")
}

/// A number written as `1.250`, `1.250,75`, `12,5` or `12.5`.
fn numeric_words(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    if let Some((end, whole, fraction)) = grouped_number(&chars, 0) {
        if end == chars.len() && value.contains('.') && whole.len() > 3 {
            return match fraction {
                Some(f) => decimal_words(&whole, &f),
                None => number_to_words(parse(&whole)),
            };
        }
    }
    match value.split_once(['.', ',']) {
        Some((w, f)) => decimal_words(w, f),
        None => number_to_words(parse(value)),
    }
}

const ORDINAL_EXCEPTIONS: &[(&str, &str)] = &[
    ("bir", "birinci"), ("iki", "ikinci"), ("üç", "üçüncü"), ("dört", "dördüncü"), ("beş", "beşinci"),
    ("altı", "altıncı"), ("yedi", "yedinci"), ("sekiz", "sekizinci"), ("dokuz", "dokuzuncu"), ("on", "onuncu"),
    ("yirmi", "yirminci"), ("otuz", "otuzuncu"), ("kırk", "kırkıncı"), ("elli", "ellinci"), ("altmış", "altmışıncı"),
    ("yetmiş", "yetmişinci"), ("seksen", "sekseninci"), ("doksan", "doksanıncı"), ("yüz", "yüzüncü"),
    ("bin", "bininci"), ("milyon", "milyonuncu"), ("milyar", "milyarıncı"),
];

fn ordinal_words(n: u64) -> String {
    let cardinal = number_to_words(n);
    let (head, last) = cardinal.rsplit_once(' ').map_or(("", cardinal.as_str()), |(h, l)| (h, l));
    let ordinal = ORDINAL_EXCEPTIONS.iter().find(|(c, _)| *c == last).map_or(format!("{last}inci"), |(_, o)| o.to_string());
    if head.is_empty() { ordinal } else { format!("{head} {ordinal}") }
}

fn last_vowel(words: &str) -> char {
    words.chars().rev().find(|c| VOWELS.contains(*c)).unwrap_or('e')
}

/// "iki" -> "ikiye", "otuz" -> "otuza", "dört" -> "dörde".
fn with_dative(words: &str) -> String {
    if let Some(stem) = words.strip_suffix("dört") {
        return format!("{stem}dörde");
    }
    let vowel = if "aıou".contains(last_vowel(words)) { 'a' } else { 'e' };
    let buffer = if words.ends_with(|c: char| VOWELS.contains(c)) { "y" } else { "" };
    format!("{words}{buffer}{vowel}")
}

/// "dört" -> "dörtte", "on" -> "onda".
fn with_locative(words: &str) -> String {
    let vowel = if "aıou".contains(last_vowel(words)) { 'a' } else { 'e' };
    let consonant = if words.ends_with(|c: char| "çfhkpsşt".contains(c)) { 't' } else { 'd' };
    format!("{words}{consonant}{vowel}")
}

// ---------- tables ----------

const MONTHS: &[&str] = &["ocak", "şubat", "mart", "nisan", "mayıs", "haziran", "temmuz", "ağustos", "eylül", "ekim", "kasım", "aralık"];

const ABBREVIATIONS: &[(&str, &str)] = &[
    ("dr.", "doktor"), ("prof.", "profesör"), ("vb.", "ve benzeri"), ("vs.", "vesaire"), ("örn.", "örneğin"),
    ("no.", "numara"), ("mg", "miligram"), ("kg", "kilogram"), ("gr", "gram"), ("km", "kilometre"),
    ("cm", "santimetre"), ("mm", "milimetre"), ("lt", "litre"), ("ml", "mililitre"), ("kb", "kilobayt"),
    ("mb", "megabayt"), ("gb", "gigabayt"), ("tb", "terabayt"), ("tl", "lira"), ("doç.", "doçent"),
    ("uzm.", "uzman"), ("op.", "operatör"), ("yrd.", "yardımcı"), ("öğr. üyesi", "öğretim üyesi"),
    ("öğr. gör.", "öğretim görevlisi"), ("dt.", "diş hekimi"), ("dyt.", "diyetisyen"), ("psk.", "psikolog"),
    ("fzt.", "fizyoterapist"), ("hemş.", "hemşire"), ("ecz.", "eczacı"), ("av.", "avukat"), ("müh.", "mühendis"),
    ("hz.", "hazreti"), ("bkz.", "bakınız"), ("vd.", "ve diğerleri"), ("mah.", "mahallesi"), ("cad.", "caddesi"),
    ("cd.", "caddesi"), ("sok.", "sokak"), ("sk.", "sokak"), ("bul.", "bulvarı"), ("blv.", "bulvarı"),
    ("apt.", "apartmanı"), ("ltd. şti.", "limited şirketi"), ("şti.", "şirketi"),
];

/// Titles and address words stand before a name; at a sentence end the letters are a word ("düzene sok.").
const BEFORE_A_WORD: &[&str] = &[
    "doç.", "uzm.", "op.", "yrd.", "dt.", "dyt.", "psk.", "fzt.", "hemş.", "ecz.", "av.", "müh.", "hz.", "mah.",
    "cad.", "cd.", "sok.", "sk.", "bul.", "blv.", "apt.",
];

const NUMBER_UNITS: &[(&str, &str)] = &[
    ("m", "metre"), ("g", "gram"), ("cc", "sisi"), ("mcg", "mikrogram"), ("μg", "mikrogram"), ("IU", "ünite"),
    ("kcal", "kilokalori"), ("mmHg", "milimetre cıva"), ("dk", "dakika"), ("sn", "saniye"), ("sa", "saat"),
    ("ms", "milisaniye"), ("dl", "desilitre"),
];

const WEEKDAYS: &[(&str, &str)] = &[
    ("Pzt", "pazartesi"), ("Sal", "salı"), ("Çar", "çarşamba"), ("Per", "perşembe"), ("Cum", "cuma"),
    ("Cmt", "cumartesi"), ("Paz", "pazar"),
];
const DAY_NAMES: [&str; 7] = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"];

const ORDINAL_HEADS: &[&str] = &[
    "Dünya", "Lig", "Ordu", "Kolordu", "Tümen", "Dönem", "Meclis", "Kurultay", "Kongre", "Uluslararası", "Ulusal",
    "Olağan", "Olağanüstü", "Geleneksel", "Yıl", "Yüzyıl", "Sınıf", "Kat", "Blok", "Etap", "Bölge", "Asliye", "Ağır",
    "Sulh", "İcra", "Aile", "Selim", "Murat", "Murad", "Mehmet", "Mehmed", "Mahmut", "Mahmud", "Ahmet", "Ahmed",
    "Osman", "Bayezid", "Beyazıt", "Süleyman", "Mustafa", "Abdülhamid", "Abdülmecid", "Louis", "Henry", "Napolyon",
];

const CAPS_LEXICON: &[(&str, &str)] = &[
    ("MR", "emar"), ("SMS", "esemes"), ("NTV", "entivi"), ("YÖK", "yök"), ("BİM", "bim"), ("ŞOK", "şok"),
    ("COVID", "kovid"), ("MEB", "meb"), ("İTÜ", "itü"), ("IBAN", "iban"), ("İETT", "ietete"), ("ALO", "alo"),
    ("MİT", "mit"), ("OK", "okey"), ("TSH", "teseha"), ("MHRS", "meharese"), ("HES", "hes"), ("CEO", "siio"),
    ("PR", "piar"), ("DJ", "dijey"), ("TV", "tivi"), ("FBI", "efbiay"), ("CNN", "sienen"), ("VIP", "viaypi"),
    ("HD", "heyçdi"),
];

fn caps_lexicon(word: &str) -> Option<&'static str> {
    CAPS_LEXICON.iter().find(|(w, _)| *w == word).map(|(_, s)| *s)
}

const LETTER_NAMES: &[(char, &str)] = &[
    ('A', "a"), ('B', "be"), ('C', "ce"), ('Ç', "çe"), ('D', "de"), ('E', "e"), ('F', "fe"), ('G', "ge"),
    ('Ğ', "yumuşak ge"), ('H', "he"), ('I', "ı"), ('İ', "i"), ('J', "je"), ('K', "ke"), ('L', "le"), ('M', "me"),
    ('N', "ne"), ('O', "o"), ('Ö', "ö"), ('P', "pe"), ('R', "re"), ('S', "se"), ('Ş', "şe"), ('T', "te"),
    ('U', "u"), ('Ü', "ü"), ('V', "ve"), ('Y', "ye"), ('Z', "ze"), ('Q', "kü"), ('W', "dabılyu"), ('X', "iks"),
];

fn letter_name(c: char) -> &'static str {
    LETTER_NAMES.iter().find(|(l, _)| *l == c).map_or("", |(_, n)| *n)
}

/// Inside a spelled initialism K is "ka" and a plain I a foreign "i".
fn initialism_letter(c: char) -> &'static str {
    match c {
        'K' => "ka",
        'I' => "i",
        other => letter_name(other),
    }
}

/// `[a-zçğıöşü]`: a lowercase letter of Turkish text.
fn lower_letter(c: char) -> bool {
    c.is_ascii_lowercase() || "çğıöşü".contains(c)
}

fn caps_letter(c: char) -> bool {
    "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZQWX".contains(c)
}

/// Four or more letters, at least 30 % vowels, no run of three consonants.
fn pronounceable(word: &str) -> bool {
    let n = word.chars().count();
    if n < 4 {
        return false;
    }
    let vowels = word.chars().filter(|c| VOWELS.contains(*c)).count();
    let mut run = 0;
    for c in word.chars() {
        run = if "AEIİOÖUÜ".contains(c) { 0 } else { run + 1 };
        if run >= 3 {
            return false;
        }
    }
    vowels as f64 / n as f64 >= 0.3
}

/// A whole all-caps word (2 or more of the capitals the original lists) at i.
fn caps_word(chars: &[char], i: usize, min: usize, max: usize) -> Option<usize> {
    if !starts_word(chars, i) {
        return None;
    }
    let mut j = i;
    while at(chars, j).is_some_and(caps_letter) {
        j += 1;
    }
    (j - i >= min && j - i <= max && ends_word(chars, j)).then_some(j)
}

// ---------- case ----------

pub fn turkish_lower(text: &str) -> String {
    text.chars()
        .flat_map(|c| match c {
            'I' => vec!['ı'],
            'İ' => vec!['i'],
            '\u{0307}' => vec![],
            other => other.to_lowercase().collect(),
        })
        .collect()
}

fn turkish_upper(c: char) -> String {
    match c {
        'i' => "İ".into(),
        'ı' => "I".into(),
        other => other.to_uppercase().collect(),
    }
}

// ---------- orthography ----------

/// Compatibility forms folded the way NFKC does for the text a narration
/// holds: decomposed, then the letters Turkish and its loans use composed.
fn compatibility_fold(text: &str) -> String {
    let mut decomposed = String::with_capacity(text.len());
    for c in text.chars() {
        super::nfkd::decompose(&mut decomposed, c);
    }
    let mut out = String::with_capacity(decomposed.len());
    for c in decomposed.chars() {
        let composed = out.chars().last().and_then(|base| {
            let pair = match (base, c) {
                ('c', '\u{0327}') => 'ç', ('C', '\u{0327}') => 'Ç', ('s', '\u{0327}') => 'ş', ('S', '\u{0327}') => 'Ş',
                ('g', '\u{0306}') => 'ğ', ('G', '\u{0306}') => 'Ğ', ('o', '\u{0308}') => 'ö', ('O', '\u{0308}') => 'Ö',
                ('u', '\u{0308}') => 'ü', ('U', '\u{0308}') => 'Ü', ('I', '\u{0307}') => 'İ', ('a', '\u{0302}') => 'â',
                ('i', '\u{0302}') => 'î', ('u', '\u{0302}') => 'û', ('A', '\u{0302}') => 'Â', ('I', '\u{0302}') => 'Î',
                ('U', '\u{0302}') => 'Û', ('e', '\u{0301}') => 'é', ('a', '\u{0301}') => 'á', ('e', '\u{0300}') => 'è',
                ('a', '\u{0300}') => 'à', ('n', '\u{0303}') => 'ñ', ('a', '\u{0308}') => 'ä', ('i', '\u{0308}') => 'ï',
                _ => return None,
            };
            Some(pair)
        });
        match composed {
            Some(pair) => {
                out.pop();
                out.push(pair);
            }
            None => out.push(c),
        }
    }
    out
}

fn collapse_spaces(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_orthography(text: &str) -> String {
    let folded: String = compatibility_fold(text)
        .chars()
        .filter_map(|c| match c {
            '\u{2019}' | '\u{2018}' | '`' | '\u{00B4}' => Some('\''),
            '"' | '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{00AB}' | '\u{00BB}' => None,
            other => Some(other),
        })
        .collect();
    collapse_spaces(&folded.replace("''", ""))
}

// ---------- the rules, in the original's order ----------

/// Lowercase text written in capitals throughout ("RANDEVUNUZ ONAYLANDI").
fn lower_if_shouted(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let (mut words, mut capitals, mut spoken) = (0, 0, 0);
    let mut i = 0;
    while i < chars.len() {
        if letter(chars[i]) && starts_word(&chars, i) {
            let mut j = i;
            while at(&chars, j).is_some_and(letter) {
                j += 1;
            }
            if ends_word(&chars, j) && j - i >= 2 {
                words += 1;
                let w = text_of(&chars, i, j);
                if w.chars().all(caps_letter) {
                    capitals += 1;
                    spoken += pronounceable(&w) as usize;
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    if spoken >= 3 && capitals as f64 >= 0.7 * words as f64 { turkish_lower(text) } else { text.to_string() }
}

/// The Roman numerals the original reads (II to XX; a lone I, V or X is a letter).
const ROMANS: &[&str] = &["XX", "XIX", "XVIII", "XVII", "XVI", "XV", "XIV", "XIII", "XII", "XI", "IX", "VIII", "VII", "VI", "IV", "III", "II"];

fn roman_value(numeral: &str) -> u64 {
    let value = |c: char| match c {
        'I' => 1,
        'V' => 5,
        _ => 10,
    };
    let cs: Vec<char> = numeral.chars().collect();
    (0..cs.len()).fold(0i64, |t, i| if i + 1 < cs.len() && value(cs[i + 1]) > value(cs[i]) { t - value(cs[i]) } else { t + value(cs[i]) }) as u64
}

/// The first of the original's Roman numerals that matches at i as a whole word.
fn roman_at(chars: &[char], i: usize) -> Option<(usize, &'static str)> {
    if !starts_word(chars, i) {
        return None;
    }
    ROMANS
        .iter()
        .find(|r| r.chars().enumerate().all(|(k, c)| at(chars, i + k) == Some(c)) && ends_word(chars, i + r.len()))
        .map(|r| (i + r.len(), *r))
}

/// "II. Abdülhamid" -> "ikinci Abdülhamid"; "Warcraft III" -> "Warcraft üç".
fn replace_roman(text: &str) -> String {
    let ordinals = rewrite(text, |c, i| {
        let (end, value) = match roman_at(c, i) {
            Some((e, r)) => (e, roman_value(r)),
            None if c[i] == 'I' && starts_word(c, i) && at(c, i + 1) == Some('.') && {
                let j = skip_spaces(c, i + 2);
                j > i + 2 && literal_at(c, j, "Dünya")
            } => (i + 1, 1),
            None => return None,
        };
        if at(c, end) != Some('.') {
            return None;
        }
        let j = skip_spaces(c, end + 1);
        (j > end + 1 && at(c, j).is_some_and(|n| caps_letter(n) && n.is_uppercase())).then(|| (j, ordinal_words(value) + " "))
    });
    let chars: Vec<char> = ordinals.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        // a capitalised word, spaces, then a numeral that is not followed by a word
        if chars[i].is_uppercase() && caps_letter(chars[i]) && starts_word(&chars, i) {
            let mut j = i + 1;
            while at(&chars, j).is_some_and(letter) {
                j += 1;
            }
            let k = skip_spaces(&chars, j);
            if k > j {
                if let Some((e, r)) = roman_at(&chars, k) {
                    let tail_ok = {
                        let mut m = e;
                        if at(&chars, m).is_some_and(|c| c == '.' || c == '\'' || c == '\u{2019}') {
                            m += 1;
                        }
                        !at(&chars, m).is_some_and(letter)
                    };
                    if tail_ok {
                        out.push_str(&text_of(&chars, i, k));
                        out.push_str(&number_to_words(roman_value(r)));
                        i = e;
                        continue;
                    }
                }
            }
            out.push_str(&text_of(&chars, i, j));
            i = j;
            continue;
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

/// "ABD'DE" -> "ABD'de": the suffix after an apostrophe is lowercase.
fn lower_suffixes(text: &str) -> String {
    rewrite(text, |c, i| {
        if c[i] != '\'' || !at(c, i + 1).is_some_and(|n| caps_letter(n) && n.is_uppercase()) {
            return None;
        }
        let mut j = i + 1;
        while at(c, j).is_some_and(|n| caps_letter(n) && n.is_uppercase()) {
            j += 1;
        }
        ends_word(c, j).then(|| (j, format!("'{}", turkish_lower(&text_of(c, i + 1, j)))))
    })
}

/// "No: 12" -> "numara 12", "Tel:" -> "telefon:", "s. 45" -> "sayfa 45".
fn replace_labels(text: &str) -> String {
    rewrite(text, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        if literal_at(c, i, "no") && ends_word(c, i + 2) {
            let j = skip_spaces(c, i + 2);
            if at(c, j).is_some_and(|p| p == ':' || p == '.') {
                let k = skip_spaces(c, j + 1);
                if at(c, k).is_some_and(|d| d.is_ascii_digit()) {
                    return Some((k, "numara ".into()));
                }
            }
        }
        if c[i..].starts_with(&['T', 'e', 'l']) && ends_word(c, i + 3) {
            let j = skip_spaces(c, i + 3);
            if at(c, j) == Some(':') {
                return Some((j + 1, "telefon:".into()));
            }
        }
        if c[i] == 's' && at(c, i + 1) == Some('.') {
            let j = skip_spaces(c, i + 2);
            if at(c, j).is_some_and(|d| d.is_ascii_digit()) {
                return Some((j, "sayfa ".into()));
            }
        }
        None
    })
}

const ADDRESS_WORDS: &[(&str, &str)] = &[
    ("www", "dabılyu dabılyu dabılyu"), ("com", "kom"), ("net", "net"), ("org", "org"), ("gov", "gov"),
    ("info", "info"), ("gmail", "cimeyl"), ("hotmail", "hotmeyl"), ("outlook", "autluk"), ("yahoo", "yahu"),
    ("icloud", "ayklaud"),
];
const TLDS: &[&str] = &["com", "net", "org", "gov", "edu", "info", "io", "ai", "tr"];

/// An e-mail or web address at i: its end.
fn address_at(chars: &[char], i: usize) -> Option<usize> {
    if !starts_word(chars, i) || !word_char(chars[i]) {
        return None;
    }
    let is_part = |c: char| word_char(c) || c == '-';
    let mut j = i;
    while at(chars, j).is_some_and(|c| is_part(c) || ".+/:@".contains(c)) {
        j += 1;
    }
    while j > i && at(chars, j - 1).is_some_and(|c| c == '.' || c == '/' || c == ':') && !text_of(chars, i, j).ends_with("://") {
        j -= 1;
    }
    let candidate = text_of(chars, i, j);
    if let Some((user, domain)) = candidate.split_once('@') {
        let ok = !user.is_empty() && domain.contains('.') && domain.split('.').all(|p| !p.is_empty() && p.chars().all(is_part));
        return ok.then_some(j);
    }
    let host = candidate.trim_start_matches("https://").trim_start_matches("http://");
    let host = host.split('/').next().unwrap_or("");
    let labels: Vec<&str> = host.split('.').collect();
    let ok = labels.len() >= 2
        && labels.iter().all(|l| !l.is_empty() && l.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'))
        && TLDS.contains(&labels.last().unwrap_or(&"").to_ascii_lowercase().as_str());
    ok.then_some(j)
}

/// Read an address piece by piece: "www.ornek.com.tr" -> "dabılyu ... nokta ornek nokta kom nokta te re".
fn read_address(address: &str) -> String {
    let lower = address.to_ascii_lowercase();
    let body = lower.strip_prefix("https://").or_else(|| lower.strip_prefix("http://")).map_or(address, |_| &address[address.find("://").map_or(0, |p| p + 3)..]);
    let body = body.trim_end_matches('/');
    let mut spoken = Vec::new();
    let mut piece = String::new();
    let flush = |piece: &mut String, spoken: &mut Vec<String>| {
        if piece.is_empty() {
            return;
        }
        let lower = piece.to_lowercase();
        if let Some((_, say)) = ADDRESS_WORDS.iter().find(|(w, _)| *w == lower) {
            spoken.push(say.to_string());
        } else if lower.chars().count() <= 2 && lower.chars().all(letter) {
            spoken.push(turkish_lower(&lower).chars().map(|c| letter_name(turkish_upper(c).chars().next().unwrap_or(c))).collect::<Vec<_>>().join(" "));
        } else {
            spoken.push(piece.clone());
        }
        piece.clear();
    };
    for c in body.chars() {
        let mark = match c {
            '.' => Some("nokta"),
            '@' => Some("et"),
            '/' => Some("bölü"),
            '_' => Some("alt tire"),
            '-' => Some("tire"),
            _ => None,
        };
        match mark {
            Some(m) => {
                flush(&mut piece, &mut spoken);
                spoken.push(m.to_string());
            }
            None => piece.push(c),
        }
    }
    flush(&mut piece, &mut spoken);
    spoken.join(" ")
}

fn replace_addresses(text: &str) -> String {
    rewrite(text, |c, i| address_at(c, i).map(|end| (end, read_address(&text_of(c, i, end)))))
}

/// Emoji, markdown emphasis, bullets and a hashtag's # are only seen; ° + = & are said.
fn replace_symbols(text: &str) -> String {
    let said = rewrite(text, |c, i| {
        let prev_digit = before(c, i).is_some_and(|p| p.is_ascii_digit());
        let after_space_digit = |j: usize| {
            let k = if at(c, j) == Some(' ') { j + 1 } else { j };
            at(c, k).is_some_and(|d| d.is_ascii_digit()).then_some(k)
        };
        match c[i] {
            ' ' | '°' if prev_digit => {
                // \s?°\s?C?, not followed by a letter
                let mut j = i;
                if c[j] == ' ' {
                    j += 1;
                }
                if at(c, j) != Some('°') {
                    return None;
                }
                j += 1;
                [(true, true), (false, true), (true, false), (false, false)].iter().find_map(|&(space, celsius)| {
                    let mut k = j;
                    if space {
                        if at(c, k) != Some(' ') {
                            return None;
                        }
                        k += 1;
                    }
                    if celsius {
                        if at(c, k) != Some('C') {
                            return None;
                        }
                        k += 1;
                    }
                    (!at(c, k).is_some_and(letter)).then(|| (k, " derece".to_string()))
                })
            }
            '+' => {
                let lead_digit = before(c, i).is_some_and(|p| p.is_ascii_digit()) || (before(c, i) == Some(' ') && i >= 2 && c[i - 2].is_ascii_digit());
                if lead_digit && after_space_digit(i + 1).is_some() {
                    Some((after_space_digit(i + 1).unwrap_or(i + 1), " artı ".into()))
                } else if before(c, i).is_some_and(char::is_whitespace) && at(c, i + 1).is_some_and(char::is_whitespace) {
                    Some((i + 1, " artı ".into()))
                } else {
                    None
                }
            }
            '=' if before(c, i).is_some_and(|p| p.is_ascii_digit() || p.is_whitespace()) && at(c, i + 1).is_some_and(|n| n.is_ascii_digit() || n.is_whitespace()) => {
                Some((i + 1, " eşittir ".into()))
            }
            '#' if !before(c, i).is_some_and(|p| word_char(p) || p == '&') && at(c, i + 1).is_some_and(letter) => Some((i + 1, "heşteg ".into())),
            '*' => Some((i + 1, String::new())),
            '_' if at(c, i + 1) == Some('_') => {
                let mut j = i;
                while at(c, j) == Some('_') {
                    j += 1;
                }
                Some((j, String::new()))
            }
            '&' => Some((i + 1, " ve ".into())),
            '•' | '▪' | '►' | '→' | '⇒' => Some((i + 1, " , ".into())),
            _ => None,
        }
    });
    said.chars().filter(|&c| !is_symbol_only(c)).collect()
}

/// Emoji, pictographs, dingbats and private-use characters (Unicode So / Co).
fn is_symbol_only(c: char) -> bool {
    matches!(c as u32,
        0x2190..=0x21FF | 0x2300..=0x23FF | 0x2460..=0x24FF | 0x2500..=0x27BF | 0x2900..=0x297F
        | 0x2B00..=0x2BFF | 0x3297 | 0x3299 | 0xE000..=0xF8FF | 0xFE0F | 0x200D | 0x1F000..=0x1FAFF
        | 0x00A9 | 0x00AE | 0x2122)
}

/// "T.C." -> "tece", "A.B.D." -> "abede".
fn replace_dotted_initialisms(text: &str) -> String {
    rewrite(text, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        let mut j = i;
        let mut letters = String::new();
        while at(c, j).is_some_and(|l| "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".contains(l)) && at(c, j + 1) == Some('.') {
            letters.push_str(initialism_letter(c[j]));
            j += 2;
        }
        (j - i >= 4).then_some((j, letters))
    })
}

const DOSE_WORDS: &[&str] = &["tablet", "kapsül", "şurup", "ölçek", "damla", "doz", "puf", "kaşık", "ampul", "draje", "saşe", "fitil", "iğne"];

/// "3x4" is "üçe dört"; "günde 2x1 tablet" is "günde iki defa bir".
fn replace_times(text: &str) -> String {
    rewrite(text, |c, i| {
        let daily = literal_at(c, i, "günde") && starts_word(c, i) && {
            let j = skip_spaces(c, i + 5);
            j > i + 5 && at(c, j).is_some_and(|d| d.is_ascii_digit())
        };
        let start = if daily { skip_spaces(c, i + 5) } else { i };
        if !daily && !(c[i].is_ascii_digit() && starts_word(c, i)) {
            return None;
        }
        let a = digits_end(c, start);
        let mut j = a;
        if at(c, j) == Some(' ') {
            j += 1;
        }
        if !at(c, j).is_some_and(|x| x == 'x' || x == 'X' || x == '×') {
            return None;
        }
        j += 1;
        if at(c, j) == Some(' ') {
            j += 1;
        }
        let b = digits_end(c, j);
        if b == j || !ends_word(c, b) {
            return None;
        }
        let (first, second) = (number_to_words(parse(&text_of(c, start, a))), number_to_words(parse(&text_of(c, j, b))));
        let rest = skip_spaces(c, b);
        let dose = DOSE_WORDS.iter().any(|w| literal_at(c, rest, w));
        Some(if daily || dose {
            (b, format!("{}{first} defa {second}", text_of(c, i, start)))
        } else {
            (b, format!("{} {second}", with_dative(&first)))
        })
    })
}

/// A number (with a decimal comma) that no digit, dot or comma comes right before.
fn bare_number(c: &[char], i: usize) -> Option<(usize, String)> {
    if !c[i].is_ascii_digit() || before(c, i).is_some_and(|p| p.is_ascii_digit() || p == '.' || p == ',') {
        return None;
    }
    let mut j = digits_end(c, i);
    if at(c, j) == Some(',') && digits_end(c, j + 1) > j + 1 {
        j = digits_end(c, j + 1);
    }
    Some((j, text_of(c, i, j)))
}

/// "90 km/s" -> "saatte doksan kilometre"; "m2" -> "metrekare"; "5 kg" -> "5 kilogram".
fn replace_units(text: &str) -> String {
    let speeds = rewrite(text, |c, i| {
        let (end, number) = bare_number(c, i)?;
        let mut j = end;
        if at(c, j) == Some(' ') {
            j += 1;
        }
        if !c[j..].starts_with(&['k', 'm', '/']) {
            return None;
        }
        let k = j + 3;
        let unit_end = if c[k..].starts_with(&['s', 'a']) { k + 2 } else if at(c, k).is_some_and(|u| u == 's' || u == 'h') { k + 1 } else { return None };
        ends_word(c, unit_end).then(|| (unit_end, format!("saatte {} kilometre", numeric_words(&number))))
    });
    let areas = rewrite(&speeds, |c, i| {
        if !before(c, i).is_some_and(|p| p.is_ascii_digit()) && !(c[i] == ' ' && before(c, i).is_some_and(|p| p.is_ascii_digit())) {
            return None;
        }
        let j = if c[i] == ' ' { i + 1 } else { i };
        for (unit, name) in [("km", "kilometre"), ("cm", "santimetre"), ("m", "metre")] {
            let u: Vec<char> = unit.chars().collect();
            if c[j..].starts_with(&u) {
                let p = j + u.len();
                if let Some(power @ ('2' | '3')) = at(c, p) {
                    if !at(c, p + 1).is_some_and(word_char) {
                        return Some((p + 1, format!(" {name}{}", if power == '2' { "kare" } else { "küp" })));
                    }
                }
            }
        }
        None
    });
    let units = rewrite(&areas, |c, i| {
        let after_digit = before(c, i).is_some_and(|p| p.is_ascii_digit()) || (c[i] == ' ' && before(c, i).is_some_and(|p| p.is_ascii_digit()));
        if !after_digit {
            return None;
        }
        let j = if c[i] == ' ' { i + 1 } else { i };
        NUMBER_UNITS
            .iter()
            .filter(|(u, _)| c[j..].starts_with(&u.chars().collect::<Vec<_>>()))
            .map(|(u, name)| (j + u.chars().count(), *name))
            .filter(|(e, _)| !at(c, *e).is_some_and(|n| word_char(n) || n == '/'))
            .max_by_key(|(e, _)| *e)
            .map(|(e, name)| (e, format!(" {name}")))
    });
    rewrite(&units, |c, i| {
        if c[i] != ' ' || !before(c, i).is_some_and(|p| p.is_ascii_digit()) || at(c, i + 1) != Some('L') || !ends_word(c, i + 2) {
            return None;
        }
        let next = at(c, i + 2);
        let then_digit = at(c, skip_spaces(c, i + 2)).is_some_and(|d| d.is_ascii_digit());
        (!matches!(next, Some('/' | '\'' | '\u{2019}')) && !then_digit).then(|| (i + 2, " litre".into()))
    })
}

/// "Pzt" -> "pazartesi"; "pazartesi-cuma" -> "pazartesi ile cuma".
fn replace_weekdays(text: &str) -> String {
    let named = rewrite(text, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        WEEKDAYS.iter().find_map(|(abbr, day)| {
            let a: Vec<char> = abbr.chars().collect();
            if !c[i..].starts_with(&a) || !ends_word(c, i + a.len()) {
                return None;
            }
            let mut j = i + a.len();
            if at(c, j) == Some('.') {
                j += 1;
            }
            let k = skip_spaces(c, j);
            let ok = k >= c.len() || matches!(c[k], '-' | '–' | ',' | '/') || c[k].is_ascii_digit();
            ok.then(|| (j, day.to_string()))
        })
    });
    rewrite(&named, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        let first = DAY_NAMES.iter().filter(|d| literal_at(c, i, d) && ends_word(c, i + d.chars().count())).max_by_key(|d| d.len())?;
        let a = i + first.chars().count();
        let j = skip_spaces(c, a);
        if !at(c, j).is_some_and(|d| d == '-' || d == '–') {
            return None;
        }
        let k = skip_spaces(c, j + 1);
        let second = DAY_NAMES.iter().filter(|d| literal_at(c, k, d) && ends_word(c, k + d.chars().count())).max_by_key(|d| d.len())?;
        let e = k + second.chars().count();
        Some((e, format!("{} ile {}", text_of(c, i, a), text_of(c, k, e))))
    })
}

fn currency_words(symbol: char, whole: &str, fraction: Option<&str>) -> String {
    let (unit, sub) = match symbol {
        '₺' => ("lira", "kuruş"),
        '$' => ("dolar", "sent"),
        '€' => ("avro", "sent"),
        _ => ("sterlin", "peni"),
    };
    let mut value = format!("{} {unit}", number_to_words(parse(&whole.replace('.', ""))));
    if let Some(f) = fraction.filter(|f| parse(f) != 0) {
        value.push_str(&format!(" {} {sub}", number_to_words(parse(&format!("{f:0<2}")))));
    }
    value
}

/// A whole amount as written: `\d{1,3}(\.\d{3})+` or `\d+`, as (end, digits).
fn amount_whole(c: &[char], i: usize) -> Option<(usize, String)> {
    let first = digits_end(c, i);
    if first == i {
        return None;
    }
    let mut j = first;
    let mut digits = text_of(c, i, first);
    if first - i <= 3 {
        while at(c, j) == Some('.') && digits_end(c, j + 1) >= j + 4 {
            digits.push_str(&text_of(c, j + 1, j + 4));
            j += 4;
        }
    }
    Some((j, digits))
}

/// "₺12,50" and "12,50 TL" are "on iki lira elli kuruş".
fn replace_currency(text: &str) -> String {
    let symbol_first = rewrite(text, |c, i| {
        let symbol = c[i];
        if !"₺$€£".contains(symbol) {
            return None;
        }
        let (mut e, whole) = amount_whole(c, skip_spaces(c, i + 1))?;
        let mut fraction = None;
        if at(c, e).is_some_and(|s| s == ',' || s == '.') && at(c, e + 1).is_some_and(|d| d.is_ascii_digit()) {
            let f = (e + 3).min(digits_end(c, e + 1));
            fraction = Some(text_of(c, e + 1, f));
            e = f;
        }
        Some((e, currency_words(symbol, &whole, fraction.as_deref())))
    });
    rewrite(&symbol_first, |c, i| {
        if !c[i].is_ascii_digit() || before(c, i).is_some_and(|p| p.is_ascii_digit() || p == '.' || p == ',') {
            return None;
        }
        let (end, whole) = amount_whole(c, i)?;
        let symbol_at = |j: usize| -> Option<(usize, char)> {
            let j = if at(c, j) == Some(' ') { j + 1 } else { j };
            match at(c, j) {
                Some(s @ ('₺' | '$' | '€' | '£')) => Some((j + 1, s)),
                _ => [("TL", '₺'), ("USD", '$'), ("EUR", '€'), ("GBP", '£')]
                    .iter()
                    .find(|(code, _)| c[j..].starts_with(&code.chars().collect::<Vec<_>>()) && ends_word(c, j + code.len()))
                    .map(|(code, s)| (j + code.len(), *s)),
            }
        };
        // with a ,dd fraction if one is there and the symbol follows it, else without
        let with_fraction = (at(c, end) == Some(',')).then(|| {
            let f = digits_end(c, end + 1);
            (f > end + 1 && f - end - 1 <= 2).then(|| symbol_at(f).map(|(e, s)| (e, s, Some(text_of(c, end + 1, f))))).flatten()
        }).flatten();
        let (e, s, fraction) = with_fraction.or_else(|| symbol_at(end).map(|(e, s)| (e, s, None)))?;
        Some((e, currency_words(s, &whole, fraction.as_deref())))
    })
}

/// Letters inside a code ("34KAB123") are read one by one; then letters and digits come apart.
fn split_codes(text: &str) -> String {
    let codes = rewrite(text, |c, i| {
        if !caps_letter(c[i]) || !c[i].is_uppercase() {
            return None;
        }
        let mut j = i;
        while at(c, j).is_some_and(|l| caps_letter(l) && l.is_uppercase()) && j - i < 6 {
            j += 1;
        }
        let glued_after = before(c, i).is_some_and(|p| p.is_ascii_digit()) && (at(c, j).is_some_and(|d| d.is_ascii_digit()) || ends_word(c, j));
        let glued_before = starts_word(c, i) && at(c, j).is_some_and(|d| d.is_ascii_digit());
        let spaced = j - i >= 2 && before(c, i) == Some(' ') && i >= 2 && c[i - 2].is_ascii_digit() && at(c, j) == Some(' ') && at(c, j + 1).is_some_and(|d| d.is_ascii_digit());
        if !(glued_after || glued_before || spaced) || at(c, j).is_some_and(|l| caps_letter(l) && l.is_uppercase()) {
            return None;
        }
        let word = text_of(c, i, j);
        Some(if caps_lexicon(&word).is_some() || pronounceable(&word) {
            (j, word)
        } else {
            (j, format!(" {} ", word.chars().map(initialism_letter).collect::<Vec<_>>().join(" ")))
        })
    });
    let apart = rewrite(&codes, |c, i| {
        let split = (before(c, i).is_some_and(letter) && c[i].is_ascii_digit()) || (before(c, i).is_some_and(|p| p.is_ascii_digit()) && letter(c[i]));
        split.then(|| (i + 1, format!(" {}", c[i])))
    });
    let dashes = rewrite(&apart, |c, i| (c[i] == '-' && before(c, i).is_some_and(letter) && at(c, i + 1).is_some_and(|d| d.is_ascii_digit())).then(|| (i + 1, " ".into())));
    // a lone capital beside a number is read by its name ("A 4", "5 G")
    rewrite(&dashes, |c, i| {
        if !caps_letter(c[i]) || !c[i].is_uppercase() || !starts_word(c, i) || !ends_word(c, i + 1) {
            return None;
        }
        let next_number = at(c, i + 1) == Some(' ') && at(c, i + 2).is_some_and(|d| d.is_ascii_digit());
        let prev_number = before(c, i) == Some(' ') && i >= 2 && c[i - 2].is_ascii_digit();
        (next_number || prev_number).then(|| (i + 1, letter_name(c[i]).to_string()))
    })
}

fn date_words(day: &str, month: &str, year: &str) -> Option<String> {
    let (d, m) = (parse(day), parse(month));
    ((1..=31).contains(&d) && (1..=12).contains(&m)).then(|| format!("{} {} {}", number_to_words(d), MONTHS[m as usize - 1], number_to_words(parse(year))))
}

/// "14.10.2026" and "2026-10-14" -> "on dört ekim iki bin yirmi altı".
fn replace_dates(text: &str) -> String {
    rewrite(text, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        if (1..=2).contains(&(a - i)) && at(c, a).is_some_and(|s| ".-/".contains(s)) {
            let b = digits_end(c, a + 1);
            if (1..=2).contains(&(b - a - 1)) && at(c, b).is_some_and(|s| ".-/".contains(s)) {
                let y = digits_end(c, b + 1);
                if y - b - 1 == 4 && ends_word(c, y) {
                    return date_words(&text_of(c, i, a), &text_of(c, a + 1, b), &text_of(c, b + 1, y)).map(|w| (y, w));
                }
            }
        }
        if a - i == 4 && at(c, a) == Some('-') {
            let b = digits_end(c, a + 1);
            if (1..=2).contains(&(b - a - 1)) && at(c, b) == Some('-') {
                let d = digits_end(c, b + 1);
                if (1..=2).contains(&(d - b - 1)) && ends_word(c, d) {
                    let (year, month, day) = (text_of(c, i, a), text_of(c, a + 1, b), text_of(c, b + 1, d));
                    return Some((d, date_words(&day, &month, &year).unwrap_or(format!("{year}-{month}-{day}"))));
                }
            }
        }
        None
    })
}

/// "%25" and "25 %" -> "yüzde yirmi beş".
fn replace_percent(text: &str) -> String {
    let leading = rewrite(text, |c, i| {
        if c[i] != '%' {
            return None;
        }
        let j = skip_spaces(c, i + 1);
        let e = digits_end(c, j);
        if e == j {
            return None;
        }
        let mut end = e;
        if at(c, e).is_some_and(|s| s == ',' || s == '.') && digits_end(c, e + 1) > e + 1 {
            end = digits_end(c, e + 1);
        }
        Some((end, format!("yüzde {}", numeric_words(&text_of(c, j, end)))))
    });
    rewrite(&leading, |c, i| {
        let (end, number) = bare_number(c, i)?;
        let mut j = end;
        if at(c, j) == Some(' ') {
            j += 1;
        }
        (at(c, j) == Some('%')).then(|| (j + 1, format!("yüzde {}", numeric_words(&number))))
    })
}

/// "3-5 gün" -> "3 ile 5 gün"; a season "2003-04" or a score "3-1" are not ranges.
fn replace_ranges(text: &str) -> String {
    rewrite(text, |c, i| {
        if !c[i].is_ascii_digit() || before(c, i).is_some_and(|p| p.is_ascii_digit() || p == '-' || p == '–') {
            return None;
        }
        let number_end = |mut j: usize| {
            while at(c, j).is_some_and(|d| d.is_ascii_digit() || d == '.' || d == ':' || d == ',') {
                j += 1;
            }
            j
        };
        let a = number_end(i);
        let j = skip_spaces(c, a);
        if !at(c, j).is_some_and(|d| d == '-' || d == '–') {
            return None;
        }
        let k = skip_spaces(c, j + 1);
        if !at(c, k).is_some_and(|d| d.is_ascii_digit()) {
            return None;
        }
        let b = number_end(k);
        if at(c, b).is_some_and(|d| d.is_ascii_digit() || d == '-' || d == '–') {
            return None;
        }
        let (start, end) = (text_of(c, i, a), text_of(c, k, b));
        let digits = |s: &str| s.chars().all(|d| d.is_ascii_digit());
        if start.len() == 4 && end.len() == 2 && digits(&start) && digits(&end) && parse(&end) == (parse(&start) + 1) % 100 {
            return Some((b, format!("{start} {}", parse(&end))));
        }
        if digits(&start) && digits(&end) && parse(&start) > parse(&end) {
            return Some((b, format!("{start} {end}")));
        }
        Some((b, format!("{start} ile {end}")))
    })
}

/// "-5" -> "eksi 5" unless the dash joins a word or a number before it.
fn replace_minus(text: &str) -> String {
    rewrite(text, |c, i| {
        (c[i] == '-' && at(c, i + 1).is_some_and(|d| d.is_ascii_digit()) && !before(c, i).is_some_and(|p| word_char(p) || ".,:)]".contains(p)))
            .then(|| (i + 1, "eksi ".into()))
    })
}

/// "1:05:30" is a duration; "14:30" and "14.30" are times of day.
fn replace_clock(text: &str) -> String {
    let durations = rewrite(text, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        if a - i > 2 || at(c, a) != Some(':') {
            return None;
        }
        let b = digits_end(c, a + 1);
        if b - a - 1 != 2 || at(c, b) != Some(':') || c[a + 1] > '5' {
            return None;
        }
        let s = digits_end(c, b + 1);
        if s - b - 1 != 2 || c[b + 1] > '5' || !ends_word(c, s) {
            return None;
        }
        let (h, m, sec) = (parse(&text_of(c, i, a)), parse(&text_of(c, a + 1, b)), parse(&text_of(c, b + 1, s)));
        let mut parts: Vec<String> = [(h, "saat"), (m, "dakika")].iter().filter(|(v, _)| *v != 0).map(|(v, u)| format!("{} {u}", number_to_words(*v))).collect();
        if sec != 0 || parts.is_empty() {
            parts.push(format!("{} saniye", number_to_words(sec)));
        }
        Some((s, parts.join(" ")))
    });
    rewrite(&durations, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        if a - i > 2 || !at(c, a).is_some_and(|s| s == ':' || s == '.') {
            return None;
        }
        let hour = parse(&text_of(c, i, a));
        let b = digits_end(c, a + 1);
        if hour > 23 || b - a - 1 != 2 || c[a + 1] > '5' || !ends_word(c, b) {
            return None;
        }
        let minute = text_of(c, a + 1, b);
        let words = number_to_words(hour);
        Some((b, if parse(&minute) == 0 {
            words
        } else {
            format!("{words} {}", if minute.starts_with('0') { digit_sequence(&minute) } else { number_to_words(parse(&minute)) })
        }))
    })
}

/// "3/4" -> "dörtte üç"; "7/24" is read number by number; other pairs "bölü".
fn replace_slashes(text: &str) -> String {
    rewrite(text, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        if at(c, a) != Some('/') {
            return None;
        }
        let b = digits_end(c, a + 1);
        if b == a + 1 || !ends_word(c, b) {
            return None;
        }
        let (n, d) = (text_of(c, i, a), text_of(c, a + 1, b));
        if n.len() <= 2 && d.len() <= 2 {
            let (nv, dv) = (parse(&n), parse(&d));
            if 0 < nv && nv < dv && dv <= 10 {
                return Some((b, format!("{} {}", with_locative(&number_to_words(dv)), number_to_words(nv))));
            }
            if (nv, dv) == (7, 24) || (nv, dv) == (24, 7) {
                return Some((b, format!("{} {}", number_to_words(nv), number_to_words(dv))));
            }
            return Some((b, format!("{} bölü {}", number_to_words(nv), number_to_words(dv))));
        }
        Some((b, format!("{n} bölü {d}")))
    })
}

/// "1.250,75" -> words; "3,14" and "2.5" -> words.
fn replace_decimals(text: &str) -> String {
    let grouped = rewrite(text, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        let (end, whole, fraction) = grouped_number(c, i)?;
        let written = text_of(c, i, end);
        (written.contains('.') && ends_word(c, end)).then(|| {
            (end, match fraction {
                Some(f) => decimal_words(&whole, &f),
                None => number_to_words(parse(&whole)),
            })
        })
    });
    rewrite(&grouped, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        if !at(c, a).is_some_and(|s| s == ',' || s == '.') {
            return None;
        }
        let b = digits_end(c, a + 1);
        (b > a + 1 && ends_word(c, b)).then(|| (b, decimal_words(&text_of(c, i, a), &text_of(c, a + 1, b))))
    })
}

const ORDINAL_SUFFIXES: &[&str] = &["inci", "ıncı", "üncü", "uncu", "nci", "ncı", "ncü", "ncu"];

/// "12'nci", "2.si", "3. kat", "5. Uluslararası" are ordinals; "numaranız 12." is not.
fn replace_ordinals(text: &str) -> String {
    let suffixed = rewrite(text, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        let j = if at(c, a) == Some('\'') { a + 1 } else { a };
        ORDINAL_SUFFIXES
            .iter()
            .find(|s| literal_at(c, j, s) && ends_word(c, j + s.chars().count()))
            .map(|s| (j + s.chars().count(), ordinal_words(parse(&text_of(c, i, a)))))
    });
    let glued = rewrite(&suffixed, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        (at(c, a) == Some('.') && at(c, a + 1).is_some_and(|l| lower_letter(l)))
            .then(|| (a + 1, ordinal_words(parse(&text_of(c, i, a)))))
    });
    rewrite(&glued, |c, i| {
        if !starts_word(c, i) || !('1'..='9').contains(&c[i]) {
            return None;
        }
        let a = digits_end(c, i);
        if at(c, a) != Some('.') {
            return None;
        }
        let j = skip_spaces(c, a + 1);
        if j == a + 1 {
            return None;
        }
        let lower = at(c, j).is_some_and(|l| lower_letter(l));
        let head = ORDINAL_HEADS.iter().any(|h| c[j..].starts_with(&h.chars().collect::<Vec<_>>()) && ends_word(c, j + h.chars().count()));
        (lower || head).then(|| (a + 1, ordinal_words(parse(&text_of(c, i, a)))))
    })
}

/// Long digit runs digit by digit, a leading zero voiced, the rest as numbers.
fn replace_integers(text: &str) -> String {
    rewrite(text, |c, i| {
        if !starts_word(c, i) || !c[i].is_ascii_digit() {
            return None;
        }
        let a = digits_end(c, i);
        if !ends_word(c, a) {
            return None;
        }
        let digits = text_of(c, i, a);
        Some((a, if digits.len() >= 5 {
            digit_sequence(&digits)
        } else if digits.starts_with('0') && digits.len() > 1 {
            digit_group(&digits)
        } else {
            number_to_words(parse(&digits))
        }))
    })
}

/// "MB/sn" -> "MB bölü saniye", "mg/kg" -> "mg bölü kg", "Sn. Ayşe" -> "sayın Ayşe".
fn replace_rates(text: &str) -> String {
    let per = rewrite(text, |c, i| {
        if c[i] != '/' || !before(c, i).is_some_and(word_char) {
            return None;
        }
        [("sn", "saniye"), ("sa", "saat"), ("dk", "dakika")]
            .iter()
            .find(|(u, _)| literal_at(c, i + 1, u) && ends_word(c, i + 3))
            .map(|(_, name)| (i + 3, format!(" bölü {name}")))
    });
    let units = rewrite(&per, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        let first = ["mg", "kg", "km", "cm", "ml", "g", "m"].iter().find(|u| c[i..].starts_with(&u.chars().collect::<Vec<_>>()) && at(c, i + u.len()) == Some('/'))?;
        let j = i + first.len() + 1;
        let second = ["saat", "gün", "kg", "ml", "lt", "g", "m", "l"].iter().find(|u| c[j..].starts_with(&u.chars().collect::<Vec<_>>()) && ends_word(c, j + u.chars().count()))?;
        Some((j + second.chars().count(), format!("{first} bölü {second}")))
    });
    rewrite(&units, |c, i| {
        if !starts_word(c, i) || !c[i..].starts_with(&['S', 'n', '.']) {
            return None;
        }
        let j = skip_spaces(c, i + 3);
        at(c, j).is_some_and(|n| n.is_uppercase()).then(|| (j, "sayın ".into()))
    })
}

fn replace_abbreviations(text: &str) -> String {
    let mut table: Vec<&(&str, &str)> = ABBREVIATIONS.iter().collect();
    table.sort_by_key(|(a, _)| std::cmp::Reverse(a.chars().count()));
    let mut text = text.to_string();
    for (abbreviation, expansion) in table {
        let a: Vec<char> = abbreviation.chars().collect();
        let matches = |c: &[char], i: usize| {
            !before(c, i).is_some_and(word_char) && a.iter().enumerate().all(|(k, w)| at(c, i + k).is_some_and(|x| x.to_lowercase().eq(w.to_lowercase())))
        };
        if abbreviation.ends_with('.') {
            // the full stop ends the abbreviation, so "Dr.Ayşe" expands too
            text = rewrite(&text, |c, i| {
                if !matches(c, i) {
                    return None;
                }
                let j = skip_spaces(c, i + a.len());
                at(c, j).is_some_and(word_char).then(|| (j, format!("{expansion} ")))
            });
            if BEFORE_A_WORD.contains(abbreviation) {
                continue;
            }
            text = rewrite(&text, |c, i| matches(c, i).then(|| (i + a.len(), expansion.to_string())));
        } else {
            text = rewrite(&text, |c, i| (matches(c, i) && !at(c, i + a.len()).is_some_and(word_char)).then(|| (i + a.len(), expansion.to_string())));
        }
    }
    text
}

/// "SGK" -> "segeka", "NATO" stays a word, "TV" -> "tivi".
fn replace_initialisms(text: &str) -> String {
    rewrite(text, |c, i| {
        let end = caps_word(c, i, 2, 6)?;
        let word = text_of(c, i, end);
        Some((end, match caps_lexicon(&word) {
            Some(say) => say.to_string(),
            None if pronounceable(&word) => word,
            None => word.chars().map(initialism_letter).collect(),
        }))
    })
}

/// A lone capital is a letter ("D vitamini", "C blok", "Ahmet K.").
fn replace_lone_letters(text: &str) -> String {
    rewrite(text, |c, i| {
        let l = c[i];
        if !caps_letter(l) || !l.is_uppercase() || before(c, i).is_some_and(|p| word_char(p) || ".'-".contains(p)) {
            return None;
        }
        let mut end = i + 1;
        let initial_stop = at(c, end) == Some('.') && {
            let j = skip_spaces(c, end + 1);
            j > end + 1 && at(c, j).is_some_and(|n| lower_letter(n))
        };
        if initial_stop {
            end += 1;
        }
        if at(c, end).is_some_and(|n| word_char(n) || n == '-') {
            return None;
        }
        let following = at(c, i + 1);
        if "OI".contains(l) || ("AE".contains(l) && matches!(following, Some(',' | '!' | '?'))) {
            return None;
        }
        // "vitamin\w*\s+(\w+\s+ve\s+)?" right before, or "\s+vitamin" right after
        let before_text: String = c[..i].iter().collect::<String>().to_lowercase();
        let words: Vec<&str> = before_text.split_whitespace().collect();
        let vitamin = |w: &&str| w.starts_with("vitamin") && w.chars().all(word_char);
        let vitamin_before = before_text.ends_with(char::is_whitespace)
            && (words.last().is_some_and(vitamin) || (words.len() >= 3 && words[words.len() - 1] == "ve" && vitamin(&words[words.len() - 3])));
        let vitamin_after = literal_at(c, skip_spaces(c, end), "vitamin") && skip_spaces(c, end) > end;
        let initial = initial_stop || following == Some('.');
        Some((end, if initial || vitamin_before || vitamin_after { initialism_letter(l) } else { letter_name(l) }.to_string()))
    })
}

const SPOKEN_EXTRA: &[&str] = &[
    "yüz", "bin", "milyon", "milyar", "trilyon", "lira", "kuruş", "dolar", "avro", "sent", "sterlin", "peni", "saniye",
    "dakika", "saat", "buçuk", "metrekare", "metreküp", "kilometrekare", "santimetrekare", "kilometreküp", "santimetreküp",
];

/// The words a number, amount or unit expands to, longest first.
fn spoken_stems() -> &'static [String] {
    static STEMS: OnceLock<Vec<String>> = OnceLock::new();
    STEMS.get_or_init(|| {
        let mut stems: Vec<String> = ONES.iter().chain(TENS.iter().filter(|t| !t.is_empty())).chain(SPOKEN_EXTRA.iter()).map(|s| s.to_string()).collect();
        stems.extend(ABBREVIATIONS.iter().map(|(_, v)| v.rsplit(' ').next().unwrap_or(v).to_string()));
        stems.extend(NUMBER_UNITS.iter().map(|(_, v)| v.rsplit(' ').next().unwrap_or(v).to_string()));
        stems.extend(ORDINAL_EXCEPTIONS.iter().map(|(_, o)| o.to_string()));
        stems.sort_by_key(|s| std::cmp::Reverse(s.chars().count()));
        stems.dedup();
        stems
    })
}

/// Join a written suffix to the words a number or unit became, harmonised to
/// the new stem: "₺2.350'dir" -> "... liradır", "14:30'da" -> "... otuzda".
fn attach_suffix(stem: &str, suffix: &str) -> String {
    let mut stem = stem.to_string();
    let mut suffix: Vec<char> = suffix.chars().collect();
    let ends_consonant = !stem.ends_with(|c: char| VOWELS.contains(c));
    if ends_consonant && suffix.len() > 1 && "yns".contains(suffix[0]) && VOWELS.contains(suffix[1]) {
        suffix.remove(0); // the buffer letter belonged to the written form: "mcg'ya" -> "mikrograma"
    }
    if suffix.first().is_some_and(|c| VOWELS.contains(*c)) {
        if let Some(s) = stem.strip_suffix("buçuk") {
            stem = format!("{s}buçuğ");
        } else if let Some(s) = stem.strip_suffix("dört") {
            stem = format!("{s}dörd");
        }
    }
    let mut vowel = last_vowel(&stem);
    let hard = stem.ends_with(|c: char| "çfhkpsşt".contains(c));
    let mut out = stem.clone();
    for (index, ch) in suffix.into_iter().enumerate() {
        let back = "aıou".contains(vowel);
        let round = "ouöü".contains(vowel);
        let ch = match ch {
            'a' | 'e' => if back { 'a' } else { 'e' },
            'ı' | 'i' | 'u' | 'ü' => match (back, round) {
                (true, false) => 'ı',
                (true, true) => 'u',
                (false, false) => 'i',
                (false, true) => 'ü',
            },
            'd' | 't' if index == 0 => if hard { 't' } else { 'd' },
            other => other,
        };
        if VOWELS.contains(ch) {
            vowel = ch;
        }
        out.push(ch);
    }
    out
}

fn attach_suffixes(text: &str) -> String {
    rewrite(text, |c, i| {
        if !starts_word(c, i) {
            return None;
        }
        // a spoken stem, or a word ending in an ordinal suffix, then 'suffix
        let mut stem_end = None;
        for stem in spoken_stems() {
            let s: Vec<char> = stem.chars().collect();
            if c[i..].starts_with(&s) && at(c, i + s.len()) == Some('\'') {
                stem_end = Some(i + s.len());
                break;
            }
        }
        if stem_end.is_none() {
            let mut j = i;
            while at(c, j).is_some_and(word_char) {
                j += 1;
            }
            let w = text_of(c, i, j);
            if at(c, j) == Some('\'') && ORDINAL_SUFFIXES.iter().any(|s| w.ends_with(s) && w.chars().count() > s.chars().count()) {
                stem_end = Some(j);
            }
        }
        let stem_end = stem_end?;
        let mut k = stem_end + 1;
        while at(c, k).is_some_and(|l| lower_letter(l)) {
            k += 1;
        }
        (k > stem_end + 1 && ends_word(c, k)).then(|| (k, attach_suffix(&text_of(c, i, stem_end), &text_of(c, stem_end + 1, k))))
    })
}

fn tidy(text: &str) -> String {
    let slashes = rewrite(text, |c, i| {
        if c[i].is_whitespace() {
            let j = skip_spaces(c, i);
            if at(c, j) == Some('/') && at(c, j + 1).is_some_and(char::is_whitespace) {
                return Some((skip_spaces(c, j + 1), ", ".into()));
            }
        }
        (c[i] == '/' && before(c, i).is_some_and(letter) && at(c, i + 1).is_some_and(letter)).then(|| (i + 1, " ".into()))
    });
    let tight = rewrite(&slashes, |c, i| {
        if !c[i].is_whitespace() {
            return None;
        }
        let j = skip_spaces(c, i);
        at(c, j).is_some_and(|p| ",.;:!?".contains(p)).then(|| (j, String::new()))
    });
    let leading = tight.trim_start_matches(|c: char| c.is_whitespace() || c == ',').to_string();
    let no_double = rewrite(&leading, |c, i| {
        if !before(c, i).is_some_and(|p| ",.;:!?".contains(p)) {
            return None;
        }
        let j = skip_spaces(c, i);
        (at(c, j) == Some(',')).then(|| (j + 1, String::new()))
    });
    collapse_spaces(&no_double)
}

/// The normaliser's text pass (normalize_for_model), after the foreign respelling.
fn normalize_for_model(text: &str) -> String {
    let text = normalize_orthography(&text.replace('\u{2212}', "-"));
    let passes: [fn(&str) -> String; 27] = [
        lower_if_shouted, replace_roman, lower_suffixes, replace_labels, replace_addresses, replace_symbols,
        replace_dotted_initialisms, replace_times, replace_units, replace_weekdays, replace_currency, split_codes,
        replace_dates, replace_percent, replace_ranges, replace_minus, replace_clock, replace_slashes, replace_decimals,
        replace_ordinals, replace_integers, replace_rates, replace_abbreviations, replace_initialisms,
        replace_lone_letters, attach_suffixes, tidy,
    ];
    passes.iter().fold(text, |t, pass| pass(&t))
}

// ---------- English and brand words ----------

struct Lexicons {
    cmu: HashMap<String, Vec<String>>,
    turkish: HashMap<String, i64>,
    reviewed: Vec<(String, String)>,
}

fn lexicons() -> &'static Lexicons {
    static DATA: OnceLock<Lexicons> = OnceLock::new();
    DATA.get_or_init(|| {
        let dir = super::models_dir().join("antalia");
        let read = |name: &str| std::fs::read_to_string(dir.join(name)).unwrap_or_default();
        let mut cmu = HashMap::new();
        for line in read("cmudict.dict").lines() {
            let mut parts = line.split_whitespace();
            if let Some(word) = parts.next() {
                if !word.contains('(') {
                    cmu.entry(word.to_string()).or_insert_with(|| parts.take_while(|p| *p != "#").map(str::to_string).collect());
                }
            }
        }
        let json = |name: &str| Value::parse(&read(name)).ok();
        let turkish = json("tr_vocab.json")
            .and_then(|v| v.as_object().map(|o| o.iter().filter_map(|(k, n)| n.as_i64().map(|n| (k.clone(), n))).collect()))
            .unwrap_or_default();
        let mut reviewed: Vec<(String, String)> = json("lexicon.json")
            .and_then(|v| v.as_object().map(|o| o.iter().filter(|(k, _)| !k.starts_with('_')).filter_map(|(k, s)| s.as_str().map(|s| (k.clone(), s.to_string()))).collect()))
            .unwrap_or_default();
        reviewed.sort_by_key(|(t, _)| std::cmp::Reverse(t.chars().count()));
        Lexicons { cmu, turkish, reviewed }
    })
}

const PHONES: &[(&str, &str)] = &[
    ("AA", "a"), ("AE", "e"), ("AO", "o"), ("AW", "av"), ("AY", "ay"), ("EH", "e"), ("EY", "ey"), ("IH", "i"),
    ("IY", "i"), ("OW", "o"), ("OY", "oy"), ("UH", "u"), ("UW", "u"), ("B", "b"), ("CH", "ç"), ("D", "d"),
    ("DH", "d"), ("F", "f"), ("G", "g"), ("HH", "h"), ("JH", "c"), ("K", "k"), ("L", "l"), ("M", "m"), ("N", "n"),
    ("NG", "ng"), ("P", "p"), ("R", "r"), ("S", "s"), ("SH", "ş"), ("T", "t"), ("TH", "t"), ("V", "v"), ("W", "v"),
    ("Y", "y"), ("Z", "z"), ("ZH", "j"),
];

const ENGLISH_LETTERS: &[(char, &str)] = &[
    ('A', "ey"), ('B', "bi"), ('C', "si"), ('D', "di"), ('E', "i"), ('F', "ef"), ('G', "ci"), ('H', "eyç"),
    ('I', "ay"), ('J', "cey"), ('K', "key"), ('L', "el"), ('M', "em"), ('N', "en"), ('O', "o"), ('P', "pi"),
    ('Q', "kyu"), ('R', "ar"), ('S', "es"), ('T', "ti"), ('U', "yu"), ('V', "vi"), ('W', "dabılyu"), ('X', "eks"),
    ('Y', "vay"), ('Z', "zi"),
];

fn english_letter(c: char) -> &'static str {
    ENGLISH_LETTERS.iter().find(|(l, _)| *l == c).map_or("", |(_, n)| *n)
}

fn tr_lower_word(w: &str) -> String {
    w.replace('I', "ı").replace('İ', "i").to_lowercase()
}

fn is_upper(word: &str) -> bool {
    word.chars().any(char::is_alphabetic) && !word.chars().any(char::is_lowercase)
}

fn capitalize(t: &str) -> String {
    let mut cs = t.chars();
    match cs.next() {
        Some('i') => format!("İ{}", cs.as_str()),
        Some(c) => c.to_uppercase().chain(cs).collect(),
        None => String::new(),
    }
}

fn in_cmu(word: &str) -> bool {
    lexicons().cmu.contains_key(&word.to_lowercase())
}

/// A brand Turkish text writes this often is one the model learned as written (WhatsApp, YouTube).
fn known_in_turkish(word: &str) -> bool {
    lexicons().turkish.get(&word.to_lowercase()).copied().unwrap_or(0) >= 1000
}

/// English by spelling and dictionary, and never seen in Turkish text.
fn is_english(word: &str) -> bool {
    word.chars().all(|c| c.is_ascii_alphabetic())
        && in_cmu(word)
        && lexicons().turkish.get(&tr_lower_word(word)).copied().unwrap_or(0) == 0
        && lexicons().turkish.get(&word.to_lowercase()).copied().unwrap_or(0) == 0
}

fn has_inner_capital(word: &str) -> bool {
    word.chars().skip(1).any(char::is_uppercase) && word.chars().any(char::is_lowercase)
}

/// "PatientDesk" -> Patient, Desk; "iPhone" -> i, Phone; "ChatGPT" -> Chat, GPT.
fn split_camel(word: &str) -> Vec<String> {
    let cs: Vec<char> = word.chars().collect();
    let mut parts = Vec::new();
    let mut i = 0;
    while i < cs.len() {
        let c = cs[i];
        let mut j = i;
        if c.is_ascii_uppercase() {
            while j < cs.len() && cs[j].is_ascii_uppercase() {
                j += 1;
            }
            if j - i >= 2 {
                // a capital run; if a capital starts a lowercase word, it belongs to that word
                if j < cs.len() && cs[j].is_ascii_lowercase() {
                    j -= 1;
                }
                if j - i >= 2 {
                    parts.push(cs[i..j].iter().collect());
                    i = j;
                    continue;
                }
            }
            j = i + 1;
            while j < cs.len() && cs[j].is_ascii_lowercase() {
                j += 1;
            }
        } else if c.is_ascii_lowercase() {
            while j < cs.len() && cs[j].is_ascii_lowercase() {
                j += 1;
            }
        } else if c.is_ascii_digit() {
            while j < cs.len() && cs[j].is_ascii_digit() {
                j += 1;
            }
        } else {
            i += 1;
            continue;
        }
        parts.push(cs[i..j].iter().collect());
        i = j;
    }
    parts
}

fn from_phones(phones: &[String], written: &str) -> String {
    let lw = written.to_lowercase();
    let aa = if lw.contains('o') && !lw.contains('a') { "o" } else { "a" };
    let mut s = String::new();
    for p in phones {
        let base = p.trim_end_matches(|c: char| c.is_ascii_digit());
        let stress = p.chars().last().filter(char::is_ascii_digit);
        s.push_str(match base {
            "AA" => aa,
            "AH" => if stress == Some('1') { "a" } else { "ı" },
            "ER" => if stress == Some('1') { "ör" } else { "ır" },
            other => PHONES.iter().find(|(ph, _)| *ph == other).map_or("", |(_, t)| *t),
        });
    }
    // "ng" before k/g is the n of "link"; doubled letters read as one
    let s = s.replace("ngk", "nk").replace("ngg", "ng");
    let mut out = String::new();
    for c in s.chars() {
        if out.chars().last() != Some(c) {
            out.push(c);
        }
    }
    out
}

fn respell_part(part: &str) -> Option<String> {
    if part.chars().all(|c| c.is_ascii_digit()) {
        return Some(part.to_string());
    }
    if is_upper(part) && part.chars().count() <= 5 {
        let many = part.chars().count() > 1;
        return Some(part.chars().map(|c| if many { capitalize(english_letter(c)) } else { english_letter(c).to_string() }).collect::<Vec<_>>().join(" "));
    }
    if part == "i" || part == "e" {
        return Some(english_letter(part.to_ascii_uppercase().chars().next().unwrap_or('I')).to_string());
    }
    lexicons().cmu.get(&part.to_lowercase()).map(|phones| from_phones(phones, part))
}

/// The whole token respelled, its parts joined ("Peyşınt Desk"; "Ayfon" for i+Phone).
fn respell(word: &str) -> Option<String> {
    let parts = if has_inner_capital(word) { split_camel(word) } else { vec![word.to_string()] };
    let mut spoken = Vec::new();
    for part in &parts {
        spoken.push(respell_part(part)?);
    }
    let word_capital = word.chars().next().is_some_and(char::is_uppercase);
    let spoken: Vec<String> = parts
        .iter()
        .zip(&spoken)
        .enumerate()
        .map(|(k, (p, sp))| if p.chars().next().is_some_and(char::is_uppercase) || (k == 0 && word_capital) { capitalize(sp) } else { sp.clone() })
        .collect();
    let mut merged: Vec<String> = Vec::new();
    for (k, (p, sp)) in parts.iter().zip(&spoken).enumerate() {
        let short = p.chars().count() <= 2 && !is_upper(p);
        if !merged.is_empty() && (short || (k == 1 && (parts[0] == "i" || parts[0] == "e"))) {
            let last = merged.len() - 1;
            merged[last].push_str(&tr_lower_word(sp));
        } else {
            merged.push(sp.clone());
        }
    }
    let text = merged.join(" ");
    Some(if has_inner_capital(word) || word_capital { capitalize(&text) } else { text })
}

/// A capital I in an English word is İ (Instagram, Intel), not the Turkish ı.
fn english_i(word: &str) -> String {
    if is_upper(word) && word.chars().count() <= 5 {
        return word.to_string();
    }
    if word.contains('I') && word.chars().all(|c| c.is_ascii_alphabetic()) && in_cmu(word) { word.replace('I', "İ") } else { word.to_string() }
}

/// Each ASCII word with an optional 'suffix: respelled when it is a brand or English.
fn respell_auto(text: &str) -> String {
    rewrite(text, |c, i| {
        if !c[i].is_ascii_alphabetic() || before(c, i).is_some_and(|p| word_char(p) || "@./".contains(p)) {
            return None;
        }
        let mut j = i;
        while at(c, j).is_some_and(|x| x.is_ascii_alphanumeric()) {
            j += 1;
        }
        let word = text_of(c, i, j);
        let mut end = j;
        if at(c, j).is_some_and(|a| a == '\'' || a == '\u{2019}') && at(c, j + 1).is_some_and(|l| lower_letter(l)) {
            end = j + 1;
            while at(c, end).is_some_and(|l| lower_letter(l)) {
                end += 1;
            }
        }
        if at(c, end).is_some_and(|n| word_char(n) || n == '@') {
            return None;
        }
        let suffix = text_of(c, j, end);
        if is_upper(&word) && word.chars().count() <= 5 {
            return None;
        }
        let known = known_in_turkish(&word);
        let kept = known || !(has_inner_capital(&word) || is_english(&word));
        let said = if kept { english_i(&word) } else { respell(&word).unwrap_or_else(|| english_i(&word)) };
        Some((end, said + &suffix))
    })
}

/// The reviewed lexicon first (a term mapped to itself is read as written and
/// shielded from the automatic respelling), then the automatic respelling.
fn respell_span(text: &str) -> String {
    let reviewed = &lexicons().reviewed;
    let key = |t: &str| t.replace(['İ', 'I', 'ı'], "i").to_lowercase();
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut plain = String::new();
    let mut i = 0;
    while i < chars.len() {
        let hit = (!before(&chars, i).is_some_and(word_char))
            .then(|| {
                reviewed.iter().find_map(|(term, say)| {
                    let n = term.chars().count();
                    let written: String = chars.get(i..i + n)?.iter().collect();
                    let next = at(&chars, i + n);
                    let boundary = next.is_none_or(|x| x == '\'' || x == '\u{2019}' || !word_char(x));
                    (key(&written) == key(term) && boundary).then(|| (i + n, written, say.clone()))
                })
            })
            .flatten();
        match hit {
            Some((end, written, say)) => {
                out.push_str(&respell_auto(&plain));
                plain.clear();
                out.push_str(&if key(&say) == key(&written) { english_i(&written) } else { say });
                i = end;
            }
            None => {
                plain.push(chars[i]);
                i += 1;
            }
        }
    }
    out.push_str(&respell_auto(&plain));
    out
}

/// Brand and English words respelled outside web and e-mail addresses; an
/// e-mail address is lowercased the English way (its capital I is an i).
fn respell_foreign(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut last = 0;
    let mut i = 0;
    while i < chars.len() {
        if let Some(end) = address_at(&chars, i) {
            out.push_str(&respell_span(&text_of(&chars, last, i)));
            let span = text_of(&chars, i, end);
            out.push_str(&if span.contains('@') { span.to_lowercase() } else { span });
            last = end;
            i = end;
        } else {
            i += 1;
        }
    }
    out.push_str(&respell_span(&text_of(&chars, last, chars.len())));
    out
}

// ---------- the model text ----------

const MODEL_ALPHABET: &str = "abcçdefgğhıijklmnoöpqrsştuüvwxyzâîû .,?!'-:;";

/// Raw text -> the exact characters Antalia reads: respelled, normalised,
/// capitals lowercased the Turkish way, quote and dash variants folded,
/// anything outside its alphabet dropped.
pub fn model_text(raw: &str) -> String {
    let respelled = respell_foreign(&compatibility_fold(raw));
    let normalized = normalize_for_model(&respelled);
    let lowered = turkish_lower(&normalized);
    let folded: String = lowered
        .chars()
        .map(|c| match c {
            '\u{2019}' | '\u{2018}' | '`' | '\u{00B4}' => '\'',
            '\u{2013}' | '\u{2014}' => '-',
            '\u{2026}' => '.',
            c if c.is_whitespace() => ' ',
            c if MODEL_ALPHABET.contains(c) => c,
            _ => ' ',
        })
        .collect();
    let tight = rewrite(&folded, |c, i| {
        if c[i] != ' ' {
            return None;
        }
        let j = skip_spaces(c, i);
        at(c, j).is_some_and(|p| ".,?!:;".contains(p)).then(|| (j, String::new()))
    });
    collapse_spaces(&tight)
}

#[cfg(test)]
mod tests;
