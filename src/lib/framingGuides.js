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

// R42.M — the pseudo-id for a user-entered custom aspect ratio. Selecting
// it tells the overlay to read the ratio from the store's
// `framingCustomRatio` value (set via parseAspectRatio) instead of the
// FRAMING_RATIOS table. Kept out of FRAMING_RATIOS so the preset chips +
// the [ ] cycle keep working on the fixed set; the custom chip is its own
// thing in the sidebar.
export const CUSTOM_FRAMING_ID = 'custom'

// Sane bounds for a custom ratio so a fat-fingered "100:1" can't paint a
// 1px slit (or an off-screen frame). 0.2 ~ a tall 1:5 column; 5 ~ a wide
// 5:1 panorama — wider than cinemascope's 2.39 but still a usable frame.
export const CUSTOM_RATIO_MIN = 0.2
export const CUSTOM_RATIO_MAX = 5

export function isValidFramingId(id) {
  return RATIO_BY_ID.has(id)
}

// Normalize a stored / incoming id to a known one; junk → 'off'. The
// pseudo-id 'custom' (R42.M) isn't in FRAMING_RATIOS — its ratio lives
// in a separate store value — but it's a VALID selection, so it passes
// through here (and round-trips on reload) rather than resetting to off.
export function sanitizeFramingId(id) {
  if (RATIO_BY_ID.has(id)) return id
  if (id === CUSTOM_FRAMING_ID) return CUSTOM_FRAMING_ID
  return 'off'
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

// --- R42.M: custom aspect-ratio input -------------------------------
//
// The fixed FRAMING_RATIOS chips cover the common crops, but a user
// shooting for a specific target (a 21:9 ultrawide wallpaper, a 5:7
// print, a bespoke 2.76:1 Ultra Panavision still) had no way to get an
// exact frame. This parses a freeform aspect-ratio string into a numeric
// width/height ratio the overlay can mask to.
//
// Accepted forms (whitespace-tolerant):
//   "21:9"  "16x9"  "16/9"   → ratio = 21/9 etc. (separator : x / all ok)
//   "2.39"  "1.85"           → a bare decimal IS the ratio directly
//   "4 : 5"                  → spaces around the separator fine
// Junk / zero / negative / non-finite → null (caller keeps the prior
// frame / shows an error hint). The parsed ratio is CLAMPED to
// [CUSTOM_RATIO_MIN, CUSTOM_RATIO_MAX] so an absurd entry still yields a
// usable on-screen frame rather than a sliver or an off-canvas crop.
export function parseAspectRatio(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const s = String(raw).trim()
  if (!s) return null
  // A:B / AxB / A/B form — split on the first separator.
  const m = s.match(/^(-?\d*\.?\d+)\s*[:x/]\s*(-?\d*\.?\d+)$/i)
  if (m) {
    const w = Number(m[1])
    const h = Number(m[2])
    if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null
    const r = w / h
    if (!Number.isFinite(r) || r <= 0) return null
    return clampCustomRatio(r)
  }
  // Bare decimal — the ratio itself (e.g. "2.39").
  const bare = Number(s)
  if (Number.isFinite(bare) && bare > 0) return clampCustomRatio(bare)
  return null
}

// Clamp a numeric ratio into the usable on-screen band. Non-finite /
// non-positive → null (nothing to clamp). Pure.
export function clampCustomRatio(ratio) {
  const r = Number(ratio)
  if (!Number.isFinite(r) || r <= 0) return null
  if (r < CUSTOM_RATIO_MIN) return CUSTOM_RATIO_MIN
  if (r > CUSTOM_RATIO_MAX) return CUSTOM_RATIO_MAX
  return r
}

// A short label for a custom ratio, e.g. 1.778 → "1.78". null / invalid
// → '' so the chip can fall back to its placeholder. Pure.
export function formatCustomRatioLabel(ratio) {
  const r = Number(ratio)
  if (!Number.isFinite(r) || r <= 0) return ''
  return String(Math.round(r * 100) / 100)
}

// R48.E — is the stored custom ratio sitting EXACTLY on a clamp bound?
// The store clamps every entry into [MIN, MAX] (parseAspectRatio →
// clampCustomRatio), so a value resting precisely on a bound is the
// fingerprint of an out-of-range input that got pulled back. The zen
// card uses this to flag "(clamped)" so a recording is honest that the
// displayed aspect isn't the raw number that was typed. Non-finite /
// non-positive → false (no frame to flag). Pure.
export function isCustomRatioClamped(ratio) {
  const r = Number(ratio)
  if (!Number.isFinite(r) || r <= 0) return false
  return r <= CUSTOM_RATIO_MIN || r >= CUSTOM_RATIO_MAX
}

// R49.E — parse an aspect entry to its UNCLAMPED ratio so the store can
// remember what was actually typed. Same grammar as parseAspectRatio but
// skips clampCustomRatio, so "12:1" survives as 12 (not pulled to 5). Junk
// → null. Pure. Lets the zen card show "typed 12 -> shown 5" rather than a
// bare "(clamped)".
export function parseRawAspectRatio(raw) {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const s = String(raw).trim()
  if (!s) return null
  const m = s.match(/^(-?\d*\.?\d+)\s*[:x/]\s*(-?\d*\.?\d+)$/i)
  if (m) {
    const w = Number(m[1]), h = Number(m[2])
    if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null
    const r = w / h
    return Number.isFinite(r) && r > 0 ? r : null
  }
  const bare = Number(s)
  return Number.isFinite(bare) && bare > 0 ? bare : null
}

// R49.E — build the clamp-tooltip text: "typed <raw> -> shown <clamped>".
// Only meaningful when the raw entry actually got pulled into the band; a
// raw that already sits inside [MIN, MAX] → '' (no clamp happened, nothing to
// explain). Non-finite raw → ''. Uses formatCustomRatioLabel so both numbers
// read like every other ratio in the UI. Pure.
export function formatClampedHint(rawRatio) {
  const r = Number(rawRatio)
  if (!Number.isFinite(r) || r <= 0) return ''
  const clamped = clampCustomRatio(r)
  if (clamped == null || clamped === r) return ''
  return `typed ${formatCustomRatioLabel(r)} \u2192 shown ${formatCustomRatioLabel(clamped)}`
}

// R50.E — same clamp tooltip plus the usable BAND so a user learns WHY a
// 12 became 5, not just that it did: "typed 12 -> shown 5 (band 0.2-5)".
// The band is the [CUSTOM_RATIO_MIN, CUSTOM_RATIO_MAX] limits formatted
// like every other ratio in the UI. Falls back to '' on the same
// no-clamp / junk inputs as formatClampedHint so the suffix only explains
// when there's genuinely something to explain. Pure.
export function formatClampedBandHint(rawRatio) {
  const base = formatClampedHint(rawRatio)
  if (!base) return ''
  return `${base} (band ${formatCustomRatioLabel(CUSTOM_RATIO_MIN)}-${formatCustomRatioLabel(CUSTOM_RATIO_MAX)})`
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
  { id: 'spiral',   label: 'Spiral',  hint: 'Golden (Fibonacci) spiral — click again to rotate' },
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
  const empty = { verticals: [], horizontals: [], points: [], diagonals: [], spiral: [] }
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
  let spiral = []

  const wantThirds = mode === 'thirds' || mode === 'both'
  const wantCross = mode === 'cross' || mode === 'both'
  const wantPhi = mode === 'phi'
  const wantDiagonal = mode === 'diagonal'
  const wantSpiral = mode === 'spiral'

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

  if (wantSpiral) {
    spiral = buildGoldenSpiral(x, y, w, h, frameRect.spiralOrientation)
  }

  return { verticals, horizontals, points, diagonals, spiral }
}

// --- R37.B: golden (Fibonacci) spiral --------------------------------
//
// The golden spiral is the classical S-curve composition guide: a frame
// is repeatedly divided into a square + a smaller golden rectangle, and
// a quarter-circle arc swept through each square traces the spiral. A
// subject placed at the spiral's tight "eye" (the convergence point)
// gets the strongest possible focal emphasis.
//
// There are four orientations — the eye can sit in any of the four
// corners — so a user composing a left- vs right-facing subject can flip
// the spiral to match. `spiralOrientation` (0..3) selects the corner;
// out-of-range values wrap so a cycling caller never goes out of bounds.

// The 4 spiral orientations, by which corner the spiral's eye converges
// toward. Ordered so cycling reads naturally (TL → TR → BR → BL).
export const SPIRAL_ORIENTATIONS = ['tl', 'tr', 'br', 'bl']

// Normalise a stored orientation (id string OR numeric index) to a
// valid index 0..3. Junk → 0.
export function sanitizeSpiralOrientation(o) {
  if (typeof o === 'string') {
    const idx = SPIRAL_ORIENTATIONS.indexOf(o)
    return idx >= 0 ? idx : 0
  }
  const n = Number(o)
  if (!Number.isFinite(n)) return 0
  // Wrap into range so a monotonic cycle counter stays valid.
  const m = Math.floor(n) % SPIRAL_ORIENTATIONS.length
  return m < 0 ? m + SPIRAL_ORIENTATIONS.length : m
}

// R46.E — friendly corner names for the spiral's eye, keyed by orientation
// index (0..3 = tl/tr/br/bl). Surfaced on the zen Now-Playing card so a
// recording documents WHICH corner the golden spiral converges toward, not
// just that a spiral grid is active.
const SPIRAL_CORNER_LABELS = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left']

// Resolve a spiral orientation (id string OR numeric index, junk-tolerant
// via sanitizeSpiralOrientation) to its friendly corner label. Always
// returns a non-empty string from the fixed roster. Pure.
export function spiralCornerLabel(orientation) {
  return SPIRAL_CORNER_LABELS[sanitizeSpiralOrientation(orientation)]
}

// Build a golden spiral as a flat polyline of absolute-pixel points
// ([{x, y}, ...]) inside the frame rect. We approximate each
// quarter-turn arc with a short run of segments (smooth enough at screen
// scale) and walk inward through `depth` nested golden squares.
//
// The construction: start with the full frame as a golden rectangle.
// Split off the leading square, sweep a quarter arc through it centred on
// the inner corner of that square, then recurse into the remaining
// rectangle (rotated 90°). Each step shrinks by 1/phi so after ~8 turns
// the arc is sub-pixel — we stop at `depth` (default 8) turns.
//
// `orientation` (index or id) places the spiral's first square in one of
// the four corners so the eye converges where the user wants it.
//
// Defensive: degenerate (<=0) frame → []; non-finite inputs → [].
export function buildGoldenSpiral(frameX, frameY, frameW, frameH, orientation, depth = 8) {
  const x = Number(frameX), y = Number(frameY), w = Number(frameW), h = Number(frameH)
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return []
  const turns = Number.isFinite(depth) && depth > 0 ? Math.min(Math.floor(depth), 14) : 8
  const ori = sanitizeSpiralOrientation(orientation)

  // The canonical spiral is built for the 'tl' orientation (eye toward
  // the top-left), then mirrored into the requested corner by flipping
  // the normalised [0,1] coordinates. flipX/flipY per orientation:
  //   tl: no flip · tr: flip X · br: flip X+Y · bl: flip Y
  const flipX = ori === 1 || ori === 2
  const flipY = ori === 2 || ori === 3

  // Walk the nested-square construction in a normalised GOLDEN RECTANGLE
  // (width 1, height 1/phi ~ 0.618) so the spiral actually spirals — a
  // unit square would peel to nothing in a single turn. We then
  // re-normalise the rectangle's bounding box to [0,1]^2 and stretch to
  // the frame (matching how photo tools fit a golden spiral overlay to
  // any image aspect). Rectangle we're consuming, in golden-rect coords:
  const H = INV_PHI
  let rx = 0, ry = 0, rw = 1, rh = H
  // Which side the leading square peels from rotates each turn:
  // 0=left, 1=top, 2=right, 3=bottom. Canonical 'tl' spiral peels left
  // first so the eye converges toward the top-left.
  let side = 0
  const SEG = 12 // segments per quarter-arc
  const norm = []

  for (let t = 0; t < turns; t++) {
    const sq = Math.min(rw, rh)
    if (sq <= 1e-6) break
    // Square + arc geometry depends on which side we peel from. `cx, cy`
    // is the arc centre (the square's inner corner); the arc sweeps a
    // quarter turn of radius `sq`. Angles in radians, SVG-y-down space.
    let cx, cy, a0, a1
    if (side === 0) {            // peel left edge
      cx = rx + sq; cy = ry + sq
      a0 = Math.PI; a1 = Math.PI * 1.5
      rx += sq; rw -= sq
    } else if (side === 1) {     // peel top edge
      cx = rx + rw - sq; cy = ry + sq
      a0 = Math.PI * 1.5; a1 = Math.PI * 2
      ry += sq; rh -= sq
    } else if (side === 2) {     // peel right edge
      cx = rx + rw - sq; cy = ry + rh - sq
      a0 = 0; a1 = Math.PI * 0.5
      rw -= sq
    } else {                     // peel bottom edge
      cx = rx + sq; cy = ry + rh - sq
      a0 = Math.PI * 0.5; a1 = Math.PI
      rh -= sq
    }
    for (let s = 0; s <= SEG; s++) {
      const a = a0 + (a1 - a0) * (s / SEG)
      norm.push({ x: cx + Math.cos(a) * sq, y: cy + Math.sin(a) * sq })
    }
    side = (side + 1) % 4
  }

  // Map golden-rect points into pixel space: re-normalise the bounding
  // box (width 1, height H) to [0,1]^2, apply the orientation flip, then
  // scale to the actual frame so the spiral stretches with it the way
  // the diagonal method does.
  const out = []
  for (const p of norm) {
    const nx0 = p.x          // already in [0,1]
    const ny0 = p.y / H      // [0,H] → [0,1]
    const nx = flipX ? 1 - nx0 : nx0
    const ny = flipY ? 1 - ny0 : ny0
    out.push({ x: x + nx * w, y: y + ny * h })
  }
  return out
}

// --- R38.B: spiral sweep animation length -----------------------------
//
// To animate the spiral "drawing itself" once on enable / orientation
// change, the FramingGuides overlay uses the SVG stroke-dash trick:
// set strokeDasharray + strokeDashoffset to the polyline's total length,
// then transition the offset to 0 so the line reveals from start to eye.
// That needs the exact path length in pixels. This pure helper sums the
// segment lengths of a [{x,y}, ...] polyline so the component doesn't
// have to measure the DOM node (which would force a layout + a ref).
//
// Defensive: non-array / < 2 points → 0 (nothing to reveal); segments
// with non-finite coords are skipped so a single bad point can't poison
// the whole length into NaN.
export function polylineLength(points) {
  if (!Array.isArray(points) || points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!a || !b) continue
    const ax = Number(a.x), ay = Number(a.y), bx = Number(b.x), by = Number(b.y)
    if (![ax, ay, bx, by].every(Number.isFinite)) continue
    total += Math.hypot(bx - ax, by - ay)
  }
  return total
}

