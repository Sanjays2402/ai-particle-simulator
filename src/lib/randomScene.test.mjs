// randomScene: cover the determinism contract, clamps, and the
// "every field present" contract that lets it round-trip through
// appendBookmark + applyScene cleanly.
import {
  generateRandomScene, makeSmashName,
  PALETTE_PAIRS, BG_GRADIENT_PAIRS,
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

console.log(`PASS: randomScene — determinism + clamps + roundtrip · palettes=${PALETTE_PAIRS.length} · bgPairs=${BG_GRADIENT_PAIRS.length}`)
