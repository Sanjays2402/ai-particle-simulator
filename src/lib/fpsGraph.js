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
