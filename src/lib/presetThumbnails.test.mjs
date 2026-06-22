// presetThumbnails: pure helpers + compile/render pipeline.
import {
  projectXY, thumbStorageKey, hasThumbnail, listMissingThumbnails,
  compilePresetForThumbnail, renderThumbnailToCanvas, captureThumbnailToStorage,
  clearThumbnail, recaptureThumbnail,
  clearAllThumbnails, summarizeBulkRebuild,
  THUMB_WIDTH, THUMB_HEIGHT,
} from './presetThumbnails.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-6) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- projectXY ---
{
  const c = projectXY(0, 0, 0)
  near(c.px, THUMB_WIDTH / 2, 'origin → centre X')
  near(c.py, THUMB_HEIGHT / 2, 'origin → centre Y')
  eq(c.depthFade, 1, 'z=0 → no depth fade')
}
{
  // Negative Z farther from camera → fade < 1.
  const close = projectXY(0, 0, 2).depthFade
  const far   = projectXY(0, 0, -5).depthFade
  eq(close, 1, 'positive z still fades to 1')
  if (far >= 1) fail('negative z should dim')
}

// --- thumbStorageKey ---
eq(thumbStorageKey('spiral-galaxy'), 'preset-thumb-spiral-galaxy', 'storage key format matches PresetCarousel')

// --- hasThumbnail + listMissingThumbnails with a fake Storage ---
function makeFakeStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    clear: () => { m.clear() },
    _raw: m,
  }
}
{
  const s = makeFakeStorage()
  eq(hasThumbnail('a', s), false, 'absent → no thumb')
  s.setItem(thumbStorageKey('a'), 'data:image/jpeg;base64,...')
  eq(hasThumbnail('a', s), true, 'present → has thumb')

  const missing = listMissingThumbnails([
    { id: 'a' }, { id: 'b' }, { id: 'c' },
  ], s)
  eq(missing.length, 2, 'a is present, b+c missing')
  eq(missing.map(p => p.id).join(','), 'b,c', 'missing ids preserve input order')

  // Bad inputs don't crash.
  eq(listMissingThumbnails(null, s).length, 0, 'null presets list → empty')
  eq(listMissingThumbnails([null, 'string', { id: 1 }, { id: 'ok' }], s).length, 1, 'malformed entries skipped')
}

// --- compilePresetForThumbnail captures controls + returns callable fn ---
{
  const code = `
    addControl('arms', 'Arms', 2, 8, 4);
    setInfo('Spiral', 'A spiral');
    const t = i / count;
    const arm = i % controls.arms;
    target.set(Math.cos(arm) * t * 5, 0, Math.sin(arm) * t * 5);
    color.setHSL(t, 0.8, 0.5);
  `
  const { fn, controls } = compilePresetForThumbnail(code)
  eq(controls.arms, 4, 'addControl initial captured during setup')
  eq(typeof fn, 'function', 'returns a callable fn')
  // Smoke test: it runs without throwing for index 0/100.
  const target = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this } }
  const color  = { r: 1, g: 1, b: 1, setHSL() { return this }, setRGB() { return this }, set() { return this } }
  const THREE  = { Vector3: function () {}, Color: function () {}, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t } }
  fn(50, 1500, target, color, 0.6, THREE, () => {}, () => {}, controls)
  // After execution target.set was called → coordinates moved.
  if (target.x === 0 && target.y === 0 && target.z === 0) fail('target was not updated by preset fn')
}

