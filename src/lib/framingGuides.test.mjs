// framingGuides: aspect-ratio letterbox/pillarbox geometry + roster.
import {
  FRAMING_RATIOS, isValidFramingId, sanitizeFramingId, ratioForId,
  labelForId, nextFramingId, computeFramingBars, describeFraming,
} from './framingGuides.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }
function near(a, b, m, eps = 0.01) { if (Math.abs(a - b) > eps) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// --- roster integrity ---
ok(FRAMING_RATIOS.length >= 6, 'has a meaningful set of ratios')
eq(FRAMING_RATIOS[0].id, 'off', 'first entry is Off')
eq(FRAMING_RATIOS[0].ratio, null, 'Off has null ratio')
for (const r of FRAMING_RATIOS) {
  ok(typeof r.id === 'string' && r.id.length > 0, `ratio ${r.id} has an id`)
  ok(typeof r.label === 'string' && r.label.length > 0, `ratio ${r.id} has a label`)
  ok(r.ratio === null || (Number.isFinite(r.ratio) && r.ratio > 0), `ratio ${r.id} ratio valid`)
}
// Unique ids.
{
  const ids = new Set(FRAMING_RATIOS.map(r => r.id))
  eq(ids.size, FRAMING_RATIOS.length, 'all ids unique')
}

// --- validation / sanitize ---
eq(isValidFramingId('cine'), true, 'cine is valid')
eq(isValidFramingId('nope'), false, 'unknown invalid')
eq(sanitizeFramingId('square'), 'square', 'known id passes through')
eq(sanitizeFramingId('garbage'), 'off', 'junk → off')
eq(sanitizeFramingId(undefined), 'off', 'undefined → off')
eq(sanitizeFramingId(null), 'off', 'null → off')

// --- ratioForId / labelForId ---
near(ratioForId('wide'), 16 / 9, '16:9 ratio')
eq(ratioForId('off'), null, 'off ratio null')
eq(ratioForId('bogus'), null, 'unknown ratio null')
eq(labelForId('square'), '1:1', 'square label')
eq(labelForId('bogus'), 'Off', 'unknown label → Off')

// --- nextFramingId cycles through every entry once ---
{
  let id = FRAMING_RATIOS[0].id
  const seen = new Set()
  for (let i = 0; i < FRAMING_RATIOS.length; i++) {
    ok(!seen.has(id), `cycle visits ${id} exactly once`)
    seen.add(id)
    id = nextFramingId(id)
  }
  eq(id, FRAMING_RATIOS[0].id, 'cycle wraps to start')
  eq(seen.size, FRAMING_RATIOS.length, 'cycle covers all entries')
  eq(nextFramingId('unknown'), FRAMING_RATIOS[0].id, 'unknown → first')
}

// --- computeFramingBars: pillarbox (viewport wider than target) ---
{
  // 1920x1080 (16:9 ~1.778) into a 1:1 frame → pillarbox.
  const b = computeFramingBars(1920, 1080, 1)
  eq(b.mode, 'pillarbox', 'wide viewport into square → pillarbox')
  near(b.frameW, 1080, 'square frame width = height')
  near(b.frameH, 1080, 'frame height unchanged')
  near(b.bar, (1920 - 1080) / 2, 'pillar bar thickness')
  near(b.frameX, b.bar, 'frame x = bar')
  near(b.frameY, 0, 'frame y 0 for pillarbox')
}

// --- letterbox (viewport taller than target) ---
{
  // 1080x1920 (portrait) into 16:9 → letterbox.
  const b = computeFramingBars(1080, 1920, 16 / 9)
  eq(b.mode, 'letterbox', 'tall viewport into wide → letterbox')
  near(b.frameW, 1080, 'frame width unchanged')
  near(b.frameH, 1080 / (16 / 9), 'letterbox frame height')
  near(b.bar, (1920 - 1080 / (16 / 9)) / 2, 'letter bar thickness')
  near(b.frameX, 0, 'frame x 0 for letterbox')
  near(b.frameY, b.bar, 'frame y = bar')
}

// --- perfect fit → no bars ---
{
  const b = computeFramingBars(1600, 900, 16 / 9)
  eq(b.mode, 'none', '16:9 viewport into 16:9 → no bars')
  near(b.bar, 0, 'no bar thickness')
}

// --- 2.39 cinemascope into a standard widescreen → letterbox ---
{
  const b = computeFramingBars(1920, 1080, 2.39)
  eq(b.mode, 'letterbox', '16:9 into 2.39 → letterbox (frame is wider/shorter)')
  near(b.frameH, 1920 / 2.39, 'cinemascope frame height')
  ok(b.bar > 0, 'cinemascope adds visible bars')
}

// --- defensive: bad dims / ratio ---
{
  eq(computeFramingBars(0, 100, 1).mode, 'none', 'zero width → none')
  eq(computeFramingBars(100, 0, 1).mode, 'none', 'zero height → none')
  eq(computeFramingBars(NaN, 100, 1).mode, 'none', 'NaN width → none')
  eq(computeFramingBars(100, 100, null).mode, 'none', 'null ratio → none')
  eq(computeFramingBars(100, 100, 0).mode, 'none', 'zero ratio → none')
  eq(computeFramingBars(100, 100, -2).mode, 'none', 'negative ratio → none')
  eq(computeFramingBars(100, 100, NaN).mode, 'none', 'NaN ratio → none')
  // Bars never go negative.
  const b = computeFramingBars(1920, 1080, 1)
  ok(b.bar >= 0, 'bar thickness never negative')
}

// --- bar symmetry: 2*bar + frame = viewport dimension ---
{
  const b = computeFramingBars(1920, 1080, 1) // pillarbox
  near(2 * b.bar + b.frameW, 1920, 'pillarbox bars + frame = viewport width')
  const c = computeFramingBars(1080, 1920, 16 / 9) // letterbox
  near(2 * c.bar + c.frameH, 1920, 'letterbox bars + frame = viewport height')
}

// --- describeFraming ---
{
  eq(describeFraming('off', 1920, 1080), '', 'off → empty description')
  const d = describeFraming('cine', 1920, 1080)
  ok(d.startsWith('2.39'), 'cine description leads with label')
  ok(/\d+x\d+/.test(d), 'cine description includes frame dims')
  // Perfect-fit ratio still shows the label (no dims since mode none).
  eq(describeFraming('wide', 1600, 900), '16:9', 'perfect-fit shows just the label')
}

// --- purity: roster not mutated by cycling ---
{
  const before = FRAMING_RATIOS.map(r => r.id).join(',')
  nextFramingId('square'); sanitizeFramingId('x'); computeFramingBars(10, 10, 1)
  const after = FRAMING_RATIOS.map(r => r.id).join(',')
  eq(before, after, 'roster order stable')
}

// === R35.B: composition grid overlay =================================
const r35b = await import('./framingGuides.js')
const {
  FRAMING_GRIDS, isValidGridId, sanitizeGridId, gridLabelForId,
  nextGridId, computeCompositionGrid,
  // R37.B — golden spiral
  SPIRAL_ORIENTATIONS, sanitizeSpiralOrientation, buildGoldenSpiral,
  // R38.B — spiral sweep length
  polylineLength,
} = r35b

// --- grid roster integrity ---
ok(FRAMING_GRIDS.length === 7, 'seven grid modes (R37.B adds spiral)')
eq(FRAMING_GRIDS[0].id, 'off', 'first grid is Off')
{
  const ids = new Set(FRAMING_GRIDS.map(g => g.id))
  eq(ids.size, FRAMING_GRIDS.length, 'grid ids unique')
  ok(ids.has('thirds') && ids.has('cross') && ids.has('both'), 'has thirds/cross/both')
  ok(ids.has('phi') && ids.has('diagonal'), 'R36.B has phi + diagonal')
  ok(ids.has('spiral'), 'R37.B has spiral')
  for (const g of FRAMING_GRIDS) {
    ok(typeof g.label === 'string' && g.label.length > 0, `grid ${g.id} has a label`)
  }
}

// --- grid validation / sanitize ---
eq(isValidGridId('thirds'), true, 'thirds valid')
eq(isValidGridId('nope'), false, 'unknown grid invalid')
eq(sanitizeGridId('cross'), 'cross', 'known grid passes')
eq(sanitizeGridId('junk'), 'off', 'junk grid → off')
eq(sanitizeGridId(null), 'off', 'null grid → off')
eq(sanitizeGridId(undefined), 'off', 'undefined grid → off')
eq(gridLabelForId('both'), 'Both', 'both label')
eq(gridLabelForId('bogus'), 'Off', 'unknown grid label → Off')

// --- nextGridId cycles through every entry once ---
{
  let id = FRAMING_GRIDS[0].id
  const seen = new Set()
  for (let i = 0; i < FRAMING_GRIDS.length; i++) {
    ok(!seen.has(id), `grid cycle visits ${id} once`)
    seen.add(id)
    id = nextGridId(id)
  }
  eq(id, FRAMING_GRIDS[0].id, 'grid cycle wraps to start')
  eq(nextGridId('unknown'), FRAMING_GRIDS[0].id, 'unknown grid → first')
}

// --- computeCompositionGrid: thirds geometry ---
{
  // A 300x300 frame at origin (0,0).
  const rect = { frameX: 0, frameY: 0, frameW: 300, frameH: 300 }
  const g = computeCompositionGrid(rect, 'thirds')
  eq(g.verticals.length, 2, 'thirds → 2 vertical lines')
  eq(g.horizontals.length, 2, 'thirds → 2 horizontal lines')
  near(g.verticals[0], 100, 'first vertical at 1/3')
  near(g.verticals[1], 200, 'second vertical at 2/3')
  near(g.horizontals[0], 100, 'first horizontal at 1/3')
  near(g.horizontals[1], 200, 'second horizontal at 2/3')
  eq(g.points.length, 4, 'thirds → 4 power points')
  // intersections at (100,100),(200,100),(100,200),(200,200)
  ok(g.points.some(p => p.x === 100 && p.y === 100), 'top-left power point')
  ok(g.points.some(p => p.x === 200 && p.y === 200), 'bottom-right power point')
}

// --- thirds offset by frame origin (pillarbox/letterbox case) ---
{
  // Frame inset at (60, 0), size 180x300 (a pillarboxed square in a wide vp).
  const rect = { frameX: 60, frameY: 0, frameW: 180, frameH: 300 }
  const g = computeCompositionGrid(rect, 'thirds')
  near(g.verticals[0], 60 + 60, 'vertical 1/3 is frame-relative + origin')
  near(g.verticals[1], 60 + 120, 'vertical 2/3 frame-relative + origin')
  // points carry the same origin offset.
  ok(g.points.every(p => p.x >= 60 && p.x <= 240), 'power points inside the inset frame')
}

// --- centre cross ---
{
  const rect = { frameX: 0, frameY: 0, frameW: 300, frameH: 200 }
  const g = computeCompositionGrid(rect, 'cross')
  eq(g.verticals.length, 1, 'cross → 1 vertical')
  eq(g.horizontals.length, 1, 'cross → 1 horizontal')
  near(g.verticals[0], 150, 'cross vertical at centre')
  near(g.horizontals[0], 100, 'cross horizontal at centre')
  eq(g.points.length, 0, 'cross has no power points')
}

// --- both: thirds + cross combined ---
{
  const rect = { frameX: 0, frameY: 0, frameW: 300, frameH: 300 }
  const g = computeCompositionGrid(rect, 'both')
  eq(g.verticals.length, 3, 'both → 2 thirds + 1 centre vertical')
  eq(g.horizontals.length, 3, 'both → 2 thirds + 1 centre horizontal')
  ok(g.verticals.includes(150), 'centre vertical present in both')
  eq(g.points.length, 4, 'both keeps the 4 power points')
}

// --- off / defensive ---
{
  const rect = { frameX: 0, frameY: 0, frameW: 300, frameH: 300 }
  const off = computeCompositionGrid(rect, 'off')
  eq(off.verticals.length, 0, 'off → no verticals')
  eq(off.horizontals.length, 0, 'off → no horizontals')
  eq(off.points.length, 0, 'off → no points')
  // junk grid id behaves like off (sanitised).
  eq(computeCompositionGrid(rect, 'garbage').verticals.length, 0, 'junk grid → empty')
  // bad frame rects.
  eq(computeCompositionGrid(null, 'thirds').verticals.length, 0, 'null rect → empty')
  eq(computeCompositionGrid({}, 'thirds').verticals.length, 0, 'missing dims → empty')
  eq(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 0, frameH: 100 }, 'thirds').verticals.length, 0, 'zero width → empty')
  eq(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: NaN, frameH: 100 }, 'thirds').verticals.length, 0, 'NaN width → empty')
  eq(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 100, frameH: -5 }, 'thirds').verticals.length, 0, 'negative height → empty')
}

