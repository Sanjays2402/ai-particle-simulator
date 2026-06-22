import { useState, useEffect, useRef } from 'react'
import { useStore, THEMES } from '../store'
import { presets } from '../presets'
import { GifEncoder } from '../lib/gifEncoder'
import { startCanvasRecording, downloadVideoBlob, isVideoExportSupported } from '../lib/videoRecorder'
import { CATEGORIES, categoryOf, countByCategory } from '../lib/presetCategories'
import {
  compassFor, WIND_PRESETS, WIND_PRESETS_DEFAULT, matchesWindPreset,
  loadWindOverrides, saveWindOverrides,
  setWindOverride, clearWindOverride,
  resolveWindPresets, isWindPresetCustom,
} from '../lib/wind'
import {
  DURATION_CHIPS as CROSSFADE_DURATION_CHIPS,
  matchDurationChip as matchCrossfadeChip,
  loadCrossfadeOverrides, saveCrossfadeOverrides,
  setCrossfadeOverride, clearCrossfadeOverride,
  resolveCrossfadeChips, isCrossfadeChipCustom,
} from '../lib/crossfade'
import { downloadThemesFile, parseImport as parseThemesImport, mergeImport as mergeThemesImport, summarizeImportImpact as summarizeThemesImpact } from '../lib/customThemesIO'
import { REACTIVE_CURVES } from '../lib/bgGradient'
import {
  downloadWindOverridesFile,
  parseImport as parseWindOverridesImport,
  mergeImport as mergeWindOverridesImport,
  summarizeImportImpact as summarizeWindOverridesImpact,
} from '../lib/windOverridesIO'
import {
  downloadCrossfadeOverridesFile,
  parseImport as parseCrossfadeOverridesImport,
  mergeImport as mergeCrossfadeOverridesImport,
} from '../lib/crossfadeOverridesIO'
import { ATTRACTOR_TYPES, MAX_ATTRACTORS, attractorTypeStyle } from '../lib/namedAttractors'
import { showToast } from './Toast'

const STYLES = ['sparkle', 'plasma', 'blob', 'ring', 'glow', 'dot']
const THEME_LIST = [
  { id: 'neon', name: 'Neon', color: '#6366f1' },
  { id: 'cyberpunk', name: 'Cyberpunk', color: '#ff00ff' },
  { id: 'ocean', name: 'Ocean', color: '#00d4ff' },
  { id: 'fire', name: 'Fire', color: '#ff6600' },
  { id: 'monochrome', name: 'Mono', color: '#cccccc' },
  { id: 'rainbow', name: 'Rainbow', color: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)' },
]

