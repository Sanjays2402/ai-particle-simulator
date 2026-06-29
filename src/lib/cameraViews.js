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

// --- R40.H: duplicate ALL saved views --------------------------------
//
// R39.H clones a SINGLE view. This forks the WHOLE set in one action:
// every angle-bearing view gets a "<name> copy" clone, so a user can
// fork an entire framing collection before a round of edits without
// duplicating each one by hand.
//
// The clones are minted with fresh monotonic ids and PREPENDED as a block
// (newest-first, like duplicateView), preserving the source order WITHIN
// the cloned block so "A, B, C" duplicates to "A copy, B copy, C copy, A,
// B, C" (then trimmed to MAX, oldest-falling-off). Position-corrupt views
// are skipped (a clone with no angle to restore is useless), matching
// duplicateView's per-view contract.
//
// Contract:
//   - non-array views → [] (nothing to clone)
//   - no cloneable (angle-bearing) view present → input ref unchanged
//     (ref-equal-on-no-op so persistence can skip a redundant save)
//   - each clone deep-copies pos/target so editing a copy can't mutate
//     the original's coordinate arrays
//   - the whole result is capped at MAX (the freshest clones win; the
//     oldest originals fall off the tail first)
//   - input array + every source view's arrays never mutated
export function duplicateAllViews(views, nameFor) {
  if (!Array.isArray(views)) return []
  // Find the cloneable (angle-bearing) views, preserving order.
  const cloneable = views.filter(v =>
    v && typeof v === 'object' &&
    v.id !== null && v.id !== undefined &&
    Array.isArray(v.pos) && v.pos.length >= 3 &&
    v.pos.every(n => Number.isFinite(Number(n))),
  )
  if (cloneable.length === 0) return views // nothing to clone → ref-equal
  let nextId = (views.reduce((m, v) => Math.max(m, (v && v.id) || 0), 0)) + 1
  const now = Date.now()
  const clones = cloneable.map(src => {
    const baseName = (typeof src.name === 'string' && src.name.trim()) ? src.name.trim() : `View ${src.id}`
    const name = (typeof nameFor === 'function' ? nameFor(src) : null) || `${baseName} copy`
    const clone = {
      id: nextId,
      name,
      pos: src.pos.slice(),
      target: Array.isArray(src.target) ? src.target.slice() : src.target,
      createdAt: now,
    }
    nextId += 1
    return clone
  })
  return [...clones, ...views].slice(0, MAX)
}

// --- R41.H: duplicate a SELECTED subset of views ----------------------
//
// R39.H clones ONE view; R40.H clones ALL views. This is the middle
// ground: clone just the views the user multi-selected, so they can fork
// a chosen handful (e.g. three framings they're about to A/B) without
// duplicating the whole set. Like duplicateAllViews, the selected clones
// are minted with fresh monotonic ids, PREPENDED as a block in the
// source order, "<name> copy"-named, and the whole result capped at MAX.
//
// `idSet` accepts a Set, an array, or any iterable of ids (mirrors
// removeAttractors / removeSnapshots' input contract). Only views whose
// id is in the set AND that carry a restorable angle are cloned;
// position-corrupt selected views are skipped (a clone with no angle is
// useless, same bar as duplicateView).
//
// Contract:
//   - non-array views → [] (nothing to clone into)
//   - empty / non-iterable idSet, or no selected view is cloneable →
//     input ref unchanged (ref-equal-on-no-op so persistence can skip a
//     redundant save)
//   - each clone deep-copies pos/target so editing a copy can't mutate
//     the original's coordinate arrays
//   - selection order follows the views' array order (not the order ids
//     were added to the set) so the cloned block is stable
//   - capped at MAX (freshest clones win; oldest originals fall off)
//   - input array + every source view's arrays never mutated
export function duplicateViews(views, idSet, nameFor) {
  if (!Array.isArray(views)) return []
  // Normalise the id collection to a Set for O(1) membership; tolerate
  // Set | Array | iterable (incl. generators). A non-iterable → empty.
  let ids
  if (idSet instanceof Set) ids = idSet
  else if (idSet && typeof idSet[Symbol.iterator] === 'function') ids = new Set(idSet)
  else ids = new Set()
  if (ids.size === 0) return views // nothing selected → ref-equal
  // The selected, angle-bearing views in array order.
  const cloneable = views.filter(v =>
    v && typeof v === 'object' &&
    v.id !== null && v.id !== undefined &&
    ids.has(v.id) &&
    Array.isArray(v.pos) && v.pos.length >= 3 &&
    v.pos.every(n => Number.isFinite(Number(n))),
  )
  if (cloneable.length === 0) return views // none selected-and-cloneable
  let nextId = (views.reduce((m, v) => Math.max(m, (v && v.id) || 0), 0)) + 1
  const now = Date.now()
  const clones = cloneable.map(src => {
    const baseName = (typeof src.name === 'string' && src.name.trim()) ? src.name.trim() : `View ${src.id}`
    const name = (typeof nameFor === 'function' ? nameFor(src) : null) || `${baseName} copy`
    const clone = {
      id: nextId,
      name,
      pos: src.pos.slice(),
      target: Array.isArray(src.target) ? src.target.slice() : src.target,
      createdAt: now,
    }
    nextId += 1
    return clone
  })
  return [...clones, ...views].slice(0, MAX)
}

