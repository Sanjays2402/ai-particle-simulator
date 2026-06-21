// midiMap: CC→action persistence, MIDI message decode, CC normalization,
// applyCC dispatch, immutability of setBinding.
import {
  STORAGE_KEY, ACTIONS,
  decodeMidiMessage, ccToNormalized,
  loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  applyCC, actionLabel,
  attractorActionId, parseAttractorActionId,
  resolveActionForId, attractorActions,
  ATTRACTOR_ACTION_PREFIX, ATTRACTOR_FIELD_STRENGTH,
  ATTRACTOR_FIELD_RADIUS, ATTRACTOR_FIELD_X, ATTRACTOR_FIELD_Y, ATTRACTOR_FIELD_Z,
  ATTRACTOR_FIELDS, labelForAttractorField,
} from './midiMap.js'
import { STRENGTH_MAX, RADIUS_MIN, RADIUS_MAX, POSITION_MIN, POSITION_MAX } from './namedAttractors.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }

function installLocalStorage() {
  const map = new Map()
  globalThis.localStorage = {
    getItem(k)         { return map.has(k) ? map.get(k) : null },
    setItem(k, v)      { map.set(k, String(v)) },
    removeItem(k)      { map.delete(k) },
    clear()            { map.clear() },
    key(i)             { return Array.from(map.keys())[i] || null },
    get length()       { return map.size },
  }
  return map
}
function uninstallLocalStorage() { delete globalThis.localStorage }

// --- decodeMidiMessage ---
// CC message: 0xB0, ccNum, value
{
  const r = decodeMidiMessage([0xB0, 7, 64])
  eq(r.type, 0xB0, 'CC type')
  eq(r.channel, 0, 'channel 0')
  eq(r.data1, 7, 'CC# 7')
  eq(r.data2, 64, 'value 64')
}
// NoteOn channel 5
{
  const r = decodeMidiMessage([0x95, 60, 100])
  eq(r.type, 0x90, 'NoteOn type')
  eq(r.channel, 5, 'channel 5')
  eq(r.data1, 60, 'note 60')
  eq(r.data2, 100, 'velocity 100')
}
// SysEx/system real-time → null
eq(decodeMidiMessage([0xF8]), null, 'system message ignored (too short)')
eq(decodeMidiMessage([0xA0, 0, 0]), null, 'PolyPressure ignored')
// Invalid inputs
eq(decodeMidiMessage(null), null, 'null bytes → null')
eq(decodeMidiMessage([0xB0, 0]), null, 'too short → null')
// 7-bit masking — even if a bogus device sends >127, we clamp.
{
  const r = decodeMidiMessage([0xB0, 200, 200])
  eq(r.data1, 200 & 0x7F, 'data1 masked')
  eq(r.data2, 200 & 0x7F, 'data2 masked')
}

// --- ccToNormalized ---
near(ccToNormalized(0),   0,   'cc 0 → 0')
near(ccToNormalized(127), 1,   'cc 127 → 1')
near(ccToNormalized(64),  64/127, 'cc 64')
near(ccToNormalized(-50), 0,   'negative clamps to 0')
near(ccToNormalized(999), 1,   'huge clamps to 1')
near(ccToNormalized(NaN), 0,   'NaN → 0')

// --- load/save/round-trip ---
{
  installLocalStorage()
  eq(Object.keys(loadMidiMap()).length, 0, 'empty store → empty map')
  saveMidiMap({ '7': 'glow', '10': 'orbit', '99': 'noiseAmp' })
  const back = loadMidiMap()
  eq(back['7'], 'glow', 'CC 7 → glow')
  eq(back['10'], 'orbit', 'CC 10 → orbit')
  eq(back['99'], 'noiseAmp', 'CC 99 → noiseAmp')
  uninstallLocalStorage()
}

// --- saveMidiMap filters invalid entries ---
{
  const store = installLocalStorage()
  saveMidiMap({ '7': 'glow', '-1': 'speed', '200': 'speed', '15': 'totally-fake' })
  const raw = JSON.parse(store.get(STORAGE_KEY))
  eq(raw['7'], 'glow', 'valid CC kept')
  eq(raw['-1'], undefined, 'negative CC filtered')
  eq(raw['200'], undefined, 'out-of-range CC filtered')
  eq(raw['15'], undefined, 'unknown actionId filtered')
  uninstallLocalStorage()
}

