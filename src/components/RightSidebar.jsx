import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Activity, Sparkles, Palette, Gauge } from 'lucide-react'

function SectionHeader({ children }) {
  return (
    <div className="section-label-v2" style={{ marginBottom: 12 }}>
      <span className="dot" />
      {children}
    </div>
  )
}

export default function RightSidebar() {
  const { dynamicControls, dynamicValues, setDynamicValue, infoTitle, infoDesc, particleCount, theme, visualStyle } = useStore()
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) { setFps(Math.round((frames * 1000) / (t - last))); frames = 0; last = t }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="sidebar-glow-right" style={{
      position: 'relative',
      width: 260,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'linear-gradient(180deg, rgba(8,8,14,0.72) 0%, rgba(12,12,22,0.68) 100%)',
      backdropFilter: 'blur(28px) saturate(140%)',
      WebkitBackdropFilter: 'blur(28px) saturate(140%)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.02), -1px 0 40px rgba(0,0,0,0.25)',
      height: '100%',
    }}>
      {/* Info Panel */}
      <div style={{ padding: '14px 16px 12px' }}>
        <SectionHeader>Info</SectionHeader>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: '#eeeef0', marginBottom: 4, letterSpacing: '-0.02em' }}>
          {infoTitle || 'No simulation'}
        </h2>
        {infoDesc && (
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#8a8aa0' }}>
            {infoDesc}
          </p>
        )}
      </div>

      {/* v3 iter 04: Live telemetry panel */}
      <div style={{ padding: '2px 16px 16px' }}>
        <SectionHeader>Telemetry</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="metric-row">
            <span className="metric-label"><Gauge size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />FPS</span>
            <span className="metric-value" style={{ color: fps >= 55 ? '#86efac' : fps >= 30 ? '#fbbf24' : '#f87171' }}>{fps}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Activity size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Particles</span>
            <span className="metric-value">{(particleCount / 1000).toFixed(1)}K</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Palette size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Theme</span>
            <span className="metric-value" style={{ textTransform: 'capitalize' }}>{theme}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Sparkles size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Style</span>
            <span className="metric-value" style={{ textTransform: 'capitalize' }}>{visualStyle}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Controls */}
      {dynamicControls.length > 0 && (
        <div style={{ padding: '2px 16px 14px' }}>
          <SectionHeader>Controls</SectionHeader>
          {dynamicControls.map(c => {
            const v = dynamicValues[c.id] ?? c.value
            const pct = ((v - c.min) / (c.max - c.min)) * 100
            return (
              <div key={c.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#9a9ab0', fontWeight: 500 }}>{c.label}</span>
                  <span className="value-chip">{v.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={c.min} max={c.max}
                  step={(c.max - c.min) / 100}
                  value={v}
                  onChange={e => setDynamicValue(c.id, parseFloat(e.target.value))}
                  style={{ width: '100%', '--val': `${pct}%` }}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <SectionHeader>Shortcuts</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5, color: '#8a8aa0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Command palette</span>
            <span style={{ display: 'inline-flex', gap: 3 }}><kbd>⌘</kbd><kbd>K</kbd></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Play / pause</span>
            <kbd>Space</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Random preset</span>
            <kbd>R</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Screenshot</span>
            <kbd>S</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Fullscreen</span>
            <kbd>F</kbd>
          </div>
        </div>
      </div>
    </div>
  )
}
