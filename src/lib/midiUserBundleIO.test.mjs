// midiUserBundleIO: round-trip a single user-authored MIDI controller
// bundle through the JSON envelope. Tests cover envelope build/parse,
// bare-bundle shorthand, sanitize behaviour, rejection cases, filename
// slug, cap helper, defensive handling.
import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES, MAX_USER_PRESETS,
  buildExportPayload, serializeUserBundle, makeFilename,
  parseImport, isAtBundleCap,
  // R15.14 — multi-bundle IO
  EXPORT_KIND_MULTI, MAX_IMPORT_BYTES_MULTI,
  buildExportPayloadMulti, serializeUserBundlesMulti, makeFilenameMulti,
  parseImportMulti, summarizeImportImpactMulti,
  // R19.20 — multi-file drop combiner
  combineDroppedBundles,
} from './midiUserBundleIO.js'
import { ACTIONS } from './midiMap.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

// A first valid action id to use in test bundles — guards against
// changes to the ACTIONS roster (test will scream if it's empty).
const SOME_ACTION = ACTIONS[0].id
const OTHER_ACTION = ACTIONS[1] ? ACTIONS[1].id : ACTIONS[0].id

const SAMPLE = {
  id: 'user-7',          // intentionally ignored by the IO module
  vendor: 'Custom',      // also stripped on the way through
  createdAt: 1234567890, // also stripped
  name: 'Stage Rig',
  description: '12 bindings saved 2026-06-21',
  map: { '1': SOME_ACTION, '2': OTHER_ACTION, '64': SOME_ACTION },
}

// --- buildExportPayload happy path ---
{
  const payload = buildExportPayload(SAMPLE, '2026-06-21T12:00:00.000Z')
  ok(payload, 'envelope built')
  eq(payload.kind, EXPORT_KIND, 'kind tag')
  eq(payload.v, EXPORT_VERSION, 'version stamped')
  eq(payload.exportedAt, '2026-06-21T12:00:00.000Z', 'timestamp preserved')
  // Bundle is stripped down to {name, description, map} — id and
  // createdAt are NOT carried because every machine remints id.
  eq(payload.bundle.name, 'Stage Rig', 'name carried')
  eq(payload.bundle.description, '12 bindings saved 2026-06-21', 'description carried')
  eq(payload.bundle.id, undefined, 'id NOT carried')
  eq(payload.bundle.createdAt, undefined, 'createdAt NOT carried')
  eq(payload.bundle.vendor, undefined, 'vendor NOT carried (importer brands it Custom)')
  eq(Object.keys(payload.bundle.map).length, 3, 'all 3 bindings carried')
  eq(payload.bundle.map['1'], SOME_ACTION, 'binding survives')
}

// --- buildExportPayload sanitizes corrupt + over-range inputs ---
{
  const dirty = {
    name: '  ',  // trimmed → empty → null bundle
    map: { '1': SOME_ACTION },
  }
  eq(buildExportPayload(dirty), null, 'blank name → null')
}
{
  const dirty = {
    name: 'OK',
    map: {
      '999':  SOME_ACTION,     // out-of-range CC dropped
      '-5':   SOME_ACTION,     // negative CC dropped
      'foo':  SOME_ACTION,     // non-numeric CC dropped
      '1':    'no-such-action',// unknown action dropped
      '2':    SOME_ACTION,     // the only survivor
    },
  }
  const payload = buildExportPayload(dirty)
  ok(payload, 'partial-valid bundle accepted')
  eq(Object.keys(payload.bundle.map).length, 1, 'only the valid binding survives')
  eq(payload.bundle.map['2'], SOME_ACTION, 'valid binding is the survivor')
}
{
  // All bindings invalid → bundle has no map → null.
  const dirty = { name: 'OK', map: { '999': 'no-such-action' } }
  eq(buildExportPayload(dirty), null, 'all-invalid bindings → null bundle')
}
{
  // Long name truncated to 32 chars; long description truncated to 80.
  const longBundle = {
    name: 'x'.repeat(100),
    description: 'y'.repeat(200),
    map: { '1': SOME_ACTION },
  }
  const payload = buildExportPayload(longBundle)
  eq(payload.bundle.name.length, 32, 'name truncated to 32')
  eq(payload.bundle.description.length, 80, 'description truncated to 80')
}

