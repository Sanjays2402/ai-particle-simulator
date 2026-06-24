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

import { clampStrength, clampRadius, clampPositionScalar, STRENGTH_MAX, RADIUS_MIN, RADIUS_MAX, POSITION_MIN, POSITION_MAX, ATTRACTOR_TYPES } from './namedAttractors.js'

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
// R17.15 — radius routing with an inverse log curve. Pure-linear CC
// → radius maps a knob's first 25% to radii 4..7 (the LOW end where
// small radius changes have the biggest visible effect on a scene),
// then the remaining 75% spreads across 7..16. That's backwards for
// fine control: you can't sculpt a tight orbit because half a knob
// turn near 0 jumps from 4 to 5 with no granularity. The log-curve
// variant remaps so the FIRST half of the knob covers 4..8 with
// equal-feeling steps and the SECOND half flows up through 8..16.
// Same action-id format (`attr:<id>:radiusLog`) so per-attractor MIDI
// routing keeps its uniform shape — the field tag is what carries
// the curve semantic.
export const ATTRACTOR_FIELD_RADIUS_LOG = 'radiusLog'
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
// R18.16 — route a CC to the per-attractor TYPE. A continuous knob
// sweeps through every intermediate value, so we split [0..1] into
// N equal-width bands (one per ATTRACTOR_TYPES entry) and apply a
// small dead-band at each boundary so a knob sitting on the boundary
// doesn't ping-pong between two adjacent types every frame. The
// previous type lives on the live attractor (a.type) — no extra
// state map needed (parallels the ENABLED routing R15.16).
//
// Mathematical model: with 4 types, boundaries sit at 0.25, 0.50,
// 0.75. The dead-band is symmetric around each boundary; inside it
// the binding holds the previous type. Outside, the type is selected
// by which band v01 falls into. The dead-band width is conservative
// (0.015 on each side, so 0.03 total) — narrow enough that a steady
// knob sweep still hits every type but wide enough that micro-jitter
// from a noisy controller doesn't chatter.
export const ATTRACTOR_FIELD_TYPE = 'type'
export const TYPE_BAND_HYSTERESIS = 0.015
export const ATTRACTOR_FIELDS = [
  ATTRACTOR_FIELD_STRENGTH,
  ATTRACTOR_FIELD_RADIUS,
  ATTRACTOR_FIELD_RADIUS_LOG,
  ATTRACTOR_FIELD_X,
  ATTRACTOR_FIELD_Y,
  ATTRACTOR_FIELD_Z,
  ATTRACTOR_FIELD_ENABLED,
  ATTRACTOR_FIELD_TYPE,
]
const ATTRACTOR_FIELD_SET = new Set(ATTRACTOR_FIELDS)

// R17.15 — pure curve helper. Maps a normalised CC value v01 ∈ [0, 1]
// to a normalised "where am I on the radius range" value in [0, 1]
// using an exponential shape so the low half of the knob covers a
// larger fraction of the LOW end of the radius range:
//   shape(0)   = 0
//   shape(0.5) ≈ 0.414  (vs 0.5 linear — the knob lands ~41% up at half-turn)
//   shape(1)   = 1
// (2^v - 1) normalises perfectly across [0, 1] since 2^0 = 1 and
// 2^1 = 2, so the divisor (2 - 1) = 1 is implicit.
//
// Defensive contract:
//   - non-finite v01 → 0 (anchor to the radius minimum)
//   - v01 < 0 → clamped to 0
//   - v01 > 1 → clamped to 1
export function logCurveShape(v01) {
  if (!Number.isFinite(v01)) return 0
  const v = v01 < 0 ? 0 : v01 > 1 ? 1 : v01
  return (Math.pow(2, v) - 1)
}

