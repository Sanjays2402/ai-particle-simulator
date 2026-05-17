import { useEffect, useRef, useState } from 'react'

// Performance debug HUD. Toggle with backtick (`) so it doesn't fight
// the existing single-letter shortcuts. Tracks FPS as a rolling window
// (min / avg / max over the last 2 seconds), plus heap usage when
// available (Chrome only) and frame-time variance as a stutter signal.
export default function DebugHUD() {
  const [visible, setVisible] = useState(false)
  const [stats, setStats] = useState({ fps: 60, min: 60, max: 60, avg: 60, frame: 16.7, mem: null })
  const samplesRef = useRef([]) // [{ t, fps }] last ~2 seconds
  const lastRef = useRef(performance.now())
  const accumRef = useRef(0)
  const framesRef = useRef(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === '`' || e.key === '~') {
        e.preventDefault()
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!visible) return
    let raf
    const loop = (t) => {
      const dt = t - lastRef.current
      lastRef.current = t
      accumRef.current += dt
      framesRef.current += 1

      // Sample once every ~250ms so we update 4x/sec.
      if (accumRef.current >= 250) {
        const fps = (framesRef.current * 1000) / accumRef.current
        const frame = accumRef.current / framesRef.current
        samplesRef.current.push({ t, fps })
        // Trim to a 2s window.
        const cutoff = t - 2000
        while (samplesRef.current.length && samplesRef.current[0].t < cutoff) samplesRef.current.shift()

        let min = Infinity, max = -Infinity, sum = 0
        for (const s of samplesRef.current) {
          if (s.fps < min) min = s.fps
          if (s.fps > max) max = s.fps
          sum += s.fps
        }
        const avg = samplesRef.current.length ? sum / samplesRef.current.length : fps
        const mem = (performance.memory && performance.memory.usedJSHeapSize)
          ? performance.memory.usedJSHeapSize / 1024 / 1024
          : null
        setStats({ fps: Math.round(fps), min: Math.round(min), max: Math.round(max), avg: Math.round(avg), frame: frame.toFixed(1), mem })

        accumRef.current = 0
        framesRef.current = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [visible])

  if (!visible) return null

  const fpsColor = stats.fps >= 55 ? '#86efac' : stats.fps >= 30 ? '#fbbf24' : '#f87171'

  return (
    <div style={{
      position: 'fixed', top: 60, left: 12, zIndex: 40,
      fontFamily: 'JetBrains Mono, Geist Mono, monospace',
      fontSize: 11, lineHeight: 1.45, color: '#d8d8e0',
      background: 'linear-gradient(135deg, rgba(15,15,25,0.85) 0%, rgba(20,12,30,0.85) 100%)',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      border: '1px solid rgba(168,85,247,0.28)',
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 180,
      boxShadow: '0 8px 24px rgba(0,0,0,0.35), 0 0 18px rgba(168,85,247,0.18)',
      pointerEvents: 'none',
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: '#a78bfa', marginBottom: 6,
      }}>Debug HUD</div>
      <Row label="FPS"      value={<span style={{ color: fpsColor }}>{stats.fps}</span>} />
      <Row label="Avg / 2s" value={stats.avg} />
      <Row label="Min / 2s" value={stats.min} />
      <Row label="Max / 2s" value={stats.max} />
      <Row label="Frame"    value={`${stats.frame} ms`} />
      {stats.mem != null && <Row label="Heap" value={`${stats.mem.toFixed(0)} MB`} />}
      <div style={{ fontSize: 10, color: '#6a6a80', marginTop: 6 }}>
        toggle with <kbd style={kbd}>`</kbd>
      </div>
    </div>
  )
}

const kbd = {
  padding: '1px 4px', borderRadius: 3,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'inherit', fontSize: 10,
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
      <span style={{ color: '#8a8aa0' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