// --- serializeUserBundle ---
{
  const json = serializeUserBundle(SAMPLE)
  ok(typeof json === 'string' && json.startsWith('{'), 'serialized to JSON')
  // Round-trip via parse.
  const parsed = parseImport(json)
  ok(parsed.ok, `serialize→parse ok (got ${parsed.error})`)
  eq(parsed.bundle.name, 'Stage Rig', 'name survives roundtrip')
  eq(parsed.bundle.map['64'], SOME_ACTION, 'binding survives roundtrip')
}
{
  // serialize returns null when there's nothing to serialize.
  eq(serializeUserBundle({ name: ' ', map: {} }), null, 'unserializable returns null')
  eq(serializeUserBundle(null), null, 'null bundle → null')
}

// --- makeFilename slugifies the name + dates the file ---
{
  eq(makeFilename({ name: 'Stage Rig' }, '2026-06-21T08:30:00.000Z'),
     'particle-midi-bundle-stage-rig-2026-06-21.json', 'slug + date')
  eq(makeFilename({ name: 'Vortex MK-II :)' }, '2026-06-21T08:30:00.000Z'),
     'particle-midi-bundle-vortex-mk-ii-2026-06-21.json', 'punctuation flattened')
  eq(makeFilename({ name: '' }, '2026-06-21T08:30:00.000Z'),
     'particle-midi-bundle-bundle-2026-06-21.json', 'empty name → "bundle" fallback')
  eq(makeFilename(null, '2026-06-21T08:30:00.000Z'),
     'particle-midi-bundle-bundle-2026-06-21.json', 'null bundle → "bundle" fallback')
  // Multiple consecutive separators collapse to one.
  eq(makeFilename({ name: 'Big    Spaces   Here' }, '2026-06-21T08:30:00.000Z'),
     'particle-midi-bundle-big-spaces-here-2026-06-21.json', 'multi-space collapsed')
  // Leading / trailing hyphens stripped.
  eq(makeFilename({ name: '---wow---' }, '2026-06-21T08:30:00.000Z'),
     'particle-midi-bundle-wow-2026-06-21.json', 'leading/trailing hyphens stripped')
}

// --- parseImport: full envelope happy path ---
{
  const envelope = {
    kind: EXPORT_KIND, v: 1, exportedAt: '2026-06-21',
    bundle: { name: 'OK', description: 'd', map: { '1': SOME_ACTION } },
  }
  const r = parseImport(JSON.stringify(envelope))
  ok(r.ok, `envelope parsed (got ${r.error})`)
  eq(r.bundle.name, 'OK', 'name parsed')
  eq(r.bundle.map['1'], SOME_ACTION, 'binding parsed')
}

// --- parseImport: bare-bundle shorthand ---
{
  // A user hand-rolls a JSON file: {name, map} at top level, no wrapper.
  const bare = { name: 'Hand-rolled', map: { '1': SOME_ACTION } }
  const r = parseImport(JSON.stringify(bare))
  ok(r.ok, `bare bundle accepted (got ${r.error})`)
  eq(r.bundle.name, 'Hand-rolled', 'name parsed from bare')
}

