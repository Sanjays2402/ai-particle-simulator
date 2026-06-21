// slideshow: pickNext across the three orders + clamp behaviour +
// categoryFilter scoping.
import {
  pickNext, clampDwell, filterByCategory,
  SLIDESHOW_ORDERS, DWELL_MIN_SEC, DWELL_MAX_SEC,
} from './slideshow.js'

function fail(m) { console.error(`FAIL: ${m}`); process.exit(1) }
function eq(a, b, m) { if (a !== b) fail(`${m} — got ${a} expected ${b}`) }

// Build a deterministic random source for shuffle tests.
function seedRandom(seq) {
  let i = 0
  return () => {
    const v = seq[i % seq.length]
    i++
    return v
  }
}

const PRESETS = [
  { id: 'alpha' }, { id: 'beta' }, { id: 'gamma' }, { id: 'delta' }, { id: 'epsilon' },
]

// --- Sequence ---
eq(
  pickNext({ presets: PRESETS, order: 'sequence', currentId: 'alpha' }),
  'beta',
  'sequence: alpha → beta',
)
eq(
  pickNext({ presets: PRESETS, order: 'sequence', currentId: 'epsilon' }),
  'alpha',
  'sequence: wraps at end',
)
eq(
  pickNext({ presets: PRESETS, order: 'sequence', currentId: 'unknown' }),
  'alpha',
  'sequence: unknown current → first preset',
)

// --- Shuffle (deterministic via seeded random) ---
// random() returns 0.0 → idx 0 → 'alpha'. Current is 'alpha', so we
// retry. Next seed gives 0.5 → idx 2 → 'gamma'. Done.
eq(
  pickNext({
    presets: PRESETS, order: 'shuffle', currentId: 'alpha',
    random: seedRandom([0.0, 0.5]),
  }),
  'gamma',
  'shuffle: avoids the current preset on collision',
)

// Single-preset library — shuffle just returns it.
eq(
  pickNext({ presets: [{ id: 'only' }], order: 'shuffle', currentId: 'only', random: () => 0 }),
  'only',
  'shuffle: 1-preset library returns the only choice',
)

// After 4 retries we accept whatever shuffle gives us (no infinite loop).
// If every roll lands on currentId we'd return currentId — confirm the
// loop bounds. seedRandom keeps re-returning 0 so all picks → currentId.
eq(
  pickNext({
    presets: PRESETS, order: 'shuffle', currentId: 'alpha',
    random: () => 0,
  }),
  'alpha',
  'shuffle: bounded retries; eventually returns whatever the RNG gave',
)

// --- Favourites ---
eq(
  pickNext({
    presets: PRESETS, order: 'favourites', currentId: 'beta',
    favouriteIds: ['beta', 'delta'],
  }),
  'delta',
  'favourites: beta → delta (next in favourites array)',
)
eq(
  pickNext({
    presets: PRESETS, order: 'favourites', currentId: 'delta',
    favouriteIds: ['beta', 'delta'],
  }),
  'beta',
  'favourites: wraps at end of favourites list',
)
eq(
  pickNext({
    presets: PRESETS, order: 'favourites', currentId: 'alpha',
    favouriteIds: ['alpha'],
  }),
  'alpha',
  'favourites: single favourite → returns itself (no second option)',
)
// Deleted favourites filtered out — falls back to sequence if no valid favs.
eq(
  pickNext({
    presets: PRESETS, order: 'favourites', currentId: 'alpha',
    favouriteIds: ['gone1', 'gone2'],
  }),
  'beta',
  'favourites: deleted favourites filtered, falls through to sequence',
)
// Empty favourites list → falls through to sequence.
eq(
  pickNext({
    presets: PRESETS, order: 'favourites', currentId: 'alpha',
    favouriteIds: [],
  }),
  'beta',
  'favourites: empty list → sequence behaviour',
)

