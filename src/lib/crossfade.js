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
//
// These are the SHIPPED defaults; users can override any slot's
// seconds via long-press (R11.05) — see resolveCrossfadeChips and
// the override helpers below. The exported DURATION_CHIPS array is
// mutated in place when overrides resolve so consumers stay in sync
// without an explicit subscription.
export const DURATION_CHIPS_DEFAULT = [
  { id: 'snap',      label: 'Snap',      seconds: 0.5 },
  { id: 'fast',      label: 'Fast',      seconds: 2.0 },
  { id: 'cinematic', label: 'Cinematic', seconds: 5.0 },
  { id: 'drift',     label: 'Drift',     seconds: 10.0 },
]

export const DURATION_CHIPS = DURATION_CHIPS_DEFAULT.map(c => ({ ...c }))

// Look up a chip by its seconds value. Used by the UI to highlight
// the active chip when the slider lands on a preset value. Tolerates
// floating-point drift via a small epsilon so a 2.0001 slider still
// matches the "Fast" chip. Resolves against the LIVE chip list so
// overridden slots match the user's custom seconds.
export function matchDurationChip(seconds, eps = 0.05) {
  if (!Number.isFinite(seconds)) return null
  for (const chip of DURATION_CHIPS) {
    if (Math.abs(chip.seconds - seconds) <= eps) return chip
  }
  return null
}

// --- Custom overrides (R11.05) ---
// Persist per-slot seconds overrides so users can pick "make Drift
// 15 seconds for this show" via a long-press. Stored shape:
//   { v: 1, items: { drift: 15, snap: 0.25, ... } }

export const CROSSFADE_OVERRIDE_KEY = 'particle-crossfade-overrides-v1'

export function sanitizeCrossfadeOverrides(map) {
  const out = {}
  if (!map || typeof map !== 'object') return out
  const validIds = new Set(DURATION_CHIPS_DEFAULT.map(c => c.id))
  for (const id of Object.keys(map)) {
    if (!validIds.has(id)) continue
    const raw = map[id]
    // Require an originally-finite number; we never invent a default
    // from garbage input (NaN / 'x' / Infinity / undefined → drop).
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    out[id] = clampSeconds(raw)
  }
  return out
}

// True when this chip slot is currently overridden by a custom save.
export function isCrossfadeChipCustom(id, overrides) {
  const safe = sanitizeCrossfadeOverrides(overrides)
  return Object.prototype.hasOwnProperty.call(safe, id)
}

// Merge defaults + overrides into the live DURATION_CHIPS array.
// Mutates in place AND returns the array.
export function resolveCrossfadeChips(overrides) {
  const safe = sanitizeCrossfadeOverrides(overrides)
  for (let i = 0; i < DURATION_CHIPS_DEFAULT.length; i++) {
    const base = DURATION_CHIPS_DEFAULT[i]
    DURATION_CHIPS[i] = Object.prototype.hasOwnProperty.call(safe, base.id)
      ? { ...base, seconds: safe[base.id] }
      : { ...base }
  }
  return DURATION_CHIPS
}

// localStorage helpers — crash-safe.
export function loadCrossfadeOverrides() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(CROSSFADE_OVERRIDE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !parsed.items) return {}
    return sanitizeCrossfadeOverrides(parsed.items)
  } catch { return {} }
}

export function saveCrossfadeOverrides(map) {
  if (typeof localStorage === 'undefined') return false
  try {
    const safe = sanitizeCrossfadeOverrides(map)
    localStorage.setItem(CROSSFADE_OVERRIDE_KEY, JSON.stringify({ v: 1, items: safe }))
    return true
  } catch { return false }
}

export function setCrossfadeOverride(map, id, seconds) {
  const next = { ...sanitizeCrossfadeOverrides(map) }
  next[id] = clampSeconds(seconds)
  return sanitizeCrossfadeOverrides(next)
}

export function clearCrossfadeOverride(map, id) {
  const next = { ...sanitizeCrossfadeOverrides(map) }
  delete next[id]
  return next
}
