// biasOverridesIO: package the user's Smash & Save bias-chip overrides
// as a portable JSON envelope and parse one back. Parallels wind
// overrides IO (R12.17) + crossfade overrides IO (R13.14) so the
// workflow stays predictable: same envelope shape, same v1/v-too-new
// gating, same merge-vs-replace modes, same MAX import-size guard.
//
// Why ship this? Power users build careful bias overrides on their
// main rig (counts, speed ranges, chance probabilities, force-type
// weights for each of the three chips) and want to bring those
// settings to a laptop, demo machine, or share with a collaborator.
// Without an IO module the only path is hand-editing localStorage
// (3 keys, one per chip) — not a great UX.
//
// Envelope shape (v1):
//   {
//     kind:    'ai-particle-simulator/bias-overrides',
//     v:       1,
//     exportedAt: ISO-8601,
//     items:   { calm: { counts: [10000, 30000], ... }, wild: {...} }
//   }
//
// `items` is an OBJECT keyed by bias id (calm / surprise / wild) —
// matches the persisted shape so the round-trip is boring and
// unambiguous. Unknown ids are dropped on import; values are
// re-sanitized through sanitizeBiasOverride so a hand-edited
// "counts: [-99, 50]" can't crash the generator.
//
// IMPORTANT: only NON-EMPTY overrides are exported (an empty entry
// means "use shipped defaults" and shipping empty entries would
// litter the recipient's localStorage with no-op keys; the bias
// system already collapses {} to "no override applied" anyway).

import {
  sanitizeBiasOverride, SCENE_BIASES,
} from './randomScene.js'

export const EXPORT_KIND = 'ai-particle-simulator/bias-overrides'
export const EXPORT_VERSION = 1

// 16 KB — bias overrides are tiny (4 ranges + 10 chances + 1 string-
// array per chip, x 3 chips). 16 KB leaves room for many extras
// without inviting a megabyte payload.
export const MAX_IMPORT_BYTES = 16 * 1024

// Stable list of all known bias ids (the ones the editor can write
// overrides for). Pulled from SCENE_BIASES so adding a new chip later
// automatically extends the IO without touching this module.
export function exportableBiasIds() {
  return SCENE_BIASES.map(b => b.id)
}

const KNOWN_BIAS_IDS = new Set(exportableBiasIds())

// Re-sanitize a whole bias-overrides map. Unknown chip ids are
// silently dropped. Empty overrides (after sanitization) are also
// dropped so the round-trip stays minimal.
export function sanitizeBiasOverridesMap(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const id of Object.keys(raw)) {
    if (!KNOWN_BIAS_IDS.has(id)) continue
    const safe = sanitizeBiasOverride(raw[id])
    if (Object.keys(safe).length > 0) out[id] = safe
  }
  return out
}

// Build the export envelope from the live overrides dict.
export function buildExportPayload(overridesMap, nowIso = new Date().toISOString()) {
  return {
    kind: EXPORT_KIND,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    items: sanitizeBiasOverridesMap(overridesMap),
  }
}

export function serializeBiasOverrides(overridesMap) {
  return JSON.stringify(buildExportPayload(overridesMap), null, 2)
}

// "particle-bias-2026-06-22.json"-style filename.
export function makeFilename(nowIso = new Date().toISOString()) {
  return `particle-bias-${nowIso.slice(0, 10)}.json`
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
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Top-level value must be an object' }
  }
  // Tolerate a bare items map (hand-rolled exports) AND the full
  // envelope shape. Detect by presence of the `kind` field.
  let envelope = parsed
  if (!parsed.kind && !parsed.items) {
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
  const items = sanitizeBiasOverridesMap(envelope.items)
  if (Object.keys(items).length === 0) {
    return { ok: false, error: 'No valid overrides found in file' }
  }
  return { ok: true, items, source: envelope }
}

// Merge imported overrides into a live overrides dict. Default
// mode 'merge' keeps existing overrides and only adds chips the
// import touches that aren't already overridden; 'replace' wipes
// the existing dict and uses only the imported overrides.
// Returns { items, added, replaced, skipped } so the UI can show
// a concrete summary toast.
export function mergeImport(existing, imported, mode = 'merge') {
  const safeImport = sanitizeBiasOverridesMap(imported || {})
  const importedIds = Object.keys(safeImport)
  if (mode === 'replace') {
    return { items: safeImport, added: importedIds.length, replaced: 0, skipped: 0 }
  }
  const safeExisting = sanitizeBiasOverridesMap(existing || {})
  const out = { ...safeExisting }
  let added = 0, skipped = 0
  for (const id of importedIds) {
    if (Object.prototype.hasOwnProperty.call(out, id)) { skipped++; continue }
    out[id] = safeImport[id]
    added++
  }
  return { items: out, added, replaced: 0, skipped }
}

// Dry-run summary for a preview UI — mirrors customThemesIO's
// `summarizeImportImpact` so the preview pattern stays symmetric
// with the other override IO modules. Returns:
//   {
//     mode,             // echo of requested mode
//     totalImport,      // count of valid imported ids after sanitize
//     willAdd,          // count of brand-new chip overrides
//     willSkip,         // count skipped (existing in merge, n/a in replace)
//     willOverwrite,    // count whose id already exists (replace mode only)
//     conflicts: [string, ...],   // ids the import would overwrite
//     resultIds: [string, ...],   // final ids after the merge
//   }
export function summarizeImportImpact(existing, imported, mode = 'merge') {
  const safeImport = sanitizeBiasOverridesMap(imported || {})
  const safeExisting = sanitizeBiasOverridesMap(existing || {})
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
export function downloadBiasOverridesFile(overridesMap, nowIso = new Date().toISOString()) {
  try {
    const json = serializeBiasOverrides(overridesMap)
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
