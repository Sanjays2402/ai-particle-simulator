// calmGatesIO: package the user's per-motion calm-gate map as a portable
// JSON envelope and parse one back. Parallels windOverridesIO (R12.06)
// and crossfadeOverridesIO so the workflow stays predictable: same
// envelope shape, same v1 / v-too-new gating, same merge-vs-replace
// modes, same MAX import-size guard.
//
// Why ship this? A user who has carefully chosen WHICH of the four
// ambient motions calm mode should pause (auto-rotate, camera-shake,
// hue-cycle, zen-orbit — R38.K) wants to carry that preference to a
// laptop / demo machine, or share it with a collaborator. Without an IO
// module the only path is hand-editing localStorage.
//
// Envelope shape (v1):
//   {
//     kind:   'ai-particle-simulator/calm-gates',
//     v:      1,
//     exportedAt: ISO-8601,
//     gates:  { autoRotate: true, cameraShake: false, hueCycle: true, zenOrbit: true }
//   }
//
// `gates` is a complete { id: bool } map over the known motion ids
// (CALM_MOTION_IDS). Unknown keys are dropped on import; missing keys
// default to gated (true) — same fail-toward-calming contract
// sanitizeCalmGates already uses — so a map saved before a new motion was
// added still gates the newcomer.

import {
  sanitizeCalmGates,
  CALM_MOTION_IDS,
  CALM_GATED_MOTIONS,
} from './calmMode.js'

export const EXPORT_KIND = 'ai-particle-simulator/calm-gates'
export const EXPORT_VERSION = 1

// 8 KB — generous for a four-key bool map. Hard cap stops a malicious
// file from blowing up the browser.
export const MAX_IMPORT_BYTES = 8 * 1024

// Build the export envelope. Caller passes the live gate map; we
// re-sanitize so a corrupted in-memory map can't ship something invalid.
export function buildExportPayload(gates, nowIso = new Date().toISOString()) {
  return {
    kind: EXPORT_KIND,
    v: EXPORT_VERSION,
    exportedAt: nowIso,
    gates: sanitizeCalmGates(gates),
  }
}

export function serializeCalmGates(gates) {
  return JSON.stringify(buildExportPayload(gates), null, 2)
}

// "particle-calm-gates-2026-06-27.json"-style filename.
export function makeFilename(nowIso = new Date().toISOString()) {
  return `particle-calm-gates-${nowIso.slice(0, 10)}.json`
}

// Parse a raw JSON string into the gate map. Returns
// { ok: true, gates, source } or { ok: false, error }. Never mutates
// anything. Caller decides what to do with `gates` (merge / replace).
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
  // Tolerate a bare gates map (hand-rolled exports) AND the full envelope
  // shape. Detect the envelope by the presence of `kind` or `gates`.
  let envelope = parsed
  if (!parsed.kind && !parsed.gates) {
    // Treat the whole thing as a gates map.
    envelope = { kind: EXPORT_KIND, v: EXPORT_VERSION, gates: parsed }
  }
  if (envelope.kind && envelope.kind !== EXPORT_KIND) {
    return { ok: false, error: `Wrong file kind: ${envelope.kind}` }
  }
  if (envelope.v && envelope.v > EXPORT_VERSION) {
    return { ok: false, error: `Unsupported export version: ${envelope.v}` }
  }
  if (!envelope.gates || typeof envelope.gates !== 'object') {
    return { ok: false, error: '`gates` map missing from envelope' }
  }
  // A gates payload is only meaningful if it carries at least one known
  // motion id — otherwise it's an unrelated blob that would silently
  // resolve to the all-default map and look like a successful import.
  const hasKnownKey = CALM_MOTION_IDS.some(
    id => Object.prototype.hasOwnProperty.call(envelope.gates, id),
  )
  if (!hasKnownKey) {
    return { ok: false, error: 'No recognised calm-gate motions in file' }
  }
  const gates = sanitizeCalmGates(envelope.gates)
  return { ok: true, gates, source: envelope }
}

