import { create } from 'zustand'
import { presets } from './presets'
import {
  loadStats, saveStats, beginSession, recordPresetLoad, bumpStat,
  addSessionSeconds,
} from './lib/sessionStats'
import { clampFocusDistance, clampFocalLength, clampBokehScale } from './lib/depthOfField'
import { clampIntensity as clampWindIntensity, clampAzimuth as clampWindAzimuth, clampPitch as clampWindPitch } from './lib/wind'
import { loadThemes as loadCustomThemes, saveThemes as saveCustomThemes, addTheme as addCustomThemeHelper, removeTheme as removeCustomThemeHelper, resolveTheme as resolveThemeHelper } from './lib/customThemes'
import { clampAmplitude as clampNoiseAmp, clampFrequency as clampNoiseFreq, clampSpeed as clampNoiseSpeed } from './lib/noiseDeformer'
import {
  defaultPeakTrailCurveParams as defaultPeakTrailCurveParamsHelper,
  sanitizeCurveParams as sanitizeCurveParamsHelper,
  setCurveParam as setCurveParamHelper,
  // R21.21 — palette validator for the trail tint chip rail
  isValidTrailPalette as isValidTrailPaletteHelper,
} from './lib/waveform'
import { recordThumbMetadata as recordPresetThumbMeta } from './lib/presetThumbnails'
import {
  loadAttractors as loadNamedAttractors,
  saveAttractors as saveNamedAttractors,
  addAttractor as addNamedAttractorHelper,
  removeAttractor as removeNamedAttractorHelper,
  updateAttractor as updateNamedAttractorHelper,
  toggleAttractor as toggleNamedAttractorHelper,
  moveAttractor as moveNamedAttractorHelper,
  // R15.20 — list-order reorder helpers
  moveAttractorUp as moveNamedAttractorUpHelper,
  moveAttractorDown as moveNamedAttractorDownHelper,
  // R25.20 — index-based reorder for MidiPanel binding-group DnD
  moveAttractorByIndex as moveNamedAttractorByIndexHelper,
  // R16.18 — bulk jump-to-position helper
  moveAttractorTo1BasedPosition as moveNamedAttractorTo1BasedPositionHelper,
  // R17.17 — bulk-delete helper (shift-click multi-select)
  removeAttractors as removeNamedAttractorsHelper,
} from './lib/namedAttractors'
import { clampHueReactiveStrength as clampBgGradientStrength, normalizeReactiveCurve as normalizeBgGradientCurve } from './lib/bgGradient'
// R34.B — cinematic framing-guide id roster + sanitiser.
import {
  sanitizeFramingId as sanitizeFramingGuideId,
  nextFramingId as nextFramingGuideId,
  sanitizeGridId as sanitizeFramingGridId,
  nextGridId as nextFramingGridId,
  sanitizeSpiralOrientation,
  nextSweepNonce,
  sanitizeSpiralSweepSpeed,
  nextSpiralSweepSpeed,
  sanitizeSpiralSweepEasing,
  nextSpiralSweepEasing,
  // R42.M — custom aspect-ratio parser + clamp.
  parseAspectRatio,
  clampCustomRatio,
  // R43.M — recent custom ratios MRU.
  sanitizeRecentRatios,
  pushRecentRatio,
  sameRecentRatios,
  // R44.M — pinned (favourite) custom ratios.
  sanitizePinnedRatios,
  togglePinnedRatio as togglePinnedRatioHelper,
  movePinnedRatio as movePinnedRatioHelper,
} from './lib/framingGuides'
// R38.K — per-motion calm gate sanitiser + toggle.
import { sanitizeCalmGates, toggleCalmGate } from './lib/calmMode'
// R34.C — screenshot self-timer delay sanitiser + default.
import {
  sanitizeTimerDelay as sanitizeTimerDelayHelper,
  DEFAULT_TIMER_DELAY as DEFAULT_TIMER_DELAY_VAL,
  sanitizeBurstCount as sanitizeBurstCountHelper,
  DEFAULT_BURST_COUNT as DEFAULT_BURST_COUNT_VAL,
} from './lib/selfTimer'
// R42.G — screenshot watermark/caption anchor sanitiser.
import { sanitizeWatermarkAnchor } from './lib/screenshotWatermark'
// R29.43 — persisted hotkey-chain fade curve preference helpers.
import {
  sanitizeHotkeyChainFadeCurve as sanitizeHotkeyChainFadeCurveHelper,
  nextHotkeyChainFadeCurve as nextHotkeyChainFadeCurveHelper,
} from './lib/midiPresets'

// Lightweight settings persistence: a subset of user-tweakable values
// is read once on store init and written back whenever it changes.
// Doing this by hand (instead of zustand/middleware/persist) keeps the
// API surface unchanged and lets us pick exactly which keys persist.
const PERSIST_KEY = 'particle-settings-v1'
// R34.B — framing-guide aspect-ratio id (separate key so it round-trips
// independently of the main settings blob).
const FRAMING_GUIDE_KEY = 'particle-framing-guide-v1'
// R35.B — composition grid inside the framing guide, own key.
const FRAMING_GRID_KEY = 'particle-framing-grid-v1'
// R37.B — golden-spiral orientation (which corner the eye converges
// toward), own key so it round-trips independently of the grid mode.
const SPIRAL_ORIENT_KEY = 'particle-spiral-orientation-v1'
const SPIRAL_SWEEP_SPEED_KEY = 'particle-spiral-sweep-speed-v1'
const SPIRAL_SWEEP_EASING_KEY = 'particle-spiral-sweep-easing-v1'
// R42.M — custom framing aspect ratio (numeric width/height), own key.
const FRAMING_CUSTOM_RATIO_KEY = 'particle-framing-custom-ratio-v1'
// R43.M — recent custom aspect ratios (MRU list of numbers), own key.
const FRAMING_RECENT_RATIOS_KEY = 'particle-framing-recent-ratios-v1'
// R44.M — pinned (favourite) custom aspect ratios, own key.
const FRAMING_PINNED_RATIOS_KEY = 'particle-framing-pinned-ratios-v1'
// R34.C — screenshot self-timer delay (seconds), own key.
const SCREENSHOT_TIMER_KEY = 'particle-screenshot-timer-v1'
// R35.C — screenshot burst count (frames per capture), own key.
const SCREENSHOT_BURST_KEY = 'particle-screenshot-burst-v1'
// R42.G — screenshot watermark/caption toggle + anchor, own keys.
const SCREENSHOT_WATERMARK_KEY = 'particle-screenshot-watermark-v1'
const SCREENSHOT_WATERMARK_ANCHOR_KEY = 'particle-screenshot-watermark-anchor-v1'
// R43.G — optional second caption line: a user wordmark + a show-date
// toggle, own keys so they round-trip independently of the main toggle.
const SCREENSHOT_WATERMARK_WORDMARK_KEY = 'particle-screenshot-watermark-wordmark-v1'
const SCREENSHOT_WATERMARK_DATE_KEY = 'particle-screenshot-watermark-date-v1'
// R35.E — zen ambient auto-orbit preference, own key.
const ZEN_AUTO_ORBIT_KEY = 'particle-zen-auto-orbit-v1'
// R42.E — zen "Now Playing" overlay preference, own key.
const ZEN_NOW_PLAYING_KEY = 'particle-zen-now-playing-v1'
// R36.D — live perf-budget status pill toggle, own key.
const PERF_PILL_KEY = 'particle-perf-pill-v1'
// R36.K — global calm-mode master toggle, own key.
const CALM_MODE_KEY = 'particle-calm-mode-v1'
const CALM_GATES_KEY = 'particle-calm-gates-v1'
const PERSIST_FIELDS = [
  'particleCount', 'speed', 'glowIntensity', 'visualStyle',
  'theme', 'trails', 'mouseAttract', 'attractStrength',
  'orbitSpeed', 'autoRotate', 'autoRotateSpeed',
  'minDistance', 'maxDistance',
]

function loadPersisted() {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    // Whitelist filter so renamed/removed fields don't leak in.
    const out = {}
    for (const k of PERSIST_FIELDS) {
      if (k in parsed) out[k] = parsed[k]
    }
    return out
  } catch { return {} }
}

function savePersisted(state) {
  try {
    const out = {}
    for (const k of PERSIST_FIELDS) out[k] = state[k]
    localStorage.setItem(PERSIST_KEY, JSON.stringify(out))
  } catch { /* quota / private mode */ }
}

const THEMES = {
  neon:       { neon: '#00ff88', hueShift: 0 },
  cyberpunk:  { neon: '#ff00ff', hueShift: 300 },
  ocean:      { neon: '#00d4ff', hueShift: 200 },
  fire:       { neon: '#ff6600', hueShift: 30 },
  monochrome: { neon: '#cccccc', hueShift: 0, saturation: 0 },
  rainbow:    { neon: '#ff00ff', hueShift: -1 }, // -1 = cycle
  // v2 themes — each picks an accent + a global hue offset so existing
  // presets pick up the look without touching their per-particle code.
  sunset:     { neon: '#ff9d5c', hueShift: 15 },   // warm orange-pink dusk
  forest:     { neon: '#22c55e', hueShift: 120 },  // deep green canopy
  arctic:     { neon: '#bae6fd', hueShift: 195 },  // pale icy blue
  retro:      { neon: '#f472b6', hueShift: 320 },  // 80s pink/magenta
  vaporwave:  { neon: '#a78bfa', hueShift: 270 },  // pastel purple/teal
}

export { THEMES }

// Session-stats bootstrap. We bump totalSessions exactly once per page
// load, then keep the in-memory copy on the store so panels can render
// from a single subscription. A page-hide listener flushes accumulated
// seconds back to disk (set up after `useStore` is created below).
const _statsBoot = beginSession(loadStats())
saveStats(_statsBoot)
const _sessionStartedAt = Date.now()