// --- R36.B: golden-ratio (phi) grid ---
{
  const rect = { frameX: 0, frameY: 0, frameW: 1000, frameH: 1000 }
  const g = computeCompositionGrid(rect, 'phi')
  eq(g.verticals.length, 2, 'phi → 2 vertical lines')
  eq(g.horizontals.length, 2, 'phi → 2 horizontal lines')
  // ~0.382 and ~0.618 of the axis (vs thirds' 0.333 / 0.667).
  near(g.verticals[0], 381.97, 'phi vertical at ~0.382', 0.1)
  near(g.verticals[1], 618.03, 'phi vertical at ~0.618', 0.1)
  near(g.horizontals[0], 381.97, 'phi horizontal at ~0.382', 0.1)
  near(g.horizontals[1], 618.03, 'phi horizontal at ~0.618', 0.1)
  eq(g.points.length, 4, 'phi → 4 power points')
  eq(g.diagonals.length, 0, 'phi has no diagonals')
  // phi lines are INSIDE the thirds lines (closer to centre on the lo
  // side, ALSO closer on the hi side — the golden grid is tighter).
  const thirds = computeCompositionGrid(rect, 'thirds')
  ok(g.verticals[0] > thirds.verticals[0], 'phi lo line sits inside thirds lo line')
  ok(g.verticals[1] < thirds.verticals[1], 'phi hi line sits inside thirds hi line')
  // symmetry: the two splits mirror around the centre.
  near(g.verticals[0] + g.verticals[1], 1000, 'phi verticals symmetric about centre')
}