// Merge an imported gate map into a live one. Default mode 'merge' keeps
// the user's CURRENT gate for any motion the incoming file leaves at its
// default-true (so an import only ever flips a motion the sender
// deliberately changed FROM the default), while 'replace' adopts the
// imported map wholesale. Returns { gates, changed, mode } where
// `changed` is the count of motion ids whose value actually flips.
//
// The merge semantics: because sanitizeCalmGates fills every key, a bare
// `{ autoRotate: false }` import would otherwise reset the other three to
// true and clobber the user's choices. So in merge mode we only apply an
// incoming value when it DIFFERS from the all-gated default — i.e. the
// sender explicitly opted that motion OUT. Replace mode applies the full
// sanitized map.
export function mergeImport(existing, imported, mode = 'replace') {
  const safeExisting = sanitizeCalmGates(existing)
  const safeImport = sanitizeCalmGates(imported)
  if (mode === 'merge') {
    const out = { ...safeExisting }
    let changed = 0
    for (const id of CALM_MOTION_IDS) {
      // Only adopt an incoming value that's a deliberate opt-OUT (false,
      // i.e. differs from the gated-true default). Incoming `true` is the
      // default and shouldn't re-gate a motion the user turned off.
      if (safeImport[id] === false && out[id] !== false) {
        out[id] = false
        changed++
      }
    }
    return { gates: out, changed, mode: 'merge' }
  }
  // replace: adopt the imported map wholesale.
  let changed = 0
  for (const id of CALM_MOTION_IDS) {
    if (safeImport[id] !== safeExisting[id]) changed++
  }
  return { gates: safeImport, changed, mode: 'replace' }
}

// Dry-run summary for a preview UI — mirrors windOverridesIO's
// summarizeImportImpact so the preview pattern stays symmetric. Returns:
//   {
//     mode,                    // echo of requested mode
//     rows: [{ id, label, from, to, changes }, ...],  // per-motion diff
//     willChange,              // count of motions whose value flips
//   }
// `from` is the live value, `to` is what the import would set it to under
// the requested mode, `changes` is from !== to. Ordered by
// CALM_GATED_MOTIONS so the preview is stable.
export function summarizeImportImpact(existing, imported, mode = 'replace') {
  const merged = mergeImport(existing, imported, mode)
  const safeExisting = sanitizeCalmGates(existing)
  const rows = CALM_GATED_MOTIONS.map(m => {
    const from = safeExisting[m.id]
    const to = merged.gates[m.id]
    return { id: m.id, label: m.label, from, to, changes: from !== to }
  })
  return { mode: merged.mode, rows, willChange: merged.changed }
}

// R41.K — a "diff-only" filter for the import-preview rows: when a user
// imports a large map, the unchanged rows are noise that drowns out the
// handful that actually flip. This pure helper returns only the rows
// whose value changes when `diffOnly` is on, or every row when it's off
// (parallels the keymap preview's changed-only view). Defensive:
// non-array rows → []; with diffOnly off it returns the SAME array
// reference (no allocation) so a caller can cheaply tell "nothing
// filtered". Never mutates the input.
export function filterPreviewRows(rows, diffOnly) {
  if (!Array.isArray(rows)) return []
  if (!diffOnly) return rows
  return rows.filter(r => r && r.changes === true)
}

// R45.K — apply JUST ONE motion's incoming value, cherry-picked from the
// preview. R40.K/R41.K commit the whole map at the chosen mode; this lets
// a user adopt a single motion's change without taking the rest. Returns
// the live map with only motionId set to the imported value (sanitized),
// plus `changed` (0 or 1). Unknown motion / no-op (already equal) → the
// existing map ref unchanged with changed:0 (the caller can skip the
// save). Pure; never mutates inputs.
export function applyOneMotion(existing, imported, motionId) {
  const safeExisting = sanitizeCalmGates(existing)
  if (!CALM_MOTION_IDS.includes(motionId)) return { gates: safeExisting, changed: 0 }
  const safeImport = sanitizeCalmGates(imported)
  if (safeExisting[motionId] === safeImport[motionId]) return { gates: safeExisting, changed: 0 }
  return { gates: { ...safeExisting, [motionId]: safeImport[motionId] }, changed: 1 }
}

// Trigger a browser download of the JSON envelope. Returns the filename
// used, or null when something went wrong (e.g. no document available
// during SSR).
export function downloadCalmGatesFile(gates, nowIso = new Date().toISOString()) {
  try {
    const json = serializeCalmGates(gates)
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
