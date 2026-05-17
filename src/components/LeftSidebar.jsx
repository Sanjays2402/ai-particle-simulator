import { useState } from 'react'
import { useStore, THEMES } from '../store'
import { presets } from '../presets'
import { GifEncoder } from '../lib/gifEncoder'
import { startCanvasRecording, downloadVideoBlob, isVideoExportSupported } from '../lib/videoRecorder'

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
  }

  const exportVideo = async () => {
    if (videoRec) {
      if (videoRec._cleanup) videoRec._cleanup()
      const { blob, mime } = await videoRec.stop()
      const baseName = `particle-${(useStore.getState().infoTitle || 'video').replace(/\s+/g, '-').toLowerCase()}`
      downloadVideoBlob(blob, mime, baseName)
      setVideoRec(null)
      setVideoElapsed(0)
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

      <Section title="Audio Reactivity">
        <p style={{ fontSize: 11, color: '#7a7a90', marginBottom: 8 }}>
          Click the 🎤 toolbar button to enable. Pick how audio drives the visuals:
        </p>
        <AudioModeRow />
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
          <Slider label="Field Strength" value={forceFieldStrength} min={0} max={5} step={0.1}
            onChange={setForceFieldStrength} display={v => v.toFixed(1)} />
        )}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {presets.filter(p => {
            const matchSearch = !presetSearch || p.name.toLowerCase().includes(presetSearch.toLowerCase())
            const matchFav = !showFavoritesOnly || favoritedPresets.includes(p.id)
            return matchSearch && matchFav
          }).map(p => (
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
