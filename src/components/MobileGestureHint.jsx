import { useEffect, useState } from 'react'
import { useIsMobile } from '../lib/useIsMobile'
import {
  shouldShowHint, hasSeenHint, markHintSeen,
  recordGesture, hasDemonstratedAll,
} from '../lib/mobileGestureHint'

// One-shot mobile gesture hint. Renders a small panel that teaches
// the two-finger pinch (size) + horizontal swipe (preset) gestures.
// Shown only on touch viewports (`useIsMobile`) and only the very
// first time per browser profile.
//
// Auto-dismisses when the user demonstrates both gestures — keeps
// the hint short for users who already know the moves but still
// gives a second chance via the explicit "Got it" button. Tap on
// the dimmed backdrop also dismisses, so it never feels trapped.
//
// Pairs with the global 'particle:touch-gesture' event dispatched
// by useTouchGestures so this component is a pure listener; no
// extra touchstart wiring or polling.

export default function MobileGestureHint() {
  const isMobile = useIsMobile()
  const [visible, setVisible] = useState(false)
  const [demoState, setDemoState] = useState({ pinchSeen: false, swipeSeen: false })

  // Decide visibility on mount once the splash has cleared. Same
  // 2-second delay as the desktop Onboarding so the two never overlap.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = shouldShowHint({ isMobile, hasSeen: hasSeenHint() })
      if (v) setVisible(true)
    }, 2200)
    return () => clearTimeout(t)
  }, [isMobile])

  // Listen for actual touch gestures while the hint is open. The
  // event channel is owned by useTouchGestures so this component
  // doesn't have to re-implement touch parsing.
  useEffect(() => {
    if (!visible) return undefined
    const onGesture = (e) => {
      const type = e && e.detail && e.detail.type
      if (!type) return
      setDemoState(prev => recordGesture(prev, type))
    }
    window.addEventListener('particle:touch-gesture', onGesture)
    return () => window.removeEventListener('particle:touch-gesture', onGesture)
  }, [visible])

  // Auto-close once both gestures have been demonstrated. Tiny
  // delay so the user gets the "both lit" satisfaction frame.
  useEffect(() => {
    if (!visible) return undefined
    if (!hasDemonstratedAll(demoState)) return undefined
    const t = setTimeout(() => {
      markHintSeen()
      setVisible(false)
    }, 800)
    return () => clearTimeout(t)
  }, [demoState, visible])

  const dismiss = () => {
    markHintSeen()
    setVisible(false)
  }

  if (!visible) return null

  const { pinchSeen, swipeSeen } = demoState
  const bothDone = pinchSeen && swipeSeen

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        pointerEvents: 'auto',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        padding: '0 16px 24px',
      }}
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: 'linear-gradient(180deg, rgba(20,20,30,0.96) 0%, rgba(14,14,22,0.97) 100%)',
          border: '1px solid rgba(168,85,247,0.30)',
          borderRadius: 16,
          padding: '18px 20px 16px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.55), 0 0 28px rgba(168,85,247,0.18)',
          color: '#eeeef0',
          animation: 'mgh-rise 0.32s cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        <style>{`
          @keyframes mgh-rise { from { opacity: 0; transform: translateY(28px) } to { opacity: 1; transform: translateY(0) } }
          @keyframes mgh-pulse { 0%, 100% { opacity: 0.9 } 50% { opacity: 0.4 } }
        `}</style>

        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: '#a8a8b8', marginBottom: 6,
        }}>
          Touch gestures
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#eeeef0', marginBottom: 12, letterSpacing: '-0.02em' }}>
          Use two fingers to control the scene
        </h3>

        <GestureRow
          glyph={<TwoFingerPinchGlyph />}
          title="Pinch with two fingers"
          subtitle="Drag fingers apart or together to change the particle count."
          done={pinchSeen}
        />
        <GestureRow
          glyph={<TwoFingerSwipeGlyph />}
          title="Swipe horizontally with two fingers"
          subtitle="Swipe left for the next preset, right for the previous."
          done={swipeSeen}
        />

        <button
          onClick={dismiss}
          style={{
            marginTop: 14, width: '100%',
            padding: '10px 0', borderRadius: 10,
            background: bothDone
              ? 'linear-gradient(135deg, #22c55e, #10b981)'
              : 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
            color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, letterSpacing: '-0.005em',
            boxShadow: bothDone
              ? '0 4px 14px rgba(16,185,129,0.35)'
              : '0 4px 14px rgba(168,85,247,0.35)',
          }}
        >
          {bothDone ? 'Nice — got it' : 'Got it'}
        </button>
      </div>
    </div>
  )
}

function GestureRow({ glyph, title, subtitle, done }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 12px',
      marginBottom: 8,
      borderRadius: 12,
      background: done ? 'rgba(34,197,94,0.10)' : 'rgba(255,255,255,0.03)',
      border: done ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.05)',
      transition: 'all 0.25s ease-out',
    }}>
      <div style={{
        flexShrink: 0,
        width: 40, height: 40,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 10,
        background: done ? 'rgba(34,197,94,0.18)' : 'rgba(99,102,241,0.14)',
        color: done ? '#86efac' : '#a5b4fc',
      }}>
        {done ? <CheckGlyph /> : glyph}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#eeeef0', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.45, color: '#a8a8b8' }}>{subtitle}</div>
      </div>
    </div>
  )
}

// Monochrome inline SVGs — match the rest of the app's chrome which
// uses lucide single-color glyphs. No emoji.
function TwoFingerPinchGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="12" r="2.4" />
      <circle cx="17" cy="12" r="2.4" />
      <path d="M9.4 12 H14.6" />
      <path d="M11 9.5 L9 12 L11 14.5" />
      <path d="M13 9.5 L15 12 L13 14.5" />
    </svg>
  )
}

function TwoFingerSwipeGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="9" r="2.2" />
      <circle cx="7" cy="15" r="2.2" />
      <path d="M9.2 9 H18" />
      <path d="M9.2 15 H18" />
      <path d="M16 7 L18 9 L16 11" />
      <path d="M16 13 L18 15 L16 17" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5 L10 17.5 L19 7.5" />
    </svg>
  )
}
