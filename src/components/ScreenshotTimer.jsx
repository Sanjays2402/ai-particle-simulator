import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { countdownState, ringDashoffset } from '../lib/selfTimer'
import { resolveReducedMotion } from '../lib/reducedMotion'

// Screenshot self-timer overlay. When a timed capture is requested
// (via the `particle:screenshot-timed` event, or a 0-delay falls
// straight through to an immediate fire) this renders a big 3..2..1
// countdown ring centred on screen, then dispatches the actual
// screenshot once the countdown completes.
//
// The countdown math lives in lib/selfTimer (pure, tested); this
// component owns only the rAF loop + the visual ring. The computed
// countdown state is held in React state (updated from the loop, never
// recomputed during render) so the render stays a pure function of
// state — no performance.now() at render time.
const RING_R = 54
const RING_C = 2 * Math.PI * RING_R

export default function ScreenshotTimer() {
  // null = idle. Otherwise { startMs, delay }.
  const [active, setActive] = useState(null)
  // Latest computed countdown snapshot: { secondsLeft, progress, done }.
  const [snap, setSnap] = useState({ secondsLeft: 0, progress: 0, done: false })
  const reducedMotionMode = useStore(s => s.reducedMotionMode)
  const osReduced = useStore(s => s.osPrefersReducedMotion)
  const reduced = resolveReducedMotion(reducedMotionMode, osReduced)
  const firedRef = useRef(false)

  // Listen for timed-capture requests. detail.delay (seconds) drives
  // the countdown; a 0/absent delay fires immediately.
  useEffect(() => {
    const onRequest = (e) => {
      const delay = Number(e?.detail?.delay) || 0
      if (delay <= 0) {
        // Instant — just fire the real capture, no overlay.
        document.dispatchEvent(new CustomEvent('particle:capture-now'))
        return
      }
      firedRef.current = false
      const startMs = performance.now()
      setSnap({ secondsLeft: Math.ceil(delay), progress: 0, done: false })
      setActive({ startMs, delay })
    }
    window.addEventListener('particle:screenshot-timed', onRequest)
    return () => window.removeEventListener('particle:screenshot-timed', onRequest)
  }, [])

  // Drive the countdown. Computes the state here (where performance.now
  // is allowed) and pushes it into render state. Tears down when idle
  // or once fired.
  useEffect(() => {
    if (!active) return undefined
    let raf
    const loop = () => {
      const st = countdownState(active.startMs, active.delay, performance.now())
      setSnap({ secondsLeft: st.secondsLeft, progress: st.progress, done: st.done })
      if (st.done && !firedRef.current) {
        firedRef.current = true
        // Fire the real capture, then clear the overlay so the ring
        // doesn't sit in the screenshot.
        document.dispatchEvent(new CustomEvent('particle:capture-now'))
        setActive(null)
        return
      }
      if (!st.done) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [active])

  // Escape cancels a pending countdown.
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { firedRef.current = true; setActive(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  if (!active) return null

  const offset = ringDashoffset(snap.progress, RING_C)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'relative', width: 140, height: 140 }}>
        <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={70} cy={70} r={RING_R} fill="none"
            stroke="rgba(255,255,255,0.08)" strokeWidth={4} />
          <circle cx={70} cy={70} r={RING_R} fill="none"
            stroke="url(#timerGrad)" strokeWidth={4} strokeLinecap="round"
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            style={{ transition: reduced ? 'none' : 'stroke-dashoffset 0.12s linear' }} />
          <defs>
            <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'Geist, sans-serif',
          fontSize: 52, fontWeight: 700, color: '#f8f8fc',
          textShadow: '0 0 24px rgba(168,85,247,0.6)',
          fontVariantNumeric: 'tabular-nums',
          animation: reduced ? 'none' : 'count-pop 1s ease-out',
        }} key={snap.secondsLeft}>
          {snap.secondsLeft}
        </div>
      </div>
    </div>
  )
}
