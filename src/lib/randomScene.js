// randomScene: generate a fully-randomised bookmark scene in one shot.
//
// "Smash" already exists as a load-time action (preset + style + theme +
// auto-rotate). This goes the rest of the way: every whitelisted
// bookmark field gets a random-but-tasteful value, so the user can
// click ONE button to roll a complete configuration AND have it saved
// for revisitation. Tasteful means: respect the same clamps the
// store setters use, never produce values that would look broken
// (particleCount=0, blendSeconds=-Infinity, palette stops both #000),
// and always set `currentPreset` to a real id from the supplied list.
//
// The function is intentionally pure + injects its RNG so:
//   1. Tests can pin behaviour with a seeded RNG.
//   2. Callers can choose between "true random" (Math.random) and
//      deterministic-from-seed without re-implementing the logic.
//
// Output shape matches `appendBookmark(items, { name, scene })`.

const STYLES        = ['sparkle', 'plasma', 'blob', 'ring', 'glow', 'dot']
// Built-in theme ids only — custom themes vary per-user so we'd need
// a side-channel to discover them. Built-ins guarantee the random
// scene loads on any browser regardless of localStorage state.
const BUILTIN_THEMES = [
  'neon', 'cyberpunk', 'ocean', 'fire', 'monochrome', 'rainbow',
  'sunset', 'forest', 'arctic', 'retro', 'vaporwave',
]
const FORCE_FIELDS  = [null, 'attractor', 'repulsor', 'vortex', 'turbulence']
const AUDIO_MODES   = ['level', 'bass', 'beat']
const SLIDESHOW_ORD = ['sequence', 'shuffle', 'favourites']

// --- Bias chips (R12.04) ---
// "Surprise me!" rolls every range uniformly across its full safe
// band. "Mostly Calm" stays in the bottom 30% — small counts, gentle
// motion, soft FX, low force-field probability, no kaleidoscope, bg
// gradient on-ish so the calm has texture. "Mostly Wild" hugs the
// top 30% — big counts, faster motion, hot FX, kaleidoscope and
// vortices encouraged. Each chip is a pure data object — the
// generator selects ranges from it so the same RNG seed produces
// different but predictable scenes per chip.
//
// Shape:
//   counts        : [min, max]
//   speedRange    : [min, max]
//   glowRange     : [min, max]
//   attractRange  : [min, max]
//   bgChance      : 0..1
//   forceFieldChance : 0..1 — when fails, scene gets `null` force
//   kaleidoChance : 0..1
//   hueCycleChance: 0..1
//   trailsChance  : 0..1
//   shakeChance   : 0..1
//   reactiveBgChance: 0..1
//   chromaChance, vignetteChance, grainChance : 0..1
export const SCENE_BIAS_DEFAULT = 'surprise'

