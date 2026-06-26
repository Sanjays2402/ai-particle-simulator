import { useEffect, useState } from 'react'
import { useStore } from '../store'
import {
  ratioForId, computeFramingBars, describeFraming, labelForId,
} from '../lib/framingGuides'

// Cinematic framing guides overlay. Renders letterbox / pillarbox bars
// that mask the viewport down to the chosen aspect ratio so the user
// can compose a screenshot or recording into a deliberate frame. The
// bars are purely visual (pointer-events:none, behind the chrome) and
// don't affect what the canvas captures.
//
// The active ratio lives in the store (`framingGuideId`, persisted) and
// can be cycled with the bracket keys (R34.B) so a user mid-compose can
// tab through frames without reaching for a menu.
export default function FramingGuides() {
  const framingGuideId = useStore(s => s.framingGuideId)
  const cycleFramingGuide = useStore(s => s.cycleFramingGuide)
  const setFramingGuideId = useStore(s => s.setFramingGuideId)

  // Track the viewport so the bars recompute on resize / orientation
  // change. Initialised from window so the first paint is already
  // correct (no flash of unbarred frame).
  const [vp, setVp] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
  }))

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Bracket-key shortcuts: ']' cycles to the next frame, '[' clears it.
  // Skipped while typing in a field so they don't fight text entry.
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'BracketRight') {
        e.preventDefault()
        cycleFramingGuide()
      } else if (e.code === 'BracketLeft') {
        e.preventDefault()
        setFramingGuideId('off')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleFramingGuide, setFramingGuideId])

  const ratio = ratioForId(framingGuideId)
  if (ratio == null) return null

  const bars = computeFramingBars(vp.w, vp.h, ratio)
  if (bars.mode === 'none') return null

  const label = describeFraming(framingGuideId, vp.w, vp.h)
  const barStyle = {
    position: 'fixed',
    background: 'rgba(0,0,0,0.82)',
    backdropFilter: 'saturate(80%)',
    WebkitBackdropFilter: 'saturate(80%)',
    pointerEvents: 'none',
    zIndex: 5,
  }

  // A 1px hairline along the inner edge of each bar (via inset
  // box-shadow below) marks the exact frame boundary so the user can
  // align subjects to it.

  return (
    <>
      {bars.mode === 'letterbox' ? (
        <>
          <div style={{ ...barStyle, top: 0, left: 0, right: 0, height: bars.bar, boxShadow: `inset 0 -1px 0 rgba(255,255,255,0.16)` }} />
          <div style={{ ...barStyle, bottom: 0, left: 0, right: 0, height: bars.bar, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16)` }} />
        </>
      ) : (
        <>
          <div style={{ ...barStyle, top: 0, bottom: 0, left: 0, width: bars.bar, boxShadow: `inset -1px 0 0 rgba(255,255,255,0.16)` }} />
          <div style={{ ...barStyle, top: 0, bottom: 0, right: 0, width: bars.bar, boxShadow: `inset 1px 0 0 rgba(255,255,255,0.16)` }} />
        </>
      )}

      {/* Frame badge — sits just inside the frame at the bottom-left so
          the user knows exactly which ratio + pixel dims they're
          composing into. */}
      <div style={{
        position: 'fixed',
        left: bars.frameX + 12,
        top: bars.frameY + bars.frameH - 30,
        zIndex: 6,
        pointerEvents: 'none',
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        fontSize: 10.5, fontWeight: 500, letterSpacing: '0.04em',
        color: '#e8e8f0',
        padding: '3px 8px', borderRadius: 6,
        background: 'rgba(10,10,16,0.6)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 5, height: 5, borderRadius: '50%',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          boxShadow: '0 0 6px rgba(168,85,247,0.6)',
        }} />
        {label || labelForId(framingGuideId)}
      </div>
    </>
  )
}
