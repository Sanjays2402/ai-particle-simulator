// midiUserBundleIO: package a single user-authored MIDI controller
// preset bundle (R13.05) as a portable JSON envelope and parse one
// back. Companion to midiPresets.js — keeps the IO surface separate
// so the bundle CRUD module stays focused on storage + the IO module
// can be evolved (compression, signing, etc) without touching CRUD.
//
// Why ship this? The user bundle editor (R13.05) lets a power user
// save the current CC→action map as a named bundle that persists
// locally. R14.17 lets them carry that bundle BETWEEN MACHINES —
// export from the home rig, drop the file on a laptop or a friend's
// machine, get the same controller layout instantly. Without an IO
// module the only path was to dump localStorage by hand.
//
// Envelope shape (v1, single bundle):
//   {
//     kind:        'ai-particle-simulator/midi-user-bundle',
//     v:           1,
//     exportedAt:  ISO-8601,
//     bundle: {
//       name:        'Stage Rig',
//       description: '12 bindings saved 2026-06-21',
//       map:         { '<cc>': '<actionId>', ... },
//     }
//   }
//
// Only ONE bundle per file. Multi-bundle export is intentionally out
// of scope — keeps the file shape boring + UI obvious ("download
// THIS bundle"). The id from localStorage is NOT exported; the
// importer mints a fresh id so two machines exporting+re-importing
// don't collide on numbered ids.

import { ACTIONS } from './midiMap.js'
import { MAX_USER_PRESETS, isUserPresetId } from './midiPresets.js'

const ACTION_IDS = new Set(ACTIONS.map(a => a.id))

export const EXPORT_KIND = 'ai-particle-simulator/midi-user-bundle'
export const EXPORT_VERSION = 1

// 16 KB — generous for ~14 CC bindings (16 bytes per entry tops).
// Hard cap stops a malicious file from blowing up the browser.
export const MAX_IMPORT_BYTES = 16 * 1024

// Strip a bundle down to the IO shape — keeps only the fields the
// envelope cares about, sanitizes the map so corrupt rows can't ride
// along. Returns null when the input isn't a sensible bundle.
function pickIOFields(bundle) {
  if (!bundle || typeof bundle !== 'object') return null
  const name = typeof bundle.name === 'string' ? bundle.name.trim().slice(0, 32) : ''
  if (!name) return null
  const description = typeof bundle.description === 'string'
    ? bundle.description.slice(0, 80)
    : 'Custom bundle'
  const cleanMap = sanitizeBundleMap(bundle.map)
  if (!cleanMap) return null
  return { name, description, map: cleanMap }
}

// Same shape as the sanitizer in midiPresets — kept local so this
// module stays import-light + the action whitelist drives both
// paths.
function sanitizeBundleMap(map) {
  if (!map || typeof map !== 'object') return null
  const out = {}
  let kept = 0
  for (const [cc, actionId] of Object.entries(map)) {
    const n = parseInt(cc, 10)
    if (!Number.isFinite(n) || n < 0 || n > 127) continue
    if (typeof actionId !== 'string' || !ACTION_IDS.has(actionId)) continue
    out[String(n)] = actionId
    kept++
  }
  return kept > 0 ? out : null
}

// Build the export envelope. Defensive — caller might pass a stale
// bundle from a hot-reload, so we re-pick + re-sanitize.
export function buildExportPayload(bundle, nowIso = new Date().toISOString()) {
  const safe = pickIOFields(bundle)
  if (!safe) return null
  return {
    kind: EXPORT_KIND,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    bundle: safe,
  }
}

// Serialize the envelope, returning the JSON string or null when the
// bundle can't be encoded (no name, no valid bindings, etc).
export function serializeUserBundle(bundle, nowIso = new Date().toISOString()) {
  const payload = buildExportPayload(bundle, nowIso)
  if (!payload) return null
  return JSON.stringify(payload, null, 2)
}

// "particle-midi-bundle-stage-rig-2026-06-21.json" — slugify the
// bundle name so filenames don't carry spaces / punctuation that
// would force the user to rename them on save.
function slugifyName(name) {
  return (name || 'bundle')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'bundle'
}

export function makeFilename(bundle, nowIso = new Date().toISOString()) {
  const slug = slugifyName(bundle && bundle.name)
  return `particle-midi-bundle-${slug}-${nowIso.slice(0, 10)}.json`
}

