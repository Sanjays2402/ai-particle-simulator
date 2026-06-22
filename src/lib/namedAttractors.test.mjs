// namedAttractors: validators, clamp, normalize, mint, CRUD list ops,
// localStorage round-trip. Uses a stub storage so tests run pure.
import {
  STORAGE_KEY, ATTRACTOR_TYPES, MAX_ATTRACTORS,
  NAME_MAX, STRENGTH_MIN, STRENGTH_MAX, RADIUS_MIN, RADIUS_MAX,
  POSITION_MIN, POSITION_MAX,
  isValidType, clampStrength, clampRadius, clampPositionScalar,
  sanitizePosition, sanitizeName, normalizeAttractor,
  nextAttractorId, defaultAttractor,
  loadAttractors, saveAttractors,
  addAttractor, removeAttractor, updateAttractor,
  toggleAttractor, moveAttractor,
  // R14.05 — type-specific color cues
  ATTRACTOR_TYPE_STYLES, attractorTypeStyle,
} from './namedAttractors.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function deepEq(a, b, m) { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m} — got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
function near(a, b, m, tol = 1e-9) { if (Math.abs(a - b) > tol) fail(`${m} — got ${a} expected ~${b}`) }
function ok(c, m) { if (!c) fail(m) }

function makeStorage() {
  const map = new Map()
  return {
    getItem(k)    { return map.has(k) ? map.get(k) : null },
    setItem(k, v) { map.set(k, String(v)) },
    removeItem(k) { map.delete(k) },
    _raw: map,
  }
}

// --- type / clamp helpers ---
eq(ATTRACTOR_TYPES.includes('attractor'), true, 'attractor in types')
eq(ATTRACTOR_TYPES.includes('repulsor'), true, 'repulsor in types')
eq(ATTRACTOR_TYPES.includes('vortex'), true, 'vortex in types')
eq(ATTRACTOR_TYPES.includes('turbulence'), true, 'turbulence in types')
eq(ATTRACTOR_TYPES.length, 4, 'exactly four documented types')

eq(isValidType('attractor'), true, 'attractor valid')
eq(isValidType('Attractor'), false, 'casing matters')
eq(isValidType('void'), false, 'void invalid')
eq(isValidType(null), false, 'null invalid')

eq(clampStrength(1.5), 1.5, 'mid strength preserved')
eq(clampStrength(-5), STRENGTH_MIN, 'negative → min')
eq(clampStrength(99), STRENGTH_MAX, 'huge → max')
eq(clampStrength(NaN), 1, 'NaN → default 1')

eq(clampRadius(10), 10, 'default radius preserved')
eq(clampRadius(1), RADIUS_MIN, 'tiny radius → min')
eq(clampRadius(99), RADIUS_MAX, 'huge radius → max')
eq(clampRadius(NaN), 10, 'NaN radius → default')

eq(clampPositionScalar(0), 0, 'zero pos')
eq(clampPositionScalar(-100), POSITION_MIN, 'pos clamped low')
eq(clampPositionScalar(100), POSITION_MAX, 'pos clamped high')
eq(clampPositionScalar(NaN), 0, 'NaN pos → 0')

deepEq(sanitizePosition([1, 2, 3]), [1, 2, 3], 'valid pos round-trip')
deepEq(sanitizePosition([200, -200, 0]), [POSITION_MAX, POSITION_MIN, 0], 'pos out-of-range clamped')
deepEq(sanitizePosition(null), [0, 0, 0], 'null pos → origin')
deepEq(sanitizePosition([1, 2]), [0, 0, 0], 'short array → origin')
deepEq(sanitizePosition('garbage'), [0, 0, 0], 'string → origin')

eq(sanitizeName('Hello'), 'Hello', 'basic name preserved')
eq(sanitizeName('   '), 'Attractor', 'blank → fallback')
eq(sanitizeName(null), 'Attractor', 'null → fallback')
eq(sanitizeName('x'.repeat(100)).length, NAME_MAX, 'long name truncated')