export const useStore = create((set, get) => {
  const persisted = loadPersisted()
  return {
  // Particle settings
  particleCount: 20000,
  speed: 1.0,
  glowIntensity: 0.3,
  visualStyle: 'sparkle',

  // Simulation state
  playing: true,
  currentPreset: null,
  particleFn: null,
  particleFnSource: '',
  infoTitle: '',
  infoDesc: '',

  // Dynamic controls from addControl()
  dynamicControls: [],
  dynamicValues: {},

  // Camera controls
  orbitSpeed: 0.5,
  autoRotate: false,
  autoRotateSpeed: 2.0,
  minDistance: 3,
  maxDistance: 50,

  // New features
  mouseAttract: false,
  attractStrength: 2.0,
  theme: 'neon',
  trails: false,
  performanceMode: false,
  audioReactive: false,
  audioLevel: 0,
  // Per-band audio levels: bass = bottom 12% of bins, mid = 12–40%, treble = 40–100%.
  audioBass: 0,
  audioMid: 0,
  audioTreble: 0,
  // Beat detector: pulses to 1 then decays.
  audioBeat: 0,
  // Reactivity mode: 'level' (legacy), 'bass', 'beat'.
  audioMode: 'level',

  // Physics engine
  gravityEnabled: false,
  gravityStrength: 0.5,
  collisionsEnabled: false,
  forceFieldType: null, // 'attractor' | 'repulsor' | 'vortex' | 'turbulence' | null
  forceFieldStrength: 1.0,
  // Position of the force-field's center in world space. Defaults to
  // origin so legacy behavior is unchanged; users can move it by
  // enabling "Place Field" and clicking on the canvas.
  forceFieldCenter: [0, 0, 0],
  // True = next canvas pointer-up sets forceFieldCenter to the
  // intersected world point, then turns this flag off.
  placeFieldMode: false,
  setForceFieldCenter: (xyz) => set({ forceFieldCenter: xyz }),
  setPlaceFieldMode: (v) => set({ placeFieldMode: v }),

  // Named attractors — first-class force-field OBJECTS that coexist
  // alongside the legacy single forceFieldType. Each entry has its
  // own type / strength / position / radius / enabled flag so users
  // can compose multiple effects (e.g. a vortex + a repulsor) in one
  // scene. Persisted to localStorage via lib/namedAttractors.
  namedAttractors: loadNamedAttractors(),
  // When non-null, the next canvas pointer-up will move this
  // attractor's center to the intersected world point, then clear
  // this flag. null = not placing anything. The string is the
  // attractor id so multiple slots can each enter "place" mode
  // independently without sharing a single placeFieldMode flag.
  placingAttractorId: null,
  setPlacingAttractorId: (id) => set({ placingAttractorId: id || null }),
  addNamedAttractor: (partial) => {
    const next = addNamedAttractorHelper(get().namedAttractors, partial)
    saveNamedAttractors(next)
    set({ namedAttractors: next })
    return next[next.length - 1] ? next[next.length - 1].id : null
  },
  removeNamedAttractor: (id) => {
    const next = removeNamedAttractorHelper(get().namedAttractors, id)
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  // R17.17 — bulk-delete by id collection (Set | Array | iterable).
  // Used by the LeftSidebar's shift-click multi-select bulk-delete UX.
  // Skips the save when nothing was actually removed (ref-equality
  // contract from the lib helper).
  removeNamedAttractors: (ids) => {
    const next = removeNamedAttractorsHelper(get().namedAttractors, ids)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  updateNamedAttractor: (id, patch) => {
    const next = updateNamedAttractorHelper(get().namedAttractors, id, patch)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  toggleNamedAttractor: (id) => {
    const next = toggleNamedAttractorHelper(get().namedAttractors, id)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  moveNamedAttractor: (id, position) => {
    const next = moveNamedAttractorHelper(get().namedAttractors, id, position)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  // R15.20 — reorder helpers. Returns the helpers' ref-equal-on-no-op
  // sentinel through, so a click on "Move up" at the top is a noop
  // without a state churn.
  moveNamedAttractorUp: (id) => {
    const next = moveNamedAttractorUpHelper(get().namedAttractors, id)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  moveNamedAttractorDown: (id) => {
    const next = moveNamedAttractorDownHelper(get().namedAttractors, id)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  // R16.18 — jump to an arbitrary 1-based position in one call.
  // Wraps the same ref-equal-on-no-op contract as the up/down helpers.
  moveNamedAttractorToPosition: (id, position1Based) => {
    const next = moveNamedAttractorTo1BasedPositionHelper(get().namedAttractors, id, position1Based)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  // R25.20 — index-to-index reorder. Powers the MidiPanel binding-group
  // drag-and-drop where the user grabs ONE group header and drops it on
  // another to swap places. Wraps the lib helper's same ref-equal-on-
  // no-op contract so a no-op drop (drag to same slot) skips state work.
  moveNamedAttractorByIndex: (fromIdx, toIdx) => {
    const next = moveNamedAttractorByIndexHelper(get().namedAttractors, fromIdx, toIdx)
    if (next === get().namedAttractors) return
    saveNamedAttractors(next)
    set({ namedAttractors: next })
  },
  // Bulk replacement — used by Scene Bookmarks to round-trip the full
  // attractor list. Normalizes each entry through the namedAttractors
  // lib so a bookmark from an older app version with extra/missing
  // fields can't poison the store.
  setNamedAttractors: (list) => {
    // We can't import normalizeAttractor here without bloating the
    // header; sanitize() via add+toggleHelper would loop. Easiest:
    // run the input through saveAttractors's filter + reload by
    // re-mapping each row through the helpers we already imported.
    // Cheapest: lean on namedAttractors's own normalize via a fresh
    // re-add loop. But that mints new ids, breaking bookmark fidelity.
    // Inline a minimal validator — same shape as normalizeAttractor.
    if (!Array.isArray(list)) {
      saveNamedAttractors([])
      set({ namedAttractors: [] })
      return
    }
    // Use addNamedAttractorHelper to leverage validation while
    // preserving the SOURCE ids (we pass them through partial).
    let acc = []
    for (const row of list) {
      if (!row || typeof row !== 'object') continue
      acc = addNamedAttractorHelper(acc, row)
    }
    saveNamedAttractors(acc)
    set({ namedAttractors: acc })
  },

  // Recording & Replay
  isRecording: false,
  recordingBuffer: [],
  recordingStartTime: null,
  isReplaying: false,
  replayFrame: 0,
  replaySpeed: 1,
  replayLoop: false,
  gifProgress: null, // null | { current, total } | 'done'
  isExportingGif: false,

  setIsRecording: (v) => set({ isRecording: v }),
  setRecordingStartTime: (v) => set({ recordingStartTime: v }),
  addRecordingFrame: (frame) => set(s => ({
    recordingBuffer: [...s.recordingBuffer, frame]
  })),
  clearRecording: () => set({ recordingBuffer: [], recordingStartTime: null, isReplaying: false, replayFrame: 0 }),
  setIsReplaying: (v) => set({ isReplaying: v }),
  setReplayFrame: (v) => set({ replayFrame: v }),
  setReplaySpeed: (v) => set({ replaySpeed: v }),
  setReplayLoop: (v) => set({ replayLoop: v }),
  setGifProgress: (v) => set({ gifProgress: v }),

  startRecording: () => set({ isRecording: true, recordingBuffer: [], recordingStartTime: Date.now(), isReplaying: false }),
  stopRecording: () => set({ isRecording: false }),
  enterReplay: () => set(s => s.recordingBuffer.length > 0 ? { isReplaying: true, replayFrame: 0, playing: false } : {}),
  exitReplay: () => set({ isReplaying: false, playing: true }),

  // Favorites & Search
  favoritedPresets: JSON.parse(localStorage.getItem('favorite-presets') || '[]'),
  recentPresets: JSON.parse(localStorage.getItem('recent-presets') || '[]'),
  presetSearch: '',
  showFavoritesOnly: false,
  presetCategory: 'all',
  setPresetCategory: (v) => set({ presetCategory: v }),

  toggleFavorite: (id) => set(s => {
    const favs = s.favoritedPresets.includes(id)
      ? s.favoritedPresets.filter(f => f !== id)
      : [...s.favoritedPresets, id]
    localStorage.setItem('favorite-presets', JSON.stringify(favs))
    return { favoritedPresets: favs }
  }),
  setPresetSearch: (v) => set({ presetSearch: v }),
  setShowFavoritesOnly: (v) => set({ showFavoritesOnly: v }),

  // Preset thumbnails
  capturePresetThumbnail: (presetId) => {
    try {
      const canvas = document.querySelector('#particle-canvas canvas')
      if (!canvas) return
      const tmpCanvas = document.createElement('canvas')
      tmpCanvas.width = 120
      tmpCanvas.height = 80
      const ctx = tmpCanvas.getContext('2d')
      ctx.drawImage(canvas, 0, 0, 120, 80)
      const dataUrl = tmpCanvas.toDataURL('image/jpeg', 0.5)
      localStorage.setItem(`preset-thumb-${presetId}`, dataUrl)
      // R19.13 — pair the live-capture path with metadata so the
      // hover badge in PresetCarousel can tag this thumb as 'live'
      // and time-stamp it. Best-effort: a metadata write failure
      // doesn't cancel the thumb itself.
      try { recordPresetThumbMeta(presetId, { width: 120, height: 80, source: 'live' }) }
      catch { /* metadata is the badge, the thumb is the thing */ }
    } catch (e) { console.warn('Thumbnail capture failed:', e) }
  },

  // AI settings
  aiApiKey: localStorage.getItem('ai-api-key') || '',
  aiBaseUrl: localStorage.getItem('ai-base-url') || 'https://api.openai.com/v1',
  aiModel: localStorage.getItem('ai-model') || 'gpt-4o-mini',
  aiLoading: false,
  aiError: null,
  prompt: '',

  // Session stats — read once on boot, updated through helpers below
  // and flushed back to disk on key user actions. The panel in the
  // RightSidebar subscribes to this for its live readout.
  sessionStats: _statsBoot,
  bumpSessionStat: (key, by = 1) => set(s => {
    const next = bumpStat(s.sessionStats, key, by)
    saveStats(next)
    return { sessionStats: next }
  }),
  resetSessionStats: () => {
    const blank = beginSession({ ...loadStats(), totalSessions: 0, lifetimeSeconds: 0, presetsLoaded: 0, uniquePresets: [], gifsExported: 0, videosExported: 0, screenshotsTaken: 0, firstSeenAt: null })
    saveStats(blank)
    set({ sessionStats: blank })
  },

  // Actions
  setParticleCount: (v) => set({ particleCount: v }),
  setSpeed: (v) => set({ speed: v }),
  setGlowIntensity: (v) => set({ glowIntensity: v }),
  setVisualStyle: (v) => set({ visualStyle: v }),
  setPlaying: (v) => set({ playing: v }),
  setPrompt: (v) => set({ prompt: v }),
  // Post-processing toggles — each is opt-in so the default look stays
  // identical until the user flips one on. Intensity ranges are tuned
  // to land somewhere flattering without much tweaking.
  chromaticAberration: false,
  chromaticIntensity: 0.003,
  vignette: false,
  vignetteIntensity: 0.45,
  filmGrain: false,
  filmGrainIntensity: 0.18,
  // Depth of Field (Bokeh): out-of-focus blur with adjustable focal plane.
  // `dofFocusDistance` is normalized 0..1 (0 = camera, 1 = far plane); the
  // canvas converts to world units when wiring the effect. `dofBokehScale`
  // controls the blur radius. Off by default so the base scene is sharp.
  depthOfField: false,
  dofFocusDistance: 0.022,   // ~near-mid camera focus by default
  dofFocalLength: 0.05,
  dofBokehScale: 4.0,
  setChromaticAberration: (v) => set({ chromaticAberration: v }),
  setChromaticIntensity: (v) => set({ chromaticIntensity: v }),
  setVignette: (v) => set({ vignette: v }),
  setVignetteIntensity: (v) => set({ vignetteIntensity: v }),
  setFilmGrain: (v) => set({ filmGrain: v }),
  setFilmGrainIntensity: (v) => set({ filmGrainIntensity: v }),
  setDepthOfField: (v) => set({ depthOfField: v }),
  setDofFocusDistance: (v) => set({ dofFocusDistance: clampFocusDistance(v) }),
  setDofFocalLength: (v)   => set({ dofFocalLength:   clampFocalLength(v) }),
  setDofBokehScale: (v)    => set({ dofBokehScale:    clampBokehScale(v) }),

  // Wind — a global drift vector applied to every particle each
  // frame. Useful for storm / atmospheric / floating-dust looks
  // without having to author it into each preset fn. Azimuth +
  // pitch live in degrees so the UI feels predictable; the
  // renderer converts to a unit vector via lib/wind.js per frame.
  // Off (intensity = 0) by default → renderer takes the zero-vector
  // fast path and the per-particle loop is unchanged.
  windEnabled: false,
  windIntensity: 1.0,
  windAzimuth: 0,     // degrees on XZ plane, 0 = +X axis (east)
  windPitch: 0,       // degrees lift off XZ plane, +90 = straight up
  setWindEnabled: (v) => set({ windEnabled: !!v }),
  setWindIntensity: (v) => set({ windIntensity: clampWindIntensity(v) }),
  setWindAzimuth: (v)   => set({ windAzimuth:   clampWindAzimuth(v) }),
  setWindPitch: (v)     => set({ windPitch:     clampWindPitch(v) }),

  // Trig-noise deformer — a global wiggle layered on top of whatever
  // the active preset fn produces. Amplitude 0 = invisible (the
  // renderer skips the math entirely); higher values add shimmer.
  noiseEnabled: false,
  noiseAmplitude: 0.5,    // world units of peak displacement
  noiseFrequency: 1.5,    // spatial frequency (higher = noisier)
  noiseSpeed: 1.0,        // temporal frequency (higher = faster shimmer)
  setNoiseEnabled: (v) => set({ noiseEnabled: !!v }),
  setNoiseAmplitude: (v) => set({ noiseAmplitude: clampNoiseAmp(v) }),
  setNoiseFrequency: (v) => set({ noiseFrequency: clampNoiseFreq(v) }),
  setNoiseSpeed: (v)     => set({ noiseSpeed:     clampNoiseSpeed(v) }),

  // Gradient color palette — user-picked 2-stop tint applied to each
  // particle by linearly interpolating between the stops based on the
  // particle's normalized z-position. Pre-parsed RGB values are cached
  // so the per-particle loop only does adds + multiplies.
  paletteEnabled: false,
  paletteA: '#6366f1', // top stop (z = +1)
  paletteB: '#ec4899', // bottom stop (z = -1)
  paletteMix: 0.6,     // how strongly the tint overrides the source color
  setPaletteEnabled: (v) => set({ paletteEnabled: v }),
  setPaletteA: (v) => set({ paletteA: v }),
  setPaletteB: (v) => set({ paletteB: v }),
  setPaletteMix: (v) => set({ paletteMix: v }),

  // Optional DOM-overlay mouse trail. Renders fading dots behind the
  // cursor; pure CSS so cost is negligible. Default off to keep the
  // baseline UI calm.
  mouseTrail: false,
  setMouseTrail: (v) => set({ mouseTrail: v }),

  // Kaleidoscope: N-fold rotational symmetry around the Y axis. When
  // enabled, particles are partitioned into N slices; each slice's
  // index is folded onto the first ("leader") slice before the preset
  // fn runs, then its computed position is rotated by slice * 2π/N.
  // The result is a perfectly symmetric kaleidoscope that costs the
  // same as the original scene (no extra particle work).
  kaleidoscopeEnabled: false,
  kaleidoscopeSegments: 6,
  setKaleidoscopeEnabled: (v) => set({ kaleidoscopeEnabled: v }),
  setKaleidoscopeSegments: (v) => set({ kaleidoscopeSegments: Math.max(2, Math.min(16, Math.round(v))) }),

  // Hue Cycle: continuously offset the global hue over time. Layered
  // on top of whatever theme is active so users get a slow rainbow
  // drift without giving up Sunset/Forest/Arctic/etc. Speed is in
  // "full cycles per minute" so the slider has an intuitive scale.
  hueCycleEnabled: false,
  hueCycleSpeed: 6,  // cycles per minute
  setHueCycleEnabled: (v) => set({ hueCycleEnabled: v }),
  setHueCycleSpeed: (v) => set({ hueCycleSpeed: Math.max(0.5, Math.min(60, v)) }),

  // R34.B — Cinematic framing guides. A composition aid: overlay
  // letterbox / pillarbox bars to mask the viewport down to a chosen
  // aspect ratio (2.39 / 16:9 / 1:1 / 4:5 / 9:16 ...) so the user can
  // frame a screenshot or recording the way it'll be cropped. Visual
  // only — doesn't change what the canvas renders or captures. The id
  // persists so the chosen frame survives reload. 'off' = no bars.
  framingGuideId: (() => {
    try { return sanitizeFramingGuideId(localStorage.getItem(FRAMING_GUIDE_KEY)) } catch { return 'off' }
  })(),
  setFramingGuideId: (id) => {
    const next = sanitizeFramingGuideId(id)
    try { localStorage.setItem(FRAMING_GUIDE_KEY, next) } catch { /* quota / private mode */ }
    set({ framingGuideId: next })
  },
  cycleFramingGuide: () => {
    const next = nextFramingGuideId(get().framingGuideId)
    try { localStorage.setItem(FRAMING_GUIDE_KEY, next) } catch { /* */ }
    set({ framingGuideId: next })
  },

  // R42.M — the numeric aspect ratio (width/height) used when the framing
  // guide id is 'custom'. Lets a user dial in any exact crop (21:9, 5:7,
  // 2.76 ...) beyond the fixed preset chips. Stored as a clamped number;
  // null = none entered yet (the custom chip then shows nothing to frame).
  // Persisted on its own key so a dialled-in crop survives reload.
  framingCustomRatio: (() => {
    try {
      const raw = localStorage.getItem(FRAMING_CUSTOM_RATIO_KEY)
      return raw != null ? clampCustomRatio(Number(raw)) : null
    } catch { return null }
  })(),
  // Accepts a freeform string ("21:9", "2.39", "16x9") OR a number; parses
  // + clamps to the usable band. Returns the resolved numeric ratio (or
  // null when unparseable) so the caller can flag a bad entry. Also flips
  // the active framing id to 'custom' on a successful parse so the frame
  // applies immediately.
  setFramingCustomRatio: (raw) => {
    const ratio = typeof raw === 'number' ? clampCustomRatio(raw) : parseAspectRatio(raw)
    if (ratio == null) return null
    try { localStorage.setItem(FRAMING_CUSTOM_RATIO_KEY, String(ratio)) } catch { /* quota / private mode */ }
    try { localStorage.setItem(FRAMING_GUIDE_KEY, 'custom') } catch { /* */ }
    // R43.M — remember this ratio in the recents MRU so the user can
    // re-apply a favourite crop with a click instead of re-typing it.
    const nextRecents = pushRecentRatio(get().recentCustomRatios, ratio)
    if (!sameRecentRatios(nextRecents, get().recentCustomRatios)) {
      try { localStorage.setItem(FRAMING_RECENT_RATIOS_KEY, JSON.stringify(nextRecents)) } catch { /* quota / private mode */ }
      set({ framingCustomRatio: ratio, framingGuideId: 'custom', recentCustomRatios: nextRecents })
    } else {
      set({ framingCustomRatio: ratio, framingGuideId: 'custom' })
    }
    return ratio
  },

  // R43.M — the most-recently-used custom aspect ratios (newest-first,
  // deduped by display label, capped). Surfaced as a row of one-tap chips
  // beneath the custom-ratio input so a user who flips between a few
  // favourites (21:9, 2.39 ...) doesn't re-type each time. Loaded +
  // sanitised on boot so a corrupt blob can't poison the chip row.
  recentCustomRatios: (() => {
    try {
      const raw = localStorage.getItem(FRAMING_RECENT_RATIOS_KEY)
      return raw != null ? sanitizeRecentRatios(JSON.parse(raw)) : []
    } catch { return [] }
  })(),
  // Re-apply a remembered ratio: set it as the active custom frame (which
  // also floats it back to the front of the MRU via setFramingCustomRatio).
  // A number goes straight through clampCustomRatio inside the setter.
  applyRecentRatio: (ratio) => get().setFramingCustomRatio(ratio),
  // Forget the whole recents row (a small "clear" affordance). Skips the
  // work when already empty.
  clearRecentRatios: () => {
    if (get().recentCustomRatios.length === 0) return
    try { localStorage.removeItem(FRAMING_RECENT_RATIOS_KEY) } catch { /* quota / private mode */ }
    set({ recentCustomRatios: [] })
  },

  // R44.M — pinned (favourite) custom ratios. A user with one go-to crop
  // can STAR a recent chip so it always leads the row and survives the MRU
  // cap (recents fall off the tail; pins don't). Stored on its own key,
  // sanitised on boot. The chip row is built from pinned ++ recents via
  // buildRatioChips so a ratio is never shown twice.
  pinnedCustomRatios: (() => {
    try {
      const raw = localStorage.getItem(FRAMING_PINNED_RATIOS_KEY)
      return raw != null ? sanitizePinnedRatios(JSON.parse(raw)) : []
    } catch { return [] }
  })(),
  // Toggle a ratio's pinned membership (star ↔ unstar). The pure helper
  // pins-at-front / unpins-by-label and caps the list; we persist + set
  // only when the result actually differs (ref/value change) so a no-op
  // toggle on an unparseable ratio doesn't churn storage or React.
  togglePinnedRatio: (ratio) => {
    const next = togglePinnedRatioHelper(get().pinnedCustomRatios, ratio)
    if (sameRecentRatios(next, get().pinnedCustomRatios)) return
    try { localStorage.setItem(FRAMING_PINNED_RATIOS_KEY, JSON.stringify(next)) } catch { /* quota / private mode */ }
    set({ pinnedCustomRatios: next })
  },
  // R45.M — reorder a pinned ratio (drag-and-drop the pinned chips). The
  // pure helper sanitises + splices from→to, returning the list unchanged
  // (by value) on a no-op move, so we persist + set only on a real change.
  reorderPinnedRatio: (fromIdx, toIdx) => {
    const next = movePinnedRatioHelper(get().pinnedCustomRatios, fromIdx, toIdx)
    if (sameRecentRatios(next, get().pinnedCustomRatios)) return
    try { localStorage.setItem(FRAMING_PINNED_RATIOS_KEY, JSON.stringify(next)) } catch { /* quota / private mode */ }
    set({ pinnedCustomRatios: next })
  },

  // R35.B — Composition grid drawn INSIDE the active framing guide:
  // 'off' | 'thirds' (rule-of-thirds + power points) | 'cross' (centre
  // cross) | 'both'. A composition aid only; renders nothing when no
  // framing ratio is active. Persisted on its own key so it round-trips
  // independently of the chosen ratio.
  framingGridId: (() => {
    try { return sanitizeFramingGridId(localStorage.getItem(FRAMING_GRID_KEY)) } catch { return 'off' }
  })(),
  setFramingGridId: (id) => {
    const next = sanitizeFramingGridId(id)
    try { localStorage.setItem(FRAMING_GRID_KEY, next) } catch { /* quota / private mode */ }
    set({ framingGridId: next })
  },
  cycleFramingGrid: () => {
    const next = nextFramingGridId(get().framingGridId)
    try { localStorage.setItem(FRAMING_GRID_KEY, next) } catch { /* */ }
    set({ framingGridId: next })
  },

  // R37.B — golden-spiral orientation (0..3 → tl/tr/br/bl). Which corner
  // the spiral's eye converges toward, so a user can flip it to match a
  // left- vs right-facing subject. Persisted on its own key; only has a
  // visible effect while the 'spiral' grid mode is active.
  spiralOrientation: (() => {
    try { return sanitizeSpiralOrientation(localStorage.getItem(SPIRAL_ORIENT_KEY)) } catch { return 0 }
  })(),
  setSpiralOrientation: (o) => {
    const next = sanitizeSpiralOrientation(o)
    try { localStorage.setItem(SPIRAL_ORIENT_KEY, String(next)) } catch { /* quota / private mode */ }
    set({ spiralOrientation: next })
  },
  cycleSpiralOrientation: () => {
    const next = sanitizeSpiralOrientation(get().spiralOrientation + 1)
    try { localStorage.setItem(SPIRAL_ORIENT_KEY, String(next)) } catch { /* */ }
    set({ spiralOrientation: next })
  },

  // R39.B — spiral sweep replay nonce. The FramingGuides overlay keys the
  // spiral polyline on (orientation, nonce); bumping the nonce remounts it
  // so the R38.B one-shot "draw-on" sweep replays for the CURRENT corner
  // without the user having to flip the eye or toggle the grid off/on. A
  // replay button on the active Spiral chip calls replaySpiralSweep().
  // Transient (not persisted) — a sweep is an in-session animation.
  spiralSweepNonce: 0,
  replaySpiralSweep: () => set({ spiralSweepNonce: nextSweepNonce(get().spiralSweepNonce) }),

  // R40.B — spiral sweep SPEED ('fast' | 'normal' | 'slow'). Scales the
  // draw-on sweep + eye-in durations so a user can slow the reveal to
  // study the golden curve or speed it up once they know it. 'normal'
  // reproduces the original baked timings (back-compat). Persisted on its
  // own key; only visible while the 'spiral' grid is active.
  spiralSweepSpeed: (() => {
    try { return sanitizeSpiralSweepSpeed(localStorage.getItem(SPIRAL_SWEEP_SPEED_KEY)) } catch { return 'normal' }
  })(),
  setSpiralSweepSpeed: (id) => {
    const next = sanitizeSpiralSweepSpeed(id)
    try { localStorage.setItem(SPIRAL_SWEEP_SPEED_KEY, next) } catch { /* quota / private mode */ }
    set({ spiralSweepSpeed: next })
  },
  cycleSpiralSweepSpeed: () => {
    const next = nextSpiralSweepSpeed(get().spiralSweepSpeed)
    try { localStorage.setItem(SPIRAL_SWEEP_SPEED_KEY, next) } catch { /* */ }
    set({ spiralSweepSpeed: next })
  },

  // R41.B — spiral sweep EASING: shapes HOW the draw-on accelerates
  // (ease-in / linear / ease-out), orthogonal to the R40.B speed. The
  // default 'ease-out' reproduces the original baked cubic-bezier so an
  // existing user sees no change. Persisted on its own key; only visible
  // while the 'spiral' grid is active.
  spiralSweepEasing: (() => {
    try { return sanitizeSpiralSweepEasing(localStorage.getItem(SPIRAL_SWEEP_EASING_KEY)) } catch { return 'ease-out' }
  })(),
  setSpiralSweepEasing: (id) => {
    const next = sanitizeSpiralSweepEasing(id)
    try { localStorage.setItem(SPIRAL_SWEEP_EASING_KEY, next) } catch { /* quota / private mode */ }
    set({ spiralSweepEasing: next })
  },
  cycleSpiralSweepEasing: () => {
    const next = nextSpiralSweepEasing(get().spiralSweepEasing)
    try { localStorage.setItem(SPIRAL_SWEEP_EASING_KEY, next) } catch { /* */ }
    set({ spiralSweepEasing: next })
  },

  // R35.E — Zen auto-orbit: when enabled and the screen is left alone in
  // zen mode, a slow camera auto-orbit eases in so a forgotten tab
  // becomes an ambient particle display. `zenAutoOrbit` is the persisted
  // preference; `zenAmbientOrbitSpeed` is a transient live value the
  // ZenMode controller writes each frame (0 when not orbiting) and the
  // camera reads — NOT persisted.
  zenAutoOrbit: (() => {
    try { return localStorage.getItem(ZEN_AUTO_ORBIT_KEY) === '1' } catch { return false }
  })(),
  setZenAutoOrbit: (v) => {
    const next = !!v
    try { localStorage.setItem(ZEN_AUTO_ORBIT_KEY, next ? '1' : '0') } catch { /* quota / private mode */ }
    // Clearing the preference also zeroes any in-flight ambient speed so
    // the camera stops drifting immediately.
    set(next ? { zenAutoOrbit: true } : { zenAutoOrbit: false, zenAmbientOrbitSpeed: 0 })
  },
  zenAmbientOrbitSpeed: 0,
  setZenAmbientOrbitSpeed: (v) => {
    const n = Number(v)
    const next = Number.isFinite(n) && n > 0 ? n : 0
    // Skip redundant writes so a steady 0 (the common case) doesn't
    // churn the store every animation frame.
    if (get().zenAmbientOrbitSpeed === next) return
    set({ zenAmbientOrbitSpeed: next })
  },

  // R42.E — zen "Now Playing" overlay: while in zen mode, show an
  // auto-fading card with the live preset name (+ a palette swatch) so a
  // screen-recording is self-documenting without the full UI. Defaults
  // ON (it's an unobtrusive, self-fading recording aid); persisted so a
  // user who turns it off keeps it off.
  zenNowPlaying: (() => {
    try { return localStorage.getItem(ZEN_NOW_PLAYING_KEY) !== '0' } catch { return true }
  })(),
  setZenNowPlaying: (v) => {
    const next = !!v
    try { localStorage.setItem(ZEN_NOW_PLAYING_KEY, next ? '1' : '0') } catch { /* quota / private mode */ }
    set({ zenNowPlaying: next })
  },

  // R34.C — Screenshot self-timer delay (seconds). When > 0, the
  // screenshot button / shortcut starts a 3..2..1 countdown overlay
  // before capturing so the user can move the cursor out of frame and
  // compose. 0 = instant (classic behaviour). Persisted.
  screenshotTimerDelay: (() => {
    try { return sanitizeTimerDelayHelper(localStorage.getItem(SCREENSHOT_TIMER_KEY)) } catch { return DEFAULT_TIMER_DELAY_VAL }
  })(),
  setScreenshotTimerDelay: (d) => {
    const next = sanitizeTimerDelayHelper(d)
    try { localStorage.setItem(SCREENSHOT_TIMER_KEY, String(next)) } catch { /* quota / private mode */ }
    set({ screenshotTimerDelay: next })
  },

  // R35.C — Screenshot burst count: after the self-timer countdown,
  // fire N shots spaced BURST_INTERVAL_MS apart so the user can pick the
  // best particle moment from a quick sequence. 1 = single shot
  // (classic). Persisted on its own key. Only takes effect when the
  // timer delay is > 0 (the burst rides on the countdown overlay).
  screenshotBurstCount: (() => {
    try { return sanitizeBurstCountHelper(localStorage.getItem(SCREENSHOT_BURST_KEY)) } catch { return DEFAULT_BURST_COUNT_VAL }
  })(),
  setScreenshotBurstCount: (n) => {
    const next = sanitizeBurstCountHelper(n)
    try { localStorage.setItem(SCREENSHOT_BURST_KEY, String(next)) } catch { /* quota / private mode */ }
    set({ screenshotBurstCount: next })
  },

  // R42.G — Screenshot watermark/caption: bake the live preset name into
  // the exported PNG (in a chosen corner) so a shared still is
  // self-documenting. Visual on the SAVED file only, never the live
  // scene. Off by default (an opt-in for shareable stills); the anchor
  // persists independently so flipping the toggle keeps the chosen corner.
  screenshotWatermark: (() => {
    try { return localStorage.getItem(SCREENSHOT_WATERMARK_KEY) === '1' } catch { return false }
  })(),
  setScreenshotWatermark: (v) => {
    const next = !!v
    try { localStorage.setItem(SCREENSHOT_WATERMARK_KEY, next ? '1' : '0') } catch { /* quota / private mode */ }
    set({ screenshotWatermark: next })
  },
  screenshotWatermarkAnchor: (() => {
    try { return sanitizeWatermarkAnchor(localStorage.getItem(SCREENSHOT_WATERMARK_ANCHOR_KEY)) } catch { return sanitizeWatermarkAnchor(null) }
  })(),
  setScreenshotWatermarkAnchor: (id) => {
    const next = sanitizeWatermarkAnchor(id)
    try { localStorage.setItem(SCREENSHOT_WATERMARK_ANCHOR_KEY, next) } catch { /* quota / private mode */ }
    set({ screenshotWatermarkAnchor: next })
  },

  // R43.G — optional SECOND caption line for a branded share still: a
  // user wordmark / handle and/or the capture date, drawn beneath the
  // preset name. Both default empty/off so an existing watermark export is
  // unchanged until a user opts in. The wordmark is capped on write so a
  // pasted essay can't bloat the stored value.
  screenshotWatermarkWordmark: (() => {
    try { return localStorage.getItem(SCREENSHOT_WATERMARK_WORDMARK_KEY) || '' } catch { return '' }
  })(),
  setScreenshotWatermarkWordmark: (text) => {
    const next = (typeof text === 'string' ? text : '').slice(0, 60)
    try { localStorage.setItem(SCREENSHOT_WATERMARK_WORDMARK_KEY, next) } catch { /* quota / private mode */ }
    set({ screenshotWatermarkWordmark: next })
  },
  screenshotWatermarkDate: (() => {
    try { return localStorage.getItem(SCREENSHOT_WATERMARK_DATE_KEY) === '1' } catch { return false }
  })(),
  setScreenshotWatermarkDate: (v) => {
    const next = !!v
    try { localStorage.setItem(SCREENSHOT_WATERMARK_DATE_KEY, next ? '1' : '0') } catch { /* quota / private mode */ }
    set({ screenshotWatermarkDate: next })
  },




  // Background gradient — replace the constant clear color (#0a0a0f)
  // with a user-picked two-stop CSS gradient under the canvas. When
  // enabled, the canvas clears to transparent and a positioned div
  // behind it paints the gradient; tooltip is on the LeftSidebar.
  // Cheap by construction — no per-frame WebGL work, just one CSS layer.
  bgGradientEnabled: false,
  bgGradientA: '#1e1b4b',   // top
  bgGradientB: '#0a0a0f',   // bottom (current default)
  bgGradientAngle: 180,     // degrees, 180 = top→bottom
  // Audio-reactive hue rotation on the gradient layer — when both
  // this and `audioReactive` are on, the gradient div gets a
  // `filter: hue-rotate(<deg>)` driven by the active audio signal
  // (level / bass / beat per audioMode). Strength is 0..1; 0 mutes
  // the reactivity entirely. Idle path is unchanged (renderer skips
  // the filter when the toggle is off).
  bgGradientAudioReactive: false,
  bgGradientAudioStrength: 0.5,
  // Curve preset chips reshape the audio signal before the linear hue
  // map (R12.03): 'linear' (default — pass-through, historic feel),
  // 'pulse' (S-curve, amplify mid-zone), 'ramp' (ease-in cubic — loud
  // hits harder), 'hold' (neutral until past 50%, then ramp up).
  bgGradientAudioCurve: 'linear',
  setBgGradientEnabled: (v) => set({ bgGradientEnabled: v }),
  setBgGradientA: (v) => set({ bgGradientA: v }),
  setBgGradientB: (v) => set({ bgGradientB: v }),
  setBgGradientAngle: (v) => set({ bgGradientAngle: Math.max(0, Math.min(360, v | 0)) }),
  setBgGradientAudioReactive: (v) => set({ bgGradientAudioReactive: !!v }),
  setBgGradientAudioStrength: (v) => set({
    bgGradientAudioStrength: clampBgGradientStrength(v),
  }),
  setBgGradientAudioCurve: (v) => set({
    bgGradientAudioCurve: normalizeBgGradientCurve(v),
  }),

  // Crossfade — render a weighted blend between the current preset
  // and a chosen "blend target" preset. When `blendActive` is true,
  // every particle's target position + color is `lerp(currentFn, blendFn, t)`
  // where t ramps from 0 → 1 over blendSeconds. When the ramp finishes,
  // the blend target becomes the current preset and the blend state
  // resets — same UX as a single loadPreset() but smooth instead of
  // an abrupt swap. Pure overlay on the existing pipeline; off by
  // default so the per-particle loop cost is unchanged when unused.
  blendTargetId: null,
  blendTargetSource: '',
  blendTargetFn: null,
  blendProgress: 0,        // 0..1
  blendSeconds: 2.0,       // default ramp duration
  blendActive: false,
  setBlendSeconds: (v) => set({ blendSeconds: Math.max(0.2, Math.min(20, v)) }),
  // Start a crossfade to the given preset id. Compiles the target fn
  // up front so the per-frame loop never has to.
  beginBlendTo: (presetId) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return
    const { fn } = compileParticleFn(preset.code)
    if (!fn) return
    set({
      blendTargetId: presetId,
      blendTargetSource: preset.code,
      blendTargetFn: fn,
      blendProgress: 0,
      blendActive: true,
    })
  },
  // Called by the renderer every frame while blendActive — advances
  // the ramp by dt (seconds). When it finishes, swap the target into
  // the current preset slot via loadPreset so the rest of the app
  // (info panel, source viewer, recents) treats it as a normal swap.
  advanceBlend: (dt) => {
    const s = get()
    if (!s.blendActive) return
    const seconds = Math.max(0.2, s.blendSeconds)
    const next = Math.min(1, s.blendProgress + dt / seconds)
    if (next >= 1) {
      const id = s.blendTargetId
      set({ blendActive: false, blendProgress: 0, blendTargetId: null, blendTargetFn: null, blendTargetSource: '' })
      if (id) get().loadPreset(id)
    } else {
      set({ blendProgress: next })
    }
  },
  cancelBlend: () => set({ blendActive: false, blendProgress: 0, blendTargetId: null, blendTargetFn: null, blendTargetSource: '' }),

  // Reduced motion — accessibility mode that respects the OS-level
  // `prefers-reduced-motion: reduce` hint. UI lets the user override:
  //   - 'auto':   follow the OS (default)
  //   - 'reduce': force reduced motion on (great for vestibular disorders)
  //   - 'full':   force animations on regardless of OS
  // The boot in src/lib/reducedMotion.js reads the OS pref once at
  // load time + subscribes to changes so we don't recheck on every frame.
  reducedMotionMode: localStorage.getItem('reduced-motion-mode') || 'auto',
  osPrefersReducedMotion: false,  // updated by the App-level subscriber
  setReducedMotionMode: (m) => {
    const allowed = m === 'reduce' || m === 'full' || m === 'auto'
    const next = allowed ? m : 'auto'
    try { localStorage.setItem('reduced-motion-mode', next) } catch { /* quota */ }
    set({ reducedMotionMode: next })
  },
  setOSPrefersReducedMotion: (v) => set({ osPrefersReducedMotion: !!v }),

  // R36.K — global "calm mode" master toggle. One switch that gates the
  // four ambient camera/colour motions at once (auto-rotate, audio
  // camera-shake, hue-cycle drift, zen ambient auto-orbit) so a user can
  // instantly settle a busy scene — e.g. before a screenshot — without
  // hunting four separate controls and WITHOUT changing their
  // accessibility reduced-motion setting. Composes with reduced motion
  // via resolveCalm() at each consumer (calm OR reduced → suppressed).
  // Persisted on its own key.
  calmMode: (() => {
    try { return localStorage.getItem(CALM_MODE_KEY) === '1' } catch { return false }
  })(),
  setCalmMode: (v) => {
    const next = !!v
    try { localStorage.setItem(CALM_MODE_KEY, next ? '1' : '0') } catch { /* quota / private mode */ }
    // Turning calm mode on also zeroes any in-flight zen ambient orbit so
    // a drifting camera stops the instant the user hits the switch.
    set(next ? { calmMode: true, zenAmbientOrbitSpeed: 0 } : { calmMode: false })
  },

  // R38.K — per-motion calm gates: which of the four motions calm mode
  // actually pauses. Default all-true (calm gates everything, == R36.K
  // behaviour) until the user opts a motion out via the calm-button
  // popover. A complete { autoRotate, cameraShake, hueCycle, zenOrbit }
  // bool map; consumers call resolveCalmFor(id, reduced, calm, gates).
  // Persisted as JSON on its own key.
  calmGates: (() => {
    try { return sanitizeCalmGates(JSON.parse(localStorage.getItem(CALM_GATES_KEY))) }
    catch { return sanitizeCalmGates(null) }
  })(),
  toggleCalmGate: (id) => {
    const next = toggleCalmGate(get().calmGates, id)
    try { localStorage.setItem(CALM_GATES_KEY, JSON.stringify(next)) } catch { /* quota / private mode */ }
    set({ calmGates: next })
  },
  // R39.K — replace the whole gate map at once (used by the calm-gates
  // import: a merged/replaced map from a portable JSON envelope). Runs
  // through sanitizeCalmGates so a hand-edited file can't inject junk.
  setCalmGates: (gates) => {
    const next = sanitizeCalmGates(gates)
    try { localStorage.setItem(CALM_GATES_KEY, JSON.stringify(next)) } catch { /* quota / private mode */ }
    set({ calmGates: next })
  },

  // Slideshow mode — rotate through filtered/favourited presets on a
  // timer. `slideshowOrder` is one of 'sequence' | 'shuffle' | 'favourites'.
  // The driver in App.jsx watches these and rotates accordingly; we
  // keep all state here so any UI surface can pause / change cadence.
  // `slideshowRespectCategory` scopes sequence + shuffle to the active
  // LeftSidebar category chip (favourites order intentionally bypasses).
  slideshowEnabled: false,
  slideshowDwellSec: 8,
  slideshowOrder: 'sequence',
  slideshowRespectCategory: false,
  setSlideshowEnabled: (v) => set({ slideshowEnabled: v }),
  setSlideshowDwellSec: (v) => set({ slideshowDwellSec: Math.max(2, Math.min(120, v)) }),
  setSlideshowOrder: (v) => set({ slideshowOrder: v }),
  setSlideshowRespectCategory: (v) => set({ slideshowRespectCategory: !!v }),

  // Camera shake on beat — when audio reactivity + this toggle are on,
  // the camera nudges on each detected beat (or bass surge). Intensity
  // is a 0..1 scalar that the renderer multiplies by the active audio
  // signal before applying. Default off so the baseline scene is calm.
  cameraShake: false,
  cameraShakeIntensity: 0.5,
  setCameraShake: (v) => set({ cameraShake: v }),
  setCameraShakeIntensity: (v) => set({ cameraShakeIntensity: Math.max(0, Math.min(1, v)) }),

  // R36.D — live perf-budget status pill. An opt-in always-on HUD dot
  // (green/amber/red + fps) for users TUNING a heavy scene who want to
  // watch headroom continuously, separate from the reactive auto-suggest
  // toast. Off by default (zero cost when off — the component returns
  // null). Persisted on its own key.
  perfPillEnabled: (() => {
    try { return localStorage.getItem(PERF_PILL_KEY) === '1' } catch { return false }
  })(),
  setPerfPillEnabled: (v) => {
    const next = !!v
    try { localStorage.setItem(PERF_PILL_KEY, next ? '1' : '0') } catch { /* quota / private mode */ }
    set({ perfPillEnabled: next })
  },

  // Mini-map overlay — small top-down XZ widget pinned to the bottom-
  // right of the canvas. Shows where the camera sits vs the scene
  // origin and lets the user click to recenter the orbit target.
  // Off by default; zero cost when off (component returns null).
  minimapEnabled: false,
  setMinimapEnabled: (v) => set({ minimapEnabled: !!v }),

  // R45.N — the live saved-view multi-selection, mirrored from the command
  // palette's local selection so OTHER surfaces (the minimap) can act on
  // "the same selection" without the palette being open. Held as a plain
  // array of view ids (transient — a selection is an in-session intent, not
  // something to persist). The palette pushes its selection here on change;
  // the minimap reads it to offer a matching "Fit selected" button.
  selectedViewIds: [],
  setSelectedViewIds: (ids) => {
    const next = Array.isArray(ids) ? ids.filter(id => id !== null && id !== undefined) : []
    const cur = get().selectedViewIds
    // Skip a no-op set (same length + same members in order) so mirroring
    // the palette's selection each render doesn't churn subscribers.
    if (cur.length === next.length && cur.every((v, i) => v === next[i])) return
    set({ selectedViewIds: next })
  },

  // Waveform overlay — small oscilloscope strip pinned to the top-
  // right of the canvas whenever audio reactivity is on AND this
  // toggle is enabled. Renders the live time-domain signal so users
  // can SEE what the audio reactivity is responding to. Off by
  // default; zero cost when off.
  waveformEnabled: false,
  setWaveformEnabled: (v) => set({ waveformEnabled: !!v }),
  // Mode = 'time' (oscilloscope polyline) or 'frequency' (32-bar
  // spectrum). Persisted in localStorage so users don't have to
  // re-pick after every reload.
  waveformMode: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('waveform-mode-v1') : null
      return (v === 'time' || v === 'frequency') ? v : 'time'
    } catch { return 'time' }
  })(),
  setWaveformMode: (v) => {
    const next = (v === 'frequency') ? 'frequency' : 'time'
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('waveform-mode-v1', next) } catch { /* */ }
    set({ waveformMode: next })
  },
  // Spectrum-scale = 'linear' (default) or 'log'. Only meaningful when
  // waveformMode === 'frequency'. Log mode groups FFT bins
  // exponentially so the bar distribution matches human pitch
  // perception — bass occupies the left half, treble the right half
  // at roughly even visual density. Persisted in localStorage so
  // the choice survives a reload.
  spectrumScale: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('spectrum-scale-v1') : null
      return (v === 'log' || v === 'linear') ? v : 'linear'
    } catch { return 'linear' }
  })(),
  setSpectrumScale: (v) => {
    const next = (v === 'log') ? 'log' : 'linear'
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('spectrum-scale-v1', next) } catch { /* */ }
    set({ spectrumScale: next })
  },
  // Peak-hold lines on the spectrum view — a thin line stays at each
  // bar's recent peak height and falls slowly. Classic EQ visual that
  // makes transients legible. On by default (matches the look of most
  // commercial visualizers); persisted across reloads.
  spectrumPeakHolds: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('spectrum-peak-holds-v1') : null
      return v == null ? true : v !== '0'  // default ON, '0' opts out
    } catch { return true }
  })(),
  setSpectrumPeakHolds: (v) => {
    const next = !!v
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('spectrum-peak-holds-v1', next ? '1' : '0') } catch { /* */ }
    set({ spectrumPeakHolds: next })
  },
  // R16.17 — per-bar fade-out curve preset for the peak-hold trail.
  // 'linear' (default, matches the R15.07 original), 'exp' (head-
  // leading: tail fades fast, fresh samples bloom), 'log' (tail-
  // leading: oldest samples linger). Persisted across reloads so the
  // visual preference sticks. Corrupt persisted values resolve to
  // 'linear' on boot via the validate-on-read.
  spectrumPeakCurve: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('spectrum-peak-curve-v1') : null
      return (v === 'exp' || v === 'log') ? v : 'linear'
    } catch { return 'linear' }
  })(),
  setSpectrumPeakCurve: (v) => {
    const next = (v === 'exp' || v === 'log') ? v : 'linear'
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('spectrum-peak-curve-v1', next) } catch { /* */ }
    set({ spectrumPeakCurve: next })
  },

  // R19.12 — per-curve tunable parameters for the spectrum peak trail.
  // Graduates R16.17's fixed-shape curves (t^2 for exp, sqrt(t) for
  // log) with a single knob per curve (exp.exponent, log.base) so a
  // power user can taste-shape beyond the shipped defaults. Persisted
  // as a JSON blob — sanitizeCurveParams clamps + drops unknown keys
  // on every read so a corrupt persisted value can never NaN out the
  // renderer. Endpoint anchoring is preserved across every (curve,
  // params) combination by the lib so swapping shapes never disturbs
  // the trail's overall brightness range.
  spectrumPeakCurveParams: (() => {
    try {
      if (typeof localStorage === 'undefined') return defaultPeakTrailCurveParamsHelper()
      const raw = localStorage.getItem('spectrum-peak-curve-params-v1')
      if (!raw) return defaultPeakTrailCurveParamsHelper()
      return sanitizeCurveParamsHelper(JSON.parse(raw))
    } catch { return defaultPeakTrailCurveParamsHelper() }
  })(),
  setSpectrumPeakCurveParam: (curve, key, value) => {
    const live = get().spectrumPeakCurveParams
    const next = setCurveParamHelper(live, curve, key, value)
    if (next === live) return  // no-op (ref-equal skip)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('spectrum-peak-curve-params-v1', JSON.stringify(next)) } catch { /* */ }
    set({ spectrumPeakCurveParams: next })
  },
  resetSpectrumPeakCurveParams: () => {
    const defaults = defaultPeakTrailCurveParamsHelper()
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem('spectrum-peak-curve-params-v1') } catch { /* */ }
    set({ spectrumPeakCurveParams: defaults })
  },

  // R20.13 — peak-hold trail frequency-coloured tint. When ON, the
  // trail uses a warm→cool hue ramp keyed to barIndex (low bars warm,
  // high bars cool) so the trail layer reads as a frequency map on top
  // of the bar fills (which use their own hue ramp). When OFF (default),
  // the trail inherits the bar's own hue and reads as a glow extension
  // (R15.07 / R16.17 / R19.12 look). Persisted; corrupt value → false.
  spectrumPeakTrailTint: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('spectrum-peak-trail-tint-v1') : null
      return v === '1'
    } catch { return false }
  })(),
  setSpectrumPeakTrailTint: (v) => {
    const next = !!v
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('spectrum-peak-trail-tint-v1', next ? '1' : '0') } catch { /* */ }
    set({ spectrumPeakTrailTint: next })
  },

  // R21.21 — peak-hold trail palette. Graduates R20.13's single
  // warm→cool ramp with a chip-cycled rail of 5 curated palettes.
  // Only applied when `spectrumPeakTrailTint` is ON (the tint chip
  // remains the gate, the palette chip only renders alongside it).
  // Default 'warmCool' preserves the exact R20.13 visual so users
  // who never touch the new chip see no behavioural change.
  // Corrupt persisted values resolve to 'warmCool' on read via
  // isValidTrailPalette.
  spectrumPeakTrailPalette: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('spectrum-peak-trail-palette-v1') : null
      return isValidTrailPaletteHelper(v) ? v : 'warmCool'
    } catch { return 'warmCool' }
  })(),
  setSpectrumPeakTrailPalette: (v) => {
    const next = isValidTrailPaletteHelper(v) ? v : 'warmCool'
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('spectrum-peak-trail-palette-v1', next) } catch { /* */ }
    set({ spectrumPeakTrailPalette: next })
  },

  // R17.20 — lightbox WASD pan acceleration curve preset. Parallels
  // spectrumPeakCurve (R16.17): a single string token persisted across
  // sessions, validated on read. 'linear' (default) keeps the R16.20
  // baseline straight ramp; 'exp' starts slow then sprints; 'log'
  // starts fast then settles; 'off' disables acceleration entirely.
  // Corrupt persisted values resolve to 'linear'.
  lightboxPanCurve: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('lightbox-pan-curve-v1') : null
      return (v === 'exp' || v === 'log' || v === 'off') ? v : 'linear'
    } catch { return 'linear' }
  })(),
  setLightboxPanCurve: (v) => {
    const next = (v === 'exp' || v === 'log' || v === 'off') ? v : 'linear'
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('lightbox-pan-curve-v1', next) } catch { /* */ }
    set({ lightboxPanCurve: next })
  },

  // R29.43 — persisted hotkey UNDO-chain fade curve preference. The
  // chain badge (R23.35..R28.43) fades its direction colour toward
  // grey over the 1s undo window; R28.43 hard-coded the recommended
  // easeInCubic curve. R29.43 graduates that to a user preference so
  // the slow-then-fast / fast-then-slow / linear feel survives reload.
  // Parallels spectrumPeakCurve (R16.17) + lightboxPanCurve (R17.20):
  // a single string token persisted across sessions, validated on read
  // via sanitizeHotkeyChainFadeCurve. A fresh user (no persisted value)
  // resolves to the curated easeInCubic default — only an explicit
  // prior choice overrides it. Corrupt persisted values resolve to the
  // same default.
  hotkeyChainFadeCurve: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('hotkey-chain-fade-curve-v1') : null
      return sanitizeHotkeyChainFadeCurveHelper(v)
    } catch { return sanitizeHotkeyChainFadeCurveHelper(undefined) }
  })(),
  setHotkeyChainFadeCurve: (v) => {
    const next = sanitizeHotkeyChainFadeCurveHelper(v)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('hotkey-chain-fade-curve-v1', next) } catch { /* */ }
    set({ hotkeyChainFadeCurve: next })
  },
  cycleHotkeyChainFadeCurve: () => {
    const next = nextHotkeyChainFadeCurveHelper(get().hotkeyChainFadeCurve)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('hotkey-chain-fade-curve-v1', next) } catch { /* */ }
    set({ hotkeyChainFadeCurve: next })
  },

  // R33.43 — PERSIST the fade-preview swatch's PINNED loop state across
  // panel collapse / reopen. R32.43 kept `pinned` in the swatch's own
  // useState, so collapsing the MIDI panel (which unmounts the swatch)
  // reset the loop to idle — a user who pinned it to study a curve lost
  // the loop on an accidental collapse. Lifting it to a persisted store
  // boolean means the loop survives remount AND reload. Defaults OFF
  // (idle) — only an explicit long-press pins it; '1' opts in. Parallels
  // spectrumPeakHolds (boolean persisted on a '1'/'0' token).
  hotkeyFadePreviewPinned: (() => {
    try {
      const v = typeof localStorage !== 'undefined' ? localStorage.getItem('hotkey-fade-preview-pinned-v1') : null
      return v === '1'  // default OFF; only an explicit pin persists '1'
    } catch { return false }
  })(),
  setHotkeyFadePreviewPinned: (v) => {
    const next = !!v
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('hotkey-fade-preview-pinned-v1', next ? '1' : '0') } catch { /* */ }
    set({ hotkeyFadePreviewPinned: next })
  },

  setMouseAttract: (v) => set({ mouseAttract: v }),
  paintMode: false,
  paintPoints: [], // array of [x, y, z]
  setPaintMode: (v) => set({ paintMode: v }),
  addPaintPoint: (p) => {
    const list = get().paintPoints
    // Hard cap so the per-particle inner loop stays cheap.
    const next = list.length >= 24 ? [...list.slice(1), p] : [...list, p]
    set({ paintPoints: next })
  },
  clearPaintPoints: () => set({ paintPoints: [] }),
  setAttractStrength: (v) => set({ attractStrength: v }),
  setTrails: (v) => set({ trails: v }),
  setOrbitSpeed: (v) => set({ orbitSpeed: v }),
  setAutoRotate: (v) => set({ autoRotate: v }),
  setAutoRotateSpeed: (v) => set({ autoRotateSpeed: v }),
  setMinDistance: (v) => set({ minDistance: v }),
  setMaxDistance: (v) => set({ maxDistance: v }),
  setPerformanceMode: (v) => {
    const current = get().particleCount
    if (v) {
      set({ performanceMode: true, _savedParticleCount: current, particleCount: Math.max(1000, Math.floor(current / 2)) })
    } else {
      const saved = get()._savedParticleCount
      set({ performanceMode: false, particleCount: saved || current })
    }
  },
  setAudioReactive: (v) => set({ audioReactive: v }),
  setAudioLevel: (v) => set({ audioLevel: v }),
  setAudioBands: (bass, mid, treble) => set({ audioBass: bass, audioMid: mid, audioTreble: treble }),
  setAudioBeat: (v) => set({ audioBeat: v }),
  setAudioMode: (v) => set({ audioMode: v }),
  setGravityEnabled: (v) => set({ gravityEnabled: v }),
  setGravityStrength: (v) => set({ gravityStrength: v }),
  setCollisionsEnabled: (v) => set({ collisionsEnabled: v }),
  setForceFieldType: (v) => set({ forceFieldType: v }),
  setForceFieldStrength: (v) => set({ forceFieldStrength: v }),

  setTheme: (t) => {
    set({ theme: t })
    // Resolve against built-ins first, then custom themes so a saved
    // custom theme can also drive the --neon CSS variable.
    const resolved = resolveThemeHelper(t, THEMES, get().customThemes)
    if (resolved) document.documentElement.style.setProperty('--neon', resolved.neon)
  },

  // Custom theme editor — user-authored themes with their own neon
  // accent + hue shift, persisted to localStorage via lib/customThemes.
  // ParticleCanvas resolves the active theme via the same helper so
  // built-ins and custom themes paint identically.
  customThemes: loadCustomThemes(),
  addCustomTheme: (partial) => {
    const next = addCustomThemeHelper(get().customThemes, partial)
    saveCustomThemes(next)
    set({ customThemes: next })
    return next[0] ? next[0].id : null
  },
  removeCustomTheme: (id) => {
    const next = removeCustomThemeHelper(get().customThemes, id)
    saveCustomThemes(next)
    // If the deleted theme was active, fall back to neon so the UI
    // doesn't end up pointing at a non-existent theme id.
    const active = get().theme
    if (active === id) {
      set({ theme: 'neon', customThemes: next })
      document.documentElement.style.setProperty('--neon', THEMES.neon.neon)
    } else {
      set({ customThemes: next })
    }
  },
  refreshCustomThemes: () => set({ customThemes: loadCustomThemes() }),
  // Replace the entire custom theme list — used by the JSON import
  // path so it doesn't have to call addCustomTheme N times (each of
  // those triggers a saveCustomThemes + setState, churn for nothing
  // when the import already produced a clean cap-respecting list).
  setCustomThemes: (next) => {
    const safe = Array.isArray(next) ? next.slice() : []
    saveCustomThemes(safe)
    set({ customThemes: safe })
  },

  setAiSettings: (key, baseUrl, model) => {
    localStorage.setItem('ai-api-key', key)
    localStorage.setItem('ai-base-url', baseUrl)
    if (model) localStorage.setItem('ai-model', model)
    set({ aiApiKey: key, aiBaseUrl: baseUrl, ...(model ? { aiModel: model } : {}) })
  },

  setDynamicValue: (id, value) => set(s => ({
    dynamicValues: { ...s.dynamicValues, [id]: value }
  })),

  loadPreset: (presetId) => {
    const preset = presets.find(p => p.id === presetId)
    if (!preset) return
    const { fn, controls, title, description } = compileParticleFn(preset.code)
    const physicsState = {}
    if (preset.physics) {
      physicsState.gravityEnabled = !!preset.physics.gravity
      if (preset.physics.gravityStrength !== undefined) physicsState.gravityStrength = preset.physics.gravityStrength
      physicsState.collisionsEnabled = !!preset.physics.collisions
      physicsState.forceFieldType = preset.physics.forceField || null
      if (preset.physics.forceFieldStrength !== undefined) physicsState.forceFieldStrength = preset.physics.forceFieldStrength
    }
    // Push onto recents — most-recent first, max 8, no duplicates.
    const prevRecents = get().recentPresets
    const recentPresets = [presetId, ...prevRecents.filter(id => id !== presetId)].slice(0, 8)
    try { localStorage.setItem('recent-presets', JSON.stringify(recentPresets)) } catch { /* ignore */ }
    set({
      currentPreset: presetId,
      particleFn: fn,
      particleFnSource: preset.code,
      dynamicControls: controls,
      dynamicValues: Object.fromEntries(controls.map(c => [c.id, c.value])),
      infoTitle: title || preset.name,
      infoDesc: description || preset.description,
      recentPresets,
      ...physicsState,
    })
    // Stats — bump after the scene swap so the panel reflects the
    // preset that just rendered. Persisted on every load so a crash
    // mid-session doesn't lose the counter.
    set(s => {
      const next = recordPresetLoad(s.sessionStats, presetId)
      saveStats(next)
      return { sessionStats: next }
    })
    setTimeout(() => get().capturePresetThumbnail(presetId), 2000)
  },

  loadCustomCode: (code, title, description) => {
    const { fn, controls, title: t, description: d } = compileParticleFn(code)
    set({
      currentPreset: null,
      particleFn: fn,
      particleFnSource: code,
      dynamicControls: controls,
      dynamicValues: Object.fromEntries(controls.map(c => [c.id, c.value])),
      infoTitle: t || title || 'Custom',
      infoDesc: d || description || '',
    })
  },

  loadRandom: () => {
    // Avoid landing on the same preset twice in a row — a single-preset library
    // is the trivial edge case where we just reload it.
    const { currentPreset } = get()
    if (presets.length <= 1) {
      get().loadPreset(presets[0].id)
      return
    }
    let idx = Math.floor(Math.random() * presets.length)
    if (presets[idx].id === currentPreset) {
      idx = (idx + 1) % presets.length
    }
    get().loadPreset(presets[idx].id)
  },

  // Smash: full random scene — preset + style + theme + camera params.
  // Use this when you want a complete surprise instead of just a new preset.
  smashRandom: () => {
    const { currentPreset } = get()
    const STYLES = ['sparkle', 'plasma', 'blob', 'ring', 'glow', 'dot']
    const THEME_IDS = ['neon', 'cyberpunk', 'ocean', 'fire', 'monochrome', 'rainbow', 'sunset', 'forest', 'arctic', 'retro', 'vaporwave']
    // Pick a new preset (avoid repeats when possible).
    let idx = Math.floor(Math.random() * presets.length)
    if (presets.length > 1 && presets[idx].id === currentPreset) idx = (idx + 1) % presets.length
    const newStyle = STYLES[Math.floor(Math.random() * STYLES.length)]
    const newTheme = THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)]
    set({ visualStyle: newStyle, autoRotate: Math.random() < 0.5 })
    get().setTheme(newTheme)
    get().loadPreset(presets[idx].id)
  },

  nextPreset: () => {
    const { currentPreset } = get()
    const idx = presets.findIndex(p => p.id === currentPreset)
    const next = (idx + 1) % presets.length
    get().loadPreset(presets[next].id)
  },

  prevPreset: () => {
    const { currentPreset } = get()
    const idx = presets.findIndex(p => p.id === currentPreset)
    const prev = (idx - 1 + presets.length) % presets.length
    get().loadPreset(presets[prev].id)
  },

  generateFromPrompt: async () => {
    const { prompt, aiApiKey, aiBaseUrl, aiModel } = get()
    if (!prompt.trim()) return
    if (!aiApiKey) {
      set({ aiError: 'Configure your API key in settings' })
      return
    }
    set({ aiLoading: true, aiError: null })
    try {
      const res = await fetch(`${aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiApiKey}`,
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      })
      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      let code = data.choices?.[0]?.message?.content || ''
      const match = code.match(/```(?:javascript|js)?\n([\s\S]*?)```/)
      if (match) code = match[1]
      code = code.trim()
      if (!code) throw new Error('Empty response from AI')
      get().loadCustomCode(code, prompt, `AI-generated: ${prompt}`)
    } catch (e) {
      set({ aiError: e.message })
    } finally {
      set({ aiLoading: false })
    }
  },
  // Apply persisted overrides last so they win over defaults but lose
  // to anything the user passes via the URL hash on first load.
  ...persisted,
  }
})

