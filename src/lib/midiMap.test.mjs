// midiMap: CC→action persistence, MIDI message decode, CC normalization,
// applyCC dispatch, immutability of setBinding.
import {
  STORAGE_KEY, ACTIONS, decodeMidiMessage, ccToNormalized,
  loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  applyCC,
  // R12.05 + R13.18 — attractor routing (5 fields per attractor)
  attractorActionId, parseAttractorActionId, resolveActionForId,
  actionLabel, attractorActions,
  ATTRACTOR_ACTION_PREFIX, ATTRACTOR_FIELD_STRENGTH,
  ATTRACTOR_FIELD_RADIUS, ATTRACTOR_FIELD_X, ATTRACTOR_FIELD_Y, ATTRACTOR_FIELD_Z,
  // R15.16 — per-attractor ENABLED routing + Schmitt-trigger hysteresis
  ATTRACTOR_FIELD_ENABLED, HYSTERESIS_ON, HYSTERESIS_OFF,
  applyEnabledHysteresis,
  ATTRACTOR_FIELDS, labelForAttractorField,
  // R17.15 — log-curve radius routing
  ATTRACTOR_FIELD_RADIUS_LOG, logCurveShape, logCurveRadius,
  // R18.16 — per-attractor TYPE routing + band-hysteresis cycle
  ATTRACTOR_FIELD_TYPE, TYPE_BAND_HYSTERESIS, pickAttractorTypeForCC,
} from './midiMap.js'
import { STRENGTH_MAX, RADIUS_MIN, RADIUS_MAX, POSITION_MIN, POSITION_MAX, ATTRACTOR_TYPES } from './namedAttractors.js'

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
// R13.18 — emits one row PER FIELD per attractor (strength,
// radius, x, y, z). R15.16 — adds `enabled` so the count is now 6 per
// attractor.
{
  const store = {
    namedAttractors: [
      { id: 'attr-1', name: 'Eye', strength: 1, type: 'attractor', enabled: true },
      { id: 'attr-9', name: 'Beam', strength: 2, type: 'vortex', enabled: true },
    ],
  }
  const rows = attractorActions(store)
  eq(rows.length, 2 * ATTRACTOR_FIELDS.length, `${ATTRACTOR_FIELDS.length} rows per attractor (strength/radius/radiusLog/x/y/z/enabled)`)
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
  // R17.15 — Field 2 is radiusLog, slotted directly after the linear
  // Radius row so the MidiPanel groups them visually as a pair.
  eq(rows[2].id, 'attr:attr-1:radiusLog', 'row 2 is radiusLog (R17.15)')
  eq(rows[2].label, 'Eye · Radius·log', 'radiusLog label uses the · separator')
  eq(rows[2].min, RADIUS_MIN, 'radiusLog min matches linear radius (same target range)')
  eq(rows[2].max, RADIUS_MAX, 'radiusLog max matches linear radius (same target range)')
  // Fields 3-5 are x/y/z and share the position range.
  eq(rows[3].id, 'attr:attr-1:x', 'row 3 is x')
  eq(rows[3].label, 'Eye · X', 'x label')
  eq(rows[3].min, POSITION_MIN, 'x min = POSITION_MIN')
  eq(rows[3].max, POSITION_MAX, 'x max = POSITION_MAX')
  eq(rows[4].id, 'attr:attr-1:y', 'row 4 is y')
  eq(rows[5].id, 'attr:attr-1:z', 'row 5 is z')
  // R15.16 — last field is enabled and carries the [0, 1] range.
  eq(rows[6].id, 'attr:attr-1:enabled', 'row 6 is enabled of attractor 1')
  eq(rows[6].label, 'Eye · Enabled', 'enabled label')
  eq(rows[6].min, 0, 'enabled min')
  eq(rows[6].max, 1, 'enabled max')
  eq(rows[6].field, 'enabled', 'enabled field id')
  // Second attractor starts at index ATTRACTOR_FIELDS.length (= 7).
  eq(rows[ATTRACTOR_FIELDS.length].id, 'attr:attr-9:strength', 'second attractor begins after first')
  eq(rows[ATTRACTOR_FIELDS.length].label, 'Beam · Strength', 'second attractor strength label')
  // Empty / missing input is safe.
  eq(attractorActions(null).length, 0, 'null store → empty')
  eq(attractorActions({}).length, 0, 'no list → empty')
  // Corrupt entry (no id) is dropped without breaking the loop.
  const corrupt = { namedAttractors: [{ id: 'attr-7', name: 'Good' }, { name: 'broken' }] }
  eq(attractorActions(corrupt).length, ATTRACTOR_FIELDS.length, 'corrupt entry dropped, valid one keeps all fields')
}

