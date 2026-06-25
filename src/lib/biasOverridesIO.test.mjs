// biasOverridesIO: round-trip the user's Smash & Save bias-chip
// overrides through the JSON envelope. Parallels windOverridesIO.test
// and crossfadeOverridesIO.test so the test contracts stay symmetric
// across the three override IO modules.
//
// R21.23 — graduates the per-chip bias editor (R20.07) with a portable
// share path so users can copy their tuning to another machine.

import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
  exportableBiasIds,
  sanitizeBiasOverridesMap,
  buildExportPayload, serializeBiasOverrides, makeFilename,
  parseImport, mergeImport, summarizeImportImpact,
  combineDroppedBiasFiles,
  buildBiasImportPreviewRows,
  // R25.41 — per-field diff projector + value equality
  buildBiasFieldDiff, biasFieldValuesEqual,
  // R26.41 — chip-row counts projector for the per-row summary tag
  summarizeFieldDiffCounts,
  // R27.41 — total-impact projector for the preview-header pip
  summarizeImportTotalFieldImpact,
  // R28.41 — three-tier intensity (low/medium/high) + CSS bundle
  getImportImpactIntensity, getImportImpactStyle,
  IMPORT_IMPACT_AMBER_AT, IMPORT_IMPACT_RED_AT,
  // R29.41 — rolling scope-history ring + display projector
  IMPORT_SCOPE_HISTORY_MAX, pushImportScopeHistory, describeImportScopeHistory,
  // R30.41 — persist the scope-history ring to localStorage
  IMPORT_SCOPE_HISTORY_KEY,
  sanitizeImportScopeHistory, loadImportScopeHistory, saveImportScopeHistory,
} from './biasOverridesIO.js'
import { SCENE_BIASES, SCENE_BIAS_RANGE_FIELDS, SCENE_BIAS_CHANCE_FIELDS } from './randomScene.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(c, m)  { if (!c) fail(m) }
function eq(a, b, m) { if (a !== b) fail(`${m}\n  expected: ${JSON.stringify(b)}\n  got: ${JSON.stringify(a)}`) }
function deepEq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}\n  expected: ${JSON.stringify(b)}\n  got: ${JSON.stringify(a)}`) }

// --- exportable ids cover EXACTLY the shipped chips -------------------
{
  const ids = exportableBiasIds()
  eq(ids.length, SCENE_BIASES.length, 'exportableBiasIds covers all shipped chips')
  for (const b of SCENE_BIASES) {
    ok(ids.includes(b.id), `exportableBiasIds includes shipped chip ${b.id}`)
  }
}

// --- sanitizeBiasOverridesMap: structural defence ---------------------

// Empty / nullish inputs return empty map (never throws).
{
  deepEq(sanitizeBiasOverridesMap({}),         {}, 'empty obj → empty')
  deepEq(sanitizeBiasOverridesMap(null),       {}, 'null → empty')
  deepEq(sanitizeBiasOverridesMap(undefined),  {}, 'undefined → empty')
  deepEq(sanitizeBiasOverridesMap('not-obj'),  {}, 'string → empty')
  deepEq(sanitizeBiasOverridesMap(42),         {}, 'number → empty')
}

// Unknown bias ids dropped silently.
{
  const map = { calm: { counts: [100, 200] }, bogusChip: { counts: [1, 2] } }
  const out = sanitizeBiasOverridesMap(map)
  ok('calm' in out,        'known chip kept')
  ok(!('bogusChip' in out), 'unknown chip dropped')
}

// Empty per-chip overrides also dropped (no-op entries don't pollute
// the round-trip).
{
  const map = { calm: { counts: [100, 200] }, surprise: {} }
  const out = sanitizeBiasOverridesMap(map)
  ok('calm' in out,         'non-empty kept')
  ok(!('surprise' in out),  'empty-after-sanitize dropped')
}

// Corrupt per-chip values re-flow through sanitizeBiasOverride.
{
  const map = {
    calm: {
      counts: [10000, 30000],   // valid
      speedRange: [-5, 1],      // negative → dropped by sanitizeBiasOverride
      bgChance: 1.5,            // > 1 → dropped
      bogusField: 'x',          // unknown key → dropped
    },
  }
  const out = sanitizeBiasOverridesMap(map)
  deepEq(out.calm.counts, [10000, 30000], 'valid counts kept')
  ok(!('speedRange' in out.calm), 'negative speedRange dropped')
  ok(!('bgChance'   in out.calm), 'out-of-range bgChance dropped')
  ok(!('bogusField' in out.calm), 'unknown key dropped')
}

// --- buildExportPayload / serialize / filename ------------------------

{
  const payload = buildExportPayload(
    { calm: { counts: [10000, 30000] } },
    '2026-06-22T19:31:34.000Z',
  )
  eq(payload.kind, EXPORT_KIND, 'envelope.kind')
  eq(payload.v,    EXPORT_VERSION, 'envelope.v')
  eq(payload.exportedAt, '2026-06-22T19:31:34.000Z', 'envelope.exportedAt')
  deepEq(payload.items.calm.counts, [10000, 30000], 'envelope.items round-trips data')
}

// serializeBiasOverrides round-trips to parseable JSON.
{
  const s = serializeBiasOverrides({ calm: { counts: [10000, 30000] } })
  ok(typeof s === 'string',     'serialize returns string')
  ok(s.length > 0,              'serialize non-empty')
  const reparsed = JSON.parse(s)
  eq(reparsed.kind, EXPORT_KIND, 'serialized envelope.kind round-trips')
}

// makeFilename embeds the iso date prefix.
eq(makeFilename('2026-06-22T19:31:34.000Z'), 'particle-bias-2026-06-22.json',
  'filename embeds iso date')

// --- parseImport — full envelope round-trip ---------------------------

{
  const s = serializeBiasOverrides({ calm: { counts: [5000, 14000] }, wild: { kaleidoChance: 0.95 } })
  const r = parseImport(s)
  ok(r.ok, 'envelope parses')
  deepEq(r.items.calm.counts,        [5000, 14000], 'calm.counts round-trips')
  eq(r.items.wild.kaleidoChance, 0.95,            'wild.kaleidoChance round-trips')
}

// Bare items-map shorthand accepted.
{
  const s = JSON.stringify({ calm: { counts: [10000, 30000] } })
  const r = parseImport(s)
  ok(r.ok, 'bare-items shorthand parses')
  deepEq(r.items.calm.counts, [10000, 30000], 'bare items.calm.counts round-trips')
}

// Wrong file kind rejected with helpful error.
{
  const s = JSON.stringify({ kind: 'wrong/kind', v: 1, items: { calm: { counts: [1, 2] } } })
  const r = parseImport(s)
  ok(!r.ok, 'wrong kind rejected')
  ok(/wrong/i.test(r.error || ''), 'error mentions wrong kind')
}

// Unsupported version rejected.
{
  const s = JSON.stringify({ kind: EXPORT_KIND, v: 999, items: { calm: { counts: [1, 2] } } })
  const r = parseImport(s)
  ok(!r.ok, 'unsupported version rejected')
}

// Same version (v1) accepted explicitly.
{
  const s = JSON.stringify({ kind: EXPORT_KIND, v: 1, items: { calm: { counts: [100, 200] } } })
  const r = parseImport(s)
  ok(r.ok, 'v1 accepted explicitly')
}

// Missing items map rejected.
{
  const s = JSON.stringify({ kind: EXPORT_KIND, v: 1 })
  const r = parseImport(s)
  ok(!r.ok, 'missing items rejected')
}

// All-invalid items → useful empty-file error.
{
  const s = JSON.stringify({ kind: EXPORT_KIND, v: 1, items: { bogusChip: { counts: [1, 2] } } })
  const r = parseImport(s)
  ok(!r.ok, 'all-invalid items rejected')
  ok(/no valid/i.test(r.error || ''), 'error mentions "no valid"')
}

// Invalid JSON rejected.
{
  const r = parseImport('{ not json at all')
  ok(!r.ok, 'invalid JSON rejected')
  ok(/json/i.test(r.error || ''), 'error mentions JSON')
}

// Non-string input rejected.
{
  const r = parseImport(null)
  ok(!r.ok, 'null input rejected')
  const r2 = parseImport(42)
  ok(!r2.ok, 'number input rejected')
  const r3 = parseImport({})
  ok(!r3.ok, 'object input rejected')
}

// Top-level non-object rejected.
{
  const r = parseImport('"some string"')
  ok(!r.ok, 'top-level string rejected')
  const r2 = parseImport('42')
  ok(!r2.ok, 'top-level number rejected')
}

// Oversized payload rejected by MAX_IMPORT_BYTES guard.
{
  const oversized = '"' + 'x'.repeat(MAX_IMPORT_BYTES) + '"'
  const r = parseImport(oversized)
  ok(!r.ok, 'oversized payload rejected')
  ok(/too large/i.test(r.error || ''), 'error mentions too large')
}

// --- mergeImport: merge vs replace ------------------------------------

// Merge: existing entries kept, only NEW ids added.
{
  const existing = { calm: { counts: [1, 2] } }
  const imported = { calm: { counts: [999, 999] }, wild: { kaleidoChance: 0.9 } }
  const r = mergeImport(existing, imported, 'merge')
  deepEq(r.items.calm.counts, [1, 2],
    'merge: existing calm wins (incoming SKIPPED)')
  eq(r.items.wild.kaleidoChance, 0.9,
    'merge: new wild added')
  eq(r.added,   1, 'merge: added=1')
  eq(r.skipped, 1, 'merge: skipped=1 (calm conflict)')
}

// Replace: existing wiped, ONLY the imported overrides survive.
{
  const existing = { calm: { counts: [1, 2] }, surprise: { bgChance: 0.5 } }
  const imported = { calm: { counts: [999, 999] }, wild: { kaleidoChance: 0.9 } }
  const r = mergeImport(existing, imported, 'replace')
  deepEq(r.items.calm.counts, [999, 999],
    'replace: incoming calm wins')
  eq(r.items.wild.kaleidoChance, 0.9, 'replace: wild added')
  ok(!('surprise' in r.items), 'replace: pre-existing-only chips dropped')
  eq(r.added, 2, 'replace: added=2 (both incoming)')
}

// Merge with no conflicts adds everything.
{
  const r = mergeImport({}, { calm: { counts: [1, 2] }, wild: { kaleidoChance: 0.1 } }, 'merge')
  eq(r.added,   2, 'merge no-conflict: added=2')
  eq(r.skipped, 0, 'merge no-conflict: skipped=0')
}

// Mode arg defaults to 'merge'.
{
  const r = mergeImport({}, { calm: { counts: [1, 2] } })
  eq(r.added, 1, 'default mode = merge')
}

// --- summarizeImportImpact: dry-run preview ---------------------------

// Merge mode: conflicts skip, new add, result preserves existing.
{
  const existing = { calm: { counts: [1, 2] } }
  const imported = { calm: { counts: [99, 99] }, wild: { kaleidoChance: 0.5 } }
  const s = summarizeImportImpact(existing, imported, 'merge')
  eq(s.mode, 'merge',           'echo mode')
  eq(s.totalImport, 2,          'totalImport = 2')
  eq(s.willAdd, 1,              'willAdd = 1 (wild)')
  eq(s.willSkip, 1,             'willSkip = 1 (calm)')
  eq(s.willOverwrite, 0,        'willOverwrite = 0 in merge mode')
  deepEq(s.conflicts, ['calm'], 'conflicts contains calm')
  ok(s.resultIds.includes('calm') && s.resultIds.includes('wild'),
    'resultIds = existing ∪ new')
}

// Replace mode: every incoming counts as "added", existing → overwrite.
{
  const existing = { calm: { counts: [1, 2] }, surprise: { bgChance: 0.5 } }
  const imported = { calm: { counts: [99, 99] }, wild: { kaleidoChance: 0.9 } }
  const s = summarizeImportImpact(existing, imported, 'replace')
  eq(s.mode, 'replace',         'echo mode')
  eq(s.totalImport, 2,          'totalImport = 2')
  eq(s.willAdd, 2,              'willAdd = totalImport in replace mode')
  eq(s.willSkip, 0,             'willSkip = 0 in replace mode')
  eq(s.willOverwrite, 2,        'willOverwrite = existingIds count')
  deepEq(s.conflicts, ['calm'], 'conflicts list unchanged across modes')
  deepEq(s.resultIds, ['calm', 'wild'], 'resultIds = incoming only')
}

// Empty existing → no conflicts, every import is willAdd.
{
  const s = summarizeImportImpact({}, { calm: { counts: [1, 2] } }, 'merge')
  eq(s.willAdd, 1,           'willAdd=1 against empty existing')
  eq(s.willSkip, 0,          'willSkip=0 against empty existing')
  deepEq(s.conflicts, [],    'no conflicts against empty existing')
}

// Empty import → no-op summary.
{
  const s = summarizeImportImpact({ calm: { counts: [1, 2] } }, {}, 'merge')
  eq(s.totalImport, 0,       'totalImport=0 against empty import')
  eq(s.willAdd, 0,           'willAdd=0')
}

// Sanity: schema sizes documented for future-self.
ok(SCENE_BIAS_RANGE_FIELDS.length  === 4,  'schema: 4 range fields')
ok(SCENE_BIAS_CHANCE_FIELDS.length === 10, 'schema: 10 chance fields')

// --- R23.33: combineDroppedBiasFiles — multi-file drop combiner --------

// Happy path — two valid files contribute different chips.
{
  const a = serializeBiasOverrides({ calm: { counts: [1000, 2000] } })
  const b = serializeBiasOverrides({ wild: { counts: [50000, 60000] } })
  const out = combineDroppedBiasFiles([
    { raw: a, name: 'calm.json' },
    { raw: b, name: 'wild.json' },
  ])
  eq(out.totalFilesRead, 2,           'both files counted')
  eq(out.parseFails, 0,               'no parse fails')
  ok('calm' in out.items,             'first file calm chip kept')
  ok('wild' in out.items,             'second file wild chip kept')
  eq(out.perFile.length, 2,           'perFile has 2 entries')
  eq(out.perFile[0].ok, true,         'first perFile entry is ok')
  eq(out.perFile[0].chipCount, 1,     'first perFile entry has chipCount=1')
  eq(out.perFile[1].name, 'wild.json','second perFile entry has name')
}

// Cross-file conflict — last file wins (caller sorts alphabetically).
{
  const a = serializeBiasOverrides({ calm: { counts: [100, 200] } })
  const b = serializeBiasOverrides({ calm: { counts: [9999, 99999] } })
  const out = combineDroppedBiasFiles([
    { raw: a, name: 'a.json' },
    { raw: b, name: 'b.json' },
  ])
  deepEq(out.items.calm.counts, [9999, 99999], 'last file wins on conflict')
  eq(out.parseFails, 0,                          'no parse fails')
}

// Partial success — one valid + one corrupt file.
{
  const good = serializeBiasOverrides({ surprise: { bgChance: 0.42 } })
  const out = combineDroppedBiasFiles([
    { raw: good,                 name: 'good.json' },
    { raw: '{ not valid json',   name: 'bad.json' },
  ])
  eq(out.totalFilesRead, 2,                'both files attempted')
  eq(out.parseFails, 1,                    'bad file counted as fail')
  ok('surprise' in out.items,              'good file still landed')
  eq(out.perFile[0].ok, true,              'good perFile entry ok')
  eq(out.perFile[1].ok, false,             'bad perFile entry not ok')
  ok(out.perFile[1].error,                 'bad perFile entry has error msg')
}

// Defensive: non-array input → empty result with no throw.
{
  const out = combineDroppedBiasFiles(null)
  deepEq(out.items, {},        'null reads → empty items')
  eq(out.parseFails, 0,        'null reads → 0 parseFails')
  eq(out.totalFilesRead, 0,    'null reads → 0 totalFilesRead')
  deepEq(out.perFile, [],      'null reads → empty perFile')
}
{
  const out = combineDroppedBiasFiles('not-array')
  deepEq(out.items, {},        'string reads → empty items')
}

// Empty array → empty result.
{
  const out = combineDroppedBiasFiles([])
  deepEq(out.items, {},        'empty reads → empty items')
  eq(out.totalFilesRead, 0,    'empty reads → 0 totalFilesRead')
}

// Reads with error field set are recorded as failures.
{
  const out = combineDroppedBiasFiles([
    { raw: '', name: 'empty.json' },
    { error: 'read failed', name: 'err.json' },
  ])
  eq(out.totalFilesRead, 2,            'both attempted')
  eq(out.parseFails, 2,                'both counted as failures')
  eq(out.perFile[0].ok, false,         'empty raw → failure')
  eq(out.perFile[1].ok, false,         'pre-existing error → failure')
}

// Wrong-kind envelope counted as failure, doesn't taint other items.
{
  const good = serializeBiasOverrides({ calm: { counts: [100, 200] } })
  const wrongKind = JSON.stringify({ kind: 'something/else', v: 1, items: { calm: {} } })
  const out = combineDroppedBiasFiles([
    { raw: good,      name: 'a.json' },
    { raw: wrongKind, name: 'b.json' },
  ])
  eq(out.parseFails, 1,                'wrong-kind counted as fail')
  ok('calm' in out.items,              'good file still landed')
  ok(/wrong/i.test(out.perFile[1].error || ''), 'error mentions wrong')
}

// Skips non-object reads silently (without counting toward totalFilesRead).
{
  const good = serializeBiasOverrides({ calm: { counts: [100, 200] } })
  const out = combineDroppedBiasFiles([
    null,
    undefined,
    'not-a-read',
    { raw: good, name: 'good.json' },
  ])
  eq(out.totalFilesRead, 1,            'only the well-formed read was counted')
  ok('calm' in out.items,              'good file landed')
}

// Read without a name field → perFile entry uses "unnamed" placeholder.
{
  const good = serializeBiasOverrides({ calm: { counts: [100, 200] } })
  const out = combineDroppedBiasFiles([{ raw: good }])
  eq(out.perFile[0].name, 'unnamed',   'missing name → unnamed')
  eq(out.perFile[0].ok, true,          'still counted as success')
}

// Each file's contribution flows through sanitizeBiasOverridesMap so
// unknown chip ids get dropped.
{
  const tainted = JSON.stringify({
    kind: EXPORT_KIND, v: EXPORT_VERSION,
    items: { calm: { counts: [100, 200] }, bogusChip: { counts: [1, 2] } },
  })
  const out = combineDroppedBiasFiles([{ raw: tainted, name: 'tainted.json' }])
  ok('calm' in out.items,             'known chip kept')
  ok(!('bogusChip' in out.items),     'unknown chip dropped')
  eq(out.perFile[0].chipCount, 1,     'chipCount reflects post-sanitize count')
}

// Purity — input array not mutated.
{
  const good = serializeBiasOverrides({ calm: { counts: [100, 200] } })
  const input = [{ raw: good, name: 'a.json' }]
  const frozen = JSON.stringify(input)
  combineDroppedBiasFiles(input)
  eq(JSON.stringify(input), frozen,    'input array unchanged')
}

// --- R24.36: buildBiasImportPreviewRows — diff projection -------------

// Merge mode + no existing → every row is 'add'.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [1000, 2000] }, wild: { counts: [50000, 60000] } },
    {},
    'merge',
  )
  eq(rows.length, 2,                          'merge+empty: 2 rows')
  ok(rows.every(r => r.action === 'add'),     'merge+empty: all action=add')
  ok(rows.every(r => r.wouldWrite === true),  'merge+empty: all wouldWrite')
  ok(rows.every(r => r.isExisting === false), 'merge+empty: none existing')
}

// Merge mode + existing entries → existing skip, new add.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [9999, 9999] }, wild: { counts: [50000, 60000] } },
    { calm: { counts: [1, 2] } },
    'merge',
  )
  const calm = rows.find(r => r.id === 'calm')
  const wild = rows.find(r => r.id === 'wild')
  eq(calm.action,    'skip',  'merge: existing calm = skip')
  eq(calm.wouldWrite, false,  'merge: existing skip wouldNotWrite')
  eq(wild.action,    'add',   'merge: new wild = add')
  eq(wild.wouldWrite, true,   'merge: new wild wouldWrite')
}

// Replace mode + existing → 'overwrite' instead of 'skip'.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [9999, 9999] }, wild: { counts: [50000, 60000] } },
    { calm: { counts: [1, 2] } },
    'replace',
  )
  const calm = rows.find(r => r.id === 'calm')
  const wild = rows.find(r => r.id === 'wild')
  eq(calm.action,    'overwrite', 'replace: existing calm = overwrite')
  eq(calm.wouldWrite, true,       'replace: every row wouldWrite')
  eq(wild.action,    'add',       'replace: new wild still add')
}

// Default mode = 'merge'.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [1, 2] } },
    { calm: { counts: [1, 2] } },
  )
  eq(rows[0].action, 'skip', 'default mode merge-skips existing')
}

// fieldCount reflects post-sanitize field count.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [1, 2], bgChance: 0.4, kaleidoChance: 0.7 } },
    {},
    'merge',
  )
  eq(rows[0].fieldCount, 3, 'fieldCount = 3 distinct fields')
}

// Live override surfaced on existing rows.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [9999, 9999] } },
    { calm: { counts: [1, 2], bgChance: 0.5 } },
    'merge',
  )
  ok(rows[0].live != null,             'live surfaced on existing row')
  deepEq(rows[0].live.counts, [1, 2],  'live.counts preserved')
}

// Rows sorted by SCENE_BIASES order regardless of input key order.
{
  // SCENE_BIASES order: calm, surprise, wild — verify the sort.
  const sceneOrder = SCENE_BIASES.map(b => b.id)
  const rows = buildBiasImportPreviewRows(
    { wild: { counts: [1, 2] }, calm: { counts: [3, 4] }, surprise: { counts: [5, 6] } },
    {},
    'merge',
  )
  deepEq(rows.map(r => r.id), sceneOrder,
    'rows sorted by SCENE_BIASES order')
}

// Unknown chip ids dropped before rendering rows.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [1, 2] }, bogusChip: { counts: [9, 9] } },
    {},
    'merge',
  )
  eq(rows.length, 1,             'unknown chip not in preview')
  eq(rows[0].id, 'calm',         'only known chip kept')
}

// Defensive: null/non-object items → empty preview.
{
  deepEq(buildBiasImportPreviewRows(null, {}, 'merge'),         [], 'null items → []')
  deepEq(buildBiasImportPreviewRows(undefined, {}, 'merge'),    [], 'undefined items → []')
  deepEq(buildBiasImportPreviewRows('not-obj', {}, 'merge'),    [], 'string items → []')
  deepEq(buildBiasImportPreviewRows(42, {}, 'merge'),           [], 'number items → []')
  deepEq(buildBiasImportPreviewRows([], {}, 'merge'),           [], 'array items → []')
}

// Empty items map → empty rows (not an error).
{
  deepEq(buildBiasImportPreviewRows({}, {}, 'merge'), [], 'empty items → []')
}

// Pure: input not mutated.
{
  const items    = { calm: { counts: [1, 2] } }
  const existing = { wild: { counts: [3, 4] } }
  const beforeItems = JSON.stringify(items)
  const beforeExist = JSON.stringify(existing)
  buildBiasImportPreviewRows(items, existing, 'merge')
  eq(JSON.stringify(items),    beforeItems, 'items not mutated')
  eq(JSON.stringify(existing), beforeExist, 'existing not mutated')
}

// --- R25.41: buildBiasFieldDiff — per-FIELD diff projector ---------------

// Add: incoming has the field, live doesn't (or no live at all).
{
  const diff = buildBiasFieldDiff({ counts: [100, 200] }, null)
  eq(diff.length, 1, 'one field in incoming → one row')
  eq(diff[0].field, 'counts', 'field name')
  eq(diff[0].action, 'add', 'no live → add')
  deepEq(diff[0].incoming, [100, 200], 'incoming carries the value')
  eq(diff[0].live, undefined, 'no live value')
  eq(diff[0].kind, 'range', 'counts is a range field')
}

// Change: same field both sides, different sanitized values.
{
  const diff = buildBiasFieldDiff({ counts: [100, 200] }, { counts: [50, 100] })
  eq(diff.length, 1, 'one field both sides → one row')
  eq(diff[0].action, 'change', 'differing values → change')
  deepEq(diff[0].incoming, [100, 200], 'incoming carries new')
  deepEq(diff[0].live,     [50, 100],  'live carries old')
}

// Unchanged: same field both sides, equal sanitized values.
{
  const diff = buildBiasFieldDiff({ bgChance: 0.5 }, { bgChance: 0.5 })
  eq(diff.length, 1, 'one field both sides → one row')
  eq(diff[0].action, 'unchanged', 'equal values → unchanged')
}

// Live-only: field exists in live but not in incoming.
{
  const diff = buildBiasFieldDiff({}, { counts: [1, 2] })
  eq(diff.length, 1, 'one row for live-only field')
  eq(diff[0].action, 'live-only', 'incoming missing → live-only')
  eq(diff[0].incoming, undefined, 'no incoming')
  deepEq(diff[0].live, [1, 2], 'live carries the value')
}

// Field ordering: ranges before chances before forceTypes.
{
  const diff = buildBiasFieldDiff({
    forceTypes: ['attractor'],
    bgChance:   0.5,
    counts:     [1, 2],
  }, null)
  eq(diff.length, 3, 'all three rows')
  eq(diff[0].field, 'counts',     'ranges first')
  eq(diff[1].field, 'bgChance',   'chances second')
  eq(diff[2].field, 'forceTypes', 'forceTypes last')
}

// Kind tagging — every field knows its kind.
{
  const diff = buildBiasFieldDiff({
    counts: [1, 2], speedRange: [1, 2], glowRange: [1, 2], attractRange: [1, 2],
    bgChance: 0.5, forceFieldChance: 0.5,
    forceTypes: ['attractor'],
  }, null)
  const byKind = diff.reduce((acc, d) => {
    acc[d.kind] = (acc[d.kind] || 0) + 1
    return acc
  }, {})
  eq(byKind.range, 4,       '4 range fields')
  eq(byKind.chance, 2,      '2 chance fields')
  eq(byKind.forceTypes, 1,  '1 forceTypes')
}

// Defensive: non-object incoming → []. non-object live treated as empty.
{
  deepEq(buildBiasFieldDiff(null, null),       [], 'null incoming → []')
  deepEq(buildBiasFieldDiff(undefined, null),  [], 'undefined incoming → []')
  deepEq(buildBiasFieldDiff('str', null),      [], 'string incoming → []')
  deepEq(buildBiasFieldDiff(42, null),         [], 'number incoming → []')
  deepEq(buildBiasFieldDiff([1, 2], null),     [], 'array incoming → []')
  const d = buildBiasFieldDiff({ bgChance: 0.5 }, 'not-an-object')
  eq(d.length, 1, 'non-object live → treated as empty (live=undefined)')
  eq(d[0].action, 'add', '... so the field reads as add')
}

// Sanitization: invalid input field values dropped (sanitizeBiasOverride
// step runs first). Negative counts → field dropped → no diff row.
{
  const diff = buildBiasFieldDiff({ counts: [-5, 100] }, { counts: [50, 100] })
  // The incoming is sanitized away (sub-zero rejected), so this is
  // a live-only row — the incoming side is empty.
  eq(diff.length, 1, 'still one row because live has the field')
  eq(diff[0].action, 'live-only', 'invalid incoming → live-only after sanitize')
}

// Unknown field keys (not in schema) silently dropped by sanitizer.
{
  const diff = buildBiasFieldDiff({ counts: [1, 2], gibberish: 'foo' }, null)
  eq(diff.length, 1, 'unknown keys dropped pre-diff')
  eq(diff[0].field, 'counts', '... only the schema-valid one remains')
}

// --- R25.41: biasFieldValuesEqual — value equality semantics ---------------

// Range equality: element-wise.
{
  ok(biasFieldValuesEqual('counts', [1, 2], [1, 2]),   'equal ranges')
  ok(!biasFieldValuesEqual('counts', [1, 2], [1, 3]),  'different max')
  ok(!biasFieldValuesEqual('counts', [1, 2], [2, 2]),  'different min')
  ok(!biasFieldValuesEqual('counts', [1, 2], [1]),     'length mismatch')
  ok(!biasFieldValuesEqual('counts', [1, 2], null),    'one null')
  ok(!biasFieldValuesEqual('counts', [1, 2], 5),       'number not equal to range')
}

// Chance equality: numeric.
{
  ok(biasFieldValuesEqual('bgChance', 0.5, 0.5),         'equal chances')
  ok(!biasFieldValuesEqual('bgChance', 0.5, 0.500001),   'tiny differences not equal')
  ok(!biasFieldValuesEqual('bgChance', 0.5, null),       'one null')
  ok(!biasFieldValuesEqual('bgChance', NaN, NaN),        'NaN never equal')
}

// forceTypes equality: order-sensitive.
{
  ok(biasFieldValuesEqual('forceTypes', ['a', 'b'], ['a', 'b']),    'same order')
  ok(!biasFieldValuesEqual('forceTypes', ['a', 'b'], ['b', 'a']),   'different order → different')
  ok(!biasFieldValuesEqual('forceTypes', ['a'], ['a', 'a']),        'length differs')
  ok(biasFieldValuesEqual('forceTypes', [], []),                    'both empty arrays')
  ok(!biasFieldValuesEqual('forceTypes', null, []),                 'null vs empty array')
}

// Identity short-circuit (same ref always equal).
{
  const arr = [1, 2]
  ok(biasFieldValuesEqual('counts', arr, arr), 'same array ref is equal')
  ok(biasFieldValuesEqual('forceTypes', arr, arr), 'same ref equal regardless of kind')
}

// Unknown field key (not in any kind list) → false for non-identical values
// (defensive — we don't know the comparison semantics). Identity short-
// circuit still applies for trivially-equal primitives, which is fine.
{
  ok(!biasFieldValuesEqual('gibberish', 1, 2), 'unknown field + different values → false')
  ok(!biasFieldValuesEqual('gibberish', [1], [1]), 'unknown field + array refs → false')
}

// --- R25.41: integration — buildBiasImportPreviewRows now carries fieldDiff ---

{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [1, 100], bgChance: 0.3 } },
    { calm: { counts: [1, 100], bgChance: 0.5 } },
    'merge',
  )
  eq(rows.length, 1, 'one row for the chip')
  ok(Array.isArray(rows[0].fieldDiff), 'fieldDiff present + array')
  eq(rows[0].fieldDiff.length, 2, 'two fields in the diff')
  // counts unchanged + bgChance changed.
  const byField = Object.fromEntries(rows[0].fieldDiff.map(d => [d.field, d.action]))
  eq(byField.counts,   'unchanged', 'counts equal both sides')
  eq(byField.bgChance, 'change',    'bgChance differs')
}

// Replace mode: surfaces live-only fields the import would drop.
{
  const rows = buildBiasImportPreviewRows(
    { calm: { counts: [1, 100] } },
    { calm: { counts: [1, 100], bgChance: 0.5 } },
    'replace',
  )
  eq(rows.length, 1, 'one row for the chip')
  const byField = Object.fromEntries(rows[0].fieldDiff.map(d => [d.field, d.action]))
  eq(byField.counts,   'unchanged', 'counts equal')
  eq(byField.bgChance, 'live-only', 'bgChance would be dropped in replace')
}

// --- R26.41: summarizeFieldDiffCounts — per-row changed/unchanged ----

// Happy path — counts add/change as 'changed', unchanged as 'unchanged'.
{
  const diff = [
    { field: 'counts',           kind: 'range',  action: 'unchanged' },
    { field: 'bgChance',         kind: 'chance', action: 'change' },
    { field: 'forceFieldChance', kind: 'chance', action: 'add' },
    { field: 'attractRange',     kind: 'range',  action: 'unchanged' },
  ]
  const out = summarizeFieldDiffCounts(diff, 'merge')
  eq(out.changed,   2, 'change + add = 2 changed')
  eq(out.unchanged, 2, 'two unchanged rows counted')
}

// Live-only rows: NOT counted in merge mode (live is preserved).
{
  const diff = [
    { field: 'counts',   kind: 'range',  action: 'unchanged' },
    { field: 'bgChance', kind: 'chance', action: 'live-only' },
    { field: 'speedRange', kind: 'range', action: 'change' },
  ]
  const out = summarizeFieldDiffCounts(diff, 'merge')
  eq(out.changed,   1, 'merge: live-only does NOT count as changed')
  eq(out.unchanged, 1, 'merge: unchanged still counted')
}

// Live-only rows: ARE counted as 'changed' in replace mode (they drop).
{
  const diff = [
    { field: 'counts',   kind: 'range',  action: 'unchanged' },
    { field: 'bgChance', kind: 'chance', action: 'live-only' },
    { field: 'speedRange', kind: 'range', action: 'change' },
  ]
  const out = summarizeFieldDiffCounts(diff, 'replace')
  eq(out.changed,   2, 'replace: live-only + change = 2 changed')
  eq(out.unchanged, 1, 'replace: unchanged still counted')
}

// Default mode = 'merge' (safer surface area — if a caller forgets the
// arg we don't invent dropped-field counts).
{
  const diff = [
    { field: 'bgChance', kind: 'chance', action: 'live-only' },
  ]
  const out = summarizeFieldDiffCounts(diff)
  eq(out.changed,   0, 'default mode treats live-only as not-counted')
  eq(out.unchanged, 0, 'default mode = merge')
}

// Empty array → zeros.
{
  const out = summarizeFieldDiffCounts([], 'merge')
  eq(out.changed,   0, 'empty diff → 0 changed')
  eq(out.unchanged, 0, 'empty diff → 0 unchanged')
}

// Defensive — non-array → zeros (graceful degrade).
{
  deepEq(summarizeFieldDiffCounts(null),       { changed: 0, unchanged: 0 }, 'null → zeros')
  deepEq(summarizeFieldDiffCounts(undefined),  { changed: 0, unchanged: 0 }, 'undefined → zeros')
  deepEq(summarizeFieldDiffCounts('not arr'),  { changed: 0, unchanged: 0 }, 'string → zeros')
  deepEq(summarizeFieldDiffCounts(42),         { changed: 0, unchanged: 0 }, 'number → zeros')
  deepEq(summarizeFieldDiffCounts({a:1}),      { changed: 0, unchanged: 0 }, 'plain object → zeros')
}

// Defensive — null entries / non-object entries silently skipped.
{
  const diff = [
    null,
    'not an object',
    42,
    { field: 'counts', kind: 'range', action: 'change' },
    { /* missing action */ field: 'x', kind: 'chance' },
    { field: 'bgChance', kind: 'chance', action: 'unchanged' },
  ]
  const out = summarizeFieldDiffCounts(diff, 'merge')
  eq(out.changed,   1, 'only the real change row counted')
  eq(out.unchanged, 1, 'only the real unchanged row counted')
}

// Unknown action values silently skipped (don't trip the counts).
{
  const diff = [
    { field: 'counts', action: 'mystery-action' },
    { field: 'bgChance', action: 'unchanged' },
    { field: 'speed', action: 'change' },
  ]
  const out = summarizeFieldDiffCounts(diff, 'merge')
  eq(out.changed,   1, 'unknown action does not count as changed')
  eq(out.unchanged, 1, 'unchanged still counted')
}

// Integration — round-trip through buildBiasFieldDiff + this projector
// should produce sensible counts on a realistic merge scenario.
{
  const incoming = { counts: [100, 200], bgChance: 0.5, attractRange: [0.1, 0.9] }
  const live     = { counts: [100, 200], bgChance: 0.3 }  // counts match, bgChance differs, attractRange is new
  const diff = buildBiasFieldDiff(incoming, live)
  const out = summarizeFieldDiffCounts(diff, 'merge')
  eq(out.changed,   2, 'integration merge: bgChance change + attractRange add = 2')
  eq(out.unchanged, 1, 'integration merge: counts unchanged')
}

// Integration replace — same diff carries no extra live-only fields,
// so the count is the same as merge.
{
  const incoming = { counts: [100, 200], bgChance: 0.5 }
  const live     = { counts: [100, 200], bgChance: 0.3, speedRange: [0.1, 0.5] }
  const diffMerge   = buildBiasFieldDiff(incoming, live)
  const mergeOut   = summarizeFieldDiffCounts(diffMerge, 'merge')
  const replaceOut = summarizeFieldDiffCounts(diffMerge, 'replace')
  eq(mergeOut.changed,   1, 'merge mode: only bgChance change counted')
  eq(mergeOut.unchanged, 1, 'merge mode: counts unchanged')
  eq(replaceOut.changed,   2, 'replace mode: bgChance change + speedRange live-only = 2')
  eq(replaceOut.unchanged, 1, 'replace mode: counts unchanged')
}

// Purity — does NOT mutate the input array (sanity check on the loop).
{
  const diff = [{ field: 'counts', action: 'change' }, { field: 'x', action: 'unchanged' }]
  const before = JSON.stringify(diff)
  summarizeFieldDiffCounts(diff, 'merge')
  summarizeFieldDiffCounts(diff, 'replace')
  eq(JSON.stringify(diff), before, 'input not mutated')
}

console.log('PASS: summarizeFieldDiffCounts — per-row chip summary counts (R26.41, ~30 asserts)')

// ----- R27.41: summarizeImportTotalFieldImpact — preview-header total --
// Sums per-row counts across every chip row in a preview into a single
// total. UI surfaces "Touching N of M fields total" so users can compare
// the SCOPE of multiple imports at a glance.

// Helper to build a row shape mirroring the live BiasImportPreviewRow:
//   { id, action, fieldDiff } — other fields not consulted by the
//   projector are omitted for test brevity.
const r = (id, action, fieldDiff) => ({ id, action, fieldDiff })

// Happy: two add-rows, sum their changed counts.
{
  const rows = [
    r('calm',     'add', [{ field: 'a', action: 'add' }, { field: 'b', action: 'add' }]),
    r('surprise', 'add', [{ field: 'c', action: 'change' }, { field: 'd', action: 'unchanged' }]),
  ]
  const out = summarizeImportTotalFieldImpact(rows, 'merge')
  eq(out.changed, 3, 'merge: 2 adds + 1 change = 3 changed')
  eq(out.unchanged, 1, 'merge: 1 unchanged')
  eq(out.total, 4, 'merge: total = changed + unchanged')
}

// Happy: overwrite-action row contributes (overwrite means the live
// override is about to be replaced; counted in BOTH modes).
{
  const rows = [
    r('calm', 'overwrite', [
      { field: 'a', action: 'change' },
      { field: 'b', action: 'change' },
      { field: 'c', action: 'unchanged' },
    ]),
  ]
  const merge = summarizeImportTotalFieldImpact(rows, 'merge')
  const replace = summarizeImportTotalFieldImpact(rows, 'replace')
  eq(merge.changed, 2, 'overwrite in merge: 2 changed counted')
  eq(merge.unchanged, 1, 'overwrite in merge: 1 unchanged counted')
  eq(replace.changed, 2, 'overwrite in replace: 2 changed counted')
  eq(replace.unchanged, 1, 'overwrite in replace: 1 unchanged counted')
}

// Skip-action rows: skipped entirely in MERGE mode (live override
// stays untouched; counting them would mislead the user).
{
  const rows = [
    r('add-row',  'add',  [{ field: 'a', action: 'add' }]),
    r('skip-row', 'skip', [
      { field: 'b', action: 'change' },
      { field: 'c', action: 'unchanged' },
    ]),
  ]
  const merge = summarizeImportTotalFieldImpact(rows, 'merge')
  eq(merge.changed, 1, 'merge: skip-row excluded, only add-row counted')
  eq(merge.unchanged, 0, 'merge: skip-row unchanged not counted')
  eq(merge.total, 1, 'merge: total = 1')
  // In replace mode, every row is in-play (no skips happen under
  // replace; the action just reflects the merge-mode classification),
  // so the count INCLUDES the would-be-skipped row.
  const replace = summarizeImportTotalFieldImpact(rows, 'replace')
  eq(replace.changed, 2, 'replace: add + change counted')
  eq(replace.unchanged, 1, 'replace: unchanged counted')
  eq(replace.total, 3, 'replace: total = 3')
}

// Replace mode: live-only fields count as changed (under replace, the
// live override is about to be dropped/overwritten — that IS a change).
{
  const rows = [
    r('row', 'overwrite', [
      { field: 'a', action: 'live-only' },
      { field: 'b', action: 'change' },
      { field: 'c', action: 'live-only' },
    ]),
  ]
  const merge = summarizeImportTotalFieldImpact(rows, 'merge')
  eq(merge.changed, 1, 'merge: live-only not counted, only 1 change')
  const replace = summarizeImportTotalFieldImpact(rows, 'replace')
  eq(replace.changed, 3, 'replace: 2 live-only + 1 change = 3')
}

// Rows without fieldDiff contribute nothing (no field-level data).
{
  const rows = [
    r('with-diff', 'add', [{ field: 'a', action: 'add' }]),
    r('no-diff',   'add', null),
    r('no-diff2',  'add', undefined),
    r('empty',     'add', []),
  ]
  const out = summarizeImportTotalFieldImpact(rows, 'merge')
  eq(out.changed, 1, 'rows without fieldDiff contribute zero')
  eq(out.total, 1)
}

// Default mode is 'merge' (safer default — under-counts rather than
// over-counts for the most common review flow).
{
  const rows = [r('row', 'skip', [{ field: 'a', action: 'change' }])]
  const out = summarizeImportTotalFieldImpact(rows)   // no mode arg
  eq(out.changed, 0, 'default mode = merge: skip-row not counted')
}

// Defensive: non-array rows → zeros, no throw.
{
  deepEq(summarizeImportTotalFieldImpact(null),      { changed: 0, unchanged: 0, total: 0 }, 'null → zeros')
  deepEq(summarizeImportTotalFieldImpact(undefined), { changed: 0, unchanged: 0, total: 0 }, 'undefined → zeros')
  deepEq(summarizeImportTotalFieldImpact('bad'),     { changed: 0, unchanged: 0, total: 0 }, 'string → zeros')
  deepEq(summarizeImportTotalFieldImpact(42),        { changed: 0, unchanged: 0, total: 0 }, 'number → zeros')
  deepEq(summarizeImportTotalFieldImpact({a:1}),     { changed: 0, unchanged: 0, total: 0 }, 'plain object → zeros')
}

// Defensive: null/non-object rows silently skipped.
{
  const rows = [
    r('ok', 'add', [{ field: 'a', action: 'add' }]),
    null,
    undefined,
    'not a row',
    42,
    r('ok2', 'add', [{ field: 'b', action: 'add' }]),
  ]
  const out = summarizeImportTotalFieldImpact(rows, 'merge')
  eq(out.changed, 2, 'bad rows skipped, valid rows summed')
}

// Defensive: rows with bad fieldDiff (non-array) silently skipped.
{
  const rows = [
    r('ok',   'add', [{ field: 'a', action: 'add' }]),
    r('bad1', 'add', 'not an array'),
    r('bad2', 'add', 42),
    r('bad3', 'add', { not: 'an array' }),
  ]
  const out = summarizeImportTotalFieldImpact(rows, 'merge')
  eq(out.changed, 1, 'rows with bad fieldDiff skipped via summarize defensive')
  eq(out.total, 1)
}

// Integration: build real preview rows + buildBiasFieldDiff, then sum.
{
  const incoming = {
    calm: { counts: [10, 20], bgChance: 0.5 },
    wild: { speedRange: [0.5, 2] },
  }
  const existing = {
    calm: { counts: [10, 20], bgChance: 0.3 },
    // wild is brand new (add)
  }
  const rows = buildBiasImportPreviewRows(incoming, existing, 'merge')
  const out = summarizeImportTotalFieldImpact(rows, 'merge')
  // calm: action='skip' (live override exists in merge mode) → excluded
  //       by our R27.41 contract (skip-rows describe what WOULD have
  //       happened under Replace; counting in Merge misleads the user).
  // wild: action='add' → speedRange added (1)
  eq(out.changed, 1, 'integration merge: skip-row excluded, only wild add counted')
  eq(out.unchanged, 0, 'integration merge: no unchanged (skip-row excluded)')
  eq(out.total, 1)
  // Replace mode: every row in-play. calm is action='overwrite' so its
  // 1-changed (bgChance) + 1-unchanged (counts) both count; wild adds 1.
  const replaceRows = buildBiasImportPreviewRows(incoming, existing, 'replace')
  const replaceOut = summarizeImportTotalFieldImpact(replaceRows, 'replace')
  eq(replaceOut.changed, 2, 'integration replace: bgChance change + wild add = 2')
  eq(replaceOut.unchanged, 1, 'integration replace: counts unchanged counted')
  eq(replaceOut.total, 3)
}

// Purity — input not mutated.
{
  const rows = [r('a', 'add', [{ field: 'f', action: 'add' }])]
  const before = JSON.stringify(rows)
  summarizeImportTotalFieldImpact(rows, 'merge')
  summarizeImportTotalFieldImpact(rows, 'replace')
  eq(JSON.stringify(rows), before, 'input rows not mutated')
}

console.log('PASS: summarizeImportTotalFieldImpact — preview-header total (R27.41, ~30 asserts)')

// =====================================================================
// R28.41 — Three-tier intensity (low/medium/high) for the same pip.
// Graduates R27.41's two-tier indigo/amber surface with a red "wide
// scope" band. We test the threshold function PURELY (no DOM), the
// CSS bundle shape, and the defensive contract.
// =====================================================================

// getImportImpactIntensity — three-tier thresholds.
{
  // Constants exposed.
  eq(IMPORT_IMPACT_AMBER_AT, 10, 'IMPORT_IMPACT_AMBER_AT exposed as 10')
  eq(IMPORT_IMPACT_RED_AT,   20, 'IMPORT_IMPACT_RED_AT exposed as 20')
  ok(IMPORT_IMPACT_AMBER_AT < IMPORT_IMPACT_RED_AT, 'amber threshold lives strictly below red')

  // LOW tier: below amber threshold.
  eq(getImportImpactIntensity(0),  'low', '0 changed → low')
  eq(getImportImpactIntensity(1),  'low', '1 changed → low')
  eq(getImportImpactIntensity(5),  'low', '5 changed → low (mid-low)')
  eq(getImportImpactIntensity(9),  'low', '9 changed → low (just below amber)')

  // MEDIUM tier: amber threshold to just below red.
  eq(getImportImpactIntensity(10), 'medium', '10 changed → medium (amber boundary)')
  eq(getImportImpactIntensity(15), 'medium', '15 changed → medium (mid-amber)')
  eq(getImportImpactIntensity(19), 'medium', '19 changed → medium (just below red)')

  // HIGH tier: red threshold and above.
  eq(getImportImpactIntensity(20), 'high', '20 changed → high (red boundary)')
  eq(getImportImpactIntensity(30), 'high', '30 changed → high (well past red)')
  eq(getImportImpactIntensity(999), 'high', '999 changed → high (clamp safe)')

  // Defensive — non-finite / negative → 'low' (corrupt count shouldn't paint as urgent).
  eq(getImportImpactIntensity(-1),        'low', 'negative → low')
  eq(getImportImpactIntensity(-100),      'low', 'large negative → low')
  eq(getImportImpactIntensity(NaN),       'low', 'NaN → low')
  eq(getImportImpactIntensity(Infinity),  'low', 'Infinity → low (non-finite)')
  eq(getImportImpactIntensity(-Infinity), 'low', '-Infinity → low')
  eq(getImportImpactIntensity('15'),      'low', 'string → low (non-finite)')
  eq(getImportImpactIntensity(null),      'low', 'null → low')
  eq(getImportImpactIntensity(undefined), 'low', 'undefined → low')
}

// Boundary exact semantics — equal-to-threshold should be the HIGHER tier.
// (User scoping "20 fields touched" should see red because it's AT the
// urgent threshold, not 19-still-just-amber.)
{
  eq(getImportImpactIntensity(IMPORT_IMPACT_AMBER_AT),     'medium', 'changed === amber threshold → medium')
  eq(getImportImpactIntensity(IMPORT_IMPACT_AMBER_AT - 1), 'low',    'changed === amber-1 → low')
  eq(getImportImpactIntensity(IMPORT_IMPACT_RED_AT),       'high',   'changed === red threshold → high')
  eq(getImportImpactIntensity(IMPORT_IMPACT_RED_AT - 1),   'medium', 'changed === red-1 → medium')
}

// getImportImpactStyle — CSS bundle shape + per-tier distinctness.
{
  const low    = getImportImpactStyle('low')
  const medium = getImportImpactStyle('medium')
  const high   = getImportImpactStyle('high')

  // Each bundle has the same required fields.
  for (const [name, b] of [['low', low], ['medium', medium], ['high', high]]) {
    ok(typeof b.bg     === 'string' && b.bg.length > 0,     `${name}.bg is non-empty string`)
    ok(typeof b.border === 'string' && b.border.length > 0, `${name}.border is non-empty string`)
    ok(typeof b.color  === 'string' && b.color.length > 0,  `${name}.color is non-empty string`)
    ok(typeof b.accent === 'string' && b.accent.length > 0, `${name}.accent is non-empty string`)
    ok(typeof b.label  === 'string' && b.label.length > 0,  `${name}.label is non-empty string`)
  }

  // Each tier's accent must be visually distinct (no two tiers share a colour).
  ok(low.accent  !== medium.accent, 'low.accent !== medium.accent')
  ok(low.accent  !== high.accent,   'low.accent !== high.accent')
  ok(medium.accent !== high.accent, 'medium.accent !== high.accent')
  ok(low.color  !== medium.color,   'low.color !== medium.color')
  ok(low.color  !== high.color,     'low.color !== high.color')
  ok(medium.color !== high.color,   'medium.color !== high.color')

  // Defensive — unknown intensity falls back to 'low' style.
  eq(getImportImpactStyle('gibberish'), low, 'unknown intensity → low style')
  eq(getImportImpactStyle(undefined),   low, 'undefined intensity → low style')
  eq(getImportImpactStyle(null),        low, 'null intensity → low style')
  eq(getImportImpactStyle(42),          low, 'number intensity → low style')
  eq(getImportImpactStyle(''),          low, 'empty string → low style')
}

// Integration — pipeline from summarizeImportTotalFieldImpact through
// getImportImpactIntensity to getImportImpactStyle. Simulates what the
// UI does each render.
{
  const lo = []   // 0 changed
  for (let i = 0; i < 3; i++) lo.push(r(`a${i}`, 'add', [{ field: 'f', action: 'unchanged' }]))
  const md = []   // ~12 changed
  for (let i = 0; i < 6; i++) md.push(r(`b${i}`, 'add', [{ field: 'f1', action: 'add' }, { field: 'f2', action: 'change' }]))
  const hi = []   // ~30 changed
  for (let i = 0; i < 10; i++) hi.push(r(`c${i}`, 'add', [{ field: 'f1', action: 'add' }, { field: 'f2', action: 'change' }, { field: 'f3', action: 'change' }]))

  const loTot = summarizeImportTotalFieldImpact(lo, 'merge')
  const mdTot = summarizeImportTotalFieldImpact(md, 'merge')
  const hiTot = summarizeImportTotalFieldImpact(hi, 'merge')

  eq(getImportImpactIntensity(loTot.changed), 'low',    'integration: 0 changed → low')
  eq(getImportImpactIntensity(mdTot.changed), 'medium', `integration: ${mdTot.changed} changed → medium`)
  eq(getImportImpactIntensity(hiTot.changed), 'high',   `integration: ${hiTot.changed} changed → high`)

  // And each maps to a unique style bundle.
  const loStyle = getImportImpactStyle(getImportImpactIntensity(loTot.changed))
  const mdStyle = getImportImpactStyle(getImportImpactIntensity(mdTot.changed))
  const hiStyle = getImportImpactStyle(getImportImpactIntensity(hiTot.changed))
  ok(loStyle.accent !== mdStyle.accent, 'integration: low accent !== medium accent')
  ok(mdStyle.accent !== hiStyle.accent, 'integration: medium accent !== high accent')
  ok(loStyle.label  !== hiStyle.label,  'integration: low label !== high label')
}

console.log('PASS: getImportImpactIntensity + getImportImpactStyle — three-tier preview-header intensity (R28.41, ~50 asserts)')

// =====================================================================
// R29.41 — rolling import-scope history ring + display projector
// =====================================================================

// pushImportScopeHistory — basic accumulation, newest-first.
{
  let h = []
  h = pushImportScopeHistory(h, 5, 12)
  eq(h.length, 1, 'first push -> 1 entry')
  eq(h[0].changed, 5, 'head changed recorded')
  eq(h[0].total, 12, 'head total recorded')
  eq(h[0].intensity, 'low', 'head intensity derived (5 < 10 -> low)')
  h = pushImportScopeHistory(h, 14, 20)
  eq(h.length, 2, 'distinct push -> 2 entries')
  eq(h[0].changed, 14, 'newest is at front')
  eq(h[1].changed, 5, 'older slides back')
  eq(h[0].intensity, 'medium', '14 -> medium tier')
  h = pushImportScopeHistory(h, 30, 40)
  eq(h[0].intensity, 'high', '30 -> high tier')
  eq(h.length, 3, 'three distinct -> 3 entries')
}

// pushImportScopeHistory — cap at IMPORT_SCOPE_HISTORY_MAX (FIFO drop).
{
  let h = []
  for (const c of [3, 11, 22, 7]) h = pushImportScopeHistory(h, c, c + 5)
  eq(h.length, IMPORT_SCOPE_HISTORY_MAX, 'history capped at MAX')
  eq(h[0].changed, 7, 'newest retained at head')
  eq(h[2].changed, 11, 'oldest-kept is the (MAX-1)th newest; first push dropped')
  // The very first (changed=3) push must have been FIFO-dropped.
  ok(!h.some(e => e.changed === 3), 'oldest entry FIFO-dropped past cap')
}

// pushImportScopeHistory — consecutive-dedupe on identical changed.
{
  let h = pushImportScopeHistory([], 8, 10)
  // Same changed, same total, same intensity -> ref-equal-on-no-op.
  const same = pushImportScopeHistory(h, 8, 10)
  ok(same === h, 'identical re-push returns input ref (no-op)')
  // Same changed, DIFFERENT total (mode flip) -> head updated in place,
  // length unchanged (no stacking).
  const moved = pushImportScopeHistory(h, 8, 14)
  eq(moved.length, 1, 'same-changed different-total updates head in place (no stack)')
  eq(moved[0].total, 14, 'head total updated')
  ok(moved !== h, 'updated head returns NEW array (immutable)')
}

// pushImportScopeHistory — defensive contract.
{
  const base = pushImportScopeHistory([], 5, 10)
  // Non-finite / negative changed -> input ref unchanged.
  ok(pushImportScopeHistory(base, NaN, 10) === base, 'NaN changed -> input ref')
  ok(pushImportScopeHistory(base, Infinity, 10) === base, 'Infinity changed -> input ref')
  ok(pushImportScopeHistory(base, -3, 10) === base, 'negative changed -> input ref')
  // Non-array prev treated as empty.
  const fromNull = pushImportScopeHistory(null, 6, 9)
  eq(fromNull.length, 1, 'non-array prev treated as empty history')
  eq(fromNull[0].changed, 6, 'records onto empty')
  // Non-finite total coerced to changed (denominator >= changed).
  const badTotal = pushImportScopeHistory([], 7, NaN)
  eq(badTotal[0].total, 7, 'non-finite total coerced to changed')
  // total < changed is suspicious -> coerced up to changed.
  const lowTotal = pushImportScopeHistory([], 9, 4)
  eq(lowTotal[0].total, 9, 'total < changed coerced to changed')
  // Purity: input array not mutated.
  const orig = pushImportScopeHistory([], 2, 5)
  const snapshot = JSON.stringify(orig)
  pushImportScopeHistory(orig, 19, 25)
  eq(JSON.stringify(orig), snapshot, 'push does not mutate input array')
}

// describeImportScopeHistory — display rows with tier label + accent +
// ordinal.
{
  let h = []
  h = pushImportScopeHistory(h, 4, 8)    // low
  h = pushImportScopeHistory(h, 15, 22)  // medium
  h = pushImportScopeHistory(h, 25, 30)  // high
  const rows = describeImportScopeHistory(h)
  eq(rows.length, 3, 'describe returns one row per entry')
  eq(rows[0].ordinal, 'current', 'newest row labelled current')
  eq(rows[1].ordinal, '1 ago', 'second row labelled 1 ago')
  eq(rows[2].ordinal, '2 ago', 'third row labelled 2 ago')
  // Each row carries the matching tier label + accent from the style bundle.
  eq(rows[0].intensity, 'high', 'newest is high (25)')
  eq(rows[0].label, getImportImpactStyle('high').label, 'high label matches style bundle')
  eq(rows[0].accent, getImportImpactStyle('high').accent, 'high accent matches style bundle')
  eq(rows[2].intensity, 'low', 'oldest is low (4)')
  // total carried through.
  eq(rows[1].total, 22, 'total preserved in describe row')
}

// describeImportScopeHistory — defensive: non-array -> [], corrupt rows
// silently skipped without blanking the whole list.
{
  deepEq(describeImportScopeHistory(null), [], 'null -> []')
  deepEq(describeImportScopeHistory('nope'), [], 'string -> []')
  deepEq(describeImportScopeHistory({}), [], 'object -> []')
  // Mixed valid + corrupt: only valid rows survive; ordinals re-rank
  // across the SURVIVING rows in order.
  const mixed = [
    { changed: 12, total: 18, intensity: 'medium' },
    null,
    { changed: 'bad', total: 5 },
    { changed: 3, total: 6, intensity: 'low' },
  ]
  const rows = describeImportScopeHistory(mixed)
  eq(rows.length, 2, 'corrupt rows skipped, valid survive')
  eq(rows[0].changed, 12, 'first valid row kept')
  eq(rows[0].ordinal, 'current', 'first valid -> current')
  eq(rows[1].changed, 3, 'second valid row kept')
  eq(rows[1].ordinal, '1 ago', 'second valid -> 1 ago (re-ranked across survivors)')
  // Missing/invalid intensity recomputed from changed.
  const recompute = describeImportScopeHistory([{ changed: 25, total: 30 }])
  eq(recompute[0].intensity, 'high', 'missing intensity recomputed from changed (25 -> high)')
}

console.log('PASS: pushImportScopeHistory + describeImportScopeHistory — preview-header scope history (R29.41, ~45 asserts)')

// R30.41 — persist the scope-history ring to localStorage.
{
  function makeFakeStorage() {
    const m = new Map()
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => { m.set(k, String(v)) },
      removeItem: (k) => { m.delete(k) },
      _raw: m,
    }
  }

  // sanitizeImportScopeHistory — happy path keeps canonical rows.
  const clean = [
    { changed: 6, total: 30, intensity: 'low' },
    { changed: 14, total: 30, intensity: 'medium' },
    { changed: 25, total: 30, intensity: 'high' },
  ]
  deepEq(sanitizeImportScopeHistory(clean), clean, 'sanitize keeps canonical rows verbatim')

  // Non-array / corrupt inputs → [].
  deepEq(sanitizeImportScopeHistory(null), [], 'sanitize null -> []')
  deepEq(sanitizeImportScopeHistory('nope'), [], 'sanitize string -> []')
  deepEq(sanitizeImportScopeHistory({}), [], 'sanitize object -> []')

  // Corrupt rows dropped; total coerced; intensity recomputed.
  const dirty = [
    { changed: 12, total: 4 },          // total < changed -> coerced to 12
    null,                                // dropped
    { changed: 'bad', total: 5 },        // non-finite changed -> dropped
    { changed: 30, total: 40 },          // intensity recomputed -> high
  ]
  const cleaned = sanitizeImportScopeHistory(dirty)
  eq(cleaned.length, 2, 'sanitize drops corrupt rows (2 survive)')
  eq(cleaned[0].changed, 12, 'first valid changed kept')
  eq(cleaned[0].total, 12, 'total < changed coerced up to changed')
  eq(cleaned[0].intensity, 'medium', 'intensity recomputed (12 -> medium)')
  eq(cleaned[1].intensity, 'high', 'intensity recomputed (30 -> high)')

  // Cap enforced at MAX (newest-first; tail dropped).
  const over = []
  for (let i = 0; i < IMPORT_SCOPE_HISTORY_MAX + 4; i++) over.push({ changed: i, total: i + 1 })
  eq(sanitizeImportScopeHistory(over).length, IMPORT_SCOPE_HISTORY_MAX, 'sanitize caps at IMPORT_SCOPE_HISTORY_MAX')

  // Purity — input not mutated.
  const beforeJson = JSON.stringify(dirty)
  sanitizeImportScopeHistory(dirty)
  eq(JSON.stringify(dirty), beforeJson, 'sanitize does not mutate input')

  // load on empty/missing storage → [].
  deepEq(loadImportScopeHistory(makeFakeStorage()), [], 'load on empty storage -> []')
  deepEq(loadImportScopeHistory(null), [], 'load with no storage -> []')

  // Round-trip: save then load reproduces the sanitized ring.
  const s = makeFakeStorage()
  ok(saveImportScopeHistory(clean, s), 'save returns true')
  deepEq(loadImportScopeHistory(s), clean, 'save -> load round-trips the ring')
  // Stored under the documented key + v:1 envelope.
  const stored = JSON.parse(s.getItem(IMPORT_SCOPE_HISTORY_KEY))
  eq(stored.v, 1, 'stored envelope is v:1')
  ok(Array.isArray(stored.items), 'stored envelope has items array')

  // Empty list REMOVES the key (no shell left behind).
  s.setItem(IMPORT_SCOPE_HISTORY_KEY, JSON.stringify({ v: 1, items: clean }))
  ok(saveImportScopeHistory([], s), 'save empty returns true')
  eq(s.getItem(IMPORT_SCOPE_HISTORY_KEY), null, 'empty save removes the key')

  // Corrupt persisted JSON / wrong version / non-array items → [].
  const c1 = makeFakeStorage(); c1.setItem(IMPORT_SCOPE_HISTORY_KEY, '{not-json')
  deepEq(loadImportScopeHistory(c1), [], 'load corrupt JSON -> []')
  const c2 = makeFakeStorage(); c2.setItem(IMPORT_SCOPE_HISTORY_KEY, JSON.stringify({ v: 2, items: clean }))
  deepEq(loadImportScopeHistory(c2), [], 'load wrong version -> []')
  const c3 = makeFakeStorage(); c3.setItem(IMPORT_SCOPE_HISTORY_KEY, JSON.stringify({ v: 1, items: 'x' }))
  deepEq(loadImportScopeHistory(c3), [], 'load non-array items -> []')

  // Save no-op when storage unavailable.
  eq(saveImportScopeHistory(clean, null), false, 'save with no storage -> false')

  // Integration: push then persist then reload survives a "remount".
  const sess = makeFakeStorage()
  let ring = loadImportScopeHistory(sess)             // fresh: []
  ring = pushImportScopeHistory(ring, 6, 30)          // low
  saveImportScopeHistory(ring, sess)
  ring = pushImportScopeHistory(ring, 25, 30)         // high
  saveImportScopeHistory(ring, sess)
  const reloaded = loadImportScopeHistory(sess)        // simulate reload
  eq(reloaded.length, 2, 'reload after two pushes keeps both scopes')
  eq(reloaded[0].changed, 25, 'reload preserves newest-first order (head = 25)')
  eq(reloaded[0].intensity, 'high', 'reload preserves tier of newest')
  eq(reloaded[1].changed, 6, 'reload preserves older scope (6)')
}

console.log('PASS: persist scope-history ring — sanitize/load/save round-trip (R30.41, ~30 asserts)')

console.log(`PASS: biasOverridesIO — envelope build/parse, merge/replace, summarize, defensive, multi-file combine, R24.36 preview rows, R25.41 per-field diff, R26.41 summary counts, R27.41 total-impact projector, R28.41 three-tier intensity (${SCENE_BIASES.length} chip ids, ${SCENE_BIAS_RANGE_FIELDS.length} ranges + ${SCENE_BIAS_CHANCE_FIELDS.length} chances per chip)`)
