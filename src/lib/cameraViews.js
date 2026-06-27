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

// R28.20 — Touch hit-test that distinguishes GAP-DROP targets from
// ROW-DROP targets. Graduates resolveTouchTargetIdx (R22.12) with
// gap-zone awareness for explicit "insert here" semantics.
//
// Returns one of:
//   - { kind: 'gap', gapIdx: i }   — touch is over the gap ABOVE row i
//                                     (or the TRAILING gap when gapIdx === ranges.length)
//   - { kind: 'row', idx: i }      — touch is over row i (use existing
//                                     reorder-onto-row semantics)
//   - null                          — no valid target (non-finite y,
//                                     empty ranges, etc.)
//
// Gap-zone detection uses a tolerance band of TOUCH_GAP_TOLERANCE_PX
// (default 12px) around row boundaries:
//   - Gap above row[0]: y < firstValidTop (no overflow snap; gap 0 is
//     the explicit gap-above-first-row drop zone).
//   - Gap above row[i] (for i > 0): y is within tolerance of the
//     boundary between row[i-1].bottom and row[i].top. The boundary
//     band straddles BOTH rows: [boundary - tolerance, boundary + tolerance]
//     where boundary = (row[i-1].bottom + row[i].top) / 2 — the
//     midpoint between adjacent rows. Catches both small gaps
//     (rows nearly touching) and large gaps (rows with explicit
//     padding between them) symmetrically.
//   - Trailing gap (gapIdx === ranges.length): y > lastValid.bottom +
//     tolerance. The trailing zone gets DOUBLE tolerance below the
//     last row's bottom so a user trying to drop "at the end" doesn't
//     have to land on a pixel-precise margin. Past that, no target
//     (overflow far below should be no-op, not "drop at end").
//
// When the touch is NOT in a gap band, falls through to row hit-test
// via the same logic as resolveTouchTargetIdx.
//
// Defensive: same matrix as resolveTouchTargetIdx (non-finite y,
// empty / corrupt ranges → null). Tolerance arg validated; non-finite
// / negative falls back to default. Pure / no mutation.
export const TOUCH_GAP_TOLERANCE_PX = 12

export function resolveTouchTargetWithGaps(y, ranges, opts) {
  if (!Number.isFinite(y)) return null
  if (!Array.isArray(ranges) || ranges.length === 0) return null
  const tolerance = (opts && Number.isFinite(opts.tolerancePx) && opts.tolerancePx >= 0)
    ? opts.tolerancePx
    : TOUCH_GAP_TOLERANCE_PX
  // Find valid range bounds (mirrors resolveTouchTargetIdx).
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

  // Gap above row 0 (firstValid): y BELOW firstValid.top is the
  // explicit "insert at top" gap zone. Includes overflow above.
  if (y < ranges[firstValid].top) {
    return { kind: 'gap', gapIdx: firstValid }
  }

  // Trailing gap: y past lastValid.bottom (within DOUBLE tolerance for
  // a generous landing zone — matches the desktop drop zone which has
  // a larger trailing strip than between-rows gaps). Past 2*tolerance,
  // the touch overflows so far below the list that the user probably
  // means "abort" — return null (resolveTouchTargetIdx would snap to
  // the last row but for GAP-AWARE hit-testing we want a tighter
  // contract).
  if (y >= ranges[lastValid].bottom) {
    if (y < ranges[lastValid].bottom + tolerance * 2) {
      // Trailing gap index is one past the last valid row's index
      // (ranges.length when every row is valid; lastValid + 1
      // otherwise — same as the desktop trailing zone semantic).
      return { kind: 'gap', gapIdx: lastValid + 1 }
    }
    // Beyond trailing tolerance → snap to last row (consistent with
    // resolveTouchTargetIdx's overflow semantics for very-far-below).
    return { kind: 'row', idx: lastValid }
  }

  // In-range: scan gap bands BETWEEN consecutive valid rows FIRST so a
  // touch sitting at a row's edge resolves to the gap (insert-here
  // intent) instead of being claimed by the row hit-test. Build a
  // (prevValidIdx, validIdx) pair list, compute each pair's midpoint
  // boundary + tolerance band, then check the touch y against every
  // band. If no gap band matches, fall through to row hit-test.
  //
  // Why two passes: with a single pass, a touch at y=row[i-1].bottom +
  // small_offset still falls INSIDE row[i-1]'s bounds (since rows can
  // touch each other) and the loop's row-hit check would claim it
  // before the gap check on the next iteration. Pre-computing gap
  // bands and checking ALL of them first preserves the "gap takes
  // precedence at boundaries" contract regardless of row geometry.
  const validIdxs = []
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (r && Number.isFinite(r.top) && Number.isFinite(r.bottom)) validIdxs.push(i)
  }
  for (let p = 1; p < validIdxs.length; p++) {
    const prevValidIdx = validIdxs[p - 1]
    const currValidIdx = validIdxs[p]
    const boundary = (ranges[prevValidIdx].bottom + ranges[currValidIdx].top) / 2
    if (y >= boundary - tolerance && y < boundary + tolerance) {
      return { kind: 'gap', gapIdx: currValidIdx }
    }
  }
  // No gap band matched — fall back to row hit-test.
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i]
    if (!r || !Number.isFinite(r.top) || !Number.isFinite(r.bottom)) continue
    if (y >= r.top && y < r.bottom) {
      return { kind: 'row', idx: i }
    }
  }

  // Fallthrough: malformed ranges (e.g. all rows have top === bottom).
  // Mirror resolveTouchTargetIdx's safety net — return last valid as
  // a row drop.
  return { kind: 'row', idx: lastValid }
}

