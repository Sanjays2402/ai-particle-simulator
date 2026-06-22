// Web MIDI mapping — bind incoming Control Change (CC) messages to
// store actions. Lets users drive any live slider (particle count,
// glow, wind, FX intensities, audio shake, etc.) from a hardware
// MIDI controller (Launch Control, nanoKONTROL, MPK Mini...).
//
// MIDI message layout (3-byte short messages):
//   data[0] = status byte: high nibble = type (0xB0 = CC, 0x90 = NoteOn,
//             0x80 = NoteOff), low nibble = channel (0..15).
//   data[1] = CC number (0..127)  OR  note number for NoteOn/Off.
//   data[2] = value (0..127)      OR  velocity for NoteOn/Off.
//
// We model bindings as { ccNumber: actionId }. CC is sufficient for
// the simulator's needs and keeps the data model minimal; channel is
// ignored (most consumer controllers only emit on channel 1 anyway).
//
// "Actions" here are not the keymap actions — they're store-driven
// continuous values. The ACTIONS table maps a stable id to:
//   - a human label
//   - a getter that returns the current store value
//   - a setter accepting a normalized [0..1] value (CC/127)
//
// The setter knows how to convert [0..1] back to the slider's native
// range. This way the UI only has to render a dropdown of action ids;
// the lib handles the math.
//
// Two action FAMILIES exist:
//   1. Built-in static actions   (the original 14 — particleCount,
//      speed, glow, etc.). Stable ids, never change at runtime.
//   2. Named-attractor actions   (R12.05). Composed at runtime from
//      whatever attractors the user has saved. Action id format:
//      `attr:<attractorId>:strength` (so e.g. `attr:attr-3:strength`
//      drives the strength slider of the attractor with id `attr-3`).
//      These are resolved through resolveActionForId(id, store).

import { clampStrength, clampRadius, clampPositionScalar, STRENGTH_MAX, RADIUS_MIN, RADIUS_MAX, POSITION_MIN, POSITION_MAX } from './namedAttractors.js'

export const STORAGE_KEY = 'particle-midi-map-v1'

// Built-in action prefix used by every namespaced action. Stable so we
// can pattern-match attractor actions without colliding with the
// historic 14 static ids (none of which contain a colon).
export const ATTRACTOR_ACTION_PREFIX = 'attr:'
export const ATTRACTOR_FIELD_STRENGTH = 'strength'
// R13.18 — extend the per-attractor field family beyond strength.
// Each field gets its own CC routing slot in the UI; the action
// id format is `attr:<id>:<field>` so existing strength bindings
// keep working unchanged. Fields:
//   - strength  → 0..3   (R12.05, existing)
//   - radius    → 4..16  (R13.18, new — sculpt influence size live)
//   - x / y / z → ±50    (R13.18, new — sweep the field through 3D)
export const ATTRACTOR_FIELD_RADIUS = 'radius'
export const ATTRACTOR_FIELD_X = 'x'
export const ATTRACTOR_FIELD_Y = 'y'
export const ATTRACTOR_FIELD_Z = 'z'
// R15.16 — route a CC to the per-attractor ENABLED flag. Continuous
// controllers (sliders, knobs) sweep through every intermediate value;
// blindly routing them to a boolean would chatter the attractor on/off
// every frame. Instead we use a Schmitt-trigger style hysteresis:
//   - flip ON  when v01 rises above HYSTERESIS_ON  (0.55)
//   - flip OFF when v01 falls below HYSTERESIS_OFF (0.45)
// Inside the dead-band (0.45..0.55) the binding holds its previous
// state, so a noisy knob at 0.50 doesn't oscillate. The per-binding
// previous state lives on the live attractor (a.enabled) — no extra
// state map needed.
export const ATTRACTOR_FIELD_ENABLED = 'enabled'
export const HYSTERESIS_ON  = 0.55
export const HYSTERESIS_OFF = 0.45
export const ATTRACTOR_FIELDS = [
  ATTRACTOR_FIELD_STRENGTH,
  ATTRACTOR_FIELD_RADIUS,
  ATTRACTOR_FIELD_X,
  ATTRACTOR_FIELD_Y,
  ATTRACTOR_FIELD_Z,
  ATTRACTOR_FIELD_ENABLED,
]
const ATTRACTOR_FIELD_SET = new Set(ATTRACTOR_FIELDS)

