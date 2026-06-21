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
