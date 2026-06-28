// Screenshot watermark / caption (R42.G).
//
// Optionally bake a small caption (the preset name) into the exported
// screenshot PNG so a shared still is self-documenting — "which preset
// is this?" answered right on the image. The caption is composited onto
// a 2D canvas copy of the live GL canvas at export time, so it only
// appears in the saved file, never on the live scene.
//
// This module owns the pure bits — the corner anchor roster, the caption
// text builder, and the placement geometry (where the text + its pill
// background sit for a given canvas size + anchor) — so the React/canvas
// side stays a thin renderer and the math unit-tests without a DOM.

// The four corner anchors the caption can sit in. Ordered so a cycle
// reads naturally (top row L→R, then bottom row L→R).
export const WATERMARK_ANCHORS = [
  { id: 'top-left',     label: 'Top left' },
  { id: 'top-right',    label: 'Top right' },
  { id: 'bottom-left',  label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
]

const ANCHOR_IDS = new Set(WATERMARK_ANCHORS.map(a => a.id))

// The default anchor — bottom-right is the least intrusive spot for a
// caption (mirrors where most apps watermark).
export const WATERMARK_ANCHOR_DEFAULT = 'bottom-right'

export function isValidWatermarkAnchor(id) {
  return ANCHOR_IDS.has(id)
}

// Normalise a stored / incoming anchor id; junk → the default.
export function sanitizeWatermarkAnchor(id) {
  return ANCHOR_IDS.has(id) ? id : WATERMARK_ANCHOR_DEFAULT
}

// Cycle to the next anchor (wraps). Unknown id → first entry's id.
export function nextWatermarkAnchor(id) {
  const idx = WATERMARK_ANCHORS.findIndex(a => a.id === id)
  if (idx < 0) return WATERMARK_ANCHORS[0].id
  return WATERMARK_ANCHORS[(idx + 1) % WATERMARK_ANCHORS.length].id
}

// Max characters of caption text before we ellipsis, so a long preset
// name can't run a caption off the edge of the image.
export const WATERMARK_MAX_LEN = 48

// Build the caption text from a preset label. Pure.
//   - non-string / empty / whitespace-only → '' (caller skips drawing —
//     a blank caption shouldn't paint an empty pill)
//   - trims + collapses internal whitespace runs to single spaces
//   - optional prefix (e.g. a wordmark) is prepended with a separator
//   - ellipsis-truncates the WHOLE result to maxLen (ellipsis counted in
//     the budget so the caption width is bounded)
export function buildWatermarkText(label, opts = {}) {
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : WATERMARK_MAX_LEN
  if (typeof label !== 'string') return ''
  let text = label.trim().replace(/\s+/g, ' ')
  if (!text) return ''
  const prefix = typeof opts.prefix === 'string' ? opts.prefix.trim().replace(/\s+/g, ' ') : ''
  if (prefix) text = `${prefix} \u00b7 ${text}`
  if (text.length <= maxLen) return text
  if (maxLen <= 1) return '\u2026'
  return text.slice(0, maxLen - 1).trimEnd() + '\u2026'
}

// Resolve a font size that scales with the image so the caption is
// legible on both a 600px-wide preview and a 4K export, clamped to a
// readable band. Pure.
//   size = clamp(round(min(w, h) * scale), min, max)
export const WATERMARK_FONT_MIN = 11
export const WATERMARK_FONT_MAX = 40
export const WATERMARK_FONT_SCALE = 0.022

export function watermarkFontSize(canvasW, canvasH, opts = {}) {
  const w = Number(canvasW), h = Number(canvasH)
  const min = (Number.isFinite(opts.min) && opts.min > 0) ? opts.min : WATERMARK_FONT_MIN
  const max = (Number.isFinite(opts.max) && opts.max >= min) ? opts.max : WATERMARK_FONT_MAX
  const scale = (Number.isFinite(opts.scale) && opts.scale > 0) ? opts.scale : WATERMARK_FONT_SCALE
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return min
  const base = Math.min(w, h) * scale
  const sized = Math.round(base)
  if (sized < min) return min
  if (sized > max) return max
  return sized
}

// Compute the placement geometry for the caption: where the text anchors
// and how its rounded-pill background is laid out for a given canvas
// size, anchor, font size, and measured text width. Returns:
//   {
//     textX, textY, textAlign, textBaseline,
//     pillX, pillY, pillW, pillH, pillRadius,
//   }
// in CANVAS pixel coordinates (origin top-left). The text is inset from
// the chosen corner by `margin`; the pill wraps the text with `padX` /
// `padY` breathing room.
//
// Defensive: a degenerate canvas (<=0 dims) collapses everything to 0 so
// the renderer draws nothing rather than NaN-positioned text; a junk
// anchor falls back to the default corner.
export const WATERMARK_MARGIN = 16
export const WATERMARK_PAD_X = 10
export const WATERMARK_PAD_Y = 6

export function watermarkPlacement(canvasW, canvasH, anchor, fontSize, textWidth, opts = {}) {
  const w = Number(canvasW), h = Number(canvasH)
  const empty = {
    textX: 0, textY: 0, textAlign: 'left', textBaseline: 'alphabetic',
    pillX: 0, pillY: 0, pillW: 0, pillH: 0, pillRadius: 0,
  }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return empty
  const fs = (Number.isFinite(fontSize) && fontSize > 0) ? fontSize : WATERMARK_FONT_MIN
  const tw = (Number.isFinite(textWidth) && textWidth >= 0) ? textWidth : 0
  const a = sanitizeWatermarkAnchor(anchor)
  // Scale the margin + padding gently with the font so a big export
  // doesn't cram the caption into the corner.
  const fontScale = fs / WATERMARK_FONT_MIN
  const margin = ((Number.isFinite(opts.margin) && opts.margin >= 0) ? opts.margin : WATERMARK_MARGIN) * Math.min(2, fontScale)
  const padX = ((Number.isFinite(opts.padX) && opts.padX >= 0) ? opts.padX : WATERMARK_PAD_X) * Math.min(2, fontScale)
  const padY = ((Number.isFinite(opts.padY) && opts.padY >= 0) ? opts.padY : WATERMARK_PAD_Y) * Math.min(2, fontScale)

  const pillW = tw + padX * 2
  const pillH = fs + padY * 2
  const pillRadius = Math.min(pillH / 2, 10 * Math.min(2, fontScale))

  const isLeft = a === 'top-left' || a === 'bottom-left'
  const isTop = a === 'top-left' || a === 'top-right'

  // Pill corner position.
  const pillX = isLeft ? margin : (w - margin - pillW)
  const pillY = isTop ? margin : (h - margin - pillH)

  // Text sits inset inside the pill by padX/padY. We draw text with
  // 'left' align + 'middle' baseline so positioning is anchor-agnostic +
  // vertically centred in the pill regardless of font metrics.
  const textX = pillX + padX
  const textY = pillY + pillH / 2

  return {
    textX, textY, textAlign: 'left', textBaseline: 'middle',
    pillX, pillY, pillW, pillH, pillRadius,
  }
}

// --- R43.G: optional second caption line ------------------------------
//
// R42.G bakes the preset name into the export as a single-line caption.
// For a BRANDED share still a user wants a second line beneath it — a
// personal wordmark / handle, and/or the capture date. This adds the pure
// bits: a deterministic date formatter, a subtext builder that composes
// the wordmark + date, and a multi-line placement geometry that sizes the
// pill to fit both lines. The single-line path (watermarkPlacement) is
// untouched, so an export with no second line behaves exactly as before.

// Max characters of the second line before we ellipsis it.
export const WATERMARK_SUBTEXT_MAX_LEN = 52
// The sub-line font is a fraction of the main caption font so it reads as
// secondary; clamped to a legible minimum.
export const WATERMARK_SUB_SCALE = 0.78
export const WATERMARK_LINE_GAP = 3

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format a date as a short, locale-independent caption string, e.g.
// "Jun 27, 2026". Accepts a Date or a millisecond timestamp. Pure +
// deterministic (we read UTC-agnostic local getters but build the string
// ourselves so there's no locale/Intl flakiness in tests). Invalid /
// non-date input → '' (caller skips the date).
export function formatWatermarkDate(date) {
  let d
  if (date instanceof Date) d = date
  else if (typeof date === 'number' && Number.isFinite(date)) d = new Date(date)
  else return ''
  const ms = d.getTime()
  if (!Number.isFinite(ms)) return ''
  const mon = MONTHS[d.getMonth()]
  if (!mon) return ''
  return `${mon} ${d.getDate()}, ${d.getFullYear()}`
}

// Build the optional second caption line from a wordmark and/or a date.
// Pure.
//   opts: { wordmark, showDate, date, maxLen }
//   - wordmark: a user string (trimmed + whitespace-collapsed); blank → omitted
//   - showDate: when true, append the formatted `date` (default now is the
//     caller's job — pass an explicit date for determinism)
//   - when BOTH are present they're joined with " · " (wordmark first)
//   - empty result (neither present / both blank) → '' so the caller
//     skips drawing a second line
//   - ellipsis-truncates the WHOLE line to maxLen (ellipsis in budget)
export function buildWatermarkSubtext(opts = {}) {
  const maxLenRaw = Number(opts.maxLen)
  const maxLen = Number.isFinite(maxLenRaw) && maxLenRaw > 0 ? Math.floor(maxLenRaw) : WATERMARK_SUBTEXT_MAX_LEN
  const parts = []
  const wordmark = typeof opts.wordmark === 'string' ? opts.wordmark.trim().replace(/\s+/g, ' ') : ''
  if (wordmark) parts.push(wordmark)
  if (opts.showDate) {
    const dateStr = formatWatermarkDate(opts.date)
    if (dateStr) parts.push(dateStr)
  }
  let text = parts.join(' \u00b7 ')
  if (!text) return ''
  if (text.length <= maxLen) return text
  if (maxLen <= 1) return '\u2026'
  return text.slice(0, maxLen - 1).trimEnd() + '\u2026'
}

// Sub-line font size derived from the main caption font, clamped so it
// never shrinks below the readable floor. Pure.
export function watermarkSubFontSize(mainFontSize, opts = {}) {
  const fs = Number(mainFontSize)
  if (!Number.isFinite(fs) || fs <= 0) return WATERMARK_FONT_MIN
  const scale = (Number.isFinite(opts.scale) && opts.scale > 0) ? opts.scale : WATERMARK_SUB_SCALE
  const min = (Number.isFinite(opts.min) && opts.min > 0) ? opts.min : WATERMARK_FONT_MIN
  const sized = Math.round(fs * scale)
  return sized < min ? min : sized
}

// Multi-line placement geometry: like watermarkPlacement but for a caption
// with one OR two lines. `lines` is an array of measured line descriptors
// [{ width, fontSize }] (1 or 2 entries; the first is the main caption,
// the second the sub-line). Returns the pill rect + a per-line list of
// { textX, textY, textAlign, textBaseline } in canvas pixels. The pill is
// sized to the widest line and the summed line heights; lines are left-
// aligned and stacked, vertically centred-per-line so font metrics don't
// matter. Defensive: degenerate canvas / no valid lines → an all-zero
// result so the renderer draws nothing rather than NaN-positioned text.
export function watermarkPlacementMulti(canvasW, canvasH, anchor, lines, opts = {}) {
  const w = Number(canvasW), h = Number(canvasH)
  const empty = { pillX: 0, pillY: 0, pillW: 0, pillH: 0, pillRadius: 0, lines: [] }
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return empty
  const rows = Array.isArray(lines)
    ? lines.filter(l => l && Number.isFinite(Number(l.fontSize)) && Number(l.fontSize) > 0)
    : []
  if (rows.length === 0) return empty
  const a = sanitizeWatermarkAnchor(anchor)
  // Scale margin/pad gently with the MAIN font (first row), matching the
  // single-line path so a one-line export lands in the same spot.
  const mainFs = Number(rows[0].fontSize)
  const fontScale = mainFs / WATERMARK_FONT_MIN
  const margin = ((Number.isFinite(opts.margin) && opts.margin >= 0) ? opts.margin : WATERMARK_MARGIN) * Math.min(2, fontScale)
  const padX = ((Number.isFinite(opts.padX) && opts.padX >= 0) ? opts.padX : WATERMARK_PAD_X) * Math.min(2, fontScale)
  const padY = ((Number.isFinite(opts.padY) && opts.padY >= 0) ? opts.padY : WATERMARK_PAD_Y) * Math.min(2, fontScale)
  const lineGap = ((Number.isFinite(opts.lineGap) && opts.lineGap >= 0) ? opts.lineGap : WATERMARK_LINE_GAP) * Math.min(2, fontScale)

  let maxW = 0
  let sumH = 0
  for (let i = 0; i < rows.length; i++) {
    const lw = Number(rows[i].width)
    if (Number.isFinite(lw) && lw > maxW) maxW = lw
    sumH += Number(rows[i].fontSize)
    if (i > 0) sumH += lineGap
  }
  const pillW = maxW + padX * 2
  const pillH = sumH + padY * 2
  const pillRadius = Math.min(pillH / 2, 10 * Math.min(2, fontScale))

  const isLeft = a === 'top-left' || a === 'bottom-left'
  const isTop = a === 'top-left' || a === 'top-right'
  const pillX = isLeft ? margin : (w - margin - pillW)
  const pillY = isTop ? margin : (h - margin - pillH)

  const textX = pillX + padX
  const outLines = []
  let cursorY = pillY + padY
  for (const r of rows) {
    const fs = Number(r.fontSize)
    outLines.push({
      textX,
      textY: cursorY + fs / 2,
      textAlign: 'left',
      textBaseline: 'middle',
      fontSize: fs,
    })
    cursorY += fs + lineGap
  }
  return { pillX, pillY, pillW, pillH, pillRadius, lines: outLines }
}

// --- R44.G: live caption preview --------------------------------------
//
// R42.G/R43.G bake the caption (corner + optional second line) into the
// export, but the user only SEES the result after exporting. R44.G adds a
// live preview inside the watermark popover so they see the branded pill —
// corner placement + both lines + relative line sizes — before exporting.
//
// The preview renders into a small box (e.g. 150x90), not the real canvas,
// so we need a width estimate WITHOUT a 2D context. estimateTextWidth uses
// an average-glyph-width heuristic (good enough for an indicative preview;
// the real export still measures precisely with ctx.measureText). The
// preview geometry then reuses the tested watermarkPlacementMulti so the
// pill sits in the same corner with the same stacking the export uses.

// Average glyph width as a fraction of the font size for the preview
// estimate. ~0.55 is a reasonable mean for a humanist sans at small sizes.
export const PREVIEW_CHAR_WIDTH_FACTOR = 0.55
// Preview line font sizes (px) inside the small popover box — fixed +
// small so a long caption still fits; the sub-line is the smaller of the
// pair to mirror the export's main/sub hierarchy.
export const PREVIEW_MAIN_FONT = 9
export const PREVIEW_SUB_FONT = 7

// Estimate a text run's pixel width at a given font size, without a canvas.
// Pure. Non-string / empty → 0; non-finite / non-positive font → 0.
export function estimateTextWidth(text, fontSize, charWidthFactor = PREVIEW_CHAR_WIDTH_FACTOR) {
  if (typeof text !== 'string' || text.length === 0) return 0
  const fs = Number(fontSize)
  if (!Number.isFinite(fs) || fs <= 0) return 0
  const f = (Number.isFinite(charWidthFactor) && charWidthFactor > 0) ? charWidthFactor : PREVIEW_CHAR_WIDTH_FACTOR
  return text.length * fs * f
}

// Build the live caption preview geometry for a small box. `lines` is an
// array of the already-built caption strings paired with a preview font
// size: [{ text, fontSize }] (1 or 2 entries; main first, sub second).
// Empty-text rows are dropped so a preview with no second line collapses to
// one. Returns:
//   { pillX, pillY, pillW, pillH, pillRadius, lines: [{ textX, textY,
//     fontSize, text, textAlign, textBaseline }] }
// in PREVIEW-box pixel coordinates (origin top-left), reusing the tested
// watermarkPlacementMulti so the corner placement + stacking match the
// export. Defensive: degenerate box / no usable lines → an all-zero result
// (lines: []) so the renderer draws nothing rather than NaN-positioned
// chips.
export function buildWatermarkPreview(boxW, boxH, anchor, lines, opts = {}) {
  const rows = Array.isArray(lines)
    ? lines.filter(l => l && typeof l.text === 'string' && l.text.length > 0
        && Number.isFinite(Number(l.fontSize)) && Number(l.fontSize) > 0)
    : []
  const empty = { pillX: 0, pillY: 0, pillW: 0, pillH: 0, pillRadius: 0, lines: [] }
  if (rows.length === 0) return empty
  const charWidthFactor = (Number.isFinite(opts.charWidthFactor) && opts.charWidthFactor > 0)
    ? opts.charWidthFactor : PREVIEW_CHAR_WIDTH_FACTOR
  // Smaller margins/pad than the export default so the pill fits a tiny box.
  const placeOpts = {
    margin: Number.isFinite(opts.margin) ? opts.margin : 8,
    padX: Number.isFinite(opts.padX) ? opts.padX : 5,
    padY: Number.isFinite(opts.padY) ? opts.padY : 3,
    lineGap: Number.isFinite(opts.lineGap) ? opts.lineGap : 2,
  }
  const measured = rows.map(r => ({
    width: estimateTextWidth(r.text, r.fontSize, charWidthFactor),
    fontSize: Number(r.fontSize),
  }))
  const p = watermarkPlacementMulti(boxW, boxH, anchor, measured, placeOpts)
  if (p.pillW <= 0 || p.lines.length === 0) return empty
  // Re-attach each row's text to its placed line so the renderer can draw
  // the actual caption strings in their estimated positions.
  return {
    pillX: p.pillX, pillY: p.pillY, pillW: p.pillW, pillH: p.pillH, pillRadius: p.pillRadius,
    lines: p.lines.map((ln, i) => ({ ...ln, text: rows[i].text })),
  }
}
