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

// --- R38.A: ETA-to-budget-edge -------------------------------------
//
// The trend pill (R37.A) tells the user they're "loading" (headroom
// falling) but not HOW URGENT it is. This extrapolates the current
// headroom slope to a concrete warning: "at this rate you'll cross the
// 16.7ms budget in ~Ns". It only speaks while genuinely falling AND
// still above the edge — a recovering or already-over scene has no ETA
// to give. The slope is a least-squares fit over the live window so one
// noisy frame doesn't whipsaw the estimate.
//
// Returns:
//   { approaching, etaSec, slopePerSec, currentHeadroom }
// where `approaching` is true only when currentHeadroom > 0 AND the fit
// slope is falling past `minSlope` (so the readout shows ONLY when the
// warning is real); `etaSec` is the seconds-until-edge (clamped to
// [0, ETA_MAX_SEC]) or null when not approaching; `slopePerSec` is the
// headroom-fraction lost per second (signed; negative = falling).
//
// opts:
//   budgetMs   the budget edge in ms (default 16.7 / 60fps)
//   sampleMs   real wall-time between samples (default 250 — the HUD's
//              4Hz cadence) so the per-sample slope converts to /sec
//   minSlope   how steeply headroom must fall (fraction/sec) before we
//              call it "approaching" — a dead-band against sampling
//              noise (default 0.01, ~0.17ms/s of frame time at 60fps)
export const ETA_MAX_SEC = 999

export function headroomEtaToEdge(fpsSamples, opts = {}) {
  const none = { approaching: false, etaSec: null, slopePerSec: 0, currentHeadroom: 0 }
  if (!Array.isArray(fpsSamples) || fpsSamples.length < 2) return none
  const budgetMs = Number.isFinite(opts.budgetMs) && opts.budgetMs > 0 ? opts.budgetMs : FRAME_BUDGET_60
  const sampleMs = Number.isFinite(opts.sampleMs) && opts.sampleMs > 0 ? opts.sampleMs : 250
  const minSlope = Number.isFinite(opts.minSlope) && opts.minSlope >= 0 ? opts.minSlope : 0.01
  // Build the valid headroom series (oldest first), filtering junk so a
  // corrupt frame doesn't tilt the regression.
  const h = []
  for (const s of fpsSamples) {
    const v = Number(s)
    if (Number.isFinite(v) && v > 0) h.push(frameBudgetHeadroom(v, budgetMs).headroom)
  }
  if (h.length < 2) return none
  const currentHeadroom = h[h.length - 1]
  // Least-squares slope of headroom vs sample index (0..n-1).
  const slopePerSample = linregSlope(h)
  const slopePerSec = slopePerSample * (1000 / sampleMs)
  const result = { approaching: false, etaSec: null, slopePerSec: round2(slopePerSec), currentHeadroom: round2(currentHeadroom) }
  // Only an ETA when we're still ABOVE the edge and FALLING past the
  // dead-band. A flat / rising / already-over scene returns no ETA.
  if (currentHeadroom > 0 && slopePerSec < -minSlope) {
    const etaRaw = currentHeadroom / -slopePerSec // seconds until headroom hits 0
    const eta = etaRaw > ETA_MAX_SEC ? ETA_MAX_SEC : etaRaw
    result.approaching = true
    result.etaSec = Math.round(eta * 10) / 10
  }
  return result
}

