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
export function showToast(msg, icon, action) {
  listeners.forEach(fn => fn({ id: Date.now() + Math.random(), msg, icon, action }))
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
      {toast.action && typeof toast.action.label === 'string' && toast.action.label && (
        <button
          onClick={fireAction}
          style={{
            marginLeft: 10,
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
