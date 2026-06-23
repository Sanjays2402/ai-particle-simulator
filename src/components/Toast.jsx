import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

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
export function showToast(msg, icon, action, badge) {
  listeners.forEach(fn => fn({ id: Date.now() + Math.random(), msg, icon, action, badge }))
}

export default function Toast() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const fn = (t) => {
      setToast(t)
      setTimeout(() => setToast(curr => curr && curr.id === t.id ? null : curr), 2400)
    }
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

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

  return (
    <div className="toast" key={toast.id}>
      <span className="toast-icon">
        {toast.icon || <Sparkles size={10} color="#fff" strokeWidth={2.4} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{toast.msg}</span>
      {/* R24.38 — chain-counter badge. Renders to the LEFT of the
          action chip so the eye-line is: message ... [badge] [ACTION].
          Caller controls the colour via badge.color (defaults to the
          chip's accent indigo) + the tooltip via badge.title. */}
      {toast.badge && typeof toast.badge.text === 'string' && toast.badge.text && (
        <span
          title={toast.badge.title || ''}
          style={{
            marginLeft: 8,
            padding: '2px 6px',
            borderRadius: 4,
            background: toast.badge.color
              ? `${toast.badge.color}22`   // ~13% alpha
              : 'rgba(99,102,241,0.18)',
            color: toast.badge.color || '#c7d2fe',
            border: toast.badge.color
              ? `1px solid ${toast.badge.color}55`
              : '1px solid rgba(99,102,241,0.45)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
            lineHeight: 1.2,
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
