// Wind: global directional drift vector applied to every particle
// each frame, scaled by intensity. Pure math helpers extracted so the
// renderer math can be unit-tested without spinning up R3F.
//
// Direction is expressed in degrees on the XZ plane (azimuth) plus a
// pitch on the Y axis — matches how the LeftSidebar slider thinks
// about it. We convert once per frame to a unit vector and apply.

export const WIND_INTENSITY_MIN = 0
export const WIND_INTENSITY_MAX = 5
export const WIND_AZIMUTH_MIN   = 0
export const WIND_AZIMUTH_MAX   = 360
export const WIND_PITCH_MIN     = -90
export const WIND_PITCH_MAX     = 90

// Named preset configs — one-tap weather chips. Ordered from calmest
// to wildest so the UI reads left-to-right. Off has intensity 0 (so
// toggling it back on doesn't surprise the user with the last wild
// setting). Match the existing slider ranges so the chips never
// silently violate the clamps.
//
// These are the SHIPPED defaults; users can override any slot
// individually via the long-press workflow (see overrideWindPreset
// + resolveWindPresets below).
export const WIND_PRESETS_DEFAULT = [
  { id: 'calm',   label: 'Calm',   intensity: 0.0,  azimuth: 0,   pitch: 0,    hint: 'No drift'                 },
  { id: 'breeze', label: 'Breeze', intensity: 0.6,  azimuth: 45,  pitch: 10,   hint: 'Gentle SE drift'          },
  { id: 'gale',   label: 'Gale',   intensity: 2.2,  azimuth: 90,  pitch: 0,    hint: 'Strong horizontal pull'   },
  { id: 'storm',  label: 'Storm',  intensity: 4.0,  azimuth: 200, pitch: -25,  hint: 'Hurricane: SW + downdraft' },
]

// Live preset list — defaults overlaid with any user overrides loaded
// from localStorage. Components import `WIND_PRESETS` and re-call
// `resolveWindPresets()` after `overrideWindPreset` to refresh.
export const WIND_PRESETS = WIND_PRESETS_DEFAULT.map(p => ({ ...p }))

