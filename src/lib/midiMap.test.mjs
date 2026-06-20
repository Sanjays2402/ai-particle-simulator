// midiMap: CC→action persistence, MIDI message decode, CC normalization,
// applyCC dispatch, immutability of setBinding.
import {
  STORAGE_KEY, ACTIONS,
  decodeMidiMessage, ccToNormalized,
  loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  applyCC, actionLabel,
} from './midiMap.js'

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

console.log(`PASS: midiMap — ${ACTIONS.length} actions, decode/normalize/persist/setBinding/applyCC`)
