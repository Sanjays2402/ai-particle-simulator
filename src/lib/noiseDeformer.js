// Trigonometric noise deformer — a cheap, allocation-free wiggle that
// can be layered on top of any preset's particle positions. Driven by
// sin/cos of (idx, time) so it's smooth in both space and time without
// needing a real Perlin / simplex table (the existing renderer is
// already tight; we don't want to pull in a noise lib).
//
// The deformer has three knobs:
//   - amplitude (0..2): peak displacement in world units
//   - frequency (0.1..8): spatial frequency — higher = noisier
//   - speed     (0..4): temporal frequency — higher = faster shimmer
//
// Output is intentionally NOT axis-aligned: each axis uses a different
// trig combination so the noise looks like a tumbling blob, not a
// rectangular oscillation. Pure functions so the math is unit-testable.

export const NOISE_AMP_MIN = 0
export const NOISE_AMP_MAX = 2
export const NOISE_FREQ_MIN = 0.1
export const NOISE_FREQ_MAX = 8
export const NOISE_SPEED_MIN = 0
export const NOISE_SPEED_MAX = 4

function clamp(v, lo, hi, fallback) {
  if (!Number.isFinite(v)) return fallback
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

export function clampAmplitude(v) { return clamp(v, NOISE_AMP_MIN, NOISE_AMP_MAX, 0.5) }
export function clampFrequency(v) { return clamp(v, NOISE_FREQ_MIN, NOISE_FREQ_MAX, 1.5) }
export function clampSpeed(v)     { return clamp(v, NOISE_SPEED_MIN, NOISE_SPEED_MAX, 1.0) }

// Compute the deformation offset for one particle. Returns a 3-element
// array [dx, dy, dz]. Returning an array is fine because callers can
// destructure into pre-allocated targets — keeping a per-axis function
// would force three calls per particle, which is wasteful.
//
// Each axis uses a unique pair so the phase relationship between
// (x,y,z) stays stable across reloads and the noise looks like a
// coherent tumble rather than three independent oscillations.
export function noiseOffset(idx, time, amplitude, frequency, speed) {
  const a = clampAmplitude(amplitude)
  if (a <= 0) return [0, 0, 0]
  const f = clampFrequency(frequency)
  const s = clampSpeed(speed) * time
  // Use idx*f offsets so neighbours see different phases; mix in time
  // so the field shimmers. Different prime-ish constants per axis so
  // x/y/z aren't accidentally in lockstep.
  const dx = Math.sin(idx * f * 0.13 + s * 1.0) * Math.cos(idx * f * 0.07 + s * 0.6)
  const dy = Math.sin(idx * f * 0.17 + s * 1.3) * Math.cos(idx * f * 0.11 + s * 0.9)
  const dz = Math.sin(idx * f * 0.19 + s * 1.7) * Math.cos(idx * f * 0.05 + s * 0.4)
  return [dx * a, dy * a, dz * a]
}

// Apply the offset directly to a target {x,y,z}-like object. Mutates
// in place, allocation-free.
export function applyNoise(target, idx, time, amplitude, frequency, speed) {
  if (!target) return
  const a = clampAmplitude(amplitude)
  if (a <= 0) return
  const f = clampFrequency(frequency)
  const s = clampSpeed(speed) * time
  target.x += Math.sin(idx * f * 0.13 + s * 1.0) * Math.cos(idx * f * 0.07 + s * 0.6) * a
  target.y += Math.sin(idx * f * 0.17 + s * 1.3) * Math.cos(idx * f * 0.11 + s * 0.9) * a
  target.z += Math.sin(idx * f * 0.19 + s * 1.7) * Math.cos(idx * f * 0.05 + s * 0.4) * a
}
