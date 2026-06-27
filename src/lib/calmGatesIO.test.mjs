// calmGatesIO: round-trip the per-motion calm-gate map through the JSON
// envelope. Tests sanitize behaviour, merge vs replace, dry-run summary,
// bad-input handling, and the bare-gates shorthand.
// Run via: node --test src/lib/calmGatesIO.test.mjs
import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
  buildExportPayload, serializeCalmGates, makeFilename,
  parseImport, mergeImport, summarizeImportImpact,
} from './calmGatesIO.js'
import { CALM_MOTION_IDS, defaultCalmGates } from './calmMode.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(c, m) { if (!c) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); else passed++ }

const ALL_GATED = defaultCalmGates() // { autoRotate:true, cameraShake:true, hueCycle:true, zenOrbit:true }
// A user who keeps auto-rotate + hue-cycle gated but lets shake + zen run.
const PARTIAL = { autoRotate: true, cameraShake: false, hueCycle: true, zenOrbit: false }

// --- buildExportPayload + serialize ---
{
  const payload = buildExportPayload(PARTIAL, '2026-06-27T12:00:00.000Z')
  eq(payload.kind, EXPORT_KIND, 'kind tag')
  eq(payload.v, EXPORT_VERSION, 'version stamped')
  eq(payload.exportedAt, '2026-06-27T12:00:00.000Z', 'timestamp preserved')
  eq(payload.gates.cameraShake, false, 'partial gate preserved (shake off)')
  eq(payload.gates.autoRotate, true, 'partial gate preserved (auto-rotate on)')
  // sanitize fills every known key.
  for (const id of CALM_MOTION_IDS) {
    ok(Object.prototype.hasOwnProperty.call(payload.gates, id), `payload carries ${id}`)
  }

  const json = serializeCalmGates(PARTIAL)
  ok(typeof json === 'string' && json.startsWith('{'), 'serialized to JSON')
  const parsed = parseImport(json)
  ok(parsed.ok, `serialize→parse ok (got ${parsed.error})`)
  eq(parsed.gates.cameraShake, false, 'shake=false survives round-trip')
  eq(parsed.gates.zenOrbit, false, 'zen=false survives round-trip')
}

// --- buildExportPayload sanitizes corrupt + partial inputs ---
{
  const dirty = { autoRotate: 'yes', cameraShake: 0, bogus: true }
  const payload = buildExportPayload(dirty)
  eq(payload.gates.autoRotate, true, 'truthy string coerced to true')
  eq(payload.gates.cameraShake, false, 'falsy 0 coerced to false')
  // missing keys default to gated (true) — fail toward calming.
  eq(payload.gates.hueCycle, true, 'missing key defaults to gated')
  eq(payload.gates.zenOrbit, true, 'missing key defaults to gated')
  eq(payload.gates.bogus, undefined, 'unknown key dropped')
}

// --- makeFilename ---
eq(makeFilename('2026-06-27T09:30:00.000Z'), 'particle-calm-gates-2026-06-27.json', 'filename uses the date')

// --- parseImport: envelope + bare-map shorthand ---
{
  // Full envelope.
  const env = JSON.stringify({ kind: EXPORT_KIND, v: 1, gates: PARTIAL })
  const r = parseImport(env)
  ok(r.ok, 'envelope parses')
  eq(r.gates.cameraShake, false, 'envelope gate read')

  // Bare gates map (no kind/gates wrapper) — hand-rolled shorthand.
  const bare = JSON.stringify({ autoRotate: false })
  const rb = parseImport(bare)
  ok(rb.ok, 'bare gates map parses via shorthand')
  eq(rb.gates.autoRotate, false, 'bare map opt-out preserved')
  eq(rb.gates.hueCycle, true, 'bare map missing keys default to gated')
}

// --- parseImport: defensive matrix ---
eq(parseImport(123).ok, false, 'non-string → error')
eq(parseImport('{ not json').ok, false, 'invalid JSON → error')
eq(parseImport('null').ok, false, 'top-level null → error')
eq(parseImport('"a-string"').ok, false, 'top-level scalar → error')
eq(parseImport('42').ok, false, 'top-level number → error')
eq(parseImport(JSON.stringify({ kind: 'other-app', v: 1, gates: PARTIAL })).ok, false, 'wrong kind → error')
eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 999, gates: PARTIAL })).ok, false, 'future version → error')
eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1 })).ok, false, 'missing gates map → error')
// A map with ONLY unknown keys is rejected (would silently resolve to all-default).
eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, gates: { nope: true, bogus: false } })).ok, false,
  'gates with no known motion id → error')
// Oversized payload rejected.
{
  const big = '{"gates":{"autoRotate":false,"_pad":"' + 'x'.repeat(MAX_IMPORT_BYTES) + '"}}'
  eq(parseImport(big).ok, false, 'oversized payload → error')
}

