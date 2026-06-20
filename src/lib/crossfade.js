// Crossfade math — the easing curve applied to blendProgress before it
// hits the lerp, plus the duration clamp used by the store setter.
// Kept here so it's unit-testable without spinning up zustand.
//
// We use a smoothstep so the blend eases in/out instead of jumping at
// the edges — more cinematic than a linear ramp at the same duration.

export const BLEND_MIN_SEC = 0.2
export const BLEND_MAX_SEC = 20

export function clampSeconds(s) {
  if (!Number.isFinite(s)) return 2
  return Math.max(BLEND_MIN_SEC, Math.min(BLEND_MAX_SEC, s))
}

// Hermite smoothstep: 3t² − 2t³. Symmetric ease at 0 and 1.
export function smoothstep(t) {
  if (!Number.isFinite(t)) return 0
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

// Advance a progress value by dt. Returns { progress, done }.
// `done` is true exactly once — the frame the ramp completes.
export function tickProgress(prev, dt, seconds) {
  const s = clampSeconds(seconds)
  const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0
  const next = Math.min(1, prev + safeDt / s)
  return { progress: next, done: next >= 1 && prev < 1 }
}
