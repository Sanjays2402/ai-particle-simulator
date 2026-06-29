// cameraViews utility tests — verify append behavior, dedup, max cap.
// Run via: node src/lib/cameraViews.test.mjs (uses an in-memory shim
// since cameraViews.js touches localStorage via the load/save fns).
import {
  appendView, moveView, moveViewUp, moveViewDown, removeView, CAMERA_VIEWS_MAX,
  // R22.12 — pure helper for touch-drag reorder (graduates R17.07 desktop-only)
  resolveTouchTargetIdx,
  // R28.20 — gap-aware touch hit-test (returns { kind, idx } discriminator)
  resolveTouchTargetWithGaps, TOUCH_GAP_TOLERANCE_PX,
  // R36.H — command-palette camera action builder
  buildCameraPaletteActions,
  // R37.H — command-palette saved-view DELETE action builder
  buildCameraDeleteActions,
  // R38.H — rename + clear-all saved views
  renameView, buildCameraRenameActions,
  // R39.H — duplicate a saved view
  duplicateView, buildCameraDuplicateActions,
  // R40.H — duplicate ALL saved views
  duplicateAllViews,
  // R41.H — duplicate a SELECTED subset + shift-click range helper
  duplicateViews, selectIdRange,
  // R42.H — bulk-delete a SELECTED subset
  removeViews,
  // R43.H — select-all / clear header state
  countSelected, allIdsSelected, someIdsSelected, toggleSelectAll,
  // R44.H — invert selection
  invertSelection,
  // R45.H — header two-click range mode
  rangeClick,
  // R46.H — arm the range anchor from a row
  armRangeAnchor,
  // R47.H — preview the pending range block
  rangePreviewSet, rangePreviewCount, rangePreviewTier, RANGE_PREVIEW_LARGE_AT, RANGE_PREVIEW_HUGE_AT, rangeTierStyle, rangeDeleteConfirmMessage,
  // R52.H — type-DELETE friction gate for a 30+ prune
  RANGE_TYPE_CONFIRM_AT, rangeNeedsTypeConfirm, matchesRangeConfirmPhrase, rangeTypeConfirmPrompt,
  // R53.H — live char-match progress for the inline type-DELETE gate
  RANGE_CONFIRM_PHRASE, rangeConfirmMatchProgress,
} from './cameraViews.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

function assertTrue(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
}

// 1. First append on empty list creates id 1.
{
  const out = appendView([], { name: 'a', pos: [1,2,3], target: [0,0,0] })
  assertEq(out.length, 1, 'first append yields length 1')
  assertEq(out[0].id, 1, 'first id is 1')
  assertEq(out[0].name, 'a', 'name preserved')
}

// 2. Subsequent appends increment id.
{
  let v = []
  for (let i = 0; i < 3; i++) v = appendView(v, { name: `n${i}`, pos: [i,0,0], target: [0,0,0] })
  assertEq(v.map(x => x.id), [3,2,1], 'ids are 3,2,1 (newest first)')
}

// 3. Cap at CAMERA_VIEWS_MAX.
{
  let v = []
  for (let i = 0; i < CAMERA_VIEWS_MAX + 4; i++) v = appendView(v, { name: `n${i}`, pos: [i,0,0], target: [0,0,0] })
  assertEq(v.length, CAMERA_VIEWS_MAX, `cap at ${CAMERA_VIEWS_MAX}`)
}

// 4. Dedupe by name — saving same name overwrites prior entry.
{
  let v = appendView([], { name: 'home', pos: [0,5,15], target: [0,0,0] })
  v = appendView(v, { name: 'home', pos: [0,10,30], target: [0,0,0] })
  assertEq(v.length, 1, 'dedup by name keeps just one')
  assertEq(v[0].pos, [0,10,30], 'newer pos wins')
}

// 5. moveView — happy paths.
{
  const v = [
    { id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }, { id: 4, name: 'd' },
  ]
  assertEq(moveView(v, 0, 2).map(x => x.name), ['b', 'c', 'a', 'd'], 'moveView 0→2')
  assertEq(moveView(v, 3, 0).map(x => x.name), ['d', 'a', 'b', 'c'], 'moveView 3→0')
  assertEq(moveView(v, 1, 2).map(x => x.name), ['a', 'c', 'b', 'd'], 'moveView 1→2 (adjacent swap)')
}

// 6. moveView — defensive no-ops return the SAME array (===) so React
// can short-circuit re-render via reference equality.
{
  const v = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }]
  if (moveView(v, 0, 0) !== v) { console.error('FAIL: no-op same idx must return input ref'); process.exit(1) }
  if (moveView(v, -1, 0) !== v) { console.error('FAIL: negative from must return input ref'); process.exit(1) }
  if (moveView(v, 0, 99) !== v) { console.error('FAIL: out-of-range to must return input ref'); process.exit(1) }
  if (moveView(v, NaN, 0) !== v) { console.error('FAIL: NaN from must return input ref'); process.exit(1) }
  if (moveView(null, 0, 1) !== null) { console.error('FAIL: null input passes through'); process.exit(1) }
}

// 7. moveView — does not mutate the input array (returns a fresh one).
{
  const v = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]
  const out = moveView(v, 0, 2)
  if (out === v) { console.error('FAIL: must return a fresh array on reorder'); process.exit(1) }
  assertEq(v.map(x => x.name), ['a', 'b', 'c'], 'original input untouched')
}

// 8. moveViewUp / moveViewDown — convenience wrappers.
{
  const v = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }]
  assertEq(moveViewUp(v, 2).map(x => x.name),   ['a', 'c', 'b'], 'moveViewUp idx=2 swaps with idx=1')
  assertEq(moveViewDown(v, 0).map(x => x.name), ['b', 'a', 'c'], 'moveViewDown idx=0 swaps with idx=1')
  // Boundary no-ops: top can't go up, bottom can't go down.
  if (moveViewUp(v, 0) !== v) { console.error('FAIL: moveViewUp at top is a no-op (ref check)'); process.exit(1) }
  if (moveViewDown(v, 2) !== v) { console.error('FAIL: moveViewDown at bottom is a no-op (ref check)'); process.exit(1) }
}

// 9. removeView — R13.15 — removes by id, returns same ref when id
// not present (so callers can skip a redundant save), preserves
// order of the survivors, no-mutates the input.
{
  const v = [
    { id: 1, name: 'a' }, { id: 2, name: 'b' }, { id: 3, name: 'c' }, { id: 4, name: 'd' },
  ]
  // Happy: remove middle id
  const out = removeView(v, 2)
  assertEq(out.map(x => x.name), ['a', 'c', 'd'], 'removeView keeps survivors in order')
  if (out === v) { console.error('FAIL: removeView with hit must return a fresh array'); process.exit(1) }
  assertEq(v.map(x => x.name), ['a', 'b', 'c', 'd'], 'original input untouched')
  // No-op (id not present): same reference back
  if (removeView(v, 999) !== v) { console.error('FAIL: removeView with missing id must return input ref'); process.exit(1) }
  // Remove first / last
  assertEq(removeView(v, 1).map(x => x.name), ['b', 'c', 'd'], 'removeView head')
  assertEq(removeView(v, 4).map(x => x.name), ['a', 'b', 'c'], 'removeView tail')
  // Defensive: non-array → []
  assertEq(removeView(null, 1), [], 'removeView null input → empty array')
  assertEq(removeView(undefined, 1), [], 'removeView undefined input → empty array')
  // Defensive: null id → return input unchanged (ref-equal)
  if (removeView(v, null) !== v) { console.error('FAIL: removeView with null id must return input ref'); process.exit(1) }
  if (removeView(v, undefined) !== v) { console.error('FAIL: removeView with undefined id must return input ref'); process.exit(1) }
  // Defensive: skips a corrupt nullish entry without crashing. We
  // ask to remove a missing id (99); the null row should still be
  // cleaned up because the helper guarantees "ref-equal only when
  // there is nothing to remove AND nothing to clean up".
  const dirty = [{ id: 1, name: 'a' }, null, { id: 2, name: 'b' }]
  const cleaned = removeView(dirty, 99)
  if (cleaned === dirty) { console.error('FAIL: removeView with corrupt rows must return a fresh array'); process.exit(1) }
  assertEq(cleaned.map(x => x && x.name), ['a', 'b'], 'removeView cleans corrupt nullish rows on a miss')
  // And of course removing a real id ALSO drops nullish rows.
  assertEq(removeView(dirty, 2).map(x => x && x.name), ['a'], 'removeView drops target AND nullish row in one pass')
}

console.log('PASS: cameraViews append/dedupe/cap + moveView reorder + removeView (boundaries, no-op ref, no-mutation)')

