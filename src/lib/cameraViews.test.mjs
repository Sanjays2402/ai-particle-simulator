// cameraViews utility tests — verify append behavior, dedup, max cap.
// Run via: node src/lib/cameraViews.test.mjs (uses an in-memory shim
// since cameraViews.js touches localStorage via the load/save fns).
import { appendView, CAMERA_VIEWS_MAX } from './cameraViews.js'

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

console.log('PASS: cameraViews append/dedupe/cap')