// --- R15.16 — resolveActionForId('attr:<id>:enabled') drives the
// store's updateNamedAttractor with hysteresis ---
{
  const calls = []
  const liveAtt = { id: 'attr-2', name: 'Pulse', enabled: false, strength: 1, type: 'attractor' }
  const store = {
    namedAttractors: [liveAtt],
    updateNamedAttractor: (id, patch) => {
      calls.push({ id, patch })
      if (id === liveAtt.id) Object.assign(liveAtt, patch)
    },
  }
  const a = resolveActionForId('attr:attr-2:enabled', store)
  ok(a, 'enabled action resolves')
  eq(a.label, 'Pulse · Enabled', 'enabled label')
  eq(a.min, 0, 'enabled min')
  eq(a.max, 1, 'enabled max')
  eq(a.field, 'enabled', 'enabled field')
  // Sweep: 0 → 0.5 → 0.55 (stays off, AT threshold), 0.6 (flips on),
  // 0.5 (stays on, dead band), 0.44 (flips off).
  a.set(0,    store);  eq(calls.length, 0, '0 with off → no-op (was off)')
  a.set(0.5,  store);  eq(calls.length, 0, '0.5 with off → no-op (dead-band, held off)')
  a.set(0.55, store);  eq(calls.length, 0, 'AT threshold with off → no-op (must EXCEED)')
  a.set(0.6,  store);  eq(calls.length, 1, '0.6 with off → fires (above high)')
  eq(calls[0].patch.enabled, true, 'enable flip writes enabled=true')
  a.set(0.5,  store);  eq(calls.length, 1, '0.5 with on → no-op (dead-band, held on)')
  a.set(0.44, store);  eq(calls.length, 2, '0.44 with on → fires (below low)')
  eq(calls[1].patch.enabled, false, 'disable flip writes enabled=false')
}

// Deleted attractor → silent no-op (the setter bails before touching store).
{
  const calls = []
  const store = {
    namedAttractors: [],  // attractor-2 not present
    updateNamedAttractor: (id, patch) => calls.push({ id, patch }),
  }
  // resolveActionForId still returns null (no such attractor) — defensive parity
  // with the other per-attractor fields.
  eq(resolveActionForId('attr:attr-2:enabled', store), null, 'deleted attractor → null action')
  eq(calls.length, 0, 'no call to updateNamedAttractor')
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
  // R15.16 — enabled is now a documented routing field.
  const me = setBinding({}, 31, 'attr:attr-1:enabled')
  eq(me['31'], 'attr:attr-1:enabled', 'setBinding accepts attr:enabled (R15.16)')
  // Genuinely unknown field still rejected.
  const m2 = setBinding({}, 32, 'attr:attr-1:gizmo')
  eq(m2['32'], undefined, 'unknown field still rejected (no `gizmo` route)')
}

// --- R13.18 — parseAttractorActionId validates the field too ---
{
  ok(parseAttractorActionId('attr:attr-1:radius'), 'radius parses')
  ok(parseAttractorActionId('attr:attr-1:x'), 'x parses')
  ok(parseAttractorActionId('attr:attr-1:enabled'), 'enabled parses (R15.16)')
  eq(parseAttractorActionId('attr:attr-1:gizmo'), null, 'unknown field rejected')
  eq(parseAttractorActionId('attr:attr-1:STRENGTH'), null, 'case-sensitive — uppercase rejected')
}

// --- R15.16 — labelForAttractorField covers all fields (incl. enabled + radiusLog) ---
{
  eq(labelForAttractorField(ATTRACTOR_FIELD_STRENGTH), 'Strength', 'strength label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_RADIUS),   'Radius',   'radius label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_RADIUS_LOG), 'Radius·log', 'radiusLog label (R17.15)')
  eq(labelForAttractorField(ATTRACTOR_FIELD_X),        'X',        'x label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_Y),        'Y',        'y label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_Z),        'Z',        'z label')
  eq(labelForAttractorField(ATTRACTOR_FIELD_ENABLED),  'Enabled',  'enabled label (R15.16)')
  // Unknown field falls back to its raw value.
  eq(labelForAttractorField('mystery'), 'mystery', 'unknown field passes through')
  // Empty / nullish → fallback question mark.
  eq(labelForAttractorField(''), '?', 'empty → ?')
  eq(labelForAttractorField(null), '?', 'null → ?')
}