// --- R39.B: on-demand spiral sweep replay -----------------------------
//
// R38.B replays the spiral "draw-on" sweep only when the orientation
// changes (the polyline's React key embeds the orientation, so a corner
// change remounts the element and restarts the CSS animation). But a
// user who just wants to WATCH the sweep again — without flipping the eye
// to a different corner — had no way to retrigger it short of toggling
// the whole grid off and back on. This adds a "replay nonce": bumping it
// changes the polyline's key, forcing the same one-shot remount/replay
// for the CURRENT orientation. A small replay button on the active Spiral
// chip bumps the nonce.

// The nonce wraps inside a small range so a long session of replays can't
// grow it unbounded (it only ever needs to DIFFER from its previous value
// to force a remount). Any non-finite / negative input resets to 1 so a
// corrupt value can't stall the remount (0 → 0 would be a no-op).
export const SPIRAL_SWEEP_NONCE_WRAP = 1000

export function nextSweepNonce(n) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 0) return 1
  return (Math.floor(v) + 1) % SPIRAL_SWEEP_NONCE_WRAP
}

// Build the stable React key that drives the sweep remount. Combines the
// (sanitised) orientation with the replay nonce so BOTH a corner change
// and an explicit replay produce a fresh key → a fresh one-shot sweep.
// Orientation flows through sanitizeSpiralOrientation so a junk value
// can't produce an undefined-laden key; the nonce is floored + made
// non-negative so the key is always a clean `spiral-<ori>-<nonce>`.
export function spiralSweepKey(orientation, nonce) {
  const ori = sanitizeSpiralOrientation(orientation)
  const v = Number(nonce)
  const n = Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
  return `spiral-${ori}-${n}`
}

