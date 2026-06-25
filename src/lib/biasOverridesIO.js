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
  SCENE_BIAS_RANGE_FIELDS, SCENE_BIAS_CHANCE_FIELDS,
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

// R23.33 — multi-file drop combiner. Graduates R22.28's first-file-
// only convention with the multi-file gesture R19.20 brought to MIDI
// bundles + R18.18 brought to theme packs. Drop N .json files at once
// and the panel COMBINES them into one impact summary before the
// confirm fires.
//
// Per-file failures (corrupt JSON, wrong-kind envelope) are counted
// but never abort the drop — partial success is preserved so a single
// hand-rolled junk file in a 12-file gesture doesn't toast away all
// the good ones. Cross-file duplicate chip ids are resolved last-
// file-wins (filenames sorted alphabetically by the caller, so the
// outcome is deterministic across machines).
//
// Pure / no DOM — caller is responsible for the FileReader stage so
// this module stays test-pure (Node's `--test` runs in a sandbox
// with no FileReader). The browser path lives in RightSidebar.jsx;
// this helper exists so the combine logic is regression-pinned.
//
// Shape mirrors midiUserBundleIO.combineDroppedBundles for symmetry:
//   reads = [{ raw, error?, name? }, ...]   // one per file attempt
// Returns:
//   {
//     items,           // combined override map (sanitized)
//     parseFails,      // count of files that yielded zero overrides
//     totalFilesRead,  // count of files attempted
//     perFile: [       // per-file breakdown so UI can show which file added what
//       { name, ok: true,  chipCount: N }   // success
//     | { name, ok: false, error: '...' }  // failure
//     ],
//   }
//
// `chipCount` reflects what the FILE contributed before cross-file
// overwrites — useful for a per-file summary line in the toast/confirm.
export function combineDroppedBiasFiles(reads) {
  if (!Array.isArray(reads)) {
    return { items: {}, parseFails: 0, totalFilesRead: 0, perFile: [] }
  }
  const items = {}
  let parseFails = 0
  let totalFilesRead = 0
  const perFile = []
  for (const r of reads) {
    if (!r || typeof r !== 'object') continue
    totalFilesRead++
    const name = typeof r.name === 'string' && r.name ? r.name : 'unnamed'
    if (r.error || typeof r.raw !== 'string' || !r.raw) {
      parseFails++
      perFile.push({ name, ok: false, error: r.error || 'empty / unreadable file' })
      continue
    }
    const parsed = parseImport(r.raw)
    if (!parsed.ok) {
      parseFails++
      perFile.push({ name, ok: false, error: parsed.error })
      continue
    }
    const chipCount = Object.keys(parsed.items).length
    perFile.push({ name, ok: true, chipCount })
    // Last-file-wins on conflict. Caller sorts alphabetically by filename
    // before calling so the resolution is deterministic.
    Object.assign(items, parsed.items)
  }
  return { items, parseFails, totalFilesRead, perFile }
}