// Convenience wrapper — convert v01 directly to a clamped radius value
// using the same curve. Used by resolveActionForId's radiusLog setter
// and exported so the per-attractor MIDI panel can preview "what
// radius will this knob give me" without re-deriving the math.
export function logCurveRadius(v01) {
  const t = logCurveShape(v01)
  return clampRadius(RADIUS_MIN + t * (RADIUS_MAX - RADIUS_MIN))
}

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
  if (parsed.field === ATTRACTOR_FIELD_RADIUS_LOG) {
    // R17.15 — identical setter contract to RADIUS but the CC value
    // passes through the inverse-log shaper first so a knob's bottom
    // half resolves ~4..8 (fine control at the low end) and the top
    // half flows up through 8..16. Visible to the user as a `Radius·log`
    // row in the MIDI panel sitting next to (not replacing) the linear
    // Radius row, so users can pick the curve that matches the knob's
    // physical feel without losing the original mapping.
    return {
      id, attractor: target, field: parsed.field,
      label: `${target.name} · Radius·log`,
      min: RADIUS_MIN, max: RADIUS_MAX,
      set: (v01, s) => {
        if (typeof s.updateNamedAttractor === 'function') {
          s.updateNamedAttractor(target.id, { radius: logCurveRadius(v01) })
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
  if (parsed.field === ATTRACTOR_FIELD_TYPE) {
    // R18.16 — route a CC to the per-attractor type. Cycles through
    // ATTRACTOR_TYPES in equal-width bands with a dead-band at each
    // boundary so a knob sitting on a boundary doesn't flicker.
    // Reads the LIVE attractor's current type at apply-time so the
    // dead-band sees the same state the user sees.
    return {
      id, attractor: target, field: parsed.field,
      label: `${target.name} · Type`,
      min: 0, max: 1,
      set: (v01, s) => {
        if (typeof s.updateNamedAttractor !== 'function') return
        const live = Array.isArray(s.namedAttractors)
          ? s.namedAttractors.find(a => a && a.id === target.id)
          : null
        if (!live) return
        const wasType = live.type
        const nextType = pickAttractorTypeForCC(wasType, v01)
        if (!nextType || nextType === wasType) return  // no-op — hold previous type
        s.updateNamedAttractor(target.id, { type: nextType })
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

// R18.16 — pure type-band picker for the per-attractor TYPE routing.
// Splits [0..1] into N equal bands (one per type in ATTRACTOR_TYPES)
// and returns the type the CC value lands in, with a symmetric dead-
// band around each boundary that holds the previous type.
//
// Behaviour:
//   - non-finite v01 → return previousType unchanged (defensive; a
//     misbehaving controller can't blow up the binding)
//   - v01 clamps to [0..1] (Math.max/min) so callers don't have to
//   - inside a dead-band (boundary ± TYPE_BAND_HYSTERESIS): hold
//     previousType IF it's one of the two neighbouring band types
//     (so the user can stop a knob anywhere near a boundary and the
//     state stays put). If previousType is something further away,
//     we still select the new band — the dead-band only locks the
//     immediate neighbours.
//   - outside any dead-band: the band that v01 falls into wins.
//   - empty/invalid types list → return previousType (or null if it
//     was also invalid)
//
// Boundary handling on exact ties:
//   v01 === N/types.length lands in the HIGHER band (i.e. the half-open
//   interval is [a, b)) — except at v01 === 1 where the LAST band wins.
export function pickAttractorTypeForCC(previousType, v01, types = ATTRACTOR_TYPES, hysteresis = TYPE_BAND_HYSTERESIS) {
  const list = Array.isArray(types) ? types.filter(t => typeof t === 'string' && t.length > 0) : []
  if (list.length === 0) {
    return (typeof previousType === 'string' && previousType.length > 0) ? previousType : null
  }
  if (list.length === 1) return list[0]
  if (!Number.isFinite(v01)) {
    return list.includes(previousType) ? previousType : list[0]
  }
  const h = Number.isFinite(hysteresis) ? Math.max(0, Math.min(0.5 / list.length, hysteresis)) : 0
  const v = v01 < 0 ? 0 : v01 > 1 ? 1 : v01
  const bandWidth = 1 / list.length
  // Compute the band v01 falls into (half-open [a, b), last band is closed).
  let bandIdx
  if (v >= 1) bandIdx = list.length - 1
  else bandIdx = Math.floor(v / bandWidth)
  if (bandIdx >= list.length) bandIdx = list.length - 1
  if (bandIdx < 0) bandIdx = 0
  // If we have a valid previousType AND we're inside a dead-band
  // around the boundary between the previous band and the current
  // band, hold the previous type.
  const prevIdx = list.indexOf(previousType)
  if (prevIdx !== -1 && prevIdx !== bandIdx && h > 0) {
    // The boundary we just crossed (if any) is the EDGE between
    // prevIdx and bandIdx. Both must be adjacent for the dead-band
    // to hold; non-adjacent jumps (e.g. a sudden knob slam) skip the
    // hold and snap to the new band.
    if (Math.abs(prevIdx - bandIdx) === 1) {
      const boundary = Math.max(prevIdx, bandIdx) * bandWidth
      if (v >= boundary - h && v <= boundary + h) {
        return list[prevIdx]
      }
    }
  }
  return list[bandIdx]
}

// R19.16 — pure projector for the per-attractor TYPE row tooltip.
// Given the current CC value (0..127) and the type list, returns
// { index, label, total } describing which BAND the value sits in
// AND whether it's inside the dead-band that holds the previous type.
//
// Why we need it: pickAttractorTypeForCC works invisibly — a knob
// sweeping through the four bands flips the attractor's type at the
// boundaries, but the user has no scannable cue showing them which
// band the CC is CURRENTLY in. Without that, tuning the knob to land
// near a boundary on purpose (e.g. for hysteresis testing) is guesswork.
//
// Returns null when:
//   - types is empty / invalid
//   - cc value is missing / non-finite (nothing to project)
//
// Otherwise returns:
//   - index: 0-based band index (0..types.length-1)
//   - label: the type name in that band (e.g. 'vortex')
//   - total: types.length (1-based denominator for "2/4" UI)
//   - holdingPrev: boolean — true when v01 is INSIDE the dead-band
//     around a boundary. The UI surfaces this with a 'held' badge
//     so the user knows the type isn't about to flip if the knob
//     jitters slightly. Adjacent-only (R18.16 contract): a dead-band
//     between non-adjacent prev/current is still a normal jump.
//   - distanceToEdge01: min of (v01 - prevBoundary, nextBoundary - v01),
//     normalised to [0, 1]. Lets the UI render a soft warning when
//     the knob is close to (but not in) a boundary. NaN when at the
//     extremes 0 or 1 (no neighbouring boundary).
//   - R20.16 — proximityToBoundary01: a normalised [0, 1] safety
//     score derived from distanceToEdge01. Returns 1.0 deep inside
//     a band (knob is SAFE to stop here — far from any flip) and
//     drops to 0.0 the moment the value enters a dead-band (knob is
//     ON a boundary — next jitter could flip). The UI surfaces this
//     as a small horizontal proximity meter on each TYPE row so the
//     scannable cue scales smoothly with how close the knob is to
//     a boundary, not just whether it's "in" or "out" of the band.
//     The normalisation is over the band's HALF-WIDTH minus
//     hysteresis (the value's "safe zone" inside the band), so a
//     full sweep through one band paints a 0 → 1 → 0 ramp.
// --- R21.22: clamp-proximity projector for non-band continuous fields ---
// Graduates R20.16's TYPE-row proximity meter to STRENGTH / RADIUS /
// X/Y/Z / RADIUS·log rows. The semantic differs by field shape:
//
//   TYPE  (R20.16)   — proximity to nearest FLIP BOUNDARY inside a band.
//   continuous       — proximity to nearest CLAMP EDGE of the slider.
//
// For a continuous field, the safe zone is the middle of the slider's
// [0, 1] sweep. A knob parked at v01=0.5 reads MAX SAFE (far from both
// clamps); a knob at v01=0 or v01=1 reads MIN SAFE (the knob is "at
// the rail" — twisting further does nothing). Power users moving a
// knob during a live set can tell at a glance whether they have
// headroom in either direction.
//
// Returns a number in [0, 1] where 1 == centred (max headroom both
// ways), 0 == sitting at one of the clamps. Non-finite input
// resolves to 1 (treat unknown CC as max-safe so the meter doesn't
// scream RED on first paint before any messages have been seen —
// matches R20.16's R19.16 lastCCByNumber gate semantics).
//
// The function is a pure projector — no clamping side effects, no
// allocations, deterministic per v01.
export function clampProximity01(v01) {
  if (!Number.isFinite(v01)) return 1
  const v = v01 < 0 ? 0 : v01 > 1 ? 1 : v01
  // Distance to nearest clamp edge. v=0.5 → 0.5 (max); v=0 or v=1 → 0.
  const d = Math.min(v, 1 - v)
  // Normalise so 0.5 → 1.0 and 0/1 → 0.0.
  return d * 2
}

// Describe the proximity for a continuous field as a structured object
// matching describeTypeBand's shape (so the UI's renderer can branch
// on field type but reuse the same component for proximity painting).
// Returns:
//   - kind: 'clamp' (distinguishes from R20.16's 'band' kind)
//   - proximityToBoundary01: result of clampProximity01(v01)
//   - v01:  the (possibly clamped-into-range) input — useful for
//           "knob at 87%" tooltips
//   - atLow / atHigh: convenience booleans for "knob is AT the rail"
//                     so the UI can colour the meter red specifically.
// Returns null on non-finite input so the caller can short-circuit
// the render (matches describeTypeBand's null-on-bad-input contract).
export function describeClampProximity(v01) {
  if (!Number.isFinite(v01)) return null
  const v = v01 < 0 ? 0 : v01 > 1 ? 1 : v01
  return {
    kind: 'clamp',
    v01: v,
    proximityToBoundary01: clampProximity01(v),
    atLow:  v <= 0.001,
    atHigh: v >= 0.999,
  }
}

// R22.27 — user-tunable warning threshold for the clamp-proximity
// meter. Graduates R21.22's hard-coded `prox < 0.25` amber cutoff.
//
// Tier semantics:
//   'danger' — knob is AT one of the clamp rails (atLow OR atHigh).
//              Threshold is fixed at v01<=0.001 / v01>=0.999 (rail
//              detection is structural, not a taste choice).
//   'warn'   — knob is close to a rail but not on it. Proximity
//              (distance from nearest clamp, normalised) is BELOW
//              the user's warn threshold. Default 0.25 = same as
//              R21.22 baseline.
//   'safe'   — knob has plenty of headroom in both directions.
//              Proximity is AT or ABOVE the warn threshold.
//
// Defaults / bounds: user can move the threshold inside
// [CLAMP_WARN_THRESHOLD_MIN, CLAMP_WARN_THRESHOLD_MAX]. The min is
// chosen so the warn tier always covers SOMETHING (a 0 threshold
// would mean "warn only when at the rail" which is just the danger
// tier — useless). The max caps below 0.5 so the green tier always
// represents the centre half of the slider — a value above 0.5
// would mean even a perfectly-centred knob reads "warn" which
// inverts the intent.
export const CLAMP_WARN_THRESHOLD_DEFAULT = 0.25
export const CLAMP_WARN_THRESHOLD_MIN = 0.05
export const CLAMP_WARN_THRESHOLD_MAX = 0.45

// Pure projector. Defensive: non-finite prox falls through to 'safe'
// (treat unknown CC as safe-first-paint, matches R21.22 max-safe
// default). atRail trumps everything — even with a low threshold,
// a knob literally at the rail is danger.
export function classifyClampProximity(prox01, atRail, warnThreshold = CLAMP_WARN_THRESHOLD_DEFAULT) {
  if (atRail === true) return 'danger'
  if (!Number.isFinite(prox01)) return 'safe'
  const t = sanitizeClampWarnThreshold(warnThreshold)
  return prox01 < t ? 'warn' : 'safe'
}

// Clamp the threshold into the supported range. Non-finite / out-of-
// range falls back to the shipped default so a corrupt persisted
// value never lands the user in "every meter is amber forever"
// limbo.
export function sanitizeClampWarnThreshold(raw) {
  if (!Number.isFinite(raw)) return CLAMP_WARN_THRESHOLD_DEFAULT
  if (raw < CLAMP_WARN_THRESHOLD_MIN) return CLAMP_WARN_THRESHOLD_MIN
  if (raw > CLAMP_WARN_THRESHOLD_MAX) return CLAMP_WARN_THRESHOLD_MAX
  return raw
}

// True when the threshold value is at exactly the shipped default.
// UI uses this to decide whether to render the "edited" dot next to
// the meter so users can tell which proximity readings reflect a
// custom threshold vs the baseline.
export function isClampWarnThresholdAtDefault(raw) {
  return sanitizeClampWarnThreshold(raw) === CLAMP_WARN_THRESHOLD_DEFAULT
}

// R23.32 — per-field clamp warn threshold overrides.
//
// R22.27 shipped ONE global threshold that applied to every meter on
// every attractor's every field. Power users wanted finer control:
//   - STRENGTH: rail = silent attractor (force=0). Should be STRICT —
//     hitting the rail is structural, not intentional.
//   - X / Y / Z: rail = attractor at canvas edge. Often intentional
//     (corner-placed turbulence, edge vortex). Should be LOOSE.
//   - RADIUS / RADIUS·log: middle ground.
//
// The override storage is keyed by field name (one of ATTRACTOR_FIELDS
// minus 'enabled' and 'type' which are binary/categorical and don't
// use the clamp meter). Missing per-field override → falls back to
// the global threshold. Missing global → falls back to DEFAULT.
//
// This composes with R22.27's existing single-threshold setter: that
// setter writes to the GLOBAL slot. The per-field setter writes to
// the named field slot. Both can coexist; resolveClampWarnThreshold
// (below) is the read-side resolver that walks the chain.
//
// Why the per-field map lives at the lib layer: keeps the resolution
// chain (per-field → global → default) pure + testable. The React
// state holds the global; localStorage holds both global + the
// per-field map. UI surfaces both in the same long-press popover so
// the discoverability + edit path stays scoped to one place.

// Fields that DO use a clamp meter (continuous knob values). enabled
// + type don't — both render their own bespoke meters (R20.16 type
// band, R15.16 hysteresis toggle).
export const CLAMP_THRESHOLD_FIELDS = [
  'strength',
  'radius',
  'radiusLog',
  'x', 'y', 'z',
]
const CLAMP_THRESHOLD_FIELD_SET = new Set(CLAMP_THRESHOLD_FIELDS)

// Defensive — strip unknown field keys + sanitize per-field values
// through sanitizeClampWarnThreshold so a hand-edited / corrupt
// localStorage entry can't land an out-of-range threshold.
export function sanitizeClampWarnOverrides(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const field of CLAMP_THRESHOLD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(raw, field)) continue
    const v = raw[field]
    if (!Number.isFinite(v)) continue
    // Drop entries that don't differ from the global — keeps the
    // persisted map minimal so a "reset all to global" round-trip
    // doesn't leave junk overrides behind. Note we DON'T compare
    // against the GLOBAL here (we don't have it); we just sanitize
    // into the valid range. Caller can then prune entries that
    // duplicate the global if desired.
    out[field] = sanitizeClampWarnThreshold(v)
  }
  return out
}

// Resolve the effective threshold for a specific field:
//   1. per-field override (if present + valid)
//   2. global threshold (the R22.27 single slot)
//   3. shipped default
// Pure read-side projector — never mutates either input.
//
// `field` may be any string; unknown fields fall through to global.
// Defensive: non-finite global → DEFAULT. Non-object overrides → fall
// through to global. Per-field value re-sanitized at lookup time so
// any in-place edit to the override map outside the setter can't
// land an out-of-range threshold.
export function resolveClampWarnThreshold(field, globalThreshold, overrides) {
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)
      && typeof field === 'string'
      && Object.prototype.hasOwnProperty.call(overrides, field)) {
    const raw = overrides[field]
    if (Number.isFinite(raw)) return sanitizeClampWarnThreshold(raw)
  }
  return sanitizeClampWarnThreshold(globalThreshold)
}

// Setter: returns a new overrides map with `field` set to the
// sanitized value. Ref-equal-on-no-op contract: same-value re-set
// returns the input ref. Pass null/undefined as the value to CLEAR
// the per-field override (and fall back to global on the next read).
// Defensive: invalid field → input ref unchanged. Non-object overrides
// → start from empty.
export function setClampWarnFieldOverride(overrides, field, value) {
  const baseOverrides = (overrides && typeof overrides === 'object' && !Array.isArray(overrides))
    ? overrides
    : {}
  if (typeof field !== 'string' || !CLAMP_THRESHOLD_FIELD_SET.has(field)) return overrides
  // Clear path.
  if (value === null || value === undefined) {
    if (!Object.prototype.hasOwnProperty.call(baseOverrides, field)) return overrides
    const next = { ...baseOverrides }
    delete next[field]
    return next
  }
  if (!Number.isFinite(value)) return overrides
  const sanitized = sanitizeClampWarnThreshold(value)
  if (baseOverrides[field] === sanitized) return overrides  // no-op
  return { ...baseOverrides, [field]: sanitized }
}

// Wipe every per-field override (caller should also reset the global
// via the existing R22.27 setter if they want a true full reset).
// Ref-equal-on-no-op: returns the input ref when already empty.
export function clearAllClampWarnOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return overrides
  if (Object.keys(overrides).length === 0) return overrides
  return {}
}

// Has the given field got a per-field override that DIFFERS from the
// global? Used by the UI to render a "field overridden" pip on the
// per-field row of the threshold popover (distinct from R22.27's
// "global edited" pip on the meter itself).
export function hasClampWarnFieldOverride(field, globalThreshold, overrides) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return false
  if (typeof field !== 'string') return false
  if (!Object.prototype.hasOwnProperty.call(overrides, field)) return false
  const fieldVal = overrides[field]
  if (!Number.isFinite(fieldVal)) return false
  const sanitizedField = sanitizeClampWarnThreshold(fieldVal)
  const sanitizedGlobal = sanitizeClampWarnThreshold(globalThreshold)
  return sanitizedField !== sanitizedGlobal
}

// R24.40 — per-(attractor, field) overrides. Graduates R23.32's per-
// field-only overrides with a 3rd tier so power users can tune one
// specific attractor's STRENGTH meter strict while leaving every
// OTHER attractor's STRENGTH on the per-field-global value. Example
// use case: a critical "bass-thump" attractor with strict warning
// (rail = silent attractor, bad) coexists with a decorative attractor
// that often pegs the rail intentionally (rail = visible at edge,
// fine).
//
// Persisted shape: `{ [attractorId]: { [field]: threshold } }`.
// Sanitised per-attractor entries flow through the existing per-field
// sanitizer so the storage round-trip is dimensionally identical to
// R23.32 — just nested one level deeper. Unknown attractors aren't
// dropped at sanitize time (we can't know the live attractor roster
// from a pure helper); UI passes an `attractorIds` predicate later if
// it wants to GC orphans.
//
// Resolution chain (new — supersedes R23.32):
//   1. per-(attractor, field) override
//   2. per-field global override        (R23.32 baseline)
//   3. global threshold                  (R22.27 baseline)
//   4. shipped default                   (CLAMP_WARN_THRESHOLD_DEFAULT)

// Defensive — non-object / array / null all return empty. Unknown
// FIELD keys within an attractor entry are dropped (mirrors R23.32);
// the attractor id itself is preserved as long as it's a non-empty
// string (we trust the live UI to GC orphans).
export function sanitizeClampWarnAttractorOverrides(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const attractorId of Object.keys(raw)) {
    if (typeof attractorId !== 'string' || !attractorId) continue
    const inner = raw[attractorId]
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) continue
    const cleaned = {}
    for (const field of CLAMP_THRESHOLD_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(inner, field)) continue
      const v = inner[field]
      if (!Number.isFinite(v)) continue
      cleaned[field] = sanitizeClampWarnThreshold(v)
    }
    if (Object.keys(cleaned).length > 0) out[attractorId] = cleaned
  }
  return out
}