// --- R40.B: spiral sweep speed control --------------------------------
//
// R38.B's draw-on sweep + R39.B's replay button both run the reveal at
// one fixed pace (the CSS keyframe baked an 0.9s sweep / 0.4s eye-in).
// Some users want to SLOW the draw-on to study how the golden curve is
// constructed; others, once they know it, want it SNAPPY. This adds a
// three-way speed control (Fast / Normal / Slow) that scales the sweep +
// eye-in durations. 'normal' reproduces the exact pre-R40.B timings so an
// existing user sees zero change until they pick another speed.
//
// The component composes these into inline `animation` shorthand strings
// (the keyframes themselves are duration-agnostic — they just lerp
// stroke-dashoffset / opacity), so threading a duration is all that's
// needed; no CSS edit.

// The selectable sweep speeds. `sweepMs` is the stroke-dash reveal
// duration; `eyeDelayMs` is when the focal eye starts fading in (kept at
// ~0.69x of the sweep, matching the original 0.62s-after-0.9s ratio so
// the eye always lands just before the curve finishes); `eyeMs` is the
// eye fade duration. Ordered fast → slow so the chip row reads naturally.
export const SPIRAL_SWEEP_SPEEDS = [
  { id: 'fast',   label: 'Fast',   sweepMs: 450, eyeDelayMs: 310, eyeMs: 240 },
  { id: 'normal', label: 'Normal', sweepMs: 900, eyeDelayMs: 620, eyeMs: 400 },
  { id: 'slow',   label: 'Slow',   sweepMs: 1800, eyeDelayMs: 1240, eyeMs: 600 },
]

