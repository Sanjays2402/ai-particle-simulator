// randomScene: cover the determinism contract, clamps, and the
// "every field present" contract that lets it round-trip through
// appendBookmark + applyScene cleanly.
import {
  generateRandomScene, makeSmashName,
  PALETTE_PAIRS, BG_GRADIENT_PAIRS,
  SCENE_BIASES, SCENE_BIAS_DEFAULT,
  isValidSceneBias, getSceneBias,
  // R20.07 — bias override helpers
  sanitizeBiasOverride, loadBiasOverride, saveBiasOverride,
  resetBiasOverride, hasBiasOverride, resolveSceneBias,
  biasOverrideStorageKey,
  SCENE_BIAS_RANGE_FIELDS, SCENE_BIAS_CHANCE_FIELDS, SCENE_BIAS_OVERRIDE_FIELDS,
} from './randomScene.js'
import { SCENE_FIELDS, appendBookmark } from './sceneBookmarks.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }

// Deterministic mulberry32 — same seed → same sequence. Used so the
// tests can pin behaviour without hand-rolling values.
function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const presetIds = ['spiral-galaxy', 'starfield', 'aurora', 'storm', 'helix']

// 1. Determinism: same seed produces the same scene every time.
{
  const rng1 = mulberry32(42)
  const rng2 = mulberry32(42)
  const a = generateRandomScene(presetIds, { rng: rng1, now: new Date(2026, 5, 20, 12, 30, 0) })
  const b = generateRandomScene(presetIds, { rng: rng2, now: new Date(2026, 5, 20, 12, 30, 0) })
  eq(JSON.stringify(a.scene), JSON.stringify(b.scene), 'same seed → same scene')
  eq(a.name, b.name, 'same `now` → same name')
}

// 2. Different seeds produce different scenes (the trivial "did anything
// random actually happen" check).
{
  const a = generateRandomScene(presetIds, { rng: mulberry32(1) }).scene
  const b = generateRandomScene(presetIds, { rng: mulberry32(2) }).scene
  if (JSON.stringify(a) === JSON.stringify(b)) fail('different seeds produced identical scenes — RNG ignored')
}

// 3. Every reactive scene field is populated and within bounds.
{
  const { scene } = generateRandomScene(presetIds, { rng: mulberry32(7) })
  // currentPreset must be one of the supplied ids.
  if (!presetIds.includes(scene.currentPreset)) fail(`currentPreset ${scene.currentPreset} not in preset list`)
  // Counts + speeds within store-setter clamps.
  if (scene.particleCount < 5000 || scene.particleCount > 40000) fail(`particleCount ${scene.particleCount} out of band`)
  if (scene.speed < 0.3 || scene.speed > 2.5) fail(`speed ${scene.speed} out of band`)
  if (scene.glowIntensity < 0.1 || scene.glowIntensity > 0.9) fail(`glow ${scene.glowIntensity} out of band`)
  if (scene.kaleidoscopeSegments < 2 || scene.kaleidoscopeSegments > 16) fail('kaleidoscope segs out of band')
  if (scene.bgGradientAngle < 0 || scene.bgGradientAngle > 360) fail('bg gradient angle out of band')
  // Palette / bg colours come from curated lists.
  const palOk = PALETTE_PAIRS.some(p => p[0] === scene.paletteA && p[1] === scene.paletteB)
  const bgOk  = BG_GRADIENT_PAIRS.some(p => p[0] === scene.bgGradientA && p[1] === scene.bgGradientB)
  if (!palOk) fail('palette pair was not from curated list')
  if (!bgOk)  fail('bg gradient pair was not from curated list')
  // forceFieldCenter must be a real triple.
  if (!Array.isArray(scene.forceFieldCenter) || scene.forceFieldCenter.length !== 3) fail('forceFieldCenter shape wrong')
  // Slideshow is always off after a smash (UX choice — don't yank).
  eq(scene.slideshowEnabled, false, 'slideshow disabled in smashed scene')
}

