// R36.K — global "calm mode" master toggle.
//
// One switch that instantly settles a busy scene: it gates the four
// ambient camera/colour MOTIONS — auto-rotate, audio camera-shake, the
// global hue-cycle drift, and the zen ambient auto-orbit — all at once,
// without the user having to hunt down four separate controls and
// WITHOUT touching their accessibility `reducedMotionMode` setting
// (which suppresses much more: splash, parallax orbs, mouse trail, etc).
//
// Calm mode composes WITH reduced-motion: these motions are suppressed
// when calm mode is on OR when the user's reduced-motion setting already
// resolves true. So calm mode is a strict, user-toggleable superset gate
// over this specific motion set — turning it on can only ever add
// suppression, never re-enable something reduced-motion turned off.
//
// Pure + DOM-free so it unit-tests cleanly; the React consumers each call
// `resolveCalm(reducedMotion, calmMode)` at the single point they already
// gated on reduced motion.

// The motions calm mode gates — single source of truth so the toggle's
// helper text, any tooltip, and future callers all agree. `id` matches
// the store flag / feature each one corresponds to.
export const CALM_GATED_MOTIONS = [
  { id: 'autoRotate', label: 'Auto-rotate' },
  { id: 'cameraShake', label: 'Camera shake' },
  { id: 'hueCycle', label: 'Hue cycle' },
  { id: 'zenOrbit', label: 'Zen auto-orbit' },
]

// The gate the consumers call: should a calm-gated motion be suppressed
// right now? True when calm mode is explicitly on, or the user's
// reduced-motion preference already resolves to true. Coerces both args
// to booleans so a missing/undefined flag never throws or leaks a truthy
// object through.
export function resolveCalm(reducedMotion, calmMode) {
  return !!reducedMotion || !!calmMode
}

// Describe the live calm state for the UI — what's suppressed and which
// source is responsible — so the toggle can show an accurate helper line
// ("Reduced-motion is already calming these" vs "Calming 4 motions").
// `source` is 'calm' when calm mode is the (or a) reason, else
// 'reduced-motion' when only that is active, else 'none'. We attribute to
// 'calm' first so a user who flipped the toggle sees it credited.
// Returns a fresh object each call (pure).
export function describeCalmState(reducedMotion, calmMode) {
  const calm = !!calmMode
  const reduced = !!reducedMotion
  const active = calm || reduced
  const source = calm ? 'calm' : reduced ? 'reduced-motion' : 'none'
  return {
    active,
    source,
    count: active ? CALM_GATED_MOTIONS.length : 0,
    motions: active ? CALM_GATED_MOTIONS.map(m => m.id) : [],
  }
}
