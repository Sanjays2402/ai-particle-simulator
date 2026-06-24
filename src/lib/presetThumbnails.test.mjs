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
  // R22.29 — per-thumb user note (free-form text)
  THUMB_NOTE_MAX_LEN, setThumbNote,
  // R23.34 — note filtering: substring matcher, projection, summary
  normalizeNoteQuery, noteMatchesQuery, presetsMatchingNote, summarizeNoteFilter,
  // R24.37 — note filter regex mode toggle
  NOTE_FILTER_MODE_SUBSTRING, NOTE_FILTER_MODE_REGEX, NOTE_FILTER_MODES,
  isValidNoteFilterMode, compileNoteRegex,
  noteMatchesQueryWithMode, isValidQueryForMode,
  presetsMatchingNoteWithMode, summarizeNoteFilterWithMode,
  // R25.42 — note-filter pattern history dropdown
  NOTE_FILTER_HISTORY_MAX, NOTE_FILTER_HISTORY_QUERY_MAX,
  sanitizeNoteFilterHistory, loadNoteFilterHistory, saveNoteFilterHistory,
  addNoteFilterHistoryEntry, removeNoteFilterHistoryEntry, clearNoteFilterHistory,
  // R26.42 — pin history entries (graduates R25.42)
  togglePinNoteFilterHistoryEntry, sortNoteFilterHistoryForDisplay,
  // R27.42 — bulk-unpin: footer button when >= 2 entries are pinned
  countPinnedNoteFilterHistoryEntries, bulkUnpinNoteFilterHistoryEntries,
  // R28.42 — Undo restore action for the bulk-unpin toast
  snapshotPinnedNoteFilterHistoryKeys, restorePinnedNoteFilterHistoryEntries,
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

// --- R22.29: setThumbNote + note round-trip + formatThumbDetails ----------

// THUMB_NOTE_MAX_LEN constant invariant.
{
  truthy(Number.isFinite(THUMB_NOTE_MAX_LEN), 'THUMB_NOTE_MAX_LEN is a finite number')
  truthy(THUMB_NOTE_MAX_LEN > 0, 'THUMB_NOTE_MAX_LEN > 0')
  truthy(THUMB_NOTE_MAX_LEN <= 1024, 'THUMB_NOTE_MAX_LEN bounded reasonably (≤1024) to keep storage small')
}

// Happy path — record metadata with a note + read it back.
{
  const s = makeFakeStorage()
  const okWrite = recordThumbMetadata('a', {
    width: 120, height: 80, source: 'live',
    capturedAt: '2026-06-22T16:00:00.000Z',
    note: 'good demo shot',
  }, s)
  truthy(okWrite, 'note write succeeds')
  const md = readThumbMetadata('a', s)
  eq(md.note, 'good demo shot', 'note round-trips through record+read')
}

// Note is trimmed on write.
{
  const s = makeFakeStorage()
  recordThumbMetadata('b', { capturedAt: '2026-06-22T16:00:00.000Z', note: '   spaced   ' }, s)
  eq(readThumbMetadata('b', s).note, 'spaced', 'note is trimmed on write')
}

// Note is length-capped on write.
{
  const s = makeFakeStorage()
  const huge = 'x'.repeat(THUMB_NOTE_MAX_LEN + 100)
  recordThumbMetadata('c', { capturedAt: '2026-06-22T16:00:00.000Z', note: huge }, s)
  const md = readThumbMetadata('c', s)
  eq(md.note.length, THUMB_NOTE_MAX_LEN, 'note is length-capped on write')
}

// Empty / whitespace note is dropped (not stored as empty string).
{
  const s = makeFakeStorage()
  recordThumbMetadata('d', { capturedAt: '2026-06-22T16:00:00.000Z', note: '' }, s)
  eq(readThumbMetadata('d', s).note, undefined, 'empty note is dropped')
  recordThumbMetadata('e', { capturedAt: '2026-06-22T16:00:00.000Z', note: '   ' }, s)
  eq(readThumbMetadata('e', s).note, undefined, 'whitespace-only note is dropped')
}

// Non-string note types silently skip (defensive).
{
  const s = makeFakeStorage()
  recordThumbMetadata('f', { capturedAt: '2026-06-22T16:00:00.000Z', note: 42 }, s)
  eq(readThumbMetadata('f', s).note, undefined, 'numeric note dropped')
  recordThumbMetadata('g', { capturedAt: '2026-06-22T16:00:00.000Z', note: null }, s)
  eq(readThumbMetadata('g', s).note, undefined, 'null note dropped')
  recordThumbMetadata('h', { capturedAt: '2026-06-22T16:00:00.000Z', note: { x: 1 } }, s)
  eq(readThumbMetadata('h', s).note, undefined, 'object note dropped')
}

// Read-side sanitization — corrupt persisted note still parses.
{
  const s = makeFakeStorage()
  // Stuff a hand-rolled JSON with an over-long note.
  const huge = 'y'.repeat(THUMB_NOTE_MAX_LEN + 500)
  s.setItem(thumbMetadataKey('i'), JSON.stringify({
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'live',
    note: huge,
  }))
  const md = readThumbMetadata('i', s)
  eq(md.note.length, THUMB_NOTE_MAX_LEN, 'read-side caps an over-long persisted note')
}
{
  const s = makeFakeStorage()
  // Note field present but non-string.
  s.setItem(thumbMetadataKey('j'), JSON.stringify({
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'live',
    note: 99,
  }))
  const md = readThumbMetadata('j', s)
  eq(md.note, undefined, 'non-string note on read returns undefined (no junk)')
  // Other fields still intact.
  eq(md.width, 120, 'corrupt note doesn\'t poison the read of other fields')
  eq(md.source, 'live', 'corrupt note doesn\'t poison source')
}

// setThumbNote happy path — adds a note to existing metadata.
{
  const s = makeFakeStorage()
  recordThumbMetadata('k1', { capturedAt: '2026-06-22T16:00:00.000Z' }, s)
  const okSet = setThumbNote('k1', 'first note', s)
  truthy(okSet, 'setThumbNote returns truthy on success')
  eq(readThumbMetadata('k1', s).note, 'first note', 'setThumbNote adds note to existing meta')
}

// setThumbNote — updates existing note in place.
{
  const s = makeFakeStorage()
  recordThumbMetadata('k2', { capturedAt: '2026-06-22T16:00:00.000Z', note: 'initial' }, s)
  eq(readThumbMetadata('k2', s).note, 'initial', 'sanity: initial note present')
  setThumbNote('k2', 'updated', s)
  eq(readThumbMetadata('k2', s).note, 'updated', 'setThumbNote updates existing note')
}

// setThumbNote — empty / null / whitespace CLEARS the note field.
{
  const s = makeFakeStorage()
  recordThumbMetadata('k3', { capturedAt: '2026-06-22T16:00:00.000Z', note: 'to clear' }, s)
  setThumbNote('k3', '', s)
  eq(readThumbMetadata('k3', s).note, undefined, 'empty string clears note')
  // And the rest of the metadata survives.
  truthy(readThumbMetadata('k3', s).capturedAt, 'clearing note preserves capturedAt')
}
{
  const s = makeFakeStorage()
  recordThumbMetadata('k4', { capturedAt: '2026-06-22T16:00:00.000Z', note: 'to clear' }, s)
  setThumbNote('k4', null, s)
  eq(readThumbMetadata('k4', s).note, undefined, 'null clears note')
}
{
  const s = makeFakeStorage()
  recordThumbMetadata('k5', { capturedAt: '2026-06-22T16:00:00.000Z', note: 'to clear' }, s)
  setThumbNote('k5', '   \t  ', s)
  eq(readThumbMetadata('k5', s).note, undefined, 'whitespace-only clears note')
}

// setThumbNote — trims + length-caps just like recordThumbMetadata.
{
  const s = makeFakeStorage()
  recordThumbMetadata('k6', { capturedAt: '2026-06-22T16:00:00.000Z' }, s)
  setThumbNote('k6', '   trimmed   ', s)
  eq(readThumbMetadata('k6', s).note, 'trimmed', 'setThumbNote trims')
  const huge = 'z'.repeat(THUMB_NOTE_MAX_LEN + 50)
  setThumbNote('k6', huge, s)
  eq(readThumbMetadata('k6', s).note.length, THUMB_NOTE_MAX_LEN, 'setThumbNote length-caps')
}

// setThumbNote — defensive return values.
{
  const s = makeFakeStorage()
  // No pre-existing metadata for this id → false (we DON'T mint a
  // new metadata envelope just for a note; notes attach to existing
  // thumbs only).
  eq(setThumbNote('nonexistent', 'oops', s), false,
    'setThumbNote without pre-existing metadata → false')
  // Bad presetId → false.
  eq(setThumbNote('', 'oops', s), false, 'empty presetId → false')
  eq(setThumbNote(null, 'oops', s), false, 'null presetId → false')
  eq(setThumbNote(undefined, 'oops', s), false, 'undefined presetId → false')
  eq(setThumbNote(123, 'oops', s), false, 'numeric presetId → false')
  // No storage → false.
  eq(setThumbNote('k1', 'oops', undefined, /* storage missing */), false,
    'no storage available → false')
}

// setThumbNote — ref-equal no-op patterns.
{
  const s = makeFakeStorage()
  recordThumbMetadata('k7', { capturedAt: '2026-06-22T16:00:00.000Z', note: 'same' }, s)
  // Setting the SAME note again is a no-op but still returns true.
  truthy(setThumbNote('k7', 'same', s), 'same-value re-set returns true (no-op)')
  // Clearing an already-empty note is a no-op but returns true.
  setThumbNote('k7', '', s)  // clear
  truthy(setThumbNote('k7', '', s), 'clear-when-already-clear returns true (no-op)')
}

