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

console.log(`PASS: biasOverridesIO — envelope build/parse, merge/replace, summarize, defensive, multi-file combine, R24.36 preview rows (${SCENE_BIASES.length} chip ids, ${SCENE_BIAS_RANGE_FIELDS.length} ranges + ${SCENE_BIAS_CHANCE_FIELDS.length} chances per chip)`)
