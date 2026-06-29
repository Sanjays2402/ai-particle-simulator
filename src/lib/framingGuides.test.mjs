// framingGuides: aspect-ratio letterbox/pillarbox geometry + roster.
import {
  FRAMING_RATIOS, isValidFramingId, sanitizeFramingId, ratioForId,
  labelForId, nextFramingId, computeFramingBars, describeFraming,
  // R39.B — on-demand spiral sweep replay
  SPIRAL_SWEEP_NONCE_WRAP, nextSweepNonce, spiralSweepKey,
  // R40.B — spiral sweep speed control
  SPIRAL_SWEEP_SPEEDS, SPIRAL_SWEEP_SPEED_DEFAULT,
  isValidSpiralSweepSpeed, sanitizeSpiralSweepSpeed,
  nextSpiralSweepSpeed, spiralSweepTimings,
  // R41.B — spiral sweep easing control
  SPIRAL_SWEEP_EASINGS, SPIRAL_SWEEP_EASING_DEFAULT,
  isValidSpiralSweepEasing, sanitizeSpiralSweepEasing,
  nextSpiralSweepEasing, spiralSweepEasingCss,
  // R42.M — custom aspect-ratio input
  CUSTOM_FRAMING_ID, CUSTOM_RATIO_MIN, CUSTOM_RATIO_MAX,
  parseAspectRatio, clampCustomRatio, formatCustomRatioLabel,
  // R43.M — recent custom ratios MRU
  RECENT_RATIOS_MAX, sanitizeRecentRatios, pushRecentRatio, sameRecentRatios,
  // R44.M — pinned (favourite) custom ratios
  PINNED_RATIOS_MAX, sanitizePinnedRatios, isRatioPinned, togglePinnedRatio, buildRatioChips,
  // R45.M — reorder the pinned ratio chips
  movePinnedRatio,
  // R46.M — projected slot order during a pinned-chip drag
  projectedPinnedOrder,
  // R47.M — insert-caret gap during a pinned-chip drag
  pinnedDropCaretGap,
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
  // R46.E — friendly corner label for the spiral's eye
  spiralCornerLabel,
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

  // --- R46.E spiralCornerLabel — friendly corner names ---
  eq(spiralCornerLabel(0), 'Top-left', 'orientation 0 → Top-left')
  eq(spiralCornerLabel(1), 'Top-right', 'orientation 1 → Top-right')
  eq(spiralCornerLabel(2), 'Bottom-right', 'orientation 2 → Bottom-right')
  eq(spiralCornerLabel(3), 'Bottom-left', 'orientation 3 → Bottom-left')
  eq(spiralCornerLabel('tl'), 'Top-left', 'string id tl → Top-left')
  eq(spiralCornerLabel('bl'), 'Bottom-left', 'string id bl → Bottom-left')
  eq(spiralCornerLabel(5), 'Top-right', 'out-of-range index wraps (5%4=1) → Top-right')
  eq(spiralCornerLabel(-1), 'Bottom-left', 'negative wraps → Bottom-left')
  eq(spiralCornerLabel('xx'), 'Top-left', 'unknown string → Top-left (index 0)')
  eq(spiralCornerLabel(NaN), 'Top-left', 'NaN → Top-left')
  eq(spiralCornerLabel(undefined), 'Top-left', 'undefined → Top-left')
  // every orientation in the roster yields a non-empty unique label.
  {
    const labels = SPIRAL_ORIENTATIONS.map((_, i) => spiralCornerLabel(i))
    ok(labels.every(l => typeof l === 'string' && l.length > 0), 'every corner label non-empty')
    ok(new Set(labels).size === labels.length, 'corner labels are unique')
  }

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

// --- R39.B: on-demand spiral sweep replay -----------------------------
{
  // nextSweepNonce: monotonic step that always DIFFERS from its input
  // (so the React key changes → the one-shot sweep remounts).
  eq(nextSweepNonce(0), 1, 'nonce: 0 → 1')
  eq(nextSweepNonce(1), 2, 'nonce: 1 → 2')
  eq(nextSweepNonce(41), 42, 'nonce: steps by one')
  // every value differs from its successor across a long run
  {
    let n = 0
    let differsEveryStep = true
    for (let i = 0; i < 2500; i++) {
      const next = nextSweepNonce(n)
      if (next === n) { differsEveryStep = false; break }
      n = next
    }
    ok(differsEveryStep, 'nonce: never equals its input across a long run (forces remount)')
  }
  // wraps inside the bounded range (never grows unbounded)
  eq(nextSweepNonce(SPIRAL_SWEEP_NONCE_WRAP - 1), 0, 'nonce: wraps at the cap')
  ok(SPIRAL_SWEEP_NONCE_WRAP > 1 && Number.isInteger(SPIRAL_SWEEP_NONCE_WRAP), 'nonce wrap is a sane integer')
  // defensive: junk / negative resets to 1 (NOT 0 — 0→0 would no-op a remount)
  eq(nextSweepNonce(NaN), 1, 'nonce: NaN → 1')
  eq(nextSweepNonce(Infinity), 1, 'nonce: Infinity → 1')
  eq(nextSweepNonce(-5), 1, 'nonce: negative → 1')
  eq(nextSweepNonce('x'), 1, 'nonce: non-numeric → 1')
  eq(nextSweepNonce(undefined), 1, 'nonce: undefined → 1')
  // fractional input floors before stepping
  eq(nextSweepNonce(3.9), 4, 'nonce: fractional floors then steps')

  // spiralSweepKey: combines orientation + nonce into a stable remount key.
  eq(spiralSweepKey(0, 0), 'spiral-0-0', 'key: tl + nonce 0')
  eq(spiralSweepKey(2, 7), 'spiral-2-7', 'key: br + nonce 7')
  // a corner change OR a nonce bump both change the key (both replay)
  ok(spiralSweepKey(0, 5) !== spiralSweepKey(1, 5), 'key: orientation change → new key')
  ok(spiralSweepKey(0, 5) !== spiralSweepKey(0, 6), 'key: nonce bump → new key')
  // identical inputs → identical key (no spurious remount)
  eq(spiralSweepKey(3, 9), spiralSweepKey(3, 9), 'key: stable for identical inputs')
  // orientation sanitised: string ids + out-of-range wrap, junk → 0
  eq(spiralSweepKey('br', 1), `spiral-2-1`, 'key: string orientation id resolved to index')
  eq(spiralSweepKey(4, 1), 'spiral-0-1', 'key: out-of-range orientation wraps (4 → 0)')
  eq(spiralSweepKey(undefined, 1), 'spiral-0-1', 'key: junk orientation → 0')
  // nonce sanitised in the key too: junk nonce → 0 component
  eq(spiralSweepKey(1, NaN), 'spiral-1-0', 'key: NaN nonce → 0 component')
  eq(spiralSweepKey(1, -3), 'spiral-1-0', 'key: negative nonce → 0 component')
  eq(spiralSweepKey(1, 4.8), 'spiral-1-4', 'key: fractional nonce floored in key')
  // a full replay sequence keeps producing distinct keys for one corner
  {
    let nonce = 0
    const keys = new Set()
    for (let i = 0; i < 6; i++) {
      keys.add(spiralSweepKey(2, nonce))
      nonce = nextSweepNonce(nonce)
    }
    eq(keys.size, 6, 'key: six replays on one corner → six distinct keys')
  }
}

console.log(`PASS: framingGuides R39.B — ${passed} total assertions (incl. on-demand spiral sweep replay)`)

// --- R40.B: spiral sweep speed control --------------------------------
{
  // roster integrity: fast / normal / slow, ordered fast → slow.
  eq(SPIRAL_SWEEP_SPEEDS.length, 3, 'speed: three speeds')
  eq(SPIRAL_SWEEP_SPEEDS[0].id, 'fast', 'speed: first is fast')
  eq(SPIRAL_SWEEP_SPEEDS[1].id, 'normal', 'speed: second is normal')
  eq(SPIRAL_SWEEP_SPEEDS[2].id, 'slow', 'speed: third is slow')
  eq(SPIRAL_SWEEP_SPEED_DEFAULT, 'normal', 'speed: default is normal')
  for (const s of SPIRAL_SWEEP_SPEEDS) {
    ok(typeof s.id === 'string' && s.id.length > 0, `speed ${s.id}: has id`)
    ok(typeof s.label === 'string' && s.label.length > 0, `speed ${s.id}: has label`)
    ok(Number.isFinite(s.sweepMs) && s.sweepMs > 0, `speed ${s.id}: positive sweepMs`)
    ok(Number.isFinite(s.eyeDelayMs) && s.eyeDelayMs > 0, `speed ${s.id}: positive eyeDelayMs`)
    ok(Number.isFinite(s.eyeMs) && s.eyeMs > 0, `speed ${s.id}: positive eyeMs`)
    // The eye must start fading in BEFORE the sweep finishes so it lands
    // on the curve, not after.
    ok(s.eyeDelayMs < s.sweepMs, `speed ${s.id}: eye starts before sweep ends`)
  }
  // monotonic: fast < normal < slow on the sweep duration.
  ok(SPIRAL_SWEEP_SPEEDS[0].sweepMs < SPIRAL_SWEEP_SPEEDS[1].sweepMs, 'speed: fast quicker than normal')
  ok(SPIRAL_SWEEP_SPEEDS[1].sweepMs < SPIRAL_SWEEP_SPEEDS[2].sweepMs, 'speed: normal quicker than slow')

  // back-compat: 'normal' reproduces the original baked timings (0.9s
  // sweep / 0.62s eye-delay / 0.4s eye-in) so an existing user sees no
  // change until they pick another speed.
  {
    const t = spiralSweepTimings('normal')
    eq(t.sweepMs, 900, 'speed: normal sweepMs matches the original 0.9s')
    eq(t.eyeDelayMs, 620, 'speed: normal eyeDelayMs matches the original 0.62s')
    eq(t.eyeMs, 400, 'speed: normal eyeMs matches the original 0.4s')
    eq(t.sweepSec, '0.9', 'speed: sweepSec seconds-form')
    eq(t.eyeDelaySec, '0.62', 'speed: eyeDelaySec seconds-form')
    eq(t.eyeSec, '0.4', 'speed: eyeSec seconds-form')
  }
  {
    const t = spiralSweepTimings('slow')
    eq(t.sweepMs, 1800, 'speed: slow sweepMs')
    eq(t.sweepSec, '1.8', 'speed: slow sweepSec')
  }
  {
    const t = spiralSweepTimings('fast')
    eq(t.sweepSec, '0.45', 'speed: fast sweepSec keeps two decimals')
  }

  // validators.
  ok(isValidSpiralSweepSpeed('fast'), 'speed: fast is valid')
  ok(isValidSpiralSweepSpeed('slow'), 'speed: slow is valid')
  ok(!isValidSpiralSweepSpeed('turbo'), 'speed: unknown is invalid')
  ok(!isValidSpiralSweepSpeed(null), 'speed: null is invalid')
  eq(sanitizeSpiralSweepSpeed('fast'), 'fast', 'speed: sanitize keeps a valid id')
  eq(sanitizeSpiralSweepSpeed('turbo'), 'normal', 'speed: sanitize junk → default')
  eq(sanitizeSpiralSweepSpeed(undefined), 'normal', 'speed: sanitize undefined → default')
  eq(sanitizeSpiralSweepSpeed(42), 'normal', 'speed: sanitize number → default')

  // cycle wraps fast → normal → slow → fast.
  eq(nextSpiralSweepSpeed('fast'), 'normal', 'speed: fast → normal')
  eq(nextSpiralSweepSpeed('normal'), 'slow', 'speed: normal → slow')
  eq(nextSpiralSweepSpeed('slow'), 'fast', 'speed: slow wraps → fast')
  eq(nextSpiralSweepSpeed('junk'), 'fast', 'speed: cycle from junk → first')

  // junk id resolves to the default speed's timings (never crashes).
  {
    const t = spiralSweepTimings('nope')
    eq(t.id, 'normal', 'speed: junk timings id is the default')
    eq(t.sweepMs, 900, 'speed: junk timings = normal sweepMs')
  }
}

// --- R41.B: spiral sweep easing control --------------------------------
// Three named curves; 'ease-out' reproduces the EXACT pre-R41.B baked
// cubic-bezier(0.33,0.1,0.25,1) so it's the default + back-compat.
{
  eq(SPIRAL_SWEEP_EASINGS.length, 3, 'easing: three easings')
  eq(SPIRAL_SWEEP_EASINGS[0].id, 'ease-in', 'easing: first is ease-in')
  eq(SPIRAL_SWEEP_EASINGS[1].id, 'linear', 'easing: second is linear')
  eq(SPIRAL_SWEEP_EASINGS[2].id, 'ease-out', 'easing: third is ease-out')
  // every entry carries a css token + a hint.
  for (const e of SPIRAL_SWEEP_EASINGS) {
    ok(typeof e.css === 'string' && e.css.length > 0, `easing: ${e.id} has a css token`)
    ok(typeof e.label === 'string' && e.label.length > 0, `easing: ${e.id} has a label`)
    ok(typeof e.hint === 'string' && e.hint.length > 0, `easing: ${e.id} has a hint`)
  }
  // default is ease-out, and its css is the exact original baked curve.
  eq(SPIRAL_SWEEP_EASING_DEFAULT, 'ease-out', 'easing: default is ease-out')
  eq(spiralSweepEasingCss('ease-out'), 'cubic-bezier(0.33,0.1,0.25,1)',
    'easing: ease-out reproduces the original baked cubic-bezier (back-compat)')
  eq(spiralSweepEasingCss(SPIRAL_SWEEP_EASING_DEFAULT), 'cubic-bezier(0.33,0.1,0.25,1)',
    'easing: default css == the baked curve')
  // linear maps to the plain keyword (a CSS-legal timing function).
  eq(spiralSweepEasingCss('linear'), 'linear', 'easing: linear css token')
  // validators.
  ok(isValidSpiralSweepEasing('ease-in'), 'easing: ease-in is valid')
  ok(isValidSpiralSweepEasing('linear'), 'easing: linear is valid')
  ok(!isValidSpiralSweepEasing('bounce'), 'easing: unknown is invalid')
  ok(!isValidSpiralSweepEasing(null), 'easing: null is invalid')
  ok(!isValidSpiralSweepEasing(undefined), 'easing: undefined is invalid')
  // sanitize: keep valid, junk → default (so a corrupt value never
  // silently changes an existing user's sweep feel).
  eq(sanitizeSpiralSweepEasing('ease-in'), 'ease-in', 'easing: sanitize keeps a valid id')
  eq(sanitizeSpiralSweepEasing('bounce'), 'ease-out', 'easing: sanitize junk → default')
  eq(sanitizeSpiralSweepEasing(undefined), 'ease-out', 'easing: sanitize undefined → default')
  eq(sanitizeSpiralSweepEasing(7), 'ease-out', 'easing: sanitize number → default')
  // junk css resolves to the default's token (the baked curve) — never
  // crashes, never returns undefined into the animation string.
  eq(spiralSweepEasingCss('bounce'), 'cubic-bezier(0.33,0.1,0.25,1)',
    'easing: junk css → the baked default curve')
  eq(spiralSweepEasingCss(null), 'cubic-bezier(0.33,0.1,0.25,1)', 'easing: null css → default')
  // cycle wraps ease-in → linear → ease-out → ease-in.
  eq(nextSpiralSweepEasing('ease-in'), 'linear', 'easing: ease-in → linear')
  eq(nextSpiralSweepEasing('linear'), 'ease-out', 'easing: linear → ease-out')
  eq(nextSpiralSweepEasing('ease-out'), 'ease-in', 'easing: ease-out wraps → ease-in')
  eq(nextSpiralSweepEasing('junk'), 'ease-in', 'easing: cycle from junk → first')
  // every easing's css is a distinct token (no two chips feel the same).
  {
    const tokens = new Set(SPIRAL_SWEEP_EASINGS.map(e => e.css))
    eq(tokens.size, SPIRAL_SWEEP_EASINGS.length, 'easing: all css tokens are distinct')
  }
}

// --- R42.M: custom aspect-ratio input --------------------------------
{
  // custom pseudo-id round-trips through sanitize (it's a valid selection
  // even though it's not in FRAMING_RATIOS).
  eq(sanitizeFramingId(CUSTOM_FRAMING_ID), 'custom', 'custom id sanitizes to itself')
  eq(CUSTOM_FRAMING_ID, 'custom', 'custom id is "custom"')
  // ...but custom is NOT in the fixed roster, so the [ ] cycle skips it
  // and isValidFramingId (roster membership) reports false.
  eq(isValidFramingId('custom'), false, 'custom not a roster member')
  ok(!FRAMING_RATIOS.some(r => r.id === 'custom'), 'custom kept out of FRAMING_RATIOS')
  // nextFramingId never lands on custom (cycle is roster-only).
  {
    let id = FRAMING_RATIOS[0].id
    let sawCustom = false
    for (let i = 0; i < FRAMING_RATIOS.length + 2; i++) {
      id = nextFramingId(id)
      if (id === 'custom') sawCustom = true
    }
    ok(!sawCustom, 'cycle never yields custom')
  }

  // --- parseAspectRatio: A:B / AxB / A/B forms ---
  near(parseAspectRatio('16:9'), 16 / 9, 'parse 16:9')
  near(parseAspectRatio('21:9'), 21 / 9, 'parse 21:9')
  near(parseAspectRatio('4:5'), 4 / 5, 'parse 4:5')
  near(parseAspectRatio('16x9'), 16 / 9, 'parse 16x9 (x separator)')
  near(parseAspectRatio('16X9'), 16 / 9, 'parse 16X9 (uppercase X)')
  near(parseAspectRatio('16/9'), 16 / 9, 'parse 16/9 (slash separator)')
  near(parseAspectRatio('4 : 5'), 4 / 5, 'parse with spaces around separator')
  near(parseAspectRatio('  3:2  '), 3 / 2, 'parse trims outer whitespace')
  near(parseAspectRatio('1.85:1'), 1.85, 'parse decimal-in-ratio 1.85:1')
  // --- bare decimal form ---
  near(parseAspectRatio('2.39'), 2.39, 'parse bare decimal 2.39')
  near(parseAspectRatio('1'), 1, 'parse bare 1 (square)')
  near(parseAspectRatio(1.5), 1.5, 'parse bare number input')
  // --- junk / degenerate → null ---
  eq(parseAspectRatio(''), null, 'empty → null')
  eq(parseAspectRatio('   '), null, 'whitespace-only → null')
  eq(parseAspectRatio('abc'), null, 'letters → null')
  eq(parseAspectRatio('16:'), null, 'missing denominator → null')
  eq(parseAspectRatio(':9'), null, 'missing numerator → null')
  eq(parseAspectRatio('16:0'), null, 'divide-by-zero → null')
  eq(parseAspectRatio('0'), null, 'bare zero → null')
  eq(parseAspectRatio('-2'), null, 'bare negative → null')
  eq(parseAspectRatio('0:9'), null, 'zero numerator → null')
  eq(parseAspectRatio(null), null, 'null input → null')
  eq(parseAspectRatio(undefined), null, 'undefined input → null')
  eq(parseAspectRatio({}), null, 'object input → null')
  eq(parseAspectRatio('16:9:4'), null, 'triple-part → null')
  eq(parseAspectRatio(NaN), null, 'NaN → null')
  eq(parseAspectRatio(Infinity), null, 'Infinity → null')

  // --- clamping to the usable band ---
  ok(CUSTOM_RATIO_MIN > 0 && CUSTOM_RATIO_MAX > CUSTOM_RATIO_MIN, 'custom band sane')
  eq(parseAspectRatio('100:1'), CUSTOM_RATIO_MAX, 'absurdly wide clamps to MAX')
  eq(parseAspectRatio('1:100'), CUSTOM_RATIO_MIN, 'absurdly tall clamps to MIN')
  eq(clampCustomRatio(9), CUSTOM_RATIO_MAX, 'clampCustomRatio over → MAX')
  eq(clampCustomRatio(0.01), CUSTOM_RATIO_MIN, 'clampCustomRatio under → MIN')
  near(clampCustomRatio(2.39), 2.39, 'clampCustomRatio in-band passthrough')
  eq(clampCustomRatio(0), null, 'clampCustomRatio 0 → null')
  eq(clampCustomRatio(-1), null, 'clampCustomRatio negative → null')
  eq(clampCustomRatio(NaN), null, 'clampCustomRatio NaN → null')
  eq(clampCustomRatio('x'), null, 'clampCustomRatio junk → null')
  // a parsed ratio always lands inside the band.
  for (const inp of ['16:9', '2.39', '4:5', '32:9', '1:4', '0.5']) {
    const r = parseAspectRatio(inp)
    ok(r >= CUSTOM_RATIO_MIN && r <= CUSTOM_RATIO_MAX, `parsed ${inp} in band`)
  }

  // --- formatCustomRatioLabel ---
  eq(formatCustomRatioLabel(1.7777), '1.78', 'format rounds to 2dp')
  eq(formatCustomRatioLabel(2.39), '2.39', 'format keeps 2.39')
  eq(formatCustomRatioLabel(1), '1', 'format whole number')
  eq(formatCustomRatioLabel(null), '', 'format null → empty')
  eq(formatCustomRatioLabel(0), '', 'format 0 → empty')
  eq(formatCustomRatioLabel(-2), '', 'format negative → empty')
  eq(formatCustomRatioLabel(NaN), '', 'format NaN → empty')

  // --- the parsed custom ratio feeds computeFramingBars cleanly ---
  {
    const r = parseAspectRatio('1:1')
    const bars = computeFramingBars(200, 100, r) // wide viewport, square frame
    eq(bars.mode, 'pillarbox', 'custom 1:1 on wide viewport → pillarbox')
    near(bars.frameW, 100, 'custom 1:1 frame width matches height')
  }
}

// --- R43.M: recent custom ratios MRU ---------------------------------
{
  // sanitizeRecentRatios: keep valid clamped numbers, dedupe by label, cap.
  eq(sanitizeRecentRatios(null).length, 0, 'recents: non-array → []')
  eq(sanitizeRecentRatios([]).length, 0, 'recents: empty → []')
  {
    const s = sanitizeRecentRatios([2.39, 1.78, 1])
    eq(s.length, 3, 'recents: 3 distinct kept')
    near(s[0], 2.39, 'recents: order preserved [0]')
    near(s[2], 1, 'recents: order preserved [2]')
  }
  // junk / out-of-band entries dropped (clamp returns null for <=0).
  {
    const s = sanitizeRecentRatios([2.39, 0, -1, NaN, 'x', null, 1.5])
    eq(s.length, 2, 'recents: junk entries dropped')
    near(s[0], 2.39, 'recents: first valid kept')
    near(s[1], 1.5, 'recents: second valid kept')
  }
  // dedupe by 2dp display label (1.777 and 1.778 collapse to one).
  {
    const s = sanitizeRecentRatios([1.777, 1.778, 1.776])
    eq(s.length, 1, 'recents: near-equal ratios dedupe by label')
  }
  // cap at MAX (oldest beyond the cap falls off).
  {
    const big = [3.1, 2.9, 2.7, 2.5, 2.3, 2.1, 1.9]
    const s = sanitizeRecentRatios(big)
    eq(s.length, RECENT_RATIOS_MAX, 'recents: capped at MAX')
    near(s[0], 3.1, 'recents: newest kept at front under cap')
  }
  // out-of-band values are CLAMPED into the band (not dropped) — 100 → MAX.
  {
    const s = sanitizeRecentRatios([100])
    eq(s.length, 1, 'recents: huge ratio clamped not dropped')
    near(s[0], CUSTOM_RATIO_MAX, 'recents: clamped to band max')
  }

  // pushRecentRatio: prepend, move-to-front on repeat, clamp, cap.
  {
    let r = []
    r = pushRecentRatio(r, 2.39)
    r = pushRecentRatio(r, 1.78)
    eq(r.length, 2, 'push: two distinct')
    near(r[0], 1.78, 'push: newest at front')
    near(r[1], 2.39, 'push: older behind')
    // re-applying 2.39 floats it back to the front (no duplicate).
    r = pushRecentRatio(r, 2.39)
    eq(r.length, 2, 'push: repeat does not duplicate')
    near(r[0], 2.39, 'push: repeat floats to front')
  }
  // push clamps the incoming value; an unparseable one leaves the list as-is.
  {
    const base = pushRecentRatio([], 2.0)
    const same = pushRecentRatio(base, NaN)
    ok(sameRecentRatios(base, same), 'push: junk ratio → unchanged list')
    const clamped = pushRecentRatio([], 100)
    near(clamped[0], CUSTOM_RATIO_MAX, 'push: huge ratio clamped to band max')
  }
  // push caps at MAX as new distinct ratios arrive.
  {
    let r = []
    for (const v of [3.1, 2.9, 2.7, 2.5, 2.3, 2.1]) r = pushRecentRatio(r, v)
    eq(r.length, RECENT_RATIOS_MAX, 'push: capped at MAX')
    near(r[0], 2.1, 'push: newest survives the cap')
    ok(!r.some(x => formatCustomRatioLabel(x) === '3.1'), 'push: oldest dropped past cap')
  }
  // sameRecentRatios value-equality.
  ok(sameRecentRatios([1, 2, 3], [1, 2, 3]), 'same: equal arrays')
  ok(!sameRecentRatios([1, 2], [1, 2, 3]), 'same: different length')
  ok(!sameRecentRatios([1, 2, 3], [1, 9, 3]), 'same: different value')
  ok(!sameRecentRatios(null, []), 'same: non-array → false')
  // a pushed ratio is always re-applicable (in band, parseable label).
  {
    const r = pushRecentRatio([], parseAspectRatio('21:9'))
    ok(r.length === 1 && r[0] >= CUSTOM_RATIO_MIN && r[0] <= CUSTOM_RATIO_MAX, 'push: parsed 21:9 stored in band')
    ok(formatCustomRatioLabel(r[0]) !== '', 'push: stored ratio has a usable label')
  }
}

// --- R44.M: pinned (favourite) custom ratios ---
{
  // sanitizePinnedRatios mirrors the recents sanitiser.
  eq(sanitizePinnedRatios(null).length, 0, 'pin sanitize: non-array → []')
  eq(sanitizePinnedRatios('x').length, 0, 'pin sanitize: string → []')
  {
    const s = sanitizePinnedRatios([1.5, 1.5, 2])
    eq(s.length, 2, 'pin sanitize: dedupes by label')
    near(s[0], 1.5, 'pin sanitize: first occurrence kept')
  }
  {
    // capped to MAX, junk dropped.
    const s = sanitizePinnedRatios([1, 1.2, 1.4, 1.6, 1.8, 2.0, 'junk', NaN])
    eq(s.length, PINNED_RATIOS_MAX, 'pin sanitize: capped at MAX')
    ok(s.every(Number.isFinite), 'pin sanitize: only finite numbers')
  }
  // out-of-band ratios clamp into the usable band (parity with recents).
  {
    const s = sanitizePinnedRatios([100, 0.01])
    ok(s.every(x => x >= CUSTOM_RATIO_MIN && x <= CUSTOM_RATIO_MAX), 'pin sanitize: clamps to band')
  }

  // isRatioPinned matches by display label.
  ok(isRatioPinned([1.78], 1.78), 'isPinned: exact present')
  ok(isRatioPinned([1.777], 1.778), 'isPinned: matched by 2dp label')
  ok(!isRatioPinned([1.78], 2.39), 'isPinned: absent → false')
  ok(!isRatioPinned([1.78], 'junk'), 'isPinned: unparseable → false')
  ok(!isRatioPinned(null, 1.78), 'isPinned: non-array list → false')

  // togglePinnedRatio: pin at front, unpin by label, no-op on junk.
  {
    const p1 = togglePinnedRatio([], 2.39)
    eq(p1.length, 1, 'toggle: pin adds')
    near(p1[0], 2.39, 'toggle: pinned value stored')
    const p2 = togglePinnedRatio(p1, 1.85)
    eq(p2.length, 2, 'toggle: second pin adds')
    near(p2[0], 1.85, 'toggle: newest pin leads (front)')
    // re-toggling 2.39 removes it.
    const p3 = togglePinnedRatio(p2, 2.39)
    eq(p3.length, 1, 'toggle: re-toggle unpins')
    ok(!isRatioPinned(p3, 2.39), 'toggle: unpinned ratio gone')
    near(p3[0], 1.85, 'toggle: surviving pin intact')
  }
  // toggle unpins by 2dp label even with a slightly different input value.
  {
    const p = togglePinnedRatio([1.777], 1.778)
    eq(p.length, 0, 'toggle: unpins by display label match')
  }
  // unparseable ratio → cleaned list unchanged in value.
  {
    const base = [1.5, 2]
    const out = togglePinnedRatio(base, 'junk')
    ok(sameRecentRatios(out, sanitizePinnedRatios(base)), 'toggle: junk → cleaned list unchanged')
  }
  // pin cap: a 6th pin drops the oldest from the tail.
  {
    let p = []
    for (const r of [1.1, 1.2, 1.3, 1.4, 1.5]) p = togglePinnedRatio(p, r)
    eq(p.length, PINNED_RATIOS_MAX, 'toggle: at cap')
    p = togglePinnedRatio(p, 1.6)
    eq(p.length, PINNED_RATIOS_MAX, 'toggle: still capped after 6th pin')
    near(p[0], 1.6, 'toggle: newest pin at front past cap')
    ok(!isRatioPinned(p, 1.1), 'toggle: oldest pin dropped at cap')
  }
  // purity: toggle never mutates its input array.
  {
    const base = [1.5]
    const snap = base.slice()
    togglePinnedRatio(base, 2.0)
    ok(base.length === snap.length && base[0] === snap[0], 'toggle: input not mutated')
  }

  // buildRatioChips: pinned lead, recents follow, no dupes.
  {
    const chips = buildRatioChips([2.39], [1.78, 2.39, 1.0])
    // 2.39 pinned first; recents 1.78 and 1.0 follow; the 2.39 in recents
    // is de-duped against the pin.
    eq(chips.length, 3, 'chips: pinned ++ recents de-duped')
    eq(chips[0].label, '2.39', 'chips: pinned leads')
    ok(chips[0].pinned === true, 'chips: lead flagged pinned')
    ok(chips.slice(1).every(c => c.pinned === false), 'chips: recents flagged not-pinned')
    ok(!chips.slice(1).some(c => c.label === '2.39'), 'chips: pinned not repeated among recents')
  }
  // every chip carries a usable label + finite ratio.
  {
    const chips = buildRatioChips([1.5], [2.0])
    ok(chips.every(c => c.label && Number.isFinite(c.ratio)), 'chips: each has label + finite ratio')
  }
  // both empty → empty row.
  eq(buildRatioChips([], []).length, 0, 'chips: both empty → []')
  eq(buildRatioChips(null, null).length, 0, 'chips: non-arrays → []')
}

// --- R45.M: movePinnedRatio (reorder the pinned chips) ---
{
  // basic move: index 0 → 2 reorders the canonical list.
  {
    const out = movePinnedRatio([1.1, 1.2, 1.3], 0, 2)
    eq(out.length, 3, 'move: length preserved')
    near(out[0], 1.2, 'move: 0→2 second leads now')
    near(out[1], 1.3, 'move: third shifts up')
    near(out[2], 1.1, 'move: moved item lands at tail')
  }
  // move toward the front.
  {
    const out = movePinnedRatio([1.1, 1.2, 1.3], 2, 0)
    near(out[0], 1.3, 'move: 2→0 puts last at front')
    near(out[1], 1.1, 'move: rest shift down')
    near(out[2], 1.2, 'move: rest shift down 2')
  }
  // sanitizes the input FIRST so a raw blob reorders correctly.
  {
    // 'junk' + a dupe-by-label are stripped, leaving [2, 1.5]; move 0→1.
    const out = movePinnedRatio([2, 'junk', 1.5, 2.001], 0, 1)
    eq(out.length, 2, 'move: input sanitized before reorder (junk + dupe dropped)')
    near(out[0], 1.5, 'move: sanitized reorder front')
    near(out[1], 2, 'move: sanitized reorder tail')
  }
  // no-op moves return the SANITIZED list (by value) unchanged.
  {
    const same = movePinnedRatio([1.1, 1.2], 0, 0)
    ok(sameRecentRatios(same, [1.1, 1.2]), 'move: same index → sanitized unchanged')
    const oob = movePinnedRatio([1.1, 1.2], 0, 9)
    ok(sameRecentRatios(oob, [1.1, 1.2]), 'move: toIdx out of range → unchanged')
    const oobF = movePinnedRatio([1.1, 1.2], -1, 1)
    ok(sameRecentRatios(oobF, [1.1, 1.2]), 'move: fromIdx out of range → unchanged')
    const nan = movePinnedRatio([1.1, 1.2], NaN, 1)
    ok(sameRecentRatios(nan, [1.1, 1.2]), 'move: non-finite index → unchanged')
  }
  // non-array / empty input → [].
  eq(movePinnedRatio(null, 0, 1).length, 0, 'move: non-array → []')
  eq(movePinnedRatio([], 0, 1).length, 0, 'move: empty → []')
  // purity: never mutates the input array.
  {
    const base = [1.1, 1.2, 1.3]
    const snap = base.slice()
    movePinnedRatio(base, 0, 2)
    ok(base.length === snap.length && base.every((v, i) => v === snap[i]), 'move: input not mutated')
  }
}

// --- R46.M: projected slot order during a pinned-chip drag ---
{
  // No active drag → identity order [1..n].
  {
    const id = projectedPinnedOrder(4, null, null)
    ok(id.length === 4 && id.every((v, i) => v === i + 1), 'order: no drag → identity 1..n')
  }
  // count < 2 → identity (0 → [], 1 → [1]).
  eq(projectedPinnedOrder(0, 0, 1).length, 0, 'order: count 0 → []')
  ok(projectedPinnedOrder(1, 0, 0).length === 1 && projectedPinnedOrder(1, 0, 0)[0] === 1, 'order: count 1 → [1]')
  // Drag the FIRST chip to the LAST slot (0→3 in a 4-list): the dragged
  // chip lands in slot 4; everyone else shifts up one.
  {
    const o = projectedPinnedOrder(4, 0, 3)
    eq(o[0], 4, 'order: 0→3 — dragged chip projects to slot 4')
    eq(o[1], 1, 'order: 0→3 — chip 1 shifts to slot 1')
    eq(o[2], 2, 'order: 0→3 — chip 2 shifts to slot 2')
    eq(o[3], 3, 'order: 0→3 — chip 3 shifts to slot 3')
  }
  // Drag the LAST chip to the FIRST slot (3→0): dragged chip → slot 1,
  // the rest shift down one.
  {
    const o = projectedPinnedOrder(4, 3, 0)
    eq(o[3], 1, 'order: 3→0 — dragged chip projects to slot 1')
    eq(o[0], 2, 'order: 3→0 — chip 0 shifts to slot 2')
    eq(o[1], 3, 'order: 3→0 — chip 1 shifts to slot 3')
    eq(o[2], 4, 'order: 3→0 — chip 2 shifts to slot 4')
  }
  // A mid-list move (1→2 in a 3-list): chip 1 and chip 2 swap slots.
  {
    const o = projectedPinnedOrder(3, 1, 2)
    eq(o[0], 1, 'order: 1→2 — chip 0 unchanged')
    eq(o[1], 3, 'order: 1→2 — dragged chip 1 projects to slot 3')
    eq(o[2], 2, 'order: 1→2 — chip 2 shifts up to slot 2')
  }
  // Every projected order is a permutation of 1..n (no slot duplicated/lost).
  {
    const o = projectedPinnedOrder(5, 1, 4)
    const sorted = o.slice().sort((a, b) => a - b)
    ok(sorted.every((v, i) => v === i + 1), 'order: result is a permutation of 1..n')
  }
  // No-op / out-of-range / non-finite → identity.
  {
    ok(projectedPinnedOrder(3, 1, 1).every((v, i) => v === i + 1), 'order: same index → identity')
    ok(projectedPinnedOrder(3, 0, 9).every((v, i) => v === i + 1), 'order: toIdx OOB → identity')
    ok(projectedPinnedOrder(3, -1, 1).every((v, i) => v === i + 1), 'order: fromIdx OOB → identity')
    ok(projectedPinnedOrder(3, NaN, 1).every((v, i) => v === i + 1), 'order: non-finite idx → identity')
  }
  // Junk count → safe empty.
  eq(projectedPinnedOrder('junk', 0, 1).length, 0, 'order: junk count → []')
  eq(projectedPinnedOrder(NaN, 0, 1).length, 0, 'order: NaN count → []')
  // Consistency invariant: the badge's slot for the dragged chip equals
  // its new index after movePinnedRatio on a same-length canonical list.
  {
    const pins = [2, 1.6, 1.3, 1] // 4 distinct labels, already canonical
    const moved = movePinnedRatio(pins, 0, 2)
    const order = projectedPinnedOrder(pins.length, 0, 2)
    // dragged chip (orig idx 0) should be at slot order[0]; in `moved`
    // that value should sit at index order[0]-1.
    near(moved[order[0] - 1], pins[0], 'order: badge slot matches movePinnedRatio landing')
  }

  // --- R47.M — pinnedDropCaretGap (insert caret between chips) --------
  {
    // Caret sits at gap === toIdx (the slot the dragged chip lands in).
    eq(pinnedDropCaretGap(4, 0, 2), 2, 'caret: forward drag → gap at toIdx')
    eq(pinnedDropCaretGap(4, 3, 0), 0, 'caret: drag to head → gap 0')
    eq(pinnedDropCaretGap(4, 0, 3), 3, 'caret: drag to tail → gap at last index')
    // No active / degenerate drag → null (no caret rendered).
    eq(pinnedDropCaretGap(4, 1, 1), null, 'caret: same index → null')
    eq(pinnedDropCaretGap(4, null, 2), null, 'caret: null from → null')
    eq(pinnedDropCaretGap(4, 1, null), null, 'caret: null to → null')
    eq(pinnedDropCaretGap(4, NaN, 2), null, 'caret: NaN idx → null')
    eq(pinnedDropCaretGap(4, 0, 9), null, 'caret: to OOB → null')
    eq(pinnedDropCaretGap(4, -1, 2), null, 'caret: from OOB → null')
    eq(pinnedDropCaretGap(1, 0, 0), null, 'caret: <2 chips → null')
    eq(pinnedDropCaretGap('junk', 0, 1), null, 'caret: junk count → null')
    // Gap is always within [0, count) for a valid drag.
    ok(pinnedDropCaretGap(5, 2, 4) >= 0 && pinnedDropCaretGap(5, 2, 4) < 5, 'caret: gap in bounds')
  }
}

console.log(`PASS: framingGuides R42.M/R43.M/R44.M/R45.M/R46.M/R47.M — ${passed} total assertions (incl. custom aspect-ratio input + recents MRU + pinned favourites + pinned reorder + drag slot-order preview + drop caret)`)