// --- setBinding immutability + delete ---
{
  const m = { '7': 'glow' }
  const m2 = setBinding(m, 10, 'speed')
  ok(m !== m2, 'setBinding returns new object')
  eq(m2['10'], 'speed', 'binding added')
  eq(m['10'], undefined, 'original untouched')
  // Empty actionId removes the binding.
  const m3 = setBinding(m2, 7, null)
  eq(m3['7'], undefined, 'null actionId removed binding')
  eq(m3['10'], 'speed', 'other binding kept')
  // Invalid CC → no change.
  const m4 = setBinding(m2, 999, 'glow')
  eq(m4, m2, 'invalid CC → same map')
  // Unknown actionId → no change.
  const m5 = setBinding(m2, 8, 'totally-fake')
  eq(m5['8'], undefined, 'unknown actionId not added')
}

// --- clearAllBindings ---
{
  const store = installLocalStorage()
  saveMidiMap({ '7': 'glow' })
  ok(store.has(STORAGE_KEY), 'storage populated')
  const fresh = clearAllBindings()
  ok(!store.has(STORAGE_KEY), 'storage cleared')
  eq(Object.keys(fresh).length, 0, 'returned empty map')
  uninstallLocalStorage()
}

// --- applyCC dispatches to the right setter ---
{
  const callLog = []
  // Fake store with one setter we wired up to log calls.
  const fakeStore = {
    setGlowIntensity: (v) => callLog.push(['glow', v]),
    setSpeed:         (v) => callLog.push(['speed', v]),
    setParticleCount: (v) => callLog.push(['count', v]),
    // All other setters are present-but-noop so the lib doesn't trip
    // when a CC fires for an unmapped registry slot.
  }
  // Provide harmless stubs for every other setter the registry references.
  for (const a of ACTIONS) {
    if (a.id === 'glow' || a.id === 'speed' || a.id === 'particleCount') continue
    if (a.id === 'orbit')      fakeStore.setOrbitSpeed = () => {}
    if (a.id === 'attract')    fakeStore.setAttractStrength = () => {}
    if (a.id === 'windInt')    fakeStore.setWindIntensity = () => {}
    if (a.id === 'windAz')     fakeStore.setWindAzimuth = () => {}
    if (a.id === 'noiseAmp')   fakeStore.setNoiseAmplitude = () => {}
    if (a.id === 'noiseFreq')  fakeStore.setNoiseFrequency = () => {}
    if (a.id === 'caInt')      fakeStore.setChromaticIntensity = () => {}
    if (a.id === 'vgInt')      fakeStore.setVignetteIntensity = () => {}
    if (a.id === 'fgInt')      fakeStore.setFilmGrainIntensity = () => {}
    if (a.id === 'shakeInt')   fakeStore.setCameraShakeIntensity = () => {}
    if (a.id === 'paletteMix') fakeStore.setPaletteMix = () => {}
  }

  const map = { '7': 'glow', '8': 'speed', '20': 'particleCount' }
  // CC 7, value 127 → glow setter called with 1.0
  eq(applyCC(map, 7, 127, fakeStore), 'glow', 'CC 7 hit glow')
  eq(callLog[0][0], 'glow', 'logged glow')
  near(callLog[0][1], 1.0, 'glow set to 1.0')
  // CC 8, value 64 → speed setter called with ~2.519
  applyCC(map, 8, 64, fakeStore)
  eq(callLog[1][0], 'speed', 'logged speed')
  near(callLog[1][1], (64/127) * 5, 'speed set to ~2.52')
  // CC 20, value 0 → particleCount = 1000 (the min).
  applyCC(map, 20, 0, fakeStore)
  eq(callLog[2][0], 'count', 'logged count')
  eq(callLog[2][1], 1000, 'count at value 0 → min')
  // CC 20, value 127 → particleCount = 100000.
  applyCC(map, 20, 127, fakeStore)
  eq(callLog[3][1], 100000, 'count at value 127 → max')

  // CC with no binding → returns null, no call.
  const lengthBefore = callLog.length
  eq(applyCC(map, 99, 64, fakeStore), null, 'unmapped CC → null')
  eq(callLog.length, lengthBefore, 'no setter fired')
  // Null map → null.
  eq(applyCC(null, 7, 64, fakeStore), null, 'null map → null')
}

// --- actionLabel ---
eq(actionLabel('glow'), 'Glow Intensity', 'glow label')
eq(actionLabel('totally-fake'), 'Unmapped', 'unknown → Unmapped')

