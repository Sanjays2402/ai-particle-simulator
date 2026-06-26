// Cinematic framing guides.
//
// A composition aid for screenshots / recordings: overlay letterbox
// (or pillarbox) bars that mask the viewport down to a chosen aspect
// ratio so the user can frame a shot the way it'll actually be cropped
// for Instagram (4:5 / 1:1), a cinematic still (2.39:1), or 16:9.
//
// These bars are a *visual guide only* — they don't change what the
// canvas renders or what a screenshot captures (the PNG is still the
// full canvas). They give the user a deliberate frame to compose into.
//
// All the geometry is pure + DOM-free so it unit-tests cleanly and the
// React overlay stays a thin renderer.

// The selectable ratios. `ratio` is width / height; null = "Off" (no
// bars). Ordered widest → tallest so the chip row reads naturally.
export const FRAMING_RATIOS = [
  { id: 'off',    label: 'Off',    ratio: null },
  { id: 'cine',   label: '2.39',   ratio: 2.39,       hint: 'Anamorphic / cinemascope' },
  { id: 'wide',   label: '16:9',   ratio: 16 / 9,     hint: 'Widescreen video' },
  { id: 'three2', label: '3:2',    ratio: 3 / 2,      hint: 'Classic 35mm photo' },
  { id: 'square', label: '1:1',    ratio: 1,          hint: 'Square / Instagram' },
  { id: 'portrait', label: '4:5',  ratio: 4 / 5,      hint: 'Instagram portrait' },
  { id: 'story',  label: '9:16',   ratio: 9 / 16,     hint: 'Story / Reel' },
]

const RATIO_BY_ID = new Map(FRAMING_RATIOS.map(r => [r.id, r]))

export function isValidFramingId(id) {
  return RATIO_BY_ID.has(id)
}

// Normalize a stored / incoming id to a known one; junk → 'off'.
export function sanitizeFramingId(id) {
  return RATIO_BY_ID.has(id) ? id : 'off'
}

export function ratioForId(id) {
  const r = RATIO_BY_ID.get(id)
  return r ? r.ratio : null
}

export function labelForId(id) {
  const r = RATIO_BY_ID.get(id)
  return r ? r.label : 'Off'
}

// Cycle to the next ratio (wraps). Used by a keyboard shortcut so the
// user can tab through frames without opening a menu. Unknown id →
// first entry's id.
export function nextFramingId(id) {
  const idx = FRAMING_RATIOS.findIndex(r => r.id === id)
  if (idx < 0) return FRAMING_RATIOS[0].id
  return FRAMING_RATIOS[(idx + 1) % FRAMING_RATIOS.length].id
}

// Given the viewport size + a target ratio, compute the bar geometry.
// Returns an object describing the masked frame:
//   { mode, bar, frameW, frameH, frameX, frameY }
// where `mode` is 'none' | 'letterbox' | 'pillarbox', and `bar` is the
// thickness (px) of EACH of the two bars.
//
// - letterbox: viewport is taller than the target ratio → horizontal
//   bars top + bottom, `bar` = (h - frameH) / 2.
// - pillarbox: viewport is wider than the target → vertical bars left +
//   right, `bar` = (w - frameW) / 2.
// - none: ratio is null/invalid, or the viewport already matches the
//   target (within a 0.5px tolerance) → no bars.
//
// Defensive: non-finite / non-positive viewport dims → a 'none' result
// so a 0-size container (e.g. during SSR / first paint) never produces
// NaN bar widths.
export function computeFramingBars(viewportW, viewportH, ratio) {
  const w = Number(viewportW)
  const h = Number(viewportH)
  const none = { mode: 'none', bar: 0, frameW: w, frameH: h, frameX: 0, frameY: 0 }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return { mode: 'none', bar: 0, frameW: 0, frameH: 0, frameX: 0, frameY: 0 }
  }
  const r = Number(ratio)
  if (!Number.isFinite(r) || r <= 0) return none

  const viewportRatio = w / h
  // Within half a pixel of the target → treat as a perfect fit.
  if (Math.abs(viewportRatio - r) < 0.0005) return none

  if (viewportRatio > r) {
    // Too wide → pillarbox (vertical bars left + right).
    const frameW = h * r
    const bar = (w - frameW) / 2
    return { mode: 'pillarbox', bar, frameW, frameH: h, frameX: bar, frameY: 0 }
  }
  // Too tall → letterbox (horizontal bars top + bottom).
  const frameH = w / r
  const bar = (h - frameH) / 2
  return { mode: 'letterbox', bar, frameW: w, frameH, frameX: 0, frameY: bar }
}

