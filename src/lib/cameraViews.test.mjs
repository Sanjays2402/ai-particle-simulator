// cameraViews utility tests — verify append behavior, dedup, max cap.
// Run via: node src/lib/cameraViews.test.mjs (uses an in-memory shim
// since cameraViews.js touches localStorage via the load/save fns).
import {
  appendView, moveView, moveViewUp, moveViewDown, removeView, CAMERA_VIEWS_MAX,
  // R22.12 — pure helper for touch-drag reorder (graduates R17.07 desktop-only)
  resolveTouchTargetIdx,
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
