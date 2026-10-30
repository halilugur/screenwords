//! A small backtracking regex engine covering the subset Screenwords actually
//! uses in `paramsSchema.pattern` (e.g. `"^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$"`)
//! and in the import/URL heuristics.
//!
//! Supported: literals, `.`, character classes `[...]` / `[^...]` with ranges,
//! groups `(...)`, alternation `|`, anchors `^` `$`, word boundary `\b`,
//! escapes `\d \D \w \W \s \S` and literal escapes, and the repetition
//! operators `* + ? {n} {n,} {n,m}` (greedy; non-greedy with a trailing `?`).
//! Semantics follow `re.search`: the match may start anywhere.

#[derive(Debug, Clone)]
enum Node {
    Char(char),
    Any,
    Class { neg: bool, items: Vec<ClassItem> },
    Group(Box<Alt>),
    Start,
    End,
    WordBoundary,
}

#[derive(Debug, Clone)]
enum ClassItem {
    Ch(char),
    Range(char, char),
    Digit,
    NotDigit,
    Word,
    NotWord,
    Space,
    NotSpace,
}

#[derive(Debug, Clone)]
struct Piece {
    node: Node,
    min: usize,
    max: Option<usize>, // None = unbounded
    greedy: bool,
}

type Concat = Vec<Piece>;

#[derive(Debug, Clone)]
struct Alt(Vec<Concat>);

#[derive(Debug, Clone)]
pub struct Regex {
    alt: Alt,
}

#[derive(Debug)]
pub struct RegexError(pub String);

impl std::fmt::Display for RegexError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "invalid regular expression: {}", self.0)
    }
}

impl std::error::Error for RegexError {}

impl Regex {
    pub fn compile(pattern: &str) -> Result<Regex, RegexError> {
        let chars: Vec<char> = pattern.chars().collect();
        let mut p = 0usize;
        let alt = parse_alt(&chars, &mut p)?;
        if p != chars.len() {
            return Err(RegexError(format!("unexpected '{}' at {}", chars[p], p)));
        }
        Ok(Regex { alt })
    }

    /// Leftmost match of the pattern in `text`; returns (start, end) char
    /// indices of the whole match. `re.search` semantics: any start position
    /// is tried until one matches.
    pub fn search(&self, text: &str) -> Option<(usize, usize)> {
        let chars: Vec<char> = text.chars().collect();
        for start in 0..=chars.len() {
            if let Some(end) = match_alt(&self.alt, &chars, start, &mut |p| Some(p)) {
                return Some((start, end));
            }
        }
        None
    }

    pub fn is_match(&self, text: &str) -> bool {
        self.search(text).is_some()
    }
}

fn parse_alt(chars: &[char], p: &mut usize) -> Result<Alt, RegexError> {
    let mut branches = vec![parse_concat(chars, p)?];
    while *p < chars.len() && chars[*p] == '|' {
        *p += 1;
        branches.push(parse_concat(chars, p)?);
    }
    Ok(Alt(branches))
}

fn parse_concat(chars: &[char], p: &mut usize) -> Result<Concat, RegexError> {
    let mut out = Vec::new();
    while *p < chars.len() {
        let c = chars[*p];
        if c == '|' || c == ')' {
            break;
        }
        let node = if c == '(' {
            *p += 1;
            let alt = parse_alt(chars, p)?;
            if *p >= chars.len() || chars[*p] != ')' {
                return Err(RegexError("missing ')'".into()));
            }
            *p += 1;
            // A "(?...)" group would land here as a bogus node; the subset we
            // support does not use non-capturing syntax.
            Node::Group(Box::new(alt))
        } else if c == '[' {
            *p += 1;
            let (node, np) = parse_class(chars, *p)?;
            *p = np;
            node
        } else if c == '^' {
            *p += 1;
            Node::Start
        } else if c == '$' {
            *p += 1;
            Node::End
        } else {
            let (node, np) = parse_atom(chars, *p)?;
            *p = np;
            node
        };
        // Repetition suffix.
        let (min, max) = parse_repeat(chars, p)?;
        let mut greedy = true;
        if *p < chars.len() && chars[*p] == '?' && (min != 1 || max != Some(1)) {
            greedy = false;
            *p += 1;
        }
        out.push(Piece { node, min, max, greedy });
    }
    Ok(out)
}

fn parse_atom(chars: &[char], p: usize) -> Result<(Node, usize), RegexError> {
    let c = chars[p];
    match c {
        '.' => Ok((Node::Any, p + 1)),
        '\\' => {
            let e = *chars.get(p + 1).ok_or_else(|| RegexError("trailing backslash".into()))?;
            let node = match e {
                'd' => Node::Class { neg: false, items: vec![ClassItem::Digit] },
                'D' => Node::Class { neg: true, items: vec![ClassItem::Digit] },
                'w' => Node::Class { neg: false, items: vec![ClassItem::Word] },
                'W' => Node::Class { neg: true, items: vec![ClassItem::Word] },
                's' => Node::Class { neg: false, items: vec![ClassItem::Space] },
                'S' => Node::Class { neg: true, items: vec![ClassItem::Space] },
                'b' => Node::WordBoundary,
                'n' => Node::Char('\n'),
                'r' => Node::Char('\r'),
                't' => Node::Char('\t'),
                other => Node::Char(other),
            };
            Ok((node, p + 2))
        }
        '*' | '+' | '?' => Err(RegexError(format!("nothing to repeat at {p}"))),
        c => Ok((Node::Char(c), p + 1)),
    }
}