// --- renderThumbnailToCanvas using a fake Canvas2D context ---
{
  // Minimal canvas with just the methods + props the renderer touches.
  let painted = 0
  const canvas = {
    width: THUMB_WIDTH, height: THUMB_HEIGHT,
    getContext() {
      return {
        fillStyle: '',
        globalCompositeOperation: 'source-over',
        fillRect: (_x, _y, w, h) => {
          if (w === THUMB_WIDTH && h === THUMB_HEIGHT) return  // base clear
          painted++
        },
      }
    },
  }
  const code = `
    const t = i / count;
    target.set((t - 0.5) * 10, 0, 0);
    color.setRGB(t, 1 - t, 0.5);
  `
  const ok = renderThumbnailToCanvas(code, canvas)
  eq(ok, true, 'render succeeded')
  if (painted < 100) fail(`expected many painted pixels, got ${painted}`)
}

// Bad source: compile throws → returns false, no crash.
{
  const canvas = { width: 32, height: 32, getContext: () => ({ fillStyle: '', fillRect: () => {}, globalCompositeOperation: 'source-over' }) }
  const ok = renderThumbnailToCanvas('!!! not js !!!', canvas)
  eq(ok, false, 'compile failure returns false')
}

// --- captureThumbnailToStorage is a safe no-op in this Node test
//     (no document); just verify it doesn't throw on bad input either.
eq(captureThumbnailToStorage(null), false, 'null preset → false safe')
eq(captureThumbnailToStorage({ id: 'x', code: 'target.set(0,0,0); color.setRGB(1,1,1);' }), false,
   'no document → false safe')

// --- clearThumbnail ---
{
  const s = makeFakeStorage()
  eq(clearThumbnail('missing-id', s), false, 'clearThumbnail: nothing to remove → false')
  s.setItem(thumbStorageKey('p'), 'data:image/jpeg;base64,xxx')
  eq(hasThumbnail('p', s), true, 'precondition: thumb present')
  eq(clearThumbnail('p', s), true, 'clearThumbnail: present → true')
  eq(hasThumbnail('p', s), false, 'clearThumbnail removes the entry')
  // Re-clear is a no-op.
  eq(clearThumbnail('p', s), false, 'clearThumbnail second call → false (already gone)')
  // Bad inputs.
  eq(clearThumbnail('', s), false, 'clearThumbnail: empty id → false')
  eq(clearThumbnail(null, s), false, 'clearThumbnail: null id → false')
  eq(clearThumbnail(123, s), false, 'clearThumbnail: non-string id → false')
}

// --- recaptureThumbnail is also a Node-side no-op (no document), but
//     verifies the wipe step ran by leaving storage empty afterward.
{
  const s = makeFakeStorage()
  s.setItem(thumbStorageKey('foo'), 'stale-thumb-data')
  eq(hasThumbnail('foo', s), true, 'precondition: stale thumb cached')
  // Render returns false in a no-document env; the wipe should still
  // have happened first so the stale thumb is gone.
  const ok = recaptureThumbnail({ id: 'foo', code: 'target.set(0,0,0);' }, { storage: s })
  eq(ok, false, 'recaptureThumbnail: no-document → render returns false')
  eq(hasThumbnail('foo', s), false, 'recaptureThumbnail wiped stale thumb before failing render')

  // Defensive: bad inputs return false without throwing.
  eq(recaptureThumbnail(null), false, 'recaptureThumbnail: null preset → false')
  eq(recaptureThumbnail({}), false,   'recaptureThumbnail: empty preset → false')
  eq(recaptureThumbnail({ id: 42 }), false, 'recaptureThumbnail: non-string id → false')
}

console.log(`PASS: presetThumbnails projection + storage discovery + compile + render (${THUMB_WIDTH}x${THUMB_HEIGHT}) + clearThumbnail/recaptureThumbnail + R16.06 bulk clear/summarize`)