function clamp(v, lo, hi, fallback) {
  if (!Number.isFinite(v)) return fallback
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

export function clampIntensity(v) { return clamp(v, WIND_INTENSITY_MIN, WIND_INTENSITY_MAX, 0) }
export function clampAzimuth(v)   { return clamp(v, WIND_AZIMUTH_MIN,  WIND_AZIMUTH_MAX,   0) }
export function clampPitch(v)     { return clamp(v, WIND_PITCH_MIN,    WIND_PITCH_MAX,     0) }

// Lookup a wind preset by id; null when unknown. Resolves against the
// LIVE list (defaults + overrides), so UI code that asks "what's
// Storm right now?" gets the user's overridden Storm.
export function findWindPreset(id) {
  if (typeof id !== 'string') return null
  return WIND_PRESETS.find(p => p.id === id) || null
}

// True when the live wind state matches a preset's full config
// (intensity + azimuth + pitch within a small tolerance). Used by the
// UI chip-active highlight so chips light up when the user happens to
// land on those values via the sliders. Tolerance is generous because
// the sliders have step=0.1 / step=1 which can introduce float noise.
export function matchesWindPreset(state, preset, tol = 0.05) {
  if (!state || !preset) return false
  if (Math.abs(clampIntensity(state.intensity) - preset.intensity) > tol) return false
  if (Math.abs(clampAzimuth(state.azimuth)     - preset.azimuth)   > 1.5) return false
  if (Math.abs(clampPitch(state.pitch)         - preset.pitch)     > 1.5) return false
  return true
}

// Convert azimuth (deg, around Y, 0 = +X) + pitch (deg, lift off XZ
// plane) into a unit vector [x, y, z]. Returns the zero vector when
// intensity is 0 so the renderer can early-out on a single dot product.
export function windVector(azimuthDeg, pitchDeg, intensity) {
  const i = clampIntensity(intensity)
  if (i <= 0) return [0, 0, 0]
  const az = (clampAzimuth(azimuthDeg) * Math.PI) / 180
  const pi = (clampPitch(pitchDeg)   * Math.PI) / 180
  const cp = Math.cos(pi)
  // y = sin(pitch); xz lie on the cos(pitch) circle, rotated by azimuth.
  const x = Math.cos(az) * cp
  const z = Math.sin(az) * cp
  const y = Math.sin(pi)
  return [x * i, y * i, z * i]
}

// Per-particle integration step. Mutates `target` in place to keep
// the per-frame loop allocation-free. Returns nothing.
export function applyWind(target, windVec, dt) {
  if (!windVec || (windVec[0] === 0 && windVec[1] === 0 && windVec[2] === 0)) return
  target.x += windVec[0] * dt
  target.y += windVec[1] * dt
  target.z += windVec[2] * dt
}

// Compass label for the azimuth — used by the slider readout so the
// user gets a friendlier hint than "182°".
export function compassFor(azimuthDeg) {
  const az = ((clampAzimuth(azimuthDeg) % 360) + 360) % 360
  // 8-way compass: E, SE, S, SW, W, NW, N, NE in azimuth order.
  // (East = +X axis = 0°, mapped clockwise the way the renderer feels.)
  const labels = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']
  const idx = Math.round(az / 45) % 8
  return labels[idx]
}

// --- Custom preset overrides (R11.04) ---
// Persist per-slot overrides so users can "save the current sliders
// into the Gale chip" via a long-press. Stored shape:
//   { v: 1, items: { gale: { intensity, azimuth, pitch }, ... } }
// Only the three knob values are stored — `label` and `hint` always
// come from the defaults so renaming a slot semantically isn't a
// supported workflow (keeps the chips' meaning predictable).

export const WIND_OVERRIDE_KEY = 'particle-wind-overrides-v1'

// Coerce + sanitize an override dict so a corrupted localStorage
// can't crash the resolver. Drops unknown ids and clamps every value
// to the slider range.
export function sanitizeWindOverrides(map) {
  const out = {}
  if (!map || typeof map !== 'object') return out
  const validIds = new Set(WIND_PRESETS_DEFAULT.map(p => p.id))
  for (const id of Object.keys(map)) {
    if (!validIds.has(id)) continue
    const v = map[id]
    if (!v || typeof v !== 'object') continue
    out[id] = {
      intensity: clampIntensity(v.intensity),
      azimuth:   clampAzimuth(v.azimuth),
      pitch:     clampPitch(v.pitch),
    }
  }
  return out
}

// Capture-the-current-sliders helper — turns a {intensity,azimuth,pitch}
// reading into a frozen override entry. Pure.
export function captureWindOverride(state) {
  return {
    intensity: clampIntensity(state?.intensity),
    azimuth:   clampAzimuth(state?.azimuth),
    pitch:     clampPitch(state?.pitch),
  }
}

// Merge defaults + overrides. Mutates the exported `WIND_PRESETS`
// array in place AND returns the new list so callers can re-render.
// Mutation keeps existing `import { WIND_PRESETS }` consumers in
// sync without forcing every component to subscribe.
export function resolveWindPresets(overrides) {
  const safe = sanitizeWindOverrides(overrides)
  for (let i = 0; i < WIND_PRESETS_DEFAULT.length; i++) {
    const base = WIND_PRESETS_DEFAULT[i]
    const ov = safe[base.id]
    WIND_PRESETS[i] = ov
      ? { ...base, intensity: ov.intensity, azimuth: ov.azimuth, pitch: ov.pitch, hint: `Custom (${ov.intensity.toFixed(1)} · ${ov.azimuth | 0}°)` }
      : { ...base }
  }
  return WIND_PRESETS
}

// True when this preset slot is currently overridden by a custom save.
export function isWindPresetCustom(id, overrides) {
  const safe = sanitizeWindOverrides(overrides)
  return Object.prototype.hasOwnProperty.call(safe, id)
}

// localStorage helpers — components hold the live override dict in
// state and persist via `saveWindOverrides`. `loadWindOverrides` is
// always crash-safe (returns {} on any error).
export function loadWindOverrides() {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(WIND_OVERRIDE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !parsed.items) return {}
    return sanitizeWindOverrides(parsed.items)
  } catch { return {} }
}

export function saveWindOverrides(map) {
  if (typeof localStorage === 'undefined') return false
  try {
    const safe = sanitizeWindOverrides(map)
    localStorage.setItem(WIND_OVERRIDE_KEY, JSON.stringify({ v: 1, items: safe }))
    return true
  } catch { return false }
}

// Functional helpers — return a new overrides dict instead of mutating.
export function setWindOverride(map, id, entry) {
  const next = { ...sanitizeWindOverrides(map) }
  next[id] = captureWindOverride(entry)
  return sanitizeWindOverrides(next)
}

export function clearWindOverride(map, id) {
  const next = { ...sanitizeWindOverrides(map) }
  delete next[id]
  return next
}