// --- parseImport: rejection cases ---
{
  eq(parseImport(null).ok, false, 'null rejected')
  eq(parseImport(123).ok,  false, 'number rejected')
  eq(parseImport('not-json').ok, false, 'non-JSON rejected')
  eq(parseImport('null').ok, false, 'null literal rejected')
  eq(parseImport('"a string"').ok, false, 'top-level string rejected')
  eq(parseImport('[]').ok, false, 'top-level array rejected')
  eq(parseImport(JSON.stringify({ kind: 'something/else', bundle: {} })).ok, false, 'wrong kind rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 99, bundle: {} })).ok, false, 'future version rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1 })).ok, false, 'missing bundle rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, bundle: 'foo' })).ok, false, 'bad bundle type rejected')
  // Bundle present but has no valid bindings → rejected.
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, bundle: { name: 'OK', map: { '999': 'bad' } } })).ok, false, 'all-invalid bindings rejected')
  // Bundle present but has no name → rejected.
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, bundle: { name: '  ', map: { '1': SOME_ACTION } } })).ok, false, 'blank-name bundle rejected')
  // File too large.
  const huge = 'x'.repeat(MAX_IMPORT_BYTES + 1)
  eq(parseImport(huge).ok, false, 'oversize rejected')
}

// --- parseImport: id / createdAt / vendor in the envelope are stripped ---
{
  const envelope = {
    kind: EXPORT_KIND, v: 1,
    bundle: {
      id: 'user-99',          // stripped (importer mints fresh)
      vendor: 'NotCustom',    // stripped (UI brands all imports Custom)
      createdAt: 12345,       // stripped (importer timestamps)
      name: 'Imported',
      map: { '1': SOME_ACTION },
    },
  }
  const r = parseImport(JSON.stringify(envelope))
  ok(r.ok, 'envelope with extra fields parsed')
  eq(r.bundle.id, undefined, 'id stripped from parsed bundle')
  eq(r.bundle.createdAt, undefined, 'createdAt stripped from parsed bundle')
  eq(r.bundle.vendor, undefined, 'vendor stripped from parsed bundle')
  eq(r.bundle.name, 'Imported', 'name preserved')
}

// --- isAtBundleCap ---
{
  eq(isAtBundleCap([]),     false, 'empty list NOT at cap')
  eq(isAtBundleCap(null),   false, 'null list NOT at cap')
  eq(isAtBundleCap('x'),    false, 'non-array NOT at cap')
  // Build a list at exactly MAX_USER_PRESETS.
  const full = []
  for (let i = 0; i < MAX_USER_PRESETS; i++) full.push({ id: `user-${i}` })
  eq(isAtBundleCap(full),   true,  'list at MAX → at cap')
  full.push({ id: 'user-x' })
  eq(isAtBundleCap(full),   true,  'list past MAX → still at cap')
  full.pop(); full.pop()
  eq(isAtBundleCap(full),   false, 'list one below MAX NOT at cap')
}

// --- Round-trip with no description still works (defaults to "Custom bundle") ---
{
  const noDesc = { name: 'Bare', map: { '1': SOME_ACTION } }
  const payload = buildExportPayload(noDesc)
  eq(payload.bundle.description, 'Custom bundle', 'missing description → default')
  const r = parseImport(JSON.stringify(payload))
  ok(r.ok, 'no-desc round-trip ok')
  eq(r.bundle.description, 'Custom bundle', 'default description survives')
}

// --- R15.14 multi-bundle export / import ---
{
  const A = { name: 'Stage Rig',  map: { '1': SOME_ACTION } }
  const B = { name: 'Studio',     map: { '2': OTHER_ACTION, '64': SOME_ACTION } }
  const C = { name: 'Performance',map: { '70': SOME_ACTION } }
  const payload = buildExportPayloadMulti([A, B, C], '2026-06-21T12:00:00.000Z')
  ok(payload, 'multi envelope built')
  eq(payload.kind, EXPORT_KIND_MULTI, 'multi kind tag')
  eq(payload.v, EXPORT_VERSION, 'version stamped (shared)')
  eq(payload.exportedAt, '2026-06-21T12:00:00.000Z', 'timestamp preserved')
  eq(Array.isArray(payload.bundles), true, 'bundles is an array')
  eq(payload.bundles.length, 3, 'all 3 bundles carried')
  eq(payload.bundles[0].name, 'Stage Rig', 'order preserved')
  eq(payload.bundles[1].name, 'Studio',    'order preserved [1]')
  eq(payload.bundles[2].name, 'Performance','order preserved [2]')
}
{
  // buildExportPayloadMulti: defensive cases.
  eq(buildExportPayloadMulti(null),  null, 'null input → null')
  eq(buildExportPayloadMulti('foo'), null, 'non-array input → null')
  eq(buildExportPayloadMulti([]),    null, 'empty array → null (nothing to export)')
  // Mix of valid + unencodable — survivor only.
  const mixed = [
    { name: 'Good',  map: { '1': SOME_ACTION } },
    { name: '',      map: { '1': SOME_ACTION } },   // blank name → dropped
    { name: 'AlsoBad', map: { '999': 'no-such' } }, // unknown actions → dropped
  ]
  const payload = buildExportPayloadMulti(mixed)
  eq(payload.bundles.length, 1, 'only valid bundles kept')
  eq(payload.bundles[0].name, 'Good', 'survivor is the valid bundle')
}

