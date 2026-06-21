// wind: vector math + clamps + compass label + applyWind side-effect
// + named presets (Calm/Breeze/Gale/Storm) + matchesWindPreset.
import {
  windVector, applyWind, compassFor,
  clampIntensity, clampAzimuth, clampPitch,
  WIND_INTENSITY_MIN, WIND_INTENSITY_MAX,
  WIND_PRESETS, findWindPreset, matchesWindPreset,
} from './wind.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }

// --- clamps ---
eq(clampIntensity(2.5), 2.5, 'intensity in range')
eq(clampIntensity(-1), WIND_INTENSITY_MIN, 'intensity clamps below')
eq(clampIntensity(99), WIND_INTENSITY_MAX, 'intensity clamps above')
eq(clampIntensity(NaN), 0, 'intensity NaN → 0')

eq(clampAzimuth(180), 180, 'azimuth in range')
eq(clampAzimuth(-5), 0, 'azimuth clamps below 0')
eq(clampAzimuth(500), 360, 'azimuth clamps above 360')

eq(clampPitch(45), 45, 'pitch in range')
eq(clampPitch(-180), -90, 'pitch clamps below -90')
eq(clampPitch(180), 90, 'pitch clamps above 90')

// --- windVector ---
{
  // Zero intensity → exact zero vector.
  const v = windVector(123, 45, 0)
  eq(v[0], 0, 'zero intensity x'); eq(v[1], 0, 'zero intensity y'); eq(v[2], 0, 'zero intensity z')
}
{
  // Azimuth 0, pitch 0, intensity 1 → unit vector on +X.
  const v = windVector(0, 0, 1)
  near(v[0], 1, 'azim 0 → +X x'); near(v[1], 0, 'azim 0 → +X y'); near(v[2], 0, 'azim 0 → +X z')
}
{
  // Azimuth 90, pitch 0 → +Z axis (math.sin(π/2) = 1).
  const v = windVector(90, 0, 1)
  near(v[0], 0, 'azim 90 → +Z x'); near(v[1], 0, 'azim 90 → +Z y'); near(v[2], 1, 'azim 90 → +Z z')
}
{
  // Pure pitch 90 → straight up (Y axis).
  const v = windVector(0, 90, 1)
  near(v[1], 1, 'pitch 90 → +Y y')
  near(v[0], 0, 'pitch 90 → no x')
  near(v[2], 0, 'pitch 90 → no z')
}
{
  // Intensity scales the magnitude proportionally.
  const v = windVector(0, 0, 3.5)
  near(v[0], 3.5, 'intensity scales x')
}
{
  // Out-of-range intensity clamps (would otherwise infect later math).
  const v = windVector(0, 0, 999)
  near(v[0], WIND_INTENSITY_MAX, 'intensity clamps via vector')
}

// --- applyWind: mutates target in place ---
{
  const t = { x: 1, y: 2, z: 3 }
  applyWind(t, [1, 0, 0], 0.5)
  near(t.x, 1.5, 'applyWind adds wind*dt to x')
  near(t.y, 2,   'applyWind leaves y alone when windY=0')
}
{
  // Zero-vector wind → fast path: target untouched.
  const t = { x: 1, y: 2, z: 3 }
  applyWind(t, [0, 0, 0], 0.5)
  eq(t.x, 1, 'zero wind: x unchanged')
  eq(t.y, 2, 'zero wind: y unchanged')
  eq(t.z, 3, 'zero wind: z unchanged')
}
{
  // null wind is harmless.
  const t = { x: 1, y: 2, z: 3 }
  applyWind(t, null, 0.5)
  eq(t.x, 1, 'null wind: target unchanged')
}

// --- compassFor ---
eq(compassFor(0),   'E',  'compass 0 → E')
eq(compassFor(45),  'SE', 'compass 45 → SE')
eq(compassFor(90),  'S',  'compass 90 → S')
eq(compassFor(180), 'W',  'compass 180 → W')
eq(compassFor(270), 'N',  'compass 270 → N')
eq(compassFor(359), 'E',  'compass 359 → E (wrap)')

// --- WIND_PRESETS basic sanity ---
{
  const ids = WIND_PRESETS.map(p => p.id)
  if (ids.length !== 4) fail(`expected 4 wind presets, got ${ids.length}`)
  if (new Set(ids).size !== 4) fail('preset ids must be unique')
  // Every preset must lie within the clamp ranges (the chips MUST NOT
  // silently violate the slider min/max).
  for (const p of WIND_PRESETS) {
    if (p.intensity < WIND_INTENSITY_MIN || p.intensity > WIND_INTENSITY_MAX)
      fail(`preset ${p.id} intensity out of range`)
    if (p.azimuth < 0 || p.azimuth > 360)
      fail(`preset ${p.id} azimuth out of range`)
    if (p.pitch < -90 || p.pitch > 90)
      fail(`preset ${p.id} pitch out of range`)
    if (!p.label) fail(`preset ${p.id} missing label`)
  }
  // Ordering: calmest first, wildest last — UI reads left-to-right.
  for (let i = 1; i < WIND_PRESETS.length; i++) {
    if (WIND_PRESETS[i].intensity < WIND_PRESETS[i - 1].intensity)
      fail(`presets out of order: ${WIND_PRESETS[i - 1].id} > ${WIND_PRESETS[i].id}`)
  }
}

// --- findWindPreset ---
eq(findWindPreset('calm').id,  'calm',  'find: calm')
eq(findWindPreset('storm').id, 'storm', 'find: storm')
eq(findWindPreset('nope'),     null,    'find: unknown → null')
eq(findWindPreset(null),       null,    'find: non-string → null')
eq(findWindPreset(42),         null,    'find: numeric → null')

// --- matchesWindPreset ---
{
  const calm = findWindPreset('calm')
  if (!matchesWindPreset({ intensity: 0, azimuth: 0, pitch: 0 }, calm))
    fail('exact calm state should match calm preset')
  if (matchesWindPreset({ intensity: 2, azimuth: 0, pitch: 0 }, calm))
    fail('wrong intensity should NOT match calm preset')
}
{
  const storm = findWindPreset('storm')
  if (!matchesWindPreset({ intensity: 4.0, azimuth: 200, pitch: -25 }, storm))
    fail('exact storm state should match storm preset')
  // Tiny float jitter still matches.
  if (!matchesWindPreset({ intensity: 4.03, azimuth: 200.5, pitch: -25 }, storm))
    fail('storm state within tolerance should still match')
  // Way off → no match.
  if (matchesWindPreset({ intensity: 4.0, azimuth: 10, pitch: -25 }, storm))
    fail('wrong azimuth should NOT match storm preset')
}
// Null safety.
eq(matchesWindPreset(null, findWindPreset('calm')), false, 'matches: null state → false')
eq(matchesWindPreset({}, null),                     false, 'matches: null preset → false')

console.log(`PASS: wind — vector + clamps + compass + ${WIND_PRESETS.length} named presets · intensity ${WIND_INTENSITY_MIN}..${WIND_INTENSITY_MAX}`)