// Parse a raw JSON string into a single bundle ready to slot into
// the user-presets list (caller still has to mint an id + add via
// addUserPreset). Returns { ok: true, bundle, source } or
// { ok: false, error }. Never mutates anything.
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
  // Tolerate a bare-bundle shorthand (a JSON object with `name` +
  // `map` at the top level, no envelope wrapper). Detect by absence
  // of the `kind` field AND absence of a `bundle` subkey.
  let envelope = parsed
  if (!parsed.kind && !parsed.bundle) {
    envelope = { kind: EXPORT_KIND, v: EXPORT_VERSION, bundle: parsed }
  }
  if (envelope.kind && envelope.kind !== EXPORT_KIND) {
    return { ok: false, error: `Wrong file kind: ${envelope.kind}` }
  }
  if (envelope.v && envelope.v > EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${envelope.v}` }
  }
  if (!envelope.bundle || typeof envelope.bundle !== 'object') {
    return { ok: false, error: '`bundle` missing from envelope' }
  }
  const safe = pickIOFields(envelope.bundle)
  if (!safe) {
    return { ok: false, error: 'Bundle has no name or no valid bindings' }
  }
  return { ok: true, bundle: safe, source: envelope }
}

// True when the live user-bundle list is at MAX_USER_PRESETS — the
// UI uses this to disable the Import button so users don't import
// a file and then silently lose another bundle to the FIFO drop.
export function isAtBundleCap(userPresets) {
  return Array.isArray(userPresets) && userPresets.length >= MAX_USER_PRESETS
}

// Trigger a browser download of a single bundle's JSON envelope.
// Returns the filename used, or null when something went wrong
// (no bundle, no document, can't encode).
export function downloadUserBundleFile(bundle, nowIso = new Date().toISOString()) {
  try {
    const json = serializeUserBundle(bundle, nowIso)
    if (!json) return null
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const filename = makeFilename(bundle, nowIso)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return filename
  } catch { return null }
}

// --- R15.14 — multi-bundle export / import ---------------------------
//
// R14.17 ships ONE bundle per file (great for sharing your "Stage Rig"
// with a friend, less great for backing up your entire collection).
// R15.14 adds a sibling envelope shape that carries an ARRAY of
// bundles in a single file so a power-user can ship their whole
// "Your Bundles" section across machines in one click.
//
// Envelope shape (v1, multi-bundle):
//   {
//     kind:        'ai-particle-simulator/midi-user-bundles',  (NOTE: plural)
//     v:           1,
//     exportedAt:  ISO-8601,
//     bundles: [{ name, description, map }, ...]
//   }
//
// Distinct `kind` from the single-bundle envelope so a stale parser
// never silently grabs the first entry of a multi-bundle file thinking
// it's a single bundle (or vice versa). Same per-bundle sanitisation
// pipeline as the single-bundle path (pickIOFields), so a corrupt row
// inside a multi-bundle file is dropped without rejecting the whole
// file.
//
// MAX_IMPORT_BYTES is intentionally bumped to 64 KB for multi-bundle
// imports — at MAX_USER_PRESETS = 8 and ~16 KB per bundle worst case,
// 64 KB is the right ceiling. Single-bundle files keep their tighter
// 16 KB cap (a single bundle should NEVER be that large).
export const EXPORT_KIND_MULTI = 'ai-particle-simulator/midi-user-bundles'
export const MAX_IMPORT_BYTES_MULTI = 64 * 1024

// Build the multi-bundle export envelope. Filters out unencodable
// bundles silently — the alternative (reject the whole file when one
// bundle has a corrupt row) is much worse UX.
export function buildExportPayloadMulti(bundles, nowIso = new Date().toISOString()) {
  if (!Array.isArray(bundles)) return null
  const safe = []
  for (const b of bundles) {
    const picked = pickIOFields(b)
    if (picked) safe.push(picked)
  }
  if (safe.length === 0) return null
  return {
    kind: EXPORT_KIND_MULTI,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    bundles: safe,
  }
}

export function serializeUserBundlesMulti(bundles, nowIso = new Date().toISOString()) {
  const payload = buildExportPayloadMulti(bundles, nowIso)
  if (!payload) return null
  return JSON.stringify(payload, null, 2)
}

// Filename pattern: particle-midi-bundles-N-YYYY-MM-DD.json
// where N is the bundle count. Helps the user spot which dump is
// which when they accumulate a few in their Downloads folder.
export function makeFilenameMulti(bundles, nowIso = new Date().toISOString()) {
  const count = Array.isArray(bundles) ? bundles.length : 0
  return `particle-midi-bundles-${count}-${nowIso.slice(0, 10)}.json`
}

// Parse a multi-bundle envelope. Returns { ok, bundles, source } on
// success, { ok: false, error } on failure. Per-bundle entries that
// fail sanitisation are dropped silently; the whole file is rejected
// only when zero bundles survive or the envelope shape is wrong.
//
// Tolerates a bare-array shorthand (a JSON array of {name,map}
// objects at top level) for hand-rolled files — symmetric with
// parseImport's bare-bundle tolerance.
export function parseImportMulti(raw) {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Import data was not a string' }
  }
  if (raw.length > MAX_IMPORT_BYTES_MULTI) {
    return { ok: false, error: `File too large (max ${(MAX_IMPORT_BYTES_MULTI / 1024) | 0} KB)` }
  }
  let parsed
  try { parsed = JSON.parse(raw) }
  catch (e) { return { ok: false, error: `Invalid JSON: ${e.message || 'parse failed'}` } }
  // Bare-array shorthand: top-level JSON array of bundle-shaped objects.
  let envelope = parsed
  if (Array.isArray(parsed)) {
    envelope = { kind: EXPORT_KIND_MULTI, v: EXPORT_VERSION, bundles: parsed }
  }
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, error: 'Top-level value must be an object or array' }
  }
  if (envelope.kind && envelope.kind !== EXPORT_KIND_MULTI) {
    return { ok: false, error: `Wrong file kind: ${envelope.kind}` }
  }
  if (envelope.v && envelope.v > EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${envelope.v}` }
  }
  if (!Array.isArray(envelope.bundles)) {
    return { ok: false, error: '`bundles` array missing from envelope' }
  }
  const safe = []
  for (const b of envelope.bundles) {
    const picked = pickIOFields(b)
    if (picked) safe.push(picked)
  }
  if (safe.length === 0) {
    return { ok: false, error: 'No valid bundles in the file' }
  }
  return { ok: true, bundles: safe, source: envelope }
}