// Build the namespaced action id for a given attractor + field.
// Validates against ATTRACTOR_FIELDS so a typo in caller code can't
// silently produce a binding that resolves to null at apply time.
export function attractorActionId(attractorId, field = ATTRACTOR_FIELD_STRENGTH) {
  if (typeof attractorId !== 'string' || !attractorId) return null
  if (!ATTRACTOR_FIELD_SET.has(field)) return null
  return `${ATTRACTOR_ACTION_PREFIX}${attractorId}:${field}`
}

// Parse an action id back into { attractorId, field } or null when
// not an attractor action. Pure — no store lookup. Returns null on
// an unknown field so a stale binding to an old field name (e.g.
// if we later rename one) becomes a silent no-op.
export function parseAttractorActionId(id) {
  if (typeof id !== 'string' || !id.startsWith(ATTRACTOR_ACTION_PREFIX)) return null
  const rest = id.slice(ATTRACTOR_ACTION_PREFIX.length)
  const idx = rest.indexOf(':')
  if (idx <= 0 || idx === rest.length - 1) return null
  const field = rest.slice(idx + 1)
  if (!ATTRACTOR_FIELD_SET.has(field)) return null
  return { attractorId: rest.slice(0, idx), field }
}

// Registry of bindable built-in actions. Each entry maps a stable id
// to the store value range so we can convert CC values back. The setter
// signature is (value01, store) — `store` is `useStore.getState()`.
//
// IMPORTANT: kept conservative — only "continuous" controls (sliders)
// belong here. Toggles can be added later via a separate NoteOn map.
export const ACTIONS = [
  { id: 'particleCount', label: 'Particle Count',  min: 1000, max: 100000, set: (v01, s) => s.setParticleCount(Math.round(1000 + v01 * 99000)) },
  { id: 'speed',         label: 'Speed',           min: 0,    max: 5,      set: (v01, s) => s.setSpeed(v01 * 5) },
  { id: 'glow',          label: 'Glow Intensity',  min: 0,    max: 1,      set: (v01, s) => s.setGlowIntensity(v01) },
  { id: 'orbit',         label: 'Orbit Speed',     min: 0.1,  max: 2,      set: (v01, s) => s.setOrbitSpeed(0.1 + v01 * 1.9) },
  { id: 'attract',       label: 'Attract Strength',min: 0,    max: 8,      set: (v01, s) => s.setAttractStrength(v01 * 8) },
  { id: 'windInt',       label: 'Wind Intensity',  min: 0,    max: 5,      set: (v01, s) => s.setWindIntensity(v01 * 5) },
  { id: 'windAz',        label: 'Wind Azimuth',    min: 0,    max: 360,    set: (v01, s) => s.setWindAzimuth(v01 * 360) },
  { id: 'noiseAmp',      label: 'Noise Amplitude', min: 0,    max: 2,      set: (v01, s) => s.setNoiseAmplitude(v01 * 2) },
  { id: 'noiseFreq',     label: 'Noise Frequency', min: 0,    max: 5,      set: (v01, s) => s.setNoiseFrequency(v01 * 5) },
  { id: 'caInt',         label: 'CA Intensity',    min: 0,    max: 0.02,   set: (v01, s) => s.setChromaticIntensity(v01 * 0.02) },
  { id: 'vgInt',         label: 'Vignette',        min: 0,    max: 1,      set: (v01, s) => s.setVignetteIntensity(v01) },
  { id: 'fgInt',         label: 'Film Grain',      min: 0,    max: 0.5,    set: (v01, s) => s.setFilmGrainIntensity(v01 * 0.5) },
  { id: 'shakeInt',      label: 'Shake Intensity', min: 0,    max: 1,      set: (v01, s) => s.setCameraShakeIntensity(v01) },
  { id: 'paletteMix',    label: 'Palette Mix',     min: 0,    max: 1,      set: (v01, s) => s.setPaletteMix(v01) },
]

