// presetThumbnails: pre-render carousel thumbnails for presets the
// user has never loaded yet.
//
// The existing pipeline captures a thumbnail 2s after a preset is
// activated by reading the live WebGL canvas. That's perfect when
// the user actively explores — but presets they never touched stay
// stuck on the emoji fallback in PresetCarousel forever. This module
// renders those missing thumbnails offline with a CPU-only Canvas2D
// sampler so the carousel feels populated from the first visit.
//
// Design notes:
//   - Pure data path: compile each preset's `code` once, run it for
//     N=1500 particles at t=0.6 (slight animation offset so e.g.
//     spirals aren't perfectly degenerate at t=0), project to 2D,
//     dot-stamp into a 120x80 Canvas2D.
//   - Storage key matches what PresetCarousel already reads
//     (preset-thumb-<id>) so the carousel picks the new thumbs up
//     without any change to its load logic.
//   - All compiles + draws are inside try/catch — a single bad
//     preset can't break the others.
//   - Throwaway/no-op when called in a non-DOM context (SSR / tests)
//     so importers can dry-run without polyfilling the world.

export const THUMB_WIDTH  = 120
export const THUMB_HEIGHT = 80
export const THUMB_PARTICLES = 1500
export const THUMB_TIME_SAMPLE = 0.6
export const THUMB_JPEG_QUALITY = 0.5

// Project a 3D world coordinate (roughly bounded to ~[-8, +8]) into
// the 2D thumbnail canvas. Simple orthographic on XY, with Z used to
// fade depth via a brightness multiplier returned alongside.
// World bounds chosen to fit the spread of the bulk of the existing
// presets without clipping their hot pixels. Pure function — no DOM.
export function projectXY(x, y, z, width = THUMB_WIDTH, height = THUMB_HEIGHT) {
  const halfW = width / 2
  const halfH = height / 2
  const scale = Math.min(width, height) / 18  // 18 world units across the short axis
  const px = halfW + x * scale
  const py = halfH - y * scale   // canvas Y is flipped
  // Depth fade: nearer (z > 0) is brighter, farther (z < 0) dims out.
  const depthFade = 1 / (1 + Math.max(0, -z) * 0.08)
  return { px, py, depthFade }
}

// Storage key used by both PresetCarousel and the live capture path.
export function thumbStorageKey(presetId) {
  return `preset-thumb-${presetId}`
}

// Has a thumbnail already been recorded for this preset id?
export function hasThumbnail(presetId, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try { return store.getItem(thumbStorageKey(presetId)) != null }
  catch { return false }
}

// Which presets in the supplied list don't yet have a stored thumb?
// Returns a fresh array so callers can mutate it without aliasing.
export function listMissingThumbnails(presets, storage) {
  if (!Array.isArray(presets)) return []
  const out = []
  for (const p of presets) {
    if (p && typeof p.id === 'string' && !hasThumbnail(p.id, storage)) {
      out.push(p)
    }
  }
  return out
}

// Minimal THREE shim — mirrors the one in store.js used during the
// setup pass so presets that mention THREE.MathUtils.lerp etc. don't
// blow up when sampled headlessly.
function makeThreeShim() {
  return {
    Vector3: class {
      constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0 }
      set(x, y, z) { this.x = x; this.y = y; this.z = z; return this }
    },
    Color: class {
      constructor() { this.r = 1; this.g = 1; this.b = 1 }
      setHSL(h, s, l) {
        // tiny HSL->RGB so the sampler honours the preset's intent.
        const _h = ((h % 1) + 1) % 1
        const _s = Math.max(0, Math.min(1, s))
        const _l = Math.max(0, Math.min(1, l))
        if (_s === 0) { this.r = this.g = this.b = _l; return this }
        const q = _l < 0.5 ? _l * (1 + _s) : _l + _s - _l * _s
        const p = 2 * _l - q
        const hue2rgb = (t) => {
          let _t = t
          if (_t < 0) _t += 1
          if (_t > 1) _t -= 1
          if (_t < 1 / 6) return p + (q - p) * 6 * _t
          if (_t < 1 / 2) return q
          if (_t < 2 / 3) return p + (q - p) * (2 / 3 - _t) * 6
          return p
        }
        this.r = hue2rgb(_h + 1 / 3)
        this.g = hue2rgb(_h)
        this.b = hue2rgb(_h - 1 / 3)
        return this
      }
      setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this }
      set() { return this }
    },
    MathUtils: {
      clamp: (v, a, b) => Math.min(Math.max(v, a), b),
      lerp:  (a, b, t) => a + (b - a) * t,
    },
  }
}

