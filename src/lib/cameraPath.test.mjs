// cameraPath: clamp + smoothstep + lerpVec3 + tick state machine + sample + duration.
import {
  smoothstep, clampSeconds, lerpVec3, tickPath, samplePath, pathDuration, startState,
  PATH_SECONDS_MIN, PATH_SECONDS_MAX, PATH_SECONDS_DEFAULT, PATH_MIN_WAYPOINTS,
} from './cameraPath.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) fail(`${m} — got ${A} expected ${B}`)
}
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- smoothstep ---
eq(smoothstep(0),   0, 'smoothstep(0)=0')
eq(smoothstep(1),   1, 'smoothstep(1)=1')
near(smoothstep(0.5), 0.5, 'smoothstep(0.5)=0.5')
eq(smoothstep(-1),  0, 'smoothstep below 0 → 0')
eq(smoothstep(2),   1, 'smoothstep above 1 → 1')
eq(smoothstep(NaN), 0, 'smoothstep(NaN)=0')
// derivative at endpoints must be near 0 — that's the whole point of
// smoothstep. Using a small epsilon so the secant approximation is
// dominated by the o(eps) term; 0.005 is comfortably above the
// numerical-derivative noise floor.
const epsilon = 1e-3
near((smoothstep(epsilon) - smoothstep(0)) / epsilon, 0, 'derivative at 0', 0.005)
near((smoothstep(1) - smoothstep(1 - epsilon)) / epsilon, 0, 'derivative at 1', 0.005)

// --- clampSeconds ---
eq(clampSeconds(2), 2, 'clampSeconds in range')
eq(clampSeconds(PATH_SECONDS_MIN - 1), PATH_SECONDS_MIN, 'clampSeconds clamps below')
eq(clampSeconds(PATH_SECONDS_MAX + 5), PATH_SECONDS_MAX, 'clampSeconds clamps above')
eq(clampSeconds(NaN), PATH_SECONDS_DEFAULT, 'clampSeconds NaN → default')

// --- lerpVec3 ---
eq(lerpVec3([0,0,0], [10,20,30], 0),   [0,0,0],     'lerp t=0 → A')
eq(lerpVec3([0,0,0], [10,20,30], 1),   [10,20,30],  'lerp t=1 → B')
// t=0.5 with smoothstep is exactly 0.5 (3*0.25 - 2*0.125 = 0.5)
eq(lerpVec3([0,0,0], [10,20,30], 0.5), [5, 10, 15], 'lerp t=0.5 → midpoint via smoothstep')
eq(lerpVec3('nope', [1,2,3], 0.5), [0,0,0], 'lerp bad args → zero vec')
eq(lerpVec3([1,2], [3,4,5], 0.5), [0,0,0], 'lerp wrong-length args → zero vec')

// --- pathDuration ---
const WP3 = [
  { pos: [0,0,0], target: [0,0,0] },
  { pos: [1,0,0], target: [0,1,0] },
  { pos: [2,0,0], target: [0,2,0] },
]
eq(pathDuration(WP3, 4, false), 8,  'duration: 3 waypoints × 4s × non-loop → 8s')
eq(pathDuration(WP3, 4, true),  12, 'duration: 3 waypoints × 4s × loop → 12s')
eq(pathDuration([], 4, true),    0, 'duration: empty → 0')
eq(pathDuration([WP3[0]], 4, true), 0, 'duration: 1 waypoint < min → 0')

// --- tickPath: walks segments, marks finished, supports loop ---
{
  const path = { waypoints: WP3, secondsPerSegment: 2, loop: false }
  let s = startState()
  // Half a segment in.
  s = tickPath(s, path, 1)
  eq(s.segmentIdx, 0, 'tick: half segment → still seg 0')
  near(s.segmentT, 0.5, 'tick: half segment → t=0.5')
  if (s.finished) fail('half segment should not be finished')
  // Cross the segment boundary (1.5s more → t=1.25 → idx=1, t=0.25).
  s = tickPath(s, path, 1.5)
  eq(s.segmentIdx, 1, 'tick: crossed to seg 1')
  near(s.segmentT, 0.25, 'tick: leftover t after boundary')
  // March to the end (1.5s more → t=0.25 + 0.75 = 1.0 → finished).
  s = tickPath(s, path, 1.5)
  if (!s.finished) fail('expected finished after walking entire non-loop path')
  eq(s.segmentIdx, 1, 'tick: finished holds last segment idx')
  eq(s.segmentT,   1, 'tick: finished snaps to t=1')
  // Once finished, further ticks are no-ops.
  const s2 = tickPath(s, path, 100)
  eq(s2, s, 'tick: finished state is idempotent')
}

// --- tickPath: loop mode wraps without finishing ---
{
  const path = { waypoints: WP3, secondsPerSegment: 1, loop: true }
  let s = startState()
  // 3 segs (loop), 1s each → 3.5s should wrap to seg 0 with t=0.5.
  s = tickPath(s, path, 3.5)
  eq(s.segmentIdx, 0, 'tick loop: wraps to seg 0')
  near(s.segmentT, 0.5, 'tick loop: t carries over wrap')
  if (s.finished) fail('loop mode never marks finished')
}

// --- tickPath: degenerate paths ---
{
  // Single waypoint → finished immediately.
  const s = tickPath(startState(), { waypoints: [WP3[0]], secondsPerSegment: 1, loop: false }, 0.5)
  if (!s.finished) fail('expected finished for single-waypoint path')
}

// --- samplePath at fractional positions ---
{
  const path = { waypoints: WP3, loop: false }
  // Start of seg 0 → exactly waypoint 0.
  let p = samplePath({ segmentIdx: 0, segmentT: 0, finished: false }, path)
  eq(p.pos, [0,0,0], 'sample start of seg 0 → wp 0 pos')
  eq(p.target, [0,0,0], 'sample start of seg 0 → wp 0 target')
  // End of seg 0 → waypoint 1.
  p = samplePath({ segmentIdx: 0, segmentT: 1, finished: false }, path)
  eq(p.pos, [1,0,0], 'sample end of seg 0 → wp 1 pos')
  // Mid of seg 1 (smoothstep midpoint = 0.5) → average of wp1 + wp2.
  p = samplePath({ segmentIdx: 1, segmentT: 0.5, finished: false }, path)
  near(p.pos[0], 1.5, 'sample mid seg 1 x')
  near(p.target[1], 1.5, 'sample mid seg 1 target y')
}

// --- samplePath: loop wraps the next-waypoint index ---
{
  const path = { waypoints: WP3, loop: true }
  // On the last segment in a loop (segmentIdx = 2), should lerp from wp[2] to wp[0].
  const p = samplePath({ segmentIdx: 2, segmentT: 0.5, finished: false }, path)
  near(p.pos[0], 1.0, 'sample loop final seg: midpoint of wp2.x=2 and wp0.x=0 → 1.0')
}

// --- samplePath: malformed inputs ---
eq(samplePath(null, { waypoints: WP3, loop: false }), null, 'sample: null state → null')
eq(samplePath(startState(), { waypoints: [], loop: false }), null, 'sample: empty waypoints → null')
eq(samplePath(startState(), { waypoints: [WP3[0]], loop: false }), null, 'sample: too-few waypoints → null')

if (PATH_MIN_WAYPOINTS !== 2) fail(`expected min waypoints 2, got ${PATH_MIN_WAYPOINTS}`)
console.log(`PASS: cameraPath — smoothstep, lerpVec3, tick/sample/duration · seconds [${PATH_SECONDS_MIN}, ${PATH_SECONDS_MAX}], default=${PATH_SECONDS_DEFAULT}`)
