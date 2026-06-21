// customThemesIO: build/serialise + parse + merge contract.
import {
  buildExportPayload, serializeThemes, makeFilename, parseImport,
  mergeImport, EXPORT_KIND, EXPORT_VERSION, MAX_IMPORT_BYTES,
} from './customThemesIO.js'
import { MAX_CUSTOM_THEMES } from './customThemes.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }

// --- buildExportPayload + serializeThemes ---
{
  const items = [
    { id: 'custom-1', name: 'Sunset',  neon: '#ff9d5c', hueShift: 15 },
    { id: 'custom-2', name: 'Forest',  neon: '#22c55e', hueShift: 120 },
    { id: 'custom-3', name: 'Mono',    neon: '#cccccc', hueShift: 0, saturation: 0 },
  ]
  const env = buildExportPayload(items, '2026-06-20T21:00:00.000Z')
  eq(env.kind, EXPORT_KIND, 'envelope tagged with export kind')
  eq(env.v, EXPORT_VERSION, 'envelope tagged with version')
  eq(env.exportedAt, '2026-06-20T21:00:00.000Z', 'exportedAt preserved')
  eq(env.items.length, 3, 'all 3 themes survive the envelope')
  if ('id' in env.items[0]) fail('id should NOT be serialised')
  eq(env.items[0].name, 'Sunset', 'name carried')
  eq(env.items[0].neon, '#ff9d5c', 'neon carried')
  eq(env.items[0].hueShift, 15, 'hueShift carried')
  eq(env.items[2].saturation, 0, 'saturation: 0 carried')
  if ('saturation' in env.items[0]) fail('saturation absent → not serialised')

  // JSON serialise round-trips.
  const json = serializeThemes(items)
  const back = JSON.parse(json)
  eq(back.items.length, 3, 'serialised JSON parses back to 3 items')
}

// Empty input → empty items array, not a crash.
{
  const env = buildExportPayload([])
  eq(env.items.length, 0, 'empty list → empty envelope')
}
{
  const env = buildExportPayload(null)
  eq(env.items.length, 0, 'null list → empty envelope (defensive)')
}

// Garbage rows dropped silently.
{
  const env = buildExportPayload([
    { id: 'custom-1', name: 'Good', neon: '#abcdef', hueShift: 0 },
    null,
    42,
    { name: 'NoId' },          // normalizeTheme rejects (missing id)
    { id: 'builtin-1', name: 'Skip', neon: '#000000', hueShift: 0 },   // not custom-* id
  ])
  eq(env.items.length, 1, 'only the valid row survives')
  eq(env.items[0].name, 'Good', 'right row kept')
}

// --- makeFilename ---
eq(makeFilename('2026-06-20T21:00:00.000Z'), 'particle-themes-2026-06-20.json', 'filename uses date slice')

// --- parseImport: happy path ---
{
  const json = JSON.stringify({
    kind: EXPORT_KIND, v: 1, exportedAt: '2026-06-20',
    items: [
      { name: 'Aurora',  neon: '#22c55e', hueShift: 120 },
      { name: 'Sunrise', neon: '#ff9d5c', hueShift: 15 },
    ],
  })
  const res = parseImport(json)
  if (!res.ok) fail(`expected ok, got error: ${res.error}`)
  eq(res.items.length, 2, 'parsed both items')
  eq(res.items[0].name, 'Aurora', 'first name carried')
  eq(res.items[0].neon, '#22c55e', 'first neon carried')
  eq(res.items[0].hueShift, 120, 'first hueShift carried')
}

// Bare array import (no envelope) — tolerated.
{
  const json = JSON.stringify([
    { name: 'Plain', neon: '#abcdef', hueShift: 0 },
  ])
  const res = parseImport(json)
  if (!res.ok) fail(`bare array should parse; error: ${res.error}`)
  eq(res.items.length, 1, 'bare array tolerated')
}

// Wrong kind rejected.
{
  const res = parseImport(JSON.stringify({ kind: 'something-else', items: [] }))
  if (res.ok) fail('wrong kind should reject')
  if (!/Wrong file kind/.test(res.error)) fail(`unexpected error: ${res.error}`)
}

