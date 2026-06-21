// crossfadeOverridesIO: round-trip the crossfade chip overrides through
// the JSON envelope. Tests sanitize behaviour, merge vs replace,
// dry-run summary, bad-input handling, and the bare-items shorthand.
import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
  buildExportPayload, serializeCrossfadeOverrides, makeFilename,
  parseImport, mergeImport, summarizeImportImpact,
  exportableCrossfadeIds, downloadCrossfadeOverridesFile,
} from './crossfadeOverridesIO.js'
import {
  DURATION_CHIPS_DEFAULT,
  BLEND_MIN_SEC, BLEND_MAX_SEC,
} from './crossfade.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }

const SAMPLE = {
  snap:      0.25,
  cinematic: 3.5,
}

// --- buildExportPayload + serializeCrossfadeOverrides ---
{
  const payload = buildExportPayload(SAMPLE, '2026-06-21T12:00:00.000Z')
  eq(payload.kind, EXPORT_KIND, 'kind tag')
  eq(payload.v, EXPORT_VERSION, 'version stamped')
  eq(payload.exportedAt, '2026-06-21T12:00:00.000Z', 'timestamp preserved')
  // sanitizeCrossfadeOverrides was applied.
  near(payload.items.snap, 0.25, 'snap value preserved')
  near(payload.items.cinematic, 3.5, 'cinematic value preserved')

  const json = serializeCrossfadeOverrides(SAMPLE)
  ok(typeof json === 'string' && json.startsWith('{'), 'serialized to JSON')
  // Round-trip via parse.
  const parsed = parseImport(json)
  ok(parsed.ok, `serialize→parse ok (got ${parsed.error})`)
  near(parsed.items.snap, 0.25, 'snap survives roundtrip')
  near(parsed.items.cinematic, 3.5, 'cinematic survives roundtrip')
}

// --- buildExportPayload sanitizes corrupt + over-range inputs ---
{
  const dirty = {
    snap: 9999,           // over-range → clamps to BLEND_MAX_SEC
    fast: -100,           // under-range → clamps to BLEND_MIN_SEC
    drift: 'not-a-number',// invalid type → dropped
    bogus: 5,             // unknown id → dropped
  }
  const payload = buildExportPayload(dirty)
  near(payload.items.snap, BLEND_MAX_SEC, 'over-range clamped to MAX')
  near(payload.items.fast, BLEND_MIN_SEC, 'under-range clamped to MIN')
  eq(payload.items.drift, undefined, 'invalid type dropped')
  eq(payload.items.bogus, undefined, 'unknown id dropped')
}

// --- makeFilename uses YYYY-MM-DD slice ---
eq(makeFilename('2026-01-15T08:30:00.000Z'), 'particle-crossfade-2026-01-15.json', 'filename slice')

// --- parseImport: full envelope happy path ---
{
  const envelope = {
    kind: EXPORT_KIND, v: 1, exportedAt: '2026-06-21',
    items: { drift: 8 },
  }
  const r = parseImport(JSON.stringify(envelope))
  ok(r.ok, 'envelope parsed')
  eq(Object.keys(r.items).length, 1, 'one item parsed')
  near(r.items.drift, 8, 'drift value preserved')
}

// --- parseImport: bare-items shorthand ---
{
  const bare = { fast: 1.5 }
  const r = parseImport(JSON.stringify(bare))
  ok(r.ok, `bare items accepted (got ${r.error})`)
  eq(Object.keys(r.items).length, 1, 'one item from bare')
  near(r.items.fast, 1.5, 'fast value preserved')
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
  eq(parseImport(JSON.stringify({ items: { bogus: 1 } })).ok, false, 'all-invalid items rejected')
  // File too large.
  const huge = 'x'.repeat(MAX_IMPORT_BYTES + 1)
  eq(parseImport(huge).ok, false, 'oversize rejected')
}

