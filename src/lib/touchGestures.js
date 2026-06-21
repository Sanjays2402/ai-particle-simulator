// Touch gesture recognizer — pure-math helpers for the mobile gesture
// hook. Kept here so the math is unit-testable without a DOM.
//
// We recognize three gestures from raw 2-touch event data:
//   - PINCH: distance between two fingers grows / shrinks.
//   - SWIPE-LEFT / SWIPE-RIGHT: both fingers move horizontally in the
//     same direction by at least SWIPE_THRESHOLD_PX without changing
//     pinch distance by more than PINCH_TOLERANCE_PX.
//
// The driver hook listens to touchstart/move/end and calls these
// helpers with point arrays. State machine lives in the hook; this
// module is stateless.

export const PINCH_TOLERANCE_PX = 18      // delta below this isn't a pinch
export const SWIPE_THRESHOLD_PX = 50      // both fingers need this much
export const SWIPE_VERTICAL_MAX_PX = 30   // y-drift cap so it's a real horizontal swipe

// Pythagoras between two {x,y} points.
export function distance(a, b) {
  if (!a || !b) return 0
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Convert a pinch delta (current - start) into a particle-count delta.
// `currentCount` is the live store value; we return the new count
// clamped into [min, max]. Tuned so a comfortable pinch (~100px) shifts
// the count by ~20% of the current — feels responsive without being
// jumpy on a single frame.
export function pinchToCountDelta(pinchDeltaPx, currentCount, min = 1000, max = 100000) {
  if (!Number.isFinite(pinchDeltaPx) || pinchDeltaPx === 0) return currentCount
  if (!Number.isFinite(currentCount)) return min
  // 1px pinch = 0.2% of currentCount, so 100px = 20%, 500px = ~100%.
  const factor = 1 + (pinchDeltaPx / 500)
  const next = Math.round(currentCount * factor)
  return Math.max(min, Math.min(max, next))
}

// Classify a 2-touch movement into 'pinch-out' | 'pinch-in' |
// 'swipe-left' | 'swipe-right' | null. Inputs are the START and CURRENT
// positions of both fingers; we look at distance delta + average x-delta.
export function classifyGesture(start0, start1, curr0, curr1) {
  if (!start0 || !start1 || !curr0 || !curr1) return null
  const startDist = distance(start0, start1)
  const currDist  = distance(curr0, curr1)
  const distDelta = currDist - startDist

  if (Math.abs(distDelta) >= PINCH_TOLERANCE_PX) {
    return distDelta > 0 ? 'pinch-out' : 'pinch-in'
  }

  // Distance didn't change much → it's a translation; check if both
  // fingers moved in the same horizontal direction by enough px.
  const dx0 = curr0.x - start0.x
  const dx1 = curr1.x - start1.x
  const dy0 = curr0.y - start0.y
  const dy1 = curr1.y - start1.y
  const avgDx = (dx0 + dx1) / 2
  const avgDy = (dy0 + dy1) / 2

  // Both fingers must move in the same horizontal direction; reject if
  // the y-drift is too large (probably a different gesture).
  if (Math.sign(dx0) !== Math.sign(dx1)) return null
  if (Math.abs(avgDy) > SWIPE_VERTICAL_MAX_PX) return null
  if (Math.abs(avgDx) < SWIPE_THRESHOLD_PX) return null

  return avgDx > 0 ? 'swipe-right' : 'swipe-left'
}

// Extract {x,y} from a TouchEvent.touches list at the given index.
// Returns null if missing — callers should bail out on null.
export function pointFromTouch(touches, idx) {
  if (!touches || touches.length <= idx) return null
  const t = touches[idx]
  if (!t) return null
  return { x: t.clientX, y: t.clientY }
}
