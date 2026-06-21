// customThemesIO: package the user's custom theme list as a portable
// JSON envelope and parse one back. Parallel structure to
// `bookmarksIO.js` so the UI patterns can stay symmetric on the
// LeftSidebar (Custom Themes block already lives next to the editor).
//
// Envelope shape (v1):
//   {
//     kind:    'ai-particle-simulator/custom-themes',
//     v:       1,
//     exportedAt: ISO-8601,
//     items:   [{ name, neon, hueShift, saturation? }, ...]
//   }
//
// IDs are intentionally NOT serialised — they're re-minted on import
// by nextThemeId() so the existing append helper's id contract holds.

import {
  addTheme, normalizeTheme, MAX_CUSTOM_THEMES,
} from './customThemes.js'

export const EXPORT_KIND = 'ai-particle-simulator/custom-themes'
export const EXPORT_VERSION = 1

// 64 KB is plenty — 12 themes are ~2 KB at most. Hard cap stops a
// malicious file from blowing up the browser.
export const MAX_IMPORT_BYTES = 64 * 1024

// Build the export envelope. Caller can pass any in-memory shape;
// we keep only the user-facing fields (name + neon + hueShift +
// optional saturation flag) so future store-only metadata doesn't
// accidentally ship.
export function buildExportPayload(items, nowIso = new Date().toISOString()) {
  const safeItems = Array.isArray(items) ? items : []
  return {
    kind: EXPORT_KIND,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    items: safeItems
      .map(normalizeTheme)
      .filter(Boolean)
      .map(t => {
        const out = { name: t.name, neon: t.neon, hueShift: t.hueShift }
        if (t.saturation === 0) out.saturation = 0
        return out
      }),
  }
}

export function serializeThemes(items) {
  return JSON.stringify(buildExportPayload(items), null, 2)
}

// Build a "particle-themes-2026-06-20.json"-style filename.
export function makeFilename(nowIso = new Date().toISOString()) {
  return `particle-themes-${nowIso.slice(0, 10)}.json`
}

// Parse a raw JSON string into a list of importable themes.
// Returns { ok: true, items, source } or { ok: false, error }.
// Caller decides how to merge the result; this never mutates anything.
export function parseImport(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Import data was not a string' }
  }
  if (raw.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: `File too large (max ${(MAX_IMPORT_BYTES / 1024) | 0} KB)` }
  }
  let parsed
  try { parsed = JSON.parse(raw) }
  catch (e) { return { ok: false, error: `Invalid JSON: ${e.message || 'parse failed'}` } }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Top-level value must be an object' }
  }
  // Tolerate both the envelope shape AND a bare array — older /
  // hand-rolled exports still import without ceremony.
  let envelope = parsed
  if (Array.isArray(parsed)) {
    envelope = { kind: EXPORT_KIND, v: EXPORT_VERSION, items: parsed }
  }
  if (envelope.kind && envelope.kind !== EXPORT_KIND) {
    return { ok: false, error: `Wrong file kind: ${envelope.kind}` }
  }
  if (envelope.v && envelope.v > EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${envelope.v}` }
  }
  if (!Array.isArray(envelope.items)) {
    return { ok: false, error: '`items` array missing from envelope' }
  }
  // We can't normalizeTheme() yet because that needs a `custom-*` id.
  // Whitelist + coerce here, then mint ids during the merge step.
  const items = []
  for (const row of envelope.items) {
    if (!row || typeof row !== 'object') continue
    const name = typeof row.name === 'string' && row.name.trim()
      ? row.name.trim().slice(0, 32)
      : null
    if (!name) continue
    const item = { name }
    if (typeof row.neon === 'string') item.neon = row.neon
    if (Number.isFinite(row.hueShift)) item.hueShift = row.hueShift | 0
    if (row.saturation === 0) item.saturation = 0
    items.push(item)
  }
  if (items.length === 0) {
    return { ok: false, error: 'No valid themes found in file' }
  }
  return { ok: true, items, source: envelope }
}

// Merge imported themes into a live theme list. Default mode 'merge'
// keeps existing themes and only adds names that don't collide with
// an existing entry; mode 'replace' drops the existing list and
// uses only the imported themes (still subject to MAX_CUSTOM_THEMES).
// Returns { items, added, replaced, skipped } so the UI can show a
// concrete summary.
export function mergeImport(existing, imported, mode = 'merge') {
  if (!Array.isArray(imported)) {
    return { items: existing || [], added: 0, replaced: 0, skipped: 0 }
  }
  if (mode === 'replace') {
    let items = []
    let added = 0
    for (const it of imported) {
      const before = items.length
      items = addTheme(items, it)
      if (items.length > before) added++
    }
    return { items, added, replaced: 0, skipped: imported.length - added }
  }
  // Merge: skip names already present, append the rest. addTheme
  // also caps at MAX_CUSTOM_THEMES so the result is always safe.
  let items = Array.isArray(existing) ? existing.slice() : []
  let added = 0, skipped = 0
  const seen = new Set(items.map(t => t.name))
  for (const it of imported) {
    if (seen.has(it.name)) { skipped++; continue }
    if (items.length >= MAX_CUSTOM_THEMES) { skipped++; continue }
    items = addTheme(items, it)
    seen.add(it.name)
    added++
  }
  return { items, added, replaced: 0, skipped }
}

// Trigger a browser download of the JSON envelope. Returns the
// filename used, or null when something went wrong (no document).
export function downloadThemesFile(items, nowIso = new Date().toISOString()) {
  try {
    const json = serializeThemes(items)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const filename = makeFilename(nowIso)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return filename
  } catch { return null }
}