// Persist whenever any whitelisted field changes. Subscribing to the
// whole store and diffing is cheap enough for our cadence.
let _prev = {}
for (const k of PERSIST_FIELDS) _prev[k] = useStore.getState()[k]
useStore.subscribe((state) => {
  let dirty = false
  for (const k of PERSIST_FIELDS) {
    if (state[k] !== _prev[k]) { _prev[k] = state[k]; dirty = true }
  }
  if (dirty) savePersisted(state)
})

// Flush accumulated session seconds back to disk on page hide /
// beforeunload. Using both events covers desktop tab-close + mobile
// background — visibilitychange fires reliably on mobile, beforeunload
// on desktop refresh/close.
if (typeof window !== 'undefined') {
  const flushSession = () => {
    const elapsedSec = (Date.now() - _sessionStartedAt) / 1000
    const cur = useStore.getState().sessionStats
    const next = addSessionSeconds(cur, elapsedSec)
    saveStats(next)
    useStore.setState({ sessionStats: next })
  }
  window.addEventListener('beforeunload', flushSession)
  window.addEventListener('pagehide', flushSession)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSession()
  })
}

function compileParticleFn(code) {
  const controls = []
  let title = ''
  let description = ''

  const addControl = (id, label, min, max, initial) => {
    controls.push({ id, label, min, max, value: initial })
  }
  const setInfo = (t, d) => { title = t; description = d }

  try {
    const setupFn = new Function(
      'addControl', 'setInfo', 'THREE',
      `"use strict";\n${code}`
    )
    const THREE = await_THREE()
    setupFn(addControl, setInfo, THREE)
  } catch (e) {}

  try {
    const fn = new Function(
      'i', 'count', 'target', 'color', 'time', 'THREE', 'addControl', 'setInfo', 'controls',
      `"use strict";\n${code}`
    )
    return { fn, controls, title, description }
  } catch (e) {
    console.error('Failed to compile particle function:', e)
    return { fn: null, controls, title, description }
  }
}

