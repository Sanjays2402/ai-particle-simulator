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

// 7. namedAttractors round-trip: list captured + restored, with deep
// clones so future store mutations don't leak into the bookmark.
function shapeEq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail(`${msg} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`)
  }
}

{
  // Captured shape: full list, deep-cloned positions.
  const live = [
    { id: 'attr-1', name: 'Eye', type: 'attractor', strength: 1.5, position: [1, 0, 2], radius: 8, enabled: true },
    { id: 'attr-2', name: 'Wind', type: 'turbulence', strength: 0.8, position: [-3, 0, 4], radius: 12, enabled: false },
  ]
  const state = {
    namedAttractors: live,
    currentPreset: 'spiral',
  }
  const scene = captureScene(state)
  if (!Array.isArray(scene.namedAttractors)) fail('namedAttractors captured as array')
  shapeEq(scene.namedAttractors, live, 'attractor list preserved in capture')

  // Mutating the LIVE store position must not affect the bookmark.
  live[0].position[0] = 999
  eq(scene.namedAttractors[0].position[0], 1, 'position deep-cloned (no aliasing)')
  // Mutating the LIVE entry's strength must not affect the bookmark
  // (we shallow-spread the entry, freezing primitive fields).
  live[0].strength = 999
  eq(scene.namedAttractors[0].strength, 1.5, 'entry shallow-cloned (primitives frozen)')
}

{
  // applyScene routes the field to setNamedAttractors.
  const calls = []
  const api = {
    loadPreset: () => calls.push(['loadPreset']),
    setNamedAttractors: (list) => calls.push(['setNamedAttractors', list]),
  }
  const scene = {
    namedAttractors: [
      { id: 'attr-9', name: 'X', type: 'vortex', strength: 2, position: [0, 0, 0], radius: 10, enabled: true },
    ],
  }
  const applied = applyScene(scene, api)
  if (!applied.includes('namedAttractors')) fail('namedAttractors should appear in applied list')
  const setterCall = calls.find(c => c[0] === 'setNamedAttractors')
  if (!setterCall) fail('setNamedAttractors should have been invoked')
  eq(setterCall[1].length, 1, 'setter received the list')
  eq(setterCall[1][0].id, 'attr-9', 'first entry id forwarded')

  // The handed-in array must be a CLONE — mutating it after apply
  // can't poison the saved bookmark.
  setterCall[1].push({ injected: true })
  eq(scene.namedAttractors.length, 1, 'scene.namedAttractors not mutated by apply')
}

// 8. namedAttractors is on the SCENE_FIELDS whitelist (regression
// guard — if the field name ever changes both the store and the
// scene-bookmarks list need to update in lockstep).
if (!SCENE_FIELDS.includes('namedAttractors')) {
  fail('namedAttractors missing from SCENE_FIELDS whitelist')
}

console.log(`PASS: sceneBookmarks capture/append/cap/apply + namedAttractors round-trip (deep-clone position) · MAX=${MAX_BOOKMARKS} · fields=${SCENE_FIELDS.length}`)