// setThumbNote — preserves other metadata fields untouched.
{
  const s = makeFakeStorage()
  recordThumbMetadata('k8', {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 200, height: 100, source: 'render',
    particleCount: 5000, captureMs: 42, byteSize: 1024,
  }, s)
  setThumbNote('k8', 'attached', s)
  const md = readThumbMetadata('k8', s)
  eq(md.note,           'attached',                'note attached')
  eq(md.capturedAt,     '2026-06-22T16:00:00.000Z', 'capturedAt preserved')
  eq(md.width,          200,                        'width preserved')
  eq(md.height,         100,                        'height preserved')
  eq(md.source,         'render',                   'source preserved')
  eq(md.particleCount,  5000,                       'particleCount preserved')
  eq(md.captureMs,      42,                         'captureMs preserved')
  eq(md.byteSize,       1024,                       'byteSize preserved')
}

// setThumbNote — defensive against corrupt persisted metadata.
{
  const s = makeFakeStorage()
  s.setItem(thumbMetadataKey('corrupt-1'), 'not-json{{{')
  eq(setThumbNote('corrupt-1', 'note', s), false,
    'setThumbNote bails on corrupt JSON (returns false rather than overwriting)')
  s.setItem(thumbMetadataKey('corrupt-2'), '"a string, not an object"')
  eq(setThumbNote('corrupt-2', 'note', s), false,
    'setThumbNote bails on non-object JSON')
  s.setItem(thumbMetadataKey('corrupt-3'), '[1,2,3]')
  eq(setThumbNote('corrupt-3', 'note', s), false,
    'setThumbNote bails on array-top-level JSON')
}

// formatThumbDetails — note row is emitted with kind='note'.
{
  const md = {
    capturedAt: '2026-06-22T16:00:00.000Z',
    width: 120, height: 80, source: 'live',
    note: 'good demo shot',
  }
  const rows = formatThumbDetails(md, Date.parse(md.capturedAt) + 1000)
  const noteRow = rows.find(r => r.key === 'note')
  truthy(noteRow, 'formatThumbDetails emits a note row when present')
  eq(noteRow.label, 'Note', 'note row label')
  eq(noteRow.value, 'good demo shot', 'note row value matches the stored note')
  eq(noteRow.kind,  'note', 'note row tagged with kind for distinct rendering')
}

// formatThumbDetails — no note → no note row.
{
  const md = { capturedAt: '2026-06-22T16:00:00.000Z', width: 120, height: 80, source: 'live' }
  const rows = formatThumbDetails(md)
  truthy(rows.every(r => r.key !== 'note'), 'no note → no note row')
}

// formatThumbDetails — empty / whitespace note is treated as absent.
{
  const md1 = { capturedAt: '2026-06-22T16:00:00.000Z', width: 120, height: 80, source: 'live', note: '' }
  const md2 = { capturedAt: '2026-06-22T16:00:00.000Z', width: 120, height: 80, source: 'live', note: '   ' }
  truthy(formatThumbDetails(md1).every(r => r.key !== 'note'), 'empty-string note → no note row')
  truthy(formatThumbDetails(md2).every(r => r.key !== 'note'), 'whitespace note → no note row')
}

// clearThumbMetadata + clearThumbnail cascade still works WITH notes.
{
  const s = makeFakeStorage()
  recordThumbMetadata('cascade', { capturedAt: '2026-06-22T16:00:00.000Z', note: 'will be wiped' }, s)
  eq(readThumbMetadata('cascade', s).note, 'will be wiped', 'sanity: note present')
  clearThumbMetadata('cascade', s)
  eq(readThumbMetadata('cascade', s), null, 'clearThumbMetadata wipes meta incl. note')
}

console.log('PASS: setThumbNote + note round-trip + formatThumbDetails note row (R22.29, ~50 asserts)')

// --- R23.34: note filtering for the carousel ---------------------------
//
// Storage shim shared across the block so every preset's metadata can
// be seeded in one place. We use Map under the hood (real localStorage
// returns string|null and ignores .removeItem on missing keys; Map
// + a thin wrapper matches that close enough for the matcher's needs).
function makeNoteFilterShim() {
  const m = new Map()
  return {
    getItem: (k) => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    _size: () => m.size,
  }
}

// --- normalizeNoteQuery: trim + lowercase ---
eq(normalizeNoteQuery('demo'), 'demo',          'lowercase no-op for already-lower')
eq(normalizeNoteQuery('DEMO'), 'demo',          'lowercase')
eq(normalizeNoteQuery('  DemO  '), 'demo',      'trim + lowercase combined')
eq(normalizeNoteQuery(''), '',                  'empty stays empty')
eq(normalizeNoteQuery('   '), '',               'whitespace-only → empty')
eq(normalizeNoteQuery(null), '',                'null → empty')
eq(normalizeNoteQuery(undefined), '',           'undefined → empty')
eq(normalizeNoteQuery(42), '',                  'number → empty (non-string)')
eq(normalizeNoteQuery({}), '',                  'object → empty')

// --- noteMatchesQuery: substring, case-insensitive ---
eq(noteMatchesQuery('good demo shot', 'demo'), true,        'exact substring match')
eq(noteMatchesQuery('good demo shot', 'DEMO'), true,        'case-insensitive query')
eq(noteMatchesQuery('GOOD DEMO SHOT', 'demo'), true,        'case-insensitive note')
eq(noteMatchesQuery('Good Demo Shot', 'Demo Shot'), true,   'multi-word substring')
eq(noteMatchesQuery('use for OG card', 'og'), true,         'mid-word match')
eq(noteMatchesQuery('cherry blossoms', 'demo'), false,      'no match')
eq(noteMatchesQuery('cherry', 'cherry blossoms'), false,    'query longer than note')

// Empty query matches every non-empty note.
eq(noteMatchesQuery('anything', ''), true,        'empty query matches')
eq(noteMatchesQuery('anything', '   '), true,     'whitespace query matches')
eq(noteMatchesQuery('anything', null), true,      'null query matches')

// Empty / non-string note never matches.
eq(noteMatchesQuery('', 'demo'), false,           'empty note never matches')
eq(noteMatchesQuery(null, 'demo'), false,         'null note never matches')
eq(noteMatchesQuery(undefined, 'demo'), false,    'undefined note never matches')
eq(noteMatchesQuery(42, 'demo'), false,           'number note → no match')
eq(noteMatchesQuery({}, 'demo'), false,           'object note → no match')

// --- presetsMatchingNote: lib-level projection ---
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'good demo shot' }, s)
  recordThumbMetadata('b', { note: 'wrong colors' }, s)
  recordThumbMetadata('c', { note: 'use for OG card' }, s)
  recordThumbMetadata('d', {}, s)  // no note
  // e has no metadata at all (e.g. fresh preset never captured)
  const presets = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' },
  ]
  const matchDemo = presetsMatchingNote(presets, 'demo', s)
  eq(matchDemo.length, 1,                'one preset matches "demo"')
  eq(matchDemo[0].id, 'a',               'matching preset is a')

  const matchUpper = presetsMatchingNote(presets, 'DEMO', s)
  eq(matchUpper.length, 1,               'uppercase query matches same preset')

  const matchSubstring = presetsMatchingNote(presets, 'or', s)
  eq(matchSubstring.length, 2,           '"or" matches "wrong colors" + "for OG card"')

  const matchNone = presetsMatchingNote(presets, 'nonexistent', s)
  eq(matchNone.length, 0,                'no matches → empty array')
}

// Empty query: returns the input array unchanged (no-op semantics so
// the carousel renders the full list without a special-case branch).
{
  const s = makeNoteFilterShim()
  const presets = [{ id: 'a' }, { id: 'b' }]
  const out = presetsMatchingNote(presets, '', s)
  truthy(out === presets, 'empty query returns input array by reference')
  const out2 = presetsMatchingNote(presets, '   ', s)
  truthy(out2 === presets, 'whitespace query returns input array by reference')
  const out3 = presetsMatchingNote(presets, null, s)
  truthy(out3 === presets, 'null query returns input array by reference')
}

// Defensive: non-array presets → empty.
{
  const s = makeNoteFilterShim()
  eq(presetsMatchingNote(null, 'demo', s).length, 0,        'null presets → []')
  eq(presetsMatchingNote(undefined, 'demo', s).length, 0,   'undefined presets → []')
  eq(presetsMatchingNote('not-array', 'demo', s).length, 0, 'string presets → []')
  eq(presetsMatchingNote({}, 'demo', s).length, 0,          'object presets → []')
}

// Defensive: missing storage → empty.
{
  const presets = [{ id: 'a' }, { id: 'b' }]
  eq(presetsMatchingNote(presets, 'demo', null).length, 0, 'null storage → []')
}

// Defensive: malformed preset entries skipped silently.
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'good demo shot' }, s)
  const presets = [
    null, undefined,
    { /* no id */ },
    { id: '' },           // empty id
    { id: 42 },           // non-string id
    { id: 'a' },          // valid
  ]
  const out = presetsMatchingNote(presets, 'demo', s)
  eq(out.length, 1,       'malformed preset entries skipped')
  eq(out[0].id, 'a',      'only valid preset returned')
}

// Presets with no note in metadata are skipped (note-less tile can't
// possibly match a non-empty query).
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('hasNote', { note: 'demo' }, s)
  recordThumbMetadata('noNote', {}, s)  // metadata present but no note
  const presets = [{ id: 'hasNote' }, { id: 'noNote' }]
  const out = presetsMatchingNote(presets, 'demo', s)
  eq(out.length, 1,       'only preset with note matches')
  eq(out[0].id, 'hasNote', 'note-less preset skipped')
}

// Order preserved — output mirrors input order, no sort.
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('z', { note: 'demo' }, s)
  recordThumbMetadata('a', { note: 'demo' }, s)
  recordThumbMetadata('m', { note: 'demo' }, s)
  const out = presetsMatchingNote([{ id: 'z' }, { id: 'a' }, { id: 'm' }], 'demo', s)
  eq(out.length, 3, 'all three match')
  eq(out[0].id, 'z', 'order preserved [0]')
  eq(out[1].id, 'a', 'order preserved [1]')
  eq(out[2].id, 'm', 'order preserved [2]')
}

