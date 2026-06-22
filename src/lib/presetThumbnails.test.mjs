// presetThumbnails: pure helpers + compile/render pipeline.
import {
  projectXY, thumbStorageKey, hasThumbnail, listMissingThumbnails,
  compilePresetForThumbnail, renderThumbnailToCanvas, captureThumbnailToStorage,
  clearThumbnail, recaptureThumbnail,
  clearAllThumbnails, summarizeBulkRebuild,
  // R19.13 — per-thumb metadata side-store + relative-time formatter
  thumbMetadataKey, recordThumbMetadata, readThumbMetadata, clearThumbMetadata,
  summarizeThumbAge,
  // R20.19 — rich-detail formatter + byte-size formatter
  formatThumbDetails, formatByteSize,
  THUMB_WIDTH, THUMB_HEIGHT,
} from './presetThumbnails.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-6) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
// R19.13 — truthy assertion. Named distinctly from `ok` because the
// existing test cases above shadow `ok` with local return values
// from renderThumbnailToCanvas / recaptureThumbnail / recordThumbMetadata.
function truthy(c, m) { if (!c) fail(m) }

// --- projectXY ---
{
  const c = projectXY(0, 0, 0)
  near(c.px, THUMB_WIDTH / 2, 'origin → centre X')
  near(c.py, THUMB_HEIGHT / 2, 'origin → centre Y')
  eq(c.depthFade, 1, 'z=0 → no depth fade')
}
{
  // Negative Z farther from camera → fade < 1.
  const close = projectXY(0, 0, 2).depthFade
  const far   = projectXY(0, 0, -5).depthFade
  eq(close, 1, 'positive z still fades to 1')
  if (far >= 1) fail('negative z should dim')
}

// --- thumbStorageKey ---
eq(thumbStorageKey('spiral-galaxy'), 'preset-thumb-spiral-galaxy', 'storage key format matches PresetCarousel')

// --- hasThumbnail + listMissingThumbnails with a fake Storage ---
function makeFakeStorage() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    clear: () => { m.clear() },
    _raw: m,
  }
}
{
  const s = makeFakeStorage()
  eq(hasThumbnail('a', s), false, 'absent → no thumb')
  s.setItem(thumbStorageKey('a'), 'data:image/jpeg;base64,...')
  eq(hasThumbnail('a', s), true, 'present → has thumb')

  const missing = listMissingThumbnails([
    { id: 'a' }, { id: 'b' }, { id: 'c' },
  ], s)
  eq(missing.length, 2, 'a is present, b+c missing')
  eq(missing.map(p => p.id).join(','), 'b,c', 'missing ids preserve input order')

  // Bad inputs don't crash.
  eq(listMissingThumbnails(null, s).length, 0, 'null presets list → empty')
  eq(listMissingThumbnails([null, 'string', { id: 1 }, { id: 'ok' }], s).length, 1, 'malformed entries skipped')
}

// --- compilePresetForThumbnail captures controls + returns callable fn ---
{
  const code = `
    addControl('arms', 'Arms', 2, 8, 4);
    setInfo('Spiral', 'A spiral');
    const t = i / count;
    const arm = i % controls.arms;
    target.set(Math.cos(arm) * t * 5, 0, Math.sin(arm) * t * 5);
    color.setHSL(t, 0.8, 0.5);
  `
  const { fn, controls } = compilePresetForThumbnail(code)
  eq(controls.arms, 4, 'addControl initial captured during setup')
  eq(typeof fn, 'function', 'returns a callable fn')
  // Smoke test: it runs without throwing for index 0/100.
  const target = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this } }
  const color  = { r: 1, g: 1, b: 1, setHSL() { return this }, setRGB() { return this }, set() { return this } }
  const THREE  = { Vector3: function () {}, Color: function () {}, MathUtils: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t } }
  fn(50, 1500, target, color, 0.6, THREE, () => {}, () => {}, controls)
  // After execution target.set was called → coordinates moved.
  if (target.x === 0 && target.y === 0 && target.z === 0) fail('target was not updated by preset fn')
}

