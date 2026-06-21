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
export function computeReactiveHueDeg(signal, strength) {
  const s = Number.isFinite(signal) ? Math.max(0, Math.min(1, signal)) : 0
  const w = clampHueReactiveStrength(strength)
  // -max + 2*max*s → goes from -max at silence to +max at peak.
  // Multiplied by strength so 0 means "no reactivity".
  return (-HUE_REACTIVE_MAX_DEG + 2 * HUE_REACTIVE_MAX_DEG * s) * w
}

// Build the CSS filter string the gradient div uses. Returns an
// empty string when the rotation would be a no-op so the browser
// doesn't have to keep tearing down + rebuilding a filter chain
// every frame at idle.
export function buildHueFilterCss(deg) {
  if (!Number.isFinite(deg) || Math.abs(deg) < 0.01) return ''
  return `hue-rotate(${deg.toFixed(2)}deg)`
}
