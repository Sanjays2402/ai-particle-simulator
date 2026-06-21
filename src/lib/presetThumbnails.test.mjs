// presetThumbnails: pure helpers + compile/render pipeline.
import {
  projectXY, thumbStorageKey, hasThumbnail, listMissingThumbnails,
  compilePresetForThumbnail, renderThumbnailToCanvas, captureThumbnailToStorage,
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

console.log(`PASS: presetThumbnails projection + storage discovery + compile + render (${THUMB_WIDTH}x${THUMB_HEIGHT})`)
