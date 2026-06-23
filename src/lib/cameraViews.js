// Tiny camera-view store. Saves up to 6 named camera positions in
// localStorage so a refresh keeps them around. Stored shape:
//   [{ id, name, pos: [x,y,z], target: [x,y,z], createdAt }]
// The `id` is monotonically increasing so React keys stay stable.
const KEY = 'particle-camera-views-v1'
const MAX = 6

export function loadCameraViews() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.slice(0, MAX) : []
  } catch { return [] }
}

export function saveCameraViews(views) {
  try {
    localStorage.setItem(KEY, JSON.stringify(views.slice(0, MAX)))
  } catch { /* quota / private mode */ }
}

// Insert a new view at the front; oldest one falls off when we exceed MAX.
// Returns the new array; caller is responsible for persisting + setting state.
export function appendView(views, { name, pos, target }) {
  const id = (views.reduce((m, v) => Math.max(m, v.id || 0), 0)) + 1
  const next = [
    { id, name: name || `View ${id}`, pos, target, createdAt: Date.now() },
    ...views.filter(v => v.name !== name), // dedupe by name to allow overwrite
  ]
  return next.slice(0, MAX)
}

// Reorder helpers — the Camera Path Player walks `views` in array order,
// so changing the array changes the path. Returns a fresh array (never
// mutates the input) so React state updates stay clean. Out-of-range
// or no-op moves return the input unchanged so callers can compare by
// reference to detect "nothing happened".

export function moveView(views, fromIdx, toIdx) {
  if (!Array.isArray(views)) return views
  const n = views.length
  if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return views
  if (fromIdx < 0 || fromIdx >= n) return views
  if (toIdx < 0 || toIdx >= n) return views
  if (fromIdx === toIdx) return views
  const next = views.slice()
  const [picked] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, picked)
  return next
}

export function moveViewUp(views, idx) {
  return moveView(views, idx, idx - 1)
}

export function moveViewDown(views, idx) {
  return moveView(views, idx, idx + 1)
}

// Remove a single view by id. Returns the same array reference when
// the id isn't present so callers can compare-by-reference to skip
// a redundant save. Tolerates non-array input (returns empty) and
// nullish id (returns unchanged) so the minimap's Shift+click path
// can't accidentally wipe the list on a stale event. Drops any
// nullish entry it encounters as a side-effect — keeping corrupt
// rows around just to honour the "ref-equal on no-op" contract
// would be the wrong trade-off, so the contract is: ref-equal only
// when there's nothing to remove AND nothing to clean up.
export function removeView(views, id) {
  if (!Array.isArray(views)) return []
  if (id === null || id === undefined) return views
  let changed = false
  const next = []
  for (const v of views) {
    if (!v) { changed = true; continue }  // drop corrupt rows
    if (v.id === id) { changed = true; continue }
    next.push(v)
  }
  return changed ? next : views
}

export const CAMERA_VIEWS_MAX = MAX

// R22.12 — pure helper for touch-drag reorder: given a touch Y
// coordinate (in viewport coords) and an array of per-row Y-RANGES
// (each item is { top, bottom } in matching viewport coords),
// return the index of the row the touch is over, or null when the
// touch is outside every row's vertical range.
//
// Why pure / lib-level: HTML5 native drag-and-drop (used by R17.07
// for desktop) doesn't fire on touch devices — touch users need a
// long-press-to-grab-then-drag gesture wired through pointer/touch
// events. The hit-test math is small but easy to fence-post wrong
// (off-by-one at exact row boundary, NaN-fallback semantics, empty
// range list = null vs idx=0), so it lives here with explicit
// regression tests rather than embedded in the component.
//
// Contract:
//   - Empty / non-array ranges → null (caller should skip the move).
//   - Non-finite y → null.
//   - y above the first row's top → 0 (snap-to-first so a drag
//     that overshoots upward still gives the user a target). This
//     matches HTML5 native drag-and-drop "drop near the top edge"
//     behaviour where the first row claims overflow.
//   - y below the last row's bottom → ranges.length - 1 (mirror of
//     above).
//   - y inside a row's [top, bottom) range → that row's idx.
//   - Half-open at the bottom edge so two adjacent rows whose
//     bottom/top values are equal don't both claim the boundary
//     pixel (else a touch at exactly Y=row1.bottom===row2.top would
//     hit row1 and row2; pick the lower row consistently).
//   - Range items with non-finite top/bottom skip silently — we
//     don't reject the whole list since a transient layout glitch
//     during drag shouldn't lose the user's gesture entirely.
export function resolveTouchTargetIdx(y, ranges) {
  if (!Number.isFinite(y)) return null
  if (!Array.isArray(ranges) || ranges.length === 0) return null
  // Find the first valid range to use as our overflow baseline.
  let firstValid = -1
  let lastValid = -1
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (r && Number.isFinite(r.top) && Number.isFinite(r.bottom)) {
      if (firstValid === -1) firstValid = i
      lastValid = i
    }
  }
  if (firstValid === -1) return null
  // Overflow above → snap to first valid row.
  if (y < ranges[firstValid].top) return firstValid
  // Overflow below → snap to last valid row.
  if (y >= ranges[lastValid].bottom) return lastValid
  // In-range scan. Half-open intervals [top, bottom).
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (!r || !Number.isFinite(r.top) || !Number.isFinite(r.bottom)) continue
    if (y >= r.top && y < r.bottom) return i
  }
  // Should be unreachable given the overflow guards, but a malformed
  // range list (e.g. all rows have top===bottom) lands here. Return
  // the last valid index so the caller still has SOMETHING to act on.
  return lastValid
}
