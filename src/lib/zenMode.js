// Zen mode — distraction-free full-bleed particles.
//
// Press Z to hide every piece of UI chrome (top bar, sidebars, carousel,
// status strip, overlays) so the particle field fills the whole screen
// for presentation / screen-recording / just vibing. Press Z (or Esc)
// to bring the chrome back. While in zen mode the cursor auto-hides
// after a few seconds of stillness and reappears on any movement, the
// way a video player's controls do.
//
// This module owns the pure bits — the list of chrome selectors the
// overlay fades, and the cursor-idle decision — so the React side stays
// a thin controller and the logic unit-tests without a DOM.

// How long (ms) the cursor stays visible after the last movement before
// auto-hiding in zen mode.
export const CURSOR_IDLE_MS = 2600

// Decide whether the cursor should be hidden right now, given when it
// last moved and the current time. Pure.
//   - not in zen mode → always visible (never hide)
//   - moved more recently than the idle window → visible
//   - still for longer than the idle window → hidden
// Defensive: non-finite timestamps → visible (never hide on bad data,
// so a glitch can't trap the user with no cursor).
export function shouldHideCursor(zenActive, lastMoveMs, nowMs, idleMs = CURSOR_IDLE_MS) {
  if (!zenActive) return false
  const last = Number(lastMoveMs)
  const now = Number(nowMs)
  const idle = Number(idleMs)
  if (!Number.isFinite(last) || !Number.isFinite(now) || !Number.isFinite(idle) || idle <= 0) {
    return false
  }
  return (now - last) >= idle
}

// ms of cursor-visible time remaining before it auto-hides (for a UI
// that wants to show a fade). 0 once hidden. Clamped to [0, idleMs].
export function cursorVisibleRemaining(lastMoveMs, nowMs, idleMs = CURSOR_IDLE_MS) {
  const last = Number(lastMoveMs)
  const now = Number(nowMs)
  const idle = Number(idleMs)
  if (!Number.isFinite(last) || !Number.isFinite(now) || !Number.isFinite(idle) || idle <= 0) {
    return 0
  }
  const remaining = idle - (now - last)
  if (remaining < 0) return 0
  if (remaining > idle) return idle
  return remaining
}

// The CSS class toggled on document.body to drive the chrome fade. The
// stylesheet hides everything except the canvas (+ the zen hint) when
// this class is present. Single source of truth so the component and
// any future caller agree on the name.
export const ZEN_BODY_CLASS = 'zen-mode'

// Keys that toggle / exit zen mode. `code`-based so it's layout-stable.
// Z toggles; Escape only exits (never enters).
export function classifyZenKey(code) {
  if (code === 'KeyZ') return 'toggle'
  if (code === 'Escape') return 'exit'
  return null
}

// Given the current zen state + a key classification, what's the next
// zen state? Pure reducer so the keyboard handler is trivial + tested.
//   toggle: flip
//   exit:   force off (no-op if already off — returns same bool)
//   else:   unchanged
export function nextZenState(active, keyKind) {
  if (keyKind === 'toggle') return !active
  if (keyKind === 'exit') return false
  return active
}