// 4-tier resolver. Same defensive contract as
// resolveClampWarnThreshold — any tier missing / invalid falls through
// to the next tier; all tiers re-sanitize at lookup time so any in-
// place edit to either map outside the setters can't land a bad value.
//
// `attractorId` is optional (null/undefined for non-attractor meters
// or back-compat call sites). When omitted the resolver skips tier 1
// and behaves exactly like resolveClampWarnThreshold (R23.32).
export function resolveClampWarnThresholdFor(attractorId, field, globalThreshold, fieldOverrides, attractorOverrides) {
  // Tier 1 — per-(attractor, field)
  if (typeof attractorId === 'string' && attractorId
      && attractorOverrides && typeof attractorOverrides === 'object' && !Array.isArray(attractorOverrides)
      && typeof field === 'string'
      && Object.prototype.hasOwnProperty.call(attractorOverrides, attractorId)) {
    const inner = attractorOverrides[attractorId]
    if (inner && typeof inner === 'object' && !Array.isArray(inner)
        && Object.prototype.hasOwnProperty.call(inner, field)) {
      const raw = inner[field]
      if (Number.isFinite(raw)) return sanitizeClampWarnThreshold(raw)
    }
  }
  // Tier 2 + 3 + 4 — delegate to the R23.32 resolver
  return resolveClampWarnThreshold(field, globalThreshold, fieldOverrides)
}

