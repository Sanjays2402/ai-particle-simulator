// activeThemeBoot: resolveActiveTheme, pickBootTheme, applyThemeToElement.
import {
  DEFAULT_THEME_ID, NEON_CSS_VAR,
  resolveActiveTheme, pickBootTheme, applyThemeToElement,
} from './activeThemeBoot.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function ok(c, m) { if (!c) fail(m) }

const BUILTINS = {
  neon:  { neon: '#00ff88', hueShift: 0 },
  fire:  { neon: '#ff6600', hueShift: 30 },
  mono:  { neon: '#cccccc', hueShift: 0, saturation: 0 },
}
const CUSTOMS = [
  { id: 'custom-1', name: 'Sunrise', neon: '#fbbf24', hueShift: 45 },
  { id: 'custom-2', name: 'Grey',    neon: '#888888', hueShift: 0, saturation: 0 },
]

// --- constants exposed and stable ---
eq(DEFAULT_THEME_ID, 'neon', 'default theme id')
eq(NEON_CSS_VAR, '--neon', 'CSS variable name')

// --- resolveActiveTheme: built-in id ---
{
  const r = resolveActiveTheme('fire', BUILTINS, CUSTOMS)
  eq(r.id, 'fire', 'fire id preserved')
  eq(r.accent, '#ff6600', 'fire accent resolved')
  eq(r.hueShift, 30, 'fire hueShift')
  eq(r.saturation, 1, 'fire fully saturated by default')
}

// --- resolveActiveTheme: built-in with saturation:0 ---
{
  const r = resolveActiveTheme('mono', BUILTINS, CUSTOMS)
  eq(r.saturation, 0, 'mono saturation:0 preserved')
}

// --- resolveActiveTheme: custom theme by id ---
{
  const r = resolveActiveTheme('custom-1', BUILTINS, CUSTOMS)
  eq(r.id, 'custom-1', 'custom id preserved')
  eq(r.accent, '#fbbf24', 'custom accent resolved')
  eq(r.hueShift, 45, 'custom hueShift')
  eq(r.saturation, 1, 'custom fully saturated')
}

// --- resolveActiveTheme: custom theme with saturation:0 ---
{
  const r = resolveActiveTheme('custom-2', BUILTINS, CUSTOMS)
  eq(r.saturation, 0, 'custom grey saturation:0 preserved')
}

// --- resolveActiveTheme: unknown / null id → null ---
{
  eq(resolveActiveTheme('does-not-exist', BUILTINS, CUSTOMS), null, 'unknown id → null')
  eq(resolveActiveTheme(null, BUILTINS, CUSTOMS), null, 'null id → null')
  eq(resolveActiveTheme('', BUILTINS, CUSTOMS), null, 'empty id → null')
  eq(resolveActiveTheme(42, BUILTINS, CUSTOMS), null, 'number id → null')
}

// --- pickBootTheme: persisted built-in wins ---
{
  const r = pickBootTheme('fire', BUILTINS, CUSTOMS)
  eq(r.id, 'fire', 'persisted built-in applied')
  eq(r.accent, '#ff6600', 'fire accent applied')
  eq(r.fellBack, false, 'no fallback needed')
}

// --- pickBootTheme: persisted custom wins ---
{
  const r = pickBootTheme('custom-1', BUILTINS, CUSTOMS)
  eq(r.id, 'custom-1', 'persisted custom applied')
  eq(r.accent, '#fbbf24', 'custom accent applied')
  eq(r.fellBack, false, 'no fallback needed')
}

// --- pickBootTheme: deleted custom → falls back to default ---
{
  const r = pickBootTheme('custom-999', BUILTINS, CUSTOMS)
  eq(r.id, 'neon', 'falls back to neon default')
  eq(r.accent, '#00ff88', 'fallback accent applied')
  eq(r.fellBack, true, 'fellBack=true flagged')
}

// --- pickBootTheme: garbage persisted → falls back ---
{
  const r = pickBootTheme(null, BUILTINS, CUSTOMS)
  eq(r.id, 'neon', 'null persisted → fallback')
  eq(r.fellBack, true, 'fallback flagged')
  const r2 = pickBootTheme('', BUILTINS, CUSTOMS)
  eq(r2.id, 'neon', 'empty persisted → fallback')
  eq(r2.fellBack, true, 'fallback flagged')
}

// --- pickBootTheme: even the default missing → synthetic safe theme ---
{
  // If the built-ins map is empty (impossible in practice but
  // defended against), pickBootTheme synthesises a safe theme so
  // the app doesn't crash.
  const r = pickBootTheme('does-not-exist', {}, [])
  eq(r.id, 'neon', 'synthesised default id is neon')
  ok(typeof r.accent === 'string' && r.accent.length === 7, 'synthesised accent is hex')
  eq(r.fellBack, true, 'fellBack flagged')
}

// --- applyThemeToElement writes to the CSS variable ---
{
  const writes = []
  const fakeEl = { style: { setProperty(k, v) { writes.push([k, v]) } } }
  const theme = { id: 'custom-1', accent: '#fbbf24', hueShift: 45, saturation: 1 }
  ok(applyThemeToElement(theme, fakeEl), 'apply returns true')
  eq(writes.length, 1, '1 CSS write')
  eq(writes[0][0], NEON_CSS_VAR, 'writes --neon')
  eq(writes[0][1], '#fbbf24', 'writes accent value')
}

// --- applyThemeToElement bails on bad inputs ---
{
  eq(applyThemeToElement(null, { style: { setProperty() {} } }), false, 'null theme → false')
  eq(applyThemeToElement({ accent: 123 }, { style: { setProperty() {} } }), false, 'non-string accent → false')
  eq(applyThemeToElement({ accent: '#fff' }, null), false, 'null element → false')
  eq(applyThemeToElement({ accent: '#fff' }, {}), false, 'element without style → false')
  eq(applyThemeToElement({ accent: '#fff' }, { style: {} }), false, 'style without setProperty → false')
}

console.log('PASS: activeThemeBoot — resolve (builtin/custom/saturation:0/unknown), pickBootTheme (builtin/custom/deleted/garbage/synthetic), applyThemeToElement (write + bad-input bailouts)')
