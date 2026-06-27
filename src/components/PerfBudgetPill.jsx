import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { perfBudgetStatus, summarizePerfWindow } from '../lib/perfSuggest'
import { buildBandedSparklineSegments, refLineY, FPS_GRAPH_CEIL } from '../lib/fpsGraph'

// R36.D — live perf-budget status pill.
//
// An opt-in, always-on perf overlay for users TUNING a heavy scene: a
// tiny green/amber/red dot + fps + a one-word status (Smooth / Tight /
// Heavy) pinned to the bottom-left, the way a game's perf HUD shows a
// live headroom light. This is separate from the reactive PerfAutoSuggest
// toast (which only speaks up after a sustained low spell) — the pill is
// continuous so the user can watch fps react as they add particles or
// flip on a heavy post-FX.
//
// R37.D — clicking the pill now opens a one-glance HEALTH SUMMARY popover
// (avg / 1% low / drops over the last ~4s) BEFORE the user commits to
// opening the full Debug HUD. A small "Hide" link in the popover keeps
// the old dismiss path. The pill keeps a short rolling fps window
// (sampled by the same 1Hz loop that drives the live light) so the
// summary is ready the instant the popover opens.
//
// Off by default; the whole component returns null when the preference is
// off (zero cost). zen-hideable so it fades with the rest of the chrome.

// How many 1Hz samples to keep — a ~12s rolling health window. Long
// enough that the 1% low + drop count mean something, short enough to
// stay responsive to a change the user just made.
const WINDOW = 12

