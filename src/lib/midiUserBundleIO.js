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

// Re-export so the panel UI can keep its import + cap-check coupled
// to the same module (saves a second import line).
export { MAX_USER_PRESETS, isUserPresetId }
