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

// R19.13 — per-thumb metadata side-store. The thumb data URL alone
// doesn't tell the user when it was captured or at what resolution;
// metadata fixes that for the hover badge in PresetCarousel:
//   - capturedAt: ISO-8601 timestamp the thumb was generated
//   - width / height: dimensions in CSS pixels
//   - source: 'live' (captured during preset playback) or 'render'
//             (offline sampler — pre-rendered thumb)
//
// Stored under a parallel `preset-thumb-meta-<id>` key so the legacy
// data-URL path is untouched. JSON-encoded so adding fields later
// (compile-time, performance score, etc) doesn't break old metadata.
//
// Defensive contract on the read side: missing key → null. Parse
// failures (corrupt JSON, wrong shape) → null. Schema validation:
// drop unknown fields, sanitise types, coerce missing dimensions to
// the THUMB_WIDTH/HEIGHT defaults. The UI guards against null.
export function thumbMetadataKey(presetId) {
  return `preset-thumb-meta-${presetId}`
}

const VALID_SOURCES = new Set(['live', 'render'])

// R22.29 — max length cap for the per-thumb user note. 240 chars
// fits two display lines in the detail panel at the current font
// without forcing a scrollbar; keeps storage bounded so 46 presets
// max out at <12 KB of note data even at the cap.
export const THUMB_NOTE_MAX_LEN = 240

// R22.29 — atomic note update. Reads the existing metadata, merges
// the new note (trimmed + length-capped), writes back. Returns true
// on a successful write OR a true clear (note===''/null/undefined
// followed by a successful write of the metadata WITHOUT a note
// field). Returns false on missing-storage / no-pre-existing-meta /
// write failure. Pure side-effect via `storage` arg so tests can
// inject an in-memory shim.
//
// We DON'T re-record the rest of the metadata fresh — that would
// reset capturedAt + lose source/dimensions on a note edit. Instead
// we mutate just the note key in the existing JSON envelope.
//
// When `note` is empty/whitespace/null/undefined, the field is REMOVED
// (so a future readThumbMetadata returns metadata without a `note`
// key, not metadata with `note: ''`). This keeps the schema clean
// and the "no note" branch of the detail panel renders consistently.
export function setThumbNote(presetId, note, storage) {
  if (typeof presetId !== 'string' || !presetId) return false
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  // Read the existing metadata raw — we want to preserve every field
  // (incl. ones not in our current schema, e.g. future extensions)
  // so a partial write doesn't lose data.
  let raw
  try { raw = store.getItem(thumbMetadataKey(presetId)) }
  catch { return false }
  if (!raw) return false  // no metadata to attach the note to
  let parsed
  try { parsed = JSON.parse(raw) }
  catch { return false }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
  // Capture / clear the note.
  const trimmed = typeof note === 'string' ? note.trim().slice(0, THUMB_NOTE_MAX_LEN) : ''
  if (trimmed) {
    // No-op if the note is already exactly this value (matches the
    // ref-equal-on-no-op pattern from other lib helpers — saves a
    // round-trip through JSON.stringify + localStorage write).
    if (parsed.note === trimmed) return true
    parsed.note = trimmed
  } else {
    // Empty / clearing — drop the key. No-op if already absent.
    if (!Object.prototype.hasOwnProperty.call(parsed, 'note')) return true
    delete parsed.note
  }
  try {
    store.setItem(thumbMetadataKey(presetId), JSON.stringify(parsed))
    return true
  } catch { return false }
}

export function recordThumbMetadata(presetId, opts = {}, storage) {
  if (typeof presetId !== 'string' || !presetId) return false
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  const width  = Number.isFinite(opts.width)  && opts.width  > 0 ? Math.round(opts.width)  : THUMB_WIDTH
  const height = Number.isFinite(opts.height) && opts.height > 0 ? Math.round(opts.height) : THUMB_HEIGHT
  const source = VALID_SOURCES.has(opts.source) ? opts.source : 'render'
  const capturedAt = typeof opts.capturedAt === 'string' && opts.capturedAt
    ? opts.capturedAt
    : new Date().toISOString()
  const meta = { capturedAt, width, height, source }
  // R20.19 — optional richer fields the badge-detail panel surfaces.
  // All optional; missing fields are dropped (no schema rev needed when
  // we later add more — readThumbMetadata picks them up automatically
  // through the spread). Defensive: each field has a clamp so a bad
  // caller can't write garbage.
  if (Number.isFinite(opts.particleCount) && opts.particleCount >= 0) {
    meta.particleCount = Math.round(opts.particleCount)
  }
  if (Number.isFinite(opts.captureMs) && opts.captureMs >= 0) {
    meta.captureMs = Math.round(opts.captureMs)
  }
  if (Number.isFinite(opts.byteSize) && opts.byteSize >= 0) {
    meta.byteSize = Math.round(opts.byteSize)
  }
  // R22.29 — user-authored note ("good demo shot", "wrong colors",
  // etc). Optional; trimmed; capped at THUMB_NOTE_MAX_LEN to keep
  // localStorage bounded and the detail panel layout sane.
  if (typeof opts.note === 'string') {
    const trimmed = opts.note.trim().slice(0, THUMB_NOTE_MAX_LEN)
    if (trimmed) meta.note = trimmed
  }
  try {
    store.setItem(thumbMetadataKey(presetId), JSON.stringify(meta))
    return true
  } catch { return false }
}