// --- R15.16 — applyEnabledHysteresis (Schmitt-trigger semantics) ---
// Sanity: thresholds are documented + sane.
ok(HYSTERESIS_OFF < 0.5 && HYSTERESIS_OFF > 0,    'OFF threshold in (0, 0.5)')
ok(HYSTERESIS_ON  > 0.5 && HYSTERESIS_ON  < 1,    'ON threshold in (0.5, 1)')
ok(HYSTERESIS_ON  > HYSTERESIS_OFF,               'ON > OFF (proper dead-band)')

// Off → stays off below the HIGH threshold; flips on only above it.
eq(applyEnabledHysteresis(false, 0),                  false, 'off + 0 = off')
eq(applyEnabledHysteresis(false, HYSTERESIS_OFF),     false, 'off + low-threshold = off')
eq(applyEnabledHysteresis(false, 0.5),                false, 'off + dead-band centre = off (hold)')
eq(applyEnabledHysteresis(false, HYSTERESIS_ON),      false, 'off + AT high-threshold = off (must EXCEED)')
eq(applyEnabledHysteresis(false, HYSTERESIS_ON + 0.001), true,  'off + just above high = on')
eq(applyEnabledHysteresis(false, 1),                  true,  'off + 1 = on')

// On → stays on above the LOW threshold; flips off only below it.
eq(applyEnabledHysteresis(true, 1),                   true,  'on + 1 = on')
eq(applyEnabledHysteresis(true, HYSTERESIS_ON),       true,  'on + high-threshold = on')
eq(applyEnabledHysteresis(true, 0.5),                 true,  'on + dead-band centre = on (hold)')
eq(applyEnabledHysteresis(true, HYSTERESIS_OFF),      true,  'on + AT low-threshold = on (must FALL below)')
eq(applyEnabledHysteresis(true, HYSTERESIS_OFF - 0.001), false, 'on + just below low = off')
eq(applyEnabledHysteresis(true, 0),                   false, 'on + 0 = off')

// Knob jitter in the dead-band doesn't chatter: walk through 50 values
// inside [OFF, ON] and verify the state never flips.
{
  for (const start of [false, true]) {
    let state = start
    for (let i = 0; i <= 50; i++) {
      const v = HYSTERESIS_OFF + (i / 50) * (HYSTERESIS_ON - HYSTERESIS_OFF)
      state = applyEnabledHysteresis(state, v)
      eq(state, start, `dead-band: state held from ${start} at v=${v.toFixed(3)}`)
    }
  }
}

// Defensive: NaN / non-finite input degrades to the current state
// (NEVER flips because of bad data).
eq(applyEnabledHysteresis(true,  NaN),       true,  'on + NaN = on')
eq(applyEnabledHysteresis(false, NaN),       false, 'off + NaN = off')
eq(applyEnabledHysteresis(true,  undefined), true,  'on + undefined = on')
eq(applyEnabledHysteresis(false, Infinity),  false, 'off + Infinity = off (NOT flipped)')

// Full cycle: rising sweep through the dead-band → fires ON exactly
// once at the high threshold. Falling sweep back through → fires OFF
// exactly once at the low threshold.
{
  let s = false
  let flips = 0
  const samples = []
  for (let v = 0; v <= 1.0001; v += 0.01) samples.push(v)
  for (const v of samples) {
    const n = applyEnabledHysteresis(s, v)
    if (n !== s) flips++
    s = n
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const v = samples[i]
    const n = applyEnabledHysteresis(s, v)
    if (n !== s) flips++
    s = n
  }
  // Up + back: ON once on the way up, OFF once on the way down.
  eq(flips, 2, 'full up+down sweep produces exactly two flips')
}

// --- R17.15 — logCurveShape + logCurveRadius (inverse-log radius routing) ---

