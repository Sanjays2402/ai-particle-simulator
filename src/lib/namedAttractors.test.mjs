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
  // R15.20 — reorder helpers (parallels cameraViews.moveView family)
  moveAttractorByIndex, moveAttractorUp, moveAttractorDown,
  // R16.18 — bulk jump-to-position helper + input parser
  moveAttractorTo1BasedPosition, parsePositionInput,
  // R17.17 — bulk-delete by id collection
  removeAttractors,
  // R19.19 — gap-drop helper for insert-here semantics
  dropIndexForGap,
  // R29.20 — keyboard gap-cursor stepper for accessible reorder
  stepKeyboardGapCursor,
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

// --- R15.20 reorder helpers (parallel to cameraViews.moveView family) ---
{
  const A = { id: 'attr-1', name: 'A', type: 'attractor', strength: 1, radius: 10, position: [0,0,0], enabled: true }
  const B = { id: 'attr-2', name: 'B', type: 'repulsor',  strength: 1, radius: 10, position: [0,0,0], enabled: true }
  const C = { id: 'attr-3', name: 'C', type: 'vortex',    strength: 1, radius: 10, position: [0,0,0], enabled: true }
  const list = [A, B, C]
  // moveAttractorByIndex — happy path
  {
    const r = moveAttractorByIndex(list, 0, 2)
    eq(r.map(a => a.id).join(','), 'attr-2,attr-3,attr-1', 'move first → last')
    // Original list is NOT mutated.
    eq(list.map(a => a.id).join(','), 'attr-1,attr-2,attr-3', 'source list not mutated')
  }
  {
    const r = moveAttractorByIndex(list, 2, 0)
    eq(r.map(a => a.id).join(','), 'attr-3,attr-1,attr-2', 'move last → first')
  }
  {
    const r = moveAttractorByIndex(list, 1, 1)
    eq(r, list, 'same idx → input ref (no-op)')
  }
  {
    const r = moveAttractorByIndex(list, 5, 0)
    eq(r, list, 'fromIdx out-of-range → input ref')
    const r2 = moveAttractorByIndex(list, 0, 99)
    eq(r2, list, 'toIdx out-of-range → input ref')
    const r3 = moveAttractorByIndex(list, -1, 0)
    eq(r3, list, 'negative fromIdx → input ref')
    const r4 = moveAttractorByIndex(list, 0, NaN)
    eq(r4, list, 'NaN idx → input ref')
  }
  eq(moveAttractorByIndex(null, 0, 1), null, 'null list → null')
  eq(moveAttractorByIndex('garbage', 0, 1), 'garbage', 'non-array → passthrough')
}
{
  const A = { id: 'attr-1', name: 'A', type: 'attractor', strength: 1, radius: 10, position: [0,0,0], enabled: true }
  const B = { id: 'attr-2', name: 'B', type: 'repulsor',  strength: 1, radius: 10, position: [0,0,0], enabled: true }
  const C = { id: 'attr-3', name: 'C', type: 'vortex',    strength: 1, radius: 10, position: [0,0,0], enabled: true }
  const list = [A, B, C]
  // moveAttractorUp by id
  {
    const r = moveAttractorUp(list, 'attr-2')
    eq(r.map(a => a.id).join(','), 'attr-2,attr-1,attr-3', 'B moves up past A')
    eq(list.map(a => a.id).join(','), 'attr-1,attr-2,attr-3', 'source untouched')
  }
  {
    const r = moveAttractorUp(list, 'attr-1')
    eq(r, list, 'already top → input ref (no-op)')
  }
  {
    const r = moveAttractorUp(list, 'missing-id')
    eq(r, list, 'missing id → input ref (no-op)')
  }
  // moveAttractorDown by id
  {
    const r = moveAttractorDown(list, 'attr-2')
    eq(r.map(a => a.id).join(','), 'attr-1,attr-3,attr-2', 'B moves down past C')
  }
  {
    const r = moveAttractorDown(list, 'attr-3')
    eq(r, list, 'already bottom → input ref (no-op)')
  }
  {
    const r = moveAttractorDown(list, 'missing-id')
    eq(r, list, 'missing id → input ref (no-op)')
  }
  // Defensive
  eq(moveAttractorUp(null, 'attr-1'),    null,  'null list up → null')
  eq(moveAttractorDown(null, 'attr-1'),  null,  'null list down → null')
  // Empty list cases - returns input ref (which is [])
  {
    const empty = []
    eq(moveAttractorUp(empty,   'whatever'), empty, 'empty list up → empty ref')
    eq(moveAttractorDown(empty, 'whatever'), empty, 'empty list down → empty ref')
  }
  // Single-element list — both directions are no-ops.
  {
    const single = [A]
    eq(moveAttractorUp(single,   'attr-1'), single, 'single-elt up → input ref')
    eq(moveAttractorDown(single, 'attr-1'), single, 'single-elt down → input ref')
  }
}