function await_THREE() {
  return {
    Vector3: class { constructor(x,y,z){this.x=x||0;this.y=y||0;this.z=z||0} set(x,y,z){this.x=x;this.y=y;this.z=z;return this} },
    Color: class { constructor(){this.r=1;this.g=1;this.b=1} setHSL(h,s,l){this.r=h;this.g=s;this.b=l;return this} set(){return this} setRGB(r,g,b){this.r=r;this.g=g;this.b=b;return this} },
    MathUtils: { clamp: (v,a,b) => Math.min(Math.max(v,a),b), lerp: (a,b,t) => a+(b-a)*t },
  }
}

const SYSTEM_PROMPT = `You are a particle simulation code generator. Generate ONLY a JavaScript function body.

The code will be called once per particle per frame with these variables available:
- i: particle index (0 to count-1)
- count: total number of particles
- target: THREE.Vector3 - SET this to position the particle (target.set(x, y, z))
- color: THREE.Color - SET this to color the particle (color.setHSL(h, s, l) or color.setRGB(r, g, b))
- time: elapsed time in seconds (use for animation)
- THREE: the Three.js library (THREE.MathUtils, THREE.Vector3, etc.)
- controls: object with current slider values, keyed by control id
- addControl(id, label, min, max, initial): call to create a UI slider (only runs once during setup)
- setInfo(title, description): call to set display title and description

CRITICAL RULES:
1. Do NOT allocate objects inside the function (no "new" keyword) - reuse target and color
2. Use target.set(x, y, z) to position each particle
3. Use color.setHSL(h, s, l) or color.setRGB(r, g, b) to color each particle
4. Use "const t = i / count" for normalized position
5. Use Math.sin/cos/random with time for animation
6. addControl() calls should be OUTSIDE any if-block that depends on i (they run during setup only)
7. Keep computations simple - this runs 20,000+ times per frame
8. Access slider values via controls.sliderId
9. Output ONLY the function body code, no function wrapper

Example (spiral galaxy):
addControl('arms', 'Spiral Arms', 2, 8, 4);
addControl('spread', 'Spread', 0.1, 3, 1);
setInfo('Spiral Galaxy', 'A rotating spiral galaxy');

const t = i / count;
const arm = Math.floor(i % controls.arms);
const armAngle = (arm / controls.arms) * Math.PI * 2;
const dist = t * 8;
const angle = armAngle + dist * 0.5 + time * 0.3;
const spread = (Math.random() - 0.5) * controls.spread * t;
target.set(
  Math.cos(angle) * dist + spread,
  (Math.random() - 0.5) * 0.3 * t,
  Math.sin(angle) * dist + spread
);
color.setHSL(0.6 + t * 0.15, 0.8, 0.4 + t * 0.4);`

export { SYSTEM_PROMPT }
