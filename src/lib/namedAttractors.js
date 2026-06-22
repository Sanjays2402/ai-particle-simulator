// Named force fields — first-class attractor / repulsor / vortex /
// turbulence objects that coexist alongside the legacy single
// `forceFieldType` and `forceFieldCenter`. Pure helpers live here so
// the per-frame canvas loop can call them without React imports and
// the store can hand-roll a single subscribe.
//
// Each named attractor:
//   {
//     id: 'attr-<n>',     // stable, minted by nextAttractorId
//     name: 'Eye',        // user-editable, sanitized
//     type: 'attractor' | 'repulsor' | 'vortex' | 'turbulence',
//     strength: 0..3,     // local multiplier, applied with the same
//                         // shape as the legacy field
//     position: [x, y, z],// world-space center
//     radius: 4..16,      // local influence radius (the legacy field
//                         // is hard-coded to 10; per-attractor radius
//                         // lets users sculpt overlap & layering)
//     enabled: boolean,   // mute without losing the entry
//   }
//
// The list is persisted to localStorage so a power-user can build a
// preset of attractors, leave the app, and resume mid-thought.

export const STORAGE_KEY = 'named-attractors-v1'

export const ATTRACTOR_TYPES = ['attractor', 'repulsor', 'vortex', 'turbulence']

// R14.05 — type-specific color cues so a glance tells the user which
// kind of force field they're looking at without having to read the
// "Attract / Repulse / Vortex / Turb." chips. Each entry exposes the
// same fields a UI button needs (accent rgb, soft border / bg, text
// fg, glow shadow) so callers don't have to assemble color strings
// inline. The accent is the SHIPPED palette in this order:
//   attractor  → indigo  (pull, matches the existing #6366f1 lane)
//   repulsor   → red     (push away — the "danger" lane)
//   vortex     → violet  (swirl — the "twist" lane)
//   turbulence → amber   (chaos — the "noise" lane)
// These deliberately match colours already used elsewhere in the app
// (indigo = primary, red = destructive, violet = MIDI presets, amber
// = warnings) so the UI palette stays small and learnable.
export const ATTRACTOR_TYPE_STYLES = {
  attractor: {
    accent:    '#6366f1',
    accentRgb: '99,102,241',
    label:     'indigo',
  },
  repulsor: {
    accent:    '#ef4444',
    accentRgb: '239,68,68',
    label:     'red',
  },
  vortex: {
    accent:    '#a855f7',
    accentRgb: '168,85,247',
    label:     'violet',
  },
  turbulence: {
    accent:    '#f59e0b',
    accentRgb: '245,158,11',
    label:     'amber',
  },
}

// Fallback used when a stale localStorage entry has a type that
// isn't in ATTRACTOR_TYPES anymore (shouldn't happen post-sanitize,
// but the UI calls this freely so we keep it safe). Matches the
// previous app-wide muted indigo so an unknown attractor looks
// neutral rather than jarring.
const FALLBACK_STYLE = ATTRACTOR_TYPE_STYLES.attractor

// Build a small style bundle for one attractor type. Returns the raw
// accent + a set of pre-built CSS-ready strings (border, background,
// text colour, glow) at conservative opacities — same opacity levels
// the existing UI uses so the new colour cues drop into the existing
// design language without raising the visual weight of any one row.
export function attractorTypeStyle(type) {
  const base = ATTRACTOR_TYPE_STYLES[type] || FALLBACK_STYLE
  const rgb = base.accentRgb
  return {
    accent:      base.accent,
    accentRgb:   rgb,
    label:       base.label,
    // Borders + backgrounds at common opacity stops.
    border:      `rgba(${rgb},0.45)`,
    borderSoft:  `rgba(${rgb},0.30)`,
    borderFaint: `rgba(${rgb},0.18)`,
    bg:          `rgba(${rgb},0.14)`,
    bgSoft:      `rgba(${rgb},0.06)`,
    bgFaint:     `rgba(${rgb},0.03)`,
    // Text colours — use the accent itself for the "on" state and a
    // muted variant for headings on subtle backgrounds.
    fg:          base.accent,
    fgMuted:     `rgba(${rgb},0.75)`,
    // Box-shadow / glow for the "active" row.
    glow:        `0 0 12px rgba(${rgb},0.25)`,
  }
}

export const MAX_ATTRACTORS = 12
export const NAME_MAX = 24
export const STRENGTH_MIN = 0
export const STRENGTH_MAX = 3
export const RADIUS_MIN = 4
export const RADIUS_MAX = 16
export const POSITION_MIN = -50
export const POSITION_MAX = 50

const HEX_NAME_FALLBACK = 'Attractor'

export function isValidType(t) {
  return typeof t === 'string' && ATTRACTOR_TYPES.includes(t)
}

export function clampStrength(v) {
  if (!Number.isFinite(v)) return 1
  if (v < STRENGTH_MIN) return STRENGTH_MIN
  if (v > STRENGTH_MAX) return STRENGTH_MAX
  return v
}