// --- R22.12: resolveTouchTargetIdx — touch-drag hit-test ----------------
{
  // Helper: build a simple stack of evenly-sized rows.
  const stack = (n, rowH = 40, startY = 100) => {
    const out = []
    for (let i = 0; i < n; i++) {
      out.push({ top: startY + i * rowH, bottom: startY + (i + 1) * rowH })
    }
    return out
  }
  const rows = stack(5)  // y=[100,140), [140,180), [180,220), [220,260), [260,300)

  // Happy paths — touch lands inside each row in turn.
  assertEq(resolveTouchTargetIdx(120, rows), 0, 'touch inside row 0 → idx 0')
  assertEq(resolveTouchTargetIdx(160, rows), 1, 'touch inside row 1 → idx 1')
  assertEq(resolveTouchTargetIdx(200, rows), 2, 'touch inside row 2 → idx 2')
  assertEq(resolveTouchTargetIdx(240, rows), 3, 'touch inside row 3 → idx 3')
  assertEq(resolveTouchTargetIdx(280, rows), 4, 'touch inside row 4 → idx 4')

  // Boundary semantics — half-open [top, bottom). Touch at exactly the
  // BOTTOM edge of a row lands in the NEXT row (not the current row).
  // This prevents two adjacent rows from both claiming the shared pixel.
  assertEq(resolveTouchTargetIdx(140, rows), 1, 'y == row0.bottom (== row1.top) → row 1 (half-open)')
  assertEq(resolveTouchTargetIdx(180, rows), 2, 'y == row1.bottom → row 2')
  assertEq(resolveTouchTargetIdx(220, rows), 3, 'y == row2.bottom → row 3')

  // Top edge is INCLUSIVE — y at exactly a row's top lands in that row.
  assertEq(resolveTouchTargetIdx(100, rows), 0, 'y == row0.top → row 0 (closed lower bound)')

  // Overflow above — touch above the first row clamps to row 0.
  assertEq(resolveTouchTargetIdx(50, rows),  0, 'overflow above (y=50, top=100) → row 0')
  assertEq(resolveTouchTargetIdx(0, rows),   0, 'overflow above (y=0) → row 0')
  assertEq(resolveTouchTargetIdx(-100, rows), 0, 'overflow above (y=-100) → row 0')

  // Overflow below — touch below the last row clamps to last idx.
  assertEq(resolveTouchTargetIdx(300, rows), 4, 'y == last row bottom → row 4 (overflow snap)')
  assertEq(resolveTouchTargetIdx(500, rows), 4, 'overflow below (y=500) → row 4')
  assertEq(resolveTouchTargetIdx(10000, rows), 4, 'overflow far below → row 4')

  // Defensive — non-finite y returns null.
  assertEq(resolveTouchTargetIdx(NaN, rows), null, 'NaN y → null')
  assertEq(resolveTouchTargetIdx(Infinity, rows), null, '+Infinity y → null')
  assertEq(resolveTouchTargetIdx(-Infinity, rows), null, '-Infinity y → null')
  assertEq(resolveTouchTargetIdx(undefined, rows), null, 'undefined y → null')
  assertEq(resolveTouchTargetIdx(null, rows), null, 'null y → null')
  assertEq(resolveTouchTargetIdx('150', rows), null, 'string y → null')

  // Defensive — non-array / empty / nullish ranges returns null.
  assertEq(resolveTouchTargetIdx(150, null), null, 'null ranges → null')
  assertEq(resolveTouchTargetIdx(150, undefined), null, 'undefined ranges → null')
  assertEq(resolveTouchTargetIdx(150, 'not-array'), null, 'string ranges → null')
  assertEq(resolveTouchTargetIdx(150, []), null, 'empty ranges → null')

  // Single-row list — every overflow goes to idx 0 (no other targets exist).
  const oneRow = stack(1)
  assertEq(resolveTouchTargetIdx(50, oneRow), 0, 'single row, overflow above → 0')
  assertEq(resolveTouchTargetIdx(120, oneRow), 0, 'single row, in-range → 0')
  assertEq(resolveTouchTargetIdx(500, oneRow), 0, 'single row, overflow below → 0')

  // Corrupt rows in the middle skip without rejecting the gesture.
  const partly = [
    { top: 100, bottom: 140 },
    null,                            // corrupt — skip
    { top: 180, bottom: 220 },
    { top: NaN, bottom: 260 },       // corrupt top — skip
    { top: 260, bottom: 300 },
  ]
  assertEq(resolveTouchTargetIdx(120, partly), 0, 'partial-corrupt: row 0 still hits')
  assertEq(resolveTouchTargetIdx(200, partly), 2, 'partial-corrupt: row 2 still hits (skipping null row 1)')
  assertEq(resolveTouchTargetIdx(280, partly), 4, 'partial-corrupt: row 4 still hits (skipping NaN row 3)')
  // A touch in the GAP between row 0 and row 2 (the deleted row 1 zone)
  // — half-open interval at row 0 doesn't claim it (we hit row 0's
  // bottom=140); next valid range starts at row 2 top=180. So 150 falls
  // in the "between rows" zone. Should resolve to the row containing the
  // nearest-strict-match, which is none — falls through to lastValid
  // safety net but only because overflow guards already excluded it.
  // For pragmatism: 150 is ABOVE row 2's top so does NOT overflow below;
  // it's also ABOVE row 0's bottom (140) so it's not in row 0. The
  // overflow-above guard checks against the FIRST valid row's top (100)
  // so 150 > 100 is in-range. We scan: row 0 [100,140) — 150 not in;
  // row 2 [180,220) — 150 not in; row 4 [260,300) — 150 not in. Falls
  // through to `lastValid` (4). This is a reasonable fallback — gap-in-
  // ranges is itself a layout glitch so any deterministic behaviour
  // beats throwing.
  assertEq(resolveTouchTargetIdx(150, partly), 4, 'in-gap-between-rows resolves to lastValid as safety net')

  // All-corrupt range list → null.
  const allCorrupt = [null, { top: NaN, bottom: 200 }, { top: 100, bottom: NaN }, undefined]
  assertEq(resolveTouchTargetIdx(150, allCorrupt), null, 'all-corrupt ranges → null')

  // Reverse-order touches across the stack — sanity-check that the
  // function is deterministic regardless of call sequence (it's pure
  // so this should be trivially true, but a regression of "first call
  // caches" would be caught).
  assertEq(resolveTouchTargetIdx(280, rows), 4, 'determinism check: reverse, row 4')
  assertEq(resolveTouchTargetIdx(240, rows), 3, 'determinism check: reverse, row 3')
  assertEq(resolveTouchTargetIdx(200, rows), 2, 'determinism check: reverse, row 2')
  assertEq(resolveTouchTargetIdx(160, rows), 1, 'determinism check: reverse, row 1')
  assertEq(resolveTouchTargetIdx(120, rows), 0, 'determinism check: reverse, row 0')

  // Mutation guard — verify the helper never mutates its input ranges.
  const safe = stack(3)
  const snap = JSON.stringify(safe)
  resolveTouchTargetIdx(120, safe)
  resolveTouchTargetIdx(NaN, safe)
  resolveTouchTargetIdx(-100, safe)
  assertEq(JSON.stringify(safe), snap, 'resolveTouchTargetIdx does not mutate its input ranges')
}

console.log('PASS: resolveTouchTargetIdx — happy paths + boundary half-open + overflow + defensive (R22.12, ~35 asserts)')

// =====================================================================
// R28.20 — Gap-aware touch hit-test for binding-group drag-and-drop.
// Graduates resolveTouchTargetIdx (R22.12) with explicit gap-drop
// targets so a thumb dragging between rows can land on the
// "insert here" semantic instead of always resolving to the nearest
// row. Parallels the desktop gap-drop behaviour (R19.19 + R27.20).
// =====================================================================

// Helper: build a row-ranges array with adjacent rows so we can
// pinpoint the gap bands.
function rows(specs) {
  return specs.map(([top, bottom]) => ({ top, bottom }))
}

// resolveTouchTargetWithGaps — happy: row hit-test for touches well
// inside a row's bounds.
{
  // 4 rows, 40px each, 20px gap between them (so adjacent boundaries
  // are well-separated for the gap-band test to be unambiguous).
  // row[0] = [100, 140], row[1] = [160, 200], row[2] = [220, 260], row[3] = [280, 320].
  // Boundaries (midpoints): 150, 210, 270.
  const r = rows([[100, 140], [160, 200], [220, 260], [280, 320]])
  // Mid-row touches resolve to row (well outside any gap band).
  assertEq(resolveTouchTargetWithGaps(120, r), { kind: 'row', idx: 0 }, 'mid row 0 → row 0')
  assertEq(resolveTouchTargetWithGaps(180, r), { kind: 'row', idx: 1 }, 'mid row 1 → row 1')
  assertEq(resolveTouchTargetWithGaps(240, r), { kind: 'row', idx: 2 }, 'mid row 2 → row 2')
  assertEq(resolveTouchTargetWithGaps(300, r), { kind: 'row', idx: 3 }, 'mid row 3 → row 3')
}

// resolveTouchTargetWithGaps — gap-above-row-0 zone.
{
  // Touch ABOVE row 0's top fires the explicit "gap above first row"
  // target (gap 0), regardless of how far above.
  const r = rows([[100, 140], [160, 200]])
  assertEq(resolveTouchTargetWithGaps(50, r),  { kind: 'gap', gapIdx: 0 }, 'touch above row 0 → gap 0')
  assertEq(resolveTouchTargetWithGaps(0, r),   { kind: 'gap', gapIdx: 0 }, 'touch at y=0 → gap 0')
  assertEq(resolveTouchTargetWithGaps(99, r),  { kind: 'gap', gapIdx: 0 }, 'just above row 0 → gap 0')
}

// resolveTouchTargetWithGaps — gap-between-adjacent-rows bands.
{
  const r = rows([[100, 140], [160, 200], [220, 260]])
  // Boundaries: between row0(bottom=140) and row1(top=160) → midpoint 150.
  // Gap band: [150 - 12, 150 + 12) = [138, 162).
  assertEq(resolveTouchTargetWithGaps(138, r), { kind: 'gap', gapIdx: 1 }, 'left edge of gap band → gap 1')
  assertEq(resolveTouchTargetWithGaps(150, r), { kind: 'gap', gapIdx: 1 }, 'midpoint between row0 and row1 → gap 1')
  assertEq(resolveTouchTargetWithGaps(161, r), { kind: 'gap', gapIdx: 1 }, 'just inside upper edge → gap 1')
  // Just OUTSIDE the gap band returns to row hit-test.
  assertEq(resolveTouchTargetWithGaps(137, r), { kind: 'row', idx: 0 }, '1px below gap band → row 0')
  assertEq(resolveTouchTargetWithGaps(165, r), { kind: 'row', idx: 1 }, '3px above row 1 top, just outside gap band → row 1')

  // Boundary between row1 and row2: midpoint 210.
  assertEq(resolveTouchTargetWithGaps(210, r), { kind: 'gap', gapIdx: 2 }, 'midpoint between row1 and row2 → gap 2')
}

// resolveTouchTargetWithGaps — trailing gap below last row.
{
  const r = rows([[100, 140], [160, 200]])
  // last row's bottom = 200, tolerance = 12, double tolerance = 24.
  // [200, 224) is the trailing gap zone (gapIdx = ranges.length = 2).
  // Note: at y=200 exactly, we're at the bottom edge so it counts as
  // overflow-below per resolveTouchTargetIdx semantics + falls into
  // the trailing gap with this helper.
  assertEq(resolveTouchTargetWithGaps(200, r), { kind: 'gap', gapIdx: 2 }, 'at last row bottom → trailing gap')
  assertEq(resolveTouchTargetWithGaps(210, r), { kind: 'gap', gapIdx: 2 }, 'within trailing tolerance → trailing gap')
  assertEq(resolveTouchTargetWithGaps(223, r), { kind: 'gap', gapIdx: 2 }, 'just inside trailing zone → trailing gap')
  // Past the trailing tolerance: snap back to last row (consistent
  // with overflow semantics).
  assertEq(resolveTouchTargetWithGaps(224, r), { kind: 'row', idx: 1 }, 'past trailing zone → row 1 (overflow-below)')
  assertEq(resolveTouchTargetWithGaps(500, r), { kind: 'row', idx: 1 }, 'far overflow below → row 1')
}

