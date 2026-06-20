// touchGestures: distance, pinch→count, classify, point extraction.
import {
  distance, pinchToCountDelta, classifyGesture, pointFromTouch,
  PINCH_TOLERANCE_PX, SWIPE_THRESHOLD_PX, SWIPE_VERTICAL_MAX_PX,
} from './touchGestures.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- distance ---
near(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, '3-4-5 triangle')
eq(distance(null, { x: 1, y: 2 }), 0, 'null a → 0')
eq(distance({ x: 0, y: 0 }, null), 0, 'null b → 0')
near(distance({ x: 1, y: 1 }, { x: 1, y: 1 }), 0, 'same point → 0')

// --- pinchToCountDelta ---
eq(pinchToCountDelta(0, 20000), 20000, 'zero pinch → no change')
{
  // +500px pinch out doubles the count (factor = 2.0).
  const out = pinchToCountDelta(500, 20000)
  eq(out, 40000, '+500px pinch → 2x count')
}
{
  // -500px pinch in zeroes the multiplier; clamped to min 1000.
  const out = pinchToCountDelta(-500, 20000, 1000, 100000)
  eq(out, 1000, '-500px pinch → clamped to min')
}
{
  // Caps at max.
  const out = pinchToCountDelta(99999, 20000, 1000, 100000)
  eq(out, 100000, 'huge pinch → clamped to max')
}
eq(pinchToCountDelta(NaN, 20000), 20000, 'NaN pinch → no change')
eq(pinchToCountDelta(100, NaN, 1000, 100000), 1000, 'NaN count → min')

// --- classifyGesture ---
{
  // No movement → null (no gesture).
  const r = classifyGesture(
    { x: 0, y: 0 }, { x: 100, y: 0 },
    { x: 0, y: 0 }, { x: 100, y: 0 },
  )
  eq(r, null, 'no movement → null')
}
{
  // Both fingers spread apart → pinch-out.
  const r = classifyGesture(
    { x: 100, y: 0 }, { x: 200, y: 0 },
    { x: 50,  y: 0 }, { x: 250, y: 0 },  // gap 100 → 200, distDelta = 100
  )
  eq(r, 'pinch-out', 'spread → pinch-out')
}
{
  // Both fingers come together → pinch-in.
  const r = classifyGesture(
    { x: 100, y: 0 }, { x: 300, y: 0 },
    { x: 150, y: 0 }, { x: 250, y: 0 },  // gap 200 → 100, distDelta = -100
  )
  eq(r, 'pinch-in', 'pinch together → pinch-in')
}
{
  // Both fingers move right together (no distance change) → swipe-right.
  const r = classifyGesture(
    { x: 100, y: 0 }, { x: 200, y: 0 },
    { x: 200, y: 0 }, { x: 300, y: 0 },  // both +100 in x
  )
  eq(r, 'swipe-right', 'both right → swipe-right')
}
{
  // Both fingers move left → swipe-left.
  const r = classifyGesture(
    { x: 200, y: 0 }, { x: 300, y: 0 },
    { x: 100, y: 0 }, { x: 200, y: 0 },
  )
  eq(r, 'swipe-left', 'both left → swipe-left')
}
{
  // Fingers move in opposite x directions → null (it's not a swipe).
  const r = classifyGesture(
    { x: 100, y: 0 }, { x: 200, y: 0 },
    { x: 200, y: 0 }, { x: 100, y: 0 },
  )
  eq(r, null, 'opposite directions → null')
}
{
  // Below threshold → no swipe.
  const r = classifyGesture(
    { x: 0, y: 0 }, { x: 100, y: 0 },
    { x: 10, y: 0 }, { x: 110, y: 0 },
  )
  eq(r, null, 'tiny movement → null')
}
{
  // Too much vertical drift → not a horizontal swipe.
  const r = classifyGesture(
    { x: 0, y: 0 },   { x: 100, y: 0 },
    { x: 80, y: 80 }, { x: 180, y: 80 },
  )
  eq(r, null, 'vertical drift → null')
}
{
  // Null inputs are safe.
  eq(classifyGesture(null, null, null, null), null, 'null inputs → null')
}

// --- pointFromTouch ---
{
  const tlist = [{ clientX: 1, clientY: 2 }, { clientX: 3, clientY: 4 }]
  tlist.length = 2
  const a = pointFromTouch(tlist, 0)
  const b = pointFromTouch(tlist, 1)
  eq(a.x, 1, 'touch[0].x')
  eq(b.y, 4, 'touch[1].y')
  eq(pointFromTouch(tlist, 2), null, 'out-of-range → null')
  eq(pointFromTouch(null,  0), null, 'null touches → null')
}

console.log(`PASS: touchGestures — pinch ${PINCH_TOLERANCE_PX}px · swipe ${SWIPE_THRESHOLD_PX}px (max ${SWIPE_VERTICAL_MAX_PX}px vertical)`)
