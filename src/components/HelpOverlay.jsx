import { useEffect, useState } from 'react'
import { X, Keyboard } from 'lucide-react'

// Single source of truth for keyboard shortcuts shown to the user.
// Order matters: it's the on-screen reading order.
const SHORTCUTS = [
  { group: 'Playback', items: [
    ['Space',       'Play / pause'],
    ['R',           'Random preset'],
    ['\u2190 / \u2192', 'Previous / next preset'],
    ['1\u20139, 0',  'Jump to preset 1\u201310'],
  ] },
  { group: 'View', items: [
    ['F',           'Toggle fullscreen'],
    ['Shift + F',   'Favorite / unfavorite current preset'],
    ['S',           'Screenshot to PNG'],
    ['V',           'Save current camera view'],
  ] },
  { group: 'Tools', items: [
    ['\u2318 K / Ctrl K', 'Open command palette'],
    ['?',           'Toggle this help'],
  ] },
]

export default function HelpOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      // '?' is shift+/ on most layouts; just listen for the character.
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(4,4,8,0.55)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'cp-fade 0.15s ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 540, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto',
          background: 'linear-gradient(180deg, rgba(20,20,30,0.94) 0%, rgba(14,14,22,0.96) 100%)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 16,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(168,85,247,0.2)',
          padding: '20px 22px 18px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
              boxShadow: '0 0 14px rgba(168,85,247,0.4)',
            }}>
              <Keyboard size={14} strokeWidth={2.4} color="#fff" />
            </span>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#eeeef0', letterSpacing: '-0.02em' }}>
              Keyboard shortcuts
            </h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            title="Close (Esc)"
            style={{
              width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)', color: '#9a9ab0', cursor: 'pointer',
            }}
          ><X size={14} /></button>
        </div>

        {SHORTCUTS.map(group => (
          <div key={group.group} style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#8a8aa0', marginBottom: 8,
            }}>
              {group.group}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map(([keys, label]) => (
                <div key={keys} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  fontSize: 12.5, color: '#d8d8e0',
                }}>
                  <span>{label}</span>
                  <span style={{ display: 'inline-flex', gap: 4 }}>
                    {keys.split(' ').map((k, idx) => (
                      <kbd key={idx} style={{
                        padding: '2px 7px', borderRadius: 5,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                        fontSize: 11, color: '#c8c8d0',
                      }}>{k}</kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{
          fontSize: 11, color: '#6a6a80', textAlign: 'center',
          paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          Press <kbd style={{
            padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'Geist Mono, monospace', fontSize: 10,
          }}>?</kbd> to toggle \u00b7 <kbd style={{
            padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'Geist Mono, monospace', fontSize: 10,
          }}>Esc</kbd> to close
        </div>
      </div>
    </div>
  )
}