// --- phi respects frame origin offset ---
{
  const rect = { frameX: 100, frameY: 40, frameW: 500, frameH: 500 }
  const g = computeCompositionGrid(rect, 'phi')
  near(g.verticals[0], 100 + 500 * (1 - 0.618033988749895), 'phi lo carries origin x', 0.1)
  ok(g.points.every(p => p.x >= 100 && p.x <= 600 && p.y >= 40 && p.y <= 540), 'phi points inside inset frame')
}

// --- R36.B: diagonal method ---
{
  // Square frame → the 45° run length equals the side; lines reach the
  // exact opposite corners.
  const sq = computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 400, frameH: 400 }, 'diagonal')
  eq(sq.diagonals.length, 4, 'diagonal → 4 corner lines')
  eq(sq.verticals.length, 0, 'diagonal has no verticals')
  eq(sq.horizontals.length, 0, 'diagonal has no horizontals')
  eq(sq.points.length, 0, 'diagonal has no power points')
  // top-left line runs corner-to-corner on a square.
  const tl = sq.diagonals[0]
  near(tl.x1, 0, 'TL starts at left'); near(tl.y1, 0, 'TL starts at top')
  near(tl.x2, 400, 'TL reaches far x on square'); near(tl.y2, 400, 'TL reaches far y on square')
  // every diagonal is exactly 45° (|dx| === |dy|).
  for (const d of sq.diagonals) {
    near(Math.abs(d.x2 - d.x1), Math.abs(d.y2 - d.y1), 'diagonal is 45 degrees')
  }
}

