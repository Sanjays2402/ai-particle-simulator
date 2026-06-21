// bookmarksIO: envelope build/serialise/filename + import parse + merge.
import {
  buildExportPayload, serializeBookmarks, makeFilename,
  parseImport, mergeImport, mergeImportViews,
  EXPORT_KIND, EXPORT_VERSION, LEGACY_EXPORT_VERSION, MAX_IMPORT_BYTES,
} from './bookmarksIO.js'
import { MAX_BOOKMARKS } from './sceneBookmarks.js'
import { CAMERA_VIEWS_MAX } from './cameraViews.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) fail(`${m} — got ${A} expected ${B}`)
}

const NOW = '2026-06-21T09:30:00.000Z'

// --- buildExportPayload + serialize (bookmarks-only path → v1) ---
{
  const items = [
    { id: 1, name: 'Aurora Magic', createdAt: 1700000000000, scene: { currentPreset: 'aurora' } },
    { id: 2, name: 'Heart Beat',  createdAt: 1700000010000, scene: { currentPreset: 'heartbeat', theme: 'ocean' } },
  ]
  const env = buildExportPayload(items, NOW)
  eq(env.kind, EXPORT_KIND, 'kind set')
  eq(env.v, LEGACY_EXPORT_VERSION, 'no views → v1 envelope for back-compat')
  eq(env.exportedAt, NOW, 'exportedAt forwarded')
  eq(env.items.length, 2, 'all items packed')
  if ('views' in env) fail('views key should NOT be present in bookmarks-only export')
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
  eq(parsed.views.length, 0, 'v1 import → empty views array')
}

// --- buildExportPayload with views → v2 combined envelope ---
{
  const items = [
    { id: 1, name: 'Aurora Magic', scene: { currentPreset: 'aurora' } },
  ]
  const views = [
    { id: 1, name: 'High Up', pos: [0, 20, 30], target: [0, 0, 0], createdAt: 1700000000000 },
    { id: 2, name: 'Side',    pos: [25, 5, 0], target: [0, 0, 0] },
  ]
  const env = buildExportPayload(items, NOW, views)
  eq(env.v, EXPORT_VERSION, 'views present → v2 envelope')
  eq(env.views.length, 2, 'views packed')
  // ids stripped on export
  if ('id' in env.views[0]) fail('view id leaked into export')
  eq(env.views[0].name, 'High Up', 'view name preserved')
  eq(env.views[0].pos, [0, 20, 30], 'view pos preserved')
  eq(env.views[1].target, [0, 0, 0], 'view target preserved')
  // Round-trip — parse should recover both lists.
  const json = serializeBookmarks(items, views)
  const parsed = parseImport(json)
  if (!parsed.ok) fail(`combined round-trip failed: ${parsed.error}`)
  eq(parsed.items.length, 1, 'combined round-trip preserves items')
  eq(parsed.views.length, 2, 'combined round-trip preserves views')
  eq(parsed.views[0].pos, [0, 20, 30], 'combined round-trip preserves pos')
}

// --- buildExportPayload drops malformed views silently ---
{
  const views = [
    { name: 'Good', pos: [0, 0, 0], target: [1, 1, 1] },
    { name: 'No pos', target: [0, 0, 0] },              // missing pos → dropped
    { name: 'Bad pos', pos: [0, 'x', 0], target: [0, 0, 0] },  // non-finite → dropped
    { name: 'No target', pos: [0, 0, 0] },              // missing target → dropped
    { name: '', pos: [0, 0, 0], target: [0, 0, 0] },    // empty name → dropped
    { pos: [0, 0, 0], target: [0, 0, 0] },               // no name → dropped
    null,                                                // null entry → dropped
  ]
  const env = buildExportPayload([{ name: 'B', scene: {} }], NOW, views)
  eq(env.views.length, 1, 'malformed views silently dropped')
  eq(env.views[0].name, 'Good', 'only the well-formed view survives')
}

// --- Empty views list → v1 envelope (back-compat) ---
{
  const env = buildExportPayload([{ name: 'B', scene: {} }], NOW, [])
  eq(env.v, LEGACY_EXPORT_VERSION, 'empty views array still emits v1')
  if ('views' in env) fail('empty views should not include views key')
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
eq(makeFilename(NOW), 'particle-scenes-2026-06-21.json', 'filename: YYYY-MM-DD slice')
eq(makeFilename(NOW, true), 'particle-scenes+views-2026-06-21.json', 'filename: combined gets +views suffix')
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
   false, 'parse: no valid rows AND no valid views → error')

