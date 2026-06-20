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

// Lightweight settings persistence: a subset of user-tweakable values
// is read once on store init and written back whenever it changes.
// Doing this by hand (instead of zustand/middleware/persist) keeps the
// API surface unchanged and lets us pick exactly which keys persist.
const PERSIST_KEY = 'particle-settings-v1'
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




  // Background gradient — replace the constant clear color (#0a0a0f)
  // with a user-picked two-stop CSS gradient under the canvas. When
  // enabled, the canvas clears to transparent and a positioned div
  // behind it paints the gradient; tooltip is on the LeftSidebar.
  // Cheap by construction — no per-frame WebGL work, just one CSS layer.
  bgGradientEnabled: false,
  bgGradientA: '#1e1b4b',   // top
  bgGradientB: '#0a0a0f',   // bottom (current default)
  bgGradientAngle: 180,     // degrees, 180 = top→bottom
  setBgGradientEnabled: (v) => set({ bgGradientEnabled: v }),
  setBgGradientA: (v) => set({ bgGradientA: v }),
  setBgGradientB: (v) => set({ bgGradientB: v }),
  setBgGradientAngle: (v) => set({ bgGradientAngle: Math.max(0, Math.min(360, v | 0)) }),

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

  // Slideshow mode — rotate through filtered/favourited presets on a
  // timer. `slideshowOrder` is one of 'sequence' | 'shuffle' | 'favourites'.
  // The driver in App.jsx watches these and rotates accordingly; we
  // keep all state here so any UI surface can pause / change cadence.
  slideshowEnabled: false,
  slideshowDwellSec: 8,
  slideshowOrder: 'sequence',
  setSlideshowEnabled: (v) => set({ slideshowEnabled: v }),
  setSlideshowDwellSec: (v) => set({ slideshowDwellSec: Math.max(2, Math.min(120, v)) }),
  setSlideshowOrder: (v) => set({ slideshowOrder: v }),

  // Camera shake on beat — when audio reactivity + this toggle are on,
  // the camera nudges on each detected beat (or bass surge). Intensity
  // is a 0..1 scalar that the renderer multiplies by the active audio
  // signal before applying. Default off so the baseline scene is calm.
  cameraShake: false,
  cameraShakeIntensity: 0.5,
  setCameraShake: (v) => set({ cameraShake: v }),
  setCameraShakeIntensity: (v) => set({ cameraShakeIntensity: Math.max(0, Math.min(1, v)) }),

  // Mini-map overlay — small top-down XZ widget pinned to the bottom-
  // right of the canvas. Shows where the camera sits vs the scene
  // origin and lets the user click to recenter the orbit target.
  // Off by default; zero cost when off (component returns null).
  minimapEnabled: false,
  setMinimapEnabled: (v) => set({ minimapEnabled: !!v }),

  // Waveform overlay — small oscilloscope strip pinned to the top-
  // right of the canvas whenever audio reactivity is on AND this
  // toggle is enabled. Renders the live time-domain signal so users
  // can SEE what the audio reactivity is responding to. Off by
  // default; zero cost when off.
  waveformEnabled: false,
  setWaveformEnabled: (v) => set({ waveformEnabled: !!v }),

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
