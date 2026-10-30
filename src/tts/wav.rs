//! Minimal 16-bit PCM WAV writer.

/// A complete mono 16-bit PCM WAV file in memory. The project embeds these
/// bytes (as a data URI), so writing a sidecar file is only for the CLI.
pub fn wav_bytes(samples: &[f32], rate: u32) -> Vec<u8> {
    let mut data = Vec::with_capacity(samples.len() * 2);
    for &s in samples {
        let v = if s.is_finite() { s.clamp(-1.0, 1.0) } else { 0.0 };
        let q = (v * 32767.0).round() as i16;
        data.extend_from_slice(&q.to_le_bytes());
    }
    let bytes = data.len() as u32;
    let mut out = Vec::with_capacity(44 + data.len());
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + bytes).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&rate.to_le_bytes());
    out.extend_from_slice(&(rate * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits
    out.extend_from_slice(b"data");
    out.extend_from_slice(&bytes.to_le_bytes());
    out.extend_from_slice(&data);
    out
}

pub fn write_wav(path: &std::path::Path, samples: &[f32], rate: u32) -> Result<(), String> {
    std::fs::write(path, wav_bytes(samples, rate))
        .map_err(|e| format!("write {}: {e}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_header_is_well_formed() {
        let dir = std::env::temp_dir().join("sw-wav-test.wav");
        write_wav(&dir, &[0.0, 0.5, -0.5, 1.0], 24000).unwrap();
        let bytes = std::fs::read(&dir).unwrap();
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
        assert_eq!(&bytes[36..40], b"data");
        assert_eq!(bytes.len(), 44 + 8);
        assert_eq!(&bytes[24..28], &24000u32.to_le_bytes());
        // the in-memory form is what the project embeds, byte for byte
        assert_eq!(bytes, wav_bytes(&[0.0, 0.5, -0.5, 1.0], 24000));
    }
}
