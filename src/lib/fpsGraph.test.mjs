// fpsGraph: sparkline point mapping + window summary for the Debug HUD.
import {
  FPS_GRAPH_CEIL, FPS_GOOD, FPS_OK,
  fpsBandColor, buildSparklinePoints, sparklinePointsAttr,
  refLineY, summarizeFpsWindow, buildBandedSparklineSegments,
  // R39.A — ETA-to-edge history strip
  ETA_HISTORY_CEIL, ETA_HISTORY_MAX,
  pushEtaHistory, buildEtaHistoryPoints, etaHistoryAttr, summarizeEtaHistory,
  // R39.D — hover-scrub readout for a sparkline
  scrubSparkline,
  // R40.A — hover-scrub readout for the ETA-history strip
  scrubEtaHistory,
  // R40.D — full per-sample stats for a pinned sparkline point
  sparklineSampleStats,
} from './fpsGraph.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }
function near(a, b, m, eps = 0.001) { if (Math.abs(a - b) > eps) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// --- fpsBandColor: agrees with the HUD's numeric thresholds ---
eq(fpsBandColor(60), '#86efac', '60fps → good green')
eq(fpsBandColor(55), '#86efac', '55fps (boundary) → good green')
eq(fpsBandColor(54), '#fbbf24', '54fps → amber')
eq(fpsBandColor(30), '#fbbf24', '30fps (boundary) → amber')
eq(fpsBandColor(29), '#f87171', '29fps → red')
eq(fpsBandColor(0), '#f87171', '0fps → red')
eq(fpsBandColor(NaN), '#6a6a80', 'NaN → neutral grey')
// Infinity is not finite, so it returns the neutral grey (never a band colour).
eq(fpsBandColor(Infinity), '#6a6a80', 'Infinity → neutral grey (not finite)')
eq(fpsBandColor('abc'), '#6a6a80', 'non-numeric → neutral grey')

// --- constants sanity ---
eq(FPS_GRAPH_CEIL, 70, 'ceiling pinned above vsync')
ok(FPS_GOOD === 55 && FPS_OK === 30, 'band thresholds match HUD')

// --- buildSparklinePoints: geometry ---
{
  const pts = buildSparklinePoints([], { width: 100, height: 28 })
  eq(pts.length, 0, 'empty samples → no points')
  eq(buildSparklinePoints(null).length, 0, 'null → no points')
  eq(buildSparklinePoints('nope').length, 0, 'non-array → no points')
}
{
  // Single sample pins to the right edge.
  const pts = buildSparklinePoints([60], { ceil: 60, width: 100, height: 30 })
  eq(pts.length, 1, 'one sample → one point')
  near(pts[0].x, 100, 'single sample at right edge')
  near(pts[0].y, 0, '60fps at ceil=60 → top of box (y=0)')
}
{
  // Two samples span the full width; fps maps to height.
  const pts = buildSparklinePoints([0, 70], { ceil: 70, width: 100, height: 28 })
  near(pts[0].x, 0, 'first sample at left edge')
  near(pts[0].y, 28, '0fps → bottom (y=height)')
  near(pts[1].x, 100, 'last sample at right edge')
  near(pts[1].y, 0, '70fps at ceil=70 → top (y=0)')
}
{
  // 35fps at ceil 70 → middle height.
  const pts = buildSparklinePoints([35], { ceil: 70, width: 50, height: 28 })
  near(pts[0].y, 14, '35/70 → mid box')
}
{
  // Junk sample collapses to the floor, never off-canvas.
  const pts = buildSparklinePoints([NaN, Infinity, -5, 60], { ceil: 60, height: 28 })
  near(pts[0].y, 28, 'NaN sample → floor')
  near(pts[1].y, 28, 'Infinity sample → floor')
  near(pts[2].y, 28, 'negative sample → floor')
  near(pts[3].y, 0, 'valid 60 sample → top')
  for (const p of pts) ok(p.y >= 0 && p.y <= 28, 'every y stays inside box')
}
{
  // Over-ceiling sample is clamped to the top, not above it.
  const pts = buildSparklinePoints([200], { ceil: 70, height: 28 })
  near(pts[0].y, 0, '200fps clamps to ceil → y=0 (not negative)')
}

// --- sparklinePointsAttr: SVG string ---
{
  eq(sparklinePointsAttr([]), '', 'empty → empty attr string')
  const attr = sparklinePointsAttr([0, 70], { ceil: 70, width: 100, height: 28 })
  eq(attr, '0,28 100,0', 'attr rounds + joins points')
  // Rounding to 0.1px.
  const attr2 = sparklinePointsAttr([35], { ceil: 70, width: 33, height: 28 })
  eq(attr2, '33,14', 'single point attr rounded')
}

// --- refLineY: 60fps guide line ---
{
  near(refLineY(60, { ceil: 70, height: 28 }), 28 - (60 / 70) * 28, '60fps line position')
  near(refLineY(0, { ceil: 70, height: 28 }), 28, '0fps line at bottom')
  near(refLineY(70, { ceil: 70, height: 28 }), 0, 'ceil line at top')
  eq(refLineY(80, { ceil: 70 }), null, 'line above ceil → null (off-box)')
  eq(refLineY(-1, { ceil: 70 }), null, 'negative line → null')
  eq(refLineY(NaN), null, 'NaN line → null')
}

// --- summarizeFpsWindow ---
{
  const empty = summarizeFpsWindow([])
  eq(empty.count, 0, 'empty window count 0')
  eq(empty.avg, 0, 'empty window avg 0')
  eq(summarizeFpsWindow(null).count, 0, 'null → empty summary')
}
{
  // Steady 60 → everything 60, no drops.
  const s = summarizeFpsWindow([60, 60, 60, 60])
  eq(s.min, 60, 'steady min')
  eq(s.max, 60, 'steady max')
  eq(s.avg, 60, 'steady avg')
  eq(s.last, 60, 'steady last')
  eq(s.low, 60, 'steady 1%-low')
  eq(s.drops, 0, 'steady no drops')
  eq(s.count, 4, 'steady count')
}
{
  // One bad dip below the 30 floor counts as a drop and drags the
  // 1%-low down, but the avg stays high.
  const s = summarizeFpsWindow([60, 60, 60, 60, 60, 60, 60, 60, 60, 12])
  eq(s.drops, 1, 'one sub-floor sample counted as a drop')
  eq(s.min, 12, 'min catches the dip')
  ok(s.avg >= 50, 'avg stays high despite single dip')
  eq(s.low, 12, '1%-low (10% of 10 = 1 sample) is the worst dip')
  eq(s.last, 12, 'last reflects newest sample')
}
{
  // 1%-low averages the worst fraction, not a single outlier.
  const s = summarizeFpsWindow([10, 20, 60, 60, 60, 60, 60, 60, 60, 60], { pctLow: 0.2 })
  // worst 20% of 10 = 2 samples → (10 + 20) / 2 = 15.
  eq(s.low, 15, '1%-low averages worst 20% (two samples)')
}
{
  // Junk samples are filtered out before stats.
  const s = summarizeFpsWindow([NaN, Infinity, -3, 60, 60])
  eq(s.count, 2, 'only finite non-negative samples counted')
  eq(s.avg, 60, 'junk excluded from avg')
}
{
  // All-junk → empty summary, no divide-by-zero.
  const s = summarizeFpsWindow([NaN, Infinity, -1])
  eq(s.count, 0, 'all-junk → empty')
}
{
  // Custom okFloor.
  const s = summarizeFpsWindow([45, 50, 55, 58], { okFloor: 50 })
  eq(s.drops, 1, 'custom floor counts 45 as a drop')
}

// --- purity: inputs not mutated ---
{
  const input = [30, 60, 45]
  const copy = input.slice()
  summarizeFpsWindow(input)
  buildSparklinePoints(input)
  eq(JSON.stringify(input), JSON.stringify(copy), 'input array not mutated')
}

// === R35.A: frame-time (ms) view =====================================
const r35 = await import('./fpsGraph.js')
const {
  FRAME_MS_GRAPH_CEIL, FRAME_BUDGET_60, FRAME_BUDGET_30,
  fpsToFrameMs, buildFrameTimeSparklinePoints, frameTimeSparklineAttr,
  frameMsRefLineY, frameMsBandColor, summarizeFrameTimeWindow,
  // R36.A — frame-budget headroom
  frameBudgetHeadroom, headroomBandColor,
  // R37.A — budget-headroom history strip
  HEADROOM_HISTORY_TOP, HEADROOM_HISTORY_BOTTOM,
  buildHeadroomHistoryPoints, headroomHistoryAttr, headroomZeroLineY,
  headroomTrend,
  // R38.A — ETA-to-budget-edge
  headroomEtaToEdge, ETA_MAX_SEC,
} = r35

// --- constants ---
eq(FRAME_MS_GRAPH_CEIL, 50, 'ms ceiling 50ms (== 20fps)')
near(FRAME_BUDGET_60, 16.6667, '60fps budget ~16.67ms', 0.001)
near(FRAME_BUDGET_30, 33.3333, '30fps budget ~33.33ms', 0.001)

// --- fpsToFrameMs ---
near(fpsToFrameMs(60), 16.6667, '60fps → 16.67ms', 0.001)
near(fpsToFrameMs(30), 33.3333, '30fps → 33.33ms', 0.001)
near(fpsToFrameMs(120), 8.3333, '120fps → 8.33ms', 0.001)
eq(fpsToFrameMs(20), 50, '20fps → 50ms (ceiling)')
eq(fpsToFrameMs(10), FRAME_MS_GRAPH_CEIL, '10fps clamps to ceiling (not 100ms)')
eq(fpsToFrameMs(0), FRAME_MS_GRAPH_CEIL, '0fps → ceiling, never 0ms (Infinity guard)')
eq(fpsToFrameMs(-5), FRAME_MS_GRAPH_CEIL, 'negative fps → ceiling')
eq(fpsToFrameMs(NaN), FRAME_MS_GRAPH_CEIL, 'NaN → ceiling (reads as bad, not perfect)')
eq(fpsToFrameMs(Infinity), FRAME_MS_GRAPH_CEIL, 'Infinity fps → ceiling')
near(fpsToFrameMs(40, 100), 25, '40fps with custom ceil → 25ms', 0.001)

// --- buildFrameTimeSparklinePoints: low ms sits near the TOP ---
{
  const pts = buildFrameTimeSparklinePoints([60, 30, 20], { ceil: 50, width: 100, height: 50 })
  eq(pts.length, 3, 'three samples → three points')
  near(pts[0].y, 16.6667, '60fps (16.7ms) near top (small y)', 0.01)
  near(pts[1].y, 33.3333, '30fps (33.3ms) mid', 0.01)
  near(pts[2].y, 50, '20fps (50ms) at floor (full height)', 0.01)
  // x spreads newest-at-right.
  eq(pts[0].x, 0, 'oldest at left edge')
  eq(pts[2].x, 100, 'newest at right edge')
  // faster frame is HIGHER (smaller y) than slower — same direction as fps dips.
  ok(pts[0].y < pts[2].y, 'fast frame drawn above slow frame')
}
{
  eq(buildFrameTimeSparklinePoints([], {}).length, 0, 'empty → no points')
  eq(buildFrameTimeSparklinePoints(null).length, 0, 'null → no points')
  eq(buildFrameTimeSparklinePoints('x').length, 0, 'non-array → no points')
  // single sample pins right.
  const one = buildFrameTimeSparklinePoints([60], { width: 80, height: 40 })
  eq(one.length, 1, 'one sample → one point')
  eq(one[0].x, 80, 'single sample pinned to right edge')
}

// --- frameTimeSparklineAttr ---
{
  const attr = frameTimeSparklineAttr([60, 30], { ceil: 50, width: 100, height: 50 })
  ok(typeof attr === 'string' && attr.includes(' '), 'attr is a space-joined string')
  eq(frameTimeSparklineAttr([], {}), '', 'empty → empty string')
}

// --- frameMsRefLineY ---
{
  near(frameMsRefLineY(16.6667, { ceil: 50, height: 50 }), 16.6667, '16.7ms line at ~16.7px', 0.01)
  near(frameMsRefLineY(50, { ceil: 50, height: 50 }), 50, '50ms line at floor', 0.01)
  near(frameMsRefLineY(0, { ceil: 50, height: 50 }), 0, '0ms line at top', 0.01)
  eq(frameMsRefLineY(60, { ceil: 50, height: 50 }), null, 'line beyond ceil → null')
  eq(frameMsRefLineY(-1, { ceil: 50 }), null, 'negative ms → null')
  eq(frameMsRefLineY(NaN), null, 'NaN → null')
}

// --- frameMsBandColor: budget-line agreement ---
eq(frameMsBandColor(16.6), '#86efac', 'under 16.7ms → green')
eq(frameMsBandColor(FRAME_BUDGET_60), '#86efac', 'exactly 60fps budget → green')
eq(frameMsBandColor(20), '#fbbf24', '20ms → amber')
eq(frameMsBandColor(FRAME_BUDGET_30), '#fbbf24', 'exactly 30fps budget → amber')
eq(frameMsBandColor(40), '#f87171', '40ms (slower than 30fps) → red')
eq(frameMsBandColor(NaN), '#6a6a80', 'NaN → neutral grey')
eq(frameMsBandColor(Infinity), '#6a6a80', 'Infinity → neutral grey')

// --- summarizeFrameTimeWindow ---
{
  // Mix of good + bad frames. fps 60,60,30,20 → 16.7,16.7,33.3,50ms.
  const s = summarizeFrameTimeWindow([60, 60, 30, 20])
  near(s.min, 16.7, 'min frame time ~16.7ms', 0.1)
  eq(s.max, 50, 'max frame time 50ms (the 20fps frame)')
  near(s.last, 50, 'last frame is the 20fps (50ms) one', 0.1)
  // over = frames slower than 33.3ms budget: only the 50ms one (33.3 itself is not strictly over).
  eq(s.over, 1, 'one frame over the 30fps budget')
  eq(s.count, 4, 'four valid frames')
  ok(s.high >= s.avg, '1%-high frame time >= avg (worst-case lead)')
}
{
  // All fast frames → no over-budget, high ~= the samples.
  const s = summarizeFrameTimeWindow([60, 60, 60, 60])
  eq(s.over, 0, 'all-fast → zero over budget')
  near(s.avg, 16.7, 'avg ~16.7ms', 0.1)
}
{
  // Junk filtered out.
  const s = summarizeFrameTimeWindow([60, NaN, Infinity, -5, 0])
  eq(s.count, 1, 'only the one valid sample counts')
  near(s.avg, 16.7, 'junk excluded from ms avg', 0.1)
}
{
  eq(summarizeFrameTimeWindow([]).count, 0, 'empty → empty summary')
  eq(summarizeFrameTimeWindow(null).count, 0, 'null → empty summary')
  eq(summarizeFrameTimeWindow([NaN, -1, 0]).count, 0, 'all-junk → empty')
}
{
  // Custom overMs threshold.
  const s = summarizeFrameTimeWindow([60, 50, 40], { overMs: 20 })
  // 60→16.7, 50→20, 40→25ms. over 20ms strictly: only 25ms.
  eq(s.over, 1, 'custom overMs counts the 25ms frame')
}

// --- purity: ms helpers don't mutate ---
{
  const input = [60, 30, 20]
  const copy = input.slice()
  summarizeFrameTimeWindow(input)
  buildFrameTimeSparklinePoints(input)
  eq(JSON.stringify(input), JSON.stringify(copy), 'ms helpers leave input unmutated')
}

// --- R36.A: frame-budget headroom ---
{
  // 120fps → 8.33ms frame, half the 16.7ms budget → ~50% headroom.
  const fast = frameBudgetHeadroom(120)
  near(fast.ms, 8.3, 'fast frame ms')
  ok(fast.headroom > 0.49 && fast.headroom < 0.51, '120fps ~50% headroom')
  eq(fast.headroomPct, 50, '120fps headroom 50%')
  eq(fast.overBudget, false, '120fps not over budget')
  ok(fast.used > 0.49 && fast.used < 0.51, '120fps ~50% used')

  // Exactly 60fps → 16.7ms → ~0% headroom, right at the edge (not over).
  const edge = frameBudgetHeadroom(60)
  ok(Math.abs(edge.headroom) < 0.001, '60fps ~0 headroom')
  eq(edge.overBudget, false, '60fps exactly at budget is not over')
  ok(edge.used > 0.99 && edge.used <= 1, '60fps ~full bar')

  // 30fps → 33.3ms → double the budget → negative headroom, over budget.
  const slow = frameBudgetHeadroom(30)
  ok(slow.headroom < 0, '30fps negative headroom')
  eq(slow.headroomPct, -100, '30fps headroom -100%')
  eq(slow.overBudget, true, '30fps over the 60fps budget')
  eq(slow.used, 1, 'over-budget bar pins to full (clamped)')

  // Junk fps → stalled frame (ceiling ms), zero headroom-ish, over budget.
  const junk = frameBudgetHeadroom(NaN)
  eq(junk.overBudget, true, 'NaN fps reads as over budget (stalled)')
  ok(junk.headroom < 0, 'NaN fps negative headroom')
  eq(junk.used, 1, 'NaN fps pins the bar full, never falsely empty')

  // Custom budget (the 30fps line) — 45fps (22.2ms) is under the 33.3ms
  // budget so it has positive headroom against the looser target.
  const loose = frameBudgetHeadroom(45, FRAME_BUDGET_30)
  eq(loose.overBudget, false, '45fps under the 30fps budget')
  ok(loose.headroom > 0, '45fps positive headroom vs 33.3ms budget')

  // Bad budget arg falls back to the 60fps budget.
  const badBudget = frameBudgetHeadroom(60, 0)
  ok(Math.abs(badBudget.headroom) < 0.001, 'zero budget falls back to 16.7ms')

  // headroomBandColor bands.
  eq(headroomBandColor(0.4), '#86efac', 'comfortable headroom green')
  eq(headroomBandColor(0.1), '#fbbf24', 'tight headroom amber')
  eq(headroomBandColor(-0.2), '#f87171', 'over budget red')
  eq(headroomBandColor(NaN), '#6a6a80', 'junk headroom grey')
  eq(headroomBandColor(0.25), '#86efac', 'exactly 25% is green (boundary)')
  eq(headroomBandColor(0), '#fbbf24', 'exactly 0% is amber (boundary)')

  // Purity: same input twice → equal output, no shared mutation.
  const a = frameBudgetHeadroom(90)
  const b = frameBudgetHeadroom(90)
  eq(JSON.stringify(a), JSON.stringify(b), 'frameBudgetHeadroom is pure')
}

console.log(`PASS: fpsGraph — ${passed} assertions (sparkline geometry, band colour, 1%-low window summary, R35.A frame-time ms view, R36.A budget headroom)`)

// === R37.A: budget-headroom history strip ============================
{
  // constants: symmetric clamp range with the zero line dead-centre.
  eq(HEADROOM_HISTORY_TOP, 1, 'history top is +1 (100% free)')
  eq(HEADROOM_HISTORY_BOTTOM, -1, 'history bottom is -1 (2x budget)')

  const OPT = { width: 100, height: 40, budgetMs: FRAME_BUDGET_60 }

  // --- buildHeadroomHistoryPoints: geometry ---
  eq(buildHeadroomHistoryPoints([], OPT).length, 0, 'empty samples → no points')
  eq(buildHeadroomHistoryPoints(null, OPT).length, 0, 'non-array → no points')
  eq(buildHeadroomHistoryPoints('nope', OPT).length, 0, 'string → no points')

  // 120fps (8.33ms) has ~50% headroom → above the centre line (y < mid).
  // 60fps (16.7ms) is right at the edge → on the centre line.
  // 30fps (33.3ms) is 2x budget → pinned to the floor.
  const pts = buildHeadroomHistoryPoints([120, 60, 30], OPT)
  eq(pts.length, 3, 'one point per sample')
  near(pts[0].x, 0, 'oldest sample at left edge')
  near(pts[2].x, 100, 'newest sample at right edge')
  const midY = headroomZeroLineY(OPT)
  near(midY, 20, 'zero line is vertical centre of a 40px box')
  ok(pts[0].y < midY, '120fps (free budget) sits ABOVE the zero line')
  near(pts[1].y, midY, '60fps (at edge) sits ON the zero line')
  near(pts[2].y, 40, '30fps (2x budget) pins to the floor')

  // Single sample pins to the right edge (no divide-by-zero).
  const one = buildHeadroomHistoryPoints([60], OPT)
  eq(one.length, 1, 'single sample → one point')
  near(one[0].x, 100, 'single sample at right edge')

  // A frame way under budget (e.g. 1000fps = 1ms) approaches the top.
  // Headroom = 1 - ms/budget asymptotically nears +1 but never reaches
  // it (ms is always > 0), so it sits just shy of the top edge.
  const fast = buildHeadroomHistoryPoints([1000], OPT)
  ok(fast[0].y < 2 && fast[0].y >= 0, 'super-fast frame sits near the top edge')

  // A frame way over budget (e.g. 5fps = 200ms) clamps to the floor.
  const slow = buildHeadroomHistoryPoints([5], OPT)
  near(slow[0].y, 40, 'super-slow frame clamps to the floor (y=height)')

  // Junk samples collapse to the over-budget floor (never falsely high).
  const junky = buildHeadroomHistoryPoints([NaN, Infinity, -1], OPT)
  eq(junky.length, 3, 'junk samples still produce points')
  for (const p of junky) near(p.y, 40, 'junk sample pins to the floor, never the top')

  // --- headroomHistoryAttr: SVG string ---
  eq(headroomHistoryAttr([], OPT), '', 'empty → empty attr string')
  const attr = headroomHistoryAttr([120, 60, 30], OPT)
  ok(attr.includes(' '), 'attr joins points with spaces')
  eq(attr.split(' ').length, 3, 'attr has one coord pair per sample')
  ok(/^[\d.,-]+$/.test(attr.replace(/ /g, '')), 'attr is numeric coords only')

  // --- headroomZeroLineY: defensive ---
  near(headroomZeroLineY({ height: 28 }), 14, 'default-ish box centre')
  near(headroomZeroLineY({}), 14, 'no height → 28px default → centre 14')

  // --- headroomTrend: rising / falling / flat ---
  eq(headroomTrend([], OPT).dir, 'flat', 'empty → flat')
  eq(headroomTrend([60], OPT).dir, 'flat', 'single sample → flat (needs 2)')
  eq(headroomTrend(null, OPT).dir, 'flat', 'non-array → flat')

  // Older half slow (30fps, negative headroom), newer half fast (120fps,
  // positive headroom) → recovering → rising, positive delta.
  const rising = headroomTrend([30, 30, 120, 120], OPT)
  eq(rising.dir, 'rising', 'slow→fast window reads rising')
  ok(rising.delta > 0, 'rising delta is positive')

  // Reverse: fast→slow → heading toward the edge → falling, negative delta.
  const falling = headroomTrend([120, 120, 30, 30], OPT)
  eq(falling.dir, 'falling', 'fast→slow window reads falling')
  ok(falling.delta < 0, 'falling delta is negative')

  // Steady scene → flat (within the dead-band).
  const steady = headroomTrend([60, 60, 60, 60], OPT)
  eq(steady.dir, 'flat', 'steady fps reads flat')
  eq(steady.delta, 0, 'steady delta is zero')

  // Dead-band keeps tiny drift flat. 61 vs 59fps headroom differ by a
  // hair (~0.005) — well under the 0.04 default dead-band.
  eq(headroomTrend([61, 61, 59, 59], OPT).dir, 'flat', 'sub-deadband drift stays flat')

  // A custom tiny dead-band lets that same drift register as a direction.
  const sensitive = headroomTrend([61, 61, 59, 59], { ...OPT, deadband: 0 })
  ok(sensitive.dir === 'falling' || sensitive.dir === 'rising', 'zero dead-band surfaces tiny drift')

  // Junk samples are filtered; a window of only junk → flat.
  eq(headroomTrend([NaN, Infinity, 'x', null], OPT).dir, 'flat', 'all-junk window → flat')

  // Purity: input not mutated.
  const src = [60, 30, 120]
  const snap = JSON.stringify(src)
  buildHeadroomHistoryPoints(src, OPT)
  headroomTrend(src, OPT)
  eq(JSON.stringify(src), snap, 'R37.A helpers do not mutate input')
}

console.log(`PASS: fpsGraph R37.A — ${passed} total assertions (incl. budget-headroom history strip + trend)`)

// === R38.A: ETA-to-budget-edge =======================================
// Clean headroom-producing fps (headroom = 1 - 60/fps):
//   240→0.75, 160→0.625, 120→0.5, 80→0.25, 60→0.0, 48→-0.25, 40→-0.5.
{
  // --- constant export ---
  ok(Number.isFinite(ETA_MAX_SEC) && ETA_MAX_SEC > 0, 'ETA_MAX_SEC is a positive finite cap')

  // --- degenerate inputs → no ETA ---
  for (const bad of [[], [120], null, 'nope', undefined, 42]) {
    const r = headroomEtaToEdge(bad)
    eq(r.approaching, false, `degenerate ${JSON.stringify(bad)} → not approaching`)
    eq(r.etaSec, null, `degenerate ${JSON.stringify(bad)} → null etaSec`)
  }

  // --- falling + above edge → concrete ETA ---
  // [160, 120] → headroom [0.625, 0.5], slope -0.125/sample; at 250ms/
  // sample that's -0.5/sec; current 0.5 → 0.5 / 0.5 = 1.0s to the edge.
  const fall = headroomEtaToEdge([160, 120]) // default sampleMs 250
  eq(fall.approaching, true, 'falling-above-edge window is approaching')
  near(fall.etaSec, 1.0, 'ETA = currentHeadroom / |slope/sec| = 1.0s')
  eq(fall.slopePerSec, -0.5, 'slope reads -0.5 headroom/sec at 250ms cadence')
  ok(fall.currentHeadroom > 0, 'current headroom still positive (above edge)')

  // A perfectly-linear longer window gives the same slope + ETA (robust
  // to window length when the trend is linear).
  const fall3 = headroomEtaToEdge([240, 160, 120]) // headroom 0.75,0.625,0.5
  eq(fall3.approaching, true, 'linear 3-sample fall is approaching')
  near(fall3.etaSec, 1.0, '3-sample linear fall → same 1.0s ETA')

  // --- sampleMs scales the ETA: slower cadence → the same per-sample
  // drop spans more real time, so MORE seconds to the edge. ---
  const slowCadence = headroomEtaToEdge([160, 120], { sampleMs: 500 })
  near(slowCadence.etaSec, 2.0, 'doubling the sample interval doubles the ETA')
  eq(slowCadence.slopePerSec, -0.25, '500ms cadence halves the per-second slope')

  // --- rising headroom (recovering) → no ETA ---
  const rise = headroomEtaToEdge([120, 160]) // headroom 0.5 → 0.625
  eq(rise.approaching, false, 'rising headroom is not approaching the edge')
  eq(rise.etaSec, null, 'recovering window → null etaSec')
  ok(rise.slopePerSec > 0, 'rising slope is positive')

  // --- flat → no ETA (slope inside the dead-band) ---
  const flatE = headroomEtaToEdge([120, 120, 120])
  eq(flatE.approaching, false, 'flat window not approaching')
  eq(flatE.slopePerSec, 0, 'flat window slope 0')

  // --- already over budget → no ETA even if direction varies ---
  eq(headroomEtaToEdge([48, 40]).approaching, false, 'over + falling → no ETA (already past edge)')
  eq(headroomEtaToEdge([40, 48]).approaching, false, 'over + recovering → no ETA (still below edge)')
  eq(headroomEtaToEdge([48, 40]).etaSec, null, 'over-budget window → null etaSec')

  // --- minSlope dead-band arg: a real drop can be suppressed by a
  // large dead-band, and surfaced by a tiny one. ---
  eq(headroomEtaToEdge([160, 120], { minSlope: 5 }).approaching, false,
    'huge dead-band suppresses even a steep drop')
  ok(headroomEtaToEdge([160, 120], { minSlope: 0 }).approaching,
    'zero dead-band surfaces the drop')

  // --- junk samples filtered; all-junk → none ---
  const withJunk = headroomEtaToEdge([NaN, 'x', null, 160, 120])
  eq(withJunk.approaching, true, 'junk filtered, valid tail still approaching')
  near(withJunk.etaSec, 1.0, 'junk does not tilt the ETA')
  eq(headroomEtaToEdge([NaN, Infinity, 'x', null]).approaching, false, 'all-junk → not approaching')

  // --- invariant: etaSec never exceeds the cap, never negative ---
  for (const series of [[160, 120], [240, 80], [120, 61], [240, 160, 120, 61]]) {
    const r = headroomEtaToEdge(series)
    if (r.etaSec != null) {
      ok(r.etaSec >= 0 && r.etaSec <= ETA_MAX_SEC, `ETA within [0, cap] for ${JSON.stringify(series)}`)
    }
  }

  // --- purity: input not mutated ---
  const src = [160, 120, 60]
  const snap = JSON.stringify(src)
  headroomEtaToEdge(src)
  eq(JSON.stringify(src), snap, 'R38.A helper does not mutate input')
}

console.log(`PASS: fpsGraph R38.A — ${passed} total assertions (incl. ETA-to-budget-edge)`)

// === R38.D: buildBandedSparklineSegments =============================
// Band colours: green >=55, amber >=30, red <30 (fpsBandColor).
{
  // --- degenerate inputs → [] ---
  eq(buildBandedSparklineSegments([]).length, 0, 'empty → no segments')
  eq(buildBandedSparklineSegments([60]).length, 0, 'single sample → no segments (no line)')
  eq(buildBandedSparklineSegments(null).length, 0, 'null → no segments')
  eq(buildBandedSparklineSegments('nope').length, 0, 'non-array → no segments')

  // --- all one band → a single segment spanning every point ---
  const allGood = buildBandedSparklineSegments([60, 58, 56, 60], { width: 100, height: 30 })
  eq(allGood.length, 1, 'uniform-band window → one segment')
  eq(allGood[0].color, '#86efac', 'all-good run is green')
  eq(allGood[0].points.length, 4, 'segment covers all four points')
  ok(typeof allGood[0].attr === 'string' && allGood[0].attr.includes(' '), 'segment carries an SVG attr string')

  // --- a dip into red splits into runs; the boundary point is SHARED so
  // the coloured lines connect with no gap ---
  const dip = buildBandedSparklineSegments([60, 58, 20, 22, 60], { width: 100, height: 30 })
  eq(dip.length, 3, 'green→red→green produces three segments')
  eq(dip[0].color, '#86efac', 'first run green')
  eq(dip[1].color, '#f87171', 'middle run red (the dip)')
  eq(dip[2].color, '#86efac', 'last run green (recovery)')
  // Shared-boundary contract: the last point of run k equals the first
  // point of run k+1 so the polylines meet.
  for (let k = 0; k < dip.length - 1; k++) {
    const endPrev = dip[k].points[dip[k].points.length - 1]
    const startNext = dip[k + 1].points[0]
    near(endPrev.x, startNext.x, `segment ${k}/${k + 1} share boundary x`)
    near(endPrev.y, startNext.y, `segment ${k}/${k + 1} share boundary y`)
  }

  // --- the x of every point increases left→right across the whole window
  // regardless of how it's split (geometry preserved) ---
  const flat = buildBandedSparklineSegments([60, 40, 20], { width: 90, height: 30 })
  const allX = flat.flatMap(s => s.points.map(p => p.x))
  for (let i = 1; i < allX.length; i++) ok(allX[i] >= allX[i - 1], 'x is monotonic across split segments')

  // --- every band actually represented when destination samples sweep
  // green→amber→red (segments are coloured by their destination sample) ---
  const sweep = buildBandedSparklineSegments([60, 60, 40, 20], { width: 100, height: 30 })
  const colors = sweep.map(s => s.color)
  ok(colors.includes('#86efac') && colors.includes('#fbbf24') && colors.includes('#f87171'),
    'green/amber/red all present when destinations span all bands')

  // --- junk samples colour as red (fpsBandColor neutral) but never crash;
  // segments stay finite ---
  const withJunk = buildBandedSparklineSegments([60, NaN, 60], { width: 100, height: 30 })
  ok(withJunk.every(s => s.points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))),
    'junk sample never yields a non-finite point')

  // --- purity: input not mutated ---
  const src = [60, 20, 60]
  const snap = JSON.stringify(src)
  buildBandedSparklineSegments(src)
  eq(JSON.stringify(src), snap, 'R38.D helper does not mutate input')
}