// Setter: returns a new attractor-overrides map with the inner
// `field` value updated for the given attractor. Pass `value`=null
// or undefined to CLEAR that one cell (the attractor's other field
// overrides stay intact). When the LAST cell for an attractor is
// cleared, the attractor's entry is pruned entirely so the persisted
// map stays minimal. Ref-equal-on-no-op contract: same-value re-set
// returns input ref. Defensive: invalid field / non-string attractor
// id → input ref unchanged.
export function setClampWarnAttractorFieldOverride(attractorOverrides, attractorId, field, value) {
  if (typeof attractorId !== 'string' || !attractorId) return attractorOverrides
  if (typeof field !== 'string' || !CLAMP_THRESHOLD_FIELD_SET.has(field)) return attractorOverrides
  const base = (attractorOverrides && typeof attractorOverrides === 'object' && !Array.isArray(attractorOverrides))
    ? attractorOverrides
    : {}
  const innerExisting = (base[attractorId] && typeof base[attractorId] === 'object' && !Array.isArray(base[attractorId]))
    ? base[attractorId]
    : {}
  // Clear path.
  if (value === null || value === undefined) {
    if (!Object.prototype.hasOwnProperty.call(innerExisting, field)) return attractorOverrides
    const nextInner = { ...innerExisting }
    delete nextInner[field]
    const next = { ...base }
    if (Object.keys(nextInner).length === 0) {
      delete next[attractorId]
    } else {
      next[attractorId] = nextInner
    }
    return next
  }
  if (!Number.isFinite(value)) return attractorOverrides
  const sanitized = sanitizeClampWarnThreshold(value)
  if (innerExisting[field] === sanitized) return attractorOverrides   // no-op
  return {
    ...base,
    [attractorId]: { ...innerExisting, [field]: sanitized },
  }
}