// --- summarizeNoteFilter: count-only projection ---
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'good demo shot' }, s)
  recordThumbMetadata('b', { note: 'wrong colors' }, s)
  recordThumbMetadata('c', { note: 'use for OG card' }, s)
  recordThumbMetadata('d', {}, s)
  const presets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
  const all = summarizeNoteFilter(presets, '', s)
  eq(all.matching, 3,           'empty query matches every noted preset')
  eq(all.totalWithNotes, 3,     'totalWithNotes counts non-empty notes')

  const filtered = summarizeNoteFilter(presets, 'demo', s)
  eq(filtered.matching, 1,        '"demo" matches one')
  eq(filtered.totalWithNotes, 3,  'totalWithNotes unchanged by query')

  const nomatch = summarizeNoteFilter(presets, 'nonexistent', s)
  eq(nomatch.matching, 0,         'no-match returns 0 matching')
  eq(nomatch.totalWithNotes, 3,   'totalWithNotes unchanged')
}

// summarizeNoteFilter defensive: non-array / missing storage.
{
  const sNull = summarizeNoteFilter(null, 'demo', makeNoteFilterShim())
  eq(sNull.matching, 0,         'null presets → 0 matching')
  eq(sNull.totalWithNotes, 0,   'null presets → 0 totalWithNotes')
  const presets = [{ id: 'a' }]
  const sStore = summarizeNoteFilter(presets, 'demo', null)
  eq(sStore.matching, 0,        'null storage → 0 matching')
  eq(sStore.totalWithNotes, 0,  'null storage → 0 totalWithNotes')
}

// Trim semantics consistent between query + lookup so a user typing
// "  Demo  " surfaces the same tile as "demo".
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'good demo shot' }, s)
  const out = presetsMatchingNote([{ id: 'a' }], '  DEMO  ', s)
  eq(out.length, 1,       'padded uppercase query matches lowercase note')
}

// Match against a NOTE that was passed in with surrounding whitespace —
// recordThumbMetadata's trim contract means the persisted note is
// already stripped, so the matcher sees the clean string.
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: '   spaced note   ' }, s)
  const out = presetsMatchingNote([{ id: 'a' }], 'spaced', s)
  eq(out.length, 1,                                'matches the trimmed-by-record note')
  eq(readThumbMetadata('a', s).note, 'spaced note', 'sanity: persisted note is trimmed')
}

// Substring boundary edge: query is the full note.
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'demo' }, s)
  eq(presetsMatchingNote([{ id: 'a' }], 'demo', s).length, 1, 'full-note query matches')
  eq(presetsMatchingNote([{ id: 'a' }], 'demos', s).length, 0, 'query longer than note → no match')
}

console.log('PASS: presetsMatchingNote + summarizeNoteFilter + noteMatchesQuery + normalizeNoteQuery (R23.34, ~60 asserts)')

// --- R24.37: note filter regex mode ------------------------------------

// Sanity: modes exposed + isValidNoteFilterMode predicate.
eq(NOTE_FILTER_MODE_SUBSTRING, 'substring',  'substring mode constant')
eq(NOTE_FILTER_MODE_REGEX,     'regex',      'regex mode constant')
eq(NOTE_FILTER_MODES.length, 2, 'NOTE_FILTER_MODES has 2 entries')
eq(NOTE_FILTER_MODES[0], 'substring', 'NOTE_FILTER_MODES[0] = substring')
eq(NOTE_FILTER_MODES[1], 'regex',     'NOTE_FILTER_MODES[1] = regex')
eq(isValidNoteFilterMode('substring'), true,  'substring is valid')
eq(isValidNoteFilterMode('regex'),     true,  'regex is valid')
eq(isValidNoteFilterMode('nope'),      false, 'unknown mode is invalid')
eq(isValidNoteFilterMode(null),        false, 'null is invalid')
eq(isValidNoteFilterMode(undefined),   false, 'undefined is invalid')
eq(isValidNoteFilterMode(42),          false, 'number is invalid')

// --- compileNoteRegex ---
{
  const re = compileNoteRegex('demo')
  truthy(re instanceof RegExp,            'valid pattern -> RegExp')
  eq(re.flags, 'i',                   'always case-insensitive')
  truthy(re.test('demo'),                 'matches the original')
  truthy(re.test('DEMO'),                 'case-insensitive match')
}
{
  // Anchors + alternation + character class — real regex syntax.
  const re = compileNoteRegex('^demo|test$')
  truthy(re instanceof RegExp,            'alternation compiles')
  truthy(re.test('demo shot'),            'leading anchor matches')
  truthy(re.test('one test'),             'trailing anchor matches')
  truthy(!re.test('no demo here yes'),    'no anchor match -> false')
}
{
  // Empty / whitespace / non-string -> null.
  eq(compileNoteRegex(''),        null, 'empty -> null')
  eq(compileNoteRegex('   '),     null, 'whitespace -> null')
  eq(compileNoteRegex(null),      null, 'null -> null')
  eq(compileNoteRegex(undefined), null, 'undefined -> null')
  eq(compileNoteRegex(42),        null, 'number -> null')
  eq(compileNoteRegex({}),        null, 'object -> null')
}
{
  // Invalid patterns -> null (no throw).
  eq(compileNoteRegex('['),       null, 'unclosed bracket -> null')
  eq(compileNoteRegex('(?<'),     null, 'malformed lookbehind -> null')
  eq(compileNoteRegex('\\'),      null, 'trailing backslash -> null')
  eq(compileNoteRegex('*'),       null, 'leading quantifier -> null')
}
{
  // Length cap (256 chars) — pathological ReDoS guard.
  const long = 'a'.repeat(257)
  eq(compileNoteRegex(long), null, 'pattern over 256 chars -> null')
  const ok256 = 'a'.repeat(256)
  truthy(compileNoteRegex(ok256) instanceof RegExp, 'exactly 256 chars compiles')
}

// --- noteMatchesQueryWithMode ---
// Substring mode delegates to noteMatchesQuery — sanity-checked here.
{
  eq(noteMatchesQueryWithMode('good demo', 'demo', 'substring'), true,
    'substring: substring match')
  eq(noteMatchesQueryWithMode('good demo', 'DEMO', 'substring'), true,
    'substring: case-insensitive')
  eq(noteMatchesQueryWithMode('good demo', 'absent', 'substring'), false,
    'substring: non-match')
  // Empty query: matches non-empty note (composable contract).
  eq(noteMatchesQueryWithMode('anything', '', 'substring'),    true, 'substring: empty matches')
  eq(noteMatchesQueryWithMode('anything', null, 'substring'),  true, 'substring: null matches')
}
// Regex mode.
{
  // Plain literal matches like substring.
  eq(noteMatchesQueryWithMode('good demo', 'demo', 'regex'), true,
    'regex: literal match')
  // Pattern-feature paths only available in regex mode.
  eq(noteMatchesQueryWithMode('demo shot', '^demo', 'regex'), true,
    'regex: leading anchor matches')
  eq(noteMatchesQueryWithMode('not demo', '^demo', 'regex'), false,
    'regex: leading anchor non-match (substring would match!)')
  eq(noteMatchesQueryWithMode('demo|test', 'demo\\|', 'regex'), true,
    'regex: escaped alternation literal')
  eq(noteMatchesQueryWithMode('hello world', 'h.llo', 'regex'), true,
    'regex: wildcard match')
  // Case-insensitive in regex mode.
  eq(noteMatchesQueryWithMode('HELLO', 'hello', 'regex'), true,
    'regex: case-insensitive')
  // Invalid pattern -> no match (NOT a substring fallback).
  eq(noteMatchesQueryWithMode('demo [abc', '[', 'regex'), false,
    'regex: invalid pattern -> no match (no substring fallback)')
  // Empty query: matches every non-empty note (composable, mirrors substring).
  eq(noteMatchesQueryWithMode('anything', '', 'regex'),    true, 'regex: empty matches')
  eq(noteMatchesQueryWithMode('anything', null, 'regex'),  true, 'regex: null matches')
  // Non-string note -> no match in either mode.
  eq(noteMatchesQueryWithMode(null,      'demo', 'regex'),     false, 'regex: null note')
  eq(noteMatchesQueryWithMode(undefined, 'demo', 'regex'),     false, 'regex: undef note')
  eq(noteMatchesQueryWithMode(42,        'demo', 'regex'),     false, 'regex: number note')
}
// Mode arg defaults to substring (back-compat).
{
  eq(noteMatchesQueryWithMode('good demo', 'demo'), true, 'default mode is substring')
}
// Unknown mode falls back to substring.
{
  eq(noteMatchesQueryWithMode('good demo', 'demo', 'bogus'), true,
    'unknown mode -> substring fallback')
}

// --- isValidQueryForMode ---
{
  // Substring mode: every query is "usable".
  eq(isValidQueryForMode('demo',       'substring'), true,  'substring: literal usable')
  eq(isValidQueryForMode('[abc',       'substring'), true,  'substring: any string usable')
  eq(isValidQueryForMode('',           'substring'), true,  'substring: empty usable (no-op)')
  eq(isValidQueryForMode('   ',        'substring'), true,  'substring: whitespace usable')
  eq(isValidQueryForMode(null,         'substring'), true,  'substring: null usable')
  // Regex mode: empty usable, otherwise must compile.
  eq(isValidQueryForMode('demo',       'regex'),     true,  'regex: literal usable')
  eq(isValidQueryForMode('h.llo',      'regex'),     true,  'regex: pattern usable')
  eq(isValidQueryForMode('^demo$',     'regex'),     true,  'regex: anchors usable')
  eq(isValidQueryForMode('[abc',       'regex'),     false, 'regex: unclosed bracket NOT usable')
  eq(isValidQueryForMode('(?<',        'regex'),     false, 'regex: malformed lookbehind NOT usable')
  eq(isValidQueryForMode('',           'regex'),     true,  'regex: empty usable (no-op)')
  eq(isValidQueryForMode('   ',        'regex'),     true,  'regex: whitespace usable')
  eq(isValidQueryForMode(null,         'regex'),     true,  'regex: null usable')
  eq(isValidQueryForMode(undefined,    'regex'),     true,  'regex: undefined usable')
  // Default mode = substring.
  eq(isValidQueryForMode('[abc'), true, 'default mode = substring (always usable)')
  // Unknown mode falls back to substring.
  eq(isValidQueryForMode('[abc', 'bogus'), true, 'unknown mode -> substring')
}