// --- normalizeAttractor ---
{
  const out = normalizeAttractor({
    id: 'attr-1', name: 'Eye', type: 'attractor',
    strength: 2, position: [1, 2, 3], radius: 8, enabled: true,
  })
  eq(out.id, 'attr-1', 'id preserved')
  eq(out.name, 'Eye', 'name preserved')
  eq(out.type, 'attractor', 'type preserved')
  eq(out.strength, 2, 'strength preserved')
  deepEq(out.position, [1, 2, 3], 'position preserved')
  eq(out.radius, 8, 'radius preserved')
  eq(out.enabled, true, 'enabled preserved')
}
{
  // Missing optional fields → defaults.
  const out = normalizeAttractor({ id: 'attr-7', type: 'vortex' })
  eq(out.id, 'attr-7', 'id preserved')
  eq(out.name, 'Attractor', 'missing name → fallback')
  eq(out.strength, 1, 'missing strength → 1')
  deepEq(out.position, [0, 0, 0], 'missing position → origin')
  eq(out.radius, 10, 'missing radius → 10')
  eq(out.enabled, true, 'missing enabled → true')
}
{
  // enabled false respected vs missing default-true.
  eq(normalizeAttractor({ id: 'attr-1', type: 'attractor', enabled: false }).enabled, false, 'explicit false respected')
}
{
  // Rejected: null / bad id / unknown type.
  eq(normalizeAttractor(null), null, 'null rejected')
  eq(normalizeAttractor({}), null, 'empty rejected')
  eq(normalizeAttractor({ id: 'foo', type: 'attractor' }), null, 'bad id prefix rejected')
  eq(normalizeAttractor({ id: 'attr-1', type: 'void' }), null, 'bad type rejected')
}

// --- nextAttractorId ---
{
  eq(nextAttractorId([]), 'attr-1', 'empty → attr-1')
  eq(nextAttractorId([{ id: 'attr-1' }]), 'attr-2', 'attr-1 taken → attr-2')
  eq(nextAttractorId([{ id: 'attr-1' }, { id: 'attr-3' }]), 'attr-2', 'fills gaps')
  // Holes are filled cheapest-first.
  ok(nextAttractorId(null).startsWith('attr-'), 'null list → still mints')
}

// --- defaultAttractor ---
{
  const a = defaultAttractor([], {})
  eq(a.id, 'attr-1', 'first id')
  eq(a.type, 'attractor', 'default type')
  eq(a.strength, 1, 'default strength')
  deepEq(a.position, [0, 0, 0], 'default position')
  eq(a.radius, 10, 'default radius')
  eq(a.enabled, true, 'default enabled')
}
{
  const a = defaultAttractor([], { type: 'vortex', strength: 2.5, position: [5, 0, 0], radius: 12, name: 'My Field' })
  eq(a.type, 'vortex', 'partial type overrides')
  eq(a.strength, 2.5, 'partial strength overrides')
  deepEq(a.position, [5, 0, 0], 'partial position overrides')
  eq(a.radius, 12, 'partial radius overrides')
  eq(a.name, 'My Field', 'partial name overrides')
}
{
  // Position from raycast can be out of range — sanitized.
  const a = defaultAttractor([], { position: [200, 200, 200] })
  deepEq(a.position, [POSITION_MAX, POSITION_MAX, POSITION_MAX], 'wild pos clamped')
}

