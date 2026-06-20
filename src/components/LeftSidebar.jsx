import { useState } from 'react'
import { useStore, THEMES } from '../store'
import { presets } from '../presets'
import { GifEncoder } from '../lib/gifEncoder'
import { startCanvasRecording, downloadVideoBlob, isVideoExportSupported } from '../lib/videoRecorder'
import { CATEGORIES, categoryOf, countByCategory } from '../lib/presetCategories'

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
      </Section>

      <Section title="Cursor">
        <ToggleRow
          label="Mouse Trail"
          value={useStore(s => s.mouseTrail)}
          onChange={useStore(s => s.setMouseTrail)}
        />
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
  const setChromaticAberration = useStore(s => s.setChromaticAberration)
  const setChromaticIntensity  = useStore(s => s.setChromaticIntensity)
  const setVignette            = useStore(s => s.setVignette)
  const setVignetteIntensity   = useStore(s => s.setVignetteIntensity)
  const setFilmGrain           = useStore(s => s.setFilmGrain)
  const setFilmGrainIntensity  = useStore(s => s.setFilmGrainIntensity)
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
// in <Slideshow /> (mounted in App.jsx).
function SlideshowRow() {
  const enabled  = useStore(s => s.slideshowEnabled)
  const dwell    = useStore(s => s.slideshowDwellSec)
  const order    = useStore(s => s.slideshowOrder)
  const setEn    = useStore(s => s.setSlideshowEnabled)
  const setDwell = useStore(s => s.setSlideshowDwellSec)
  const setOrder = useStore(s => s.setSlideshowOrder)
  const favCount = useStore(s => s.favoritedPresets.length)
  const ORDERS = [
    { id: 'sequence',   label: 'Order' },
    { id: 'shuffle',    label: 'Shuffle' },
    { id: 'favourites', label: `★ Favs${favCount ? ` (${favCount})` : ''}` },
  ]
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
          <p style={{ fontSize: 11, color: '#7a7a90', marginTop: 8 }}>
            New scene every {dwell}s. Manually loading a preset pauses the timer until the next dwell.
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
  const setEn    = useStore(s => s.setBgGradientEnabled)
  const setA     = useStore(s => s.setBgGradientA)
  const setB     = useStore(s => s.setBgGradientB)
  const setAngle = useStore(s => s.setBgGradientAngle)
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