const SWEEP_SPEED_BY_ID = new Map(SPIRAL_SWEEP_SPEEDS.map(s => [s.id, s]))

// The default speed id — 'normal' reproduces the original baked timings.
export const SPIRAL_SWEEP_SPEED_DEFAULT = 'normal'

export function isValidSpiralSweepSpeed(id) {
  return SWEEP_SPEED_BY_ID.has(id)
}

// Normalise a stored / incoming speed id; junk → the default ('normal').
export function sanitizeSpiralSweepSpeed(id) {
  return SWEEP_SPEED_BY_ID.has(id) ? id : SPIRAL_SWEEP_SPEED_DEFAULT
}

// Cycle to the next speed (wraps). Unknown id → first entry's id.
export function nextSpiralSweepSpeed(id) {
  const idx = SPIRAL_SWEEP_SPEEDS.findIndex(s => s.id === id)
  if (idx < 0) return SPIRAL_SWEEP_SPEEDS[0].id
  return SPIRAL_SWEEP_SPEEDS[(idx + 1) % SPIRAL_SWEEP_SPEEDS.length].id
}

// Resolve a speed id to its concrete timings (in milliseconds), as the
// render-ready { sweepMs, eyeDelayMs, eyeMs } triple plus seconds-form
// strings (`sweepSec` / `eyeDelaySec` / `eyeSec`) the component drops
// straight into an `animation` shorthand. Junk id → the default speed's
// timings. Pure; returns a fresh object each call.
export function spiralSweepTimings(id) {
  const s = SWEEP_SPEED_BY_ID.get(sanitizeSpiralSweepSpeed(id))
  return {
    id: s.id,
    sweepMs: s.sweepMs,
    eyeDelayMs: s.eyeDelayMs,
    eyeMs: s.eyeMs,
    // Seconds form (trim trailing zeros) for clean CSS animation strings.
    sweepSec: msToSec(s.sweepMs),
    eyeDelaySec: msToSec(s.eyeDelayMs),
    eyeSec: msToSec(s.eyeMs),
  }
}