// --- renderThumbnailToCanvas using a fake Canvas2D context ---
{
  // Minimal canvas with just the methods + props the renderer touches.
  let painted = 0
  const canvas = {
    width: THUMB_WIDTH, height: THUMB_HEIGHT,
    getContext() {
      return {
        fillStyle: '',
        globalCompositeOperation: 'source-over',
        fillRect: (_x, _y, w, h) => {
          if (w === THUMB_WIDTH && h === THUMB_HEIGHT) return  // base clear
          painted++
        },
      }
    },
  }
  const code = `
    const t = i / count;
    target.set((t - 0.5) * 10, 0, 0);
    color.setRGB(t, 1 - t, 0.5);
  `
  const ok = renderThumbnailToCanvas(code, canvas)
  eq(ok, true, 'render succeeded')
  if (painted < 100) fail(`expected many painted pixels, got ${painted}`)
}

// Bad source: compile throws → returns false, no crash.
{
  const canvas = { width: 32, height: 32, getContext: () => ({ fillStyle: '', fillRect: () => {}, globalCompositeOperation: 'source-over' }) }
  const ok = renderThumbnailToCanvas('!!! not js !!!', canvas)
  eq(ok, false, 'compile failure returns false')
}

// --- captureThumbnailToStorage is a safe no-op in this Node test
//     (no document); just verify it doesn't throw on bad input either.
eq(captureThumbnailToStorage(null), false, 'null preset → false safe')
eq(captureThumbnailToStorage({ id: 'x', code: 'target.set(0,0,0); color.setRGB(1,1,1);' }), false,
   'no document → false safe')

// --- clearThumbnail ---
{
  const s = makeFakeStorage()
  eq(clearThumbnail('missing-id', s), false, 'clearThumbnail: nothing to remove → false')
  s.setItem(thumbStorageKey('p'), 'data:image/jpeg;base64,xxx')
  eq(hasThumbnail('p', s), true, 'precondition: thumb present')
  eq(clearThumbnail('p', s), true, 'clearThumbnail: present → true')
  eq(hasThumbnail('p', s), false, 'clearThumbnail removes the entry')
  // Re-clear is a no-op.
  eq(clearThumbnail('p', s), false, 'clearThumbnail second call → false (already gone)')
  // Bad inputs.
  eq(clearThumbnail('', s), false, 'clearThumbnail: empty id → false')
  eq(clearThumbnail(null, s), false, 'clearThumbnail: null id → false')
  eq(clearThumbnail(123, s), false, 'clearThumbnail: non-string id → false')
}

// --- recaptureThumbnail is also a Node-side no-op (no document), but
//     verifies the wipe step ran by leaving storage empty afterward.
{
  const s = makeFakeStorage()
  s.setItem(thumbStorageKey('foo'), 'stale-thumb-data')
  eq(hasThumbnail('foo', s), true, 'precondition: stale thumb cached')
  // Render returns false in a no-document env; the wipe should still
  // have happened first so the stale thumb is gone.
  const ok = recaptureThumbnail({ id: 'foo', code: 'target.set(0,0,0);' }, { storage: s })
  eq(ok, false, 'recaptureThumbnail: no-document → render returns false')
  eq(hasThumbnail('foo', s), false, 'recaptureThumbnail wiped stale thumb before failing render')

  // Defensive: bad inputs return false without throwing.
  eq(recaptureThumbnail(null), false, 'recaptureThumbnail: null preset → false')
  eq(recaptureThumbnail({}), false,   'recaptureThumbnail: empty preset → false')
  eq(recaptureThumbnail({ id: 42 }), false, 'recaptureThumbnail: non-string id → false')
}

console.log(`PASS: presetThumbnails projection + storage discovery + compile + render (${THUMB_WIDTH}x${THUMB_HEIGHT}) + clearThumbnail/recaptureThumbnail + R16.06 bulk clear/summarize`)