// R24.36 — preview-panel projector. Graduates the multi-file drop
// from R23.33 with a per-chip diff list so the user can see what a
// drop will actually CHANGE before committing — parallels the wind
// (R14.15) + crossfade (R14.16) import previews.
//
// Returns one structured row per chip the import touches. Each row
// carries:
//   - id, label           — chip identity
//   - incoming            — sanitized override map the import will write
//   - live                — current override map (or null when chip is on shipped defaults)
//   - isExisting          — whether the chip already has any live override
//   - wouldWrite          — would this row actually persist post-commit?
//                           (merge: only when !isExisting; replace: always)
//   - action              — 'add' | 'skip' | 'overwrite'  — UI badge hint
//   - fieldCount          — number of distinct keys in the incoming override
//                           (small but useful so the UI can say "3 fields")
//
// `mode` is one of 'merge' | 'replace' (defaults to 'merge' for the
// same reason mergeImport does — most-conservative default).
//
// Rows are sorted by SCENE_BIASES order so the preview list reads in
// the same order as the chip rail above it (calm → surprise → wild),
// regardless of the order the import file happens to use.
//
// Defensive — non-object items / array items / null all return [].
// SCENE_BIASES is queried fresh each call so a future chip addition
// auto-extends the preview without touching this helper.
export function buildBiasImportPreviewRows(items, existing, mode = 'merge') {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return []
  const safeItems = sanitizeBiasOverridesMap(items)
  const safeExisting = sanitizeBiasOverridesMap(existing || {})
  const sceneOrder = SCENE_BIASES.map(b => b.id)
  const labelById = Object.fromEntries(SCENE_BIASES.map(b => [b.id, b.label || b.id]))
  const importedIds = Object.keys(safeItems)
  const rows = importedIds.map(id => {
    const incoming = safeItems[id]
    const live = Object.prototype.hasOwnProperty.call(safeExisting, id)
      ? safeExisting[id]
      : null
    const isExisting = live != null
    const wouldWrite = mode === 'replace' ? true : !isExisting
    const action = mode === 'replace'
      ? (isExisting ? 'overwrite' : 'add')
      : (isExisting ? 'skip' : 'add')
    // R25.41 — per-FIELD diff. Always computed so the UI can decide
    // whether to render the expanded view, but cheap to skip when the
    // row is collapsed.
    return {
      id,
      label: labelById[id] || id,
      incoming,
      live,
      isExisting,
      wouldWrite,
      action,
      fieldCount: Object.keys(incoming || {}).length,
      fieldDiff: buildBiasFieldDiff(incoming, live),
    }
  })
  rows.sort((a, b) => {
    const ai = sceneOrder.indexOf(a.id)
    const bi = sceneOrder.indexOf(b.id)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  return rows
}

// R25.41 — Per-FIELD diff projector. Graduates R24.36 which only
// surfaced a `fieldCount`. The user needs to see WHICH fields are
// being added or changed (counts going up to 50K when they expected
// 5K is a different kind of OH-NO than \"counts: [10,30] → [9,28]\").
//
// Output: one row per UNIONED field across (incoming, live). Field
// order follows the canonical order:
//   range fields first  (counts, speedRange, glowRange, attractRange)
//   chance fields next  (bgChance, forceFieldChance, ...)
//   forceTypes last
//
// Each row carries:
//   - field        — canonical field key
//   - kind         — 'range' | 'chance' | 'forceTypes'
//   - incoming     — incoming sanitized value (or undefined if not in import)
//   - live         — live sanitized value (or undefined if not in current override)
//   - action       — 'add' | 'change' | 'unchanged' | 'live-only'
//                    'add'        : field appears in incoming, not in live
//                    'change'     : field in both, but values differ
//                    'unchanged'  : field in both, values match (sanitized)
//                    'live-only'  : field in live but NOT in incoming
//                                   (only meaningful in replace mode —
//                                    in merge mode the live value
//                                    is preserved untouched and we
//                                    omit these to keep the diff tight)
//
// Defensive: non-object inputs → []. null live / undefined incoming
// handled gracefully.
//
// Comparison semantics:
//   - ranges (counts, *Range): [min, max] tuples; arr equality on
//     sanitized values
//   - chances: numeric equality on sanitized (clamped [0,1]) values
//   - forceTypes: string-array; order-sensitive equality (the picker
//     respects order via roundRobin)
//
// Pure / no DOM — caller paints the rows.
export function buildBiasFieldDiff(incomingRaw, liveRaw) {
  const incoming = (incomingRaw && typeof incomingRaw === 'object' && !Array.isArray(incomingRaw))
    ? sanitizeBiasOverride(incomingRaw)
    : {}
  const live = (liveRaw && typeof liveRaw === 'object' && !Array.isArray(liveRaw))
    ? sanitizeBiasOverride(liveRaw)
    : {}
  // Canonical field order — ranges first, chances second, forceTypes last.
  const allFields = [...SCENE_BIAS_RANGE_FIELDS, ...SCENE_BIAS_CHANCE_FIELDS, 'forceTypes']
  const kindByField = {}
  for (const f of SCENE_BIAS_RANGE_FIELDS) kindByField[f] = 'range'
  for (const f of SCENE_BIAS_CHANCE_FIELDS) kindByField[f] = 'chance'
  kindByField.forceTypes = 'forceTypes'
  const out = []
  for (const field of allFields) {
    const inHas = Object.prototype.hasOwnProperty.call(incoming, field)
    const liHas = Object.prototype.hasOwnProperty.call(live, field)
    if (!inHas && !liHas) continue
    const inVal = inHas ? incoming[field] : undefined
    const liVal = liHas ? live[field]     : undefined
    let action
    if (!liHas)       action = 'add'
    else if (!inHas)  action = 'live-only'
    else if (biasFieldValuesEqual(field, inVal, liVal)) action = 'unchanged'
    else              action = 'change'
    out.push({
      field, kind: kindByField[field],
      incoming: inVal, live: liVal,
      action,
    })
  }
  return out
}

// R26.41 — Pure summary projector for a per-row field-diff array.
// Returns the count of CHANGED vs UNCHANGED field rows so the preview
// UI can surface "3 changed / 2 unchanged" as a single inline tag on
// each chip row WITHOUT the user having to expand the row first. The
// existing fieldCount tells the user how many fields are in the
// import; this projector tells them how many of those fields actually
// MATTER given the live override they're about to displace.
//
// Mode-aware:
//   - 'merge'   : live-only rows are NOT counted at all (live is
//                 preserved untouched, so they're neither changed
//                 nor unchanged from the merge's perspective).
//   - 'replace' : live-only rows ARE counted as 'changed' (they're
//                 about to be DROPPED, which is a change worth
//                 surfacing).
// Default mode = 'merge' (matches buildBiasImportPreviewRows default
// + safer surface area — if a caller forgets the arg we don't
// invent dropped-field counts).
//
// Output shape: { changed, unchanged }
//   - changed:   count of action='add' + 'change' rows (+ 'live-only'
//                in replace mode)
//   - unchanged: count of action='unchanged' rows
// Both fields are non-negative integers. changed + unchanged ≤ the
// fieldDiff length (live-only rows are excluded from both counts in
// merge mode).
//
// Defensive: non-array fieldDiff → { changed: 0, unchanged: 0 };
// rows missing an `action` field are silently skipped (treat as
// uncategorized — not surfaced in either count).
//
// Pure / no DOM / no allocations beyond the result object.
export function summarizeFieldDiffCounts(fieldDiff, mode = 'merge') {
  if (!Array.isArray(fieldDiff)) return { changed: 0, unchanged: 0 }
  let changed = 0
  let unchanged = 0
  const isReplace = mode === 'replace'
  for (const d of fieldDiff) {
    if (!d || typeof d !== 'object') continue
    const action = d.action
    if (action === 'unchanged') unchanged++
    else if (action === 'add' || action === 'change') changed++
    else if (action === 'live-only' && isReplace) changed++
    // other / unknown actions: silently skip (not surfaced)
  }
  return { changed, unchanged }
}

// R27.41 — Total-fields-touched projector. Sums summarizeFieldDiffCounts
// across every chip row in a preview, so the import header can surface
// a single \"Touching N of M fields total\" pip. Helps users picking
// between several imports compare scope at a glance without expanding
// every row.
//
// Returns:
//   { changed, unchanged, total }
//   - changed   : sum of changed counts across all rows (mode-aware:
//                 live-only is counted as changed in replace mode only,
//                 same semantics as summarizeFieldDiffCounts)
//   - unchanged : sum of unchanged counts across all rows
//   - total     : changed + unchanged. Convenient denominator for the
//                 \"N of TOTAL\" UI label.
//
// Skipped:
//   - rows without a fieldDiff (no field-level data → no contribution)
//   - rows whose fieldDiff is empty (zero changed + zero unchanged →
//     adds 0 — doesn't distort the ratio)
//   - rows where the import action is 'skip' AND mode is 'merge' (the
//     live override stays untouched in merge mode, so its field
//     diff describes what WOULD have changed under Replace; counting
//     it as \"touched\" would mislead a Merge-mode user)
//
// Defensive: non-array rows → zeros; null/non-object rows silently
// skipped; bad mode string falls back to 'merge'. Pure / no DOM.
//
// Mirrors summarizeFieldDiffCounts's defensive contract so a corrupt
// row mid-list can never poison the total.
export function summarizeImportTotalFieldImpact(rows, mode = 'merge') {
  if (!Array.isArray(rows)) return { changed: 0, unchanged: 0, total: 0 }
  const isReplace = mode === 'replace'
  let changed = 0
  let unchanged = 0
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue
    // Merge mode: skip-action rows describe what WOULD have happened
    // under Replace. Counting them as "touched" misleads a Merge user
    // who's planning a non-destructive append. Replace mode counts
    // them (the live override is about to be overwritten or dropped).
    if (!isReplace && r.action === 'skip') continue
    const counts = summarizeFieldDiffCounts(r.fieldDiff, mode)
    changed += counts.changed
    unchanged += counts.unchanged
  }
  return { changed, unchanged, total: changed + unchanged }
}

// R28.41 — Three-tier intensity thresholds for the import preview header
// pip. Graduates R27.41's two-tier indigo/amber surface with a third
// "urgent" red band so very-wide-scope imports register at a glance.
//
// Tiers:
//   - 'low'     : changed <  IMPORT_IMPACT_AMBER_AT (10)  → indigo
//   - 'medium'  : changed >= 10 and < IMPORT_IMPACT_RED_AT (20) → amber
//   - 'high'    : changed >= 20                          → red
//
// Threshold semantics:
//   - LOW means "tweaking a small handful of fields" — the user is
//     probably importing a focused override pack, no need to highlight.
//   - MEDIUM (10+) means "this is a meaningful scope import — worth
//     scanning before clicking Apply".
//   - HIGH (20+) means "this import touches a LOT of fields — almost
//     certainly a full preset bundle or a destructive replace; warrants
//     a 2-second double-check before commit".
//
// Constants exported so the UI can mention the cutoffs in tooltips
// without hard-coding them.
export const IMPORT_IMPACT_AMBER_AT = 10
export const IMPORT_IMPACT_RED_AT = 20

// Returns one of 'low' | 'medium' | 'high'. Defensive: non-finite /
// negative input → 'low' (a corrupt count shouldn't paint as urgent).
export function getImportImpactIntensity(changed) {
  if (!Number.isFinite(changed) || changed < 0) return 'low'
  if (changed >= IMPORT_IMPACT_RED_AT)   return 'high'
  if (changed >= IMPORT_IMPACT_AMBER_AT) return 'medium'
  return 'low'
}

// CSS-ready bundle for each intensity. Keeps the UI declarative —
// the chip background / border / accent / text colours all flow from
// this single source of truth. Parallels attractorTypeStyle (R14.05)
// and userPresetColorStyle (R16.19) in shape so a future visual
// refresh changes the palette in one file.
//
// Pip colour pairs (matches the existing R27.41 indigo/amber pip
// styling exactly so a low-scope import looks unchanged):
//   - low    (< 10  changed) : indigo  #c7d2fe text / #a5b4fc accent
//   - medium (>= 10 changed) : amber   #fde68a text / #fbbf24 accent
//   - high   (>= 20 changed) : red     #fecaca text / #f87171 accent
const IMPORT_IMPACT_STYLES = {
  low: {
    bg:       'rgba(99,102,241,0.10)',
    border:   '1px solid rgba(99,102,241,0.30)',
    color:    '#c7d2fe',
    accent:   '#a5b4fc',
    label:    'low scope',
  },
  medium: {
    bg:       'rgba(245,158,11,0.10)',
    border:   '1px solid rgba(245,158,11,0.30)',
    color:    '#fde68a',
    accent:   '#fbbf24',
    label:    'meaningful scope',
  },
  high: {
    bg:       'rgba(239,68,68,0.12)',
    border:   '1px solid rgba(239,68,68,0.42)',
    color:    '#fecaca',
    accent:   '#f87171',
    label:    'wide scope',
  },
}

// Returns the style bundle for the given intensity (or 'low' if the
// arg is unrecognised — defensive against typos / corrupt input).
export function getImportImpactStyle(intensity) {
  return IMPORT_IMPACT_STYLES[intensity] || IMPORT_IMPACT_STYLES.low
}

// R29.41 — Scope-history ring for the import-preview header pip.
// Graduates R28.41's single live three-tier pip with a short memory of
// the user's LAST FEW previewed import scopes (each tagged with its
// tier colour), so someone comparing several import files can see
// "today's import touches 6 fields (low) vs. last week's pack that was
// 34 (high)" at a glance via the pip's tooltip — without re-opening
// every file.
//
// The ring is MOST-RECENT-FIRST, deduped on consecutive identical
// scopes (a user flipping Merge/Replace back and forth on the SAME
// import shouldn't spam the history with near-duplicate entries — only
// a genuinely-different changed count records), and capped at
// IMPORT_SCOPE_HISTORY_MAX entries (oldest dropped FIFO).
export const IMPORT_SCOPE_HISTORY_MAX = 3

// Push a new scope reading onto the history ring. Pure — returns a NEW
// array; never mutates the input. Each entry is
//   { changed, total, intensity }
// where intensity is derived via getImportImpactIntensity so the
// stored tier can never drift from the live pip's tier for the same
// count.
//
// Dedupe rule: if the incoming `changed` equals the most-recent
// entry's `changed`, we REPLACE that head entry in place (updating its
// total, which can legitimately shift when the user flips mode) rather
// than stacking a second near-identical row. This keeps the 3-slot
// history meaningful — three DISTINCT scopes, not three readings of
// the same hover.
//
// Defensive:
//   - non-array prev → treated as empty history
//   - non-finite / negative `changed` → returns prev unchanged (a
//     corrupt count must never pollute the comparison history)
//   - non-finite `total` → coerced to `changed` (the pip's denominator
//     is always >= changed; a bad total shouldn't NaN the tooltip)
export function pushImportScopeHistory(prev, changed, total) {
  const list = Array.isArray(prev) ? prev : []
  if (!Number.isFinite(changed) || changed < 0) return list
  const safeChanged = Math.floor(changed)
  const safeTotal = Number.isFinite(total) && total >= safeChanged
    ? Math.floor(total)
    : safeChanged
  const intensity = getImportImpactIntensity(safeChanged)
  const entry = { changed: safeChanged, total: safeTotal, intensity }
  const head = list[0]
  // Consecutive-dedupe: same changed count as the current head → update
  // the head in place (total may have moved) instead of stacking.
  if (head && head.changed === safeChanged) {
    // No-op skip when the head is already byte-identical (ref-equal-on-
    // no-op so the React state setter can short-circuit a re-render).
    if (head.total === safeTotal && head.intensity === intensity) return list
    const next = list.slice()
    next[0] = entry
    return next
  }
  // Genuinely new scope → unshift to front, cap at MAX (FIFO drop tail).
  const next = [entry, ...list]
  if (next.length > IMPORT_SCOPE_HISTORY_MAX) next.length = IMPORT_SCOPE_HISTORY_MAX
  return next
}

// Format the scope history into display rows for the pip tooltip.
// Pure projector. Returns one row per remembered scope, newest first:
//   { changed, total, intensity, label, accent, ordinal }
// where:
//   - label   : the tier's friendly label (from getImportImpactStyle)
//   - accent  : the tier's accent colour (so the UI can paint a dot)
//   - ordinal : 'current' for the newest, then '1 ago', '2 ago', ...
// Defensive: non-array → []; corrupt rows (missing/non-finite changed)
// silently skipped so a single bad entry never blanks the whole list.
export function describeImportScopeHistory(history) {
  if (!Array.isArray(history)) return []
  const out = []
  let rank = 0
  for (const h of history) {
    if (!h || typeof h !== 'object') continue
    if (!Number.isFinite(h.changed)) continue
    const intensity = (h.intensity === 'low' || h.intensity === 'medium' || h.intensity === 'high')
      ? h.intensity
      : getImportImpactIntensity(h.changed)
    const style = getImportImpactStyle(intensity)
    const total = Number.isFinite(h.total) && h.total >= h.changed ? h.total : h.changed
    out.push({
      changed: h.changed,
      total,
      intensity,
      label: style.label,
      accent: style.accent,
      ordinal: rank === 0 ? 'current' : `${rank} ago`,
    })
    rank++
  }
  return out
}

// R30.41 — PERSIST the scope-history ring to localStorage so the
// comparison survives reload + panel close. R29.41 kept the ring in
// React state at the RightSidebar level, which meant it reset the
// moment the page reloaded (or the component remounted): a user who
// previewed a "big" pack last session lost the ability to compare it
// against today's import. R30.41 graduates the in-memory ring to a
// reload-surviving preference, mirroring loadNoteFilterHistory's
// load/sanitize/save shape so the contract stays symmetric across the
// app's persisted lists.
//
// Storage shape (localStorage key 'bias-import-scope-history-v1'):
//   { v: 1, items: [{ changed, total, intensity }, ...] }   (newest first)
export const IMPORT_SCOPE_HISTORY_KEY = 'bias-import-scope-history-v1'

// Sanitize a raw (possibly hand-edited / corrupt) scope-history array
// into the canonical [{ changed, total, intensity }] shape. Drops bad
// rows silently; caps to IMPORT_SCOPE_HISTORY_MAX (newest-first, so the
// oldest are trimmed off the tail). Pure — input not mutated.
//
// Per-row repair (parallels describeImportScopeHistory's tolerance so
// the persisted list and the rendered list never disagree):
//   - non-object / non-finite `changed` row → dropped
//   - `total` < changed or non-finite → coerced to `changed`
//   - missing / invalid `intensity` → recomputed from `changed`
export function sanitizeImportScopeHistory(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const h of raw) {
    if (!h || typeof h !== 'object') continue
    if (!Number.isFinite(h.changed) || h.changed < 0) continue
    const changed = Math.floor(h.changed)
    const total = Number.isFinite(h.total) && h.total >= changed ? Math.floor(h.total) : changed
    const intensity = (h.intensity === 'low' || h.intensity === 'medium' || h.intensity === 'high')
      ? h.intensity
      : getImportImpactIntensity(changed)
    out.push({ changed, total, intensity })
    if (out.length >= IMPORT_SCOPE_HISTORY_MAX) break
  }
  return out
}

