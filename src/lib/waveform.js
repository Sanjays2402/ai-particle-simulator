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
