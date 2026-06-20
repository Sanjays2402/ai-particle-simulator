// Depth of Field helpers — clamp & validate DoF parameter ranges so
// the UI sliders / share URL never push the postprocessing effect
// into a numerically unstable region. Pure functions, unit-testable.
//
// Ranges chosen empirically by tuning a scene with 20k particles:
//   - focusDistance / focalLength: 0..1 normalized (effect's contract)
//   - bokehScale:                 0..20 — beyond ~12 the blur kernel
//     starts to lose definition and just smears the frame.

export const DOF_FOCUS_MIN = 0
export const DOF_FOCUS_MAX = 1
export const DOF_FOCAL_MIN = 0
export const DOF_FOCAL_MAX = 1
export const DOF_BOKEH_MIN = 0
export const DOF_BOKEH_MAX = 20

function clamp(v, lo, hi, fallback) {
  if (!Number.isFinite(v)) return fallback
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}

export function clampFocusDistance(v) {
  return clamp(v, DOF_FOCUS_MIN, DOF_FOCUS_MAX, 0.022)
}

export function clampFocalLength(v) {
  return clamp(v, DOF_FOCAL_MIN, DOF_FOCAL_MAX, 0.05)
}

export function clampBokehScale(v) {
  return clamp(v, DOF_BOKEH_MIN, DOF_BOKEH_MAX, 4.0)
}

// Normalize a full DoF settings object (used by the share-URL decode
// path). Missing fields fall back to their defaults so partial data
// round-trips cleanly.
export function normalizeDof(input) {
  const i = input && typeof input === 'object' ? input : {}
  return {
    enabled: !!i.enabled,
    focusDistance: clampFocusDistance(i.focusDistance),
    focalLength:   clampFocalLength(i.focalLength),
    bokehScale:    clampBokehScale(i.bokehScale),
  }
}