// resolveTouchTargetWithGaps — single-row list: gap 0 above + trailing
// gap below; row hits inside.
{
  const r = rows([[100, 140]])
  assertEq(resolveTouchTargetWithGaps(50, r),  { kind: 'gap', gapIdx: 0 }, 'above single row → gap 0')
  assertEq(resolveTouchTargetWithGaps(120, r), { kind: 'row', idx: 0 },  'inside single row → row 0')
  assertEq(resolveTouchTargetWithGaps(150, r), { kind: 'gap', gapIdx: 1 }, 'below single row (trailing) → gap 1')
}

// resolveTouchTargetWithGaps — defensive matrix.
{
  const r = rows([[100, 140]])
  assertEq(resolveTouchTargetWithGaps(NaN, r), null,       'NaN y → null')
  assertEq(resolveTouchTargetWithGaps(Infinity, r),  null, 'Infinity y → null')
  assertEq(resolveTouchTargetWithGaps(-Infinity, r), null, '-Infinity y → null')
  assertEq(resolveTouchTargetWithGaps('150', r),     null, 'string y → null')
  assertEq(resolveTouchTargetWithGaps(null, r),      null, 'null y → null')
  assertEq(resolveTouchTargetWithGaps(undefined, r), null, 'undefined y → null')

  // Empty / non-array ranges.
  assertEq(resolveTouchTargetWithGaps(120, null),         null, 'null ranges → null')
  assertEq(resolveTouchTargetWithGaps(120, undefined),    null, 'undefined ranges → null')
  assertEq(resolveTouchTargetWithGaps(120, 'not-array'),  null, 'string ranges → null')
  assertEq(resolveTouchTargetWithGaps(120, []),           null, 'empty ranges → null')
  // All-corrupt ranges.
  assertEq(resolveTouchTargetWithGaps(120, [null, null]), null, 'all-corrupt ranges → null')
  assertEq(resolveTouchTargetWithGaps(120, ['s', 42, null]), null, 'mixed-corrupt ranges → null')
}

// resolveTouchTargetWithGaps — partial-corrupt list: skips corrupt
// entries but still finds valid rows + computes gap boundaries
// between non-adjacent valid entries.
{
  const r = [
    { top: 100, bottom: 140 },  // row 0 valid
    null,                        // corrupt
    { top: 200, bottom: 240 },  // row 2 valid (non-adjacent to row 0)
    { top: NaN, bottom: 260 },  // corrupt (non-finite top)
    { top: 280, bottom: 320 },  // row 4 valid
  ]
  // Boundary between row 0 (bottom=140) and row 2 (top=200) → midpoint 170.
  // Gap band [158, 182). gapIdx = 2 (the index of row 2 in the list).
  assertEq(resolveTouchTargetWithGaps(170, r), { kind: 'gap', gapIdx: 2 }, 'corrupt-between: gap at midpoint of two valid rows')
  assertEq(resolveTouchTargetWithGaps(120, r), { kind: 'row', idx: 0 },  'corrupt-between: row 0 still hits')
  assertEq(resolveTouchTargetWithGaps(220, r), { kind: 'row', idx: 2 },  'corrupt-between: row 2 still hits')
  assertEq(resolveTouchTargetWithGaps(300, r), { kind: 'row', idx: 4 },  'corrupt-between: row 4 still hits')
}

// resolveTouchTargetWithGaps — custom tolerance arg.
{
  // Use rows ADJACENT so there's no "natural gap" pixel-space between
  // them (row1.top === row0.bottom + 1 effectively). That makes the
  // tolerance arg the SOLE driver of gap-band width.
  const r = rows([[100, 150], [150, 200]])
  // Boundary = (150 + 150) / 2 = 150 (rows touching).
  // With tolerance 4: gap band [146, 154).
  assertEq(resolveTouchTargetWithGaps(146, r, { tolerancePx: 4 }), { kind: 'gap', gapIdx: 1 }, 'custom tolerance 4: left edge of narrow band → gap')
  assertEq(resolveTouchTargetWithGaps(150, r, { tolerancePx: 4 }), { kind: 'gap', gapIdx: 1 }, 'custom tolerance 4: at boundary → gap')
  assertEq(resolveTouchTargetWithGaps(153, r, { tolerancePx: 4 }), { kind: 'gap', gapIdx: 1 }, 'custom tolerance 4: inside narrow band → gap')
  // Just OUTSIDE the gap band returns to row hit-test.
  assertEq(resolveTouchTargetWithGaps(155, r, { tolerancePx: 4 }), { kind: 'row', idx: 1 }, 'custom tolerance 4: just above narrow band → row 1')
  assertEq(resolveTouchTargetWithGaps(145, r, { tolerancePx: 4 }), { kind: 'row', idx: 0 }, 'custom tolerance 4: just below narrow band → row 0')

  // Defensive: non-finite tolerance falls back to default.
  assertEq(resolveTouchTargetWithGaps(150, r, { tolerancePx: NaN }),       { kind: 'gap', gapIdx: 1 }, 'NaN tolerance → default')
  assertEq(resolveTouchTargetWithGaps(150, r, { tolerancePx: Infinity }),  { kind: 'gap', gapIdx: 1 }, 'Infinity tolerance → default')
  assertEq(resolveTouchTargetWithGaps(150, r, { tolerancePx: -5 }),        { kind: 'gap', gapIdx: 1 }, 'negative tolerance → default')
  assertEq(resolveTouchTargetWithGaps(150, r, { tolerancePx: '8' }),       { kind: 'gap', gapIdx: 1 }, 'string tolerance → default')

  // Zero tolerance: gap band collapses to exactly [boundary, boundary)
  // = empty range. Every in-range touch falls to row hit-test. At the
  // exact boundary the half-open row range [top, bottom) means a
  // touch at y === boundary lands on row 1 (since row 1 starts at
  // boundary).
  assertEq(resolveTouchTargetWithGaps(150, r, { tolerancePx: 0 }), { kind: 'row', idx: 1 }, 'zero tolerance: no gap (boundary falls to row above)')
}

// resolveTouchTargetWithGaps — TOUCH_GAP_TOLERANCE_PX exposed constant
// is a positive finite number.
{
  if (!Number.isFinite(TOUCH_GAP_TOLERANCE_PX) || TOUCH_GAP_TOLERANCE_PX <= 0) {
    console.error(`FAIL: TOUCH_GAP_TOLERANCE_PX exposed as finite positive (got ${TOUCH_GAP_TOLERANCE_PX})`)
    process.exit(1)
  }
}

// resolveTouchTargetWithGaps — purity: input not mutated.
{
  const r = rows([[100, 140], [160, 200], [220, 260]])
  const snap = JSON.stringify(r)
  resolveTouchTargetWithGaps(150, r)
  resolveTouchTargetWithGaps(120, r, { tolerancePx: 4 })
  resolveTouchTargetWithGaps(NaN, r)
  assertEq(JSON.stringify(r), snap, 'resolveTouchTargetWithGaps does not mutate input ranges')
}

// resolveTouchTargetWithGaps — sequential walk through a 3-row list
// mimicking a touch dragging down through every position. Verifies
// the discriminator transitions cleanly: row 0 → gap 1 → row 1 →
// gap 2 → row 2 → trailing gap 3.
{
  const r = rows([[100, 140], [160, 200], [220, 260]])
  const transitions = [
    [110, { kind: 'row', idx: 0 }],
    [120, { kind: 'row', idx: 0 }],
    [138, { kind: 'gap', gapIdx: 1 }],   // upper edge of gap band [138, 162)
    [150, { kind: 'gap', gapIdx: 1 }],
    [161, { kind: 'gap', gapIdx: 1 }],
    [165, { kind: 'row', idx: 1 }],
    [180, { kind: 'row', idx: 1 }],
    [199, { kind: 'gap', gapIdx: 2 }],   // gap band [198, 222), 199 inside
    [210, { kind: 'gap', gapIdx: 2 }],
    [221, { kind: 'gap', gapIdx: 2 }],
    [230, { kind: 'row', idx: 2 }],
    [255, { kind: 'row', idx: 2 }],
    [261, { kind: 'gap', gapIdx: 3 }],   // trailing zone [260, 284)
    [275, { kind: 'gap', gapIdx: 3 }],
    [283, { kind: 'gap', gapIdx: 3 }],
    [285, { kind: 'row', idx: 2 }],      // past trailing tolerance → snap to last row
  ]
  for (const [y, expected] of transitions) {
    assertEq(resolveTouchTargetWithGaps(y, r), expected, `sequential walk y=${y}`)
  }
}

console.log('PASS: resolveTouchTargetWithGaps — gap-aware touch hit-test (R28.20, ~60 asserts)')

// --- R36.H: buildCameraPaletteActions ---
{
  const views = [
    { id: 3, name: 'Hero', pos: [1.234, 2, 3.567], target: [0, 0, 0], createdAt: 30 },
    { id: 2, name: '  ', pos: [4, 5, 6], target: [0, 0, 0], createdAt: 20 },   // blank name → fallback
    { id: 1, name: 'Wide', pos: [7, 8, 9], target: [0, 0, 0], createdAt: 10 },
  ]
  const actions = buildCameraPaletteActions(views)
  assertEq(actions.length, 3, 'one action per valid view')
  assertEq(actions[0].id, 'cam-view-3', 'stable id from view id')
  assertEq(actions[0].kind, 'restore-view', 'kind is restore-view')
  assertEq(actions[0].label, 'Hero', 'label from name')
  // order preserved (newest-first as stored).
  assertEq(actions.map(a => a.label), ['Hero', 'View 2', 'Wide'], 'order preserved + blank name falls back to View N')
  // pos rounded to 0.1 in the sub line.
  assertEq(actions[0].sub, '1.2, 2, 3.6', 'sub is rounded x, y, z')
  // keywords are lowercase + include the name for search.
  assertEq(actions[0].keywords.includes('hero'), true, 'keywords include lowercased name')
  assertEq(actions[0].keywords.includes('camera'), true, 'keywords include camera')
  // the view payload is carried through for restore.
  assertEq(actions[0].view.id, 3, 'view payload carried')
}

