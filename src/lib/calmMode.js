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

// --- R37.K: calm-mode auto-fading toast ------------------------------
//
// The R36.K toggle changes FOUR things at once (auto-rotate, shake,
// hue-cycle, zen orbit) but does it silently — a user clicking it has no
// confirmation of what just happened. This builds a short, render-ready
// toast descriptor naming what was paused (or resumed) so the one-click
// gate is legible.
//
// Returns:
//   { title, detail, count }
// where `title` is the headline ("Calmed 4 motions" / "Motion resumed"),
// `detail` is a comma list of the gated motion labels (so the user sees
// EXACTLY what changed), and `count` is the number of motions affected.
//
// `turningOn` true → the "paused" message; false → the "resumed"
// message. Pure; reads the labels off CALM_GATED_MOTIONS so it can never
// drift from the actual gated set. The label list joins with an Oxford
// "&" on the last item for a natural read.
export function formatCalmToast(turningOn) {
  const labels = CALM_GATED_MOTIONS.map(m => m.label)
  const count = labels.length
  const detail = joinLabels(labels)
  if (turningOn) {
    return {
      title: `Calmed ${count} motion${count === 1 ? '' : 's'}`,
      detail,
      count,
    }
  }
  return {
    title: 'Motion resumed',
    detail,
    count,
  }
}

// Join a list of labels into a human phrase: "a", "a & b", "a, b & c".
function joinLabels(labels) {
  if (!Array.isArray(labels) || labels.length === 0) return ''
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`
}

// --- R38.K: per-motion calm gating -----------------------------------
//
// R36.K's calm toggle is all-or-nothing — it gates all four motions
// together. Some users want auto-rotate paused but keep the hue-cycle
// drift, etc. This lets calm mode gate only a CHOSEN SUBSET of the four
// motions. The chosen set is a map { autoRotate, cameraShake, hueCycle,
// zenOrbit } of booleans; a motion is gated by calm mode only when its
// flag is true. Default (and the back-compat shape) is all-true so an
// existing user's calm toggle behaves exactly as before.

// The canonical id list, derived from the roster so it never drifts.
export const CALM_MOTION_IDS = CALM_GATED_MOTIONS.map(m => m.id)

// A fresh all-true gate map (every motion gated) — the default.
export function defaultCalmGates() {
  const out = {}
  for (const id of CALM_MOTION_IDS) out[id] = true
  return out
}

// Sanitise a persisted / partial gate map into a complete { id: bool }
// map over exactly the known motion ids. Unknown keys are dropped;
// missing keys default to true (gated) so a map saved before a new motion
// was added still gates the newcomer — calm mode should err toward
// calming. Non-object input → all-true default. Pure; fresh object.
export function sanitizeCalmGates(raw) {
  const base = defaultCalmGates()
  if (!raw || typeof raw !== 'object') return base
  for (const id of CALM_MOTION_IDS) {
    // Only override the default when the key is explicitly present, so a
    // partial map (e.g. just { autoRotate: false }) keeps the rest gated.
    if (Object.prototype.hasOwnProperty.call(raw, id)) base[id] = !!raw[id]
  }
  return base
}

// Toggle one motion's gate in a map, returning a FRESH map (never mutates
// the input). Unknown id → the input is sanitised + returned unchanged in
// effect (no key flips) so a stale id from an old UI can't corrupt state.
export function toggleCalmGate(gates, id) {
  const next = sanitizeCalmGates(gates)
  if (CALM_MOTION_IDS.includes(id)) next[id] = !next[id]
  return next
}

// The per-motion gate the consumers call: should THIS specific motion be
// suppressed right now? Reduced motion ALWAYS suppresses (accessibility
// is absolute and not subset-able). Calm mode suppresses only when it's
// on AND this motion is in the gated set. Coerces args defensively.
//
// This is a strict refinement of resolveCalm: with the default all-true
// gates, resolveCalmFor(id, r, c) === resolveCalm(r, c) for every id, so
// existing behaviour is preserved until a user opts a motion out.
export function resolveCalmFor(motionId, reducedMotion, calmMode, gates) {
  if (reducedMotion) return true
  if (!calmMode) return false
  const g = sanitizeCalmGates(gates)
  // An unknown motion id defaults to gated (true) so a typo at a call
  // site fails safe toward calming rather than silently leaking motion.
  return CALM_MOTION_IDS.includes(motionId) ? g[motionId] : true
}

// Count how many of the four motions calm mode is currently gating (for
// the toggle's tooltip / toast: "Calming 2 of 4 motions"). Pure.
export function countGatedMotions(gates) {
  const g = sanitizeCalmGates(gates)
  return CALM_MOTION_IDS.reduce((n, id) => n + (g[id] ? 1 : 0), 0)
}