export const SCENE_BIASES = [
  {
    id: 'calm',
    label: 'Mostly Calm',
    hint: 'Gentle motion · soft FX · low particle counts',
    counts:        [5000, 14000],
    speedRange:    [0.3, 0.9],
    glowRange:     [0.1, 0.45],
    attractRange:  [0.5, 1.6],
    bgChance:      0.7,
    forceFieldChance: 0.25,  // mostly no force; subtle if present
    forceTypes:    [null, null, null, 'attractor'],  // weight toward null
    kaleidoChance: 0.05,
    hueCycleChance: 0.4,
    trailsChance:  0.6,
    shakeChance:   0.1,
    reactiveBgChance: 0.5,
    chromaChance:  0.2,
    vignetteChance: 0.6,
    grainChance:   0.4,
  },
  {
    id: 'surprise',
    label: 'Surprise',
    hint: 'Roll every range across its full safe band',
    counts:        [5000, 40000],
    speedRange:    [0.3, 2.5],
    glowRange:     [0.1, 0.9],
    attractRange:  [0.5, 4.0],
    bgChance:      0.45,
    forceFieldChance: 0.8,
    forceTypes:    [null, 'attractor', 'repulsor', 'vortex', 'turbulence'],
    kaleidoChance: 0.25,
    hueCycleChance: 0.4,
    trailsChance:  0.5,
    shakeChance:   0.35,
    reactiveBgChance: 0.5,
    chromaChance:  0.4,
    vignetteChance: 0.5,
    grainChance:   0.3,
  },
  {
    id: 'wild',
    label: 'Mostly Wild',
    hint: 'Big counts · hot FX · vortices encouraged',
    counts:        [25000, 40000],
    speedRange:    [1.5, 2.5],
    glowRange:     [0.55, 0.9],
    attractRange:  [2.5, 4.0],
    bgChance:      0.3,
    forceFieldChance: 0.9,
    // Weight away from null and toward vortex/turbulence.
    forceTypes:    ['vortex', 'vortex', 'turbulence', 'turbulence', 'repulsor', 'attractor'],
    kaleidoChance: 0.6,
    hueCycleChance: 0.8,
    trailsChance:  0.3,
    shakeChance:   0.7,
    reactiveBgChance: 0.7,
    chromaChance:  0.7,
    vignetteChance: 0.35,
    grainChance:   0.25,
  },
]

const SCENE_BIAS_BY_ID = new Map(SCENE_BIASES.map(b => [b.id, b]))

export function isValidSceneBias(id) {
  return typeof id === 'string' && SCENE_BIAS_BY_ID.has(id)
}

export function getSceneBias(id) {
  if (!isValidSceneBias(id)) return SCENE_BIAS_BY_ID.get(SCENE_BIAS_DEFAULT)
  return SCENE_BIAS_BY_ID.get(id)
}

// R20.07 — Smash bias OVERRIDES. Graduates R12.04's hard-coded chips
// by letting power users tweak any bias's range values (counts /
// speed / glow / attract / chances / forceTypes) and persist the
// edits per-chip. Three shipped chips ('calm' / 'surprise' / 'wild')
// can carry independent overrides; the rest of getSceneBias's
// behaviour stays — the chip's ID, label, and hint never change, so
// the UI stays familiar after a power-user edit.
//
// Storage: per-chip JSON blob under `smash-bias-overrides-<id>`.
// Each entry's value is a PARTIAL bias map — only the keys the user
// overrode are stored. resolveSceneBias(id, storage) merges the
// shipped default with any override and returns the live bias.
//
// Fields that can be tweaked (every key on the SCENE_BIASES entry
// except the immutable 'id' / 'label' / 'hint' identity triple).
// Defensive: unknown keys are dropped on import; non-finite values
// fall back to defaults; corrupt JSON → no override applied.
export const SCENE_BIAS_RANGE_FIELDS = [
  'counts', 'speedRange', 'glowRange', 'attractRange',
]
export const SCENE_BIAS_CHANCE_FIELDS = [
  'bgChance', 'forceFieldChance', 'kaleidoChance', 'hueCycleChance',
  'trailsChance', 'shakeChance', 'reactiveBgChance',
  'chromaChance', 'vignetteChance', 'grainChance',
]
export const SCENE_BIAS_OVERRIDE_FIELDS = [
  ...SCENE_BIAS_RANGE_FIELDS,
  ...SCENE_BIAS_CHANCE_FIELDS,
  'forceTypes',   // string-array, validated by entry
]

// Validate a single [min, max] pair. Returns null on bad input so the
// caller can drop the field. Floats accepted; min <= max enforced.
// Sub-zero values are rejected (every range in SCENE_BIASES is
// non-negative — keeps a power-user from breaking the generator with
// negative counts or glow).
function sanitizeRange(raw) {
  if (!Array.isArray(raw) || raw.length !== 2) return null
  const [a, b] = raw
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  if (a < 0 || b < 0) return null
  if (a > b) return null
  return [a, b]
}

