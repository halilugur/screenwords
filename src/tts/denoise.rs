//! Spectral noise reduction for a finished take: the steady hiss a vocoder
//! leaves under speech and in its pauses, turned down without touching the
//! speech. The noise's spectrum is learnt from the take's own noise beds,
//! the frames 30 to 55 dB under its speech (pauses inside sentences, the
//! edges of words; digital silence left out); each STFT bin is attenuated by a
//! Wiener-style gain that is 1 where the bin stands well above the noise and
//! falls to a floor where it is noise. The power it judges is smoothed over
//! neighbouring bins and frames (noise alone fluctuates a lot per bin), and
//! the gain, with fast attack and slow release, over time, so it does not
//! warble ("musical noise"). Speech is left as it was: the louder a frame
//! stands above the noise, the less any of its bins may be cut, nothing at
//! all from 30 dB up, and that protection looks 64 ms ahead so a word's
//! first consonant, quieter than its vowel, is never swallowed. Hann analysis and synthesis, 75 %
//! overlap.

use std::f64::consts::PI;

/// FFT size: 21 ms at 48 kHz, fine enough in frequency for a hiss under speech.
const N: usize = 1024;
const HOP: usize = N / 4;
/// The noise beds: frames this far under the speech (dB below its loud frames)...
const BED_DB: (f64, f64) = (55.0, 30.0);
/// ...or, in a take with too few of them, its quietest share of sounding frames.
const QUIET_SHARE: f64 = 0.1;
const MIN_BED_FRAMES: usize = 8;
/// Over-subtraction: a bin must stand this many times above the noise power to pass untouched.
const OVER: f64 = 3.0;
/// How much of the last frame's smoothed power a frame keeps: one random noise peak is not speech.
const POWER_MEMORY: f64 = 0.5;
/// The most a bin is turned down, in dB.
const MAX_CUT_DB: f64 = 18.0;
/// Below this frame RMS a frame is digital silence (an inserted pause), not noise.
const SILENT: f64 = 1e-6;
/// A frame this far above the noise (dB) may be cut fully; from the second, not at all.
const PROTECT_DB: (f64, f64) = (10.0, 30.0);
/// Frames of look-ahead for the protection (64 ms): a consonant's quiet lead-in
/// into its vowel ("D" of "Dünya") is guarded with the vowel.
const LOOK_AHEAD: usize = 12;

/// In-place iterative radix-2 FFT of `re`/`im` (length a power of two);
/// `inverse` gives the unscaled inverse transform.
fn fft(re: &mut [f64], im: &mut [f64], inverse: bool) {
    let n = re.len();
    let mut j = 0;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j |= bit;
        if i < j {
            re.swap(i, j);
            im.swap(i, j);
        }
    }
    let sign = if inverse { 1.0 } else { -1.0 };
    let mut len = 2;
    while len <= n {
        let (wr, wi) = ((2.0 * PI / len as f64).cos(), sign * (2.0 * PI / len as f64).sin());
        for start in (0..n).step_by(len) {
            let (mut cr, mut ci) = (1.0, 0.0);
            for k in 0..len / 2 {
                let (a, b) = (start + k, start + k + len / 2);
                let (tr, ti) = (re[b] * cr - im[b] * ci, re[b] * ci + im[b] * cr);
                re[b] = re[a] - tr;
                im[b] = im[a] - ti;
                re[a] += tr;
                im[a] += ti;
                (cr, ci) = (cr * wr - ci * wi, cr * wi + ci * wr);
            }
        }
        len <<= 1;
    }
}

