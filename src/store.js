import { create } from 'zustand'
import { presets } from './presets'

const THEMES = {
  neon:       { neon: '#00ff88', hueShift: 0 },
  cyberpunk:  { neon: '#ff00ff', hueShift: 300 },
  ocean:      { neon: '#00d4ff', hueShift: 200 },
  fire:       { neon: '#ff6600', hueShift: 30 },
  monochrome: { neon: '#cccccc', hueShift: 0, saturation: 0 },
  rainbow:    { neon: '#ff00ff', hueShift: -1 }, // -1 = cycle
}

export { THEMES }

export const useStore = create((set, get) => ({
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

  // Physics engine
  gravityEnabled: false,
  gravityStrength: 0.5,
  collisionsEnabled: false,
  forceFieldType: null, // 'attractor' | 'repulsor' | 'vortex' | 'turbulence' | null
  forceFieldStrength: 1.0,

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
  presetSearch: '',
  showFavoritesOnly: false,

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

  // Actions
  setParticleCount: (v) => set({ particleCount: v }),
  setSpeed: (v) => set({ speed: v }),
  setGlowIntensity: (v) => set({ glowIntensity: v }),
  setVisualStyle: (v) => set({ visualStyle: v }),
  setPlaying: (v) => set({ playing: v }),
  setPrompt: (v) => set({ prompt: v }),
  setMouseAttract: (v) => set({ mouseAttract: v }),
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
  setGravityEnabled: (v) => set({ gravityEnabled: v }),
  setGravityStrength: (v) => set({ gravityStrength: v }),
  setCollisionsEnabled: (v) => set({ collisionsEnabled: v }),
  setForceFieldType: (v) => set({ forceFieldType: v }),
  setForceFieldStrength: (v) => set({ forceFieldStrength: v }),

  setTheme: (t) => {
    set({ theme: t })
    const theme = THEMES[t]
    if (theme) document.documentElement.style.setProperty('--neon', theme.neon)
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
    set({
      currentPreset: presetId,
      particleFn: fn,
      particleFnSource: preset.code,
      dynamicControls: controls,
      dynamicValues: Object.fromEntries(controls.map(c => [c.id, c.value])),
      infoTitle: title || preset.name,
      infoDesc: description || preset.description,
      ...physicsState,
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
    const idx = Math.floor(Math.random() * presets.length)
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
}))

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