// Wipe every per-attractor override (does NOT touch per-field-globals
// or the global threshold). Ref-equal-on-no-op: returns input ref
// when already empty / invalid.
export function clearAllClampWarnAttractorOverrides(attractorOverrides) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return attractorOverrides
  if (Object.keys(attractorOverrides).length === 0) return attractorOverrides
  return {}
}

// Wipe every per-field override for ONE attractor (preserves entries
// for other attractors). Ref-equal-on-no-op: returns input ref when
// the attractor has no entry to wipe.
export function clearClampWarnAttractorOverrides(attractorOverrides, attractorId) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return attractorOverrides
  if (typeof attractorId !== 'string' || !attractorId) return attractorOverrides
  if (!Object.prototype.hasOwnProperty.call(attractorOverrides, attractorId)) return attractorOverrides
  const next = { ...attractorOverrides }
  delete next[attractorId]
  return next
}

// R25.45 — count how many per-field overrides exist for a single
// attractor. Pure projector that drives the "Clear all (N)" bulk-
// clear affordance in the ClampThresholdPopover. Returns 0 when:
//   - non-object / array / null overrides map
//   - non-string / empty attractor id
//   - attractor has no entry
//   - inner entry is malformed (non-object / array)
// Each FIELD key is counted at most once (parallel to the resolver's
// per-field semantics), unknown/non-finite per-field values are not
// counted so the button label never overstates the wipe scope.
export function countClampWarnAttractorOverridesFor(attractorOverrides, attractorId) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return 0
  if (typeof attractorId !== 'string' || !attractorId) return 0
  if (!Object.prototype.hasOwnProperty.call(attractorOverrides, attractorId)) return 0
  const inner = attractorOverrides[attractorId]
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return 0
  let n = 0
  for (const field of CLAMP_THRESHOLD_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(inner, field)) continue
    if (!Number.isFinite(inner[field])) continue
    n++
  }
  return n
}

