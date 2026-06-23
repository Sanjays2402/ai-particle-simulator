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
  // R19.16 — projector for the TYPE row tooltip's "current band" tag
  describeTypeBand,
  // R21.22 — clamp-proximity projector for continuous (non-band) fields
  clampProximity01, describeClampProximity,
  // R22.27 — user-tunable warning threshold for the clamp meter
  classifyClampProximity, sanitizeClampWarnThreshold, isClampWarnThresholdAtDefault,
  CLAMP_WARN_THRESHOLD_DEFAULT, CLAMP_WARN_THRESHOLD_MIN, CLAMP_WARN_THRESHOLD_MAX,
  // R23.32 — per-field clamp warn threshold overrides
  CLAMP_THRESHOLD_FIELDS,
  sanitizeClampWarnOverrides, resolveClampWarnThreshold,
  setClampWarnFieldOverride, clearAllClampWarnOverrides,
  hasClampWarnFieldOverride,
  // R24.40 — per-(attractor, field) overrides (graduates R23.32)
  sanitizeClampWarnAttractorOverrides,
  resolveClampWarnThresholdFor,
  setClampWarnAttractorFieldOverride,
  clearAllClampWarnAttractorOverrides,
  clearClampWarnAttractorOverrides,
  // R25.45 — bulk-clear count projector
  countClampWarnAttractorOverridesFor,
  hasClampWarnAttractorFieldOverride,
  pruneClampWarnAttractorOverrides,
} from './midiMap.js'
import { STRENGTH_MAX, RADIUS_MIN, RADIUS_MAX, POSITION_MIN, POSITION_MAX, ATTRACTOR_TYPES } from './namedAttractors.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }
// R23.32 — deep equality for the per-field overrides tests. Stringify-
// based so we can do { strength: 0.10 } vs { strength: 0.10 } comparisons.
function deepEq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }

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

console.log(`PASS: midiMap — ${ACTIONS.length} actions, decode/normalize/persist/setBinding/applyCC + attractor routing (${ATTRACTOR_FIELDS.length} fields per attractor, incl. R15.16 enabled-with-hysteresis [${HYSTERESIS_OFF}, ${HYSTERESIS_ON}] + R17.15 radius·log curve + R18.16 type band-hysteresis ±${TYPE_BAND_HYSTERESIS} + R19.16 describeTypeBand projector)`)

// --- R19.16: describeTypeBand projector for TYPE row tooltip --------

import { ATTRACTOR_TYPES as TYPES_R1916 } from './namedAttractors.js'

// Basic band selection: each quarter maps to its type.
{
  // With 4 default types: bands at [0, 0.25), [0.25, 0.5), [0.5, 0.75), [0.75, 1].
  const b0 = describeTypeBand(0.10, TYPES_R1916)
  eq(b0.index, 0, '0.10 → band 0')
  eq(b0.label, TYPES_R1916[0], 'band 0 label = first type')
  eq(b0.total, 4, 'total = types.length')

  const b1 = describeTypeBand(0.30, TYPES_R1916)
  eq(b1.index, 1, '0.30 → band 1')
  eq(b1.label, TYPES_R1916[1], 'band 1 label = second type')

  const b2 = describeTypeBand(0.60, TYPES_R1916)
  eq(b2.index, 2, '0.60 → band 2')
  eq(b2.label, TYPES_R1916[2], 'band 2 label = third type')

  const b3 = describeTypeBand(0.95, TYPES_R1916)
  eq(b3.index, 3, '0.95 → band 3')
  eq(b3.label, TYPES_R1916[3], 'band 3 label = fourth type')
}

// Endpoint behaviour: v=0 → first band, v=1 → last band.
{
  const at0 = describeTypeBand(0, TYPES_R1916)
  eq(at0.index, 0, 'v=0 → band 0')
  const at1 = describeTypeBand(1, TYPES_R1916)
  eq(at1.index, 3, 'v=1 → last band (closed interval)')
}

// Out-of-range v01 clamps before computing the band.
{
  const neg = describeTypeBand(-5, TYPES_R1916)
  eq(neg.index, 0, 'negative v clamps to band 0')
  const huge = describeTypeBand(99, TYPES_R1916)
  eq(huge.index, 3, 'huge v clamps to last band')
}

// Dead-band detection: inside the symmetric hysteresis window around a
// boundary, holdingPrev=true. Outside, false.
{
  // Boundary at 0.25 (between band 0 and band 1). With h=0.015 the
  // dead-band is [0.235, 0.265].
  const inLower = describeTypeBand(0.240, TYPES_R1916)  // 0.010 inside band 0
  ok(inLower.holdingPrev, '0.240 inside dead-band on band 0 side → holdingPrev=true')
  const inUpper = describeTypeBand(0.260, TYPES_R1916)  // 0.010 inside band 1
  ok(inUpper.holdingPrev, '0.260 inside dead-band on band 1 side → holdingPrev=true')
  const outsideLow = describeTypeBand(0.220, TYPES_R1916)
  ok(!outsideLow.holdingPrev, '0.220 outside dead-band → holdingPrev=false')
  const outsideHigh = describeTypeBand(0.280, TYPES_R1916)
  ok(!outsideHigh.holdingPrev, '0.280 outside dead-band → holdingPrev=false')
}

// holdingPrev only fires near a REAL boundary — extremes (v=0, v=1) have
// no neighbouring boundary on the missing side.
{
  const atFloor = describeTypeBand(0, TYPES_R1916)
  ok(!atFloor.holdingPrev, 'v=0 has no leftward neighbour → never holdingPrev')
  const atCeil = describeTypeBand(1, TYPES_R1916)
  ok(!atCeil.holdingPrev, 'v=1 has no rightward neighbour → never holdingPrev')
}

// distanceToEdge01: min of (dist to lower boundary, dist to upper boundary).
{
  // Mid-band — far from any boundary.
  const mid = describeTypeBand(0.125, TYPES_R1916)  // dead center of band 0
  near(mid.distanceToEdge01, 0.125, 'mid-band: distance to nearest boundary (0.25) = 0.125', 1e-9)
  // Near a boundary — distance is the smaller of left/right gap.
  const near1 = describeTypeBand(0.27, TYPES_R1916)  // 0.02 above band 0/1 boundary
  near(near1.distanceToEdge01, 0.02, 'near upper of band 1: distance ≈ 0.02', 1e-9)
}

// Defensive: bad inputs return null.
eq(describeTypeBand(NaN, TYPES_R1916), null, 'NaN v01 → null')
eq(describeTypeBand(0.5, []), null, 'empty types → null')
eq(describeTypeBand(0.5, [42, null, '']), null, 'all-invalid types → null')
eq(describeTypeBand(0.5, 'not-an-array'), null, 'non-array types → null')
eq(describeTypeBand(undefined, TYPES_R1916), null, 'undefined v01 → null')
eq(describeTypeBand(Infinity, TYPES_R1916), null, 'Infinity v01 → null')

// Single-type roster: every value lands in the only band, holdingPrev=false.
{
  const r = describeTypeBand(0.5, ['only'])
  eq(r.index, 0, 'single-type roster: band 0')
  eq(r.label, 'only', 'single-type label')
  eq(r.total, 1, 'single-type total=1')
  ok(!r.holdingPrev, 'single-type: no boundaries → no holdingPrev')
}

// Custom hysteresis arg flows through.
{
  // With h=0 the dead-band collapses; 0.245 lands in band 0 with no hold.
  const noHyst = describeTypeBand(0.245, TYPES_R1916, 0)
  ok(!noHyst.holdingPrev, 'h=0 collapses dead-band')
  // With a huge hysteresis (clamped to 0.5/N=0.125 for 4 types) the dead-
  // band is much wider — 0.140 from boundary 0.25 → 0.110 distance.
  const wide = describeTypeBand(0.140, TYPES_R1916, 0.5)
  ok(wide.holdingPrev, 'wide-hysteresis (clamped) catches 0.140')
}