console.log(`PASS: fpsGraph R38.D — ${passed} total assertions (incl. band-coloured sparkline segments)`)

// --- R39.A: ETA-to-edge history strip ---------------------------------
{
  // pushEtaHistory: finite non-negative kept; junk → null; FIFO cap.
  eq(JSON.stringify(pushEtaHistory([], 5)), '[5]', 'push: first finite sample kept')
  eq(JSON.stringify(pushEtaHistory([5], 3)), '[5,3]', 'push: second finite appended')
  eq(JSON.stringify(pushEtaHistory([5], null)), '[5,null]', 'push: null (not approaching) → null tick')
  eq(JSON.stringify(pushEtaHistory([5], NaN)), '[5,null]', 'push: NaN → null tick')
  eq(JSON.stringify(pushEtaHistory([5], Infinity)), '[5,null]', 'push: Infinity → null tick')
  eq(JSON.stringify(pushEtaHistory([5], -2)), '[5,null]', 'push: negative → null tick')
  eq(JSON.stringify(pushEtaHistory([5], 0)), '[5,0]', 'push: zero (at the edge) is a real sample')
  // non-array prev → treated as empty
  eq(JSON.stringify(pushEtaHistory(null, 4)), '[4]', 'push: non-array prev → fresh [v]')
  eq(JSON.stringify(pushEtaHistory(undefined, 4)), '[4]', 'push: undefined prev → fresh [v]')
  // FIFO cap drops oldest
  {
    const capped = pushEtaHistory([1, 2, 3], 4, 3)
    eq(JSON.stringify(capped), '[2,3,4]', 'push: cap drops oldest to maxLen')
  }
  // overflow cap normalises a long list down to maxLen
  eq(pushEtaHistory([1, 2, 3, 4, 5], 6, 3).length, 3, 'push: long list trimmed to cap')
  // invalid maxLen → default cap (don't crash, don't truncate to 0)
  ok(pushEtaHistory([1], 2, 0).length === 2, 'push: zero maxLen falls back to default (no truncation)')
  ok(pushEtaHistory([1], 2, NaN).length === 2, 'push: NaN maxLen falls back to default')
  // purity: input array not mutated
  {
    const src = [1, 2]
    const snap = JSON.stringify(src)
    pushEtaHistory(src, 3)
    eq(JSON.stringify(src), snap, 'push: does not mutate input')
  }

  // buildEtaHistoryPoints: high ETA → top (small y); 0 → floor.
  {
    const pts = buildEtaHistoryPoints([ETA_HISTORY_CEIL, 0], { width: 100, height: 20, ceil: ETA_HISTORY_CEIL })
    eq(pts.length, 2, 'points: one per sample')
    near(pts[0].y, 0, 'points: ceil ETA pins to top (y=0)')
    near(pts[1].y, 20, 'points: ETA 0 pins to floor (y=height)')
    near(pts[0].x, 0, 'points: oldest at left edge')
    near(pts[1].x, 100, 'points: newest at right edge')
  }
  // ETA above ceil clamps to top; null/junk samples pin to ceil (top = safe)
  {
    const pts = buildEtaHistoryPoints([999, null, NaN], { width: 100, height: 20, ceil: 30 })
    near(pts[0].y, 0, 'points: ETA above ceil clamps to top')
    near(pts[1].y, 0, 'points: null tick plots at safe ceiling (top)')
    near(pts[2].y, 0, 'points: NaN tick plots at safe ceiling (top)')
  }
  // single sample pins to the right edge (no divide-by-zero)
  {
    const pts = buildEtaHistoryPoints([10], { width: 80, height: 20 })
    eq(pts.length, 1, 'points: single sample → one point')
    near(pts[0].x, 80, 'points: single sample sits at right edge')
  }
  // empty / non-array → []
  eq(buildEtaHistoryPoints([]).length, 0, 'points: empty → []')
  eq(buildEtaHistoryPoints(null).length, 0, 'points: non-array → []')
  // attr string: '' when empty, "x,y x,y" when not
  eq(etaHistoryAttr([]), '', 'attr: empty → empty string')
  ok(/^[\d.]+,[\d.]+ [\d.]+,[\d.]+$/.test(etaHistoryAttr([10, 5], { width: 100, height: 20 })),
    'attr: two samples → "x,y x,y" string')

  // summarizeEtaHistory: trend direction over the finite samples.
  {
    const none = summarizeEtaHistory([])
    eq(none.hasData, false, 'summary: empty → no data')
    eq(none.dir, 'flat', 'summary: empty → flat')
    eq(none.latest, null, 'summary: empty → null latest')
  }
  // all-null (never approaching) → no data
  {
    const s = summarizeEtaHistory([null, null, null])
    eq(s.hasData, false, 'summary: all-null → no data')
  }
  // falling ETA (edge rushing at you): older big, newer small
  {
    const s = summarizeEtaHistory([20, 18, 8, 5, 3])
    eq(s.hasData, true, 'summary: falling → has data')
    eq(s.dir, 'falling', 'summary: shrinking ETA → falling (edge approaching)')
    eq(s.latest, 3, 'summary: latest is the newest finite ETA')
    eq(s.urgent, true, 'summary: latest <= 3s → urgent')
  }
  // rising ETA (pulling away / stabilising): older small, newer big
  {
    const s = summarizeEtaHistory([3, 5, 12, 18, 24])
    eq(s.dir, 'rising', 'summary: growing ETA → rising (stabilising)')
    eq(s.urgent, false, 'summary: comfortable latest → not urgent')
  }
  // flat within dead-band
  {
    const s = summarizeEtaHistory([10, 10.1, 9.9, 10.05])
    eq(s.dir, 'flat', 'summary: steady ETA within dead-band → flat')
  }
  // nulls interleaved don't fake a trend — only finite samples count
  {
    const s = summarizeEtaHistory([20, null, 18, null, 4, 3])
    eq(s.dir, 'falling', 'summary: ignores null gaps, reads finite trend')
    eq(s.count, 4, 'summary: count is finite samples only')
  }
  // single finite sample → flat (no two halves to compare) but has data
  {
    const s = summarizeEtaHistory([2])
    eq(s.hasData, true, 'summary: single finite → has data')
    eq(s.dir, 'flat', 'summary: single sample → flat')
    eq(s.urgent, true, 'summary: single 2s sample → urgent')
  }
  // custom urgentAt threshold honoured
  {
    const s = summarizeEtaHistory([5], { urgentAt: 6 })
    eq(s.urgent, true, 'summary: custom urgentAt=6 marks 5s urgent')
  }
  // junk (NaN/Infinity/negative) filtered out of the finite series
  {
    const s = summarizeEtaHistory([NaN, Infinity, -3, 10])
    eq(s.count, 1, 'summary: junk filtered, only finite counted')
    eq(s.latest, 10, 'summary: latest is the lone finite value')
  }
  // constants sane
  ok(ETA_HISTORY_CEIL > 0 && Number.isFinite(ETA_HISTORY_CEIL), 'ETA_HISTORY_CEIL finite positive')
  ok(ETA_HISTORY_MAX > 0 && Number.isInteger(ETA_HISTORY_MAX), 'ETA_HISTORY_MAX positive integer')
  // purity: summarize doesn't mutate
  {
    const src = [20, 10, 5]
    const snap = JSON.stringify(src)
    summarizeEtaHistory(src)
    eq(JSON.stringify(src), snap, 'summary: does not mutate input')
  }
}

