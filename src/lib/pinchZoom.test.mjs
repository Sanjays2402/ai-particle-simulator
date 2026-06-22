// pinchZoom — math + state-machine tests. No DOM required.
import {
  MIN_SCALE, MAX_SCALE, DOUBLE_TAP_SCALE, KEYBOARD_ZOOM_STEP,
  PAN_STEP_FRACTION,
  clampScale, distance, midpoint, clampTranslate,
  idleState, beginPinch, updatePinch, beginPan, updatePan,
  endGesture, applyDoubleTap, shouldInterceptWheel,
  toTransform, navAllowed,
  applyZoomBy, applyKeyboardZoomIn, applyKeyboardZoomOut,
  applyResetZoom, applyWheelZoom, classifyZoomKey,
  classifyPanKey, applyKeyboardPan,
  // R15.13 — hold-to-repeat pan aggregator
  aggregateHeldPan,
  // R16.20 — pan acceleration curve for held WASD
  PAN_ACCEL_THRESHOLD_MS, PAN_ACCEL_RAMP_MS, PAN_ACCEL_MAX,
  panAccelMultiplier, scaleDirByHold,
  // R17.20 — acceleration curve preset chip (linear/exp/log/off)
  PAN_ACCEL_CURVES, nextPanAccelCurve,
} from './pinchZoom.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) fail(`${m} — got ${A} expected ${B}`)
}
function approx(a, b, m, tol = 1e-6) {
  if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ${b}`)
}

// --- clampScale ---
eq(clampScale(0.5), MIN_SCALE,   'clampScale: below MIN clamps to MIN')
eq(clampScale(0),   MIN_SCALE,   'clampScale: 0 clamps to MIN')
eq(clampScale(-2),  MIN_SCALE,   'clampScale: negative clamps to MIN')
eq(clampScale(1),   1,           'clampScale: at MIN passes through')
eq(clampScale(3.5), 3.5,         'clampScale: in-range passes through')
eq(clampScale(MAX_SCALE + 1), MAX_SCALE, 'clampScale: above MAX clamps to MAX')
eq(clampScale(NaN), MIN_SCALE,   'clampScale: NaN → MIN')

// --- distance + midpoint ---
approx(distance({x:0,y:0},{x:3,y:4}), 5, 'distance: 3-4-5 triangle')
eq(distance(null, {x:1,y:1}), 0, 'distance: null point → 0')
eq(midpoint({x:0,y:0},{x:10,y:20}), { x: 5, y: 10 }, 'midpoint: halfway')
eq(midpoint(null, {x:1,y:1}), null, 'midpoint: null → null')

// --- clampTranslate ---
eq(clampTranslate(0, 0, 1, 200, 100), { x: 0, y: 0 }, 'clampTranslate: at scale 1 → all bounds are 0')
eq(clampTranslate(100, 100, 1, 200, 100), { x: 0, y: 0 }, 'clampTranslate: scale 1 collapses translation')
// At scale 2, max overhang on a 200-wide stage is (200 * (2-1)) / 2 = 100
eq(clampTranslate(150, 60, 2, 200, 100), { x: 100, y: 50 }, 'clampTranslate: scale 2 caps at half overhang')
eq(clampTranslate(-300, -200, 2, 200, 100), { x: -100, y: -50 }, 'clampTranslate: negative bounds symmetric')
eq(clampTranslate(NaN, 5, 2, 200, 100), { x: 0, y: 5 }, 'clampTranslate: NaN x → 0')
eq(clampTranslate(0, 0, 1, 0, 0), { x: 0, y: 0 }, 'clampTranslate: zero stage → zero bounds')

// --- idleState ---
const idle = idleState()
eq(idle.scale, MIN_SCALE, 'idleState: scale at MIN')
eq(idle.translateX, 0,    'idleState: translateX at 0')
eq(idle.translateY, 0,    'idleState: translateY at 0')
eq(idle.gesture, 'idle',  'idleState: gesture idle')

// --- beginPinch / updatePinch ---
{
  const s0 = idleState()
  // Pinch starts: two fingers 100px apart, centered at (100, 100).
  const a = { x: 50, y: 100 }
  const b = { x: 150, y: 100 }
  const s1 = beginPinch(s0, a, b)
  eq(s1.gesture, 'pinch', 'beginPinch: state moves to pinch')
  approx(s1.startDist, 100, 'beginPinch: captures startDist')
  eq(s1.startCenter, { x: 100, y: 100 }, 'beginPinch: captures startCenter')
  eq(s1.startScale, MIN_SCALE, 'beginPinch: captures startScale')

  // Fingers spread to 200px (2x), centroid unchanged. → scale 2, no translate.
  const a2 = { x: 0,   y: 100 }
  const b2 = { x: 200, y: 100 }
  const s2 = updatePinch(s1, a2, b2, 400, 300)
  approx(s2.scale, 2, 'updatePinch: 2x distance → 2x scale')
  approx(s2.translateX, 0, 'updatePinch: no centroid drift → no translation')
  approx(s2.translateY, 0, 'updatePinch: no centroid drift → no translation')

  // Fingers pinch back in to 50px (0.5x of start) → clamps to MIN.
  const a3 = { x: 75, y: 100 }
  const b3 = { x: 125, y: 100 }
  const s3 = updatePinch(s1, a3, b3, 400, 300)
  eq(s3.scale, MIN_SCALE, 'updatePinch: zoom-out below MIN clamps')

  // Stretch beyond MAX
  const a4 = { x: -1000, y: 100 }
  const b4 = { x:  1000, y: 100 }
  const s4 = updatePinch(s1, a4, b4, 400, 300)
  eq(s4.scale, MAX_SCALE, 'updatePinch: zoom-in above MAX clamps')
}

// --- beginPinch defensive ---
{
  const s0 = idleState()
  const same = beginPinch(s0, { x: 10, y: 10 }, { x: 10, y: 10 })
  eq(same.gesture, 'idle', 'beginPinch: zero start distance bails to original state')
}

// --- updatePinch keeps centroid roughly anchored ---
{
  // Start with two fingers at 100px apart, centroid (200, 200).
  const s0 = idleState()
  const s1 = beginPinch(s0, { x: 150, y: 200 }, { x: 250, y: 200 })
  // Now fingers spread to 300px (3x) with centroid drifted to (220, 200).
  const s2 = updatePinch(s1,
    { x: 70,  y: 200 },
    { x: 370, y: 200 },
    1000, 1000)
  approx(s2.scale, 3, 'updatePinch: 3x distance')
  // centroid moved +20 in x → translateX should be +20 (clamped to bounds)
  approx(s2.translateX, 20, 'updatePinch: centroid drift becomes translation')
  approx(s2.translateY, 0,  'updatePinch: no y drift → no translateY')
}

// --- beginPan / updatePan ---
{
  // Pan only allowed when zoomed in.
  const idle = idleState()
  const noOp = beginPan(idle, { x: 50, y: 50 })
  eq(noOp.gesture, 'idle', 'beginPan: bails out at scale 1 (no zoom)')

  // Zoom in then pan.
  const zoomed = { ...idle, scale: 2 }
  const s1 = beginPan(zoomed, { x: 100, y: 100 })
  eq(s1.gesture, 'pan', 'beginPan: enters pan state')
  eq(s1.startCenter, { x: 100, y: 100 }, 'beginPan: captures start point')
  const s2 = updatePan(s1, { x: 150, y: 80 }, 200, 100)
  // dx=+50, dy=-20 → translate(50, -20) clamped to (±100, ±50)
  approx(s2.translateX, 50,  'updatePan: x delta applied')
  approx(s2.translateY, -20, 'updatePan: y delta applied')

  // Pan way beyond bounds — should clamp.
  const s3 = updatePan(s1, { x: 1000, y: 1000 }, 200, 100)
  approx(s3.translateX, 100, 'updatePan: clamps to right bound')
  approx(s3.translateY, 50,  'updatePan: clamps to bottom bound')
}

// --- endGesture ---
{
  const s = { ...idleState(), gesture: 'pinch', scale: 2, translateX: 80, translateY: 30 }
  const out = endGesture(s, 200, 100)
  eq(out.gesture, 'idle', 'endGesture: resets to idle')
  eq(out.startCenter, null, 'endGesture: clears startCenter')
  // Translation should remain within bounds (and update startTranslate so a
  // subsequent gesture starts cleanly).
  approx(out.translateX, 80, 'endGesture: translate preserved when in-bounds')
  eq(out.startTranslate, { x: 80, y: 30 }, 'endGesture: startTranslate synced to current')
}

// --- applyDoubleTap ---
{
  // Idle → zoom in to DOUBLE_TAP_SCALE, centering on the tap point.
  const idle = idleState()
  const tap = { x: 200, y: 100 }
  const s1 = applyDoubleTap(idle, tap, 400, 200)
  eq(s1.scale, DOUBLE_TAP_SCALE, 'applyDoubleTap: idle → zoom in')
  // Tap point is exactly at the stage center → translate stays at (0, 0).
  approx(s1.translateX, 0, 'applyDoubleTap: center tap stays centered')
  approx(s1.translateY, 0, 'applyDoubleTap: center tap stays centered')

  // Tap on the right edge (x = stageW, y = stageH/2) → translate negative-x
  // so the tap point stays under the finger.
  const tapRight = { x: 400, y: 100 }
  const s2 = applyDoubleTap(idle, tapRight, 400, 200)
  eq(s2.scale, DOUBLE_TAP_SCALE, 'applyDoubleTap: corner tap still zooms in')
  // (1 - 2) * (400 - 200) = -200, but max overhang at scale 2 on 400-wide
  // stage is (400*(2-1))/2 = 200, so it should clamp to -200.
  approx(s2.translateX, -200, 'applyDoubleTap: corner tap pans to edge bound')

  // Zoomed → reset.
  const zoomed = { ...idle, scale: 3, translateX: 50, translateY: 50 }
  const s3 = applyDoubleTap(zoomed, tap, 400, 200)
  eq(s3.scale, MIN_SCALE, 'applyDoubleTap: zoomed → resets to MIN')
  eq(s3.translateX, 0, 'applyDoubleTap: reset zeroes translateX')
  eq(s3.translateY, 0, 'applyDoubleTap: reset zeroes translateY')

  // Null tap → defaults to centered zoom at DOUBLE_TAP_SCALE.
  const s4 = applyDoubleTap(idle, null, 400, 200)
  eq(s4.scale, DOUBLE_TAP_SCALE, 'applyDoubleTap: null tap → centered zoom')
  eq(s4.translateX, 0, 'applyDoubleTap: null tap → no translate')
}

// --- shouldInterceptWheel ---
{
  const idle = idleState()
  if (shouldInterceptWheel(idle, +1)) fail('wheel: idle + zoom-out direction should NOT intercept')
  if (!shouldInterceptWheel(idle, -1)) fail('wheel: idle + zoom-in direction SHOULD intercept')
  const zoomed = { ...idle, scale: 2 }
  if (!shouldInterceptWheel(zoomed, +1)) fail('wheel: zoomed + zoom-out SHOULD intercept')
  if (!shouldInterceptWheel(zoomed, -1)) fail('wheel: zoomed + zoom-in SHOULD intercept')
  const maxed = { ...idle, scale: MAX_SCALE }
  if (shouldInterceptWheel(maxed, -1)) fail('wheel: maxed + zoom-in should NOT intercept')
  if (!shouldInterceptWheel(maxed, +1)) fail('wheel: maxed + zoom-out SHOULD intercept')
  if (shouldInterceptWheel(idle, 0)) fail('wheel: zero delta → no intercept')
  if (shouldInterceptWheel(idle, NaN)) fail('wheel: NaN delta → no intercept')
}

// --- toTransform ---
{
  const s = { ...idleState(), translateX: 12.5, translateY: -7.25, scale: 2 }
  eq(toTransform(s), 'translate(12.5px, -7.25px) scale(2)', 'toTransform: produces canonical transform string')
  const s2 = { ...idleState(), translateX: 0, translateY: 0, scale: 99 } // out-of-range
  eq(toTransform(s2), `translate(0px, 0px) scale(${MAX_SCALE})`, 'toTransform: clamps over-large scale')
}

// --- navAllowed ---
{
  if (!navAllowed(idleState())) fail('navAllowed: idle state must allow nav')
  const zoomed = { ...idleState(), scale: 2 }
  if (navAllowed(zoomed)) fail('navAllowed: zoomed state must block nav')
  const edge = { ...idleState(), scale: 1.0 }
  if (!navAllowed(edge)) fail('navAllowed: exactly MIN_SCALE counts as idle')
}

// --- applyZoomBy / keyboard helpers (R11.15) ---
{
  // From idle, zoom in by KEYBOARD_ZOOM_STEP — scale moves up, image
  // stays centered (no anchor → stage centre).
  const next = applyKeyboardZoomIn(idleState(), 200, 100)
  approx(next.scale, MIN_SCALE * KEYBOARD_ZOOM_STEP, 'keyboard +: scale steps by 1.25x')
  eq(next.translateX, 0, 'keyboard +: stays centered (translate 0)')
  eq(next.translateY, 0, 'keyboard +: stays centered (translate 0)')
}
{
  // Zoom-out from idle is a no-op (already at MIN).
  const next = applyKeyboardZoomOut(idleState(), 200, 100)
  eq(next.scale, MIN_SCALE, 'keyboard -: no-op at MIN_SCALE')
}
{
  // Zoom-out from a deep zoom brings us back below MIN → snap to idle.
  const deep = { ...idleState(), scale: 1.2, translateX: 5, translateY: 5 }
  const next = applyKeyboardZoomOut(deep, 200, 100)
  eq(next.scale, MIN_SCALE, 'keyboard -: snaps back to MIN when crossing it')
  eq(next.translateX, 0, 'keyboard -: snap to idle clears translateX')
  eq(next.translateY, 0, 'keyboard -: snap to idle clears translateY')
}
{
  // At MAX_SCALE, zoom-in is a no-op.
  const maxed = { ...idleState(), scale: MAX_SCALE }
  const next = applyKeyboardZoomIn(maxed, 200, 100)
  eq(next.scale, MAX_SCALE, 'keyboard +: no-op at MAX_SCALE')
}
{
  // Reset returns a fresh idleState (regardless of input).
  const dirty = { ...idleState(), scale: 3, translateX: 20, translateY: -10 }
  const reset = applyResetZoom(dirty)
  eq(reset.scale, MIN_SCALE, 'reset: scale → MIN')
  eq(reset.translateX, 0, 'reset: translateX → 0')
  eq(reset.translateY, 0, 'reset: translateY → 0')
}
{
  // applyZoomBy with an anchor keeps the world coord under the anchor
  // stable. Stage 200x100; anchor at (200, 50) (right edge centre).
  // Zoom in 2x → translateX should be (200 - 100) * (1 - 2) = -100 (clamped).
  const next = applyZoomBy(idleState(), 2, { x: 200, y: 50 }, 200, 100)
  approx(next.scale, 2, 'zoom-by anchor: scale doubles')
  approx(next.translateX, -100, 'zoom-by anchor: world point under anchor preserved (within bounds)')
  approx(next.translateY, 0,    'zoom-by anchor: y unchanged (anchor on centre line)')
}
{
  // Invalid factor → no-op.
  const before = idleState()
  eq(applyZoomBy(before, 0, null, 200, 100),   before, 'zoom-by: factor 0 → no-op')
  eq(applyZoomBy(before, NaN, null, 200, 100), before, 'zoom-by: NaN factor → no-op')
  eq(applyZoomBy(before, -1, null, 200, 100),  before, 'zoom-by: negative factor → no-op')
}

// --- applyWheelZoom ---
{
  // Wheel-up (negative deltaY) zooms in around anchor.
  const next = applyWheelZoom(idleState(), -100, { x: 100, y: 50 }, 200, 100)
  if (next.scale <= MIN_SCALE) fail('wheel up: scale should grow')
}
{
  // Wheel-down at idle is no-op (can't zoom out below 1).
  const next = applyWheelZoom(idleState(), 100, { x: 100, y: 50 }, 200, 100)
  eq(next.scale, MIN_SCALE, 'wheel down at idle: no-op')
}
{
  // Larger deltaY clamped to the polite-cap factor (0.5 intensity max).
  const huge = applyWheelZoom(idleState(), -10000, { x: 100, y: 50 }, 200, 100)
  // intensity capped at 0.5 → factor = 1.5; scale = 1 * 1.5 = 1.5.
  approx(huge.scale, 1.5, 'wheel: per-event factor caps at 1.5x', 1e-6)
}
{
  // Zero deltaY → no change.
  const before = idleState()
  eq(applyWheelZoom(before, 0, null, 200, 100), before, 'wheel: zero delta no-op')
}

// --- classifyZoomKey ---
eq(classifyZoomKey('+'), 'in',    'classify: + → in')
eq(classifyZoomKey('='), 'in',    'classify: = → in (no-shift on US layout)')
eq(classifyZoomKey('-'), 'out',   'classify: - → out')
eq(classifyZoomKey('_'), 'out',   'classify: _ → out (shifted -)')
eq(classifyZoomKey('0'), 'reset', 'classify: 0 → reset')
eq(classifyZoomKey('a'), null,    'classify: unrelated key → null')
eq(classifyZoomKey(''),  null,    'classify: empty → null')

// --- R12.19 keyboard pan ---
// classifyPanKey: WASD + hjkl + caps + ignored keys.
eq(classifyPanKey('w'), { dx: 0, dy: -1 },  'classify: w → up')
eq(classifyPanKey('W'), { dx: 0, dy: -1 },  'classify: shift-W → up')
eq(classifyPanKey('s'), { dx: 0, dy: 1 },   'classify: s → down')
eq(classifyPanKey('a'), { dx: -1, dy: 0 },  'classify: a → left')
eq(classifyPanKey('d'), { dx: 1, dy: 0 },   'classify: d → right')
eq(classifyPanKey('k'), { dx: 0, dy: -1 },  'classify: k → up (vim)')
eq(classifyPanKey('j'), { dx: 0, dy: 1 },   'classify: j → down (vim)')
eq(classifyPanKey('h'), { dx: -1, dy: 0 },  'classify: h → left (vim)')
eq(classifyPanKey('l'), { dx: 1, dy: 0 },   'classify: l → right (vim)')
eq(classifyPanKey('q'), null,                'classify: unrelated → null')
eq(classifyPanKey(''),  null,                'classify: empty → null')
eq(classifyPanKey('+'), null,                'classify: zoom key → null')
eq(classifyPanKey(null), null,               'classify: null → null')

// PAN_STEP_FRACTION is a documented constant in [0, 1].
if (PAN_STEP_FRACTION <= 0 || PAN_STEP_FRACTION >= 1) {
  fail(`PAN_STEP_FRACTION ${PAN_STEP_FRACTION} should be in (0, 1)`)
}

// applyKeyboardPan: no-op at idle (scale === MIN_SCALE).
{
  const idle = idleState()
  const out = applyKeyboardPan(idle, { dx: 1, dy: 0 }, 400, 200)
  eq(out, idle, 'pan at idle scale = no-op')
}

// applyKeyboardPan: null dir = no-op.
{
  const state = { ...idleState(), scale: 2 }
  eq(applyKeyboardPan(state, null, 400, 200), state, 'null dir = no-op')
}

// applyKeyboardPan: pressing W (up direction) decreases translateY.
// At scale=2, stage 400x200, step = 200 * 0.15 * 2 = 60.
{
  const state = { ...idleState(), scale: 2 }
  const out = applyKeyboardPan(state, { dx: 0, dy: -1 }, 400, 200)
  // dy = -(-1) * 60 = +60 in screen space (wait — formula flips sign).
  // Re-read: dir.dy=-1 → dy = -(dir.dy) * stepY = -(-1) * 60 = 60.
  // But the doc says "press W should decrease the translate.y so the
  // image shifts DOWN under viewport". A POSITIVE translateY moves
  // the image DOWN in the standard CSS coordinate system, which
  // matches "image shifts down" — so positive translateY is correct.
  approx(out.translateY, 60, 'W → translateY = +60 (image shifts down)')
  approx(out.translateX, 0, 'W → translateX unchanged')
}

// applyKeyboardPan: pressing D (right direction) decreases translateX.
{
  const state = { ...idleState(), scale: 2 }
  const out = applyKeyboardPan(state, { dx: 1, dy: 0 }, 400, 200)
  // dx = -1 * 400 * 0.15 * 2 = -120
  approx(out.translateX, -120, 'D → translateX = -120 (image shifts left under viewport, revealing right side)')
}

// applyKeyboardPan: bound to stage overhang.
{
  // At scale=2, stage 400x200, max overhang on X = 400*(2-1)/2 = 200.
  const state = { ...idleState(), scale: 2, translateX: -200, translateY: 0 }
  const out = applyKeyboardPan(state, { dx: 1, dy: 0 }, 400, 200)
  // Already at the left bound; pressing D wants to shift left further.
  // clampTranslate floors at -200, so the state shouldn't change.
  eq(out, state, 'pan stops at bound')
}

// applyKeyboardPan: gesture reset to idle after pan + start* sanitized.
{
  const state = { ...idleState(), scale: 2, gesture: 'pinch', startDist: 99, startCenter: { x: 5, y: 5 } }
  const out = applyKeyboardPan(state, { dx: 1, dy: 0 }, 400, 200)
  eq(out.gesture, 'idle', 'pan resets gesture to idle')
  eq(out.startCenter, null, 'startCenter cleared')
  eq(out.startDist, 0, 'startDist cleared')
  approx(out.startTranslate.x, out.translateX, 'startTranslate.x synced to current')
}

// applyKeyboardPan: null state = no-op (defensive).
{
  eq(applyKeyboardPan(null, { dx: 1, dy: 0 }, 400, 200), null, 'null state = no-op')
}

// --- R15.13 aggregateHeldPan: turns a Set of held keys into one vector ---
{
  // Empty / null / non-Set inputs → null.
  eq(aggregateHeldPan(null),       null, 'aggregate: null → null')
  eq(aggregateHeldPan(undefined),  null, 'aggregate: undefined → null')
  eq(aggregateHeldPan(new Set()),  null, 'aggregate: empty set → null')
  eq(aggregateHeldPan({}),         null, 'aggregate: non-Set → null')
}
{
  // Single axis-aligned key — unit step, no normalisation.
  eq(aggregateHeldPan(new Set(['w'])), { dx: 0, dy: -1 }, 'aggregate: w → up')
  eq(aggregateHeldPan(new Set(['s'])), { dx: 0, dy: 1 },  'aggregate: s → down')
  eq(aggregateHeldPan(new Set(['a'])), { dx: -1, dy: 0 }, 'aggregate: a → left')
  eq(aggregateHeldPan(new Set(['d'])), { dx: 1, dy: 0 },  'aggregate: d → right')
}
{
  // Vim aliases work too.
  eq(aggregateHeldPan(new Set(['k'])), { dx: 0, dy: -1 }, 'aggregate: k → up (vim)')
  eq(aggregateHeldPan(new Set(['h'])), { dx: -1, dy: 0 }, 'aggregate: h → left (vim)')
}
{
  // Two opposing keys cancel out (W + S, A + D) — return null so the
  // caller treats it as a no-op step instead of moving by zero (which
  // wastes a state-machine tick).
  eq(aggregateHeldPan(new Set(['w', 's'])), null, 'aggregate: W+S cancels')
  eq(aggregateHeldPan(new Set(['a', 'd'])), null, 'aggregate: A+D cancels')
  eq(aggregateHeldPan(new Set(['w', 's', 'a', 'd'])), null, 'aggregate: full cancel')
}
{
  // Diagonals normalise to unit length so corners don't sweep √2× faster
  // than axis-aligned moves.
  const d1 = aggregateHeldPan(new Set(['w', 'a']))
  const m  = Math.SQRT1_2
  approx(d1.dx, -m, 'aggregate: W+A → -√½ x')
  approx(d1.dy, -m, 'aggregate: W+A → -√½ y')
  // Vector magnitude is exactly 1.0.
  approx(Math.sqrt(d1.dx ** 2 + d1.dy ** 2), 1, 'aggregate: W+A length=1')
  const d2 = aggregateHeldPan(new Set(['s', 'd']))
  approx(d2.dx,  m, 'aggregate: S+D → +√½ x')
  approx(d2.dy,  m, 'aggregate: S+D → +√½ y')
}
{
  // Mixed: WASD with one vim alias on the same axis sums to a 2-step
  // axis-aligned move (which still normalises to ±1 axis-aligned —
  // we don't double the magnitude beyond unit speed).
  // Sum: w(dy=-1) + k(dy=-1) → dy = -2 — but the helper preserves the
  // sum as-is for axis-aligned cases. The renderer multiplies by
  // PAN_STEP_FRACTION + scale, so a -2 dy just doubles the step that
  // tick. That matches the user's mental model: "I'm pressing two
  // up-keys, please go up twice as fast." Documented behaviour, not
  // a bug.
  const d = aggregateHeldPan(new Set(['w', 'k']))
  eq(d.dx, 0,  'aggregate: W+K → axis dx=0')
  eq(d.dy, -2, 'aggregate: W+K → dy doubled (no diagonal normalise)')
}
{
  // Garbage keys are silently skipped; the helper returns null when
  // every key fails to classify, not a zero-vector.
  eq(aggregateHeldPan(new Set(['z', 'y', '1'])), null, 'aggregate: all unknown → null')
  // Mixed valid + garbage — only the valid one counts.
  eq(aggregateHeldPan(new Set(['z', 'd'])), { dx: 1, dy: 0 }, 'aggregate: valid + garbage → valid only')
}
{
  // Custom classifier injection point (used by future shortcut remap).
  const remap = (k) => k === '↑' ? { dx: 0, dy: -1 } : null
  const d = aggregateHeldPan(new Set(['↑']), remap)
  eq(d, { dx: 0, dy: -1 }, 'aggregate: custom classifier respected')
  // Default classifier also returns the same default when keyClassifier
  // is omitted.
  eq(aggregateHeldPan(new Set(['↑'])), null, 'aggregate: default classifier ignores ↑')
}

console.log(`PASS: pinchZoom — clamp/distance/midpoint/clampTranslate/idleState/beginPinch/updatePinch (centroid follow)/beginPan/updatePan/endGesture/applyDoubleTap/shouldInterceptWheel/toTransform/navAllowed + keyboard+wheel zoom (applyZoomBy/applyKeyboardZoomIn/Out/Reset/applyWheelZoom/classifyZoomKey) + WASD pan (classifyPanKey/applyKeyboardPan · step=${PAN_STEP_FRACTION}) + R15.13 aggregateHeldPan (empty/single/cancel/diagonal-normalise/garbage/custom-classifier) + R16.20 pan accel (threshold=${PAN_ACCEL_THRESHOLD_MS}ms / ramp=${PAN_ACCEL_RAMP_MS}ms / max=${PAN_ACCEL_MAX}×) · MIN=${MIN_SCALE} MAX=${MAX_SCALE} DOUBLE=${DOUBLE_TAP_SCALE} STEP=${KEYBOARD_ZOOM_STEP}`)

// --- R16.20: panAccelMultiplier + scaleDirByHold ---

// Defaults snapshot — pin so a future tune that changes them surfaces
// in code review rather than silently shifting feel.
eq(PAN_ACCEL_THRESHOLD_MS, 1000, 'threshold default = 1000ms')
eq(PAN_ACCEL_RAMP_MS,      1500, 'ramp default = 1500ms')
eq(PAN_ACCEL_MAX,          3,    'max default = 3×')

// Below threshold → exactly 1× (no acceleration on quick taps)
eq(panAccelMultiplier(0),    1, 'elapsed 0 → 1×')
eq(panAccelMultiplier(50),   1, 'elapsed 50ms (tap window) → 1×')
eq(panAccelMultiplier(500),  1, 'elapsed 500ms (mid-tap) → 1×')
eq(panAccelMultiplier(999),  1, 'just under threshold → 1×')
eq(panAccelMultiplier(1000), 1, 'AT threshold (inclusive) → 1×')

// Above threshold → linear lerp from 1× toward MAX over the ramp.
{
  // 1ms past the threshold: barely accelerated (still very close to 1).
  const m1 = panAccelMultiplier(1001)
  if (!(m1 > 1 && m1 < 1.01)) fail(`just past threshold should be slightly >1 but got ${m1}`)

  // Halfway through the ramp (threshold + ramp/2): exactly halfway
  // between 1 and MAX, i.e. 2× when MAX is 3.
  approx(panAccelMultiplier(1000 + 1500 / 2), 1 + (3 - 1) * 0.5, 'midway through ramp = midpoint of 1..MAX')

  // At the end of the ramp: exactly MAX (no overshoot).
  approx(panAccelMultiplier(1000 + 1500), PAN_ACCEL_MAX, 'end of ramp = MAX')

  // Past the end of the ramp: still capped at MAX (no runaway).
  eq(panAccelMultiplier(60_000),  PAN_ACCEL_MAX, '60s held still capped at MAX')
  eq(panAccelMultiplier(1e9),     PAN_ACCEL_MAX, 'absurd elapsed still capped at MAX')
}

// Monotonic on the input: held longer never gives a SLOWER step.
{
  let prev = 1
  for (const t of [0, 100, 999, 1000, 1100, 1500, 2000, 2500, 3000, 10_000]) {
    const m = panAccelMultiplier(t)
    if (m < prev) fail(`monotonicity broken at t=${t}: ${m} < ${prev}`)
    prev = m
  }
}

// Defensive: non-finite / negative input → 1× (no NaN / no <1).
eq(panAccelMultiplier(NaN),       1, 'NaN elapsed → 1×')
eq(panAccelMultiplier(undefined), 1, 'undefined elapsed → 1×')
eq(panAccelMultiplier(null),      1, 'null elapsed → 1×')
eq(panAccelMultiplier(-100),      1, 'negative elapsed → 1×')
eq(panAccelMultiplier(Infinity),  PAN_ACCEL_MAX, 'Infinity elapsed → MAX (passes the ramp)')
eq(panAccelMultiplier(-Infinity), 1,             '-Infinity elapsed → 1× (negative-safe)')

// Custom opts let callers tune the curve. ramp=0 means the multiplier
// jumps straight to MAX the moment we cross the threshold (no lerp).
{
  eq(panAccelMultiplier(500,  { thresholdMs: 200, rampMs: 0, max: 5 }), 5, 'ramp=0 + past threshold → MAX')
  eq(panAccelMultiplier(150,  { thresholdMs: 200, rampMs: 0, max: 5 }), 1, 'ramp=0 + before threshold → 1')
  approx(panAccelMultiplier(700, { thresholdMs: 200, rampMs: 1000, max: 5 }),
         1 + (5 - 1) * 0.5, 'custom curve: midway through ramp')
}

// scaleDirByHold — pre-threshold: returns the SAME ref (no allocation
// on the hot path).
{
  const dir = { dx: 0, dy: -1 }
  eq(scaleDirByHold(dir, 100), dir, 'pre-threshold returns input ref (no churn)')
  eq(scaleDirByHold(dir, 1000), dir, 'AT threshold returns input ref')
}

// scaleDirByHold — past threshold: scales components by the multiplier.
{
  const dir = { dx: 0, dy: -1 }
  // Midway through ramp = 2× when MAX=3.
  const mid = scaleDirByHold(dir, 1000 + 1500 / 2)
  approx(mid.dx, 0,  'mid: dx scaled')
  approx(mid.dy, -2, 'mid: dy scaled to 2× (1× * 2 multiplier)')
  // Past ramp = MAX (3×).
  const max = scaleDirByHold(dir, 60_000)
  approx(max.dy, -3, 'max: dy at -3 (3× multiplier)')
  // Original ref untouched.
  eq(dir.dy, -1, 'input dir not mutated')
}

// scaleDirByHold — defensive: null dir passes through, fresh object
// returned only when scaling actually changed something.
{
  eq(scaleDirByHold(null, 5000), null, 'null dir → null')
  eq(scaleDirByHold(undefined, 5000), undefined, 'undefined dir → undefined')
  const diag = { dx: 0.7, dy: -0.7 }
  // Diagonal also scales each component uniformly (the multiplier
  // is a scalar — preserves direction).
  const scaled = scaleDirByHold(diag, 60_000)
  approx(scaled.dx, 0.7 * 3,  'diagonal dx scaled')
  approx(scaled.dy, -0.7 * 3, 'diagonal dy scaled')
}

// Custom-opts passthrough into scaleDirByHold.
{
  const dir = { dx: 1, dy: 0 }
  const s = scaleDirByHold(dir, 250, { thresholdMs: 200, rampMs: 0, max: 4 })
  approx(s.dx, 4, 'custom opts threaded: ramp=0 past threshold → MAX×dx')
}

// --- R17.20: PAN_ACCEL_CURVES roster + nextPanAccelCurve + curve-shaped multiplier ---

// Roster contract — order is part of the UX (linear → exp → log → off → linear).
eq(PAN_ACCEL_CURVES.length, 4, 'PAN_ACCEL_CURVES has 4 entries')
eq(PAN_ACCEL_CURVES[0], 'linear', 'first curve = linear (default)')
eq(PAN_ACCEL_CURVES[1], 'exp',    'second curve = exp')
eq(PAN_ACCEL_CURVES[2], 'log',    'third curve = log')
eq(PAN_ACCEL_CURVES[3], 'off',    'fourth curve = off')

// nextPanAccelCurve wraps around predictably.
eq(nextPanAccelCurve('linear'), 'exp',    'cycle: linear → exp')
eq(nextPanAccelCurve('exp'),    'log',    'cycle: exp → log')
eq(nextPanAccelCurve('log'),    'off',    'cycle: log → off')
eq(nextPanAccelCurve('off'),    'linear', 'cycle: off → linear (wraparound)')
// Unknown / corrupt persisted values snap to the first entry (NOT the
// next-after) so a load can recover to a known good state.
eq(nextPanAccelCurve('cubic'),  'linear', 'unknown curve → linear (first)')
eq(nextPanAccelCurve(''),       'linear', 'empty string → linear')
eq(nextPanAccelCurve(null),     'linear', 'null → linear')
eq(nextPanAccelCurve(undefined),'linear', 'undefined → linear')

// 'off' curve: multiplier stays at 1× regardless of elapsed time. Useful
// for a calmer mode that disables acceleration entirely.
{
  eq(panAccelMultiplier(0,      { curve: 'off' }), 1, 'off + just-pressed → 1×')
  eq(panAccelMultiplier(500,    { curve: 'off' }), 1, 'off + mid-tap → 1×')
  eq(panAccelMultiplier(1001,   { curve: 'off' }), 1, 'off + past threshold → still 1×')
  eq(panAccelMultiplier(60_000, { curve: 'off' }), 1, 'off + held 60s → still 1×')
  eq(panAccelMultiplier(Infinity, { curve: 'off' }), 1, 'off + ∞ → still 1×')
}

// 'linear' curve (default): equivalent to passing no curve at all so
// existing R16.20 callsites stay untouched.
{
  approx(panAccelMultiplier(1000 + 1500 / 2, { curve: 'linear' }),
         panAccelMultiplier(1000 + 1500 / 2),
         'linear curve === default behaviour at mid-ramp')
  eq(panAccelMultiplier(60_000, { curve: 'linear' }), PAN_ACCEL_MAX, 'linear: max past ramp')
  eq(panAccelMultiplier(500,    { curve: 'linear' }), 1,             'linear: 1× pre-threshold')
}

// 'exp' curve: t^2 keeps multiplier near 1× for most of the ramp, then
// sprints to MAX. At the midpoint of the ramp (t=0.5) the shaped value
// is 0.25, so the multiplier is 1 + 0.25*(MAX-1).
{
  const midT = 0.5
  const expMid = panAccelMultiplier(1000 + 1500 * midT, { curve: 'exp' })
  approx(expMid, 1 + (midT * midT) * (PAN_ACCEL_MAX - 1),
         'exp: midway through ramp → 1 + 0.25*(MAX-1) (slow start)')
  // Compared to linear at the same t: exp must NOT overshoot linear in
  // the first half (slow-start property is what makes it useful).
  const linMid = panAccelMultiplier(1000 + 1500 * midT, { curve: 'linear' })
  if (!(expMid < linMid)) fail(`exp should be SLOWER than linear at midpoint; got exp=${expMid} lin=${linMid}`)
  // At full ramp both curves reach MAX exactly.
  approx(panAccelMultiplier(1000 + 1500, { curve: 'exp' }), PAN_ACCEL_MAX,
         'exp: end of ramp = MAX')
  // Past the ramp: still capped at MAX (no runaway from the t^2).
  eq(panAccelMultiplier(60_000, { curve: 'exp' }), PAN_ACCEL_MAX, 'exp: past ramp capped at MAX')
  // Pre-threshold: still 1× — the curve doesn't kick in before the wait.
  eq(panAccelMultiplier(500, { curve: 'exp' }), 1, 'exp: pre-threshold 1×')
}

// 'log' curve: sqrt(t) gains fast early then flattens. Mirror of exp.
{
  const midT = 0.5
  const logMid = panAccelMultiplier(1000 + 1500 * midT, { curve: 'log' })
  approx(logMid, 1 + Math.sqrt(midT) * (PAN_ACCEL_MAX - 1),
         'log: midway through ramp → 1 + sqrt(0.5)*(MAX-1) (fast start)')
  // log must be FASTER than linear at the same midpoint.
  const linMid = panAccelMultiplier(1000 + 1500 * midT, { curve: 'linear' })
  if (!(logMid > linMid)) fail(`log should be FASTER than linear at midpoint; got log=${logMid} lin=${linMid}`)
  // log + exp don't perfectly mirror linear (sqrt + square aren't a
  // mirror pair around y=x), but they DO straddle linear: exp sits
  // below, log sits above, both anchor at the same endpoints.
  const expMid = panAccelMultiplier(1000 + 1500 * midT, { curve: 'exp' })
  if (!(expMid < linMid && linMid < logMid)) {
    fail(`expected exp < linear < log at midpoint; got exp=${expMid} lin=${linMid} log=${logMid}`)
  }
  approx(panAccelMultiplier(1000 + 1500, { curve: 'log' }), PAN_ACCEL_MAX,
         'log: end of ramp = MAX')
  eq(panAccelMultiplier(500, { curve: 'log' }), 1, 'log: pre-threshold 1×')
}

// Curve-shaped monotonicity: every curve never decreases on the input.
// This is what makes the chip safe — flipping curves mid-sweep can never
// make the sweep retreat.
{
  for (const curve of PAN_ACCEL_CURVES) {
    let prev = 0
    for (const t of [0, 100, 999, 1000, 1100, 1500, 2000, 2500, 3000, 10_000]) {
      const m = panAccelMultiplier(t, { curve })
      if (m + 1e-9 < prev) fail(`monotonicity broken for ${curve} at t=${t}: ${m} < ${prev}`)
      prev = m
    }
  }
}

// Defensive: unknown curve string falls back to linear (so a corrupt
// persisted value can never NaN out the renderer).
{
  approx(panAccelMultiplier(1000 + 1500 / 2, { curve: 'wat' }),
         panAccelMultiplier(1000 + 1500 / 2, { curve: 'linear' }),
         'unknown curve → linear behaviour')
  approx(panAccelMultiplier(1000 + 1500 / 2, { curve: undefined }),
         panAccelMultiplier(1000 + 1500 / 2, { curve: 'linear' }),
         'undefined curve → linear behaviour')
}

// scaleDirByHold threads the curve preset all the way down — the chip
// click reshapes the per-tick scale on the next animation tick.
{
  const dir = { dx: 0, dy: -1 }
  const mid = 1000 + 1500 / 2
  // 'off' must short-circuit to the input ref (no allocation on hot path)
  // since the multiplier is 1.
  eq(scaleDirByHold(dir, mid, { curve: 'off' }), dir,
     'scaleDirByHold + off: input ref returned (no churn)')
  eq(scaleDirByHold(dir, 60_000, { curve: 'off' }), dir,
     'scaleDirByHold + off + 60s held: still input ref')

  // exp at mid is slower than linear → smaller magnitude scale.
  const sExp = scaleDirByHold(dir, mid, { curve: 'exp' })
  const sLin = scaleDirByHold(dir, mid, { curve: 'linear' })
  if (!(Math.abs(sExp.dy) < Math.abs(sLin.dy))) {
    fail(`scaleDirByHold: exp dy magnitude should be < linear at mid (got exp=${sExp.dy} lin=${sLin.dy})`)
  }
  // log at mid is faster than linear → larger magnitude scale.
  const sLog = scaleDirByHold(dir, mid, { curve: 'log' })
  if (!(Math.abs(sLog.dy) > Math.abs(sLin.dy))) {
    fail(`scaleDirByHold: log dy magnitude should be > linear at mid (got log=${sLog.dy} lin=${sLin.dy})`)
  }
}