console.log(`PASS: namedAttractors — types/clamps, normalize (full/defaults/enabled:false/rejection), id mint, defaultAttractor, save/load (round-trip + corrupted + missing storage), add/remove (+ cap), update (patch + bad-type + bad-id), toggle, move (+ clamp), R14.05 type styles (4 distinct accents + bundle completeness + fallback + opacity hierarchy) + R15.20 reorder (moveAttractorByIndex/Up/Down + ref-equal-on-no-op + boundary + missing-id + null/empty defensive) + R16.18 jump-to-position (moveAttractorTo1BasedPosition + clamp + ref-equal + parsePositionInput)`)

// --- R16.18: moveAttractorTo1BasedPosition + parsePositionInput ---
// Build a small list of 5 attractors with stable ids.
{
  const list = ['attr-1', 'attr-2', 'attr-3', 'attr-4', 'attr-5'].map((id, i) =>
    normalizeAttractor({ id, type: 'attractor', name: `A${i + 1}`, strength: 1, position: [0, 0, 0], radius: 10, enabled: true }),
  )

  // Happy path: jump attr-1 (idx 0) to position 4 (idx 3).
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-1', 4)
    if (next === list) fail('jump 1→4 should return a fresh array')
    deepEq(next.map(a => a.id), ['attr-2', 'attr-3', 'attr-4', 'attr-1', 'attr-5'], 'jump 1→4: ids in expected order')
  }

  // Jump down: attr-5 (idx 4) to position 1 (idx 0).
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-5', 1)
    if (next === list) fail('jump 5→1 should return a fresh array')
    deepEq(next.map(a => a.id), ['attr-5', 'attr-1', 'attr-2', 'attr-3', 'attr-4'], 'jump 5→1: ids in expected order')
  }

  // Clamp: position > length jumps to the bottom.
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-2', 99)
    deepEq(next.map(a => a.id), ['attr-1', 'attr-3', 'attr-4', 'attr-5', 'attr-2'], 'jump 2→99: clamps to end')
  }

  // Clamp: position < 1 jumps to the top.
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-3', -10)
    deepEq(next.map(a => a.id), ['attr-3', 'attr-1', 'attr-2', 'attr-4', 'attr-5'], 'jump 3→-10: clamps to top')
  }

  // Position 0 also clamps to top (NOT a no-op — 0 is below the
  // valid range so it pins to position 1).
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-3', 0)
    deepEq(next.map(a => a.id), ['attr-3', 'attr-1', 'attr-2', 'attr-4', 'attr-5'], 'jump 3→0: clamps to top')
  }

  // No-op: target position === current → input ref (ref-equal-on-no-op).
  {
    const same = moveAttractorTo1BasedPosition(list, 'attr-3', 3)
    eq(same, list, 'jump 3→3: input ref (no-op)')
  }

  // Missing id → input ref.
  {
    const same = moveAttractorTo1BasedPosition(list, 'attr-nope', 2)
    eq(same, list, 'jump missing-id → input ref')
  }

  // Non-finite position → input ref (NaN, Infinity, strings via Number).
  {
    eq(moveAttractorTo1BasedPosition(list, 'attr-1', NaN),       list, 'NaN position → input ref')
    eq(moveAttractorTo1BasedPosition(list, 'attr-1', Infinity),  list, 'Infinity position → input ref')
    eq(moveAttractorTo1BasedPosition(list, 'attr-1', -Infinity), list, '-Infinity position → input ref')
  }

  // Float position rounds (UX: half = round-half-to-even or away;
  // we use Math.round which rounds half-up — pin both behaviours).
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-1', 3.4)
    deepEq(next.map(a => a.id), ['attr-2', 'attr-3', 'attr-1', 'attr-4', 'attr-5'], '3.4 rounds to 3')
  }
  {
    const next = moveAttractorTo1BasedPosition(list, 'attr-1', 3.6)
    deepEq(next.map(a => a.id), ['attr-2', 'attr-3', 'attr-4', 'attr-1', 'attr-5'], '3.6 rounds to 4')
  }

  // Non-array list defensive.
  eq(moveAttractorTo1BasedPosition(null,        'attr-1', 2), null,        'null list → null')
  eq(moveAttractorTo1BasedPosition(undefined,   'attr-1', 2), undefined,   'undefined list → undefined')
  eq(moveAttractorTo1BasedPosition('not-array', 'attr-1', 2), 'not-array', 'string list → input ref')

  // Empty list: nothing to move.
  {
    const empty = []
    eq(moveAttractorTo1BasedPosition(empty, 'attr-x', 1), empty, 'empty list → input ref')
  }

  // Single-element list: jumping it to position 1 is a no-op (already
  // at the only valid index).
  {
    const single = [list[0]]
    eq(moveAttractorTo1BasedPosition(single, 'attr-1', 1), single, 'single-element list → input ref')
    eq(moveAttractorTo1BasedPosition(single, 'attr-1', 99), single, 'single-element list w/ clamp → input ref')
  }

  // Original list not mutated by any successful move.
  deepEq(list.map(a => a.id), ['attr-1', 'attr-2', 'attr-3', 'attr-4', 'attr-5'], 'original list never mutated')
}

