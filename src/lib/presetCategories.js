// Single source of truth for grouping the ~46 built-in presets into
// browseable categories. Kept as a side-table (instead of editing every
// preset object) so the original presets.js stays code-only and the
// shape stays easy to extend without touching the per-preset closures.
//
// Each preset id MUST appear in exactly one category. The `unknown`
// fallback is returned by `categoryOf()` if a future preset is added
// but the mapping isn't updated — the UI degrades gracefully.

export const CATEGORIES = [
  { id: 'all',     label: 'All' },
  { id: 'space',   label: 'Space' },
  { id: 'physics', label: 'Physics' },
  { id: 'nature',  label: 'Nature' },
  { id: 'math',    label: 'Math' },
  { id: 'energy',  label: 'Energy' },
  { id: 'shapes',  label: 'Shapes' },
]

// id -> category id
const MAP = {
  // Space
  'spiral-galaxy':    'space',
  'aurora':           'space',
  'aurora-borealis':  'space',
  'nebula':           'space',
  'accretion-disk':   'space',
  'black-hole':       'space',
  'galaxy-collision': 'space',
  'wormhole':         'space',
  'magnetosphere':    'space',
  'supernova':        'space',
  'pulsar':           'space',
  'hyperjump':        'space',
  'solar-flare':      'space',
  'solar-wind':       'space',
  'quantum-tunnel':   'space',

  // Physics
  'vortex':           'physics',
  'tornado':          'physics',
  'billiards':        'physics',
  'double-pendulum':  'physics',
  'lorenz-attractor': 'physics',
  'swarm':            'physics',
  'fluid-vortex':     'physics',
  'plasma-storm':     'physics',
  'sphere-pulse':     'physics',

  // Nature
  'rain':             'nature',
  'snow':             'nature',
  'fire':             'nature',
  'lightning':        'nature',
  'lightning-storm':  'nature',
  'lightning-fractal':'nature',
  'cherry-blossoms':  'nature',
  'sandstorm':        'nature',
  'crystal-cave':     'nature',
  'crystal-lattice':  'nature',

  // Math
  'torus-knot':       'math',
  'fibonacci-spiral': 'math',
  'klein-bottle':     'math',
  'neural-network':   'math',
  'butterfly':        'math',
  'cube-wave':        'math',
  'dna-helix':        'math',
  'atom':             'math',

  // Energy
  'fireworks':        'energy',
  'sparkle':          'energy',
  'sound-wave':       'energy',

  // Shapes
  'heartbeat':        'shapes',
}

export function categoryOf(presetId) {
  return MAP[presetId] || 'shapes'
}

// Quick count by category for badge labels.
export function countByCategory(presets) {
  const counts = { all: presets.length }
  for (const c of CATEGORIES) if (c.id !== 'all') counts[c.id] = 0
  for (const p of presets) {
    const c = categoryOf(p.id)
    counts[c] = (counts[c] || 0) + 1
  }
  return counts
}