// --- Empty / null presets ---
eq(pickNext({ presets: [], order: 'sequence', currentId: 'x' }), null, 'no presets → null')
eq(pickNext({ presets: null, order: 'sequence', currentId: 'x' }), null, 'null presets → null')

// --- Dwell clamp ---
eq(clampDwell(0), DWELL_MIN_SEC, 'clamp: below min')
eq(clampDwell(DWELL_MAX_SEC + 50), DWELL_MAX_SEC, 'clamp: above max')
eq(clampDwell(NaN), DWELL_MIN_SEC, 'clamp: NaN → min')
eq(clampDwell(15), 15, 'clamp: in-range value preserved')

// --- Category filter ---
// Use REAL preset ids that exist in lib/presetCategories MAP so
// filterByCategory exercises the live mapping (not a stub).
const REAL = [
  { id: 'spiral-galaxy' },  // space
  { id: 'aurora' },         // space
  { id: 'vortex' },         // physics
  { id: 'tornado' },        // physics
  { id: 'rain' },           // nature
  { id: 'fire' },           // nature
  { id: 'fireworks' },      // energy
]
// 'all' or undefined → no filter (passthrough).
eq(filterByCategory(REAL, 'all').length,   REAL.length, 'filterByCategory: all → passthrough')
eq(filterByCategory(REAL, undefined).length, REAL.length, 'filterByCategory: undefined → passthrough')
// Real category scoping.
eq(filterByCategory(REAL, 'space').length,   2, 'filterByCategory: space → 2 hits')
eq(filterByCategory(REAL, 'physics').length, 2, 'filterByCategory: physics → 2 hits')
eq(filterByCategory(REAL, 'energy').length,  1, 'filterByCategory: energy → 1 hit')
// Empty match falls back to the full list (so the slideshow never gets stuck).
eq(filterByCategory(REAL, 'no-such-cat').length, REAL.length, 'filterByCategory: zero matches → full list fallback')
// Empty input is just empty.
eq(filterByCategory([], 'space').length, 0, 'filterByCategory: empty in → empty out')

// pickNext SEQUENCE respects categoryFilter — alpha-galaxy → aurora is the
// only forward step inside the 'space' subset.
eq(
  pickNext({ presets: REAL, order: 'sequence', currentId: 'spiral-galaxy', categoryFilter: 'space' }),
  'aurora',
  'sequence + space filter: spiral-galaxy → aurora',
)
// Wraps within the filtered subset.
eq(
  pickNext({ presets: REAL, order: 'sequence', currentId: 'aurora', categoryFilter: 'space' }),
  'spiral-galaxy',
  'sequence + space filter: wraps within subset',
)
// Currently-loaded preset is outside the filter → unknown index, fallback to first of subset.
eq(
  pickNext({ presets: REAL, order: 'sequence', currentId: 'fire', categoryFilter: 'space' }),
  'spiral-galaxy',
  'sequence + space filter: out-of-subset current → first of subset',
)
// SHUFFLE respects the filter (random=0 → first matching item).
eq(
  pickNext({
    presets: REAL, order: 'shuffle', currentId: 'fire',
    categoryFilter: 'physics', random: () => 0,
  }),
  'vortex',
  'shuffle + physics filter: first of subset',
)
// FAVOURITES intentionally bypasses categoryFilter — explicit user picks win.
eq(
  pickNext({
    presets: REAL, order: 'favourites', currentId: 'fire',
    favouriteIds: ['fire', 'fireworks'], categoryFilter: 'space',
  }),
  'fireworks',
  'favourites + space filter: filter bypassed, walks favourites',
)
// Empty filter result falls back to the full list (no stuck loop).
eq(
  pickNext({ presets: REAL, order: 'sequence', currentId: 'spiral-galaxy', categoryFilter: 'no-such' }),
  'aurora',
  'sequence + unknown cat: falls back to full list (no stuck loop)',
)

console.log(`PASS: slideshow — ${SLIDESHOW_ORDERS.length} orders · dwell [${DWELL_MIN_SEC}, ${DWELL_MAX_SEC}] · categoryFilter`)