// 4. Scene includes every field in SCENE_FIELDS that the smasher knows
// about. We don't require literal coverage of every key (the smasher
// may legitimately skip a few opaque settings), but the field count
// must be high enough that the scene is interesting. Spot check the
// ones we actually populate.
{
  const { scene } = generateRandomScene(presetIds, { rng: mulberry32(99) })
  const must = [
    'currentPreset', 'particleCount', 'speed', 'theme', 'visualStyle',
    'paletteEnabled', 'paletteA', 'paletteB', 'paletteMix',
    'bgGradientEnabled', 'bgGradientA', 'bgGradientB', 'bgGradientAngle',
    'forceFieldType', 'forceFieldCenter', 'kaleidoscopeEnabled',
    'audioMode', 'cameraShake', 'cameraShakeIntensity',
    'bgGradientAudioReactive', 'bgGradientAudioStrength',
  ]
  for (const k of must) {
    if (!(k in scene)) fail(`smashed scene missing required field ${k}`)
    if (!SCENE_FIELDS.includes(k)) fail(`field ${k} not in SCENE_FIELDS whitelist`)
  }
}

// 5. Round-trips cleanly through appendBookmark — no JSON-unsafe values
// (functions, undefined, NaN, Infinity).
{
  const { name, scene } = generateRandomScene(presetIds, { rng: mulberry32(3) })
  const items = appendBookmark([], { name, scene })
  eq(items.length, 1, 'appendBookmark accepted the smashed scene')
  const json = JSON.stringify(items[0])
  // JSON.stringify drops undefined; we want every value to survive.
  for (const [k, v] of Object.entries(scene)) {
    if (v === undefined) fail(`field ${k} was undefined — would be dropped by JSON`)
    if (typeof v === 'number' && !Number.isFinite(v)) fail(`field ${k} non-finite (${v})`)
    if (typeof v === 'function') fail(`field ${k} is a function — would crash JSON`)
  }
  if (!json.includes('"name":')) fail('round-tripped bookmark missing name')
}

// 6. Empty presetIds throws (caller bug, surface it clearly).
{
  let threw = false
  try { generateRandomScene([], { rng: mulberry32(1) }) } catch { threw = true }
  if (!threw) fail('generateRandomScene([]) should throw')
  threw = false
  try { generateRandomScene(null, { rng: mulberry32(1) }) } catch { threw = true }
  if (!threw) fail('generateRandomScene(null) should throw')
}

// 7. makeSmashName formatting.
{
  const name = makeSmashName(new Date(2026, 5, 20, 9, 7, 3))
  eq(name, 'Smash 2026-06-20 09:07:03', 'smash name zero-padded')
  // Doesn't crash on a bogus input.
  if (typeof makeSmashName(null) !== 'string') fail('makeSmashName must always return a string')
}

// --- R12.04 bias chips ---
// 8. Bias roster + validation.
{
  eq(SCENE_BIAS_DEFAULT, 'surprise', 'default bias is surprise')
  if (SCENE_BIASES.length !== 3) fail(`expected 3 bias chips, got ${SCENE_BIASES.length}`)
  const ids = SCENE_BIASES.map(b => b.id)
  for (const id of ['calm', 'surprise', 'wild']) {
    if (!ids.includes(id)) fail(`missing bias ${id}`)
    if (!isValidSceneBias(id)) fail(`isValidSceneBias(${id}) should be true`)
    const b = getSceneBias(id)
    if (!b || b.id !== id) fail(`getSceneBias(${id}) wrong shape`)
    // Every bias must define every keyed range so the generator never
    // hits an undefined index.
    for (const k of ['counts', 'speedRange', 'glowRange', 'attractRange']) {
      if (!Array.isArray(b[k]) || b[k].length !== 2) fail(`bias ${id} ${k} not [min,max]`)
      if (b[k][0] > b[k][1]) fail(`bias ${id} ${k} reversed`)
    }
    for (const k of ['bgChance', 'forceFieldChance', 'kaleidoChance', 'hueCycleChance',
                     'trailsChance', 'shakeChance', 'reactiveBgChance',
                     'chromaChance', 'vignetteChance', 'grainChance']) {
      if (b[k] < 0 || b[k] > 1) fail(`bias ${id} ${k} out of [0,1]`)
    }
  }
  eq(isValidSceneBias('nope'), false, 'unknown id rejected')
  eq(isValidSceneBias(null), false, 'null rejected')
  // Bogus id falls back to default — caller never gets undefined.
  if (getSceneBias('nope').id !== SCENE_BIAS_DEFAULT) fail('getSceneBias falls back to default')
}

