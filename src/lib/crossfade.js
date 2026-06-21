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

// One-tap duration chips for the Crossfade panel — instead of dragging
// the slider to the nearest 0.5s tick, the user picks an intent
// ("Snap", "Fast", "Cinematic", "Drift") and the slider follows. All
// values fall inside [BLEND_MIN_SEC, BLEND_MAX_SEC] so the existing
// clamp is a no-op when applied.
export const DURATION_CHIPS = [
  { id: 'snap',      label: 'Snap',      seconds: 0.5 },
  { id: 'fast',      label: 'Fast',      seconds: 2.0 },
  { id: 'cinematic', label: 'Cinematic', seconds: 5.0 },
  { id: 'drift',     label: 'Drift',     seconds: 10.0 },
]

// Look up a chip by its seconds value. Used by the UI to highlight
// the active chip when the slider lands on a preset value. Tolerates
// floating-point drift via a small epsilon so a 2.0001 slider still
// matches the "Fast" chip.
export function matchDurationChip(seconds, eps = 0.05) {
  if (!Number.isFinite(seconds)) return null
  for (const chip of DURATION_CHIPS) {
    if (Math.abs(chip.seconds - seconds) <= eps) return chip
  }
  return null
}