// serialize round-trip via parseImportMulti.
{
  const A = { name: 'Alpha', map: { '1': SOME_ACTION } }
  const B = { name: 'Beta',  map: { '2': OTHER_ACTION } }
  const json = serializeUserBundlesMulti([A, B], '2026-06-21T00:00:00.000Z')
  ok(typeof json === 'string', 'multi serialize returns string')
  const r = parseImportMulti(json)
  ok(r.ok, `multi parse ok (got ${r.error})`)
  eq(r.bundles.length, 2, 'multi round-trip count')
  eq(r.bundles[0].name, 'Alpha', 'multi round-trip name [0]')
  eq(r.bundles[1].name, 'Beta',  'multi round-trip name [1]')
}
// serializeUserBundlesMulti null cases.
eq(serializeUserBundlesMulti(null), null, 'multi serialize null → null')
eq(serializeUserBundlesMulti([]),   null, 'multi serialize empty → null')

// makeFilenameMulti — count + date.
{
  eq(makeFilenameMulti([{name:'A'},{name:'B'},{name:'C'}], '2026-06-21T00:00:00.000Z'),
     'particle-midi-bundles-3-2026-06-21.json', 'multi filename includes count + date')
  eq(makeFilenameMulti([], '2026-06-21T00:00:00.000Z'),
     'particle-midi-bundles-0-2026-06-21.json', 'multi filename empty list → 0')
  eq(makeFilenameMulti(null, '2026-06-21T00:00:00.000Z'),
     'particle-midi-bundles-0-2026-06-21.json', 'multi filename null → 0')
}

// parseImportMulti: full envelope happy path.
{
  const envelope = {
    kind: EXPORT_KIND_MULTI, v: 1, exportedAt: '2026-06-21',
    bundles: [
      { name: 'A', map: { '1': SOME_ACTION } },
      { name: 'B', map: { '2': OTHER_ACTION } },
    ],
  }
  const r = parseImportMulti(JSON.stringify(envelope))
  ok(r.ok, `multi envelope parsed (got ${r.error})`)
  eq(r.bundles.length, 2, 'two bundles parsed')
}

// parseImportMulti: bare-array shorthand (top-level JSON array).
{
  const bare = [
    { name: 'X', map: { '1': SOME_ACTION } },
    { name: 'Y', map: { '2': OTHER_ACTION } },
  ]
  const r = parseImportMulti(JSON.stringify(bare))
  ok(r.ok, `bare array accepted (got ${r.error})`)
  eq(r.bundles.length, 2, 'bare array two bundles')
  eq(r.bundles[0].name, 'X', 'bare array order preserved')
}

