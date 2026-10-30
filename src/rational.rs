//! CMTime-style rational time, the timestamp unit of `project.json`
//! (`{"timescale": 1000, "value": 2315}` = 2.315 s). The app mixes timescales
//! freely (1 for timeline positions, 1000 for words/anchors, the media sample
//! rate for asset durations), so every value carries its own timescale and
//! comparisons cross-multiply.

use crate::json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RationalTime {
    pub value: i64,
    pub timescale: i64,
}

impl RationalTime {
    pub const ZERO: RationalTime = RationalTime { value: 0, timescale: 1 };

    pub fn new(value: i64, timescale: i64) -> RationalTime {
        RationalTime { value, timescale }
    }

    pub fn from_json(v: &Value) -> Option<RationalTime> {
        let number = |x: &Value| {
            x.as_i64().or_else(|| x.as_f64().map(|f| f.round() as i64))
        };
        if let (Some(value), Some(timescale)) = (
            v.get("value").and_then(&number),
            v.get("timescale").and_then(&number),
        ) {
            return Some(RationalTime { value, timescale });
        }
        if let (Some(num), Some(den)) = (
            v.get("numerator").and_then(Value::as_i64),
            v.get("denominator").and_then(Value::as_i64),
        ) {
            return Some(RationalTime { value: num, timescale: den });
        }
        None
    }

    pub fn to_json(&self) -> Value {
        let mut o = Value::obj();
        o.set("timescale", Value::Int(self.timescale));
        o.set("value", Value::Int(self.value));
        o
    }

    /// Seconds as f64 (NaN-safe: a zero timescale yields 0).
    pub fn seconds(&self) -> f64 {
        if self.timescale == 0 {
            0.0
        } else {
            self.value as f64 / self.timescale as f64
        }
    }

    pub fn from_seconds(seconds: f64, timescale: i64) -> RationalTime {
        RationalTime { value: (seconds * timescale as f64).round() as i64, timescale }
    }

    /// Resample into `timescale` (rounds to nearest).
    pub fn resampled(&self, timescale: i64) -> RationalTime {
        RationalTime::from_seconds(self.seconds(), timescale)
    }

    pub fn add(&self, other: &RationalTime) -> RationalTime {
        let ts = lcm(self.timescale, other.timescale);
        RationalTime {
            value: self.value * (ts / self.timescale) + other.value * (ts / other.timescale),
            timescale: ts,
        }
    }

    pub fn sub(&self, other: &RationalTime) -> RationalTime {
        let neg = RationalTime { value: -other.value, timescale: other.timescale };
        self.add(&neg)
    }

    /// Ordered comparison via cross-multiplication in i128 (no precision loss,
    /// no overflow for the timescales in real documents).
    pub fn cmp_time(&self, other: &RationalTime) -> std::cmp::Ordering {
        (self.value as i128 * other.timescale as i128)
            .cmp(&(other.value as i128 * self.timescale as i128))
    }

    /// millisecond precision string "1.234 s"
    pub fn format_seconds(&self) -> String {
        format!("{:.3} s", self.seconds())
    }
}

fn gcd(a: i64, b: i64) -> i64 {
    let mut a = a.abs();
    let mut b = b.abs();
    while b != 0 {
        let t = b;
        b = a % b;
        a = t;
    }
    if a == 0 {
        1
    } else {
        a
    }
}

fn lcm(a: i64, b: i64) -> i64 {
    if a == 0 || b == 0 {
        1
    } else {
        (a / gcd(a, b)) * b
    }
}

/// Formats seconds as the app reports timeline positions: `m:ss` (and
/// `h:mm:ss` past an hour).
pub fn format_clock(seconds: f64) -> String {
    let total = seconds.max(0.0);
    let h = (total / 3600.0).floor() as u64;
    let m = ((total - h as f64 * 3600.0) / 60.0).floor() as u64;
    let s = total - h as f64 * 3600.0 - m as f64 * 60.0;
    if h > 0 {
        format!("{}:{:02}:{:04.1}", h, m, s)
    } else {
        format!("{}:{:04.1}", m, s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seconds_and_back() {
        let t = RationalTime::new(2315, 1000);
        assert!((t.seconds() - 2.315).abs() < 1e-9);
        assert_eq!(RationalTime::from_seconds(2.315, 1000), t);
        assert_eq!(RationalTime::from_seconds(4.0, 30), RationalTime::new(120, 30));
    }

    #[test]
    fn cross_timescale_compare_add() {
        let a = RationalTime::new(2315, 1000);
        let b = RationalTime::new(3, 30); // 0.1 s
        assert_eq!(a.cmp_time(&b), std::cmp::Ordering::Greater);
        let sum = a.add(&b);
        assert!((sum.seconds() - 2.415).abs() < 1e-9);
        let diff = a.sub(&a);
        assert_eq!(diff.seconds(), 0.0);
    }

    #[test]
    fn json_roundtrip() {
        let t = RationalTime::new(117909, 22050);
        let v = t.to_json();
        assert_eq!(RationalTime::from_json(&v), Some(t));
    }

    #[test]
    fn clock_format() {
        assert_eq!(format_clock(75.4), "1:15.4");
        assert_eq!(format_clock(3723.5), "1:02:03.5");
    }
}