// A compact human label for the active frame, e.g. "2.39 · 1280x536".
// Used in the small badge that sits with the bars so the user knows
// exactly what they're composing into. Returns '' when off.
export function describeFraming(id, viewportW, viewportH) {
  const ratio = ratioForId(id)
  if (ratio == null) return ''
  const bars = computeFramingBars(viewportW, viewportH, ratio)
  if (bars.mode === 'none') return labelForId(id)
  return `${labelForId(id)} · ${Math.round(bars.frameW)}x${Math.round(bars.frameH)}`
}

// --- R35.B: composition grid overlay ---------------------------------
//
// Inside the active frame, optionally draw classic composition guides so
// a user can line a subject up to a stronger point than dead centre:
//   - thirds: the rule-of-thirds grid (2 vertical + 2 horizontal lines
//     at 1/3 and 2/3), with the four intersections as the "power points"
//   - cross:  a centre cross (1 vertical + 1 horizontal through the
//     middle) for symmetric / centred compositions
//   - both:   thirds + the centre cross together
// All purely visual, like the bars. The geometry is pure + DOM-free.

// Selectable grid modes. Ordered off → light → heavier so a cycle reads
// naturally. R36.B adds the golden-ratio (phi) grid and the diagonal
// method for stronger classical composition beyond rule-of-thirds.
export const FRAMING_GRIDS = [
  { id: 'off',      label: 'Off',     hint: 'No composition grid' },
  { id: 'thirds',   label: 'Thirds',  hint: 'Rule-of-thirds grid + power points' },
  { id: 'cross',    label: 'Cross',   hint: 'Centre cross for symmetric framing' },
  { id: 'both',     label: 'Both',    hint: 'Thirds grid + centre cross' },
  { id: 'phi',      label: 'Phi',     hint: 'Golden-ratio grid (0.382 / 0.618) + power points' },
  { id: 'diagonal', label: 'Diag',    hint: 'Diagonal method — 45° corner lines + crossings' },
]

// Golden ratio split points. The frame is divided so the smaller part
// is to the whole as the larger part is to the smaller (1/phi). Lines
// land at 1 - 1/phi (~0.382) and 1/phi (~0.618) of each axis — the
// photographic golden-ratio grid, a subtler cousin of rule-of-thirds.
export const INV_PHI = 0.6180339887498949
const PHI_LO = 1 - INV_PHI // ~0.38196601125

const GRID_BY_ID = new Map(FRAMING_GRIDS.map(g => [g.id, g]))

export function isValidGridId(id) {
  return GRID_BY_ID.has(id)
}

// Normalize a stored / incoming grid id; junk → 'off'.
export function sanitizeGridId(id) {
  return GRID_BY_ID.has(id) ? id : 'off'
}

export function gridLabelForId(id) {
  const g = GRID_BY_ID.get(id)
  return g ? g.label : 'Off'
}

// Cycle to the next grid mode (wraps). Unknown id → first entry.
export function nextGridId(id) {
  const idx = FRAMING_GRIDS.findIndex(g => g.id === id)
  if (idx < 0) return FRAMING_GRIDS[0].id
  return FRAMING_GRIDS[(idx + 1) % FRAMING_GRIDS.length].id
}