// Compile a preset's source into a callable particle fn. Caller must
// catch errors. Returns the compiled fn AND the controls map gathered
// during the setup pass (used to feed `controls.foo` references).
export function compilePresetForThumbnail(code) {
  const controls = {}
  // Setup pass — capture default control values.
  try {
    const setupFn = new Function(
      'addControl', 'setInfo', 'THREE',
      `"use strict";\n${code}`,
    )
    setupFn(
      (id, _label, _min, _max, initial) => { controls[id] = initial },
      () => {},
      makeThreeShim(),
    )
  } catch { /* preset's setup may rely on globals — soldier on. */ }

  const fn = new Function(
    'i', 'count', 'target', 'color', 'time', 'THREE', 'addControl', 'setInfo', 'controls',
    `"use strict";\n${code}`,
  )
  return { fn, controls }
}

// Render one preset's thumbnail into a (possibly offscreen) canvas
// context. Pure of localStorage — caller decides where to stash the
// dataURL. Returns true on success, false on compile failure.
//
// `canvas` may be a real HTMLCanvasElement OR an OffscreenCanvas with
// a 2d context. The function only uses 2D fill rects, so any context
// honoring fillStyle + fillRect works.
export function renderThumbnailToCanvas(code, canvas, opts = {}) {
  const width  = canvas.width  || THUMB_WIDTH
  const height = canvas.height || THUMB_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) return false

  let compiled
  try { compiled = compilePresetForThumbnail(code) }
  catch { return false }

  const count = opts.count || THUMB_PARTICLES
  const time  = opts.time != null ? opts.time : THUMB_TIME_SAMPLE
  const THREE = makeThreeShim()

  // Dark base — matches the app's default clear colour so the thumb
  // sits comfortably on dark UI panels.
  ctx.fillStyle = opts.bg || '#0a0a0f'
  ctx.fillRect(0, 0, width, height)
  ctx.globalCompositeOperation = 'lighter'

  const target = new THREE.Vector3()
  const color = new THREE.Color()
  let painted = 0
  for (let i = 0; i < count; i++) {
    target.set(0, 0, 0)
    color.setRGB(1, 1, 1)
    try {
      compiled.fn(i, count, target, color, time, THREE, () => {}, () => {}, compiled.controls)
    } catch { continue }  // tolerate per-particle throws
    const { px, py, depthFade } = projectXY(target.x, target.y, target.z, width, height)
    if (px < 0 || py < 0 || px >= width || py >= height) continue
    // Color in 0..255 with depth fade, plus a small alpha so blends
    // accumulate without flooding the canvas (lighter mode helps).
    const r = Math.max(0, Math.min(255, (color.r * 255 * depthFade) | 0))
    const g = Math.max(0, Math.min(255, (color.g * 255 * depthFade) | 0))
    const b = Math.max(0, Math.min(255, (color.b * 255 * depthFade) | 0))
    ctx.fillStyle = `rgba(${r},${g},${b},0.55)`
    ctx.fillRect(px | 0, py | 0, 1, 1)
    painted++
  }
  ctx.globalCompositeOperation = 'source-over'
  return painted > 0
}

