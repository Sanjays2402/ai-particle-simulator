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

console.log(`PASS: biasOverridesIO — envelope build/parse, merge/replace, summarize, defensive, multi-file combine, R24.36 preview rows, R25.41 per-field diff, R26.41 summary counts, R27.41 total-impact projector (${SCENE_BIASES.length} chip ids, ${SCENE_BIAS_RANGE_FIELDS.length} ranges + ${SCENE_BIAS_CHANCE_FIELDS.length} chances per chip)`)
