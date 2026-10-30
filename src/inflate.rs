//! Raw DEFLATE decoder (RFC 1951), std-only — enough to read `.swanim.zip`
//! packages written by macOS's zipper and Python's `zipfile` alike.

pub fn inflate(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut out = Vec::new();
    let mut r = BitReader::new(data);
    loop {
        let bfinal = r.bits(1)? as u8;
        let btype = r.bits(2)? as u8;
        match btype {
            0 => {
                // Stored: skip to the byte boundary, then LEN/NLEN.
                r.align_byte();
                let len = r.bytes(2)? as usize;
                let nlen = r.bytes(2)? as usize;
                if len != (!nlen & 0xFFFF) {
                    return Err("stored block length check failed".into());
                }
                out.extend_from_slice(r.take(len)?);
            }
            1 => {
                // Fixed Huffman tables.
                inflate_block(&mut r, &fixed_literal_lengths(), &FIXED_DIST_LENGTHS, &mut out)?;
            }
            2 => {
                // Dynamic tables from the stream.
                let (lit_lengths, dist_lengths) = dynamic_lengths(&mut r)?;
                inflate_block(&mut r, &lit_lengths, &dist_lengths, &mut out)?;
            }
            other => return Err(format!("reserved DEFLATE block type {other}")),
        }
        if bfinal == 1 {
            return Ok(out);
        }
    }
}

struct BitReader<'a> {
    data: &'a [u8],
    pos: usize,    // byte position
    bit: u32,      // current bit index within the byte (0-7)
}

impl<'a> BitReader<'a> {
    fn new(data: &'a [u8]) -> BitReader<'a> {
        BitReader { data, pos: 0, bit: 0 }
    }

    /// LSB-first bit read.
    fn bits(&mut self, count: u32) -> Result<u32, String> {
        let mut value = 0u32;
        for i in 0..count {
            let byte = *self.data.get(self.pos).ok_or("unexpected end of DEFLATE data")?;
            let b = (byte >> self.bit) & 1;
            value |= (b as u32) << i;
            self.bit += 1;
            if self.bit == 8 {
                self.bit = 0;
                self.pos += 1;
            }
        }
        Ok(value)
    }

    fn align_byte(&mut self) {
        if self.bit != 0 {
            self.bit = 0;
            self.pos += 1;
        }
    }

    /// Whole bytes starting at the current (aligned) position.
    fn bytes(&mut self, count: usize) -> Result<u64, String> {
        let mut value = 0u64;
        for i in 0..count {
            let byte = *self.data.get(self.pos).ok_or("unexpected end of DEFLATE data")?;
            value |= (byte as u64) << (8 * i);
            self.pos += 1;
        }
        Ok(value)
    }

    fn take(&mut self, count: usize) -> Result<&'a [u8], String> {
        if self.pos + count > self.data.len() {
            return Err("stored block overruns the input".into());
        }
        let slice = &self.data[self.pos..self.pos + count];
        self.pos += count;
        Ok(slice)
    }
}

/// Canonical Huffman decoding: lengths → (counts, symbols), decoded one bit at
/// a time exactly as RFC 1951 §3.2.2 describes.
struct Huffman {
    counts: [u16; 16],
    symbols: Vec<u16>,
}

impl Huffman {
    fn new(lengths: &[u8]) -> Huffman {
        let mut counts = [0u16; 16];
        for &l in lengths {
            counts[l as usize] += 1;
        }
        counts[0] = 0;
        let mut offsets = [0u16; 16];
        for i in 1..16 {
            offsets[i] = offsets[i - 1] + counts[i - 1];
        }
        let mut symbols = vec![0u16; lengths.len()];
        for (sym, &l) in lengths.iter().enumerate() {
            if l != 0 {
                symbols[offsets[l as usize] as usize] = sym as u16;
                offsets[l as usize] += 1;
            }
        }
        Huffman { counts, symbols }
    }

    fn decode(&self, r: &mut BitReader) -> Result<u16, String> {
        let mut code = 0i32;
        let mut first = 0i32;
        let mut index = 0i32;
        for len in 1..16 {
            code |= r.bits(1)? as i32;
            let count = self.counts[len] as i32;
            if code - count < first {
                return Ok(self.symbols[(index + (code - first)) as usize]);
            }
            index += count;
            first += count;
            first <<= 1;
            code <<= 1;
        }
        Err("invalid Huffman code".into())
    }
}

fn fixed_literal_lengths() -> Vec<u8> {
    // 0-143: 8, 144-255: 9, 256-279: 7, 280-287: 8.
    let mut l = Vec::with_capacity(288);
    l.extend(std::iter::repeat(8).take(144));
    l.extend(std::iter::repeat(9).take(112));
    l.extend(std::iter::repeat(7).take(24));
    l.extend(std::iter::repeat(8).take(8));
    l
}

const FIXED_DIST_LENGTHS: [u8; 30] = [5; 30];

