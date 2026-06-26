import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { perfBudgetStatus } from '../lib/perfSuggest'

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
// Off by default; the whole component returns null when the preference is
// off (zero cost). When on it runs one rAF fps sampler (1Hz, matching
// StatusStrip) — no store churn, all local state. zen-hideable so it
// fades with the rest of the chrome in zen mode.
export default function PerfBudgetPill() {
  const enabled = useStore(s => s.perfPillEnabled)
  const setEnabled = useStore(s => s.setPerfPillEnabled)
  const [fps, setFps] = useState(60)

  useEffect(() => {
    if (!enabled) return undefined
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) {
        setFps(Math.round((frames * 1000) / (t - last)))
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [enabled])

  if (!enabled) return null

  const status = perfBudgetStatus(fps)

  return (
    <button
      className="zen-hideable"
      onClick={() => setEnabled(false)}
      title="Live perf budget — click to hide (re-enable in the Camera panel)"
      style={{
        position: 'fixed', bottom: 14, left: 14, zIndex: 38,
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '5px 10px 5px 8px', borderRadius: 999,
        cursor: 'pointer',
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        fontSize: 11, fontWeight: 600, letterSpacing: '0.01em',
        color: '#d8d8e0',
        background: 'linear-gradient(135deg, rgba(15,15,25,0.82) 0%, rgba(20,12,30,0.82) 100%)',
        border: `1px solid ${status.color}40`,
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
  )
}
