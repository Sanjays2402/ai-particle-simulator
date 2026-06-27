import { useEffect, useState } from 'react'
import { useStore } from '../store'
import {
  ratioForId, computeFramingBars, describeFraming, labelForId,
  computeCompositionGrid, polylineLength,
} from '../lib/framingGuides'
import { useReducedMotion } from '../lib/useReducedMotion'

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
  const framingGridId = useStore(s => s.framingGridId)
  const cycleFramingGrid = useStore(s => s.cycleFramingGrid)
  const spiralOrientation = useStore(s => s.spiralOrientation)
  const reducedMotion = useReducedMotion()

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
  // Backslash '\' cycles the composition grid (off -> thirds -> cross ->
  // both). Skipped while typing so they don't fight text entry.
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
      } else if (e.code === 'Backslash') {
        e.preventDefault()
        cycleFramingGrid()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cycleFramingGuide, setFramingGuideId, cycleFramingGrid])

  // R38.B — one-shot spiral "draw-on" sweep. The spiral polyline reveals
  // itself via a stroke-dash animation that runs ONCE per mount. We key
  // the polyline (and its focal eye) on the orientation so React remounts
  // it — restarting the CSS animation — whenever the eye corner changes;
  // because the polyline only renders in spiral mode, leaving and
  // returning to spiral also remounts it naturally → a fresh sweep. No
  // state / effect / ref needed (keeps this lint-clean + avoids a
  // setState-in-effect cascade). Reduced-motion users get the full curve
  // at once — see spiralLen below, which is 0 under RM so no anim runs.

  const ratio = ratioForId(framingGuideId)
  // The grid can draw even with no ratio active (full-viewport frame) so
  // a user gets rule-of-thirds without committing to a crop.
  const gridActive = framingGridId && framingGridId !== 'off'
  if (ratio == null && !gridActive) return null

  const bars = ratio != null ? computeFramingBars(vp.w, vp.h, ratio) : { mode: 'none', bar: 0, frameW: vp.w, frameH: vp.h, frameX: 0, frameY: 0 }
  const showBars = bars.mode !== 'none'
  // Frame rect the grid composes into: the masked-in region when bars
  // are showing, else the whole viewport. `spiralOrientation` rides on
  // the rect so computeCompositionGrid can place the golden-spiral eye.
  const frameRect = showBars
    ? { frameX: bars.frameX, frameY: bars.frameY, frameW: bars.frameW, frameH: bars.frameH, spiralOrientation }
    : { frameX: 0, frameY: 0, frameW: vp.w, frameH: vp.h, spiralOrientation }
  const grid = gridActive ? computeCompositionGrid(frameRect, framingGridId) : null

  // Nothing to draw (no bars, no grid lines) → render nothing.
  const gridHasLines = grid && (grid.verticals.length > 0 || grid.horizontals.length > 0 || (grid.diagonals && grid.diagonals.length > 0) || (grid.spiral && grid.spiral.length > 0))
  if (!showBars && !gridHasLines) return null

  // R37.B — the golden spiral as an SVG polyline `points` string + its
  // converged "eye" (the last, most-wound point) so we can paint a focal
  // dot there.
  const spiralPts = grid && grid.spiral && grid.spiral.length > 0 ? grid.spiral : null
  const spiralAttr = spiralPts ? spiralPts.map(p => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ') : ''
  const spiralEye = spiralPts ? spiralPts[spiralPts.length - 1] : null
  // R38.B — total path length so the stroke-dash reveal knows how far to
  // draw. Reduced motion (or no points) → 0 disables the sweep and the
  // full spiral paints immediately.
  const spiralLen = spiralPts && !reducedMotion ? polylineLength(spiralPts) : 0
  const spiralSweeping = spiralLen > 0

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
      {showBars && (bars.mode === 'letterbox' ? (
        <>
          <div style={{ ...barStyle, top: 0, left: 0, right: 0, height: bars.bar, boxShadow: `inset 0 -1px 0 rgba(255,255,255,0.16)` }} />
          <div style={{ ...barStyle, bottom: 0, left: 0, right: 0, height: bars.bar, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.16)` }} />
        </>
      ) : (
        <>
          <div style={{ ...barStyle, top: 0, bottom: 0, left: 0, width: bars.bar, boxShadow: `inset -1px 0 0 rgba(255,255,255,0.16)` }} />
          <div style={{ ...barStyle, top: 0, bottom: 0, right: 0, width: bars.bar, boxShadow: `inset 1px 0 0 rgba(255,255,255,0.16)` }} />
        </>
      ))}

      {/* R35.B — composition grid drawn INSIDE the frame: thin lines at
          the rule-of-thirds (or centre cross) plus the four power-point
          dots so a user can line a subject up to a stronger spot than
          dead centre. Full-screen SVG, pointer-events:none, above the
          bars but below the frame badge. */}
      {grid && gridHasLines && (
        <svg
          width={vp.w} height={vp.h}
          style={{ position: 'fixed', inset: 0, zIndex: 6, pointerEvents: 'none' }}
        >
          {grid.verticals.map((x, i) => (
            <line key={`v${i}`} x1={x} y1={frameRect.frameY} x2={x} y2={frameRect.frameY + frameRect.frameH}
              stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          ))}
          {grid.horizontals.map((y, i) => (
            <line key={`h${i}`} x1={frameRect.frameX} y1={y} x2={frameRect.frameX + frameRect.frameW} y2={y}
              stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
          ))}
          {/* R36.B — diagonal-method lines (45deg in from each corner). */}
          {grid.diagonals && grid.diagonals.map((d, i) => (
            <line key={`d${i}`} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}
              stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="4 4" />
          ))}
          {/* R37.B — golden (Fibonacci) spiral: the classical S-curve
              guide. A smooth quarter-arc polyline winding to a focal
              "eye" dot a user can place a subject on for the strongest
              emphasis. The eye corner is set by spiralOrientation.
              R38.B — on enable / orientation change the line "draws
              itself" once via a stroke-dash reveal (key={sweepKey}
              remounts it so the one-shot animation restarts); the eye
              dot fades in as the sweep lands. Reduced motion → spiralLen
              is 0 so the full curve paints instantly with no animation. */}
          {spiralAttr && (
            <polyline
              key={`spiral-${spiralOrientation}`}
              points={spiralAttr} fill="none"
              stroke="rgba(168,85,247,0.55)" strokeWidth={1.4}
              strokeLinejoin="round" strokeLinecap="round"
              style={spiralSweeping ? {
                strokeDasharray: spiralLen,
                strokeDashoffset: spiralLen,
                animation: 'spiral-sweep 0.9s cubic-bezier(0.33,0.1,0.25,1) forwards',
              } : undefined}
            />
          )}
          {spiralEye && (
            <circle
              key={`spiral-eye-${spiralOrientation}`}
              cx={spiralEye.x} cy={spiralEye.y} r={4}
              fill="rgba(236,72,153,0.92)" stroke="rgba(255,255,255,0.6)" strokeWidth={1}
              style={spiralSweeping ? {
                animation: 'spiral-eye-in 0.4s ease-out 0.62s both',
              } : undefined}
            />
          )}
          {grid.points.map((p, i) => (
            <circle key={`p${i}`} cx={p.x} cy={p.y} r={3}
              fill="rgba(168,85,247,0.9)" stroke="rgba(255,255,255,0.5)" strokeWidth={0.75} />
          ))}
        </svg>
      )}

      {/* Frame badge — sits just inside the frame at the bottom-left so
          the user knows exactly which ratio + pixel dims they're
          composing into. Only when a ratio is active. */}
      {showBars && (
        <div style={{
          position: 'fixed',
          left: bars.frameX + 12,
          top: bars.frameY + bars.frameH - 30,
          zIndex: 7,
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
      )}
    </>
  )
}