// describeTypeBand never returns a stale label even when input changes.
// (Spot-check that index→label[index] always agrees.)
for (let v = 0; v <= 1; v += 0.05) {
  const r = describeTypeBand(v, TYPES_R1916)
  eq(r.label, TYPES_R1916[r.index], `at v=${v.toFixed(2)}: label = types[index]`)
}

// --- R20.16: proximityToBoundary01 (safety meter for the TYPE row) ----
// Endpoint anchors — dead-centre of any band reads 1.0 (max safe),
// AT a boundary reads ~0.0 (max danger).
{
  // Band width with 4 types = 0.25. Dead centre of band 0 = 0.125.
  // Distance to nearest boundary (0.25) = 0.125. With h=0.015 (default),
  // safe range = 0.125 - 0.015 = 0.110. Safe dist at centre = 0.125 -
  // 0.015 = 0.110. Proximity = 0.110 / 0.110 = 1.0.
  const centre = describeTypeBand(0.125, TYPES_R1916)
  near(centre.proximityToBoundary01, 1.0, 'dead centre of band 0 → proximity 1.0', 1e-9)

  const centre2 = describeTypeBand(0.375, TYPES_R1916)  // mid of band 1
  near(centre2.proximityToBoundary01, 1.0, 'dead centre of band 1 → proximity 1.0', 1e-9)
}

// AT the boundary (just inside the dead-band) reads 0.0.
{
  const onBoundary = describeTypeBand(0.250, TYPES_R1916)  // exact band 0/1 boundary
  near(onBoundary.proximityToBoundary01, 0.0, 'on boundary → proximity 0.0', 1e-9)

  // Just inside the dead-band — still 0.
  const inDeadband = describeTypeBand(0.245, TYPES_R1916)  // 0.005 below boundary, hyst=0.015
  near(inDeadband.proximityToBoundary01, 0.0, 'inside dead-band → proximity 0.0', 1e-9)
}

// Smooth ramp — proximity scales linearly across the safe range.
{
  // Half-way through the safe zone: 0.125 + (0.110 - 0.015) / 2 (no
  // — let's pick a value that's halfway BETWEEN dead-band edge and
  // mid-band). Dead-band edge near 0.25 boundary = 0.235 (0.25 - 0.015).
  // Mid-band = 0.125. Halfway = 0.180. Distance to nearest = 0.07.
  // Safe dist = 0.07 - 0.015 = 0.055. Proximity = 0.055 / 0.110 = 0.5.
  const halfway = describeTypeBand(0.180, TYPES_R1916)
  near(halfway.proximityToBoundary01, 0.5, 'halfway through safe zone → proximity 0.5', 1e-9)
}

// Monotonicity invariant: sweep through band 1 (boundary 0.25 to
// boundary 0.50) — proximity should rise from 0 (at left boundary) to
// 1 (mid-band 0.375) and fall back to 0 (at right boundary). No
// surprises mid-sweep.
{
  let prev = -1
  let peakIdx = -1
  let peakVal = -1
  const samples = []
  for (let v = 0.250; v <= 0.500; v += 0.005) {
    const r = describeTypeBand(v, TYPES_R1916)
    samples.push({ v, p: r.proximityToBoundary01 })
    if (r.proximityToBoundary01 > peakVal) {
      peakVal = r.proximityToBoundary01
      peakIdx = samples.length - 1
    }
  }
  // Rising half — every step >= prev.
  for (let i = 1; i <= peakIdx; i++) {
    ok(samples[i].p >= prev - 1e-9, `band 1 rising at v=${samples[i].v.toFixed(3)}: p=${samples[i].p} >= prev=${prev}`)
    prev = samples[i].p
  }
  // Falling half — every step <= prev.
  prev = samples[peakIdx].p
  for (let i = peakIdx + 1; i < samples.length; i++) {
    ok(samples[i].p <= prev + 1e-9, `band 1 falling at v=${samples[i].v.toFixed(3)}: p=${samples[i].p} <= prev=${prev}`)
    prev = samples[i].p
  }
  // Peak >= 0.99 (allow for float drift at the discrete grid).
  ok(peakVal >= 0.99, `peak proximity in mid-band 1 ≥ 0.99 (got ${peakVal.toFixed(3)})`)
}

// Edge bands (first/last) only have ONE boundary — proximity at the
// extreme end of the range should still be ≥ a normal interior value.
{
  const atZero = describeTypeBand(0, TYPES_R1916)
  const atOne  = describeTypeBand(1, TYPES_R1916)
  // At v=0, distance to right boundary 0.25 = 0.25; safe dist = 0.235;
  // safe range = 0.110; proximity clamps to 1.
  near(atZero.proximityToBoundary01, 1.0, 'v=0 (leftmost) → proximity clamps to 1', 1e-9)
  near(atOne.proximityToBoundary01,  1.0, 'v=1 (rightmost) → proximity clamps to 1', 1e-9)
}

// Single-type roster has NO boundaries — proximity should always be 1.
{
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    const r = describeTypeBand(v, ['only'])
    near(r.proximityToBoundary01, 1.0, `single-type at v=${v}: proximity = 1`, 1e-9)
  }
}

// Range invariant — proximityToBoundary01 ∈ [0, 1] for any v01.
for (let v = 0; v <= 1; v += 0.01) {
  const r = describeTypeBand(v, TYPES_R1916)
  ok(r.proximityToBoundary01 >= 0 && r.proximityToBoundary01 <= 1,
    `proximity in [0,1] at v=${v.toFixed(2)}: got ${r.proximityToBoundary01}`)
}

// Custom hysteresis arg flows through proximity calc.
{
  // With h=0 the dead-band collapses — every value (except the exact
  // boundary) reads a proportional safe distance.
  const r = describeTypeBand(0.245, TYPES_R1916, 0)
  ok(r.proximityToBoundary01 > 0, 'h=0: value off-boundary reads non-zero proximity')
}

// --- R21.22: clamp-proximity projector for continuous fields ---------

// clampProximity01 — endpoint behaviour: 0 at edges, 1 at centre.
near(clampProximity01(0),    0,   'v=0 → proximity 0 (at low clamp)', 1e-9)
near(clampProximity01(1),    0,   'v=1 → proximity 0 (at high clamp)', 1e-9)
near(clampProximity01(0.5),  1.0, 'v=0.5 → proximity 1.0 (centred)', 1e-9)

// Symmetric — proximity at v and 1-v match (mirror around 0.5).
{
  for (const v of [0.1, 0.2, 0.3, 0.4]) {
    near(clampProximity01(v), clampProximity01(1 - v),
      `symmetric: proximity(${v}) === proximity(${1-v})`, 1e-9)
  }
}

// Quarter-points produce the expected 50% safe reading.
near(clampProximity01(0.25), 0.5, 'v=0.25 → proximity 0.5 (halfway from low clamp)', 1e-9)
near(clampProximity01(0.75), 0.5, 'v=0.75 → proximity 0.5 (halfway from high clamp)', 1e-9)

// Out-of-range input clamps before projection.
near(clampProximity01(-1),    0, 'v=-1 (below range) clamps to 0', 1e-9)
near(clampProximity01(100),   0, 'v=100 (above range) clamps to 0', 1e-9)
near(clampProximity01(-0.5),  0, 'v=-0.5 clamps to 0', 1e-9)
near(clampProximity01(1.5),   0, 'v=1.5 clamps to 0', 1e-9)

// Defensive contract — non-finite resolves to 1 (max-safe; first-paint
// before any CC seen reads as green, not red).
near(clampProximity01(NaN),       1, 'NaN → 1 (max-safe fallback)', 1e-9)
near(clampProximity01(Infinity),  1, '+Infinity → 1 (max-safe fallback)', 1e-9)
near(clampProximity01(-Infinity), 1, '-Infinity → 1 (max-safe fallback)', 1e-9)