function msToSec(ms) {
  // 900 → "0.9", 1800 → "1.8", 450 → "0.45". Strip a trailing ".0".
  const sec = ms / 1000
  return String(Math.round(sec * 100) / 100)
}

// --- R41.B: spiral sweep easing control --------------------------------
//
// R40.B scales HOW LONG the draw-on sweep takes (Fast / Normal / Slow);
// this shapes HOW it accelerates across that time. The sweep is a single
// CSS `animation` whose timing function was a fixed cubic-bezier baked
// into the component string; this lifts that curve into a selectable,
// persisted choice so a user can make the curve sprint to the eye
// (ease-in), draw at a constant pace (linear), or glide to a stop
// (ease-out) — layered on top of, and orthogonal to, the speed control.
//
// We expose THREE named curves. 'ease-out' reproduces the EXACT
// pre-R41.B baked cubic-bezier(0.33,0.1,0.25,1) — a decelerating curve
// that settles into the focal eye — so it is the DEFAULT and an existing
// user sees zero change until they pick another easing. The component
// drops `cssFor(id)` straight into the `animation` shorthand in place of
// the old literal; the keyframes themselves are timing-function-agnostic
// (they only lerp stroke-dashoffset), so no CSS edit is needed.

// The selectable sweep easings. `css` is the CSS timing-function token
// spliced into the animation shorthand. Ordered ease-in → linear →
// ease-out (accelerating → constant → decelerating) so the chip row
// reads as a natural progression.
export const SPIRAL_SWEEP_EASINGS = [
  { id: 'ease-in',  label: 'In',  css: 'cubic-bezier(0.5,0,0.9,0.35)', hint: 'Slow start, sprint to the eye' },
  { id: 'linear',   label: 'Linear', css: 'linear',                    hint: 'Constant draw-on pace' },
  { id: 'ease-out', label: 'Out', css: 'cubic-bezier(0.33,0.1,0.25,1)', hint: 'Glide to a stop at the eye' },
]

const SWEEP_EASING_BY_ID = new Map(SPIRAL_SWEEP_EASINGS.map(e => [e.id, e]))

// The default easing id — 'ease-out' reproduces the original baked
// cubic-bezier(0.33,0.1,0.25,1) so existing users see no change.
export const SPIRAL_SWEEP_EASING_DEFAULT = 'ease-out'

export function isValidSpiralSweepEasing(id) {
  return SWEEP_EASING_BY_ID.has(id)
}

// Normalise a stored / incoming easing id; junk → the default.
export function sanitizeSpiralSweepEasing(id) {
  return SWEEP_EASING_BY_ID.has(id) ? id : SPIRAL_SWEEP_EASING_DEFAULT
}

// Cycle to the next easing (wraps). Unknown id → first entry's id.
export function nextSpiralSweepEasing(id) {
  const idx = SPIRAL_SWEEP_EASINGS.findIndex(e => e.id === id)
  if (idx < 0) return SPIRAL_SWEEP_EASINGS[0].id
  return SPIRAL_SWEEP_EASINGS[(idx + 1) % SPIRAL_SWEEP_EASINGS.length].id
}

// Resolve an easing id to its CSS timing-function token (the string the
// component splices into the `animation` shorthand). Junk id → the
// default easing's token, which is the exact pre-R41.B baked curve so a
// corrupt value can never change an existing user's sweep feel.
export function spiralSweepEasingCss(id) {
  const e = SWEEP_EASING_BY_ID.get(sanitizeSpiralSweepEasing(id))
  return e.css
}

// --- R45.B: spiral sweep easing PREVIEW curve glyph -------------------
//
// R41.B gives three easing labels (In / Linear / Out) but a label only
// NAMES the shape — a user can't SEE how aggressively each one ramps. This
// turns each easing's cubic-bezier into the actual SVG polyline of its
// position-over-time curve so a tiny glyph next to each chip traces the
// acceleration before you pick it (mirrors waveform's spline-preview UX).
//
// The control points come straight from each easing's `css` token so the
// glyph can NEVER disagree with what the sweep actually does: parse
// "cubic-bezier(x1,y1,x2,y2)" → sample the bezier → emit a points string
// in a box of (w x h). 'linear' is the diagonal. Y is flipped (SVG y grows
// down) so the curve reads left-bottom → right-top like a graph. Pure.

// Parse a cubic-bezier(...) token into [x1,y1,x2,y2]; 'linear' → diagonal
// control points; junk → null. Pure.
export function parseEasingControlPoints(css) {
  if (typeof css !== 'string') return null
  const t = css.trim().toLowerCase()
  if (t === 'linear') return [0, 0, 1, 1]
  const m = t.match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/)
  if (!m) return null
  const p = m.slice(1).map(Number)
  if (p.some(n => !Number.isFinite(n))) return null
  return p
}

