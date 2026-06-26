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
// naturally.
export const FRAMING_GRIDS = [
  { id: 'off',    label: 'Off',     hint: 'No composition grid' },
  { id: 'thirds', label: 'Thirds',  hint: 'Rule-of-thirds grid + power points' },
  { id: 'cross',  label: 'Cross',   hint: 'Centre cross for symmetric framing' },
  { id: 'both',   label: 'Both',    hint: 'Thirds grid + centre cross' },
]

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
//   { verticals: [x...], horizontals: [y...], points: [{x,y}...] }
// where coordinates are ABSOLUTE viewport pixels (so the overlay can
// position lines without re-deriving the frame origin), `points` are
// the rule-of-thirds intersections (empty unless thirds are drawn).
//
// Defensive: unknown/off mode, or a degenerate (<=0) frame, returns
// empty arrays so the overlay renders nothing rather than NaN lines.
export function computeCompositionGrid(frameRect, gridId) {
  const empty = { verticals: [], horizontals: [], points: [] }
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

  const wantThirds = mode === 'thirds' || mode === 'both'
  const wantCross = mode === 'cross' || mode === 'both'

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

  if (wantCross) {
    const cx = x + w / 2
    const cy = y + h / 2
    verticals.push(cx)
    horizontals.push(cy)
  }

  return { verticals, horizontals, points }
}
