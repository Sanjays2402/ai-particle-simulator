// screenshotWatermark: caption builder + anchor roster + font sizing +
// placement geometry for the baked-in screenshot caption (R42.G).
import {
  WATERMARK_ANCHORS, WATERMARK_ANCHOR_DEFAULT,
  isValidWatermarkAnchor, sanitizeWatermarkAnchor, nextWatermarkAnchor,
  WATERMARK_MAX_LEN, buildWatermarkText,
  WATERMARK_FONT_MIN, WATERMARK_FONT_MAX, watermarkFontSize,
  watermarkPlacement,
  // R43.G — optional second caption line
  WATERMARK_SUBTEXT_MAX_LEN, WATERMARK_SUB_SCALE,
  formatWatermarkDate, buildWatermarkSubtext, watermarkSubFontSize,
  watermarkPlacementMulti,
  // R44.G — live caption preview
  PREVIEW_CHAR_WIDTH_FACTOR, PREVIEW_MAIN_FONT, PREVIEW_SUB_FONT,
  estimateTextWidth, buildWatermarkPreview,
  // R45.G — clickable preview corners
  anchorFromPreviewPoint,
  // R46.G — continuous drag-to-place the anchor
  nextAnchorOnDrag,
  // R47.G — live ghost pill position during a caption drag
  GHOST_INSET, previewGhostPosition, GHOST_LABEL_MAX_LEN, ghostPillLabel,
  GHOST_SUB_LABEL_MAX_LEN, ghostPillSubLabel,
} from './screenshotWatermark.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }
function near(a, b, m, eps = 0.5) { if (Math.abs(a - b) > eps) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// --- anchor roster integrity ---
ok(WATERMARK_ANCHORS.length === 4, 'four corner anchors')
{
  const ids = new Set(WATERMARK_ANCHORS.map(a => a.id))
  eq(ids.size, WATERMARK_ANCHORS.length, 'all anchor ids unique')
  for (const a of WATERMARK_ANCHORS) {
    ok(typeof a.id === 'string' && a.id.length > 0, `anchor ${a.id} has id`)
    ok(typeof a.label === 'string' && a.label.length > 0, `anchor ${a.id} has label`)
  }
}
ok(isValidWatermarkAnchor(WATERMARK_ANCHOR_DEFAULT), 'default anchor is valid')

// --- validation / sanitize / cycle ---
eq(isValidWatermarkAnchor('top-left'), true, 'top-left valid')
eq(isValidWatermarkAnchor('nope'), false, 'unknown invalid')
eq(sanitizeWatermarkAnchor('bottom-left'), 'bottom-left', 'known passes through')
eq(sanitizeWatermarkAnchor('junk'), WATERMARK_ANCHOR_DEFAULT, 'junk → default')
eq(sanitizeWatermarkAnchor(null), WATERMARK_ANCHOR_DEFAULT, 'null → default')
// cycle wraps through every anchor once.
{
  let id = WATERMARK_ANCHORS[0].id
  const seen = new Set([id])
  for (let i = 0; i < WATERMARK_ANCHORS.length; i++) {
    id = nextWatermarkAnchor(id)
    seen.add(id)
  }
  eq(id, WATERMARK_ANCHORS[0].id, 'cycle wraps to start')
  eq(seen.size, WATERMARK_ANCHORS.length, 'cycle covers all anchors')
  eq(nextWatermarkAnchor('unknown'), WATERMARK_ANCHORS[0].id, 'unknown → first')
}

// --- buildWatermarkText ---
eq(buildWatermarkText('Nebula Drift'), 'Nebula Drift', 'normal label passes through')
eq(buildWatermarkText('  Aurora  '), 'Aurora', 'trims whitespace')
eq(buildWatermarkText('Solar\n  Flare'), 'Solar Flare', 'collapses internal whitespace')
// empty / non-string → '' (caller skips drawing).
eq(buildWatermarkText(''), '', 'empty → empty (no pill)')
eq(buildWatermarkText('   '), '', 'whitespace-only → empty')
eq(buildWatermarkText(null), '', 'null → empty')
eq(buildWatermarkText(42), '', 'number → empty')
// prefix prepended with separator.
eq(buildWatermarkText('Aurora', { prefix: 'particles' }), 'particles \u00b7 Aurora', 'prefix prepended')
eq(buildWatermarkText('Aurora', { prefix: '  ' }), 'Aurora', 'blank prefix ignored')
// truncation bounded to maxLen.
{
  const long = 'X'.repeat(80)
  const out = buildWatermarkText(long)
  ok(out.length <= WATERMARK_MAX_LEN, `truncated within maxLen — got ${out.length}`)
  ok(out.endsWith('\u2026'), 'truncated ends with ellipsis')
}
// exactly at maxLen → not truncated.
{
  const exact = 'Y'.repeat(WATERMARK_MAX_LEN)
  eq(buildWatermarkText(exact), exact, 'exactly maxLen not truncated')
}
// one over → truncated to exactly maxLen.
{
  const over = 'Z'.repeat(WATERMARK_MAX_LEN + 1)
  const out = buildWatermarkText(over)
  eq(out.length, WATERMARK_MAX_LEN, 'one-over truncates to exactly maxLen')
}
// custom maxLen honoured (incl. the prefix in the budget).
{
  const out = buildWatermarkText('abcdefghij', { maxLen: 5 })
  eq(out.length, 5, 'custom maxLen bounds length')
  ok(out.endsWith('\u2026'), 'custom maxLen ellipsizes')
}
eq(buildWatermarkText('abcdef', { maxLen: 1 }), '\u2026', 'maxLen 1 → lone ellipsis')

// --- watermarkFontSize ---
{
  // scales with the smaller dimension, clamped to the band.
  ok(watermarkFontSize(3840, 2160) > watermarkFontSize(800, 600), 'bigger canvas → bigger font')
  // tiny canvas clamps to MIN.
  eq(watermarkFontSize(200, 120), WATERMARK_FONT_MIN, 'tiny canvas → MIN font')
  // huge canvas clamps to MAX.
  eq(watermarkFontSize(20000, 20000), WATERMARK_FONT_MAX, 'huge canvas → MAX font')
  // degenerate dims → MIN.
  eq(watermarkFontSize(0, 0), WATERMARK_FONT_MIN, 'zero dims → MIN')
  eq(watermarkFontSize(NaN, 100), WATERMARK_FONT_MIN, 'NaN dim → MIN')
  // always within band.
  for (const [w, h] of [[100, 100], [800, 600], [1920, 1080], [4096, 4096]]) {
    const fs = watermarkFontSize(w, h)
    ok(fs >= WATERMARK_FONT_MIN && fs <= WATERMARK_FONT_MAX, `font ${w}x${h} in band — got ${fs}`)
  }
}

// --- watermarkPlacement: corner geometry ---
{
  const W = 1000, H = 800, fs = 20, tw = 120
  // bottom-right (default): pill hugs the bottom-right corner.
  {
    const p = watermarkPlacement(W, H, 'bottom-right', fs, tw)
    ok(p.pillX + p.pillW <= W, 'BR: pill right edge within canvas')
    ok(p.pillY + p.pillH <= H, 'BR: pill bottom edge within canvas')
    ok(p.pillX > W / 2, 'BR: pill on the right half')
    ok(p.pillY > H / 2, 'BR: pill on the bottom half')
    // text sits inside the pill.
    ok(p.textX >= p.pillX && p.textX <= p.pillX + p.pillW, 'BR: text x inside pill')
    near(p.textY, p.pillY + p.pillH / 2, 'BR: text y centred in pill')
    eq(p.textBaseline, 'middle', 'baseline middle (font-metric agnostic)')
  }
  // top-left: pill hugs the top-left corner.
  {
    const p = watermarkPlacement(W, H, 'top-left', fs, tw)
    ok(p.pillX < W / 2, 'TL: pill on the left half')
    ok(p.pillY < H / 2, 'TL: pill on the top half')
    ok(p.pillX >= 0, 'TL: pill x >= 0')
    ok(p.pillY >= 0, 'TL: pill y >= 0')
  }
  // top-right + bottom-left land in their quadrants.
  {
    const tr = watermarkPlacement(W, H, 'top-right', fs, tw)
    ok(tr.pillX > W / 2 && tr.pillY < H / 2, 'TR: right + top half')
    const bl = watermarkPlacement(W, H, 'bottom-left', fs, tw)
    ok(bl.pillX < W / 2 && bl.pillY > H / 2, 'BL: left + bottom half')
  }
  // pill wraps the text: pillW = textWidth + 2*padX (with font scaling at
  // the MIN font, fontScale==1, so padX is the base value).
  {
    const p = watermarkPlacement(W, H, 'top-left', WATERMARK_FONT_MIN, 100)
    ok(p.pillW > 100, 'pill wider than the text it wraps')
    ok(p.pillH > WATERMARK_FONT_MIN, 'pill taller than the font')
  }
  // junk anchor falls back to the default corner (bottom-right).
  {
    const fallback = watermarkPlacement(W, H, 'junk', fs, tw)
    const def = watermarkPlacement(W, H, WATERMARK_ANCHOR_DEFAULT, fs, tw)
    eq(fallback.pillX, def.pillX, 'junk anchor → default corner x')
    eq(fallback.pillY, def.pillY, 'junk anchor → default corner y')
  }
  // degenerate canvas → all-zero (renderer draws nothing).
  {
    const p = watermarkPlacement(0, 0, 'top-left', fs, tw)
    eq(p.pillW, 0, 'degenerate canvas → zero pill')
    eq(p.textX, 0, 'degenerate canvas → zero text x')
  }
  // zero text width still yields a (small) pill from the padding.
  {
    const p = watermarkPlacement(W, H, 'top-left', WATERMARK_FONT_MIN, 0)
    ok(p.pillW > 0, 'zero text width → pill still has padding width')
  }
}

console.log(`PASS: screenshotWatermark — ${passed} assertions (anchor roster + sanitize/cycle, caption builder, font sizing, corner placement geometry) (R42.G)`)

// --- R43.G: optional second caption line ------------------------------
{
  // formatWatermarkDate — deterministic short form.
  {
    const d = new Date(2026, 5, 27) // Jun 27 2026 (month is 0-based)
    eq(formatWatermarkDate(d), 'Jun 27, 2026', 'date formats as "Jun 27, 2026"')
    eq(formatWatermarkDate(d.getTime()), 'Jun 27, 2026', 'timestamp formats identically')
    eq(formatWatermarkDate(new Date(2026, 0, 1)), 'Jan 1, 2026', 'Jan 1 formats')
    eq(formatWatermarkDate(new Date(2025, 11, 31)), 'Dec 31, 2025', 'Dec 31 formats')
    // invalid / non-date → ''.
    eq(formatWatermarkDate(null), '', 'null date → empty')
    eq(formatWatermarkDate('nope'), '', 'string → empty')
    eq(formatWatermarkDate(NaN), '', 'NaN → empty')
    eq(formatWatermarkDate(new Date('invalid')), '', 'invalid Date → empty')
  }

  // buildWatermarkSubtext — compose wordmark + date.
  {
    const d = new Date(2026, 5, 27)
    eq(buildWatermarkSubtext({ wordmark: 'particles.app' }), 'particles.app', 'wordmark only')
    eq(buildWatermarkSubtext({ showDate: true, date: d }), 'Jun 27, 2026', 'date only')
    eq(buildWatermarkSubtext({ wordmark: 'particles.app', showDate: true, date: d }),
      'particles.app \u00b7 Jun 27, 2026', 'wordmark + date joined')
    // wordmark trimmed + whitespace-collapsed.
    eq(buildWatermarkSubtext({ wordmark: '  my   mark ' }), 'my mark', 'wordmark trimmed/collapsed')
    // neither → empty.
    eq(buildWatermarkSubtext({}), '', 'nothing → empty')
    eq(buildWatermarkSubtext({ wordmark: '   ' }), '', 'blank wordmark → empty')
    eq(buildWatermarkSubtext({ showDate: false, wordmark: '' }), '', 'date off + blank → empty')
    // showDate true but no date → empty (no junk).
    eq(buildWatermarkSubtext({ showDate: true }), '', 'showDate with no date → empty')
    // truncation.
    {
      const out = buildWatermarkSubtext({ wordmark: 'Q'.repeat(80) })
      ok(out.length <= WATERMARK_SUBTEXT_MAX_LEN, `subtext within maxLen — got ${out.length}`)
      ok(out.endsWith('\u2026'), 'over-long subtext ellipsized')
    }
    eq(buildWatermarkSubtext({ wordmark: 'abcdefghij', maxLen: 5 }).length, 5, 'custom maxLen bounds subtext')
  }

  // watermarkSubFontSize — fraction of the main font, clamped to floor.
  {
    ok(watermarkSubFontSize(40) < 40, 'sub font smaller than main')
    near(watermarkSubFontSize(40), Math.round(40 * WATERMARK_SUB_SCALE), 'sub font scaled from main')
    eq(watermarkSubFontSize(WATERMARK_FONT_MIN), WATERMARK_FONT_MIN, 'sub font floors at MIN')
    eq(watermarkSubFontSize(0), WATERMARK_FONT_MIN, 'degenerate main → MIN')
    eq(watermarkSubFontSize(NaN), WATERMARK_FONT_MIN, 'NaN main → MIN')
  }

  // watermarkPlacementMulti — two-line pill.
  {
    const W = 1000, H = 800
    const lines = [{ width: 120, fontSize: 20 }, { width: 90, fontSize: 15 }]
    const p = watermarkPlacementMulti(W, H, 'bottom-right', lines)
    eq(p.lines.length, 2, 'two-line placement returns two line positions')
    // pill sized to the WIDER line + padding.
    ok(p.pillW > 120, 'pill wider than the widest line')
    // pill taller than a single-line pill (stacks both line heights).
    const single = watermarkPlacementMulti(W, H, 'bottom-right', [{ width: 120, fontSize: 20 }])
    ok(p.pillH > single.pillH, 'two-line pill taller than one-line pill')
    // bottom-right: pill hugs the corner, within bounds.
    ok(p.pillX + p.pillW <= W, 'BR: pill right edge within canvas')
    ok(p.pillY + p.pillH <= H, 'BR: pill bottom edge within canvas')
    ok(p.pillX > W / 2 && p.pillY > H / 2, 'BR: pill in bottom-right quadrant')
    // lines stack top-to-bottom (line 2 below line 1), left-aligned same x.
    ok(p.lines[1].textY > p.lines[0].textY, 'second line sits below the first')
    eq(p.lines[0].textX, p.lines[1].textX, 'lines share a left edge')
    eq(p.lines[0].textAlign, 'left', 'left aligned')
    eq(p.lines[0].textBaseline, 'middle', 'middle baseline (font-metric agnostic)')
    // both line text rows inside the pill vertically.
    ok(p.lines[0].textY > p.pillY && p.lines[1].textY < p.pillY + p.pillH, 'both lines inside the pill')
    // top-left places in the top-left quadrant.
    const tl = watermarkPlacementMulti(W, H, 'top-left', lines)
    ok(tl.pillX < W / 2 && tl.pillY < H / 2, 'TL: pill in top-left quadrant')
  }
  // degenerate / empty inputs → all-zero (renderer draws nothing).
  {
    eq(watermarkPlacementMulti(0, 0, 'top-left', [{ width: 10, fontSize: 12 }]).pillW, 0, 'degenerate canvas → zero pill')
    eq(watermarkPlacementMulti(800, 600, 'top-left', []).lines.length, 0, 'no lines → empty placement')
    eq(watermarkPlacementMulti(800, 600, 'top-left', null).pillW, 0, 'non-array lines → zero pill')
    // a line with a bad fontSize is filtered out.
    const filtered = watermarkPlacementMulti(800, 600, 'top-left', [{ width: 10, fontSize: 12 }, { width: 8, fontSize: 0 }])
    eq(filtered.lines.length, 1, 'bad-fontSize line filtered out')
  }
}

console.log(`PASS: screenshotWatermark R43.G — ${passed} total assertions (incl. second caption line: date, subtext, sub-font, multi-line geometry)`)

// --- R44.G: live caption preview ---
{
  // estimateTextWidth: proportional to length * font * factor.
  near(estimateTextWidth('abcd', 10, 0.5), 20, 'estimate: 4 chars * 10 * 0.5 = 20')
  near(estimateTextWidth('ab', 20, 0.5), 20, 'estimate: 2 chars * 20 * 0.5 = 20')
  eq(estimateTextWidth('', 10), 0, 'estimate: empty text → 0')
  eq(estimateTextWidth(null, 10), 0, 'estimate: non-string → 0')
  eq(estimateTextWidth('abc', 0), 0, 'estimate: zero font → 0')
  eq(estimateTextWidth('abc', -5), 0, 'estimate: negative font → 0')
  eq(estimateTextWidth('abc', NaN), 0, 'estimate: NaN font → 0')
  // a longer string estimates wider than a shorter one (monotone in length).
  ok(estimateTextWidth('abcdef', 10) > estimateTextWidth('abc', 10), 'estimate: longer → wider')
  // default factor used when an invalid one is passed.
  near(estimateTextWidth('ab', 10, -1), 2 * 10 * PREVIEW_CHAR_WIDTH_FACTOR, 'estimate: bad factor → default')

  // buildWatermarkPreview: a single line lays out within the box.
  {
    const p = buildWatermarkPreview(158, 92, 'bottom-right', [
      { text: 'Aurora', fontSize: PREVIEW_MAIN_FONT },
      { text: '', fontSize: PREVIEW_SUB_FONT },
    ])
    eq(p.lines.length, 1, 'preview: empty sub-line dropped → one line')
    eq(p.lines[0].text, 'Aurora', 'preview: main text attached to its line')
    ok(p.pillW > 0 && p.pillH > 0, 'preview: pill has positive size')
    // pill sits inside the box.
    ok(p.pillX >= 0 && p.pillX + p.pillW <= 158, 'preview: pill within box width')
    ok(p.pillY >= 0 && p.pillY + p.pillH <= 92, 'preview: pill within box height')
  }
  // two lines → both placed, sub stacked below main, sub smaller.
  {
    const p = buildWatermarkPreview(158, 92, 'bottom-right', [
      { text: 'Aurora', fontSize: PREVIEW_MAIN_FONT },
      { text: 'by cake', fontSize: PREVIEW_SUB_FONT },
    ])
    eq(p.lines.length, 2, 'preview: two lines placed')
    eq(p.lines[1].text, 'by cake', 'preview: sub text attached')
    ok(p.lines[1].textY > p.lines[0].textY, 'preview: sub stacked below main')
    ok(p.lines[1].fontSize < p.lines[0].fontSize, 'preview: sub font smaller')
  }
  // corner placement: a top-left frame puts the pill near the top-left.
  {
    const tl = buildWatermarkPreview(158, 92, 'top-left', [{ text: 'X', fontSize: PREVIEW_MAIN_FONT }])
    const br = buildWatermarkPreview(158, 92, 'bottom-right', [{ text: 'X', fontSize: PREVIEW_MAIN_FONT }])
    ok(tl.pillX < br.pillX, 'preview: top-left pill is further left than bottom-right')
    ok(tl.pillY < br.pillY, 'preview: top-left pill is higher than bottom-right')
  }
  // defensive: no usable lines / degenerate box → all-zero result.
  {
    eq(buildWatermarkPreview(158, 92, 'top-left', []).pillW, 0, 'preview: no lines → zero pill')
    eq(buildWatermarkPreview(158, 92, 'top-left', [{ text: '', fontSize: 9 }]).lines.length, 0, 'preview: all-empty lines → []')
    eq(buildWatermarkPreview(0, 0, 'top-left', [{ text: 'X', fontSize: 9 }]).pillW, 0, 'preview: degenerate box → zero pill')
    eq(buildWatermarkPreview(158, 92, 'top-left', null).lines.length, 0, 'preview: non-array lines → []')
  }
  // every placed line carries finite coords + its text.
  {
    const p = buildWatermarkPreview(158, 92, 'bottom-left', [
      { text: 'Hello', fontSize: PREVIEW_MAIN_FONT },
      { text: 'World', fontSize: PREVIEW_SUB_FONT },
    ])
    ok(p.lines.every(l => Number.isFinite(l.textX) && Number.isFinite(l.textY) && typeof l.text === 'string'),
      'preview: every line has finite coords + text')
  }
}

// --- R45.G: anchorFromPreviewPoint (clickable preview corners) ---
{
  const W = 158, H = 92
  // each quadrant of the box maps to its corner anchor.
  eq(anchorFromPreviewPoint(10, 10, W, H), 'top-left', 'corner: top-left quadrant')
  eq(anchorFromPreviewPoint(150, 10, W, H), 'top-right', 'corner: top-right quadrant')
  eq(anchorFromPreviewPoint(10, 85, W, H), 'bottom-left', 'corner: bottom-left quadrant')
  eq(anchorFromPreviewPoint(150, 85, W, H), 'bottom-right', 'corner: bottom-right quadrant')
  // every returned id is a valid anchor.
  for (const [x, y] of [[1, 1], [W - 1, 1], [1, H - 1], [W - 1, H - 1], [W / 3, H / 3]]) {
    ok(isValidWatermarkAnchor(anchorFromPreviewPoint(x, y, W, H)), `corner: (${x},${y}) → valid anchor`)
  }
  // exact midline biases to lower / right (>= midpoint).
  eq(anchorFromPreviewPoint(W / 2, 10, W, H), 'top-right', 'corner: x exactly on midline → right')
  eq(anchorFromPreviewPoint(10, H / 2, W, H), 'bottom-left', 'corner: y exactly on midline → bottom')
  eq(anchorFromPreviewPoint(W / 2, H / 2, W, H), 'bottom-right', 'corner: dead-centre → bottom-right')
  // corners (0,0) and (W,H) resolve sanely.
  eq(anchorFromPreviewPoint(0, 0, W, H), 'top-left', 'corner: origin → top-left')
  eq(anchorFromPreviewPoint(W, H, W, H), 'bottom-right', 'corner: far corner → bottom-right')
  // defensive: degenerate box / non-finite point → null.
  eq(anchorFromPreviewPoint(10, 10, 0, H), null, 'corner: zero width → null')
  eq(anchorFromPreviewPoint(10, 10, W, 0), null, 'corner: zero height → null')
  eq(anchorFromPreviewPoint(10, 10, -5, H), null, 'corner: negative width → null')
  eq(anchorFromPreviewPoint(NaN, 10, W, H), null, 'corner: NaN x → null')
  eq(anchorFromPreviewPoint(10, Infinity, W, H), null, 'corner: non-finite y → null')
  eq(anchorFromPreviewPoint(10, 10, NaN, H), null, 'corner: non-finite box → null')
}

console.log(`PASS: screenshotWatermark R45.G — ${passed} total assertions (incl. clickable preview corner → anchor)`)

// --- R46.G: continuous drag-to-place the anchor ---
{
  const W = 158, H = 92
  // crossing into a new quadrant returns the new anchor.
  eq(nextAnchorOnDrag('top-left', 150, 10, W, H), 'top-right', 'drag: TL → TR on crossing right')
  eq(nextAnchorOnDrag('top-left', 10, 85, W, H), 'bottom-left', 'drag: TL → BL on crossing down')
  eq(nextAnchorOnDrag('top-left', 150, 85, W, H), 'bottom-right', 'drag: TL → BR diagonal')
  // staying in the SAME quadrant returns the SAME anchor ref (no churn).
  {
    const cur = 'top-left'
    const r = nextAnchorOnDrag(cur, 12, 12, W, H)
    ok(r === cur, 'drag: same quadrant → same ref (skip redundant setState)')
    const r2 = nextAnchorOnDrag(cur, 40, 30, W, H) // still top-left quadrant
    ok(r2 === cur, 'drag: still-in-quadrant move → same ref')
  }
  // a degenerate box / non-finite point → current unchanged (bad event
  // never moves the anchor).
  {
    const cur = 'bottom-right'
    ok(nextAnchorOnDrag(cur, 10, 10, 0, H) === cur, 'drag: zero width → current unchanged')
    ok(nextAnchorOnDrag(cur, 10, 10, W, 0) === cur, 'drag: zero height → current unchanged')
    ok(nextAnchorOnDrag(cur, NaN, 10, W, H) === cur, 'drag: NaN x → current unchanged')
    ok(nextAnchorOnDrag(cur, 10, Infinity, W, H) === cur, 'drag: non-finite y → current unchanged')
  }
  // even with a junk `current`, a valid point still resolves to a real
  // anchor (so a corrupt store value self-heals on the first drag).
  eq(nextAnchorOnDrag('junk', 10, 10, W, H), 'top-left', 'drag: junk current + valid point → real anchor')
  // every drag result (when changed) is a valid anchor.
  for (const [x, y] of [[1, 1], [W - 1, 1], [1, H - 1], [W - 1, H - 1]]) {
    const r = nextAnchorOnDrag('top-left', x, y, W, H)
    ok(isValidWatermarkAnchor(r), `drag: (${x},${y}) → valid anchor`)
  }
  // midline bias matches anchorFromPreviewPoint (lower/right).
  eq(nextAnchorOnDrag('top-left', W / 2, H / 2, W, H), 'bottom-right', 'drag: dead-centre → bottom-right (shared midline bias)')
}

// R47.G — live ghost pill position during a caption drag
{
  const W = 158, H = 92
  // Mid-frame pointer → ghost centred there, no clamping needed.
  const mid = previewGhostPosition(80, 46, W, H)
  ok(mid && near(mid.x, 80, 'ghost: mid x') === undefined, 'ghost: tracks pointer x')
  near(mid.y, 46, 'ghost: tracks pointer y')
  eq(mid.anchor, 'bottom-right', 'ghost: mid → quadrant via shared map')
  // Pointer riding top-left edge → clamped to inset, not 0 (stays inside).
  const tl = previewGhostPosition(0, 0, W, H)
  ok(tl.x >= GHOST_INSET - 0.001 && tl.y >= GHOST_INSET - 0.001, 'ghost: top-left edge clamped to inset')
  eq(tl.anchor, 'top-left', 'ghost: top-left quadrant')
  // Pointer past bottom-right edge → clamped within frame.
  const br = previewGhostPosition(999, 999, W, H)
  ok(br.x <= W - GHOST_INSET + 0.001 && br.y <= H - GHOST_INSET + 0.001, 'ghost: bottom-right clamped')
  eq(br.anchor, 'bottom-right', 'ghost: bottom-right quadrant')
  // Degenerate box / non-finite point → null (caller hides the ghost).
  eq(previewGhostPosition(10, 10, 0, 0), null, 'ghost: zero box → null')
  eq(previewGhostPosition(NaN, 10, W, H), null, 'ghost: NaN point → null')
  // Tiny box: inset collapses to half-dim so centre stays in bounds.
  const tiny = previewGhostPosition(5, 5, 4, 4)
  ok(tiny.x >= 0 && tiny.x <= 4 && tiny.y >= 0 && tiny.y <= 4, 'ghost: tiny box stays in bounds')
}

// R48.G — ghost pill caption label (truncated content preview)
{
  eq(ghostPillLabel('Plasma'), 'Plasma', 'label: short name passthrough')
  eq(ghostPillLabel('  Quantum   Bloom  '), 'Quantum Bloom', 'label: trim + collapse whitespace')
  ok(ghostPillLabel('Supernova Galaxy Spiral').length <= GHOST_LABEL_MAX_LEN, 'label: default maxLen bounds it')
  ok(ghostPillLabel('Supernova Galaxy Spiral').endsWith('\u2026'), 'label: over-long ends with ellipsis')
  eq(ghostPillLabel(''), '', 'label: empty → blank pill')
  eq(ghostPillLabel('   '), '', 'label: whitespace → blank pill')
  eq(ghostPillLabel(null), '', 'label: null → blank pill')
  eq(ghostPillLabel(42), '', 'label: non-string → blank pill')
  eq(ghostPillLabel('Particles', { maxLen: 1 }), '\u2026', 'label: maxLen 1 → lone ellipsis')
  { const out = ghostPillLabel('x'.repeat(40), { maxLen: 8 }); ok(out.endsWith('\u2026') && out.length <= 8, 'label: custom maxLen truncates') }
}

// R49.G — ghostPillSubLabel: faint second line for a branded caption ghost
{
  eq(ghostPillSubLabel('Cake'), 'Cake', 'sub: short passthrough')
  eq(ghostPillSubLabel('  Cake · Jun 28  '), 'Cake · Jun 28', 'sub: trim + collapse')
  ok(ghostPillSubLabel('Cake Studio · Jun 28, 2026').length <= GHOST_SUB_LABEL_MAX_LEN, 'sub: default maxLen bounds it')
  ok(ghostPillSubLabel('Cake Studio · Jun 28, 2026').endsWith('\u2026'), 'sub: over-long ellipsis')
  eq(ghostPillSubLabel(''), '', 'sub: empty → blank (no second line)')
  eq(ghostPillSubLabel(null), '', 'sub: null → blank')
  eq(ghostPillSubLabel(42), '', 'sub: non-string → blank')
  ok(GHOST_SUB_LABEL_MAX_LEN > GHOST_LABEL_MAX_LEN, 'sub: sub-line budget wider than main label')
  { const o = ghostPillSubLabel('y'.repeat(30), { maxLen: 6 }); ok(o.endsWith('\u2026') && o.length <= 6, 'sub: custom maxLen truncates') }
}
console.log(`PASS: screenshotWatermark R46.G/R47.G/R48.G — ${passed} total assertions (incl. continuous drag-to-place + live ghost pill + ghost label)`)
