// framingGuides: aspect-ratio letterbox/pillarbox geometry + roster.
import {
  FRAMING_RATIOS, isValidFramingId, sanitizeFramingId, ratioForId,
  labelForId, nextFramingId, computeFramingBars, describeFraming,
} from './framingGuides.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`); else passed++ }
function near(a, b, m, eps = 0.01) { if (Math.abs(a - b) > eps) fail(`${m} — got ${a} expected ${b}`); else passed++ }

// --- roster integrity ---
ok(FRAMING_RATIOS.length >= 6, 'has a meaningful set of ratios')
eq(FRAMING_RATIOS[0].id, 'off', 'first entry is Off')
eq(FRAMING_RATIOS[0].ratio, null, 'Off has null ratio')
for (const r of FRAMING_RATIOS) {
  ok(typeof r.id === 'string' && r.id.length > 0, `ratio ${r.id} has an id`)
  ok(typeof r.label === 'string' && r.label.length > 0, `ratio ${r.id} has a label`)
  ok(r.ratio === null || (Number.isFinite(r.ratio) && r.ratio > 0), `ratio ${r.id} ratio valid`)
}
// Unique ids.
{
  const ids = new Set(FRAMING_RATIOS.map(r => r.id))
  eq(ids.size, FRAMING_RATIOS.length, 'all ids unique')
}

// --- validation / sanitize ---
eq(isValidFramingId('cine'), true, 'cine is valid')
eq(isValidFramingId('nope'), false, 'unknown invalid')
eq(sanitizeFramingId('square'), 'square', 'known id passes through')
eq(sanitizeFramingId('garbage'), 'off', 'junk → off')
eq(sanitizeFramingId(undefined), 'off', 'undefined → off')
eq(sanitizeFramingId(null), 'off', 'null → off')

// --- ratioForId / labelForId ---
near(ratioForId('wide'), 16 / 9, '16:9 ratio')
eq(ratioForId('off'), null, 'off ratio null')
eq(ratioForId('bogus'), null, 'unknown ratio null')
eq(labelForId('square'), '1:1', 'square label')
eq(labelForId('bogus'), 'Off', 'unknown label → Off')

// --- nextFramingId cycles through every entry once ---
{
  let id = FRAMING_RATIOS[0].id
  const seen = new Set()
  for (let i = 0; i < FRAMING_RATIOS.length; i++) {
    ok(!seen.has(id), `cycle visits ${id} exactly once`)
    seen.add(id)
    id = nextFramingId(id)
  }
  eq(id, FRAMING_RATIOS[0].id, 'cycle wraps to start')
  eq(seen.size, FRAMING_RATIOS.length, 'cycle covers all entries')
  eq(nextFramingId('unknown'), FRAMING_RATIOS[0].id, 'unknown → first')
}

// --- computeFramingBars: pillarbox (viewport wider than target) ---
{
  // 1920x1080 (16:9 ~1.778) into a 1:1 frame → pillarbox.
  const b = computeFramingBars(1920, 1080, 1)
  eq(b.mode, 'pillarbox', 'wide viewport into square → pillarbox')
  near(b.frameW, 1080, 'square frame width = height')
  near(b.frameH, 1080, 'frame height unchanged')
  near(b.bar, (1920 - 1080) / 2, 'pillar bar thickness')
  near(b.frameX, b.bar, 'frame x = bar')
  near(b.frameY, 0, 'frame y 0 for pillarbox')
}

// --- letterbox (viewport taller than target) ---
{
  // 1080x1920 (portrait) into 16:9 → letterbox.
  const b = computeFramingBars(1080, 1920, 16 / 9)
  eq(b.mode, 'letterbox', 'tall viewport into wide → letterbox')
  near(b.frameW, 1080, 'frame width unchanged')
  near(b.frameH, 1080 / (16 / 9), 'letterbox frame height')
  near(b.bar, (1920 - 1080 / (16 / 9)) / 2, 'letter bar thickness')
  near(b.frameX, 0, 'frame x 0 for letterbox')
  near(b.frameY, b.bar, 'frame y = bar')
}

// --- perfect fit → no bars ---
{
  const b = computeFramingBars(1600, 900, 16 / 9)
  eq(b.mode, 'none', '16:9 viewport into 16:9 → no bars')
  near(b.bar, 0, 'no bar thickness')
}

// --- 2.39 cinemascope into a standard widescreen → letterbox ---
{
  const b = computeFramingBars(1920, 1080, 2.39)
  eq(b.mode, 'letterbox', '16:9 into 2.39 → letterbox (frame is wider/shorter)')
  near(b.frameH, 1920 / 2.39, 'cinemascope frame height')
  ok(b.bar > 0, 'cinemascope adds visible bars')
}

// --- defensive: bad dims / ratio ---
{
  eq(computeFramingBars(0, 100, 1).mode, 'none', 'zero width → none')
  eq(computeFramingBars(100, 0, 1).mode, 'none', 'zero height → none')
  eq(computeFramingBars(NaN, 100, 1).mode, 'none', 'NaN width → none')
  eq(computeFramingBars(100, 100, null).mode, 'none', 'null ratio → none')
  eq(computeFramingBars(100, 100, 0).mode, 'none', 'zero ratio → none')
  eq(computeFramingBars(100, 100, -2).mode, 'none', 'negative ratio → none')
  eq(computeFramingBars(100, 100, NaN).mode, 'none', 'NaN ratio → none')
  // Bars never go negative.
  const b = computeFramingBars(1920, 1080, 1)
  ok(b.bar >= 0, 'bar thickness never negative')
}

// --- bar symmetry: 2*bar + frame = viewport dimension ---
{
  const b = computeFramingBars(1920, 1080, 1) // pillarbox
  near(2 * b.bar + b.frameW, 1920, 'pillarbox bars + frame = viewport width')
  const c = computeFramingBars(1080, 1920, 16 / 9) // letterbox
  near(2 * c.bar + c.frameH, 1920, 'letterbox bars + frame = viewport height')
}

// --- describeFraming ---
{
  eq(describeFraming('off', 1920, 1080), '', 'off → empty description')
  const d = describeFraming('cine', 1920, 1080)
  ok(d.startsWith('2.39'), 'cine description leads with label')
  ok(/\d+x\d+/.test(d), 'cine description includes frame dims')
  // Perfect-fit ratio still shows the label (no dims since mode none).
  eq(describeFraming('wide', 1600, 900), '16:9', 'perfect-fit shows just the label')
}

// --- purity: roster not mutated by cycling ---
{
  const before = FRAMING_RATIOS.map(r => r.id).join(',')
  nextFramingId('square'); sanitizeFramingId('x'); computeFramingBars(10, 10, 1)
  const after = FRAMING_RATIOS.map(r => r.id).join(',')
  eq(before, after, 'roster order stable')
}

console.log(`PASS: framingGuides — ${passed} assertions (letterbox/pillarbox geometry, roster, cycle, describe)`)