// Range invariant — proximity ∈ [0, 1] for any v01.
for (let v = -0.5; v <= 1.5; v += 0.05) {
  const p = clampProximity01(v)
  ok(p >= 0 && p <= 1, `proximity in [0,1] at v=${v.toFixed(2)}: got ${p}`)
}

// Monotonicity — proximity ASCENDS from v=0 → v=0.5, DESCENDS from
// v=0.5 → v=1. (Symmetric inverted-V shape.)
{
  let prev = -Infinity
  for (let v = 0; v <= 0.5; v += 0.05) {
    const p = clampProximity01(v)
    ok(p >= prev - 1e-9, `ascending at v=${v.toFixed(2)}: ${p} >= ${prev}`)
    prev = p
  }
  prev = +Infinity
  for (let v = 0.5; v <= 1; v += 0.05) {
    const p = clampProximity01(v)
    ok(p <= prev + 1e-9, `descending at v=${v.toFixed(2)}: ${p} <= ${prev}`)
    prev = p
  }
}

// describeClampProximity — structured shape, matches describeTypeBand's
// null-on-bad-input contract.
{
  const r = describeClampProximity(0.5)
  ok(r && typeof r === 'object', 'returns an object on valid input')
  eq(r.kind, 'clamp', 'kind = clamp (distinguishes from R20.16 band)')
  near(r.v01, 0.5, 'v01 preserved on valid input', 1e-9)
  near(r.proximityToBoundary01, 1.0, 'centred → proximity 1.0', 1e-9)
  eq(r.atLow,  false, 'atLow false at centre')
  eq(r.atHigh, false, 'atHigh false at centre')
}

// atLow flag fires only at the low end (v <= 0.001).
{
  eq(describeClampProximity(0).atLow,       true,  'v=0 → atLow true')
  eq(describeClampProximity(0.001).atLow,   true,  'v=0.001 → atLow true (boundary)')
  eq(describeClampProximity(0.002).atLow,   false, 'v=0.002 → atLow false (just off)')
  eq(describeClampProximity(0.05).atLow,    false, 'v=0.05 → atLow false')
  eq(describeClampProximity(0.5).atLow,     false, 'v=0.5 → atLow false')
  eq(describeClampProximity(1).atLow,       false, 'v=1 → atLow false (the OTHER rail)')
}

// atHigh flag fires only at the high end (v >= 0.999).
{
  eq(describeClampProximity(1).atHigh,       true,  'v=1 → atHigh true')
  eq(describeClampProximity(0.999).atHigh,   true,  'v=0.999 → atHigh true (boundary)')
  eq(describeClampProximity(0.998).atHigh,   false, 'v=0.998 → atHigh false (just off)')
  eq(describeClampProximity(0.5).atHigh,     false, 'v=0.5 → atHigh false')
  eq(describeClampProximity(0).atHigh,       false, 'v=0 → atHigh false (the OTHER rail)')
}

// Out-of-range input is clamped IN the returned v01 (matches the
// generator-side clamp so .v01 is always a safe number to display).
{
  const lo = describeClampProximity(-5)
  near(lo.v01, 0, 'v=-5 clamps to v01=0 in returned object', 1e-9)
  eq(lo.atLow, true, 'v=-5 → atLow true after clamp')

  const hi = describeClampProximity(99)
  near(hi.v01, 1, 'v=99 clamps to v01=1 in returned object', 1e-9)
  eq(hi.atHigh, true, 'v=99 → atHigh true after clamp')
}

// Defensive — non-finite returns null (null-on-bad-input contract).
eq(describeClampProximity(NaN),       null, 'NaN → null')
eq(describeClampProximity(Infinity),  null, '+Infinity → null')
eq(describeClampProximity(-Infinity), null, '-Infinity → null')
eq(describeClampProximity(undefined), null, 'undefined → null')
eq(describeClampProximity(null),      null, 'null → null')
eq(describeClampProximity('half'),    null, 'string → null')

// proximityToBoundary01 inside the structured result matches the pure helper.
{
  for (const v of [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1]) {
    const r = describeClampProximity(v)
    near(r.proximityToBoundary01, clampProximity01(v),
      `describe.proximityToBoundary01 === clampProximity01 at v=${v}`, 1e-9)
  }
}

// Pure — deterministic across calls.
{
  const a = describeClampProximity(0.31)
  const b = describeClampProximity(0.31)
  eq(a.v01, b.v01, 'pure: same v01 across calls')
  eq(a.proximityToBoundary01, b.proximityToBoundary01,
    'pure: same proximityToBoundary01 across calls')
}

// --- R22.27: classifyClampProximity + tunable warn threshold ----------

// Tier semantics — atRail trumps every threshold.
{
  // atRail=true → danger regardless of prox / threshold.
  eq(classifyClampProximity(0.99, true), 'danger',
    'atRail true → danger even with high prox')
  eq(classifyClampProximity(0.50, true), 'danger',
    'atRail true → danger at half prox')
  eq(classifyClampProximity(0.01, true), 'danger',
    'atRail true → danger at low prox')
  eq(classifyClampProximity(0,    true), 'danger',
    'atRail true → danger at zero prox')
  // Custom warn threshold doesn't unstick danger.
  eq(classifyClampProximity(0.99, true, 0.05),  'danger', 'atRail trumps low threshold')
  eq(classifyClampProximity(0.10, true, 0.45),  'danger', 'atRail trumps high threshold')
}

// Default threshold (0.25) — preserves R21.22 baseline.
{
  // Just below default → warn.
  eq(classifyClampProximity(0.10, false), 'warn',
    'prox 0.10 < 0.25 default → warn')
  eq(classifyClampProximity(0.24, false), 'warn',
    'prox 0.24 < 0.25 default → warn (just below)')
  // At default → safe (boundary is exclusive on the low side).
  eq(classifyClampProximity(0.25, false), 'safe',
    'prox 0.25 == 0.25 default → safe (boundary inclusive on safe side)')
  // Just above default → safe.
  eq(classifyClampProximity(0.30, false), 'safe',
    'prox 0.30 > 0.25 default → safe')
  eq(classifyClampProximity(0.99, false), 'safe',
    'prox 0.99 (centred) → safe')
}

// Lowering the threshold makes the warn zone SMALLER (fewer values warn).
{
  // prox 0.10 with threshold 0.05 → safe (no longer warns)
  eq(classifyClampProximity(0.10, false, 0.05), 'safe',
    'low threshold (0.05) makes prox 0.10 safe')
  // prox 0.10 with threshold 0.45 → warn (more values flagged)
  eq(classifyClampProximity(0.10, false, 0.45), 'warn',
    'high threshold (0.45) makes prox 0.10 warn')
  // prox 0.40 with threshold 0.45 → warn (close to clamp under high threshold)
  eq(classifyClampProximity(0.40, false, 0.45), 'warn',
    'high threshold (0.45) makes prox 0.40 warn (sensitivity up)')
  eq(classifyClampProximity(0.46, false, 0.45), 'safe',
    'high threshold (0.45) makes prox 0.46 safe (above threshold)')
}

// Defensive — non-finite prox → safe (max-safe first-paint default).
{
  eq(classifyClampProximity(NaN,       false), 'safe', 'NaN prox → safe')
  eq(classifyClampProximity(Infinity,  false), 'safe', '+Infinity prox → safe')
  eq(classifyClampProximity(-Infinity, false), 'safe', '-Infinity prox → safe')
  eq(classifyClampProximity(undefined, false), 'safe', 'undefined prox → safe')
  eq(classifyClampProximity(null,      false), 'safe', 'null prox → safe')
  eq(classifyClampProximity('half',    false), 'safe', 'string prox → safe')
  // Non-finite + atRail → still danger (rail check runs first).
  eq(classifyClampProximity(NaN, true), 'danger', 'NaN + atRail → danger')
}

