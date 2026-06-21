// midiPresets: every shipped preset references valid ACTION ids,
// builders return fresh objects, detect-by-name works, apply modes
// behave as documented.
import { ACTIONS } from './midiMap.js'
import {
  MIDI_PRESETS, getMidiPreset, buildMidiMapFromPreset,
  detectPresetForInput, applyPresetToMap, presetBindingCount,
  // R13.05 — user preset bundle editor
  STORAGE_KEY_USER_PRESETS, MAX_USER_PRESETS,
  loadUserPresets, saveUserPresets,
  nextUserPresetId, buildUserPresetFromMap,
  addUserPreset, removeUserPreset, isUserPresetId,
} from './midiPresets.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem(k)    { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
    removeItem(k) { map.delete(k) },
    clear()       { map.clear() },
    key(i)        { return Array.from(map.keys())[i] || null },
    get length()  { return map.size },
  }
  return map
}
function uninstallLocalStorage() { delete globalThis.localStorage }

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

// --- R13.05 — user preset bundle editor ---

// nextUserPresetId picks the first free `user-N` slot.
{
  eq(nextUserPresetId([]), 'user-1', 'first id is user-1')
  eq(nextUserPresetId([{ id: 'user-1' }]), 'user-2', 'second id is user-2')
  eq(nextUserPresetId([{ id: 'user-2' }, { id: 'user-1' }]), 'user-3', 'fills gaps in order')
  // Non-numbered user id doesn't reserve a slot.
  eq(nextUserPresetId([{ id: 'user-fancy' }]), 'user-1', 'non-numeric user id ignored for slot reuse')
}

// isUserPresetId is a stable prefix check.
{
  eq(isUserPresetId('user-1'), true, 'user-1 is user id')
  eq(isUserPresetId('user-abc'), true, 'user-abc is user id')
  eq(isUserPresetId('korg-nanokontrol2'), false, 'shipped id rejected')
  eq(isUserPresetId(null), false, 'null rejected')
  eq(isUserPresetId(''), false, 'empty rejected')
}

// buildUserPresetFromMap filters + shapes a bundle.
{
  const liveMap = { '7': 'glow', '10': 'speed', '50': 'attr:attr-1:strength', '-1': 'glow', '999': 'glow' }
  const built = buildUserPresetFromMap('My Live Set', liveMap, [], 1750000000000)
  ok(built, 'bundle built')
  eq(built.id, 'user-1', 'id minted')
  eq(built.name, 'My Live Set', 'name preserved')
  eq(built.vendor, 'Custom', 'vendor stamped Custom')
  // The action `attr:attr-1:strength` is NOT in shipped ACTIONS so
  // sanitizePresetMap drops it — only built-in ids survive.
  eq(Object.keys(built.map).length, 2, 'only valid built-in CCs survive')
  eq(built.map['7'], 'glow', 'cc 7 kept')
  eq(built.map['10'], 'speed', 'cc 10 kept')
  eq(built.map['-1'], undefined, 'negative CC filtered')
  eq(built.map['999'], undefined, 'out-of-range CC filtered')
  ok(built.description.includes('2 binding'), `description mentions binding count — got ${built.description}`)
  // Empty / nullish name → null
  eq(buildUserPresetFromMap('', liveMap), null, 'empty name → null')
  eq(buildUserPresetFromMap('   ', liveMap), null, 'whitespace name → null')
  eq(buildUserPresetFromMap('ok', {}), null, 'empty map → null')
  eq(buildUserPresetFromMap('ok', { '5': 'totally-fake' }), null, 'all-invalid map → null')
}

// addUserPreset caps at MAX_USER_PRESETS (FIFO drop oldest).
{
  let list = []
  for (let i = 1; i <= MAX_USER_PRESETS + 3; i++) {
    const p = buildUserPresetFromMap(`set ${i}`, { '7': 'glow' }, list)
    list = addUserPreset(list, p)
  }
  eq(list.length, MAX_USER_PRESETS, `capped at ${MAX_USER_PRESETS}`)
  // First 3 should have been dropped — oldest wins the boot.
  eq(list[0].name, 'set 4', 'oldest dropped first')
  eq(list[list.length - 1].name, `set ${MAX_USER_PRESETS + 3}`, 'newest at tail')
}

// addUserPreset dedupes by id (re-add overwrites).
{
  const p1 = buildUserPresetFromMap('a', { '7': 'glow' }, [])
  let list = addUserPreset([], p1)
  // Pretend the user saved another bundle with the same id (e.g. updated it).
  const p1b = { ...p1, name: 'a-v2' }
  list = addUserPreset(list, p1b)
  eq(list.length, 1, 'duplicate id deduped')
  eq(list[0].name, 'a-v2', 'newer entry wins')
}

