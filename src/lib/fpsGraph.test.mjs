// fpsGraph: sparkline point mapping + window summary for the Debug HUD.
import {
  FPS_GRAPH_CEIL, FPS_GOOD, FPS_OK,
  fpsBandColor, buildSparklinePoints, sparklinePointsAttr,
  refLineY, summarizeFpsWindow,
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

console.log(`PASS: fpsGraph — ${passed} assertions (sparkline geometry, band colour, 1%-low window summary)`)