// parseImportMulti: per-bundle sanitisation inside a multi-bundle file.
{
  // Bad inner bundles are dropped silently; good ones survive.
  const mixed = {
    kind: EXPORT_KIND_MULTI, v: 1,
    bundles: [
      { name: 'OK', map: { '1': SOME_ACTION } },
      { name: '',   map: { '1': SOME_ACTION } },     // blank name → drop
      { name: 'AlsoOK', map: { '999': 'no-such' } }, // unknown action → no valid bindings → drop
      { name: 'Final',  map: { '3': SOME_ACTION } },
    ],
  }
  const r = parseImportMulti(JSON.stringify(mixed))
  ok(r.ok, 'partial-valid multi accepted')
  eq(r.bundles.length, 2, 'only valid bundles survived')
  eq(r.bundles[0].name, 'OK',    'survivor 0')
  eq(r.bundles[1].name, 'Final', 'survivor 1')
}

// parseImportMulti: rejection cases.
{
  eq(parseImportMulti(null).ok,    false, 'multi: null rejected')
  eq(parseImportMulti(123).ok,     false, 'multi: number rejected')
  eq(parseImportMulti('garbage').ok, false, 'multi: non-JSON rejected')
  eq(parseImportMulti('null').ok,  false, 'multi: null literal rejected')
  eq(parseImportMulti('"a"').ok,   false, 'multi: top-level string rejected')
  eq(parseImportMulti(JSON.stringify({ kind: 'other', bundles: [] })).ok, false, 'multi: wrong kind rejected')
  eq(parseImportMulti(JSON.stringify({ kind: EXPORT_KIND_MULTI, v: 99, bundles: [] })).ok, false, 'multi: future version rejected')
  eq(parseImportMulti(JSON.stringify({ kind: EXPORT_KIND_MULTI })).ok, false, 'multi: missing bundles array rejected')
  eq(parseImportMulti(JSON.stringify({ kind: EXPORT_KIND_MULTI, bundles: 'not-array' })).ok, false, 'multi: bundles wrong type rejected')
  // All inner bundles bad → whole file rejected.
  eq(parseImportMulti(JSON.stringify({
    kind: EXPORT_KIND_MULTI, v: 1,
    bundles: [{ name: '', map: {} }, { name: 'X', map: { '999': 'bad' } }],
  })).ok, false, 'multi: all-invalid rejected')
  // File too large (multi has a higher cap).
  const huge = 'x'.repeat(MAX_IMPORT_BYTES_MULTI + 1)
  eq(parseImportMulti(huge).ok, false, 'multi: oversize rejected')
  // BUT a file >MAX_IMPORT_BYTES (single) is still fine for multi.
  ok(MAX_IMPORT_BYTES_MULTI > MAX_IMPORT_BYTES, 'multi cap > single cap')
}

// summarizeImportImpactMulti: project add / replace / drop counts.
{
  // Empty existing + 3 incoming = 3 new, 0 replace, 0 drop.
  const inc = [
    { name: 'A', map: { '1': SOME_ACTION } },
    { name: 'B', map: { '2': SOME_ACTION } },
    { name: 'C', map: { '3': SOME_ACTION } },
  ]
  const im = summarizeImportImpactMulti([], inc)
  eq(im.willAdd,     3, 'empty existing: 3 new')
  eq(im.willReplace, 0, 'empty existing: 0 replace')
  eq(im.willDrop,    0, 'empty existing: 0 drop')
  eq(im.incoming,    3, 'incoming count')
  eq(im.live,        0, 'live count')
}
{
  // Replace by name: case-insensitive + trimmed.
  const live = [
    { name: 'Stage Rig', map: { '1': SOME_ACTION } },
    { name: 'studio',     map: { '2': SOME_ACTION } },
  ]
  const inc = [
    { name: 'STAGE RIG', map: { '4': SOME_ACTION } },   // matches by case-insens
    { name: '  Studio  ', map: { '5': SOME_ACTION } },   // matches by trim
    { name: 'NewOne',    map: { '6': SOME_ACTION } },
  ]
  const im = summarizeImportImpactMulti(live, inc)
  eq(im.willReplace, 2, 'two replaces by case-insens+trim name')
  eq(im.willAdd,     1, 'one new name')
  eq(im.willDrop,    0, 'no drop projected')
}
{
  // FIFO drop projection: existing full + new entries would push past cap.
  const live = []
  for (let i = 0; i < MAX_USER_PRESETS; i++) live.push({ name: `live-${i}`, map: { '1': SOME_ACTION } })
  const inc = [
    { name: 'new-a', map: { '2': SOME_ACTION } },
    { name: 'new-b', map: { '3': SOME_ACTION } },
  ]
  const im = summarizeImportImpactMulti(live, inc)
  eq(im.willAdd,  2, 'two adds')
  eq(im.willDrop, 2, 'projected drop = added past cap')
}
{
  // Defensive: null inputs.
  const im = summarizeImportImpactMulti(null, null)
  eq(im.willAdd, 0, 'null/null no adds')
  eq(im.willReplace, 0, 'null/null no replaces')
  eq(im.incoming, 0, 'null incoming = 0')
  eq(im.live, 0, 'null live = 0')
}