// Endpoint anchors: 0 → 0, 1 → 1 (curve never overshoots the linear range).
near(logCurveShape(0), 0, 'logCurveShape: 0 → 0')
near(logCurveShape(1), 1, 'logCurveShape: 1 → 1')
// Defensive: out-of-range and non-finite values clamp safely.
eq(logCurveShape(-1),       0, 'logCurveShape: negative → 0 (clamped)')
eq(logCurveShape(2),        1, 'logCurveShape: > 1 → 1 (clamped)')
eq(logCurveShape(NaN),      0, 'logCurveShape: NaN → 0')
eq(logCurveShape(Infinity), 0, 'logCurveShape: Infinity → 0 (non-finite falls to the calm default)')
eq(logCurveShape(-Infinity),0, 'logCurveShape: -Infinity → 0')
eq(logCurveShape(null),     0, 'logCurveShape: null → 0')

// The midpoint test that names this curve "log": v=0.5 should land
// BELOW the linear 0.5 mark (knob's middle gives a result tilted
// toward the low end of the radius range). 2^0.5 - 1 ≈ 0.414.
{
  const mid = logCurveShape(0.5)
  if (!(mid > 0.4 && mid < 0.42)) {
    fail(`logCurveShape(0.5) expected ≈0.414, got ${mid}`)
  }
  // Strictly less than linear midpoint — that's the WHOLE point.
  ok(mid < 0.5, 'logCurveShape(0.5) sits below linear 0.5 (low-end bias)')
}

// Monotonic on the input: a rising knob never produces a falling shape.
{
  let prev = -1
  for (let v = 0; v <= 1.0001; v += 0.05) {
    const s = logCurveShape(v)
    if (s < prev) fail(`logCurveShape not monotonic at v=${v}: ${s} < ${prev}`)
    prev = s
  }
}

// logCurveRadius wraps the shape with the radius range + clamp:
// v=0 → RADIUS_MIN exactly, v=1 → RADIUS_MAX exactly.
near(logCurveRadius(0), RADIUS_MIN, 'logCurveRadius(0) = RADIUS_MIN')
near(logCurveRadius(1), RADIUS_MAX, 'logCurveRadius(1) = RADIUS_MAX')
// Midpoint sits below the linear midpoint (lower-end bias).
{
  const linearMid = RADIUS_MIN + 0.5 * (RADIUS_MAX - RADIUS_MIN)
  const logMid    = logCurveRadius(0.5)
  if (!(logMid < linearMid)) {
    fail(`logCurveRadius(0.5)=${logMid} should be < linear mid ${linearMid}`)
  }
  // Concretely: with RADIUS_MIN=4 and RADIUS_MAX=16, midpoint ≈ 4 + 0.414*12 = 8.97
  // (linear mid is 10), so we sit in the 8..9 range — fine control at
  // the low end is preserved.
  if (!(logMid > 8 && logMid < 9.5)) {
    fail(`logCurveRadius(0.5) expected ~8..9.5 (RADIUS_MIN=${RADIUS_MIN}, RADIUS_MAX=${RADIUS_MAX}), got ${logMid}`)
  }
}
// Out-of-range still clamps to the radius bounds.
near(logCurveRadius(-1), RADIUS_MIN, 'logCurveRadius(-1) clamps to MIN')
near(logCurveRadius(2),  RADIUS_MAX, 'logCurveRadius(2)  clamps to MAX')
eq(logCurveRadius(NaN), RADIUS_MIN, 'logCurveRadius(NaN) → MIN (calm default)')

// --- R17.15 — attractorActionId / parseAttractorActionId support radiusLog ---
{
  const id = attractorActionId('attr-1', ATTRACTOR_FIELD_RADIUS_LOG)
  eq(id, 'attr:attr-1:radiusLog', 'attractorActionId mints the radiusLog id')
  const parsed = parseAttractorActionId(id)
  ok(parsed, 'radiusLog id parses back')
  eq(parsed.attractorId, 'attr-1', 'parsed attractorId')
  eq(parsed.field, 'radiusLog',    'parsed field')
}