// One-shot: render a preset and stash the dataURL in localStorage
// under the carousel's expected key. Returns true on success.
// Pure no-op (returns false) in a non-DOM context.
export function captureThumbnailToStorage(preset, opts = {}) {
  if (typeof document === 'undefined') return false
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!storage) return false
  if (!preset || typeof preset.id !== 'string' || typeof preset.code !== 'string') return false
  try {
    const canvas = document.createElement('canvas')
    canvas.width  = opts.width  || THUMB_WIDTH
    canvas.height = opts.height || THUMB_HEIGHT
    if (!renderThumbnailToCanvas(preset.code, canvas, opts)) return false
    const url = canvas.toDataURL('image/jpeg', opts.quality || THUMB_JPEG_QUALITY)
    storage.setItem(thumbStorageKey(preset.id), url)
    return true
  } catch { return false }
}

// Wipe the cached thumbnail for one preset id. Returns true if the
// entry existed and was removed; false if there was nothing to remove
// (or storage isn't available). Used by the carousel's "rebuild this
// thumb" action so the prerenderer / live capture path treats the
// preset as missing on the next pass.
export function clearThumbnail(presetId, storage) {
  if (typeof presetId !== 'string' || !presetId) return false
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  const key = thumbStorageKey(presetId)
  try {
    const had = store.getItem(key) != null
    if (!had) return false
    store.removeItem(key)
    return true
  } catch { return false }
}

// Re-render exactly one preset's thumbnail, overwriting whatever
// dataURL is already cached. Convenience for the "refresh this thumb"
// UI in the carousel — single call, returns true on success. Different
// from captureThumbnailToStorage only in that it explicitly clears
// the existing entry first, so the rebuilt URL replaces the stale one
// even if rendering fails (we don't leave a broken thumb behind).
export function recaptureThumbnail(preset, opts = {}) {
  if (!preset || typeof preset.id !== 'string') return false
  clearThumbnail(preset.id, opts.storage)
  return captureThumbnailToStorage(preset, opts)
}

// Bulk: wipe every cached thumbnail for the supplied preset list.
// Returns the count of entries actually removed (so the caller can show
// a "cleared N thumbs" toast). Used by the carousel's "Rebuild all"
// button — clear here, then let the prerenderer + live-capture paths
// repopulate during the next idle window.
//
// Defensive contract:
//   - non-array presets: returns 0 (no storage touched).
//   - missing/unavailable storage: returns 0.
//   - per-entry: malformed presets (null / no .id / non-string .id)
//     are skipped; one bad entry never aborts the run.
//   - thrown storage errors (e.g. quota during removeItem... unlikely
//     but possible on some implementations): swallowed for that entry.
export function clearAllThumbnails(presets, storage) {
  if (!Array.isArray(presets) || presets.length === 0) return 0
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return 0
  let cleared = 0
  for (const p of presets) {
    if (!p || typeof p.id !== 'string' || !p.id) continue
    try {
      if (store.getItem(thumbStorageKey(p.id)) != null) {
        store.removeItem(thumbStorageKey(p.id))
        cleared++
      }
    } catch { /* per-entry safety */ }
  }
  return cleared
}

// Pure projector for the "Rebuild all" affordance label + confirmation:
// returns how many of the supplied presets currently have a cached
// thumbnail vs how many don't. Used by PresetCarousel to:
//   - show a compact counter on the bulk button ("↻ 32/46")
//   - skip rendering the button at all when nothing's cached yet
//     (no point clearing zero thumbs).
//
// Returns `{ withThumb, withoutThumb, total }` — all non-negative
// integers, even on defensive input (null presets → all zero).
export function summarizeBulkRebuild(presets, storage) {
  if (!Array.isArray(presets) || presets.length === 0) {
    return { withThumb: 0, withoutThumb: 0, total: 0 }
  }
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  let withThumb = 0
  let total = 0
  for (const p of presets) {
    if (!p || typeof p.id !== 'string' || !p.id) continue
    total++
    if (store && hasThumbnail(p.id, store)) withThumb++
  }
  return { withThumb, withoutThumb: total - withThumb, total }
}