// Validate a single chance probability — finite, [0, 1].
function sanitizeChance(raw) {
  if (!Number.isFinite(raw)) return null
  if (raw < 0 || raw > 1) return null
  return raw
}

// Validate forceTypes — array of valid force-field strings (or null
// entries, which the random generator interprets as "no force field").
// Empty array is rejected (would deadlock pick()).
const VALID_FORCE_TYPES = new Set([null, 'attractor', 'repulsor', 'vortex', 'turbulence'])
function sanitizeForceTypes(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const out = []
  for (const f of raw) {
    if (!VALID_FORCE_TYPES.has(f)) return null
    out.push(f)
  }
  return out
}

// Sanitize a partial bias override against the schema. Returns a fresh
// object with ONLY the keys the user actually overrode (and that pass
// validation). Unknown keys are silently dropped. Used both on import
// from localStorage and on every save.
export function sanitizeBiasOverride(raw) {
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of SCENE_BIAS_RANGE_FIELDS) {
    if (k in raw) {
      const r = sanitizeRange(raw[k])
      if (r) out[k] = r
    }
  }
  for (const k of SCENE_BIAS_CHANCE_FIELDS) {
    if (k in raw) {
      const c = sanitizeChance(raw[k])
      if (c !== null) out[k] = c
    }
  }
  if ('forceTypes' in raw) {
    const f = sanitizeForceTypes(raw.forceTypes)
    if (f) out.forceTypes = f
  }
  return out
}

// Storage key for one bias chip's overrides. Per-chip so a 'calm'
// edit doesn't clobber a 'wild' edit (matches the UX intent — every
// chip has its own personality).
export function biasOverrideStorageKey(biasId) {
  return `smash-bias-overrides-${biasId}`
}

// Load one chip's override map. Returns {} when none exists / corrupt.
export function loadBiasOverride(biasId, storage) {
  if (!isValidSceneBias(biasId)) return {}
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return {}
  try {
    const raw = store.getItem(biasOverrideStorageKey(biasId))
    if (!raw) return {}
    return sanitizeBiasOverride(JSON.parse(raw))
  } catch { return {} }
}

// Persist one chip's override map. Pass {} (or null) to CLEAR the
// override and restore the shipped defaults. Returns the sanitised
// version that was actually written so the caller can update state.
export function saveBiasOverride(biasId, override, storage) {
  if (!isValidSceneBias(biasId)) return {}
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null)
  if (!store) return {}
  const key = biasOverrideStorageKey(biasId)
  const safe = sanitizeBiasOverride(override)
  try {
    if (Object.keys(safe).length === 0) {
      store.removeItem(key)
    } else {
      store.setItem(key, JSON.stringify(safe))
    }
  } catch { /* quota / private mode */ }
  return safe
}

// Reset one chip's override (cascading remove). Convenience wrapper
// around saveBiasOverride({}).
export function resetBiasOverride(biasId, storage) {
  return saveBiasOverride(biasId, {}, storage)
}

// True when the bias has at least one user override active. Used by
// the UI to surface a "edited" badge next to the chip.
export function hasBiasOverride(biasId, storage) {
  return Object.keys(loadBiasOverride(biasId, storage)).length > 0
}

// Resolve a chip ID to its LIVE bias map (shipped default merged
// with any persisted override). Returns the same shape as
// getSceneBias — generateRandomScene accepts the result unchanged.
// Pure of localStorage when an override object is passed explicitly
// (used by tests + the editor's preview path).
export function resolveSceneBias(id, opts = {}) {
  const baseline = getSceneBias(id)
  const override = opts.override
    ? sanitizeBiasOverride(opts.override)
    : loadBiasOverride(baseline.id, opts.storage)
  if (Object.keys(override).length === 0) return baseline
  return { ...baseline, ...override }
}

