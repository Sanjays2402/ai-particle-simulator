import { useEffect, useRef, useState } from 'react'
import {
  buildSparklinePoints, sparklinePointsAttr, refLineY, summarizeFpsWindow,
  fpsBandColor, FPS_GRAPH_CEIL,
} from '../lib/fpsGraph'

// Performance debug HUD. Toggle with backtick (`) so it doesn't fight
// the existing single-letter shortcuts. Tracks FPS as a rolling window
// (min / avg / max over the last 2 seconds), plus heap usage when
// available (Chrome only) and frame-time variance as a stutter signal.
export default function DebugHUD() {
  const [visible, setVisible] = useState(false)
  const [stats, setStats] = useState({ fps: 60, min: 60, max: 60, avg: 60, frame: 16.7, mem: null })
  // R34.A — the live fps series feeding the sparkline. Held in state
  // (not just the ref) so the SVG re-renders each sample tick. Capped
  // to the same ~2s window the numeric stats use.
  const [series, setSeries] = useState([])
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
        // Feed the sparkline with the same windowed series (raw fps,
        // newest last) so the graph and the numeric readout never drift.
        setSeries(samplesRef.current.map(s => s.fps))

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

  // Sparkline geometry — a compact 168x34 graph of the same 2s window.
  const GW = 168, GH = 34
  const sparkOpts = { ceil: FPS_GRAPH_CEIL, width: GW, height: GH }
  const sparkAttr = sparklinePointsAttr(series, sparkOpts)
  const sparkPts = buildSparklinePoints(series, sparkOpts)
  // Area-fill polygon: the line, then down the right edge, along the
  // floor, and back up the left edge.
  const areaAttr = sparkPts.length >= 2
    ? `${sparkAttr} ${sparkPts[sparkPts.length - 1].x},${GH} ${sparkPts[0].x},${GH}`
    : ''
  const line60 = refLineY(60, sparkOpts)
  const line30 = refLineY(30, sparkOpts)
  const summary = summarizeFpsWindow(series)
  // Colour the stroke by the live fps band so a stutter visibly reddens.
  const strokeColor = fpsBandColor(stats.fps)

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

      {/* FPS sparkline — the same 2s window drawn as a graph so a
          stutter spike is visible at a glance, not just a flickering
          min/max number. 60fps + 30fps reference lines anchor it. */}
      <div style={{ marginBottom: 8 }}>
        <svg width={GW} height={GH} style={{ display: 'block', borderRadius: 5, background: 'rgba(0,0,0,0.28)' }}>
          {line60 != null && (
            <line x1={0} y1={line60} x2={GW} y2={line60}
              stroke="rgba(134,239,172,0.22)" strokeWidth={1} strokeDasharray="2 3" />
          )}
          {line30 != null && (
            <line x1={0} y1={line30} x2={GW} y2={line30}
              stroke="rgba(248,113,113,0.18)" strokeWidth={1} strokeDasharray="2 3" />
          )}
          {areaAttr && (
            <polygon points={areaAttr} fill={strokeColor} fillOpacity={0.1} />
          )}
          {sparkAttr && (
            <polyline points={sparkAttr} fill="none" stroke={strokeColor}
              strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
          )}
        </svg>
      </div>

      <Row label="FPS"      value={<span style={{ color: fpsColor }}>{stats.fps}</span>} />
      <Row label="Avg / 2s" value={stats.avg} />
      <Row label="Min / 2s" value={stats.min} />
      <Row label="Max / 2s" value={stats.max} />
      <Row label="1% low"   value={<span style={{ color: summary.low >= 55 ? '#86efac' : summary.low >= 30 ? '#fbbf24' : '#f87171' }}>{summary.low}</span>} />
      {summary.drops > 0 && <Row label="Drops" value={<span style={{ color: '#f87171' }}>{summary.drops}</span>} />}
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
