// snapshotGallery: cap, dedupe-by-id, removal. Capture is DOM-touching
// so we don't run it here, but the bookkeeping helpers below are pure.
import {
  appendSnapshot, removeSnapshot, MAX_SNAPSHOTS,
} from './snapshotGallery.js'

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

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

console.log(`PASS: snapshotGallery append/cap/remove · MAX=${MAX_SNAPSHOTS}`)