// --- R16.06: clearAllThumbnails — bulk wipe + count + defensive cases ---
{
  const s = makeFakeStorage()
  s.setItem(thumbStorageKey('a'), 'da')
  s.setItem(thumbStorageKey('b'), 'db')
  s.setItem(thumbStorageKey('c'), 'dc')
  // (d is missing on purpose — bulk clear must not count nonexistent entries)
  const cleared = clearAllThumbnails([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], s)
  eq(cleared, 3, 'clearAllThumbnails returns count of REMOVED entries (not list length)')
  eq(hasThumbnail('a', s), false, 'clearAllThumbnails wiped a')
  eq(hasThumbnail('b', s), false, 'clearAllThumbnails wiped b')
  eq(hasThumbnail('c', s), false, 'clearAllThumbnails wiped c')

  // Re-clear is a no-op — everything is gone.
  eq(clearAllThumbnails([{ id: 'a' }, { id: 'b' }], s), 0, 'clearAllThumbnails second pass: 0')

  // Malformed list entries are tolerated without crashing the run.
  s.setItem(thumbStorageKey('ok'), 'data')
  const mixed = clearAllThumbnails([null, undefined, {}, { id: '' }, { id: 99 }, { id: 'ok' }], s)
  eq(mixed, 1, 'clearAllThumbnails: only the one valid entry was cleared from a mixed list')

  // Defensive: bad inputs return 0 without touching storage.
  eq(clearAllThumbnails(null, s), 0, 'clearAllThumbnails: null list → 0')
  eq(clearAllThumbnails([], s), 0, 'clearAllThumbnails: empty list → 0')
  eq(clearAllThumbnails('not-an-array', s), 0, 'clearAllThumbnails: non-array → 0')
  eq(clearAllThumbnails([{ id: 'x' }], null), 0, 'clearAllThumbnails: no storage → 0')
}

// --- R16.06: summarizeBulkRebuild — withThumb / withoutThumb / total ---
{
  const s = makeFakeStorage()
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  // No thumbs cached yet → everyone is in withoutThumb.
  const empty = summarizeBulkRebuild(list, s)
  eq(empty.withThumb, 0, 'summarizeBulkRebuild: no cache → 0 withThumb')
  eq(empty.withoutThumb, 4, 'summarizeBulkRebuild: no cache → all 4 withoutThumb')
  eq(empty.total, 4, 'summarizeBulkRebuild: total counts every valid preset')
  s.setItem(thumbStorageKey('a'), 'data')
  s.setItem(thumbStorageKey('c'), 'data')
  const partial = summarizeBulkRebuild(list, s)
  eq(partial.withThumb, 2, 'summarizeBulkRebuild: 2 cached → 2 withThumb')
  eq(partial.withoutThumb, 2, 'summarizeBulkRebuild: 2 cached → 2 withoutThumb')
  eq(partial.total, 4, 'summarizeBulkRebuild: total unchanged when some are cached')

  // Malformed entries don't inflate the total.
  const mixed = summarizeBulkRebuild([null, { id: '' }, { id: 7 }, { id: 'a' }], s)
  eq(mixed.total, 1, 'summarizeBulkRebuild: skips malformed entries from total')
  eq(mixed.withThumb, 1, 'summarizeBulkRebuild: the one valid entry IS cached')
  eq(mixed.withoutThumb, 0, 'summarizeBulkRebuild: complementary count is correct')

  // Defensive: bad inputs return all-zero.
  const z1 = summarizeBulkRebuild(null, s)
  eq(z1.withThumb + z1.withoutThumb + z1.total, 0, 'summarizeBulkRebuild: null → all zero')
  const z2 = summarizeBulkRebuild([], s)
  eq(z2.withThumb + z2.withoutThumb + z2.total, 0, 'summarizeBulkRebuild: empty → all zero')

  // No storage: with no place to check, every preset is "not cached"
  // — total still counts valid entries so the UI knows the scale.
  const noStore = summarizeBulkRebuild(list, null)
  eq(noStore.total, 4, 'summarizeBulkRebuild: no storage still counts total')
  eq(noStore.withThumb, 0, 'summarizeBulkRebuild: no storage → 0 cached')
  eq(noStore.withoutThumb, 4, 'summarizeBulkRebuild: no storage → all uncached')
}

