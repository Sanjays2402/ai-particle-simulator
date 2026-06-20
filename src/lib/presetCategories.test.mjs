// Lightweight assertion harness: every built-in preset must map to a
// known category. Run via `node src/lib/presetCategories.test.mjs`.
// Kept zero-dep so it works without adding vitest/jest yet.
import { categoryOf, CATEGORIES, countByCategory } from './presetCategories.js'

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    console.error(`FAIL: ${msg} — got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`)
    process.exit(1)
  }
}

const knownIds = new Set(CATEGORIES.map(c => c.id))

// 1. categoryOf always returns a known category id.
const samples = [
  'spiral-galaxy', 'aurora', 'wormhole', 'magnetosphere', 'pulsar',
  'vortex', 'tornado', 'lorenz-attractor', 'fluid-vortex',
  'rain', 'snow', 'cherry-blossoms',
  'torus-knot', 'fibonacci-spiral', 'klein-bottle',
  'fireworks', 'sound-wave',
  'heartbeat',
]
for (const id of samples) {
  const c = categoryOf(id)
  if (c === 'all' || !knownIds.has(c)) {
    console.error(`FAIL: ${id} -> ${c} is not a valid category`)
    process.exit(1)
  }
}

// 2. countByCategory totals add up to presets.length (treating 'all' as total).
const fakePresets = samples.map(id => ({ id }))
const counts = countByCategory(fakePresets)
assertEq(counts.all, fakePresets.length, 'all bucket equals total')
let sum = 0
for (const c of CATEGORIES) {
  if (c.id !== 'all') sum += counts[c.id]
}
assertEq(sum, fakePresets.length, 'sum of sub-buckets equals total')

// 3. Unknown id falls back gracefully (does not throw, returns a valid category).
const fallback = categoryOf('nonexistent-preset-id')
if (!knownIds.has(fallback) || fallback === 'all') {
  console.error(`FAIL: unknown id fallback returned ${fallback}`)
  process.exit(1)
}

console.log(`PASS: presetCategories — ${samples.length} samples · sum=${sum} · fallback=${fallback}`)