const ACTION_BY_ID = new Map(ACTIONS.map(a => [a.id, a]))

// Resolve a binding id to an executable action. Built-in ids hit the
// static ACTIONS map; attractor ids synthesize an action on the fly
// from the current store state. Returns null when the id is unknown
// OR when an attractor action references an attractor that no longer
// exists (so a stale binding becomes a no-op instead of crashing).
//
// R13.18 — supports all five attractor fields: strength, radius,
// x, y, z. The setter for x/y/z patches the `position` triple in
// place so the renderer can pick up the swept axis on the next
// frame without resetting the others. Each field uses a `set`
// closure over its own clamp + range so the CC normalisation
// (0..1) maps to the right native scale.
export function resolveActionForId(id, store) {
  if (typeof id !== 'string') return null
  const builtin = ACTION_BY_ID.get(id)
  if (builtin) return builtin
  const parsed = parseAttractorActionId(id)
  if (!parsed) return null
  if (!store || !Array.isArray(store.namedAttractors)) return null
  const target = store.namedAttractors.find(a => a && a.id === parsed.attractorId)
  if (!target) return null
  if (parsed.field === ATTRACTOR_FIELD_STRENGTH) {
    return {
      id, attractor: target, field: parsed.field,
      label: `${target.name} · Strength`,
      min: 0, max: STRENGTH_MAX,
      set: (v01, s) => {
        if (typeof s.updateNamedAttractor === 'function') {
          s.updateNamedAttractor(target.id, { strength: clampStrength(v01 * STRENGTH_MAX) })
        }
      },
    }
  }
  if (parsed.field === ATTRACTOR_FIELD_RADIUS) {
    return {
      id, attractor: target, field: parsed.field,
      label: `${target.name} · Radius`,
      min: RADIUS_MIN, max: RADIUS_MAX,
      set: (v01, s) => {
        if (typeof s.updateNamedAttractor === 'function') {
          const next = RADIUS_MIN + v01 * (RADIUS_MAX - RADIUS_MIN)
          s.updateNamedAttractor(target.id, { radius: clampRadius(next) })
        }
      },
    }
  }
  if (parsed.field === ATTRACTOR_FIELD_X || parsed.field === ATTRACTOR_FIELD_Y || parsed.field === ATTRACTOR_FIELD_Z) {
    const axis = parsed.field
    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2
    return {
      id, attractor: target, field: axis,
      label: `${target.name} · ${axis.toUpperCase()}`,
      min: POSITION_MIN, max: POSITION_MAX,
      set: (v01, s) => {
        if (typeof s.updateNamedAttractor !== 'function') return
        // Look up the LIVE attractor at apply-time (not the closed-over
        // snapshot) so concurrent updates to other axes aren't undone.
        const live = Array.isArray(s.namedAttractors)
          ? s.namedAttractors.find(a => a && a.id === target.id)
          : null
        const basePos = Array.isArray(live && live.position) ? live.position : [0, 0, 0]
        const nextPos = [basePos[0], basePos[1], basePos[2]]
        nextPos[axisIdx] = clampPositionScalar(POSITION_MIN + v01 * (POSITION_MAX - POSITION_MIN))
        s.updateNamedAttractor(target.id, { position: nextPos })
      },
    }
  }
  if (parsed.field === ATTRACTOR_FIELD_ENABLED) {
    return {
      id, attractor: target, field: parsed.field,
      label: `${target.name} · Enabled`,
      min: 0, max: 1,
      set: (v01, s) => {
        if (typeof s.updateNamedAttractor !== 'function') return
        // Read the LIVE attractor's current enabled flag so the
        // hysteresis decision sees the same state the user sees.
        const live = Array.isArray(s.namedAttractors)
          ? s.namedAttractors.find(a => a && a.id === target.id)
          : null
        if (!live) return
        const wasEnabled = live.enabled !== false  // default true
        const nextEnabled = applyEnabledHysteresis(wasEnabled, v01)
        if (nextEnabled === wasEnabled) return  // no-op — hold previous state
        s.updateNamedAttractor(target.id, { enabled: nextEnabled })
      },
    }
  }
  return null
}