// --- R19.13: per-thumb metadata side-store + summarizeThumbAge ---

// Storage key shape parallels thumbStorageKey so a sweep can find both halves.
eq(thumbMetadataKey('spiral-galaxy'), 'preset-thumb-meta-spiral-galaxy', 'metadata key format')

// recordThumbMetadata: writes JSON-encoded metadata to the parallel key.
{
  const s = makeFakeStorage()
  const ok = recordThumbMetadata('p', { width: 200, height: 120, source: 'live' }, s)
  eq(ok, true, 'recordThumbMetadata: success returns true')
  const raw = s.getItem(thumbMetadataKey('p'))
  truthy(raw != null, 'metadata entry exists')
  const parsed = JSON.parse(raw)
  eq(parsed.width, 200, 'width recorded')
  eq(parsed.height, 120, 'height recorded')
  eq(parsed.source, 'live', 'source recorded')
  truthy(typeof parsed.capturedAt === 'string' && parsed.capturedAt.includes('T'),
    'capturedAt is ISO-8601')
}

// recordThumbMetadata: defensive — non-string/empty id, bad/missing dimensions,
// unknown source all sanitised or rejected.
{
  const s = makeFakeStorage()
  eq(recordThumbMetadata('', { width: 100, height: 100 }, s), false, 'empty id → false')
  eq(recordThumbMetadata(null, { width: 100, height: 100 }, s), false, 'null id → false')
  eq(recordThumbMetadata(123, { width: 100, height: 100 }, s), false, 'non-string id → false')
  eq(recordThumbMetadata('p', {}, null), false, 'no storage → false')

  // Missing dimensions fall back to THUMB_WIDTH/HEIGHT defaults.
  recordThumbMetadata('q', {}, s)
  const parsedQ = JSON.parse(s.getItem(thumbMetadataKey('q')))
  eq(parsedQ.width, THUMB_WIDTH, 'missing width → default')
  eq(parsedQ.height, THUMB_HEIGHT, 'missing height → default')
  eq(parsedQ.source, 'render', 'missing source → render')

  // Unknown source coerces to 'render'.
  recordThumbMetadata('r', { source: 'mystery' }, s)
  const parsedR = JSON.parse(s.getItem(thumbMetadataKey('r')))
  eq(parsedR.source, 'render', 'unknown source → render')

  // Negative / NaN dimensions fall back too.
  recordThumbMetadata('s', { width: -5, height: NaN }, s)
  const parsedS = JSON.parse(s.getItem(thumbMetadataKey('s')))
  eq(parsedS.width, THUMB_WIDTH, 'negative width → default')
  eq(parsedS.height, THUMB_HEIGHT, 'NaN height → default')
}