// --- diagonal on a wide (non-square) frame: run length = shorter side ---
{
  const wide = computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 800, frameH: 300 }, 'diagonal')
  eq(wide.diagonals.length, 4, 'wide diagonal → 4 lines')
  for (const d of wide.diagonals) {
    near(Math.abs(d.x2 - d.x1), 300, 'wide diagonal run = shorter side (height)')
    near(Math.abs(d.y2 - d.y1), 300, 'wide diagonal stays 45 degrees')
  }
  // top-right line goes leftward + down from the top-right corner.
  const tr = wide.diagonals[1]
  near(tr.x1, 800, 'TR starts at right edge')
  near(tr.x2, 500, 'TR runs 300px left'); near(tr.y2, 300, 'TR runs 300px down')
}

// --- diagonal carries frame origin + degenerate frames stay empty ---
{
  const inset = computeCompositionGrid({ frameX: 50, frameY: 20, frameW: 200, frameH: 200 }, 'diagonal')
  near(inset.diagonals[0].x1, 50, 'diagonal TL starts at frame origin x')
  near(inset.diagonals[0].y1, 20, 'diagonal TL starts at frame origin y')
  eq(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 0, frameH: 100 }, 'diagonal').diagonals.length, 0, 'zero-width diagonal → empty')
  eq(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: NaN, frameH: 100 }, 'phi').verticals.length, 0, 'NaN-width phi → empty')
  // empty result always carries the diagonals key (shape stability).
  ok(Array.isArray(computeCompositionGrid(null, 'diagonal').diagonals), 'empty result has diagonals array')
  ok(Array.isArray(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 300, frameH: 300 }, 'thirds').diagonals), 'thirds result has diagonals array (empty)')
}

