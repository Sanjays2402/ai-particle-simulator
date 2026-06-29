// R45.O — Debug HUD compact / expanded layout resolver.
//
// The HUD has grown a lot of cinema-grade detail: a 2s sparkline, a budget
// bar, two trend strips, an ETA history strip, copy buttons. Great while
// hunting a stutter; noise while you just want the live fps. This resolves
// which SECTIONS render for a given mode so the component stays declarative
// and the policy lives in one tested place.
//
// COMPACT keeps the bare essentials a glance needs (the headline number, the
// 1%-low / drops outliers, heap, particle count). EXPANDED is the full
// instrument panel. The headline + outliers + heap + particle rows ALWAYS
// render so collapsing never hides the at-a-glance health.

export const HUD_MODES = ['compact', 'expanded']
export const HUD_MODE_DEFAULT = 'expanded'

// Sanitize a stored / passed mode to a known value. Unknown → default. Pure.
export function sanitizeHudMode(mode) {
  return HUD_MODES.includes(mode) ? mode : HUD_MODE_DEFAULT
}

// The next mode in a 2-state cycle (the header pill toggles it). Pure.
export function nextHudMode(mode) {
  return sanitizeHudMode(mode) === 'compact' ? 'expanded' : 'compact'
}

// Resolve section visibility. Returns a flat, stable-keyed bundle the HUD
// reads to gate each block. EXPANDED → everything on; COMPACT → only the
// always-on essentials. Unknown mode falls back to the default. Pure.
//   sparkline   : the 2s fps/ms graph
//   trends      : budget bar + headroom/ETA/edge trend strips + To-edge row
//   copyButtons : the paste-ready copy-line buttons
//   alwaysOn    : headline + outliers + heap + particles (always true)
export function resolveHudSections(mode) {
  const expanded = sanitizeHudMode(mode) === 'expanded'
  return {
    sparkline: expanded,
    trends: expanded,
    copyButtons: expanded,
    alwaysOn: true,
  }
}

// A short label for the mode pill. Pure.
export function hudModeLabel(mode) {
  return sanitizeHudMode(mode) === 'compact' ? 'MIN' : 'FULL'
}

// --- R50.O: per-view (fps vs ms) compact density ----------------------
//
// R45.O gave ONE compact/expanded flag, but the HUD has two readouts (fps
// and ms, toggled with M) a tuner flips between. They want different
// densities: a quick fps glance can stay collapsed while the ms view runs
// full instrument detail. R50.O remembers the mode PER VIEW so the two
// collapse independently. Persisted as a small {fps, ms} map; a legacy
// single-string value upgrades to both-views-same so existing users keep
// their density. Pure + DOM-free.

export const HUD_VIEWS = ['fps', 'ms']

// Normalise a stored value into a complete {fps, ms} density map. A bare
// string ('compact'/'expanded') applies to BOTH (legacy upgrade); an
// object fills missing/unknown keys with the default; junk → both default.
export function sanitizeHudViewModes(raw) {
  if (typeof raw === 'string') {
    const m = sanitizeHudMode(raw)
    return { fps: m, ms: m }
  }
  if (raw && typeof raw === 'object') {
    return { fps: sanitizeHudMode(raw.fps), ms: sanitizeHudMode(raw.ms) }
  }
  return { fps: HUD_MODE_DEFAULT, ms: HUD_MODE_DEFAULT }
}

// The mode for one view. Unknown view → default. Pure.
export function hudModeForView(modes, view) {
  const m = sanitizeHudViewModes(modes)
  return HUD_VIEWS.includes(view) ? m[view] : HUD_MODE_DEFAULT
}

// Toggle ONLY the given view's mode, leaving the other untouched. Unknown
// view → map returned unchanged (ref-equal). Pure.
export function toggleHudViewMode(modes, view) {
  const m = sanitizeHudViewModes(modes)
  if (!HUD_VIEWS.includes(view)) return m
  return { ...m, [view]: nextHudMode(m[view]) }
}

// Sections for a specific view — resolveHudSections scoped to one readout. Pure.
export function resolveHudSectionsForView(modes, view) {
  return resolveHudSections(hudModeForView(modes, view))
}

// R51.O — set BOTH views to the SAME mode in one shot. R50.O lets the two
// readouts collapse independently; R51.O is the symmetric companion for
// users who want them locked together. The target is the OPPOSITE of the
// fps view's current mode so a single keystroke alternates both: if either
// view is expanded, collapse both; otherwise expand both. Returns a fresh
// {fps, ms} map at that mode. Junk → both default. Pure.
export function syncHudViewModes(modes) {
  const m = sanitizeHudViewModes(modes)
  const target = m.fps === 'expanded' ? 'compact' : 'expanded'
  return { fps: target, ms: target }
}

// R52.O — are the two readouts (fps + ms) currently at the SAME density?
// R50.O lets them diverge; R51.O's sync snaps them together — but once
// synced, nothing on screen says "these are locked in step" vs "they
// happen to match" / "they've drifted apart". This predicate drives a
// tiny "linked" glyph on the density pill so the user can see at a glance
// whether the two views are in sync. Junk → both resolve to the default
// (so two corrupt values read as linked, which they effectively are).
// Pure.
export function hudViewsLinked(modes) {
  const m = sanitizeHudViewModes(modes)
  return m.fps === m.ms
}

// --- R53.O: the linked glyph is itself the sync control ----------------
//
// R52.O paints a passive linked/diverged glyph on the density pill, but
// the only way to ACT on a divergence is the Shift+M keystroke (or
// shift-clicking the FULL/MIN button). R53.O makes the glyph itself the
// button: clicking it runs syncHudViewModes, so a mouse-only user can
// re-link the two readouts by clicking the very indicator that told them
// they'd drifted. These pure helpers keep the glyph chars + the action
// tooltip in the lib (single source of truth shared with the component)
// so the clickable glyph and the passive R52.O read can't disagree.

// The two math glyphs the indicator shows. Monochrome, no emoji.
export const HUD_LINK_GLYPH_LINKED = '\u2261'   // ≡  identical / linked
export const HUD_LINK_GLYPH_DIVERGED = '\u2260' // ≠  not equal / diverged

// The glyph char for the current density map — ≡ when linked, ≠ when the
// two readouts have diverged. Pure.
export function hudLinkGlyph(modes) {
  return hudViewsLinked(modes) ? HUD_LINK_GLYPH_LINKED : HUD_LINK_GLYPH_DIVERGED
}

// The action-naming tooltip for the clickable glyph, so it announces what
// a click DOES (not just the current state). Diverged → clicking links
// them; linked → clicking toggles BOTH densities together (syncHudViewModes
// always lands on a linked map, flipping to the opposite density when the
// two already match). Pure; always a non-empty string.
export function hudLinkToggleLabel(modes) {
  return hudViewsLinked(modes)
    ? 'FPS + MS density linked - click to flip both at once'
    : 'FPS + MS density diverged - click to re-link them'
}
