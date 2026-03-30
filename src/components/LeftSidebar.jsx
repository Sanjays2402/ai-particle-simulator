import { useState } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'

const STYLES = ['sparkle', 'plasma', 'blob', 'ring']

export default function LeftSidebar() {
  const {
    particleCount, setParticleCount,
    speed, setSpeed,
    glowIntensity, setGlowIntensity,
    visualStyle, setVisualStyle,
    loadPreset, currentPreset,
    prompt, setPrompt,
    generateFromPrompt, aiLoading, aiError, aiApiKey,
  } = useStore()

  return (
    <div className="w-72 flex flex-col overflow-y-auto border-r shrink-0"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      
      {/* System Core */}
      <Section title="System Core">
        <Slider label="Particles" value={particleCount} min={1000} max={50000} step={1000}
          onChange={setParticleCount} display={v => `${(v/1000).toFixed(0)}K`} />
        <Slider label="Speed" value={speed} min={0} max={3} step={0.1}
          onChange={setSpeed} display={v => v.toFixed(1)} />
        <Slider label="Glow" value={glowIntensity} min={0} max={5} step={0.1}
          onChange={setGlowIntensity} display={v => v.toFixed(1)} />
      </Section>

      {/* Visual Style */}
      <Section title="Visual Style">
        <div className="flex gap-2 flex-wrap">
          {STYLES.map(s => (
            <button
              key={s}
              onClick={() => setVisualStyle(s)}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
              style={{
                background: visualStyle === s ? 'var(--neon)' : 'var(--bg-tertiary)',
                color: visualStyle === s ? '#0a0a0f' : 'var(--text-secondary)',
              }}
            >{s}</button>
          ))}
        </div>
      </Section>

      {/* Shape Presets */}
      <Section title="Shape Presets">
        <div className="flex flex-col gap-1">
          {presets.map(p => (
            <button
              key={p.id}
              onClick={() => loadPreset(p.id)}
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
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Describe a particle effect..."
          rows={3}
          className="w-full rounded-lg p-3 text-sm resize-none outline-none"
          style={{
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}
        />
        <button
          onClick={generateFromPrompt}
          disabled={aiLoading || !prompt.trim()}
          className="w-full mt-2 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
          style={{ background: 'var(--neon)', color: '#0a0a0f' }}
        >
          {aiLoading ? '⏳ Generating...' : '✦ Generate'}
        </button>
        {aiError && (
          <p className="text-xs mt-2 text-red-400">{aiError}</p>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-secondary)' }}>
        {title}
      </h3>
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
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  )
}
