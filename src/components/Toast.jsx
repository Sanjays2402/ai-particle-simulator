import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'

// Global toast store (simple event-based)
const listeners = new Set()
export function showToast(msg, icon) {
  listeners.forEach(fn => fn({ id: Date.now() + Math.random(), msg, icon }))
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

  return (
    <div className="toast" key={toast.id}>
      <span className="toast-icon">
        {toast.icon || <Sparkles size={10} color="#fff" strokeWidth={2.4} />}
      </span>
      {toast.msg}
    </div>
  )
}