/// `samples` with their steady background noise turned down.
pub fn denoise(samples: &[f32]) -> Vec<f32> {
    if samples.len() < N {
        return samples.to_vec();
    }
    let window: Vec<f64> = (0..N).map(|i| 0.5 - 0.5 * (2.0 * PI * i as f64 / N as f64).cos()).collect();
    let padded: Vec<f64> = std::iter::repeat_n(0.0, N).chain(samples.iter().map(|&s| s as f64)).chain(std::iter::repeat_n(0.0, N)).collect();
    let frames = (padded.len() - N) / HOP + 1;
    let bins = N / 2 + 1;
    // the spectrum of every frame
    let mut spectra: Vec<(Vec<f64>, Vec<f64>)> = Vec::with_capacity(frames);
    let mut rms = Vec::with_capacity(frames);
    for f in 0..frames {
        let seg = &padded[f * HOP..f * HOP + N];
        rms.push((seg.iter().map(|v| v * v).sum::<f64>() / N as f64).sqrt());
        let mut re: Vec<f64> = seg.iter().zip(&window).map(|(v, w)| v * w).collect();
        let mut im = vec![0.0; N];
        fft(&mut re, &mut im, false);
        spectra.push((re, im));
    }
    // the noise: mean power per bin over the noise beds
    let mut sounding: Vec<usize> = (0..frames).filter(|&f| rms[f] > SILENT).collect();
    if sounding.is_empty() {
        return samples.to_vec();
    }
    sounding.sort_by(|a, b| rms[*a].total_cmp(&rms[*b]));
    let loud = rms[sounding[(sounding.len() as f64 * 0.95) as usize]];
    let (low, high) = (loud * 10f64.powf(-BED_DB.0 / 20.0), loud * 10f64.powf(-BED_DB.1 / 20.0));
    let beds: Vec<usize> = sounding.iter().copied().filter(|&f| rms[f] >= low && rms[f] <= high).collect();
    let quiet = if beds.len() >= MIN_BED_FRAMES {
        beds
    } else {
        sounding[..((sounding.len() as f64 * QUIET_SHARE).ceil() as usize).max(1)].to_vec()
    };
    let noise: Vec<f64> = (0..bins)
        .map(|k| quiet.iter().map(|&f| spectra[f].0[k].powi(2) + spectra[f].1[k].powi(2)).sum::<f64>() / quiet.len() as f64)
        .collect();
    // how far each frame stands above the noise, looking ahead: the cut it may take
    let floor = 10f64.powf(-MAX_CUT_DB / 20.0);
    let noise_total: f64 = noise.iter().sum::<f64>().max(1e-30);
    let snr_db: Vec<f64> = spectra
        .iter()
        .map(|(re, im)| 10.0 * ((0..bins).map(|k| re[k] * re[k] + im[k] * im[k]).sum::<f64>() / noise_total).max(1e-30).log10())
        .collect();
    let lowest_gain: Vec<f64> = (0..frames)
        .map(|f| {
            let snr = snr_db[f..(f + LOOK_AHEAD + 1).min(frames)].iter().copied().fold(f64::MIN, f64::max);
            let protection = ((snr - PROTECT_DB.0) / (PROTECT_DB.1 - PROTECT_DB.0)).clamp(0.0, 1.0);
            floor + (1.0 - floor) * protection
        })
        .collect();
    // Wiener-style gain per bin, smoothed over three bins, then over time:
    // up at once when speech comes, slowly back down into a pause
    let release = 0.85;
    let mut previous = vec![1.0; bins];
    let mut smoothed = vec![0.0; bins];
    let mut out = vec![0.0; padded.len()];
    let mut norm = vec![0.0; padded.len()];
    for (f, (re, im)) in spectra.iter_mut().enumerate() {
        let power: Vec<f64> = (0..bins).map(|k| re[k] * re[k] + im[k] * im[k]).collect();
        let raw: Vec<f64> = (0..bins)
            .map(|k| {
                let local = (power[k.saturating_sub(1)] + power[k] + power[(k + 1).min(bins - 1)]) / 3.0;
                smoothed[k] = if f == 0 { local } else { POWER_MEMORY * smoothed[k] + (1.0 - POWER_MEMORY) * local };
                if smoothed[k] <= 0.0 { floor } else { (1.0 - OVER * noise[k] / smoothed[k]).max(0.0).sqrt().max(floor) }
            })
            .collect();
        for k in 0..bins {
            let spread = ((raw[k.saturating_sub(1)] + raw[k] + raw[(k + 1).min(bins - 1)]) / 3.0).max(lowest_gain[f]);
            let g = if spread > previous[k] { spread } else { release * previous[k] + (1.0 - release) * spread };
            previous[k] = g;
            re[k] *= g;
            im[k] *= g;
            if k > 0 && k < N / 2 {
                re[N - k] = re[k];
                im[N - k] = -im[k];
            }
        }
        fft(re, im, true);
        for i in 0..N {
            out[f * HOP + i] += re[i] / N as f64 * window[i];
            norm[f * HOP + i] += window[i] * window[i];
        }
    }
    (N..N + samples.len()).map(|i| if norm[i] > 1e-9 { (out[i] / norm[i]) as f32 } else { 0.0 }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(n: usize, hz: f64, amp: f64) -> Vec<f64> {
        (0..n).map(|i| amp * (2.0 * PI * hz * i as f64 / 48000.0).sin()).collect()
    }

    /// Deterministic white-ish noise in [-amp, amp].
    fn hiss(n: usize, amp: f64) -> Vec<f64> {
        let mut x = 0x2545_F491u64;
        (0..n)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                amp * ((x >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0)
            })
            .collect()
    }

    fn rms(x: &[f32]) -> f64 {
        (x.iter().map(|v| (*v as f64).powi(2)).sum::<f64>() / x.len() as f64).sqrt()
    }

    #[test]
    fn the_fft_inverts_itself() {
        let mut re: Vec<f64> = (0..N).map(|i| ((i * 7) % 13) as f64 - 6.0).collect();
        let original = re.clone();
        let mut im = vec![0.0; N];
        fft(&mut re, &mut im, false);
        fft(&mut re, &mut im, true);
        assert!(re.iter().zip(&original).all(|(a, b)| (a / N as f64 - b).abs() < 1e-9));
    }

    #[test]
    fn hiss_in_the_pauses_drops_and_the_speech_stays() {
        // half a second of "speech" (two tones well above the hiss) between
        // two half-second pauses of hiss alone
        let n = 24000;
        let mut take: Vec<f64> = hiss(3 * n, 0.003);
        for (i, v) in tone(n, 220.0, 0.2).iter().zip(tone(n, 1800.0, 0.1)).map(|(a, b)| a + b).enumerate() {
            take[n + i] += v;
        }
        let input: Vec<f32> = take.iter().map(|&v| v as f32).collect();
        let output = denoise(&input);
        assert_eq!(output.len(), input.len());
        // the pause loses most of its hiss (more than 12 dB), short of the
        // 64 ms guarded ahead of the speech
        let pause = 2400..n - 4800;
        let pause_drop = 20.0 * (rms(&input[pause.clone()]) / rms(&output[pause])).log10();
        assert!(pause_drop > 12.0, "pause reduced by {pause_drop:.1} dB");
        // the speech keeps its level within half a decibel
        let middle = n + 4800..2 * n - 4800;
        let speech_change = 20.0 * (rms(&output[middle.clone()]) / rms(&input[middle])).log10();
        assert!(speech_change.abs() < 0.5, "speech changed by {speech_change:.2} dB");
    }

    #[test]
    fn a_word_starting_after_a_pause_keeps_its_onset_and_its_highs() {
        // hiss, then a sudden broadband burst (a plosive) leading into a loud
        // vowel with quiet highs: none of it may be cut
        let n = 24000;
        let mut take = hiss(2 * n, 0.003);
        let burst = hiss(480, 0.15);
        for (i, v) in burst.iter().enumerate() {
            take[n + i] += v;
        }
        for (i, v) in tone(n - 480, 220.0, 0.3).iter().zip(tone(n - 480, 7000.0, 0.004)).map(|(a, b)| a + b).enumerate() {
            take[n + 480 + i] += v;
        }
        let input: Vec<f32> = take.iter().map(|&v| v as f32).collect();
        let output = denoise(&input);
        let change = |r: std::ops::Range<usize>| 20.0 * (rms(&output[r.clone()]) / rms(&input[r])).log10();
        assert!(change(n..n + 480).abs() < 0.5, "onset changed by {:.2} dB", change(n..n + 480));
        // the quiet 7 kHz partial under the vowel survives: high-pass the vowel and compare
        let highs = |x: &[f32]| -> Vec<f32> { (n + 2000..2 * n - 2000).map(|i| x[i] - x[i - 1]).collect() };
        let (hi_in, hi_out) = (highs(&input), highs(&output));
        let hi_change = 20.0 * (rms(&hi_out) / rms(&hi_in)).log10();
        assert!(hi_change.abs() < 0.5, "highs under the vowel changed by {hi_change:.2} dB");
    }

    #[test]
    fn digital_silence_and_short_takes_pass_through() {
        assert_eq!(denoise(&[0.0; 100]), vec![0.0; 100]);
        let silent = vec![0.0f32; 48000];
        assert!(denoise(&silent).iter().all(|v| *v == 0.0));
    }
}
