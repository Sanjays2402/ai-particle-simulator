// windOverridesIO: round-trip the wind preset overrides through the
// JSON envelope. Tests sanitize behaviour, merge vs replace, dry-run
// summary, bad-input handling, and the bare-items shorthand.
import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
  buildExportPayload, serializeWindOverrides, makeFilename,
  parseImport, mergeImport, summarizeImportImpact,
  exportableWindIds,
} from './windOverridesIO.js'
import {
  WIND_PRESETS_DEFAULT,
  WIND_INTENSITY_MAX, WIND_PITCH_MAX,
} from './wind.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }

const SAMPLE = {
  storm:  { intensity: 4.8, azimuth: 220, pitch: -30 },
  breeze: { intensity: 0.4, azimuth: 90,  pitch: 5 },
}

// --- buildExportPayload + serializeWindOverrides ---
{
  const payload = buildExportPayload(SAMPLE, '2026-06-21T12:00:00.000Z')
  eq(payload.kind, EXPORT_KIND, 'kind tag')
  eq(payload.v, EXPORT_VERSION, 'version stamped')
  eq(payload.exportedAt, '2026-06-21T12:00:00.000Z', 'timestamp preserved')
  // sanitizeWindOverrides was applied (storm.intensity=4.8 stays in
  // range; we just verify it landed).
  near(payload.items.storm.intensity, 4.8, 'storm intensity')
  near(payload.items.breeze.azimuth, 90, 'breeze azimuth')

  const json = serializeWindOverrides(SAMPLE)
  ok(typeof json === 'string' && json.startsWith('{'), 'serialized to JSON')
  // Round-trip via parse.
  const parsed = parseImport(json)
  ok(parsed.ok, `serialize→parse ok (got ${parsed.error})`)
  eq(parsed.items.storm.intensity, 4.8, 'storm intensity survives roundtrip')
}

// --- buildExportPayload sanitizes corrupt + over-range inputs ---
{
  const dirty = {
    storm: { intensity: 99,    azimuth: 999, pitch: 9999 },  // all clamp
    bogus: { intensity: 1 },                                  // unknown id dropped
    gale:  null,                                              // not an object dropped
  }
  const payload = buildExportPayload(dirty)
  near(payload.items.storm.intensity, WIND_INTENSITY_MAX, 'over-range intensity clamped')
  near(payload.items.storm.pitch,     WIND_PITCH_MAX,     'over-range pitch clamped')
  eq(payload.items.bogus, undefined, 'unknown id dropped')
  eq(payload.items.gale,  undefined, 'null entry dropped')
}

// --- makeFilename uses YYYY-MM-DD slice ---
eq(makeFilename('2026-01-15T08:30:00.000Z'), 'particle-wind-2026-01-15.json', 'filename slice')

// --- parseImport: full envelope happy path ---
{
  const envelope = {
    kind: EXPORT_KIND, v: 1, exportedAt: '2026-06-21',
    items: { calm: { intensity: 0, azimuth: 0, pitch: 0 } },
  }
  const r = parseImport(JSON.stringify(envelope))
  ok(r.ok, 'envelope parsed')
  eq(Object.keys(r.items).length, 1, 'one item parsed')
  eq(r.items.calm.intensity, 0, 'calm value preserved')
}

// --- parseImport: bare-items shorthand ---
{
  const bare = { storm: { intensity: 4, azimuth: 200, pitch: -20 } }
  const r = parseImport(JSON.stringify(bare))
  ok(r.ok, `bare items accepted (got ${r.error})`)
  eq(Object.keys(r.items).length, 1, 'one item from bare')
  near(r.items.storm.intensity, 4, 'storm value preserved')
}

// --- parseImport: rejection cases ---
{
  eq(parseImport(null).ok, false, 'null rejected')
  eq(parseImport(123).ok,  false, 'number rejected')
  eq(parseImport('not-json').ok, false, 'non-JSON rejected')
  eq(parseImport('null').ok, false, 'null literal rejected')
  eq(parseImport('"a string"').ok, false, 'top-level string rejected')
  eq(parseImport('[]').ok, false, 'top-level array rejected (not an items object)')
  eq(parseImport(JSON.stringify({ kind: 'something/else', items: {} })).ok, false, 'wrong kind rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 99, items: {} })).ok, false, 'future version rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1 })).ok, false, 'missing items rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, items: 'foo' })).ok, false, 'bad items type rejected')
  // Sanitizes away → no valid items → rejected.
  eq(parseImport(JSON.stringify({ items: { bogus: { intensity: 1 } } })).ok, false, 'all-invalid items rejected')
  // File too large.
  const huge = 'x'.repeat(MAX_IMPORT_BYTES + 1)
  eq(parseImport(huge).ok, false, 'oversize rejected')
}

