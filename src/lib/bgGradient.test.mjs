// bgGradient: clamping + CSS string assembly + audio-reactive hue.
import {
  clampAngle, buildGradientCss,
  clampHueReactiveStrength, pickAudioSignal, computeReactiveHueDeg,
  buildHueFilterCss, HUE_REACTIVE_MAX_DEG,
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

console.log('PASS: bgGradient clamp + css builder + audio-reactive hue helpers')
