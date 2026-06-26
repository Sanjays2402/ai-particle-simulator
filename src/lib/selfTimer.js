// Screenshot self-timer.
//
// A staged-capture helper: instead of firing a screenshot the instant
// the user clicks, count down N seconds (showing a big 3..2..1 ring)
// then capture. This gives the user time to move the cursor out of
// frame, stop fiddling with sliders, or get a clean composition —
// the same reason every phone camera has a self-timer.
//
// This module owns only the *pure* countdown math + duration roster
// so it unit-tests without a clock; the React overlay drives the
// actual setInterval and calls the existing screenshot path on fire.

// Selectable delays (seconds). 0 = instant (the classic behaviour).
export const TIMER_DELAYS = [0, 3, 5, 10]
export const DEFAULT_TIMER_DELAY = 3

// Clamp an incoming delay to the nearest allowed value; junk → default.
// We snap rather than reject so a stored value from a future build
// with a different roster degrades gracefully to the closest option.
export function sanitizeTimerDelay(raw) {
  const v = Number(raw)
  if (!Number.isFinite(v)) return DEFAULT_TIMER_DELAY
  if (TIMER_DELAYS.includes(v)) return v
  // Snap to nearest allowed delay.
  let best = TIMER_DELAYS[0]
  let bestDist = Infinity
  for (const d of TIMER_DELAYS) {
    const dist = Math.abs(d - v)
    if (dist < bestDist) { bestDist = dist; best = d }
  }
  return best
}

// Given a start timestamp, the total delay (s), and "now", compute the
// countdown display state:
//   { remaining, secondsLeft, progress, done }
// - remaining:   seconds left as a float (>= 0)
// - secondsLeft: the integer to show big (ceil of remaining, so the
//                first whole second shows "3" not "2")
// - progress:    0..1 elapsed fraction (for a ring sweep)
// - done:        true once elapsed >= delay (fire the capture)
//
// Defensive: non-finite inputs / delay <= 0 → an immediately-done
// state so a corrupt timer can never hang forever.
export function countdownState(startMs, delaySec, nowMs) {
  const start = Number(startMs)
  const delay = Number(delaySec)
  const now = Number(nowMs)
  if (!Number.isFinite(start) || !Number.isFinite(now) || !Number.isFinite(delay) || delay <= 0) {
    return { remaining: 0, secondsLeft: 0, progress: 1, done: true }
  }
  const elapsed = Math.max(0, (now - start) / 1000)
  const remaining = Math.max(0, delay - elapsed)
  const done = elapsed >= delay
  const progress = clamp01(elapsed / delay)
  // secondsLeft: 0 when done, else ceil(remaining) so 2.4 → "3".
  const secondsLeft = done ? 0 : Math.max(1, Math.ceil(remaining))
  return { remaining, secondsLeft, progress, done }
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

// Format a delay for a button label: 0 → "Off", else "3s".
export function labelForDelay(delay) {
  const v = sanitizeTimerDelay(delay)
  return v === 0 ? 'Off' : `${v}s`
}

// SVG stroke-dashoffset for a progress ring of a given circumference.
// progress 0 → full ring drawn (offset 0... we sweep the OTHER way so
// the ring DRAINS as time runs out). At progress 1 the ring is empty.
export function ringDashoffset(progress, circumference) {
  const c = Number(circumference)
  if (!Number.isFinite(c) || c <= 0) return 0
  const p = clamp01(progress)
  // Drain: offset grows from 0 (full) to circumference (empty).
  return p * c
}

// --- R35.C: burst mode -----------------------------------------------
//
// After the countdown completes, optionally fire a BURST of N shots
// spaced a fixed interval apart, so the user can pick the best particle
// moment from a quick sequence instead of nailing a single frame. Shot
// 1 fires immediately when the countdown ends; shots 2..N follow at
// `intervalMs` spacing.
//
// The roster + the "how many shots are due by now" math live here
// (pure) so the React overlay just fires whatever shots the helper says
// are due and never double-fires.

// Selectable burst sizes (number of frames). 1 = single shot (classic).
export const BURST_COUNTS = [1, 3, 5]
export const DEFAULT_BURST_COUNT = 1
// Spacing between burst frames, in milliseconds. Fast enough that the
// scene moves a little between shots but slow enough to be distinct.
export const BURST_INTERVAL_MS = 500

// Clamp an incoming burst count to an allowed value; junk → default.
// Snaps to the nearest roster entry so a stored value from a future
// build degrades gracefully.
export function sanitizeBurstCount(raw) {
  const v = Number(raw)
  if (!Number.isFinite(v)) return DEFAULT_BURST_COUNT
  if (BURST_COUNTS.includes(v)) return v
  let best = BURST_COUNTS[0]
  let bestDist = Infinity
  for (const c of BURST_COUNTS) {
    const dist = Math.abs(c - v)
    if (dist < bestDist) { bestDist = dist; best = c }
  }
  return best
}

// Label a burst count for a chip: 1 → "Single", else "x3".
export function labelForBurst(count) {
  const v = sanitizeBurstCount(count)
  return v === 1 ? 'Single' : `x${v}`
}

// How many burst shots are DUE to have fired by `nowMs`, given when the
// burst started (the moment the countdown completed), the total count,
// and the interval. Shot 1 is due at burstStartMs, shot k at
// burstStartMs + (k-1)*interval. Returns an integer in [0, count].
//
// The overlay tracks how many it has ALREADY fired and fires the
// difference, so a dropped frame (rAF hitch) catches up rather than
// skipping a shot. Defensive: junk inputs → 0 (fire nothing) except a
// finite start with count>=1 always yields at least 1 once now>=start.
export function burstShotsDue(burstStartMs, count, intervalMs, nowMs) {
  const start = Number(burstStartMs)
  const n = sanitizeBurstCount(count)
  const interval = Number(intervalMs)
  const now = Number(nowMs)
  if (!Number.isFinite(start) || !Number.isFinite(now)) return 0
  if (now < start) return 0
  // A non-positive / non-finite interval collapses the burst to an
  // instant volley: once started, all N are due.
  if (!Number.isFinite(interval) || interval <= 0) return n
  const elapsed = now - start
  const due = 1 + Math.floor(elapsed / interval)
  if (due < 1) return 1
  return due > n ? n : due
}

// Is the burst complete (all N shots due) at `nowMs`? Convenience for
// the overlay's teardown.
export function burstComplete(burstStartMs, count, intervalMs, nowMs) {
  const n = sanitizeBurstCount(count)
  return burstShotsDue(burstStartMs, n, intervalMs, nowMs) >= n
}
