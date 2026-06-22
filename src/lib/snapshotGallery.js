// Snapshot gallery store: stash the last N PNG snapshots the user has
// taken in localStorage so they can revisit / re-download / share
// without re-snapping. Each entry holds a downscaled JPEG thumbnail
// (for fast rendering) plus the full-quality PNG data URL (for the
// re-download button).
//
// Hard cap on count + size so we don't blow past the 5MB origin quota:
//   - MAX_SNAPSHOTS entries, oldest evicted first
//   - thumbnail capped at THUMB_W × THUMB_H, JPEG quality 0.6
//   - PNG truncated to MAX_PNG_BYTES (skipped if larger — gallery
//     entry still records the thumbnail so the snapshot is visible)
//
// Stored shape (v1):
//   { v: 1, items: [{ id, createdAt, thumb, png, w, h, label }] }

export const SNAPSHOTS_KEY = 'particle-snapshot-gallery-v1'
export const MAX_SNAPSHOTS = 8
export const THUMB_W = 200
export const THUMB_H = 130
// 1.5MB cap per PNG so 8 entries can't blow the localStorage budget.
export const MAX_PNG_BYTES = 1_500_000

export function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) return []
    return parsed.items.slice(0, MAX_SNAPSHOTS)
  } catch { return [] }
}

export function saveSnapshots(items) {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify({ v: 1, items: items.slice(0, MAX_SNAPSHOTS) }))
    return true
  } catch {
    // Quota exceeded → trim aggressively and retry once with just the
    // thumbs (drop full PNGs). Better to keep the visual record than
    // to throw the whole batch away.
    try {
      const trimmed = items.slice(0, MAX_SNAPSHOTS).map(it => ({ ...it, png: null }))
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify({ v: 1, items: trimmed }))
      return true
    } catch { return false }
  }
}

// Add a new snapshot at the front, evict oldest when over cap.
export function appendSnapshot(items, entry) {
  const id = (items.reduce((m, v) => Math.max(m, v.id || 0), 0)) + 1
  const e = { id, createdAt: Date.now(), ...entry }
  return [e, ...items].slice(0, MAX_SNAPSHOTS)
}

export function removeSnapshot(items, id) {
  return items.filter(s => s.id !== id)
}

// R18.06 — bulk remove by id set. Used by the grid view's long-press
// multi-select bulk-delete UX so users can wipe several snapshots in
// one operation. Pure: returns the input ref unchanged when nothing
// in `idSet` actually existed in the list (so React/zustand can skip
// the redundant write). `idSet` may be a Set, an array, or any
// iterable; non-iterables return the input ref. Mirrors the
// removeAttractors contract (R17.17) for cross-app consistency.
export function removeSnapshots(items, idSet) {
  if (!Array.isArray(items)) return []
  if (!idSet) return items
  let ids
  if (idSet instanceof Set) {
    ids = idSet
  } else if (typeof idSet[Symbol.iterator] === 'function') {
    ids = new Set(idSet)
  } else {
    return items
  }
  if (ids.size === 0) return items
  let changed = false
  const next = []
  for (const s of items) {
    if (!s) { changed = true; continue }
    if (ids.has(s.id)) { changed = true; continue }
    next.push(s)
  }
  return changed ? next : items
}

// Capture a snapshot from the live canvas — returns { thumb, png, w, h }
// suitable for appendSnapshot. Done as a separate function so the UI
// hook stays compact and the math is unit-testable via the helpers
// above (this fn touches DOM, so the unit test exercises a stub).
export function captureFromCanvas(canvas) {
  if (!canvas) return null
  const png = canvas.toDataURL('image/png')
  const pngBytes = Math.ceil(png.length * 0.75) // base64 -> bytes
  const tmp = document.createElement('canvas')
  tmp.width = THUMB_W
  tmp.height = THUMB_H
  const ctx = tmp.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(canvas, 0, 0, THUMB_W, THUMB_H)
  const thumb = tmp.toDataURL('image/jpeg', 0.6)
  return {
    thumb,
    png: pngBytes > MAX_PNG_BYTES ? null : png,
    w: canvas.width,
    h: canvas.height,
  }
}

// Trigger a browser download for a saved entry. Falls back to the
// thumbnail if the full PNG was dropped due to quota.
export function downloadSnapshot(entry, baseName = 'particle-snapshot') {
  const dataUrl = entry.png || entry.thumb
  if (!dataUrl) return false
  const a = document.createElement('a')
  a.href = dataUrl
  const ts = new Date(entry.createdAt || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const label = (entry.label || baseName).replace(/\s+/g, '-').toLowerCase()
  const ext = entry.png ? 'png' : 'jpg'
  a.download = `${label}-${ts}.${ext}`
  a.click()
  return true
}
