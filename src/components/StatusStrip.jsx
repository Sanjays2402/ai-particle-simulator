import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Activity, Cpu, Zap } from 'lucide-react'

export default function StatusStrip() {
  const particleCount = useStore(s => s.particleCount)
  const currentPreset = useStore(s => s.currentPreset)
  const playing = useStore(s => s.playing)
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) {
        setFps(Math.round((frames * 1000) / (t - last)))
        frames = 0; last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const presetLabel = currentPreset
    ? currentPreset.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Custom'

  const fpsColor = fps >= 55 ? '#86efac' : fps >= 30 ? '#fbbf24' : '#f87171'

  return (
    <div className="status-strip" style={{ bottom: 'auto', top: 60, left: '50%', transform: 'translateX(-50%)' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: playing ? '#86efac' : '#71717a',
          boxShadow: playing ? '0 0 8px #86efac' : 'none',
          animation: playing ? 'count-blink 1.4s ease-in-out infinite' : 'none',
        }} />
        {presetLabel}
      </span>
      <span className="sep" />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Zap size={10} strokeWidth={2.2} color={fpsColor} />
        <span style={{ color: fpsColor }}>{fps} fps</span>
      </span>
      <span className="sep" />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Activity size={10} strokeWidth={2.2} />
        {(particleCount / 1000).toFixed(0)}K particles
      </span>
    </div>
  )
}