// Compute the inclusive id range between an anchor and a target id,
// given the ids in their DISPLAY order — the pure core of shift-click
// range-select. Returns the contiguous slice of ids from anchor..target
// (inclusive, in display order regardless of which came first), so a UI
// can union it into the live selection set.
//
// Contract:
//   - non-array orderedIds → [] (nothing to range over)
//   - anchor or target not present in the list → [target] when target is
//     present (a lone click extends to just the clicked row), else []
//     (both missing → nothing)
//   - anchor === target → [that id] (a single-row range)
//   - order-agnostic: selecting bottom-then-top yields the same slice as
//     top-then-bottom
//   - never mutates the input
export function selectIdRange(orderedIds, anchorId, targetId) {
  if (!Array.isArray(orderedIds)) return []
  const ai = orderedIds.indexOf(anchorId)
  const ti = orderedIds.indexOf(targetId)
  // Target must exist to range to it. If the anchor is gone (e.g. the
  // anchored row was deleted), fall back to selecting just the target.
  if (ti < 0) return []
  if (ai < 0) return [orderedIds[ti]]
  const lo = Math.min(ai, ti)
  const hi = Math.max(ai, ti)
  return orderedIds.slice(lo, hi + 1)
}

// --- R42.H: bulk-delete a SELECTED subset of views -------------------
//
// R41.H gave the command palette a checkbox multi-select that could
// DUPLICATE a chosen subset; this completes that bar's lifecycle with a
// matching bulk DELETE so a user can prune several saved views in one
// pass instead of deleting them one at a time. The pure core mirrors
// removeAttractors / removeSnapshots so the whole codebase shares one
// "remove a set of rows by id" contract.
//
// `idSet` accepts a Set, an array, or any iterable of ids. Every view
// whose id is in the set is dropped; everything else is kept in order.
//
// Contract:
//   - non-array views → [] (callers persist [])
//   - empty / non-iterable idSet → input ref unchanged AND no cleanup
//     needed (ref-equal-on-no-op so persistence can skip a redundant
//     save) — UNLESS a corrupt (null) row is present, which we always
//     drop (parallels removeView's "ref-equal only when nothing to
//     remove AND nothing to clean up" trade-off)
//   - a selected id that isn't present is a silent no-op for that id
//   - never mutates the input array
export function removeViews(views, idSet) {
  if (!Array.isArray(views)) return []
  let ids
  if (idSet instanceof Set) ids = idSet
  else if (idSet && typeof idSet[Symbol.iterator] === 'function') ids = new Set(idSet)
  else ids = new Set()
  let changed = false
  const next = []
  for (const v of views) {
    if (!v) { changed = true; continue }          // drop corrupt rows
    if (ids.has(v.id)) { changed = true; continue } // selected → remove
    next.push(v)
  }
  return changed ? next : views
}

// --- R43.H: select-all / clear header state --------------------------
//
// The R41.H/R42.H multi-select panel lets a user pick a subset of saved
// views to duplicate or delete. With several views, ticking each one by
// hand to act on "all but one" is tedious; this adds a header row with a
// single select-all toggle. These pure helpers own the toggle's tri-state
// (off / indeterminate / on) so the component stays a thin renderer and
// the boundary cases (empty list, stale ids in the set) are under test.
//
// `orderedIds` is the list of selectable view ids in display order;
// `selected` is a Set | Array | iterable of the currently-checked ids.
// We reconcile against orderedIds so a selection holding ids that have
// since vanished never over-counts.