// 9. Calm bias produces noticeably lower particle counts than wild.
// Average 30 rolls of each bias with the same seed family.
{
  function avgCount(biasId) {
    let total = 0
    for (let i = 0; i < 30; i++) {
      const { scene } = generateRandomScene(presetIds, { rng: mulberry32(1000 + i), bias: biasId })
      total += scene.particleCount
    }
    return total / 30
  }
  const calmAvg = avgCount('calm')
  const wildAvg = avgCount('wild')
  if (calmAvg >= wildAvg) fail(`calm avg ${calmAvg} should be < wild avg ${wildAvg}`)
  if (calmAvg > 14000) fail(`calm avg ${calmAvg} > calm.counts[1]=14000`)
  if (wildAvg < 25000) fail(`wild avg ${wildAvg} < wild.counts[0]=25000`)
}

// 10. Calm bias rarely turns on kaleidoscope; wild often does.
{
  let calmK = 0, wildK = 0
  for (let i = 0; i < 60; i++) {
    if (generateRandomScene(presetIds, { rng: mulberry32(7000 + i), bias: 'calm' }).scene.kaleidoscopeEnabled) calmK++
    if (generateRandomScene(presetIds, { rng: mulberry32(7000 + i), bias: 'wild' }).scene.kaleidoscopeEnabled) wildK++
  }
  if (calmK >= wildK) fail(`kaleido calm=${calmK} should be < wild=${wildK}`)
}

// 11. Bias is opt-in — omitting it = 'surprise' (default, historic).
{
  const a = generateRandomScene(presetIds, { rng: mulberry32(123) })
  const b = generateRandomScene(presetIds, { rng: mulberry32(123), bias: 'surprise' })
  eq(JSON.stringify(a.scene), JSON.stringify(b.scene), 'no bias = surprise')
}

// 12. Calm bias produces speed/glow/attract within the calm band.
{
  for (let i = 0; i < 20; i++) {
    const { scene } = generateRandomScene(presetIds, { rng: mulberry32(8000 + i), bias: 'calm' })
    if (scene.speed < 0.3 || scene.speed > 0.9) fail(`calm speed ${scene.speed} out of band`)
    if (scene.glowIntensity < 0.1 || scene.glowIntensity > 0.45) fail(`calm glow ${scene.glowIntensity} out of band`)
    if (scene.attractStrength < 0.5 || scene.attractStrength > 1.6) fail(`calm attract ${scene.attractStrength} out of band`)
  }
}

// 13. Wild bias produces values in the wild bands.
{
  for (let i = 0; i < 20; i++) {
    const { scene } = generateRandomScene(presetIds, { rng: mulberry32(9000 + i), bias: 'wild' })
    if (scene.speed < 1.5 || scene.speed > 2.5) fail(`wild speed ${scene.speed} out of band`)
    if (scene.glowIntensity < 0.55 || scene.glowIntensity > 0.9) fail(`wild glow ${scene.glowIntensity} out of band`)
  }
}

// --- R20.07: bias override helpers --------------------------------
// In-memory storage shim for tests (no localStorage in node).
function makeStorage() {
  const data = new Map()
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)) },
    removeItem: (k) => { data.delete(k) },
    get size() { return data.size },
  }
}
function ok(c, m) { if (!c) fail(m) }

// Schema roster pinned — the rest of the contract relies on these
// being the canonical editable field sets.
if (SCENE_BIAS_RANGE_FIELDS.length !== 4) fail(`expected 4 range fields, got ${SCENE_BIAS_RANGE_FIELDS.length}`)
if (SCENE_BIAS_CHANCE_FIELDS.length !== 10) fail(`expected 10 chance fields, got ${SCENE_BIAS_CHANCE_FIELDS.length}`)
ok(SCENE_BIAS_OVERRIDE_FIELDS.includes('forceTypes'), 'forceTypes in override fields')
ok(SCENE_BIAS_OVERRIDE_FIELDS.includes('counts'), 'counts in override fields')
ok(SCENE_BIAS_OVERRIDE_FIELDS.includes('bgChance'), 'bgChance in override fields')

