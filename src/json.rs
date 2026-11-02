//! Minimal JSON value model, parser and serializer (std-only).
//!
//! Mirrors what Screenwords's Swift side needs from JSONCoding: ordered objects
//! (insertion order preserved; the app writes alphabetically sorted keys, which
//! [`Value::to_string_pretty`] can reproduce), int/float distinction kept so a
//! round-trip never rewrites `2.5` into `2`, and lenient duplicate-key reads
//! (first occurrence wins, matching a dictionary decode).

use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Str(String),
    Array(Vec<Value>),
    Object(Vec<(String, Value)>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct JsonError {
    pub offset: usize,
    pub message: String,
}

impl fmt::Display for JsonError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} at byte {}", self.message, self.offset)
    }
}

impl std::error::Error for JsonError {}

impl Value {
    pub fn obj() -> Value {
        Value::Object(Vec::new())
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Int(i) => Some(*i),
            Value::Float(f) if f.fract() == 0.0 && f.is_finite() && *f >= i64::MIN as f64 && *f <= i64::MAX as f64 => {
                Some(*f as i64)
            }
            _ => None,
        }
    }

    /// Number as f64 regardless of int/float storage.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Int(i) => Some(*i as f64),
            Value::Float(f) => Some(*f),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::Str(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&[Value]> {
        match self {
            Value::Array(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&[(String, Value)]> {
        match self {
            Value::Object(o) => Some(o),
            _ => None,
        }
    }

    pub fn as_array_mut(&mut self) -> Option<&mut Vec<Value>> {
        match self {
            Value::Array(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_object_mut(&mut self) -> Option<&mut Vec<(String, Value)>> {
        match self {
            Value::Object(o) => Some(o),
            _ => None,
        }
    }

    /// Object member lookup (first occurrence wins).
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Object(o) => o.iter().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Object member mutable lookup (first occurrence wins).
    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        match self {
            Value::Object(o) => o.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }

    /// Insert or replace an object member (replacement reuses the first slot's
    /// position, like a dictionary assignment).
    pub fn set(&mut self, key: &str, value: Value) {
        if let Value::Object(o) = self {
            for (k, v) in o.iter_mut() {
                if k == key {
                    *v = value;
                    return;
                }
            }
            o.push((key.to_string(), value));
        }
    }

    pub fn remove(&mut self, key: &str) -> Option<Value> {
        if let Value::Object(o) = self {
            if let Some(pos) = o.iter().position(|(k, _)| k == key) {
                return Some(o.remove(pos).1);
            }
        }
        None
    }

    pub fn str(s: &str) -> Value {
        Value::Str(s.to_string())
    }

    pub fn from_f64(f: f64) -> Value {
        if f.is_finite() && f == f.trunc() && f.abs() <= 9.007_199_254_740_992e15 {
            Value::Int(f as i64)
        } else {
            Value::Float(f)
        }
    }

    pub fn parse(input: &str) -> Result<Value, JsonError> {
        let mut p = Parser { bytes: input.as_bytes(), pos: 0, depth: 0 };
        p.skip_ws();
        let v = p.value()?;
        p.skip_ws();
        if p.pos != p.bytes.len() {
            return Err(p.err("trailing characters after the JSON value"));
        }
        Ok(v)
    }

    /// Swift-`JSONEncoder`-flavoured pretty printing: two-space indent and
    /// `" : "` between key and value; `sorted` reproduces `.sortedKeys`.
    pub fn to_string_pretty(&self, sorted: bool) -> String {
        let mut out = String::new();
        write_value(self, &mut out, if sorted { Some(true) } else { Some(false) }, 0);
        out
    }
}

impl std::fmt::Display for Value {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let mut out = String::new();
        write_value(self, &mut out, None, 0);
        f.write_str(&out)
    }
}

fn write_value(v: &Value, out: &mut String, pretty: Option<bool>, indent: usize) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(true) => out.push_str("true"),
        Value::Bool(false) => out.push_str("false"),
        Value::Int(i) => out.push_str(&i.to_string()),
        Value::Float(f) => {
            if f.is_finite() {
                let s = format!("{f}");
                out.push_str(&s);
                // Keep the value visibly a float ("1.0", not "1").
                if !s.contains('.') && !s.contains('e') && !s.contains('E') {
                    out.push_str(".0");
                }
            } else {
                out.push_str("null"); // JSON has no NaN/Infinity
            }
        }
        Value::Str(s) => write_json_string(s, out),
        Value::Array(a) => {
            if a.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push('[');
            for (i, item) in a.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                newline_indent(out, pretty, indent + 1);
                write_value(item, out, pretty, indent + 1);
            }
            newline_indent(out, pretty, indent);
            out.push(']');
        }
        Value::Object(o) => {
            if o.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push('{');
            let mut order: Vec<usize> = (0..o.len()).collect();
            if pretty == Some(true) {
                order.sort_by(|&a, &b| o[a].0.cmp(&o[b].0));
            }
            for (n, &idx) in order.iter().enumerate() {
                if n > 0 {
                    out.push(',');
                }
                newline_indent(out, pretty, indent + 1);
                write_json_string(&o[idx].0, out);
                if pretty.is_some() {
                    out.push(' ');
                }
                out.push(':');
                if pretty.is_some() {
                    out.push(' ');
                }
                write_value(&o[idx].1, out, pretty, indent + 1);
            }
            newline_indent(out, pretty, indent);
            out.push('}');
        }
    }
}

fn newline_indent(out: &mut String, pretty: Option<bool>, indent: usize) {
    if pretty.is_some() {
        out.push('\n');
        for _ in 0..indent {
            out.push_str("  ");
        }
    }
}

fn write_json_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
    depth: usize,
}

const MAX_DEPTH: usize = 128;

impl<'a> Parser<'a> {
    fn err(&self, message: &str) -> JsonError {
        JsonError { offset: self.pos, message: message.to_string() }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while let Some(b) = self.peek() {
            if b == b' ' || b == b'\t' || b == b'\n' || b == b'\r' {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    fn value(&mut self) -> Result<Value, JsonError> {
        if self.depth >= MAX_DEPTH {
            return Err(self.err("nesting too deep"));
        }
        match self.peek() {
            None => Err(self.err("unexpected end of input")),
            Some(b'{') => {
                self.pos += 1;
                self.depth += 1;
                let mut obj = Vec::new();
                self.skip_ws();
                if self.peek() == Some(b'}') {
                    self.pos += 1;
                    self.depth -= 1;
                    return Ok(Value::Object(obj));
                }
                loop {
                    self.skip_ws();
                    let key = self.string()?;
                    self.skip_ws();
                    if self.peek() != Some(b':') {
                        return Err(self.err("expected ':' after object key"));
                    }
                    self.pos += 1;
                    self.skip_ws();
                    let val = self.value()?;
                    obj.push((key, val));
                    self.skip_ws();
                    match self.peek() {
                        Some(b',') => {
                            self.pos += 1;
                        }
                        Some(b'}') => {
                            self.pos += 1;
                            break;
                        }
                        _ => return Err(self.err("expected ',' or '}' in object")),
                    }
                }
                self.depth -= 1;
                Ok(Value::Object(obj))
            }
            Some(b'[') => {
                self.pos += 1;
                self.depth += 1;
                let mut arr = Vec::new();
                self.skip_ws();
                if self.peek() == Some(b']') {
                    self.pos += 1;
                    self.depth -= 1;
                    return Ok(Value::Array(arr));
                }
                loop {
                    self.skip_ws();
                    arr.push(self.value()?);
                    self.skip_ws();
                    match self.peek() {
                        Some(b',') => {
                            self.pos += 1;
                        }
                        Some(b']') => {
                            self.pos += 1;
                            break;
                        }
                        _ => return Err(self.err("expected ',' or ']' in array")),
                    }
                }
                self.depth -= 1;
                Ok(Value::Array(arr))
            }
            Some(b'"') => Ok(Value::Str(self.string()?)),
            Some(b't') => self.literal("true", Value::Bool(true)),
            Some(b'f') => self.literal("false", Value::Bool(false)),
            Some(b'n') => self.literal("null", Value::Null),
            Some(b'-') | Some(b'0'..=b'9') => self.number(),
            Some(c) => Err(self.err(&format!("unexpected character '{}'", c as char))),
        }
    }

    fn literal(&mut self, word: &str, v: Value) -> Result<Value, JsonError> {
        if self.bytes[self.pos..].starts_with(word.as_bytes()) {
            self.pos += word.len();
            Ok(v)
        } else {
            Err(self.err(&format!("invalid literal, expected '{}'", word)))
        }
    }

    fn number(&mut self) -> Result<Value, JsonError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.pos += 1;
        }
        let mut is_float = false;
        if self.peek() == Some(b'.') {
            is_float = true;
            self.pos += 1;
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        if matches!(self.peek(), Some(b'e') | Some(b'E')) {
            is_float = true;
            self.pos += 1;
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.pos += 1;
            }
            while matches!(self.peek(), Some(b'0'..=b'9')) {
                self.pos += 1;
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).unwrap_or("");
        if text.is_empty() || text == "-" {
            return Err(self.err("invalid number"));
        }
        if !is_float {
            if let Ok(i) = text.parse::<i64>() {
                return Ok(Value::Int(i));
            }
        }
        match text.parse::<f64>() {
            Ok(f) if f.is_finite() => Ok(Value::Float(f)),
            _ => Err(self.err("invalid number")),
        }
    }

    fn string(&mut self) -> Result<String, JsonError> {
        if self.peek() != Some(b'"') {
            return Err(self.err("expected a string"));
        }
        self.pos += 1;
        let mut out = String::new();
        loop {
            let b = self.peek().ok_or_else(|| self.err("unterminated string"))?;
            match b {
                b'"' => {
                    self.pos += 1;
                    return Ok(out);
                }
                b'\\' => {
                    self.pos += 1;
                    let esc = self.peek().ok_or_else(|| self.err("unterminated escape"))?;
                    self.pos += 1;
                    match esc {
                        b'"' => out.push('"'),
                        b'\\' => out.push('\\'),
                        b'/' => out.push('/'),
                        b'b' => out.push('\u{8}'),
                        b'f' => out.push('\u{c}'),
                        b'n' => out.push('\n'),
                        b'r' => out.push('\r'),
                        b't' => out.push('\t'),
                        b'u' => {
                            let cp = self.hex4()?;
                            if (0xD800..0xDC00).contains(&cp) {
                                // High surrogate: require a following \uXXXX low surrogate.
                                if self.peek() == Some(b'\\') {
                                    self.pos += 1;
                                    if self.peek() == Some(b'u') {
                                        self.pos += 1;
                                        let lo = self.hex4()?;
                                        if (0xDC00..0xE000).contains(&lo) {
                                            let combined = 0x10000
                                                + ((cp - 0xD800) << 10)
                                                + (lo - 0xDC00);
                                            out.push(
                                                char::from_u32(combined)
                                                    .unwrap_or('\u{FFFD}'),
                                            );
                                            continue;
                                        }
                                    }
                                }
                                out.push('\u{FFFD}');
                            } else if (0xDC00..0xE000).contains(&cp) {
                                out.push('\u{FFFD}');
                            } else {
                                out.push(char::from_u32(cp).unwrap_or('\u{FFFD}'));
                            }
                        }
                        _ => return Err(self.err("invalid escape character")),
                    }
                }
                _ => {
                    // Consume one UTF-8 encoded char.
                    let start = self.pos;
                    let len = utf8_len(b);
                    if len == 0 || start + len > self.bytes.len() {
                        return Err(self.err("invalid UTF-8 in string"));
                    }
                    match std::str::from_utf8(&self.bytes[start..start + len]) {
                        Ok(s) => {
                            out.push_str(s);
                            self.pos += len;
                        }
                        Err(_) => return Err(self.err("invalid UTF-8 in string")),
                    }
                }
            }
        }
    }

    fn hex4(&mut self) -> Result<u32, JsonError> {
        if self.pos + 4 > self.bytes.len() {
            return Err(self.err("truncated \\u escape"));
        }
        let mut v = 0u32;
        for _ in 0..4 {
            let b = self.bytes[self.pos];
            let d = match b {
                b'0'..=b'9' => (b - b'0') as u32,
                b'a'..=b'f' => (b - b'a' + 10) as u32,
                b'A'..=b'F' => (b - b'A' + 10) as u32,
                _ => return Err(self.err("invalid \\u escape")),
            };
            v = v * 16 + d;
            self.pos += 1;
        }
        Ok(v)
    }
}

fn utf8_len(first: u8) -> usize {
    if first < 0x80 {
        1
    } else if first >> 5 == 0b110 {
        2
    } else if first >> 4 == 0b1110 {
        3
    } else if first >> 3 == 0b11110 {
        4
    } else {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_roundtrip_objects() {
        let src = r#"{"a":1,"b":[true,null,-2.5],"c":{"d":"é\n\t\\"}}"#;
        let v = Value::parse(src).unwrap();
        assert_eq!(v.get("a"), Some(&Value::Int(1)));
        assert_eq!(v.get("b").unwrap().as_array().unwrap().len(), 3);
        let out = v.to_string();
        let v2 = Value::parse(&out).unwrap();
        assert_eq!(v, v2);
    }

    #[test]
    fn int_float_distinction() {
        let v = Value::parse("[2.5, 3, 1e2]").unwrap();
        let a = v.as_array().unwrap();
        assert_eq!(a[0], Value::Float(2.5));
        assert_eq!(a[1], Value::Int(3));
        assert_eq!(a[2], Value::Float(100.0));
        assert_eq!(a[0].to_string(), "2.5");
        assert_eq!(a[1].to_string(), "3");
    }

    #[test]
    fn surrogate_pairs() {
        let v = Value::parse(r#""😀""#).unwrap();
        assert_eq!(v.as_str(), Some("\u{1F600}"));
    }

    #[test]
    fn errors_report_offset() {
        assert!(Value::parse("{").is_err());
        assert!(Value::parse("[1,]").is_err());
        assert!(Value::parse("nul").is_err());
        assert!(Value::parse("{\"a\":1}x").is_err());
    }

    #[test]
    fn pretty_sorted_like_swift() {
        let v = Value::parse(r#"{"b":1,"a":{"z":2}}"#).unwrap();
        let s = v.to_string_pretty(true);
        assert!(s.contains("\"a\" : {"));
        assert!(s.starts_with("{\n  \"a\" : {\n    \"z\" : 2\n  },\n  \"b\" : 1\n}"));
    }

    #[test]
    fn set_keeps_position() {
        let mut v = Value::parse(r#"{"x":1,"y":2}"#).unwrap();
        v.set("x", Value::Int(9));
        assert_eq!(v.to_string(), r#"{"x":9,"y":2}"#);
        v.set("z", Value::Null);
        assert_eq!(v.to_string(), r#"{"x":9,"y":2,"z":null}"#);
    }
}