// Normalise a selection collection (Set | Array | iterable) to a Set.
// Non-iterable → empty Set. Internal helper shared by the state queries.
function toIdSet(selected) {
  if (selected instanceof Set) return selected
  if (selected && typeof selected[Symbol.iterator] === 'function') return new Set(selected)
  return new Set()
}

// Count how many of `orderedIds` are present in the selection. Pure.
// Non-array orderedIds → 0.
export function countSelected(orderedIds, selected) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return 0
  const ids = toIdSet(selected)
  if (ids.size === 0) return 0
  let n = 0
  for (const id of orderedIds) if (ids.has(id)) n++
  return n
}

// True when EVERY selectable id is selected (and there's at least one to
// select — an empty list is "not all selected" so the toggle reads off).
// Pure.
export function allIdsSelected(orderedIds, selected) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return false
  return countSelected(orderedIds, selected) === orderedIds.length
}

// True when SOME but not all selectable ids are selected — the
// indeterminate ("-") state for the header toggle. Pure.
export function someIdsSelected(orderedIds, selected) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return false
  const n = countSelected(orderedIds, selected)
  return n > 0 && n < orderedIds.length
}

// The set the selection becomes when the header toggle is clicked: if
// every selectable id is already selected, CLEAR (return an empty Set);
// otherwise SELECT ALL (return a Set of every selectable id). The
// "partial → select all" rule matches the familiar mail-client header
// checkbox, where a half-filled box fills the rest rather than clearing.
// Returns a fresh Set; never mutates inputs. Pure.
export function toggleSelectAll(orderedIds, selected) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return new Set()
  if (allIdsSelected(orderedIds, selected)) return new Set()
  return new Set(orderedIds)
}

// --- R44.H: invert selection -----------------------------------------
//
// The R43.H header gives select-all / clear. Inverting is the natural
// companion: a user who wants "all but these three" ticks the three then
// inverts, instead of ticking all the rest by hand. This returns a fresh
// Set holding exactly the selectable ids that are NOT currently selected
// (reconciled against orderedIds so a stale id in the incoming set neither
// survives nor blocks a valid id from flipping in). Pure; never mutates.
//   - empty / non-array orderedIds → empty Set
//   - none selected → all selected (equivalent to select-all)
//   - all selected → none selected (equivalent to clear)
export function invertSelection(orderedIds, selected) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return new Set()
  const ids = toIdSet(selected)
  const next = new Set()
  for (const id of orderedIds) {
    if (!ids.has(id)) next.add(id)
  }
  return next
}

// --- R45.H: header "select range" two-click mode ---------------------
//
// R44.H added invert; shift-click range-select (selectIdRange) already
// exists but needs a held modifier — awkward on touch and not obvious. A
// header "Range" button arms an explicit two-click mode: the FIRST row
// clicked sets the range anchor; the SECOND row clicked selects the whole
// contiguous block between them (unioned into the live selection) and
// disarms. This is the pure state machine that drives that mode so the
// component stays a thin renderer and the (anchor-armed vs not, stale
// anchor, same-row) cases are under test.
//
// `pendingAnchorId` is the currently-armed anchor (or null when nothing
// is armed yet — the first click of the pair). `clickedId` is the row the
// user just clicked. `orderedIds` is the selectable ids in display order.
// `selected` is the live selection (Set | Array | iterable).
//
// Returns { selected, pendingAnchorId, completed }:
//   - first click (no anchor armed): arms `clickedId` as the anchor,
//     leaves `selected` unchanged (a fresh Set copy), completed=false
//   - second click (anchor armed): unions the inclusive anchor..clicked
//     range (via selectIdRange) into `selected`, clears the anchor,
//     completed=true — even when the anchor row was clicked again (a
//     single-row "range" selects just that row)
//   - a stale armed anchor no longer in orderedIds falls back to arming
//     the new click as a fresh anchor (so a deleted anchor can't strand
//     the mode), completed=false
// Pure; never mutates inputs (always returns a fresh Set).
export function rangeClick(orderedIds, pendingAnchorId, clickedId, selected) {
  const base = toIdSet(selected)
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    // Nothing selectable — disarm and pass the selection through.
    return { selected: new Set(base), pendingAnchorId: null, completed: false }
  }
  // The clicked row must be a real selectable id; ignore stray clicks.
  if (orderedIds.indexOf(clickedId) < 0) {
    return { selected: new Set(base), pendingAnchorId: pendingAnchorId ?? null, completed: false }
  }
  const anchorArmed = pendingAnchorId !== null && pendingAnchorId !== undefined
    && orderedIds.indexOf(pendingAnchorId) >= 0
  if (!anchorArmed) {
    // First click of the pair (or a stale anchor) → arm this row.
    return { selected: new Set(base), pendingAnchorId: clickedId, completed: false }
  }
  // Second click → union the inclusive range into the selection, disarm.
  const range = selectIdRange(orderedIds, pendingAnchorId, clickedId)
  const next = new Set(base)
  for (const id of range) next.add(id)
  return { selected: next, pendingAnchorId: null, completed: true }
}