// --- buildCameraPaletteActions: defensive ---
{
  assertEq(buildCameraPaletteActions([]), [], 'empty list → no actions')
  assertEq(buildCameraPaletteActions(null), [], 'null → no actions')
  assertEq(buildCameraPaletteActions(undefined), [], 'undefined → no actions')
  assertEq(buildCameraPaletteActions('nope'), [], 'non-array → no actions')
  // corrupt rows are skipped, valid ones survive.
  const mixed = [
    null,                                            // dropped
    { name: 'no id', pos: [1, 2, 3] },               // missing id → dropped
    { id: 5, name: 'no pos' },                       // missing pos → dropped
    { id: 6, name: 'short pos', pos: [1, 2] },       // pos too short → dropped
    { id: 7, name: 'nan pos', pos: [1, NaN, 3] },    // non-finite pos → dropped
    { id: 8, name: 'Good', pos: [1, 2, 3], target: [0, 0, 0] }, // kept
  ]
  const out = buildCameraPaletteActions(mixed)
  assertEq(out.length, 1, 'only the one fully-valid view survives')
  assertEq(out[0].id, 'cam-view-8', 'the valid view is the kept one')
  assertEq(out[0].label, 'Good', 'valid view label')
  // id 0 is a legitimate id (falsy but defined) — must NOT be dropped.
  const zeroId = buildCameraPaletteActions([{ id: 0, name: 'Zero', pos: [0, 0, 0] }])
  assertEq(zeroId.length, 1, 'id 0 is valid (not treated as missing)')
  assertEq(zeroId[0].id, 'cam-view-0', 'id 0 builds a stable action id')
  // purity: input not mutated.
  const src = [{ id: 1, name: 'X', pos: [1, 2, 3] }]
  const snapshot = JSON.stringify(src)
  buildCameraPaletteActions(src)
  assertEq(JSON.stringify(src), snapshot, 'input views not mutated')
}

console.log('PASS: buildCameraPaletteActions — command-palette camera actions (R36.H, ~22 asserts)')

// === R37.H: buildCameraDeleteActions =================================
{
  // Non-array → [].
  assertEq(buildCameraDeleteActions(null), [], 'null → empty')
  assertEq(buildCameraDeleteActions(undefined), [], 'undefined → empty')
  assertEq(buildCameraDeleteActions('nope'), [], 'string → empty')
  assertEq(buildCameraDeleteActions([]), [], 'empty list → empty')

  // One view → one delete action carrying the id + a readable label.
  const one = buildCameraDeleteActions([{ id: 7, name: 'Hero', pos: [1, 2, 3] }])
  assertEq(one.length, 1, 'one view → one delete action')
  assertEq(one[0].kind, 'delete-view', 'kind is delete-view')
  assertEq(one[0].id, 'cam-del-7', 'stable action id from view id')
  assertEq(one[0].viewId, 7, 'carries the view id for the remove call')
  assertEq(one[0].label, 'Delete view: Hero', 'label names the view')

  // Order preserved (newest-first as stored).
  const many = buildCameraDeleteActions([
    { id: 3, name: 'c', pos: [0, 0, 0] },
    { id: 2, name: 'b', pos: [0, 0, 0] },
    { id: 1, name: 'a', pos: [0, 0, 0] },
  ])
  assertEq(many.map(a => a.viewId), [3, 2, 1], 'delete actions keep stored order')

  // Missing/blank name falls back to "View <id>".
  const noName = buildCameraDeleteActions([{ id: 9, pos: [0, 0, 0] }])
  assertEq(noName[0].label, 'Delete view: View 9', 'missing name → View <id>')
  const blankName = buildCameraDeleteActions([{ id: 4, name: '   ', pos: [0, 0, 0] }])
  assertEq(blankName[0].label, 'Delete view: View 4', 'blank name → View <id>')

  // id 0 is a legitimate id (falsy but defined) — must NOT be dropped.
  const zero = buildCameraDeleteActions([{ id: 0, name: 'Zero', pos: [0, 0, 0] }])
  assertEq(zero.length, 1, 'id 0 is valid (not treated as missing)')
  assertEq(zero[0].id, 'cam-del-0', 'id 0 builds a stable delete id')

  // Rows with no usable id are skipped.
  const missingId = buildCameraDeleteActions([
    { name: 'no id', pos: [0, 0, 0] },
    { id: null, name: 'null id', pos: [0, 0, 0] },
    { id: 5, name: 'ok', pos: [0, 0, 0] },
  ])
  assertEq(missingId.map(a => a.viewId), [5], 'rows without an id are skipped')

  // A position-CORRUPT view is still DELETABLE (unlike restore) — exactly
  // the row a user wants to be able to purge from the palette.
  const corruptPos = buildCameraDeleteActions([
    { id: 11, name: 'broken', pos: [NaN] },
    { id: 12, name: 'noPos' },
  ])
  assertEq(corruptPos.map(a => a.viewId), [11, 12], 'corrupt/missing pos still deletable')

  // Corrupt non-object rows skipped, valid kept.
  const mixed = buildCameraDeleteActions([null, 5, { id: 8, name: 'keep', pos: [0, 0, 0] }, undefined])
  assertEq(mixed.map(a => a.viewId), [8], 'non-object rows skipped')

  // Purity: input not mutated.
  const src = [{ id: 1, name: 'X', pos: [1, 2, 3] }]
  const snapshot = JSON.stringify(src)
  buildCameraDeleteActions(src)
  assertEq(JSON.stringify(src), snapshot, 'input views not mutated')
}

console.log('PASS: buildCameraDeleteActions — command-palette saved-view delete actions (R37.H, ~18 asserts)')

// === R38.H: renameView + buildCameraRenameActions ====================
{
  const base = [
    { id: 3, name: 'Wide', pos: [1, 2, 3], target: [0, 0, 0] },
    { id: 2, name: 'Close', pos: [4, 5, 6], target: [0, 0, 0] },
    { id: 1, name: 'Top', pos: [0, 9, 0], target: [0, 0, 0] },
  ]

  // --- happy path: renames the matched row, leaves others alone ---
  const renamed = renameView(base, 2, 'Hero')
  assertEq(renamed.find(v => v.id === 2).name, 'Hero', 'matched row renamed')
  assertEq(renamed.find(v => v.id === 3).name, 'Wide', 'other rows untouched')
  assertEq(renamed.length, 3, 'rename preserves length')
  // Position payload survives the rename.
  assertEq(renamed.find(v => v.id === 2).pos, [4, 5, 6], 'rename keeps pos/target')

  // --- name is trimmed ---
  assertEq(renameView(base, 1, '  Sky  ').find(v => v.id === 1).name, 'Sky', 'new name is trimmed')

  // --- ref-equal-on-no-op contract ---
  if (renameView(base, 2, 'Close') !== base) { console.error('FAIL: identical name should be ref-equal no-op'); process.exit(1) }
  if (renameView(base, 999, 'Nope') !== base) { console.error('FAIL: missing id should be ref-equal no-op'); process.exit(1) }
  if (renameView(base, null, 'X') !== base) { console.error('FAIL: null id should be ref-equal no-op'); process.exit(1) }
  if (renameView(base, undefined, 'X') !== base) { console.error('FAIL: undefined id should be ref-equal no-op'); process.exit(1) }
  // Blank-after-trim is rejected — a view must keep a usable label.
  if (renameView(base, 2, '   ') !== base) { console.error('FAIL: blank name should be ref-equal no-op'); process.exit(1) }
  if (renameView(base, 2, '') !== base) { console.error('FAIL: empty name should be ref-equal no-op'); process.exit(1) }
  if (renameView(base, 2, 42) !== base) { console.error('FAIL: non-string name should be ref-equal no-op'); process.exit(1) }

  // --- id 0 is a valid id (falsy but defined) ---
  const withZero = [{ id: 0, name: 'Origin', pos: [0, 0, 0], target: [0, 0, 0] }]
  assertEq(renameView(withZero, 0, 'Home').find(v => v.id === 0).name, 'Home', 'id 0 is renameable')

  // --- non-array → [] ---
  assertEq(renameView(null, 1, 'X'), [], 'non-array → []')
  assertEq(renameView('nope', 1, 'X'), [], 'string → []')

  // --- purity: input not mutated ---
  const src = [{ id: 1, name: 'Orig', pos: [1, 2, 3], target: [0, 0, 0] }]
  const snapshot = JSON.stringify(src)
  renameView(src, 1, 'Changed')
  assertEq(JSON.stringify(src), snapshot, 'renameView does not mutate input')

  // --- buildCameraRenameActions ---
  const actions = buildCameraRenameActions(base)
  assertEq(actions.length, 3, 'one rename action per view')
  assertEq(actions.map(a => a.viewId), [3, 2, 1], 'order preserved (newest-first)')
  assertEq(actions[0].kind, 'rename-view', 'kind is rename-view')
  assertEq(actions[0].id, 'cam-ren-3', 'stable action id')
  assertEq(actions[0].label, 'Rename view: Wide', 'label names the view')
  assertEq(actions[0].currentName, 'Wide', 'currentName seeds the inline edit')

  // Missing/blank name → "View <id>" fallback in label + currentName.
  const noName = buildCameraRenameActions([{ id: 9, pos: [0, 0, 0] }])
  assertEq(noName[0].label, 'Rename view: View 9', 'missing name → View <id>')
  assertEq(noName[0].currentName, 'View 9', 'currentName falls back to View <id>')

  // A position-CORRUPT view is still RENAMEABLE (only id required).
  const corruptPos = buildCameraRenameActions([{ id: 11, name: 'broken', pos: [NaN] }, { id: 12, name: 'noPos' }])
  assertEq(corruptPos.map(a => a.viewId), [11, 12], 'corrupt/missing pos still renameable')

  // id 0 valid; rows without an id or non-object rows skipped.
  const zero = buildCameraRenameActions([{ id: 0, name: 'Zero', pos: [0, 0, 0] }])
  assertEq(zero[0].id, 'cam-ren-0', 'id 0 builds a stable rename id')
  const mixed = buildCameraRenameActions([null, 5, { id: 8, name: 'keep', pos: [0, 0, 0] }, { name: 'noid' }])
  assertEq(mixed.map(a => a.viewId), [8], 'non-object / no-id rows skipped')

  // non-array → []
  assertEq(buildCameraRenameActions(null), [], 'non-array → []')

  // Purity: builder doesn't mutate input.
  const src2 = [{ id: 1, name: 'X', pos: [1, 2, 3] }]
  const snap2 = JSON.stringify(src2)
  buildCameraRenameActions(src2)
  assertEq(JSON.stringify(src2), snap2, 'builder does not mutate input')
}

