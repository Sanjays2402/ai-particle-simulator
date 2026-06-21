// keymapIO: envelope build/serialise/parse, merge vs replace, file
// helpers. Tests cover happy path + every coerced failure mode so the
// Settings panel can rely on { ok, error } verbatim.
import {
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
  buildExportPayload, serializeKeymap, makeFilename,
  parseImport, mergeImport, summarizeImportImpact,
} from './keymapIO.js'
import { defaultsByAction, ACTIONS } from './keymap.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

// --- buildExportPayload keeps only known action ids ---
{
  const map = { ...defaultsByAction(), random: 'KeyZ', bogus: 'KeyX' }
  const env = buildExportPayload(map, '2026-06-21T00:00:00.000Z')
  eq(env.kind, EXPORT_KIND, 'kind set')
  eq(env.v, EXPORT_VERSION, 'version set')
  eq(env.exportedAt, '2026-06-21T00:00:00.000Z', 'exportedAt round-trip')
  eq(env.bindings.random, 'KeyZ', 'random rebinding kept')
  eq(env.bindings.play, 'Space', 'play default kept')
  eq(env.bindings.bogus, undefined, 'bogus filtered')
  // All known actions appear in the envelope.
  for (const a of ACTIONS) {
    ok(env.bindings[a.id], `action ${a.id} present in export`)
  }
}

// --- buildExportPayload handles missing/empty map gracefully ---
{
  const env = buildExportPayload(null)
  eq(Object.keys(env.bindings).length, 0, 'null map → empty bindings')
  const env2 = buildExportPayload({})
  eq(Object.keys(env2.bindings).length, 0, 'empty map → empty bindings')
  const env3 = buildExportPayload({ random: '' })
  eq(env3.bindings.random, undefined, 'empty string binding dropped')
}

// --- serializeKeymap returns parseable JSON ---
{
  const json = serializeKeymap({ ...defaultsByAction(), random: 'KeyZ' })
  const parsed = JSON.parse(json)
  eq(parsed.kind, EXPORT_KIND, 'serialised kind')
  eq(parsed.bindings.random, 'KeyZ', 'serialised binding')
}

// --- makeFilename uses the ISO date prefix ---
{
  eq(makeFilename('2026-06-21T00:00:00.000Z'), 'particle-keymap-2026-06-21.json', 'filename uses ISO date')
}

// --- parseImport accepts a valid envelope ---
{
  const env = buildExportPayload({ ...defaultsByAction(), random: 'KeyZ' })
  const res = parseImport(JSON.stringify(env))
  ok(res.ok, 'valid envelope parses')
  eq(res.bindings.random, 'KeyZ', 'random rebinding preserved')
  ok(Object.keys(res.bindings).length >= ACTIONS.length - 1, 'most bindings preserved')
}

// --- parseImport tolerates a bare bindings dict ---
{
  const raw = JSON.stringify({ random: 'KeyZ', play: 'Space' })
  const res = parseImport(raw)
  ok(res.ok, 'bare dict parses')
  eq(res.bindings.random, 'KeyZ', 'bare dict random kept')
  eq(res.bindings.play, 'Space', 'bare dict play kept')
}

// --- parseImport drops unknown action ids ---
{
  const env = buildExportPayload({ ...defaultsByAction() })
  env.bindings.totallyFake = 'KeyZ'
  const res = parseImport(JSON.stringify(env))
  ok(res.ok, 'parses despite unknown ids')
  eq(res.bindings.totallyFake, undefined, 'unknown id dropped')
}

// --- parseImport rejects garbage ---
{
  eq(parseImport(null).ok, false, 'null rejected')
  eq(parseImport(undefined).ok, false, 'undefined rejected')
  eq(parseImport(42).ok, false, 'number rejected')
  eq(parseImport('not json').ok, false, 'bad JSON rejected')
  eq(parseImport('null').ok, false, 'literal null rejected')
  eq(parseImport(JSON.stringify({ kind: 'wrong' })).ok, false, 'wrong kind rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 999, bindings: {} })).ok, false, 'future version rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1 })).ok, false, 'missing bindings rejected')
  eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, bindings: { totallyFake: 'KeyZ' } })).ok, false, 'no valid ids → error')
}

// --- parseImport size cap ---
{
  const big = 'x'.repeat(MAX_IMPORT_BYTES + 1)
  const res = parseImport(big)
  eq(res.ok, false, 'oversize rejected')
  ok(/too large/i.test(res.error), 'size error message readable')
}

// --- mergeImport: merge mode overlays on existing ---
{
  const existing = { ...defaultsByAction() }
  const imported = { random: 'KeyZ' }
  const out = mergeImport(existing, imported, 'merge')
  eq(out.map.random, 'KeyZ', 'random rebinding applied')
  eq(out.map.play, 'Space', 'play kept its default (not in import)')
  eq(out.changed, 1, '1 binding changed')
  eq(out.total, 1, '1 binding in file')
}

// --- mergeImport: replace mode resets unspecified to defaults ---
{
  // Start from a map where play has been rebound; replace mode + an
  // import that only mentions `random` should reset play to its
  // default but still apply the random rebinding.
  const existing = { ...defaultsByAction(), play: 'KeyP' }
  const imported = { random: 'KeyZ' }
  const out = mergeImport(existing, imported, 'replace')
  eq(out.map.random, 'KeyZ', 'random rebinding applied')
  eq(out.map.play, 'Space', 'play reset to default in replace mode')
  eq(out.changed, 1, '1 binding changed vs the replace baseline')
}