// sanitize: happy paths.
{
  const safe = sanitizeBiasOverride({
    counts: [100, 200],
    speedRange: [0.5, 1.5],
    bgChance: 0.7,
    forceTypes: ['attractor', 'vortex'],
  })
  if (safe.counts[0] !== 100) fail('counts pass-through')
  if (safe.speedRange[1] !== 1.5) fail('speedRange pass-through')
  if (safe.bgChance !== 0.7) fail('bgChance pass-through')
  if (!Array.isArray(safe.forceTypes) || safe.forceTypes.length !== 2) fail('forceTypes pass-through')
}

// sanitize: bad ranges (non-array, wrong length, negative, min>max,
// non-finite) drop the field silently.
{
  eq(sanitizeBiasOverride({ counts: 'not-array' }).counts, undefined, 'non-array range drop')
  eq(sanitizeBiasOverride({ counts: [10] }).counts, undefined, 'wrong-length range drop')
  eq(sanitizeBiasOverride({ counts: [10, 20, 30] }).counts, undefined, 'too-long range drop')
  eq(sanitizeBiasOverride({ counts: [-5, 10] }).counts, undefined, 'negative range drop')
  eq(sanitizeBiasOverride({ counts: [20, 10] }).counts, undefined, 'min>max range drop')
  eq(sanitizeBiasOverride({ counts: [NaN, 100] }).counts, undefined, 'NaN range drop')
  eq(sanitizeBiasOverride({ counts: [Infinity, 100] }).counts, undefined, '±Infinity range drop')
}

// sanitize: bad chances (out of [0,1], non-finite) drop the field.
{
  eq(sanitizeBiasOverride({ bgChance: -0.1 }).bgChance, undefined, 'negative chance drop')
  eq(sanitizeBiasOverride({ bgChance: 1.5 }).bgChance, undefined, '>1 chance drop')
  eq(sanitizeBiasOverride({ bgChance: NaN }).bgChance, undefined, 'NaN chance drop')
  eq(sanitizeBiasOverride({ bgChance: 'half' }).bgChance, undefined, 'string chance drop')
  // 0 and 1 are valid (full silence / full intent).
  eq(sanitizeBiasOverride({ bgChance: 0 }).bgChance, 0, 'chance 0 valid')
  eq(sanitizeBiasOverride({ bgChance: 1 }).bgChance, 1, 'chance 1 valid')
}

// sanitize: bad forceTypes (empty array, unknown member) drop the field.
{
  eq(sanitizeBiasOverride({ forceTypes: [] }).forceTypes, undefined, 'empty forceTypes drop')
  eq(sanitizeBiasOverride({ forceTypes: ['bogus'] }).forceTypes, undefined, 'unknown member drop')
  eq(sanitizeBiasOverride({ forceTypes: 'not-array' }).forceTypes, undefined, 'non-array drop')
  // null is a valid member (means "no force this roll").
  const r = sanitizeBiasOverride({ forceTypes: [null, 'attractor', null] })
  eq(r.forceTypes.length, 3, 'null member valid in forceTypes')
}

// sanitize: unknown keys silently dropped.
{
  const safe = sanitizeBiasOverride({ foo: 'bar', counts: [1, 2], badField: 99 })
  eq(safe.foo, undefined, 'unknown key dropped')
  eq(safe.badField, undefined, 'unknown numeric key dropped')
  eq(safe.counts[0], 1, 'valid key kept alongside drops')
}

// sanitize: defensive against null / non-object inputs.
{
  eq(Object.keys(sanitizeBiasOverride(null)).length, 0, 'null → empty override')
  eq(Object.keys(sanitizeBiasOverride(undefined)).length, 0, 'undefined → empty')
  eq(Object.keys(sanitizeBiasOverride('not obj')).length, 0, 'string → empty')
  eq(Object.keys(sanitizeBiasOverride(42)).length, 0, 'number → empty')
}

// Storage keys per chip.
{
  eq(biasOverrideStorageKey('calm'), 'smash-bias-overrides-calm', 'storage key for calm')
  eq(biasOverrideStorageKey('wild'), 'smash-bias-overrides-wild', 'storage key for wild')
}

// load/save round-trip — what you save is what you read back.
{
  const s = makeStorage()
  const written = saveBiasOverride('calm', { counts: [500, 1000], bgChance: 0.9 }, s)
  eq(written.counts[0], 500, 'save round-trips counts')
  eq(written.bgChance, 0.9, 'save round-trips bgChance')
  const loaded = loadBiasOverride('calm', s)
  eq(loaded.counts[0], 500, 'load round-trips counts')
  eq(loaded.bgChance, 0.9, 'load round-trips bgChance')
}

