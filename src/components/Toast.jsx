import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { fadeDirectionColor } from '../lib/midiPresets'

// Global toast store (simple event-based)
const listeners = new Set()
// R22.30 — `action` is an optional { label, onClick } pair that renders
// as a small chip to the right of the message. Clicking it fires
// onClick + dismisses the toast immediately so the user sees the
// undo happen and the surface clears. Backwards-compatible: all
// existing callers pass (msg, icon) and the chip simply doesn't
// render. Kept as a 3rd positional arg so the call sites can
// gradually opt in without touching the 2-arg ones.
//
// R24.38 — `badge` is an optional 4th arg shaped { text, color?, title? }
// that renders a tiny pip to the LEFT of the action chip. Used by the
// MIDI hotkey UNDO chain (R23.35) to surface a "chain counter" so the
// user can see at a glance how many flips deep they are. Pure visual
// — doesn't affect dismissal or interaction. Backwards-compatible:
// every existing 2-arg / 3-arg caller works untouched.
//
// R27.43 — badge now accepts an optional `fade` object shaped
// `{ baseColor, windowMs }` (string + number). When present the
// Toast component ticks a 50ms timer and re-paints the badge with
// fadeDirectionColor(baseColor, elapsedMs, windowMs) so the user
// gets a peripheral-vision cue that the undo window is expiring.
// When absent (the common case for non-undo-chain toasts), the
// badge keeps its static color exactly as it did pre-R27.43.
export function showToast(msg, icon, action, badge) {
  listeners.forEach(fn => fn({ id: Date.now() + Math.random(), msg, icon, action, badge, mountedAt: Date.now() }))
}

export default function Toast() {
  const [toast, setToast] = useState(null)
  // R27.43 — re-render tick. Bumped every 50ms while a toast with a
  // fade config is alive so the badge colour smoothly walks toward
  // the faded grey endpoint. We re-COMPUTE the colour via the pure
  // fadeDirectionColor helper each render; this state value is just
  // the trigger.
  const [, setFadeTick] = useState(0)

  useEffect(() => {
    const fn = (t) => {
      setToast(t)
      setTimeout(() => setToast(curr => curr && curr.id === t.id ? null : curr), 2400)
    }
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  // R27.43 — Fade-tick interval. Only spins up when a toast with a
  // fade config is mounted; tears down on dismissal (toast===null) or
  // when the fade has reached its faded endpoint (elapsed >= windowMs).
  // Re-evaluating elapsed each tick means we can stop polling once
  // the badge has hit the endpoint — no point waking the renderer
  // every 50ms for an unchanging colour.
  useEffect(() => {
    if (!toast || !toast.badge || !toast.badge.fade) return undefined
    const id = setInterval(() => {
      const elapsed = Date.now() - (toast.mountedAt || Date.now())
      // Stop ticking once we've passed the window (badge will keep
      // its faded value on every subsequent re-render via the same
      // fadeDirectionColor call below).
      if (elapsed >= toast.badge.fade.windowMs) {
        clearInterval(id)
        return
      }
      setFadeTick(t => (t + 1) % 1000000)
    }, 50)
    return () => clearInterval(id)
  }, [toast])

  if (!toast) return null

  // R22.30 — action chip click handler. Wraps the callback in a try
  // so a throwing onClick doesn't leave the toast pinned on screen
  // (the surface still clears either way).
  const fireAction = () => {
    const action = toast.action
    setToast(null)  // immediate dismiss — user-initiated, skip the 2.4s
    if (action && typeof action.onClick === 'function') {
      try { action.onClick() } catch { /* swallow — UI feedback already happened */ }
    }
  }

  // R27.43 — Resolve the badge colour each render. Static color path
  // (no fade config) returns badge.color unchanged. Fade path walks
  // baseColor → HOTKEY_CHAIN_COLOR_FADED over windowMs (capped at
  // endpoint past windowMs).
  //
  // Date.now() is impure but the React Compiler can't statically prove
  // this render is gated by the fade-tick state (which IS the
  // impurity boundary — every fade-tick triggers exactly one
  // re-render). Suppressing is correct here; the worst case if React
  // ever did batch this without the tick would be a stale colour for
  // 50ms, not a crash. Same pattern as MidiPanel's issuedAt.
  //
  // R28.43 — Thread the optional fade.curve through so the slow-then-
  // fast cubic curve reshapes the t→t' progression. Caller (MidiPanel)
  // passes 'easeOutCubic' for the chain-badge fade; absent / undefined
  // curve falls through to fadeDirectionColor's 'linear' default
  // (backwards-compat with R27.43's pinned behaviour).
  let resolvedBadgeColor = toast.badge ? toast.badge.color : undefined
  if (toast.badge && toast.badge.fade) {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    const elapsed = now - (toast.mountedAt || now)
    resolvedBadgeColor = fadeDirectionColor(
      toast.badge.fade.baseColor,
      elapsed,
      toast.badge.fade.windowMs,
      toast.badge.fade.curve,
    )
  }

  return (
    <div className="toast" key={toast.id}>
      <span className="toast-icon">
        {toast.icon || <Sparkles size={10} color="#fff" strokeWidth={2.4} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{toast.msg}</span>
      {/* R24.38 — chain-counter badge. Renders to the LEFT of the
          action chip so the eye-line is: message ... [badge] [ACTION].
          Caller controls the colour via badge.color (defaults to the
          chip's accent indigo) + the tooltip via badge.title.
          R27.43 — colour now fades over time when badge.fade is set
          (cyan/amber → grey as undo window expires). */}
      {toast.badge && typeof toast.badge.text === 'string' && toast.badge.text && (
        <span
          title={toast.badge.title || ''}
          style={{
            marginLeft: 8,
            padding: '2px 6px',
            borderRadius: 4,
            background: resolvedBadgeColor
              ? `${resolvedBadgeColor}22`   // ~13% alpha
              : 'rgba(99,102,241,0.18)',
            color: resolvedBadgeColor || '#c7d2fe',
            border: resolvedBadgeColor
              ? `1px solid ${resolvedBadgeColor}55`
              : '1px solid rgba(99,102,241,0.45)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
            lineHeight: 1.2,
            // R27.43 — smooth colour transition between fade-ticks so
            // the badge breathes rather than flickering every 50ms.
            transition: 'color 0.12s ease-out, background 0.12s ease-out, border-color 0.12s ease-out',
          }}
        >
          {toast.badge.text}
        </span>
      )}
      {toast.action && typeof toast.action.label === 'string' && toast.action.label && (
        <button
          onClick={fireAction}
          style={{
            marginLeft: 8,
            padding: '3px 9px',
            borderRadius: 5,
            background: 'rgba(255,255,255,0.10)',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.20)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
            transition: 'background 0.12s ease-out, border-color 0.12s ease-out',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.18)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.20)'
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  )
}