// --- R46.H: arm the range anchor from a specific row -----------------
//
// R45.H's two-click Range mode is armed from a HEADER toggle, then the
// first row click sets the anchor. R46.H lets a user arm the anchor
// DIRECTLY on a row (via right-click / long-press) so they can say "range
// FROM HERE" without first reaching for the header — then a normal click
// on a later row completes the block (the existing rangeClick path picks
// it up because the anchor is already armed).
//
// This validates that `rowId` is a real selectable id and returns it as
// the new pending anchor, or null when the row isn't selectable (stray
// id, empty roster) so the caller can ignore the gesture. Pure; the
// caller flips its Range mode on + stashes this as the pending anchor.
export function armRangeAnchor(orderedIds, rowId) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return null
  return orderedIds.indexOf(rowId) >= 0 ? rowId : null
}

// --- R47.H: preview the pending range block before the completing click -
//
// R46.H arms a range anchor; the next click completes the block via
// rangeClick. Between arm + complete the user has no preview of WHICH
// rows the block will cover — they have to trust the two endpoints. R47.H
// previews the pending block: as the pointer hovers a row, the rows from
// the armed anchor down to the hovered one light up (a faint connector)
// so the selection is seen before it's committed. This returns a Set of
// the inclusive anchor..hovered ids (for O(1) per-row membership in the
// render), built on selectIdRange so the preview matches what rangeClick
// will actually select. Empty Set when no anchor is armed, no row is
// hovered, or either id isn't selectable. Pure; never mutates.
export function rangePreviewSet(orderedIds, anchorId, hoverId) {
  if (anchorId == null || hoverId == null) return new Set()
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return new Set()
  if (orderedIds.indexOf(anchorId) < 0 || orderedIds.indexOf(hoverId) < 0) return new Set()
  return new Set(selectIdRange(orderedIds, anchorId, hoverId))
}

// --- R48.H: how many rows the pending range covers --------------------
//
// R47.H lights up the anchor..hover block, but the user still has to
// count rows to know how big the selection will be — fine for 3, awkward
// for 20. R48.H surfaces the block SIZE so a "N rows" chip can ride the
// hovered row: glance, read, commit. Built straight on rangePreviewSet so
// the count can never disagree with the highlighted block (a sub-1 count
// means no real preview → 0). Pure.
export function rangePreviewCount(orderedIds, anchorId, hoverId) {
  return rangePreviewSet(orderedIds, anchorId, hoverId).size
}

// --- R49.H: range-block size tier so a big destructive range reads loud ----
//
// R48.H surfaces the count; R49.H grades it. A 3-row range is routine and the
// chip stays indigo, but a 10+ row range is a meaningful prune (the panel
// fronts a multi-select DELETE, not just Duplicate) so the chip flips amber to
// warn before the commit click — parallels biasOverridesIO's import-impact
// tiers. Threshold exposed so the chip + tooltip can quote it. Defensive:
// non-finite / negative → 'normal'. Pure.
export const RANGE_PREVIEW_LARGE_AT = 10
export function rangePreviewTier(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < RANGE_PREVIEW_LARGE_AT) return 'normal'
  return 'large'
}