console.log(`PASS: midiUserBundleIO — envelope build/parse, bare-bundle shorthand, sanitize (out-of-range CC + unknown action + blank name + long-name/desc truncation), serialize (success + null on unencodable), filename slugify (punctuation/case/blank/null/multi-space/leading-trailing), parseImport (envelope + bare + all rejection cases), id/vendor/createdAt stripped on round-trip, isAtBundleCap (empty/null/non-array/full/past-cap/below) + R15.14 multi-bundle (envelope/serialize/filename/parse/bare-array/per-bundle-sanitize/rejection/summarize-impact)`)

// --- R19.20: combineDroppedBundles — multi-file drop combiner ---

// Helper: build a `reads` entry shaped like the FileReader output
// the panel's importBundleFiles passes through.
const readOf = (raw, name = 'f.json', error = null) => ({ raw, name, error })

// Single file (single-bundle shape) yields one bundle.
{
  const json = serializeUserBundle({ name: 'Solo', map: { 16: SOME_ACTION } })
  const r = combineDroppedBundles([readOf(json)])
  eq(r.bundles.length, 1, 'single-bundle file: one bundle')
  eq(r.bundles[0].name, 'Solo', 'preserves name')
  eq(r.parseFails, 0, 'no failures')
  eq(r.totalFilesRead, 1, 'totalFilesRead counts attempts')
}

// Single file (multi-bundle shape) yields N bundles.
{
  const json = serializeUserBundlesMulti([
    { name: 'A', map: { 16: SOME_ACTION } },
    { name: 'B', map: { 17: OTHER_ACTION } },
  ])
  const r = combineDroppedBundles([readOf(json)])
  eq(r.bundles.length, 2, 'multi-bundle file: bundles flattened into array')
  eq(r.bundles[0].name, 'A', 'order preserved A first')
  eq(r.bundles[1].name, 'B', 'order preserved B second')
  eq(r.parseFails, 0, 'no failures')
}

// Mix of single + multi + bare-array files combined into one flat array.
{
  const singleJson = serializeUserBundle({ name: 'Stage Rig', map: { 16: SOME_ACTION } })
  const multiJson  = serializeUserBundlesMulti([
    { name: 'Backup A', map: { 17: SOME_ACTION } },
    { name: 'Backup B', map: { 18: OTHER_ACTION } },
  ])
  // Bare-array shorthand: top-level JSON array of {name,map} objects.
  const bareArrayJson = JSON.stringify([{ name: 'Bare', map: { 19: SOME_ACTION } }])
  const r = combineDroppedBundles([
    readOf(singleJson, 'rig.json'),
    readOf(multiJson, 'backups.json'),
    readOf(bareArrayJson, 'bare.json'),
  ])
  eq(r.bundles.length, 4, 'mixed shapes: 1 + 2 + 1 = 4 bundles')
  eq(r.parseFails, 0, 'mixed valid files: no failures')
  eq(r.totalFilesRead, 3, 'totalFilesRead = total attempts')
  // Order preserved across the file list — first file's bundles come
  // before second file's, etc.
  eq(r.bundles[0].name, 'Stage Rig', 'order: file 1 first')
  eq(r.bundles[1].name, 'Backup A',  'order: file 2 first bundle')
  eq(r.bundles[2].name, 'Backup B',  'order: file 2 second bundle')
  eq(r.bundles[3].name, 'Bare',      'order: file 3')
}