fn parse_class(chars: &[char], mut p: usize) -> Result<(Node, usize), RegexError> {
    let mut neg = false;
    if p < chars.len() && chars[p] == '^' {
        neg = true;
        p += 1;
    }
    let mut items = Vec::new();
    let mut first = true;
    while p < chars.len() {
        let c = chars[p];
        if c == ']' && !first {
            p += 1;
            return Ok((Node::Class { neg, items }, p));
        }
        first = false;
        let (item, np) = if c == '\\' {
            let e = *chars.get(p + 1).ok_or_else(|| RegexError("trailing backslash in class".into()))?;
            let item = match e {
                'd' => ClassItem::Digit,
                'D' => ClassItem::NotDigit,
                'w' => ClassItem::Word,
                'W' => ClassItem::NotWord,
                's' => ClassItem::Space,
                'S' => ClassItem::NotSpace,
                'n' => ClassItem::Ch('\n'),
                'r' => ClassItem::Ch('\r'),
                't' => ClassItem::Ch('\t'),
                other => ClassItem::Ch(other),
            };
            (item, p + 2)
        } else {
            (ClassItem::Ch(c), p + 1)
        };
        p = np;
        // Range like a-z (not when the '-' is the last char before ']').
        if let ClassItem::Ch(lo) = item {
            if p + 1 < chars.len() && chars[p] == '-' && chars[p + 1] != ']' {
                if let Some((hi, np)) = parse_class_char(chars, p + 1)? {
                    items.push(ClassItem::Range(lo, hi));
                    p = np;
                    continue;
                }
            }
        }
        items.push(item);
    }
    Err(RegexError("missing ']' in character class".into()))
}

fn parse_class_char(chars: &[char], p: usize) -> Result<Option<(char, usize)>, RegexError> {
    let c = chars[p];
    if c == '\\' {
        let e = *chars.get(p + 1).ok_or_else(|| RegexError("trailing backslash in class".into()))?;
        let ch = match e {
            'n' => '\n',
            'r' => '\r',
            't' => '\t',
            other => other,
        };
        Ok(Some((ch, p + 2)))
    } else {
        Ok(Some((c, p + 1)))
    }
}

/// Parses `*`, `+`, `?`, `{n}`, `{n,}`, `{n,m}` into (min, max); defaults to
/// exactly one when absent.
fn parse_repeat(chars: &[char], p: &mut usize) -> Result<(usize, Option<usize>), RegexError> {
    if *p >= chars.len() {
        return Ok((1, Some(1)));
    }
    match chars[*p] {
        '*' => {
            *p += 1;
            Ok((0, None))
        }
        '+' => {
            *p += 1;
            Ok((1, None))
        }
        '?' => {
            *p += 1;
            Ok((0, Some(1)))
        }
        '{' => {
            let close = chars[*p..].iter().position(|&c| c == '}').map(|i| i + *p);
            let Some(close) = close else {
                return Ok((1, Some(1))); // literal '{'
            };
            let body: String = chars[*p + 1..close].iter().collect();
            let parse_n = |s: &str| -> Result<usize, RegexError> {
                s.trim().parse::<usize>().map_err(|_| RegexError(format!("bad repetition {{{s}}}")))
            };
            let (min, max) = if let Some((a, b)) = body.split_once(',') {
                let min = parse_n(a)?;
                let max = if b.trim().is_empty() { None } else { Some(parse_n(b)?) };
                (min, max)
            } else {
                let n = parse_n(&body)?;
                (n, Some(n))
            };
            *p = close + 1;
            Ok((min, max))
        }
        _ => Ok((1, Some(1))),
    }
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_'
}

fn class_matches(neg: bool, items: &[ClassItem], c: char) -> bool {
    let mut hit = false;
    for item in items {
        let m = match item {
            ClassItem::Ch(x) => *x == c,
            ClassItem::Range(a, b) => c >= *a && c <= *b,
            ClassItem::Digit => c.is_ascii_digit(),
            ClassItem::NotDigit => !c.is_ascii_digit(),
            ClassItem::Word => is_word_char(c),
            ClassItem::NotWord => !is_word_char(c),
            ClassItem::Space => c.is_whitespace(),
            ClassItem::NotSpace => !c.is_whitespace(),
        };
        if m {
            hit = true;
            break;
        }
    }
    hit != neg
}

/// Matches `concat` from `pos`. The continuation `k` receives candidate end
/// positions and returns the final match end on success — this is how the
/// end position threads back through backtracking.
fn match_concat(
    concat: &[Piece],
    chars: &[char],
    pos: usize,
    k: &mut dyn FnMut(usize) -> Option<usize>,
) -> Option<usize> {
    match concat.split_first() {
        None => k(pos),
        Some((piece, rest)) => rep_from(piece, 0, chars, pos, rest, k),
    }
}