// --- R12.05 named attractor MIDI routing ---
// Attractor action id format + parse.
{
  eq(attractorActionId('attr-3'), 'attr:attr-3:strength', 'default field = strength')
  eq(attractorActionId('attr-7', 'strength'), 'attr:attr-7:strength', 'explicit field')
  eq(attractorActionId(null), null, 'null id → null')
  eq(attractorActionId(''), null, 'empty id → null')
  // Parse round-trip.
  const parsed = parseAttractorActionId('attr:attr-3:strength')
  eq(parsed.attractorId, 'attr-3', 'parsed attractorId')
  eq(parsed.field, 'strength', 'parsed field')
  eq(parseAttractorActionId('not-an-attr'), null, 'plain string not parsed')
  eq(parseAttractorActionId('attr:'), null, 'empty rest rejected')
  eq(parseAttractorActionId('attr:foo'), null, 'no field rejected')
  eq(parseAttractorActionId('attr:foo:'), null, 'trailing colon rejected')
  eq(parseAttractorActionId(null), null, 'null rejected')
  // Prefix exported for callers that want to filter.
  eq(ATTRACTOR_ACTION_PREFIX, 'attr:', 'prefix value')
  eq(ATTRACTOR_FIELD_STRENGTH, 'strength', 'field constant')
}

// resolveActionForId synthesizes per-attractor actions.
{
  const store = {
    namedAttractors: [
      { id: 'attr-1', name: 'Eye', strength: 1, type: 'attractor' },
      { id: 'attr-2', name: 'Storm', strength: 2, type: 'vortex' },
    ],
    updateNamedAttractor: () => {},
  }
  const a = resolveActionForId('attr:attr-1:strength', store)
  ok(a, 'resolved real attractor')
  eq(a.label, 'Eye · Strength', 'label uses attractor name')
  eq(a.min, 0, 'strength min')
  eq(a.max, STRENGTH_MAX, 'strength max from namedAttractors clamp')
  eq(a.field, 'strength', 'field')
  eq(a.attractor.id, 'attr-1', 'attractor reference')
  // Deleted attractor → null (no crash).
  eq(resolveActionForId('attr:missing:strength', store), null, 'missing attractor → null')
  // Unknown field on a real attractor → null.
  eq(resolveActionForId('attr:attr-1:bogus', store), null, 'unknown field → null')
  // Missing store → null (defensive — applyCC can be called early).
  eq(resolveActionForId('attr:attr-1:strength', null), null, 'no store → null')
  eq(resolveActionForId('attr:attr-1:strength', {}), null, 'store without attractors → null')
  // Built-in id still resolves to the original action.
  eq(resolveActionForId('glow', store).id, 'glow', 'built-in passes through')
}

// applyCC dispatches to the attractor setter with the right strength.
{
  const calls = []
  const store = {
    namedAttractors: [{ id: 'attr-9', name: 'Beam', strength: 0.5, type: 'attractor' }],
    updateNamedAttractor: (id, patch) => calls.push({ id, patch }),
  }
  const map = { '50': 'attr:attr-9:strength' }
  // CC 50, value 127 → strength = STRENGTH_MAX (clamped to upper bound).
  eq(applyCC(map, 50, 127, store), 'attr:attr-9:strength', 'attractor CC dispatched')
  eq(calls[0].id, 'attr-9', 'updated correct attractor')
  near(calls[0].patch.strength, STRENGTH_MAX, 'strength at max')
  // CC 50, value 0 → strength = 0.
  applyCC(map, 50, 0, store)
  near(calls[1].patch.strength, 0, 'strength at min')
  // Deleted attractor → no-op call (silently fails, no entry pushed).
  const lengthBefore = calls.length
  applyCC({ '50': 'attr:missing:strength' }, 50, 64, store)
  eq(calls.length, lengthBefore, 'missing attractor → no setter call')
}

// setBinding accepts attractor ids.
{
  const m = setBinding({}, 17, 'attr:attr-1:strength')
  eq(m['17'], 'attr:attr-1:strength', 'attractor binding stored')
  // Garbage attractor strings are rejected.
  const m2 = setBinding(m, 18, 'attr:')
  eq(m2['18'], undefined, 'malformed attractor id rejected')
  const m3 = setBinding(m, 19, 'attr:foo')
  eq(m3['19'], undefined, 'attractor missing field rejected')
  // Empty/null still clears the slot.
  const m4 = setBinding(m, 17, null)
  eq(m4['17'], undefined, 'null clears attractor binding')
}