console.log(`PASS: fpsGraph R39.A — ${passed} total assertions (incl. ETA-to-edge history strip)`)

// --- R39.D: hover-scrub readout for a sparkline -----------------------
{
  // A 5-sample window over a 100px-wide sparkline at 1Hz. Samples are
  // newest-LAST, so index 4 is "now" (0s ago), index 0 is 4s ago.
  const samples = [60, 50, 40, 30, 20]
  const W = 100, SAMPLE_MS = 1000
  // cursor at the right edge → newest sample (index 4, 0s ago).
  {
    const r = scrubSparkline(samples, 100, { width: W, sampleMs: SAMPLE_MS })
    ok(r !== null, 'scrub: right-edge cursor → a result')
    eq(r.index, 4, 'scrub: right edge → newest sample index')
    eq(r.fps, 20, 'scrub: right edge → newest fps')
    eq(r.secondsAgo, 0, 'scrub: newest sample is 0s ago')
    near(r.x, 100, 'scrub: snapped x at the right edge')
  }
  // cursor at the left edge → oldest sample (index 0, 4s ago).
  {
    const r = scrubSparkline(samples, 0, { width: W, sampleMs: SAMPLE_MS })
    eq(r.index, 0, 'scrub: left edge → oldest sample index')
    eq(r.fps, 60, 'scrub: left edge → oldest fps')
    eq(r.secondsAgo, 4, 'scrub: oldest of 5 @1Hz is 4s ago')
    near(r.x, 0, 'scrub: snapped x at the left edge')
  }
  // cursor mid-sparkline snaps to the NEAREST sample (25px → index 1).
  {
    const r = scrubSparkline(samples, 25, { width: W, sampleMs: SAMPLE_MS })
    eq(r.index, 1, 'scrub: 25px over 4 gaps → nearest sample index 1')
    eq(r.fps, 50, 'scrub: index-1 fps')
    eq(r.secondsAgo, 3, 'scrub: index 1 of 5 is 3s ago')
    near(r.x, 25, 'scrub: snapped x lands on the sample, not the cursor')
  }
  // exact midpoint (50px → index 2, the centre sample).
  {
    const r = scrubSparkline(samples, 50, { width: W, sampleMs: SAMPLE_MS })
    eq(r.index, 2, 'scrub: 50px → centre sample index 2')
    eq(r.secondsAgo, 2, 'scrub: centre of 5 is 2s ago')
  }
  // overshoot clamps to the nearest edge rather than returning null.
  {
    const over = scrubSparkline(samples, 999, { width: W })
    eq(over.index, 4, 'scrub: cursor past right edge clamps to newest')
    const under = scrubSparkline(samples, -50, { width: W })
    eq(under.index, 0, 'scrub: cursor before left edge clamps to oldest')
  }
  // single-sample window: any cursor resolves to that lone sample at the
  // right edge, 0s ago (no divide-by-zero).
  {
    const r = scrubSparkline([42], 80, { width: 160 })
    eq(r.index, 0, 'scrub: single sample → index 0')
    eq(r.fps, 42, 'scrub: single sample fps')
    eq(r.secondsAgo, 0, 'scrub: single sample is "now"')
    near(r.x, 160, 'scrub: single sample pins to right edge')
  }
  // junk sample under the cursor → fps null (tooltip shows "—") but a
  // valid index + secondsAgo so the guide line still anchors.
  {
    const r = scrubSparkline([60, NaN, 30], 50, { width: 100 })
    eq(r.index, 1, 'scrub: lands on the junk sample')
    eq(r.fps, null, 'scrub: junk sample → null fps')
    eq(r.secondsAgo, 1, 'scrub: junk sample still reports an age')
  }
  // custom sampleMs (e.g. the HUD's 250ms cadence) scales secondsAgo.
  {
    const r = scrubSparkline([60, 50, 40, 30], 0, { width: 90, sampleMs: 250 })
    eq(r.index, 0, 'scrub: oldest of 4')
    eq(r.secondsAgo, 1, 'scrub: 3 steps * 250ms = 0.75s → rounds to 1s')
  }
  // defensive: empty / non-array / non-finite cursor → null.
  eq(scrubSparkline([], 50), null, 'scrub: empty samples → null')
  eq(scrubSparkline(null, 50), null, 'scrub: non-array samples → null')
  eq(scrubSparkline([60, 30], NaN), null, 'scrub: NaN cursor → null')
  eq(scrubSparkline([60, 30], Infinity, { width: 100 }), null, 'scrub: Infinity cursor → null')
  // purity: input not mutated.
  {
    const src = [60, 40, 20]
    const snap = JSON.stringify(src)
    scrubSparkline(src, 50, { width: 100 })
    eq(JSON.stringify(src), snap, 'scrub: does not mutate input')
  }
}

