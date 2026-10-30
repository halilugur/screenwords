//! Minimal ZIP reader: central-directory listing plus entry extraction for
//! stored and deflate entries, with CRC verification. Enough to read
//! `.swanim.zip` packages exactly like the app's importer (hidden entries and
//! `__MACOSX/` are skipped one layer up, in [`crate::swanim`]).

use crate::inflate::{crc32, inflate};

#[derive(Debug, Clone)]
pub struct ZipEntry {
    pub name: String,
    pub method: u16,
    pub compressed_size: u64,
    pub uncompressed_size: u64,
    pub crc32: u32,
    pub external_attr: u32,
    pub local_header_offset: u64,
}

impl ZipEntry {
    /// Directory entries end with '/'.
    pub fn is_dir(&self) -> bool {
        self.name.ends_with('/')
    }

    /// Unix mode bits (`external_attr >> 16`); 0 when the writer stored none
    /// (some macOS zips do). Anything that is neither 0 nor a regular file is
    /// treated as a link / special file and refuses the package.
    pub fn is_special_file(&self) -> bool {
        let mode = (self.external_attr >> 16) & 0o170000;
        mode != 0 && mode != 0o100000
    }
}

#[derive(Debug)]
pub struct ZipError(pub String);

impl std::fmt::Display for ZipError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ZipError {}

fn u16le(d: &[u8], off: usize) -> u16 {
    u16::from_le_bytes([d[off], d[off + 1]])
}

fn u32le(d: &[u8], off: usize) -> u32 {
    u32::from_le_bytes([d[off], d[off + 1], d[off + 2], d[off + 3]])
}

/// Finds the end-of-central-directory record (scanning back over a possible
/// comment), then reads every central-directory entry.
pub fn read_entries(data: &[u8]) -> Result<Vec<ZipEntry>, ZipError> {
    const EOCD_SIG: [u8; 4] = [0x50, 0x4B, 0x05, 0x06];
    let min_eocd = 22;
    if data.len() < min_eocd {
        return Err(ZipError("not a zip file (too short)".into()));
    }
    let mut eocd = None;
    let scan_start = data.len().saturating_sub(min_eocd + 65_536);
    let mut i = data.len() - min_eocd;
    loop {
        if data[i..i + 4] == EOCD_SIG {
            // The comment length must reach exactly the end.
            let comment_len = u16le(data, i + 20) as usize;
            if i + min_eocd + comment_len == data.len() {
                eocd = Some(i);
                break;
            }
        }
        if i == scan_start {
            break;
        }
        i -= 1;
    }
    let eocd = eocd.ok_or_else(|| ZipError("no end-of-central-directory record".into()))?;
    let count = u16le(data, eocd + 10) as usize;
    let cd_offset = u32le(data, eocd + 16) as usize;

    const CD_SIG: [u8; 4] = [0x50, 0x4B, 0x01, 0x02];
    let mut entries = Vec::with_capacity(count);
    let mut p = cd_offset;
    for _ in 0..count {
        if p + 46 > data.len() || data[p..p + 4] != CD_SIG {
            return Err(ZipError("corrupt central directory".into()));
        }
        let method = u16le(data, p + 10);
        let crc = u32le(data, p + 16);
        let csize = u32le(data, p + 20) as u64;
        let usize_ = u32le(data, p + 24) as u64;
        let name_len = u16le(data, p + 28) as usize;
        let extra_len = u16le(data, p + 30) as usize;
        let comment_len = u16le(data, p + 32) as usize;
        let external_attr = u32le(data, p + 38);
        let local_offset = u32le(data, p + 42) as u64;
        let name_end = p + 46 + name_len;
        if name_end > data.len() {
            return Err(ZipError("truncated entry name".into()));
        }
        entries.push(ZipEntry {
            name: String::from_utf8_lossy(&data[p + 46..name_end]).into_owned(),
            method,
            compressed_size: csize,
            uncompressed_size: usize_,
            crc32: crc,
            external_attr,
            local_header_offset: local_offset,
        });
        p = name_end + extra_len + comment_len;
    }
    Ok(entries)
}

/// Extracts one entry (stored or deflate), verifying the CRC.
pub fn extract(data: &[u8], entry: &ZipEntry) -> Result<Vec<u8>, ZipError> {
    const LOCAL_SIG: [u8; 4] = [0x50, 0x4B, 0x03, 0x04];
    let off = entry.local_header_offset as usize;
    if off + 30 > data.len() || data[off..off + 4] != LOCAL_SIG {
        return Err(ZipError(format!("corrupt local header for '{}'", entry.name)));
    }
    let name_len = u16le(data, off + 26) as usize;
    let extra_len = u16le(data, off + 28) as usize;
    let data_start = off + 30 + name_len + extra_len;
    let data_end = data_start + entry.compressed_size as usize;
    if data_end > data.len() {
        return Err(ZipError(format!("entry '{}' overruns the archive", entry.name)));
    }
    let raw = &data[data_start..data_end];
    let out = match entry.method {
        0 => raw.to_vec(),
        8 => inflate(raw).map_err(|e| ZipError(format!("entry '{}': {e}", entry.name)))?,
        other => return Err(ZipError(format!("entry '{}': unsupported method {other}", entry.name))),
    };
    if out.len() as u64 != entry.uncompressed_size {
        return Err(ZipError(format!(
            "entry '{}': size mismatch (got {}, expected {})",
            entry.name,
            out.len(),
            entry.uncompressed_size
        )));
    }
    let actual = crc32(&out);
    if actual != entry.crc32 {
        return Err(ZipError(format!(
            "entry '{}': crc mismatch ({:08X} != {:08X})",
            entry.name, actual, entry.crc32
        )));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_zip() {
        assert!(read_entries(b"not a zip at all").is_err());
        assert!(read_entries(&[]).is_err());
    }
}
