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
