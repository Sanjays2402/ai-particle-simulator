// keymapIO: package the user's keyboard remap as a portable JSON
// envelope and parse one back. Parallel structure to bookmarksIO and
// customThemesIO so the Settings panel can offer the same Export /
// Import buttons next to the existing rebind UI.
//
// Envelope shape (v1):
//   {
//     kind:    'ai-particle-simulator/keymap',
//     v:       1,
//     exportedAt: ISO-8601,
//     bindings: { play: 'Space', random: 'KeyR', ... }
//   }
//
// Only known action ids are serialised — stale ids from older versions
// of the app are silently dropped on both export and import. The
// envelope contains code strings only; modifier flags live in the
// ACTIONS registry itself (Shift+F is action id 'favorite', not a
// stored modifier on the binding) so there's nothing to round-trip
// beyond the per-action code.

import { ACTIONS, defaultsByAction, setBinding } from './keymap.js'

export const EXPORT_KIND = 'ai-particle-simulator/keymap'
export const EXPORT_VERSION = 1

// 32 KB cap is overkill for ~12 actions but mirrors the other IO
// modules. Stops a malicious file from blowing up the parser.
export const MAX_IMPORT_BYTES = 32 * 1024

const ACTION_IDS = new Set(ACTIONS.map(a => a.id))

// Build the export envelope. Only known action ids land in `bindings`;
// any custom field the caller smuggled in is dropped.
export function buildExportPayload(map, nowIso = new Date().toISOString()) {
  const bindings = {}
  if (map && typeof map === 'object') {
    for (const a of ACTIONS) {
      const v = map[a.id]
      if (typeof v === 'string' && v.length > 0) bindings[a.id] = v
    }
  }
  return {
    kind: EXPORT_KIND,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    bindings,
  }
}

export function serializeKeymap(map) {
  return JSON.stringify(buildExportPayload(map), null, 2)
}

// Build a "particle-keymap-2026-06-20.json"-style filename.
export function makeFilename(nowIso = new Date().toISOString()) {
  return `particle-keymap-${nowIso.slice(0, 10)}.json`
}

// Parse a raw JSON string into a partial bindings dict. Returns
// { ok: true, bindings, source } or { ok: false, error }. The caller
// decides whether to merge the result onto the live map or replace it.
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
  // Tolerate both the envelope shape AND a bare bindings dict so
  // hand-rolled exports still import without ceremony.
  let envelope = parsed
  if (!parsed.kind && !parsed.bindings && typeof parsed === 'object') {
    // Looks like a bare bindings dict — wrap it.
    envelope = { kind: EXPORT_KIND, v: EXPORT_VERSION, bindings: parsed }
  }
  if (envelope.kind && envelope.kind !== EXPORT_KIND) {
    return { ok: false, error: `Wrong file kind: ${envelope.kind}` }
  }
  if (envelope.v && envelope.v > EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${envelope.v}` }
  }
  if (!envelope.bindings || typeof envelope.bindings !== 'object') {
    return { ok: false, error: '`bindings` object missing from envelope' }
  }
  // Whitelist known action ids; coerce values to strings.
  const bindings = {}
  let kept = 0
  for (const id of Object.keys(envelope.bindings)) {
    if (!ACTION_IDS.has(id)) continue
    const v = envelope.bindings[id]
    if (typeof v !== 'string' || v.length === 0) continue
    bindings[id] = v
    kept++
  }
  if (kept === 0) {
    return { ok: false, error: 'No valid bindings found in file' }
  }
  return { ok: true, bindings, source: envelope }
}

// Merge imported bindings into a live map. Default mode 'merge'
// overlays only the imported keys (anything not in the file keeps
// its current binding); mode 'replace' starts from the defaults and
// then overlays the imported keys (anything not in the file resets
// to its default). Returns { map, changed, total } so the UI can
// show a concrete summary.
export function mergeImport(existing, imported, mode = 'merge') {
  const base = mode === 'replace' ? defaultsByAction() : (existing && typeof existing === 'object' ? { ...existing } : defaultsByAction())
  let map = base
  let changed = 0
  const total = Object.keys(imported || {}).length
  if (!imported || typeof imported !== 'object') {
    return { map, changed: 0, total: 0 }
  }
  for (const id of Object.keys(imported)) {
    if (!ACTION_IDS.has(id)) continue
    const next = setBinding(map, id, imported[id])
    if (next[id] !== map[id]) changed++
    map = next
  }
  return { map, changed, total }
}

// Dry-run summary for a preview UI (R13.04). Mirrors the pattern in
// customThemesIO / windOverridesIO / crossfadeOverridesIO so the
// Settings modal can show the user what will change BEFORE they
// commit. Pure — never touches storage.
//
// Returns:
//   {
//     mode,         // echo of requested mode
//     totalImport,  // count of valid imported ids (after whitelist)
//     willChange,   // count of bindings that will actually move
//     willKeep,     // count of bindings that match existing already
//     willReset,    // count of EXISTING actions that will reset to
//                   //   default (replace mode only — every action
//                   //   not in the file goes back to default)
//     diffs: [{ id, label, fromCode, toCode }, ...]  // bindings that
//                   //   will actually change, ordered by ACTIONS so
//                   //   the UI display stays stable
//     resetIds: [string, ...]  // ids that will reset to default in
//                   //   replace mode (empty in merge mode)
//   }
export function summarizeImportImpact(existing, imported, mode = 'merge') {
  const liveMap = (existing && typeof existing === 'object') ? existing : defaultsByAction()
  const defaults = defaultsByAction()
  // Filter the import to known action ids and string values only.
  const cleanImport = {}
  let totalImport = 0
  if (imported && typeof imported === 'object') {
    for (const id of Object.keys(imported)) {
      if (!ACTION_IDS.has(id)) continue
      const v = imported[id]
      if (typeof v !== 'string' || v.length === 0) continue
      cleanImport[id] = v
      totalImport++
    }
  }
  // Build the projected post-merge map without committing it.
  const projected = mode === 'replace' ? { ...defaults, ...cleanImport } : { ...liveMap, ...cleanImport }
  const diffs = []
  let willChange = 0
  let willKeep = 0
  for (const a of ACTIONS) {
    const before = liveMap[a.id] || defaults[a.id]
    const after  = projected[a.id] || defaults[a.id]
    if (before !== after) {
      diffs.push({ id: a.id, label: a.label, fromCode: before, toCode: after })
      willChange++
    } else if (cleanImport[a.id] !== undefined && cleanImport[a.id] === before) {
      // Import touched this action but with the same code → no-op.
      willKeep++
    }
  }
  // In replace mode, every action NOT in the file resets to default.
  // Those resets are already reflected in `willChange`, but the UI
  // wants a separate count + id list so we can hint "X bindings will
  // reset to defaults" distinctly from "X bindings move to new keys".
  const resetIds = []
  if (mode === 'replace') {
    for (const a of ACTIONS) {
      if (cleanImport[a.id] !== undefined) continue
      if ((liveMap[a.id] || defaults[a.id]) !== defaults[a.id]) {
        resetIds.push(a.id)
      }
    }
  }
  return {
    mode,
    totalImport,
    willChange,
    willKeep,
    willReset: resetIds.length,
    diffs,
    resetIds,
  }
}

// Trigger a browser download of the JSON envelope. Returns the
// filename used, or null when something went wrong (no document).
export function downloadKeymapFile(map, nowIso = new Date().toISOString()) {
  try {
    const json = serializeKeymap(map)
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
