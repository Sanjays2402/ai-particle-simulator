// FPS sparkline helpers for the Debug HUD.
//
// The HUD already keeps a ~2-second rolling window of FPS samples but
// only ever rendered them as min / avg / max numbers. These pure
// helpers turn that same sample array into an SVG sparkline + a small
// "1% low" style summary so a user can SEE a stutter spike instead of
// having to catch it in the flickering max/min readout.
//
// Everything here is framework-free + DOM-free so it unit-tests
// cleanly and the HUD component stays a thin renderer.

// The y-axis ceiling. We anchor the graph at a fixed 70fps ceiling
// (slightly above the 60 vsync cap) so a momentary >60 reading from a
// high-refresh display doesn't rescale the whole graph, and the 60fps
// line always sits at a stable height. Floor is 0.
export const FPS_GRAPH_CEIL = 70

// FPS colour bands — mirrors the existing DebugHUD / StatusStrip
// thresholds (>=55 good, >=30 ok, else bad) so the sparkline stroke
// agrees with the numeric FPS colour the user already knows.
export const FPS_GOOD = 55
export const FPS_OK = 30

export function fpsBandColor(fps) {
  const v = Number(fps)
  if (!Number.isFinite(v)) return '#6a6a80'
  if (v >= FPS_GOOD) return '#86efac'
  if (v >= FPS_OK) return '#fbbf24'
  return '#f87171'
}

// Clamp a single fps reading into the drawable [0, ceil] range. Junk
// (NaN / Infinity / negative) collapses to 0 so a corrupt sample
// draws at the floor rather than blowing the polyline off-canvas.
function clampFps(fps, ceil) {
  const v = Number(fps)
  if (!Number.isFinite(v) || v <= 0) return 0
  return v > ceil ? ceil : v
}

// Map an array of fps samples to {x, y} points inside a width x height
// box (top-left origin, y grows downward like SVG). The newest sample
// sits at the right edge. Returns [] for an empty / non-array input so
// the caller can skip rendering the polyline entirely.
//
// opts:
//   ceil   y-axis max fps (default FPS_GRAPH_CEIL)
//   width  px box width  (default 100)
//   height px box height (default 28)
export function buildSparklinePoints(samples, opts = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return []
  const ceil = Number.isFinite(opts.ceil) && opts.ceil > 0 ? opts.ceil : FPS_GRAPH_CEIL
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 100
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 28
  const n = samples.length
  // With a single sample, pin it to the right edge (a flat dot) so a
  // freshly-opened HUD still shows something rather than dividing by 0.
  const stepDenom = n > 1 ? n - 1 : 1
  const out = []
  for (let i = 0; i < n; i++) {
    const fps = clampFps(samples[i], ceil)
    const x = n > 1 ? (i / stepDenom) * width : width
    const y = height - (fps / ceil) * height
    out.push({ x, y })
  }
  return out
}

// Convenience: the same points as an SVG `points="x,y x,y"` string,
// rounded to 0.1px so the DOM attribute stays compact. Empty string
// when there's nothing to draw.
export function sparklinePointsAttr(samples, opts = {}) {
  const pts = buildSparklinePoints(samples, opts)
  if (pts.length === 0) return ''
  return pts.map(p => `${round1(p.x)},${round1(p.y)}`).join(' ')
}

function round1(v) {
  return Math.round(v * 10) / 10
}

// The y pixel of a horizontal reference line at a given fps (e.g. the
// 60fps line). Returns null when the line falls outside the box.
export function refLineY(fps, opts = {}) {
  const ceil = Number.isFinite(opts.ceil) && opts.ceil > 0 ? opts.ceil : FPS_GRAPH_CEIL
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 28
  const v = Number(fps)
  if (!Number.isFinite(v) || v < 0 || v > ceil) return null
  return height - (v / ceil) * height
}

// "1% low" style summary the gaming HUDs show: the worst sustained
// dip, not just the single worst frame. We report the average of the
// lowest `pctLow` fraction of samples (default 10%) so one outlier
// frame doesn't dominate, plus a plain `drops` count of samples that
// fell below the FPS_OK floor. Pure; tolerant of junk samples.
export function summarizeFpsWindow(samples, opts = {}) {
  const empty = { min: 0, max: 0, avg: 0, last: 0, low: 0, drops: 0, count: 0 }
  if (!Array.isArray(samples) || samples.length === 0) return empty
  const pctLow = Number.isFinite(opts.pctLow) && opts.pctLow > 0 && opts.pctLow <= 1
    ? opts.pctLow
    : 0.1
  const okFloor = Number.isFinite(opts.okFloor) ? opts.okFloor : FPS_OK
  const valid = []
  for (const s of samples) {
    const v = Number(s)
    if (Number.isFinite(v) && v >= 0) valid.push(v)
  }
  if (valid.length === 0) return empty
  let min = Infinity, max = -Infinity, sum = 0, drops = 0
  for (const v of valid) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
    if (v < okFloor) drops++
  }
  const avg = sum / valid.length
  // Worst `pctLow` fraction (at least 1 sample) → averaged.
  const sorted = valid.slice().sort((a, b) => a - b)
  const lowN = Math.max(1, Math.round(sorted.length * pctLow))
  let lowSum = 0
  for (let i = 0; i < lowN; i++) lowSum += sorted[i]
  const low = lowSum / lowN
  return {
    min: Math.round(min),
    max: Math.round(max),
    avg: Math.round(avg),
    last: Math.round(valid[valid.length - 1]),
    low: Math.round(low),
    drops,
    count: valid.length,
  }
}

