// Camera shake: convert a beat impulse (0..1, decays over ~250ms) into
// a small per-axis offset for the active camera. The renderer reads
// `cameraShakeOffset(impulse, intensity, time)` once per frame and
// applies the returned [dx, dy] to camera.position.
//
// Design notes:
// - We modulate the impulse by a deterministic sin/cos pair seeded on
//   `time` so it looks like real shake (not a constant nudge) without
//   needing per-frame state.
// - Max base amplitude is 0.35 world units at intensity=1; clamped so
//   no preset can throw the camera into orbit even at extreme bass.
// - Always returns finite numbers — bad inputs (NaN, Infinity, missing
//   impulse) degrade gracefully to zero so the simulation never breaks.

const MAX_AMPLITUDE = 0.35

export function cameraShakeOffset(impulse, intensity, time) {
  // Guard inputs: anything weird → no shake.
  if (!Number.isFinite(impulse) || !Number.isFinite(intensity) || !Number.isFinite(time)) {
    return [0, 0]
  }
  const i = Math.max(0, Math.min(1, impulse))
  const k = Math.max(0, Math.min(1, intensity))
  if (i === 0 || k === 0) return [0, 0]
  // Each frame we sample two staggered sinusoids so x and y don't
  // jitter in lockstep. Frequencies are different primes so the
  // pattern doesn't repeat for ~tens of seconds.
  const amp = MAX_AMPLITUDE * i * k
  const dx = amp * Math.sin(time * 37.1)
  const dy = amp * Math.cos(time * 41.7)
  return [dx, dy]
}

// Apply a shake offset directly to a camera-like object (anything with
// a `.position` exposing x/y/z). Returns the offset that was applied
// so the caller can subtract it next frame to restore the rest pose.
export function applyShake(camera, impulse, intensity, time) {
  if (!camera || !camera.position) return [0, 0]
  const [dx, dy] = cameraShakeOffset(impulse, intensity, time)
  camera.position.x += dx
  camera.position.y += dy
  return [dx, dy]
}

// Compose two shake offsets — used in tests to assert linearity.
export function addOffsets(a, b) {
  return [a[0] + b[0], a[1] + b[1]]
}

export const SHAKE_MAX_AMPLITUDE = MAX_AMPLITUDE