// Custom threshold defensively clamped through sanitize.
{
  // Threshold below min → effectively MIN.
  eq(classifyClampProximity(0.04, false, -1), 'warn',
    'negative threshold → MIN; prox 0.04 < 0.05 → warn')
  eq(classifyClampProximity(0.06, false, -1), 'safe',
    'negative threshold → MIN; prox 0.06 > 0.05 → safe')
  // Threshold above max → effectively MAX.
  eq(classifyClampProximity(0.44, false, 100), 'warn',
    'above-max threshold → MAX; prox 0.44 < 0.45 → warn')
  eq(classifyClampProximity(0.50, false, 100), 'safe',
    'above-max threshold → MAX; prox 0.50 > 0.45 → safe')
  // Non-finite threshold → DEFAULT.
  eq(classifyClampProximity(0.20, false, NaN), 'warn',
    'NaN threshold → DEFAULT 0.25; prox 0.20 < 0.25 → warn')
  eq(classifyClampProximity(0.30, false, NaN), 'safe',
    'NaN threshold → DEFAULT 0.25; prox 0.30 > 0.25 → safe')
}

// Threshold-only edge: atRail=undefined (legacy callers) treated as falsy.
{
  eq(classifyClampProximity(0.50, undefined), 'safe',
    'undefined atRail (falsy) → safe path')
  eq(classifyClampProximity(0.10, undefined), 'warn',
    'undefined atRail (falsy) → warn path at low prox')
  eq(classifyClampProximity(0.50, null), 'safe',
    'null atRail → safe path')
  eq(classifyClampProximity(0.50, 0), 'safe',
    '0 atRail (falsy) → safe path')
  // Truthy but not boolean true — only EXACT === true counts as atRail.
  eq(classifyClampProximity(0.99, 1), 'safe',
    '1 (truthy non-true) atRail → safe path (strict === check)')
}

// sanitizeClampWarnThreshold contract.
{
  // Happy values pass through.
  eq(sanitizeClampWarnThreshold(0.05), 0.05, 'MIN passes through')
  eq(sanitizeClampWarnThreshold(0.10), 0.10, 'mid-low passes through')
  eq(sanitizeClampWarnThreshold(0.25), 0.25, 'DEFAULT passes through')
  eq(sanitizeClampWarnThreshold(0.30), 0.30, 'mid-high passes through')
  eq(sanitizeClampWarnThreshold(0.45), 0.45, 'MAX passes through')
  // Out-of-range clamps to bounds.
  eq(sanitizeClampWarnThreshold(0),     CLAMP_WARN_THRESHOLD_MIN, 'below MIN → MIN')
  eq(sanitizeClampWarnThreshold(0.01),  CLAMP_WARN_THRESHOLD_MIN, 'just below MIN → MIN')
  eq(sanitizeClampWarnThreshold(-1),    CLAMP_WARN_THRESHOLD_MIN, 'negative → MIN')
  eq(sanitizeClampWarnThreshold(0.50),  CLAMP_WARN_THRESHOLD_MAX, 'above MAX → MAX')
  eq(sanitizeClampWarnThreshold(0.99),  CLAMP_WARN_THRESHOLD_MAX, 'way above MAX → MAX')
  eq(sanitizeClampWarnThreshold(100),   CLAMP_WARN_THRESHOLD_MAX, '100 → MAX')
  // Non-finite → DEFAULT.
  eq(sanitizeClampWarnThreshold(NaN),       CLAMP_WARN_THRESHOLD_DEFAULT, 'NaN → DEFAULT')
  eq(sanitizeClampWarnThreshold(Infinity),  CLAMP_WARN_THRESHOLD_DEFAULT, '+Infinity → DEFAULT')
  eq(sanitizeClampWarnThreshold(-Infinity), CLAMP_WARN_THRESHOLD_DEFAULT, '-Infinity → DEFAULT')
  eq(sanitizeClampWarnThreshold(undefined), CLAMP_WARN_THRESHOLD_DEFAULT, 'undefined → DEFAULT')
  eq(sanitizeClampWarnThreshold(null),      CLAMP_WARN_THRESHOLD_DEFAULT, 'null → DEFAULT')
  eq(sanitizeClampWarnThreshold('0.3'),     CLAMP_WARN_THRESHOLD_DEFAULT, 'string → DEFAULT')
}

// Constants invariants.
{
  ok(CLAMP_WARN_THRESHOLD_MIN < CLAMP_WARN_THRESHOLD_DEFAULT, 'MIN < DEFAULT invariant')
  ok(CLAMP_WARN_THRESHOLD_DEFAULT < CLAMP_WARN_THRESHOLD_MAX, 'DEFAULT < MAX invariant')
  ok(CLAMP_WARN_THRESHOLD_MAX < 0.5, 'MAX < 0.5 invariant (green tier must cover middle half of slider)')
  ok(CLAMP_WARN_THRESHOLD_MIN > 0, 'MIN > 0 invariant (warn tier must cover SOMETHING)')
  eq(CLAMP_WARN_THRESHOLD_DEFAULT, 0.25, 'DEFAULT preserves R21.22 baseline')
}

// isClampWarnThresholdAtDefault contract.
{
  ok(isClampWarnThresholdAtDefault(0.25)        === true,  'default → true')
  ok(isClampWarnThresholdAtDefault(0.30)        === false, 'above default → false')
  ok(isClampWarnThresholdAtDefault(0.10)        === false, 'below default → false')
  // Sanitize-collapsed values: non-finite resolves to DEFAULT under
  // the hood, so isAtDefault returns true.
  ok(isClampWarnThresholdAtDefault(NaN)         === true,  'NaN → true (sanitizes to default)')
  ok(isClampWarnThresholdAtDefault(undefined)   === true,  'undefined → true')
  ok(isClampWarnThresholdAtDefault(null)        === true,  'null → true')
}

// Integration with describeClampProximity (R21.22 projector) — the
// classifier reads atLow|atHigh and proximityToBoundary01 from the
// structured object so the UI pipeline stays composable.
{
  // Knob at rail (v=0.0001) → describeClampProximity reports atLow,
  // classifier reports 'danger'.
  const lo = describeClampProximity(0.0001)
  eq(classifyClampProximity(lo.proximityToBoundary01, lo.atLow || lo.atHigh), 'danger',
    'integration: knob at low rail → danger')
  // Knob at high rail (v=0.9999) → atHigh, danger.
  const hi = describeClampProximity(0.9999)
  eq(classifyClampProximity(hi.proximityToBoundary01, hi.atLow || hi.atHigh), 'danger',
    'integration: knob at high rail → danger')
  // Knob at v=0.10 → prox=0.20 (close), not atRail → warn.
  const close = describeClampProximity(0.10)
  eq(classifyClampProximity(close.proximityToBoundary01, close.atLow || close.atHigh), 'warn',
    'integration: knob at v=0.10 → warn under default threshold')
  // Knob at v=0.50 → prox=1.0 (max), not atRail → safe.
  const mid = describeClampProximity(0.50)
  eq(classifyClampProximity(mid.proximityToBoundary01, mid.atLow || mid.atHigh), 'safe',
    'integration: knob at v=0.50 → safe (max headroom)')
  // Same knob v=0.10 but with LOW threshold → safe (warn zone shrank).
  eq(classifyClampProximity(close.proximityToBoundary01, close.atLow || close.atHigh, 0.15), 'safe',
    'integration: low threshold (0.15) makes v=0.10 (prox=0.20) safe')
}

console.log('PASS: classifyClampProximity + sanitizeClampWarnThreshold + isClampWarnThresholdAtDefault (R22.27, ~60 asserts)')

// --- R23.32: per-field clamp warn threshold overrides -----------------

// Field roster — six continuous knob fields (enabled + type excluded
// since they don't use the clamp meter).
eq(CLAMP_THRESHOLD_FIELDS.length, 6, 'CLAMP_THRESHOLD_FIELDS covers 6 continuous knob fields')
for (const expected of ['strength', 'radius', 'radiusLog', 'x', 'y', 'z']) {
  ok(CLAMP_THRESHOLD_FIELDS.includes(expected), `field roster includes ${expected}`)
}
ok(!CLAMP_THRESHOLD_FIELDS.includes('enabled'), 'enabled excluded — binary toggle')
ok(!CLAMP_THRESHOLD_FIELDS.includes('type'),    'type excluded — categorical band')

