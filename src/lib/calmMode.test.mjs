// calmMode: global "calm mode" master gate over the ambient camera/colour
// motions (R36.K). Run via: node --test src/lib/calmMode.test.mjs
import {
  CALM_GATED_MOTIONS, resolveCalm, describeCalmState, formatCalmToast,
} from './calmMode.js'

let passed = 0
function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function ok(cond, m) { if (!cond) fail(m); else passed++ }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); else passed++ }

// --- roster integrity ---
ok(CALM_GATED_MOTIONS.length === 4, 'gates four motions')
{
  const ids = new Set(CALM_GATED_MOTIONS.map(m => m.id))
  eq(ids.size, CALM_GATED_MOTIONS.length, 'motion ids unique')
  ok(ids.has('autoRotate') && ids.has('cameraShake') && ids.has('hueCycle') && ids.has('zenOrbit'),
    'roster covers auto-rotate / shake / hue-cycle / zen-orbit')
  for (const m of CALM_GATED_MOTIONS) {
    ok(typeof m.label === 'string' && m.label.length > 0, `motion ${m.id} has a label`)
  }
}

// --- resolveCalm: OR of reduced-motion + calm mode ---
eq(resolveCalm(false, false), false, 'neither → not suppressed')
eq(resolveCalm(false, true), true, 'calm on → suppressed')
eq(resolveCalm(true, false), true, 'reduced-motion on → suppressed')
eq(resolveCalm(true, true), true, 'both on → suppressed')
// calm mode can only ADD suppression — never re-enable when reduced is on.
eq(resolveCalm(true, false), resolveCalm(true, true), 'reduced-on stays suppressed regardless of calm')

// --- resolveCalm coercion / defensive ---
eq(resolveCalm(undefined, undefined), false, 'undefined args → false')
eq(resolveCalm(null, null), false, 'null args → false')
eq(resolveCalm(0, 0), false, 'falsy numbers → false')
eq(resolveCalm(1, 0), true, 'truthy number reduced → true')
eq(resolveCalm(0, 'yes'), true, 'truthy string calm → true')
eq(resolveCalm({}, false), true, 'truthy object reduced coerces to true (no leak)')
ok(resolveCalm(false, {}) === true, 'truthy object calm coerces to a real boolean')

// --- describeCalmState ---
{
  const none = describeCalmState(false, false)
  eq(none.active, false, 'none: inactive')
  eq(none.source, 'none', 'none: source none')
  eq(none.count, 0, 'none: zero count')
  eq(none.motions.length, 0, 'none: no motions listed')

  const calm = describeCalmState(false, true)
  eq(calm.active, true, 'calm: active')
  eq(calm.source, 'calm', 'calm-only: source calm')
  eq(calm.count, 4, 'calm: all four gated')
  eq(calm.motions.length, 4, 'calm: four motion ids listed')

  const reduced = describeCalmState(true, false)
  eq(reduced.active, true, 'reduced: active')
  eq(reduced.source, 'reduced-motion', 'reduced-only: source reduced-motion')
  eq(reduced.count, 4, 'reduced: all four gated')

  // When BOTH are on, calm is credited first (the user-flipped switch).
  const both = describeCalmState(true, true)
  eq(both.active, true, 'both: active')
  eq(both.source, 'calm', 'both: calm credited first')
  eq(both.count, 4, 'both: four gated')
}

// --- purity: fresh object + array each call, no shared mutation ---
{
  const a = describeCalmState(false, true)
  const b = describeCalmState(false, true)
  ok(a !== b, 'fresh object each call')
  ok(a.motions !== b.motions, 'fresh motions array each call')
  a.motions.push('tamper')
  eq(describeCalmState(false, true).motions.length, 4, 'mutating a result does not corrupt the roster')
  eq(CALM_GATED_MOTIONS.length, 4, 'roster itself untouched by callers')
}

console.log(`PASS: calmMode — ${passed} assertions (R36.K master gate over auto-rotate / shake / hue-cycle / zen-orbit)`)

// --- R37.K: formatCalmToast ---
{
  const on = formatCalmToast(true)
  eq(on.count, 4, 'turning on: four motions named')
  eq(on.title, 'Calmed 4 motions', 'turning on: headline counts motions')
  // Detail names every gated motion's label, so the toast is legible.
  for (const m of CALM_GATED_MOTIONS) {
    ok(on.detail.includes(m.label), `detail names "${m.label}"`)
  }
  // Oxford "&" joins the last item; with 4 items there are commas + an &.
  ok(on.detail.includes('&'), 'detail joins the last label with &')
  ok(on.detail.includes(','), 'detail comma-separates the first labels')

  const off = formatCalmToast(false)
  eq(off.title, 'Motion resumed', 'turning off: resumed headline')
  eq(off.count, 4, 'turning off: still reports the gated count')
  eq(off.detail, on.detail, 'detail list is the same set on/off')

  // Falsy / coerced args resolve cleanly (turningOn is read as boolean).
  eq(formatCalmToast(0).title, 'Motion resumed', 'falsy arg → resumed')
  eq(formatCalmToast(1).title, 'Calmed 4 motions', 'truthy arg → calmed')
  eq(formatCalmToast(undefined).title, 'Motion resumed', 'undefined → resumed')

  // Purity: fresh object each call; mutating a result can't corrupt the
  // roster the next call reads from.
  const a = formatCalmToast(true)
  const b = formatCalmToast(true)
  ok(a !== b, 'fresh object each call')
  a.title = 'tamper'
  eq(formatCalmToast(true).title, 'Calmed 4 motions', 'mutating a result does not affect later calls')
  eq(CALM_GATED_MOTIONS.length, 4, 'roster untouched by formatCalmToast')
}

console.log(`PASS: calmMode R37.K — ${passed} total assertions (incl. formatCalmToast)`)
