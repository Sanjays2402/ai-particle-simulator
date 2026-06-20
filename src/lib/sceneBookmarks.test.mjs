// sceneBookmarks: capture, append/dedupe/cap, remove, apply.
import {
  captureScene, appendBookmark, removeBookmark, applyScene,
  MAX_BOOKMARKS, SCENE_FIELDS,
} from './sceneBookmarks.js'

function fail(msg) { console.error(`FAIL: ${msg}`); process.exit(1) }
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) fail(`${msg} — got ${A} expected ${B}`)
}

// 1. captureScene picks whitelisted keys, copies arrays, ignores noise.
{
  const state = {
    currentPreset: 'spiral-galaxy',
    particleCount: 12345,
    speed: 0.8,
    theme: 'ocean',
    forceFieldCenter: [1, 2, 3],
    aiApiKey: 'sk-leak',          // NOT in whitelist
    particleFn: () => {},         // NOT in whitelist
    paletteEnabled: true, paletteA: '#abc', paletteB: '#def', paletteMix: 0.5,
  }
  const scene = captureScene(state)
  eq(scene.currentPreset, 'spiral-galaxy', 'currentPreset captured')
  eq(scene.particleCount, 12345, 'particleCount captured')
  eq(scene.theme, 'ocean', 'theme captured')
  eq(scene.forceFieldCenter, [1, 2, 3], 'forceFieldCenter captured')
  eq(scene.paletteA, '#abc', 'palette colours captured')
  if ('aiApiKey' in scene) fail('aiApiKey leaked into bookmark — security regression')
  if ('particleFn' in scene) fail('particleFn leaked into bookmark — would crash JSON')
  // Array should be a clone so mutating live store array doesn't poison the bookmark.
  state.forceFieldCenter[0] = 999
  eq(scene.forceFieldCenter[0], 1, 'forceFieldCenter is cloned (no aliasing)')
}

// 2. appendBookmark assigns monotonic ids and dedupes by name.
{
  let items = []
  items = appendBookmark(items, { name: 'A', scene: { particleCount: 100 } })
  items = appendBookmark(items, { name: 'B', scene: { particleCount: 200 } })
  items = appendBookmark(items, { name: 'A', scene: { particleCount: 300 } }) // overwrite A
  eq(items.length, 2, 'dedupe by name keeps unique entries only')
  eq(items[0].name, 'A', 'overwritten entry sits at front')
  eq(items[0].scene.particleCount, 300, 'overwrite kept the new value')
  // Monotonic ids: A's first id was 1, B's was 2, new A is 3.
  if (items[0].id <= 2) fail(`expected monotonic id > 2, got ${items[0].id}`)
}

// 3. Capping: never exceed MAX_BOOKMARKS, oldest falls off first.
{
  let items = []
  for (let n = 0; n < MAX_BOOKMARKS + 5; n++) {
    items = appendBookmark(items, { name: `Scene ${n}`, scene: { particleCount: n } })
  }
  eq(items.length, MAX_BOOKMARKS, 'capped at MAX_BOOKMARKS')
  eq(items[0].scene.particleCount, MAX_BOOKMARKS + 4, 'newest sits at front')
  // The oldest (n=0) must have been evicted.
  if (items.some(it => it.scene.particleCount === 0)) fail('oldest entry should have been evicted')
}

// 4. removeBookmark drops by id.
{
  let items = []
  items = appendBookmark(items, { name: 'X', scene: {} })
  items = appendBookmark(items, { name: 'Y', scene: {} })
  const xId = items.find(i => i.name === 'X').id
  items = removeBookmark(items, xId)
  eq(items.length, 1, 'remove by id leaves the others alone')
  eq(items[0].name, 'Y', 'unrelated entries survive')
}

// 5. applyScene calls the right setters and special-cases preset + theme.
{
  const calls = []
  const api = {
    loadPreset: (id) => calls.push(['loadPreset', id]),
    setTheme:   (t)  => calls.push(['setTheme', t]),
    setParticleCount: (v) => calls.push(['setParticleCount', v]),
    setKaleidoscopeEnabled: (v) => calls.push(['setKaleidoscopeEnabled', v]),
    setForceFieldCenter:    (v) => calls.push(['setForceFieldCenter', v]),
  }
  const scene = {
    currentPreset: 'aurora',
    theme: 'sunset',
    particleCount: 9000,
    kaleidoscopeEnabled: true,
    forceFieldCenter: [1, 2, 3],
    visualStyle: 'glow', // no setter on this stub — should be ignored gracefully
  }
  const applied = applyScene(scene, api)
  // loadPreset must come first.
  eq(calls[0][0], 'loadPreset', 'loadPreset is applied before other writers')
  eq(calls[0][1], 'aurora', 'loadPreset receives the saved id')
  if (!applied.includes('theme'))   fail('theme should be in the applied list')
  if (!applied.includes('particleCount')) fail('particleCount should be in the applied list')
  if (applied.includes('visualStyle')) fail('fields without a setter should be skipped, not crash')
  // Last call's forceFieldCenter must be the cloned array.
  const ffCall = calls.find(c => c[0] === 'setForceFieldCenter')
  eq(ffCall[1], [1, 2, 3], 'force field center forwarded')
  ffCall[1][0] = 42
  eq(scene.forceFieldCenter[0], 1, 'apply passes a clone, not a live alias')
}

// 6. applyScene tolerates missing api / scene without throwing.
eq(applyScene(null, {}), [], 'null scene → empty applied list')
eq(applyScene({}, null), [], 'null api → empty applied list')
eq(applyScene({}, {}), [], 'empty scene → empty applied list')

console.log(`PASS: sceneBookmarks capture/append/cap/apply · MAX=${MAX_BOOKMARKS} · fields=${SCENE_FIELDS.length}`)