// A small palette of hand-picked colour pairs known to look good
// together. Pure random hex pairs are mud half the time, so we
// pre-select 12 combinations across the warm / cool / neon axes.
export const PALETTE_PAIRS = [
  ['#6366f1', '#ec4899'], // indigo + pink (default)
  ['#22c55e', '#06b6d4'], // emerald + cyan
  ['#f97316', '#fbbf24'], // orange + amber
  ['#a855f7', '#3b82f6'], // purple + blue
  ['#ef4444', '#f97316'], // red + orange
  ['#14b8a6', '#a3e635'], // teal + lime
  ['#f43f5e', '#8b5cf6'], // rose + violet
  ['#0ea5e9', '#e879f9'], // sky + fuchsia
  ['#84cc16', '#facc15'], // lime + yellow
  ['#06b6d4', '#3b82f6'], // cyan + blue
  ['#ec4899', '#f59e0b'], // pink + amber
  ['#a78bfa', '#34d399'], // purple + green
]

// Background gradient pairs that play nicely under the particles.
export const BG_GRADIENT_PAIRS = [
  ['#1e1b4b', '#0a0a0f'],  // Indigo Night
  ['#064e3b', '#0c0a1e'],  // Aurora Mist
  ['#7c2d12', '#0a0a0f'],  // Ember Glow
  ['#1e293b', '#3b0764'],  // Twilight
  ['#1a1a2e', '#0f0f17'],  // Ink Wash
  ['#7c2d12', '#1e1b4b'],  // Sunrise
]

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)] }
function rrange(min, max, rng) { return min + rng() * (max - min) }
function rstep(min, max, step, rng) {
  const range = max - min
  const n = Math.floor(rng() * (Math.floor(range / step) + 1))
  return min + n * step
}
function chance(p, rng) { return rng() < p }

