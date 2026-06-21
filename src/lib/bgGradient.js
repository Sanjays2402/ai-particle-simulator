// bgGradient: verify the angle clamp & CSS string builder.
// Pure helper extracted from the store reducer so we can unit-test
// the clamp/round contract without spinning up zustand.

export function clampAngle(v) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(360, v | 0))
}

export function buildGradientCss(angle, a, b) {
  const ang = clampAngle(angle)
  return `linear-gradient(${ang}deg, ${a} 0%, ${b} 100%)`
}

// Audio-reactive background gradient — pure math for the hue-rotate
// degrees applied to the gradient div as a CSS filter. Driven by the
// currently-active audio reactivity signal (level / bass / beat) so
// the gradient breathes in sync with the music. Cheap by construction:
// only the `filter: hue-rotate(<deg>)` style updates per frame; the
// gradient itself stays the same.
//
// `audioReactiveStrength` is the user-tunable 0..1 amount. Max swing
// at strength=1 is +/- HUE_REACTIVE_MAX_DEG so even a loud beat can
// never invert the gradient colors entirely.
export const HUE_REACTIVE_MAX_DEG = 90
export const HUE_REACTIVE_STRENGTH_MIN = 0
export const HUE_REACTIVE_STRENGTH_MAX = 1

export function clampHueReactiveStrength(v) {
  if (!Number.isFinite(v)) return 0.5
  return Math.max(HUE_REACTIVE_STRENGTH_MIN, Math.min(HUE_REACTIVE_STRENGTH_MAX, v))
}

// Pick the right audio signal for the active mode. Falls back to 0
// when reactivity is off so the gradient stays static.
//   audioMode = 'level' | 'bass' | 'beat'
export function pickAudioSignal(audioMode, levels) {
  if (!levels) return 0
  const { level = 0, bass = 0, beat = 0 } = levels
  if (audioMode === 'beat') return beat
  if (audioMode === 'bass') return bass
  return level
}

// Compute the hue-rotate degrees to apply this frame. Always returns
// a finite number in [-HUE_REACTIVE_MAX_DEG, +HUE_REACTIVE_MAX_DEG].
// The signal is treated as 0..1; we map it into [-max, +max] so the
// neutral (no audio) state is 0 and a peak signal swings positive.
// At strength=0 the function always returns 0 (audio is muted out).
// `curveId` reshapes the signal before mapping (Pulse / Ramp / Hold);
// defaults to 'linear' to match the historic behaviour.
export function computeReactiveHueDeg(signal, strength, curveId = 'linear') {
  const raw = Number.isFinite(signal) ? Math.max(0, Math.min(1, signal)) : 0
  const s = shapeReactiveSignal(raw, curveId)
  const w = clampHueReactiveStrength(strength)
  // -max + 2*max*s → goes from -max at silence to +max at peak.
  // Multiplied by strength so 0 means "no reactivity".
  return (-HUE_REACTIVE_MAX_DEG + 2 * HUE_REACTIVE_MAX_DEG * s) * w
}

// --- Curve preset chips (R12.03) ---
// One-tap intent chips for the gradient's audio-reactive feel. Each
// curve reshapes the 0..1 signal before the linear map runs:
//   - linear  : pass-through; same swing as the historical default.
//   - pulse   : exaggerated mid-zone — small dips/bumps get amplified.
//               Shape: 0.5 + (s - 0.5) * |2s - 1|. Smooth, no jump.
//   - ramp    : ease-in cubic; quiet end of the range stays calm, loud
//               end rockets toward +max. Good for vocals + transients.
//   - hold    : holds at neutral until the signal exceeds 0.5, then
//               climbs hard toward +max. Beats only, never on ambient.
// Every curve returns a value in [0, 1] so the existing -max..+max
// mapping is preserved and the swing limit can't be exceeded.
export const REACTIVE_CURVES = [
  { id: 'linear', label: 'Linear', hint: 'Even response across the whole signal' },
  { id: 'pulse',  label: 'Pulse',  hint: 'Boost the mid-zone — accents soft + loud' },
  { id: 'ramp',   label: 'Ramp',   hint: 'Ease-in — quiet stays calm, loud kicks hard' },
  { id: 'hold',   label: 'Hold',   hint: 'Idle until past 50% — beat-only response' },
]

export const REACTIVE_CURVE_DEFAULT = 'linear'

const REACTIVE_CURVE_IDS = new Set(REACTIVE_CURVES.map(c => c.id))

export function isValidReactiveCurve(id) {
  return typeof id === 'string' && REACTIVE_CURVE_IDS.has(id)
}

export function normalizeReactiveCurve(id) {
  return isValidReactiveCurve(id) ? id : REACTIVE_CURVE_DEFAULT
}

// Pure reshape — input/output both in [0, 1]. Caller is responsible
// for clamping the input; this returns a clamped output regardless.
export function shapeReactiveSignal(signal, curveId = 'linear') {
  const s = Number.isFinite(signal) ? Math.max(0, Math.min(1, signal)) : 0
  switch (normalizeReactiveCurve(curveId)) {
    case 'pulse': {
      // Sqrt-boost away from the neutral midpoint — small departures
      // get amplified (so quiet bumps register), extremes still cap at
      // 0/1. Symmetric around 0.5: shape(0.5-d) + shape(0.5+d) === 1
      // for any d ∈ [0, 0.5]. Fixed points at 0, 0.5, 1.
      const d = s - 0.5
      const sign = d === 0 ? 0 : (d > 0 ? 1 : -1)
      // Math.sqrt(|d| * 2) * 0.5 maps |d| ∈ [0, 0.5] → [0, 0.5]
      // but with a sqrt curve so values near 0 get pushed harder
      // than they would under the linear pass-through.
      const eased = Math.sqrt(Math.abs(d) * 2) * 0.5
      const out = 0.5 + sign * eased
      return Math.max(0, Math.min(1, out))
    }
    case 'ramp': {
      // Ease-in cubic — quiet end of the range stays near 0 longer,
      // loud end rockets toward 1. Same fixed points (0 → 0, 1 → 1).
      return s * s * s
    }
    case 'hold': {
      // Stay at the neutral midpoint until the signal exceeds 0.5,
      // then track the signal linearly to 1. Below 0.5 we hold at 0.5
      // so the resulting hue-rotate stays 0 (matching the silence-
      // neutral contract). Above 0.5 shape(s) = s (a clean linear
      // ramp from 0.5 → 1 over s ∈ [0.5, 1]).
      if (s <= 0.5) return 0.5
      return s
    }
    case 'linear':
    default:
      return s
  }
}

// Build the CSS filter string the gradient div uses. Returns an
// empty string when the rotation would be a no-op so the browser
// doesn't have to keep tearing down + rebuilding a filter chain
// every frame at idle.
export function buildHueFilterCss(deg) {
  if (!Number.isFinite(deg) || Math.abs(deg) < 0.01) return ''
  return `hue-rotate(${deg.toFixed(2)}deg)`
}
