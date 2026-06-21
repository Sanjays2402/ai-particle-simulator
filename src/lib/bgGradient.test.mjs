// bgGradient: clamping + CSS string assembly + audio-reactive hue.
import {
  clampAngle, buildGradientCss,
  clampHueReactiveStrength, pickAudioSignal, computeReactiveHueDeg,
  buildHueFilterCss, HUE_REACTIVE_MAX_DEG,
  REACTIVE_CURVES, REACTIVE_CURVE_DEFAULT,
  isValidReactiveCurve, normalizeReactiveCurve, shapeReactiveSignal,
} from './bgGradient.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }

// Clamp range.
eq(clampAngle(0), 0, 'min stays at min')
eq(clampAngle(360), 360, 'max stays at max')
eq(clampAngle(180), 180, 'middle stays unchanged')

// Out-of-range collapses.
eq(clampAngle(-50), 0, 'negative clamped to 0')
eq(clampAngle(999), 360, 'large clamped to 360')

// Non-finite degrades to a safe fallback (0). Infinity is NOT finite,
// so it falls into the same bucket as NaN — never trust a wild value.
eq(clampAngle(NaN), 0, 'NaN → 0')
eq(clampAngle(Infinity), 0, 'Infinity → 0 (non-finite fallback)')
eq(clampAngle(-Infinity), 0, '-Infinity → 0 (non-finite fallback)')

// Truncates to integer (CSS only ever needs integer degrees).
eq(clampAngle(180.7), 180, 'fractional truncated to int')

// CSS builder uses clamped angle + literal stops.
eq(
  buildGradientCss(180, '#000', '#fff'),
  'linear-gradient(180deg, #000 0%, #fff 100%)',
  'css matches contract'
)
eq(
  buildGradientCss(-90, '#abc', '#def'),
  'linear-gradient(0deg, #abc 0%, #def 100%)',
  'css uses clamped angle'
)

// --- audio-reactive helpers ---
// Strength clamp
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
eq(clampHueReactiveStrength(0.5), 0.5, 'strength in-range preserved')
eq(clampHueReactiveStrength(-1), 0, 'strength clamps below 0')
eq(clampHueReactiveStrength(2), 1, 'strength clamps above 1')
eq(clampHueReactiveStrength(NaN), 0.5, 'strength NaN → default 0.5')
eq(clampHueReactiveStrength(Infinity), 0.5, 'strength Infinity → default')

// Signal picker
eq(pickAudioSignal('level', { level: 0.4, bass: 0.7, beat: 0.1 }), 0.4, 'level picks level')
eq(pickAudioSignal('bass',  { level: 0.4, bass: 0.7, beat: 0.1 }), 0.7, 'bass picks bass')
eq(pickAudioSignal('beat',  { level: 0.4, bass: 0.7, beat: 0.1 }), 0.1, 'beat picks beat')
eq(pickAudioSignal('level', null), 0, 'null levels safe → 0')
eq(pickAudioSignal('bass',  {}),   0, 'empty levels → 0')

// Hue deg curve
near(computeReactiveHueDeg(0, 1), -HUE_REACTIVE_MAX_DEG, 'silence + full strength → -max')
near(computeReactiveHueDeg(1, 1), HUE_REACTIVE_MAX_DEG,  'peak + full strength → +max')
near(computeReactiveHueDeg(0.5, 1), 0, 'mid signal + full strength → 0')
near(computeReactiveHueDeg(1, 0.5), HUE_REACTIVE_MAX_DEG / 2, 'half strength halves amplitude')
near(computeReactiveHueDeg(1, 0),   0, 'zero strength always 0')
near(computeReactiveHueDeg(NaN, 1), -HUE_REACTIVE_MAX_DEG, 'NaN signal → 0 internally')
// Out-of-range signal is clamped to 0..1.
near(computeReactiveHueDeg(2, 1),  HUE_REACTIVE_MAX_DEG, 'signal >1 clamps to 1')
near(computeReactiveHueDeg(-1, 1), -HUE_REACTIVE_MAX_DEG, 'signal <0 clamps to 0')

// CSS filter string
eq(buildHueFilterCss(0), '', 'zero deg → empty string (filter no-op)')
eq(buildHueFilterCss(0.005), '', 'tiny rotation skipped (under eps)')
eq(buildHueFilterCss(45), 'hue-rotate(45.00deg)', '45 deg formatted')
eq(buildHueFilterCss(-30.5), 'hue-rotate(-30.50deg)', 'negative formatted')
eq(buildHueFilterCss(NaN), '', 'NaN → empty string')

