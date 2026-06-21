// cameraViews utility tests — verify append behavior, dedup, max cap.
// Run via: node src/lib/cameraViews.test.mjs (uses an in-memory shim
// since cameraViews.js touches localStorage via the load/save fns).
import {
  appendView, moveView, moveViewUp, moveViewDown, removeView, CAMERA_VIEWS_MAX,
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
