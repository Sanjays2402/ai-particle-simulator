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

// --- R42.E: zen "Now Playing" overlay --------------------------------
//
// While in zen mode the chrome is hidden for clean screen-recordings,
// but a viewer of the recording then has no idea WHICH preset is on
// screen. This optionally shows an auto-fading "Now Playing" card in a
// corner with the live preset name (+ a palette swatch on the React
// side) — like a music player's now-playing chip — so a recording is
// self-documenting without bringing the full UI back.
//
// The pure bit is just the label formatting: trim, fall back to a
// sensible default for an empty / non-string name, and ellipsis-truncate
// an over-long name so the card never blows out its width.

// Max characters of the preset name shown on the card before we ellipsis.
export const NOW_PLAYING_MAX_LEN = 42

// Format a preset name for the Now-Playing card. Pure.
//   - non-string / empty / whitespace-only → the fallback ('Untitled')
//   - trims surrounding whitespace
//   - collapses internal runs of whitespace to single spaces (a name
//     pulled from a multi-line source stays one tidy line)
//   - truncates to maxLen with a trailing ellipsis (…) so the card width
//     is bounded; the ellipsis counts toward the budget so the result is
//     never longer than maxLen
export function formatNowPlaying(name, opts = {}) {
  const fallback = typeof opts.fallback === 'string' ? opts.fallback : 'Untitled'
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : NOW_PLAYING_MAX_LEN
  if (typeof name !== 'string') return fallback
  const cleaned = name.trim().replace(/\s+/g, ' ')
  if (!cleaned) return fallback
  if (cleaned.length <= maxLen) return cleaned
  // Reserve one char for the ellipsis; maxLen of 1 just yields the
  // ellipsis (degenerate but bounded).
  if (maxLen <= 1) return '\u2026'
  return cleaned.slice(0, maxLen - 1).trimEnd() + '\u2026'
}

// --- R43.E: zen "Now Playing" theme line -----------------------------
//
// R42.E's card shows the live PRESET name + an accent swatch. A recording
// then documents the motion but not the LOOK — two recordings of the same
// preset under different themes are indistinguishable. This adds the
// active THEME name as a second line on the card (paired with a second
// swatch on the React side), so a recording self-documents both the
// motion and the palette.
//
// Theme ids are lowercase tokens ('vaporwave', 'neon'); this presents
// them as a clean Title-Case label for the card. Pure + DOM-free.

// Max characters of the theme label shown on the card before ellipsis —
// theme ids are short, so a tight bound keeps the second line compact.
export const THEME_LABEL_MAX_LEN = 18

// Format a theme id into a display label for the card. Pure.
//   - non-string / empty / whitespace-only → the fallback ('Default')
//   - trims + collapses internal whitespace
//   - Title-Cases each word ('vaporwave' → 'Vaporwave', 'deep sea' →
//     'Deep Sea') so the label reads as a name, not a code token
//   - ellipsis-truncates to THEME_LABEL_MAX_LEN (ellipsis in the budget)
export function formatThemeName(theme, opts = {}) {
  const fallback = typeof opts.fallback === 'string' ? opts.fallback : 'Default'
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : THEME_LABEL_MAX_LEN
  if (typeof theme !== 'string') return fallback
  const cleaned = theme.trim().replace(/\s+/g, ' ')
  if (!cleaned) return fallback
  const titled = cleaned.replace(/\b\w/g, c => c.toUpperCase())
  if (titled.length <= maxLen) return titled
  if (maxLen <= 1) return '\u2026'
  return titled.slice(0, maxLen - 1).trimEnd() + '\u2026'
}

// --- R44.E: zen "Now Playing" framing line ----------------------------
//
// R42.E/R43.E show the live preset (motion) + theme (look) on the zen
// card. When the user has set a FRAMING guide (2.39, 16:9, a custom crop)
// to compose a recording, the card should document the CROP too — so a
// left-alone recording is fully self-describing: motion + look + frame.
//
// This formats a resolved framing label (the component resolves the id →
// label via framingGuides) for the card. Like formatThemeName it's a pure
// "format a raw string" helper: an "off" / empty frame yields '' so the
// card simply omits the line. Kept DOM-free + framingGuides-free so it
// unit-tests in isolation; the component owns the id → label resolution.

// Max characters of the framing label on the card before ellipsis — frame
// labels are short ("2.39", "16:9", "1.78"), so a tight bound is plenty.
export const FRAMING_LABEL_MAX_LEN = 16

// The label strings that mean "no frame is active" — when the framing
// guide id is 'off' the resolver hands us its label ('Off'); we treat that
// (case-insensitively) as nothing to show so the card omits the line.
const FRAMING_OFF_LABELS = new Set(['off', 'none', ''])

