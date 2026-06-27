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
} from './cameraViews.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
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