// R26.45 — count how many ATTRACTORS have a per-attractor override for
// THIS field. Companion to countClampWarnAttractorOverridesFor (R25.45)
// which counts per-FIELD overrides for ONE attractor; this projector
// flips the axis: per-ATTRACTOR overrides for ONE field. Drives the
// "Clear all (M) for THIS FIELD across every attractor" companion
// button in the ClampThresholdPopover footer.
//
// Returns 0 when:
//   - non-object / array / null overrides map
//   - non-string field / not in CLAMP_THRESHOLD_FIELDS
//   - no attractor has a per-attractor override for this field
//   - malformed inner entries skipped silently
//
// Each ATTRACTOR ID is counted at most once (an attractor either has
// or doesn't have an override for the given field). non-finite values
// are NOT counted (parallel to countClampWarnAttractorOverridesFor's
// semantic — the button label never overstates the wipe scope).
export function countClampWarnFieldOverridesAcross(attractorOverrides, field) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return 0
  if (typeof field !== 'string' || !field) return 0
  if (!CLAMP_THRESHOLD_FIELD_SET.has(field)) return 0
  let n = 0
  for (const attractorId of Object.keys(attractorOverrides)) {
    const inner = attractorOverrides[attractorId]
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) continue
    if (!Object.prototype.hasOwnProperty.call(inner, field)) continue
    if (!Number.isFinite(inner[field])) continue
    n++
  }
  return n
}

