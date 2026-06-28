// screenshotWatermark: caption builder + anchor roster + font sizing +
// placement geometry for the baked-in screenshot caption (R42.G).
import {
  WATERMARK_ANCHORS, WATERMARK_ANCHOR_DEFAULT,
  isValidWatermarkAnchor, sanitizeWatermarkAnchor, nextWatermarkAnchor,
  WATERMARK_MAX_LEN, buildWatermarkText,
  WATERMARK_FONT_MIN, WATERMARK_FONT_MAX, watermarkFontSize,
  watermarkPlacement,
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