export default function LeftSidebar() {
  const [videoRec, setVideoRec] = useState(null)
  const [videoElapsed, setVideoElapsed] = useState(0)
  const {
    particleCount, setParticleCount,
    speed, setSpeed,
    glowIntensity, setGlowIntensity,
    visualStyle, setVisualStyle,
    loadPreset, currentPreset,
    prompt, setPrompt,
    generateFromPrompt, aiLoading, aiError, aiApiKey,
    attractStrength, setAttractStrength,
    trails, setTrails,
    performanceMode, setPerformanceMode,
    theme, setTheme,
    orbitSpeed, setOrbitSpeed,
    autoRotate, setAutoRotate,
    autoRotateSpeed, setAutoRotateSpeed,
    minDistance, setMinDistance,
    maxDistance, setMaxDistance,
    isExportingGif, gifProgress,
    gravityEnabled, setGravityEnabled,
    gravityStrength, setGravityStrength,
    collisionsEnabled, setCollisionsEnabled,
    forceFieldType, setForceFieldType,
    forceFieldStrength, setForceFieldStrength,
    favoritedPresets, toggleFavorite,
    presetSearch, setPresetSearch,
    showFavoritesOnly, setShowFavoritesOnly,
  } = useStore()

  const exportGif = async () => {
    const canvas = document.querySelector('#particle-canvas canvas')
    if (!canvas) return
    const store = useStore.getState()
    store.isExportingGif = true
    useStore.setState({ isExportingGif: true, gifProgress: null })

    const w = Math.min(canvas.width, 480)
    const h = Math.round(w * (canvas.height / canvas.width))
    const tmpCanvas = document.createElement('canvas')
    tmpCanvas.width = w
    tmpCanvas.height = h
    const ctx = tmpCanvas.getContext('2d', { willReadFrequently: true })

    const fps = 10
    const duration = 3
    const totalFrames = fps * duration
    const frameDelay = 1000 / fps
    const frames = []

    // Capture frames over 3 seconds
    for (let f = 0; f < totalFrames; f++) {
      await new Promise(r => setTimeout(r, frameDelay))
      ctx.drawImage(canvas, 0, 0, w, h)
      frames.push(ctx.getImageData(0, 0, w, h))
    }

    // Encode GIF
    const encoder = new GifEncoder(w, h, Math.round(frameDelay))
    frames.forEach(f => encoder.addFrame(f))
    useStore.setState({ gifProgress: { current: 0, total: totalFrames } })
    const bytes = encoder.encode((current, total) => {
      useStore.setState({ gifProgress: { current, total } })
    })

    // Download
    const blob = new Blob([bytes], { type: 'image/gif' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const name = (store.infoTitle || 'particles').replace(/\s+/g, '-').toLowerCase()
    a.download = `particle-${name}-${Date.now()}.gif`
    a.click()
    URL.revokeObjectURL(url)

    useStore.setState({ isExportingGif: false, gifProgress: null })
    useStore.getState().bumpSessionStat('gifsExported', 1)
  }

  const exportVideo = async () => {
    if (videoRec) {
      if (videoRec._cleanup) videoRec._cleanup()
      const { blob, mime } = await videoRec.stop()
      const baseName = `particle-${(useStore.getState().infoTitle || 'video').replace(/\s+/g, '-').toLowerCase()}`
      downloadVideoBlob(blob, mime, baseName)
      setVideoRec(null)
      setVideoElapsed(0)
      useStore.getState().bumpSessionStat('videosExported', 1)
      return
    }
    const canvas = document.querySelector('#particle-canvas canvas')
    if (!canvas) return
    const rec = startCanvasRecording(canvas, { fps: 30 })
    if (!rec) {
      window.alert('Video export not supported in this browser.')
      return
    }
    setVideoRec(rec)
    const started = Date.now()
    rec._timer = setInterval(() => setVideoElapsed((Date.now() - started) / 1000), 250)
    rec._cleanup = () => clearInterval(rec._timer)
  }

  return (
    <div className="sidebar-glow-left" style={{
      position: 'relative',
      width: 280,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'linear-gradient(180deg, rgba(8,8,14,0.72) 0%, rgba(12,12,22,0.68) 100%)',
      backdropFilter: 'blur(28px) saturate(140%)',
      WebkitBackdropFilter: 'blur(28px) saturate(140%)',
      borderRight: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.02), 1px 0 40px rgba(0,0,0,0.25)',
      height: '100%',
    }}>
      <Section title="System Core">
        <Slider label="Particles" value={particleCount} min={1000} max={performanceMode ? 10000 : 50000} step={1000}
          onChange={setParticleCount} display={v => `${(v/1000).toFixed(0)}K`} />
        <Slider label="Speed" value={speed} min={0} max={3} step={0.1}
          onChange={setSpeed} display={v => v.toFixed(1)} />
        <Slider label="Glow" value={glowIntensity} min={0} max={5} step={0.1}
          onChange={setGlowIntensity} display={v => v.toFixed(1)} />
        <Slider label="Attract Str." value={attractStrength} min={0} max={10} step={0.5}
          onChange={setAttractStrength} display={v => v.toFixed(1)} />

        <ToggleRow label="Trails" value={trails} onChange={setTrails} />
        <ToggleRow label="Performance Mode" value={performanceMode} onChange={setPerformanceMode} />
        {performanceMode && (
          <p style={{ fontSize: 11, color: '#f59e0b', marginTop: 4 }}>⚡ Particle count reduced 50%</p>
        )}

        {/* Quick particle-count presets. */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: '#7a7a90', marginBottom: 6, fontWeight: 500 }}>Quality Preset</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {[
              { id: 'low',   label: 'Low',   count: 2000  },
              { id: 'med',   label: 'Med',   count: 10000 },
              { id: 'high',  label: 'High',  count: 25000 },
              { id: 'ultra', label: 'Ultra', count: 50000 },
            ].map(p => {
              const active = particleCount === p.count
              return (
                <button key={p.id}
                  onClick={() => {
                    if (performanceMode) setPerformanceMode(false)
                    setParticleCount(p.count)
                  }}
                  className="quality-chip"
                  style={{
                    padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
                    cursor: 'pointer', transition: 'all 0.15s ease-out',
                    background: active
                      ? 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(236,72,153,0.18) 100%)'
                      : 'rgba(255,255,255,0.03)',
                    color: active ? '#f3e8ff' : '#8a8aa0',
                    border: active ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.05)',
                    boxShadow: active ? '0 0 12px rgba(168,85,247,0.22)' : 'none',
                  }}
                  title={`${(p.count / 1000).toFixed(0)}K particles`}
                >{p.label}</button>
              )
            })}
          </div>
        </div>
      </Section>

      <Section title="Camera">
        <Slider label="Orbit Speed" value={orbitSpeed} min={0.1} max={2} step={0.1}
          onChange={setOrbitSpeed} display={v => v.toFixed(1)} />
        <ToggleRow label="Auto-Rotate" value={autoRotate} onChange={setAutoRotate} />
        {autoRotate && (
          <Slider label="Rotate Speed" value={autoRotateSpeed} min={0.5} max={10} step={0.5}
            onChange={setAutoRotateSpeed} display={v => v.toFixed(1)} />
        )}
        <Slider label="Min Zoom" value={minDistance} min={1} max={20} step={1}
          onChange={setMinDistance} display={v => `${v}`} />
        <Slider label="Max Zoom" value={maxDistance} min={20} max={100} step={5}
          onChange={setMaxDistance} display={v => `${v}`} />
        <ToggleRow
          label="Mini-map"
          value={useStore(s => s.minimapEnabled)}
          onChange={useStore(s => s.setMinimapEnabled)}
        />
      </Section>

      <Section title="Cursor">
        <ToggleRow
          label="Mouse Trail"
          value={useStore(s => s.mouseTrail)}
          onChange={useStore(s => s.setMouseTrail)}
        />
      </Section>

      <Section title="Wind">
        <WindRow />
      </Section>

      <Section title="Noise Deformer">
        <NoiseRow />
      </Section>

      <Section title="Kaleidoscope">
        <KaleidoscopeRow />
      </Section>

      <Section title="Audio Reactivity">
        <p style={{ fontSize: 11, color: '#7a7a90', marginBottom: 8 }}>
          Click the 🎤 toolbar button to enable. Pick how audio drives the visuals:
        </p>
        <AudioModeRow />
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <CameraShakeRow />
        </div>
        <div style={{ marginTop: 8 }}>
          <ToggleRow
            label="Waveform overlay"
            value={useStore(s => s.waveformEnabled)}
            onChange={useStore(s => s.setWaveformEnabled)}
          />
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <MidiButton />
        </div>
      </Section>

      <Section title="Post-FX">
        <PostFXRow />
      </Section>

      <Section title="Gradient Palette">
        <PaletteRow />
      </Section>

      <Section title="Export">
        <button
          onClick={() => {
            if (isExportingGif) return
            exportGif()
          }}
          disabled={isExportingGif}
          style={{
            width: '100%',
            padding: '11px 0',
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            cursor: isExportingGif ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s cubic-bezier(0.2,0.8,0.2,1)',
            background: isExportingGif
              ? 'rgba(255,255,255,0.04)'
              : 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
            backgroundSize: '200% 100%',
            backgroundPosition: '0% 0%',
            color: isExportingGif ? '#7a7a90' : '#ffffff',
            border: 'none',
            boxShadow: isExportingGif ? 'none' : '0 6px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)',
          }}
          onMouseEnter={e => {
            if (!isExportingGif) {
              e.currentTarget.style.backgroundPosition = '100% 0%'
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 10px 28px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.25)'
            }
          }}
          onMouseLeave={e => {
            if (!isExportingGif) {
              e.currentTarget.style.backgroundPosition = '0% 0%'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
            }
          }}
        >
          {isExportingGif
            ? gifProgress
              ? `🎬 Encoding... ${gifProgress.current}/${gifProgress.total}`
              : '🎬 Capturing...'
            : '🎬 Export as GIF (3s)'}
        </button>

        {isVideoExportSupported() && (
          <button
            onClick={exportVideo}
            style={{
              width: '100%', marginTop: 8,
              padding: '11px 0', borderRadius: 10,
              fontSize: 12.5, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s ease-out',
              background: videoRec
                ? 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)'
                : 'rgba(255,255,255,0.04)',
              color: videoRec ? '#ffffff' : '#c8c8d0',
              border: videoRec
                ? '1px solid rgba(239,68,68,0.5)'
                : '1px solid rgba(255,255,255,0.06)',
              boxShadow: videoRec ? '0 4px 18px rgba(239,68,68,0.35)' : 'none',
            }}
            title="Capture canvas to WebM / MP4 (browser dependent)"
          >
            {videoRec
              ? `⏺︎ Recording · ${videoElapsed.toFixed(1)}s · Stop & save`
              : '🎥 Record Video (WebM/MP4)'}
          </button>
        )}
      </Section>

      <Section title="Physics Engine">
        <ToggleRow label="Gravity" value={gravityEnabled} onChange={setGravityEnabled} />
        {gravityEnabled && (
          <Slider label="Gravity Strength" value={gravityStrength} min={0} max={2} step={0.1}
            onChange={setGravityStrength} display={v => v.toFixed(1)} />
        )}
        <ToggleRow label="Collisions" value={collisionsEnabled} onChange={setCollisionsEnabled} />

        <div style={{ marginTop: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#9a9ab0', fontWeight: 500 }}>Force Field</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
          {[
            { id: 'attractor', label: 'Attract', ico: '🧲' },
            { id: 'repulsor', label: 'Repulse', ico: '💥' },
            { id: 'vortex', label: 'Vortex', ico: '🌀' },
            { id: 'turbulence', label: 'Turb.', ico: '💨' },
          ].map(ff => (
            <button key={ff.id}
              onClick={() => setForceFieldType(forceFieldType === ff.id ? null : ff.id)}
              className={`ff-btn ${forceFieldType === ff.id ? 'active' : ''}`}
            >
              <span className="ff-ico">{ff.ico}</span>
              {ff.label}
            </button>
          ))}
        </div>
        {forceFieldType && (
          <>
            <Slider label="Field Strength" value={forceFieldStrength} min={0} max={5} step={0.1}
              onChange={setForceFieldStrength} display={v => v.toFixed(1)} />
            <PlaceFieldRow />
          </>
        )}
      </Section>

      <Section title="Named Attractors">
        <NamedAttractorsBlock />
      </Section>

      <Section title="Crossfade">
        <CrossfadeRow />
      </Section>

      <Section title="Visual Style">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {STYLES.map(s => (
            <button key={s} onClick={() => setVisualStyle(s)}
              style={{
                padding: '10px 8px',
                borderRadius: 8,
                fontSize: 11.5,
                fontWeight: 550,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.2,0.8,0.2,1)',
                background: visualStyle === s
                  ? 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(236,72,153,0.18) 100%)'
                  : 'rgba(255,255,255,0.03)',
                color: visualStyle === s ? '#f3e8ff' : '#8a8aa0',
                border: visualStyle === s ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.05)',
                boxShadow: visualStyle === s ? '0 0 14px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
              }}
            >{s}</button>
          ))}
        </div>
      </Section>

      <Section title="Theme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {THEME_LIST.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              title={t.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 5,
                padding: '8px 4px',
                borderRadius: 8,
                fontSize: 10.5,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.2,0.8,0.2,1)',
                background: theme === t.id ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                border: theme === t.id
                  ? `1px solid ${t.color.startsWith('linear') ? 'rgba(255,255,255,0.3)' : t.color + '80'}`
                  : '1px solid rgba(255,255,255,0.04)',
                color: theme === t.id ? '#eeeef0' : '#8a8aa0',
                boxShadow: theme === t.id && !t.color.startsWith('linear')
                  ? `0 0 12px ${t.color}40` : theme === t.id ? '0 0 14px rgba(168,85,247,0.25)' : 'none',
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: t.color,
                boxShadow: `0 0 8px ${t.color.startsWith('linear') ? 'rgba(255,255,255,0.25)' : t.color}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                flexShrink: 0,
              }} />
              {t.name}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <CustomThemesRow />
        </div>
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <HueCycleRow />
        </div>
      </Section>

      <Section title="Background">
        <BgGradientRow />
      </Section>

      <Section title="Slideshow">
        <SlideshowRow />
      </Section>

      <Section title="Shape Presets">
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              value={presetSearch}
              onChange={e => setPresetSearch(e.target.value)}
              placeholder="Search presets…"
              className="search-v3"
            />
            {presetSearch && (
              <button onClick={() => setPresetSearch('')}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', color: '#7a7a90', cursor: 'pointer', fontSize: 12 }}>✕</button>
            )}
          </div>
          <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: showFavoritesOnly ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
              color: showFavoritesOnly ? '#f59e0b' : '#7a7a90',
              border: showFavoritesOnly ? '1px solid rgba(245,158,11,0.25)' : '1px solid rgba(255,255,255,0.06)',
              transition: 'all 0.15s ease-out', whiteSpace: 'nowrap',
            }}>★ Favs</button>
        </div>
        <CategoryChips />
        <PresetList
          presetSearch={presetSearch}
          showFavoritesOnly={showFavoritesOnly}
          favoritedPresets={favoritedPresets}
          currentPreset={currentPreset}
          loadPreset={loadPreset}
          toggleFavorite={toggleFavorite}
        />
      </Section>

      <Section title="Smart Text Engine">
        {!aiApiKey && (
          <p style={{ fontSize: 12, color: '#7a7a90', marginBottom: 8 }}>
            Configure API key in ⚙ Settings to enable AI generation
          </p>
        )}
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="Describe a particle effect..." rows={3}
          style={{
            width: '100%',
            borderRadius: 8,
            padding: 12,
            fontSize: 13,
            resize: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            background: 'rgba(255,255,255,0.03)',
            color: '#eeeef0',
            border: '1px solid rgba(255,255,255,0.06)',
            transition: 'all 0.15s ease-out',
          }}
          onFocus={e => {
            e.target.style.borderColor = 'rgba(99,102,241,0.4)'
            e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
          }}
          onBlur={e => {
            e.target.style.borderColor = 'rgba(255,255,255,0.06)'
            e.target.style.boxShadow = 'none'
          }}
        />
        <button onClick={generateFromPrompt} disabled={aiLoading || !prompt.trim()}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '11px 0',
            borderRadius: 10,
            fontSize: 12.5,
            fontWeight: 600,
            letterSpacing: '-0.005em',
            cursor: aiLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.22s cubic-bezier(0.2,0.8,0.2,1)',
            background: aiLoading
              ? 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899, #a855f7, #6366f1)'
              : 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
            backgroundSize: aiLoading ? '300% 100%' : '100% 100%',
            animation: aiLoading ? 'gen-shimmer 2s linear infinite' : 'none',
            color: '#ffffff',
            border: '1px solid rgba(168,85,247,0.5)',
            opacity: aiLoading || !prompt.trim() ? (aiLoading ? 1 : 0.4) : 1,
            boxShadow: !aiLoading && prompt.trim()
              ? '0 4px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18)'
              : 'none',
          }}
          onMouseEnter={e => {
            if (!aiLoading && prompt.trim()) {
              e.currentTarget.style.transform = 'translateY(-1px)'
              e.currentTarget.style.boxShadow = '0 8px 28px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.22)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            if (!aiLoading && prompt.trim()) e.currentTarget.style.boxShadow = '0 4px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18)'
          }}
        >
          {aiLoading ? '✨ Generating…' : '✦ Generate'}
        </button>
        <style>{`@keyframes gen-shimmer { 0% { background-position: 0% 50%; } 100% { background-position: 300% 50%; } }`}</style>
        {aiError && <p style={{ fontSize: 12, marginTop: 8, color: '#ef4444' }}>{aiError}</p>}
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ padding: '14px 16px 8px' }}>
      <div className="section-label-v2" style={{ marginBottom: 12 }}>
        <span className="dot" />
        {title}
      </div>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, display }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: '#9a9ab0', fontWeight: 500, letterSpacing: '-0.005em' }}>{label}</span>
        <span className="value-chip">{display ? display(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', '--val': `${pct}%` }} />
    </div>
  )
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: '#7a7a90' }}>{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.22s cubic-bezier(0.2,0.8,0.2,1)',
        background: value
          ? 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)'
          : 'rgba(255,255,255,0.06)',
        border: value ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.07)',
        boxShadow: value ? '0 0 14px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.15)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        position: 'absolute',
        top: 2,
        left: value ? 19 : 3,
        background: '#ffffff',
        transition: 'all 0.22s cubic-bezier(0.2,0.8,0.2,1)',
        boxShadow: value ? '0 2px 6px rgba(0,0,0,0.35), 0 0 0 0 rgba(168,85,247,0.4)' : '0 2px 4px rgba(0,0,0,0.35)',
      }} />
    </button>
  )
}

// Two-stop gradient palette picker. Quick chips swap in canned looks;
// the two color inputs let users pick exact endpoints.
const PALETTE_PRESETS = [
  { id: 'indigo-pink', a: '#6366f1', b: '#ec4899', label: 'Indigo → Pink' },
  { id: 'sunset',      a: '#f97316', b: '#dc2626', label: 'Sunset' },
  { id: 'ocean',       a: '#22d3ee', b: '#1e3a8a', label: 'Ocean Deep' },
  { id: 'mint',        a: '#bbf7d0', b: '#0e7490', label: 'Mint Lagoon' },
  { id: 'mono',        a: '#f5f5f5', b: '#111111', label: 'Mono' },
  { id: 'aurora',      a: '#a3e635', b: '#7c3aed', label: 'Aurora' },
]
function PaletteRow() {
  const enabled = useStore(s => s.paletteEnabled)
  const setEnabled = useStore(s => s.setPaletteEnabled)
  const a = useStore(s => s.paletteA)
  const b = useStore(s => s.paletteB)
  const mix = useStore(s => s.paletteMix)
  const setA = useStore(s => s.setPaletteA)
  const setB = useStore(s => s.setPaletteB)
  const setMix = useStore(s => s.setPaletteMix)
  return (
    <>
      <ToggleRow label="Enable Palette" value={enabled} onChange={setEnabled} />
      {enabled && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: '#8a8aa0' }}>Top</label>
            <input type="color" value={a} onChange={e => setA(e.target.value)}
              style={{ width: 36, height: 26, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
            <label style={{ fontSize: 11, color: '#8a8aa0', marginLeft: 8 }}>Bot</label>
            <input type="color" value={b} onChange={e => setB(e.target.value)}
              style={{ width: 36, height: 26, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
            <div style={{
              flex: 1, height: 24, marginLeft: 6, borderRadius: 6,
              background: `linear-gradient(180deg, ${a} 0%, ${b} 100%)`,
              border: '1px solid rgba(255,255,255,0.06)',
            }} />
          </div>
          <Slider label="Mix" value={mix} min={0} max={1} step={0.05}
            onChange={setMix} display={v => `${Math.round(v * 100)}%`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
            {PALETTE_PRESETS.map(p => (
              <button key={p.id} onClick={() => { setA(p.a); setB(p.b) }} title={p.label}
                style={{
                  height: 28, borderRadius: 6, cursor: 'pointer',
                  background: `linear-gradient(180deg, ${p.a} 0%, ${p.b} 100%)`,
                  border: (a === p.a && b === p.b)
                    ? '1px solid rgba(168,85,247,0.6)'
                    : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: (a === p.a && b === p.b) ? '0 0 12px rgba(168,85,247,0.35)' : 'none',
                }} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

// Post-FX toggles + intensity sliders. Each effect is opt-in so the
// default scene is unchanged until the user explicitly enables one.
function PostFXRow() {
  const chromaticAberration   = useStore(s => s.chromaticAberration)
  const chromaticIntensity    = useStore(s => s.chromaticIntensity)
  const vignette              = useStore(s => s.vignette)
  const vignetteIntensity     = useStore(s => s.vignetteIntensity)
  const filmGrain             = useStore(s => s.filmGrain)
  const filmGrainIntensity    = useStore(s => s.filmGrainIntensity)
  const depthOfField          = useStore(s => s.depthOfField)
  const dofFocusDistance      = useStore(s => s.dofFocusDistance)
  const dofFocalLength        = useStore(s => s.dofFocalLength)
  const dofBokehScale         = useStore(s => s.dofBokehScale)
  const setChromaticAberration = useStore(s => s.setChromaticAberration)
  const setChromaticIntensity  = useStore(s => s.setChromaticIntensity)
  const setVignette            = useStore(s => s.setVignette)
  const setVignetteIntensity   = useStore(s => s.setVignetteIntensity)
  const setFilmGrain           = useStore(s => s.setFilmGrain)
  const setFilmGrainIntensity  = useStore(s => s.setFilmGrainIntensity)
  const setDepthOfField        = useStore(s => s.setDepthOfField)
  const setDofFocusDistance    = useStore(s => s.setDofFocusDistance)
  const setDofFocalLength      = useStore(s => s.setDofFocalLength)
  const setDofBokehScale       = useStore(s => s.setDofBokehScale)
  return (
    <>
      <ToggleRow label="Chromatic Aberration" value={chromaticAberration} onChange={setChromaticAberration} />
      {chromaticAberration && (
        <Slider label="CA Intensity" value={chromaticIntensity} min={0} max={0.015} step={0.0005}
          onChange={setChromaticIntensity} display={v => v.toFixed(4)} />
      )}
      <ToggleRow label="Vignette" value={vignette} onChange={setVignette} />
      {vignette && (
        <Slider label="Vignette Darkness" value={vignetteIntensity} min={0} max={1} step={0.05}
          onChange={setVignetteIntensity} display={v => v.toFixed(2)} />
      )}
      <ToggleRow label="Film Grain" value={filmGrain} onChange={setFilmGrain} />
      {filmGrain && (
        <Slider label="Grain Intensity" value={filmGrainIntensity} min={0} max={0.6} step={0.02}
          onChange={setFilmGrainIntensity} display={v => v.toFixed(2)} />
      )}
      <ToggleRow label="Depth of Field" value={depthOfField} onChange={setDepthOfField} />
      {depthOfField && (
        <>
          <Slider label="Focus Distance" value={dofFocusDistance} min={0} max={0.2} step={0.001}
            onChange={setDofFocusDistance} display={v => v.toFixed(3)} />
          <Slider label="Focal Length" value={dofFocalLength} min={0} max={0.2} step={0.005}
            onChange={setDofFocalLength} display={v => v.toFixed(3)} />
          <Slider label="Bokeh Scale" value={dofBokehScale} min={0} max={12} step={0.5}
            onChange={setDofBokehScale} display={v => v.toFixed(1)} />
        </>
      )}
    </>
  )
}

// Three-way segmented control for the audio reactivity mode.
function AudioModeRow() {
  const audioMode = useStore(s => s.audioMode)
  const setAudioMode = useStore(s => s.setAudioMode)
  const audioReactive = useStore(s => s.audioReactive)
  const audioBass = useStore(s => s.audioBass)
  const audioBeat = useStore(s => s.audioBeat)
  const audioLevel = useStore(s => s.audioLevel)
  const MODES = [
    { id: 'level', label: 'Level', desc: 'Full spectrum average' },
    { id: 'bass',  label: 'Bass',  desc: 'Low-frequency band' },
    { id: 'beat',  label: 'Beat',  desc: 'Pulse on kick drum' },
  ]
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {MODES.map(m => (
          <button key={m.id} onClick={() => setAudioMode(m.id)} title={m.desc}
            style={{
              padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 550, cursor: 'pointer',
              transition: 'all 0.15s ease-out',
              background: audioMode === m.id
                ? 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(236,72,153,0.18) 100%)'
                : 'rgba(255,255,255,0.03)',
              color: audioMode === m.id ? '#f3e8ff' : '#8a8aa0',
              border: audioMode === m.id ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.05)',
              opacity: audioReactive ? 1 : 0.7,
            }}
          >{m.label}</button>
        ))}
      </div>
      {audioReactive && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#7a7a90', fontFamily: 'JetBrains Mono, monospace', display: 'flex', justifyContent: 'space-between' }}>
          <span>lvl <span style={{ color: '#a8a8b8' }}>{audioLevel.toFixed(2)}</span></span>
          <span>bass <span style={{ color: '#a8a8b8' }}>{audioBass.toFixed(2)}</span></span>
          <span>beat <span style={{ color: audioBeat > 0.5 ? '#86efac' : '#a8a8b8' }}>{audioBeat.toFixed(2)}</span></span>
        </div>
      )}
    </div>
  )
}

// Camera shake on beat — couples the audio beat detector to a per-frame
// camera nudge. Intensity slider gates the max amplitude; visible only
// when the toggle is on so the section stays tidy by default.
function CameraShakeRow() {
  const enabled  = useStore(s => s.cameraShake)
  const intensity = useStore(s => s.cameraShakeIntensity)
  const setEnabled  = useStore(s => s.setCameraShake)
  const setIntensity = useStore(s => s.setCameraShakeIntensity)
  return (
    <>
      <ToggleRow label="Camera Shake on Beat" value={enabled} onChange={setEnabled} />
      {enabled && (
        <>
          <Slider label="Shake Intensity" value={intensity} min={0} max={1} step={0.05}
            onChange={setIntensity} display={v => `${Math.round(v * 100)}%`} />
          <p style={{ fontSize: 11, color: '#7a7a90', marginTop: -4 }}>
            Best paired with the <span style={{ color: '#c084fc' }}>Beat</span> mode above.
          </p>
        </>
      )}
    </>
  )
}

// User-authored themes — name + accent color + hue shift, persisted
// via `lib/customThemes`. Lives at the bottom of the Theme section so
// the built-in chips remain the primary surface; the editor only
// surfaces when the user wants to create / pick a custom theme.
function CustomThemesRow() {
  const customThemes = useStore(s => s.customThemes)
  const activeTheme  = useStore(s => s.theme)
  const setTheme     = useStore(s => s.setTheme)
  const addCustomTheme = useStore(s => s.addCustomTheme)
  const removeCustomTheme = useStore(s => s.removeCustomTheme)
  const setCustomThemes   = useStore(s => s.setCustomThemes)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('My Theme')
  const [neon, setNeon] = useState('#a855f7')
  const [hueShift, setHueShift] = useState(0)
  // Theme-pack import preview — populated by importFromFile when the
  // user picks a JSON; cleared after they commit or cancel. Shape:
  //   { items: parsed-themes, filename: string }
  const [pendingPack, setPendingPack] = useState(null)
  // Mode the preview panel will commit with — 'merge' (default, safer)
  // or 'replace' (drops all existing custom themes). Held alongside
  // the pack so the impact summary updates as the user flips modes.
  const [pendingMode, setPendingMode] = useState('merge')

  const save = () => {
    const id = addCustomTheme({ name, neon, hueShift })
    if (id) setTheme(id)
    setOpen(false)
  }

  const exportNow = () => {
    if (customThemes.length === 0) {
      showToast('No custom themes to export')
      return
    }
    const filename = downloadThemesFile(customThemes)
    if (filename) {
      showToast(`Exported ${customThemes.length} → ${filename}`)
    } else {
      showToast('Export failed — check console')
    }
  }

  // Open a file picker, parse the JSON, then surface a preview panel
  // (instead of a window.confirm) so the user can SEE the themes before
  // committing. The actual merge/replace happens in commitPendingPack
  // after the user clicks one of the action buttons.
  const importFromFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const res = parseThemesImport(text)
        if (!res.ok) {
          showToast(`Import failed: ${res.error}`)
          return
        }
        setPendingPack({ items: res.items, filename: file.name })
        setPendingMode('merge')
      } catch (e) {
        showToast(`Import error: ${e.message || 'unknown'}`)
      }
    }
    input.click()
  }

  // Apply the previewed pack with the currently-selected mode.
  const commitPendingPack = () => {
    if (!pendingPack) return
    const merged = mergeThemesImport(customThemes, pendingPack.items, pendingMode)
    setCustomThemes(merged.items)
    const summary = pendingMode === 'merge'
      ? `Merged: +${merged.added}${merged.skipped ? `, ${merged.skipped} skipped` : ''}`
      : `Replaced: ${merged.added} loaded`
    showToast(summary)
    setPendingPack(null)
  }
  const cancelPendingPack = () => setPendingPack(null)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 550, color: '#a8a8b8', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          Custom Themes
        </span>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            fontSize: 11, padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
            background: open ? 'rgba(168,85,247,0.18)' : 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(168,85,247,0.25)', color: '#d8b4fe',
          }}
        >{open ? 'Close' : '+ New'}</button>
      </div>

      {customThemes.length === 0 && !open && (
        <p style={{ fontSize: 11, color: '#7a7a90', margin: 0 }}>
          No custom themes yet. Click <span style={{ color: '#c084fc' }}>+ New</span> to create one.
        </p>
      )}

      {customThemes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: open ? 10 : 0 }}>
          {customThemes.map(t => {
            const active = activeTheme === t.id
            return (
              <div key={t.id} style={{ position: 'relative' }}>
                <button
                  onClick={() => setTheme(t.id)}
                  title={`${t.name} · hue ${t.hueShift >= 0 ? '+' : ''}${t.hueShift}°`}
                  style={{
                    width: '100%',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '8px 4px', borderRadius: 8, fontSize: 10.5, fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.2,0.8,0.2,1)',
                    background: active ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    border: active ? `1px solid ${t.neon}80` : '1px solid rgba(255,255,255,0.04)',
                    color: active ? '#eeeef0' : '#8a8aa0',
                    boxShadow: active ? `0 0 12px ${t.neon}40` : 'none',
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: t.neon,
                    boxShadow: `0 0 8px ${t.neon}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                    flexShrink: 0,
                  }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {t.name}
                  </span>
                </button>
                <button
                  onClick={() => removeCustomTheme(t.id)}
                  title="Delete"
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 18, height: 18, padding: 0, lineHeight: 1,
                    borderRadius: 4, cursor: 'pointer', fontSize: 11,
                    background: 'rgba(0,0,0,0.5)', color: '#f0abfc',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >×</button>
              </div>
            )
          })}
        </div>
      )}

      {customThemes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: open ? 10 : 8 }}>
          <button onClick={exportNow}
            title={`Download ${customThemes.length} custom theme${customThemes.length === 1 ? '' : 's'} as JSON`}
            style={{
              padding: '6px 0', borderRadius: 7, fontSize: 10.5, fontWeight: 550,
              cursor: 'pointer',
              background: 'rgba(168,85,247,0.10)',
              color: '#e9d5ff',
              border: '1px solid rgba(168,85,247,0.22)',
              letterSpacing: '0.02em',
            }}>↓ Export</button>
          <button onClick={importFromFile}
            title="Load custom themes from a JSON file"
            style={{
              padding: '6px 0', borderRadius: 7, fontSize: 10.5, fontWeight: 550,
              cursor: 'pointer',
              background: 'rgba(99,102,241,0.10)',
              color: '#c7d2fe',
              border: '1px solid rgba(99,102,241,0.25)',
              letterSpacing: '0.02em',
            }}>↑ Import</button>
        </div>
      )}
      {customThemes.length === 0 && !open && (
        <button onClick={importFromFile}
          title="Load a theme pack from a JSON file"
          style={{
            width: '100%', marginTop: 4,
            padding: '6px 0', borderRadius: 7, fontSize: 10.5, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(99,102,241,0.08)',
            color: '#c7d2fe',
            border: '1px solid rgba(99,102,241,0.2)',
            letterSpacing: '0.02em',
          }}>↑ Import Theme Pack</button>
      )}

      {pendingPack && (
        <ThemePackPreview
          pack={pendingPack}
          mode={pendingMode}
          onModeChange={setPendingMode}
          existing={customThemes}
          onCommit={commitPendingPack}
          onCancel={cancelPendingPack}
        />
      )}

      {open && (
        <div style={{
          marginTop: 8, padding: 10, borderRadius: 8,
          background: 'rgba(168,85,247,0.06)',
          border: '1px solid rgba(168,85,247,0.18)',
        }}>
          <label style={{ fontSize: 11, color: '#a8a8b8', display: 'block', marginBottom: 4 }}>
            Name
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 32))}
            placeholder="My Theme"
            style={{
              width: '100%', padding: '6px 8px', borderRadius: 6,
              background: 'rgba(0,0,0,0.3)', color: '#eeeef0', fontSize: 12,
              border: '1px solid rgba(255,255,255,0.08)', marginBottom: 10,
            }}
          />
          <label style={{ fontSize: 11, color: '#a8a8b8', display: 'block', marginBottom: 4 }}>
            Accent Color
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <input type="color" value={neon}
              onChange={e => setNeon(e.target.value)}
              style={{ width: 36, height: 28, border: 'none', cursor: 'pointer', background: 'transparent' }} />
            <input value={neon}
              onChange={e => setNeon(e.target.value)}
              maxLength={7}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 6,
                background: 'rgba(0,0,0,0.3)', color: '#eeeef0', fontSize: 12,
                fontFamily: 'JetBrains Mono, monospace',
                border: '1px solid rgba(255,255,255,0.08)',
              }} />
          </div>
          <Slider label="Hue Shift" value={hueShift} min={-180} max={180} step={5}
            onChange={setHueShift} display={v => `${v >= 0 ? '+' : ''}${v}°`} />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button
              onClick={save}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
                border: 'none', color: '#fff', cursor: 'pointer',
              }}
            >Save Theme</button>
            <button
              onClick={() => setOpen(false)}
              style={{
                padding: '8px 14px', borderRadius: 6, fontSize: 12,
                background: 'rgba(255,255,255,0.04)', color: '#8a8aa0',
                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ThemePackPreview — a panel that surfaces what's INSIDE an imported
// theme pack before the user commits. Shows up to 12 chips (one per
// theme) with the accent color + name + hue shift, and an impact
// summary that updates live as the user toggles merge vs replace
// (e.g. "+3 new, 2 will overwrite, 1 won't fit"). Cancel dismisses
// the pack without touching the live theme list; Apply runs the
// configured merge.
function ThemePackPreview({ pack, mode, onModeChange, existing, onCommit, onCancel }) {
  const impact = summarizeThemesImpact(existing, pack.items, mode)
  // Conflict lookup so we can mark colliding chips with a "exists" badge.
  const conflictSet = new Set(impact.conflicts || [])
  return (
    <div style={{
      marginTop: 10, padding: 10, borderRadius: 8,
      background: 'rgba(99,102,241,0.07)',
      border: '1px solid rgba(99,102,241,0.25)',
      animation: 'theme-pack-rise 0.18s cubic-bezier(0.2,0.8,0.2,1)',
    }}>
      <style>{`@keyframes theme-pack-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 600, letterSpacing: '0.02em' }}>
          Preview: {pack.items.length} theme{pack.items.length === 1 ? '' : 's'}
        </span>
        <span style={{ fontSize: 10, color: '#7a7a90', fontFamily: 'Geist Mono, monospace', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          title={pack.filename}>
          {pack.filename}
        </span>
      </div>
      {/* Theme chips — same look as the live custom-themes grid above */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
        {pack.items.map((t, i) => {
          const isConflict = conflictSet.has(t.name)
          return (
            <div key={`${t.name}-${i}`}
              title={`${t.name} · hue ${t.hueShift >= 0 ? '+' : ''}${t.hueShift || 0}°${isConflict ? ' · name already exists' : ''}`}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '8px 4px', borderRadius: 8, fontSize: 10.5, fontWeight: 500,
                background: isConflict ? 'rgba(245,158,11,0.07)' : 'rgba(255,255,255,0.02)',
                border: isConflict
                  ? '1px solid rgba(245,158,11,0.35)'
                  : `1px solid ${t.neon || '#666'}40`,
                color: isConflict ? '#fde68a' : '#cfcfde',
                position: 'relative',
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%',
                background: t.neon || '#666',
                boxShadow: `0 0 8px ${t.neon || '#666'}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                flexShrink: 0,
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                {t.name}
              </span>
              {isConflict && (
                <span style={{
                  position: 'absolute', top: 2, right: 4,
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.05em',
                  color: '#fde68a',
                }}>!</span>
              )}
            </div>
          )
        })}
      </div>
      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <button onClick={() => onModeChange('merge')}
          title="Keep existing themes; add new ones; skip names that already exist."
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: mode === 'merge' ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.04)',
            color: mode === 'merge' ? '#dbeafe' : '#8a8aa0',
            border: mode === 'merge' ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.07)',
          }}>Merge</button>
        <button onClick={() => onModeChange('replace')}
          title="Drop ALL current custom themes and load just the imported pack."
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: mode === 'replace' ? 'rgba(239,68,68,0.18)' : 'rgba(255,255,255,0.04)',
            color: mode === 'replace' ? '#fecaca' : '#8a8aa0',
            border: mode === 'replace' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.07)',
          }}>Replace</button>
      </div>
      {/* Impact line — short and unambiguous so users know exactly what
          'Apply' is about to do. Colour matches the mode: indigo when
          additive, red when destructive. */}
      <p style={{
        fontSize: 10.5, color: mode === 'replace' ? '#fca5a5' : '#a5b4fc',
        margin: 0, marginBottom: 8, lineHeight: 1.5,
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
      }}>
        {mode === 'replace'
          ? `Replace: drops ${impact.willOverwrite} existing, loads ${impact.willAdd}${impact.willSkip ? ` (${impact.willSkip} won\u2019t fit — cap ${impact.willCapTo})` : ''}.`
          : `Merge: +${impact.willAdd} new${impact.willSkip ? ` · ${impact.willSkip} skipped` : ''} → ${impact.resultLength}/${impact.willCapTo} total.`}
      </p>
      {/* Apply / Cancel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button onClick={onCancel}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            color: '#c8c8d4',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>Cancel</button>
        <button onClick={onCommit}
          disabled={impact.willAdd === 0 && mode === 'merge'}
          title={impact.willAdd === 0 && mode === 'merge'
            ? 'Nothing to add — all imported names already exist or the cap is full.'
            : `Apply ${impact.willAdd} theme${impact.willAdd === 1 ? '' : 's'} (${mode} mode).`}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
            cursor: (impact.willAdd === 0 && mode === 'merge') ? 'not-allowed' : 'pointer',
            background: (impact.willAdd === 0 && mode === 'merge')
              ? 'rgba(255,255,255,0.04)'
              : mode === 'replace'
                ? 'linear-gradient(135deg, rgba(239,68,68,0.22), rgba(168,85,247,0.18))'
                : 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(168,85,247,0.2))',
            color: (impact.willAdd === 0 && mode === 'merge')
              ? '#7a7a90'
              : mode === 'replace' ? '#fee2e2' : '#e9d5ff',
            border: (impact.willAdd === 0 && mode === 'merge')
              ? '1px solid rgba(255,255,255,0.07)'
              : mode === 'replace'
                ? '1px solid rgba(239,68,68,0.4)'
                : '1px solid rgba(168,85,247,0.4)',
            opacity: (impact.willAdd === 0 && mode === 'merge') ? 0.6 : 1,
          }}>Apply</button>
      </div>
    </div>
  )
}

// Tiny long-press hook — kept inline so chip components can share it
// without exporting a new public module. Returns a set of handlers to
// spread on a button; on touch + mouse alike, holds of >= ms fire
// `onLong`. Short clicks fire `onTap` (so the chip still applies its
// preset on a normal tap). Cancelling via leave/touchend before `ms`
// elapses fires the tap.
function useLongPress(onTap, onLong, ms = 600) {
  const timerRef = useRef(null)
  const firedRef = useRef(false)
  const start = (e) => {
    firedRef.current = false
    // Right-click / multi-touch — ignore to keep behaviour predictable.
    if (e && e.button === 2) return
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      onLong?.()
    }, ms)
  }
  const cancel = () => {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
  const release = () => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    if (!firedRef.current) onTap?.()
  }
  return {
    onMouseDown:  start,
    onMouseUp:    release,
    onMouseLeave: cancel,
    onTouchStart: start,
    onTouchEnd:   release,
    onTouchCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  }
}

// Global wind: a constant directional drift applied to every particle.
// Azimuth + pitch sliders are gated behind the toggle so the section
// stays calm by default. Off → renderer takes the zero-vector fast path.
// One-tap weather chips (Calm / Breeze / Gale / Storm) configure all
// three sliders at once and highlight the matching chip when the live
// state lines up with a preset. Long-press a chip to OVERWRITE it
// with the current sliders (R11.04) — tap the ↺ badge to reset.
function WindRow() {
  const enabled   = useStore(s => s.windEnabled)
  const intensity = useStore(s => s.windIntensity)
  const azimuth   = useStore(s => s.windAzimuth)
  const pitch     = useStore(s => s.windPitch)
  const setEn  = useStore(s => s.setWindEnabled)
  const setI   = useStore(s => s.setWindIntensity)
  const setAz  = useStore(s => s.setWindAzimuth)
  const setPi  = useStore(s => s.setWindPitch)

  // Live overrides — kept as React state so chip rerenders cleanly.
  // resolve once on mount so the WIND_PRESETS array reflects any
  // overrides saved in a previous session.
  const [overrides, setOverrides] = useState(() => loadWindOverrides())
  useEffect(() => { resolveWindPresets(overrides) }, [overrides])

  const applyPreset = (p) => {
    // Auto-enable when picking anything other than Calm so the user
    // sees the effect immediately; Calm stays a no-op (preserves the
    // existing toggle state).
    if (p.id !== 'calm' && !enabled) setEn(true)
    setI(p.intensity)
    setAz(p.azimuth)
    setPi(p.pitch)
  }
  // Long-press save: write the live sliders into this chip's slot,
  // then re-resolve WIND_PRESETS so the highlight + tooltip refresh.
  const saveOverride = (slotId) => {
    const next = setWindOverride(overrides, slotId, { intensity, azimuth, pitch })
    setOverrides(next)
    saveWindOverrides(next)
    showToast(`Saved ${WIND_PRESETS.find(p => p.id === slotId)?.label || slotId} → ${intensity.toFixed(1)} · ${azimuth | 0}°`)
  }
  // Reset surfaces as a small ↺ badge on overridden chips so the
  // user always has a one-tap undo without right-click ceremony.
  const resetSlot = (slotId) => {
    const next = clearWindOverride(overrides, slotId)
    setOverrides(next)
    saveWindOverrides(next)
    const base = WIND_PRESETS.find(p => p.id === slotId)
    showToast(`Reset ${base?.label || slotId} to default`)
  }

  return (
    <>
      <ToggleRow label="Wind" value={enabled} onChange={setEn} />
      {/* Preset chips: surfaced even when the toggle is off so picking
          one snaps the sliders AND turns the toggle on in a single tap.
          Long-press to OVERWRITE the slot with current sliders. */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 6, marginTop: enabled ? 8 : 4, marginBottom: enabled ? 0 : 4,
      }}>
        {WIND_PRESETS.map(p => {
          const active = enabled && matchesWindPreset({ intensity, azimuth, pitch }, p)
          const isCustom = isWindPresetCustom(p.id, overrides)
          return (
            <WindChip
              key={p.id}
              preset={p}
              active={active}
              isCustom={isCustom}
              onTap={() => applyPreset(p)}
              onLong={() => saveOverride(p.id)}
              onReset={() => resetSlot(p.id)}
            />
          )
        })}
      </div>
      {enabled && (
        <>
          <Slider label="Intensity" value={intensity} min={0} max={5} step={0.1}
            onChange={setI} display={v => v.toFixed(1)} />
          <Slider label="Azimuth" value={azimuth} min={0} max={360} step={1}
            onChange={setAz} display={v => `${v | 0}° (${compassFor(v)})`} />
          <Slider label="Pitch" value={pitch} min={-90} max={90} step={1}
            onChange={setPi} display={v => `${v | 0}°`} />
          <div style={{
            marginTop: 4, fontSize: 11, color: '#7a7a90',
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(168,85,247,0.05)',
            border: '1px solid rgba(168,85,247,0.12)',
          }}>
            Tap a chip to apply · long-press to save current sliders into that slot.
            Custom slots show a violet dot; tap the ↺ to reset.
          </div>
          {/* Wind override IO (R12.17) — export the custom chips as a
              portable JSON file, or merge/replace from one. Mirrors
              the customThemes JSON pack workflow so users have a
              consistent "export your tweaks" pattern. */}
          <WindOverrideIO overrides={overrides} setOverrides={setOverrides} />
        </>
      )}
    </>
  )
}