// save: empty override removes the storage entry (clean reset path).
{
  const s = makeStorage()
  saveBiasOverride('calm', { counts: [100, 200] }, s)
  ok(s.size > 0, 'save populated storage')
  saveBiasOverride('calm', {}, s)
  eq(s.size, 0, 'save empty wipes entry')
}

// resetBiasOverride is a convenience wrapper around save({}, ...).
{
  const s = makeStorage()
  saveBiasOverride('wild', { counts: [50, 100] }, s)
  ok(hasBiasOverride('wild', s), 'override active after save')
  resetBiasOverride('wild', s)
  ok(!hasBiasOverride('wild', s), 'reset clears override')
}

// load: invalid bias id → empty map (no storage touched).
{
  const s = makeStorage()
  eq(Object.keys(loadBiasOverride('not-a-real-bias', s)).length, 0, 'unknown bias id → empty load')
  eq(Object.keys(saveBiasOverride('not-a-real-bias', { counts: [1, 2] }, s)).length, 0, 'unknown id → empty save')
}

// load: corrupt JSON in storage → empty map (defensive).
{
  const s = makeStorage()
  s.setItem(biasOverrideStorageKey('calm'), 'not valid json{')
  eq(Object.keys(loadBiasOverride('calm', s)).length, 0, 'corrupt JSON → empty load')
}

// load: corrupt schema (every field invalid) → empty map.
{
  const s = makeStorage()
  s.setItem(biasOverrideStorageKey('calm'), JSON.stringify({ counts: 'bogus', bgChance: 'half' }))
  eq(Object.keys(loadBiasOverride('calm', s)).length, 0, 'corrupt schema → empty load')
}

// resolveSceneBias: with no override, returns shipped baseline.
{
  const s = makeStorage()
  const r = resolveSceneBias('calm', { storage: s })
  eq(r.label, 'Mostly Calm', 'no override: shipped label')
  // Same reference as shipped (when override is empty we return baseline directly).
  if (r !== getSceneBias('calm')) fail('no override should return baseline ref')
}

// resolveSceneBias: with persisted override, fields are overridden.
{
  const s = makeStorage()
  saveBiasOverride('calm', { counts: [9999, 10000], bgChance: 0.99 }, s)
  const r = resolveSceneBias('calm', { storage: s })
  eq(r.label, 'Mostly Calm', 'overridden bias keeps label')
  eq(r.id, 'calm', 'overridden bias keeps id')
  eq(r.counts[0], 9999, 'override flows through')
  eq(r.bgChance, 0.99, 'override flows through')
  // Untouched fields stay at shipped values.
  if (!Array.isArray(r.forceTypes)) fail('shipped forceTypes preserved')
}

// resolveSceneBias: explicit override arg trumps storage.
{
  const s = makeStorage()
  saveBiasOverride('calm', { counts: [1, 2] }, s)
  const r = resolveSceneBias('calm', {
    storage: s,
    override: { counts: [100, 200] },
  })
  eq(r.counts[0], 100, 'explicit override wins over storage')
}

// generateRandomScene: override flows through — produced scene reflects
// override clamps. We pick a custom counts range and check that across
// many seeds, every count lands inside it (the per-bias range tests
// above use the shipped ranges; this proves overrides actually steer
// the generator).
{
  for (let i = 0; i < 50; i++) {
    const { scene } = generateRandomScene(presetIds, {
      rng: mulberry32(50000 + i),
      bias: 'calm',
      biasOverride: { counts: [3000, 3500], speedRange: [0.10, 0.12] },
    })
    if (scene.particleCount < 3000 || scene.particleCount > 3500) {
      fail(`override counts ignored: got ${scene.particleCount}`)
    }
    if (scene.speed < 0.10 || scene.speed > 0.13) {
      fail(`override speedRange ignored: got ${scene.speed}`)
    }
  }
}

console.log(`PASS: randomScene — determinism + clamps + roundtrip · palettes=${PALETTE_PAIRS.length} · bgPairs=${BG_GRADIENT_PAIRS.length} · biases=${SCENE_BIASES.length}`)
