// midiUserBundleIO: round-trip a single user-authored MIDI controller
// bundle through the JSON envelope. Tests cover envelope build/parse,
// bare-bundle shorthand, sanitize behaviour, rejection cases, filename
// slug, cap helper, defensive handling.
import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES, MAX_USER_PRESETS,
  buildExportPayload, serializeUserBundle, makeFilename,
  parseImport, isAtBundleCap,
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

console.log(`PASS: midiUserBundleIO — envelope build/parse, bare-bundle shorthand, sanitize (out-of-range CC + unknown action + blank name + long-name/desc truncation), serialize (success + null on unencodable), filename slugify (punctuation/case/blank/null/multi-space/leading-trailing), parseImport (envelope + bare + all rejection cases), id/vendor/createdAt stripped on round-trip, isAtBundleCap (empty/null/non-array/full/past-cap/below)`)