// Format a resolved framing label for the Now-Playing card. Pure.
//   - non-string / empty / whitespace-only → '' (caller omits the line)
//   - an "Off" / "None" label (case-insensitive) → '' (no active frame)
//   - trims + collapses internal whitespace
//   - optional prefix (e.g. 'Frame') prepended with a thin space so the
//     line can read "Frame 2.39" instead of a bare number
//   - ellipsis-truncates the WHOLE result to maxLen (ellipsis in budget)
export function formatFramingLabel(label, opts = {}) {
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : FRAMING_LABEL_MAX_LEN
  if (typeof label !== 'string') return ''
  const cleaned = label.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  if (FRAMING_OFF_LABELS.has(cleaned.toLowerCase())) return ''
  const prefix = typeof opts.prefix === 'string' ? opts.prefix.trim().replace(/\s+/g, ' ') : ''
  let text = prefix ? `${prefix} ${cleaned}` : cleaned
  if (text.length <= maxLen) return text
  if (maxLen <= 1) return '\u2026'
  return text.slice(0, maxLen - 1).trimEnd() + '\u2026'
}

// --- R45.E: zen "Now Playing" composition-grid line ------------------
//
// R44.E surfaces the active framing CROP (2.39, 16:9, a custom ratio) on
// the zen card so a left-alone recording documents the frame. But the
// composition GRID (rule-of-thirds, centre cross, golden spiral) is the
// other half of how a shot is composed — two recordings with the same
// crop but different grids guided the framing differently. This formats a
// resolved grid label for the card so the recording self-documents the
// full composition: motion + look + crop + grid.
//
// Like formatFramingLabel it's a pure "format a raw string" helper: an
// "off" / "none" grid yields '' so the card omits the line. Kept DOM-free
// + framingGuides-free so it unit-tests in isolation; the component owns
// the grid-id → label resolution (via framingGuides.gridLabelForId).

// Max characters of the grid label on the card before ellipsis — grid
// labels are short ("Thirds", "Cross", "Spiral"), so a tight bound fits.
export const GRID_LABEL_MAX_LEN = 18

// Format a resolved composition-grid label for the Now-Playing card. Pure.
//   - non-string / empty / whitespace-only → '' (caller omits the line)
//   - an "Off" / "None" label (case-insensitive) → '' (no active grid)
//   - trims + collapses internal whitespace
//   - optional prefix (e.g. 'Grid') prepended with a space so the line can
//     read "Grid Thirds" instead of a bare word
//   - ellipsis-truncates the WHOLE result to maxLen (ellipsis in budget)
export function formatGridLabel(label, opts = {}) {
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : GRID_LABEL_MAX_LEN
  if (typeof label !== 'string') return ''
  const cleaned = label.trim().replace(/\s+/g, ' ')
  if (!cleaned) return ''
  if (FRAMING_OFF_LABELS.has(cleaned.toLowerCase())) return ''
  const prefix = typeof opts.prefix === 'string' ? opts.prefix.trim().replace(/\s+/g, ' ') : ''
  let text = prefix ? `${prefix} ${cleaned}` : cleaned
  if (text.length <= maxLen) return text
  if (maxLen <= 1) return '\u2026'
  return text.slice(0, maxLen - 1).trimEnd() + '\u2026'
}

// --- R46.E: zen grid line — spiral orientation detail ----------------
//
// R45.E surfaces the active composition GRID name (Thirds / Cross /
// Spiral) on the zen Now-Playing card. The golden SPIRAL has four
// orientations (which corner its eye converges toward) — two recordings
// guided by a spiral in opposite corners composed very differently, but
// the card couldn't tell them apart. This appends the orientation as a
// detail suffix ("Spiral · Top-left") so the card documents the full
// spiral intent. Only the spiral grid has an orientation, so the caller
// passes a detail only when the grid is the spiral; for every other grid
// the detail is omitted and the line stays just the grid name.
//
// Pure "combine two resolved strings" helper, parallel to formatGridLabel:
//   - a blank / non-string base label → '' (caller omits the line)
//   - a blank / non-string detail → just the formatted base label
//   - otherwise "<label> · <detail>", trimmed + whitespace-collapsed, the
//     WHOLE result ellipsis-truncated to maxLen (the separator + detail
//     count toward the budget so the line never blows out the card width)
export function formatGridDetail(label, detail, opts = {}) {
  const base = formatGridLabel(label, opts)
  if (!base) return ''
  if (typeof detail !== 'string') return base
  const cleanedDetail = detail.trim().replace(/\s+/g, ' ')
  if (!cleanedDetail) return base
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : GRID_LABEL_MAX_LEN
  const text = `${base} \u00b7 ${cleanedDetail}`
  if (text.length <= maxLen) return text
  if (maxLen <= 1) return '\u2026'
  return text.slice(0, maxLen - 1).trimEnd() + '\u2026'
}