// Partial-success: valid files combined, invalid files counted in parseFails.
{
  const goodJson = serializeUserBundle({ name: 'Good', map: { 16: SOME_ACTION } })
  const r = combineDroppedBundles([
    readOf(goodJson, 'good.json'),
    readOf('{not-json', 'broken.json'),
    readOf('{"kind":"wrong-thing","v":1,"bundle":{"name":"x","map":{}}}', 'wrong-kind.json'),
    readOf('not a json string at all', 'plain-text.json'),
  ])
  eq(r.bundles.length, 1, 'partial: one valid bundle survived')
  eq(r.parseFails, 3, 'partial: three failures counted')
  eq(r.bundles[0].name, 'Good', 'the good one is preserved')
}

// Empty raw / explicit error counts as a parse failure (no bundle, no crash).
{
  const r = combineDroppedBundles([
    readOf('', 'empty.json'),
    readOf('valid-but-empty-after-parse', 'invalid.json', null),
    { raw: '', error: 'read failed', name: 'died-reading.json' },
  ])
  eq(r.bundles.length, 0, 'no bundles from empty/error reads')
  eq(r.parseFails, 3, 'all three counted as failures')
}

// Per-bundle sanitisation applies through both code paths — corrupt
// CC keys + unknown actions inside a valid envelope are dropped, the
// bundle returned still has the surviving rows.
{
  // Bundle with one valid binding + one invalid (CC > 127) + one with
  // an unknown action — single-bundle shape.
  const dirty = JSON.stringify({
    kind: 'ai-particle-simulator/midi-user-bundle',
    v: 1,
    bundle: {
      name: 'Dirty',
      map: { '16': SOME_ACTION, '200': SOME_ACTION, '17': 'totally-bogus-action' },
    },
  })
  const r = combineDroppedBundles([readOf(dirty)])
  eq(r.bundles.length, 1, 'sanitised bundle still surfaces')
  eq(r.bundles[0].name, 'Dirty', 'name preserved')
  eq(Object.keys(r.bundles[0].map).length, 1, 'only the valid row survived')
  eq(r.bundles[0].map['16'], SOME_ACTION, 'the valid row points at the right action')
}

// Defensive: non-array input returns empty.
{
  const z1 = combineDroppedBundles(null)
  eq(z1.bundles.length, 0, 'null input → empty bundles')
  eq(z1.parseFails, 0, 'null input → 0 failures')
  eq(z1.totalFilesRead, 0, 'null input → 0 reads')
  const z2 = combineDroppedBundles('not-an-array')
  eq(z2.bundles.length, 0, 'string input → empty bundles')
  const z3 = combineDroppedBundles([])
  eq(z3.bundles.length, 0, 'empty array → empty bundles')
  eq(z3.totalFilesRead, 0, 'empty array → 0 reads')
}

// Defensive: non-object entries inside the array are skipped silently
// (don't count toward totalFilesRead OR parseFails — they were never
// "attempted").
{
  const r = combineDroppedBundles([null, undefined, 42, 'string', { /* no raw */ }])
  // The bare {} (no raw, no error) still gets counted as a read
  // attempt — and yields a parse failure since raw isn't a string.
  // null/undefined/42/string are skipped entirely.
  eq(r.totalFilesRead, 1, 'only the {} object was attempted')
  eq(r.parseFails, 1, 'attempted read with no raw → parse fail')
  eq(r.bundles.length, 0, 'no bundles from any of these')
}

console.log('PASS: midiUserBundleIO R19.20 combineDroppedBundles — single/multi/bare-array/mixed + partial-success + sanitisation + defensive')