console.log('PASS: renameView + buildCameraRenameActions — palette rename/clear lifecycle (R38.H, ~30 asserts)')

// --- R39.H: duplicateView + buildCameraDuplicateActions --------------
{
  const base = [
    { id: 3, name: 'Front', pos: [1, 2, 3], target: [0, 0, 0], createdAt: 100 },
    { id: 1, name: 'Side', pos: [4, 5, 6], target: [1, 1, 1], createdAt: 50 },
  ]

  // Happy path: clone by id → fresh id, "<name> copy", prepended front.
  {
    const out = duplicateView(base, 3)
    assertEq(out.length, 3, 'duplicate: list grows by one')
    assertEq(out[0].id, 4, 'duplicate: clone gets a fresh monotonic id (max+1)')
    assertEq(out[0].name, 'Front copy', 'duplicate: default name is "<name> copy"')
    assertEq(out[0].pos, [1, 2, 3], 'duplicate: clone carries the source pos')
    assertEq(out[0].target, [0, 0, 0], 'duplicate: clone carries the source target')
    assertEq(out[1].id, 3, 'duplicate: original stays in place after the clone')
  }

  // Deep-copy: editing the clone's arrays must not touch the original.
  {
    const out = duplicateView(base, 3)
    out[0].pos[0] = 999
    assertEq(base[0].pos[0], 1, 'duplicate: clone pos is a deep copy (original untouched)')
    out[0].target[0] = 888
    assertEq(base[0].target[0], 0, 'duplicate: clone target is a deep copy')
  }

  // Custom nameFor callback overrides the default name.
  {
    const out = duplicateView(base, 1, (src) => `${src.name} (v2)`)
    assertEq(out[0].name, 'Side (v2)', 'duplicate: nameFor callback names the clone')
  }
  // nameFor returning falsy falls back to the default "<name> copy".
  {
    const out = duplicateView(base, 1, () => '')
    assertEq(out[0].name, 'Side copy', 'duplicate: empty nameFor → default copy name')
  }

  // Source with no usable name → "View <id> copy".
  {
    const noName = [{ id: 7, pos: [0, 1, 2], target: [0, 0, 0] }]
    const out = duplicateView(noName, 7)
    assertEq(out[0].name, 'View 7 copy', 'duplicate: nameless source → "View N copy"')
  }

  // ref-equal-on-no-op: missing id / not-present id / nullish id.
  assertEq(duplicateView(base, 99) === base, true, 'duplicate: id not present → input ref unchanged')
  assertEq(duplicateView(base, null) === base, true, 'duplicate: null id → input ref unchanged')
  assertEq(duplicateView(base, undefined) === base, true, 'duplicate: undefined id → input ref unchanged')

  // Position-corrupt source is NOT cloneable (a copy with no angle is useless).
  {
    const corrupt = [{ id: 2, name: 'broken', pos: [NaN, 1, 2] }, { id: 5, name: 'noPos' }]
    assertEq(duplicateView(corrupt, 2) === corrupt, true, 'duplicate: NaN pos source → no clone, ref unchanged')
    assertEq(duplicateView(corrupt, 5) === corrupt, true, 'duplicate: missing pos source → no clone, ref unchanged')
    const shortPos = [{ id: 6, name: 'short', pos: [1, 2] }]
    assertEq(duplicateView(shortPos, 6) === shortPos, true, 'duplicate: <3-element pos → no clone')
  }

  // non-array → [].
  assertEq(duplicateView(null, 1), [], 'duplicate: non-array → []')

  // MAX cap: duplicating when the list is full drops the oldest tail.
  {
    const full = []
    for (let i = 1; i <= CAMERA_VIEWS_MAX; i++) full.push({ id: i, name: `V${i}`, pos: [i, i, i], target: [0, 0, 0] })
    const out = duplicateView(full, 1)
    assertEq(out.length, CAMERA_VIEWS_MAX, 'duplicate: stays capped at MAX')
    assertEq(out[0].name, 'V1 copy', 'duplicate: clone is at the front')
    assertEq(out[out.length - 1].id, CAMERA_VIEWS_MAX - 1, 'duplicate: oldest tail dropped at the cap')
  }

  // Purity: duplicate doesn't mutate the input array.
  {
    const src = [{ id: 1, name: 'A', pos: [1, 2, 3], target: [0, 0, 0] }]
    const snap = JSON.stringify(src)
    duplicateView(src, 1)
    assertEq(JSON.stringify(src), snap, 'duplicate: does not mutate input array')
  }

  // buildCameraDuplicateActions: one action per CLONEABLE view.
  {
    const acts = buildCameraDuplicateActions(base)
    assertEq(acts.map(a => a.viewId), [3, 1], 'dup actions: one per view, order preserved')
    assertEq(acts[0].id, 'cam-dup-3', 'dup actions: stable action id')
    assertEq(acts[0].kind, 'duplicate-view', 'dup actions: kind tag')
    assertEq(acts[0].label, 'Duplicate view: Front', 'dup actions: label names the source')
    assertEq(/duplicate/.test(acts[0].keywords) && /clone/.test(acts[0].keywords), true, 'dup actions: searchable keywords')
  }
  // Position-corrupt views are SKIPPED (unlike rename/delete) — a copy
  // with no angle is useless.
  {
    const acts = buildCameraDuplicateActions([
      { id: 9, name: 'good', pos: [1, 2, 3] },
      { id: 10, name: 'broken', pos: [NaN] },
      { id: 11, name: 'noPos' },
    ])
    assertEq(acts.map(a => a.viewId), [9], 'dup actions: position-corrupt views skipped')
  }
  // non-object / no-id rows skipped; non-array → [].
  {
    const acts = buildCameraDuplicateActions([null, 5, { id: 8, name: 'keep', pos: [0, 0, 0] }, { name: 'noid' }])
    assertEq(acts.map(a => a.viewId), [8], 'dup actions: junk rows skipped')
    assertEq(buildCameraDuplicateActions(null), [], 'dup actions: non-array → []')
  }
  // Purity: builder doesn't mutate input.
  {
    const src = [{ id: 1, name: 'X', pos: [1, 2, 3] }]
    const snap = JSON.stringify(src)
    buildCameraDuplicateActions(src)
    assertEq(JSON.stringify(src), snap, 'dup actions: builder does not mutate input')
  }
}

console.log('PASS: duplicateView + buildCameraDuplicateActions — palette duplicate lifecycle (R39.H)')

// --- R40.H: duplicateAllViews — fork the whole set in one action ------
{
  // Two angle-bearing views → two clones prepended, source order kept
  // within the cloned block; originals follow.
  {
    const views = [
      { id: 2, name: 'B', pos: [4, 5, 6], target: [0, 0, 0] },
      { id: 1, name: 'A', pos: [1, 2, 3], target: [7, 8, 9] },
    ]
    const out = duplicateAllViews(views)
    assertEq(out.length, 4, 'dup-all: two clones + two originals')
    assertEq(out.map(v => v.name), ['B copy', 'A copy', 'B', 'A'], 'dup-all: clones prepended, source order kept')
    // Fresh monotonic ids above the current max (2): 3, 4.
    assertEq(out[0].id, 3, 'dup-all: first clone gets max+1')
    assertEq(out[1].id, 4, 'dup-all: second clone gets max+2')
    assertEq(out[0].pos, [4, 5, 6], 'dup-all: B copy carries B angle')
    assertEq(out[1].pos, [1, 2, 3], 'dup-all: A copy carries A angle')
    assertEq(out[1].target, [7, 8, 9], 'dup-all: A copy carries A target')
  }
  // Deep-copy isolation: editing a clone's arrays can't mutate the source.
  {
    const views = [{ id: 1, name: 'A', pos: [1, 2, 3], target: [0, 0, 0] }]
    const out = duplicateAllViews(views)
    out[0].pos[0] = 999
    out[0].target[0] = 999
    assertEq(views[0].pos[0], 1, 'dup-all: clone pos is a deep copy')
    assertEq(views[0].target[0], 0, 'dup-all: clone target is a deep copy')
  }
  // MAX cap: the freshest clones win, oldest originals fall off the tail.
  {
    // Six views (at the cap). Duplicating all → 6 clones + 6 originals,
    // sliced to MAX (6) → just the 6 clones.
    const views = []
    for (let i = 6; i >= 1; i--) views.push({ id: i, name: `V${i}`, pos: [i, 0, 0], target: [0, 0, 0] })
    const out = duplicateAllViews(views)
    assertEq(out.length, CAMERA_VIEWS_MAX, 'dup-all: result capped at MAX')
    assertEq(out.every(v => v.name.endsWith(' copy')), true, 'dup-all: only the clones survive the cap')
  }
  // Position-corrupt views are skipped (no angle to clone); valid ones
  // still clone.
  {
    const views = [
      { id: 2, name: 'good', pos: [1, 2, 3], target: [0, 0, 0] },
      { id: 1, name: 'broken', pos: [1, 2] }, // too-short pos → not cloneable
    ]
    const out = duplicateAllViews(views)
    assertEq(out.length, 3, 'dup-all: one clone + two originals (broken skipped)')
    assertEq(out[0].name, 'good copy', 'dup-all: only the angle-bearing view cloned')
  }
  // No cloneable view → ref-equal-on-no-op (persistence can skip a save).
  {
    const views = [{ id: 1, name: 'broken', pos: [1, 2] }]
    const out = duplicateAllViews(views)
    assertEq(out === views, true, 'dup-all: no cloneable → input ref unchanged')
  }
  // Empty list → ref-equal (no cloneable views).
  {
    const views = []
    assertEq(duplicateAllViews(views) === views, true, 'dup-all: empty → input ref unchanged')
  }
  // Custom nameFor overrides the default "<name> copy".
  {
    const views = [{ id: 1, name: 'A', pos: [1, 2, 3], target: [0, 0, 0] }]
    const out = duplicateAllViews(views, v => `${v.name} (fork)`)
    assertEq(out[0].name, 'A (fork)', 'dup-all: custom nameFor applied')
  }
  // Defensive: non-array → [].
  assertEq(duplicateAllViews(null), [], 'dup-all: non-array → []')
  assertEq(duplicateAllViews('nope'), [], 'dup-all: string → []')
  // Purity: input array not mutated.
  {
    const src = [{ id: 1, name: 'A', pos: [1, 2, 3], target: [0, 0, 0] }]
    const snap = JSON.stringify(src)
    duplicateAllViews(src)
    assertEq(JSON.stringify(src), snap, 'dup-all: does not mutate input')
  }
}