// parsePositionInput — handles the gnarly UX edges so the JSX stays
// declarative.
{
  // Happy
  eq(parsePositionInput('1'),    1,  'parse "1"')
  eq(parsePositionInput('99'),   99, 'parse "99"')
  eq(parsePositionInput(' 42 '), 42, 'parse trims whitespace')
  eq(parsePositionInput('3.4'),  3,  'parse rounds 3.4 to 3')
  eq(parsePositionInput('3.6'),  4,  'parse rounds 3.6 to 4')
  eq(parsePositionInput(7),      7,  'parse number passthrough')

  // Reject — return null
  eq(parsePositionInput(''),         null, 'parse empty string → null')
  eq(parsePositionInput('   '),      null, 'parse whitespace-only → null')
  eq(parsePositionInput('abc'),      null, 'parse non-numeric → null')
  eq(parsePositionInput('0'),        null, 'parse 0 → null (positions are 1-based)')
  eq(parsePositionInput('-3'),       null, 'parse negative → null')
  eq(parsePositionInput(null),       null, 'parse null → null')
  eq(parsePositionInput(undefined),  null, 'parse undefined → null')
  eq(parsePositionInput(NaN),        null, 'parse NaN → null')
  eq(parsePositionInput(Infinity),   null, 'parse Infinity → null')
  eq(parsePositionInput(-Infinity),  null, 'parse -Infinity → null')
}

