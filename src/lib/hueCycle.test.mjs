// Hue cycle: confirm cycles-per-minute math wraps cleanly and the
// per-frame offset is in [0,1). Catches regressions if we ever switch
// units (cps vs cpm) or forget the modulo.

function hueOffset(t, cpm) {
  return ((t * (cpm / 60)) % 1 + 1) % 1
}

function assertClose(a, b, label, tol = 1e-9) {
  if (Math.abs(a - b) > tol) {
    console.error(`FAIL: ${label} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

function assertRange(v, label) {
  if (v < 0 || v >= 1) {
    console.error(`FAIL: ${label} — value ${v} outside [0,1)`)
    process.exit(1)
  }
}

// 1. At t=0, offset is 0.
assertClose(hueOffset(0, 6), 0, 't=0')

// 2. A speed of 60 cpm means exactly one cycle per second → at t=1s, back to 0.
assertClose(hueOffset(1, 60), 0, 'one cycle per second at t=1')

// 3. 6 cpm = 1 cycle / 10s; at t=5s we're at 0.5.
assertClose(hueOffset(5, 6), 0.5, 'half cycle at t=5, 6cpm')

// 4. Always returns a value in [0,1).
for (let i = 0; i < 1000; i++) {
  const t = Math.random() * 3600
  const cpm = 0.5 + Math.random() * 30
  assertRange(hueOffset(t, cpm), `random t=${t} cpm=${cpm}`)
}

// 5. Negative-ish time (clock drift) should still be in range.
assertRange(hueOffset(-12.345, 6), 'negative t handling')

console.log('PASS: hueCycle offset math')
