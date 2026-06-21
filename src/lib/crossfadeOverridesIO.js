// crossfadeOverridesIO: package the user's crossfade-duration chip
// overrides as a portable JSON envelope and parse one back. Directly
// parallels windOverridesIO (R12.17) — same envelope shape, same
// v1/v-too-new gating, same merge-vs-replace modes, same MAX
// import-size guard.
//
// Why ship this? Show-runners build careful crossfade timings
// ("Cinematic = 3.5s for this set, Drift = 12s") on their main rig
// and want to bring those settings to a laptop, demo machine, or
// share them with a collaborator. Without an IO module the only
// path is hand-editing localStorage — not a great UX.
//
// Envelope shape (v1):
//   {
//     kind:    'ai-particle-simulator/crossfade-overrides',
//     v:       1,
//     exportedAt: ISO-8601,
//     items:   { snap: 0.25, fast: 1.8, cinematic: 3.5, drift: 12 }
//   }
//
// `items` is an OBJECT keyed by chip id (snap / fast / cinematic /
// drift) with seconds as the value — matches the persisted shape so
// the round-trip stays unambiguous. Unknown ids are dropped on
// import; values are re-clamped through sanitizeCrossfadeOverrides
// so a hand-edited out-of-range "drift: 9999" can't tear up the
// renderer's blend timeline.

import {
  sanitizeCrossfadeOverrides,
  DURATION_CHIPS_DEFAULT,
} from './crossfade.js'

export const EXPORT_KIND = 'ai-particle-simulator/crossfade-overrides'
export const EXPORT_VERSION = 1

// 32 KB — generous for 4 small float values. Hard cap stops a
// malicious file from blowing up the browser. Mirrors wind IO.
export const MAX_IMPORT_BYTES = 32 * 1024

// Build the export envelope. Caller passes the live overrides dict;
// we re-sanitize so a corrupted in-memory map can't ship something
// invalid. Unknown ids drop silently.
export function buildExportPayload(overrides, nowIso = new Date().toISOString()) {
  return {
    kind: EXPORT_KIND,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    items: sanitizeCrossfadeOverrides(overrides),
  }
}

export function serializeCrossfadeOverrides(overrides) {
  return JSON.stringify(buildExportPayload(overrides), null, 2)
}

// "particle-crossfade-2026-06-21.json"-style filename.
export function makeFilename(nowIso = new Date().toISOString()) {
  return `particle-crossfade-${nowIso.slice(0, 10)}.json`
}

// Parse a raw JSON string into the override map. Returns
// { ok: true, items, source } or { ok: false, error }. Never mutates
// anything. Caller decides what to do with `items` (merge / replace).
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
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'Top-level value must be an object' }
  }
  // Tolerate a bare items map (hand-rolled exports) AND the full
  // envelope shape. Detect by presence of the `kind` field.
  let envelope = parsed
  if (!parsed.kind && !parsed.items) {
    // Treat the whole thing as an items map.
    envelope = { kind: EXPORT_KIND, v: EXPORT_VERSION, items: parsed }
  }
  if (envelope.kind && envelope.kind !== EXPORT_KIND) {
    return { ok: false, error: `Wrong file kind: ${envelope.kind}` }
  }
  if (envelope.v && envelope.v > EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${envelope.v}` }
  }
  if (!envelope.items || typeof envelope.items !== 'object') {
    return { ok: false, error: '`items` map missing from envelope' }
  }
  const items = sanitizeCrossfadeOverrides(envelope.items)
  if (Object.keys(items).length === 0) {
    return { ok: false, error: 'No valid overrides found in file' }
  }
  return { ok: true, items, source: envelope }
}

// Merge imported overrides into a live overrides dict. Default
// mode 'merge' keeps existing overrides and only adds slots the
// import touches that aren't already overridden; 'replace' wipes
// the existing dict and uses only the imported overrides.
// Returns { items, added, replaced, skipped } so the UI can show
// a concrete summary.
export function mergeImport(existing, imported, mode = 'merge') {
  const safeImport = sanitizeCrossfadeOverrides(imported || {})
  const importedIds = Object.keys(safeImport)
  if (mode === 'replace') {
    return { items: safeImport, added: importedIds.length, replaced: 0, skipped: 0 }
  }
  const safeExisting = sanitizeCrossfadeOverrides(existing || {})
  const out = { ...safeExisting }
  let added = 0, skipped = 0
  for (const id of importedIds) {
    if (Object.prototype.hasOwnProperty.call(out, id)) { skipped++; continue }
    out[id] = safeImport[id]
    added++
  }
  return { items: out, added, replaced: 0, skipped }
}

// Dry-run summary for a preview UI — mirrors windOverridesIO's
// `summarizeImportImpact` so the preview pattern stays symmetric.
// Returns:
//   {
//     mode,             // echo of requested mode
//     totalImport,      // count of valid imported ids after sanitize
//     willAdd,          // count of brand-new slot overrides
//     willSkip,         // count skipped (existing in merge, n/a in replace)
//     willOverwrite,    // count whose id already exists (replace mode only)
//     conflicts: [string, ...],   // ids the import would overwrite
//     resultIds: [string, ...],   // final ids after the merge
//   }
export function summarizeImportImpact(existing, imported, mode = 'merge') {
  const safeImport = sanitizeCrossfadeOverrides(imported || {})
  const safeExisting = sanitizeCrossfadeOverrides(existing || {})
  const importedIds = Object.keys(safeImport)
  const existingIds = new Set(Object.keys(safeExisting))
  const conflicts = importedIds.filter(id => existingIds.has(id))
  if (mode === 'replace') {
    return {
      mode: 'replace',
      totalImport: importedIds.length,
      willAdd: importedIds.length,
      willSkip: 0,
      willOverwrite: existingIds.size,
      conflicts,
      resultIds: importedIds.slice(),
    }
  }
  let willAdd = 0, willSkip = 0
  const resultIds = new Set(existingIds)
  for (const id of importedIds) {
    if (existingIds.has(id)) { willSkip++; continue }
    willAdd++
    resultIds.add(id)
  }
  return {
    mode: 'merge',
    totalImport: importedIds.length,
    willAdd,
    willSkip,
    willOverwrite: 0,
    conflicts,
    resultIds: Array.from(resultIds),
  }
}

// Trigger a browser download of the JSON envelope. Returns the
// filename used, or null when something went wrong (e.g. no document
// available during SSR).
export function downloadCrossfadeOverridesFile(overrides, nowIso = new Date().toISOString()) {
  try {
    const json = serializeCrossfadeOverrides(overrides)
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

// Convenience for the UI: list the valid chip ids the envelope can
// carry. Kept in sync with DURATION_CHIPS_DEFAULT so the answer is
// always current.
export function exportableCrossfadeIds() {
  return DURATION_CHIPS_DEFAULT.map(c => c.id)
}