// Persistence: attractor ids round-trip through save/load.
{
  installLocalStorage()
  saveMidiMap({ '7': 'glow', '20': 'attr:attr-3:strength', '40': 'attr:bogus' })
  const back = loadMidiMap()
  eq(back['7'], 'glow', 'built-in survives')
  eq(back['20'], 'attr:attr-3:strength', 'attractor id survives')
  eq(back['40'], undefined, 'malformed attractor id dropped on load')
  uninstallLocalStorage()
}

// actionLabel handles attractor ids both alive and stale.
{
  const store = {
    namedAttractors: [{ id: 'attr-1', name: 'Eye', strength: 1, type: 'attractor' }],
  }
  eq(actionLabel('attr:attr-1:strength', store), 'Eye · Strength', 'live attractor label')
  // Deleted attractor still surfaces a removable label.
  const stale = actionLabel('attr:gone:strength', store)
  ok(stale.includes('missing'), `stale label flags missing — got ${stale}`)
  // Without a store the label says missing (no live data to look up).
  ok(actionLabel('attr:attr-1:strength', null).includes('missing'), 'no store → labelled missing')
  // Built-in id still works without a store (back-compat).
  eq(actionLabel('glow'), 'Glow Intensity', 'built-in label without store')
}

// attractorActions exposes a UI-shaped list.
// R13.18 — now emits one row PER FIELD per attractor (strength,
// radius, x, y, z = 5 rows each).
{
  const store = {
    namedAttractors: [
      { id: 'attr-1', name: 'Eye', strength: 1, type: 'attractor' },
      { id: 'attr-9', name: 'Beam', strength: 2, type: 'vortex' },
    ],
  }
  const rows = attractorActions(store)
  eq(rows.length, 2 * ATTRACTOR_FIELDS.length, '5 rows per attractor (strength/radius/x/y/z)')
  // First attractor's first row is still strength (back-compat with
  // R12.05 — strength is field index 0 in ATTRACTOR_FIELDS).
  eq(rows[0].id, 'attr:attr-1:strength', 'row 0 is strength of attractor 1')
  eq(rows[0].label, 'Eye · Strength', 'row label uses live name + field')
  eq(rows[0].max, STRENGTH_MAX, 'strength row carries the strength slider range')
  eq(rows[0].attractorId, 'attr-1', 'row exposes attractorId for the UI')
  // Field 1 is radius.
  eq(rows[1].id, 'attr:attr-1:radius', 'row 1 is radius of attractor 1')
  eq(rows[1].label, 'Eye · Radius', 'radius label')
  eq(rows[1].min, RADIUS_MIN, 'radius min')
  eq(rows[1].max, RADIUS_MAX, 'radius max')
  // Fields 2-4 are x/y/z and share the position range.
  eq(rows[2].id, 'attr:attr-1:x', 'row 2 is x')
  eq(rows[2].label, 'Eye · X', 'x label')
  eq(rows[2].min, POSITION_MIN, 'x min = POSITION_MIN')
  eq(rows[2].max, POSITION_MAX, 'x max = POSITION_MAX')
  eq(rows[3].id, 'attr:attr-1:y', 'row 3 is y')
  eq(rows[4].id, 'attr:attr-1:z', 'row 4 is z')
  // Second attractor starts at index 5.
  eq(rows[5].id, 'attr:attr-9:strength', 'second attractor begins after first')
  eq(rows[5].label, 'Beam · Strength', 'second attractor strength label')
  // Empty / missing input is safe.
  eq(attractorActions(null).length, 0, 'null store → empty')
  eq(attractorActions({}).length, 0, 'no list → empty')
  // Corrupt entry (no id) is dropped without breaking the loop.
  const corrupt = { namedAttractors: [{ id: 'attr-7', name: 'Good' }, { name: 'broken' }] }
  eq(attractorActions(corrupt).length, ATTRACTOR_FIELDS.length, 'corrupt entry dropped, valid one keeps all 5 fields')
}

// --- R13.18 — radius routing ---
{
  const calls = []
  const store = {
    namedAttractors: [{ id: 'attr-5', name: 'Halo', strength: 1, type: 'attractor', radius: 10 }],
    updateNamedAttractor: (id, patch) => calls.push({ id, patch }),
  }
  const a = resolveActionForId('attr:attr-5:radius', store)
  ok(a, 'radius action resolves')
  eq(a.label, 'Halo · Radius', 'radius label')
  eq(a.min, RADIUS_MIN, 'radius min from namedAttractors clamp')
  eq(a.max, RADIUS_MAX, 'radius max from namedAttractors clamp')
  eq(a.field, 'radius', 'field')
  // CC sweep
  const map = { '12': 'attr:attr-5:radius' }
  applyCC(map, 12, 127, store)
  near(calls[0].patch.radius, RADIUS_MAX, 'CC 127 → RADIUS_MAX')
  applyCC(map, 12, 0, store)
  near(calls[1].patch.radius, RADIUS_MIN, 'CC 0 → RADIUS_MIN')
  // Midpoint
  applyCC(map, 12, 64, store)
  const mid = RADIUS_MIN + (64 / 127) * (RADIUS_MAX - RADIUS_MIN)
  near(calls[2].patch.radius, mid, 'CC 64 → midpoint of radius range', 1e-6)
}