// --- R35.A: frame-time (ms) view -------------------------------------
//
// The same 2s window can be shown as frame TIME in milliseconds instead
// of fps — the unit game devs actually profile in — so a user can read
// the 16.7ms (60fps) / 33.3ms (30fps) budget lines directly. We keep
// "good at the top": a LOW frame time (fast) sits near the top of the
// box, a slow frame sinks toward the floor, so the graph's silhouette
// reads the same direction as the fps view (dips = trouble).

// ms y-axis ceiling. 50ms == 20fps; a frame slower than that pins to
// the floor rather than blowing the polyline off-canvas.
export const FRAME_MS_GRAPH_CEIL = 50
// The two budget reference lines, in milliseconds.
export const FRAME_BUDGET_60 = 1000 / 60 // 16.666...ms
export const FRAME_BUDGET_30 = 1000 / 30 // 33.333...ms

// Convert an fps reading to a frame time in ms. Junk / <= 0 fps maps to
// the ceiling (a "stalled" frame) so a corrupt sample reads as bad,
// never as 0ms — which would falsely look like a perfect frame.
export function fpsToFrameMs(fps, ceil = FRAME_MS_GRAPH_CEIL) {
  const v = Number(fps)
  const cap = Number.isFinite(ceil) && ceil > 0 ? ceil : FRAME_MS_GRAPH_CEIL
  if (!Number.isFinite(v) || v <= 0) return cap
  const ms = 1000 / v
  return ms > cap ? cap : ms
}

// Map fps samples to {x, y} points for the ms view. Lower ms (faster)
// → smaller y (top); slower → larger y (floor). Newest sample sits at
// the right edge. Returns [] for empty / non-array input.
export function buildFrameTimeSparklinePoints(fpsSamples, opts = {}) {
  if (!Array.isArray(fpsSamples) || fpsSamples.length === 0) return []
  const ceil = Number.isFinite(opts.ceil) && opts.ceil > 0 ? opts.ceil : FRAME_MS_GRAPH_CEIL
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 100
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 28
  const n = fpsSamples.length
  const stepDenom = n > 1 ? n - 1 : 1
  const out = []
  for (let i = 0; i < n; i++) {
    const ms = fpsToFrameMs(fpsSamples[i], ceil)
    const x = n > 1 ? (i / stepDenom) * width : width
    const y = (ms / ceil) * height // low ms → small y (top)
    out.push({ x, y })
  }
  return out
}

// The ms-view points as an SVG `points="x,y x,y"` string. '' when empty.
export function frameTimeSparklineAttr(fpsSamples, opts = {}) {
  const pts = buildFrameTimeSparklinePoints(fpsSamples, opts)
  if (pts.length === 0) return ''
  return pts.map(p => `${round1(p.x)},${round1(p.y)}`).join(' ')
}

// The y pixel of a horizontal budget line at a given ms (e.g. 16.7ms).
// Returns null when the line falls outside the [0, ceil] box.
export function frameMsRefLineY(ms, opts = {}) {
  const ceil = Number.isFinite(opts.ceil) && opts.ceil > 0 ? opts.ceil : FRAME_MS_GRAPH_CEIL
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 28
  const v = Number(ms)
  if (!Number.isFinite(v) || v < 0 || v > ceil) return null
  return (v / ceil) * height
}

// Colour a frame time by how it sits against the budget lines — the ms
// analogue of fpsBandColor. <= 16.7ms (60fps) is green, <= 33.3ms
// (30fps) amber, slower is red. Junk → neutral grey.
export function frameMsBandColor(ms) {
  const v = Number(ms)
  if (!Number.isFinite(v)) return '#6a6a80'
  if (v <= FRAME_BUDGET_60 + 0.0001) return '#86efac'
  if (v <= FRAME_BUDGET_30 + 0.0001) return '#fbbf24'
  return '#f87171'
}