// removeUserPreset filters.
{
  const p1 = buildUserPresetFromMap('a', { '7': 'glow' }, [])
  const p2 = buildUserPresetFromMap('b', { '8': 'speed' }, [p1])
  const list = addUserPreset(addUserPreset([], p1), p2)
  const next = removeUserPreset(list, p1.id)
  eq(next.length, 1, 'one survivor')
  eq(next[0].id, p2.id, 'right one survived')
  // Unknown id → list unchanged in length
  eq(removeUserPreset(list, 'user-999').length, 2, 'unknown id → no change in length')
  // Defensive: non-array → []
  eq(removeUserPreset(null, 'x').length, 0, 'non-array → empty')
}

// load + save round-trip filters corrupt entries.
{
  installLocalStorage()
  const p1 = buildUserPresetFromMap('Show A', { '7': 'glow', '10': 'speed' }, [])
  const p2 = buildUserPresetFromMap('Show B', { '11': 'attract' }, [p1])
  saveUserPresets([p1, p2])
  const back = loadUserPresets()
  eq(back.length, 2, 'two bundles round-trip')
  eq(back[0].name, 'Show A', 'first name preserved')
  eq(back[1].name, 'Show B', 'second name preserved')
  // Now hand-corrupt the storage and verify load drops bad rows.
  globalThis.localStorage.setItem(STORAGE_KEY_USER_PRESETS, JSON.stringify({
    v: 1,
    items: [
      { id: 'user-1', name: 'ok', map: { '7': 'glow' } },
      { id: 'user-2', name: 'bad', map: { '7': 'totally-fake' } }, // all invalid actions → drop
      { id: 'shipped-id', name: 'bad', map: { '7': 'glow' } },     // wrong id prefix → drop
      { id: 'user-3', name: '', map: { '7': 'glow' } },            // empty name → drop
      'not-an-object',                                              // garbage → drop
    ],
  }))
  const cleaned = loadUserPresets()
  eq(cleaned.length, 1, 'only 1 valid entry survives sanitization')
  eq(cleaned[0].name, 'ok', 'the valid one is preserved')
  // Wrong version → empty.
  globalThis.localStorage.setItem(STORAGE_KEY_USER_PRESETS, JSON.stringify({ v: 99, items: [] }))
  eq(loadUserPresets().length, 0, 'future version → empty')
  // Missing key → empty
  globalThis.localStorage.removeItem(STORAGE_KEY_USER_PRESETS)
  eq(loadUserPresets().length, 0, 'no key → empty')
  uninstallLocalStorage()
}

// getMidiPreset / buildMidiMapFromPreset / applyPresetToMap / presetBindingCount
// see user presets when passed the live list.
{
  const userList = [buildUserPresetFromMap('Live A', { '7': 'glow', '10': 'speed' }, [])]
  const userId = userList[0].id
  // Shipped id still wins when no userList overlap.
  ok(getMidiPreset('korg-nanokontrol2', userList), 'shipped id still resolves')
  // User id resolves only via userList.
  ok(getMidiPreset(userId, userList), 'user id resolves with userList')
  eq(getMidiPreset(userId, []), null, 'user id not resolved without userList')
  // buildMidiMapFromPreset returns the user bundle's map.
  const built = buildMidiMapFromPreset(userId, userList)
  eq(built['7'], 'glow', 'user bundle CC 7')
  eq(built['10'], 'speed', 'user bundle CC 10')
  // applyPresetToMap merges/replaces user bundle correctly.
  const replaced = applyPresetToMap({ '99': 'glow' }, userId, 'replace', userList)
  eq(replaced['99'], undefined, 'replace wipes existing')
  eq(replaced['7'], 'glow', 'user bundle landed')
  const merged = applyPresetToMap({ '99': 'glow' }, userId, 'merge', userList)
  eq(merged['99'], 'glow', 'merge kept existing')
  eq(merged['7'], 'glow', 'merge added user bundle')
  // presetBindingCount sees the user bundle's count.
  eq(presetBindingCount(userId, userList), 2, 'count via userList')
  // No userList → unknown.
  eq(presetBindingCount(userId, []), 0, 'no userList → 0 for user id')
}

console.log(`PASS: midiPresets — ${MIDI_PRESETS.length} shipped + user bundle editor (build/add/remove/load/save, cap ${MAX_USER_PRESETS})`)
