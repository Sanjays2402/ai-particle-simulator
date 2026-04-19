import { useState } from 'react'
import { useStore, THEMES } from '../store'
import { presets } from '../presets'
import { GifEncoder } from '../lib/gifEncoder'

const STYLES = ['sparkle', 'plasma', 'blob', 'ring']
const THEME_LIST = [
  { id: 'neon', name: 'Neon', color: '#6366f1' },
  { id: 'cyberpunk', name: 'Cyberpunk', color: '#ff00ff' },
  { id: 'ocean', name: 'Ocean', color: '#00d4ff' },
  { id: 'fire', name: 'Fire', color: '#ff6600' },
  { id: 'monochrome', name: 'Mono', color: '#cccccc' },
  { id: 'rainbow', name: 'Rainbow', color: 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f)' },
]

export default function LeftSidebar() {
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