// R15.16 — Schmitt-trigger style hysteresis for the per-attractor
// ENABLED routing. Pure helper so the decision logic is unit-testable
// without a store.
//
// Behaviour:
//   - When already ENABLED:  drop to OFF only when v01 falls BELOW
//                            HYSTERESIS_OFF (0.45). Above 0.45 stays
//                            on, regardless of how high.
//   - When already DISABLED: rise to ON only when v01 climbs ABOVE
//                            HYSTERESIS_ON (0.55). Below 0.55 stays
//                            off.
//   - Inside the dead-band (0.45..0.55): hold previous state. This
//     is what stops a noisy knob at "half" from chattering on/off
//     every frame.
//
// The thresholds are constants (not opts) on purpose: a per-attractor
// override would push complexity without obvious user benefit. If we
// ever need it, the constants are exported and a future overload can
// accept opts.
export function applyEnabledHysteresis(wasEnabled, v01) {
  const v = Number.isFinite(v01) ? v01 : (wasEnabled ? 1 : 0)
  if (wasEnabled) {
    // Currently on: stay on unless we fall below the LOW threshold.
    if (v < HYSTERESIS_OFF) return false
    return true
  }
  // Currently off: flip on only when we climb past the HIGH threshold.
  if (v > HYSTERESIS_ON) return true
  return false
}

// Decode a 3-byte MIDI message. Returns { type, channel, data1, data2 }
// or null if not a CC/NoteOn/NoteOff. Tested in isolation so we can
// verify the bit-twiddling without hardware.
export function decodeMidiMessage(bytes) {
  if (!bytes || bytes.length < 3) return null
  const status  = bytes[0]
  const type    = status & 0xF0
  const channel = status & 0x0F
  // Filter to the message types we actually use. The browser fires
  // a lot of other messages (PolyPressure, Aftertouch, SysEx...)
  // which we just skip.
  if (type !== 0xB0 && type !== 0x90 && type !== 0x80) return null
  return { type, channel, data1: bytes[1] & 0x7F, data2: bytes[2] & 0x7F }
}

// Convert a CC value (0..127) into a normalized [0..1] float.
export function ccToNormalized(value) {
  if (!Number.isFinite(value)) return 0
  const v = Math.max(0, Math.min(127, value))
  return v / 127
}

// Persistence — load/save the user's CC→action map. We accept BOTH
// built-in action ids (existing behaviour) AND attractor action ids
// (matching the `attr:` prefix). Unknown ids are dropped on load so
// stale entries don't leak; attractor ids that point to a deleted
// attractor are still preserved (apply will become a no-op until
// the user recreates the attractor with the same id).
export function loadMidiMap() {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    const out = {}
    for (const [ccStr, actionId] of Object.entries(parsed)) {
      const cc = parseInt(ccStr, 10)
      if (!Number.isFinite(cc) || cc < 0 || cc > 127) continue
      if (typeof actionId !== 'string') continue
      if (ACTION_BY_ID.has(actionId) || parseAttractorActionId(actionId)) {
        out[String(cc)] = actionId
      }
    }
    return out
  } catch { return {} }
}

export function saveMidiMap(map) {
  if (!map || typeof map !== 'object') return
  try {
    if (typeof localStorage === 'undefined') return
    const out = {}
    for (const [ccStr, actionId] of Object.entries(map)) {
      const cc = parseInt(ccStr, 10)
      if (!Number.isFinite(cc) || cc < 0 || cc > 127) continue
      if (typeof actionId !== 'string') continue
      if (ACTION_BY_ID.has(actionId) || parseAttractorActionId(actionId)) {
        out[String(cc)] = actionId
      }
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
  } catch { /* quota / private mode */ }
}

// Bind a CC to an action. `actionId === null` removes the binding.
// Both built-in ids and well-formed attractor ids (`attr:<id>:<field>`)
// are accepted — unknown strings are silently rejected.
export function setBinding(map, cc, actionId) {
  if (!Number.isFinite(cc) || cc < 0 || cc > 127) return map
  const next = { ...map }
  if (actionId === null || actionId === undefined || actionId === '') {
    delete next[String(cc)]
  } else if (typeof actionId === 'string' && (ACTION_BY_ID.has(actionId) || parseAttractorActionId(actionId))) {
    next[String(cc)] = actionId
  }
  return next
}

export function clearAllBindings() {
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY) } catch { /* */ }
  return {}
}

