// Slideshow: deterministic next-preset picker. Pure functions so the
// React driver in App.jsx can stay tiny (just a setInterval that calls
// `pickNext` and forwards the result to loadPreset).
//
// Three orders:
//   - 'sequence'   : walk presets in array order, wrap at the end.
//   - 'shuffle'    : random pick, avoid landing on the current preset.
//   - 'favourites' : walk the user's favourites in array order. If the
//                    list is empty, falls back to 'sequence'.
//
// Filter:
//   The optional `categoryFilter` argument scopes sequence + shuffle
//   to only presets whose `categoryOf(id)` matches the filter. The
//   filter is ignored for 'favourites' (favourites are explicit user
//   picks — the slideshow respects that intent regardless of category).
//   When the filter leaves zero matching presets, the slideshow falls
//   back to the full list so the user never gets a stuck rotation.
import { categoryOf } from './presetCategories.js'

export const SLIDESHOW_ORDERS = ['sequence', 'shuffle', 'favourites']
export const DWELL_MIN_SEC = 2
export const DWELL_MAX_SEC = 120

// Helper: scope the preset list to a single category. 'all' or
// undefined returns the full list. Returns the full list when the
// filter produces zero matches (avoids stuck rotations).
export function filterByCategory(presets, categoryFilter) {
  if (!Array.isArray(presets) || presets.length === 0) return []
  if (!categoryFilter || categoryFilter === 'all') return presets
  const scoped = presets.filter(p => categoryOf(p.id) === categoryFilter)
  return scoped.length === 0 ? presets : scoped
}

// Drive the next preset id. Returns null if the playlist is empty
// (caller should skip its load).
//
// Args: { presets, order, currentId, favouriteIds, categoryFilter, random }
//   - presets:        array of { id, ... }
//   - order:          one of SLIDESHOW_ORDERS
//   - currentId:      the currently loaded preset id (may be null)
//   - favouriteIds:   array of preset ids (for the 'favourites' order)
//   - categoryFilter: optional category id ('all' or undefined → no filter).
//                     Applies to 'sequence' and 'shuffle'; favourites bypass.
//   - random:         optional () => float in [0,1) — defaults to Math.random
//                     (injected so tests are deterministic)
export function pickNext({ presets, order, currentId, favouriteIds = [], categoryFilter, random = Math.random }) {
  if (!Array.isArray(presets) || presets.length === 0) return null
  // 1. Favourites mode — walk the favourites array (intersected with
  //    the live preset list so deleted favourites don't poison the loop).
  //    Category filter is intentionally ignored: explicit user picks win.
  if (order === 'favourites' && favouriteIds.length > 0) {
    const validFavs = favouriteIds.filter(id => presets.some(p => p.id === id))
    if (validFavs.length > 0) {
      if (validFavs.length === 1) return validFavs[0]
      const idx = validFavs.indexOf(currentId)
      const next = (idx + 1) % validFavs.length
      return validFavs[next]
    }
    // fall through to sequence when favourites list is empty
  }
  // Scope sequence + shuffle to the active category filter (if any).
  const scoped = filterByCategory(presets, categoryFilter)
  // 2. Shuffle — random pick that avoids the current preset.
  if (order === 'shuffle') {
    if (scoped.length === 1) return scoped[0].id
    let pick = scoped[Math.floor(random() * scoped.length)].id
    // 4 retries is plenty — at N=2 the worst-case collision rate is
    // 1/16 which is well below the once-per-dwell user-perceptible bar.
    for (let i = 0; i < 4 && pick === currentId; i++) {
      pick = scoped[Math.floor(random() * scoped.length)].id
    }
    return pick
  }
  // 3. Sequence — wrap at the end. Unknown currentId starts at 0.
  const idx = scoped.findIndex(p => p.id === currentId)
  const next = (idx + 1) % scoped.length
  return scoped[next].id
}

// Clamp helper for the dwell setter (also used in the test).
export function clampDwell(seconds) {
  if (!Number.isFinite(seconds)) return DWELL_MIN_SEC
  return Math.max(DWELL_MIN_SEC, Math.min(DWELL_MAX_SEC, seconds))
}
