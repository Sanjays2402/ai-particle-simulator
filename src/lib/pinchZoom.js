// pinchZoom — pure math + a tiny state machine for two-finger pinch-zoom
// + drag-pan on the snapshot lightbox. The component listens to touch
// events and feeds them through these helpers; the React layer stays a
// thin shell and the math is fully unit-testable without a DOM.
//
// State shape:
//   { scale: number,       // current zoom factor, clamped to [MIN, MAX]
//     translateX: number,  // px offset from natural center
//     translateY: number,
//     // Captured at gesture start so deltas are stable across moves.
//     startScale, startCenter: {x,y}, startDist, startTranslate: {x,y},
//     gesture: 'idle' | 'pinch' | 'pan',
//   }
//
// `MIN_SCALE=1` because the image already fits the screen at scale 1
// (object-fit: contain on the natural image inside the lightbox stage).
// Going below 1 would just shrink the image into a corner — not useful.
//
// Translation is bounded by `clampTranslate` so the image can't pan off
// into the void: you can drag farther the more zoomed in you are, but
// never more than the overhang the zoom created.

export const MIN_SCALE = 1
export const MAX_SCALE = 5
export const DOUBLE_TAP_SCALE = 2     // target zoom on double-tap
export const DOUBLE_TAP_MS = 320      // max ms between taps that count as a double

export function clampScale(s) {
  if (!Number.isFinite(s)) return MIN_SCALE
  if (s < MIN_SCALE) return MIN_SCALE
  if (s > MAX_SCALE) return MAX_SCALE
  return s
}