// --- R13.18 — position axis routing (x/y/z) ---
{
  const calls = []
  // Live position so the per-axis setter has a base to merge into.
  const store = {
    namedAttractors: [{
      id: 'attr-8', name: 'Drift', strength: 1, type: 'attractor',
      position: [10, 20, 30],
    }],
    updateNamedAttractor: (id, patch) => calls.push({ id, patch }),
  }
  for (const axis of ['x', 'y', 'z']) {
    const a = resolveActionForId(`attr:attr-8:${axis}`, store)
    ok(a, `${axis} action resolves`)
    eq(a.label, `Drift · ${axis.toUpperCase()}`, `${axis} label`)
    eq(a.min, POSITION_MIN, `${axis} min`)
    eq(a.max, POSITION_MAX, `${axis} max`)
  }
  // Sweep X to max — Y and Z should be PRESERVED from the live attractor.
  applyCC({ '20': 'attr:attr-8:x' }, 20, 127, store)
  const xPatch = calls[calls.length - 1].patch
  ok(Array.isArray(xPatch.position), 'x setter writes a position array')
  near(xPatch.position[0], POSITION_MAX, 'x at CC 127 → POSITION_MAX')
  eq(xPatch.position[1], 20, 'y preserved from live state')
  eq(xPatch.position[2], 30, 'z preserved from live state')
  // Now sweep Y — but mutate the live store first to simulate the
  // r12.05 strength sweep happening concurrently. The y setter must
  // read the CURRENT position triple, not its closed-over snapshot.
  store.namedAttractors[0].position = [POSITION_MAX, 20, 30]
  applyCC({ '21': 'attr:attr-8:y' }, 21, 0, store)
  const yPatch = calls[calls.length - 1].patch
  near(yPatch.position[1], POSITION_MIN, 'y at CC 0 → POSITION_MIN')
  eq(yPatch.position[0], POSITION_MAX, 'x stays at the live POSITION_MAX (not 10)')
  eq(yPatch.position[2], 30, 'z still preserved')
}

// --- R13.18 — setBinding accepts the new attractor fields ---
{
  for (const field of ['radius', 'x', 'y', 'z']) {
    const m = setBinding({}, 30, `attr:attr-1:${field}`)
    eq(m['30'], `attr:attr-1:${field}`, `setBinding accepts attr:${field}`)
  }
  // Unknown field still rejected.
  const m2 = setBinding({}, 31, 'attr:attr-1:enabled')
  eq(m2['31'], undefined, 'unknown field still rejected (no `enabled` route yet)')
}

// --- R13.18 — parseAttractorActionId validates the field too ---
{
  ok(parseAttractorActionId('attr:attr-1:radius'), 'radius parses')
  ok(parseAttractorActionId('attr:attr-1:x'), 'x parses')
  eq(parseAttractorActionId('attr:attr-1:enabled'), null, 'unknown field rejected')
  eq(parseAttractorActionId('attr:attr-1:STRENGTH'), null, 'case-sensitive — uppercase rejected')
}

// --- R13.18 — labelForAttractorField covers all five ---
{
  eq(labelForAttractorField(ATTRACTOR_FIELD_STRENGTH), 'Strength', 'strength label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_RADIUS),   'Radius',   'radius label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_X),        'X',        'x label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_Y),        'Y',        'y label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_Z),        'Z',        'z label')
  // Unknown field falls back to its raw value.
  eq(labelForAttractorField('mystery'), 'mystery', 'unknown field passes through')
  // Empty / nullish → fallback question mark.
  eq(labelForAttractorField(''), '?', 'empty → ?')
  eq(labelForAttractorField(null), '?', 'null → ?')
}

console.log(`PASS: midiMap — ${ACTIONS.length} actions, decode/normalize/persist/setBinding/applyCC + attractor routing (${ATTRACTOR_FIELDS.length} fields per attractor)`)