console.log('PASS: duplicateAllViews — fork the whole saved-view set (R40.H)')

// --- R41.H: duplicateViews — fork a SELECTED subset --------------------
{
  const views = [
    { id: 3, name: 'C', pos: [3, 0, 0], target: [0, 0, 0] },
    { id: 2, name: 'B', pos: [2, 0, 0], target: [0, 0, 0] },
    { id: 1, name: 'A', pos: [1, 0, 0], target: [0, 0, 0] },
  ]
  // select a subset (ids 3 + 1) → clones prepended in array order,
  // named "<name> copy", fresh monotonic ids above the current max.
  {
    const out = duplicateViews(views, new Set([3, 1]))
    assertEq(out.length, 5, 'dup-sel: 3 + 2 clones = 5')
    assertEq(out[0].name, 'C copy', 'dup-sel: first clone is C (array order preserved)')
    assertEq(out[1].name, 'A copy', 'dup-sel: second clone is A')
    assertEq(out[0].id, 4, 'dup-sel: clone ids continue above max (4)')
    assertEq(out[1].id, 5, 'dup-sel: second clone id 5')
    // B (id 2, unselected) is NOT cloned; originals stay at the tail.
    assertTrue(!out.some(v => v.name === 'B copy'), 'dup-sel: unselected B not cloned')
    assertEq(out.slice(2).map(v => v.id), [3, 2, 1], 'dup-sel: originals follow in order')
  }
  // accepts a plain array of ids (not just a Set).
  {
    const out = duplicateViews(views, [2])
    assertEq(out.length, 4, 'dup-sel: array idSet works (1 clone)')
    assertEq(out[0].name, 'B copy', 'dup-sel: array-selected B cloned')
  }
  // accepts any iterable (e.g. a generator).
  {
    const gen = (function* () { yield 1; yield 3 })()
    const out = duplicateViews(views, gen)
    assertEq(out.length, 5, 'dup-sel: generator idSet works')
  }
  // deep-copies pos/target so editing a clone can't touch the original.
  {
    const out = duplicateViews(views, new Set([1]))
    out[0].pos[0] = 999
    assertEq(views[2].pos[0], 1, 'dup-sel: clone pos is a deep copy')
  }
  // selecting an id not present is ignored (only real selected clone).
  {
    const out = duplicateViews(views, new Set([1, 99]))
    assertEq(out.length, 4, 'dup-sel: phantom id ignored, only A cloned')
    assertEq(out[0].name, 'A copy', 'dup-sel: only the real selected view cloned')
  }
  // a position-corrupt selected view is skipped (no angle to restore).
  {
    const withBad = [
      { id: 2, name: 'ok', pos: [1, 2, 3], target: [0, 0, 0] },
      { id: 1, name: 'bad', pos: [1, 2] }, // too-short pos
    ]
    const out = duplicateViews(withBad, new Set([1, 2]))
    assertEq(out.length, 3, 'dup-sel: corrupt selected view skipped (1 clone)')
    assertEq(out[0].name, 'ok copy', 'dup-sel: only the angle-bearing one cloned')
  }
  // ref-equal-on-no-op: empty selection / non-iterable / no cloneable id.
  {
    assertTrue(duplicateViews(views, new Set()) === views, 'dup-sel: empty set → ref-equal')
    assertTrue(duplicateViews(views, null) === views, 'dup-sel: non-iterable idSet → ref-equal')
    assertTrue(duplicateViews(views, new Set([99])) === views, 'dup-sel: no matching id → ref-equal')
  }
  // non-array views → [].
  assertEq(duplicateViews(null, new Set([1])), [], 'dup-sel: non-array views → []')
  // respects MAX cap (freshest clones win; oldest originals fall off).
  {
    const six = []
    for (let i = 6; i >= 1; i--) six.push({ id: i, name: `V${i}`, pos: [i, 0, 0], target: [0, 0, 0] })
    const out = duplicateViews(six, new Set([6, 5, 4, 3, 2, 1]))
    assertEq(out.length, CAMERA_VIEWS_MAX, 'dup-sel: result capped at MAX')
    assertTrue(out[0].name.endsWith('copy'), 'dup-sel: a clone leads the capped result')
  }
  // purity: input array not mutated.
  {
    const src = [{ id: 1, name: 'A', pos: [1, 2, 3], target: [0, 0, 0] }]
    const snap = JSON.stringify(src)
    duplicateViews(src, new Set([1]))
    assertEq(JSON.stringify(src), snap, 'dup-sel: does not mutate input')
  }
}

console.log('PASS: duplicateViews — fork a selected subset (R41.H)')

// --- R41.H: selectIdRange — shift-click range-select core --------------
{
  const ids = [30, 20, 10, 5] // display order (newest-first)
  // inclusive range, anchor before target.
  assertEq(selectIdRange(ids, 30, 10), [30, 20, 10], 'range: anchor→target inclusive')
  // order-agnostic: same slice whichever end is the anchor.
  assertEq(selectIdRange(ids, 10, 30), [30, 20, 10], 'range: target→anchor same slice')
  // single-row range (anchor === target).
  assertEq(selectIdRange(ids, 20, 20), [20], 'range: anchor==target → single id')
  // full span.
  assertEq(selectIdRange(ids, 30, 5), [30, 20, 10, 5], 'range: full span')
  // anchor missing (e.g. the anchored row was deleted) → just the target.
  assertEq(selectIdRange(ids, 999, 10), [10], 'range: missing anchor → lone target')
  // target missing → [] (nothing to range to).
  assertEq(selectIdRange(ids, 30, 999), [], 'range: missing target → []')
  // non-array → [].
  assertEq(selectIdRange(null, 1, 2), [], 'range: non-array → []')
  // purity: input not mutated.
  {
    const src = [3, 2, 1]
    const snap = JSON.stringify(src)
    selectIdRange(src, 3, 1)
    assertEq(JSON.stringify(src), snap, 'range: does not mutate input')
  }
}

console.log('PASS: selectIdRange — shift-click range-select core (R41.H)')

// --- R42.H: removeViews — bulk-delete a selected subset ----------------
{
  const base = [
    { id: 30, name: 'c', pos: [3, 0, 0], target: [0, 0, 0] },
    { id: 20, name: 'b', pos: [2, 0, 0], target: [0, 0, 0] },
    { id: 10, name: 'a', pos: [1, 0, 0], target: [0, 0, 0] },
  ]
  // remove a subset (Set) — keeps the rest in order.
  {
    const out = removeViews(base, new Set([30, 10]))
    assertEq(out.map(v => v.id), [20], 'removeViews drops the selected ids')
  }
  // array input accepted (mirrors removeAttractors contract).
  {
    const out = removeViews(base, [20])
    assertEq(out.map(v => v.id), [30, 10], 'removeViews accepts an array idSet')
  }
  // iterable / generator input accepted.
  {
    function* gen() { yield 10; yield 20 }
    const out = removeViews(base, gen())
    assertEq(out.map(v => v.id), [30], 'removeViews accepts a generator idSet')
  }
  // empty selection → input ref unchanged (ref-equal-on-no-op).
  {
    const out = removeViews(base, new Set())
    assertTrue(out === base, 'empty idSet → same ref (no redundant save)')
  }
  // non-iterable idSet → ref unchanged.
  {
    const out = removeViews(base, null)
    assertTrue(out === base, 'non-iterable idSet → same ref')
  }
  // selected id not present → no-op, ref unchanged.
  {
    const out = removeViews(base, new Set([999]))
    assertTrue(out === base, 'absent id → same ref (silent no-op)')
  }
  // removing all → empty array.
  {
    const out = removeViews(base, new Set([10, 20, 30]))
    assertEq(out, [], 'removing every id → []')
  }
  // corrupt (null) rows always dropped, even with an empty selection.
  {
    const dirty = [{ id: 1, pos: [0, 0, 0] }, null, { id: 2, pos: [1, 1, 1] }]
    const out = removeViews(dirty, new Set())
    assertEq(out.map(v => v.id), [1, 2], 'corrupt rows dropped even on empty idSet')
    assertTrue(out !== dirty, 'cleanup means a fresh array (not the input ref)')
  }
  // non-array → [].
  assertEq(removeViews(null, new Set([1])), [], 'non-array views → []')
  // purity: input not mutated.
  {
    const snap = JSON.stringify(base)
    removeViews(base, new Set([20]))
    assertEq(JSON.stringify(base), snap, 'removeViews does not mutate input')
  }
}

console.log('PASS: removeViews — bulk-delete a selected subset (R42.H)')

// --- R43.H: select-all / clear header state --------------------------
{
  const ids = [10, 20, 30]
  // countSelected reconciles against the ordered ids.
  assertEq(countSelected(ids, new Set([10, 30])), 2, 'countSelected counts present ids')
  assertEq(countSelected(ids, new Set([10, 30, 99])), 2, 'countSelected ignores stale ids')
  assertEq(countSelected(ids, []), 0, 'countSelected empty selection → 0')
  assertEq(countSelected([], new Set([10])), 0, 'countSelected empty list → 0')
  assertEq(countSelected(ids, [20]), 1, 'countSelected accepts an array selection')
  // allIdsSelected.
  assertTrue(allIdsSelected(ids, new Set([10, 20, 30])), 'all selected → true')
  assertTrue(!allIdsSelected(ids, new Set([10, 20])), 'partial → not all')
  assertTrue(!allIdsSelected(ids, new Set()), 'none → not all')
  assertTrue(!allIdsSelected([], new Set()), 'empty list → not all (toggle reads off)')
  // a superset selection still counts as "all" (extra stale ids ignored).
  assertTrue(allIdsSelected(ids, new Set([10, 20, 30, 40])), 'superset still all')
  // someIdsSelected = strictly partial.
  assertTrue(someIdsSelected(ids, new Set([10])), 'one of three → indeterminate')
  assertTrue(someIdsSelected(ids, new Set([10, 20])), 'two of three → indeterminate')
  assertTrue(!someIdsSelected(ids, new Set([10, 20, 30])), 'all → not indeterminate')
  assertTrue(!someIdsSelected(ids, new Set()), 'none → not indeterminate')
  assertTrue(!someIdsSelected([], new Set()), 'empty list → not indeterminate')
  // toggleSelectAll: partial/none → select all; all → clear.
  {
    const fromNone = toggleSelectAll(ids, new Set())
    assertEq([...fromNone].sort((a, b) => a - b), [10, 20, 30], 'none → select all')
    const fromPartial = toggleSelectAll(ids, new Set([20]))
    assertEq([...fromPartial].sort((a, b) => a - b), [10, 20, 30], 'partial → select all (mail-client rule)')
    const fromAll = toggleSelectAll(ids, new Set([10, 20, 30]))
    assertEq([...fromAll], [], 'all → clear')
    const fromEmpty = toggleSelectAll([], new Set())
    assertEq([...fromEmpty], [], 'empty list → empty set')
  }
  // toggleSelectAll returns a FRESH set (never the input ref).
  {
    const sel = new Set([10, 20, 30])
    const out = toggleSelectAll(ids, sel)
    assertTrue(out !== sel, 'toggleSelectAll returns a fresh set')
  }
}