// --- R36.H: command-palette "Camera" actions -------------------------
//
// Surface the saved camera views as searchable command-palette actions
// (plus the static camera actions: enter zen mode, cycle the framing
// guide). The palette is the power-user's way to reach a saved view
// without opening the RightSidebar — type the view's name and hit Enter.
//
// This pure helper normalises the persisted views into a stable action
// list the palette can map directly:
//   { id, kind, label, sub, keywords, view }
// where `kind` is 'restore-view' (carries the `view` payload to hand to
// the camera API), and `keywords` is a search string the palette can
// match on. Static actions (zen / framing) are added by the component
// itself since they dispatch events rather than carry a payload — this
// helper owns only the dynamic, data-derived part so the view list stays
// the single thing under test.
//
// Defensive: non-array input → []; corrupt rows (missing id, or no
// usable pos/target) are skipped so a malformed localStorage blob can't
// inject a crash-on-restore action. Order is preserved (newest-first, as
// stored). `sub` is a compact, human "x, y, z" position so two similar
// view names can be told apart in the list.
export function buildCameraPaletteActions(views) {
  if (!Array.isArray(views)) return []
  const out = []
  for (const v of views) {
    if (!v || typeof v !== 'object') continue
    if (v.id === null || v.id === undefined) continue
    // A view is only actionable if it has a restorable camera position.
    if (!Array.isArray(v.pos) || v.pos.length < 3) continue
    if (!v.pos.every(n => Number.isFinite(Number(n)))) continue
    const name = (typeof v.name === 'string' && v.name.trim()) ? v.name.trim() : `View ${v.id}`
    const pos = v.pos.map(n => Math.round(Number(n) * 10) / 10)
    out.push({
      id: `cam-view-${v.id}`,
      kind: 'restore-view',
      label: name,
      sub: `${pos[0]}, ${pos[1]}, ${pos[2]}`,
      keywords: `camera view restore ${name}`.toLowerCase(),
      view: v,
    })
  }
  return out
}

// --- R37.H: command-palette saved-view DELETE actions ----------------
//
// R36.H surfaced RESTORE actions; this completes the saved-view
// lifecycle in the palette by building a parallel DELETE action per view
// (plus the component adds a static "Save current camera view"). Keeping
// the whole lifecycle in the palette means a power user never has to open
// the RightSidebar to manage views.
//
// Same defensive contract as buildCameraPaletteActions: non-array → [];
// rows missing a usable id are skipped (a deletable row must carry the id
// the remove call needs). A view with a corrupt position is still
// DELETABLE (unlike restore, which needs a valid pos) — in fact a
// position-corrupt view is exactly the kind a user wants to be able to
// purge from the palette — so we only require a present id here. Order
// preserved (newest-first, as stored).
export function buildCameraDeleteActions(views) {
  if (!Array.isArray(views)) return []
  const out = []
  for (const v of views) {
    if (!v || typeof v !== 'object') continue
    if (v.id === null || v.id === undefined) continue
    const name = (typeof v.name === 'string' && v.name.trim()) ? v.name.trim() : `View ${v.id}`
    out.push({
      id: `cam-del-${v.id}`,
      kind: 'delete-view',
      label: `Delete view: ${name}`,
      sub: 'Remove this saved camera view',
      keywords: `camera view delete remove ${name}`.toLowerCase(),
      viewId: v.id,
    })
  }
  return out
}

// --- R38.H: rename + clear-all saved views ---------------------------
//
// R37.H added save / restore / delete to the palette; this completes the
// lifecycle with RENAME (inline text entry) and CLEAR-ALL. `renameView`
// is the pure rename: set a view's name by id, with the same ref-equal-
// on-no-op contract the other mutators use so the persistence layer can
// skip a redundant save.
//
// Contract:
//   - non-array → [] (nothing to rename into; callers persist [])
//   - missing / nullish id, or id not present → input ref unchanged
//   - the new name is trimmed; a blank-after-trim name is REJECTED
//     (returns the input ref unchanged — a view must keep a usable
//     label, and the UI shows `View <id>` for empties anyway)
//   - renaming to the identical (trimmed) name is a no-op → ref unchanged
//   - only the matched row is replaced (fresh object); all others keep
//     their identity so React reconciliation stays cheap
//   - input array never mutated
export function renameView(views, id, newName) {
  if (!Array.isArray(views)) return []
  if (id === null || id === undefined) return views
  const trimmed = typeof newName === 'string' ? newName.trim() : ''
  if (!trimmed) return views // blank name rejected — keep the old label
  let changed = false
  const next = views.map(v => {
    if (!v || v.id !== id) return v
    if (v.name === trimmed) return v // identical → no-op for this row
    changed = true
    return { ...v, name: trimmed }
  })
  return changed ? next : views
}