// --- R17.17 — removeAttractors (bulk delete by id collection) ---
{
  const a = defaultAttractor([], { id: 'attr-1', name: 'A', type: 'attractor' })
  const b = defaultAttractor([a], { id: 'attr-2', name: 'B', type: 'vortex' })
  const c = defaultAttractor([a, b], { id: 'attr-3', name: 'C', type: 'repulsor' })
  const d = defaultAttractor([a, b, c], { id: 'attr-4', name: 'D', type: 'turbulence' })
  const list = [a, b, c, d]

  // Happy path: Set with 2 ids → those rows drop, others preserved + ordered.
  {
    const next = removeAttractors(list, new Set(['attr-2', 'attr-4']))
    eq(next.length, 2, 'removeAttractors(Set) drops 2 of 4')
    eq(next[0].id, 'attr-1', 'kept rows preserve order (a first)')
    eq(next[1].id, 'attr-3', 'kept rows preserve order (c second)')
    if (next === list) fail('removeAttractors should return a NEW array when any row was removed')
  }

  // Array input also works (no need for caller to pre-wrap).
  {
    const next = removeAttractors(list, ['attr-1', 'attr-3'])
    eq(next.length, 2, 'removeAttractors(array) drops 2 of 4')
    eq(next.map(r => r.id).join(','), 'attr-2,attr-4', 'array input preserves remaining order')
  }

  // Generator / iterable: a synthetic iterable should also work — proves
  // the helper isn't accidentally requiring Set semantics only.
  {
    function* ids() { yield 'attr-1'; yield 'attr-4' }
    const next = removeAttractors(list, ids())
    eq(next.length, 2, 'removeAttractors(iterable) drops 2 of 4')
    eq(next.map(r => r.id).join(','), 'attr-2,attr-3', 'iterable input preserves remaining order')
  }

  // Single-id set still works (consistent with removeAttractor for one).
  {
    const next = removeAttractors(list, new Set(['attr-3']))
    eq(next.length, 3, 'single-id set drops one row')
    eq(next.map(r => r.id).join(','), 'attr-1,attr-2,attr-4', 'order preserved after single drop')
  }

  // Ref-equal-on-no-op contract: empty set, ids that don't exist, null,
  // undefined, and non-iterable inputs all return the input list ref so
  // zustand can skip the save.
  {
    const empty = removeAttractors(list, new Set())
    eq(empty, list, 'empty Set → input ref (no churn)')
    const noMatch = removeAttractors(list, new Set(['attr-99']))
    eq(noMatch, list, 'no-id-matches → input ref (no churn)')
    const arrEmpty = removeAttractors(list, [])
    eq(arrEmpty, list, 'empty array → input ref')
    const noMatchArr = removeAttractors(list, ['attr-99', 'attr-100'])
    eq(noMatchArr, list, 'array with no matches → input ref')
    eq(removeAttractors(list, null), list,      'null collection → input ref')
    eq(removeAttractors(list, undefined), list, 'undefined collection → input ref')
    eq(removeAttractors(list, 42), list,        'non-iterable number → input ref')
    eq(removeAttractors(list, 'attr-1'), list,  'string (iterable but not the right kind) treated as iterable of chars → no match → input ref')
  }

  // Non-array input returns empty array (parallels removeAttractor's
  // null-list contract).
  {
    eq(removeAttractors(null, new Set(['attr-1'])).length, 0, 'null list → empty')
    eq(removeAttractors(undefined, new Set(['attr-1'])).length, 0, 'undefined list → empty')
    eq(removeAttractors('not-a-list', new Set(['attr-1'])).length, 0, 'non-array → empty')
  }

  // Corrupt rows (null entries) are dropped EVEN when the id set is
  // empty-on-the-ids-that-matter, because the helper's contract says
  // "ref-equal only when nothing changes AT ALL". A list with a null
  // row mixed in produces a cleaned list even if no id matches.
  {
    const dirty = [a, null, b]
    const next = removeAttractors(dirty, new Set(['attr-99']))
    eq(next.length, 2, 'corrupt row dropped (null entry)')
    eq(next[0].id, 'attr-1', 'live rows preserved')
    eq(next[1].id, 'attr-2', 'live rows preserved')
    if (next === dirty) fail('removeAttractors should clean corrupt rows even without id matches')
  }

  // Full wipe: removing every id leaves an empty list (no off-by-one).
  {
    const next = removeAttractors(list, new Set(['attr-1', 'attr-2', 'attr-3', 'attr-4']))
    eq(next.length, 0, 'removing every id leaves empty list')
  }

  // Input list is never mutated — every successful removal returns a
  // fresh array.
  {
    const before = list.slice()
    removeAttractors(list, new Set(['attr-1', 'attr-3']))
    deepEq(list, before, 'input list not mutated')
  }
}

// --- R19.19: dropIndexForGap — gap-drop insert-here semantics ---
//
// Helper that maps "user dropped row N into gap G" → destination 0-based
// index for moveAttractorByIndex. The math accounts for moveAttractorBy-
// Index's remove-then-insert ordering: dropping a row that's ABOVE its
// target gap means every index above the original `from` shifts down
// after the remove, so the insertion index needs to be gapIdx - 1.

// Visualising a 5-item list [a, b, c, d, e]:
//   gap 0 | a | gap 1 | b | gap 2 | c | gap 3 | d | gap 4 | e | gap 5
{
  const N = 5

  // Dropping `b` (idx 1) into gap 4 should land at idx 3 (between c and d).
  // After remove: [a, c, d, e] (length 4)
  // After insert at idx 3: [a, c, d, b, e]
  eq(dropIndexForGap(1, 4, N), 3, 'move-down: insert at gapIdx - 1 due to shift')

  // Dropping `d` (idx 3) into gap 1 should land at idx 1 (between a and b).
  // After remove: [a, b, c, e] (length 4)
  // After insert at idx 1: [a, d, b, c, e]
  eq(dropIndexForGap(3, 1, N), 1, 'move-up: insert at gapIdx (no shift since from > gap)')

  // Dropping `a` (idx 0) into gap 5 (end) should land at idx 4 (last slot).
  // After remove: [b, c, d, e] (length 4)
  // After insert at idx 4: [b, c, d, e, a]
  eq(dropIndexForGap(0, 5, N), 4, 'move-to-end: gapIdx 5 → insert at 4 after remove')

  // Dropping `e` (idx 4) into gap 0 (top) should land at idx 0.
  // After remove: [a, b, c, d] (length 4)
  // After insert at idx 0: [e, a, b, c, d]
  eq(dropIndexForGap(4, 0, N), 0, 'move-to-top: gapIdx 0 → insert at 0')
}