// --- presetsMatchingNoteWithMode ---
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'good demo shot' }, s)
  recordThumbMetadata('b', { note: 'demo and more' }, s)
  recordThumbMetadata('c', { note: 'unrelated tag' }, s)
  recordThumbMetadata('d', {}, s)   // no note
  const presets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]
  // Substring path delegates to presetsMatchingNote.
  const subResults = presetsMatchingNoteWithMode(presets, 'demo', 'substring', s)
  eq(subResults.length, 2, 'substring mode finds 2')
  // Regex path: anchor lets us find only LEADING "demo".
  const regResults = presetsMatchingNoteWithMode(presets, '^demo', 'regex', s)
  eq(regResults.length, 1, 'regex ^demo -> only b')
  eq(regResults[0].id, 'b', 'regex ^demo matches b')
  // Empty query under regex mode -> input array unchanged (no-op semantic).
  const empty = presetsMatchingNoteWithMode(presets, '', 'regex', s)
  eq(empty, presets, 'regex+empty -> input ref unchanged')
  // Invalid regex -> empty subset.
  const invalid = presetsMatchingNoteWithMode(presets, '[', 'regex', s)
  eq(invalid.length, 0, 'invalid regex -> empty []')
  // Defensive: null presets.
  eq(presetsMatchingNoteWithMode(null, 'demo', 'regex', s).length, 0, 'null presets -> []')
  // Default mode = substring.
  eq(presetsMatchingNoteWithMode(presets, 'demo').length || 0 > 0
     || presetsMatchingNoteWithMode(presets, 'demo', undefined, s).length, 2,
    'default mode delegates to substring')
}

// --- summarizeNoteFilterWithMode ---
{
  const s = makeNoteFilterShim()
  recordThumbMetadata('a', { note: 'good demo shot' }, s)
  recordThumbMetadata('b', { note: 'demo here too' }, s)
  recordThumbMetadata('c', { note: 'unrelated' }, s)
  const presets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  // Empty query -> matches all tagged.
  const all = summarizeNoteFilterWithMode(presets, '', 'regex', s)
  eq(all.matching, 3,        'regex+empty: matches every tagged tile')
  eq(all.totalWithNotes, 3,  'regex+empty: totalWithNotes counted')
  // Regex match.
  const reg = summarizeNoteFilterWithMode(presets, '^demo', 'regex', s)
  eq(reg.matching, 1,        'regex ^demo matches 1')
  eq(reg.totalWithNotes, 3,  'totalWithNotes unaffected by query')
  // Invalid regex -> 0 matching but totalWithNotes still accurate.
  const bad = summarizeNoteFilterWithMode(presets, '[', 'regex', s)
  eq(bad.matching, 0,        'invalid regex -> 0 matching')
  eq(bad.totalWithNotes, 3,  'invalid regex still counts totalWithNotes')
  // Substring path delegates to summarizeNoteFilter.
  const sub = summarizeNoteFilterWithMode(presets, 'demo', 'substring', s)
  eq(sub.matching, 2, 'substring mode still counts substring matches')
}

console.log('PASS: noteMatchesQueryWithMode + presetsMatchingNoteWithMode + summarizeNoteFilterWithMode + compileNoteRegex (R24.37, regex mode toggle, ~70 asserts)')

// -----------------------------------------------------------------
// R25.42: Note-filter pattern history (dropdown)
// -----------------------------------------------------------------

// Constants exist + sensible.
{
  eq(typeof NOTE_FILTER_HISTORY_MAX, 'number', 'MAX is a number')
  truthy(NOTE_FILTER_HISTORY_MAX > 0, 'MAX > 0')
  truthy(NOTE_FILTER_HISTORY_MAX <= 50, 'MAX reasonable (<=50)')
  eq(typeof NOTE_FILTER_HISTORY_QUERY_MAX, 'number', 'query max is a number')
  truthy(NOTE_FILTER_HISTORY_QUERY_MAX >= 128, 'query max >= 128 chars')
}

// sanitizeNoteFilterHistory — happy + defensive.
{
  // Bad inputs → [].
  if (sanitizeNoteFilterHistory(null).length !== 0) fail('null input → []')
  if (sanitizeNoteFilterHistory(undefined).length !== 0) fail('undefined input → []')
  if (sanitizeNoteFilterHistory({}).length !== 0) fail('object input → []')
  if (sanitizeNoteFilterHistory('str').length !== 0) fail('string input → []')
  if (sanitizeNoteFilterHistory(42).length !== 0) fail('number input → []')
  // Bad entries dropped.
  const partial = sanitizeNoteFilterHistory([
    null, undefined, 'str', 42,
    { query: '' },                                // empty query
    { query: '  ' },                              // whitespace
    { query: 'a'.repeat(NOTE_FILTER_HISTORY_QUERY_MAX + 1) },   // too long
    { query: 'good', mode: 'substring' },         // valid
    { query: 'demo', mode: 'invalid-mode' },      // mode coerces
    { query: '^demo$', mode: 'regex' },           // valid
  ])
  eq(partial.length, 3, '3 valid entries kept')
  eq(partial[0].query, 'good', 'first valid kept')
  eq(partial[1].mode, 'substring', 'invalid mode coerces to substring')
  eq(partial[2].mode, 'regex', 'regex mode preserved')
  // Cap enforced.
  const longList = Array.from({ length: NOTE_FILTER_HISTORY_MAX + 5 }, (_, i) =>
    ({ query: `q${i}`, mode: 'substring' }))
  eq(sanitizeNoteFilterHistory(longList).length, NOTE_FILTER_HISTORY_MAX, 'cap enforced')
  // Trim applied.
  eq(sanitizeNoteFilterHistory([{ query: '  demo  ' }])[0].query, 'demo', 'trimmed')
  // addedAt back-fills if missing or non-finite.
  const e = sanitizeNoteFilterHistory([{ query: 'x', addedAt: NaN }])
  truthy(Number.isFinite(e[0].addedAt), 'NaN addedAt → backfilled')
  const e2 = sanitizeNoteFilterHistory([{ query: 'x', addedAt: 12345 }])
  eq(e2[0].addedAt, 12345, 'finite addedAt preserved')
}

// addNoteFilterHistoryEntry — MRU semantics.
{
  // Empty/whitespace query → no-op (returns input ref).
  const empty = []
  if (addNoteFilterHistoryEntry(empty, '', 'substring') !== empty) fail('empty query → no-op')
  if (addNoteFilterHistoryEntry(empty, '   ', 'regex') !== empty) fail('whitespace query → no-op')
  if (addNoteFilterHistoryEntry(empty, null, 'substring') !== empty) fail('null query → no-op')
  if (addNoteFilterHistoryEntry(empty, 42, 'substring') !== empty) fail('non-string query → no-op')
  // First entry: appears at head.
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  eq(list.length, 1, 'first entry added')
  eq(list[0].query, 'demo', 'query saved')
  eq(list[0].mode, 'substring', 'mode saved')
  eq(list[0].addedAt, 1000, 'addedAt seeded')
  // Second entry: head, first slides to second.
  list = addNoteFilterHistoryEntry(list, 'test', 'regex', 2000)
  eq(list.length, 2, 'second entry added')
  eq(list[0].query, 'test', 'newest at head')
  eq(list[1].query, 'demo', 'older slides down')
  // Duplicate (same query + mode): moves existing to head — doesn't dupe.
  list = addNoteFilterHistoryEntry(list, 'demo', 'substring', 3000)
  eq(list.length, 2, 'no dupe')
  eq(list[0].query, 'demo', 'dup moved to head')
  eq(list[1].query, 'test', 'test slid down')
  // Different mode same query: separate entry (regex 'demo' != substring 'demo').
  list = addNoteFilterHistoryEntry(list, 'demo', 'regex', 4000)
  eq(list.length, 3, 'different mode = new entry')
  eq(list[0].query, 'demo', 'new at head')
  eq(list[0].mode,  'regex', 'new mode')
  // Same as head: no-op (ref-equal).
  const before = list
  const after  = addNoteFilterHistoryEntry(list, 'demo', 'regex', 5000)
  if (after !== before) fail('same-as-head → ref-equal no-op')
  // Cap enforced — oldest dropped.
  let big = []
  for (let i = 0; i < NOTE_FILTER_HISTORY_MAX + 3; i++) {
    big = addNoteFilterHistoryEntry(big, `q${i}`, 'substring', 1000 + i)
  }
  eq(big.length, NOTE_FILTER_HISTORY_MAX, 'cap holds')
  eq(big[0].query, `q${NOTE_FILTER_HISTORY_MAX + 2}`, 'newest at head')
  // Invalid mode coerces to substring (still adds).
  const coerced = addNoteFilterHistoryEntry([], 'q', 'gibberish', 7000)
  eq(coerced[0].mode, 'substring', 'invalid mode → substring')
  // Trim before storage.
  const trimmed = addNoteFilterHistoryEntry([], '   demo  ', 'substring', 8000)
  eq(trimmed[0].query, 'demo', 'trim applied')
  // Too-long query → no-op.
  const huge = addNoteFilterHistoryEntry([], 'a'.repeat(NOTE_FILTER_HISTORY_QUERY_MAX + 1), 'substring')
  eq(huge.length, 0, 'oversize query rejected')
}

