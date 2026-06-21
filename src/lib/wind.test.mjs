// wind: vector math + clamps + compass label + applyWind side-effect
// + named presets (Calm/Breeze/Gale/Storm) + matchesWindPreset
// + custom-overrides (R11.04: long-press a chip to save sliders).
import {
  windVector, applyWind, compassFor,
  clampIntensity, clampAzimuth, clampPitch,
  WIND_INTENSITY_MIN, WIND_INTENSITY_MAX,
  WIND_PRESETS, WIND_PRESETS_DEFAULT,
  findWindPreset, matchesWindPreset,
  sanitizeWindOverrides, captureWindOverride, resolveWindPresets,
  setWindOverride, clearWindOverride, isWindPresetCustom,
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

// --- Custom overrides (R11.04) ---
// sanitizeWindOverrides drops unknown keys + clamps values.
{
  const dirty = {
    storm:   { intensity: 99,  azimuth: 999, pitch: -999 },
    bogus:   { intensity: 1,   azimuth: 0,   pitch: 0   },
    breeze:  { intensity: NaN, azimuth: 'x', pitch: undefined },
    junkRow: 42,
  }
  const clean = sanitizeWindOverrides(dirty)
  if ('bogus' in clean)   fail('sanitize: unknown id should be dropped')
  if ('junkRow' in clean) fail('sanitize: non-object entry should be dropped')
  eq(clean.storm.intensity, WIND_INTENSITY_MAX, 'sanitize: clamps intensity')
  eq(clean.storm.azimuth,   360,                'sanitize: clamps azimuth')
  eq(clean.storm.pitch,     -90,                'sanitize: clamps pitch')
  eq(clean.breeze.intensity, 0, 'sanitize: NaN intensity → 0')
  eq(clean.breeze.azimuth,   0, 'sanitize: non-number azimuth → 0')
  eq(clean.breeze.pitch,     0, 'sanitize: undefined pitch → 0')
}
// captureWindOverride snapshots the three knobs from a state-like object.
{
  const snap = captureWindOverride({ intensity: 2.5, azimuth: 180, pitch: 45 })
  eq(snap.intensity, 2.5, 'capture: intensity copied')
  eq(snap.azimuth,   180, 'capture: azimuth copied')
  eq(snap.pitch,     45,  'capture: pitch copied')
  // Out-of-range values get clamped at capture time too.
  const out = captureWindOverride({ intensity: -2, azimuth: 999, pitch: 999 })
  eq(out.intensity, 0,   'capture: clamps intensity below')
  eq(out.azimuth,   360, 'capture: clamps azimuth above')
  eq(out.pitch,     90,  'capture: clamps pitch above')
}
// setWindOverride + clearWindOverride return fresh sanitized maps.
{
  const base = {}
  const next = setWindOverride(base, 'gale', { intensity: 1.5, azimuth: 90, pitch: 0 })
  eq(next.gale.intensity, 1.5, 'set: gale stored')
  if (base.gale) fail('set: original map should not be mutated')
  const cleared = clearWindOverride(next, 'gale')
  if (cleared.gale) fail('clear: gale should be gone')
  eq(Object.keys(cleared).length, 0, 'clear: map back to empty')
}
// resolveWindPresets mutates WIND_PRESETS in place AND returns it.
{
  // Establish a known-good baseline first.
  resolveWindPresets({})
  // Snapshot the default Gale so we can prove the override changed it.
  const baseGale = WIND_PRESETS_DEFAULT.find(p => p.id === 'gale')
  eq(findWindPreset('gale').intensity, baseGale.intensity, 'resolve: default Gale intensity intact')
  // Apply an override and re-resolve.
  const list = resolveWindPresets({ gale: { intensity: 0.5, azimuth: 10, pitch: 0 } })
  if (list !== WIND_PRESETS) fail('resolve: should return the live WIND_PRESETS array')
  eq(WIND_PRESETS.find(p => p.id === 'gale').intensity, 0.5, 'resolve: Gale now overridden')
  // Calm/Breeze/Storm untouched.
  eq(WIND_PRESETS.find(p => p.id === 'calm').intensity, 0.0, 'resolve: Calm untouched')
  eq(WIND_PRESETS.find(p => p.id === 'storm').intensity, 4.0, 'resolve: Storm untouched')
  // isWindPresetCustom flag tracks the override map (not the live list).
  eq(isWindPresetCustom('gale', { gale: { intensity: 0.5, azimuth: 0, pitch: 0 } }), true,  'custom flag: yes')
  eq(isWindPresetCustom('gale', {}),                                                  false, 'custom flag: no')
  // Reset for any downstream tests / future runs.
  resolveWindPresets({})
  eq(findWindPreset('gale').intensity, baseGale.intensity, 'resolve: reset restores defaults')
}
// matchesWindPreset uses the LIVE preset list, so an overridden Gale
// matches the user's new values — not the original 2.2 intensity.
{
  resolveWindPresets({ gale: { intensity: 0.5, azimuth: 10, pitch: 0 } })
  const liveGale = findWindPreset('gale')
  if (!matchesWindPreset({ intensity: 0.5, azimuth: 10, pitch: 0 }, liveGale))
    fail('matches: overridden Gale should match the overridden values')
  if (matchesWindPreset({ intensity: 2.2, azimuth: 90, pitch: 0 }, liveGale))
    fail('matches: original Gale values should NOT match an overridden Gale chip')
  resolveWindPresets({})
}

console.log(`PASS: wind — vector + clamps + compass + ${WIND_PRESETS.length} named presets + custom overrides · intensity ${WIND_INTENSITY_MIN}..${WIND_INTENSITY_MAX}`)