// --- sanitizeClampWarnOverrides ---

// Empty/nullish inputs → empty map.
deepEq(sanitizeClampWarnOverrides({}),         {}, 'empty obj → empty')
deepEq(sanitizeClampWarnOverrides(null),       {}, 'null → empty')
deepEq(sanitizeClampWarnOverrides(undefined),  {}, 'undefined → empty')
deepEq(sanitizeClampWarnOverrides('not-obj'),  {}, 'string → empty')
deepEq(sanitizeClampWarnOverrides(42),         {}, 'number → empty')
deepEq(sanitizeClampWarnOverrides([]),         {}, 'array → empty')

// Known field passes through sanitized.
deepEq(sanitizeClampWarnOverrides({ strength: 0.40 }), { strength: 0.40 },
  'known field passes through')

// Each known field is independently kept.
{
  const o = sanitizeClampWarnOverrides({ strength: 0.10, radius: 0.40, x: 0.25 })
  eq(o.strength, 0.10, 'strength kept')
  eq(o.radius,   0.40, 'radius kept')
  eq(o.x,        0.25, 'x kept')
}

// Unknown fields silently dropped.
{
  const o = sanitizeClampWarnOverrides({ strength: 0.10, bogusField: 0.20 })
  ok('strength' in o,      'strength kept')
  ok(!('bogusField' in o), 'unknown field dropped')
}

// Per-field values clamped into [MIN, MAX].
{
  const o = sanitizeClampWarnOverrides({ strength: -1, radius: 1, x: 100 })
  eq(o.strength, CLAMP_WARN_THRESHOLD_MIN, 'below MIN clamped to MIN')
  eq(o.radius,   CLAMP_WARN_THRESHOLD_MAX, 'above MAX clamped to MAX')
  eq(o.x,        CLAMP_WARN_THRESHOLD_MAX, 'way above MAX clamped to MAX')
}

// Non-finite per-field values dropped (not coerced).
{
  const o = sanitizeClampWarnOverrides({ strength: NaN, radius: 'half', y: null })
  ok(!('strength' in o), 'NaN field dropped')
  ok(!('radius' in o),   'string field dropped')
  ok(!('y' in o),        'null field dropped')
}

// --- resolveClampWarnThreshold ---

// Per-field override wins when present.
eq(resolveClampWarnThreshold('strength', 0.30, { strength: 0.10 }), 0.10,
  'per-field override wins over global')

// Fallback to global when per-field missing.
eq(resolveClampWarnThreshold('strength', 0.30, { radius: 0.10 }), 0.30,
  'missing per-field → global')

// Fallback to global when overrides object is empty.
eq(resolveClampWarnThreshold('strength', 0.30, {}), 0.30,
  'empty overrides → global')

// Fallback to global when overrides is missing entirely.
eq(resolveClampWarnThreshold('strength', 0.30, null), 0.30,
  'null overrides → global')
eq(resolveClampWarnThreshold('strength', 0.30, undefined), 0.30,
  'undefined overrides → global')

// Fallback to DEFAULT when neither per-field nor global is finite.
eq(resolveClampWarnThreshold('strength', NaN, {}),           CLAMP_WARN_THRESHOLD_DEFAULT,
  'NaN global + no override → DEFAULT')
eq(resolveClampWarnThreshold('strength', undefined, null),   CLAMP_WARN_THRESHOLD_DEFAULT,
  'undefined global + null overrides → DEFAULT')

// Per-field NaN — falls through to global (lookup-time defense).
eq(resolveClampWarnThreshold('strength', 0.30, { strength: NaN }), 0.30,
  'NaN per-field → fall through to global')

// Per-field value re-sanitized at lookup (handles in-place edits
// outside the setter).
eq(resolveClampWarnThreshold('strength', 0.30, { strength: -1 }), CLAMP_WARN_THRESHOLD_MIN,
  'per-field value clamped to MIN at lookup')
eq(resolveClampWarnThreshold('strength', 0.30, { strength: 100 }), CLAMP_WARN_THRESHOLD_MAX,
  'per-field value clamped to MAX at lookup')

// Unknown field name on the read path — if it's in the override map
// it WILL be returned (the read path doesn't whitelist; only the
// setter enforces field validity, so a sanitized map only ever
// contains known fields. A hand-edited file could land an unknown
// field; the resolver honours it. Caller can re-sanitize first if
// they want strict whitelist semantics).
eq(resolveClampWarnThreshold('bogusField', 0.30, { bogusField: 0.10 }), 0.10,
  'unknown field with override → returns override (no whitelist on read)')
eq(resolveClampWarnThreshold('bogusField', 0.30, {}), 0.30,
  'unknown field WITHOUT override → falls through to global')

// Non-string field → falls through.
eq(resolveClampWarnThreshold(null, 0.30, {}), 0.30,                'null field → global')
eq(resolveClampWarnThreshold(undefined, 0.30, {}), 0.30,           'undefined field → global')
eq(resolveClampWarnThreshold(42, 0.30, {}), 0.30,                  'number field → global')

// Non-object overrides → falls through.
eq(resolveClampWarnThreshold('strength', 0.30, []), 0.30,          'array overrides → global')
eq(resolveClampWarnThreshold('strength', 0.30, 'not-obj'), 0.30,   'string overrides → global')

// --- setClampWarnFieldOverride ---

// Happy path — set a per-field override.
{
  const overrides = {}
  const next = setClampWarnFieldOverride(overrides, 'strength', 0.10)
  eq(next.strength, 0.10, 'strength set to 0.10')
  ok(next !== overrides,  'returns new ref on actual write')
}

// Ref-equal on no-op (same value re-set).
{
  const overrides = { strength: 0.10 }
  const next = setClampWarnFieldOverride(overrides, 'strength', 0.10)
  ok(next === overrides, 'same-value set → input ref (no-op)')
}

// Value sanitized into [MIN, MAX].
{
  const o = setClampWarnFieldOverride({}, 'strength', -1)
  eq(o.strength, CLAMP_WARN_THRESHOLD_MIN, 'below MIN clamped to MIN')
}
{
  const o = setClampWarnFieldOverride({}, 'strength', 100)
  eq(o.strength, CLAMP_WARN_THRESHOLD_MAX, 'above MAX clamped to MAX')
}

// Clear path — null/undefined removes the field.
{
  const overrides = { strength: 0.10, radius: 0.40 }
  const next = setClampWarnFieldOverride(overrides, 'strength', null)
  ok(!('strength' in next), 'null → strength removed')
  eq(next.radius, 0.40,     'other fields preserved')
  ok(next !== overrides,    'returns new ref on actual clear')
}
{
  const overrides = { strength: 0.10 }
  const next = setClampWarnFieldOverride(overrides, 'strength', undefined)
  ok(!('strength' in next), 'undefined → strength removed')
}

// Clear-already-absent → ref-equal no-op.
{
  const overrides = { radius: 0.40 }
  const next = setClampWarnFieldOverride(overrides, 'strength', null)
  ok(next === overrides, 'clear-when-absent → input ref (no-op)')
}

// Invalid field name → input ref unchanged.
{
  const overrides = { strength: 0.10 }
  const next = setClampWarnFieldOverride(overrides, 'bogusField', 0.30)
  ok(next === overrides, 'invalid field → input ref unchanged')
}
{
  const overrides = { strength: 0.10 }
  ok(setClampWarnFieldOverride(overrides, null, 0.30)      === overrides, 'null field → input ref')
  ok(setClampWarnFieldOverride(overrides, undefined, 0.30) === overrides, 'undefined field → input ref')
  ok(setClampWarnFieldOverride(overrides, 42, 0.30)        === overrides, 'number field → input ref')
}