// removeNoteFilterHistoryEntry — happy + no-op.
{
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 1000)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 2000)
  list = addNoteFilterHistoryEntry(list, 'c', 'regex', 3000)
  eq(list.length, 3, 'baseline')
  // Remove middle entry.
  const removed = removeNoteFilterHistoryEntry(list, 'a', 'substring')
  eq(removed.length, 2, 'one entry removed')
  eq(removed[0].query, 'c', 'order preserved')
  eq(removed[1].query, 'b', 'order preserved (b after c)')
  // Non-matching (query exists, wrong mode): no-op.
  const noop = removeNoteFilterHistoryEntry(list, 'a', 'regex')
  if (noop !== list) fail('non-matching → ref-equal no-op')
  // Empty/whitespace query: no-op.
  if (removeNoteFilterHistoryEntry(list, '', 'substring') !== list) fail('empty query → no-op')
  // Non-array list: input ref.
  const nullRet = removeNoteFilterHistoryEntry(null, 'q', 'substring')
  eq(nullRet, null, 'null list → null')
}

// clearNoteFilterHistory.
{
  eq(clearNoteFilterHistory().length, 0, 'clear → empty')
  // Always idempotent — return value never throws.
  eq(clearNoteFilterHistory().length, 0, 'second clear → empty')
}

// Storage round-trip (save → load).
{
  // Stub storage that doesn't depend on the real localStorage.
  const fakeStore = (() => {
    const data = {}
    return {
      getItem: (k) => Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null,
      setItem: (k, v) => { data[k] = String(v) },
      removeItem: (k) => { delete data[k] },
    }
  })()
  // Empty load → [].
  if (loadNoteFilterHistory(fakeStore).length !== 0) fail('empty store → []')
  // Save populated.
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  list = addNoteFilterHistoryEntry(list, '^test$', 'regex', 2000)
  if (!saveNoteFilterHistory(list, fakeStore)) fail('save returns true on success')
  // Read back.
  const read = loadNoteFilterHistory(fakeStore)
  eq(read.length, 2, 'saved length')
  eq(read[0].query, '^test$', 'newest first in round-trip')
  eq(read[1].mode, 'substring', 'mode round-trips')
  // Saving empty list REMOVES the key.
  saveNoteFilterHistory([], fakeStore)
  if (loadNoteFilterHistory(fakeStore).length !== 0) fail('empty save wipes key')
  // Corrupt JSON → load returns [].
  fakeStore.setItem('preset-note-filter-history-v1', '{not json}')
  if (loadNoteFilterHistory(fakeStore).length !== 0) fail('corrupt JSON → []')
  // Wrong version → [].
  fakeStore.setItem('preset-note-filter-history-v1', JSON.stringify({ v: 99, items: [] }))
  if (loadNoteFilterHistory(fakeStore).length !== 0) fail('wrong v → []')
  // Missing items → [].
  fakeStore.setItem('preset-note-filter-history-v1', JSON.stringify({ v: 1 }))
  if (loadNoteFilterHistory(fakeStore).length !== 0) fail('missing items → []')
  // No-storage paths.
  if (loadNoteFilterHistory(null).length !== 0) fail('null storage load → []')
  if (saveNoteFilterHistory([{ query: 'q' }], null) !== false) fail('null storage save → false')
}

// Pure input not mutated.
{
  const list = [{ query: 'a', mode: 'substring', addedAt: 1 }]
  const beforeJSON = JSON.stringify(list)
  addNoteFilterHistoryEntry(list, 'b', 'substring', 2)
  eq(JSON.stringify(list), beforeJSON, 'add does not mutate input')
  removeNoteFilterHistoryEntry(list, 'a', 'substring')
  eq(JSON.stringify(list), beforeJSON, 'remove does not mutate input')
  sanitizeNoteFilterHistory(list)
  eq(JSON.stringify(list), beforeJSON, 'sanitize does not mutate input')
}

console.log('PASS: note-filter pattern history (R25.42, MRU + cap + storage round-trip + defensive, ~70 asserts)')

// ----------------------------------------------------------------------------
// R26.42: Note-filter history PIN — pin/unpin entries so they stay above
// the MRU drop boundary across many searches.
// ----------------------------------------------------------------------------

// togglePinNoteFilterHistoryEntry — happy path: flip false → true → false.
{
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  eq(list[0].pinned, false, 'new entry defaults to pinned=false')
  list = togglePinNoteFilterHistoryEntry(list, 'demo', 'substring')
  eq(list[0].pinned, true, 'first toggle pins the entry')
  list = togglePinNoteFilterHistoryEntry(list, 'demo', 'substring')
  eq(list[0].pinned, false, 'second toggle un-pins the entry')
}

// togglePinNoteFilterHistoryEntry — only matching entry is affected.
{
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  list = addNoteFilterHistoryEntry(list, '^test$', 'regex', 2000)
  list = addNoteFilterHistoryEntry(list, 'TODO', 'substring', 3000)
  const pinned = togglePinNoteFilterHistoryEntry(list, 'demo', 'substring')
  const pinnedEntry = pinned.find(e => e.query === 'demo')
  eq(pinnedEntry.pinned, true, 'demo pinned')
  eq(pinned.find(e => e.query === '^test$').pinned, false, 'other untouched')
  eq(pinned.find(e => e.query === 'TODO').pinned, false, 'other untouched')
}

// togglePinNoteFilterHistoryEntry — ref-equal-on-no-op for missing entry.
{
  const list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  const same = togglePinNoteFilterHistoryEntry(list, 'nope', 'substring')
  if (same !== list) fail('missing entry → input ref (ref-equal-on-no-op)')
}

// togglePinNoteFilterHistoryEntry — defensive contract.
{
  if (togglePinNoteFilterHistoryEntry(null, 'q', 'substring') !== null) fail('null list → null')
  if (togglePinNoteFilterHistoryEntry(undefined, 'q', 'substring') !== undefined) fail('undefined → undefined')
  const list = []
  if (togglePinNoteFilterHistoryEntry(list, '', 'substring') !== list) fail('empty query → input ref')
  if (togglePinNoteFilterHistoryEntry(list, '   ', 'substring') !== list) fail('whitespace query → input ref')
  if (togglePinNoteFilterHistoryEntry(list, null, 'substring') !== list) fail('null query → input ref')
  if (togglePinNoteFilterHistoryEntry(list, 42, 'substring') !== list) fail('number query → input ref')
}

// togglePinNoteFilterHistoryEntry — invalid mode coerces to substring
// (matches addNoteFilterHistoryEntry's contract so toggling against
// the wrong mode label doesn't silently miss the entry).
{
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  list = togglePinNoteFilterHistoryEntry(list, 'demo', 'mystery-mode')
  eq(list[0].pinned, true, 'invalid mode coerced to substring → matches')
}

// togglePinNoteFilterHistoryEntry — preserves order of other entries.
{
  let list = addNoteFilterHistoryEntry([], 'a', 'substring', 1000)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 2000)
  list = addNoteFilterHistoryEntry(list, 'c', 'substring', 3000)
  // Order is MRU: c, b, a (most recent first).
  eq(list[0].query, 'c')
  eq(list[1].query, 'b')
  eq(list[2].query, 'a')
  const pinned = togglePinNoteFilterHistoryEntry(list, 'b', 'substring')
  // Order stays the same — pin doesn't bump.
  eq(pinned[0].query, 'c', 'order preserved [0]')
  eq(pinned[1].query, 'b', 'order preserved [1] (still pinned in original slot)')
  eq(pinned[1].pinned, true, 'b is pinned')
  eq(pinned[2].query, 'a', 'order preserved [2]')
}

// togglePinNoteFilterHistoryEntry — does not mutate input list.
{
  const list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  const before = JSON.stringify(list)
  togglePinNoteFilterHistoryEntry(list, 'demo', 'substring')
  eq(JSON.stringify(list), before, 'input not mutated')
}

// addNoteFilterHistoryEntry — bump preserves pinned flag.
{
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  list = togglePinNoteFilterHistoryEntry(list, 'demo', 'substring')
  // Add unrelated entries (push demo down).
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 2000)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 3000)
  // Bump demo back to head — pinned flag must survive.
  list = addNoteFilterHistoryEntry(list, 'demo', 'substring', 4000)
  eq(list[0].query, 'demo', 'bumped demo to head')
  eq(list[0].pinned, true, 'bumped entry preserves pinned flag')
}

// addNoteFilterHistoryEntry — pinned entries survive the cap, only
// unpinned dropped.
{
  let list = []
  // Pin entries q0..q3, then add unpinned q4..q15 to overflow.
  for (let i = 0; i < 4; i++) {
    list = addNoteFilterHistoryEntry(list, `q${i}`, 'substring', i)
    list = togglePinNoteFilterHistoryEntry(list, `q${i}`, 'substring')
  }
  for (let i = 4; i < 4 + NOTE_FILTER_HISTORY_MAX + 5; i++) {
    list = addNoteFilterHistoryEntry(list, `q${i}`, 'substring', i)
  }
  // All 4 pinned entries must still be there.
  const pinnedCount = list.filter(e => e.pinned).length
  eq(pinnedCount, 4, 'all 4 pinned entries survived')
  // Total length is capped at MAX.
  eq(list.length, NOTE_FILTER_HISTORY_MAX, 'unpinned fill brings total to cap')
}