// Newer version rejected.
{
  const res = parseImport(JSON.stringify({ kind: EXPORT_KIND, v: 999, items: [] }))
  if (res.ok) fail('newer version should reject')
  if (!/version/.test(res.error)) fail(`unexpected error: ${res.error}`)
}

// Missing items array rejected.
{
  const res = parseImport(JSON.stringify({ kind: EXPORT_KIND }))
  if (res.ok) fail('missing items should reject')
}

// Non-string rejected.
{
  const res = parseImport(null)
  if (res.ok) fail('null input should reject')
}

// Invalid JSON rejected.
{
  const res = parseImport('{not valid json')
  if (res.ok) fail('bad JSON should reject')
  if (!/Invalid JSON/.test(res.error)) fail(`unexpected error: ${res.error}`)
}

// Size cap rejected.
{
  const big = '{"kind":"' + EXPORT_KIND + '","items":[' + 'x'.repeat(MAX_IMPORT_BYTES) + ']}'
  const res = parseImport(big)
  if (res.ok) fail('over-cap should reject')
  if (!/too large/i.test(res.error)) fail(`unexpected error: ${res.error}`)
}

// Empty items list → reject ("no themes found"); we want users to
// know nothing happened rather than silently doing nothing.
{
  const res = parseImport(JSON.stringify({ kind: EXPORT_KIND, items: [] }))
  if (res.ok) fail('empty items should reject')
  if (!/No valid themes/.test(res.error)) fail(`unexpected error: ${res.error}`)
}

// Garbage rows skipped, valid rows kept.
{
  const res = parseImport(JSON.stringify({
    kind: EXPORT_KIND,
    items: [
      { name: 'Good', neon: '#abcdef', hueShift: 0 },
      null,
      'string row',
      { neon: '#000' },                  // missing name
      { name: '   ', neon: '#fff' },     // empty name
    ],
  }))
  if (!res.ok) fail(`expected ok, got error: ${res.error}`)
  eq(res.items.length, 1, 'only the good row survives')
}

// --- mergeImport: 'merge' mode skips name dupes ---
{
  const existing = [
    { id: 'custom-1', name: 'Sunset', neon: '#ff9d5c', hueShift: 15 },
  ]
  const imported = [
    { name: 'Sunset',  neon: '#000000', hueShift: 0 },   // dupe name → skip
    { name: 'Aurora',  neon: '#22c55e', hueShift: 120 }, // new → add
  ]
  const res = mergeImport(existing, imported, 'merge')
  eq(res.added, 1, 'one added')
  eq(res.skipped, 1, 'one skipped (dupe)')
  if (!res.items.some(t => t.name === 'Sunset' && t.neon === '#ff9d5c')) fail('Sunset preserved as-is')
  if (!res.items.some(t => t.name === 'Aurora')) fail('Aurora appended')
}

// --- mergeImport: 'replace' mode drops existing ---
{
  const existing = [
    { id: 'custom-1', name: 'Sunset', neon: '#ff9d5c', hueShift: 15 },
    { id: 'custom-2', name: 'Forest', neon: '#22c55e', hueShift: 120 },
  ]
  const imported = [
    { name: 'Aurora',  neon: '#22c55e', hueShift: 120 },
  ]
  const res = mergeImport(existing, imported, 'replace')
  eq(res.items.length, 1, 'only the imported theme remains')
  eq(res.items[0].name, 'Aurora', 'imported theme kept')
}

// Merge respects MAX_CUSTOM_THEMES (silently caps).
{
  const existing = []
  const imported = []
  for (let n = 0; n < MAX_CUSTOM_THEMES + 5; n++) {
    imported.push({ name: `T${n}`, neon: '#000000', hueShift: 0 })
  }
  const res = mergeImport(existing, imported, 'merge')
  eq(res.items.length, MAX_CUSTOM_THEMES, 'capped at MAX_CUSTOM_THEMES')
}

// Non-array input handled gracefully.
{
  const res = mergeImport([], null, 'merge')
  eq(res.items.length, 0, 'null imported → empty result')
  eq(res.added, 0, 'no additions')
}

console.log(`PASS: customThemesIO build/serialise/filename + parse + merge · MAX_BYTES=${MAX_IMPORT_BYTES}`)
