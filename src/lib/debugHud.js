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