/// Drives the repetition of `piece`: `count` occurrences already consumed up
/// to `pos`; further repetitions and the tail (`rest`) are tried according to
/// greediness and min/max bounds.
fn rep_from(
    piece: &Piece,
    count: usize,
    chars: &[char],
    pos: usize,
    rest: &[Piece],
    k: &mut dyn FnMut(usize) -> Option<usize>,
) -> Option<usize> {
    let can_more = piece.max.map(|m| count < m).unwrap_or(true);
    let tail_ok = count >= piece.min;
    let one_more = |k: &mut dyn FnMut(usize) -> Option<usize>| -> Option<usize> {
        match_one(&piece.node, chars, pos, &mut |end| {
            if end == pos && piece.max.is_none() {
                return None; // zero-width guard for unbounded repeats
            }
            rep_from(piece, count + 1, chars, end, rest, k)
        })
    };
    if piece.greedy {
        if can_more {
            if let Some(end) = one_more(k) {
                return Some(end);
            }
        }
        if tail_ok {
            return match_concat(rest, chars, pos, k);
        }
        None
    } else {
        if tail_ok {
            if let Some(end) = match_concat(rest, chars, pos, k) {
                return Some(end);
            }
        }
        if can_more {
            return one_more(k);
        }
        None
    }
}

/// Matches one occurrence of a node at `pos`, delegating the rest to `k`.
fn match_one(
    node: &Node,
    chars: &[char],
    pos: usize,
    k: &mut dyn FnMut(usize) -> Option<usize>,
) -> Option<usize> {
    match node {
        Node::Char(c) => {
            if chars.get(pos) == Some(c) {
                k(pos + 1)
            } else {
                None
            }
        }
        Node::Any => {
            if pos < chars.len() && chars[pos] != '\n' {
                k(pos + 1)
            } else {
                None
            }
        }
        Node::Class { neg, items } => {
            if pos < chars.len() && class_matches(*neg, items, chars[pos]) {
                k(pos + 1)
            } else {
                None
            }
        }
        Node::Start => {
            if pos == 0 {
                k(pos)
            } else {
                None
            }
        }
        Node::End => {
            if pos == chars.len() {
                k(pos)
            } else {
                None
            }
        }
        Node::WordBoundary => {
            let before = pos > 0 && is_word_char(chars[pos - 1]);
            let after = pos < chars.len() && is_word_char(chars[pos]);
            if before != after {
                k(pos)
            } else {
                None
            }
        }
        Node::Group(alt) => match_alt(alt, chars, pos, k),
    }
}

fn match_alt(
    alt: &Alt,
    chars: &[char],
    pos: usize,
    k: &mut dyn FnMut(usize) -> Option<usize>,
) -> Option<usize> {
    for branch in &alt.0 {
        if let Some(end) = match_concat(branch, chars, pos, k) {
            return Some(end);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn m(pat: &str, text: &str) -> Option<String> {
        Regex::compile(pat)
            .ok()?
            .search(text)
            .map(|(a, b)| text.chars().skip(a).take(b - a).collect())
    }

    #[test]
    fn color_pattern_from_the_app() {
        let re = Regex::compile("^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$").unwrap();
        assert!(re.is_match("#FFD23F"));
        assert!(re.is_match("#FFD23F80"));
        assert!(!re.is_match("FFD23F"));
        assert!(!re.is_match("#FFD23"));
        assert!(!re.is_match("#FFD23FFFF")); // 9 hex digits: too many
    }

    #[test]
    fn search_and_anchors() {
        assert_eq!(m("l+\\w", "hello world"), Some("llo".to_string()));
        assert!(Regex::compile("^ab$").unwrap().is_match("ab"));
        assert!(!Regex::compile("^ab$").unwrap().is_match("xab"));
        assert!(Regex::compile("\\bXMLHttpRequest\\b").unwrap().is_match("new XMLHttpRequest()"));
        assert!(!Regex::compile("\\bXMLHttpRequest\\b").unwrap().is_match("XMLHttpRequests"));
    }

    #[test]
    fn alternation_groups_repeats() {
        assert!(Regex::compile("a|bc").unwrap().is_match("xbc"));
        assert!(Regex::compile("(ab)+c").unwrap().is_match("ababc"));
        assert!(!Regex::compile("(ab)+c").unwrap().is_match("c"));
        assert!(Regex::compile("colou?r").unwrap().is_match("color"));
        assert_eq!(m("[0-9]{2,3}", "x1234"), Some("123".to_string()));
    }

    #[test]
    fn lazy_repeat() {
        assert_eq!(m("<.+?>", "<a><b>"), Some("<a>".to_string()));
        assert_eq!(m("<.+>", "<a><b>"), Some("<a><b>".to_string()));
    }

    #[test]
    fn bad_patterns_error() {
        assert!(Regex::compile("(").is_err());
        assert!(Regex::compile("[a-").is_err());
        assert!(Regex::compile("*x").is_err());
    }
}