// readThumbMetadata: roundtrip + corrupt-data handling.
{
  const s = makeFakeStorage()
  eq(readThumbMetadata('absent', s), null, 'missing entry → null')
  recordThumbMetadata('p', { width: 240, height: 160, source: 'live' }, s)
  const md = readThumbMetadata('p', s)
  eq(md.width, 240, 'roundtrip: width')
  eq(md.height, 160, 'roundtrip: height')
  eq(md.source, 'live', 'roundtrip: source')
  truthy(typeof md.capturedAt === 'string' && md.capturedAt.length > 0, 'roundtrip: capturedAt')

  // Corrupt JSON → null (no crash).
  s.setItem(thumbMetadataKey('bad'), '{not-json')
  eq(readThumbMetadata('bad', s), null, 'corrupt JSON → null')

  // Wrong shape → null.
  s.setItem(thumbMetadataKey('arr'), '[1,2,3]')
  eq(readThumbMetadata('arr', s), null, 'array top-level → null')
  s.setItem(thumbMetadataKey('num'), '42')
  eq(readThumbMetadata('num', s), null, 'number top-level → null')

  // Missing capturedAt → null (the timestamp is what makes the badge meaningful).
  s.setItem(thumbMetadataKey('nocap'), JSON.stringify({ width: 100, height: 100, source: 'live' }))
  eq(readThumbMetadata('nocap', s), null, 'missing capturedAt → null')

  // Defensive: bad id/storage.
  eq(readThumbMetadata('', s), null, 'empty id → null')
  eq(readThumbMetadata(123, s), null, 'non-string id → null')
  eq(readThumbMetadata('p', null), null, 'no storage → null')

  // Partial-corruption: missing dimensions but valid capturedAt → defaults applied.
  s.setItem(thumbMetadataKey('partial'), JSON.stringify({ capturedAt: '2026-06-22T00:00:00Z' }))
  const partial = readThumbMetadata('partial', s)
  truthy(partial != null, 'partial-but-valid → object')
  eq(partial.width, THUMB_WIDTH, 'partial: width defaulted')
  eq(partial.height, THUMB_HEIGHT, 'partial: height defaulted')
  eq(partial.source, 'render', 'partial: source defaulted')
}

// clearThumbMetadata + cascade from clearThumbnail / clearAllThumbnails.
{
  const s = makeFakeStorage()
  recordThumbMetadata('p', { width: 100, height: 100 }, s)
  eq(clearThumbMetadata('p', s), true, 'clearThumbMetadata: present → true')
  eq(readThumbMetadata('p', s), null, 'metadata gone after clear')
  eq(clearThumbMetadata('p', s), false, 'second clear: nothing → false')
  eq(clearThumbMetadata('', s), false, 'empty id → false')
  eq(clearThumbMetadata('p', null), false, 'no storage → false')

  // Cascade through clearThumbnail — wiping the thumb also wipes metadata.
  s.setItem(thumbStorageKey('cascade'), 'data:image/jpeg;base64,xxx')
  recordThumbMetadata('cascade', { width: 100, height: 100 }, s)
  truthy(readThumbMetadata('cascade', s) != null, 'precondition: metadata present')
  clearThumbnail('cascade', s)
  eq(readThumbMetadata('cascade', s), null, 'clearThumbnail cascade wipes metadata too')

  // Cascade through clearAllThumbnails — same behaviour, bulk.
  s.setItem(thumbStorageKey('a'), 'd')
  s.setItem(thumbStorageKey('b'), 'd')
  recordThumbMetadata('a', { width: 100, height: 100 }, s)
  recordThumbMetadata('b', { width: 100, height: 100 }, s)
  truthy(readThumbMetadata('a', s) != null && readThumbMetadata('b', s) != null,
    'precondition: bulk metadata present')
  clearAllThumbnails([{ id: 'a' }, { id: 'b' }], s)
  eq(readThumbMetadata('a', s), null, 'clearAllThumbnails cascade wipes a metadata')
  eq(readThumbMetadata('b', s), null, 'clearAllThumbnails cascade wipes b metadata')
}

