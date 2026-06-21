// midiPresets: every shipped preset references valid ACTION ids,
// builders return fresh objects, detect-by-name works, apply modes
// behave as documented.
import { ACTIONS } from './midiMap.js'
import {
  MIDI_PRESETS, getMidiPreset, buildMidiMapFromPreset,
  detectPresetForInput, applyPresetToMap, presetBindingCount,
} from './midiPresets.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

// --- shape ---
ok(Array.isArray(MIDI_PRESETS) && MIDI_PRESETS.length >= 4, 'at least 4 presets shipped')

const ACTION_IDS = new Set(ACTIONS.map(a => a.id))

// Every preset's actionId must be in the registered ACTIONS table.
// Every CC must be 0..127. ids must be unique.
{
  const seenIds = new Set()
  for (const p of MIDI_PRESETS) {
    ok(typeof p.id === 'string' && p.id.length > 0, `preset id missing`)
    ok(!seenIds.has(p.id), `preset id '${p.id}' duplicated`)
    seenIds.add(p.id)
    ok(typeof p.name === 'string' && p.name.length > 0, `${p.id}: name missing`)
    ok(typeof p.description === 'string', `${p.id}: description missing`)
    ok(p.map && typeof p.map === 'object', `${p.id}: map missing`)
    for (const [cc, actionId] of Object.entries(p.map)) {
      const n = parseInt(cc, 10)
      ok(Number.isFinite(n) && n >= 0 && n <= 127, `${p.id}: CC ${cc} out of range`)
      ok(ACTION_IDS.has(actionId), `${p.id}: unknown action '${actionId}' at CC ${cc}`)
    }
  }
}

// --- getMidiPreset ---
{
  const got = getMidiPreset('korg-nanokontrol2')
  ok(got && got.id === 'korg-nanokontrol2', 'lookup by id returns preset')
  eq(getMidiPreset('does-not-exist'), null, 'unknown id → null')
  eq(getMidiPreset(undefined), null, 'undefined id → null')
}

// --- buildMidiMapFromPreset returns a fresh defensive copy ---
{
  const m1 = buildMidiMapFromPreset('korg-nanokontrol2')
  ok(Object.keys(m1).length > 0, 'built map has entries')
  // Mutating the returned map must not affect a subsequent build.
  m1['127'] = 'glow'
  const m2 = buildMidiMapFromPreset('korg-nanokontrol2')
  eq(m2['127'], undefined, 'subsequent build is fresh — no leaked mutation')
  // Can't use === for object identity here — just check the shape.
  ok(Object.keys(buildMidiMapFromPreset('does-not-exist')).length === 0, 'unknown id → empty map')
}

// --- detectPresetForInput ---
eq(detectPresetForInput('nanoKONTROL2 SLIDER/KNOB'), 'korg-nanokontrol2', 'nanoKONTROL detect')
eq(detectPresetForInput('Launch Control XL HUI'),    'novation-launch-control-xl', 'LCXL detect')
eq(detectPresetForInput('LaunchControl Mini'),       'novation-launch-control-xl', 'no-space LCXL detect')
eq(detectPresetForInput('MPK Mini MK3 MIDI 1'),      'akai-mpk-mini', 'MPK Mini detect')
eq(detectPresetForInput('mpkmini2'),                 'akai-mpk-mini', 'no-space MPK Mini detect')
eq(detectPresetForInput('Mystery Synth'),            null,            'unknown device → null')
eq(detectPresetForInput(''),                         null,            'empty string → null')
eq(detectPresetForInput(null),                       null,            'null → null')

// --- applyPresetToMap modes ---
{
  // Replace wipes existing.
  const existing = { '99': 'glow', '50': 'speed' }
  const replaced = applyPresetToMap(existing, 'korg-nanokontrol2', 'replace')
  eq(replaced['99'], undefined, 'replace mode wipes pre-existing CC 99')
  eq(replaced['50'], undefined, 'replace mode wipes pre-existing CC 50')
  ok(Object.keys(replaced).length > 0, 'replace mode populated from preset')

  // Merge keeps existing untouched bindings.
  const merged = applyPresetToMap(existing, 'korg-nanokontrol2', 'merge')
  eq(merged['99'], 'glow', 'merge keeps CC 99 binding')
  eq(merged['50'], 'speed', 'merge keeps CC 50 binding')
  ok(Object.keys(merged).length > Object.keys(existing).length, 'merge added preset bindings on top')

  // Unknown preset: replace → empty, merge → unchanged copy.
  const replacedUnknown = applyPresetToMap(existing, 'does-not-exist', 'replace')
  eq(Object.keys(replacedUnknown).length, 0, 'unknown preset replace → empty')
  const mergedUnknown = applyPresetToMap(existing, 'does-not-exist', 'merge')
  eq(mergedUnknown['99'], 'glow', 'unknown preset merge keeps existing')
  // applyPresetToMap should not mutate the input map.
  eq(existing['99'], 'glow', 'input map untouched (immutability)')
}

// --- presetBindingCount ---
ok(presetBindingCount('korg-nanokontrol2') >= 10, 'nanoKONTROL2 has many bindings')
ok(presetBindingCount('akai-mpk-mini') === 8,     'MPK Mini ships 8 knobs')
ok(presetBindingCount('generic-8-knobs') === 8,   'generic ships 8 knobs')
eq(presetBindingCount('does-not-exist'), 0,       'unknown → 0')

// --- every CC within a preset must be unique (no double-binds) ---
for (const p of MIDI_PRESETS) {
  const ccs = Object.keys(p.map)
  eq(ccs.length, new Set(ccs).size, `${p.id}: no duplicate CCs in map`)
}

console.log(`PASS: midiPresets — ${MIDI_PRESETS.length} controller bundles, validation/build/detect/apply`)