// No-op cases: dropping a row into its own slot returns null.
{
  const N = 5
  // Dropping `b` (idx 1) into the gap directly above itself (gap 1)
  // would land at the same position — true no-op.
  eq(dropIndexForGap(1, 1, N), null, 'gap above self → null (no-op)')
  // Dropping `b` (idx 1) into the gap directly below itself (gap 2)
  // would also land at the same position.
  eq(dropIndexForGap(1, 2, N), null, 'gap below self → null (no-op)')
  // First row dropping into gap 0 (above) or gap 1 (below) → no-op.
  eq(dropIndexForGap(0, 0, N), null, 'top row + gap 0 → null')
  eq(dropIndexForGap(0, 1, N), null, 'top row + gap 1 → null')
  // Last row dropping into gap N-1 (above) or gap N (below) → no-op.
  eq(dropIndexForGap(4, 4, N), null, 'bottom row + gap N-1 → null')
  eq(dropIndexForGap(4, 5, N), null, 'bottom row + gap N → null')
}

// Adjacent neighbour swaps land in the expected slot.
{
  const N = 5
  // `b` (idx 1) → gap 3 (between c and d): no shift? from=1 < gap=3,
  // so insert at gap-1 = 2 (between b's original neighbour c and d).
  // After remove: [a, c, d, e]; insert at 2: [a, c, b, d, e].
  eq(dropIndexForGap(1, 3, N), 2, 'b → gap 3 lands between c and d')
  // `c` (idx 2) → gap 1 (between a and b): from=2 >= gap=1, no shift,
  // insert at 1. After remove: [a, b, d, e]; insert at 1: [a, c, b, d, e].
  eq(dropIndexForGap(2, 1, N), 1, 'c → gap 1 lands between a and b')
}

// Defensive: out-of-range inputs return null without crashing.
{
  const N = 5
  eq(dropIndexForGap(-1, 2, N), null, 'negative from → null')
  eq(dropIndexForGap(99, 2, N), null, 'from out of range → null')
  eq(dropIndexForGap(2, -1, N), null, 'negative gapIdx → null')
  eq(dropIndexForGap(2, 99, N), null, 'gapIdx out of range → null')
  eq(dropIndexForGap(NaN, 2, N), null, 'NaN from → null')
  eq(dropIndexForGap(2, NaN, N), null, 'NaN gapIdx → null')
  eq(dropIndexForGap(2, 2, NaN), null, 'NaN length → null')
  eq(dropIndexForGap(2, 2, 0), null, 'zero-length list → null')
  eq(dropIndexForGap(2, 2, -3), null, 'negative length → null')
}

// Single-item list: every gesture is a no-op (no other slot to land in).
{
  const N = 1
  eq(dropIndexForGap(0, 0, N), null, 'single item + gap 0 → null')
  eq(dropIndexForGap(0, 1, N), null, 'single item + gap 1 → null')
}

