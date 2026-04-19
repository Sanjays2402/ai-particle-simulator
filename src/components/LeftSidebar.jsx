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
    <div style={{
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
          <span style={{ fontSize: 12, color: '#7a7a90' }}>Force Field</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {[
            { id: 'attractor', label: '🧲 Attract', color: '#6366f1' },
            { id: 'repulsor', label: '💥 Repulse', color: '#ef4444' },
            { id: 'vortex', label: '🌀 Vortex', color: '#8b5cf6' },
            { id: 'turbulence', label: '💨 Turb.', color: '#f59e0b' },
          ].map(ff => (
            <button key={ff.id}
              onClick={() => setForceFieldType(forceFieldType === ff.id ? null : ff.id)}
              style={{
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
                background: forceFieldType === ff.id ? `${ff.color}18` : 'rgba(255,255,255,0.04)',
                color: forceFieldType === ff.id ? ff.color : '#7a7a90',
                border: forceFieldType === ff.id ? `1px solid ${ff.color}40` : '1px solid rgba(255,255,255,0.04)',
              }}
            >{ff.label}</button>
          ))}
        </div>
        {forceFieldType && (
          <Slider label="Field Strength" value={forceFieldStrength} min={0} max={5} step={0.1}
            onChange={setForceFieldStrength} display={v => v.toFixed(1)} />
        )}
      </Section>

      <Section title="Visual Style">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STYLES.map(s => (
            <button key={s} onClick={() => setVisualStyle(s)}
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                textTransform: 'capitalize',
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
                background: visualStyle === s ? '#6366f1' : 'rgba(255,255,255,0.04)',
                color: visualStyle === s ? '#ffffff' : '#7a7a90',
                border: visualStyle === s ? '1px solid rgba(99,102,241,0.4)' : '1px solid rgba(255,255,255,0.04)',
              }}
            >{s}</button>
          ))}
        </div>
      </Section>

      <Section title="Theme">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {THEME_LIST.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
                background: theme === t.id ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                border: theme === t.id ? `1px solid ${t.color.startsWith('linear') ? 'rgba(255,255,255,0.2)' : t.color + '40'}` : '1px solid rgba(255,255,255,0.04)',
                color: '#7a7a90',
              }}
            >
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: t.color, flexShrink: 0,
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
              placeholder="Search presets..."
              style={{
                width: '100%', padding: '6px 28px 6px 10px', borderRadius: 6, fontSize: 12,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                color: '#eeeef0', outline: 'none', transition: 'all 0.15s ease-out',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
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
            padding: '10px 0',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: aiLoading || !prompt.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s ease-out',
            background: '#6366f1',
            color: '#ffffff',
            border: 'none',
            opacity: aiLoading || !prompt.trim() ? 0.4 : 1,
          }}
          onMouseEnter={e => {
            if (!aiLoading && prompt.trim()) {
              e.currentTarget.style.background = '#818cf8'
              e.currentTarget.style.boxShadow = '0 0 20px rgba(99,102,241,0.3)'
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#6366f1'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {aiLoading ? '⏳ Generating...' : '✦ Generate'}
        </button>
        {aiError && <p style={{ fontSize: 12, marginTop: 8, color: '#ef4444' }}>{aiError}</p>}
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <h3 style={{
        fontSize: 10,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: 'transparent',
        marginBottom: 12,
        backgroundImage: 'linear-gradient(90deg, #a78bfa 0%, #f472b6 100%)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{
          display: 'inline-block',
          width: 5, height: 5, borderRadius: '50%',
          background: 'linear-gradient(135deg, #a78bfa, #f472b6)',
          boxShadow: '0 0 8px rgba(168,85,247,0.8)',
          flexShrink: 0,
        }} />
        {title}
      </h3>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, display }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: '#7a7a90' }}>{label}</span>
        <span style={{
          color: '#c084fc',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11,
        }}>{display ? display(value) : value}</span>
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
        width: 36,
        height: 20,
        borderRadius: 10,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        background: value ? '#6366f1' : 'rgba(255,255,255,0.08)',
        border: 'none',
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        position: 'absolute',
        top: 3,
        left: value ? 19 : 3,
        transition: 'all 0.15s ease-out',
        background: value ? '#ffffff' : '#7a7a90',
      }} />
    </button>
  )
}
