// Camera path animator: tween smoothly between saved Camera Views.
// Pure math/state-machine helpers extracted so the React driver stays
// small and the easing + segment-stepping logic is unit-testable.
//
// Path concept:
//   - User picks an ordered list of saved views (path waypoints).
//   - Animator interpolates camera (pos + target) between consecutive
//     waypoints over `secondsPerSegment` seconds each, using a
//     smoothstep ease so the camera glides instead of snapping.
//   - Optionally loops back to the first waypoint when the tail is
//     reached; otherwise stops at the last waypoint.
//
// Shape:
//   path = { waypoints: [{ pos: [x,y,z], target: [x,y,z], name? }, ...] }

export const PATH_SECONDS_MIN = 0.5
export const PATH_SECONDS_MAX = 30
export const PATH_SECONDS_DEFAULT = 4
export const PATH_MIN_WAYPOINTS = 2

// Cubic smoothstep — the same easing crossfade uses, so transitions
// feel cohesive across the app.
export function smoothstep(t) {
  if (!Number.isFinite(t)) return 0
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * (3 - 2 * t)
}

export function clampSeconds(v) {
  if (!Number.isFinite(v)) return PATH_SECONDS_DEFAULT
  if (v < PATH_SECONDS_MIN) return PATH_SECONDS_MIN
  if (v > PATH_SECONDS_MAX) return PATH_SECONDS_MAX
  return v
}

// Linear interpolation on a 3-vector (returns a fresh array so callers
// don't have to worry about aliasing into the source waypoints).
export function lerpVec3(a, b, t) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 3 || b.length !== 3) return [0, 0, 0]
  const e = smoothstep(t)
  return [
    a[0] + (b[0] - a[0]) * e,
    a[1] + (b[1] - a[1]) * e,
    a[2] + (b[2] - a[2]) * e,
  ]
}

// Walk a path forward by `dtSec`. Returns the new animator state
// (immutable). Caller drives this from rAF and forwards the resulting
// pose into window.__particleCamera.set(...).
//
// State shape: { segmentIdx, segmentT, finished }
//   - segmentIdx: index of the segment currently being walked (0-based).
//     A path with N waypoints has N-1 segments; with looping enabled
//     the modulo wraps around so the last segment animates from
//     waypoint[N-1] back to waypoint[0].
//   - segmentT: progress within the current segment, [0, 1].
//   - finished: true once a non-looping path has completed.
export function tickPath(state, { waypoints, secondsPerSegment, loop }, dtSec) {
  if (!state || state.finished) {
    return state || { segmentIdx: 0, segmentT: 0, finished: true }
  }
  if (!Array.isArray(waypoints) || waypoints.length < PATH_MIN_WAYPOINTS) {
    return { segmentIdx: 0, segmentT: 0, finished: true }
  }
  const segs = loop ? waypoints.length : waypoints.length - 1
  if (segs <= 0) return { segmentIdx: 0, segmentT: 0, finished: true }
  const seconds = clampSeconds(secondsPerSegment)
  const advance = Math.max(0, dtSec) / seconds
  let nextT = state.segmentT + advance
  let nextIdx = state.segmentIdx
  while (nextT >= 1) {
    nextT -= 1
    nextIdx += 1
    if (nextIdx >= segs) {
      if (loop) {
        nextIdx = 0
      } else {
        // Snap to the final waypoint and mark finished.
        return { segmentIdx: segs - 1, segmentT: 1, finished: true }
      }
    }
  }
  return { segmentIdx: nextIdx, segmentT: nextT, finished: false }
}

// Sample the camera pose for the given animator state. Returns
// { pos, target } or null if the path is malformed.
export function samplePath(state, { waypoints, loop }) {
  if (!state || !Array.isArray(waypoints) || waypoints.length < PATH_MIN_WAYPOINTS) return null
  const len = waypoints.length
  const segs = loop ? len : len - 1
  const idx = Math.max(0, Math.min(segs - 1, state.segmentIdx))
  const a = waypoints[idx]
  const b = waypoints[loop ? (idx + 1) % len : Math.min(idx + 1, len - 1)]
  if (!a || !b) return null
  return {
    pos:    lerpVec3(a.pos,    b.pos,    state.segmentT),
    target: lerpVec3(a.target, b.target, state.segmentT),
  }
}

// Compute the total wall-clock duration of a path, in seconds. Useful
// for the UI label ("≈ 24s") and for tests.
export function pathDuration(waypoints, secondsPerSegment, loop) {
  if (!Array.isArray(waypoints) || waypoints.length < PATH_MIN_WAYPOINTS) return 0
  const segs = loop ? waypoints.length : waypoints.length - 1
  return Math.max(0, segs) * clampSeconds(secondsPerSegment)
}

// Initial animator state — sits at the first waypoint, fully ready
// for the next tickPath call.
export function startState() {
  return { segmentIdx: 0, segmentT: 0, finished: false }
}
