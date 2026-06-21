// Custom theme editor — user-defined themes with their own neon
// accent + hue shift + saturation flag, persisted in localStorage.
// Pure helpers extracted so the per-frame canvas hook + zustand can
// share validation + load/save logic without a dependency cycle.
//
// Each custom theme has shape:
//   { id: 'custom-<n>', name: 'My Theme', neon: '#RRGGBB',
//     hueShift: number (-360..360), saturation?: 0 (greyscale flag) }
// — same shape as the built-in THEMES dict, but with an `id` + `name`
// so the UI can render and toggle by stable key.
//
// Built-in theme ids that are NOT custom (so the editor / save / delete
// don't clobber them). Mirrors the keys in store.js THEMES.
export const BUILTIN_THEME_IDS = [
  'neon', 'cyberpunk', 'ocean', 'fire', 'monochrome', 'rainbow',
  'sunset', 'forest', 'arctic', 'retro', 'vaporwave',
]

export const CUSTOM_THEMES_KEY = 'custom-themes-v1'
export const MAX_CUSTOM_THEMES = 12
export const THEME_NAME_MAX = 32

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function isValidHex(s) {
  return typeof s === 'string' && HEX_RE.test(s)
}

export function clampHueShift(v) {
  if (!Number.isFinite(v)) return 0
  if (v < -360) return -360
  if (v > 360) return 360
  return v | 0
}

export function sanitizeName(s) {
  if (typeof s !== 'string') return 'Custom'
  const t = s.trim().slice(0, THEME_NAME_MAX)
  return t.length > 0 ? t : 'Custom'
}

// Normalize one stored entry to the canonical shape. Throws nothing —
// returns null when the input is unsalvageable so loadThemes() can
// silently drop corrupted rows.
export function normalizeTheme(input) {
  if (!input || typeof input !== 'object') return null
  if (typeof input.id !== 'string' || !input.id.startsWith('custom-')) return null
  if (BUILTIN_THEME_IDS.includes(input.id)) return null
  const neon = isValidHex(input.neon) ? input.neon : '#a855f7'
  const out = {
    id: input.id,
    name: sanitizeName(input.name),
    neon,
    hueShift: clampHueShift(input.hueShift),
  }
  if (input.saturation === 0) out.saturation = 0
  return out
}

// Load + parse the persisted list. Returns [] on any failure so the
// UI never has to defensively `?? []`. Drops corrupted rows silently.
export function loadThemes(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return []
  try {
    const raw = store.getItem(CUSTOM_THEMES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out = []
    for (const row of parsed) {
      const n = normalizeTheme(row)
      if (n) out.push(n)
      if (out.length >= MAX_CUSTOM_THEMES) break
    }
    return out
  } catch { return [] }
}

export function saveThemes(themes, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    const cleaned = (Array.isArray(themes) ? themes : [])
      .map(normalizeTheme)
      .filter(Boolean)
      .slice(0, MAX_CUSTOM_THEMES)
    store.setItem(CUSTOM_THEMES_KEY, JSON.stringify(cleaned))
    return true
  } catch { return false }
}

// Mint a fresh id from the existing list. Just numbered — keeps the
// id stable for share URLs and predictable for users (no UUID noise).
export function nextThemeId(existing) {
  const ids = new Set((existing || []).map(t => t && t.id))
  for (let i = 1; i <= MAX_CUSTOM_THEMES + 16; i++) {
    const id = `custom-${i}`
    if (!ids.has(id)) return id
  }
  // Fallback — should be unreachable given the MAX cap.
  return `custom-${Date.now()}`
}

// Add a new theme to the list — returns a new array, doesn't mutate.
// Caps at MAX_CUSTOM_THEMES (oldest drops off the end). Rejects (returns
// the same list) when name/neon are unsalvageable.
export function addTheme(list, partial) {
  const base = Array.isArray(list) ? list : []
  const next = normalizeTheme({
    id: partial && typeof partial.id === 'string' && partial.id.startsWith('custom-')
      ? partial.id
      : nextThemeId(base),
    ...partial,
  })
  if (!next) return base
  // De-dupe by id (overwrite case).
  const filtered = base.filter(t => t.id !== next.id)
  const merged = [next, ...filtered]
  return merged.slice(0, MAX_CUSTOM_THEMES)
}

export function removeTheme(list, id) {
  if (!Array.isArray(list)) return []
  return list.filter(t => t && t.id !== id)
}

// Combine a built-ins dict + a custom themes list into a single
// lookup-by-id dict that ParticleCanvas can read by themeId without
// caring which side the entry came from. Built-ins win on collisions
// so a corrupt custom entry can never override a built-in.
export function resolveTheme(themeId, builtins, customs) {
  if (builtins && Object.prototype.hasOwnProperty.call(builtins, themeId)) {
    return builtins[themeId]
  }
  if (Array.isArray(customs)) {
    for (const t of customs) {
      if (t && t.id === themeId) {
        const out = { neon: t.neon, hueShift: t.hueShift }
        if (t.saturation === 0) out.saturation = 0
        return out
      }
    }
  }
  return null
}
