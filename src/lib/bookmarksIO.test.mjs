// bookmarksIO: envelope build/serialise/filename + import parse + merge.
import {
  buildExportPayload, serializeBookmarks, makeFilename,
  parseImport, mergeImport,
  EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
} from './bookmarksIO.js'
import { MAX_BOOKMARKS } from './sceneBookmarks.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) fail(`${m} — got ${A} expected ${B}`)
}

const NOW = '2026-06-20T18:30:00.000Z'

// --- buildExportPayload + serialize ---
{
  const items = [
    { id: 1, name: 'Aurora Magic', createdAt: 1700000000000, scene: { currentPreset: 'aurora' } },
    { id: 2, name: 'Heart Beat',  createdAt: 1700000010000, scene: { currentPreset: 'heartbeat', theme: 'ocean' } },
  ]
  const env = buildExportPayload(items, NOW)
  eq(env.kind, EXPORT_KIND, 'kind set')
  eq(env.v, EXPORT_VERSION, 'version set')
  eq(env.exportedAt, NOW, 'exportedAt forwarded')
  eq(env.items.length, 2, 'all items packed')
  // Ids must NOT survive — they're regenerated on import.
  if ('id' in env.items[0]) fail('id leaked into export envelope')
  if ('id' in env.items[1]) fail('id leaked into export envelope')
  // Schema-safe names preserved.
  eq(env.items[0].name, 'Aurora Magic', 'name preserved')
  // Round-trip: serialize then parseImport recovers the same items.
  const json = serializeBookmarks(items)
  const parsed = parseImport(json)
  if (!parsed.ok) fail(`round-trip failed: ${parsed.error}`)
  eq(parsed.items.length, 2, 'round-trip preserves item count')
  eq(parsed.items[0].name, 'Aurora Magic', 'round-trip preserves first name')
  eq(parsed.items[1].scene.theme, 'ocean', 'round-trip preserves scene fields')
}

// Empty list → envelope with empty items array (still a valid export).
{
  const env = buildExportPayload([], NOW)
  eq(env.items.length, 0, 'empty list packs as zero items')
}
// Items that lack a name fall back to 'Untitled'.
{
  const env = buildExportPayload([{ scene: {} }, { name: 5, scene: {} }])
  eq(env.items[0].name, 'Untitled', 'nameless entry gets Untitled fallback')
  eq(env.items[1].name, 'Untitled', 'numeric "name" gets Untitled fallback')
}

// --- makeFilename ---
eq(makeFilename(NOW), 'particle-scenes-2026-06-20.json', 'filename: YYYY-MM-DD slice')
eq(
  makeFilename('1999-12-31T23:59:59.000Z').endsWith('1999-12-31.json'),
  true,
  'filename: any ISO string is sliced consistently',
)

// --- parseImport: bad input ---
eq(parseImport(123).ok,    false, 'parse: non-string → error')
eq(parseImport('{').ok,    false, 'parse: invalid JSON → error')
eq(parseImport('null').ok, false, 'parse: top-level null → error')
eq(parseImport('"a-string"').ok, false, 'parse: top-level scalar → error')
eq(parseImport(JSON.stringify({ kind: 'other-app', v: 1, items: [] })).ok,
   false, 'parse: wrong kind → error')
eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 999, items: [] })).ok,
   false, 'parse: future version → error')
eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1 })).ok,
   false, 'parse: missing items array → error')
eq(parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 1, items: [{}] })).ok,
   false, 'parse: no valid rows → error')

// File-too-large rejected by byte cap.
{
  const big = '"' + 'x'.repeat(MAX_IMPORT_BYTES + 10) + '"'
  eq(parseImport(big).ok, false, 'parse: oversized payload → error')
}

// --- parseImport: bare array tolerated (no envelope) ---
{
  const raw = JSON.stringify([
    { name: 'Bare One', scene: { currentPreset: 'rain' } },
    { name: '',        scene: { foo: 1 } },         // empty name → dropped
    { name: 'Bad',     scene: null },               // bad scene → dropped
  ])
  const res = parseImport(raw)
  if (!res.ok) fail(`bare-array import should succeed: ${res.error}`)
  eq(res.items.length, 1, 'bare-array: only valid rows retained')
  eq(res.items[0].name, 'Bare One', 'bare-array: name preserved')
}

// --- parseImport: long names truncated to 64 chars ---
{
  const long = 'x'.repeat(200)
  const raw = JSON.stringify({ kind: EXPORT_KIND, v: 1, items: [{ name: long, scene: {} }] })
  const res = parseImport(raw)
  if (!res.ok) fail(`long-name import should succeed: ${res.error}`)
  eq(res.items[0].name.length, 64, 'long names clamped to 64 chars')
}

// --- mergeImport: merge mode (skip dupes, cap at MAX_BOOKMARKS) ---
{
  const existing = [
    { id: 1, name: 'A', scene: { p: 1 } },
    { id: 2, name: 'B', scene: { p: 2 } },
  ]
  const imported = [
    { name: 'A', scene: { p: 99 } },   // dupe → skipped
    { name: 'C', scene: { p: 3 } },    // new → added
    { name: 'D', scene: { p: 4 } },    // new → added
  ]
  const res = mergeImport(existing, imported, 'merge')
  eq(res.added, 2,    'merge: added counts new names')
  eq(res.skipped, 1,  'merge: skipped counts dupes')
  eq(res.replaced, 0, 'merge: replaced is always 0 in merge mode')
  eq(res.items.length, 4, 'merge: final list = existing + new (4)')
  // Original A scene is preserved (dupe NOT overwritten in merge mode).
  const a = res.items.find(it => it.name === 'A')
  eq(a.scene.p, 1, 'merge: dupe name keeps original scene')
}

// --- mergeImport: replace mode (drop everything, take imported only) ---
{
  const existing = [{ id: 1, name: 'Old', scene: {} }]
  const imported = [
    { name: 'X', scene: { p: 1 } },
    { name: 'Y', scene: { p: 2 } },
  ]
  const res = mergeImport(existing, imported, 'replace')
  eq(res.added, 2,    'replace: counts imported additions')
  eq(res.items.length, 2, 'replace: existing dropped, only imported survive')
  eq(res.items.some(it => it.name === 'Old'), false, 'replace: existing entries gone')
}

// --- mergeImport: respects MAX_BOOKMARKS in merge mode ---
{
  const existing = []
  // Build a list with more than MAX entries.
  const imported = Array.from({ length: MAX_BOOKMARKS + 3 }, (_, i) => ({
    name: `S${i}`, scene: {},
  }))
  const res = mergeImport(existing, imported, 'merge')
  eq(res.items.length, MAX_BOOKMARKS, 'merge: caps at MAX_BOOKMARKS')
  eq(res.skipped, 3, 'merge: overflow goes to skipped count')
}

// --- mergeImport: tolerates null inputs ---
{
  const res = mergeImport(null, null, 'merge')
  eq(res.items.length, 0, 'merge: null imported → empty result')
  eq(res.added, 0, 'merge: null imported → no adds')
}

console.log(`PASS: bookmarksIO — build/serialize/filename, parseImport (8 rejection cases + bare array + truncate), mergeImport (merge/replace/cap)`)
