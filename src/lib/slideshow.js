// Slideshow: deterministic next-preset picker. Pure functions so the
// React driver in App.jsx can stay tiny (just a setInterval that calls
// `pickNext` and forwards the result to loadPreset).
//
// Three orders:
//   - 'sequence'   : walk presets in array order, wrap at the end.
//   - 'shuffle'    : random pick, avoid landing on the current preset.
//   - 'favourites' : walk the user's favourites in array order. If the
//                    list is empty, falls back to 'sequence'.

export const SLIDESHOW_ORDERS = ['sequence', 'shuffle', 'favourites']
export const DWELL_MIN_SEC = 2
export const DWELL_MAX_SEC = 120

// Drive the next preset id. Returns null if the playlist is empty
// (caller should skip its load).
//
// Args: { presets, order, currentId, favouriteIds, random }
//   - presets:     array of { id, ... }
//   - order:       one of SLIDESHOW_ORDERS
//   - currentId:   the currently loaded preset id (may be null)
//   - favouriteIds: array of preset ids (for the 'favourites' order)
//   - random:      optional () => float in [0,1) — defaults to Math.random
//                  (injected so tests are deterministic)
export function pickNext({ presets, order, currentId, favouriteIds = [], random = Math.random }) {
  if (!Array.isArray(presets) || presets.length === 0) return null
  // 1. Favourites mode — walk the favourites array (intersected with
  //    the live preset list so deleted favourites don't poison the loop).
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
  // 2. Shuffle — random pick that avoids the current preset.
  if (order === 'shuffle') {
    if (presets.length === 1) return presets[0].id
    let pick = presets[Math.floor(random() * presets.length)].id
    // 4 retries is plenty — at N=2 the worst-case collision rate is
    // 1/16 which is well below the once-per-dwell user-perceptible bar.
    for (let i = 0; i < 4 && pick === currentId; i++) {
      pick = presets[Math.floor(random() * presets.length)].id
    }
    return pick
  }
  // 3. Sequence — wrap at the end. Unknown currentId starts at 0.
  const idx = presets.findIndex(p => p.id === currentId)
  const next = (idx + 1) % presets.length
  return presets[next].id
}

// Clamp helper for the dwell setter (also used in the test).
export function clampDwell(seconds) {
  if (!Number.isFinite(seconds)) return DWELL_MIN_SEC
  return Math.max(DWELL_MIN_SEC, Math.min(DWELL_MAX_SEC, seconds))
}