console.log(`PASS: framingGuides — ${passed} assertions (letterbox/pillarbox geometry, roster, cycle, describe, R35.B composition grid, R36.B phi + diagonal)`)

// === R37.B: golden (Fibonacci) spiral ================================
{
  // --- orientation roster + sanitiser ---
  eq(SPIRAL_ORIENTATIONS.length, 4, 'four spiral orientations')
  eq(SPIRAL_ORIENTATIONS.join(','), 'tl,tr,br,bl', 'orientation order TL,TR,BR,BL')
  eq(sanitizeSpiralOrientation('tr'), 1, 'string id resolves to index')
  eq(sanitizeSpiralOrientation('bl'), 3, 'bl → index 3')
  eq(sanitizeSpiralOrientation('xx'), 0, 'unknown string → 0')
  eq(sanitizeSpiralOrientation(2), 2, 'numeric index passthrough')
  eq(sanitizeSpiralOrientation(5), 1, 'wraps past length (5 % 4 = 1)')
  eq(sanitizeSpiralOrientation(-1), 3, 'negative wraps to 3')
  eq(sanitizeSpiralOrientation(NaN), 0, 'NaN → 0')
  eq(sanitizeSpiralOrientation(undefined), 0, 'undefined → 0')
  eq(sanitizeSpiralOrientation(1.9), 1, 'fractional floors to 1')

  // --- buildGoldenSpiral geometry ---
  const tl = buildGoldenSpiral(0, 0, 100, 100, 'tl', 8)
  ok(tl.length > 0, 'spiral produces points')
  // 8 turns × (SEG+1=13) points = 104.
  eq(tl.length, 104, '8 turns at 13 pts/turn → 104 points')
  // Every point is inside the frame (a tiny epsilon for float drift).
  ok(tl.every(p => p.x >= -0.5 && p.x <= 100.5 && p.y >= -0.5 && p.y <= 100.5),
    'all spiral points inside the frame')
  // The spiral uses the full width + height of the frame (it's not a
  // degenerate dot in one corner).
  const xs = tl.map(p => p.x), ys = tl.map(p => p.y)
  ok(Math.max(...xs) - Math.min(...xs) > 90, 'spiral spans most of the width')
  ok(Math.max(...ys) - Math.min(...ys) > 90, 'spiral spans most of the height')

  // --- orientation mirrors the eye (last, most-converged point) ---
  const tr = buildGoldenSpiral(0, 0, 100, 100, 'tr', 8)
  const eyeTL = tl[tl.length - 1]
  const eyeTR = tr[tr.length - 1]
  // tl + tr are X-mirror images: eye x's sum to ~frame width, y's equal.
  near(eyeTL.x + eyeTR.x, 100, 'tl/tr eyes mirror across x', 0.5)
  near(eyeTL.y, eyeTR.y, 'tl/tr eyes share the same y', 0.5)
  const br = buildGoldenSpiral(0, 0, 100, 100, 'br', 8)
  const eyeBR = br[br.length - 1]
  // tl + br are point-mirror images: both coords sum to ~frame dims.
  near(eyeTL.x + eyeBR.x, 100, 'tl/br eyes mirror across x', 0.5)
  near(eyeTL.y + eyeBR.y, 100, 'tl/br eyes mirror across y', 0.5)

  // --- offset + non-square frame: points stay inside the frame rect ---
  const off = buildGoldenSpiral(10, 20, 200, 120, 'tl', 8)
  ok(off.every(p => p.x >= 9.5 && p.x <= 210.5 && p.y >= 19.5 && p.y <= 140.5),
    'offset non-square spiral stays in the frame rect')

  // --- depth clamps ---
  eq(buildGoldenSpiral(0, 0, 100, 100, 'tl', 3).length, 3 * 13, 'depth 3 → 3 turns')
  ok(buildGoldenSpiral(0, 0, 100, 100, 'tl', 999).length <= 14 * 13, 'depth clamps at 14 turns')
  eq(buildGoldenSpiral(0, 0, 100, 100, 'tl', 0).length, 8 * 13, 'depth 0 → default 8 turns')

  // --- defensive ---
  eq(buildGoldenSpiral(0, 0, 0, 100, 'tl').length, 0, 'zero width → empty')
  eq(buildGoldenSpiral(0, 0, 100, -5, 'tl').length, 0, 'negative height → empty')
  eq(buildGoldenSpiral(NaN, 0, 100, 100, 'tl').length, 0, 'NaN x → empty')
  eq(buildGoldenSpiral(0, 0, Infinity, 100, 'tl').length, 0, 'Infinity width → empty')

  // --- computeCompositionGrid wires the spiral + keeps shape stable ---
  const g = computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 300, frameH: 300, spiralOrientation: 'tr' }, 'spiral')
  ok(Array.isArray(g.spiral) && g.spiral.length > 0, 'spiral grid mode populates spiral[]')
  eq(g.verticals.length, 0, 'spiral mode draws no thirds verticals')
  eq(g.diagonals.length, 0, 'spiral mode draws no diagonals')
  // Every OTHER grid mode (and the empty result) carries a spiral key.
  ok(Array.isArray(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 100, frameH: 100 }, 'thirds').spiral),
    'thirds result has spiral array (empty, shape stability)')
  ok(Array.isArray(computeCompositionGrid(null, 'spiral').spiral), 'empty result has spiral array')
  eq(computeCompositionGrid({ frameX: 0, frameY: 0, frameW: 100, frameH: 100 }, 'off').spiral.length, 0,
    'off mode → empty spiral')

  // --- purity ---
  const rect = { frameX: 0, frameY: 0, frameW: 100, frameH: 100, spiralOrientation: 'tl' }
  const snap = JSON.stringify(rect)
  computeCompositionGrid(rect, 'spiral')
  buildGoldenSpiral(0, 0, 100, 100, 'tl')
  eq(JSON.stringify(rect), snap, 'R37.B helpers do not mutate input')
}