// summarizeThumbAge: returns a compact relative-time string.
{
  const baseIso = '2026-06-22T12:00:00Z'
  const base = Date.parse(baseIso)
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 1000),     'now',  '1s → now')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 4_999),    'now',  '4.999s → now')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 5_000),    '5s',   '5s threshold')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 59_999),   '59s',  'sub-minute → seconds')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 60_000),   '1m',   '60s → 1m')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 60 * 60_000), '1h', '60m → 1h')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 24 * 60 * 60_000), '1d', '24h → 1d')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 7 * 24 * 60 * 60_000), '1w', '7d → 1w')
  eq(summarizeThumbAge({ capturedAt: baseIso }, base + 52 * 7 * 24 * 60 * 60_000), '1y', '52w → 1y')

  // Future timestamps (capturedAt > now) clamp to "now" — never report negative ages.
  eq(summarizeThumbAge({ capturedAt: baseIso }, base - 10_000), 'now', 'future → now (no negative ages)')

  // Defensive: bad inputs → null.
  eq(summarizeThumbAge(null), null, 'null metadata → null')
  eq(summarizeThumbAge({}), null, 'no capturedAt → null')
  eq(summarizeThumbAge({ capturedAt: 'not-a-date' }), null, 'unparseable capturedAt → null')
  eq(summarizeThumbAge({ capturedAt: 42 }), null, 'non-string capturedAt → null')
}

// --- R20.19: rich-detail formatter + byte-size formatter ---
// formatByteSize across the boundaries.
{
  eq(formatByteSize(0), '0 B', '0 → 0 B')
  eq(formatByteSize(512), '512 B', 'sub-KB → bytes')
  eq(formatByteSize(1024), '1.0 KB', 'exactly 1KB')
  eq(formatByteSize(2048), '2.0 KB', '2KB')
  eq(formatByteSize(10 * 1024), '10 KB', '10KB → rounded (no decimal)')
  eq(formatByteSize(1024 * 1024), '1.0 MB', 'exactly 1MB')
  eq(formatByteSize(5 * 1024 * 1024), '5.0 MB', '5MB')
  eq(formatByteSize(50 * 1024 * 1024), '50 MB', '50MB → rounded')
  // Defensive: non-finite/negative → null.
  eq(formatByteSize(null), null, 'null → null')
  eq(formatByteSize(NaN), null, 'NaN → null')
  eq(formatByteSize(-100), null, 'negative → null')
  eq(formatByteSize(Infinity), null, 'Infinity → null')
  eq(formatByteSize('1000'), null, 'string → null')
}

// formatThumbDetails: defensive against bad input.
{
  eq(formatThumbDetails(null).length, 0, 'null → empty rows')
  eq(formatThumbDetails(undefined).length, 0, 'undefined → empty rows')
  eq(formatThumbDetails('not obj').length, 0, 'string → empty rows')
  eq(formatThumbDetails({}).length, 0, 'empty obj → empty rows (no capturedAt)')
}

// formatThumbDetails: minimal metadata (no rich fields) — produces
// 3 base rows: captured, source, resolution.
{
  const meta = {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'render',
  }
  const rows = formatThumbDetails(meta, Date.parse('2026-06-22T16:01:00.000Z'))
  if (rows.length !== 3) fail(`expected 3 base rows, got ${rows.length}`)
  const labels = rows.map(r => r.label)
  truthy(labels.includes('Captured'), 'Captured row present')
  truthy(labels.includes('Source'), 'Source row present')
  truthy(labels.includes('Resolution'), 'Resolution row present')
  // The captured row includes the relative age suffix when summarizeThumbAge returns one.
  const capturedRow = rows.find(r => r.label === 'Captured')
  truthy(capturedRow.value.includes('(1m ago)') || capturedRow.value.includes('ago'), 'captured row has age suffix')
  // Resolution row format.
  const resRow = rows.find(r => r.label === 'Resolution')
  truthy(resRow.value === '120\u00d780', `resolution = "120×80", got "${resRow.value}"`)
}

// formatThumbDetails: rich metadata (all fields) — produces 6 rows.
{
  const meta = {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'live',
    particleCount: 5000,
    captureMs: 250,
    byteSize: 12345,
  }
  const rows = formatThumbDetails(meta, Date.parse('2026-06-22T16:00:30.000Z'))
  if (rows.length !== 6) fail(`expected 6 rich rows, got ${rows.length}`)
  const map = Object.fromEntries(rows.map(r => [r.label, r.value]))
  truthy(map.Particles.includes('5,000') || map.Particles === '5000', 'Particles formatted with locale')
  eq(map['Render time'], '250 ms', 'Render time < 1s formatted as ms')
  truthy(map.Size.includes('KB'), 'Size formatted via formatByteSize')
}

