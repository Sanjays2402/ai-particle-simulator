// Mobile gesture hint — first-run helper that shows a small overlay
// teaching the two-finger pinch + horizontal-swipe gestures on
// touch devices. Pure-logic side lives here so the seen-state
// machine is unit-testable without a DOM.
//
// Storage: a single localStorage flag keyed by STORAGE_KEY. The flag
// is set on dismiss OR after the user demonstrates BOTH gestures
// (pinch + swipe) while the hint is visible — whichever happens
// first. Keeping both paths means the hint never lingers if the
// user already knows the moves AND it never wears out its welcome
// if they just tap Dismiss.

export const STORAGE_KEY = 'mobile-gesture-hint-v1-seen'

// Decide whether to show the hint at all. Inputs are kept as plain
// args so a desktop session never has to inspect `window.matchMedia`
// for itself — the App-level gate hands us the boolean.
export function shouldShowHint({ isMobile, hasSeen }) {
  if (!isMobile) return false
  if (hasSeen) return false
  return true
}

// Read the "user has dismissed / completed the hint" flag. Returns
// true on storage failure so we never harass the user when we're
// running in private mode (better to silently skip than nag).
export function hasSeenHint(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return true
  try {
    return store.getItem(STORAGE_KEY) === '1'
  } catch { return true }
}

export function markHintSeen(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, '1')
    return true
  } catch { return false }
}

// Reset — exposed for testing and for a potential "show again" entry
// point in Settings later on.
export function resetHintSeen(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    store.removeItem(STORAGE_KEY)
    return true
  } catch { return false }
}

// State-machine helper: track which gestures the user has performed
// while the hint is open. When both pinch + swipe land, the hint can
// dismiss itself (the user proved they know). Returns a new state
// object — never mutates the input.
export function recordGesture(state, gesture) {
  const base = (state && typeof state === 'object')
    ? { pinchSeen: !!state.pinchSeen, swipeSeen: !!state.swipeSeen }
    : { pinchSeen: false, swipeSeen: false }
  if (gesture === 'pinch-in' || gesture === 'pinch-out') {
    return { ...base, pinchSeen: true }
  }
  if (gesture === 'swipe-left' || gesture === 'swipe-right') {
    return { ...base, swipeSeen: true }
  }
  return base
}

// Convenience predicate: has the user demonstrated both gestures?
// Used to auto-dismiss the hint once they prove they know the moves.
export function hasDemonstratedAll(state) {
  if (!state || typeof state !== 'object') return false
  return !!state.pinchSeen && !!state.swipeSeen
}