// --- mergeImport handles null/empty imports safely ---
{
  const out = mergeImport(defaultsByAction(), null, 'merge')
  eq(out.changed, 0, 'null import → no changes')
  eq(out.total, 0, 'null import → 0 total')
  const out2 = mergeImport(defaultsByAction(), {}, 'merge')
  eq(out2.changed, 0, 'empty import → no changes')
}

// --- mergeImport drops unknown ids from imported set ---
{
  const out = mergeImport(defaultsByAction(), { totallyFake: 'KeyZ' }, 'merge')
  eq(out.changed, 0, 'unknown id → no changes applied')
  // Note: total counts the input dict size, not the kept count — UI
  // can choose to show either. We document the contract.
  eq(out.total, 1, 'total counts the input regardless of validity')
}

// --- round-trip: export → parseImport → mergeImport === original ---
{
  const original = { ...defaultsByAction(), random: 'KeyZ', screenshot: 'KeyY' }
  const json = serializeKeymap(original)
  const parsed = parseImport(json)
  ok(parsed.ok, 'round-trip parses')
  const merged = mergeImport(defaultsByAction(), parsed.bindings, 'replace')
  // Every action should match the original (replace mode + a complete
  // export envelope means we land exactly back where we started).
  for (const a of ACTIONS) {
    eq(merged.map[a.id], original[a.id], `round-trip preserves ${a.id}`)
  }
}

// --- R13.04: summarizeImportImpact — merge mode shows the diff ---
{
  // Start from a map where the user has rebound play=KeyP.
  const existing = { ...defaultsByAction(), play: 'KeyP' }
  // Import wants to: change random to KeyZ, change play BACK to Space.
  const imported = { random: 'KeyZ', play: 'Space' }
  const s = summarizeImportImpact(existing, imported, 'merge')
  eq(s.mode, 'merge', 'mode echoed')
  eq(s.totalImport, 2, 'two valid imports')
  eq(s.willChange, 2, 'both imports change something (random + play)')
  // Both diffs are present in stable order.
  const ids = s.diffs.map(d => d.id).sort()
  eq(JSON.stringify(ids), JSON.stringify(['play', 'random']), 'diffs include both ids')
  const playDiff = s.diffs.find(d => d.id === 'play')
  eq(playDiff.fromCode, 'KeyP', 'play before = KeyP')
  eq(playDiff.toCode, 'Space', 'play after = Space')
  eq(playDiff.label, 'Play / pause', 'diff includes the human label')
  // willKeep counts no-op overlays.
  const s2 = summarizeImportImpact(existing, { play: 'KeyP' }, 'merge')
  eq(s2.willChange, 0, 'no-op overlay → 0 changes')
  eq(s2.willKeep, 1, 'no-op overlay → 1 willKeep')
  // resetIds is empty in merge mode regardless of input.
  eq(s.resetIds.length, 0, 'merge mode never lists resets')
}

// --- R13.04: summarizeImportImpact — replace mode lists resets ---
{
  // User has rebound play=KeyP AND random=KeyQ.
  const existing = { ...defaultsByAction(), play: 'KeyP', random: 'KeyQ' }
  // File only mentions play — replace mode resets random back to default.
  const imported = { play: 'Space' }
  const s = summarizeImportImpact(existing, imported, 'replace')
  eq(s.mode, 'replace', 'replace mode echoed')
  eq(s.totalImport, 1, 'one valid import')
  // Two changes: play (KeyP → Space), random (KeyQ → KeyR default).
  eq(s.willChange, 2, 'two diffs in replace mode')
  // Reset list flags random specifically — it's the action NOT in the
  // file that nonetheless will change because of replace.
  eq(s.willReset, 1, 'one reset in replace mode')
  eq(s.resetIds.length, 1, 'one reset id')
  eq(s.resetIds[0], 'random', 'random is the reset id')
  // play is in the file so it's NOT a reset (even though it's also
  // moving back to its default).
  ok(!s.resetIds.includes('play'), 'play not flagged as reset (was in file)')
}

// --- R13.04: summarizeImportImpact — empty/null/garbage tolerated ---
{
  const s = summarizeImportImpact(null, null, 'merge')
  eq(s.totalImport, 0, 'null in → 0 imports')
  eq(s.willChange, 0, 'null in → 0 changes')
  eq(s.diffs.length, 0, 'null in → 0 diffs')
  const s2 = summarizeImportImpact({}, { bogus: 'KeyZ' }, 'merge')
  eq(s2.totalImport, 0, 'unknown id filtered out of count')
  eq(s2.willChange, 0, 'unknown id has no effect')
  const s3 = summarizeImportImpact({}, { random: 123 }, 'merge')
  eq(s3.totalImport, 0, 'non-string value filtered out')
}

// --- R13.04: summarizeImportImpact — diffs are stable + ordered ---
{
  // ACTIONS in keymap.js is declared in a specific order; the diffs
  // array must follow that order so the UI display doesn't shuffle.
  const existing = { ...defaultsByAction() }
  // Touch the FIRST action (play) and the LAST one (help) — diff
  // order should match ACTIONS declaration order, NOT input order.
  const imported = { help: 'KeyH', play: 'KeyP' }
  const s = summarizeImportImpact(existing, imported, 'merge')
  eq(s.diffs.length, 2, 'two diffs')
  // play comes BEFORE help in ACTIONS declaration (play is index 0).
  const order = s.diffs.map(d => d.id)
  eq(order[0], 'play', 'first diff matches first action order in ACTIONS')
  eq(order[order.length - 1], 'help', 'help diff lands later in the list')
}

console.log('PASS: keymapIO — envelope build/parse/merge/replace + round-trip + summarizeImportImpact diff/reset')