export function readThumbMetadata(presetId, storage) {
  if (typeof presetId !== 'string' || !presetId) return null
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return null
  let raw
  try { raw = store.getItem(thumbMetadataKey(presetId)) }
  catch { return null }
  if (!raw) return null
  let parsed
  try { parsed = JSON.parse(raw) }
  catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  // Sanitise + drop unknown fields. Missing required fields with no
  // sensible default → return null so the UI hides the badge instead
  // of showing junk.
  const capturedAt = typeof parsed.capturedAt === 'string' && parsed.capturedAt
    ? parsed.capturedAt
    : null
  if (!capturedAt) return null
  const width  = Number.isFinite(parsed.width)  && parsed.width  > 0 ? Math.round(parsed.width)  : THUMB_WIDTH
  const height = Number.isFinite(parsed.height) && parsed.height > 0 ? Math.round(parsed.height) : THUMB_HEIGHT
  const source = VALID_SOURCES.has(parsed.source) ? parsed.source : 'render'
  const out = { capturedAt, width, height, source }
  // R20.19 — optional rich fields. Each one is independently validated
  // so a partial / corrupt rich field can't reject the whole entry.
  // Missing fields stay undefined; the UI hides the corresponding row.
  if (Number.isFinite(parsed.particleCount) && parsed.particleCount >= 0) {
    out.particleCount = Math.round(parsed.particleCount)
  }
  if (Number.isFinite(parsed.captureMs) && parsed.captureMs >= 0) {
    out.captureMs = Math.round(parsed.captureMs)
  }
  if (Number.isFinite(parsed.byteSize) && parsed.byteSize >= 0) {
    out.byteSize = Math.round(parsed.byteSize)
  }
  // R22.29 — user-authored note. Sanitized: trimmed, length-capped.
  // Empty / non-string drops the field.
  if (typeof parsed.note === 'string') {
    const trimmed = parsed.note.trim().slice(0, THUMB_NOTE_MAX_LEN)
    if (trimmed) out.note = trimmed
  }
  return out
}

// Clear metadata for one preset id. Returns true when an entry was
// removed, false otherwise. Mirrors clearThumbnail's contract so the
// rebuild path can drop both halves with the same call shape.
export function clearThumbMetadata(presetId, storage) {
  if (typeof presetId !== 'string' || !presetId) return false
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  const key = thumbMetadataKey(presetId)
  try {
    const had = store.getItem(key) != null
    if (!had) return false
    store.removeItem(key)
    return true
  } catch { return false }
}

// R19.13 — relative-time formatter for the hover badge. Returns a
// short string like "12s", "4m", "3h", "2d", "3w", or "now". Built
// here (not via Intl.RelativeTimeFormat) so the lib stays test-pure
// without polyfilling Intl — and so the output is compact for a
// hover badge regardless of locale (the user sees "3h" not "3 hours
// ago" which would wrap on the small tile).
//
// `now` is injectable for unit tests; defaults to Date.now().
export function summarizeThumbAge(metadata, now = Date.now()) {
  if (!metadata || typeof metadata !== 'object') return null
  if (typeof metadata.capturedAt !== 'string') return null
  const then = Date.parse(metadata.capturedAt)
  if (!Number.isFinite(then)) return null
  const deltaMs = Math.max(0, now - then)  // never report "in the future"
  const sec = Math.floor(deltaMs / 1000)
  if (sec < 5) return 'now'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 52) return `${wk}w`
  const yr = Math.floor(wk / 52)
  return `${yr}y`
}

// R20.19 — compact byte-size formatter for the metadata detail panel.
// Returns 'X B' / 'X KB' / 'X MB' rounded to 1 decimal place. Pure,
// defensive against non-finite / negative input (returns null so the
// UI hides the corresponding row).
export function formatByteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return null
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

