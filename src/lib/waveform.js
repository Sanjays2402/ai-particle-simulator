// Audio waveform overlay helpers.
//
// The waveform strip samples the raw time-domain output of the
// shared AudioContext analyser (exposed via window.__particleAudioAnalyser
// by TopBar). The renderer paints a polyline of the samples each
// frame; lib/waveform.js handles the math so the React layer stays
// drawing-only and the math gets unit-tested.
//
// AnalyserNode.getByteTimeDomainData fills a Uint8Array with values
// 0..255 where 128 is silence. We convert to centered floats in
// [-1, 1] for an easy "draw an oscilloscope" workflow.

export const SILENCE_BYTE = 128
export const FULL_AMPLITUDE = 127  // distance from silence at peak +/-

// Convert a raw Uint8Array time-domain sample into normalized
// [-1, 1] floats. Returns a new Float32Array (we don't mutate the
// caller's buffer because TopBar reuses it).
export function bytesToCentered(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return new Float32Array(0)
  const n = bytes.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = (bytes[i] - SILENCE_BYTE) / FULL_AMPLITUDE
  }
  return out
}

// Approximate peak amplitude in a sample window — useful for the
// "is the signal silent?" check, lets the renderer dim/skip when
// nothing's playing.
export function peakAmplitude(centered) {
  if (!centered || centered.length === 0) return 0
  let p = 0
  for (let i = 0; i < centered.length; i++) {
    const a = Math.abs(centered[i])
    if (a > p) p = a
  }
  return p
}

// Project the normalized samples into polyline points (x, y) for a
// canvas of `width` x `height`. Y is centered at height/2 with peak
// excursion = (height/2) - padPx. Returns an array of [x, y] tuples
// at length = min(samples.length, width) so we never draw more
// points than pixels available.
export function projectToCanvas(centered, width, height, padPx = 4) {
  const w = (width > 0 && Number.isFinite(width)) ? width : 100
  const h = (height > 0 && Number.isFinite(height)) ? height : 40
  const out = []
  if (!centered || centered.length === 0) return out
  const n = centered.length
  const stride = Math.max(1, Math.floor(n / w))
  const halfH = h / 2
  const peakPx = halfH - padPx
  for (let x = 0, idx = 0; x < w && idx < n; x++, idx += stride) {
    const v = centered[idx]
    // Clamp [-1, 1] so a hot signal doesn't shoot off-canvas.
    const cv = v < -1 ? -1 : v > 1 ? 1 : v
    const y = halfH - cv * peakPx
    out.push([x, y])
  }
  return out
}

// Sample the live analyser node. Returns a Float32Array of centered
// [-1, 1] values, or an empty array if the analyser is missing.
// `scratch` (optional) is a Uint8Array to reuse for the raw fetch —
// pass a single allocated buffer to avoid per-frame allocations.
export function sampleAnalyser(analyser, scratch) {
  if (!analyser || typeof analyser.getByteTimeDomainData !== 'function') {
    return new Float32Array(0)
  }
  const n = analyser.fftSize || (analyser.frequencyBinCount ? analyser.frequencyBinCount * 2 : 512)
  let buf = scratch
  if (!buf || buf.length !== n) buf = new Uint8Array(n)
  analyser.getByteTimeDomainData(buf)
  return bytesToCentered(buf)
}

// --- Frequency-spectrum mode (new) ----------------------------------
//
// The waveform overlay can also render the *frequency* spectrum instead
// of the raw time-domain wiggle. Spectrum view is dramatically more
// "musical" — bass on the left, treble on the right — and matches what
// every commercial visualizer ships.
//
// AnalyserNode.getByteFrequencyData fills a Uint8Array with values
// 0..255 where 0 is silence and 255 is full intensity. We convert to
// normalized 0..1 floats so the projector stays mode-agnostic.

export const WAVEFORM_MODES = ['time', 'frequency']

// Convert a raw Uint8Array frequency-domain sample (0..255 per bin)
// into normalized 0..1 floats. Always positive, unlike bytesToCentered.
export function bytesToSpectrum(bytes) {
  if (!bytes || typeof bytes.length !== 'number') return new Float32Array(0)
  const n = bytes.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = bytes[i] / 255
  }
  return out
}

