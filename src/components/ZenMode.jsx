import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  ZEN_BODY_CLASS, CURSOR_IDLE_MS,
  classifyZenKey, nextZenState, shouldHideCursor, zenOrbitSpeed,
} from '../lib/zenMode'
import { resolveReducedMotion } from '../lib/reducedMotion'

// Zen mode controller — distraction-free, full-bleed particles.
//
// Press Z to fade out every piece of UI chrome (the CSS does the actual
// hiding via the `zen-mode` body class); press Z or Esc to bring it
// back. While in zen mode the cursor auto-hides after a few seconds of
// stillness and returns on any movement, like a video player.
//
// On entry a brief "Zen mode - press Z or Esc to exit" hint plays a
// self-contained CSS fade-in-then-out (no JS timer / setState in an
// effect) so the user learns the exit gesture, then a tiny corner dot
// remains as a persistent marker + click-to-exit affordance.
export default function ZenMode() {
  const [active, setActive] = useState(false)
  // Bumped each time we ENTER zen so the hint element remounts and
  // replays its CSS fade animation. Not a visibility flag — the hint
  // hides itself via animation-fill-mode, so no setState-in-effect.
  const [enterSeq, setEnterSeq] = useState(0)
  const reducedMotionMode = useStore(s => s.reducedMotionMode)
  const osReduced = useStore(s => s.osPrefersReducedMotion)
  const reduced = resolveReducedMotion(reducedMotionMode, osReduced)
  const lastMoveRef = useRef(0)
  const cursorHiddenRef = useRef(false)

  // Toggle key handling. Z toggles, Esc exits. Skipped while typing so
  // the shortcut never fires inside an input/textarea. Also responds to
  // a `particle:toggle-zen` event so the command palette can enter zen.
  // Entering bumps enterSeq (in the same updater) to replay the hint.
  useEffect(() => {
    const applyKind = (kind) => {
      setActive(prev => {
        const next = nextZenState(prev, kind)
        if (next && !prev) setEnterSeq(s => s + 1)
        return next
      })
    }
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const kind = classifyZenKey(e.code)
      if (!kind) return
      if (kind === 'exit' && !active) return
      e.preventDefault()
      applyKind(kind)
    }
    const onToggleEvent = () => applyKind('toggle')
    window.addEventListener('keydown', onKey)
    window.addEventListener('particle:toggle-zen', onToggleEvent)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('particle:toggle-zen', onToggleEvent)
    }
  }, [active])

  // Apply / remove the body class that drives the chrome fade. No
  // setState here — pure external-system sync (the DOM class + cursor).
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const body = document.body
    if (active) {
      body.classList.add(ZEN_BODY_CLASS)
      lastMoveRef.current = performance.now()
      return () => {
        body.classList.remove(ZEN_BODY_CLASS)
        body.style.cursor = ''
        cursorHiddenRef.current = false
      }
    }
    body.classList.remove(ZEN_BODY_CLASS)
    body.style.cursor = ''
    cursorHiddenRef.current = false
    return undefined
  }, [active])

  // Cursor auto-hide loop — only runs while zen is active. Tracks the
  // last pointer movement and hides the cursor once still past the idle
  // window; any movement reveals it again. R35.E: the same loop drives
  // the ambient auto-orbit — it computes the eased orbit speed from the
  // stillness clock and writes it to the store for the camera to read.
  useEffect(() => {
    if (!active) return undefined
    const onMove = () => {
      lastMoveRef.current = performance.now()
      if (cursorHiddenRef.current) {
        cursorHiddenRef.current = false
        document.body.style.cursor = ''
      }
    }
    // A keystroke also counts as interaction so the orbit resets when the
    // user does anything, not just mouse moves.
    const onInteract = () => { lastMoveRef.current = performance.now() }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onMove)
    window.addEventListener('wheel', onInteract, { passive: true })
    window.addEventListener('keydown', onInteract)

    let raf
    const loop = () => {
      const now = performance.now()
      const hide = shouldHideCursor(true, lastMoveRef.current, now, CURSOR_IDLE_MS)
      if (hide && !cursorHiddenRef.current) {
        cursorHiddenRef.current = true
        document.body.style.cursor = 'none'
      }
      // Ambient orbit: only when the preference is on AND motion isn't
      // reduced (a drifting camera is exactly the kind of motion the
      // reduced-motion setting exists to suppress) AND calm mode is off
      // (R36.K — calm mode gates the ambient orbit too). zenOrbitSpeed is
      // 0 until the stillness window passes, then eases in.
      const st = useStore.getState()
      const wantOrbit = st.zenAutoOrbit && !reduced && !st.calmMode
      const speed = wantOrbit ? zenOrbitSpeed(true, true, lastMoveRef.current, now) : 0
      st.setZenAmbientOrbitSpeed(speed)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onMove)
      window.removeEventListener('wheel', onInteract)
      window.removeEventListener('keydown', onInteract)
      cancelAnimationFrame(raf)
      document.body.style.cursor = ''
      // Stop any drift the moment we leave zen.
      useStore.getState().setZenAmbientOrbitSpeed(0)
    }
  }, [active, reduced])

  if (!active) return null

  return (
    <>
      {/* Centred entry hint — a self-contained CSS animation fades it in
          then out (zen-hint-flash) so it doesn't sit in a recording and
          needs no JS timer. Keyed on enterSeq so re-entering replays it.
          Under reduced motion it stays statically visible (no flash). */}
      <div
        key={enterSeq}
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 950, pointerEvents: 'none',
          padding: '12px 22px', borderRadius: 12,
          background: 'rgba(10,10,16,0.55)',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          color: '#e8e8f0', fontSize: 13.5, fontWeight: 500,
          letterSpacing: '0.01em',
          display: 'inline-flex', alignItems: 'center', gap: 10,
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          animation: reduced ? 'none' : 'zen-hint-flash 2.8s ease-out forwards',
          opacity: reduced ? 0.85 : undefined,
        }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          boxShadow: '0 0 10px rgba(168,85,247,0.7)',
        }} />
        Zen mode
        <span style={{ color: '#9a9ab0', fontWeight: 400 }}>
          press <kbd style={kbdStyle}>Z</kbd> or <kbd style={kbdStyle}>Esc</kbd> to exit
        </span>
      </div>

      {/* Persistent tiny corner dot so a user who missed the hint still
          has a visible "you're in zen mode" marker + click-to-exit. */}
      <button
        onClick={() => setActive(false)}
        title="Exit zen mode (Z or Esc)"
        className="zen-exit-dot"
        style={{
          position: 'fixed', bottom: 14, right: 14, zIndex: 951,
          width: 10, height: 10, borderRadius: '50%', padding: 0,
          border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          boxShadow: '0 0 10px rgba(168,85,247,0.6)',
          opacity: 0.5,
        }}
      />
    </>
  )
}

const kbdStyle = {
  padding: '1px 6px', borderRadius: 5,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
  fontSize: 11, color: '#d8d8e0', margin: '0 2px',
}