// formatThumbDetails: render time >= 1s switches to seconds.
{
  const meta = {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'render',
    captureMs: 1500,
  }
  const rows = formatThumbDetails(meta, Date.parse('2026-06-22T16:00:30.000Z'))
  const renderRow = rows.find(r => r.label === 'Render time')
  truthy(renderRow.value === '1.50 s', `render >= 1s as seconds, got "${renderRow.value}"`)
}

// formatThumbDetails: partial rich fields — only the present ones get rows.
{
  const meta = {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'render',
    particleCount: 100,  // only this rich field
  }
  const rows = formatThumbDetails(meta, Date.parse('2026-06-22T16:00:30.000Z'))
  if (rows.length !== 4) fail(`expected 4 rows (3 base + Particles), got ${rows.length}`)
  truthy(rows.some(r => r.label === 'Particles'), 'Particles row present')
  truthy(!rows.some(r => r.label === 'Render time'), 'Render time row absent (no captureMs)')
  truthy(!rows.some(r => r.label === 'Size'), 'Size row absent (no byteSize)')
}

// formatThumbDetails: missing required field (no capturedAt) → empty rows.
{
  const meta = { width: 120, height: 80, source: 'render' }  // no capturedAt
  const rows = formatThumbDetails(meta)
  eq(rows.length, 2, 'missing capturedAt: only source + resolution rows')
}

// Source row gets a hint string when present (the UI surfaces it as a tooltip).
{
  const meta = {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'live',
  }
  const rows = formatThumbDetails(meta)
  const srcRow = rows.find(r => r.label === 'Source')
  truthy(typeof srcRow.hint === 'string' && srcRow.hint.length > 0, 'live source has hint string')
  // 'render' source also gets a (different) hint.
  const renderRows = formatThumbDetails({ ...meta, source: 'render' })
  const renderSrcRow = renderRows.find(r => r.label === 'Source')
  truthy(typeof renderSrcRow.hint === 'string' && renderSrcRow.hint.length > 0, 'render source has hint string')
  // The two hints differ — each describes its own capture path.
  truthy(srcRow.hint !== renderSrcRow.hint, 'live vs render hints differ')
}

// Rich metadata round-trips through record/read — the new optional
// fields survive a save/load cycle.
{
  const storage = makeFakeStorage()
  recordThumbMetadata('roundtrip-1', {
    width: 200, height: 100, source: 'live',
    particleCount: 5000, captureMs: 250, byteSize: 12345,
    capturedAt: '2026-06-22T16:00:00.000Z',
  }, storage)
  const read = readThumbMetadata('roundtrip-1', storage)
  eq(read.particleCount, 5000, 'particleCount survives round-trip')
  eq(read.captureMs, 250, 'captureMs survives round-trip')
  eq(read.byteSize, 12345, 'byteSize survives round-trip')
}

// Defensive: bad rich-field values are silently dropped on record.
{
  const storage = makeFakeStorage()
  recordThumbMetadata('def-1', {
    width: 100, height: 100, source: 'render',
    particleCount: -50,     // negative → dropped
    captureMs: NaN,         // NaN → dropped
    byteSize: 'huge',       // string → dropped
    capturedAt: '2026-06-22T16:00:00.000Z',
  }, storage)
  const read = readThumbMetadata('def-1', storage)
  eq(read.particleCount, undefined, 'negative particleCount dropped')
  eq(read.captureMs, undefined, 'NaN captureMs dropped')
  eq(read.byteSize, undefined, 'string byteSize dropped')
}

console.log('PASS: presetThumbnails R19.13 metadata side-store + relative-time formatter')