// Non-finite value → input ref unchanged (defensive).
{
  const overrides = { strength: 0.10 }
  ok(setClampWarnFieldOverride(overrides, 'strength', NaN)       === overrides, 'NaN value → input ref')
  ok(setClampWarnFieldOverride(overrides, 'strength', Infinity)  === overrides, '+Infinity value → input ref')
  ok(setClampWarnFieldOverride(overrides, 'strength', 'half')    === overrides, 'string value → input ref')
}

// Non-object overrides → setter starts from empty.
{
  const next = setClampWarnFieldOverride(null, 'strength', 0.10)
  eq(next.strength, 0.10, 'null overrides → starts from empty + sets')
  // For the no-op contract on invalid input: a write WITH valid value
  // produces a NEW object (not the input ref) because base was nullish.
  ok(next !== null, 'non-object overrides + write → returns new map')
}

// Set multiple fields independently.
{
  let overrides = {}
  overrides = setClampWarnFieldOverride(overrides, 'strength', 0.10)
  overrides = setClampWarnFieldOverride(overrides, 'radius', 0.40)
  overrides = setClampWarnFieldOverride(overrides, 'x', 0.25)
  eq(overrides.strength, 0.10, 'strength preserved across writes')
  eq(overrides.radius,   0.40, 'radius preserved across writes')
  eq(overrides.x,        0.25, 'x preserved across writes')
  eq(Object.keys(overrides).length, 3, 'three independent fields written')
}

// --- clearAllClampWarnOverrides ---

// Empty → ref-equal no-op.
{
  const overrides = {}
  ok(clearAllClampWarnOverrides(overrides) === overrides, 'empty → input ref (no-op)')
}

// Populated → empty map.
{
  const overrides = { strength: 0.10, radius: 0.40 }
  const next = clearAllClampWarnOverrides(overrides)
  deepEq(next, {},   'cleared map is empty')
  ok(next !== overrides, 'returns new ref on actual clear')
}

// Nullish input → input ref.
ok(clearAllClampWarnOverrides(null) === null,           'null input → input ref')
ok(clearAllClampWarnOverrides(undefined) === undefined, 'undefined input → input ref')

// --- hasClampWarnFieldOverride ---

// Per-field differs from global → true.
ok(hasClampWarnFieldOverride('strength', 0.30, { strength: 0.10 }),
  'per-field 0.10 vs global 0.30 → has override')

// Per-field equals global → false (the override duplicates the global,
// so there's no effective difference to flag in the UI).
eq(hasClampWarnFieldOverride('strength', 0.30, { strength: 0.30 }), false,
  'per-field == global → no effective override')

// Missing per-field → false.
eq(hasClampWarnFieldOverride('strength', 0.30, {}),                 false, 'empty overrides → false')
eq(hasClampWarnFieldOverride('strength', 0.30, { radius: 0.10 }),   false, 'different field set → false')

// Non-finite per-field → false (falls through to global at resolve
// time so the override has no effect → no UI pip).
eq(hasClampWarnFieldOverride('strength', 0.30, { strength: NaN }), false, 'NaN per-field → false')

// Defensive: bad inputs return false.
eq(hasClampWarnFieldOverride('strength', 0.30, null),        false, 'null overrides → false')
eq(hasClampWarnFieldOverride('strength', 0.30, []),          false, 'array overrides → false')
eq(hasClampWarnFieldOverride(null,       0.30, { x: 0.1 }),  false, 'null field → false')

// Sanitization invariance — a per-field value clamped to MIN that
// matches the global-clamped-to-MIN is NOT flagged as overridden.
eq(hasClampWarnFieldOverride('strength', -1, { strength: -2 }), false,
  'both clamp to MIN → not flagged as overridden')

// --- integration: setter + resolver round-trip ---
{
  let overrides = {}
  overrides = setClampWarnFieldOverride(overrides, 'strength', 0.10)
  overrides = setClampWarnFieldOverride(overrides, 'x', 0.40)
  // strength: per-field
  eq(resolveClampWarnThreshold('strength', 0.30, overrides), 0.10,
    'integration: strength resolves to per-field 0.10')
  // x: per-field
  eq(resolveClampWarnThreshold('x', 0.30, overrides), 0.40,
    'integration: x resolves to per-field 0.40')
  // radius: no per-field → falls back to global
  eq(resolveClampWarnThreshold('radius', 0.30, overrides), 0.30,
    'integration: radius resolves to global 0.30')
  // y: no per-field → falls back to global
  eq(resolveClampWarnThreshold('y', 0.30, overrides), 0.30,
    'integration: y resolves to global 0.30')
}

// classifyClampProximity composes with resolveClampWarnThreshold (the
// UI's actual usage pattern).
{
  const overrides = { strength: 0.10, x: 0.40 }
  const stricter = resolveClampWarnThreshold('strength', 0.30, overrides)  // 0.10
  const looser   = resolveClampWarnThreshold('x',        0.30, overrides)  // 0.40
  // v01 = 0.20 (proximity = 0.40 from clamp01 ≈ 1 - |2*0.20 - 1| = 0.40)
  // With STRENGTH's 0.10 threshold: 0.40 >= 0.10 → safe
  eq(classifyClampProximity(0.40, false, stricter), 'safe',
    'composed: strength threshold (0.10) makes prox=0.40 safe')
  // With X's 0.40 threshold: 0.40 >= 0.40 → safe (at boundary)
  eq(classifyClampProximity(0.40, false, looser), 'safe',
    'composed: x threshold (0.40) at-boundary → safe')
  // prox=0.39 just under loose 0.40 → warn
  eq(classifyClampProximity(0.39, false, looser), 'warn',
    'composed: x threshold (0.40) just-under → warn')
}

console.log('PASS: per-field clamp warn threshold overrides (R23.32, ~70 asserts)')

// --- R24.40: per-(attractor, field) clamp warn threshold overrides -----

// sanitizeClampWarnAttractorOverrides — structural defence.
{
  deepEq(sanitizeClampWarnAttractorOverrides({}),         {}, 'empty obj → empty')
  deepEq(sanitizeClampWarnAttractorOverrides(null),       {}, 'null → empty')
  deepEq(sanitizeClampWarnAttractorOverrides(undefined),  {}, 'undefined → empty')
  deepEq(sanitizeClampWarnAttractorOverrides('not-obj'),  {}, 'string → empty')
  deepEq(sanitizeClampWarnAttractorOverrides([]),         {}, 'array → empty')
  deepEq(sanitizeClampWarnAttractorOverrides(42),         {}, 'number → empty')
}

// Happy path — keeps valid attractor entries + sanitises per-field values.
{
  const raw = {
    'attr-1': { strength: 0.10, radius: 0.40 },
    'attr-2': { x: 0.25, y: 0.30 },
  }
  const out = sanitizeClampWarnAttractorOverrides(raw)
  eq(out['attr-1'].strength, 0.10,  'attr-1 strength preserved')
  eq(out['attr-1'].radius,   0.40,  'attr-1 radius preserved')
  eq(out['attr-2'].x,        0.25,  'attr-2 x preserved')
}

// Unknown field keys within an attractor entry → dropped (mirrors R23.32).
{
  const out = sanitizeClampWarnAttractorOverrides({
    'attr-1': { strength: 0.10, bogusField: 0.20 },
  })
  eq(out['attr-1'].strength, 0.10, 'known field kept')
  ok(!('bogusField' in out['attr-1']), 'unknown field dropped')
}

// Out-of-range per-field values clamped (delegates to sanitizeClampWarnThreshold).
{
  const out = sanitizeClampWarnAttractorOverrides({
    'attr-1': { strength: -1, radius: 100, x: NaN },
  })
  eq(out['attr-1'].strength, CLAMP_WARN_THRESHOLD_MIN, 'negative → MIN')
  eq(out['attr-1'].radius,   CLAMP_WARN_THRESHOLD_MAX, '100 → MAX')
  ok(!('x' in out['attr-1']), 'NaN field dropped (non-finite filter)')
}