// Build a friendly "Smash <date> <hh:mm>" name unique per second.
// Falls back to plain "Smash" if Date is somehow unavailable.
export function makeSmashName(now = new Date()) {
  try {
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    const ss = String(now.getSeconds()).padStart(2, '0')
    return `Smash ${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
  } catch { return 'Smash' }
}

// Generate one random scene object. `presetIds` is a non-empty array
// of strings (caller passes presets.map(p => p.id)). `opts.rng`
// defaults to Math.random for production; tests should pin it.
// `opts.bias` selects a SCENE_BIASES entry by id — defaults to
// 'surprise' (the historic full-range roll).
//
// Returns: { name, scene } ready for `appendBookmark(items, ...)`.
export function generateRandomScene(presetIds, opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random
  const now = opts.now || new Date()
  // R20.07 — resolve via the override-aware path so any persisted
  // per-chip edits flow through automatically. Tests can pin a
  // specific override via opts.biasOverride; the live UI path picks
  // up overrides from localStorage transparently.
  const bias = resolveSceneBias(opts.bias, {
    override: opts.biasOverride,
    storage: opts.storage,
  })

  if (!Array.isArray(presetIds) || presetIds.length === 0) {
    throw new Error('generateRandomScene: presetIds must be a non-empty array')
  }

  const palette = pick(PALETTE_PAIRS, rng)
  const bg      = pick(BG_GRADIENT_PAIRS, rng)
  // Honour the bias's per-type weighting (calm leans away from
  // force fields, wild leans into vortices). After the weighted pick,
  // a second probability gate (forceFieldChance) lets us optionally
  // silence the field anyway — letting calm produce a no-force scene
  // ~75% of the time even when the type pool isn't full of nulls.
  const forceType = chance(bias.forceFieldChance, rng)
    ? pick(bias.forceTypes || FORCE_FIELDS, rng)
    : null

  // Build the scene field-by-field. Clamps mirror the store setters'
  // clamps so applyScene later doesn't need to re-clamp. Every range
  // pulls from `bias.<...Range>` so the same RNG seed produces a
  // different but predictable scene per chip.
  const scene = {
    currentPreset: pick(presetIds, rng),
    particleCount: rstep(bias.counts[0], bias.counts[1], 1000, rng),
    speed:         Number(rrange(bias.speedRange[0], bias.speedRange[1], rng).toFixed(2)),
    glowIntensity: Number(rrange(bias.glowRange[0],  bias.glowRange[1],  rng).toFixed(2)),
    visualStyle:   pick(STYLES, rng),
    theme:         pick(BUILTIN_THEMES, rng),
    trails:        chance(bias.trailsChance, rng),
    mouseAttract:  chance(0.3, rng),
    attractStrength: Number(rrange(bias.attractRange[0], bias.attractRange[1], rng).toFixed(2)),
    autoRotate:    chance(0.5, rng),
    autoRotateSpeed: Number(rrange(0.5, 4.0, rng).toFixed(2)),
    orbitSpeed:    Number(rrange(0.2, 1.5, rng).toFixed(2)),
    minDistance:   3,
    maxDistance:   50,

    // Palette is opt-in; when on, both stops + mix come from the curated list.
    paletteEnabled: chance(0.6, rng),
    paletteA:      palette[0],
    paletteB:      palette[1],
    paletteMix:    Number(rrange(0.3, 0.9, rng).toFixed(2)),

    // Post-FX — each is independent so combinations can surprise users.
    chromaticAberration: chance(bias.chromaChance, rng),
    chromaticIntensity:  Number(rrange(0.001, 0.008, rng).toFixed(4)),
    vignette:            chance(bias.vignetteChance, rng),
    vignetteIntensity:   Number(rrange(0.3, 0.7, rng).toFixed(2)),
    filmGrain:           chance(bias.grainChance, rng),
    filmGrainIntensity:  Number(rrange(0.1, 0.3, rng).toFixed(2)),

    // Kaleidoscope is high-impact so it's biased aggressively.
    kaleidoscopeEnabled: chance(bias.kaleidoChance, rng),
    kaleidoscopeSegments: Math.floor(rrange(2, 16, rng)),

    // Hue cycle is a slow accent.
    hueCycleEnabled: chance(bias.hueCycleChance, rng),
    hueCycleSpeed:   Number(rrange(2, 20, rng).toFixed(1)),

    // Physics defaults — gravity off most of the time so scenes don't fall.
    gravityEnabled:     chance(0.2, rng),
    gravityStrength:    Number(rrange(0.2, 1.0, rng).toFixed(2)),
    collisionsEnabled:  chance(0.15, rng),
    forceFieldType:     forceType,
    forceFieldStrength: Number(rrange(0.5, 2.0, rng).toFixed(2)),
    forceFieldCenter:   [
      Number(rrange(-3, 3, rng).toFixed(2)),
      Number(rrange(-2, 2, rng).toFixed(2)),
      Number(rrange(-3, 3, rng).toFixed(2)),
    ],

    // Camera shake on beat — paired with audio mode below.
    cameraShake:          chance(bias.shakeChance, rng),
    cameraShakeIntensity: Number(rrange(0.2, 0.8, rng).toFixed(2)),
    audioMode:            pick(AUDIO_MODES, rng),

    // Background gradient — opt-in; curated pair.
    bgGradientEnabled: chance(bias.bgChance, rng),
    bgGradientA:       bg[0],
    bgGradientB:       bg[1],
    bgGradientAngle:   Math.floor(rrange(0, 360, rng)),
    bgGradientAudioReactive: chance(bias.reactiveBgChance, rng),
    bgGradientAudioStrength: Number(rrange(0.3, 0.9, rng).toFixed(2)),

    // Slideshow off by default — user can opt in after smashing.
    slideshowEnabled:         false,
    slideshowDwellSec:        Math.floor(rrange(4, 20, rng)),
    slideshowOrder:           pick(SLIDESHOW_ORD, rng),
    slideshowRespectCategory: chance(0.5, rng),
  }

  return { name: makeSmashName(now), scene }
}