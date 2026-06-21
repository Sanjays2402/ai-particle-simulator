// crossfade: clamp, smoothstep, tickProgress, duration chips.
import {
  clampSeconds, smoothstep, tickProgress,
  BLEND_MIN_SEC, BLEND_MAX_SEC,
  DURATION_CHIPS, matchDurationChip,
} from './crossfade.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- clampSeconds ---
eq(clampSeconds(2), 2, 'in-range value preserved')
eq(clampSeconds(0), BLEND_MIN_SEC, 'zero clamped to min')
eq(clampSeconds(99), BLEND_MAX_SEC, 'huge clamped to max')
eq(clampSeconds(NaN), 2, 'NaN → 2 default')
eq(clampSeconds(-5), BLEND_MIN_SEC, 'negative clamped to min')
eq(clampSeconds(Infinity), 2, 'Infinity is non-finite → 2 default')

// --- smoothstep ---
near(smoothstep(0), 0, 'smoothstep(0) = 0')
near(smoothstep(1), 1, 'smoothstep(1) = 1')
near(smoothstep(0.5), 0.5, 'smoothstep(0.5) = 0.5 (symmetric)')
// Edges flatten faster than linear.
const s25 = smoothstep(0.25)
if (s25 >= 0.25) fail(`smoothstep(0.25) should be < 0.25 (eased), got ${s25}`)
const s75 = smoothstep(0.75)
if (s75 <= 0.75) fail(`smoothstep(0.75) should be > 0.75 (eased), got ${s75}`)
// Monotonic — never goes backwards.
let prev = -Infinity
for (let i = 0; i <= 20; i++) {
  const v = smoothstep(i / 20)
  if (v < prev) fail(`smoothstep not monotonic at ${i / 20}`)
  prev = v
}
// Out-of-range clamps to bounds.
eq(smoothstep(-1), 0, 'smoothstep clamps below 0')
eq(smoothstep(2), 1, 'smoothstep clamps above 1')
eq(smoothstep(NaN), 0, 'smoothstep handles NaN')

// --- tickProgress ---
{
  const { progress, done } = tickProgress(0, 0.5, 2)
  near(progress, 0.25, 'tickProgress: 0.5s into a 2s blend = 0.25')
  eq(done, false, 'tickProgress: not done at 25%')
}
{
  const { progress, done } = tickProgress(0.95, 0.5, 2)
  eq(progress, 1, 'tickProgress: clamps to 1 at completion')
  eq(done, true, 'tickProgress: done flag fires on completion')
}
{
  // Second tick at 1 must NOT re-fire `done` — that's the contract.
  const { progress, done } = tickProgress(1, 0.5, 2)
  eq(progress, 1, 'tickProgress: stays at 1')
  eq(done, false, 'tickProgress: done is single-shot')
}
{
  // Negative dt is treated as 0 — clock skew can't rewind the blend.
  const { progress } = tickProgress(0.5, -1, 2)
  eq(progress, 0.5, 'tickProgress: negative dt no-op')
}
{
  // NaN dt is treated as 0.
  const { progress } = tickProgress(0.5, NaN, 2)
  eq(progress, 0.5, 'tickProgress: NaN dt no-op')
}

// --- DURATION_CHIPS / matchDurationChip ---
eq(DURATION_CHIPS.length, 4, 'four chips ship')
{
  const ids = DURATION_CHIPS.map(c => c.id)
  if (new Set(ids).size !== ids.length) fail('chip ids must be unique')
}
for (const chip of DURATION_CHIPS) {
  if (chip.seconds < BLEND_MIN_SEC) fail(`chip ${chip.id} below BLEND_MIN_SEC`)
  if (chip.seconds > BLEND_MAX_SEC) fail(`chip ${chip.id} above BLEND_MAX_SEC`)
  if (typeof chip.label !== 'string' || !chip.label) fail(`chip ${chip.id} missing label`)
  // Each chip's seconds value should be exactly recoverable.
  const m = matchDurationChip(chip.seconds)
  if (!m || m.id !== chip.id) fail(`chip ${chip.id} not matchable from its seconds`)
}
// Tolerates small floating-point drift.
{
  const m = matchDurationChip(2.0001)
  if (!m || m.id !== 'fast') fail('match tolerates eps drift')
}
// Mismatched seconds → null so the UI knows none is active.
{
  if (matchDurationChip(3.0) !== null) fail('mismatched seconds returns null')
  if (matchDurationChip(NaN) !== null) fail('NaN returns null')
}

console.log(`PASS: crossfade — clamp/smoothstep/tick · bounds [${BLEND_MIN_SEC}, ${BLEND_MAX_SEC}] · chips ${DURATION_CHIPS.length}`)