// Full sweep invariant: every NON-no-op result lands at a valid 0-based
// index < listLength when fed through moveAttractorByIndex. Use a real
// list + moveAttractorByIndex to verify the post-state matches the
// expected order.
{
  const list = [
    { id: 'attr-1', type: 'attractor', name: 'A', strength: 1, position: [0,0,0], radius: 10, enabled: true },
    { id: 'attr-2', type: 'attractor', name: 'B', strength: 1, position: [0,0,0], radius: 10, enabled: true },
    { id: 'attr-3', type: 'attractor', name: 'C', strength: 1, position: [0,0,0], radius: 10, enabled: true },
    { id: 'attr-4', type: 'attractor', name: 'D', strength: 1, position: [0,0,0], radius: 10, enabled: true },
    { id: 'attr-5', type: 'attractor', name: 'E', strength: 1, position: [0,0,0], radius: 10, enabled: true },
  ]
  const N = list.length

  // Dropping `B` (idx 1) into gap 4 → expected order [A, C, D, B, E].
  const r1 = moveAttractorByIndex(list, 1, dropIndexForGap(1, 4, N))
  eq(r1[0].id, 'attr-1', 'sweep B→gap4: A still first')
  eq(r1[1].id, 'attr-3', 'sweep B→gap4: C second')
  eq(r1[2].id, 'attr-4', 'sweep B→gap4: D third')
  eq(r1[3].id, 'attr-2', 'sweep B→gap4: B fourth')
  eq(r1[4].id, 'attr-5', 'sweep B→gap4: E last')

  // Dropping `D` (idx 3) into gap 1 → expected order [A, D, B, C, E].
  const r2 = moveAttractorByIndex(list, 3, dropIndexForGap(3, 1, N))
  eq(r2[0].id, 'attr-1', 'sweep D→gap1: A first')
  eq(r2[1].id, 'attr-4', 'sweep D→gap1: D second')
  eq(r2[2].id, 'attr-2', 'sweep D→gap1: B third')
  eq(r2[3].id, 'attr-3', 'sweep D→gap1: C fourth')
  eq(r2[4].id, 'attr-5', 'sweep D→gap1: E last')

  // Dropping `A` (idx 0) into gap 5 (end) → expected order [B, C, D, E, A].
  const r3 = moveAttractorByIndex(list, 0, dropIndexForGap(0, 5, N))
  eq(r3[4].id, 'attr-1', 'sweep A→end: A last')
  eq(r3[0].id, 'attr-2', 'sweep A→end: B first')
}

console.log('PASS: namedAttractors R19.19 dropIndexForGap — gap-drop insert-here semantics, no-op cases, defensive, sweep invariant')

// =====================================================================
// R29.20 — stepKeyboardGapCursor: keyboard gap-cursor for accessible
// binding-group reorder (skips the two no-op gaps adjacent to the
// lifted row; clamps at boundaries; seeds sensibly when unset).
// =====================================================================

// Length 4, lifting MIDDLE row (from=1). Valid gaps: {0, 3, 4}
// (gaps 1 and 2 are no-ops adjacent to row 1).
{
  const L = 4, from = 1
  // Unset cursor seeds in the requested direction.
  eq(stepKeyboardGapCursor(from, null, 1, L), 3, 'middle row, unset+down seeds at gap 3 (from+2)')
  eq(stepKeyboardGapCursor(from, null, -1, L), 0, 'middle row, unset+up seeds at gap 0 (from-1)')
  // Stepping down from gap 3 -> gap 4 (end).
  eq(stepKeyboardGapCursor(from, 3, 1, L), 4, 'down from 3 -> 4')
  // At the bottom boundary, further down parks (no wrap).
  eq(stepKeyboardGapCursor(from, 4, 1, L), 4, 'down from 4 parks at 4 (clamp, no wrap)')
  // Stepping up from gap 3 SKIPS the two no-op gaps (2 and 1) -> gap 0.
  eq(stepKeyboardGapCursor(from, 3, -1, L), 0, 'up from 3 skips no-op gaps 2,1 -> gap 0')
  // At the top boundary, further up parks at 0.
  eq(stepKeyboardGapCursor(from, 0, -1, L), 0, 'up from 0 parks at 0 (clamp)')
}

// Length 4, lifting TOP row (from=0). Valid gaps: {2, 3, 4}.
{
  const L = 4, from = 0
  eq(stepKeyboardGapCursor(from, null, 1, L), 2, 'top row, unset+down seeds at gap 2 (from+2)')
  // Arrow-up on the top row is a no-op (nowhere valid above) -> null.
  eq(stepKeyboardGapCursor(from, null, -1, L), null, 'top row, unset+up -> null (cannot move up)')
  eq(stepKeyboardGapCursor(from, 2, 1, L), 3, 'down from 2 -> 3')
  eq(stepKeyboardGapCursor(from, 3, 1, L), 4, 'down from 3 -> 4')
  // Up from gap 2 -> nowhere valid below (1,0 both no-op-or-not? gap 1
  // is no-op (from+1), gap 0 is no-op (from)). Parks at 2.
  eq(stepKeyboardGapCursor(from, 2, -1, L), 2, 'up from 2 parks (gaps 1,0 are no-ops for top row)')
}

