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

export const CAMERA_VIEWS_MAX = MAX
