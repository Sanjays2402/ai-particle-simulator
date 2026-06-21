// activeThemeBoot: apply the persisted "active theme" to the DOM on
// app boot. Both built-in and custom themes go through the same
// resolveTheme path so custom themes survive a reload identically
// to built-ins.
//
// Three cases:
//   1. Persisted theme exists in built-ins → apply the built-in.
//   2. Persisted theme is a 'custom-*' id that still exists in
//      customThemes → apply the custom theme.
//   3. Persisted theme is gone (deleted custom theme, removed
//      built-in, garbage value) → fall back to the configured
//      default and clear the stale persistence.
//
// The helpers are pure (no DOM) so they can be unit-tested; the
// React boot effect calls them with `document.documentElement`.

import { resolveTheme } from './customThemes.js'

export const DEFAULT_THEME_ID = 'neon'
export const NEON_CSS_VAR = '--neon'

// Resolve a theme id against the live built-ins + customs. Returns
// { id, accent, hueShift, saturation } or null when the id can't be
// found. The caller decides whether to fall back to the default.
export function resolveActiveTheme(themeId, builtins, customs) {
  if (typeof themeId !== 'string' || themeId.length === 0) return null
  const found = resolveTheme(themeId, builtins, customs)
  if (!found) return null
  return {
    id: themeId,
    accent: found.neon,
    hueShift: typeof found.hueShift === 'number' ? found.hueShift : 0,
    saturation: found.saturation === 0 ? 0 : 1,
  }
}

// Pick the theme id we should actually apply on boot. Honors the
// persisted id first; falls through to fallback if it's missing or
// no longer valid. Returns { id, accent, hueShift, saturation, fellBack }
// so callers can record analytics / clean stale storage.
export function pickBootTheme(persistedId, builtins, customs, fallbackId = DEFAULT_THEME_ID) {
  const resolved = resolveActiveTheme(persistedId, builtins, customs)
  if (resolved) return { ...resolved, fellBack: false }
  const fallback = resolveActiveTheme(fallbackId, builtins, customs)
  if (fallback) return { ...fallback, fellBack: true }
  // Last-ditch: synthesize a safe theme so the app doesn't crash.
  return { id: DEFAULT_THEME_ID, accent: '#a855f7', hueShift: 0, saturation: 1, fellBack: true }
}

// Apply a resolved theme to a DOM element (typically
// document.documentElement). Pure: returns true on success, false
// when the input shape is wrong so callers can decide to retry.
export function applyThemeToElement(theme, element) {
  if (!theme || typeof theme.accent !== 'string') return false
  if (!element || !element.style || typeof element.style.setProperty !== 'function') return false
  element.style.setProperty(NEON_CSS_VAR, theme.accent)
  return true
}
