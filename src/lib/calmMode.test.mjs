// calmMode: global "calm mode" master gate over the ambient camera/colour
// motions (R36.K). Run via: node --test src/lib/calmMode.test.mjs
import {
  CALM_GATED_MOTIONS, resolveCalm, describeCalmState, formatCalmToast,
  CALM_MOTION_IDS, defaultCalmGates, sanitizeCalmGates, toggleCalmGate,
  resolveCalmFor, countGatedMotions,
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

// --- R38.K: per-motion calm gating ---
{
  // CALM_MOTION_IDS mirrors the roster ids exactly.
  eq(CALM_MOTION_IDS.length, 4, 'four motion ids')
  for (const m of CALM_GATED_MOTIONS) ok(CALM_MOTION_IDS.includes(m.id), `roster id ${m.id} in CALM_MOTION_IDS`)

  // defaultCalmGates: every motion gated (true), fresh object each call.
  const d = defaultCalmGates()
  for (const id of CALM_MOTION_IDS) eq(d[id], true, `default gates ${id} on`)
  ok(defaultCalmGates() !== defaultCalmGates(), 'fresh default object each call')

  // sanitizeCalmGates: completes a partial map (missing keys default to
  // gated=true), drops unknown keys, coerces values to bool.
  {
    const s = sanitizeCalmGates({ autoRotate: false })
    eq(s.autoRotate, false, 'explicit false preserved')
    eq(s.cameraShake, true, 'missing key defaults to gated (true)')
    eq(s.hueCycle, true, 'missing key hueCycle defaults true')
    eq(s.zenOrbit, true, 'missing key zenOrbit defaults true')
    eq(Object.keys(s).sort().join(','), [...CALM_MOTION_IDS].sort().join(','), 'only known keys present')
  }
  eq(sanitizeCalmGates({ autoRotate: 0, hueCycle: 1 }).autoRotate, false, 'falsy coerces to false')
  eq(sanitizeCalmGates({ autoRotate: 0, hueCycle: 1 }).hueCycle, true, 'truthy coerces to true')
  eq(sanitizeCalmGates({ bogus: true }).autoRotate, true, 'unknown key ignored, defaults applied')
  ok(!('bogus' in sanitizeCalmGates({ bogus: true })), 'unknown key dropped')
  // Non-object → all-true default.
  for (const bad of [null, undefined, 'x', 42, []]) {
    const s = sanitizeCalmGates(bad)
    eq(countGatedMotions(s), 4, `non-object ${JSON.stringify(bad)} → all gated`)
  }

  // toggleCalmGate: flips one, fresh object, never mutates input.
  {
    const before = defaultCalmGates()
    const after = toggleCalmGate(before, 'hueCycle')
    eq(after.hueCycle, false, 'toggle flips hueCycle off')
    eq(before.hueCycle, true, 'input not mutated by toggle')
    eq(after.autoRotate, true, 'other gates untouched')
    eq(toggleCalmGate(after, 'hueCycle').hueCycle, true, 'toggling again flips back on')
    // Unknown id → no flip (but still a sanitised fresh map).
    const noop = toggleCalmGate(before, 'bogus')
    eq(countGatedMotions(noop), 4, 'unknown id toggles nothing')
  }

  // countGatedMotions.
  eq(countGatedMotions(defaultCalmGates()), 4, 'all gated → 4')
  eq(countGatedMotions({ autoRotate: false, cameraShake: false }), 2, 'two off → 2 (rest default on)')
  eq(countGatedMotions(sanitizeCalmGates({ autoRotate: false, cameraShake: false, hueCycle: false, zenOrbit: false })), 0, 'all off → 0')

  // resolveCalmFor: reduced ALWAYS suppresses regardless of gates.
  const allOff = { autoRotate: false, cameraShake: false, hueCycle: false, zenOrbit: false }
  for (const id of CALM_MOTION_IDS) {
    eq(resolveCalmFor(id, true, false, allOff), true, `${id}: reduced motion always suppresses (even with gate off)`)
    eq(resolveCalmFor(id, true, true, allOff), true, `${id}: reduced + calm always suppresses`)
  }
  // Calm OFF → never suppresses (gates irrelevant).
  for (const id of CALM_MOTION_IDS) eq(resolveCalmFor(id, false, false, defaultCalmGates()), false, `${id}: no calm, no reduced → not suppressed`)

  // Calm ON, default gates → suppresses every motion (== R36.K behaviour).
  for (const id of CALM_MOTION_IDS) eq(resolveCalmFor(id, false, true, defaultCalmGates()), true, `${id}: calm + default gates suppresses`)

  // Calm ON, a motion opted OUT → that motion runs, others still gated.
  {
    const keepHue = sanitizeCalmGates({ hueCycle: false })
    eq(resolveCalmFor('hueCycle', false, true, keepHue), false, 'opted-out hueCycle runs under calm')
    eq(resolveCalmFor('autoRotate', false, true, keepHue), true, 'autoRotate still gated')
    eq(resolveCalmFor('cameraShake', false, true, keepHue), true, 'cameraShake still gated')
    eq(resolveCalmFor('zenOrbit', false, true, keepHue), true, 'zenOrbit still gated')
  }

  // Unknown motion id under calm → fail safe to gated (true).
  eq(resolveCalmFor('bogus', false, true, defaultCalmGates()), true, 'unknown id under calm fails safe to gated')
  eq(resolveCalmFor('bogus', false, false, defaultCalmGates()), false, 'unknown id with calm off → not suppressed')

  // Back-compat invariant: with default gates, resolveCalmFor === resolveCalm
  // for every (reduced, calm) combo and every motion.
  for (const r of [false, true]) for (const c of [false, true]) for (const id of CALM_MOTION_IDS) {
    eq(resolveCalmFor(id, r, c, defaultCalmGates()), resolveCalm(r, c),
      `default gates: resolveCalmFor(${id},${r},${c}) === resolveCalm(${r},${c})`)
  }

  // Defensive: missing gates arg → treated as all-true default.
  eq(resolveCalmFor('autoRotate', false, true), true, 'no gates arg → default all-gated')
}

console.log(`PASS: calmMode R38.K — ${passed} total assertions (incl. per-motion gating)`)