// Tiny IO leaf below the Wind sliders. Export = always available
// (downloads empty envelope if no overrides yet). Import = stages
// a preview panel below the buttons (R14.15) so the user sees the
// diff BEFORE committing — matches the keymap import preview in
// SettingsModal (R13.04). Stays modeless — file picker is the only
// ceremony. Uses downloadWindOverridesFile + parseWindOverridesImport
// + summarizeWindOverridesImpact from the dedicated IO module so the
// same shape works elsewhere later.
function WindOverrideIO({ overrides, setOverrides }) {
  const overrideCount = overrides ? Object.keys(overrides).length : 0
  // R14.15 — staged import. Holds the parsed items + filename + the
  // currently-selected mode so the preview re-renders live when the
  // user flips between merge / replace. Cleared on commit or cancel.
  const [pending, setPending] = useState(null)
  const [pendingMode, setPendingMode] = useState('merge')
  const onExport = () => {
    const filename = downloadWindOverridesFile(overrides)
    if (filename) {
      showToast(`Exported ${overrideCount} wind override${overrideCount === 1 ? '' : 's'} → ${filename}`)
    } else {
      showToast('Wind export failed')
    }
  }
  const onImport = (mode) => {
    if (typeof document === 'undefined') return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        const parsed = parseWindOverridesImport(raw)
        if (!parsed.ok) {
          showToast(`Import failed: ${parsed.error}`)
          return
        }
        // R14.15 — stage instead of commit. The user sees the diff
        // in the preview panel and confirms (or cancels).
        setPending({ items: parsed.items, filename: file.name })
        setPendingMode(mode)
      }
      reader.readAsText(file)
    }
    input.click()
  }
  // Commit the staged import — same merge math as before, just
  // gated behind the preview's Apply button.
  const commit = () => {
    if (!pending) return
    const merge = mergeWindOverridesImport(overrides, pending.items, pendingMode)
    setOverrides(merge.items)
    try {
      // Persist immediately so the chips visually re-render on
      // the same tick (resolveWindPresets reads from state).
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('particle-wind-overrides-v1', JSON.stringify({ v: 1, items: merge.items }))
      }
    } catch { /* quota / private mode */ }
    const verb = pendingMode === 'replace' ? 'Replaced' : 'Merged'
    showToast(`${verb} ${merge.added} wind override${merge.added === 1 ? '' : 's'}${merge.skipped ? ` (${merge.skipped} skipped)` : ''}`)
    setPending(null)
  }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 6 }}>
        <button onClick={onExport}
          title={overrideCount === 0
            ? 'No overrides yet — export will be an empty envelope'
            : `Download ${overrideCount} wind override${overrideCount === 1 ? '' : 's'} as JSON`}
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: overrideCount === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(99,102,241,0.10)',
            color: overrideCount === 0 ? '#7a7a90' : '#c7d2fe',
            border: overrideCount === 0
              ? '1px solid rgba(255,255,255,0.05)'
              : '1px solid rgba(99,102,241,0.25)',
          }}>
          Export
        </button>
        <button onClick={() => onImport('merge')}
          title="Merge: keep existing overrides, add only new slots from the file"
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(168,85,247,0.10)', color: '#e9d5ff',
            border: '1px solid rgba(168,85,247,0.25)',
          }}>
          Import (merge)
        </button>
        <button onClick={() => onImport('replace')}
          title="Replace: drop all existing overrides, use only the imported ones"
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(236,72,153,0.10)', color: '#fbcfe8',
            border: '1px solid rgba(236,72,153,0.25)',
          }}>
          Import (replace)
        </button>
      </div>
      {/* R14.15 — live diff preview. Appears the moment a valid wind
          override file lands; toggling merge/replace recomputes the
          diff in-place. Apply commits + dismisses; Cancel dismisses
          without touching the live overrides. */}
      {pending && (
        <WindOverridesImportPreview
          pending={pending}
          mode={pendingMode}
          onModeChange={setPendingMode}
          existing={overrides}
          onCancel={() => setPending(null)}
          onCommit={commit}
        />
      )}
    </>
  )
}

