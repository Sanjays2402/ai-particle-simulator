// MIDI controller-preset bundles — pre-baked CC→action maps for
// common hardware so the user doesn't have to Learn-tap fourteen
// knobs the first time they plug in a controller.
//
// Each preset is { id, name, description, vendor, map: { ccStr: actionId } }
// where actionId is one of the registered ACTIONS in midiMap.js. We
// keep the file dependency-free so the import doesn't pull the
// browser-coupled localStorage path during tests.
//
// Layouts follow each controller's factory defaults — that's what
// matters because the typical user plugs the controller in for the
// first time and hasn't reconfigured it yet.
//
// Layout sources:
//   - nanoKONTROL2:    factory slider/knob CC = 0..7 / 16..23
//   - Launch Control XL: factory pots row 1/2/3 + faders
//   - MPK Mini Mk2/3:   K1..K8 default = CC 70..77
//   - Generic (8 KNOBS): CC 1..8 — works as a friendly fallback for
//                        nameless USB-class-compliant controllers that
//                        send "MIDI input" with no vendor signature
//
// We deliberately ship a small, opinionated set rather than 80 device
// rows: too many choices is its own form of friction, and the same
// "8 generic knobs" preset covers most cheap controllers.

import { ACTIONS } from './midiMap.js'

const ACTION_IDS = new Set(ACTIONS.map(a => a.id))

// Validator — keeps every preset honest. We run this once at module
// load so a typo in a presets table fails the build's lint pass via
// the throw, rather than silently shipping a half-broken bundle.
function validateMap(presetId, map) {
  if (!map || typeof map !== 'object') {
    throw new Error(`midiPresets: '${presetId}' has no map`)
  }
  for (const [cc, actionId] of Object.entries(map)) {
    const n = parseInt(cc, 10)
    if (!Number.isFinite(n) || n < 0 || n > 127) {
      throw new Error(`midiPresets: '${presetId}' CC '${cc}' out of range`)
    }
    if (typeof actionId !== 'string' || !ACTION_IDS.has(actionId)) {
      throw new Error(`midiPresets: '${presetId}' unknown actionId '${actionId}' at CC ${cc}`)
    }
  }
}

// nanoKONTROL2: 8 faders (CC 0..7) + 8 knobs (CC 16..23). Faders →
// the "looks of the scene" lane (count, glow, attract, FX), knobs →
// the "motion of the scene" lane (speed, orbit, wind, noise).
const KORG_NANOKONTROL2 = {
  id:          'korg-nanokontrol2',
  name:        'Korg nanoKONTROL2',
  description: 'Factory layout — faders + knobs.',
  vendor:      'Korg',
  map: {
    '0':  'particleCount',
    '1':  'glow',
    '2':  'attract',
    '3':  'paletteMix',
    '4':  'caInt',
    '5':  'vgInt',
    '6':  'fgInt',
    '7':  'shakeInt',
    '16': 'speed',
    '17': 'orbit',
    '18': 'windInt',
    '19': 'windAz',
    '20': 'noiseAmp',
    '21': 'noiseFreq',
  },
}

// Novation Launch Control XL: factory layout sends CC 13..20 on the
// top knob row, 29..36 mid, 49..56 bottom, faders 77..84. Our 14-slot
// action registry doesn't need all 32 — we pick top row + faders for
// a clean "looks vs motion" split that mirrors nanoKONTROL2.
const NOVATION_LCXL = {
  id:          'novation-launch-control-xl',
  name:        'Novation Launch Control XL',
  description: 'Factory layout — top knob row + faders.',
  vendor:      'Novation',
  map: {
    '77': 'particleCount',
    '78': 'glow',
    '79': 'attract',
    '80': 'paletteMix',
    '81': 'caInt',
    '82': 'vgInt',
    '83': 'fgInt',
    '84': 'shakeInt',
    '13': 'speed',
    '14': 'orbit',
    '15': 'windInt',
    '16': 'windAz',
    '17': 'noiseAmp',
    '18': 'noiseFreq',
  },
}