// Apply an incoming CC to the store. Returns the actionId fired, or
// null if no binding for that CC. `store` is the store snapshot
// (`useStore.getState()`) — passed in so the lib stays decoupled.
// Attractor actions are resolved per-event so a deleted attractor
// becomes a silent no-op (returns null) instead of crashing.
export function applyCC(map, cc, value, store) {
  const actionId = map ? map[String(cc)] : null
  if (!actionId) return null
  const a = resolveActionForId(actionId, store)
  if (!a || !store) return null
  const v01 = ccToNormalized(value)
  try { a.set(v01, store) } catch { /* setter threw — keep going */ }
  return actionId
}

// Label lookup for the UI. Built-in: pull straight from the ACTIONS
// registry. Attractor: format the attractor's live name +
// field — falling back to a "Attr <id>" label when the attractor
// no longer exists so stale bindings are still visible (and removable).
export function actionLabel(id, store) {
  const builtin = ACTION_BY_ID.get(id)
  if (builtin) return builtin.label
  const parsed = parseAttractorActionId(id)
  if (!parsed) return 'Unmapped'
  if (store && Array.isArray(store.namedAttractors)) {
    const target = store.namedAttractors.find(a => a && a.id === parsed.attractorId)
    if (target) return `${target.name} · ${labelForAttractorField(parsed.field)}`
  }
  return `Attr ${parsed.attractorId} · ${labelForAttractorField(parsed.field)} (missing)`
}

export function labelForAttractorField(field) {
  if (field === ATTRACTOR_FIELD_STRENGTH) return 'Strength'
  if (field === ATTRACTOR_FIELD_RADIUS)   return 'Radius'
  if (field === ATTRACTOR_FIELD_X)        return 'X'
  if (field === ATTRACTOR_FIELD_Y)        return 'Y'
  if (field === ATTRACTOR_FIELD_Z)        return 'Z'
  if (field === ATTRACTOR_FIELD_ENABLED)  return 'Enabled'
  return field || '?'
}

// Build the live list of attractor actions for a given store snapshot.
// Used by the MIDI panel UI to render per-attractor binding rows
// alongside the built-in ones. Returns an array shaped like ACTIONS
// so the renderer can iterate uniformly.
//
// R13.18 — emits one row PER FIELD per attractor (strength + radius +
// x + y + z), so a 12-attractor scene yields up to 60 rows. The UI
// groups them visually by attractor, but the data shape stays flat so
// the existing Learn-tap flow keeps working without any refactor.
export function attractorActions(store) {
  if (!store || !Array.isArray(store.namedAttractors)) return []
  const out = []
  for (const att of store.namedAttractors) {
    if (!att || typeof att.id !== 'string') continue
    for (const field of ATTRACTOR_FIELDS) {
      const id = attractorActionId(att.id, field)
      if (!id) continue
      let min = 0, max = 1
      if (field === ATTRACTOR_FIELD_STRENGTH) { min = 0; max = STRENGTH_MAX }
      else if (field === ATTRACTOR_FIELD_RADIUS) { min = RADIUS_MIN; max = RADIUS_MAX }
      else if (field === ATTRACTOR_FIELD_ENABLED) { min = 0; max = 1 }
      else { min = POSITION_MIN; max = POSITION_MAX } // x/y/z share the same span
      out.push({
        id,
        label: `${att.name} · ${labelForAttractorField(field)}`,
        min, max,
        attractorId: att.id,
        attractor: att,
        field,
      })
    }
  }
  return out
}
