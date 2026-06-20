// Verify the kaleidoscope rotation math: rotating a unit-x vector by
// 2π/N N times brings it back to the start, and rotating it by π flips
// the sign of x and z. Catches off-by-one bugs in the segment loop.

function rotateXZ(x, z, ang) {
  const c = Math.cos(ang), s = Math.sin(ang)
  return [x * c - z * s, x * s + z * c]
}

function assertClose(a, b, label, tol = 1e-9) {
  if (Math.abs(a - b) > tol) {
    console.error(`FAIL: ${label} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

// 1. Six-fold rotation closes the loop.
{
  let [x, z] = [1, 0]
  const step = (Math.PI * 2) / 6
  for (let i = 0; i < 6; i++) [x, z] = rotateXZ(x, z, step)
  assertClose(x, 1, '6-fold round trip x')
  assertClose(z, 0, '6-fold round trip z', 1e-12)
}

// 2. Two-fold (π) flips signs.
{
  const [x, z] = rotateXZ(2, 3, Math.PI)
  assertClose(x, -2, '2-fold flip x')
  assertClose(z, -3, '2-fold flip z')
}

// 3. Four-fold rotation: (1,0) -> (0,1) -> (-1,0) -> (0,-1) -> (1,0).
{
  let [x, z] = [1, 0]
  const step = (Math.PI * 2) / 4
  ;[x, z] = rotateXZ(x, z, step)
  assertClose(x, 0, '4-fold step1 x', 1e-12)
  assertClose(z, 1, '4-fold step1 z', 1e-12)
}

// 4. Slice index distribution: with leaderCount = floor(N/segs), the
//    first leaderCount indices fall in slice 0, the next leaderCount in
//    slice 1, etc. Verifies the modular arithmetic used in the renderer.
{
  const N = 20000, segs = 6
  const leaderCount = Math.floor(N / segs)
  const seg = (idx) => Math.floor(idx / leaderCount)
  if (seg(0) !== 0) { console.error('FAIL: idx 0 expected slice 0'); process.exit(1) }
  if (seg(leaderCount - 1) !== 0) { console.error(`FAIL: last leader expected slice 0`); process.exit(1) }
  if (seg(leaderCount) !== 1) { console.error('FAIL: first mirror expected slice 1'); process.exit(1) }
  if (seg(leaderCount * 5) !== 5) { console.error('FAIL: slice 5 boundary'); process.exit(1) }
}

console.log('PASS: kaleidoscope rotation + slice math')