// Build a parallel RENAME action per view for the palette. Carries the
// viewId + the current name (so the UI can seed the inline edit field).
// Same defensive contract as buildCameraDeleteActions: a position-corrupt
// view is still renameable (only a usable id is required). Order
// preserved (newest-first, as stored).
export function buildCameraRenameActions(views) {
  if (!Array.isArray(views)) return []
  const out = []
  for (const v of views) {
    if (!v || typeof v !== 'object') continue
    if (v.id === null || v.id === undefined) continue
    const name = (typeof v.name === 'string' && v.name.trim()) ? v.name.trim() : `View ${v.id}`
    out.push({
      id: `cam-ren-${v.id}`,
      kind: 'rename-view',
      label: `Rename view: ${name}`,
      sub: 'Give this saved camera view a new name',
      keywords: `camera view rename relabel ${name}`.toLowerCase(),
      viewId: v.id,
      currentName: name,
    })
  }
  return out
}

// --- R39.H: duplicate a saved view -----------------------------------
//
// R37.H/R38.H gave the palette save / restore / delete / rename / clear.
// This adds DUPLICATE: clone an existing view's camera angle as a NEW
// named view, so a user can base a tweak on an existing framing without
// re-aiming the camera from scratch. The clone gets a fresh id + a
// "<name> copy" label and is inserted at the FRONT (newest-first, like
// appendView), with the same MAX cap.
//
// `duplicateView` is the pure clone: find the source view by id, deep-
// copy its pos/target (so editing the copy can't mutate the original's
// arrays), give it a fresh monotonic id + a derived name, and prepend.
//
// Contract:
//   - non-array views → [] (nothing to clone into)
//   - missing / nullish id, or id not present → input ref unchanged
//     (ref-equal-on-no-op so persistence can skip a redundant save)
//   - a source view missing a usable pos is NOT cloneable (a duplicate
//     with no angle to restore is useless) → input ref unchanged
//   - the clone's name is `nameFor(source)` when provided, else
//     "<source name> copy"; collisions are fine (names aren't unique)
//   - inserted at the front, capped at MAX (oldest falls off)
//   - input array + the source view's arrays never mutated
export function duplicateView(views, id, nameFor) {
  if (!Array.isArray(views)) return []
  if (id === null || id === undefined) return views
  const src = views.find(v => v && typeof v === 'object' && v.id === id)
  if (!src) return views
  // A clone needs a restorable angle — same bar buildCameraPaletteActions
  // uses for a "restore" action.
  if (!Array.isArray(src.pos) || src.pos.length < 3) return views
  if (!src.pos.every(n => Number.isFinite(Number(n)))) return views
  const newId = (views.reduce((m, v) => Math.max(m, (v && v.id) || 0), 0)) + 1
  const baseName = (typeof src.name === 'string' && src.name.trim()) ? src.name.trim() : `View ${src.id}`
  const name = (typeof nameFor === 'function' ? nameFor(src) : null) || `${baseName} copy`
  const clone = {
    id: newId,
    name,
    // Deep-copy the coordinate arrays so the copy is fully independent.
    pos: src.pos.slice(),
    target: Array.isArray(src.target) ? src.target.slice() : src.target,
    createdAt: Date.now(),
  }
  return [clone, ...views].slice(0, MAX)
}

// Build a DUPLICATE action per view for the palette. Only views with a
// restorable angle are duplicable (a copy with no pos is useless), so
// this skips position-corrupt rows — unlike rename/delete, which surface
// them so a user can purge them. Carries the source viewId. Order
// preserved (newest-first, as stored).
export function buildCameraDuplicateActions(views) {
  if (!Array.isArray(views)) return []
  const out = []
  for (const v of views) {
    if (!v || typeof v !== 'object') continue
    if (v.id === null || v.id === undefined) continue
    if (!Array.isArray(v.pos) || v.pos.length < 3) continue
    if (!v.pos.every(n => Number.isFinite(Number(n)))) continue
    const name = (typeof v.name === 'string' && v.name.trim()) ? v.name.trim() : `View ${v.id}`
    out.push({
      id: `cam-dup-${v.id}`,
      kind: 'duplicate-view',
      label: `Duplicate view: ${name}`,
      sub: 'Clone this camera angle as a new view',
      keywords: `camera view duplicate clone copy ${name}`.toLowerCase(),
      viewId: v.id,
    })
  }
  return out
}

