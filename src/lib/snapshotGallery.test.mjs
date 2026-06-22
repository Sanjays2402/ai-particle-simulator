// snapshotGallery: cap, dedupe-by-id, removal. Capture is DOM-touching
// so we don't run it here, but the bookkeeping helpers below are pure.
import {
  appendSnapshot, removeSnapshot, removeSnapshots, MAX_SNAPSHOTS,
} from './snapshotGallery.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(c, m) { if (!c) fail(m) }

function mkEntry(label) {
  return { thumb: 'data:image/jpeg;base64,...', png: 'data:image/png;base64,...', w: 800, h: 600, label }
}

// 1. First append assigns id 1, fills required fields.
{
  const out = appendSnapshot([], mkEntry('first'))
  assertEq(out.length, 1, 'one item')
  assertEq(out[0].id, 1, 'id is 1')
  if (!out[0].createdAt) { console.error('FAIL: createdAt was not set'); process.exit(1) }
}

// 2. Subsequent appends increment id and prepend (newest first).
{
  let v = []
  for (let i = 0; i < 4; i++) v = appendSnapshot(v, mkEntry(`s${i}`))
  assertEq(v.map(x => x.id), [4, 3, 2, 1], 'ids prepended newest first')
  assertEq(v[0].label, 's3', 'newest at index 0')
}

// 3. Cap at MAX_SNAPSHOTS — oldest is dropped.
{
  let v = []
  for (let i = 0; i < MAX_SNAPSHOTS + 4; i++) v = appendSnapshot(v, mkEntry(`s${i}`))
  assertEq(v.length, MAX_SNAPSHOTS, `cap at ${MAX_SNAPSHOTS}`)
  // Newest has the highest id, equal to total inserts.
  assertEq(v[0].id, MAX_SNAPSHOTS + 4, 'newest id reflects total inserts')
}

// 4. Removal by id keeps order of the rest.
{
  let v = []
  for (let i = 0; i < 5; i++) v = appendSnapshot(v, mkEntry(`s${i}`))
  const before = v.map(x => x.id) // [5,4,3,2,1]
  v = removeSnapshot(v, 3)
  assertEq(v.map(x => x.id), before.filter(id => id !== 3), 'preserves order')
  // Removing a non-existent id is a no-op.
  const same = removeSnapshot(v, 999)
  assertEq(same.map(x => x.id), v.map(x => x.id), 'unknown id is no-op')
}

// 5. R18.06 — removeSnapshots: bulk delete by id set.
{
  let v = []
  for (let i = 0; i < 5; i++) v = appendSnapshot(v, mkEntry(`s${i}`))
  // Ids are [5,4,3,2,1] (newest first).
  const before = v.map(x => x.id)
  // Set input — drops both matched ids in one call, preserves order.
  const out1 = removeSnapshots(v, new Set([2, 4]))
  assertEq(out1.map(x => x.id), before.filter(id => id !== 2 && id !== 4), 'Set: drops both matches, preserves order')
  // Array input — same semantics.
  const out2 = removeSnapshots(v, [2, 4])
  assertEq(out2.map(x => x.id), out1.map(x => x.id), 'Array: same result as Set')
  // Iterable (generator) input.
  function* gen() { yield 2; yield 4 }
  const out3 = removeSnapshots(v, gen())
  assertEq(out3.map(x => x.id), out1.map(x => x.id), 'Generator: same result as Set/Array')
  // No-op (no matches): returns input REF unchanged so React/zustand
  // can skip a redundant write.
  const out4 = removeSnapshots(v, [999, 1000])
  ok(out4 === v, 'no matches → ref-equal input (skip redundant save)')
  // Empty Set is also a no-op.
  const out5 = removeSnapshots(v, new Set())
  ok(out5 === v, 'empty set → ref-equal input')
  // null / undefined idSet → ref-equal input.
  ok(removeSnapshots(v, null) === v,      'null idSet → ref-equal input')
  ok(removeSnapshots(v, undefined) === v, 'undefined idSet → ref-equal input')
  // Non-iterable scalar → ref-equal input.
  ok(removeSnapshots(v, 42) === v, 'number idSet → ref-equal input (non-iterable)')
  // Non-array items input → empty array.
  assertEq(removeSnapshots(null, [1]), [], 'non-array items → []')
  assertEq(removeSnapshots(undefined, [1]), [], 'undefined items → []')
  // Drop ALL ids → empty array (still changed, not ref-equal).
  const out6 = removeSnapshots(v, before)
  assertEq(out6.length, 0, 'drop all → empty')
  ok(out6 !== v, 'drop all → fresh array (not ref-equal)')
  // Mixed valid + invalid ids — only valid hits count, but still
  // dirty so we return a fresh array (would be a useless return-ref
  // semantic if a stray garbage id forced ref-equal failures).
  const out7 = removeSnapshots(v, new Set([2, 999]))
  assertEq(out7.map(x => x.id), before.filter(id => id !== 2), 'mixed valid+invalid → drops valid')
  // Corrupt rows (null entries) are dropped as a side-effect — same
  // contract as removeAttractors (R17.17): keeping known-bad rows
  // alive just for ref-equal would be the wrong trade-off.
  const dirty = [{ id: 1 }, null, { id: 2 }, undefined, { id: 3 }]
  const out8 = removeSnapshots(dirty, [2])
  assertEq(out8.map(x => x.id), [1, 3], 'corrupt rows dropped alongside the targeted id')
}

console.log(`PASS: snapshotGallery append/cap/remove/removeSnapshots · MAX=${MAX_SNAPSHOTS} (incl. R18.06 bulk delete)`)