// Akai MPK Mini Mk2/3: K1..K8 ship on CC 70..77 by default. We get 8
// knobs total, so the bundle covers the most "tweakable" actions only.
const AKAI_MPK_MINI = {
  id:          'akai-mpk-mini',
  name:        'Akai MPK Mini',
  description: 'Factory knob layout — K1..K8 on CC 70..77.',
  vendor:      'Akai',
  map: {
    '70': 'speed',
    '71': 'glow',
    '72': 'attract',
    '73': 'paletteMix',
    '74': 'caInt',
    '75': 'vgInt',
    '76': 'windInt',
    '77': 'noiseAmp',
  },
}

// Generic 8-knob fallback: most "MIDI 1.0 class-compliant" cheap
// controllers default to CC 1..8 because that's what the manufacturer
// ships when they didn't bother customising. Useful when the device
// shows up as "MIDI input" with no vendor signature.
const GENERIC_8_KNOBS = {
  id:          'generic-8-knobs',
  name:        'Generic 8 Knobs',
  description: 'CC 1..8 — works with most class-compliant controllers.',
  vendor:      'Generic',
  map: {
    '1': 'speed',
    '2': 'glow',
    '3': 'attract',
    '4': 'paletteMix',
    '5': 'caInt',
    '6': 'vgInt',
    '7': 'windInt',
    '8': 'noiseAmp',
  },
}

export const MIDI_PRESETS = [
  KORG_NANOKONTROL2,
  NOVATION_LCXL,
  AKAI_MPK_MINI,
  GENERIC_8_KNOBS,
]

// Validate every shipped preset at module load — a typo in one of
// the maps above turns into a loud throw rather than a silent
// "binding does nothing" at runtime.
for (const p of MIDI_PRESETS) validateMap(p.id, p.map)

const PRESETS_BY_ID = new Map(MIDI_PRESETS.map(p => [p.id, p]))

export function getMidiPreset(id) {
  return PRESETS_BY_ID.get(id) || null
}

// Build a fresh CC→action map from a preset by id. Returns {} on a
// bad id so callers can apply without a try/catch.
export function buildMidiMapFromPreset(id) {
  const p = PRESETS_BY_ID.get(id)
  if (!p) return {}
  // Defensive copy — we never want a downstream mutation to alter
  // the shipped preset's source-of-truth.
  return { ...p.map }
}

// Match a connected MIDIInput by `name` to the most likely preset.
// Useful for the UI's "auto-detect" hint — surfaces a preset chip
// next to the device row without committing the binding.
//
// Heuristic: case-insensitive vendor+model substring match. Returns
// the preset id, or null when nothing matches well enough.
export function detectPresetForInput(inputName) {
  if (typeof inputName !== 'string' || inputName.length === 0) return null
  const lower = inputName.toLowerCase()
  if (lower.includes('nanokontrol'))     return KORG_NANOKONTROL2.id
  if (lower.includes('launch control'))  return NOVATION_LCXL.id
  if (lower.includes('launchcontrol'))   return NOVATION_LCXL.id
  if (lower.includes('mpk mini'))        return AKAI_MPK_MINI.id
  if (lower.includes('mpkmini'))         return AKAI_MPK_MINI.id
  if (lower.includes('mpk-mini'))        return AKAI_MPK_MINI.id
  return null
}

// Merge a preset into an existing map. Strategy "replace" wipes the
// existing map first; "merge" keeps existing bindings that the
// preset doesn't touch. The latter is useful when the user has
// already Learn-bound a couple of their favourite knobs and just
// wants the rest auto-filled.
export function applyPresetToMap(currentMap, presetId, mode = 'replace') {
  const incoming = buildMidiMapFromPreset(presetId)
  if (mode === 'merge') {
    return { ...(currentMap || {}), ...incoming }
  }
  // replace
  return incoming
}

// Friendly counts for the UI — e.g. "14 actions" / "8 knobs".
export function presetBindingCount(id) {
  const p = PRESETS_BY_ID.get(id)
  if (!p) return 0
  return Object.keys(p.map).length
}
