use wasm_bindgen::prelude::*;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub fn apply_gain(samples: &[f32], gain: f32) -> Vec<f32> {
    let limit: f32 = 0.95;
    samples
        .iter()
        .map(|&s| {
            let scaled = s * gain;
            if scaled > limit {
                limit + (1.0 - (-(scaled - limit) / (1.0 - limit)).exp()) * (1.0 - limit)
            } else if scaled < -limit {
                -limit - (1.0 - (-(-scaled - limit) / (1.0 - limit)).exp()) * (1.0 - limit)
            } else {
                scaled
            }
        })
        .collect()
}

pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl Biquad {
    pub fn new(b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) -> Self {
        Biquad { b0, b1, b2, a1, a2, x1: 0.0, x2: 0.0, y1: 0.0, y2: 0.0 }
    }

    pub fn process(&mut self, x: f32) -> f32 {
        let y = self.b0 * x + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = y;
        y
    }

    pub fn reset(&mut self) {
        self.x1 = 0.0;
        self.x2 = 0.0;
        self.y1 = 0.0;
        self.y2 = 0.0;
    }
}

fn peaking_eq_coeffs(freq: f32, gain_db: f32, q: f32, sample_rate: f32) -> (f32, f32, f32, f32, f32) {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let alpha = omega.sin() / (2.0 * q);
    let cos_w = omega.cos();

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w;
    let a2 = 1.0 - alpha / a;

    (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

fn low_shelf_coeffs(freq: f32, gain_db: f32, s: f32, sample_rate: f32) -> (f32, f32, f32, f32, f32) {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let sin_w = omega.sin();
    let cos_w = omega.cos();
    let alpha = sin_w / 2.0 * ((a + 1.0 / a) * (1.0 / s - 1.0) + 2.0);
    let sqrt_a = a.sqrt();

    let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha);
    let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w);
    let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha);
    let a0 = (a + 1.0) + (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha;
    let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w);
    let a2 = (a + 1.0) + (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha;

    (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

fn high_shelf_coeffs(freq: f32, gain_db: f32, s: f32, sample_rate: f32) -> (f32, f32, f32, f32, f32) {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let sin_w = omega.sin();
    let cos_w = omega.cos();
    let alpha = sin_w / 2.0 * ((a + 1.0 / a) * (1.0 / s - 1.0) + 2.0);
    let sqrt_a = a.sqrt();

    let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha);
    let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w);
    let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha);
    let a0 = (a + 1.0) - (a - 1.0) * cos_w + 2.0 * sqrt_a * alpha;
    let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w);
    let a2 = (a + 1.0) - (a - 1.0) * cos_w - 2.0 * sqrt_a * alpha;

    (b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0)
}

#[wasm_bindgen]
#[derive(Default)]
pub struct Equalizer {
    bands: Vec<Biquad>,
}

#[wasm_bindgen]
impl Equalizer {
    pub fn new() -> Self {
        Equalizer::default()
    }

    pub fn add_peaking_band(&mut self, freq: f32, gain_db: f32, q: f32, sample_rate: f32) {
        let (b0, b1, b2, a1, a2) = peaking_eq_coeffs(freq, gain_db, q, sample_rate);
        self.bands.push(Biquad::new(b0, b1, b2, a1, a2));
    }

    pub fn add_low_shelf(&mut self, freq: f32, gain_db: f32, s: f32, sample_rate: f32) {
        let (b0, b1, b2, a1, a2) = low_shelf_coeffs(freq, gain_db, s, sample_rate);
        self.bands.push(Biquad::new(b0, b1, b2, a1, a2));
    }

    pub fn add_high_shelf(&mut self, freq: f32, gain_db: f32, s: f32, sample_rate: f32) {
        let (b0, b1, b2, a1, a2) = high_shelf_coeffs(freq, gain_db, s, sample_rate);
        self.bands.push(Biquad::new(b0, b1, b2, a1, a2));
    }

    pub fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        samples.iter().map(|&s| {
            let mut x = s;
            for band in &mut self.bands {
                x = band.process(x);
            }
            x
        }).collect()
    }

    pub fn reset(&mut self) {
        for band in &mut self.bands {
            band.reset();
        }
    }

    pub fn clear(&mut self) {
        self.bands.clear();
    }
}

struct Compressor {
    threshold: f32,
    ratio: f32,
    knee: f32,
    attack: f32,
    release: f32,
    envelope: f32,
    sample_rate: f32,
}

impl Compressor {
    fn new(threshold: f32, ratio: f32, knee: f32, attack: f32, release: f32, sample_rate: f32) -> Self {
        Compressor { threshold, ratio, knee, attack, release, envelope: 0.0, sample_rate }
    }

    fn process(&mut self, samples: &[f32]) -> Vec<f32> {
        let attack_coeff = (-1.0 / (self.attack * self.sample_rate)).exp();
        let release_coeff = (-1.0 / (self.release * self.sample_rate)).exp();

        samples.iter().map(|&s| {
            let abs_s = s.abs();
            let alpha = if abs_s > self.envelope { attack_coeff } else { release_coeff };
            self.envelope = alpha * self.envelope + (1.0 - alpha) * abs_s;

            let db = 20.0 * self.envelope.log10();
            let db_out = if db > self.threshold + self.knee / 2.0 {
                self.threshold + (db - self.threshold) / self.ratio
            } else if db > self.threshold - self.knee / 2.0 {
                db + ((1.0 / self.ratio - 1.0) * (db - self.threshold + self.knee / 2.0).powi(2))
                    / (2.0 * self.knee)
            } else {
                db
            };

            let gain = 10.0_f32.powf((db_out - db) / 20.0);
            s * gain
        }).collect()
    }
}

