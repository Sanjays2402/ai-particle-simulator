import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  buildSparklinePoints, sparklinePointsAttr, refLineY, summarizeFpsWindow,
  fpsBandColor, FPS_GRAPH_CEIL,
  buildFrameTimeSparklinePoints, frameTimeSparklineAttr, frameMsRefLineY,
  summarizeFrameTimeWindow, frameMsBandColor, fpsToFrameMs,
  FRAME_MS_GRAPH_CEIL, FRAME_BUDGET_60, FRAME_BUDGET_30,
  frameBudgetHeadroom, headroomBandColor,
} from '../lib/fpsGraph'

// Performance debug HUD. Toggle with backtick (`) so it doesn't fight
// the existing single-letter shortcuts. Tracks FPS as a rolling window
// (min / avg / max over the last 2 seconds), plus heap usage when
// available (Chrome only) and frame-time variance as a stutter signal.
// Press M while the HUD is open to flip the sparkline + numeric rows
// between fps and frame-time (ms) — the unit you profile a 16.7ms
// budget in directly (R35.A).
export default function DebugHUD() {
  const [visible, setVisible] = useState(false)
  // false = fps view (default), true = frame-time (ms) view.
  const [msView, setMsView] = useState(false)
  // R36.A — live particle count for the GPU-load readout row. Cheap
  // store subscription (only re-renders the HUD when the count changes).
  const particleCount = useStore(s => s.particleCount)
  const [stats, setStats] = useState({ fps: 60, min: 60, max: 60, avg: 60, frame: 16.7, mem: null })
  // R34.A — the live fps series feeding the sparkline. Held in state
  // (not just the ref) so the SVG re-renders each sample tick. Capped
  // to the same ~2s window the numeric stats use.
  const [series, setSeries] = useState([])
  const samplesRef = useRef([]) // [{ t, fps }] last ~2 seconds
  const lastRef = useRef(performance.now())
  const accumRef = useRef(0)
  const framesRef = useRef(0)
  // Mirror `visible` into a ref so the (deps-free) key handler can read
  // the live value without a nested setState in another updater.
  const visibleRef = useRef(false)
  useEffect(() => { visibleRef.current = visible }, [visible])

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === '`' || e.key === '~') {
        e.preventDefault()
        setVisible(v => !v)
      } else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Flip fps <-> ms, but only while the HUD is open so M stays
        // free for any future global shortcut when it's closed.
        if (visibleRef.current) {
          e.preventDefault()
          setMsView(v => !v)
        }
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
  // The view (fps vs ms) only swaps which pure mappers + summary we use;
  // the SVG box + the live series are identical so the toggle is cheap.
  const GW = 168, GH = 34
  const liveMs = fpsToFrameMs(stats.fps)
  let sparkOpts, sparkAttr, sparkPts, lineA, lineB, lineAColor, lineBColor, strokeColor
  if (msView) {
    sparkOpts = { ceil: FRAME_MS_GRAPH_CEIL, width: GW, height: GH }
    sparkAttr = frameTimeSparklineAttr(series, sparkOpts)
    sparkPts = buildFrameTimeSparklinePoints(series, sparkOpts)
    lineA = frameMsRefLineY(FRAME_BUDGET_60, sparkOpts) // 16.7ms budget
    lineB = frameMsRefLineY(FRAME_BUDGET_30, sparkOpts) // 33.3ms budget
    lineAColor = 'rgba(134,239,172,0.22)'
    lineBColor = 'rgba(248,113,113,0.18)'
    strokeColor = frameMsBandColor(liveMs)
  } else {
    sparkOpts = { ceil: FPS_GRAPH_CEIL, width: GW, height: GH }
    sparkAttr = sparklinePointsAttr(series, sparkOpts)
    sparkPts = buildSparklinePoints(series, sparkOpts)
    lineA = refLineY(60, sparkOpts)
    lineB = refLineY(30, sparkOpts)
    lineAColor = 'rgba(134,239,172,0.22)'
    lineBColor = 'rgba(248,113,113,0.18)'
    strokeColor = fpsBandColor(stats.fps)
  }
  // Area-fill polygon: the line, then down the right edge, along the
  // floor, and back up the left edge.
  const areaAttr = sparkPts.length >= 2
    ? `${sparkAttr} ${sparkPts[sparkPts.length - 1].x},${GH} ${sparkPts[0].x},${GH}`
    : ''
  const fpsSummary = summarizeFpsWindow(series)
  const msSummary = summarizeFrameTimeWindow(series)
  // R36.A — how much of the 60fps (16.7ms) budget the live frame leaves
  // on the table. Shown as a bar in the ms view so the user can see how
  // much heavier a scene they can push before fps drops, not just the
  // current cost.
  const budget = frameBudgetHeadroom(stats.fps)
  const headroomColor = headroomBandColor(budget.headroom)

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
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: '#a78bfa',
        }}>Debug HUD</span>
        {/* Tiny fps|ms unit pill — the active unit is highlighted so the
            user can see which view they're in at a glance. */}
        <span style={{
          display: 'inline-flex', gap: 1, fontSize: 8.5, fontWeight: 700,
          letterSpacing: '0.06em', borderRadius: 4, overflow: 'hidden',
          border: '1px solid rgba(168,85,247,0.25)',
        }}>
          <span style={{
            padding: '1px 5px',
            background: msView ? 'transparent' : 'rgba(168,85,247,0.28)',
            color: msView ? '#6a6a80' : '#e9d5ff',
          }}>FPS</span>
          <span style={{
            padding: '1px 5px',
            background: msView ? 'rgba(168,85,247,0.28)' : 'transparent',
            color: msView ? '#e9d5ff' : '#6a6a80',
          }}>MS</span>
        </span>
      </div>

      {/* Sparkline — the same 2s window drawn as a graph so a stutter
          spike is visible at a glance. In fps view the 60/30fps lines
          anchor it; in ms view the 16.7ms / 33.3ms frame-budget lines
          do. A faster frame always sits HIGHER in both views so the
          silhouette reads the same direction (dips = trouble). */}
      <div style={{ marginBottom: 8 }}>
        <svg width={GW} height={GH} style={{ display: 'block', borderRadius: 5, background: 'rgba(0,0,0,0.28)' }}>
          {lineA != null && (
            <line x1={0} y1={lineA} x2={GW} y2={lineA}
              stroke={lineAColor} strokeWidth={1} strokeDasharray="2 3" />
          )}
          {lineB != null && (
            <line x1={0} y1={lineB} x2={GW} y2={lineB}
              stroke={lineBColor} strokeWidth={1} strokeDasharray="2 3" />
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

      {msView ? (
        <>
          <Row label="Frame"     value={<span style={{ color: frameMsBandColor(liveMs) }}>{liveMs.toFixed(1)} ms</span>} />
          {/* R36.A — budget headroom bar: how much of the 16.7ms (60fps)
              frame budget is left. Green = comfortable room, amber =
              tight, red = already over budget. The filled portion is the
              budget USED; the label shows the signed headroom %. */}
          <div style={{ margin: '5px 0 7px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ color: '#8a8aa0' }}>Budget</span>
              <span style={{ color: headroomColor, fontVariantNumeric: 'tabular-nums' }}>
                {budget.overBudget ? 'over' : `${budget.headroomPct}% free`}
              </span>
            </div>
            <div style={{
              position: 'relative', height: 5, borderRadius: 3,
              background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
            }}>
              {/* 16.7ms budget tick sits at 100% of the bar; the fill is
                  the fraction used so it crosses the full bar exactly at
                  the budget edge. */}
              <div style={{
                position: 'absolute', inset: 0, width: `${Math.round(budget.used * 100)}%`,
                background: headroomColor, opacity: 0.85,
                transition: 'width 0.2s ease-out, background 0.2s ease-out',
              }} />
            </div>
          </div>
          <Row label="Avg / 2s"  value={`${msSummary.avg} ms`} />
          <Row label="Best / 2s" value={`${msSummary.min} ms`} />
          <Row label="Worst / 2s" value={`${msSummary.max} ms`} />
          <Row label="1% high"   value={<span style={{ color: frameMsBandColor(msSummary.high) }}>{msSummary.high} ms</span>} />
          {msSummary.over > 0 && <Row label="Over 33ms" value={<span style={{ color: '#f87171' }}>{msSummary.over}</span>} />}
        </>
      ) : (
        <>
          <Row label="FPS"      value={<span style={{ color: fpsColor }}>{stats.fps}</span>} />
          <Row label="Avg / 2s" value={stats.avg} />
          <Row label="Min / 2s" value={stats.min} />
          <Row label="Max / 2s" value={stats.max} />
          <Row label="1% low"   value={<span style={{ color: fpsSummary.low >= 55 ? '#86efac' : fpsSummary.low >= 30 ? '#fbbf24' : '#f87171' }}>{fpsSummary.low}</span>} />
          {fpsSummary.drops > 0 && <Row label="Drops" value={<span style={{ color: '#f87171' }}>{fpsSummary.drops}</span>} />}
          <Row label="Frame"    value={`${stats.frame} ms`} />
        </>
      )}
      {stats.mem != null && <Row label="Heap" value={`${stats.mem.toFixed(0)} MB`} />}
      {/* R36.A — particle load: the single biggest GPU-cost lever, so it
          sits right next to the perf numbers for a quick "is the count
          why I'm slow?" read. */}
      <Row label="Particles" value={`${(particleCount / 1000).toFixed(particleCount >= 10000 ? 0 : 1)}K`} />
      <div style={{ fontSize: 10, color: '#6a6a80', marginTop: 6 }}>
        <kbd style={kbd}>`</kbd> toggle · <kbd style={kbd}>M</kbd> {msView ? 'fps' : 'ms'}
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