console.log(`PASS: framingGuides R37.B — ${passed} total assertions (incl. golden spiral + 4 orientations)`)

// === R38.B: polylineLength (spiral sweep reveal distance) =============
{
  // --- empty / degenerate → 0 ---
  eq(polylineLength([]), 0, 'empty → 0')
  eq(polylineLength([{ x: 1, y: 1 }]), 0, 'single point → 0 (no segment)')
  eq(polylineLength(null), 0, 'null → 0')
  eq(polylineLength('nope'), 0, 'non-array → 0')
  eq(polylineLength(undefined), 0, 'undefined → 0')

  // --- straight segments: sums Euclidean distance ---
  near(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5, '3-4-5 triangle → 5')
  near(polylineLength([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 10, 'horizontal 10')
  near(polylineLength([{ x: 0, y: 0 }, { x: 0, y: 7 }]), 7, 'vertical 7')
  // Multi-segment: 0,0 → 3,4 (len 5) → 3,4+12=16 down (len 12) → total 17.
  near(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 16 }]), 17, 'two segments sum')

  // --- zero-length (repeated point) contributes 0 ---
  near(polylineLength([{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 8, y: 9 }]), 5,
    'duplicate point adds 0, then 3-4-5 → 5')

  // --- junk coords in a segment are skipped, not poisoning the sum ---
  // A junk point at the END skips only the last segment; the clean
  // leading segment (0,0 → 3,4 = 5) still counts.
  near(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: NaN, y: 1 }]),
    5, 'trailing NaN point skips its segment; clean lead counts', 0.001)
  // A junk point in the MIDDLE skips BOTH adjacent segments (it can't be
  // an endpoint of any drawable segment).
  eq(polylineLength([{ x: 0, y: 0 }, { x: NaN, y: 1 }, { x: 3, y: 4 }]), 0,
    'mid NaN point skips both its segments → 0')
  near(polylineLength([{ x: 0, y: 0 }, null, { x: 0, y: 6 }]),
    0, 'null mid-point skips both adjacent segments', 0.001)
  ok(Number.isFinite(polylineLength([{ x: 0, y: 0 }, { x: Infinity, y: 0 }, { x: 0, y: 5 }])),
    'Infinity coord never yields a non-finite length')

  // --- a real spiral has a positive, finite length that GROWS with the
  // frame (a bigger frame → a longer curve to reveal) ---
  const small = polylineLength(buildGoldenSpiral(0, 0, 100, 100, 'tl', 8))
  const big = polylineLength(buildGoldenSpiral(0, 0, 300, 300, 'tl', 8))
  ok(small > 0 && Number.isFinite(small), 'spiral has positive finite length')
  ok(big > small, 'a 3x-larger frame yields a longer spiral path')

  // --- purity: input not mutated ---
  const src = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
  const snap = JSON.stringify(src)
  polylineLength(src)
  eq(JSON.stringify(src), snap, 'polylineLength does not mutate input')
}

console.log(`PASS: framingGuides R38.B — ${passed} total assertions (incl. polylineLength spiral sweep)`)
