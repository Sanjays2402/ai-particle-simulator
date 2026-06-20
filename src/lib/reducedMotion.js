// Reduced-motion accessibility — figure out the effective reduced-motion
// state by combining the OS media-query signal with a user override.
// Returns a small immutable struct rather than peppering the codebase
// with media-query reads.
//
// The user has 3 possible UI choices:
//   - 'auto':    honour the OS pref (the safe default)
//   - 'reduce':  force reduced motion ON, regardless of OS
//   - 'full':    force reduced motion OFF (animations always on)
//
// `effective` is what the rest of the app actually checks. It's true
// whenever the user wants motion suppressed.

export const REDUCED_MOTION_MODES = ['auto', 'reduce', 'full']

export function resolveReducedMotion(userMode, osPrefersReduced) {
  if (userMode === 'reduce') return true
  if (userMode === 'full') return false
  // 'auto' (or anything unrecognised) defers to the OS.
  return !!osPrefersReduced
}

// Helper used by the renderer to scale animation rates. Returns 1.0
// when motion is unrestricted, smaller numbers when we want gentler
// motion. Kept linear-ish so it composes predictably with sliders.
export function motionMultiplier(reduced) {
  return reduced ? 0.0 : 1.0
}

// Browser-side media-query reader. Returns false in non-browser
// environments so SSR / tests don't crash.
export function getOSPrefersReduced() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

// Subscribe to OS changes — returns an unsubscribe fn. Calls onChange
// with the latest boolean whenever the user flips the OS pref.
export function subscribeOSReducedMotion(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  const handler = (e) => onChange(!!e.matches)
  // addEventListener is the modern API; fall back to deprecated
  // addListener for Safari < 14.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }
  mql.addListener(handler)
  return () => mql.removeListener(handler)
}