// R27.45 — List the attractor IDs that have a per-attractor override for
// THIS field, paired with their per-attractor threshold value. Drives
// the "Clear all for this field" button's inline preview chips so the
// user sees which attractors will be reset before they commit. Pure
// projector parallel to countClampWarnFieldOverridesAcross.
//
// Returns array of `{ id, value }`:
//   - id    : attractor id string (raw key from overrides map)
//   - value : per-attractor threshold (already sanitized to the same
//             [MIN, MAX] range the slider clamps to). Caller can format
//             as "%" without further work.
//
// Returns []:
//   - non-object / array / null overrides map
//   - non-string field / not in CLAMP_THRESHOLD_FIELDS
//   - no attractor has an override for this field
//
// Ordering: ID lexicographic via Object.keys (stable across renders so
// chips don't reshuffle; UI may re-sort by attractor list order in the
// wire layer if needed). Malformed inner entries / non-finite values
// silently skipped (same contract as the count projector — never
// surface a chip we can't actually wipe).
//
// Pure / no mutation of input.
export function listClampWarnFieldOverridesAcross(attractorOverrides, field) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return []
  if (typeof field !== 'string' || !field) return []
  if (!CLAMP_THRESHOLD_FIELD_SET.has(field)) return []
  const out = []
  for (const attractorId of Object.keys(attractorOverrides)) {
    const inner = attractorOverrides[attractorId]
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) continue
    if (!Object.prototype.hasOwnProperty.call(inner, field)) continue
    if (!Number.isFinite(inner[field])) continue
    out.push({ id: attractorId, value: sanitizeClampWarnThreshold(inner[field]) })
  }
  return out
}

// R26.45 — Strip ONE field from EVERY attractor's per-attractor
// override map. Drops attractor entries that become empty after the
// strip (parallel to setClampWarnAttractorFieldOverride's last-cell-
// prune semantic — keeps the persisted map clean).
//
// Ref-equal-on-no-op: returns input ref when:
//   - non-object / array / null overrides map
//   - non-string / non-CLAMP_THRESHOLD_FIELDS field
//   - no attractor has an override for this field (nothing to wipe)
//
// Useful for the "Clear all (M) for THIS FIELD across every attractor"
// button when the user wants to reset (say) every STRENGTH meter back
// to the per-field-global value without losing X/Y/Z per-attractor
// tuning. Pure / no mutation.
export function clearClampWarnFieldOverridesAcross(attractorOverrides, field) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return attractorOverrides
  if (typeof field !== 'string' || !field) return attractorOverrides
  if (!CLAMP_THRESHOLD_FIELD_SET.has(field)) return attractorOverrides
  // Fast-path: nothing to do.
  if (countClampWarnFieldOverridesAcross(attractorOverrides, field) === 0) return attractorOverrides
  const next = {}
  for (const attractorId of Object.keys(attractorOverrides)) {
    const inner = attractorOverrides[attractorId]
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      // Preserve corrupt entries as-is so we don't accidentally drop
      // attractor entries that were never ours to write (parallels
      // sanitizeClampWarnAttractorOverrides which would drop them on
      // load; here we only touch the specified field).
      next[attractorId] = inner
      continue
    }
    // Build a fresh inner WITHOUT the wiped field.
    const innerNext = {}
    let kept = 0
    for (const k of Object.keys(inner)) {
      if (k === field) continue
      innerNext[k] = inner[k]
      kept++
    }
    // Drop entirely empty attractor entries (last-cell-prune semantic).
    if (kept > 0) next[attractorId] = innerNext
  }
  return next
}

// Has the given (attractor, field) got a per-attractor override that
// DIFFERS from the effective field threshold (tier 2/3/4)? Used by
// the UI to paint a per-attractor pip on the meter itself, distinct
// from R23.32's per-field pip in the popover.
export function hasClampWarnAttractorFieldOverride(attractorId, field, globalThreshold, fieldOverrides, attractorOverrides) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return false
  if (typeof attractorId !== 'string' || !attractorId) return false
  if (typeof field !== 'string') return false
  if (!Object.prototype.hasOwnProperty.call(attractorOverrides, attractorId)) return false
  const inner = attractorOverrides[attractorId]
  if (!inner || typeof inner !== 'object' || !Object.prototype.hasOwnProperty.call(inner, field)) return false
  const raw = inner[field]
  if (!Number.isFinite(raw)) return false
  const sanitizedAttractor = sanitizeClampWarnThreshold(raw)
  // Compare against whatever tier 2/3/4 would have produced.
  const effective = resolveClampWarnThreshold(field, globalThreshold, fieldOverrides)
  return sanitizedAttractor !== effective
}

// GC orphan entries — attractors that no longer exist in the live
// scene. UI hooks this on attractor-list-changed so the persisted
// map doesn't accumulate cruft when users delete attractors.
// Ref-equal-on-no-op: returns input ref when nothing needs pruning.
// `liveAttractorIds` is an Array | Set | iterable of strings; non-
// string members are treated as missing.
export function pruneClampWarnAttractorOverrides(attractorOverrides, liveAttractorIds) {
  if (!attractorOverrides || typeof attractorOverrides !== 'object' || Array.isArray(attractorOverrides)) return attractorOverrides
  const ids = liveAttractorIds instanceof Set
    ? liveAttractorIds
    : new Set(Array.from(liveAttractorIds || []).filter(x => typeof x === 'string' && x))
  const next = {}
  let dropped = 0
  for (const aid of Object.keys(attractorOverrides)) {
    if (ids.has(aid)) next[aid] = attractorOverrides[aid]
    else dropped++
  }
  if (dropped === 0) return attractorOverrides   // ref-equal no-op
  return next
}