// --- mergeImport: REPLACE adopts the whole map ---
{
  const res = mergeImport(ALL_GATED, PARTIAL, 'replace')
  eq(res.mode, 'replace', 'replace mode echoed')
  eq(res.gates.cameraShake, false, 'replace: shake adopted off')
  eq(res.gates.zenOrbit, false, 'replace: zen adopted off')
  eq(res.gates.autoRotate, true, 'replace: auto-rotate stays gated')
  eq(res.changed, 2, 'replace: two motions flipped from all-gated')
}
// replace from a non-default existing back to all-gated.
{
  const res = mergeImport(PARTIAL, ALL_GATED, 'replace')
  eq(res.changed, 2, 'replace: re-gating the two opted-out motions counts as 2 changes')
  eq(res.gates.cameraShake, true, 'replace: shake re-gated')
}

// --- mergeImport: MERGE only adopts deliberate opt-OUTs ---
{
  // Existing has shake OFF; import opts hueCycle OFF (and leaves shake at
  // the default true). Merge must keep the user's shake=off AND apply the
  // import's hueCycle=off.
  const existing = { autoRotate: true, cameraShake: false, hueCycle: true, zenOrbit: true }
  const incoming = { autoRotate: true, cameraShake: true, hueCycle: false, zenOrbit: true }
  const res = mergeImport(existing, incoming, 'merge')
  eq(res.mode, 'merge', 'merge mode echoed')
  eq(res.gates.cameraShake, false, 'merge: user opt-out preserved (incoming default-true did NOT re-gate)')
  eq(res.gates.hueCycle, false, 'merge: incoming opt-out applied')
  eq(res.changed, 1, 'merge: only the new opt-out counts as a change')
}
// merge where import adds nothing new (all incoming at default) → no change.
{
  const res = mergeImport(PARTIAL, ALL_GATED, 'merge')
  eq(res.changed, 0, 'merge: all-default import flips nothing')
  eq(res.gates.cameraShake, false, 'merge: existing opt-outs untouched')
  eq(res.gates.zenOrbit, false, 'merge: existing opt-outs untouched')
}

// --- summarizeImportImpact: per-motion dry-run diff ---
{
  const sum = summarizeImportImpact(ALL_GATED, PARTIAL, 'replace')
  eq(sum.mode, 'replace', 'summary: mode echoed')
  eq(sum.rows.length, CALM_MOTION_IDS.length, 'summary: one row per motion')
  eq(sum.willChange, 2, 'summary: two motions change under replace')
  // every row carries a human label + from/to/changes.
  for (const row of sum.rows) {
    ok(typeof row.label === 'string' && row.label.length > 0, `summary row ${row.id} has a label`)
    ok(typeof row.from === 'boolean' && typeof row.to === 'boolean', `summary row ${row.id} from/to are bools`)
    eq(row.changes, row.from !== row.to, `summary row ${row.id} changes flag matches from/to`)
  }
  // The shake row specifically: from gated → to off.
  const shake = sum.rows.find(r => r.id === 'cameraShake')
  eq(shake.from, true, 'summary: shake from gated')
  eq(shake.to, false, 'summary: shake to off')
  eq(shake.changes, true, 'summary: shake flagged as changing')
}
// merge-mode summary reflects the opt-out-only semantics.
{
  const existing = { autoRotate: true, cameraShake: false, hueCycle: true, zenOrbit: true }
  const incoming = { autoRotate: true, cameraShake: true, hueCycle: false, zenOrbit: true }
  const sum = summarizeImportImpact(existing, incoming, 'merge')
  eq(sum.willChange, 1, 'summary merge: only the hueCycle opt-out changes')
  const shake = sum.rows.find(r => r.id === 'cameraShake')
  eq(shake.changes, false, 'summary merge: user shake opt-out is preserved (no change)')
}

// --- purity: helpers never mutate inputs ---
{
  const a = { autoRotate: true, cameraShake: false, hueCycle: true, zenOrbit: true }
  const b = { autoRotate: false, cameraShake: true, hueCycle: true, zenOrbit: true }
  const snapA = JSON.stringify(a), snapB = JSON.stringify(b)
  mergeImport(a, b, 'merge')
  mergeImport(a, b, 'replace')
  summarizeImportImpact(a, b, 'merge')
  buildExportPayload(a)
  eq(JSON.stringify(a), snapA, 'inputs not mutated (existing)')
  eq(JSON.stringify(b), snapB, 'inputs not mutated (imported)')
}

console.log(`PASS: calmGatesIO — ${passed} assertions (envelope round-trip, merge/replace, dry-run summary, defensive matrix) [R39.K]`)
