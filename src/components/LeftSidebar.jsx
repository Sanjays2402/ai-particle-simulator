import { useState } from 'react'
import { useStore, THEMES } from '../store'
import { presets } from '../presets'

const STYLES = ['sparkle', 'plasma', 'blob', 'ring']
const THEME_LIST = [
  { id: 'neon', name: 'Neon', color: '#00ff88' },
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
    <div className="w-72 flex flex-col overflow-y-auto border-r shrink-0"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      
      {/* System Core */}
      <Section title="System Core">
        <Slider label="Particles" value={particleCount} min={1000} max={performanceMode ? 10000 : 50000} step={1000}
          onChange={setParticleCount} display={v => `${(v/1000).toFixed(0)}K`} />
        <Slider label="Speed" value={speed} min={0} max={3} step={0.1}
          onChange={setSpeed} display={v => v.toFixed(1)} />
        <Slider label="Glow" value={glowIntensity} min={0} max={5} step={0.1}
          onChange={setGlowIntensity} display={v => v.toFixed(1)} />
        <Slider label="Attract Str." value={attractStrength} min={0} max={10} step={0.5}
          onChange={setAttractStrength} display={v => v.toFixed(1)} />
        
        <div className="flex items-center justify-between mt-2 mb-1">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Trails</span>
          <Toggle value={trails} onChange={setTrails} />
        </div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Performance Mode</span>
          <Toggle value={performanceMode} onChange={setPerformanceMode} />
        </div>
      </Section>

      {/* Physics Engine */}
      <Section title="Physics Engine">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Gravity</span>
          <Toggle value={gravityEnabled} onChange={setGravityEnabled} />
        </div>
        {gravityEnabled && (
          <Slider label="Gravity Strength" value={gravityStrength} min={0} max={2} step={0.1}
            onChange={setGravityStrength} display={v => v.toFixed(1)} />
        )}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Collisions</span>
          <Toggle value={collisionsEnabled} onChange={setCollisionsEnabled} />
        </div>

        <div className="mt-2 mb-1">
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Force Field</span>
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {[
            { id: 'attractor', label: '🧲 Attract', color: '#00ff88' },
            { id: 'repulsor', label: '💥 Repulse', color: '#ff4444' },
            { id: 'vortex', label: '🌀 Vortex', color: '#8844ff' },
            { id: 'turbulence', label: '💨 Turb.', color: '#ffaa00' },
          ].map(ff => (
            <button key={ff.id}
              onClick={() => setForceFieldType(forceFieldType === ff.id ? null : ff.id)}
              className="px-2 py-1 rounded-md text-xs font-medium transition-all"
              style={{
                background: forceFieldType === ff.id ? ff.color : 'var(--bg-tertiary)',
                color: forceFieldType === ff.id ? '#0a0a0f' : 'var(--text-secondary)',
                border: forceFieldType === ff.id ? `1px solid ${ff.color}` : '1px solid transparent',
              }}
            >{ff.label}</button>
          ))}
        </div>
        {forceFieldType && (
          <Slider label="Field Strength" value={forceFieldStrength} min={0} max={5} step={0.1}
            onChange={setForceFieldStrength} display={v => v.toFixed(1)} />
        )}
      </Section>

      {/* Visual Style */}
      <Section title="Visual Style">
        <div className="flex gap-2 flex-wrap">
          {STYLES.map(s => (
            <button key={s} onClick={() => setVisualStyle(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
              style={{
                background: visualStyle === s ? 'var(--neon)' : 'var(--bg-tertiary)',
                color: visualStyle === s ? '#0a0a0f' : 'var(--text-secondary)',
              }}
            >{s}</button>
          ))}
        </div>
      </Section>

      {/* Color Theme */}
      <Section title="Theme">
        <div className="flex gap-2 flex-wrap">
          {THEME_LIST.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: theme === t.id ? 'rgba(255,255,255,0.1)' : 'var(--bg-tertiary)',
                border: theme === t.id ? `1px solid ${t.color.startsWith('linear') ? '#fff' : t.color}` : '1px solid transparent',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{
                display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                background: t.color,
              }} />
              {t.name}
            </button>
          ))}
        </div>
      </Section>

      {/* Shape Presets */}
      <Section title="Shape Presets">
        <div className="flex flex-col gap-1">
          {presets.map(p => (
            <button key={p.id} onClick={() => loadPreset(p.id)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-all"
              style={{
                background: currentPreset === p.id ? 'rgba(0,255,136,0.1)' : 'transparent',
                color: currentPreset === p.id ? 'var(--neon)' : 'var(--text-secondary)',
                border: currentPreset === p.id ? '1px solid rgba(0,255,136,0.3)' : '1px solid transparent',
              }}
            >
              <span>{p.emoji}</span>
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Smart Text Engine */}
      <Section title="Smart Text Engine">
        {!aiApiKey && (
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            Configure API key in ⚙ Settings to enable AI generation
          </p>
        )}
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
          placeholder="Describe a particle effect..." rows={3}
          className="w-full rounded-lg p-3 text-sm resize-none outline-none"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
        <button onClick={generateFromPrompt} disabled={aiLoading || !prompt.trim()}
          className="w-full mt-2 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'var(--neon)', color: '#0a0a0f' }}
        >
          {aiLoading ? '⏳ Generating...' : '✦ Generate'}
        </button>
        {aiError && <p className="text-xs mt-2 text-red-400">{aiError}</p>}
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-secondary)' }}>{title}</h3>
      {children}
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, display }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1.5">
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--neon)' }}>{display ? display(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} className="w-full" />
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      className="w-9 h-5 rounded-full transition-all relative"
      style={{ background: value ? 'var(--neon)' : 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
    >
      <div className="w-3.5 h-3.5 rounded-full absolute top-0.5 transition-all"
        style={{ left: value ? 18 : 2, background: value ? '#0a0a0f' : 'var(--text-secondary)' }} />
    </button>
  )
}