// Least-squares slope of `ys` against x = 0,1,2,... Returns 0 for a
// degenerate (<2 point) series or a zero-variance x (can't happen with
// the 0..n-1 indexing for n>=2, but guarded anyway). Pure.
function linregSlope(ys) {
  const n = ys.length
  if (n < 2) return 0
  let sx = 0, sy = 0, sxy = 0, sxx = 0
  for (let i = 0; i < n; i++) {
    sx += i; sy += ys[i]; sxy += i * ys[i]; sxx += i * i
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return 0
  return (n * sxy - sx * sy) / denom
}

function round2(v) {
  return Math.round(v * 100) / 100
}

// --- R38.D: band-coloured sparkline segments -------------------------
//
// The plain sparkline (buildSparklinePoints) is a single-colour polyline.
// For the perf-pill health popover we want the line itself to show WHERE
// in the window the trouble was — a green run that dips into a red run
// tells the story at a glance. This splits the points into consecutive
// runs that share an fps band colour (green >=55 / amber >=30 / red),
// each emitted as its own SVG `points` string so the caller draws one
// <polyline> per colour.
//
// Adjacent runs SHARE their boundary point so the coloured segments
// visually connect with no gap. We colour each LINE SEGMENT (the span
// between two consecutive points) by its destination sample's band, then
// group consecutive same-coloured segments into one polyline run — so a
// run from segment a..b covers points [a-1 .. b]. Returns:
//   [{ color, attr, points: [{x,y}...] }, ...]
// Empty / single-sample / non-array inputs return [] (no line to draw —
// the caller can fall back to a dot).
export function buildBandedSparklineSegments(samples, opts = {}) {
  const pts = buildSparklinePoints(samples, opts)
  if (pts.length < 2) return []
  const segments = []
  let current = null
  // Segment i connects pts[i-1] → pts[i]; colour it by the DESTINATION
  // sample's band so a line dipping INTO red paints red.
  for (let i = 1; i < pts.length; i++) {
    const color = fpsBandColor(samples[i])
    if (current && color === current.color) {
      current.points.push(pts[i]) // extend the run
    } else {
      // New colour: open a run starting at the shared boundary (pts[i-1])
      // so it visually connects to the previous run, then add pts[i].
      current = { color, points: [pts[i - 1], pts[i]] }
      segments.push(current)
    }
  }
  return segments.map(s => ({
    color: s.color,
    points: s.points,
    attr: s.points.map(p => `${round1(p.x)},${round1(p.y)}`).join(' '),
  }))
}

// --- R39.A: ETA-to-edge history strip ---------------------------------
//
// R38.A surfaces the INSTANT "seconds until you cross the budget edge".
// But a single number can't tell a tuner whether the deadline is rushing
// AT them (each tick the ETA shrinks — the scene is degrading faster and
// faster) or STABILISING (the ETA holds / grows — they've found a level
// the frame can sustain). This records a short rolling history of the
// ETA readout and plots it so the DIRECTION of the deadline is legible.
//
// The y-axis is seconds-to-edge: a high ETA (plenty of runway) sits at
// the TOP, ETA=0 (you've hit the edge) at the FLOOR — so a line sloping
// DOWN toward the floor means the edge is rushing at you, matching the
// "dips = trouble" silhouette every other strip in the HUD uses. When
// the scene isn't approaching the edge at all (rising headroom, or
// already over) there's no finite ETA — those ticks pin to the ceiling
// (safe / no urgency) so the line climbs back to the top as a scene
// recovers, rather than leaving a confusing gap.

// Seconds-to-edge ceiling for the plot — ETAs longer than this read as
// "plenty of runway" and pin to the top. 30s is comfortably past the
// point where a tuner would care about the countdown.
export const ETA_HISTORY_CEIL = 30
// How many ETA samples to keep. The HUD samples at ~250ms, so 24 samples
// is a ~6s rolling history — long enough to read a trend, short enough to
// react to a change the user just made.
export const ETA_HISTORY_MAX = 24

// Append one ETA reading to the rolling history, returning a FRESH array
// capped at `maxLen` (oldest dropped). A finite, non-negative number is
// kept as-is; anything else (null when not approaching, NaN, Infinity,
// negative) is recorded as null — a "no urgency" tick the plot pins to
// the safe ceiling. Never mutates the input array.
export function pushEtaHistory(history, etaSec, maxLen = ETA_HISTORY_MAX) {
  const cap = Number.isFinite(maxLen) && maxLen > 0 ? Math.floor(maxLen) : ETA_HISTORY_MAX
  const prev = Array.isArray(history) ? history : []
  // null / undefined explicitly mean "not approaching" — coercing them
  // through Number() would turn null into 0 (a real "at the edge" sample),
  // so guard before the numeric check.
  const v = (etaSec === null || etaSec === undefined) ? NaN : Number(etaSec)
  const sample = Number.isFinite(v) && v >= 0 ? v : null
  const next = prev.concat(sample)
  if (next.length > cap) next.splice(0, next.length - cap)
  return next
}

// Clamp an ETA value for plotting: null / undefined / non-finite /
// negative → ceil (safe, plots at the top); otherwise clamp into
// [0, ceil]. null/undefined are guarded before Number() so a "not
// approaching" tick doesn't coerce to 0 and plot at the floor.
function clampEtaForPlot(eta, ceil) {
  if (eta === null || eta === undefined) return ceil
  const v = Number(eta)
  if (!Number.isFinite(v) || v < 0) return ceil
  return v > ceil ? ceil : v
}

// Map an ETA history array to {x, y} points in a width x height box.
// Newest sample at the right edge. High ETA (safe) → small y (top); ETA
// 0 (at the edge) → y=height (floor). Returns [] for empty / non-array.
export function buildEtaHistoryPoints(history, opts = {}) {
  if (!Array.isArray(history) || history.length === 0) return []
  const ceil = Number.isFinite(opts.ceil) && opts.ceil > 0 ? opts.ceil : ETA_HISTORY_CEIL
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 100
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : 24
  const n = history.length
  const stepDenom = n > 1 ? n - 1 : 1
  const out = []
  for (let i = 0; i < n; i++) {
    const eta = clampEtaForPlot(history[i], ceil)
    const x = n > 1 ? (i / stepDenom) * width : width
    const y = height - (eta / ceil) * height
    out.push({ x, y })
  }
  return out
}

// The ETA-history points as an SVG `points="x,y x,y"` string. '' when empty.
export function etaHistoryAttr(history, opts = {}) {
  const pts = buildEtaHistoryPoints(history, opts)
  if (pts.length === 0) return ''
  return pts.map(p => `${round1(p.x)},${round1(p.y)}`).join(' ')
}

// Summarise the ETA history into a trend the HUD can label. Looks ONLY
// at the finite (genuinely-approaching) samples so a long stretch of
// "not approaching" nulls doesn't fake a trend. Returns:
//   { hasData, dir, latest, count, urgent }
// where `dir` is:
//   'falling'  — ETA shrinking → the edge is rushing AT you (bad)
//   'rising'   — ETA growing → you're stabilising / pulling away (good)
//   'flat'     — holding steady within the dead-band
// `latest` is the most recent finite ETA (or null); `urgent` is true
// when that latest ETA is at/under `urgentAt` seconds. A dead-band
// (default 0.5s) keeps sampling noise from flickering the direction.
export function summarizeEtaHistory(history, opts = {}) {
  const none = { hasData: false, dir: 'flat', latest: null, count: 0, urgent: false }
  if (!Array.isArray(history) || history.length === 0) return none
  const deadband = Number.isFinite(opts.deadband) && opts.deadband >= 0 ? opts.deadband : 0.5
  const urgentAt = Number.isFinite(opts.urgentAt) && opts.urgentAt > 0 ? opts.urgentAt : 3
  const finite = []
  for (const h of history) {
    // null / undefined are "not approaching" markers, not a 0s ETA —
    // guard before Number() (which turns null into 0) so they don't
    // count as real at-the-edge samples.
    if (h === null || h === undefined) continue
    const v = Number(h)
    if (Number.isFinite(v) && v >= 0) finite.push(v)
  }
  if (finite.length === 0) return none
  const latest = finite[finite.length - 1]
  let dir = 'flat'
  if (finite.length >= 2) {
    const mid = Math.floor(finite.length / 2)
    const older = finite.slice(0, mid)
    const newer = finite.slice(finite.length - mid)
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
    const delta = avg(newer) - avg(older) // positive = ETA growing = stabilising
    dir = delta > deadband ? 'rising' : delta < -deadband ? 'falling' : 'flat'
  }
  return {
    hasData: true,
    dir,
    latest: Math.round(latest * 10) / 10,
    count: finite.length,
    urgent: latest <= urgentAt,
  }
}

// --- R40.A: hover-scrub readout for the ETA-history strip --------------
//
// R39.D scrubs the fps sparkline; this is the parallel for the R39.A
// ETA-to-edge history strip. The strip plots seconds-to-edge (with
// "not approaching" ticks recorded as null and pinned to the safe
// ceiling), so a tuner watching the deadline line dive toward the floor
// wants to read the EXACT seconds-to-edge + how-long-ago for a specific
// dip under the cursor — not just eyeball the slope.
//
// `cursorX` is the pointer x in the strip's pixel space (0..width). The
// history is the same newest-LAST array buildEtaHistoryPoints draws. We
// reverse that even spacing to snap the cursor to the nearest sample,
// then report:
//   { index, etaSec, x, secondsAgo, approaching }
// where `index` is into the history array, `etaSec` is that sample's
// seconds-to-edge (rounded to 0.1s; null when the tick was a "not
// approaching" marker — the tooltip shows "safe"), `approaching` is
// whether that tick was a genuine finite ETA, `x` is the snapped pixel
// of the sample (so a guide line lands exactly on the point), and
// `secondsAgo` is how long before now the sample was taken (its
// distance from the newest sample x `sampleMs`, default 250 — the HUD's
// 4Hz cadence).
//
// Returns null when there's nothing to scrub (empty / non-array history,
// or a non-finite cursorX) so the caller hides the tooltip + guide.
export function scrubEtaHistory(history, cursorX, opts = {}) {
  if (!Array.isArray(history) || history.length === 0) return null
  if (!Number.isFinite(cursorX)) return null
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 100
  const sampleMs = Number.isFinite(opts.sampleMs) && opts.sampleMs > 0 ? opts.sampleMs : 250
  const n = history.length
  // Reverse buildEtaHistoryPoints' even spacing: sample i sits at
  // x = (i / (n-1)) * width (single sample pins to the right edge).
  const stepDenom = n > 1 ? n - 1 : 1
  // Clamp the cursor into the drawable range so an over/undershoot snaps
  // to the first / last sample rather than returning null.
  const cx = cursorX < 0 ? 0 : cursorX > width ? width : cursorX
  const rawIdx = n > 1 ? Math.round((cx / width) * stepDenom) : 0
  const index = rawIdx < 0 ? 0 : rawIdx > n - 1 ? n - 1 : rawIdx
  const x = n > 1 ? (index / stepDenom) * width : width
  // The sample value: a "not approaching" tick is null / undefined —
  // guard before Number() (null → 0 would read as a real 0s ETA) so it
  // resolves to a non-approaching marker the tooltip shows as "safe".
  const rawSample = history[index]
  let etaSec = null
  let approaching = false
  if (rawSample !== null && rawSample !== undefined) {
    const v = Number(rawSample)
    if (Number.isFinite(v) && v >= 0) {
      etaSec = Math.round(v * 10) / 10
      approaching = true
    }
  }
  // Newest sample (last) is "now" (0s ago); each step left is +sampleMs.
  const secondsAgo = Math.round(((n - 1 - index) * sampleMs) / 1000)
  return { index, etaSec, x: round1(x), secondsAgo, approaching }
}

// --- R39.D: hover-scrub readout for a sparkline -----------------------
//
// The perf-pill popover sparkline (R38.D) shows the SHAPE of the last
// ~12s but a user can't read an exact value off it. This resolves a
// horizontal cursor position over the sparkline to the nearest sample so
// the popover can show a tooltip: "48 fps · 4s ago" for the point under
// the cursor, with the x-pixel to anchor a vertical guide line + dot.
//
// `cursorX` is the pointer x in the SVG's pixel space (0..width). The
// samples are the same newest-LAST array the sparkline draws. We map the
// cursor to the nearest sample by reversing buildSparklinePoints' even
// spacing, then report:
//   { index, fps, x, secondsAgo }
// where `index` is into the samples array, `fps` is that sample's value
// (rounded; junk → null so the tooltip can show "—"), `x` is the snapped
// pixel of that sample (so the guide line lands exactly on the point),
// and `secondsAgo` is how long before now that sample was taken —
// derived from its distance from the newest (right-most) sample times
// `sampleMs` (default 1000, the perf pill's 1Hz cadence).
//
// Returns null when there's nothing to scrub (empty / non-array samples,
// or a non-finite cursorX) so the caller hides the tooltip.
export function scrubSparkline(samples, cursorX, opts = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return null
  if (!Number.isFinite(cursorX)) return null
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : 100
  const sampleMs = Number.isFinite(opts.sampleMs) && opts.sampleMs > 0 ? opts.sampleMs : 1000
  const n = samples.length
  // Reverse the even spacing buildSparklinePoints uses: sample i sits at
  // x = (i / (n-1)) * width (single sample pins to the right edge).
  const stepDenom = n > 1 ? n - 1 : 1
  // Clamp the cursor into the drawable range so an over/undershoot snaps
  // to the first / last sample rather than returning null.
  const cx = cursorX < 0 ? 0 : cursorX > width ? width : cursorX
  const rawIdx = n > 1 ? Math.round((cx / width) * stepDenom) : 0
  const index = rawIdx < 0 ? 0 : rawIdx > n - 1 ? n - 1 : rawIdx
  const x = n > 1 ? (index / stepDenom) * width : width
  const raw = Number(samples[index])
  const fps = Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null
  // Newest sample (last) is "now" (0s ago); each step left is +sampleMs.
  const secondsAgo = Math.round(((n - 1 - index) * sampleMs) / 1000)
  return { index, fps, x: round1(x), secondsAgo }
}

// --- R40.D: full per-sample stats for a pinned sparkline point --------
//
// R39.D's scrubSparkline reads the fps + age under a moving cursor. But a
// transient stutter flashes past in one frame of hovering — a user wants
// to PIN it and inspect the full picture. This resolves a sample index
// into the complete stat bundle the perf-pill popover can render in a
// fixed panel: the fps, the equivalent frame time in ms, whether that
// sample counts as a drop (< the 30fps floor), and how long ago it was.
//
// Unlike scrubSparkline (which maps a cursor x → index), this takes an
// already-resolved `index` (typically the `index` field scrubSparkline
// returned at click time) so a pin is stable even as fresh samples push
// the series — the caller pins the VALUE, not the position. Returns:
//   { index, fps, frameMs, isDrop, secondsAgo }
// where `fps` is the rounded reading (null for a junk sample, with
// frameMs null + isDrop false so the panel shows "—"), `frameMs` is the
// 0.1ms-rounded frame time, `isDrop` flags a sample under `dropFloor`
// (default 30fps), and `secondsAgo` is the sample's age at `sampleMs`
// cadence (default 1000 — the perf pill's 1Hz loop).
//
// Returns null when the index is out of range / non-finite or the series
// is empty so the caller can drop a stale pin.
export function sparklineSampleStats(samples, index, opts = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return null
  if (!Number.isFinite(index)) return null
  const idx = Math.floor(index)
  if (idx < 0 || idx > samples.length - 1) return null
  const sampleMs = Number.isFinite(opts.sampleMs) && opts.sampleMs > 0 ? opts.sampleMs : 1000
  const dropFloor = Number.isFinite(opts.dropFloor) && opts.dropFloor > 0 ? opts.dropFloor : FPS_OK
  const n = samples.length
  const raw = Number(samples[idx])
  const valid = Number.isFinite(raw) && raw >= 0
  const fps = valid ? Math.round(raw) : null
  // Frame time from the RAW (unrounded) fps so a 59.6fps sample reads
  // ~16.8ms, not the 17.0ms a pre-rounded 59 would give. Junk → null.
  const frameMs = valid ? round1(fpsToFrameMs(raw)) : null
  // A drop is a real sub-floor reading; a junk sample is "unknown", not a
  // drop, so it never inflates the drop story.
  const isDrop = valid && raw < dropFloor
  const secondsAgo = Math.round(((n - 1 - idx) * sampleMs) / 1000)
  return { index: idx, fps, frameMs, isDrop, secondsAgo }
}

// --- R41.D: one-line summary of a pinned perf sample -------------------
//
// R40.D pins a sparkline sample and shows its stats in a panel. This
// formats that same { fps, frameMs, isDrop, secondsAgo } bundle into a
// single, paste-ready line so a user filing a perf bug can copy the
// exact moment to the clipboard ("48 fps · 20.8 ms · drop · 4s ago")
// instead of retyping numbers off the panel.
//
// Pure: takes the stats object sparklineSampleStats returns and renders
// a string. Defensive — a null/undefined stats (pin aged out) → ''; a
// junk-fps sample (fps null) renders the fps + frame-ms as "—" but
// still reports the age, so a copied line never lies about a sample it
// couldn't read. The "drop" tag is only appended for a genuine
// sub-floor sample, never for an unknown one. Age reads "now" at 0s.
// `sep` is configurable (default " · ") for callers that want a
// different delimiter.
export function formatPinnedSampleLine(stats, opts = {}) {
  if (!stats || typeof stats !== 'object') return ''
  const sep = typeof opts.sep === 'string' ? opts.sep : ' \u00b7 '
  const fpsPart = (stats.fps === null || stats.fps === undefined) ? '\u2014 fps' : `${stats.fps} fps`
  const msPart = (stats.frameMs === null || stats.frameMs === undefined) ? '\u2014 ms' : `${stats.frameMs} ms`
  const parts = [fpsPart, msPart]
  // Only flag a real drop — an unknown (junk) sample is not a drop.
  if (stats.isDrop === true) parts.push('drop')
  const ageNum = Number(stats.secondsAgo)
  const age = Number.isFinite(ageNum)
    ? (ageNum <= 0 ? 'now' : `${Math.round(ageNum)}s ago`)
    : '\u2014'
  parts.push(age)
  return parts.join(sep)
}

// --- R41.A: full per-sample stats for a PINNED ETA-history point -------
//
// R40.A scrubs the ETA-to-edge history strip under a moving cursor; this
// is the parallel of R40.D's sparklineSampleStats but for the ETA strip:
// resolve an already-pinned INDEX into the full readout the HUD keeps on
// screen while the user tweaks. R40.A only lived for the duration of a
// hover — a tuner who spots a specific dip wants to PIN it and read its
// exact seconds-to-edge + age while they change the scene, instead of
// holding the pointer perfectly still.
//
// Like sparklineSampleStats, this takes an INDEX (typically the `index`
// scrubEtaHistory returned at click time), not a value, so a pin is
// stable as fresh ticks push the series — the caller pins the MOMENT and
// shifts the index as samples scroll off the front (and drops the pin
// once the moment ages out of the window). Returns:
//   { index, etaSec, approaching, secondsAgo }
// where `etaSec` is the 0.1s-rounded seconds-to-edge (null when the tick
// was a "not approaching" marker — the readout shows "safe"),
// `approaching` flags a genuine finite ETA, and `secondsAgo` is the
// sample's age at `sampleMs` cadence (default 250 — the HUD's 4Hz loop).
//
// Returns null when the index is out of range / non-finite or the
// history is empty so the caller can drop a stale pin.
export function etaHistorySampleStats(history, index, opts = {}) {
  if (!Array.isArray(history) || history.length === 0) return null
  if (!Number.isFinite(index)) return null
  const idx = Math.floor(index)
  if (idx < 0 || idx > history.length - 1) return null
  const sampleMs = Number.isFinite(opts.sampleMs) && opts.sampleMs > 0 ? opts.sampleMs : 250
  const n = history.length
  // A "not approaching" tick is null / undefined — guard before Number()
  // (null → 0 would read as a real 0s "at the edge" ETA) so it resolves
  // to a non-approaching marker the readout shows as "safe".
  const raw = history[idx]
  let etaSec = null
  let approaching = false
  if (raw !== null && raw !== undefined) {
    const v = Number(raw)
    if (Number.isFinite(v) && v >= 0) {
      etaSec = Math.round(v * 10) / 10
      approaching = true
    }
  }
  const secondsAgo = Math.round(((n - 1 - idx) * sampleMs) / 1000)
  return { index: idx, etaSec, approaching, secondsAgo }
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

// --- R45.D: copy the whole perf window as one paste-ready line --------
//
// The perf pill / HUD shows the 2s fps window's min/avg/max/1%-low + drop
// count, but a user filing a perf bug had to retype them. This formats
// the summarizeFpsWindow() bundle into a single clipboard line, e.g.
//   "avg 58 · 1% low 41 · min 30 · max 60 · 7 drops · 120 samples"
// so the whole window is one copy. Empty / zero-sample → '' so the caller
// can hide the copy button. `sep` is configurable. Pure.
export function formatFpsWindowStats(summary, opts = {}) {
  if (!summary || typeof summary !== 'object') return ''
  const sep = typeof opts.sep === 'string' ? opts.sep : ' \u00b7 '
  const count = Number(summary.count)
  if (!Number.isFinite(count) || count <= 0) return ''
  const n = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0)
  const parts = [
    `avg ${n(summary.avg)}`,
    `1% low ${n(summary.low)}`,
    `min ${n(summary.min)}`,
    `max ${n(summary.max)}`,
    `${n(summary.drops)} drops`,
    `${n(count)} samples`,
  ]
  return parts.join(sep)
}

// --- R45.A: copy the pinned ETA-to-edge sample as a paste-ready line ---
//
// R41.A pins an ETA-history sample's seconds-to-edge + age on screen; this
// formats that bundle for the clipboard, e.g. "ETA 3.4s to budget edge ·
// 6s ago" (or "safe · 6s ago" for a non-approaching pin). null / missing
// → '' so the caller hides the copy button. `sep` configurable. Pure.
export function formatPinnedEtaLine(stats, opts = {}) {
  if (!stats || typeof stats !== 'object') return ''
  const sep = typeof opts.sep === 'string' ? opts.sep : ' \u00b7 '
  const eta = (stats.approaching === true && Number.isFinite(Number(stats.etaSec)))
    ? `ETA ${Math.round(Number(stats.etaSec) * 10) / 10}s to budget edge`
    : 'safe'
  const ageNum = Number(stats.secondsAgo)
  const age = Number.isFinite(ageNum)
    ? (ageNum <= 0 ? 'now' : `${Math.round(ageNum)}s ago`)
    : '\u2014'
  return [eta, age].join(sep)
}