// --- saveAttractors / loadAttractors round-trip ---
{
  const s = makeStorage()
  const list = [
    defaultAttractor([], { id: 'attr-1', type: 'attractor', position: [1, 0, 0] }),
    defaultAttractor([], { id: 'attr-2', type: 'vortex', position: [-2, 0, 0], strength: 1.5 }),
  ]
  ok(saveAttractors(list, s), 'save success')
  const back = loadAttractors(s)
  eq(back.length, 2, 'loaded 2 entries')
  eq(back[0].id, 'attr-1', 'first id preserved')
  eq(back[1].type, 'vortex', 'second type preserved')
  near(back[1].strength, 1.5, 'second strength preserved')
}
{
  // Corrupted rows dropped silently.
  const s = makeStorage()
  s.setItem(STORAGE_KEY, JSON.stringify([
    { id: 'attr-1', type: 'attractor', position: [1, 0, 0] },
    { junk: true },
    null,
    { id: 'bad-id', type: 'attractor' },     // bad id prefix → dropped
    { id: 'attr-3', type: 'lol' },           // bad type → dropped
  ]))
  const back = loadAttractors(s)
  eq(back.length, 1, 'only the valid row kept')
  eq(back[0].id, 'attr-1', 'survivor is the valid one')
}
{
  // Storage missing → empty.
  eq(loadAttractors(null).length, 0, 'no storage → empty')
  eq(saveAttractors([], null), false, 'no storage → save false')
  eq(loadAttractors({ getItem() { return 'not json' } }).length, 0, 'bad JSON → empty')
  eq(loadAttractors({ getItem() { return JSON.stringify('not array') } }).length, 0, 'non-array → empty')
}

// --- addAttractor / removeAttractor ---
{
  let list = []
  list = addAttractor(list, { type: 'attractor' })
  list = addAttractor(list, { type: 'vortex' })
  eq(list.length, 2, 'two added')
  eq(list[0].id, 'attr-1', 'first id')
  eq(list[1].id, 'attr-2', 'second id')
  list = removeAttractor(list, 'attr-1')
  eq(list.length, 1, 'one removed')
  eq(list[0].id, 'attr-2', 'survivor is attr-2')
}
{
  // Cap at MAX_ATTRACTORS — oldest drops off the end.
  let list = []
  for (let i = 0; i < MAX_ATTRACTORS + 3; i++) {
    list = addAttractor(list, { type: 'attractor' })
  }
  eq(list.length, MAX_ATTRACTORS, 'capped at MAX_ATTRACTORS')
}

// --- updateAttractor ---
{
  let list = []
  list = addAttractor(list, { type: 'attractor' })
  list = updateAttractor(list, 'attr-1', { name: 'Vortex Eye', strength: 2.5 })
  eq(list[0].name, 'Vortex Eye', 'name patched')
  eq(list[0].strength, 2.5, 'strength patched')
  // Patch invalid type → re-normalized; bad type returns SAME list ref.
  const beforeRef = list
  const after = updateAttractor(list, 'attr-1', { type: 'void' })
  eq(after, beforeRef, 'bad-type patch returns same list (entry stays valid)')
  // id can't be changed by patch.
  const after2 = updateAttractor(list, 'attr-1', { id: 'attr-99' })
  eq(after2[0].id, 'attr-1', 'patch cannot rewrite id')
}
{
  // Patching a missing id is a no-op.
  let list = []
  list = addAttractor(list, { type: 'attractor' })
  const same = updateAttractor(list, 'does-not-exist', { strength: 9 })
  eq(same, list, 'missing-id patch returns same list')
}

// --- toggleAttractor ---
{
  let list = []
  list = addAttractor(list, { type: 'attractor', enabled: true })
  eq(list[0].enabled, true, 'starts enabled')
  list = toggleAttractor(list, 'attr-1')
  eq(list[0].enabled, false, 'toggled off')
  list = toggleAttractor(list, 'attr-1')
  eq(list[0].enabled, true, 'toggled back on')
}

// --- moveAttractor ---
{
  let list = []
  list = addAttractor(list, { type: 'attractor' })
  list = moveAttractor(list, 'attr-1', [3, 4, 5])
  deepEq(list[0].position, [3, 4, 5], 'moved to new position')
  // Wild positions are clamped (this is critical for canvas raycasts).
  list = moveAttractor(list, 'attr-1', [999, 999, 999])
  deepEq(list[0].position, [POSITION_MAX, POSITION_MAX, POSITION_MAX], 'wild move clamped')
}