const LENGTH_BASE: [u16; 29] = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115,
    131, 163, 195, 227, 258,
];
const LENGTH_EXTRA: [u8; 29] = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE: [u16; 30] = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
    2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA: [u8; 30] = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12,
    13, 13,
];
const CODE_LENGTH_ORDER: [usize; 19] =
    [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

fn dynamic_lengths(r: &mut BitReader) -> Result<(Vec<u8>, Vec<u8>), String> {
    let hlit = r.bits(5)? as usize + 257;
    let hdist = r.bits(5)? as usize + 1;
    let hclen = r.bits(4)? as usize + 4;
    let mut code_lengths = [0u8; 19];
    for &slot in CODE_LENGTH_ORDER.iter().take(hclen) {
        code_lengths[slot] = r.bits(3)? as u8;
    }
    let cl_huffman = Huffman::new(&code_lengths);
    let mut lengths: Vec<u8> = Vec::with_capacity(hlit + hdist);
    while lengths.len() < hlit + hdist {
        let sym = cl_huffman.decode(r)?;
        match sym {
            0..=15 => lengths.push(sym as u8),
            16 => {
                let prev = *lengths.last().ok_or("length repeat with no previous")?;
                let n = 3 + r.bits(2)?;
                for _ in 0..n {
                    lengths.push(prev);
                }
            }
            17 => {
                let n = 3 + r.bits(3)?;
                for _ in 0..n {
                    lengths.push(0);
                }
            }
            18 => {
                let n = 11 + r.bits(7)?;
                for _ in 0..n {
                    lengths.push(0);
                }
            }
            _ => return Err("invalid code-length symbol".into()),
        }
    }
    if lengths.len() != hlit + hdist {
        return Err("code lengths overflow".into());
    }
    Ok((lengths[..hlit].to_vec(), lengths[hlit..].to_vec()))
}

fn inflate_block(
    r: &mut BitReader,
    lit_lengths: &[u8],
    dist_lengths: &[u8],
    out: &mut Vec<u8>,
) -> Result<(), String> {
    let lit = Huffman::new(lit_lengths);
    let dist = Huffman::new(dist_lengths);
    loop {
        let sym = lit.decode(r)?;
        if sym < 256 {
            out.push(sym as u8);
        } else if sym == 256 {
            return Ok(());
        } else {
            let idx = (sym - 257) as usize;
            if idx >= LENGTH_BASE.len() {
                return Err("invalid length symbol".into());
            }
            let length = LENGTH_BASE[idx] as usize + r.bits(LENGTH_EXTRA[idx] as u32)? as usize;
            let dsym = dist.decode(r)? as usize;
            if dsym >= DIST_BASE.len() {
                return Err("invalid distance symbol".into());
            }
            let distance =
                DIST_BASE[dsym] as usize + r.bits(DIST_EXTRA[dsym] as u32)? as usize;
            if distance > out.len() {
                return Err("distance reaches before the output start".into());
            }
            let from = out.len() - distance;
            for i in 0..length {
                let b = out[from + i];
                out.push(b);
            }
        }
    }
}

/// CRC-32 (IEEE), used to verify zip entries.
pub fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (n, slot) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 != 0 { 0xEDB88320 ^ (c >> 1) } else { c >> 1 };
        }
        *slot = c;
    }
    let mut crc = 0xFFFF_FFFFu32;
    for &b in data {
        crc = table[((crc ^ b as u32) & 0xFF) as usize] ^ (crc >> 8);
    }
    crc ^ 0xFFFF_FFFF
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crc32_known_vector() {
        assert_eq!(crc32(b"123456789"), 0xCBF4_3926);
        assert_eq!(crc32(b""), 0);
    }

    #[test]
    fn decodes_dynamic_huffman_stream() {
        // zlib.compress(b"hello hello hello!", 9):
        // dynamic-Huffman block; skip the 2-byte zlib header and the 4-byte
        // adler32 trailer to get the raw DEFLATE stream.
        let zlib_stream: [u8; 17] = [
            0x78, 0xDA, 0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x57, 0xC8, 0x40, 0x90, 0x8A, 0x00, 0x40,
            0xCC, 0x06, 0x9E,
        ];
        let raw = &zlib_stream[2..zlib_stream.len() - 4];
        let out = inflate(raw).unwrap();
        assert_eq!(String::from_utf8(out).unwrap(), "hello hello hello!");
    }

    #[test]
    fn decodes_stored_block() {
        // zlib.compress(b"x", 0): one stored block.
        let zlib_stream: [u8; 12] = [
            0x78, 0x01, 0x01, 0x01, 0x00, 0xFE, 0xFF, 0x78, 0x00, 0x79, 0x00, 0x79,
        ];
        let raw = &zlib_stream[2..zlib_stream.len() - 4];
        let out = inflate(raw).unwrap();
        assert_eq!(out, b"x");
    }
}