// R14.15 — WindOverridesImportPreview: surfaces what an imported wind
// overrides file will actually CHANGE before the user commits. Lists
// every slot in the import with its three knob values vs. the live
// values, flags ids that will overwrite an existing override (only
// matters in replace mode for the wind IO because merge MODE SKIPS
// existing slots — we mirror that in the impact line). Parallels
// the keymap import preview in SettingsModal.
function WindOverridesImportPreview({ pending, mode, onModeChange, existing, onCancel, onCommit }) {
  const impact = summarizeWindOverridesImpact(existing, pending.items, mode)
  const labelById = Object.fromEntries(WIND_PRESETS_DEFAULT.map(p => [p.id, p.label]))
  // Diff rows — one per slot the import touches. For each, decide
  // whether the import will WRITE (new slot) / SKIP (merge + existing)
  // / OVERWRITE (replace + existing).
  const rows = Object.keys(pending.items).map(id => {
    const incoming = pending.items[id]
    const live = existing && existing[id]
    const isExisting = !!live
    const wouldWrite = mode === 'replace' ? true : !isExisting
    const action = mode === 'replace'
      ? (isExisting ? 'overwrite' : 'add')
      : (isExisting ? 'skip' : 'add')
    return {
      id,
      label: labelById[id] || id,
      incoming, live,
      isExisting, wouldWrite, action,
    }
  }).sort((a, b) => {
    // Stable order: by WIND_PRESETS_DEFAULT order so the diff list
    // reads the same as the chip grid above (calm → breeze → gale → storm).
    const ai = WIND_PRESETS_DEFAULT.findIndex(p => p.id === a.id)
    const bi = WIND_PRESETS_DEFAULT.findIndex(p => p.id === b.id)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  const willWrite = rows.filter(r => r.wouldWrite).length
  const willSkip = mode === 'merge' ? rows.filter(r => !r.wouldWrite).length : 0
  return (
    <div style={{
      marginTop: 8, padding: 10, borderRadius: 8,
      background: 'rgba(99,102,241,0.06)',
      border: '1px solid rgba(99,102,241,0.25)',
      animation: 'wind-import-rise 0.18s cubic-bezier(0.2,0.8,0.2,1)',
    }}>
      <style>{`@keyframes wind-import-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 600, letterSpacing: '0.02em' }}>
          Preview: {impact.totalImport} wind override{impact.totalImport === 1 ? '' : 's'} in file
        </span>
        <span style={{
          fontSize: 10, color: '#7a7a90', fontFamily: 'Geist Mono, monospace',
          maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={pending.filename}>
          {pending.filename}
        </span>
      </div>
      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <button onClick={() => onModeChange('merge')}
          title="Keep existing overrides, only apply slots the file mentions that aren't already overridden."
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: mode === 'merge' ? 'rgba(168,85,247,0.22)' : 'rgba(255,255,255,0.04)',
            color: mode === 'merge' ? '#e9d5ff' : '#8a8aa0',
            border: mode === 'merge' ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.07)',
          }}>Merge</button>
        <button onClick={() => onModeChange('replace')}
          title="Drop all existing overrides, then write the slots from the file."
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: mode === 'replace' ? 'rgba(236,72,153,0.20)' : 'rgba(255,255,255,0.04)',
            color: mode === 'replace' ? '#fbcfe8' : '#8a8aa0',
            border: mode === 'replace' ? '1px solid rgba(236,72,153,0.42)' : '1px solid rgba(255,255,255,0.07)',
          }}>Replace</button>
      </div>
      {/* Diff list — one row per slot the import touches. */}
      {rows.length === 0 ? (
        <p style={{
          fontSize: 10.5, color: '#7a7a90', fontStyle: 'italic',
          margin: 0, marginBottom: 8, lineHeight: 1.5,
          padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.08)',
        }}>
          No valid wind slots in this file.
        </p>
      ) : (
        <div style={{
          maxHeight: 144, overflowY: 'auto',
          marginBottom: 8, padding: 4, borderRadius: 6,
          background: 'rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {rows.map(r => {
            const isSkip = r.action === 'skip'
            const isOverwrite = r.action === 'overwrite'
            return (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 10.5, padding: '3px 6px',
                fontFamily: 'inherit', color: isSkip ? '#7a7a90' : '#d8d8e0',
                opacity: isSkip ? 0.7 : 1,
              }}>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '38%', fontWeight: 600,
                }} title={r.label}>{r.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)', color: '#9a9ab0',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }} title={r.live ? `Live override: ${r.live.intensity.toFixed(1)} / ${r.live.azimuth | 0}° / ${r.live.pitch | 0}°` : 'No live override — chip uses shipped default'}>
                    {r.live ? `${r.live.intensity.toFixed(1)}/${r.live.azimuth | 0}°` : '—'}
                  </span>
                  <span style={{ color: '#7a7a90', fontSize: 10 }}>{'\u2192'}</span>
                  <span style={{
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                    background: isSkip
                      ? 'rgba(255,255,255,0.03)'
                      : isOverwrite
                        ? 'rgba(245,158,11,0.10)'
                        : 'rgba(34,197,94,0.10)',
                    color: isSkip ? '#7a7a90' : isOverwrite ? '#fde68a' : '#86efac',
                    border: isSkip
                      ? '1px solid rgba(255,255,255,0.05)'
                      : isOverwrite
                        ? '1px solid rgba(245,158,11,0.30)'
                        : '1px solid rgba(34,197,94,0.30)',
                  }} title={`Incoming: ${r.incoming.intensity.toFixed(1)} / ${r.incoming.azimuth | 0}° / ${r.incoming.pitch | 0}°`}>
                    {`${r.incoming.intensity.toFixed(1)}/${r.incoming.azimuth | 0}°`}
                    {isSkip && (
                      <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700 }}>SKIP</span>
                    )}
                    {isOverwrite && (
                      <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700 }}>OVR</span>
                    )}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {/* Impact line */}
      <p style={{
        fontSize: 10.5, color: mode === 'replace' ? '#fbcfe8' : '#a5b4fc',
        margin: 0, marginBottom: 8, lineHeight: 1.5,
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
      }}>
        {mode === 'replace'
          ? `Replace: write ${willWrite} slot${willWrite === 1 ? '' : 's'}${impact.willOverwrite ? ` (incl. ${impact.willOverwrite} overwrite)` : ''}, drop other live overrides.`
          : `Merge: add ${willWrite} new${willSkip ? ` · skip ${willSkip} existing` : ''}.`}
      </p>
      {/* Apply / Cancel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button onClick={onCancel}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            color: '#c8c8d4',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>Cancel</button>
        <button onClick={onCommit}
          disabled={willWrite === 0 && mode === 'merge'}
          title={(willWrite === 0 && mode === 'merge') ? 'Nothing new to merge' : `Apply ${mode}`}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
            cursor: (willWrite === 0 && mode === 'merge') ? 'not-allowed' : 'pointer',
            background: (willWrite === 0 && mode === 'merge')
              ? 'rgba(255,255,255,0.04)'
              : mode === 'replace'
                ? 'linear-gradient(135deg, rgba(236,72,153,0.28), rgba(168,85,247,0.18))'
                : 'linear-gradient(135deg, rgba(99,102,241,0.28), rgba(168,85,247,0.18))',
            color: (willWrite === 0 && mode === 'merge') ? '#5a5a70' : '#ffffff',
            border: (willWrite === 0 && mode === 'merge')
              ? '1px solid rgba(255,255,255,0.07)'
              : mode === 'replace'
                ? '1px solid rgba(236,72,153,0.45)'
                : '1px solid rgba(99,102,241,0.45)',
            opacity: (willWrite === 0 && mode === 'merge') ? 0.6 : 1,
          }}>Apply {mode === 'replace' ? 'Replace' : 'Merge'}</button>
      </div>
    </div>
  )
}

// A single Wind preset chip — wraps the existing styling so the
// long-press handlers + custom-badge + reset button can live in one
// place. Kept as a leaf component so the useLongPress hook is
// instanced per-button (one timer + ref pair each).
function WindChip({ preset, active, isCustom, onTap, onLong, onReset }) {
  const handlers = useLongPress(onTap, onLong, 600)
  return (
    <div style={{ position: 'relative' }}>
      <button {...handlers}
        title={`${preset.hint}${isCustom ? ' · custom — long-press resaves, ↺ resets' : ' · long-press to save current sliders here'}`}
        style={{
          width: '100%',
          padding: '6px 0', borderRadius: 7,
          fontSize: 11, fontWeight: 550,
          cursor: 'pointer',
          transition: 'all 0.15s ease-out',
          background: active
            ? 'linear-gradient(135deg, rgba(168,85,247,0.24) 0%, rgba(99,102,241,0.18) 100%)'
            : 'rgba(255,255,255,0.03)',
          color: active ? '#e9d5ff' : '#9a9ab0',
          border: active
            ? '1px solid rgba(168,85,247,0.45)'
            : isCustom
              ? '1px solid rgba(168,85,247,0.30)'
              : '1px solid rgba(255,255,255,0.06)',
          boxShadow: active ? '0 0 12px rgba(168,85,247,0.25)' : 'none',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}>
        {preset.label}
      </button>
      {/* Custom-slot dot: small marker on the top-right corner so the
          user knows this chip has been overridden. Doubles as a reset
          target — click it to revert the slot to its shipped default. */}
      {isCustom && (
        <button
          onClick={(e) => { e.stopPropagation(); onReset?.() }}
          title={`Reset ${preset.label} to default`}
          style={{
            position: 'absolute', top: -3, right: -3,
            width: 12, height: 12, padding: 0,
            borderRadius: '50%',
            background: 'rgba(168,85,247,0.95)',
            border: '1px solid rgba(20,20,30,0.95)',
            color: '#fff', fontSize: 9, lineHeight: '10px',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>↺</button>
      )}
    </div>
  )
}

// CrossfadeOverrideIO — Export / Import the chip overrides map as
// a portable JSON envelope (R13.14). Directly parallels the
// WindOverrideIO leaf above: same 3-button row, same toast wording,
// same merge/replace modes. Caller passes the live overrides map
// + setter so we can both display a count and update on import.
function CrossfadeOverrideIO({ overrides, setOverrides }) {
  const overrideCount = overrides ? Object.keys(overrides).length : 0
  const onExport = () => {
    const filename = downloadCrossfadeOverridesFile(overrides)
    if (filename) {
      showToast(`Exported ${overrideCount} crossfade override${overrideCount === 1 ? '' : 's'} → ${filename}`)
    } else {
      showToast('Crossfade export failed')
    }
  }
  const onImport = (mode) => {
    if (typeof document === 'undefined') return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        const parsed = parseCrossfadeOverridesImport(raw)
        if (!parsed.ok) {
          showToast(`Import failed: ${parsed.error}`)
          return
        }
        const merge = mergeCrossfadeOverridesImport(overrides, parsed.items, mode)
        setOverrides(merge.items)
        try {
          // Persist immediately so the chips re-render on the same tick
          // (resolveCrossfadeChips reads from this state via useEffect).
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('particle-crossfade-overrides-v1', JSON.stringify({ v: 1, items: merge.items }))
          }
        } catch { /* quota / private mode */ }
        const verb = mode === 'replace' ? 'Replaced' : 'Merged'
        showToast(`${verb} ${merge.added} crossfade override${merge.added === 1 ? '' : 's'}${merge.skipped ? ` (${merge.skipped} skipped)` : ''}`)
      }
      reader.readAsText(file)
    }
    input.click()
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginTop: 4 }}>
      <button onClick={onExport}
        title={overrideCount === 0
          ? 'No overrides yet — export will be an empty envelope'
          : `Download ${overrideCount} crossfade override${overrideCount === 1 ? '' : 's'} as JSON`}
        style={{
          padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
          cursor: 'pointer',
          background: overrideCount === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(236,72,153,0.10)',
          color: overrideCount === 0 ? '#7a7a90' : '#fbcfe8',
          border: overrideCount === 0
            ? '1px solid rgba(255,255,255,0.05)'
            : '1px solid rgba(236,72,153,0.25)',
        }}>
        Export
      </button>
      <button onClick={() => onImport('merge')}
        title="Merge: keep existing overrides, add only new slots from the file"
        style={{
          padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
          cursor: 'pointer',
          background: 'rgba(168,85,247,0.10)', color: '#e9d5ff',
          border: '1px solid rgba(168,85,247,0.25)',
        }}>
        Import (merge)
      </button>
      <button onClick={() => onImport('replace')}
        title="Replace: drop all existing overrides, use only the imported ones"
        style={{
          padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
          cursor: 'pointer',
          background: 'rgba(99,102,241,0.10)', color: '#c7d2fe',
          border: '1px solid rgba(99,102,241,0.25)',
        }}>
        Import (replace)
      </button>
    </div>
  )
}

// CrossfadeChip — same long-press pattern as WindChip, but with the
// pink-violet gradient that matches the existing Crossfade panel and
// a compact two-line layout (label on top, seconds in monospace
// underneath). Disabled while a blend is in-flight to match the
// rest of the Crossfade controls.
function CrossfadeChip({ chip, active, isCustom, disabled, onTap, onLong, onReset }) {
  // Skip the long-press handlers entirely while disabled so a held
  // tap during an active blend doesn't sneak an override through.
  const handlers = useLongPress(disabled ? null : onTap, disabled ? null : onLong, 600)
  return (
    <div style={{ position: 'relative' }}>
      <button {...handlers}
        disabled={disabled}
        title={`${chip.label} — ${chip.seconds}s blend${isCustom ? ' · custom — long-press resaves, ↺ resets' : ' · long-press to bind to current slider value'}`}
        style={{
          width: '100%',
          padding: '5px 0', borderRadius: 6, fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.02em',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease-out',
          background: active
            ? 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(236,72,153,0.18) 100%)'
            : 'rgba(255,255,255,0.03)',
          color: disabled ? '#5a5a6a' : active ? '#f3e8ff' : '#9a9ab0',
          border: active
            ? '1px solid rgba(168,85,247,0.45)'
            : isCustom
              ? '1px solid rgba(236,72,153,0.30)'
              : '1px solid rgba(255,255,255,0.05)',
          opacity: disabled ? 0.55 : 1,
          userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >{chip.label}<span style={{ display: 'block', fontSize: 9, marginTop: 1, opacity: 0.65, fontFamily: 'Geist Mono, monospace' }}>{chip.seconds}s</span></button>
      {isCustom && !disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onReset?.() }}
          title={`Reset ${chip.label} to default`}
          style={{
            position: 'absolute', top: -3, right: -3,
            width: 12, height: 12, padding: 0,
            borderRadius: '50%',
            background: 'rgba(236,72,153,0.95)',
            border: '1px solid rgba(20,20,30,0.95)',
            color: '#fff', fontSize: 9, lineHeight: '10px',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}>↺</button>
      )}
    </div>
  )
}

// Trig-noise deformer: amplitude / frequency / speed sliders for the
// global wiggle. Off by default; sliders only appear when enabled.
function NoiseRow() {
  const enabled   = useStore(s => s.noiseEnabled)
  const amplitude = useStore(s => s.noiseAmplitude)
  const frequency = useStore(s => s.noiseFrequency)
  const speed     = useStore(s => s.noiseSpeed)
  const setEn  = useStore(s => s.setNoiseEnabled)
  const setA   = useStore(s => s.setNoiseAmplitude)
  const setF   = useStore(s => s.setNoiseFrequency)
  const setS   = useStore(s => s.setNoiseSpeed)
  return (
    <>
      <ToggleRow label="Wiggle" value={enabled} onChange={setEn} />
      {enabled && (
        <>
          <Slider label="Amplitude" value={amplitude} min={0} max={2} step={0.05}
            onChange={setA} display={v => v.toFixed(2)} />
          <Slider label="Frequency" value={frequency} min={0.1} max={8} step={0.1}
            onChange={setF} display={v => v.toFixed(1)} />
          <Slider label="Speed" value={speed} min={0} max={4} step={0.1}
            onChange={setS} display={v => v.toFixed(1)} />
          <div style={{
            marginTop: 4, fontSize: 11, color: '#7a7a90',
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(168,85,247,0.05)',
            border: '1px solid rgba(168,85,247,0.12)',
          }}>
            Adds a per-particle trig wiggle on top of any preset.
            Pair with a tight preset (e.g. Sphere) for shimmery dust.
          </div>
        </>
      )}
    </>
  )
}

// Kaleidoscope: N-fold radial symmetry mode. Sliders are gated so the
// segment count is only shown when the mode is on, keeping the sidebar
// quiet in the default configuration.
function KaleidoscopeRow() {
  const enabled  = useStore(s => s.kaleidoscopeEnabled)
  const segments = useStore(s => s.kaleidoscopeSegments)
  const setEn    = useStore(s => s.setKaleidoscopeEnabled)
  const setSeg   = useStore(s => s.setKaleidoscopeSegments)
  return (
    <>
      <ToggleRow label="Radial Symmetry" value={enabled} onChange={setEn} />
      {enabled && (
        <>
          <Slider label="Segments" value={segments} min={2} max={12} step={1}
            onChange={setSeg} display={v => `${v}-fold`} />
          <div style={{
            marginTop: 4, fontSize: 11, color: '#7a7a90',
            padding: '6px 8px', borderRadius: 6,
            background: 'rgba(168,85,247,0.05)',
            border: '1px solid rgba(168,85,247,0.12)',
          }}>
            Particles are partitioned into {segments} rotated slices.
            Effective unique particles: ~{Math.floor((useStore.getState().particleCount || 0) / Math.max(1, segments) / 1000)}K.
          </div>
        </>
      )}
    </>
  )
}

// Category filter chips that drive the Shape Presets list. Reads the
// active category from the store so the list and the chips stay in
// lock-step across re-renders.
function CategoryChips() {
  const active = useStore(s => s.presetCategory || 'all')
  const setActive = useStore(s => s.setPresetCategory)
  const counts = countByCategory(presets)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
      {CATEGORIES.map(c => {
        const isActive = active === c.id
        const n = counts[c.id] || 0
        if (n === 0) return null
        return (
          <button key={c.id} onClick={() => setActive(c.id)}
            title={`${c.label} (${n})`}
            style={{
              padding: '4px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'all 0.15s ease-out',
              letterSpacing: '0.01em',
              background: isActive
                ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.18))'
                : 'rgba(255,255,255,0.035)',
              color: isActive ? '#f3e8ff' : '#8a8aa0',
              border: isActive ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.06)',
              boxShadow: isActive ? '0 0 10px rgba(168,85,247,0.25)' : 'none',
            }}>
            {c.label}
            <span style={{
              marginLeft: 5, fontSize: 9, opacity: 0.7,
              fontFamily: 'Geist Mono, monospace',
            }}>{n}</span>
          </button>
        )
      })}
    </div>
  )
}

// Filtered preset list. Pulled out so the category subscription causes
// a re-render of just the list, not the whole sidebar.
function PresetList({ presetSearch, showFavoritesOnly, favoritedPresets, currentPreset, loadPreset, toggleFavorite }) {
  const cat = useStore(s => s.presetCategory || 'all')
  const filtered = presets.filter(p => {
    const matchSearch = !presetSearch || p.name.toLowerCase().includes(presetSearch.toLowerCase())
    const matchFav = !showFavoritesOnly || favoritedPresets.includes(p.id)
    const matchCat = cat === 'all' || categoryOf(p.id) === cat
    return matchSearch && matchFav && matchCat
  })
  if (filtered.length === 0) {
    return (
      <div style={{
        padding: '14px 12px', textAlign: 'center', fontSize: 12,
        color: '#6a6a80', background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 8,
      }}>
        No presets match this filter.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {filtered.map(p => (
        <button key={p.id} onClick={() => loadPreset(p.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 8,
            textAlign: 'left',
            fontSize: 13,
            cursor: 'pointer',
            transition: 'all 0.15s ease-out',
            background: currentPreset === p.id ? 'rgba(99,102,241,0.08)' : 'transparent',
            color: currentPreset === p.id ? '#818cf8' : '#7a7a90',
            border: currentPreset === p.id ? '1px solid rgba(99,102,241,0.2)' : '1px solid transparent',
          }}
          onMouseEnter={e => {
            if (currentPreset !== p.id) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
            if (currentPreset !== p.id) e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ fontSize: 16 }}>{p.emoji}</span>
          <span style={{ flex: 1 }}>{p.name}</span>
          <span onClick={e => { e.stopPropagation(); toggleFavorite(p.id); }}
            style={{ fontSize: 14, cursor: 'pointer', color: favoritedPresets.includes(p.id) ? '#f59e0b' : '#4a4a60',
              transition: 'color 0.15s ease-out' }}>
            {favoritedPresets.includes(p.id) ? '★' : '☆'}
          </span>
        </button>
      ))}
    </div>
  )
}

// Hue Cycle: continuous global hue drift layered on top of any theme.
// Includes a live color-bar preview so users can see the wheel
// position the cycle is currently at without staring at the canvas.
function HueCycleRow() {
  const enabled = useStore(s => s.hueCycleEnabled)
  const speed   = useStore(s => s.hueCycleSpeed)
  const setEn   = useStore(s => s.setHueCycleEnabled)
  const setSp   = useStore(s => s.setHueCycleSpeed)
  return (
    <>
      <ToggleRow label="Hue Cycle" value={enabled} onChange={setEn} />
      {enabled && (
        <>
          <Slider label="Speed" value={speed} min={0.5} max={30} step={0.5}
            onChange={setSp} display={v => `${v.toFixed(1)} cpm`} />
          <div style={{
            marginTop: 6, height: 14, borderRadius: 7,
            background: 'linear-gradient(90deg, #ef4444, #f59e0b, #facc15, #22c55e, #06b6d4, #6366f1, #a855f7, #ec4899, #ef4444)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), 0 0 12px rgba(168,85,247,0.18)',
            animation: `hue-cycle-bar ${(60 / Math.max(0.5, speed)).toFixed(2)}s linear infinite`,
            backgroundSize: '200% 100%',
          }} />
          <style>{`@keyframes hue-cycle-bar { from { background-position: 0% 0%; } to { background-position: 100% 0%; } }`}</style>
          <div style={{ marginTop: 4, fontSize: 11, color: '#7a7a90', textAlign: 'center' }}>
            One full rotation every {(60 / Math.max(0.5, speed)).toFixed(1)}s.
          </div>
        </>
      )}
    </>
  )
}

// Crossfade — pick a blend target preset, set a duration, and the
// renderer lerps each particle from the current preset's position +
// color into the target's. When the ramp completes, the target
// becomes the new current preset. Lets users build "show reel"
// transitions without abrupt scene swaps. Cost only kicks in while
// active; idle path is free.
function CrossfadeRow() {
  const blendActive   = useStore(s => s.blendActive)
  const blendTargetId = useStore(s => s.blendTargetId)
  const blendProgress = useStore(s => s.blendProgress)
  const blendSeconds  = useStore(s => s.blendSeconds)
  const setBlendSeconds = useStore(s => s.setBlendSeconds)
  const beginBlendTo  = useStore(s => s.beginBlendTo)
  const cancelBlend   = useStore(s => s.cancelBlend)
  const currentPreset = useStore(s => s.currentPreset)

  // Crossfade chip overrides (R11.05) — long-press a chip to bind
  // its seconds to the current slider value. resolveCrossfadeChips
  // mutates CROSSFADE_DURATION_CHIPS in place so matchCrossfadeChip
  // recognises the overridden seconds when the slider lands on it.
  const [chipOverrides, setChipOverrides] = useState(() => loadCrossfadeOverrides())
  useEffect(() => { resolveCrossfadeChips(chipOverrides) }, [chipOverrides])
  const saveChipOverride = (chipId) => {
    if (blendActive) return
    const next = setCrossfadeOverride(chipOverrides, chipId, blendSeconds)
    setChipOverrides(next)
    saveCrossfadeOverrides(next)
    showToast(`Saved ${CROSSFADE_DURATION_CHIPS.find(c => c.id === chipId)?.label || chipId} → ${blendSeconds.toFixed(1)}s`)
  }
  const resetChip = (chipId) => {
    const next = clearCrossfadeOverride(chipOverrides, chipId)
    setChipOverrides(next)
    saveCrossfadeOverrides(next)
    const base = CROSSFADE_DURATION_CHIPS.find(c => c.id === chipId)
    showToast(`Reset ${base?.label || chipId} to default`)
  }

  const [pickedId, setPickedId] = useState(() => {
    // Default the dropdown to a preset that isn't the current one.
    const first = presets.find(p => p.id !== currentPreset) || presets[0]
    return first ? first.id : ''
  })
  // Keep the dropdown's default in sync as the current preset changes,
  // but only when the user hasn't manually picked something else.
  useEffect(() => {
    if (pickedId === currentPreset) {
      const next = presets.find(p => p.id !== currentPreset) || presets[0]
      if (next) setPickedId(next.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPreset])
  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: '#7a7a90', marginBottom: 4, fontWeight: 500 }}>Target preset</div>
        <select value={pickedId} onChange={e => setPickedId(e.target.value)}
          disabled={blendActive}
          style={{
            width: '100%', padding: '7px 8px', borderRadius: 7,
            background: 'rgba(255,255,255,0.03)', color: '#e9e9f0',
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
            opacity: blendActive ? 0.5 : 1,
          }}>
          {presets.map(p => (
            <option key={p.id} value={p.id} disabled={p.id === currentPreset}>
              {p.emoji ? `${p.emoji} ` : ''}{p.name}{p.id === currentPreset ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>
      <Slider label="Duration" value={blendSeconds} min={0.5} max={10} step={0.5}
        onChange={setBlendSeconds} display={v => `${v.toFixed(1)}s`} />
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${CROSSFADE_DURATION_CHIPS.length}, 1fr)`, gap: 6, marginTop: 4, marginBottom: 6 }}>
        {CROSSFADE_DURATION_CHIPS.map(chip => {
          const active = matchCrossfadeChip(blendSeconds)?.id === chip.id
          const isCustom = isCrossfadeChipCustom(chip.id, chipOverrides)
          return (
            <CrossfadeChip
              key={chip.id}
              chip={chip}
              active={active}
              isCustom={isCustom}
              disabled={blendActive}
              onTap={() => setBlendSeconds(chip.seconds)}
              onLong={() => saveChipOverride(chip.id)}
              onReset={() => resetChip(chip.id)}
            />
          )
        })}
      </div>
      {/* R13.14 — Export / Import the chip override map as JSON.
          Directly mirrors the Wind IO row above it so the UX pattern
          stays predictable: same 3-button layout, same merge/replace
          modes, same toast feedback. Stays modeless — file picker
          is the only ceremony. */}
      <CrossfadeOverrideIO overrides={chipOverrides} setOverrides={setChipOverrides} />
      <div style={{ display: 'grid', gridTemplateColumns: blendActive ? '1fr 1fr' : '1fr 1fr', gap: 6, marginTop: 6 }}>
        <button
          onClick={() => {
            if (blendActive) return
            if (!pickedId || pickedId === currentPreset) return
            beginBlendTo(pickedId)
          }}
          disabled={blendActive || pickedId === currentPreset}
          style={{
            padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
            cursor: (blendActive || pickedId === currentPreset) ? 'not-allowed' : 'pointer',
            background: blendActive
              ? 'rgba(255,255,255,0.04)'
              : 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
            color: blendActive ? '#7a7a90' : '#ffffff',
            border: blendActive ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(168,85,247,0.5)',
            opacity: pickedId === currentPreset ? 0.5 : 1,
            boxShadow: blendActive ? 'none' : '0 4px 14px rgba(168,85,247,0.3), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
        >Start Blend</button>
        <button
          onClick={() => {
            // Random target that isn't the current preset.
            const pool = presets.filter(p => p.id !== currentPreset)
            if (pool.length === 0) return
            const pick = pool[Math.floor(Math.random() * pool.length)].id
            setPickedId(pick)
            beginBlendTo(pick)
          }}
          disabled={blendActive || presets.length < 2}
          style={{
            padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 550,
            cursor: blendActive ? 'not-allowed' : 'pointer',
            background: 'rgba(255,255,255,0.04)', color: '#c8c8d0',
            border: '1px solid rgba(255,255,255,0.06)',
            opacity: blendActive ? 0.4 : 1,
          }}
        >Blend To Random</button>
      </div>
      {blendActive && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#9a9ab0', marginBottom: 4 }}>
            <span>Blending → <span style={{ color: '#e9d5ff' }}>{presets.find(p => p.id === blendTargetId)?.name || blendTargetId}</span></span>
            <span style={{ fontFamily: 'Geist Mono, monospace', color: '#c084fc' }}>{Math.round(blendProgress * 100)}%</span>
          </div>
          <div style={{
            height: 6, borderRadius: 3, overflow: 'hidden',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div style={{
              height: '100%', width: `${blendProgress * 100}%`,
              background: 'linear-gradient(90deg, #6366f1, #a855f7, #ec4899)',
              transition: 'width 0.08s linear',
              boxShadow: '0 0 8px rgba(168,85,247,0.6)',
            }} />
          </div>
          <button onClick={cancelBlend}
            style={{
              width: '100%', marginTop: 8, padding: '6px 0', borderRadius: 7,
              fontSize: 11, fontWeight: 500, cursor: 'pointer',
              background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
            Cancel
          </button>
        </div>
      )}
    </>
  )
}

// Slideshow mode — rotate through the preset library on a timer.
// Order chips pick between sequence, shuffle, and favourites; the
// dwell slider sets seconds per preset. The actual rotation lives
// in <Slideshow /> (mounted in App.jsx). The "Respect category chip"
// toggle scopes sequence + shuffle to the active LeftSidebar category
// filter (favourites order always bypasses — explicit picks win).
function SlideshowRow() {
  const enabled  = useStore(s => s.slideshowEnabled)
  const dwell    = useStore(s => s.slideshowDwellSec)
  const order    = useStore(s => s.slideshowOrder)
  const setEn    = useStore(s => s.setSlideshowEnabled)
  const setDwell = useStore(s => s.setSlideshowDwellSec)
  const setOrder = useStore(s => s.setSlideshowOrder)
  const favCount = useStore(s => s.favoritedPresets.length)
  const respectCat = useStore(s => s.slideshowRespectCategory)
  const setRespectCat = useStore(s => s.setSlideshowRespectCategory)
  const activeCat = useStore(s => s.presetCategory || 'all')
  const activeCatLabel = (CATEGORIES.find(c => c.id === activeCat) || { label: 'All' }).label
  const ORDERS = [
    { id: 'sequence',   label: 'Order' },
    { id: 'shuffle',    label: 'Shuffle' },
    { id: 'favourites', label: `Favs${favCount ? ` (${favCount})` : ''}` },
  ]
  // The category-scope toggle is meaningful for sequence + shuffle.
  // It's still shown in 'favourites' (the label explains what happens)
  // but the driver bypasses it; documenting that inline keeps users
  // from being surprised when the rotation looks the same.
  const catScopeActuallyApplied = respectCat && activeCat !== 'all' && order !== 'favourites'
  return (
    <>
      <ToggleRow label="Auto-cycle" value={enabled} onChange={setEn} />
      {enabled && (
        <>
          <Slider label="Dwell" value={dwell} min={2} max={60} step={1}
            onChange={setDwell} display={v => `${v}s`} />
          <div style={{ marginTop: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#7a7a90', fontWeight: 500 }}>Order</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {ORDERS.map(o => {
              const active = order === o.id
              const disabled = o.id === 'favourites' && favCount === 0
              return (
                <button key={o.id} onClick={() => !disabled && setOrder(o.id)}
                  disabled={disabled}
                  title={disabled ? 'Star some presets first' : o.label}
                  style={{
                    padding: '7px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease-out',
                    background: active
                      ? 'linear-gradient(135deg, rgba(168,85,247,0.22) 0%, rgba(236,72,153,0.18) 100%)'
                      : 'rgba(255,255,255,0.03)',
                    color: disabled ? '#4a4a5a' : active ? '#f3e8ff' : '#8a8aa0',
                    border: active ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.05)',
                    opacity: disabled ? 0.5 : 1,
                  }}
                >{o.label}</button>
              )
            })}
          </div>
          {/* Respect category-chip filter */}
          <div style={{ marginTop: 10 }}>
            <ToggleRow label="Respect category chip" value={respectCat} onChange={setRespectCat} />
          </div>
          <p style={{ fontSize: 11, color: '#7a7a90', marginTop: 8 }}>
            New scene every {dwell}s.{' '}
            {catScopeActuallyApplied
              ? <>Scoped to <strong style={{ color: '#c4b5fd' }}>{activeCatLabel}</strong>.</>
              : respectCat && order === 'favourites'
                ? <>Favourites bypass category — toggle is honoured for Order &amp; Shuffle.</>
                : <>Manually loading a preset pauses the timer until the next dwell.</>}
          </p>
        </>
      )}
    </>
  )
}

// Background gradient picker — two-stop linear gradient painted under
// the canvas when enabled. Quick chips swap in canned nebulas; the
// two color inputs let users pick exact endpoints; angle slider lets
// them rotate the gradient. Designed to play nicely with all themes:
// when off, the canvas keeps its existing #0a0a0f clear color exactly.
const BG_GRADIENT_PRESETS = [
  { id: 'nebula',   a: '#1e1b4b', b: '#0a0a0f', label: 'Indigo Night' },
  { id: 'aurora',   a: '#064e3b', b: '#0c0a1e', label: 'Aurora Mist' },
  { id: 'ember',    a: '#7c2d12', b: '#0a0a0f', label: 'Ember Glow' },
  { id: 'twilight', a: '#1e293b', b: '#3b0764', label: 'Twilight' },
  { id: 'inkwash',  a: '#1a1a2e', b: '#0f0f17', label: 'Ink Wash' },
  { id: 'sunrise',  a: '#7c2d12', b: '#1e1b4b', label: 'Sunrise' },
]
function BgGradientRow() {
  const enabled = useStore(s => s.bgGradientEnabled)
  const a       = useStore(s => s.bgGradientA)
  const b       = useStore(s => s.bgGradientB)
  const angle   = useStore(s => s.bgGradientAngle)
  const audioReactiveBg = useStore(s => s.bgGradientAudioReactive)
  const audioStrength   = useStore(s => s.bgGradientAudioStrength)
  const audioCurve      = useStore(s => s.bgGradientAudioCurve)
  const audioOn         = useStore(s => s.audioReactive)
  const setEn    = useStore(s => s.setBgGradientEnabled)
  const setA     = useStore(s => s.setBgGradientA)
  const setB     = useStore(s => s.setBgGradientB)
  const setAngle = useStore(s => s.setBgGradientAngle)
  const setAudioReactiveBg = useStore(s => s.setBgGradientAudioReactive)
  const setAudioStrength   = useStore(s => s.setBgGradientAudioStrength)
  const setAudioCurve      = useStore(s => s.setBgGradientAudioCurve)
  return (
    <>
      <ToggleRow label="Custom Gradient" value={enabled} onChange={setEn} />
      {enabled && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: '#8a8aa0' }}>From</label>
            <input type="color" value={a} onChange={e => setA(e.target.value)}
              style={{ width: 36, height: 26, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
            <label style={{ fontSize: 11, color: '#8a8aa0', marginLeft: 8 }}>To</label>
            <input type="color" value={b} onChange={e => setB(e.target.value)}
              style={{ width: 36, height: 26, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, background: 'transparent', cursor: 'pointer' }} />
            <div style={{
              flex: 1, height: 24, marginLeft: 6, borderRadius: 6,
              background: `linear-gradient(${angle}deg, ${a} 0%, ${b} 100%)`,
              border: '1px solid rgba(255,255,255,0.06)',
            }} />
          </div>
          <Slider label="Angle" value={angle} min={0} max={360} step={15}
            onChange={setAngle} display={v => `${v}°`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 8 }}>
            {BG_GRADIENT_PRESETS.map(p => (
              <button key={p.id} onClick={() => { setA(p.a); setB(p.b) }} title={p.label}
                style={{
                  height: 28, borderRadius: 6, cursor: 'pointer',
                  background: `linear-gradient(${angle}deg, ${p.a} 0%, ${p.b} 100%)`,
                  border: (a === p.a && b === p.b)
                    ? '1px solid rgba(168,85,247,0.6)'
                    : '1px solid rgba(255,255,255,0.08)',
                  boxShadow: (a === p.a && b === p.b) ? '0 0 12px rgba(168,85,247,0.35)' : 'none',
                }} />
            ))}
          </div>
          <p style={{ fontSize: 11, color: '#7a7a90', marginTop: 8 }}>
            Particles render on top — pick darks so they don&apos;t get washed out.
          </p>
          {/* Audio-reactive hue rotation on the gradient layer. Only
              meaningful when the global Audio Reactivity is also on. */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <ToggleRow label="React to audio" value={audioReactiveBg} onChange={setAudioReactiveBg} />
            {audioReactiveBg && (
              <>
                <Slider
                  label="Hue swing"
                  value={audioStrength}
                  min={0} max={1} step={0.05}
                  onChange={setAudioStrength}
                  display={v => `${Math.round(v * 100)}%`}
                />
                {/* Curve preset chips — reshape the signal before the
                    linear map so users pick a FEEL ("Pulse", "Ramp",
                    "Hold") instead of fiddling with a curve editor.
                    Stays inline with the other audio controls so the
                    chip rail reads like a one-tap intent selector. */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4,
                  marginTop: 8,
                }}>
                  {REACTIVE_CURVES.map(c => {
                    const active = audioCurve === c.id
                    return (
                      <button key={c.id}
                        onClick={() => setAudioCurve(c.id)}
                        title={c.hint}
                        style={{
                          padding: '5px 0', borderRadius: 6, fontSize: 10.5, fontWeight: 550,
                          cursor: 'pointer', transition: 'all 0.12s ease-out',
                          background: active
                            ? 'linear-gradient(135deg, rgba(168,85,247,0.22), rgba(99,102,241,0.18))'
                            : 'rgba(255,255,255,0.04)',
                          color: active ? '#e9d5ff' : '#a8a8c0',
                          border: active
                            ? '1px solid rgba(168,85,247,0.5)'
                            : '1px solid rgba(255,255,255,0.06)',
                          boxShadow: active ? '0 0 10px rgba(168,85,247,0.22)' : 'none',
                        }}>
                        {c.label}
                      </button>
                    )
                  })}
                </div>
                {!audioOn && (
                  <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 4, opacity: 0.9 }}>
                    Turn on Audio Reactivity (Audio panel) to hear the gradient breathe.
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

// Click-to-drop force-field center. Toggles place-field mode (a single
// pointer-up on the canvas sets the field's origin and turns the mode
// back off). Also shows the current center coordinates and a one-click
// reset to origin.
function PlaceFieldRow() {
  const placeFieldMode = useStore(s => s.placeFieldMode)
  const setPlaceFieldMode = useStore(s => s.setPlaceFieldMode)
  const center = useStore(s => s.forceFieldCenter)
  const setCenter = useStore(s => s.setForceFieldCenter)
  const isAtOrigin = Math.abs(center[0]) < 1e-6 && Math.abs(center[1]) < 1e-6 && Math.abs(center[2]) < 1e-6
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button onClick={() => setPlaceFieldMode(!placeFieldMode)}
        title={placeFieldMode ? 'Click on the canvas to drop · click again to cancel' : 'Drop the field anywhere on the canvas'}
        style={{
          padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 550,
          cursor: 'pointer', transition: 'all 0.15s ease-out',
          background: placeFieldMode
            ? 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(99,102,241,0.18))'
            : 'rgba(255,255,255,0.04)',
          color: placeFieldMode ? '#bbf7d0' : '#c8c8d0',
          border: placeFieldMode
            ? '1px solid rgba(34,197,94,0.4)'
            : '1px solid rgba(255,255,255,0.06)',
          boxShadow: placeFieldMode ? '0 0 16px rgba(34,197,94,0.3)' : 'none',
        }}
      >
        {placeFieldMode ? 'Click canvas to drop field' : 'Place Field on Canvas'}
      </button>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 10px', borderRadius: 7,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.05)',
        fontSize: 10.5, color: '#9a9ab0',
        fontFamily: 'Geist Mono, monospace',
      }}>
        <span>center</span>
        <span style={{ color: isAtOrigin ? '#5a5a70' : '#c084fc' }}>
          [{center.map(n => n.toFixed(1)).join(', ')}]
        </span>
      </div>
      {!isAtOrigin && (
        <button onClick={() => setCenter([0, 0, 0])}
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 500,
            cursor: 'pointer',
            background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.2)',
          }}>
          Reset to origin
        </button>
      )}
    </div>
  )
}

// Trigger button for the MIDI Controller mapping panel. Lives in the
// Audio Reactivity section because both are "external signal → live
// param" workflows. Fires a window event the App-level state listens
// for; keeps LeftSidebar from needing a prop-drilled setter.
function MidiButton() {
  const supported = typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess
  return (
    <div>
      <button
        onClick={() => window.dispatchEvent(new Event('particle:open-midi'))}
        title={supported ? 'Open MIDI Controller mapping' : 'Web MIDI is not supported in this browser'}
        disabled={!supported}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: 8,
          fontSize: 12, fontWeight: 550, cursor: supported ? 'pointer' : 'not-allowed',
          background: supported
            ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: supported ? '#c7d2fe' : '#5a5a70',
          border: supported ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.05)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>{'MIDI Controller\u2026'}</span>
        <span style={{ fontSize: 10, color: supported ? '#a5b4fc' : '#5a5a70' }}>
          {supported ? 'CC \u2192 sliders' : 'unsupported'}
        </span>
      </button>
      <p style={{ fontSize: 10, color: '#6a6a80', marginTop: 6, lineHeight: 1.5 }}>
        Map hardware knobs/faders to live sliders.
        {!supported && ' Try Chrome or Edge.'}
      </p>
    </div>
  )
}