// Load the persisted scope history. Returns [] on missing / corrupt /
// no-storage so a fresh install (or a wiped key) starts clean. The
// `storage` arg is injectable for tests; falls back to localStorage.
export function loadImportScopeHistory(storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return []
  try {
    const raw = store.getItem(IMPORT_SCOPE_HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) return []
    return sanitizeImportScopeHistory(parsed.items)
  } catch { return [] }
}

// Persist the list. No-op (returns false) when storage is unavailable.
// An empty list REMOVES the key so we don't litter the store with a
// `{ items: [] }` shell (matches saveNoteFilterHistory's contract).
export function saveImportScopeHistory(list, storage) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return false
  try {
    const safe = sanitizeImportScopeHistory(list)
    if (safe.length === 0) {
      store.removeItem(IMPORT_SCOPE_HISTORY_KEY)
      return true
    }
    store.setItem(IMPORT_SCOPE_HISTORY_KEY, JSON.stringify({ v: 1, items: safe }))
    return true
  } catch { return false }
}

// Pure equality check for bias-override field values. Routes by kind:
//   - range fields (4): two-element numeric array, element-wise eq
//   - chance fields (10): numeric eq
//   - forceTypes: string-array, order-sensitive eq
// Defensive: type mismatch → false (treat as different so the UI
// flags it for the user instead of silently \"unchanged\").
export function biasFieldValuesEqual(field, a, b) {
  if (a === b) return true
  if (a == null || b == null) return false
  if (SCENE_BIAS_RANGE_FIELDS.includes(field)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  if (SCENE_BIAS_CHANCE_FIELDS.includes(field)) {
    return Number.isFinite(a) && Number.isFinite(b) && a === b
  }
  if (field === 'forceTypes') {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  return false
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
