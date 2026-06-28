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