// --- R36.A: frame-budget headroom -----------------------------------
//
// The ms view (R35.A) shows how long a frame TOOK; this shows how much
// of the 60fps budget (16.7ms) is LEFT. A frame that renders in 8ms has
// ~52% headroom — lots of room before it'll drop below 60fps; a frame at
// 16.7ms has 0% (right at the edge); a frame slower than the budget has
// NEGATIVE headroom (it's already over). Surfacing the leftover budget —
// not just the current cost — tells the user how much heavier a scene
// they can push before the frame rate suffers.
//
// `used` is the fraction of the budget consumed (clamped to [0, 1] for a
// progress bar — an over-budget frame pins the bar full), `headroom` is
// the signed leftover fraction (can go negative so a caller can colour
// "over budget" distinctly), `overBudget` is a convenience boolean.
// Pure + defensive: junk fps maps to a stalled, zero-headroom frame so a
// corrupt sample never reads as "tons of headroom".
export function frameBudgetHeadroom(fps, budgetMs = FRAME_BUDGET_60) {
  const budget = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : FRAME_BUDGET_60
  const ms = fpsToFrameMs(fps)
  const ratio = ms / budget
  const headroom = 1 - ratio
  const used = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio
  return {
    ms: round1(ms),
    budgetMs: round1(budget),
    used,                       // [0,1] for a progress bar
    headroom,                   // signed; negative = over budget
    headroomPct: Math.round(headroom * 100),
    overBudget: ms > budget + 0.0001,
  }
}

// Colour the headroom bar by how much budget is left — green when
// there's comfortable room (>= 25%), amber when it's getting tight
// (>= 0%), red once the frame is over budget. Junk → neutral grey.
export function headroomBandColor(headroom) {
  const v = Number(headroom)
  if (!Number.isFinite(v)) return '#6a6a80'
  if (v >= 0.25) return '#86efac'
  if (v >= 0) return '#fbbf24'
  return '#f87171'
}

// --- R37.A: budget-headroom history strip ----------------------------
//
// The live headroom bar (R36.A) shows the INSTANT leftover budget. This
// turns the same 2s window into a tiny rolling strip so a user can see
// whether they're trending TOWARD or AWAY from the 16.7ms edge, not just
// the current value — the perf equivalent of watching a stock ticker
// instead of a single price.
//
// The y-axis is the signed headroom fraction: +1 (100% free) at the top,
// 0 (right at the budget edge) on a marked centreline, down to a floor of
// -1 (the frame is taking 2x its budget) at the bottom. Plotting it
// SIGNED around a fixed zero line means the budget edge sits at a stable
// height and the eye reads "above the line = healthy / below = over"
// instantly, the same way the bar's colour already works.

// The clamp range for the signed-headroom plot. A frame with >100% free
// budget (sub-8ms) pins to the top; one taking >=2x its budget pins to
// the floor. Symmetric so the zero line lands dead centre.
export const HEADROOM_HISTORY_TOP = 1
export const HEADROOM_HISTORY_BOTTOM = -1

// Clamp a signed headroom value into [BOTTOM, TOP].
function clampHeadroom(h) {
  const v = Number(h)
  if (!Number.isFinite(v)) return HEADROOM_HISTORY_BOTTOM
  if (v > HEADROOM_HISTORY_TOP) return HEADROOM_HISTORY_TOP
  if (v < HEADROOM_HISTORY_BOTTOM) return HEADROOM_HISTORY_BOTTOM
  return v
}

// Map signed headroom h (in [BOTTOM, TOP]) to a y pixel in a box of
// `height`. TOP → y=0 (top), BOTTOM → y=height (floor), 0 → the centre.
function headroomToY(h, height) {
  const span = HEADROOM_HISTORY_TOP - HEADROOM_HISTORY_BOTTOM // 2
  const frac = (clampHeadroom(h) - HEADROOM_HISTORY_BOTTOM) / span // 0..1, BOTTOM→0
  return height - frac * height // BOTTOM→height (floor), TOP→0 (top)
}

// Map fps samples to {x, y} points for the headroom history strip. Each
// fps sample is run through frameBudgetHeadroom() so the strip reads the
// exact same headroom the live bar shows. Newest sample sits at the right
// edge. Returns [] for empty / non-array input.
export function buildHeadroomHistoryPoints(fpsSamples, opts = {}) {
  if (!Array.isArray(fpsSamples) || fpsSamples.length === 0) return []
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 100
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 28
  const budgetMs = Number.isFinite(opts.budgetMs) && opts.budgetMs > 0 ? opts.budgetMs : FRAME_BUDGET_60
  const n = fpsSamples.length
  const stepDenom = n > 1 ? n - 1 : 1
  const out = []
  for (let i = 0; i < n; i++) {
    const h = frameBudgetHeadroom(fpsSamples[i], budgetMs).headroom
    const x = n > 1 ? (i / stepDenom) * width : width
    out.push({ x, y: headroomToY(h, height) })
  }
  return out
}