// --- R17.15 — resolveActionForId('attr:<id>:radiusLog') writes log-curve radii ---
{
  const live = { id: 'attr-3', name: 'Pulse', strength: 1, type: 'attractor', radius: 10, enabled: true }
  const calls = []
  const store = {
    namedAttractors: [live],
    updateNamedAttractor: (id, patch) => { calls.push({ id, patch }); if (id === live.id) Object.assign(live, patch) },
  }
  const a = resolveActionForId('attr:attr-3:radiusLog', store)
  ok(a, 'radiusLog action resolves')
  eq(a.label, 'Pulse · Radius·log', 'radiusLog label')
  eq(a.min, RADIUS_MIN, 'radiusLog action min')
  eq(a.max, RADIUS_MAX, 'radiusLog action max')
  // Endpoint anchors at the slider extremes.
  a.set(0, store)
  near(calls[0].patch.radius, RADIUS_MIN, 'set(0) → RADIUS_MIN')
  a.set(1, store)
  near(calls[1].patch.radius, RADIUS_MAX, 'set(1) → RADIUS_MAX')
  // Midpoint produces the curve-shaped result (lower than linear mid).
  a.set(0.5, store)
  const linearMid = RADIUS_MIN + 0.5 * (RADIUS_MAX - RADIUS_MIN)
  if (!(calls[2].patch.radius < linearMid)) {
    fail(`set(0.5) radius ${calls[2].patch.radius} should be < linear mid ${linearMid}`)
  }
  // Defensive: NaN doesn't crash the store, falls back to RADIUS_MIN.
  a.set(NaN, store)
  near(calls[3].patch.radius, RADIUS_MIN, 'set(NaN) → RADIUS_MIN (defensive)')
}

// --- R17.15 — radiusLog and linear radius co-exist (no replacement) ---
// Both rows are emitted by attractorActions so users can bind a CC to
// EITHER, with both bindings concurrently active (different CCs).
{
  const store = { namedAttractors: [{ id: 'attr-1', name: 'A', strength: 1, type: 'attractor' }] }
  const rows = attractorActions(store)
  const fields = rows.map(r => r.field)
  ok(fields.includes('radius'),    'linear radius row present')
  ok(fields.includes('radiusLog'), 'log-curve radius row present (R17.15)')
  // radiusLog sits right after radius (the MidiPanel grouping uses
  // array order to lay out the per-attractor section).
  const lin = fields.indexOf('radius')
  const log = fields.indexOf('radiusLog')
  eq(log, lin + 1, 'radiusLog sits adjacent to radius (slot-pair layout)')
}