// Named Attractors — first-class force-field objects that coexist
// with the legacy single field. Each row exposes type chip strip,
// strength + radius sliders, enabled toggle, place-on-canvas, and
// a remove button. Add appends a new attractor with defaults; the
// list caps at MAX_ATTRACTORS.
function NamedAttractorsBlock() {
  const list = useStore(s => s.namedAttractors)
  const add  = useStore(s => s.addNamedAttractor)
  const remove = useStore(s => s.removeNamedAttractor)
  const update = useStore(s => s.updateNamedAttractor)
  const toggle = useStore(s => s.toggleNamedAttractor)
  const placingId = useStore(s => s.placingAttractorId)
  const setPlacing = useStore(s => s.setPlacingAttractorId)
  const atCap = list.length >= MAX_ATTRACTORS

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button
        onClick={() => { if (!atCap) add({ type: 'attractor' }) }}
        disabled={atCap}
        title={atCap ? `Maximum ${MAX_ATTRACTORS} reached — remove one first` : 'Add a new named force field'}
        style={{
          padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 550,
          cursor: atCap ? 'not-allowed' : 'pointer',
          background: atCap ? 'rgba(255,255,255,0.03)' : 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.14))',
          color: atCap ? '#5a5a70' : '#c7d2fe',
          border: atCap ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(99,102,241,0.35)',
        }}>
        {atCap ? `Maximum ${MAX_ATTRACTORS} reached` : `+ Add attractor (${list.length}/${MAX_ATTRACTORS})`}
      </button>

      {list.length === 0 && (
        <p style={{ fontSize: 11, color: '#7a7a90', lineHeight: 1.5, margin: 0 }}>
          Add named force fields that layer on top of the single legacy field.
          Multiple types coexist — try a Vortex + a Repulsor for a dramatic ring.
        </p>
      )}

      {list.map((a, idx) => (
        <NamedAttractorRow
          key={a.id}
          index={idx}
          attractor={a}
          isPlacing={placingId === a.id}
          onRename={(name) => update(a.id, { name })}
          onTypeChange={(type) => update(a.id, { type })}
          onStrengthChange={(strength) => update(a.id, { strength })}
          onRadiusChange={(radius) => update(a.id, { radius })}
          onToggle={() => toggle(a.id)}
          onRemove={() => remove(a.id)}
          onPlace={() => setPlacing(placingId === a.id ? null : a.id)}
        />
      ))}
    </div>
  )
}