console.log(`PASS: fpsGraph R39.D — ${passed} total assertions (incl. sparkline hover-scrub readout)`)

// --- R40.A: scrubEtaHistory — read an exact ETA + age off the strip ---
{
  // Even spacing over a 100px box: 5 samples at x = 0,25,50,75,100.
  const hist = [12, 9, 6, 3, 1] // newest-last (1s to edge "now")
  {
    const r = scrubEtaHistory(hist, 0, { width: 100, sampleMs: 250 })
    eq(r.index, 0, 'eta-scrub: cursor at left → oldest sample')
    eq(r.etaSec, 12, 'eta-scrub: oldest etaSec read exactly')
    eq(r.approaching, true, 'eta-scrub: finite sample is approaching')
    near(r.x, 0, 'eta-scrub: oldest x at left edge')
    eq(r.secondsAgo, 1, 'eta-scrub: 4 steps * 250ms = 1s ago')
  }
  {
    const r = scrubEtaHistory(hist, 100, { width: 100, sampleMs: 250 })
    eq(r.index, 4, 'eta-scrub: cursor at right → newest sample')
    eq(r.etaSec, 1, 'eta-scrub: newest etaSec')
    eq(r.secondsAgo, 0, 'eta-scrub: newest is "now"')
    near(r.x, 100, 'eta-scrub: newest x at right edge')
  }
  {
    // Cursor near the middle snaps to the nearest sample (x=50 → idx 2).
    const r = scrubEtaHistory(hist, 52, { width: 100 })
    eq(r.index, 2, 'eta-scrub: mid cursor snaps to nearest sample')
    eq(r.etaSec, 6, 'eta-scrub: mid sample etaSec')
    near(r.x, 50, 'eta-scrub: snapped x lands on the sample')
  }
}
// "not approaching" ticks are null markers, NOT a 0s ETA — they read as
// non-approaching (tooltip shows "safe"), with a valid index + age so
// the guide still anchors.
{
  const hist = [null, 8, null, 4, null]
  {
    const r = scrubEtaHistory(hist, 0, { width: 100 })
    eq(r.index, 0, 'eta-scrub: lands on the null tick')
    eq(r.etaSec, null, 'eta-scrub: null tick → null etaSec (not 0)')
    eq(r.approaching, false, 'eta-scrub: null tick is not approaching')
  }
  {
    const r = scrubEtaHistory(hist, 25, { width: 100 })
    eq(r.etaSec, 8, 'eta-scrub: finite tick beside nulls reads exactly')
    eq(r.approaching, true, 'eta-scrub: finite tick approaching')
  }
}
// over/undershoot clamps to nearest edge (never null mid-strip).
{
  const hist = [10, 5, 2]
  eq(scrubEtaHistory(hist, -40, { width: 100 }).index, 0, 'eta-scrub: undershoot clamps to oldest')
  eq(scrubEtaHistory(hist, 9000, { width: 100 }).index, 2, 'eta-scrub: overshoot clamps to newest')
}
// single-sample history: any cursor resolves to that lone sample at the
// right edge, 0s ago (no divide-by-zero).
{
  const r = scrubEtaHistory([7], 40, { width: 80 })
  eq(r.index, 0, 'eta-scrub: single sample → index 0')
  eq(r.etaSec, 7, 'eta-scrub: single sample etaSec')
  eq(r.secondsAgo, 0, 'eta-scrub: single sample is "now"')
  near(r.x, 80, 'eta-scrub: single sample pins to right edge')
}
// fractional ETA rounds to 0.1s.
{
  const r = scrubEtaHistory([4.27], 10, { width: 50 })
  eq(r.etaSec, 4.3, 'eta-scrub: etaSec rounds to 0.1s')
}
// custom sampleMs scales secondsAgo (HUD default is 250ms).
{
  const r = scrubEtaHistory([9, 6, 3, 1], 0, { width: 90 })
  eq(r.index, 0, 'eta-scrub: oldest of 4')
  eq(r.secondsAgo, 1, 'eta-scrub: default 250ms cadence → 3 steps = 0.75s ≈ 1s')
}
// defensive: empty / non-array / non-finite cursor → null.
eq(scrubEtaHistory([], 50), null, 'eta-scrub: empty history → null')
eq(scrubEtaHistory(null, 50), null, 'eta-scrub: non-array history → null')
eq(scrubEtaHistory([10, 5], NaN), null, 'eta-scrub: NaN cursor → null')
eq(scrubEtaHistory([10, 5], Infinity, { width: 100 }), null, 'eta-scrub: Infinity cursor → null')
// purity: input not mutated.
{
  const src = [12, null, 4]
  const snap = JSON.stringify(src)
  scrubEtaHistory(src, 50, { width: 100 })
  eq(JSON.stringify(src), snap, 'eta-scrub: does not mutate input')
}