// Non-string attractor ids → dropped silently.
{
  const out = sanitizeClampWarnAttractorOverrides({
    'attr-1': { strength: 0.10 },
    '':       { strength: 0.20 },   // empty id
  })
  ok('attr-1' in out, 'valid id kept')
  ok(!('' in out),    'empty id dropped')
}

// Empty inner entries (after sanitization) dropped.
{
  const out = sanitizeClampWarnAttractorOverrides({
    'attr-1': { strength: 0.10 },
    'attr-2': {},                         // empty
    'attr-3': { bogus: 0.20 },            // only-unknown-fields
    'attr-4': { strength: NaN },          // only-non-finite
  })
  ok('attr-1' in out, 'non-empty kept')
  ok(!('attr-2' in out), 'empty inner dropped')
  ok(!('attr-3' in out), 'only-unknown-fields dropped')
  ok(!('attr-4' in out), 'only-non-finite dropped')
}

// Non-object inner entry → attractor entry dropped.
{
  const out = sanitizeClampWarnAttractorOverrides({
    'attr-1': 'not-obj',
    'attr-2': null,
    'attr-3': [],
    'attr-4': { strength: 0.10 },
  })
  ok(!('attr-1' in out), 'string inner dropped')
  ok(!('attr-2' in out), 'null inner dropped')
  ok(!('attr-3' in out), 'array inner dropped')
  ok('attr-4' in out,    'valid inner kept')
}

// --- resolveClampWarnThresholdFor — 4-tier resolver ---

// Tier 1: per-(attractor, field) wins over per-field global.
{
  const fieldOverrides    = { strength: 0.20 }
  const attractorOverrides = { 'attr-1': { strength: 0.10 } }
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, fieldOverrides, attractorOverrides),
    0.10, 'tier 1: per-attractor wins over per-field')
}

// Tier 2: per-field wins when attractor has no entry for the field.
{
  const fieldOverrides    = { strength: 0.20 }
  const attractorOverrides = { 'attr-1': { radius: 0.10 } }   // no strength entry
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, fieldOverrides, attractorOverrides),
    0.20, 'tier 2: per-field wins when no attractor cell')
}

// Tier 3: global wins when no per-field + no per-attractor.
{
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, {}, {}),
    0.30, 'tier 3: global wins on empty overrides')
}

// Tier 4: shipped default when no global + no per-field + no per-attractor.
{
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', NaN, {}, {}),
    CLAMP_WARN_THRESHOLD_DEFAULT, 'tier 4: shipped default on NaN global')
}

// Skip tier 1 when attractorId is omitted / null / undefined / empty.
{
  const fieldOverrides    = { strength: 0.20 }
  const attractorOverrides = { 'attr-1': { strength: 0.10 } }
  eq(resolveClampWarnThresholdFor(null,      'strength', 0.30, fieldOverrides, attractorOverrides),
    0.20, 'null attractorId → skip tier 1')
  eq(resolveClampWarnThresholdFor(undefined, 'strength', 0.30, fieldOverrides, attractorOverrides),
    0.20, 'undefined attractorId → skip tier 1')
  eq(resolveClampWarnThresholdFor('',        'strength', 0.30, fieldOverrides, attractorOverrides),
    0.20, 'empty-string attractorId → skip tier 1')
}

// Non-string attractorId → tier 1 skipped.
{
  const fieldOverrides    = { strength: 0.20 }
  const attractorOverrides = { 'attr-1': { strength: 0.10 } }
  eq(resolveClampWarnThresholdFor(42, 'strength', 0.30, fieldOverrides, attractorOverrides),
    0.20, 'non-string attractorId → skip tier 1')
}

// Invalid value at tier 1 → falls through to tier 2.
{
  const fieldOverrides    = { strength: 0.20 }
  const attractorOverrides = { 'attr-1': { strength: NaN } }
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, fieldOverrides, attractorOverrides),
    0.20, 'non-finite tier 1 value → fall through to tier 2')
}

// Per-field re-sanitization at lookup time (tier 1 out-of-range still clamps).
{
  const attractorOverrides = { 'attr-1': { strength: 100 } }
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, {}, attractorOverrides),
    CLAMP_WARN_THRESHOLD_MAX, 'tier 1 out-of-range clamps to MAX')
}

// Non-object overrides → resolver falls through gracefully.
{
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, {}, null),
    0.30, 'null attractorOverrides → fall through')
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, {}, 'not-obj'),
    0.30, 'string attractorOverrides → fall through')
  eq(resolveClampWarnThresholdFor('attr-1', 'strength', 0.30, {}, []),
    0.30, 'array attractorOverrides → fall through')
}

// --- setClampWarnAttractorFieldOverride — set / clear / no-op ---

// Setting a NEW (attractor, field) cell.
{
  const next = setClampWarnAttractorFieldOverride({}, 'attr-1', 'strength', 0.10)
  eq(next['attr-1'].strength, 0.10, 'set new cell')
}

// Setting same value → ref-equal no-op.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'strength', 0.10)
  eq(next, overrides, 'same-value re-set → input ref')
}

// Setting a different value → new ref.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'strength', 0.20)
  ok(next !== overrides, 'changed value → new ref')
  eq(next['attr-1'].strength, 0.20, 'new value lands')
}

// Setting on an EXISTING attractor preserves its OTHER fields.
{
  const overrides = { 'attr-1': { strength: 0.10, radius: 0.40 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'x', 0.25)
  eq(next['attr-1'].strength, 0.10, 'preserves strength')
  eq(next['attr-1'].radius,   0.40, 'preserves radius')
  eq(next['attr-1'].x,        0.25, 'sets x')
}

// Setting on attr-2 doesn't touch attr-1.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-2', 'strength', 0.30)
  eq(next['attr-1'].strength, 0.10, 'attr-1 untouched')
  eq(next['attr-2'].strength, 0.30, 'attr-2 set')
}

// Clearing one cell preserves others.
{
  const overrides = { 'attr-1': { strength: 0.10, radius: 0.40 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'strength', null)
  ok(!('strength' in next['attr-1']), 'strength cleared')
  eq(next['attr-1'].radius, 0.40,     'radius preserved')
}

// Clearing the LAST cell drops the attractor entry entirely.
{
  const overrides = { 'attr-1': { strength: 0.10 }, 'attr-2': { x: 0.25 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'strength', null)
  ok(!('attr-1' in next), 'attr-1 dropped (was its last cell)')
  ok('attr-2' in next,    'attr-2 preserved')
}

// Clearing a non-existent cell → ref-equal no-op.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'radius', null)
  eq(next, overrides, 'clear non-existent → input ref')
}

// Invalid field / non-string attractor id / non-finite value → input ref.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  eq(setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'bogusField', 0.20), overrides,
    'unknown field → input ref')
  eq(setClampWarnAttractorFieldOverride(overrides, '', 'strength', 0.20), overrides,
    'empty attractorId → input ref')
  eq(setClampWarnAttractorFieldOverride(overrides, 42, 'strength', 0.20), overrides,
    'non-string attractorId → input ref')
  eq(setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'strength', NaN), overrides,
    'NaN value → input ref')
  eq(setClampWarnAttractorFieldOverride(overrides, 'attr-1', 'strength', Infinity), overrides,
    'Infinity value → input ref')
}

// --- clearAllClampWarnAttractorOverrides ---
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = clearAllClampWarnAttractorOverrides(overrides)
  deepEq(next, {}, 'wipes everything')
}
{
  const empty = {}
  eq(clearAllClampWarnAttractorOverrides(empty), empty, 'empty input → input ref (no-op)')
  eq(clearAllClampWarnAttractorOverrides(null),     null,     'null → null')
  eq(clearAllClampWarnAttractorOverrides('not-obj'),'not-obj','string → input ref')
  const arr = []
  eq(clearAllClampWarnAttractorOverrides(arr), arr,        'array → input ref (defensive)')
}