// --- R14.05: type-specific color cues ---
{
  // Every documented type has a style entry.
  for (const t of ATTRACTOR_TYPES) {
    ok(ATTRACTOR_TYPE_STYLES[t], `style table covers ${t}`)
    const s = ATTRACTOR_TYPE_STYLES[t]
    ok(typeof s.accent === 'string' && /^#[0-9a-f]{6}$/i.test(s.accent), `${t} accent is hex`)
    ok(typeof s.accentRgb === 'string' && /^\d+,\d+,\d+$/.test(s.accentRgb), `${t} accentRgb is r,g,b`)
    ok(typeof s.label === 'string' && s.label.length > 0, `${t} has a human label`)
  }
  // The four types resolve to DISTINCT accent hexes (so a glance
  // distinguishes them — the whole point of the slice).
  const accents = new Set(ATTRACTOR_TYPES.map(t => ATTRACTOR_TYPE_STYLES[t].accent))
  eq(accents.size, ATTRACTOR_TYPES.length, 'all four types have distinct accent hexes')
  // Specific palette pins — guards against accidental reshuffles.
  eq(ATTRACTOR_TYPE_STYLES.attractor.label, 'indigo', 'attractor=indigo')
  eq(ATTRACTOR_TYPE_STYLES.repulsor.label,  'red',    'repulsor=red')
  eq(ATTRACTOR_TYPE_STYLES.vortex.label,    'violet', 'vortex=violet')
  eq(ATTRACTOR_TYPE_STYLES.turbulence.label,'amber',  'turbulence=amber')
}
{
  // attractorTypeStyle returns a complete bundle for every type and
  // every field is a non-empty string the UI can drop into a CSS prop.
  for (const t of ATTRACTOR_TYPES) {
    const s = attractorTypeStyle(t)
    for (const field of ['accent','accentRgb','label','border','borderSoft','borderFaint','bg','bgSoft','bgFaint','fg','fgMuted','glow']) {
      ok(typeof s[field] === 'string' && s[field].length > 0, `${t}.${field} is non-empty string`)
    }
    // rgba() strings carry the accentRgb verbatim — round-trip check.
    ok(s.border.includes(s.accentRgb), `${t} border carries accentRgb`)
    ok(s.bg.includes(s.accentRgb),     `${t} bg carries accentRgb`)
    ok(s.fg === s.accent,              `${t} fg matches accent hex`)
    ok(s.glow.includes(s.accentRgb),   `${t} glow carries accentRgb`)
  }
}
{
  // Unknown / null type falls back to the indigo "attractor" style
  // so a stale localStorage entry never paints a borderless ghost.
  const fallback = attractorTypeStyle('void')
  eq(fallback.accent, ATTRACTOR_TYPE_STYLES.attractor.accent, 'unknown type → attractor fallback')
  const fallback2 = attractorTypeStyle(null)
  eq(fallback2.accent, ATTRACTOR_TYPE_STYLES.attractor.accent, 'null type → attractor fallback')
  const fallback3 = attractorTypeStyle(undefined)
  eq(fallback3.accent, ATTRACTOR_TYPE_STYLES.attractor.accent, 'undefined type → attractor fallback')
}
{
  // Border opacities walk strong → faint so callers can layer them
  // (the LeftSidebar uses borderFaint for the row, border for the
  // active type chip, the gap proves the visual hierarchy survives).
  const s = attractorTypeStyle('repulsor')
  ok(s.border.includes('0.45'),     'border at 0.45 alpha')
  ok(s.borderSoft.includes('0.30'), 'borderSoft at 0.30 alpha')
  ok(s.borderFaint.includes('0.18'),'borderFaint at 0.18 alpha')
  ok(s.bg.includes('0.14'),         'bg at 0.14 alpha')
  ok(s.bgSoft.includes('0.06'),     'bgSoft at 0.06 alpha')
  ok(s.bgFaint.includes('0.03'),    'bgFaint at 0.03 alpha')
}

console.log(`PASS: namedAttractors — types/clamps, normalize (full/defaults/enabled:false/rejection), id mint, defaultAttractor, save/load (round-trip + corrupted + missing storage), add/remove (+ cap), update (patch + bad-type + bad-id), toggle, move (+ clamp), R14.05 type styles (4 distinct accents + bundle completeness + fallback + opacity hierarchy)`)