// R20.19 — project metadata into UI-ready key/value rows for the
// detail panel. Pure data so the React layer stays render-only.
// Returns an array of { key, label, value, hint? } entries; the
// renderer paints them as a table. Missing optional fields are
// SKIPPED rather than rendered as 'unknown' — keeps the panel tight.
//
// `now` injectable for tests; defaults to Date.now() so the relative
// timestamp tracks the wall clock.
export function formatThumbDetails(metadata, now = Date.now()) {
  if (!metadata || typeof metadata !== 'object') return []
  const out = []
  // Captured-at — full ISO time + relative age. Always present (this
  // field is required for readThumbMetadata to return a non-null).
  if (typeof metadata.capturedAt === 'string') {
    const age = summarizeThumbAge(metadata, now)
    let pretty = metadata.capturedAt
    try {
      const d = new Date(metadata.capturedAt)
      if (!Number.isNaN(d.valueOf())) {
        pretty = d.toLocaleString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
      }
    } catch { /* fall back to raw ISO */ }
    out.push({
      key: 'capturedAt',
      label: 'Captured',
      value: pretty + (age ? ` (${age} ago)` : ''),
    })
  }
  // Source — capture path classifier.
  if (typeof metadata.source === 'string') {
    out.push({
      key: 'source',
      label: 'Source',
      value: metadata.source,
      hint: metadata.source === 'live'
        ? 'Captured from the live WebGL canvas during preset playback'
        : 'Pre-rendered by the offline Canvas2D sampler',
    })
  }
  // Resolution.
  if (Number.isFinite(metadata.width) && Number.isFinite(metadata.height)) {
    out.push({
      key: 'resolution',
      label: 'Resolution',
      value: `${metadata.width}\u00d7${metadata.height}`,
    })
  }
  // Particle count — only when present.
  if (Number.isFinite(metadata.particleCount) && metadata.particleCount > 0) {
    out.push({
      key: 'particleCount',
      label: 'Particles',
      value: metadata.particleCount.toLocaleString(),
    })
  }
  // Capture time — only when present.
  if (Number.isFinite(metadata.captureMs) && metadata.captureMs >= 0) {
    out.push({
      key: 'captureMs',
      label: 'Render time',
      value: metadata.captureMs < 1000
        ? `${metadata.captureMs} ms`
        : `${(metadata.captureMs / 1000).toFixed(2)} s`,
    })
  }
  // Approximate byte size — only when present.
  if (Number.isFinite(metadata.byteSize) && metadata.byteSize >= 0) {
    const sizeStr = formatByteSize(metadata.byteSize)
    if (sizeStr) {
      out.push({ key: 'byteSize', label: 'Size', value: sizeStr })
    }
  }
  // R22.29 — user-authored note (free-form text). Tag the row with
  // kind:'note' so the UI can paint it differently (italics / muted
  // accent / multi-line wrap) — telemetry rows above use the default
  // mono-key/value layout. Only emitted when a non-empty note exists.
  if (typeof metadata.note === 'string' && metadata.note.trim()) {
    out.push({
      key: 'note',
      label: 'Note',
      value: metadata.note.trim(),
      kind: 'note',
    })
  }
  return out
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
//
// R19.13 — also records side-store metadata (capturedAt + width +
// height + source) under the parallel `preset-thumb-meta-<id>` key
// so the carousel hover badge can show when + how big + by what
// path each thumb was minted.
export function captureThumbnailToStorage(preset, opts = {}) {
  if (typeof document === 'undefined') return false
  const storage = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!storage) return false
  if (!preset || typeof preset.id !== 'string' || typeof preset.code !== 'string') return false
  try {
    const canvas = document.createElement('canvas')
    const w = opts.width  || THUMB_WIDTH
    const h = opts.height || THUMB_HEIGHT
    canvas.width  = w
    canvas.height = h
    if (!renderThumbnailToCanvas(preset.code, canvas, opts)) return false
    const url = canvas.toDataURL('image/jpeg', opts.quality || THUMB_JPEG_QUALITY)
    storage.setItem(thumbStorageKey(preset.id), url)
    // R19.13 — record metadata alongside the data URL. Failures are
    // swallowed (the thumb itself succeeded; missing metadata just
    // means the hover badge skips this entry, not a broken thumb).
    recordThumbMetadata(preset.id, { width: w, height: h, source: opts.source || 'render' }, storage)
    return true
  } catch { return false }
}

// Wipe the cached thumbnail for one preset id. Returns true if the
// entry existed and was removed; false if there was nothing to remove
// (or storage isn't available). Used by the carousel's "rebuild this
// thumb" action so the prerenderer / live capture path treats the
// preset as missing on the next pass.
//
// R19.13 — also clears the side-store metadata so a stale "captured
// 3 days ago" badge doesn't outlive its thumb.
export function clearThumbnail(presetId, storage) {
  if (typeof presetId !== 'string' || !presetId) return false
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  const key = thumbStorageKey(presetId)
  try {
    const had = store.getItem(key) != null
    if (!had) return false
    store.removeItem(key)
    // Best-effort metadata cleanup. The thumb removal is the source
    // of truth for "cleared" — a missing or stuck metadata entry
    // doesn't change that, so we ignore its return value.
    clearThumbMetadata(presetId, store)
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
// R19.13 — also wipes the parallel metadata entries so stale "captured
// 3d ago" badges don't outlive their thumbs after a bulk clear.
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
      // R19.13 — best-effort metadata sweep alongside the thumb removal.
      clearThumbMetadata(p.id, store)
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
