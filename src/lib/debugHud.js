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