// sanitizeNoteFilterHistory — corrupt JSON with pinned flag still parses.
{
  const out = sanitizeNoteFilterHistory([
    { query: 'a', mode: 'substring', pinned: true },
    { query: 'b', mode: 'regex', pinned: false },
    { query: 'c', mode: 'substring' },                  // missing pinned → default false
    { query: 'd', mode: 'substring', pinned: 'true' },   // non-bool → false (strict equals check)
    { query: 'e', mode: 'substring', pinned: 1 },        // numeric → false
  ])
  eq(out[0].pinned, true,  'true pinned preserved')
  eq(out[1].pinned, false, 'false pinned preserved')
  eq(out[2].pinned, false, 'missing pinned → false')
  eq(out[3].pinned, false, 'string "true" → false (strict equals)')
  eq(out[4].pinned, false, 'numeric 1 → false (strict equals)')
}

// sanitizeNoteFilterHistory — over-cap with pinned mix: pins kept
// preferentially.
{
  // 8 pinned + 10 unpinned, cap = 12. Should keep all 8 pinned + 4 unpinned.
  const items = []
  for (let i = 0; i < 8; i++)  items.push({ query: `p${i}`, mode: 'substring', pinned: true,  addedAt: 1000 + i })
  for (let i = 0; i < 10; i++) items.push({ query: `u${i}`, mode: 'substring', pinned: false, addedAt: 2000 + i })
  const out = sanitizeNoteFilterHistory(items)
  eq(out.length, NOTE_FILTER_HISTORY_MAX, 'output capped at MAX')
  eq(out.filter(e => e.pinned).length,  8, 'all pinned retained')
  eq(out.filter(e => !e.pinned).length, NOTE_FILTER_HISTORY_MAX - 8, 'unpinned filled remaining slots')
}

// sanitizeNoteFilterHistory — pinned count alone > MAX: keep ALL pins
// (never silently drop a pin).
{
  const items = []
  for (let i = 0; i < NOTE_FILTER_HISTORY_MAX + 3; i++) {
    items.push({ query: `p${i}`, mode: 'substring', pinned: true, addedAt: 1000 + i })
  }
  const out = sanitizeNoteFilterHistory(items)
  eq(out.length, NOTE_FILTER_HISTORY_MAX + 3, 'all pinned kept past MAX')
  if (!out.every(e => e.pinned)) fail('all kept entries are pinned')
}

// sortNoteFilterHistoryForDisplay — happy: pinned-first preserving
// internal MRU order within each tier.
{
  const list = [
    { query: 'newest-unpinned', mode: 'substring', pinned: false, addedAt: 5000 },
    { query: 'middle-pinned',   mode: 'substring', pinned: true,  addedAt: 4000 },
    { query: 'older-unpinned',  mode: 'substring', pinned: false, addedAt: 3000 },
    { query: 'older-pinned',    mode: 'substring', pinned: true,  addedAt: 2000 },
    { query: 'oldest-unpinned', mode: 'substring', pinned: false, addedAt: 1000 },
  ]
  const sorted = sortNoteFilterHistoryForDisplay(list)
  eq(sorted[0].query, 'middle-pinned',   'pinned first [0]')
  eq(sorted[1].query, 'older-pinned',    'pinned first [1] (MRU order preserved)')
  eq(sorted[2].query, 'newest-unpinned', 'unpinned next [2]')
  eq(sorted[3].query, 'older-unpinned',  'unpinned next [3] (MRU order preserved)')
  eq(sorted[4].query, 'oldest-unpinned', 'unpinned next [4]')
}

// sortNoteFilterHistoryForDisplay — defensive contract.
{
  if (sortNoteFilterHistoryForDisplay(null).length !== 0) fail('null → []')
  if (sortNoteFilterHistoryForDisplay(undefined).length !== 0) fail('undefined → []')
  if (sortNoteFilterHistoryForDisplay({}).length !== 0) fail('object → []')
  if (sortNoteFilterHistoryForDisplay('str').length !== 0) fail('string → []')
  if (sortNoteFilterHistoryForDisplay(42).length !== 0) fail('number → []')
}

// sortNoteFilterHistoryForDisplay — all pinned: order preserved.
{
  const list = [
    { query: 'a', pinned: true, addedAt: 1 },
    { query: 'b', pinned: true, addedAt: 2 },
    { query: 'c', pinned: true, addedAt: 3 },
  ]
  const sorted = sortNoteFilterHistoryForDisplay(list)
  eq(sorted[0].query, 'a', 'all-pinned order preserved [0]')
  eq(sorted[1].query, 'b', 'all-pinned order preserved [1]')
  eq(sorted[2].query, 'c', 'all-pinned order preserved [2]')
}

// sortNoteFilterHistoryForDisplay — none pinned: order preserved.
{
  const list = [
    { query: 'a', pinned: false, addedAt: 1 },
    { query: 'b', pinned: false, addedAt: 2 },
    { query: 'c', pinned: false, addedAt: 3 },
  ]
  const sorted = sortNoteFilterHistoryForDisplay(list)
  eq(sorted[0].query, 'a', 'none-pinned order preserved [0]')
  eq(sorted[1].query, 'b', 'none-pinned order preserved [1]')
  eq(sorted[2].query, 'c', 'none-pinned order preserved [2]')
}

// sortNoteFilterHistoryForDisplay — pinned: non-bool defaults to false.
{
  const list = [
    { query: 'a', pinned: 'true', addedAt: 1 },
    { query: 'b', pinned: 1,      addedAt: 2 },
    { query: 'c', pinned: true,   addedAt: 3 },
  ]
  const sorted = sortNoteFilterHistoryForDisplay(list)
  eq(sorted[0].query, 'c', 'only strict-true pinned bubbles up')
}

// sortNoteFilterHistoryForDisplay — null/non-object entries skipped.
{
  const list = [
    null,
    'not an object',
    { query: 'a', pinned: true, addedAt: 1 },
    { query: 'b', pinned: false, addedAt: 2 },
  ]
  const sorted = sortNoteFilterHistoryForDisplay(list)
  eq(sorted.length, 2, 'null + string entries skipped')
  eq(sorted[0].query, 'a', 'pinned still first')
  eq(sorted[1].query, 'b', 'unpinned next')
}

// sortNoteFilterHistoryForDisplay — purity: input not mutated.
{
  const list = [
    { query: 'a', pinned: false, addedAt: 1 },
    { query: 'b', pinned: true,  addedAt: 2 },
  ]
  const before = JSON.stringify(list)
  sortNoteFilterHistoryForDisplay(list)
  eq(JSON.stringify(list), before, 'sort does not mutate input')
}

// Storage round-trip — pinned flag survives a save+load cycle.
{
  const stub = (() => {
    let v = null
    return {
      getItem: () => v,
      setItem: (_k, x) => { v = x },
      removeItem: () => { v = null },
    }
  })()
  let list = addNoteFilterHistoryEntry([], 'demo', 'substring', 1000)
  list = togglePinNoteFilterHistoryEntry(list, 'demo', 'substring')
  saveNoteFilterHistory(list, stub)
  const loaded = loadNoteFilterHistory(stub)
  eq(loaded[0].query,  'demo', 'storage round-trip query')
  eq(loaded[0].pinned, true,   'storage round-trip pinned flag')
}

console.log('PASS: note-filter pattern PIN — togglePinEntry + sortForDisplay + cap-respects-pins (R26.42, ~45 asserts)')

// ----------------------------------------------------------------------------
// R27.42 — bulk-unpin: footer button when >= 2 entries are pinned
// (graduates R26.42's per-entry pin). Lib helpers cover the COUNT
// projector (UI gating) and the WIPE setter (ref-equal-on-no-op).
// ----------------------------------------------------------------------------

// countPinnedNoteFilterHistoryEntries — happy: count varies as entries flip.
{
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 100)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 200)
  list = addNoteFilterHistoryEntry(list, 'c', 'substring', 300)
  eq(countPinnedNoteFilterHistoryEntries(list), 0, 'fresh entries — none pinned')
  list = togglePinNoteFilterHistoryEntry(list, 'a', 'substring')
  eq(countPinnedNoteFilterHistoryEntries(list), 1, '1 pinned after toggle')
  list = togglePinNoteFilterHistoryEntry(list, 'c', 'substring')
  eq(countPinnedNoteFilterHistoryEntries(list), 2, '2 pinned')
  list = togglePinNoteFilterHistoryEntry(list, 'a', 'substring')
  eq(countPinnedNoteFilterHistoryEntries(list), 1, 'back to 1 after un-pin')
}

// countPinnedNoteFilterHistoryEntries — defensive contract.
{
  eq(countPinnedNoteFilterHistoryEntries(null),       0, 'null → 0')
  eq(countPinnedNoteFilterHistoryEntries(undefined),  0, 'undefined → 0')
  eq(countPinnedNoteFilterHistoryEntries('not arr'),  0, 'string → 0')
  eq(countPinnedNoteFilterHistoryEntries(42),         0, 'number → 0')
  eq(countPinnedNoteFilterHistoryEntries({}),         0, 'plain object → 0')
  eq(countPinnedNoteFilterHistoryEntries([]),         0, 'empty array → 0')
}

// countPinnedNoteFilterHistoryEntries — corrupt rows silently skipped,
// non-strict-true pinned skipped.
{
  const list = [
    { query: 'a', mode: 'substring', pinned: true,  addedAt: 100 },
    { query: 'b', mode: 'substring', pinned: 'true', addedAt: 200 },  // string truthy not strict-true
    { query: 'c', mode: 'substring', pinned: 1,     addedAt: 300 },   // 1 truthy not strict-true
    null,
    'oops',
    42,
    { query: 'd', mode: 'substring', pinned: true, addedAt: 400 },
  ]
  eq(countPinnedNoteFilterHistoryEntries(list), 2, 'strict-true filter + corrupt skip → exactly 2')
}