console.log('PASS: select-all / clear header state — countSelected/all/some/toggleSelectAll (R43.H)')

// --- R44.H: invert selection -----------------------------------------
{
  const ids = [10, 20, 30]
  // none selected → invert selects all (equivalent to select-all).
  {
    const out = invertSelection(ids, new Set())
    assertEq([...out].sort((a, b) => a - b), [10, 20, 30], 'invert: none → all')
  }
  // all selected → invert clears (equivalent to clear).
  {
    const out = invertSelection(ids, new Set([10, 20, 30]))
    assertEq([...out], [], 'invert: all → none')
  }
  // partial → the complement: {20} ticked → {10, 30}.
  {
    const out = invertSelection(ids, new Set([20]))
    assertEq([...out].sort((a, b) => a - b), [10, 30], 'invert: {20} → {10,30}')
  }
  // "all but these three" workflow: tick two, invert → the rest.
  {
    const out = invertSelection(ids, new Set([10, 30]))
    assertEq([...out], [20], 'invert: {10,30} → {20}')
  }
  // double-invert is the identity (within the selectable set).
  {
    const start = new Set([10])
    const once = invertSelection(ids, start)
    const twice = invertSelection(ids, once)
    assertEq([...twice].sort((a, b) => a - b), [10], 'invert: double-invert is identity')
  }
  // stale ids in the incoming set neither survive nor block valid flips.
  {
    const out = invertSelection(ids, new Set([20, 99]))
    assertEq([...out].sort((a, b) => a - b), [10, 30], 'invert: stale id 99 ignored')
    assertTrue(!out.has(99), 'invert: stale id never leaks into result')
  }
  // accepts an array selection (toIdSet normalises).
  {
    const out = invertSelection(ids, [10, 20])
    assertEq([...out], [30], 'invert: array selection → complement')
  }
  // empty / non-array ordered ids → empty set.
  assertEq([...invertSelection([], new Set([10]))], [], 'invert: empty list → empty')
  assertEq([...invertSelection(null, new Set([10]))], [], 'invert: non-array list → empty')
  // returns a FRESH set (never an input ref).
  {
    const sel = new Set([10])
    const out = invertSelection(ids, sel)
    assertTrue(out !== sel, 'invert: returns a fresh set')
  }
}

console.log('PASS: invert selection — complement / double-invert identity / stale-id reconcile (R44.H)')

// --- R45.H: rangeClick — header two-click range mode -----------------
{
  const ids = [10, 20, 30, 40, 50]
  // first click (no anchor) → arms the clicked row, selection unchanged.
  {
    const r = rangeClick(ids, null, 20, new Set())
    assertEq(r.pendingAnchorId, 20, 'range: first click arms anchor')
    assertTrue(r.completed === false, 'range: first click not completed')
    assertEq([...r.selected], [], 'range: first click leaves selection empty')
  }
  // second click → unions the inclusive block, disarms.
  {
    const r = rangeClick(ids, 20, 40, new Set())
    assertEq([...r.selected].sort((a, b) => a - b), [20, 30, 40], 'range: 20..40 selected')
    assertTrue(r.completed === true, 'range: second click completed')
    assertEq(r.pendingAnchorId, null, 'range: anchor disarmed after completion')
  }
  // order-agnostic: anchor below target gives the same block.
  {
    const r = rangeClick(ids, 40, 20, new Set())
    assertEq([...r.selected].sort((a, b) => a - b), [20, 30, 40], 'range: 40..20 same block')
  }
  // unions into the EXISTING selection (doesn't replace it).
  {
    const r = rangeClick(ids, 30, 50, new Set([10]))
    assertEq([...r.selected].sort((a, b) => a - b), [10, 30, 40, 50], 'range: unions into existing')
  }
  // anchor clicked again → single-row range (just that id).
  {
    const r = rangeClick(ids, 30, 30, new Set())
    assertEq([...r.selected], [30], 'range: same row → single-id range')
    assertTrue(r.completed === true, 'range: same-row still completes')
  }
  // stale armed anchor (deleted) → re-arms the new click as a fresh anchor.
  {
    const r = rangeClick(ids, 999, 20, new Set([10]))
    assertEq(r.pendingAnchorId, 20, 'range: stale anchor → re-arm new click')
    assertTrue(r.completed === false, 'range: stale anchor does not complete')
    assertEq([...r.selected], [10], 'range: stale anchor preserves selection')
  }
  // clicking a non-selectable id is ignored (anchor + selection preserved).
  {
    const r = rangeClick(ids, 20, 777, new Set([10]))
    assertEq(r.pendingAnchorId, 20, 'range: stray click keeps armed anchor')
    assertTrue(r.completed === false, 'range: stray click not completed')
    assertEq([...r.selected], [10], 'range: stray click preserves selection')
  }
  // accepts an array selection (toIdSet normalises).
  {
    const r = rangeClick(ids, 10, 30, [50])
    assertEq([...r.selected].sort((a, b) => a - b), [10, 20, 30, 50], 'range: array selection unioned')
  }
  // empty / non-array ordered ids → disarm, pass selection through.
  {
    const r = rangeClick([], 10, 20, new Set([10]))
    assertEq(r.pendingAnchorId, null, 'range: empty list disarms')
    assertEq([...r.selected], [10], 'range: empty list preserves selection')
  }
  // returns a FRESH set (never an input ref).
  {
    const sel = new Set([10])
    const r = rangeClick(ids, 20, 40, sel)
    assertTrue(r.selected !== sel, 'range: returns a fresh set')
    assertTrue(sel.size === 1, 'range: input selection not mutated')
  }
}

console.log('PASS: rangeClick — header two-click range mode (arm / complete / stale anchor / union) (R45.H)')

// --- R46.H: armRangeAnchor — arm the anchor from a specific row ---
{
  const ids = [10, 20, 30, 40, 50]
  // a valid selectable id is returned as the new pending anchor.
  assertEq(armRangeAnchor(ids, 30), 30, 'arm: valid row → that id is the anchor')
  assertEq(armRangeAnchor(ids, 10), 10, 'arm: first row armable')
  assertEq(armRangeAnchor(ids, 50), 50, 'arm: last row armable')
  // a stray / non-selectable id → null (caller ignores the gesture).
  assertEq(armRangeAnchor(ids, 999), null, 'arm: stray id → null')
  assertEq(armRangeAnchor(ids, undefined), null, 'arm: undefined id → null')
  assertEq(armRangeAnchor(ids, null), null, 'arm: null id → null')
  // empty / non-array roster → null.
  assertEq(armRangeAnchor([], 10), null, 'arm: empty roster → null')
  assertEq(armRangeAnchor(null, 10), null, 'arm: non-array roster → null')
  assertEq(armRangeAnchor(undefined, 10), null, 'arm: undefined roster → null')
  // string ids work too (id type-agnostic, uses indexOf).
  assertEq(armRangeAnchor(['a', 'b', 'c'], 'b'), 'b', 'arm: string id armable')
  assertEq(armRangeAnchor(['a', 'b', 'c'], 'z'), null, 'arm: missing string id → null')
  // the armed anchor feeds rangeClick: arming row 20 then clicking row 40
  // selects the inclusive block 20..40 (proves R46.H composes with R45.H).
  {
    const armed = armRangeAnchor(ids, 20)
    const r = rangeClick(ids, armed, 40, new Set())
    assertTrue(r.completed, 'arm→range: second click completes the block')
    assertEq([...r.selected].sort((a, b) => a - b).join(','), '20,30,40', 'arm→range: 20..40 selected')
  }
}

console.log('PASS: armRangeAnchor — arm the range anchor directly from a row (R46.H)')

// --- R47.H: rangePreviewSet — preview the pending range block ---------
{
  const ids = [10, 20, 30, 40, 50]
  const sortNums = (s) => [...s].sort((a, b) => a - b).join(',')
  assertEq(sortNums(rangePreviewSet(ids, 20, 40)), '20,30,40', 'preview: 20..40 inclusive')
  assertEq(sortNums(rangePreviewSet(ids, 40, 20)), '20,30,40', 'preview: order-agnostic')
  assertEq(sortNums(rangePreviewSet(ids, 30, 30)), '30', 'preview: same row → single')
  assertEq(rangePreviewSet(ids, null, 40).size, 0, 'preview: no anchor → empty')
  assertEq(rangePreviewSet(ids, 20, null).size, 0, 'preview: no hover → empty')
  assertEq(rangePreviewSet(ids, 999, 40).size, 0, 'preview: stale anchor → empty')
  assertEq(rangePreviewSet(ids, 20, 999).size, 0, 'preview: stale hover → empty')
  assertEq(rangePreviewSet([], 1, 2).size, 0, 'preview: empty roster → empty')
  assertEq(rangePreviewSet(null, 1, 2).size, 0, 'preview: non-array roster → empty')
  // matches what rangeClick would select (preview never lies).
  {
    const previewed = rangePreviewSet(ids, 20, 40)
    const r = rangeClick(ids, 20, 40, new Set())
    assertEq(sortNums(previewed), sortNums(new Set([...r.selected])), 'preview: matches rangeClick result')
  }
}
console.log('PASS: rangePreviewSet — preview the pending range block before commit (R47.H)')