// Compute the grid line + intersection geometry for a given frame rect
// and grid mode. The frame rect is the masked-in region (from
// computeFramingBars): { frameX, frameY, frameW, frameH }. Returns:
//   { verticals: [x...], horizontals: [y...], points: [{x,y}...],
//     diagonals: [{x1,y1,x2,y2}...] }
// where coordinates are ABSOLUTE viewport pixels (so the overlay can
// position lines without re-deriving the frame origin), `points` are
// the power-point intersections (rule-of-thirds OR golden-ratio,
// empty unless one of those grids is drawn), and `diagonals` are the
// diagonal-method lines (empty unless the diagonal grid is drawn).
//
// R36.B grid modes:
//   - phi: the golden-ratio grid — verticals/horizontals at ~0.382 and
//     ~0.618 of each axis (vs thirds' 1/3, 2/3), with the four crossings
//     as power points. A subtler, classical alternative to thirds.
//   - diagonal: the diagonal method — a 45° line in from each of the
//     four corners (top-left↘, top-right↙, bottom-left↗, bottom-right↖)
//     for placing subjects along the natural diagonals of the frame.
//
// Defensive: unknown/off mode, or a degenerate (<=0) frame, returns
// empty arrays so the overlay renders nothing rather than NaN lines.
export function computeCompositionGrid(frameRect, gridId) {
  const empty = { verticals: [], horizontals: [], points: [], diagonals: [] }
  const mode = sanitizeGridId(gridId)
  if (mode === 'off') return empty
  if (!frameRect || typeof frameRect !== 'object') return empty
  const x = Number(frameRect.frameX)
  const y = Number(frameRect.frameY)
  const w = Number(frameRect.frameW)
  const h = Number(frameRect.frameH)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return empty

  const verticals = []
  const horizontals = []
  let points = []
  const diagonals = []

  const wantThirds = mode === 'thirds' || mode === 'both'
  const wantCross = mode === 'cross' || mode === 'both'
  const wantPhi = mode === 'phi'
  const wantDiagonal = mode === 'diagonal'

  if (wantThirds) {
    const vx1 = x + w / 3
    const vx2 = x + (2 * w) / 3
    const hy1 = y + h / 3
    const hy2 = y + (2 * h) / 3
    verticals.push(vx1, vx2)
    horizontals.push(hy1, hy2)
    points = [
      { x: vx1, y: hy1 }, { x: vx2, y: hy1 },
      { x: vx1, y: hy2 }, { x: vx2, y: hy2 },
    ]
  }

  if (wantPhi) {
    const vx1 = x + w * PHI_LO
    const vx2 = x + w * INV_PHI
    const hy1 = y + h * PHI_LO
    const hy2 = y + h * INV_PHI
    verticals.push(vx1, vx2)
    horizontals.push(hy1, hy2)
    points = [
      { x: vx1, y: hy1 }, { x: vx2, y: hy1 },
      { x: vx1, y: hy2 }, { x: vx2, y: hy2 },
    ]
  }

  if (wantCross) {
    const cx = x + w / 2
    const cy = y + h / 2
    verticals.push(cx)
    horizontals.push(cy)
  }

  if (wantDiagonal) {
    // The diagonal method: a 45° line dropped in from each corner. On a
    // non-square frame the line runs at 45° until it hits the nearer
    // opposite edge, so the run length is the SHORTER of (w, h). The
    // four lines cross at the classic diagonal "sweet spots".
    const d = Math.min(w, h)
    const x0 = x, y0 = y, x1 = x + w, y1 = y + h
    diagonals.push(
      { x1: x0, y1: y0, x2: x0 + d, y2: y0 + d }, // top-left ↘
      { x1: x1, y1: y0, x2: x1 - d, y2: y0 + d }, // top-right ↙
      { x1: x0, y1: y1, x2: x0 + d, y2: y1 - d }, // bottom-left ↗
      { x1: x1, y1: y1, x2: x1 - d, y2: y1 - d }, // bottom-right ↖
    )
  }

  return { verticals, horizontals, points, diagonals }
}
