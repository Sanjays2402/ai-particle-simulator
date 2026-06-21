// snapshotGrid: layout calc + lightbox navigation + dimensions fmt.
import {
  gridLayout, lightboxNav, findSnapshot, formatDimensions, GRID_MAX_COLS,
} from './snapshotGrid.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) {
  const A = JSON.stringify(a), B = JSON.stringify(b)
  if (A !== B) fail(`${m} — got ${A} expected ${B}`)
}

// --- gridLayout ---
eq(gridLayout(0),  { cols: 0, rows: 0 }, 'gridLayout: 0 → empty')
eq(gridLayout(1),  { cols: 1, rows: 1 }, 'gridLayout: 1 → 1×1')
eq(gridLayout(2),  { cols: 2, rows: 1 }, 'gridLayout: 2 → 2×1')
eq(gridLayout(3),  { cols: 3, rows: 1 }, 'gridLayout: 3 → 3×1')
eq(gridLayout(4),  { cols: 4, rows: 1 }, 'gridLayout: 4 → 4×1')
eq(gridLayout(5),  { cols: 4, rows: 2 }, 'gridLayout: 5 → 4×2 (cap kicks in)')
eq(gridLayout(8),  { cols: 4, rows: 2 }, 'gridLayout: 8 → 4×2 (full gallery)')
eq(gridLayout(99), { cols: 4, rows: 25 }, 'gridLayout: rounds up rows')
eq(gridLayout(NaN), { cols: 0, rows: 0 }, 'gridLayout: NaN → empty')
eq(gridLayout(-1),  { cols: 0, rows: 0 }, 'gridLayout: negative → empty')
if (GRID_MAX_COLS !== 4) fail(`expected GRID_MAX_COLS=4, got ${GRID_MAX_COLS}`)

// --- lightboxNav ---
const ITEMS = [
  { id: 10, label: 'a' }, { id: 11, label: 'b' }, { id: 12, label: 'c' }, { id: 13, label: 'd' },
]
eq(lightboxNav(ITEMS, 11, +1), 12, 'nav: forward')
eq(lightboxNav(ITEMS, 11, -1), 10, 'nav: backward')
eq(lightboxNav(ITEMS, 13, +1), 10, 'nav: wraps forward at end')
eq(lightboxNav(ITEMS, 10, -1), 13, 'nav: wraps backward at start')
eq(lightboxNav(ITEMS, 99, +1), 10, 'nav: unknown id forward → first')
eq(lightboxNav(ITEMS, 99, -1), 13, 'nav: unknown id backward → last')
eq(lightboxNav([{ id: 7, label: 'only' }], 7, +1), 7, 'nav: single item returns itself')
eq(lightboxNav([], 10, +1), null, 'nav: empty list → null')
eq(lightboxNav(null, 10, +1), null, 'nav: null list → null')

// --- findSnapshot ---
eq(findSnapshot(ITEMS, 12), { id: 12, label: 'c' }, 'findSnapshot: hit')
eq(findSnapshot(ITEMS, 99), null, 'findSnapshot: miss → null')
eq(findSnapshot(null, 12), null, 'findSnapshot: null list → null')

// --- formatDimensions ---
// Uses NARROW NO-BREAK SPACE (U+202F) around a real "×" — keeps the
// readout from line-breaking awkwardly in the lightbox HUD.
eq(formatDimensions(1920, 1080), '1920\u202f\u00d7\u202f1080', 'fmt: 1920×1080')
eq(formatDimensions(0, 0),       '0\u202f\u00d7\u202f0',       'fmt: 0×0')
eq(formatDimensions(NaN, 100),   '',                            'fmt: NaN w → empty')
eq(formatDimensions(100, NaN),   '',                            'fmt: NaN h → empty')

console.log(`PASS: snapshotGrid — gridLayout (cap=${GRID_MAX_COLS}), lightboxNav (wrap), findSnapshot, formatDimensions`)