// --- R48.H: rangePreviewCount — block size for the hovered-row chip ----
{
  const ids = [10, 20, 30, 40, 50]
  assertEq(rangePreviewCount(ids, 20, 40), 3, 'count: 20..40 → 3')
  assertEq(rangePreviewCount(ids, 40, 20), 3, 'count: order-agnostic')
  assertEq(rangePreviewCount(ids, 10, 50), 5, 'count: full span')
  assertEq(rangePreviewCount(ids, 30, 30), 1, 'count: same row → 1')
  assertEq(rangePreviewCount(ids, null, 40), 0, 'count: no anchor → 0')
  assertEq(rangePreviewCount(ids, 20, null), 0, 'count: no hover → 0')
  assertEq(rangePreviewCount(ids, 999, 40), 0, 'count: stale anchor → 0')
  assertEq(rangePreviewCount([], 1, 2), 0, 'count: empty roster → 0')
  assertEq(rangePreviewCount(null, 1, 2), 0, 'count: non-array → 0')
  // count never disagrees with the previewed set's size.
  assertEq(rangePreviewCount(ids, 20, 40), rangePreviewSet(ids, 20, 40).size, 'count: equals set size')
}
console.log('PASS: rangePreviewCount — block size for the hovered-row chip (R48.H)')

// --- R49.H/R50.H: rangePreviewTier — flag large (10+) / huge (20+) ranges ---
{
  assertEq(RANGE_PREVIEW_LARGE_AT, 10, 'tier: large threshold exposed as 10')
  assertEq(RANGE_PREVIEW_HUGE_AT, 20, 'tier: huge threshold exposed as 20')
  assertEq(rangePreviewTier(2), 'normal', 'tier: 2 rows normal')
  assertEq(rangePreviewTier(9), 'normal', 'tier: 9 just below large')
  assertEq(rangePreviewTier(10), 'large', 'tier: 10 hits large')
  assertEq(rangePreviewTier(19), 'large', 'tier: 19 just below huge')
  assertEq(rangePreviewTier(20), 'huge', 'tier: 20 hits huge')
  assertEq(rangePreviewTier(40), 'huge', 'tier: 40 huge')
  assertEq(rangePreviewTier(0), 'normal', 'tier: 0 normal')
  assertEq(rangePreviewTier(-5), 'normal', 'tier: negative normal')
  assertEq(rangePreviewTier(NaN), 'normal', 'tier: NaN normal')
  assertEq(rangePreviewTier('x'), 'normal', 'tier: non-numeric normal')
  // R50.H — style bundles distinct per tier, unknown → normal
  const sn = rangeTierStyle('normal'), sl = rangeTierStyle('large'), sh = rangeTierStyle('huge')
  assertTrue(sn.fg !== sl.fg && sl.fg !== sh.fg && sn.fg !== sh.fg, 'tier: each tier a distinct fg')
  assertTrue(sh.border.includes('239,68,68'), 'tier: huge wears red border')
  assertEq(rangeTierStyle('bogus').fg, sn.fg, 'tier: unknown → normal style')
  assertEq(rangeTierStyle(undefined).fg, sn.fg, 'tier: undefined → normal style')
}
console.log('PASS: rangePreviewTier — large/huge 3-tier warning (R49.H/R50.H)')

// R51.H — rangeDeleteConfirmMessage escalates copy by tier
{
  const normal = rangeDeleteConfirmMessage(3)
  assertTrue(normal.includes('Delete 3') && !normal.includes('HUGE') && !normal.includes('large'), 'confirm: 3 rows plain')
  assertTrue(normal.includes('camera views'), 'confirm: pluralises')
  assertTrue(rangeDeleteConfirmMessage(1).includes('camera view?'), 'confirm: singular at 1')
  const large = rangeDeleteConfirmMessage(12)
  assertTrue(large.includes('12') && large.includes('large'), 'confirm: 12 rows large copy')
  const huge = rangeDeleteConfirmMessage(30)
  assertTrue(huge.includes('30') && huge.includes('HUGE'), 'confirm: 30 rows huge copy')
  assertTrue(huge.startsWith('DELETE'), 'confirm: huge shouts')
  assertTrue(rangeDeleteConfirmMessage(0).length > 0, 'confirm: 0 still a string')
  assertTrue(rangeDeleteConfirmMessage(NaN).length > 0, 'confirm: NaN guarded')
}
console.log('PASS: rangeDeleteConfirmMessage — tier-escalated confirm copy (R51.H)')

// R52.H — type-to-confirm friction gate for a 30+ prune
{
  // threshold: 30+ needs the typed gate; 29 and below keep one-click confirm
  assertTrue(rangeNeedsTypeConfirm(30) === true, 'type-gate: 30 needs typed phrase')
  assertTrue(rangeNeedsTypeConfirm(45) === true, 'type-gate: 45 needs typed phrase')
  assertTrue(rangeNeedsTypeConfirm(29) === false, 'type-gate: 29 stays one-click')
  assertTrue(rangeNeedsTypeConfirm(20) === false, 'type-gate: huge-tier 20 stays one-click')
  assertTrue(rangeNeedsTypeConfirm(0) === false, 'type-gate: 0 → false')
  assertTrue(rangeNeedsTypeConfirm(NaN) === false, 'type-gate: NaN → false')
  assertTrue(rangeNeedsTypeConfirm(-5) === false, 'type-gate: negative → false')
  assertEq(RANGE_TYPE_CONFIRM_AT, 30, 'type-gate threshold sits above huge tier (20)')
  // matching is case-insensitive + trimmed; null/blank/wrong → false
  assertTrue(matchesRangeConfirmPhrase('DELETE') === true, 'phrase: exact match')
  assertTrue(matchesRangeConfirmPhrase('delete') === true, 'phrase: lowercase match')
  assertTrue(matchesRangeConfirmPhrase('  Delete  ') === true, 'phrase: trimmed + mixed case')
  assertTrue(matchesRangeConfirmPhrase('delet') === false, 'phrase: partial → false')
  assertTrue(matchesRangeConfirmPhrase('') === false, 'phrase: blank → false')
  assertTrue(matchesRangeConfirmPhrase(null) === false, 'phrase: null → false')
  assertTrue(matchesRangeConfirmPhrase(undefined) === false, 'phrase: undefined → false')
  assertTrue(matchesRangeConfirmPhrase('yes') === false, 'phrase: wrong word → false')
  assertTrue(matchesRangeConfirmPhrase('STOP', 'stop') === true, 'phrase: custom phrase honoured')
  // prompt copy names the count + the phrase, always non-empty + pluralises
  const p = rangeTypeConfirmPrompt(42)
  assertTrue(p.includes('42') && p.includes('DELETE'), 'prompt: names count + phrase')
  assertTrue(p.includes('camera views'), 'prompt: pluralises')
  assertTrue(rangeTypeConfirmPrompt(1).includes('camera view.') || rangeTypeConfirmPrompt(1).includes('1 camera view'), 'prompt: singular at 1')
  assertTrue(rangeTypeConfirmPrompt(NaN).length > 0, 'prompt: NaN guarded')
}
console.log('PASS: rangeNeedsTypeConfirm / matchesRangeConfirmPhrase / rangeTypeConfirmPrompt — type-DELETE gate (R52.H)')

// R53.H — live char-match progress for the inline type-DELETE gate. The
// tick fills green as the phrase is typed and goes off-track on a typo.
// Matching mirrors matchesRangeConfirmPhrase (trim + case-insensitive).
{
  const P = RANGE_CONFIRM_PHRASE // 'DELETE'
  // empty input → zero matched, full total, onTrack (nothing wrong yet)
  const e0 = rangeConfirmMatchProgress('', P)
  assertEq(e0.matched, 0, 'progress: empty → 0 matched')
  assertEq(e0.total, P.length, 'progress: total == phrase length')
  assertTrue(e0.complete === false, 'progress: empty not complete')
  assertTrue(e0.onTrack === true, 'progress: empty is on-track')
  // a correct prefix counts up + stays on-track
  const d1 = rangeConfirmMatchProgress('DEL', P)
  assertEq(d1.matched, 3, 'progress: "DEL" → 3 matched')
  assertTrue(d1.onTrack === true, 'progress: correct prefix on-track')
  assertTrue(d1.complete === false, 'progress: partial not complete')
  // case-insensitive prefix (mirrors the arm decision)
  const lc = rangeConfirmMatchProgress('del', P)
  assertEq(lc.matched, 3, 'progress: lowercase prefix matches')
  assertTrue(lc.onTrack === true, 'progress: lowercase on-track')
  // full phrase → complete (and == matchesRangeConfirmPhrase)
  const full = rangeConfirmMatchProgress('DELETE', P)
  assertEq(full.matched, P.length, 'progress: full phrase fully matched')
  assertTrue(full.complete === true, 'progress: full phrase complete')
  assertEq(full.complete, matchesRangeConfirmPhrase('DELETE', P), 'progress: complete agrees with arm decision')
  // trimmed match arms too (mirrors matchesRangeConfirmPhrase trim)
  const trimmed = rangeConfirmMatchProgress('  delete  ', P)
  assertTrue(trimmed.complete === true, 'progress: trimmed lowercase completes')
  assertEq(trimmed.complete, matchesRangeConfirmPhrase('  delete  ', P), 'progress: trimmed agrees with arm decision')
  // a TYPO diverges immediately → off-track, matched stops at the good run
  const typo = rangeConfirmMatchProgress('DELXTE', P)
  assertEq(typo.matched, 3, 'progress: typo at index 3 → 3 matched')
  assertTrue(typo.onTrack === false, 'progress: typo goes off-track')
  assertTrue(typo.complete === false, 'progress: typo not complete')
  // wrong first char → 0 matched, off-track
  const wrong = rangeConfirmMatchProgress('X', P)
  assertEq(wrong.matched, 0, 'progress: wrong first char → 0 matched')
  assertTrue(wrong.onTrack === false, 'progress: wrong first char off-track')
  // overtyped past the phrase (correct prefix but too long) → off-track
  const over = rangeConfirmMatchProgress('DELETEX', P)
  assertEq(over.matched, P.length, 'progress: overtype matched caps at phrase length')
  assertTrue(over.onTrack === false, 'progress: overtype is off-track')
  assertTrue(over.complete === false, 'progress: overtype not complete')
  // defensive: non-string input → empty-ish, on-track
  const ns = rangeConfirmMatchProgress(null, P)
  assertEq(ns.matched, 0, 'progress: null → 0 matched')
  assertTrue(ns.onTrack === true, 'progress: null is on-track (nothing typed)')
  // custom phrase honoured
  const cust = rangeConfirmMatchProgress('sto', 'stop')
  assertEq(cust.matched, 3, 'progress: custom phrase prefix matches')
  assertEq(cust.total, 4, 'progress: custom phrase total')
}
console.log('PASS: rangeConfirmMatchProgress — live type-DELETE char tick (R53.H)')