// The headroom-history points as an SVG `points="x,y x,y"` string. '' when empty.
export function headroomHistoryAttr(fpsSamples, opts = {}) {
  const pts = buildHeadroomHistoryPoints(fpsSamples, opts)
  if (pts.length === 0) return ''
  return pts.map(p => `${round1(p.x)},${round1(p.y)}`).join(' ')
}

// The y pixel of the zero line (the budget edge) for the history strip —
// where headroom crosses from positive (free) to negative (over). Always
// the vertical centre of the box for the symmetric [BOTTOM, TOP] range.
export function headroomZeroLineY(opts = {}) {
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 28
  return headroomToY(0, height)
}

// Trend of the headroom window: is the user heading TOWARD the budget
// edge (falling headroom = scene getting heavier) or AWAY from it
// (rising = recovering)? We compare the average headroom of the OLDER
// half of the window to the NEWER half. Returns:
//   { dir: 'rising' | 'falling' | 'flat', delta }
// where `delta` is newerAvg - olderAvg (positive = gaining headroom).
// A small dead-band (default 0.04 headroom fraction, ~0.7ms at 60fps)
// keeps a steady scene reading 'flat' instead of jittering rising/
// falling on sampling noise. Junk-tolerant; < 2 valid samples → flat/0.
export function headroomTrend(fpsSamples, opts = {}) {
  const flat = { dir: 'flat', delta: 0 }
  if (!Array.isArray(fpsSamples) || fpsSamples.length < 2) return flat
  const budgetMs = Number.isFinite(opts.budgetMs) && opts.budgetMs > 0 ? opts.budgetMs : FRAME_BUDGET_60
  const deadband = Number.isFinite(opts.deadband) && opts.deadband >= 0 ? opts.deadband : 0.04
  const valid = []
  for (const s of fpsSamples) {
    const v = Number(s)
    if (Number.isFinite(v) && v > 0) valid.push(frameBudgetHeadroom(v, budgetMs).headroom)
  }
  if (valid.length < 2) return flat
  const mid = Math.floor(valid.length / 2)
  // Older half is the front of the array (oldest samples first); newer
  // half is the back. With an odd count the middle sample is shared into
  // neither half so the two windows stay balanced.
  const older = valid.slice(0, mid)
  const newer = valid.slice(valid.length - mid)
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const delta = avg(newer) - avg(older)
  const dir = delta > deadband ? 'rising' : delta < -deadband ? 'falling' : 'flat'
  return { dir, delta: round1(delta * 100) / 100 }
}

// Frame-time window summary — mirrors summarizeFpsWindow but in ms.
// `high` is the averaged WORST `pctHigh` fraction (the 1%-HIGH frame
// time, the ms analogue of the 1% low); `over` counts frames slower
// than the 30fps budget (33.3ms) — the same bad-frame set the fps view
// calls "drops". All ms figures are rounded to 0.1ms. Junk-tolerant.
export function summarizeFrameTimeWindow(fpsSamples, opts = {}) {
  const empty = { min: 0, max: 0, avg: 0, last: 0, high: 0, over: 0, count: 0 }
  if (!Array.isArray(fpsSamples) || fpsSamples.length === 0) return empty
  const pctHigh = Number.isFinite(opts.pctHigh) && opts.pctHigh > 0 && opts.pctHigh <= 1
    ? opts.pctHigh
    : 0.1
  const overMs = Number.isFinite(opts.overMs) ? opts.overMs : FRAME_BUDGET_30
  const ceil = Number.isFinite(opts.ceil) && opts.ceil > 0 ? opts.ceil : FRAME_MS_GRAPH_CEIL
  const valid = []
  for (const s of fpsSamples) {
    const v = Number(s)
    if (Number.isFinite(v) && v > 0) valid.push(fpsToFrameMs(v, ceil))
  }
  if (valid.length === 0) return empty
  let min = Infinity, max = -Infinity, sum = 0, over = 0
  for (const ms of valid) {
    if (ms < min) min = ms
    if (ms > max) max = ms
    sum += ms
    if (ms > overMs) over++
  }
  const avg = sum / valid.length
  // Worst (highest) `pctHigh` fraction → averaged. Sort descending so
  // the slowest frames lead.
  const sorted = valid.slice().sort((a, b) => b - a)
  const highN = Math.max(1, Math.round(sorted.length * pctHigh))
  let highSum = 0
  for (let i = 0; i < highN; i++) highSum += sorted[i]
  const high = highSum / highN
  return {
    min: round1(min),
    max: round1(max),
    avg: round1(avg),
    last: round1(valid[valid.length - 1]),
    high: round1(high),
    over,
    count: valid.length,
  }
}