// --- parseImport: envelope without v defaults gracefully ---
{
  const noVersion = { kind: EXPORT_KIND, items: { snap: 0.5 } }
  const r = parseImport(JSON.stringify(noVersion))
  ok(r.ok, 'envelope without v field accepted (defaults v=1)')
}

// --- mergeImport: merge mode preserves existing slots ---
{
  const existing = { snap: 0.3 }
  const incoming = { fast: 1.5, drift: 12 }
  const r = mergeImport(existing, incoming, 'merge')
  eq(r.added, 2, 'two added')
  eq(r.skipped, 0, 'nothing skipped (no collisions)')
  eq(r.replaced, 0, 'merge never replaces wholesale')
  eq(Object.keys(r.items).length, 3, 'final has 3 slots')
  near(r.items.snap, 0.3, 'existing preserved')
  near(r.items.fast, 1.5, 'new added')
}

// --- mergeImport: merge mode skips existing on collision ---
{
  const existing = { snap: 0.3 }
  const incoming = { snap: 0.9, fast: 1.5 }
  const r = mergeImport(existing, incoming, 'merge')
  eq(r.added, 1, 'one added (fast)')
  eq(r.skipped, 1, 'snap skipped on collision')
  near(r.items.snap, 0.3, 'existing snap kept')
}

// --- mergeImport: replace mode wipes existing ---
{
  const existing = { snap: 0.3 }
  const incoming = { drift: 12 }
  const r = mergeImport(existing, incoming, 'replace')
  eq(r.added, 1, 'one added in replace')
  eq(r.items.snap, undefined, 'replace dropped existing snap')
  near(r.items.drift, 12, 'replace kept incoming drift')
}

// --- mergeImport: defensive handling of null/garbage ---
{
  const r = mergeImport(null, null, 'merge')
  ok(r && typeof r.items === 'object', 'null inputs yield safe shape')
  eq(r.added, 0, 'nothing added for null')
}

// --- summarizeImportImpact ---
{
  const existing = { snap: 0.3, fast: 1.8 }
  const incoming = { snap: 0.5, drift: 12, cinematic: 4 }
  const m = summarizeImportImpact(existing, incoming, 'merge')
  eq(m.mode, 'merge', 'mode echoed')
  eq(m.totalImport, 3, 'three imports counted')
  eq(m.willAdd, 2, 'drift + cinematic new')
  eq(m.willSkip, 1, 'snap collides → skipped')
  eq(m.willOverwrite, 0, 'merge never overwrites')
  eq(m.conflicts.length, 1, 'one conflict id')
  eq(m.conflicts[0], 'snap', 'snap is the conflict')
  eq(m.resultIds.length, 4, 'final has 4 ids (snap, fast, drift, cinematic)')

  const r = summarizeImportImpact(existing, incoming, 'replace')
  eq(r.mode, 'replace', 'mode echoed')
  eq(r.willAdd, 3, 'all 3 added in replace')
  eq(r.willOverwrite, 2, 'replace flags 2 dropped (snap, fast)')
  eq(r.willSkip, 0, 'replace never skips')
  eq(r.resultIds.length, 3, 'replace ends up with 3')
}

// --- exportableCrossfadeIds matches the default chip list ---
{
  const ids = exportableCrossfadeIds()
  eq(ids.length, DURATION_CHIPS_DEFAULT.length, 'one id per default chip')
  for (const c of DURATION_CHIPS_DEFAULT) {
    if (!ids.includes(c.id)) fail(`missing exportable id ${c.id}`)
  }
}

// --- downloadCrossfadeOverridesFile returns null when no document ---
// In node test env, document isn't defined, so this should return
// null without crashing — proves the SSR guard fires.
{
  const r = downloadCrossfadeOverridesFile(SAMPLE)
  eq(r, null, 'download returns null in non-browser env')
}

console.log(`PASS: crossfadeOverridesIO — envelope build/parse, merge/replace, summarize, defensive — ${DURATION_CHIPS_DEFAULT.length} chip ids`)