function NamedAttractorRow({
  index, attractor, isPlacing,
  onRename, onTypeChange, onStrengthChange, onRadiusChange,
  onToggle, onRemove, onPlace,
}) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(attractor.name)
  // Sync draft on external rename.
  useEffect(() => { setDraftName(attractor.name) }, [attractor.name])

  const TYPE_LABELS = {
    attractor: 'Attract',
    repulsor:  'Repulse',
    vortex:    'Vortex',
    turbulence:'Turb.',
  }

  // R14.05 — type-specific accent so the whole row carries the same
  // colour cue as the active type chip. Looks up the live `type` so
  // tapping a chip flips the row's border + index badge instantly.
  const typeStyle = attractorTypeStyle(attractor.type)

  return (
    <div style={{
      borderRadius: 10,
      background: attractor.enabled ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.015)',
      border: isPlacing
        ? '1px solid rgba(34,197,94,0.45)'
        : (attractor.enabled
            ? `1px solid ${typeStyle.borderFaint}`
            : '1px solid rgba(255,255,255,0.05)'),
      boxShadow: isPlacing ? '0 0 14px rgba(34,197,94,0.25)' : 'none',
      padding: '10px 11px',
      opacity: attractor.enabled ? 1 : 0.55,
      transition: 'all 0.2s ease-out',
    }}>
      {/* Header: name + enabled toggle + remove */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          color: attractor.enabled ? typeStyle.fg : '#6a6a80',
          textTransform: 'uppercase',
          background: attractor.enabled ? typeStyle.bgSoft : 'rgba(255,255,255,0.04)',
          padding: '1px 5px', borderRadius: 4,
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          border: attractor.enabled ? `1px solid ${typeStyle.borderFaint}` : '1px solid transparent',
        }} title={`Type: ${TYPE_LABELS[attractor.type] || attractor.type} (${typeStyle.label})`}>#{index + 1}</span>
        {editing ? (
          <input
            type="text"
            value={draftName}
            autoFocus
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => { onRename(draftName); setEditing(false) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { onRename(draftName); setEditing(false) } else if (e.key === 'Escape') { setDraftName(attractor.name); setEditing(false) } }}
            style={{
              flex: 1, minWidth: 0, padding: '3px 7px', borderRadius: 5,
              background: 'rgba(255,255,255,0.04)', color: '#eeeef0',
              border: '1px solid rgba(99,102,241,0.45)', fontSize: 12,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
            style={{
              flex: 1, minWidth: 0,
              fontSize: 12, fontWeight: 600, color: '#eeeef0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              cursor: 'text',
            }}>
            {attractor.name}
          </span>
        )}
        <button
          onClick={onToggle}
          title={attractor.enabled ? 'Mute this attractor' : 'Unmute this attractor'}
          style={{
            padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            cursor: 'pointer',
            background: attractor.enabled ? 'rgba(34,197,94,0.14)' : 'rgba(255,255,255,0.04)',
            color: attractor.enabled ? '#86efac' : '#7a7a90',
            border: attractor.enabled ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.06)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
          {attractor.enabled ? 'On' : 'Off'}
        </button>
        <button
          onClick={onRemove}
          title="Remove this attractor"
          style={{
            padding: '3px 7px', borderRadius: 5, fontSize: 13, lineHeight: 1,
            background: 'rgba(239,68,68,0.08)', color: '#fca5a5',
            border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>
          {'\u00d7'}
        </button>
      </div>

      {/* Type chips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
        {ATTRACTOR_TYPES.map(t => {
          const active = attractor.type === t
          // R14.05 — each chip uses its own type's accent so the
          // colour the active type carries elsewhere in the row is
          // also visible while picking it.
          const chipStyle = attractorTypeStyle(t)
          return (
            <button key={t}
              onClick={() => onTypeChange(t)}
              title={`${TYPE_LABELS[t]} (${chipStyle.label})`}
              style={{
                padding: '5px 0', borderRadius: 5, fontSize: 10, fontWeight: 600,
                cursor: 'pointer',
                background: active ? chipStyle.bg : 'rgba(255,255,255,0.03)',
                color: active ? chipStyle.fg : '#9a9ab0',
                border: active ? `1px solid ${chipStyle.border}` : '1px solid rgba(255,255,255,0.05)',
                transition: 'background 0.12s ease, border-color 0.12s ease',
              }}>
              {TYPE_LABELS[t]}
            </button>
          )
        })}
      </div>

      {/* Strength + radius sliders inline */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: '#9a9ab0', fontWeight: 500 }}>Strength</span>
          <span style={{ color: '#c8c8d0', fontFamily: 'Geist Mono, monospace', fontSize: 10 }}>{attractor.strength.toFixed(2)}</span>
        </div>
        <input type="range" min={0} max={3} step={0.05} value={attractor.strength}
          onChange={(e) => onStrengthChange(parseFloat(e.target.value))}
          style={{ width: '100%' }} />
      </div>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
          <span style={{ color: '#9a9ab0', fontWeight: 500 }}>Radius</span>
          <span style={{ color: '#c8c8d0', fontFamily: 'Geist Mono, monospace', fontSize: 10 }}>{attractor.radius.toFixed(0)}</span>
        </div>
        <input type="range" min={4} max={16} step={0.5} value={attractor.radius}
          onChange={(e) => onRadiusChange(parseFloat(e.target.value))}
          style={{ width: '100%' }} />
      </div>

      {/* Position + place button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={onPlace}
          title={isPlacing
            ? 'Click on the canvas to set this attractor\u2019s center'
            : 'Re-place this attractor by clicking the canvas'}
          style={{
            flex: 1, padding: '6px 0', borderRadius: 6,
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
            background: isPlacing
              ? 'linear-gradient(135deg, rgba(34,197,94,0.22), rgba(99,102,241,0.18))'
              : 'rgba(255,255,255,0.04)',
            color: isPlacing ? '#bbf7d0' : '#c8c8d0',
            border: isPlacing ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(255,255,255,0.06)',
          }}>
          {isPlacing ? 'Click canvas\u2026' : 'Place on canvas'}
        </button>
        <span style={{
          fontSize: 9, color: '#7a7a90', fontFamily: 'Geist Mono, monospace',
          padding: '4px 6px', borderRadius: 5,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {attractor.position[0].toFixed(1)}, {attractor.position[1].toFixed(1)}, {attractor.position[2].toFixed(1)}
        </span>
      </div>
    </div>
  )
}
