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
export const WIND_PRESETS = [
  { id: 'calm',   label: 'Calm',   intensity: 0.0,  azimuth: 0,   pitch: 0,    hint: 'No drift'                 },
  { id: 'breeze', label: 'Breeze', intensity: 0.6,  azimuth: 45,  pitch: 10,   hint: 'Gentle SE drift'          },
  { id: 'gale',   label: 'Gale',   intensity: 2.2,  azimuth: 90,  pitch: 0,    hint: 'Strong horizontal pull'   },
  { id: 'storm',  label: 'Storm',  intensity: 4.0,  azimuth: 200, pitch: -25,  hint: 'Hurricane: SW + downdraft' },
]

function clamp(v, lo, hi, fallback) {
  if (!Number.isFinite(v)) return fallback
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

export function clampIntensity(v) { return clamp(v, WIND_INTENSITY_MIN, WIND_INTENSITY_MAX, 0) }
export function clampAzimuth(v)   { return clamp(v, WIND_AZIMUTH_MIN,  WIND_AZIMUTH_MAX,   0) }
export function clampPitch(v)     { return clamp(v, WIND_PITCH_MIN,    WIND_PITCH_MAX,     0) }

// Lookup a wind preset by id; null when unknown.
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
