// bgGradient: clamping + CSS string assembly.
import { clampAngle, buildGradientCss } from './bgGradient.js'

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

console.log('PASS: bgGradient clamp + css builder')