// Sample a cubic bezier (anchors fixed at 0,0 → 1,1; two control points)
// at SAMPLES steps, mapped into a w x h box with y flipped. Returns an SVG
// `points` string ("x,y x,y ..."). Junk easing → the linear diagonal so a
// corrupt curve still draws a sane glyph. Pure.
export const EASING_PREVIEW_SAMPLES = 16
export function buildEasingPreviewPoints(css, w = 16, h = 10, samples = EASING_PREVIEW_SAMPLES) {
  const cp = parseEasingControlPoints(css) || [0, 0, 1, 1]
  const n = Math.max(2, Math.floor(samples))
  const W = Number.isFinite(w) && w > 0 ? w : 16
  const H = Number.isFinite(h) && h > 0 ? h : 10
  const [x1, y1, x2, y2] = cp
  const pts = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const mt = 1 - t
    // cubic bezier anchored at 0 and 1: 3·mt²·t·c1 + 3·mt·t²·c2 + t³
    const bx = 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t
    const by = 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t
    const px = Math.round(bx * W * 100) / 100
    const py = Math.round((1 - by) * H * 100) / 100 // flip: graph grows up
    pts.push(`${px},${py}`)
  }
  return pts.join(' ')
}

// R51.B — same sample geometry, but emitted as an SVG path `d` string so a
// dot can ride it via <animateMotion> (mpath needs a <path>, not a
// <polyline>). The dot animating along the curve makes the easing's
// acceleration FELT over time, not just shown as a static line: a slow
// start sprints, an ease-out coasts to a stop. Identical bezier sampling
// to buildEasingPreviewPoints so glyph + dot trace exactly the same shape.
// Junk easing → linear diagonal. Pure.
export function buildEasingPreviewPath(css, w = 16, h = 10, samples = EASING_PREVIEW_SAMPLES) {
  const pts = buildEasingPreviewPoints(css, w, h, samples).split(' ')
  if (pts.length < 2) return ''
  return 'M' + pts.join(' L')
}

// R52.B — the loop duration (seconds) the animated easing-preview dot
// rides at. The <animateMotion> uses this as its `dur`, and the pace
// label below documents it. Kept as a named export so the component and
// the label can't drift apart.
export const EASING_PREVIEW_LOOP_SEC = 1.6

// R52.B — a compact "pace" label for the animated easing-preview dot:
// the loop DURATION plus its frequency in Hz, e.g. "1.6s · 0.6Hz". The
// static glyph shows the curve's SHAPE; this documents how FAST the dot
// traverses it so a recording (or a screenshot) of the chip is self-
// explanatory rather than relying on the live motion. Hz = 1 / seconds,
// rounded to one decimal; seconds trimmed of a trailing ".0". Defensive:
// non-finite / non-positive duration → '' so the caller omits the label
// rather than printing "Infinity Hz". Pure.
export function easingPreviewPaceLabel(loopSec = EASING_PREVIEW_LOOP_SEC) {
  const s = Number(loopSec)
  if (!Number.isFinite(s) || s <= 0) return ''
  const hz = 1 / s
  // One-decimal, then drop a redundant trailing ".0" so "2.0s" reads "2s".
  const trim = (n) => {
    const r = Math.round(n * 10) / 10
    return Number.isInteger(r) ? String(r) : r.toFixed(1)
  }
  return `${trim(s)}s \u00b7 ${trim(hz)}Hz`
}

// --- R43.M: recent custom aspect ratios -------------------------------
//
// R42.M lets a user type any custom crop (21:9, 2.76, 5:7). A user who
// flips between a few favourites (say 21:9 and 2.39) had to re-type each
// one every time. This remembers the last few PARSED custom ratios as a
// small MRU (most-recently-used) list so they can be re-applied with a
// single click — like a browser's recent-searches row.
//
// The list holds CLAMPED numeric ratios (same usable band as the custom
// input), newest-first, deduped by their 2-decimal DISPLAY label (so a
// 1.777 and a 1.778 entry don't both linger), capped at RECENT_RATIOS_MAX
// (the oldest falls off the tail). All pure + DOM-free so it unit-tests
// cleanly and the store / LeftSidebar stay thin.

export const RECENT_RATIOS_MAX = 5

// Normalise a stored / incoming recents array into the canonical form:
// keep only valid clamped numbers, dedupe by display label (newest wins,
// i.e. first occurrence in input order is kept), cap to MAX. Non-array →
// []. Pure; always returns a fresh array of plain numbers so downstream
// comparisons (and React keys via formatCustomRatioLabel) are stable.
export function sanitizeRecentRatios(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const r = clampCustomRatio(raw)
    if (r == null) continue
    const key = formatCustomRatioLabel(r)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r)
    if (out.length >= RECENT_RATIOS_MAX) break
  }
  return out
}

// Push a freshly-applied ratio to the FRONT of the recents MRU. The ratio
// is clamped into the usable band first; an unparseable / out-of-band one
// leaves the (cleaned) list unchanged. A ratio already present (matched by
// its display label) is MOVED to the front rather than duplicated, so
// re-applying an old favourite floats it back to the top. The result is
// capped at RECENT_RATIOS_MAX. Pure; never mutates the input — always
// returns a fresh canonical array (the caller compares by value to decide
// whether a persist is warranted).
export function pushRecentRatio(list, ratio) {
  const base = sanitizeRecentRatios(list)
  const r = clampCustomRatio(ratio)
  if (r == null) return base
  const key = formatCustomRatioLabel(r)
  const next = [r, ...base.filter(x => formatCustomRatioLabel(x) !== key)]
  return next.slice(0, RECENT_RATIOS_MAX)
}