// --- R18.16 — pickAttractorTypeForCC: band-hysteresis cycle ---
// 4 types in ATTRACTOR_TYPES (attractor / repulsor / vortex / turbulence).
// With band width = 0.25, boundaries sit at 0.25, 0.50, 0.75. The
// dead-band ± TYPE_BAND_HYSTERESIS (0.015) at each boundary holds the
// previous type ONLY when the previous type is a direct neighbour.
{
  // Defaults snapshot — pinning the live shape so a future refactor
  // can't silently shift the band picker.
  eq(TYPE_BAND_HYSTERESIS, 0.015, 'TYPE_BAND_HYSTERESIS pinned')
  eq(ATTRACTOR_FIELD_TYPE, 'type', 'ATTRACTOR_FIELD_TYPE pinned')
  ok(ATTRACTOR_FIELDS.includes('type'), 'TYPE present in ATTRACTOR_FIELDS')
  ok(ATTRACTOR_FIELDS.length === 8, `ATTRACTOR_FIELDS now at 8 fields (was 7) — got ${ATTRACTOR_FIELDS.length}`)
}
// Out-of-band picks the correct type by which quarter v01 falls in.
{
  eq(pickAttractorTypeForCC('attractor', 0.10), 'attractor', '0.10 → attractor (band 0)')
  eq(pickAttractorTypeForCC('attractor', 0.30), 'repulsor',  '0.30 → repulsor (band 1)')
  eq(pickAttractorTypeForCC('attractor', 0.60), 'vortex',    '0.60 → vortex (band 2)')
  eq(pickAttractorTypeForCC('attractor', 0.90), 'turbulence','0.90 → turbulence (band 3)')
}
// Endpoint anchors — 0 → first type, 1 → last type.
{
  eq(pickAttractorTypeForCC('attractor', 0),   'attractor',  'v01=0 → first band (attractor)')
  eq(pickAttractorTypeForCC('attractor', 1),   'turbulence', 'v01=1 → last band (turbulence)')
}
// Clamp behaviour — out-of-range values still map cleanly.
{
  eq(pickAttractorTypeForCC('attractor', -0.5), 'attractor',  'v01<0 clamps to 0 (first band)')
  eq(pickAttractorTypeForCC('vortex',    1.5),  'turbulence', 'v01>1 clamps to 1 (last band)')
}
// Boundary tie — exact 0.25 lands in the HIGHER band (half-open).
{
  // Use a previous type that's NOT adjacent so the dead-band doesn't
  // hold us — confirms the band-selection rule independently.
  // vortex (idx 2) is non-adjacent to band 0 and band 3 — both transitions skip the hold.
  eq(pickAttractorTypeForCC('vortex',    0.25), 'repulsor',   '0.25 lands in higher band (repulsor) [prev vortex is non-adjacent → no hold]')
  // For 0.50 prev=attractor (idx 0) is non-adjacent to band 2 (vortex).
  eq(pickAttractorTypeForCC('attractor', 0.50), 'vortex',     '0.50 lands in higher band (vortex) [prev attractor is non-adjacent → no hold]')
  // For 0.75 prev=attractor (idx 0) is non-adjacent to band 3 (turbulence).
  eq(pickAttractorTypeForCC('attractor', 0.75), 'turbulence', '0.75 lands in higher band (turbulence) [prev attractor is non-adjacent → no hold]')
}
// Dead-band holds the previous type when previous was the LOWER
// neighbour (e.g. user sweeps from attractor up, lands in the
// 0.235..0.265 window — should stay on attractor).
{
  eq(pickAttractorTypeForCC('attractor', 0.235), 'attractor', '0.235 (boundary-h) holds previous attractor')
  eq(pickAttractorTypeForCC('attractor', 0.250), 'attractor', '0.250 exactly: dead-band holds previous attractor')
  eq(pickAttractorTypeForCC('attractor', 0.265), 'attractor', '0.265 (boundary+h) still holds previous attractor')
  // Just past the dead-band → switches.
  eq(pickAttractorTypeForCC('attractor', 0.266), 'repulsor', '0.266 past dead-band → repulsor')
}
// Dead-band holds the previous type when previous was the HIGHER
// neighbour (sweep DOWN — symmetry).
{
  eq(pickAttractorTypeForCC('repulsor', 0.260), 'repulsor', '0.260 sweep-down holds previous repulsor')
  eq(pickAttractorTypeForCC('repulsor', 0.240), 'repulsor', '0.240 sweep-down still holds repulsor')
  eq(pickAttractorTypeForCC('repulsor', 0.234), 'attractor','0.234 past dead-band → attractor (lower band)')
}
// Non-adjacent jumps SKIP the dead-band hold — a sudden knob slam
// from attractor to vortex (0.60) doesn't pause in the dead-band.
{
  eq(pickAttractorTypeForCC('attractor', 0.510), 'vortex', 'non-adjacent slam → snap to new band, no hold')
  eq(pickAttractorTypeForCC('attractor', 0.490), 'repulsor', 'non-adjacent: from attractor at 0.49 → repulsor (band 1)')
}
// Defensive contract — non-finite / invalid inputs never crash.
{
  eq(pickAttractorTypeForCC('attractor', NaN),       'attractor',  'NaN → holds previous type')
  eq(pickAttractorTypeForCC('attractor', Infinity),  'attractor',  'Infinity → holds previous type')
  eq(pickAttractorTypeForCC('attractor', -Infinity), 'attractor',  '-Infinity → holds previous type')
  eq(pickAttractorTypeForCC(null,        NaN),       'attractor',  'null prev + NaN v01 → first band')
  eq(pickAttractorTypeForCC('garbage',   NaN),       'attractor',  'unknown prev + NaN v01 → first band')
  eq(pickAttractorTypeForCC(undefined,   0.5),       'vortex',     'undefined prev + 0.5 → band 2 (no hold)')
}
// Empty / invalid types list — returns previousType (defensive).
{
  eq(pickAttractorTypeForCC('attractor', 0.5, []),       'attractor', 'empty types → holds previous')
  eq(pickAttractorTypeForCC(null,        0.5, []),       null,        'empty types + null prev → null')
  eq(pickAttractorTypeForCC('attractor', 0.5, null),     'attractor', 'non-array types → holds previous')
}
// Single-type list — always returns that one type.
{
  eq(pickAttractorTypeForCC('whatever', 0.0, ['only']),  'only', 'single-type list always returns only entry')
  eq(pickAttractorTypeForCC('whatever', 0.5, ['only']),  'only', 'single-type list returns only entry at midpoint')
  eq(pickAttractorTypeForCC('whatever', 1.0, ['only']),  'only', 'single-type list returns only entry at v01=1')
}
// Custom hysteresis arg — passing 0 disables the dead-band entirely.
{
  eq(pickAttractorTypeForCC('attractor', 0.25, ATTRACTOR_TYPES, 0), 'repulsor', 'hysteresis=0: 0.25 snaps to higher band immediately')
  eq(pickAttractorTypeForCC('attractor', 0.249,ATTRACTOR_TYPES, 0), 'attractor','hysteresis=0: 0.249 stays in lower band')
}
// Full-sweep round-trip — 0 → 1 visits every type once in order.
{
  const seen = []
  let prev = 'attractor'
  for (let i = 0; i <= 100; i++) {
    const v = i / 100
    const t = pickAttractorTypeForCC(prev, v)
    if (t !== prev) seen.push(t)
    prev = t
  }
  // Expect at most 3 transitions across a 0→1 sweep.
  ok(seen.length <= 3, `0→1 sweep produces ≤3 transitions — got ${seen.length}: ${seen.join(',')}`)
  // Visits every type in order (allowing for the starting type).
  const visitedTypes = new Set(['attractor', ...seen])
  for (const t of ATTRACTOR_TYPES) ok(visitedTypes.has(t), `0→1 sweep visits ${t}`)
}

