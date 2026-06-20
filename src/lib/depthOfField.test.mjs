// depthOfField — clamp helpers + share-URL normalizer.
import {
  clampFocusDistance, clampFocalLength, clampBokehScale, normalizeDof,
  DOF_FOCUS_MIN, DOF_FOCUS_MAX,
  DOF_FOCAL_MIN, DOF_FOCAL_MAX,
  DOF_BOKEH_MIN, DOF_BOKEH_MAX,
} from './depthOfField.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- clampFocusDistance ---
near(clampFocusDistance(0.05), 0.05, 'in-range focus preserved')
eq(clampFocusDistance(-1), DOF_FOCUS_MIN, 'negative focus clamps to min')
eq(clampFocusDistance(99), DOF_FOCUS_MAX, 'huge focus clamps to max')
near(clampFocusDistance(NaN), 0.022, 'NaN focus → default 0.022')
near(clampFocusDistance(Infinity), 0.022, 'Infinity is non-finite → default')

// --- clampFocalLength ---
near(clampFocalLength(0.1), 0.1, 'in-range focal preserved')
eq(clampFocalLength(-0.5), DOF_FOCAL_MIN, 'negative focal clamps')
eq(clampFocalLength(5),    DOF_FOCAL_MAX, 'huge focal clamps')
near(clampFocalLength(NaN), 0.05, 'NaN focal → default 0.05')

// --- clampBokehScale ---
near(clampBokehScale(7), 7, 'in-range bokeh preserved')
eq(clampBokehScale(-3), DOF_BOKEH_MIN, 'negative bokeh clamps to 0')
eq(clampBokehScale(999), DOF_BOKEH_MAX, 'huge bokeh clamps to 20')
near(clampBokehScale(NaN), 4.0, 'NaN bokeh → default 4.0')

// --- normalizeDof — full struct round-trip ---
{
  const out = normalizeDof({
    enabled: true, focusDistance: 0.5, focalLength: 0.1, bokehScale: 6,
  })
  eq(out.enabled, true, 'enabled preserved')
  near(out.focusDistance, 0.5, 'focusDistance preserved')
  near(out.focalLength, 0.1, 'focalLength preserved')
  near(out.bokehScale, 6, 'bokehScale preserved')
}
{
  // Missing fields → defaults; out-of-range clamp; non-object input safe.
  const out = normalizeDof({ enabled: true, focusDistance: 999, focalLength: -1 })
  eq(out.enabled, true, 'enabled preserved on partial input')
  eq(out.focusDistance, DOF_FOCUS_MAX, 'focusDistance clamps above')
  eq(out.focalLength, DOF_FOCAL_MIN, 'focalLength clamps below')
  near(out.bokehScale, 4.0, 'bokehScale falls back to default when missing')
}
{
  const out = normalizeDof(null)
  eq(out.enabled, false, 'null input → safe defaults')
  near(out.focusDistance, 0.022, 'null → default focus')
  near(out.focalLength,   0.05, 'null → default focal')
  near(out.bokehScale,    4.0, 'null → default bokeh')
}
{
  // String / number garbage input still parses (used to be a TypeError).
  const out = normalizeDof('garbage')
  eq(out.enabled, false, 'string input → safe defaults')
}

console.log(`PASS: depthOfField — focus ${DOF_FOCUS_MIN}..${DOF_FOCUS_MAX}, focal ${DOF_FOCAL_MIN}..${DOF_FOCAL_MAX}, bokeh ${DOF_BOKEH_MIN}..${DOF_BOKEH_MAX}`)