// Value-equality for two recents lists (both assumed canonical number
// arrays). Lets a caller skip a redundant persist/re-render when a push
// produced an identical list (e.g. re-applying the already-front ratio).
// Pure.
export function sameRecentRatios(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// --- R44.M: pinned (favourite) custom aspect ratios -------------------
//
// R43.M remembers the last few custom ratios as an MRU row, but a user
// with ONE go-to crop (say a 21:9 wallpaper) loses it the moment they dial
// in five other ratios — it falls off the MRU tail. Pinning is the fix: a
// star on a recent chip promotes the ratio to a separate PINNED list that
// (a) always renders at the HEAD of the row and (b) survives the MRU cap
// regardless of recency. It's the "keep this one" affordance every recents
// UI eventually wants.
//
// Pinned ratios live in their own small capped list (own store key) and
// are deduped by the same 2-decimal display label the recents use, so the
// two lists never disagree on what "the same crop" means. All pure +
// DOM-free; the store + LeftSidebar stay thin.

export const PINNED_RATIOS_MAX = 5

// Normalise a stored / incoming pinned array into canonical form: valid
// clamped numbers only, deduped by display label (first occurrence wins),
// capped to MAX. Non-array → []. Mirrors sanitizeRecentRatios so the two
// rows share one notion of validity. Pure; fresh array of plain numbers.
export function sanitizePinnedRatios(list) {
  if (!Array.isArray(list)) return []
  const out = []
  const seen = new Set()
  for (const raw of list) {
    const r = clampCustomRatio(raw)
    if (r == null) continue
    const key = formatCustomRatioLabel(r)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(r)
    if (out.length >= PINNED_RATIOS_MAX) break
  }
  return out
}

// True when `ratio` (matched by its display label) is already pinned. An
// unparseable ratio is never pinned. Pure.
export function isRatioPinned(list, ratio) {
  const r = clampCustomRatio(ratio)
  if (r == null) return false
  const key = formatCustomRatioLabel(r)
  if (!key) return false
  const base = sanitizePinnedRatios(list)
  return base.some(x => formatCustomRatioLabel(x) === key)
}

// Toggle a ratio's pinned membership. If it's already pinned (by label),
// UNPIN it (remove); otherwise PIN it at the FRONT (newest favourite leads,
// and the oldest falls off the tail at the cap). An unparseable / out-of-
// band ratio leaves the (cleaned) list unchanged. Pure; never mutates —
// always returns a fresh canonical array the caller compares by value to
// decide whether a persist is warranted.
export function togglePinnedRatio(list, ratio) {
  const base = sanitizePinnedRatios(list)
  const r = clampCustomRatio(ratio)
  if (r == null) return base
  const key = formatCustomRatioLabel(r)
  if (base.some(x => formatCustomRatioLabel(x) === key)) {
    // Already pinned → unpin.
    return base.filter(x => formatCustomRatioLabel(x) !== key)
  }
  // Not pinned → pin at the front, capped.
  return [r, ...base].slice(0, PINNED_RATIOS_MAX)
}

// Build the ordered display row of ratio chips from the pinned + recents
// lists: PINNED chips first (in pin order, each flagged pinned:true), then
// the RECENT chips whose label isn't already pinned (flagged pinned:false).
// This is the single render model the chip row maps over, so a ratio is
// never shown twice and pinned favourites always lead. Both inputs are
// sanitized here so a caller can pass raw persisted blobs. Returns an array
// of { ratio, label, pinned }. Pure.
export function buildRatioChips(pinned, recents) {
  const pins = sanitizePinnedRatios(pinned)
  const recs = sanitizeRecentRatios(recents)
  const out = []
  const seen = new Set()
  for (const r of pins) {
    const label = formatCustomRatioLabel(r)
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push({ ratio: r, label, pinned: true })
  }
  for (const r of recs) {
    const label = formatCustomRatioLabel(r)
    if (!label || seen.has(label)) continue
    seen.add(label)
    out.push({ ratio: r, label, pinned: false })
  }
  return out
}

// --- R45.M: reorder the pinned ratio chips ----------------------------
//
// R44.M pins a favourite custom ratio to the HEAD of the chip row in
// pin-recency order. A user with several pinned crops (a 21:9 wallpaper,
// a 4:5 portrait, a 1:1) may want them in a deliberate PREFERENCE order,
// not just "most-recently-pinned first" — so this lets the pinned chips
// be drag-reordered. The pure core mirrors moveView / moveAttractorByIndex
// (the codebase's shared "splice from→to" reorder contract) so the React
// drag wiring stays thin and the fence-post cases are under test.
//
// The list is sanitized to canonical form FIRST so a caller can pass a
// raw persisted blob; the move then operates on indices into that
// canonical row. Returns the SANITIZED list unchanged (by value) on a
// no-op move (same index / out-of-range / non-finite index) so the
// caller can compare-by-value to skip a redundant persist. Pure; never
// mutates the input.
export function movePinnedRatio(list, fromIdx, toIdx) {
  const base = sanitizePinnedRatios(list)
  const n = base.length
  if (!Number.isFinite(fromIdx) || !Number.isFinite(toIdx)) return base
  if (fromIdx < 0 || fromIdx >= n) return base
  if (toIdx < 0 || toIdx >= n) return base
  if (fromIdx === toIdx) return base
  const next = base.slice()
  const [picked] = next.splice(fromIdx, 1)
  next.splice(toIdx, 0, picked)
  return next
}

// --- R46.M: projected slot order during a pinned-chip drag ------------
//
// R45.M makes the pinned ratio chips drag-reorderable. While the user is
// MID-DRAG, the only live cue is the indigo drop-target highlight on one
// chip — but with 4-5 pins it's hard to see at a glance where each chip
// will END UP. This computes, for a pending move (drag chip `fromIdx`
// hovering over `toIdx`), the projected 1-based slot number every chip
// would occupy if the drop happened now — so the UI can paint a tiny
// "1 / N" order badge on each pinned chip that updates as the cursor
// moves, exactly like a sortable list preview.
//
// Returns an array of length `count` where entry[i] is the 1-based slot
// the chip currently at index i would land in after the move. With no
// active drag (fromIdx/toIdx null/out-of-range/equal, or count < 2) it
// returns the identity order [1, 2, ..., count] so the caller can render
// the same badge shape whether or not a drag is in flight. Pure; mirrors
// movePinnedRatio's splice semantics so badge == post-drop reality.
export function projectedPinnedOrder(count, fromIdx, toIdx) {
  const n = Math.max(0, Math.floor(Number(count)) || 0)
  // Identity order: chip at index i sits in slot i+1.
  const identity = () => Array.from({ length: n }, (_, i) => i + 1)
  if (n < 2) return identity()
  const f = Number(fromIdx), t = Number(toIdx)
  if (!Number.isFinite(f) || !Number.isFinite(t)) return identity()
  if (f < 0 || f >= n || t < 0 || t >= n || f === t) return identity()
  // Simulate the splice on an index array, then invert: for each ORIGINAL
  // index, find where it lands in the reordered sequence (1-based).
  const order = Array.from({ length: n }, (_, i) => i)
  const [picked] = order.splice(f, 1)
  order.splice(t, 0, picked)
  const slotOf = new Array(n)
  for (let slot = 0; slot < n; slot++) slotOf[order[slot]] = slot + 1
  return slotOf
}

// --- R51.M: keyboard reorder for pinned ratio chips -------------------
//
// R45.M makes the pinned chips drag-reorderable, but drag is mouse-only —
// no keyboard or screen-reader path. R51.M is the accessibility parity:
// focus a pinned chip and press Left/Right (or Up/Down) to shift it one
// slot. This computes the TARGET index for one arrow step from a focused
// chip, clamped to the pinned run so the ends are no-ops. Returns the new
// index, or the SAME index when the move would fall off either end / count
// < 2 / junk, so a caller can compare-and-skip. The caller pairs the result
// with movePinnedRatio + refocus. Pure.
export function pinnedReorderTarget(fromIdx, count, dir) {
  const n = Math.max(0, Math.floor(Number(count)) || 0)
  const f = Math.floor(Number(fromIdx))
  if (n < 2 || !Number.isFinite(f) || f < 0 || f >= n) return f
  const step = dir < 0 ? -1 : dir > 0 ? 1 : 0
  if (step === 0) return f
  const t = f + step
  if (t < 0 || t >= n) return f
  return t
}

// --- R47.M: insert-caret gap during a pinned-chip drag ----------------
//
// R46.M paints a per-chip \"N\" order badge so the projected order reads at
// a glance. But with chips packed tightly the LANDING SLOT (where the
// dragged chip will drop) is still ambiguous — a badge tells you each
// chip's final number, not where the new boundary falls. R47.M adds a
// thin vertical caret rendered BETWEEN two chips, exactly at the gap the
// dragged chip would slot into, so the drop position reads even when the
// chips are shoulder-to-shoulder.
//
// Gap indices run 0..count: gap g sits to the LEFT of the chip that ends
// up in slot g (gap 0 = before the first chip, gap count = after the
// last). For a drag from `fromIdx` hovering `toIdx` the dragged chip
// lands at slot `toIdx`, so the caret sits at gap `toIdx`. With no active
// drag (null/out-of-range/equal indices, or count < 2) returns null so
// the UI renders no caret. Pure; mirrors movePinnedRatio's splice so the
// caret never lies about the drop boundary.
export function pinnedDropCaretGap(count, fromIdx, toIdx) {
  const n = Math.max(0, Math.floor(Number(count)) || 0)
  if (n < 2) return null
  if (fromIdx == null || toIdx == null) return null
  const f = Number(fromIdx), t = Number(toIdx)
  if (!Number.isFinite(f) || !Number.isFinite(t)) return null
  if (f < 0 || f >= n || t < 0 || t >= n || f === t) return null
  return t
}