#[wasm_bindgen]
pub fn apply_compressor(samples: &[f32], threshold: f32, ratio: f32, knee: f32,
    attack: f32, release: f32, sample_rate: f32) -> Vec<f32>
{
    let mut c = Compressor::new(threshold, ratio, knee, attack, release, sample_rate);
    c.process(samples)
}

#[wasm_bindgen]
pub fn time_stretch(samples: &[f32], ratio: f32, sample_rate: f32) -> Vec<f32> {
    if ratio <= 0.0 || !ratio.is_finite() {
        return samples.to_vec();
    }

    let window_size = (0.03 * sample_rate) as usize;
    let hop_in = (window_size as f32 / 4.0) as usize;
    let hop_out = (hop_in as f32 * ratio) as usize;

    if hop_out == 0 || window_size == 0 || samples.len() < window_size {
        return samples.to_vec();
    }

    let out_len = ((samples.len() as f32) / ratio) as usize;
    let mut output = vec![0.0f32; out_len];

    let hanning: Vec<f32> = (0..window_size)
        .map(|i| 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (window_size - 1) as f32).cos()))
        .collect();

    let mut in_idx: usize = 0;
    let mut out_idx: usize = 0;

    while in_idx + window_size <= samples.len() && out_idx + window_size <= output.len() {
        for (i, &win) in hanning.iter().enumerate().take(window_size) {
            let src = in_idx + i;
            let dst = out_idx + i;
            if src < samples.len() && dst < output.len() {
                output[dst] += samples[src] * win;
            }
        }
        in_idx += hop_in;
        out_idx += hop_out;
    }

    let norm = hop_in as f32 / hop_out as f32;
    for s in output.iter_mut() {
        *s *= norm;
    }

    output
}

fn fft(samples: &[f32]) -> Vec<f32> {
    let n = samples.len().next_power_of_two();
    let mut real: Vec<f32> = samples.iter().copied().chain(std::iter::repeat(0.0)).take(n).collect();
    let mut imag = vec![0.0f32; n];

    let mut j: usize = 0;
    for i in 0..n {
        if i < j {
            real.swap(i, j);
            imag.swap(i, j);
        }
        let mut m = n >> 1;
        while m > 0 && (j & m) != 0 {
            j ^= m;
            m >>= 1;
        }
        j ^= m;
    }

    let mut step = 1;
    while step < n {
        let half_step = step;
        step <<= 1;
        let wlen = -(std::f32::consts::PI / half_step as f32);
        for i in (0..n).step_by(step) {
            let wr = wlen.cos();
            let wi = wlen.sin();
            let mut w_r = 1.0;
            let mut w_i = 0.0;
            for j in 0..half_step {
                let k = i + j + half_step;
                let tr = w_r * real[k] - w_i * imag[k];
                let ti = w_r * imag[k] + w_i * real[k];
                real[k] = real[i + j] - tr;
                imag[k] = imag[i + j] - ti;
                real[i + j] += tr;
                imag[i + j] += ti;
                let new_wr = wr * w_r - wi * w_i;
                w_i = wr * w_i + wi * w_r;
                w_r = new_wr;
            }
        }
    }

    let half = n / 2;
    let mut magnitudes = vec![0.0f32; half];
    for i in 0..half {
        magnitudes[i] = (real[i] * real[i] + imag[i] * imag[i]).sqrt() / n as f32;
    }
    magnitudes
}

#[wasm_bindgen]
pub fn compute_spectrum(samples: &[f32]) -> Vec<f32> {
    fft(samples)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gain_neutral() {
        let samples = vec![0.5, -0.3, 0.0, 0.8, -0.9];
        let result = apply_gain(&samples, 1.0);
        assert_eq!(result.len(), samples.len());
        assert!((result[0] - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_gain_boost() {
        let samples = vec![0.1, -0.1];
        let result = apply_gain(&samples, 2.0);
        assert!(result[0] > 0.19 && result[0] <= 0.95);
    }

    #[test]
    fn test_equalizer_basic() {
        let mut eq = Equalizer::new();
        eq.add_peaking_band(1000.0, 0.0, 1.0, 44100.0);
        let samples = vec![1.0, -1.0, 0.5, -0.5];
        let result = eq.process(&samples);
        assert_eq!(result.len(), samples.len());
    }

    #[test]
    fn test_time_stretch_identity() {
        let samples = vec![0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
        let result = time_stretch(&samples, 1.0, 44100.0);
        assert_eq!(result.len(), samples.len());
    }

    #[test]
    fn test_time_stretch_half() {
        let samples: Vec<f32> = (0..44100).map(|i| (i as f32 / 44100.0 * 440.0 * 2.0 * std::f32::consts::PI).sin()).collect();
        let result = time_stretch(&samples, 2.0, 44100.0);
        assert!(result.len() < samples.len());
    }

    #[test]
    fn test_compressor() {
        let samples = vec![0.9, -0.85, 0.7, -0.6, 0.5];
        let result = apply_compressor(&samples, -24.0, 4.0, 6.0, 0.002, 0.1, 44100.0);
        assert_eq!(result.len(), samples.len());
    }

    #[test]
    fn test_spectrum() {
        let samples: Vec<f32> = (0..1024).map(|i| (i as f32 / 1024.0 * 440.0 * 2.0 * std::f32::consts::PI).sin()).collect();
        let spectrum = compute_spectrum(&samples);
        assert_eq!(spectrum.len(), 512);
    }
}