// bulkUnpinNoteFilterHistoryEntries — happy: all pinned → all flip to false.
{
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 100)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 200)
  list = addNoteFilterHistoryEntry(list, 'c', 'regex',     300)
  list = togglePinNoteFilterHistoryEntry(list, 'a', 'substring')
  list = togglePinNoteFilterHistoryEntry(list, 'b', 'substring')
  list = togglePinNoteFilterHistoryEntry(list, 'c', 'regex')
  eq(countPinnedNoteFilterHistoryEntries(list), 3, 'precondition: 3 pinned')
  const wiped = bulkUnpinNoteFilterHistoryEntries(list)
  eq(countPinnedNoteFilterHistoryEntries(wiped), 0, 'all unpinned after bulk')
  eq(wiped.length, list.length, 'length preserved across bulk-unpin')
  // Order preserved (MRU stays — sortForDisplay is the render-time
  // re-flow, not this setter's job).
  for (let i = 0; i < wiped.length; i++) {
    eq(wiped[i].query, list[i].query, `order preserved at index ${i}`)
    eq(wiped[i].mode,  list[i].mode,  `mode preserved at index ${i}`)
  }
}

// bulkUnpinNoteFilterHistoryEntries — only some pinned: still flips
// all of them, leaves already-unpinned untouched.
{
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 100)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 200)
  list = addNoteFilterHistoryEntry(list, 'c', 'substring', 300)
  list = togglePinNoteFilterHistoryEntry(list, 'b', 'substring')
  const wiped = bulkUnpinNoteFilterHistoryEntries(list)
  eq(countPinnedNoteFilterHistoryEntries(wiped), 0, 'partial pinned → all unpinned')
  // every entry has pinned === false (strict bool, normalised from any
  // missing-pinned source).
  for (const e of wiped) {
    eq(e.pinned, false, `entry ${e.query} normalised to pinned=false`)
  }
}

// bulkUnpinNoteFilterHistoryEntries — ref-equal-on-no-op when nothing
// is pinned. Critical for the persistence layer to skip redundant
// saves (parallels removeNoteFilterHistoryEntry's contract).
{
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 100)
  list = addNoteFilterHistoryEntry(list, 'b', 'substring', 200)
  const same = bulkUnpinNoteFilterHistoryEntries(list)
  eq(same, list, 'nothing pinned → input ref unchanged')
}

// bulkUnpinNoteFilterHistoryEntries — empty list → ref-equal-on-no-op
// (empty is trivially "nothing to wipe").
{
  const list = []
  const same = bulkUnpinNoteFilterHistoryEntries(list)
  eq(same, list, 'empty list → input ref unchanged')
}

// bulkUnpinNoteFilterHistoryEntries — defensive contract.
{
  eq(bulkUnpinNoteFilterHistoryEntries(null),      null,       'null → null')
  eq(bulkUnpinNoteFilterHistoryEntries(undefined), undefined,  'undefined → undefined')
  // Non-array: should return input ref untouched (caller may have a
  // stable JSON-encoded handle that shouldn't be re-allocated).
  const obj = { a: 1 }
  eq(bulkUnpinNoteFilterHistoryEntries(obj), obj, 'object → input ref')
  eq(bulkUnpinNoteFilterHistoryEntries('s'),  's', 'string → input ref')
  eq(bulkUnpinNoteFilterHistoryEntries(42),   42,  'number → input ref')
}

// bulkUnpinNoteFilterHistoryEntries — purity: input not mutated even
// when a copy is returned.
{
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 100)
  list = togglePinNoteFilterHistoryEntry(list, 'a', 'substring')
  const before = JSON.stringify(list)
  bulkUnpinNoteFilterHistoryEntries(list)
  eq(JSON.stringify(list), before, 'input list not mutated')
}

// bulkUnpinNoteFilterHistoryEntries — corrupt rows dropped during
// the sanitize-and-rewrite pass (parallels add/togglePin pattern).
{
  const list = [
    { query: 'a', mode: 'substring', pinned: true,  addedAt: 100 },
    null,
    { query: 'b', mode: 'substring', pinned: true,  addedAt: 200 },
    'corrupt',
    42,
    { query: '',  mode: 'substring', pinned: true,  addedAt: 300 },  // blank query → drops via sanitize
  ]
  const wiped = bulkUnpinNoteFilterHistoryEntries(list)
  eq(wiped.length, 2, 'corrupt + blank rows dropped, only valid entries kept')
  eq(wiped[0].query, 'a')
  eq(wiped[1].query, 'b')
  for (const e of wiped) eq(e.pinned, false, 'every valid entry flips to false')
}

// Storage round-trip — bulk-unpin survives save+load via the existing
// sanitize path.
{
  const stub = (() => {
    let v = null
    return {
      getItem: () => v,
      setItem: (_k, x) => { v = x },
      removeItem: () => { v = null },
    }
  })()
  let list = []
  list = addNoteFilterHistoryEntry(list, 'a', 'substring', 100)
  list = addNoteFilterHistoryEntry(list, 'b', 'regex',     200)
  list = togglePinNoteFilterHistoryEntry(list, 'a', 'substring')
  list = togglePinNoteFilterHistoryEntry(list, 'b', 'regex')
  saveNoteFilterHistory(list, stub)
  // Simulate the live bulk-unpin path (read from storage → wipe → save → reload).
  const loaded1 = loadNoteFilterHistory(stub)
  eq(countPinnedNoteFilterHistoryEntries(loaded1), 2, 'loaded with both pinned')
  const wiped = bulkUnpinNoteFilterHistoryEntries(loaded1)
  saveNoteFilterHistory(wiped, stub)
  const loaded2 = loadNoteFilterHistory(stub)
  eq(countPinnedNoteFilterHistoryEntries(loaded2), 0, 'round-trip: 0 pinned after wipe')
  eq(loaded2.length, 2, 'both entries survived (order preserved)')
}

console.log('PASS: note-filter pattern BULK UNPIN — countPinned + bulkUnpin (R27.42, ~30 asserts)')

// =====================================================================
// R28.42 — Undo restore for the bulk-unpin toast.
// snapshot...Keys + restorePinned... let the toast's Undo chip recover
// from a misclick. The snapshot is minimal (query+mode keys, not the
// whole list) so concurrent edits between unpin + restore compose
// safely. restore is ref-equal-on-no-op so a "nothing to do" Undo
// click costs nothing.
// =====================================================================

// snapshotPinnedNoteFilterHistoryKeys — happy: 3 pinned + 2 unpinned.
{
  const list = [
    { query: 'demo',  mode: 'substring', addedAt: 5, pinned: true },
    { query: 'orbit', mode: 'substring', addedAt: 4, pinned: false },
    { query: '^test', mode: 'regex',     addedAt: 3, pinned: true },
    { query: 'wow',   mode: 'substring', addedAt: 2, pinned: false },
    { query: 'foo',   mode: 'regex',     addedAt: 1, pinned: true },
  ]
  const keys = snapshotPinnedNoteFilterHistoryKeys(list)
  eq(keys.length, 3, '3 pinned keys captured')
  eq(keys[0].query, 'demo',  'first key: demo')
  eq(keys[0].mode,  'substring', 'first key mode: substring')
  eq(keys[1].query, '^test', 'second key: ^test')
  eq(keys[1].mode,  'regex', 'second key mode: regex')
  eq(keys[2].query, 'foo',   'third key: foo')
  eq(keys[2].mode,  'regex', 'third key mode: regex')
}

// snapshotPinned — order preserved (mirrors list order, not MRU re-flow).
{
  const list = [
    { query: 'z', mode: 'substring', addedAt: 1, pinned: true },
    { query: 'a', mode: 'substring', addedAt: 2, pinned: true },
    { query: 'm', mode: 'substring', addedAt: 3, pinned: true },
  ]
  const keys = snapshotPinnedNoteFilterHistoryKeys(list)
  eq(keys.map(k => k.query).join(','), 'z,a,m', 'snapshot preserves list order')
}

// snapshotPinned — none pinned → empty array.
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
  ]
  const keys = snapshotPinnedNoteFilterHistoryKeys(list)
  eq(keys.length, 0, 'no pinned → empty snapshot')
}

// snapshotPinned — empty list → empty array.
{
  eq(snapshotPinnedNoteFilterHistoryKeys([]).length, 0, 'empty list → empty snapshot')
}

// snapshotPinned — strict-true filter (non-bool truthy doesn't lie).
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: 'true' },  // string truthy — not counted
    { query: 'b', mode: 'substring', addedAt: 2, pinned: 1 },       // number truthy — not counted
    { query: 'c', mode: 'substring', addedAt: 3, pinned: true },    // strict true — counted
  ]
  const keys = snapshotPinnedNoteFilterHistoryKeys(list)
  eq(keys.length, 1, 'only strict-true pinned counted')
  eq(keys[0].query, 'c', 'strict-true entry captured')
}

// snapshotPinned — corrupt rows skipped silently.
{
  const list = [
    null,
    'corrupt',
    42,
    { query: 'a', mode: 'substring', addedAt: 1, pinned: true },   // valid
    { /* missing query */ mode: 'substring', addedAt: 2, pinned: true },
    { query: '',  mode: 'substring', addedAt: 3, pinned: true },   // empty trim
    { query: '   ', mode: 'substring', addedAt: 4, pinned: true }, // whitespace-only
    { query: 'b', mode: 'gibberish-mode', addedAt: 5, pinned: true }, // bad mode → coerced
  ]
  const keys = snapshotPinnedNoteFilterHistoryKeys(list)
  eq(keys.length, 2, 'valid pinned entries captured (corrupts skipped)')
  eq(keys[0].query, 'a', 'first valid: a')
  eq(keys[1].query, 'b', 'second valid: b (bad mode coerced)')
  eq(keys[1].mode, 'substring', 'bad mode → coerced to substring')
}

// snapshotPinned — defensive matrix: non-array → [].
{
  eq(snapshotPinnedNoteFilterHistoryKeys(null).length,      0, 'null → []')
  eq(snapshotPinnedNoteFilterHistoryKeys(undefined).length, 0, 'undefined → []')
  eq(snapshotPinnedNoteFilterHistoryKeys('s').length,       0, 'string → []')
  eq(snapshotPinnedNoteFilterHistoryKeys(42).length,        0, 'number → []')
  eq(snapshotPinnedNoteFilterHistoryKeys({a:1}).length,     0, 'object → []')
}