export function describeTypeBand(v01, types = ATTRACTOR_TYPES, hysteresis = TYPE_BAND_HYSTERESIS) {
  const list = Array.isArray(types) ? types.filter(t => typeof t === 'string' && t.length > 0) : []
  if (list.length === 0) return null
  if (!Number.isFinite(v01)) return null
  const v = v01 < 0 ? 0 : v01 > 1 ? 1 : v01
  const bandWidth = 1 / list.length
  let bandIdx
  if (v >= 1) bandIdx = list.length - 1
  else bandIdx = Math.floor(v / bandWidth)
  if (bandIdx >= list.length) bandIdx = list.length - 1
  if (bandIdx < 0) bandIdx = 0
  // Distance to the nearest BAND BOUNDARY (not the band edge — the
  // boundary is where pickAttractorTypeForCC's hysteresis applies).
  // Boundaries sit at k/N for k=1..N-1; v=0 and v=1 are NOT boundaries.
  const leftBoundary  = bandIdx === 0 ? 0 : bandIdx * bandWidth
  const rightBoundary = bandIdx === list.length - 1 ? 1 : (bandIdx + 1) * bandWidth
  const distLeft  = v - leftBoundary
  const distRight = rightBoundary - v
  // Inside the dead-band of the nearest boundary? (Only meaningful when
  // we're near a TRUE boundary, not the extremes.)
  const h = Number.isFinite(hysteresis) ? Math.max(0, Math.min(0.5 / list.length, hysteresis)) : 0
  let holdingPrev = false
  if (h > 0) {
    if (bandIdx > 0                && distLeft  <= h) holdingPrev = true
    if (bandIdx < list.length - 1  && distRight <= h) holdingPrev = true
  }
  // R20.16 — proximity-to-boundary safety score.
  // distanceToEdge01 walks 0 → bandWidth/2 across a single-band sweep
  // (closest-to-boundary → mid-band → closest-to-OPPOSITE-boundary).
  // Subtract the dead-band 'h' so the meter reads 0 the moment the
  // value enters a hysteresis zone (not just when it crosses the
  // boundary). The safe range is [h, bandWidth/2 - h], normalised
  // to [0, 1] for an honest "how safe is this knob position" cue.
  // Edge bands (idx=0, idx=N-1) only have ONE real boundary — v=0
  // and v=1 are NOT flip points, so for those bands proximity is
  // measured against the SINGLE real boundary only. That way a knob
  // parked at the floor reads MAX SAFE (it can't fall off a boundary
  // that doesn't exist), not "stuck on a boundary".
  const halfBand   = bandWidth / 2
  const hasLeftBoundary  = bandIdx > 0
  const hasRightBoundary = bandIdx < list.length - 1
  let realDistToBoundary
  if (!hasLeftBoundary && !hasRightBoundary) {
    realDistToBoundary = Infinity   // single-type roster — no boundaries at all
  } else if (!hasLeftBoundary) {
    realDistToBoundary = distRight
  } else if (!hasRightBoundary) {
    realDistToBoundary = distLeft
  } else {
    realDistToBoundary = Math.min(distLeft, distRight)
  }
  const safeRange  = Math.max(1e-9, halfBand - h)
  const safeDist   = Math.max(0, realDistToBoundary - h)
  const proximity01 = realDistToBoundary === Infinity
    ? 1
    : Math.max(0, Math.min(1, safeDist / safeRange))
  return {
    index: bandIdx,
    label: list[bandIdx],
    total: list.length,
    holdingPrev,
    distanceToEdge01: Math.min(distLeft, distRight),
    proximityToBoundary01: proximity01,
  }
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
  if (field === ATTRACTOR_FIELD_RADIUS_LOG) return 'Radius·log'  // R17.15 — log-curve variant
  if (field === ATTRACTOR_FIELD_X)        return 'X'
  if (field === ATTRACTOR_FIELD_Y)        return 'Y'
  if (field === ATTRACTOR_FIELD_Z)        return 'Z'
  if (field === ATTRACTOR_FIELD_ENABLED)  return 'Enabled'
  if (field === ATTRACTOR_FIELD_TYPE)     return 'Type'    // R18.16 — type cycle
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
// R17.15 — radiusLog joins the lineup as a 7th field (parallel to
// radius, with the log-curve setter); grouping in MidiPanel keeps
// them adjacent so the user sees both options side-by-side.
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
      else if (field === ATTRACTOR_FIELD_RADIUS || field === ATTRACTOR_FIELD_RADIUS_LOG) { min = RADIUS_MIN; max = RADIUS_MAX }
      else if (field === ATTRACTOR_FIELD_ENABLED) { min = 0; max = 1 }
      else if (field === ATTRACTOR_FIELD_TYPE) { min = 0; max = 1 }  // R18.16 — cycles through ATTRACTOR_TYPES
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
