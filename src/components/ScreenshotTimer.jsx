import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  countdownState, ringDashoffset,
  burstShotsDue, BURST_INTERVAL_MS, sanitizeBurstCount,
} from '../lib/selfTimer'
import { resolveReducedMotion } from '../lib/reducedMotion'

// Screenshot self-timer overlay. When a timed capture is requested
// (via the `particle:screenshot-timed` event, or a 0-delay falls
// straight through to an immediate fire) this renders a big 3..2..1
// countdown ring centred on screen, then dispatches the actual
// screenshot once the countdown completes.
//
// R35.C — burst mode: once the countdown ends, fire N shots spaced
// BURST_INTERVAL_MS apart (driven by the pure burstShotsDue helper) so
// the user can pick the best particle moment from a quick sequence.
// While the burst runs, the ring shows a small "k / N" shot counter.
//
// The countdown + burst math live in lib/selfTimer (pure, tested); this
// component owns only the rAF loop + the visual ring. The computed
// state is held in React state (updated from the loop, never recomputed
// during render) so the render stays a pure function of state.
const RING_R = 54
const RING_C = 2 * Math.PI * RING_R

export default function ScreenshotTimer() {
  // null = idle. Otherwise { startMs, delay, burst }.
  const [active, setActive] = useState(null)
  // Latest computed countdown snapshot: { secondsLeft, progress, done }.
  const [snap, setSnap] = useState({ secondsLeft: 0, progress: 0, done: false })
  // Burst progress shown on the ring while shots fire: { fired, total }.
  const [burstSnap, setBurstSnap] = useState({ fired: 0, total: 1 })
  const reducedMotionMode = useStore(s => s.reducedMotionMode)
  const osReduced = useStore(s => s.osPrefersReducedMotion)
  const reduced = resolveReducedMotion(reducedMotionMode, osReduced)
  const firedRef = useRef(false)
  // How many burst shots we've already fired (so we only fire the diff).
  const burstFiredRef = useRef(0)
  const burstStartRef = useRef(0)

  // Listen for timed-capture requests. detail.delay (seconds) drives
  // the countdown; detail.burst (count) drives the post-countdown burst.
  // A 0/absent delay fires immediately (a single shot — the burst rides
  // on the countdown overlay so there's a clear staging moment).
  useEffect(() => {
    const onRequest = (e) => {
      const delay = Number(e?.detail?.delay) || 0
      const burst = sanitizeBurstCount(e?.detail?.burst)
      if (delay <= 0) {
        // Instant — just fire the real capture, no overlay.
        document.dispatchEvent(new CustomEvent('particle:capture-now'))
        return
      }
      firedRef.current = false
      burstFiredRef.current = 0
      burstStartRef.current = 0
      const startMs = performance.now()
      setSnap({ secondsLeft: Math.ceil(delay), progress: 0, done: false })
      setBurstSnap({ fired: 0, total: burst })
      setActive({ startMs, delay, burst })
    }
    window.addEventListener('particle:screenshot-timed', onRequest)
    return () => window.removeEventListener('particle:screenshot-timed', onRequest)
  }, [])

  // Drive the countdown, then the burst. Computes state here (where
  // performance.now is allowed) and pushes it into render state. Tears
  // down once the whole burst has fired.
  useEffect(() => {
    if (!active) return undefined
    const total = sanitizeBurstCount(active.burst)
    let raf
    const loop = () => {
      const now = performance.now()
      const st = countdownState(active.startMs, active.delay, now)
      setSnap({ secondsLeft: st.secondsLeft, progress: st.progress, done: st.done })
      if (st.done) {
        // Countdown finished — run the burst. Mark its start once.
        if (!firedRef.current) {
          firedRef.current = true
          burstStartRef.current = now
        }
        const due = burstShotsDue(burstStartRef.current, total, BURST_INTERVAL_MS, now)
        // Fire any shots that have come due since the last frame so a
        // dropped frame catches up instead of skipping a shot. Only push
        // a render when the count actually advanced.
        if (burstFiredRef.current < due) {
          while (burstFiredRef.current < due) {
            burstFiredRef.current += 1
            document.dispatchEvent(new CustomEvent('particle:capture-now'))
          }
          setBurstSnap({ fired: burstFiredRef.current, total })
        }
        if (burstFiredRef.current >= total) {
          // All shots away — clear the overlay so the ring isn't in the
          // last frame.
          setActive(null)
          return
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [active])

  // Escape cancels a pending countdown / aborts a running burst.
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        firedRef.current = true
        burstFiredRef.current = sanitizeBurstCount(active.burst)
        setActive(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  if (!active) return null

  const offset = ringDashoffset(snap.progress, RING_C)
  const total = sanitizeBurstCount(active.burst)
  const bursting = snap.done && total > 1
  // While counting down show the seconds; once bursting show the live
  // shot counter (e.g. "2/3").
  const centerLabel = bursting ? `${Math.min(burstSnap.fired + 1, total)}/${total}` : snap.secondsLeft

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
            strokeDashoffset={bursting ? 0 : offset}
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
          fontSize: bursting ? 34 : 52, fontWeight: 700, color: '#f8f8fc',
          textShadow: '0 0 24px rgba(168,85,247,0.6)',
          fontVariantNumeric: 'tabular-nums',
          animation: reduced ? 'none' : 'count-pop 1s ease-out',
        }} key={`${bursting ? 'b' : 'c'}-${centerLabel}`}>
          {centerLabel}
        </div>
      </div>
    </div>
  )
}