// --- R18.16 — attractorActions now emits a type row per attractor ---
{
  const store = { namedAttractors: [{ id: 'attr-1', name: 'A', strength: 1, type: 'vortex' }] }
  const rows = attractorActions(store)
  const fields = rows.map(r => r.field)
  ok(fields.includes('type'), 'type row emitted by attractorActions (R18.16)')
  const typeRow = rows.find(r => r.field === 'type')
  eq(typeRow.min, 0, 'type row min=0')
  eq(typeRow.max, 1, 'type row max=1 (band cycle)')
  eq(typeRow.label, 'A · Type', 'type row label matches "Name · Type"')
  eq(labelForAttractorField(ATTRACTOR_FIELD_TYPE), 'Type', 'labelForAttractorField(type)=Type')
}

// --- R18.16 — resolveActionForId TYPE setter writes through to store ---
{
  const calls = []
  const store = {
    namedAttractors: [{ id: 'attr-1', name: 'A', strength: 1, type: 'attractor' }],
    updateNamedAttractor(id, patch) { calls.push({ id, patch }) },
  }
  const a = resolveActionForId('attr:attr-1:type', store)
  ok(a, 'type action resolves')
  // CC value in attractor band (band 0) — no change from existing attractor type.
  a.set(0.1, store)
  eq(calls.length, 0, 'set in same band as live type → no-op (skip redundant write)')
  // CC value in repulsor band — writes through.
  a.set(0.4, store)
  eq(calls.length, 1, 'set in different band → one write')
  eq(calls[0].patch.type, 'repulsor', 'patch.type=repulsor')
  // Live store mutation simulation — change the type on the store and
  // verify the next call reads the LIVE state for dead-band decisions.
  store.namedAttractors[0].type = 'repulsor'
  a.set(0.260, store)  // dead-band around 0.25 — holds repulsor
  eq(calls.length, 1, '0.260 in dead-band holds live type repulsor (no write)')
  a.set(0.300, store)  // past dead-band but still in repulsor band
  eq(calls.length, 1, '0.300 still in repulsor band → no write')
  a.set(0.600, store)  // vortex band
  eq(calls.length, 2, '0.600 → vortex (1 new write)')
  eq(calls[1].patch.type, 'vortex', 'patch.type=vortex')
}

// --- R18.16 — load/save accepts attr:<id>:type bindings ---
// Round-trips through the existing setBinding + load/save without
// any extra handling (parseAttractorActionId validates the field).
{
  installLocalStorage()
  let map = {}
  map = setBinding(map, 32, attractorActionId('attr-7', ATTRACTOR_FIELD_TYPE))
  eq(map['32'], 'attr:attr-7:type', 'setBinding accepts type action')
  saveMidiMap(map)
  const loaded = loadMidiMap()
  eq(loaded['32'], 'attr:attr-7:type', 'type action round-trips through localStorage')
}

console.log(`PASS: midiMap — ${ACTIONS.length} actions, decode/normalize/persist/setBinding/applyCC + attractor routing (${ATTRACTOR_FIELDS.length} fields per attractor, incl. R15.16 enabled-with-hysteresis [${HYSTERESIS_OFF}, ${HYSTERESIS_ON}] + R17.15 radius·log curve + R18.16 type band-hysteresis ±${TYPE_BAND_HYSTERESIS})`)