// --- R12.03 curve presets ---
// Roster + validation.
eq(REACTIVE_CURVES.length, 4, 'four curve presets shipped')
eq(REACTIVE_CURVE_DEFAULT, 'linear', 'default is linear (matches historic behaviour)')
eq(isValidReactiveCurve('pulse'), true, 'pulse is valid')
eq(isValidReactiveCurve('linear'), true, 'linear is valid')
eq(isValidReactiveCurve('ramp'), true, 'ramp is valid')
eq(isValidReactiveCurve('hold'), true, 'hold is valid')
eq(isValidReactiveCurve('bogus'), false, 'unknown id rejected')
eq(isValidReactiveCurve(42), false, 'non-string rejected')
eq(normalizeReactiveCurve('pulse'), 'pulse', 'valid id passes through')
eq(normalizeReactiveCurve(null), 'linear', 'null falls to default')
eq(normalizeReactiveCurve('bogus'), 'linear', 'unknown falls to default')

// shapeReactiveSignal contracts: each curve maps [0, 1] → [0, 1],
// fixed points at 0 and 1 (so the silence-neutral + peak-max contract
// is preserved through every preset).
for (const id of ['linear', 'pulse', 'ramp', 'hold']) {
  near(shapeReactiveSignal(0, id), id === 'hold' ? 0.5 : 0, `${id}: 0 → 0 (hold neutralises)`)
  near(shapeReactiveSignal(1, id), 1, `${id}: 1 → 1`)
  // Output always clamped to [0, 1].
  const mid = shapeReactiveSignal(0.5, id)
  if (mid < 0 || mid > 1) fail(`${id} mid out of range: ${mid}`)
}
// Linear is a strict pass-through.
near(shapeReactiveSignal(0.3, 'linear'), 0.3, 'linear pass-through')
near(shapeReactiveSignal(0.7, 'linear'), 0.7, 'linear pass-through (upper)')
// Pulse is symmetric about 0.5 (so neutral stays neutral) and pulls
// values away from the midpoint as you move toward extremes.
near(shapeReactiveSignal(0.5, 'pulse'), 0.5, 'pulse symmetric: 0.5 → 0.5')
const pulseHi = shapeReactiveSignal(0.75, 'pulse')
const pulseLo = shapeReactiveSignal(0.25, 'pulse')
if (pulseHi <= 0.75) fail(`pulse should amplify upper half (got ${pulseHi})`)
if (pulseLo >= 0.25) fail(`pulse should amplify lower half (got ${pulseLo})`)
near(pulseHi + pulseLo, 1, 'pulse symmetric around 0.5', 1e-9)
// Ramp is monotonic ease-in: small input → smaller output, large input
// → closer to 1.
if (shapeReactiveSignal(0.5, 'ramp') >= 0.5) fail('ramp should ease in (mid below 0.5)')
near(shapeReactiveSignal(0.5, 'ramp'), 0.125, 'ramp 0.5 → 0.125 (cubic)')
// Hold stays at neutral until past 0.5, then ramps linearly to 1.
near(shapeReactiveSignal(0.25, 'hold'), 0.5, 'hold: below 0.5 → 0.5')
near(shapeReactiveSignal(0.5, 'hold'),  0.5, 'hold: exactly 0.5 → 0.5')
near(shapeReactiveSignal(0.75, 'hold'), 0.75, 'hold: 0.75 → 0.75 (linear from 0.5)')
near(shapeReactiveSignal(1, 'hold'),    1, 'hold: 1 → 1')
// Unknown curve id falls back to linear (matches normalizeReactiveCurve).
near(shapeReactiveSignal(0.4, 'bogus'), 0.4, 'unknown curve → linear pass-through')
// NaN input is treated as 0 internally.
near(shapeReactiveSignal(NaN, 'ramp'), 0, 'NaN → 0 through ramp (cubic of 0)')

// computeReactiveHueDeg respects the curve: pulse stretches the
// 0.75 input AWAY from neutral, so the resulting hue swing > linear.
const linearDeg = computeReactiveHueDeg(0.75, 1, 'linear')
const pulseDeg  = computeReactiveHueDeg(0.75, 1, 'pulse')
if (pulseDeg <= linearDeg) fail(`pulse should swing further than linear at 0.75 (linear=${linearDeg}, pulse=${pulseDeg})`)
// Hold + signal below 0.5 → 0 deg (held at neutral).
near(computeReactiveHueDeg(0.3, 1, 'hold'), 0, 'hold below 0.5 → 0 deg')
// Backwards compat: missing curve arg = linear behaviour.
near(computeReactiveHueDeg(0.5, 1), 0, 'no curve arg = linear (mid → 0)')

console.log('PASS: bgGradient clamp + css builder + audio-reactive hue helpers')