// Sample the live analyser's frequency-domain buffer. Returns a
// Float32Array of normalized 0..1 bin intensities. Mirrors
// sampleAnalyser's scratch contract so the overlay can reuse the
// same allocation strategy.
export function sampleAnalyserSpectrum(analyser, scratch) {
  if (!analyser || typeof analyser.getByteFrequencyData !== 'function') {
    return new Float32Array(0)
  }
  // frequencyBinCount = fftSize / 2 — that's the spectrum bin count.
  const n = analyser.frequencyBinCount || ((analyser.fftSize || 512) / 2)
  let buf = scratch
  if (!buf || buf.length !== n) buf = new Uint8Array(n)
  analyser.getByteFrequencyData(buf)
  return bytesToSpectrum(buf)
}

// Project a spectrum Float32Array into a list of [x, barHeight] tuples
// suitable for drawing vertical bars. Reduces the bin count to fit
// `barCount` columns by averaging adjacent bins — keeps the bar count
// small enough to look like a graphic-EQ rather than a noisy noise rug.
// Returns [] for empty input. Bar heights are clamped to [0, maxBarPx].
export function projectSpectrumToBars(spectrum, width, height, barCount = 32, padPx = 4) {
  const w = (width > 0 && Number.isFinite(width)) ? width : 100
  const h = (height > 0 && Number.isFinite(height)) ? height : 40
  const bc = Math.max(1, barCount | 0)
  const out = []
  if (!spectrum || spectrum.length === 0) return out
  const maxBarPx = Math.max(0, h - padPx * 2)
  const binsPerBar = Math.max(1, Math.floor(spectrum.length / bc))
  const colWidth = w / bc
  for (let b = 0; b < bc; b++) {
    let sum = 0
    let count = 0
    const start = b * binsPerBar
    for (let i = start; i < start + binsPerBar && i < spectrum.length; i++) {
      sum += spectrum[i]
      count++
    }
    const avg = count > 0 ? sum / count : 0
    const barH = Math.max(0, Math.min(maxBarPx, avg * maxBarPx))
    out.push([b * colWidth, barH])
  }
  return out
}

// Log-frequency variant — instead of linear binsPerBar, the i-th bar
// covers an exponentially widening range of bins. This matches how
// humans perceive pitch (octaves are equal-spaced in log frequency,
// not linear) and brings out the musical structure: bass occupies a
// large chunk of the screen, treble doesn't get squeezed into 2 bars
// at the far right.
//
// Math: the spectrum has N bins indexed [0..N-1]. We map each bar's
// start/end to bins via:
//   start_i = round((N) * (10^(i/B) - 1) / (10 - 1))    (zero-based)
// where B = barCount. This is a "log10 over [0..1]" curve renormalised
// so bar 0 starts at bin 0 and bar B-1 ends near bin N-1.
//
// We guard against degenerate cases: when start_i === end_i (which
// happens for the first few bars when N << B), we still average the
// single bin so the bar height isn't zero.
export function projectSpectrumToLogBars(spectrum, width, height, barCount = 32, padPx = 4) {
  const w = (width > 0 && Number.isFinite(width)) ? width : 100
  const h = (height > 0 && Number.isFinite(height)) ? height : 40
  const bc = Math.max(1, barCount | 0)
  const out = []
  if (!spectrum || spectrum.length === 0) return out
  const N = spectrum.length
  const maxBarPx = Math.max(0, h - padPx * 2)
  const colWidth = w / bc
  // Pre-compute the cumulative-log denominator so we can map bar i
  // to a bin offset in [0..N).
  const denom = Math.pow(10, 1) - 1  // = 9, the curve's tail at i=B
  for (let i = 0; i < bc; i++) {
    const t0 = i / bc
    const t1 = (i + 1) / bc
    // Two-anchor log curve — start at 0, end at N when t=1.
    const start = Math.floor(N * (Math.pow(10, t0) - 1) / denom)
    let end     = Math.floor(N * (Math.pow(10, t1) - 1) / denom)
    if (end <= start) end = start + 1  // ensure at least one bin / bar
    if (end > N) end = N
    let sum = 0
    let count = 0
    for (let j = start; j < end; j++) {
      sum += spectrum[j]
      count++
    }
    const avg = count > 0 ? sum / count : 0
    const barH = Math.max(0, Math.min(maxBarPx, avg * maxBarPx))
    out.push([i * colWidth, barH])
  }
  return out
}

// Validator — accept only the documented modes, fall through to 'time'.
export function normalizeWaveformMode(mode) {
  return WAVEFORM_MODES.includes(mode) ? mode : 'time'
}
