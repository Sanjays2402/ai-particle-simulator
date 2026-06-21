// customThemes: validation + load/save + resolve.
import {
  isValidHex, clampHueShift, sanitizeName, normalizeTheme,
  loadThemes, saveThemes, nextThemeId, addTheme, removeTheme, resolveTheme,
  CUSTOM_THEMES_KEY, MAX_CUSTOM_THEMES, BUILTIN_THEME_IDS,
} from './customThemes.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }
function deep(a, b, m) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b)
  if (sa !== sb) fail(`${m} — got ${sa} expected ${sb}`)
}

// In-memory storage stub so we don't poison the dev's real localStorage.
function makeStore() {
  const m = new Map()
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, v) },
    removeItem: (k) => { m.delete(k) },
    _dump: () => Object.fromEntries(m),
  }
}

// --- isValidHex ---
eq(isValidHex('#a855f7'), true,  'valid hex passes')
eq(isValidHex('#A855F7'), true,  'uppercase hex passes')
eq(isValidHex('a855f7'),  false, 'missing # fails')
eq(isValidHex('#a85'),    false, 'short hex fails')
eq(isValidHex('#zzzzzz'), false, 'non-hex fails')
eq(isValidHex(null),      false, 'null fails')

// --- clampHueShift ---
eq(clampHueShift(45),    45,   'in-range preserved')
eq(clampHueShift(-720), -360,  'clamps below -360')
eq(clampHueShift(999),   360,  'clamps above 360')
eq(clampHueShift(NaN),   0,    'NaN → 0')
eq(clampHueShift(45.7),  45,   'rounds toward zero (integer)')

// --- sanitizeName ---
eq(sanitizeName('  hi  '), 'hi', 'trims whitespace')
eq(sanitizeName(''), 'Custom', 'empty → Custom')
eq(sanitizeName(null), 'Custom', 'null → Custom')
const big = 'x'.repeat(64)
eq(sanitizeName(big).length, 32, 'caps at THEME_NAME_MAX')

// --- normalizeTheme ---
eq(normalizeTheme(null), null, 'null → null')
eq(normalizeTheme({ id: 'neon' }), null, 'rejects built-in id')
eq(normalizeTheme({ id: 'bad', neon: '#fff' }), null, 'rejects non-custom prefix')
{
  const t = normalizeTheme({ id: 'custom-1', name: 'Hi', neon: '#aabbcc', hueShift: 30 })
  deep(t, { id: 'custom-1', name: 'Hi', neon: '#aabbcc', hueShift: 30 }, 'valid theme round-trips')
}
{
  // Bad neon → default purple; greyscale flag preserved.
  const t = normalizeTheme({ id: 'custom-2', name: 'X', neon: 'bogus', hueShift: 0, saturation: 0 })
  eq(t.neon, '#a855f7', 'bad neon → fallback')
  eq(t.saturation, 0, 'greyscale flag preserved')
}

// --- load/save round trip ---
{
  const store = makeStore()
  eq(loadThemes(store).length, 0, 'empty store → []')
  saveThemes([
    { id: 'custom-1', name: 'A', neon: '#aabbcc', hueShift: 30 },
    { id: 'custom-2', name: 'B', neon: '#112233', hueShift: -45 },
  ], store)
  const loaded = loadThemes(store)
  eq(loaded.length, 2, 'round-trip count')
  eq(loaded[0].id, 'custom-1', 'order preserved')
  eq(loaded[1].neon, '#112233', 'colour preserved')
}
{
  // Corrupted JSON → []
  const store = makeStore()
  store.setItem(CUSTOM_THEMES_KEY, '{not json')
  deep(loadThemes(store), [], 'bad json → []')
}
{
  // Drops rows that won't normalize.
  const store = makeStore()
  store.setItem(CUSTOM_THEMES_KEY, JSON.stringify([
    { id: 'custom-1', name: 'ok', neon: '#aabbcc', hueShift: 0 },
    { id: 'neon', name: 'bad', neon: '#fff', hueShift: 0 },   // built-in
    null,
    { id: 'custom-3', name: 'ok2', neon: 'bad', hueShift: 0 }, // sanitises neon
  ]), )
  const loaded = loadThemes(store)
  eq(loaded.length, 2, 'silently drops bad rows')
}
{
  // Save caps at MAX.
  const store = makeStore()
  const giant = []
  for (let i = 0; i < 30; i++) {
    giant.push({ id: `custom-${i+1}`, name: `T${i}`, neon: '#aabbcc', hueShift: i })
  }
  saveThemes(giant, store)
  eq(loadThemes(store).length, MAX_CUSTOM_THEMES, 'save caps to MAX')
}

// --- nextThemeId ---
eq(nextThemeId([]), 'custom-1', 'first id is custom-1')
eq(nextThemeId([{ id: 'custom-1' }]), 'custom-2', 'skips taken')
eq(nextThemeId([{ id: 'custom-1' }, { id: 'custom-3' }]), 'custom-2', 'fills gaps')

// --- addTheme / removeTheme ---
{
  const a = addTheme([], { name: 'A', neon: '#aabbcc', hueShift: 0 })
  eq(a.length, 1, 'add to empty')
  eq(a[0].id, 'custom-1', 'mints id')
  const b = addTheme(a, { name: 'B', neon: '#112233', hueShift: 10 })
  eq(b.length, 2, 'add to non-empty')
  eq(b[0].id, 'custom-2', 'newest first (prepend)')
  // Overwrite by id.
  const c = addTheme(b, { id: 'custom-1', name: 'A!', neon: '#ddeeff', hueShift: -10 })
  eq(c.length, 2, 'overwrite preserves count')
  eq(c[0].id, 'custom-1', 'overwrite moves to front')
  eq(c[0].name, 'A!', 'overwrite updates fields')
  // Cap enforcement.
  let list = []
  for (let i = 0; i < MAX_CUSTOM_THEMES + 5; i++) {
    list = addTheme(list, { name: `T${i}`, neon: '#aabbcc', hueShift: 0 })
  }
  eq(list.length, MAX_CUSTOM_THEMES, 'addTheme caps at MAX')
}
{
  const list = [{ id: 'custom-1', name: 'A', neon: '#aabbcc', hueShift: 0 }]
  deep(removeTheme(list, 'custom-1'), [], 'remove by id')
  deep(removeTheme(list, 'nope'), list, 'remove unknown → unchanged')
}

// --- resolveTheme ---
{
  const builtins = { neon: { neon: '#00ff88', hueShift: 0 } }
  const custom = [{ id: 'custom-1', name: 'A', neon: '#aabbcc', hueShift: 20 }]
  deep(resolveTheme('neon', builtins, custom), { neon: '#00ff88', hueShift: 0 }, 'built-in wins')
  deep(resolveTheme('custom-1', builtins, custom), { neon: '#aabbcc', hueShift: 20 }, 'custom resolves')
  eq(resolveTheme('missing', builtins, custom), null, 'unknown → null')
  // Built-in collision protection: a custom row that shadows a built-in is
  // ignored on resolve, even if it sneaks past normalizeTheme somehow.
  const sneaky = [{ id: 'neon', name: 'sneak', neon: '#000000', hueShift: 0 }]
  deep(resolveTheme('neon', builtins, sneaky), { neon: '#00ff88', hueShift: 0 }, 'built-in beats sneaky custom')
}

console.log(`PASS: customThemes — validate/load/save/resolve · max ${MAX_CUSTOM_THEMES}, builtins ${BUILTIN_THEME_IDS.length}`)
