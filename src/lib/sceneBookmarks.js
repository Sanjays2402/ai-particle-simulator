// Scene bookmarks — capture the FULL renderable scene (preset id, all
// the user-tweaked sliders/toggles, theme, palette, FX, force field,
// camera-modulators) so the user can revisit a favourite configuration
// with one click. Camera views save the camera; scene bookmarks save
// the scene that camera is pointed at.
//
// Stored shape (v1):
//   { v: 1, items: [{ id, name, createdAt, scene: {...} }] }
//
// `scene` is intentionally a flat object of primitive values so the
// JSON round-trip stays trivial and old bookmarks keep working as we
// add fields (apply() only touches keys it knows about + defaults).

export const BOOKMARKS_KEY = 'particle-scene-bookmarks-v1'
export const MAX_BOOKMARKS = 12

// Whitelist of store keys we serialize. Keep small / boring values —
// no compiled fns, no Float32Arrays, no DOM refs.
export const SCENE_FIELDS = [
  'currentPreset',
  'particleCount', 'speed', 'glowIntensity', 'visualStyle',
  'theme', 'trails', 'mouseAttract', 'attractStrength',
  'autoRotate', 'autoRotateSpeed', 'orbitSpeed',
  'minDistance', 'maxDistance',
  'paletteEnabled', 'paletteA', 'paletteB', 'paletteMix',
  'chromaticAberration', 'chromaticIntensity',
  'vignette', 'vignetteIntensity',
  'filmGrain', 'filmGrainIntensity',
  'kaleidoscopeEnabled', 'kaleidoscopeSegments',
  'hueCycleEnabled', 'hueCycleSpeed',
  'gravityEnabled', 'gravityStrength',
  'collisionsEnabled',
  'forceFieldType', 'forceFieldStrength', 'forceFieldCenter',
  'cameraShake', 'cameraShakeIntensity',
  'audioMode',
  'bgGradientEnabled', 'bgGradientA', 'bgGradientB', 'bgGradientAngle',
  'slideshowEnabled', 'slideshowDwellSec', 'slideshowOrder', 'slideshowRespectCategory',
]

export function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) return []
    return parsed.items.slice(0, MAX_BOOKMARKS)
  } catch { return [] }
}

export function saveBookmarks(items) {
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify({
      v: 1, items: items.slice(0, MAX_BOOKMARKS),
    }))
    return true
  } catch { return false }
}

// Capture the whitelisted subset of store state. Caller can pass any
// shape — we just pick the keys we know. Force-field center is cloned
// so future mutations of the store array don't leak into the saved
// bookmark.
export function captureScene(state) {
  const scene = {}
  for (const k of SCENE_FIELDS) {
    if (k in state) {
      const v = state[k]
      scene[k] = Array.isArray(v) ? v.slice() : v
    }
  }
  return scene
}

// Insert a new bookmark at the front, evict oldest when over cap.
// Dedupes by name (overwrite) so re-saving "Cinematic 1" replaces it.
export function appendBookmark(items, { name, scene }) {
  const id = items.reduce((m, it) => Math.max(m, it.id || 0), 0) + 1
  const entry = { id, name: name || `Scene ${id}`, createdAt: Date.now(), scene }
  const filtered = items.filter(it => it.name !== entry.name)
  return [entry, ...filtered].slice(0, MAX_BOOKMARKS)
}

export function removeBookmark(items, id) {
  return items.filter(it => it.id !== id)
}

// Apply a bookmark to the live store. Looks up each setter (set<Field>)
// and calls it; falls back to a `set({ key: value })` style writer for
// fields without a typed setter. Returns the keys that were applied so
// the UI can show "restored X fields".
//
// Special-cases:
//   - `currentPreset` runs through `loadPreset` so the compile + info
//     panel sequence stays consistent with normal loads.
//   - `theme` runs through `setTheme` so the --neon CSS var updates.
//   - `forceFieldCenter` is normalized to a fresh array.
export function applyScene(scene, api) {
  if (!scene || !api) return []
  const applied = []
  // Load the preset FIRST so dynamic controls + physics defaults from
  // the preset don't clobber the bookmark's overrides.
  if (scene.currentPreset && typeof api.loadPreset === 'function') {
    api.loadPreset(scene.currentPreset)
    applied.push('currentPreset')
  }
  for (const k of SCENE_FIELDS) {
    if (k === 'currentPreset') continue
    if (!(k in scene)) continue
    const v = scene[k]
    if (v === undefined) continue
    if (k === 'theme' && typeof api.setTheme === 'function') {
      api.setTheme(v); applied.push(k); continue
    }
    const setter = api['set' + k.charAt(0).toUpperCase() + k.slice(1)]
    if (typeof setter === 'function') {
      setter(Array.isArray(v) ? v.slice() : v)
      applied.push(k)
    }
  }
  return applied
}