// Pythagoras between two {x,y} points.
export function distance(a, b) {
  if (!a || !b) return 0
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

// Midpoint between two {x,y} points — returns null if either missing.
export function midpoint(a, b) {
  if (!a || !b) return null
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Given a translate offset and a current scale, clamp the offset so the
// image never floats off the visible stage. The stage is `stageW × stageH`;
// at scale s the image dimensions are stageW*s × stageH*s, so the
// half-overhang on each axis is stageW*(s-1)/2 (and same for y). We
// allow translation up to exactly that amount in each direction so the
// edge of the image never moves into the interior of the stage.
export function clampTranslate(tx, ty, scale, stageW, stageH) {
  const s = clampScale(scale)
  const w = (stageW > 0 && Number.isFinite(stageW)) ? stageW : 0
  const h = (stageH > 0 && Number.isFinite(stageH)) ? stageH : 0
  const maxX = Math.max(0, (w * (s - 1)) / 2)
  const maxY = Math.max(0, (h * (s - 1)) / 2)
  const cx = Math.max(-maxX, Math.min(maxX, Number.isFinite(tx) ? tx : 0))
  const cy = Math.max(-maxY, Math.min(maxY, Number.isFinite(ty) ? ty : 0))
  return { x: cx, y: cy }
}

// Build a fresh, idle state. The translate stays at (0, 0) so the
// image sits centered on the stage.
export function idleState() {
  return {
    scale: MIN_SCALE,
    translateX: 0,
    translateY: 0,
    startScale: MIN_SCALE,
    startCenter: null,
    startDist: 0,
    startTranslate: { x: 0, y: 0 },
    gesture: 'idle',
  }
}

// Begin a pinch gesture with the two touch points. We capture the
// initial distance and centroid so subsequent moves can compute a
// stable scale ratio + recenter delta.
export function beginPinch(state, p0, p1) {
  const startDist = distance(p0, p1)
  if (startDist <= 0) return state
  return {
    ...state,
    gesture: 'pinch',
    startScale: state.scale,
    startCenter: midpoint(p0, p1),
    startDist,
    startTranslate: { x: state.translateX, y: state.translateY },
  }
}

// Update during a pinch — recompute scale as ratio of current-to-start
// distance, then translate to keep the pinch centroid roughly fixed
// in image-space (the user expects pinch-zooming on a corner to
// magnify that corner). Stage bounds clamp the translation so the
// image stays anchored.
export function updatePinch(state, p0, p1, stageW, stageH) {
  if (state.gesture !== 'pinch' || !state.startCenter || state.startDist <= 0) return state
  const currDist = distance(p0, p1)
  if (currDist <= 0) return state
  const ratio = currDist / state.startDist
  const nextScale = clampScale(state.startScale * ratio)
  // Pan so the pinch centroid follows the user's fingers. Without this,
  // a centered pinch silently drags the image as the user's fingers
  // travel; with it, the centroid stays glued under the fingers.
  const currCenter = midpoint(p0, p1)
  const dx = (currCenter.x - state.startCenter.x)
  const dy = (currCenter.y - state.startCenter.y)
  const desired = clampTranslate(
    state.startTranslate.x + dx,
    state.startTranslate.y + dy,
    nextScale, stageW, stageH,
  )
  return { ...state, scale: nextScale, translateX: desired.x, translateY: desired.y }
}

// Begin a single-finger drag — only meaningful when zoomed (scale > 1).
// Captures the start translate so deltas are stable.
export function beginPan(state, p) {
  if (state.scale <= MIN_SCALE) return state
  if (!p) return state
  return {
    ...state,
    gesture: 'pan',
    startCenter: { x: p.x, y: p.y },
    startTranslate: { x: state.translateX, y: state.translateY },
  }
}

// Update during a single-finger drag — re-bound to stage as we go.
export function updatePan(state, p, stageW, stageH) {
  if (state.gesture !== 'pan' || !state.startCenter || !p) return state
  const dx = p.x - state.startCenter.x
  const dy = p.y - state.startCenter.y
  const desired = clampTranslate(
    state.startTranslate.x + dx,
    state.startTranslate.y + dy,
    state.scale, stageW, stageH,
  )
  return { ...state, translateX: desired.x, translateY: desired.y }
}

// Mark gesture finished, snap translate back into bounds (in case the
// stage shrank mid-gesture), and reset start* fields so a future
// gesture begins from a clean slate.
export function endGesture(state, stageW, stageH) {
  const bounded = clampTranslate(state.translateX, state.translateY, state.scale, stageW, stageH)
  return {
    ...state,
    gesture: 'idle',
    translateX: bounded.x,
    translateY: bounded.y,
    startCenter: null,
    startDist: 0,
    startTranslate: { x: bounded.x, y: bounded.y },
  }
}

// Double-tap: if currently zoomed, return to idle (scale 1, centered).
// If currently at idle, jump to DOUBLE_TAP_SCALE and try to center the
// tap point. Tap-aware zoom-in (so double-tapping a corner zooms TO
// that corner) — the new translate shifts the image so the tap location
// stays roughly fixed under the finger.
export function applyDoubleTap(state, tapPoint, stageW, stageH) {
  if (state.scale > MIN_SCALE) {
    // Reset → fully zoomed-out, centered.
    return { ...idleState() }
  }
  if (!tapPoint) {
    return { ...idleState(), scale: DOUBLE_TAP_SCALE }
  }
  // Offset of the tap from the stage center, scaled up so the same
  // image point sits under the finger after the zoom.
  const w = (stageW > 0 && Number.isFinite(stageW)) ? stageW : 0
  const h = (stageH > 0 && Number.isFinite(stageH)) ? stageH : 0
  const cx = w / 2
  const cy = h / 2
  // We want the world coordinate at tapPoint to remain at tapPoint
  // after the zoom. Under transform: translate(tx, ty) scale(s),
  // the world point that lands at screen p satisfies
  //   p = (worldP * s) + (tx, ty) + (cx, cy)
  // For tap to stay fixed at scale s' starting from idle (s=1, t=0):
  //   tapX = (worldP.x * s') + tx + cx, where worldP.x = tapX - cx
  // ⇒ tx = (1 - s') * (tapX - cx)
  const s = DOUBLE_TAP_SCALE
  const tx = (1 - s) * (tapPoint.x - cx)
  const ty = (1 - s) * (tapPoint.y - cy)
  const desired = clampTranslate(tx, ty, s, w, h)
  return {
    ...idleState(),
    scale: s,
    translateX: desired.x,
    translateY: desired.y,
  }
}

// Should a wheel/pinch trackpad event be intercepted? Returns true
// when the resulting scale would actually change something — keeps the
// background page scroll behaviour intact when we're at idle and the
// wheel direction would zoom out below MIN_SCALE.
export function shouldInterceptWheel(state, deltaY) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return false
  if (deltaY < 0) return state.scale < MAX_SCALE  // zoom-in possible
  return state.scale > MIN_SCALE                   // zoom-out possible
}

// Build the CSS transform string for the current state. Transform
// origin should be the stage center (so scale operates around it),
// then the translate is applied in scaled space.
export function toTransform(state) {
  const s = clampScale(state.scale)
  return `translate(${state.translateX}px, ${state.translateY}px) scale(${s})`
}

// Should the lightbox arrow-key navigation be active right now? We
// suppress next/prev when zoomed in, so users can pan without
// accidentally swiping to a different image. Idle scale → arrows on.
export function navAllowed(state) {
  return state.scale <= MIN_SCALE
}

// --- Desktop keyboard / wheel zoom (R11.15) ---
// Multiplier per +/- press. 1.25x feels right — three taps gets you
// roughly to DOUBLE_TAP_SCALE (1.25^3 ≈ 1.95). Mirrors the pinch
// behaviour: zoom is centered on the stage centre because we don't
// know where the cursor is for keyboard input.
export const KEYBOARD_ZOOM_STEP = 1.25

// Apply a multiplicative zoom factor. When `anchor` is provided
// (e.g. wheel events with the mouse cursor coords), keep the world
// point under the anchor stable — same math the double-tap helper
// uses. When `anchor` is null, scale around the stage centre.
// Always clamps + bounds-checks the resulting translate.
export function applyZoomBy(state, factor, anchor, stageW, stageH) {
  if (!Number.isFinite(factor) || factor <= 0) return state
  const prevScale = clampScale(state.scale)
  const nextScale = clampScale(prevScale * factor)
  // No-op when clamped at the boundary in this direction.
  if (nextScale === prevScale) return state
  const w = (stageW > 0 && Number.isFinite(stageW)) ? stageW : 0
  const h = (stageH > 0 && Number.isFinite(stageH)) ? stageH : 0
  const cx = w / 2
  const cy = h / 2
  // Snap back to idle when scale falls back to MIN_SCALE — keeps the
  // image perfectly centered (no stale translate from a previous pan).
  if (nextScale <= MIN_SCALE) {
    return { ...idleState() }
  }
  // When anchor is missing fall back to the stage centre — the same
  // point we already use as transform origin so the visual stays
  // centred. Same algebra as applyDoubleTap.
  const a = anchor || { x: cx, y: cy }
  const k = nextScale / prevScale
  // Current world coord under anchor (stage centre origin):
  //   world = (anchor - centre - translate_prev) / prevScale
  // After scaling, we want the same world coord still under anchor:
  //   anchor = world * nextScale + translate_next + centre
  // ⇒ translate_next = anchor - centre - world * nextScale
  //                  = (anchor - centre) - ((anchor - centre - tPrev) * k)
  //                  = (anchor - centre)(1 - k) + tPrev * k
  const dx = (a.x - cx) * (1 - k) + state.translateX * k
  const dy = (a.y - cy) * (1 - k) + state.translateY * k
  const desired = clampTranslate(dx, dy, nextScale, w, h)
  return {
    ...state,
    gesture: 'idle',
    scale: nextScale,
    translateX: desired.x,
    translateY: desired.y,
    startCenter: null,
    startDist: 0,
    startTranslate: { x: desired.x, y: desired.y },
  }
}

// Convenience wrappers for keyboard handlers. `applyResetZoom` is just
// idleState() but exported under a descriptive name so the React layer
// reads cleanly: handlers map intent → helper → state.
export function applyKeyboardZoomIn(state, stageW, stageH) {
  return applyZoomBy(state, KEYBOARD_ZOOM_STEP, null, stageW, stageH)
}
export function applyKeyboardZoomOut(state, stageW, stageH) {
  return applyZoomBy(state, 1 / KEYBOARD_ZOOM_STEP, null, stageW, stageH)
}
export function applyResetZoom() {
  return idleState()
}

// Convert a wheel deltaY into a zoom factor — small steps so a single
// trackpad gesture doesn't snap from 1x to 5x. anchor is the cursor
// position in stage-local coords so the world point under the mouse
// stays fixed (the standard "zoom to cursor" feel).
export function applyWheelZoom(state, deltaY, anchor, stageW, stageH) {
  if (!Number.isFinite(deltaY) || deltaY === 0) return state
  // Sign convention: wheel up (negative deltaY) zooms IN, wheel down
  // (positive deltaY) zooms OUT — matches every major browser's
  // page-zoom binding.
  // Factor per tick: a "natural" trackpad scroll fires lots of small
  // deltas; clamp the per-event multiplier to a polite range so the
  // result feels controllable.
  const intensity = Math.min(Math.abs(deltaY) / 200, 0.5)
  const factor = deltaY < 0 ? 1 + intensity : 1 / (1 + intensity)
  return applyZoomBy(state, factor, anchor, stageW, stageH)
}

// R15.13 — aggregate a Set of currently-held pan keys into a single
// normalised direction vector. Sums each key's classified direction
// (W = up, A = left, etc.) and normalises to unit length when the
// result is diagonal so corners don't sweep √2× faster than axis-
// aligned moves. Returns null when nothing's held OR opposing keys
// cancel out (W + S, A + D) — caller treats null as "no-op step".
//
// Pure + side-effect free so the hold-to-repeat state machine in
// SnapshotGallery can be unit-tested without a DOM. `keyClassifier`
// is injected (always classifyPanKey in practice) so the helper
// stays decoupled from the WASD vocabulary — a future shortcut
// remapper could swap it without touching pinchZoom internals.
export function aggregateHeldPan(heldKeys, keyClassifier = classifyPanKey) {
  if (!heldKeys || typeof heldKeys.size !== 'number' || heldKeys.size === 0) return null
  let dx = 0, dy = 0
  let count = 0
  for (const k of heldKeys) {
    const dir = keyClassifier(k)
    if (!dir) continue
    dx += dir.dx || 0
    dy += dir.dy || 0
    count++
  }
  if (count === 0) return null
  if (dx === 0 && dy === 0) return null  // cancelling pair (W+S or A+D)
  // Normalise diagonal to unit length so corner moves match axis moves
  // in absolute pan distance per tick. Axis-aligned moves stay ±1, so
  // skip the divide for them (cheap fast path).
  if (dx !== 0 && dy !== 0) {
    const m = Math.SQRT1_2
    dx *= m; dy *= m
  }
  return { dx, dy }
}

// Map a KeyboardEvent.key to a zoom intent. Returns null for keys
// we don't care about so the lightbox can early-out. Accepts '+',
// '=' (same key on US layout, no shift required), '-', '_', '0'.
export function classifyZoomKey(key) {
  if (key === '+' || key === '=') return 'in'
  if (key === '-' || key === '_') return 'out'
  if (key === '0') return 'reset'
  return null
}

// --- Desktop keyboard pan (R12.19) ---
// When the lightbox is zoomed in, the user wants a quick way to scan
// around without dragging the mouse. WASD (and the arrow-style aliases
// h/j/k/l for vim users) shift the translate by a fraction of the
// stage so 4-5 taps cross the visible overhang at every zoom level.
//
// PAN_STEP_FRACTION is the per-key shift expressed as a fraction of
// the stage dimension. 0.15 means each tap moves ~15% of the visible
// stage — enough to feel responsive without overshooting common
// inspect points. Multiplied by the current scale so the user moves
// a similar distance in image-space at any zoom level.
export const PAN_STEP_FRACTION = 0.15

// Classify a key into a pan direction or null. WASD is the primary
// vocabulary; hjkl are bonus aliases for vim muscle memory. Returns
// one of {dx, dy} in normalized "+/-1 step" units that callers feed
// to applyKeyboardPan.
export function classifyPanKey(key) {
  if (key === 'w' || key === 'W' || key === 'k' || key === 'K') return { dx: 0,  dy: -1 }
  if (key === 's' || key === 'S' || key === 'j' || key === 'J') return { dx: 0,  dy: 1 }
  if (key === 'a' || key === 'A' || key === 'h' || key === 'H') return { dx: -1, dy: 0 }
  if (key === 'd' || key === 'D' || key === 'l' || key === 'L') return { dx: 1,  dy: 0 }
  return null
}

// Apply a pan step in the supplied direction. Direction sign matches
// how the user feels the move: pressing W (up) should move the IMAGE
// down so a feature above the centre comes into view — that's the
// opposite of the translate direction (translate is in screen space,
// image content moves in the opposite direction of translation).
// We do the sign-flip here so callers can pass intuitive {dx, dy}
// values from classifyPanKey.
//
// Returns the new state. No-op when not zoomed (scale === MIN_SCALE)
// since there's nothing to pan into.
export function applyKeyboardPan(state, dir, stageW, stageH) {
  if (!dir || !state) return state
  const s = clampScale(state.scale)
  if (s <= MIN_SCALE) return state
  const w = (stageW > 0 && Number.isFinite(stageW)) ? stageW : 0
  const h = (stageH > 0 && Number.isFinite(stageH)) ? stageH : 0
  // Step = fraction of the stage scaled by the current zoom. At
  // scale=2 a 15% stage step moves ~30% of the natural image width
  // per press — feels right for casual inspection without being
  // jumpy.
  const stepX = w * PAN_STEP_FRACTION * s
  const stepY = h * PAN_STEP_FRACTION * s
  // Sign flip: pressing W (dy=-1, "move view up") should decrease
  // the translate.y so the image shifts DOWN under the viewport
  // and we see content that was previously above the visible area.
  const dx = -(dir.dx || 0) * stepX
  const dy = -(dir.dy || 0) * stepY
  const desired = clampTranslate(
    state.translateX + dx,
    state.translateY + dy,
    s, w, h,
  )
  // No-op when already at the bound in this direction so a held key
  // doesn't keep generating identical states (and a future memoiser
  // can early-out).
  if (desired.x === state.translateX && desired.y === state.translateY) {
    return state
  }
  return {
    ...state,
    gesture: 'idle',
    translateX: desired.x,
    translateY: desired.y,
    startCenter: null,
    startDist: 0,
    startTranslate: { x: desired.x, y: desired.y },
  }
}

// R16.20 — acceleration curve for held WASD pans. When the user holds
// a key for longer than PAN_ACCEL_THRESHOLD_MS (default 1000ms = the
// "this is a sustained sweep, not a tap" boundary), the per-tick step
// ramps up linearly from 1× to PAN_ACCEL_MAX over PAN_ACCEL_RAMP_MS
// (default 1500ms = a 2.5s total hold reaches max). Below the
// threshold the multiplier stays at 1× so tap-to-nudge and short
// hops near the centre keep their precise R15.13 behaviour.
//
// Pure: no DOM, no state — caller threads `elapsedMs` from a held-
// since-press timestamp it owns. Multiplier output is monotonically
// non-decreasing on the input (a held key never gets SLOWER).
//
// Defensive contract:
//   - non-finite / negative elapsedMs → 1× (treat as "just pressed")
//   - elapsedMs at/below threshold → 1× exactly
//   - elapsedMs between threshold and (threshold + ramp) → linear lerp
//   - elapsedMs at/beyond (threshold + ramp) → PAN_ACCEL_MAX exactly
//   - opts let callsites tune the curve without re-importing the
//     constants (used by tests to pin the contract at custom values)
export const PAN_ACCEL_THRESHOLD_MS = 1000
export const PAN_ACCEL_RAMP_MS      = 1500
export const PAN_ACCEL_MAX          = 3

export function panAccelMultiplier(elapsedMs, opts = {}) {
  const threshold = Number.isFinite(opts.thresholdMs) ? opts.thresholdMs : PAN_ACCEL_THRESHOLD_MS
  const ramp      = Number.isFinite(opts.rampMs)      ? opts.rampMs      : PAN_ACCEL_RAMP_MS
  const max       = Number.isFinite(opts.max)         ? opts.max         : PAN_ACCEL_MAX
  if (Number.isNaN(elapsedMs) || elapsedMs == null) return 1
  if (elapsedMs === -Infinity || elapsedMs <= 0)     return 1
  // R17.20 — 'off' shortcuts the whole acceleration system: the
  // multiplier stays at 1× forever so a single sustained sweep moves
  // at the same speed as a tap-tap-tap. Useful when a user wants
  // tighter control (e.g. inspecting fine detail of a snapshot) and
  // finds the ramp-up jarring.
  if (opts.curve === 'off')                          return 1
  if (elapsedMs <= threshold)                        return 1
  if (elapsedMs === Infinity || ramp <= 0)           return max
  const t = (elapsedMs - threshold) / ramp  // 0..1, normalized along the ramp
  // R17.20 — reshape the ramp via a curve preset. 'linear' (default)
  // is the R16.20 behaviour; 'exp' starts slow then sprints (most of
  // the speed-up sits past the half-ramp mark — gentle wake-up before
  // the explosive sweep); 'log' starts fast then settles (lots of
  // help in the first chunk after the threshold — better for users
  // who feel the wait at 1× before things speed up).
  let shaped
  if (t >= 1) {
    shaped = 1
  } else if (opts.curve === 'exp') {
    // t^2 keeps the start near 1× and pushes the gain late.
    shaped = t * t
  } else if (opts.curve === 'log') {
    // sqrt(t) gains fast early then flattens.
    shaped = Math.sqrt(t)
  } else {
    shaped = t
  }
  return 1 + shaped * (max - 1)
}

// R17.20 — roster of acceleration curve presets. Order is meaningful:
// the cycle chip walks linear → exp → log → off → linear so a single
// click moves the user predictably through the available choices.
//   - linear : R16.20 baseline. Even ramp from 1× to MAX over the ramp window.
//   - exp    : slow start, sprint finish. Bias toward delicate fine-motion.
//   - log    : fast start, settle. Bias toward quick coverage.
//   - off    : disable acceleration entirely. Holds stay at 1× forever.
export const PAN_ACCEL_CURVES = ['linear', 'exp', 'log', 'off']

// Cycle the curve forward through PAN_ACCEL_CURVES with wraparound.
// Mirrors the R16.17 nextTrailCurve shape so the chip UX is identical.
// Unknown current curves snap to the first entry, not the next-after.
export function nextPanAccelCurve(current) {
  const idx = PAN_ACCEL_CURVES.indexOf(current)
  if (idx < 0) return PAN_ACCEL_CURVES[0]
  return PAN_ACCEL_CURVES[(idx + 1) % PAN_ACCEL_CURVES.length]
}

// R16.20 — scale a pan direction vector by the acceleration multiplier.
// Convenience wrapper for the common case: caller has the elapsed hold
// time + the aggregated direction from aggregateHeldPan, and wants to
// feed the scaled vector into applyKeyboardPan without re-deriving the
// curve math at the callsite. Returns a NEW direction object; the
// input is never mutated.
// R17.20 — opts.curve passes through to panAccelMultiplier so the
// callsite stays a single function call regardless of the active curve.
export function scaleDirByHold(dir, elapsedMs, opts = {}) {
  if (!dir) return dir
  const mult = panAccelMultiplier(elapsedMs, opts)
  if (mult === 1) return dir
  return { dx: (dir.dx || 0) * mult, dy: (dir.dy || 0) * mult }
}