// Length 4, lifting BOTTOM row (from=3). Valid gaps: {0, 1, 2}.
{
  const L = 4, from = 3
  eq(stepKeyboardGapCursor(from, null, -1, L), 2, 'bottom row, unset+up seeds at gap 2 (from-1)')
  // Arrow-down on the bottom row is a no-op -> null.
  eq(stepKeyboardGapCursor(from, null, 1, L), null, 'bottom row, unset+down -> null (cannot move down)')
  eq(stepKeyboardGapCursor(from, 2, -1, L), 1, 'up from 2 -> 1')
  eq(stepKeyboardGapCursor(from, 1, -1, L), 0, 'up from 1 -> 0')
  eq(stepKeyboardGapCursor(from, 0, -1, L), 0, 'up from 0 parks (clamp)')
  // Down from gap 0 -> nowhere valid above (1,2 valid actually). gap 1
  // is valid -> 1.
  eq(stepKeyboardGapCursor(from, 0, 1, L), 1, 'down from 0 -> 1 (valid)')
}

// Length 2 — minimal reorderable list.
{
  // from=0: valid gaps {2}. Down seeds to 2; up is null.
  eq(stepKeyboardGapCursor(0, null, 1, 2), 2, 'len2 from0 down -> gap 2 (move to end)')
  eq(stepKeyboardGapCursor(0, null, -1, 2), null, 'len2 from0 up -> null')
  // from=1: valid gaps {0}. Up seeds to 0; down is null.
  eq(stepKeyboardGapCursor(1, null, -1, 2), 0, 'len2 from1 up -> gap 0 (move to top)')
  eq(stepKeyboardGapCursor(1, null, 1, 2), null, 'len2 from1 down -> null')
}

// Defensive contract — bad inputs -> null.
{
  eq(stepKeyboardGapCursor(NaN, null, 1, 4), null, 'NaN from -> null')
  eq(stepKeyboardGapCursor(1, null, 1, NaN), null, 'NaN length -> null')
  eq(stepKeyboardGapCursor(1, null, 1, 1), null, 'length 1 (nothing to reorder) -> null')
  eq(stepKeyboardGapCursor(1, null, 1, 0), null, 'length 0 -> null')
  eq(stepKeyboardGapCursor(-1, null, 1, 4), null, 'negative from -> null')
  eq(stepKeyboardGapCursor(4, null, 1, 4), null, 'from >= length -> null')
  eq(stepKeyboardGapCursor(1, null, 0, 4), null, 'dir 0 -> null')
  eq(stepKeyboardGapCursor(1, null, 2, 4), null, 'dir 2 (not +-1) -> null')
}

// Integration: lift a row, arrow the cursor to a gap, commit via
// dropIndexForGap + moveAttractorByIndex — the row lands where the
// cursor pointed. List [A,B,C,D], lift B (from=1), arrow down to gap 3
// (between C and D), commit.
{
  const list = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }]
  const from = 1
  // Seed down -> 3.
  const cursor = stepKeyboardGapCursor(from, null, 1, list.length)
  eq(cursor, 3, 'integration: cursor seeds at gap 3')
  const dest = dropIndexForGap(from, cursor, list.length)
  eq(dest, 2, 'integration: dropIndexForGap(1,3,4) -> dest index 2')
  const moved = moveAttractorByIndex(list, from, dest)
  eq(moved.map(a => a.id).join(''), 'ACBD', 'integration: B lands between C and D -> ACBD')
}

// Integration: lifting row 2 of 4 and arrowing up to gap 0 moves it to
// the very top.
{
  const list = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }]
  const from = 2
  // from=2 valid gaps: {0,1,4}. Seed up -> from-1 = 1.
  let cursor = stepKeyboardGapCursor(from, null, -1, list.length)
  eq(cursor, 1, 'integration: from2 up seeds at gap 1')
  // Arrow up again -> gap 0.
  cursor = stepKeyboardGapCursor(from, cursor, -1, list.length)
  eq(cursor, 0, 'integration: up again -> gap 0')
  const dest = dropIndexForGap(from, cursor, list.length)  // from>gap -> gap = 0
  eq(dest, 0, 'integration: dropIndexForGap(2,0,4) -> 0')
  const moved = moveAttractorByIndex(list, from, dest)
  eq(moved.map(a => a.id).join(''), 'CABD', 'integration: C jumps to top -> CABD')
}

console.log('PASS: namedAttractors R29.20 stepKeyboardGapCursor — keyboard gap-cursor reorder (seed/walk/clamp/commit, ~35 asserts)')