console.log(`PASS: fpsGraph R40.A — ${passed} total assertions (incl. ETA-history hover-scrub readout)`)

// --- R40.D: sparklineSampleStats — pin a sample's full stats ----------
{
  // A 5-sample window, newest-last. 60fps "now", a 24fps drop two ago.
  const series = [58, 60, 24, 55, 60]
  {
    const r = sparklineSampleStats(series, 2, { sampleMs: 1000 })
    eq(r.index, 2, 'pin: index echoed')
    eq(r.fps, 24, 'pin: fps read exactly')
    eq(r.isDrop, true, 'pin: 24fps is a drop (< 30)')
    near(r.frameMs, 41.7, 'pin: 24fps → ~41.7ms frame', 0.1)
    eq(r.secondsAgo, 2, 'pin: two samples before now at 1Hz = 2s ago')
  }
  {
    const r = sparklineSampleStats(series, 4)
    eq(r.fps, 60, 'pin: newest fps')
    eq(r.isDrop, false, 'pin: 60fps is not a drop')
    eq(r.secondsAgo, 0, 'pin: newest is "now"')
    near(r.frameMs, 16.7, 'pin: 60fps → ~16.7ms', 0.1)
  }
}
// boundary: exactly at the 30fps floor is NOT a drop (drop = strictly under).
{
  const r = sparklineSampleStats([30, 60], 0)
  eq(r.isDrop, false, 'pin: 30fps (floor) is not a drop')
}
{
  const r = sparklineSampleStats([29, 60], 0)
  eq(r.isDrop, true, 'pin: 29fps is a drop')
}
// custom dropFloor (e.g. a 55fps "smooth" threshold).
{
  const r = sparklineSampleStats([40, 60], 0, { dropFloor: 55 })
  eq(r.isDrop, true, 'pin: 40fps is a drop under a 55fps floor')
}
// frame ms is derived from the RAW (unrounded) fps.
{
  const r = sparklineSampleStats([59.6], 0)
  eq(r.fps, 60, 'pin: 59.6fps rounds to 60 for display')
  near(r.frameMs, 16.8, 'pin: but frameMs uses raw 59.6 → ~16.8ms', 0.1)
}
// junk sample → fps + frameMs null, isDrop false (unknown, not a drop),
// but a valid index + age so the pin marker still anchors.
{
  const r = sparklineSampleStats([60, NaN, 30], 1)
  eq(r.fps, null, 'pin: junk sample → null fps')
  eq(r.frameMs, null, 'pin: junk sample → null frameMs')
  eq(r.isDrop, false, 'pin: junk sample is not a drop')
  eq(r.secondsAgo, 1, 'pin: junk sample still reports an age')
}
// custom sampleMs (e.g. 250ms HUD cadence) scales the age.
{
  const r = sparklineSampleStats([60, 50, 40, 30], 0, { sampleMs: 250 })
  eq(r.secondsAgo, 1, 'pin: 3 steps * 250ms = 0.75s → rounds to 1s')
}
// index resolution: floors a fractional index, rejects out-of-range.
{
  eq(sparklineSampleStats([60, 50, 40], 1.9).index, 1, 'pin: fractional index floors')
  eq(sparklineSampleStats([60, 50, 40], 3), null, 'pin: index past the end → null')
  eq(sparklineSampleStats([60, 50, 40], -1), null, 'pin: negative index → null')
}
// defensive: empty / non-array / non-finite index → null.
eq(sparklineSampleStats([], 0), null, 'pin: empty series → null')
eq(sparklineSampleStats(null, 0), null, 'pin: non-array → null')
eq(sparklineSampleStats([60, 30], NaN), null, 'pin: NaN index → null')
eq(sparklineSampleStats([60, 30], Infinity), null, 'pin: Infinity index → null')
// purity: input not mutated.
{
  const src = [60, 24, 55]
  const snap = JSON.stringify(src)
  sparklineSampleStats(src, 1)
  eq(JSON.stringify(src), snap, 'pin: does not mutate input')
}

console.log(`PASS: fpsGraph R40.D — ${passed} total assertions (incl. pinned per-sample stats)`)
