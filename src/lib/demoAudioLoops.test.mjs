// demoAudioLoops: cover the pure-math helpers + loop lifecycle without
// touching real WebAudio. We stub a minimal AudioContext + node graph
// to keep this Node-runnable.
import {
  midiToHz, createLoop, DEMO_LOOPS, STEP_COUNT,
} from './demoAudioLoops.js'

function assertClose(a, b, label, tol = 1e-6) {
  if (Math.abs(a - b) > tol) {
    console.error(`FAIL: ${label} — got ${a} expected ${b}`)
    process.exit(1)
  }
}
function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected)
  if (a !== b) {
    console.error(`FAIL: ${msg} — got ${a} expected ${b}`)
    process.exit(1)
  }
}

// 1. midiToHz returns A4 = 440 Hz, A5 = 880, A3 = 220.
assertClose(midiToHz(69), 440, 'A4 = 440 Hz')
assertClose(midiToHz(81), 880, 'A5 = 880 Hz')
assertClose(midiToHz(57), 220, 'A3 = 220 Hz')

// 2. Loop catalog has the expected ids + every entry has label + desc.
const ids = DEMO_LOOPS.map(l => l.id).sort()
assertEq(ids, ['ambient', 'arp', 'bass', 'pulse'], 'all four loop ids present')
for (const l of DEMO_LOOPS) {
  if (!l.label || !l.desc) {
    console.error(`FAIL: loop ${l.id} missing label or desc`)
    process.exit(1)
  }
}

// 3. createLoop on a missing / unknown kind returns null safely.
assertEq(createLoop(null, 'pulse'), null, 'null ctx returns null')
{
  const fakeCtx = mkFakeCtx()
  assertEq(createLoop(fakeCtx, 'nonexistent'), null, 'unknown kind returns null')
}

// 4. createLoop wires up a node graph and stop() is idempotent.
{
  const ctx = mkFakeCtx()
  const loop = createLoop(ctx, 'pulse')
  if (!loop || !loop.node) { console.error('FAIL: pulse loop did not build'); process.exit(1) }
  assertEq(loop.kind, 'pulse', 'kind round-trips')
  // First bar should have scheduled at least one kick (pulse pattern
  // has 5 active steps out of 16). Each kick creates 1 oscillator + 1
  // gain at minimum; fake ctx tallies these.
  if (ctx._counters.oscillators < 5) {
    console.error(`FAIL: pulse scheduled too few oscillators (${ctx._counters.oscillators})`)
    process.exit(1)
  }
  loop.stop()
  loop.stop()  // double-stop must be safe
}

// 5. Other loop kinds also schedule something.
for (const id of ['bass', 'arp', 'ambient']) {
  const ctx = mkFakeCtx()
  const loop = createLoop(ctx, id)
  if (!loop) { console.error(`FAIL: ${id} loop did not build`); process.exit(1) }
  if (ctx._counters.oscillators === 0) {
    console.error(`FAIL: ${id} scheduled no oscillators in first bar`)
    process.exit(1)
  }
  loop.stop()
}

// 6. STEP_COUNT is the documented 16.
assertEq(STEP_COUNT, 16, 'pattern length matches')

console.log(`PASS: demoAudioLoops — ${DEMO_LOOPS.length} kinds · ${STEP_COUNT} steps`)

// --- helpers ---

function mkFakeCtx() {
  const counters = { oscillators: 0, gains: 0, filters: 0 }
  const fakeParam = () => ({
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    cancelScheduledValues: () => {},
    value: 0,
  })
  const fakeNode = () => ({
    connect: (n) => n,
    disconnect: () => {},
    start: () => {},
    stop: () => {},
    gain: fakeParam(),
    frequency: fakeParam(),
    type: 'sine',
  })
  return {
    currentTime: 0,
    _counters: counters,
    createOscillator() { counters.oscillators++; return fakeNode() },
    createGain()       { counters.gains++; return fakeNode() },
    createBiquadFilter() { counters.filters++; return fakeNode() },
  }
}