// File-too-large rejected by byte cap.
{
  const big = '"' + 'x'.repeat(MAX_IMPORT_BYTES + 10) + '"'
  eq(parseImport(big).ok, false, 'parse: oversized payload → error')
}

// --- parseImport: v2 envelope WITHOUT any bookmarks but WITH views still OK ---
{
  const raw = JSON.stringify({
    kind: EXPORT_KIND, v: 2, items: [],
    views: [
      { name: 'Just A View', pos: [1, 2, 3], target: [0, 0, 0] },
    ],
  })
  const res = parseImport(raw)
  if (!res.ok) fail(`views-only import should succeed: ${res.error}`)
  eq(res.items.length, 0, 'views-only: items is empty')
  eq(res.views.length, 1, 'views-only: views recovered')
  eq(res.views[0].name, 'Just A View', 'views-only: name preserved')
}

// --- parseImport: v2 envelope with bad views — survives, drops them ---
{
  const raw = JSON.stringify({
    kind: EXPORT_KIND, v: 2,
    items: [{ name: 'Good', scene: {} }],
    views: [
      { name: 'Good View', pos: [0, 0, 0], target: [0, 0, 0] },
      { name: '',  pos: [0, 0, 0], target: [0, 0, 0] },                // empty name → dropped
      { name: 'Bad pos', pos: [NaN, 0, 0], target: [0, 0, 0] },        // non-finite → dropped
      'not an object',                                                  // primitive → dropped
    ],
  })
  const res = parseImport(raw)
  if (!res.ok) fail(`partial bad views should still import: ${res.error}`)
  eq(res.items.length, 1, 'partial bad views: items survive')
  eq(res.views.length, 1, 'partial bad views: only the good one made it through')
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
  eq(res.views.length, 0, 'bare-array: views array still present and empty')
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

// --- mergeImportViews: parallels mergeImport for views ---
{
  const existing = [
    { id: 1, name: 'V1', pos: [0, 0, 0], target: [0, 0, 0] },
  ]
  const imported = [
    { name: 'V1', pos: [9, 9, 9], target: [0, 0, 0] }, // dupe by name → skipped
    { name: 'V2', pos: [1, 0, 0], target: [0, 0, 0] }, // new → added
    { name: 'V3', pos: [0, 1, 0], target: [0, 0, 0] }, // new → added
  ]
  const res = mergeImportViews(existing, imported, 'merge')
  eq(res.added, 2, 'mergeViews: new names added')
  eq(res.skipped, 1, 'mergeViews: dupes skipped')
  eq(res.views.length, 3, 'mergeViews: final length combines both')
  const v1 = res.views.find(v => v.name === 'V1')
  eq(v1.pos, [0, 0, 0], 'mergeViews: dupe keeps original pos in merge mode')
}

// --- mergeImportViews: replace mode swaps the entire list ---
{
  const existing = [{ id: 1, name: 'Old', pos: [0, 0, 0], target: [0, 0, 0] }]
  const imported = [
    { name: 'X', pos: [1, 1, 1], target: [0, 0, 0] },
    { name: 'Y', pos: [2, 2, 2], target: [0, 0, 0] },
  ]
  const res = mergeImportViews(existing, imported, 'replace')
  eq(res.added, 2, 'replaceViews: counts imported additions')
  eq(res.views.length, 2, 'replaceViews: existing dropped')
  eq(res.views.some(v => v.name === 'Old'), false, 'replaceViews: old gone')
}

// --- mergeImportViews: caps at CAMERA_VIEWS_MAX in merge mode ---
{
  const existing = []
  const imported = Array.from({ length: CAMERA_VIEWS_MAX + 4 }, (_, i) => ({
    name: `V${i}`, pos: [i, 0, 0], target: [0, 0, 0],
  }))
  const res = mergeImportViews(existing, imported, 'merge')
  eq(res.views.length, CAMERA_VIEWS_MAX, 'mergeViews: caps at CAMERA_VIEWS_MAX')
  eq(res.skipped, 4, 'mergeViews: overflow goes to skipped count')
}

// --- mergeImportViews: tolerates null inputs ---
{
  const res = mergeImportViews(null, null, 'merge')
  eq(res.views.length, 0, 'mergeViews: null imported → empty result')
}

console.log(`PASS: bookmarksIO — v1+v2 envelopes (build/serialize/filename), parseImport (10 rejection/edge cases + v2 views + bare array + truncate), mergeImport (merge/replace/cap), mergeImportViews (merge/replace/cap)`)