// --- R16.06: clearAllThumbnails — bulk wipe + count + defensive cases ---
{
  const s = makeFakeStorage()
  s.setItem(thumbStorageKey('a'), 'da')
  s.setItem(thumbStorageKey('b'), 'db')
  s.setItem(thumbStorageKey('c'), 'dc')
  // (d is missing on purpose — bulk clear must not count nonexistent entries)
  const cleared = clearAllThumbnails([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], s)
  eq(cleared, 3, 'clearAllThumbnails returns count of REMOVED entries (not list length)')
  eq(hasThumbnail('a', s), false, 'clearAllThumbnails wiped a')
  eq(hasThumbnail('b', s), false, 'clearAllThumbnails wiped b')
  eq(hasThumbnail('c', s), false, 'clearAllThumbnails wiped c')

  // Re-clear is a no-op — everything is gone.
  eq(clearAllThumbnails([{ id: 'a' }, { id: 'b' }], s), 0, 'clearAllThumbnails second pass: 0')

  // Malformed list entries are tolerated without crashing the run.
  s.setItem(thumbStorageKey('ok'), 'data')
  const mixed = clearAllThumbnails([null, undefined, {}, { id: '' }, { id: 99 }, { id: 'ok' }], s)
  eq(mixed, 1, 'clearAllThumbnails: only the one valid entry was cleared from a mixed list')

  // Defensive: bad inputs return 0 without touching storage.
  eq(clearAllThumbnails(null, s), 0, 'clearAllThumbnails: null list → 0')
  eq(clearAllThumbnails([], s), 0, 'clearAllThumbnails: empty list → 0')
  eq(clearAllThumbnails('not-an-array', s), 0, 'clearAllThumbnails: non-array → 0')
  eq(clearAllThumbnails([{ id: 'x' }], null), 0, 'clearAllThumbnails: no storage → 0')
}

// --- R16.06: summarizeBulkRebuild — withThumb / withoutThumb / total ---
{
  const s = makeFakeStorage()
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  // No thumbs cached yet → everyone is in withoutThumb.
  const empty = summarizeBulkRebuild(list, s)
  eq(empty.withThumb, 0, 'summarizeBulkRebuild: no cache → 0 withThumb')
  eq(empty.withoutThumb, 4, 'summarizeBulkRebuild: no cache → all 4 withoutThumb')
  eq(empty.total, 4, 'summarizeBulkRebuild: total counts every valid preset')
  s.setItem(thumbStorageKey('a'), 'data')
  s.setItem(thumbStorageKey('c'), 'data')
  const partial = summarizeBulkRebuild(list, s)
  eq(partial.withThumb, 2, 'summarizeBulkRebuild: 2 cached → 2 withThumb')
  eq(partial.withoutThumb, 2, 'summarizeBulkRebuild: 2 cached → 2 withoutThumb')
  eq(partial.total, 4, 'summarizeBulkRebuild: total unchanged when some are cached')

  // Malformed entries don't inflate the total.
  const mixed = summarizeBulkRebuild([null, { id: '' }, { id: 7 }, { id: 'a' }], s)
  eq(mixed.total, 1, 'summarizeBulkRebuild: skips malformed entries from total')
  eq(mixed.withThumb, 1, 'summarizeBulkRebuild: the one valid entry IS cached')
  eq(mixed.withoutThumb, 0, 'summarizeBulkRebuild: complementary count is correct')

  // Defensive: bad inputs return all-zero.
  const z1 = summarizeBulkRebuild(null, s)
  eq(z1.withThumb + z1.withoutThumb + z1.total, 0, 'summarizeBulkRebuild: null → all zero')
  const z2 = summarizeBulkRebuild([], s)
  eq(z2.withThumb + z2.withoutThumb + z2.total, 0, 'summarizeBulkRebuild: empty → all zero')

  // No storage: with no place to check, every preset is "not cached"
  // — total still counts valid entries so the UI knows the scale.
  const noStore = summarizeBulkRebuild(list, null)
  eq(noStore.total, 4, 'summarizeBulkRebuild: no storage still counts total')
  eq(noStore.withThumb, 0, 'summarizeBulkRebuild: no storage → 0 cached')
  eq(noStore.withoutThumb, 4, 'summarizeBulkRebuild: no storage → all uncached')
}