// snapshotPinned — purity: input not mutated.
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: true },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
  ]
  const snap = JSON.stringify(list)
  snapshotPinnedNoteFilterHistoryKeys(list)
  eq(JSON.stringify(list), snap, 'input list not mutated')
}

// restorePinnedNoteFilterHistoryEntries — happy: full restore of a wiped list.
{
  // Simulate: 3 entries pinned → snapshot → wipe → restore.
  const before = [
    { query: 'demo',  mode: 'substring', addedAt: 5, pinned: true },
    { query: '^test', mode: 'regex',     addedAt: 4, pinned: true },
    { query: 'foo',   mode: 'regex',     addedAt: 3, pinned: false },
  ]
  const keys  = snapshotPinnedNoteFilterHistoryKeys(before)
  const wiped = bulkUnpinNoteFilterHistoryEntries(before)
  truthy(wiped.every(e => e.pinned === false), 'wipe sanity: all unpinned')
  const restored = restorePinnedNoteFilterHistoryEntries(wiped, keys)
  eq(restored.length, 3, 'restore: length preserved')
  eq(restored[0].pinned, true,  'demo re-pinned')
  eq(restored[1].pinned, true,  '^test re-pinned')
  eq(restored[2].pinned, false, 'foo NOT re-pinned (was not pinned before)')
}

// restorePinned — surgical: only re-pins entries whose keys match.
{
  const wiped = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
    { query: 'c', mode: 'substring', addedAt: 3, pinned: false },
  ]
  const keys = [{ query: 'b', mode: 'substring' }]
  const restored = restorePinnedNoteFilterHistoryEntries(wiped, keys)
  eq(restored[0].pinned, false, 'a NOT re-pinned (not in keys)')
  eq(restored[1].pinned, true,  'b re-pinned')
  eq(restored[2].pinned, false, 'c NOT re-pinned (not in keys)')
}

// restorePinned — mode disambiguation (same query, different modes).
{
  const wiped = [
    { query: 'pattern', mode: 'substring', addedAt: 1, pinned: false },
    { query: 'pattern', mode: 'regex',     addedAt: 2, pinned: false },
  ]
  // Only the regex variant was pinned.
  const keys = [{ query: 'pattern', mode: 'regex' }]
  const restored = restorePinnedNoteFilterHistoryEntries(wiped, keys)
  eq(restored[0].pinned, false, 'substring "pattern" NOT re-pinned')
  eq(restored[1].pinned, true,  'regex "pattern" re-pinned (mode-specific)')
}

// restorePinned — entries that no longer exist are silently skipped
// (user deleted them between unpin + undo; best-effort restore).
{
  const wiped = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
    // 'b' has been deleted since the unpin
  ]
  const keys = [
    { query: 'a', mode: 'substring' },
    { query: 'b', mode: 'substring' },   // ghost — no longer in list
  ]
  const restored = restorePinnedNoteFilterHistoryEntries(wiped, keys)
  eq(restored.length, 1, 'length unchanged (ghost not resurrected)')
  eq(restored[0].pinned, true, 'a re-pinned')
  truthy(!restored.some(e => e.query === 'b'), 'b not resurrected')
}

// restorePinned — already-pinned entries left alone (no double-pin).
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: true },   // already pinned
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
  ]
  const keys = [
    { query: 'a', mode: 'substring' },   // already pinned → skip
    { query: 'b', mode: 'substring' },   // re-pin
  ]
  const restored = restorePinnedNoteFilterHistoryEntries(list, keys)
  eq(restored[0].pinned, true, 'a still pinned (idempotent)')
  eq(restored[1].pinned, true, 'b re-pinned')
}

// restorePinned — ref-equal-on-no-op contract.
{
  // No matching entries in list → input ref unchanged.
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
  ]
  const keys = [{ query: 'z', mode: 'substring' }]   // 'z' not in list
  const same = restorePinnedNoteFilterHistoryEntries(list, keys)
  eq(same, list, 'no matches → input ref unchanged')
}

// restorePinned — ref-equal-on-no-op when every targeted entry is
// already pinned (no work to do).
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: true },
  ]
  const keys = [{ query: 'a', mode: 'substring' }]
  const same = restorePinnedNoteFilterHistoryEntries(list, keys)
  eq(same, list, 'already-pinned target → input ref unchanged')
}

// restorePinned — empty / non-array keys → input ref.
{
  const list = [{ query: 'a', mode: 'substring', addedAt: 1, pinned: false }]
  eq(restorePinnedNoteFilterHistoryEntries(list, []),         list, 'empty keys → input ref')
  eq(restorePinnedNoteFilterHistoryEntries(list, null),       list, 'null keys → input ref')
  eq(restorePinnedNoteFilterHistoryEntries(list, undefined),  list, 'undefined keys → input ref')
  eq(restorePinnedNoteFilterHistoryEntries(list, 'gibberish'), list, 'string keys → input ref')
  eq(restorePinnedNoteFilterHistoryEntries(list, 42),         list, 'number keys → input ref')
}

// restorePinned — corrupt key objects skipped silently.
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
  ]
  const keys = [
    null,
    'gibberish',
    42,
    { /* missing query */ mode: 'substring' },
    { query: 42, mode: 'substring' },        // non-string query
    { query: '', mode: 'substring' },        // empty
    { query: '   ', mode: 'substring' },     // whitespace-only
    { query: 'a', mode: 'substring' },       // valid — re-pin
  ]
  const restored = restorePinnedNoteFilterHistoryEntries(list, keys)
  eq(restored[0].pinned, true,  'a re-pinned (only valid key)')
  eq(restored[1].pinned, false, 'b NOT re-pinned')
}

// restorePinned — defensive: non-array list → input ref.
{
  eq(restorePinnedNoteFilterHistoryEntries(null, [{query:'a',mode:'substring'}]),      null,      'null list → null')
  eq(restorePinnedNoteFilterHistoryEntries(undefined, [{query:'a',mode:'substring'}]), undefined, 'undefined list → undefined')
  eq(restorePinnedNoteFilterHistoryEntries('s', [{query:'a',mode:'substring'}]),       's',       'string list → string')
  eq(restorePinnedNoteFilterHistoryEntries(42, [{query:'a',mode:'substring'}]),        42,        'number list → number')
  const obj = { a: 1 }
  eq(restorePinnedNoteFilterHistoryEntries(obj, [{query:'a',mode:'substring'}]),       obj,       'object list → object')
}

// restorePinned — purity: input not mutated even when changes happen.
{
  const list = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
  ]
  const keys = [{ query: 'a', mode: 'substring' }]
  const snap = JSON.stringify(list)
  restorePinnedNoteFilterHistoryEntries(list, keys)
  eq(JSON.stringify(list), snap, 'input list not mutated')
}

// restorePinned — round-trip through wipe + storage.
{
  const stub = makeFakeStorage()
  const seed = [
    { query: 'orbit',  mode: 'substring', addedAt: 5, pinned: true },
    { query: '^demo', mode: 'regex',     addedAt: 4, pinned: false },
    { query: 'foo',   mode: 'substring', addedAt: 3, pinned: true },
  ]
  saveNoteFilterHistory(seed, stub)
  const loaded = loadNoteFilterHistory(stub)
  eq(countPinnedNoteFilterHistoryEntries(loaded), 2, 'loaded: 2 pinned')

  // Snapshot → wipe → save → load.
  const keys = snapshotPinnedNoteFilterHistoryKeys(loaded)
  const wiped = bulkUnpinNoteFilterHistoryEntries(loaded)
  saveNoteFilterHistory(wiped, stub)
  const afterWipe = loadNoteFilterHistory(stub)
  eq(countPinnedNoteFilterHistoryEntries(afterWipe), 0, 'after wipe: 0 pinned')

  // Restore (simulating Undo click).
  const restored = restorePinnedNoteFilterHistoryEntries(afterWipe, keys)
  saveNoteFilterHistory(restored, stub)
  const afterRestore = loadNoteFilterHistory(stub)
  eq(countPinnedNoteFilterHistoryEntries(afterRestore), 2, 'after restore: 2 pinned (recovered)')
  // Verify the SAME entries are pinned, not just the count.
  truthy(afterRestore.find(e => e.query === 'orbit').pinned === true, 'orbit re-pinned')
  truthy(afterRestore.find(e => e.query === 'foo').pinned === true,   'foo re-pinned')
  truthy(afterRestore.find(e => e.query === '^demo').pinned === false, '^demo still unpinned')
}

// restorePinned — concurrent-edit scenario: user added a new entry
// between unpin + undo; the new entry is untouched by the restore.
{
  // Unpin happened on a 2-entry list.
  const before = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: true },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: true },
  ]
  const keys = snapshotPinnedNoteFilterHistoryKeys(before)
  // User then ADDED a new entry to the wiped list before clicking Undo.
  const wipedThenAdded = [
    { query: 'a', mode: 'substring', addedAt: 1, pinned: false },
    { query: 'b', mode: 'substring', addedAt: 2, pinned: false },
    { query: 'c', mode: 'substring', addedAt: 99, pinned: false }, // NEW
  ]
  const restored = restorePinnedNoteFilterHistoryEntries(wipedThenAdded, keys)
  eq(restored.length, 3, 'length preserved (new entry survives)')
  eq(restored.find(e => e.query === 'a').pinned, true,  'a re-pinned')
  eq(restored.find(e => e.query === 'b').pinned, true,  'b re-pinned')
  eq(restored.find(e => e.query === 'c').pinned, false, 'c NOT pinned (untouched)')
}

console.log('PASS: note-filter pattern BULK UNPIN UNDO — snapshot + restore (R28.42, ~70 asserts)')
