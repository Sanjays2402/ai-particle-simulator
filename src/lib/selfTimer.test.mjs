// selfTimer: screenshot countdown state machine + delay roster.
import {
  TIMER_DELAYS, DEFAULT_TIMER_DELAY, sanitizeTimerDelay,
  countdownState, labelForDelay, ringDashoffset,
} from './selfTimer.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }
function near(a, b, m, eps = 0.001) { if (Math.abs(a - b) > eps) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// --- roster ---
ok(TIMER_DELAYS.includes(0), 'roster has instant (0)')
ok(TIMER_DELAYS.includes(DEFAULT_TIMER_DELAY), 'roster has the default')
eq(TIMER_DELAYS[0], 0, 'first delay is instant')
for (const d of TIMER_DELAYS) ok(Number.isFinite(d) && d >= 0, `delay ${d} is finite non-negative`)

// --- sanitizeTimerDelay ---
eq(sanitizeTimerDelay(3), 3, 'exact value passes')
eq(sanitizeTimerDelay(0), 0, 'instant passes')
eq(sanitizeTimerDelay('5'), 5, 'numeric string coerced')
eq(sanitizeTimerDelay(NaN), DEFAULT_TIMER_DELAY, 'NaN → default')
eq(sanitizeTimerDelay(undefined), DEFAULT_TIMER_DELAY, 'undefined → default')
eq(sanitizeTimerDelay(4), 3, '4 snaps to nearest (3)')
eq(sanitizeTimerDelay(6), 5, '6 snaps to nearest (5)')
eq(sanitizeTimerDelay(100), 10, '100 snaps to max (10)')
eq(sanitizeTimerDelay(-2), 0, 'negative snaps to 0')

// --- countdownState: fresh start (3s timer, t=0) ---
{
  const s = countdownState(1000, 3, 1000)
  near(s.remaining, 3, 'fresh: 3s remaining')
  eq(s.secondsLeft, 3, 'fresh: shows 3')
  near(s.progress, 0, 'fresh: 0 progress')
  eq(s.done, false, 'fresh: not done')
}
// --- partway: 1.2s into a 3s timer ---
{
  const s = countdownState(1000, 3, 2200)
  near(s.remaining, 1.8, '1.2s elapsed → 1.8 remaining')
  eq(s.secondsLeft, 2, 'ceil(1.8) → shows 2')
  near(s.progress, 1.2 / 3, '40% progress')
  eq(s.done, false, 'not done yet')
}
// --- just before the last second ---
{
  const s = countdownState(0, 3, 2400)
  eq(s.secondsLeft, 1, '0.6s remaining → shows 1 (never 0 until done)')
  eq(s.done, false, 'still counting')
}
// --- exactly done ---
{
  const s = countdownState(0, 3, 3000)
  eq(s.done, true, 'elapsed == delay → done')
  eq(s.secondsLeft, 0, 'done → secondsLeft 0')
  near(s.progress, 1, 'done → full progress')
  near(s.remaining, 0, 'done → 0 remaining')
}
// --- past done stays done, never negative ---
{
  const s = countdownState(0, 3, 9000)
  eq(s.done, true, 'overshoot still done')
  near(s.remaining, 0, 'remaining clamps at 0 (never negative)')
  near(s.progress, 1, 'progress clamps at 1')
  eq(s.secondsLeft, 0, 'overshoot secondsLeft 0')
}
// --- defensive: delay 0 / junk → immediately done ---
{
  eq(countdownState(0, 0, 0).done, true, 'delay 0 → instant done')
  eq(countdownState(NaN, 3, 100).done, true, 'NaN start → done')
  eq(countdownState(0, 3, NaN).done, true, 'NaN now → done')
  eq(countdownState(0, NaN, 100).done, true, 'NaN delay → done')
  eq(countdownState(0, -3, 100).done, true, 'negative delay → done')
}
// --- now before start (clock skew) clamps elapsed to 0, not negative ---
{
  const s = countdownState(5000, 3, 1000)
  near(s.remaining, 3, 'now<start → full remaining (no negative elapsed)')
  eq(s.done, false, 'now<start → not done')
}

// --- labelForDelay ---
eq(labelForDelay(0), 'Off', '0 → Off')
eq(labelForDelay(3), '3s', '3 → 3s')
eq(labelForDelay(10), '10s', '10 → 10s')
eq(labelForDelay(99), '10s', 'junk snaps then labels')

// --- ringDashoffset ---
{
  const C = 100
  near(ringDashoffset(0, C), 0, 'progress 0 → full ring (offset 0)')
  near(ringDashoffset(1, C), 100, 'progress 1 → empty ring (offset = circumference)')
  near(ringDashoffset(0.5, C), 50, 'half progress → half drained')
  near(ringDashoffset(0.5, 0), 0, 'zero circumference → 0 offset (no NaN)')
  near(ringDashoffset(2, C), 100, 'over-progress clamps to full drain')
  near(ringDashoffset(-1, C), 0, 'negative progress clamps to 0')
  near(ringDashoffset(NaN, C), 0, 'NaN progress → 0')
}

// --- monotonic countdown: progress only increases across a sweep ---
{
  let prev = -1
  for (let t = 0; t <= 3000; t += 250) {
    const s = countdownState(0, 3, t)
    ok(s.progress >= prev - 1e-9, `progress monotonic at t=${t}`)
    prev = s.progress
  }
}

// === R35.C: burst mode ===============================================
const r35c = await import('./selfTimer.js')
const {
  BURST_COUNTS, DEFAULT_BURST_COUNT, BURST_INTERVAL_MS,
  sanitizeBurstCount, labelForBurst, burstShotsDue, burstComplete,
} = r35c

// --- burst roster ---
ok(BURST_COUNTS.includes(1), 'roster has single (1)')
ok(BURST_COUNTS.includes(DEFAULT_BURST_COUNT), 'roster has the default')
eq(BURST_COUNTS[0], 1, 'first burst count is single')
for (const c of BURST_COUNTS) ok(Number.isInteger(c) && c >= 1, `burst ${c} is a positive int`)
ok(Number.isFinite(BURST_INTERVAL_MS) && BURST_INTERVAL_MS > 0, 'burst interval positive')

// --- sanitizeBurstCount ---
eq(sanitizeBurstCount(3), 3, 'exact burst passes')
eq(sanitizeBurstCount(1), 1, 'single passes')
eq(sanitizeBurstCount('5'), 5, 'numeric string coerced')
eq(sanitizeBurstCount(NaN), DEFAULT_BURST_COUNT, 'NaN → default')
eq(sanitizeBurstCount(undefined), DEFAULT_BURST_COUNT, 'undefined → default')
eq(sanitizeBurstCount(4), 3, '4 snaps to nearest (3)')
eq(sanitizeBurstCount(100), 5, '100 snaps to max (5)')
eq(sanitizeBurstCount(0), 1, '0 snaps to min (1)')
eq(sanitizeBurstCount(-3), 1, 'negative snaps to 1')

// --- labelForBurst ---
eq(labelForBurst(1), 'Single', '1 → Single')
eq(labelForBurst(3), 'x3', '3 → x3')
eq(labelForBurst(5), 'x5', '5 → x5')
eq(labelForBurst(99), 'x5', 'junk snaps then labels')

// --- burstShotsDue: single shot ---
{
  eq(burstShotsDue(1000, 1, 500, 1000), 1, 'single: 1 due at start')
  eq(burstShotsDue(1000, 1, 500, 5000), 1, 'single: never more than 1')
  eq(burstShotsDue(1000, 1, 500, 999), 0, 'single: 0 due before start')
}

// --- burstShotsDue: 3-shot @ 500ms ---
{
  const start = 1000
  eq(burstShotsDue(start, 3, 500, 1000), 1, 'shot 1 due at start')
  eq(burstShotsDue(start, 3, 500, 1499), 1, 'still 1 just before interval')
  eq(burstShotsDue(start, 3, 500, 1500), 2, 'shot 2 due at +500ms')
  eq(burstShotsDue(start, 3, 500, 2000), 3, 'shot 3 due at +1000ms')
  eq(burstShotsDue(start, 3, 500, 9000), 3, 'caps at count (never 4)')
  eq(burstShotsDue(start, 3, 500, 999), 0, '0 due before start')
}

// --- burstShotsDue: catch-up after a dropped frame ---
{
  // A long rAF hitch: jump straight from start to +1200ms → all 3 due.
  eq(burstShotsDue(0, 3, 500, 1200), 3, 'late poll catches up to all due (no skipped shot)')
}

// --- burstShotsDue: defensive ---
{
  eq(burstShotsDue(NaN, 3, 500, 1000), 0, 'NaN start → 0')
  eq(burstShotsDue(0, 3, 500, NaN), 0, 'NaN now → 0')
  // zero / negative / non-finite interval → instant volley (all due once started).
  eq(burstShotsDue(0, 3, 0, 0), 3, 'zero interval → all due at once')
  eq(burstShotsDue(0, 5, -1, 100), 5, 'negative interval → all due')
  eq(burstShotsDue(0, 3, Infinity, 100), 3, 'Infinity interval → all due (collapses to volley)')
  // junk count sanitised.
  eq(burstShotsDue(0, 99, 500, 0), 1, 'junk count snaps to 5 then 1 due at start')
}

// --- burstComplete ---
{
  eq(burstComplete(1000, 3, 500, 2000), true, '3-shot complete at +1000ms')
  eq(burstComplete(1000, 3, 500, 1500), false, 'not complete at shot 2')
  eq(burstComplete(1000, 1, 500, 1000), true, 'single complete at start')
  eq(burstComplete(1000, 1, 500, 999), false, 'single not complete before start')
}

// --- monotonic: shots-due never decreases across a burst sweep ---
{
  let prev = -1
  for (let t = 1000; t <= 3000; t += 100) {
    const due = burstShotsDue(1000, 5, 500, t)
    ok(due >= prev, `burst shots-due monotonic at t=${t}`)
    prev = due
  }
  eq(prev, 5, 'sweep reaches all 5 shots')
}

console.log(`PASS: selfTimer — ${passed} assertions (countdown state machine, delay snapping, ring sweep, R35.C burst mode)`)