// Trigger a browser download for an array of bundles. Returns the
// filename, or null when something went wrong.
export function downloadUserBundlesFileMulti(bundles, nowIso = new Date().toISOString()) {
  try {
    const json = serializeUserBundlesMulti(bundles, nowIso)
    if (!json) return null
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const filename = makeFilenameMulti(bundles, nowIso)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return filename
  } catch { return null }
}

// Summarise what a multi-bundle import would do against an existing
// list — used by the UI to phrase a one-line confirmation BEFORE the
// import commits ("import 4 bundles · 2 will replace existing names").
// `existing` is the live user-bundle list; `incoming` is the parsed
// safe-bundle array returned by parseImportMulti.
//
// Match strategy: by name (case-insensitive, trimmed). Names are how
// users mentally identify a bundle ("Stage Rig"); the synthetic ids
// are an implementation detail.
export function summarizeImportImpactMulti(existing, incoming) {
  const live = Array.isArray(existing) ? existing : []
  const incs = Array.isArray(incoming) ? incoming : []
  const liveNames = new Map()
  for (const p of live) {
    if (!p || typeof p.name !== 'string') continue
    liveNames.set(p.name.trim().toLowerCase(), p)
  }
  let willReplace = 0
  let willAdd = 0
  for (const b of incs) {
    if (!b || typeof b.name !== 'string') continue
    const key = b.name.trim().toLowerCase()
    if (liveNames.has(key)) willReplace++
    else willAdd++
  }
  // FIFO-drop projection: if `live.length + willAdd > MAX_USER_PRESETS`,
  // count how many existing bundles would be FIFO-evicted. (Replaces
  // don't change the count.)
  const projected = live.length + willAdd
  const willDrop = Math.max(0, projected - MAX_USER_PRESETS)
  return { willAdd, willReplace, willDrop, incoming: incs.length, live: live.length }
}

// Re-export so the panel UI can keep its import + cap-check coupled
// to the same module (saves a second import line).
export { MAX_USER_PRESETS, isUserPresetId }

// --- R19.20 — multi-file drop combiner ---------------------------------
//
// R18.09 wired single-file drag-and-drop to the panel; R18.18 graduated
// theme-pack drops to handle N files at once. R19.20 brings the same
// multi-file gesture to MIDI bundles: drop a folder of .json files
// (a friend's whole collection + your local backup) and the panel
// COMBINES them into one impact summary before the confirm fires.
//
// combineDroppedBundles takes an array of "per-file parse results"
// shaped like { raw, error?, name? } and runs each through the same
// parseImportMulti → parseImport precedence the single-file drop uses.
// Successful parses are flattened into one bundles[] array; per-file
// failures are counted but never abort the drop. Returns:
//   {
//     bundles,             // flat array of safe-bundle objects ready
//                          // to feed addUserPreset
//     parseFails,          // count of files that yielded zero bundles
//     totalFilesRead,      // count of files we actually attempted
//                          // (excludes ones the caller already filtered)
//   }
//
// Pure / no DOM — caller is responsible for the FileReader stage so
// this module stays test-pure (Node's `--test` runs in a sandbox
// with no FileReader). The browser path lives in MidiPanel.jsx;
// this helper exists so the combine logic is regression-pinned.
export function combineDroppedBundles(reads) {
  if (!Array.isArray(reads)) return { bundles: [], parseFails: 0, totalFilesRead: 0 }
  const bundles = []
  let parseFails = 0
  let totalFilesRead = 0
  for (const r of reads) {
    if (!r || typeof r !== 'object') continue
    totalFilesRead++
    if (r.error || typeof r.raw !== 'string' || !r.raw) {
      parseFails++
      continue
    }
    const multi = parseImportMulti(r.raw)
    if (multi.ok) {
      bundles.push(...multi.bundles)
      continue
    }
    const single = parseImport(r.raw)
    if (single.ok) {
      bundles.push(single.bundle)
      continue
    }
    parseFails++
  }
  return { bundles, parseFails, totalFilesRead }
}
