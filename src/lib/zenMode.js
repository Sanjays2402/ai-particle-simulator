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

// --- R35.E: zen auto-orbit (ambient display) -------------------------
//
// When the screen is left alone in zen mode, optionally start a slow
// auto-orbit so a forgotten tab becomes an ambient particle display —
// like a screensaver. It only kicks in after a stillness window (a bit
// longer than the cursor-hide one) so it never fights a user who's
// actively framing a shot, and the speed RAMPS in gently rather than
// lurching into motion. Any interaction (mouse / key) resets it.

// The ambient orbit's top speed (OrbitControls autoRotateSpeed units) —
// deliberately slow + calm.
export const ZEN_AUTO_ORBIT_SPEED = 0.35
// Stillness required before the ambient orbit begins (ms). Longer than
// CURSOR_IDLE_MS so the cursor fades first, then the drift starts.
export const ZEN_ORBIT_IDLE_MS = 3600
// How long the speed eases from 0 → full once orbiting begins (ms).
export const ZEN_ORBIT_RAMP_MS = 2200

function znClamp01(v) {
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function znNumOr(v, fallback) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// Should the ambient zen orbit be running right now? Pure.
//   - not in zen, or the preference is off → never
//   - interacted more recently than the idle window → no (user is active)
//   - still past the idle window → yes
// Defensive: non-finite timestamps → false (never drift on bad data).
export function shouldZenAutoOrbit(zenActive, orbitEnabled, lastInteractMs, nowMs, idleMs = ZEN_ORBIT_IDLE_MS) {
  if (!zenActive || !orbitEnabled) return false
  const last = Number(lastInteractMs)
  const now = Number(nowMs)
  const idle = Number(idleMs)
  if (!Number.isFinite(last) || !Number.isFinite(now) || !Number.isFinite(idle) || idle < 0) return false
  return (now - last) >= idle
}

// The live ambient orbit speed: 0 when not orbiting, else a value ramped
// from 0 up to `maxSpeed` over `rampMs` once the idle threshold passes,
// so the drift eases in. Pure.
//   opts: { idleMs, rampMs, maxSpeed }
export function zenOrbitSpeed(zenActive, orbitEnabled, lastInteractMs, nowMs, opts = {}) {
  const idleMs = znNumOr(opts.idleMs, ZEN_ORBIT_IDLE_MS)
  const rampMs = znNumOr(opts.rampMs, ZEN_ORBIT_RAMP_MS)
  const maxSpeed = znNumOr(opts.maxSpeed, ZEN_AUTO_ORBIT_SPEED)
  if (!shouldZenAutoOrbit(zenActive, orbitEnabled, lastInteractMs, nowMs, idleMs)) return 0
  const sinceOrbitStart = (Number(nowMs) - Number(lastInteractMs)) - idleMs
  if (rampMs <= 0) return maxSpeed
  return znClamp01(sinceOrbitStart / rampMs) * maxSpeed
}
