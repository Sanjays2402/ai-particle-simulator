import { useState } from 'react'
import { useStore, THEMES } from '../store'
import { presets } from '../presets'

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
    gravityEnabled, setGravityEnabled,
    gravityStrength, setGravityStrength,
    collisionsEnabled, setCollisionsEnabled,
    forceFieldType, setForceFieldType,
    forceFieldStrength, setForceFieldStrength,
  } = useStore()

  return (
    <div style={{
      width: 280,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'rgba(8,8,14,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderRight: '1px solid rgba(255,255,255,0.04)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {presets.map(p => (
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
              <span>{p.name}</span>
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
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#5a5a70',
        marginBottom: 12,
      }}>{title}</h3>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, display }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: '#7a7a90' }}>{label}</span>
        <span style={{ color: '#6366f1', fontWeight: 500 }}>{display ? display(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} style={{ width: '100%' }} />
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