export function clampRadius(v) {
  if (!Number.isFinite(v)) return 10
  if (v < RADIUS_MIN) return RADIUS_MIN
  if (v > RADIUS_MAX) return RADIUS_MAX
  return v
}

export function clampPositionScalar(v) {
  if (!Number.isFinite(v)) return 0
  if (v < POSITION_MIN) return POSITION_MIN
  if (v > POSITION_MAX) return POSITION_MAX
  return v
}

export function sanitizePosition(p) {
  if (!Array.isArray(p) || p.length !== 3) return [0, 0, 0]
  return [clampPositionScalar(p[0]), clampPositionScalar(p[1]), clampPositionScalar(p[2])]
}

export function sanitizeName(s) {
  if (typeof s !== 'string') return HEX_NAME_FALLBACK
  const t = s.trim().slice(0, NAME_MAX)
  return t.length > 0 ? t : HEX_NAME_FALLBACK
}

// Normalize one stored entry to the canonical shape. Returns null
// when the input is unsalvageable so loadAttractors() can drop
// corrupted rows.
export function normalizeAttractor(input) {
  if (!input || typeof input !== 'object') return null
  if (typeof input.id !== 'string' || !input.id.startsWith('attr-')) return null
  if (!isValidType(input.type)) return null
  return {
    id: input.id,
    name: sanitizeName(input.name),
    type: input.type,
    strength: clampStrength(input.strength),
    position: sanitizePosition(input.position),
    radius: clampRadius(input.radius),
    enabled: input.enabled !== false,  // default true unless explicitly false
  }
}

// Mint a fresh id from an existing list. Numbered for stable URLs.
export function nextAttractorId(existing) {
  const ids = new Set((existing || []).map(a => a && a.id))
  for (let i = 1; i <= MAX_ATTRACTORS + 64; i++) {
    const id = `attr-${i}`
    if (!ids.has(id)) return id
  }
  return `attr-${Date.now()}`
}

// Default factory — give a sensible new entry the UI can drop in.
// Caller decides position (e.g. canvas click intersection).
export function defaultAttractor(existing, partial = {}) {
  const id = (partial && typeof partial.id === 'string' && partial.id.startsWith('attr-'))
    ? partial.id
    : nextAttractorId(existing)
  const base = {
    id,
    name: partial.name || `Field ${(existing && existing.length ? existing.length + 1 : 1)}`,
    type: isValidType(partial.type) ? partial.type : 'attractor',
    strength: partial.strength !== undefined ? clampStrength(partial.strength) : 1,
    position: sanitizePosition(partial.position),
    radius: partial.radius !== undefined ? clampRadius(partial.radius) : 10,
    enabled: partial.enabled !== false,
  }
  return normalizeAttractor(base)
}

// Load + parse the persisted list. Returns [] on any failure so the
// UI never has to defensively `?? []`. Drops corrupted rows silently.
export function loadAttractors(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return []
  try {
    const raw = store.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out = []
    for (const row of parsed) {
      const n = normalizeAttractor(row)
      if (n) out.push(n)
      if (out.length >= MAX_ATTRACTORS) break
    }
    return out
  } catch { return [] }
}

export function saveAttractors(list, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    const cleaned = (Array.isArray(list) ? list : [])
      .map(normalizeAttractor)
      .filter(Boolean)
      .slice(0, MAX_ATTRACTORS)
    store.setItem(STORAGE_KEY, JSON.stringify(cleaned))
    return true
  } catch { return false }
}

// Add a new attractor — returns a new array. Caps at MAX_ATTRACTORS
// (oldest drops off the end). Refuses to add an invalid entry.
export function addAttractor(list, partial) {
  const base = Array.isArray(list) ? list : []
  const next = defaultAttractor(base, partial || {})
  if (!next) return base
  const filtered = base.filter(a => a.id !== next.id)
  return [...filtered, next].slice(-MAX_ATTRACTORS)
}

export function removeAttractor(list, id) {
  if (!Array.isArray(list)) return []
  return list.filter(a => a && a.id !== id)
}

// R17.17 — bulk-delete by id set. Used by the LeftSidebar's shift-click
// multi-select bulk delete UX so users can wipe several attractors in
// one operation instead of clicking × N times. Pure: returns the input
// ref unchanged when nothing in `idSet` actually existed in the list
// (zustand can skip the redundant save). `idSet` may be a Set, an
// array, or any iterable; non-iterables and null/undefined return the
// input ref. Drops corrupt rows as a side-effect (same contract as
// removeView / removeAttractor — keeping known-bad rows around just to
// honour the ref-equal contract would be the wrong trade-off).
export function removeAttractors(list, idSet) {
  if (!Array.isArray(list)) return []
  if (!idSet) return list
  // Normalise iterable input to a Set for O(1) hits.
  let ids
  if (idSet instanceof Set) {
    ids = idSet
  } else if (typeof idSet[Symbol.iterator] === 'function') {
    ids = new Set(idSet)
  } else {
    return list
  }
  if (ids.size === 0) return list
  let changed = false
  const next = []
  for (const a of list) {
    if (!a) { changed = true; continue }  // drop corrupt rows
    if (ids.has(a.id)) { changed = true; continue }
    next.push(a)
  }
  return changed ? next : list
}