// --- clearClampWarnAttractorOverrides (per-attractor wipe) ---
{
  const overrides = { 'attr-1': { strength: 0.10 }, 'attr-2': { x: 0.25 } }
  const next = clearClampWarnAttractorOverrides(overrides, 'attr-1')
  ok(!('attr-1' in next), 'attr-1 wiped')
  ok('attr-2' in next,    'attr-2 preserved')
}
{
  // Non-existent attractor → ref-equal no-op.
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = clearClampWarnAttractorOverrides(overrides, 'attr-bogus')
  eq(next, overrides, 'non-existent attractor → input ref')
}
{
  // Defensive cases.
  eq(clearClampWarnAttractorOverrides(null, 'attr-1'), null, 'null overrides → null')
  const empty = {}
  eq(clearClampWarnAttractorOverrides(empty, ''), empty, 'empty-string id → input ref')
}

// --- hasClampWarnAttractorFieldOverride ---
{
  // No overrides at all → false.
  eq(hasClampWarnAttractorFieldOverride('attr-1', 'strength', 0.30, {}, {}), false,
    'no overrides → false')
  // Per-attractor matches per-field → false (no DIFF).
  eq(hasClampWarnAttractorFieldOverride('attr-1', 'strength', 0.30,
    { strength: 0.20 }, { 'attr-1': { strength: 0.20 } }), false,
    'per-attractor === per-field → false')
  // Per-attractor differs from per-field → true.
  eq(hasClampWarnAttractorFieldOverride('attr-1', 'strength', 0.30,
    { strength: 0.20 }, { 'attr-1': { strength: 0.10 } }), true,
    'per-attractor !== per-field → true')
  // Per-attractor differs from global (no per-field) → true.
  eq(hasClampWarnAttractorFieldOverride('attr-1', 'strength', 0.30,
    {}, { 'attr-1': { strength: 0.10 } }), true,
    'per-attractor !== global → true')
  // Wrong attractor / wrong field → false.
  eq(hasClampWarnAttractorFieldOverride('attr-2', 'strength', 0.30,
    {}, { 'attr-1': { strength: 0.10 } }), false,
    'wrong attractor → false')
  eq(hasClampWarnAttractorFieldOverride('attr-1', 'radius', 0.30,
    {}, { 'attr-1': { strength: 0.10 } }), false,
    'wrong field → false')
  // Non-finite per-attractor value → false (treated as missing).
  eq(hasClampWarnAttractorFieldOverride('attr-1', 'strength', 0.30,
    {}, { 'attr-1': { strength: NaN } }), false,
    'NaN per-attractor → false')
}

// --- pruneClampWarnAttractorOverrides ---
{
  const overrides = {
    'attr-1': { strength: 0.10 },
    'attr-2': { x: 0.25 },
    'attr-3': { radius: 0.40 },
  }
  const next = pruneClampWarnAttractorOverrides(overrides, ['attr-1', 'attr-3'])
  ok('attr-1' in next,    'attr-1 (live) kept')
  ok(!('attr-2' in next), 'attr-2 (orphan) pruned')
  ok('attr-3' in next,    'attr-3 (live) kept')
}
{
  // No-op when every attractor is still live → input ref.
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = pruneClampWarnAttractorOverrides(overrides, ['attr-1', 'attr-other'])
  eq(next, overrides, 'no orphans → input ref')
}
{
  // Accept Set or iterable for liveAttractorIds.
  const overrides = { 'attr-1': { strength: 0.10 }, 'attr-2': { x: 0.25 } }
  const next = pruneClampWarnAttractorOverrides(overrides, new Set(['attr-1']))
  ok('attr-1' in next,    'Set: attr-1 kept')
  ok(!('attr-2' in next), 'Set: attr-2 pruned')
}
{
  // Non-string entries in liveAttractorIds treated as missing.
  const overrides = { 'attr-1': { strength: 0.10 } }
  const next = pruneClampWarnAttractorOverrides(overrides, [null, undefined, 42, ''])
  deepEq(next, {}, 'non-string live ids treated as missing')
}
{
  // Defensive: non-object overrides → input ref.
  eq(pruneClampWarnAttractorOverrides(null,      ['attr-1']), null,      'null → null')
  eq(pruneClampWarnAttractorOverrides('not-obj', ['attr-1']), 'not-obj', 'string → string')
}

console.log('PASS: per-(attractor, field) clamp warn threshold overrides (R24.40, ~60 asserts)')

// --- R25.45: countClampWarnAttractorOverridesFor (bulk-clear count) ---

// Happy path: count matches actual number of populated fields.
{
  const overrides = {
    'attr-1': { strength: 0.10, x: 0.20, y: 0.30 },
    'attr-2': { radius: 0.15 },
  }
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-1'), 3, 'attr-1 has 3 fields')
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-2'), 1, 'attr-2 has 1 field')
}

// Missing attractor → 0.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-bogus'), 0, 'missing attractor → 0')
}

// Empty overrides map → 0.
{
  eq(countClampWarnAttractorOverridesFor({}, 'attr-1'), 0, 'empty map → 0')
}

// Non-finite values aren't counted.
{
  const overrides = {
    'attr-1': { strength: 0.10, x: NaN, y: Infinity, radius: 0.20 },
  }
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-1'), 2, 'NaN+Infinity skipped')
}

// Unknown field keys aren't counted (only CLAMP_THRESHOLD_FIELDS).
{
  const overrides = {
    'attr-1': { strength: 0.10, gibberish: 0.50, foo: 0.20 },
  }
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-1'), 1, 'only known fields counted')
}

// Defensive: non-object/null/array overrides → 0.
{
  eq(countClampWarnAttractorOverridesFor(null,      'attr-1'), 0, 'null → 0')
  eq(countClampWarnAttractorOverridesFor(undefined, 'attr-1'), 0, 'undefined → 0')
  eq(countClampWarnAttractorOverridesFor([],        'attr-1'), 0, 'array → 0')
  eq(countClampWarnAttractorOverridesFor('str',     'attr-1'), 0, 'string → 0')
  eq(countClampWarnAttractorOverridesFor(42,        'attr-1'), 0, 'number → 0')
}

// Defensive: non-string / empty attractor id → 0.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  eq(countClampWarnAttractorOverridesFor(overrides, ''),        0, 'empty id → 0')
  eq(countClampWarnAttractorOverridesFor(overrides, null),      0, 'null id → 0')
  eq(countClampWarnAttractorOverridesFor(overrides, undefined), 0, 'undefined id → 0')
  eq(countClampWarnAttractorOverridesFor(overrides, 42),        0, 'number id → 0')
}

// Defensive: inner entry is not an object → 0.
{
  const overrides = { 'attr-1': null }
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-1'), 0, 'null inner → 0')
  const overrides2 = { 'attr-1': 'string' }
  eq(countClampWarnAttractorOverridesFor(overrides2, 'attr-1'), 0, 'string inner → 0')
  const overrides3 = { 'attr-1': [0.10, 0.20] }
  eq(countClampWarnAttractorOverridesFor(overrides3, 'attr-1'), 0, 'array inner → 0')
}

// Each field key counted at most ONCE (no double-counting).
// Build a populated entry covering every threshold field and verify.
{
  const inner = {}
  // Use a small sample (don't import CLAMP_THRESHOLD_FIELDS — that
  // would couple the test to the constant's length; instead use known
  // names from the resolution chain).
  for (const f of ['strength', 'radius', 'x', 'y', 'z', 'radiusLog']) inner[f] = 0.20
  const overrides = { 'attr-1': inner }
  eq(countClampWarnAttractorOverridesFor(overrides, 'attr-1'), 6, '6 distinct fields counted')
}

// Pure: input not mutated.
{
  const overrides = { 'attr-1': { strength: 0.10 } }
  const before = JSON.stringify(overrides)
  countClampWarnAttractorOverridesFor(overrides, 'attr-1')
  eq(JSON.stringify(overrides), before, 'overrides not mutated')
}

console.log('PASS: countClampWarnAttractorOverridesFor (R25.45, bulk-clear count, ~25 asserts)')