export default function PerfBudgetPill() {
  const enabled = useStore(s => s.perfPillEnabled)
  const setEnabled = useStore(s => s.setPerfPillEnabled)
  const [fps, setFps] = useState(60)
  // Rolling fps window for the health summary. Held in state so the
  // popover re-renders as fresh samples land while it's open.
  const [series, setSeries] = useState([])
  const [open, setOpen] = useState(false)
  const seriesRef = useRef([])

  useEffect(() => {
    if (!enabled) return undefined
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) {
        const sample = Math.round((frames * 1000) / (t - last))
        setFps(sample)
        // Push into the rolling window (newest last, capped to WINDOW).
        const next = seriesRef.current.concat(sample)
        if (next.length > WINDOW) next.splice(0, next.length - WINDOW)
        seriesRef.current = next
        setSeries(next)
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [enabled])

  // Close the popover whenever the pill itself is disabled so it doesn't
  // linger as an orphan.
  useEffect(() => { if (!enabled) setOpen(false) }, [enabled])

  if (!enabled) return null

  const status = perfBudgetStatus(fps)
  const summary = summarizePerfWindow(series)
  // R38.D — the same ~12s window as a tiny band-coloured sparkline at the
  // top of the popover so the summary shows SHAPE (where the dips were),
  // not just numbers. Split into green/amber/red runs so a stutter paints
  // red exactly where it happened.
  const SPARK_W = 162, SPARK_H = 30
  const sparkOpts = { ceil: FPS_GRAPH_CEIL, width: SPARK_W, height: SPARK_H }
  const sparkSegments = buildBandedSparklineSegments(series, sparkOpts)
  const spark60 = refLineY(60, sparkOpts)
  const spark30 = refLineY(30, sparkOpts)

  return (
    <div
      className="zen-hideable"
      style={{ position: 'fixed', bottom: 14, left: 14, zIndex: 38 }}
    >
      {/* R37.D — health-summary popover. Opens above the pill so it never
          slides off the bottom edge. */}
      {open && (
        <div
          style={{
            position: 'absolute', bottom: 'calc(100% + 8px)', left: 0,
            width: 188,
            padding: '11px 13px 10px',
            borderRadius: 12,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            background: 'linear-gradient(135deg, rgba(15,15,25,0.94) 0%, rgba(20,12,30,0.94) 100%)',
            border: `1px solid ${status.color}40`,
            backdropFilter: 'blur(16px) saturate(140%)',
            WebkitBackdropFilter: 'blur(16px) saturate(140%)',
            boxShadow: `0 12px 30px rgba(0,0,0,0.45), 0 0 16px ${status.color}1f`,
            animation: 'cp-fade 0.14s ease-out',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 9,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#a78bfa',
            }}>Perf health</span>
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: summary.status.color,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{summary.count > 0 ? summary.status.label : '—'}</span>
          </div>

          {/* R38.D — band-coloured fps sparkline of the same window. Each
              green/amber/red run is its own polyline so a dip paints red
              exactly where it happened; the 60/30fps guide lines anchor
              it. Only when there are enough samples to draw a line. */}
          {sparkSegments.length > 0 && (
            <svg
              width={SPARK_W} height={SPARK_H}
              style={{ display: 'block', width: '100%', height: SPARK_H, borderRadius: 5, background: 'rgba(0,0,0,0.28)', marginBottom: 9 }}
              preserveAspectRatio="none"
            >
              {spark60 != null && (
                <line x1={0} y1={spark60} x2={SPARK_W} y2={spark60}
                  stroke="rgba(134,239,172,0.18)" strokeWidth={1} strokeDasharray="2 3" />
              )}
              {spark30 != null && (
                <line x1={0} y1={spark30} x2={SPARK_W} y2={spark30}
                  stroke="rgba(248,113,113,0.16)" strokeWidth={1} strokeDasharray="2 3" />
              )}
              {sparkSegments.map((seg, i) => (
                <polyline key={i} points={seg.attr} fill="none" stroke={seg.color}
                  strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
              ))}
            </svg>
          )}

          {summary.count > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SummaryRow label="Avg / window" value={`${summary.avg} fps`} color={summary.status.color} />
              <SummaryRow label="1% low" value={`${summary.low} fps`}
                color={summary.low >= 55 ? '#86efac' : summary.low >= 30 ? '#fbbf24' : '#f87171'} />
              <SummaryRow label="Worst frame" value={`${summary.min} fps`} />
              <SummaryRow label="Drops (<30)" value={summary.drops}
                color={summary.drops > 0 ? '#f87171' : '#8a8aa0'} />
              <SummaryRow label="Samples" value={`${summary.count}s`} />
            </div>
          ) : (
            <div style={{ fontSize: 11, color: '#7a7a90', padding: '4px 0 6px', lineHeight: 1.4 }}>
              Warming up — sampling the last few seconds…
            </div>
          )}

          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 9, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('particle:toggle-debug-hud'))}
              title="Open the full Debug HUD (backtick)"
              style={popoverBtn}
            >Debug HUD</button>
            <button
              onClick={() => { setOpen(false); setEnabled(false) }}
              title="Hide the perf pill (re-enable in the Camera panel)"
              style={{ ...popoverBtn, color: '#9a9ab0' }}
            >Hide</button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        title="Live perf budget — click for a health summary"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '5px 10px 5px 8px', borderRadius: 999,
          cursor: 'pointer',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
          color: '#d8d8e0',
          background: 'linear-gradient(135deg, rgba(15,15,25,0.82) 0%, rgba(20,12,30,0.82) 100%)',
          border: `1px solid ${status.color}${open ? '88' : '40'}`,
          backdropFilter: 'blur(12px) saturate(140%)',
          WebkitBackdropFilter: 'blur(12px) saturate(140%)',
          boxShadow: `0 4px 16px rgba(0,0,0,0.32), 0 0 12px ${status.color}22`,
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: status.color,
          boxShadow: `0 0 8px ${status.color}`,
          flexShrink: 0,
        }} />
        <span style={{ color: status.color, fontVariantNumeric: 'tabular-nums' }}>{status.fps}</span>
        <span style={{ color: '#8a8aa0', fontWeight: 500 }}>fps</span>
        <span style={{
          color: status.color, fontWeight: 700, fontSize: 10,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          paddingLeft: 4, borderLeft: '1px solid rgba(255,255,255,0.1)',
        }}>{status.label}</span>
      </button>
    </div>
  )
}

const popoverBtn = {
  padding: '4px 9px', borderRadius: 6,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#c8c8d0', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 10, fontWeight: 600,
  letterSpacing: '0.04em',
}

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
      <span style={{ color: '#8a8aa0' }}>{label}</span>
      <span style={{ color: color || '#d8d8e0', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