// Patch a single field on an attractor by id — returns a new array
// with the entry updated AND re-normalized so the patch is safe.
export function updateAttractor(list, id, patch) {
  if (!Array.isArray(list) || !id || !patch) return list
  let changed = false
  const next = list.map(a => {
    if (!a || a.id !== id) return a
    const merged = normalizeAttractor({ ...a, ...patch, id: a.id })
    if (!merged) return a
    changed = true
    return merged
  })
  return changed ? next : list
}

// Toggle the enabled flag for a single attractor.
export function toggleAttractor(list, id) {
  return updateAttractor(list, id, { enabled: !(list || []).find(a => a && a.id === id)?.enabled })
}

// Move an attractor to a new world-space position. Validates first
// so calling code can pass raw raycast intersections.
export function moveAttractor(list, id, position) {
  return updateAttractor(list, id, { position: sanitizePosition(position) })
}

// R15.20 — reorder helpers. The MidiPanel groups per-attractor MIDI
// rows in array order (parallel to the LeftSidebar list), so changing
// the array order also reorders the MIDI grouping. Returns a fresh
// array — never mutates the input — so React state updates stay clean.
// Out-of-range or no-op moves return the input REFERENCE unchanged so
// callers can compare by reference to skip a redundant save.
//
// Mirrors the cameraViews.moveView / moveViewUp / moveViewDown API
// shape, but indexed by id (not position) because the caller has the
// id from the row already and dragging a row's "up" button is the
// intuitive UX (vs "swap items 3 and 4").
export function moveAttractorByIndex(list, fromIdx, toIdx) {
  if (!Array.isArray(list)) return list
  const n = list.length
  if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return list
  if (fromIdx < 0 || fromIdx >= n) return list
  if (toIdx < 0   || toIdx >= n) return list
  if (fromIdx === toIdx) return list
  const next = list.slice()
  const [picked] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, picked)
  return next
}

// Find an attractor's index by id, then move it up one slot. Returns
// the input list ref on no-op (id missing OR already at the top).
export function moveAttractorUp(list, id) {
  if (!Array.isArray(list)) return list
  const idx = list.findIndex(a => a && a.id === id)
  if (idx <= 0) return list  // -1 (missing) OR 0 (already top)
  return moveAttractorByIndex(list, idx, idx - 1)
}

export function moveAttractorDown(list, id) {
  if (!Array.isArray(list)) return list
  const idx = list.findIndex(a => a && a.id === id)
  if (idx < 0 || idx >= list.length - 1) return list  // missing OR at bottom
  return moveAttractorByIndex(list, idx, idx + 1)
}

// R16.18 — bulk reorder: jump an attractor to an arbitrary 1-based
// position in one call instead of clicking up/down N times.
// Wraps moveAttractorByIndex with the 1-based UX conversion + a
// generous clamp so the row's inline number input can pass user
// keystrokes through directly.
//
// Defensive contract (matches the rest of the reorder family):
//   - missing id → input list ref unchanged
//   - non-finite / non-integer position → input list ref unchanged
//     (use moveAttractorTo1BasedPosition for the explicit version)
//   - out-of-range positions are CLAMPED to [1, list.length] so a
//     user typing 99 in a 5-attractor list jumps the row to the end,
//     not throws. This matches the typical "jump to end" intent.
//   - no-op (already at the target index) → input list ref unchanged
//     for cheap reference-equality skip in zustand
export function moveAttractorTo1BasedPosition(list, id, position1Based) {
  if (!Array.isArray(list)) return list
  const idx = list.findIndex(a => a && a.id === id)
  if (idx < 0) return list
  if (!Number.isFinite(position1Based)) return list
  // Round + clamp to [1, length] so any UI sanitisation gap doesn't
  // crash the splice. Math.round handles both string→number coercion
  // (if a caller forgot Number()) and floats from drag sliders.
  const rounded = Math.round(position1Based)
  const n = list.length
  const clamped1 = Math.max(1, Math.min(n, rounded))
  const targetIdx = clamped1 - 1
  if (targetIdx === idx) return list
  return moveAttractorByIndex(list, idx, targetIdx)
}

// R16.18 — pure helper for the inline numeric input's parse step.
// Returns the parsed 1-based integer position OR null if the input
// is unusable (empty, NaN, ≤ 0). Keeps the UI's parse logic in one
// place so the test file can pin the behaviour without React.
export function parsePositionInput(raw) {
  if (raw == null) return null
  const trimmed = String(raw).trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  if (rounded <= 0) return null
  return rounded
}
