// Snapshot Gallery grid + lightbox helpers. Pure functions extracted
// so the React component stays focused on rendering, and the math is
// covered by unit tests.
//
// gridLayout(n)
//   Decides the column count for the grid view given the number of
//   snapshots. Caps at 4 columns to keep tiles big enough to recognise
//   at a glance — the gallery itself caps at 8 entries so 2×4 is the
//   worst case.
//
// lightboxNav(items, currentId, dir)
//   Returns the next/previous snapshot id when the user presses an
//   arrow key. Wraps both ways; tolerates missing currentId (falls back
//   to the first / last item).
//
// formatDimensions(w, h)
//   "{w} × {h}" with thin-space separator — used in the lightbox HUD.

export const GRID_MAX_COLS = 4

export function gridLayout(count) {
  if (!Number.isFinite(count) || count <= 0) return { cols: 0, rows: 0 }
  // 1 → 1 col; 2 → 2 cols; 3 → 3 cols; 4+ → 4 cols.
  const cols = Math.min(GRID_MAX_COLS, count)
  const rows = Math.ceil(count / cols)
  return { cols, rows }
}

// Step through the snapshot list. dir = +1 → next, -1 → prev. Wraps.
// Returns the id of the new selection or null when the list is empty.
export function lightboxNav(items, currentId, dir) {
  if (!Array.isArray(items) || items.length === 0) return null
  if (items.length === 1) return items[0].id
  const step = dir > 0 ? 1 : -1
  const idx = items.findIndex(it => it.id === currentId)
  // currentId not found → start at the beginning or the end based on direction.
  if (idx < 0) return step > 0 ? items[0].id : items[items.length - 1].id
  const next = (idx + step + items.length) % items.length
  return items[next].id
}

// Find a snapshot by id; null if not found / list empty. Tiny but kept
// here so callers don't reach into items.find from multiple places.
export function findSnapshot(items, id) {
  if (!Array.isArray(items)) return null
  return items.find(it => it.id === id) || null
}

export function formatDimensions(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h)) return ''
  return `${w}\u202f\u00d7\u202f${h}`
}
