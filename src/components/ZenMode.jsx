import { useEffect, useRef, useState } from 'react'
import { useStore, THEMES } from '../store'
import {
  ZEN_BODY_CLASS, CURSOR_IDLE_MS,
  classifyZenKey, nextZenState, shouldHideCursor, zenOrbitSpeed,
  formatNowPlaying, formatThemeName, formatFramingLabel, formatGridLabel, formatGridDetail, formatCustomFramingLine,
} from '../lib/zenMode'
import { labelForId as framingLabelForId, CUSTOM_FRAMING_ID, formatCustomRatioLabel, gridLabelForId, spiralCornerLabel, isCustomRatioClamped, formatClampedHint } from '../lib/framingGuides'
import { resolveReducedMotion } from '../lib/reducedMotion'
import { resolveCalmFor } from '../lib/calmMode'

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
  // R42.E — zen "Now Playing" card: the live preset name + the theme
  // accent for a small swatch. Re-keyed on the name so a preset change
  // mid-zen replays the card's fade (like a music player's track change).
  const zenNowPlaying = useStore(s => s.zenNowPlaying)
  const infoTitle = useStore(s => s.infoTitle)
  const theme = useStore(s => s.theme)
  // R44.E — the active framing guide (crop), surfaced on the card so a
  // composed recording documents the frame too. Resolve the id → a label:
  // a preset id maps via framingLabelForId; the 'custom' pseudo-id reads
  // the live numeric ratio. formatFramingLabel turns an "Off"/empty frame
  // into '' so the card simply omits the line when no crop is set.
  const framingGuideId = useStore(s => s.framingGuideId)
  const framingCustomRatio = useStore(s => s.framingCustomRatio)
  // R47.E — for a CUSTOM crop, document the exact ratio AND that it's
  // custom: "Custom · 2.35" rather than the bare "2.35" the preset chips
  // also produce. A preset crop keeps its short label ("2.39", "16:9").
  const framingLine = framingGuideId === CUSTOM_FRAMING_ID
    ? formatCustomFramingLine(formatCustomRatioLabel(framingCustomRatio))
    : formatFramingLabel(framingLabelForId(framingGuideId))
  // R48.E — when a custom crop got CLAMPED into the usable band (the user
  // typed something extreme like 12:1), the displayed ratio isn't what was
  // dialled in. Flag it so a recording self-documents that honestly rather
  // than implying the shown aspect was the entry. Only on a live custom crop.
  const framingClamped = framingGuideId === CUSTOM_FRAMING_ID && isCustomRatioClamped(framingCustomRatio)
  // R49.E — the raw typed ratio so a hover on "(clamped)" can explain the
  // pull-back as "typed 12 -> shown 5" instead of just flagging it. Empty
  // when nothing was clamped, so the suffix tooltip falls back to its plain
  // text. Cheap store read; recomputes only when the raw ratio changes.
  const framingCustomRatioRaw = useStore(s => s.framingCustomRatioRaw)
  const framingClampedHint = framingClamped ? formatClampedHint(framingCustomRatioRaw) : ''
  // R45.E — the active composition grid (thirds / cross / golden spiral),
  // surfaced beside the crop so a recording documents the full composition.
  // The grid renders even with no crop (it composes into the full viewport),
  // so it's an independent line; formatGridLabel turns an 'off' grid into ''
  // so the card omits it when no grid is set.
  const framingGridId = useStore(s => s.framingGridId)
  // R46.E — when the active grid is the golden SPIRAL, append which corner
  // its eye converges toward (e.g. "Spiral · Top-left") so the card
  // documents the full composition; other grids have no orientation so the
  // line stays just the grid name. maxLen lifted to fit "Spiral · Bottom-
  // right" without ellipsis.
  const spiralOrientation = useStore(s => s.spiralOrientation)
  const gridLine = framingGridId === 'spiral'
    ? formatGridDetail(gridLabelForId(framingGridId), spiralCornerLabel(spiralOrientation), { maxLen: 26 })
    : formatGridLabel(gridLabelForId(framingGridId))
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
      // reduced-motion setting exists to suppress) AND calm mode isn't
      // gating the zen orbit (R36.K → R38.K per-motion: calm gates it only
      // when the user keeps zenOrbit in the gated set, default yes).
      // zenOrbitSpeed is 0 until the stillness window passes, then eases in.
      const st = useStore.getState()
      const wantOrbit = st.zenAutoOrbit && !resolveCalmFor('zenOrbit', reduced, st.calmMode, st.calmGates)
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

      {/* R42.E — "Now Playing" card: an auto-fading chip in the bottom-
          left with the live preset name + a theme-accent swatch, so a
          screen-recording is self-documenting without the full UI. Keyed
          on the preset name so a preset change mid-zen remounts the card
          and replays its fade (a music-player track-change feel). Under
          reduced motion it stays statically visible (no flash). */}
      {zenNowPlaying && (
        <div
          key={infoTitle}
          style={{
            position: 'fixed', bottom: 16, left: 16, zIndex: 951,
            pointerEvents: 'none',
            display: 'inline-flex', alignItems: 'center', gap: 9,
            padding: '8px 13px', borderRadius: 10,
            background: 'rgba(10,10,16,0.55)',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            boxShadow: '0 10px 32px rgba(0,0,0,0.4)',
            animation: reduced ? 'none' : 'zen-nowplaying-fade 5s ease-out forwards',
            opacity: reduced ? 0.85 : undefined,
            maxWidth: 'min(60vw, 360px)',
          }}
        >
          <span style={{
            width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
            background: (THEMES[theme] && THEMES[theme].neon) || '#a855f7',
            boxShadow: `0 0 9px ${(THEMES[theme] && THEMES[theme].neon) || '#a855f7'}`,
          }} />
          <span style={{
            display: 'inline-flex', flexDirection: 'column', gap: 2,
            overflow: 'hidden',
          }}>
            <span style={{
              fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: '#8a8aa0',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace', lineHeight: 1,
            }}>Now Playing</span>
            <span style={{
              fontSize: 13, fontWeight: 600, color: '#e8e8f0', lineHeight: 1.25,
              letterSpacing: '0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{formatNowPlaying(infoTitle)}</span>
            {/* R43.E — theme (look) line: a tiny second swatch + the active
                theme name beneath the preset (motion), so a recording
                documents both what's moving and how it's coloured. */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 1, overflow: 'hidden',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: (THEMES[theme] && THEMES[theme].neon) || '#a855f7',
                boxShadow: `0 0 5px ${(THEMES[theme] && THEMES[theme].neon) || '#a855f7'}`,
              }} />
              <span style={{
                fontSize: 10.5, fontWeight: 500, color: '#9a9ab0', lineHeight: 1.2,
                letterSpacing: '0.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{formatThemeName(theme)}</span>
            </span>
            {/* R44.E — framing line: when a crop is set, a small monospace
                badge documents the active aspect ratio so a composed
                recording self-describes the frame too (preset + theme +
                crop). Omitted entirely when no frame is active. */}
            {framingLine && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginTop: 3, overflow: 'hidden',
              }}>
                <span aria-hidden="true" style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 11, height: 8, flexShrink: 0, borderRadius: 1.5,
                  border: '1px solid rgba(168,85,247,0.55)',
                  boxShadow: '0 0 4px rgba(168,85,247,0.3)',
                }} />
                <span style={{
                  fontSize: 9.5, fontWeight: 600, color: '#8a8aa0', lineHeight: 1.2,
                  letterSpacing: '0.04em',
                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{framingLine}</span>
                {/* R48.E — faint "(clamped)" suffix when the typed custom ratio
                    was pulled into the usable band, so the recording is honest
                    that the shown aspect isn't the raw entry. */}
                {framingClamped && (
                  <span title={framingClampedHint || undefined} style={{
                    fontSize: 8.5, fontWeight: 600, color: '#b08a3a', lineHeight: 1.2,
                    letterSpacing: '0.04em', flexShrink: 0,
                    cursor: framingClampedHint ? 'help' : 'default',
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  }}>(clamped)</span>
                )}
              </span>
            )}
            {/* R45.E — composition-grid line: when a grid is set (thirds /
                cross / golden spiral), a small monospace badge documents
                it so the recording captures the full composition intent
                (preset + theme + crop + grid). The little glyph is a 2x2
                hatch echoing the rule-of-thirds overlay. Omitted entirely
                when no grid is active. */}
            {gridLine && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginTop: 3, overflow: 'hidden',
              }}>
                <span aria-hidden="true" style={{
                  position: 'relative', width: 10, height: 10, flexShrink: 0,
                  borderRadius: 1.5,
                  border: '1px solid rgba(99,102,241,0.55)',
                  boxShadow: '0 0 4px rgba(99,102,241,0.3)',
                  backgroundImage:
                    'linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px),' +
                    'linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)',
                  backgroundSize: '3.3px 3.3px',
                  backgroundPosition: '1px 1px',
                }} />
                <span style={{
                  fontSize: 9.5, fontWeight: 600, color: '#8a8aa0', lineHeight: 1.2,
                  letterSpacing: '0.04em',
                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{gridLine}</span>
              </span>
            )}
          </span>
        </div>
      )}
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