// --- mergeImport: merge mode preserves existing slots ---
{
  const existing = { calm: { intensity: 0, azimuth: 0, pitch: 0 } }
  const incoming = { storm: SAMPLE.storm, breeze: SAMPLE.breeze }
  const r = mergeImport(existing, incoming, 'merge')
  eq(r.added, 2, 'two added')
  eq(r.skipped, 0, 'nothing skipped (no collisions)')
  eq(r.replaced, 0, 'merge never replaces wholesale')
  eq(Object.keys(r.items).length, 3, 'final has 3 slots')
  eq(r.items.calm.azimuth, 0, 'existing preserved')
  eq(r.items.storm.azimuth, 220, 'new added')
}

// --- mergeImport: merge mode skips existing on collision ---
{
  const existing = { storm: { intensity: 1, azimuth: 0, pitch: 0 } }
  const incoming = { storm: SAMPLE.storm, breeze: SAMPLE.breeze }
  const r = mergeImport(existing, incoming, 'merge')
  eq(r.added, 1, 'one added (breeze)')
  eq(r.skipped, 1, 'storm skipped on collision')
  eq(r.items.storm.intensity, 1, 'existing storm kept')
}

// --- mergeImport: replace mode wipes existing ---
{
  const existing = { calm: { intensity: 0, azimuth: 0, pitch: 0 } }
  const incoming = { storm: SAMPLE.storm }
  const r = mergeImport(existing, incoming, 'replace')
  eq(r.added, 1, 'one added in replace')
  eq(r.items.calm, undefined, 'replace dropped existing calm')
  eq(r.items.storm.azimuth, 220, 'replace kept incoming storm')
}

// --- mergeImport: defensive handling of null/garbage ---
{
  const r = mergeImport(null, null, 'merge')
  ok(r && typeof r.items === 'object', 'null inputs yield safe shape')
  eq(r.added, 0, 'nothing added for null')
}

// --- summarizeImportImpact ---
{
  const existing = { storm: SAMPLE.storm }
  const incoming = { storm: SAMPLE.storm, breeze: SAMPLE.breeze, calm: { intensity: 0, azimuth: 0, pitch: 0 } }
  const m = summarizeImportImpact(existing, incoming, 'merge')
  eq(m.mode, 'merge', 'mode echoed')
  eq(m.totalImport, 3, 'three imports counted')
  eq(m.willAdd, 2, 'breeze + calm new')
  eq(m.willSkip, 1, 'storm collides → skipped')
  eq(m.willOverwrite, 0, 'merge never overwrites')
  eq(m.conflicts.length, 1, 'one conflict id')
  eq(m.conflicts[0], 'storm', 'storm is the conflict')
  eq(m.resultIds.length, 3, 'final has 3 ids')

  const r = summarizeImportImpact(existing, incoming, 'replace')
  eq(r.mode, 'replace', 'mode echoed')
  eq(r.willAdd, 3, 'all 3 added in replace')
  eq(r.willOverwrite, 1, 'replace flags 1 dropped (storm)')
  eq(r.willSkip, 0, 'replace never skips')
  eq(r.resultIds.length, 3, 'replace ends up with 3')
}

// --- exportableWindIds matches the default preset list ---
{
  const ids = exportableWindIds()
  eq(ids.length, WIND_PRESETS_DEFAULT.length, 'one id per default preset')
  for (const p of WIND_PRESETS_DEFAULT) {
    if (!ids.includes(p.id)) fail(`missing exportable id ${p.id}`)
  }
}

console.log(`PASS: windOverridesIO — envelope build/parse, merge/replace, summarize, defensive — ${WIND_PRESETS_DEFAULT.length} slot ids`)
