import { useEffect, useState } from 'react'
import { X, Download, Trash2, Images, ImageOff } from 'lucide-react'
import {
  loadSnapshots, saveSnapshots, removeSnapshot, downloadSnapshot,
} from '../lib/snapshotGallery'
import { showToast } from './Toast'

// Floating gallery strip — anchored to the bottom-center of the canvas.
// Renders thumbnails of every snapshot the user has taken, with hover
// actions to re-download or delete. Closes on ESC or by tapping
// outside; toggled from the TopBar Images button.
export default function SnapshotGallery({ open, onClose }) {
  const [items, setItems] = useState(() => loadSnapshots())

  // Refresh from disk whenever the gallery opens AND when a new
  // snapshot lands (TopBar fires particle:snapshot-saved). This keeps
  // multi-tab cases consistent without an explicit subscribe.
  useEffect(() => {
    if (open) setItems(loadSnapshots())
  }, [open])
  useEffect(() => {
    const onSaved = () => setItems(loadSnapshots())
    window.addEventListener('particle:snapshot-saved', onSaved)
    return () => window.removeEventListener('particle:snapshot-saved', onSaved)
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const handleRemove = (id) => {
    const next = removeSnapshot(items, id)
    setItems(next)
    saveSnapshots(next)
    window.dispatchEvent(new CustomEvent('particle:snapshot-removed', { detail: next.length }))
  }
  const handleRedownload = (entry) => {
    const ok = downloadSnapshot(entry, 'particle')
    if (!ok) showToast('Snapshot data was dropped to fit quota — only thumb left.')
  }
  const handleClearAll = () => {
    if (!window.confirm('Clear all snapshots? This cannot be undone.')) return
    setItems([])
    saveSnapshots([])
    window.dispatchEvent(new CustomEvent('particle:snapshot-removed', { detail: 0 }))
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 56,
        display: 'flex', justifyContent: 'center',
        zIndex: 40, pointerEvents: 'auto',
        animation: 'gallery-rise 0.22s cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      <style>{`@keyframes gallery-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(900px, 92vw)',
          maxHeight: '40vh',
          background: 'linear-gradient(180deg, rgba(14,14,22,0.94) 0%, rgba(10,10,18,0.92) 100%)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 16,
          boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 40px rgba(168,85,247,0.18)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#e9d5ff', fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.005em' }}>
            <Images size={13} strokeWidth={2.2} color="#c084fc" />
            Snapshot Gallery
            <span style={{ color: '#7a7a90', fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500 }}>
              {items.length}{items.length > 0 ? ' / 8' : ''}
            </span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {items.length > 0 && (
              <button onClick={handleClearAll} title="Clear all snapshots"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                  background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
                  border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer',
                }}>
                <Trash2 size={11} strokeWidth={2.2} /> Clear
              </button>
            )}
            <button onClick={onClose} title="Close (ESC)"
              style={{
                width: 22, height: 22, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)', color: '#9a9ab0',
                cursor: 'pointer',
              }}>
              <X size={11} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: 12, overflowX: 'auto', overflowY: 'hidden' }}>
          {items.length === 0 ? (
            <div style={{
              padding: '24px 12px', textAlign: 'center',
              color: '#6a6a80', fontSize: 12,
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              width: '100%',
            }}>
              <ImageOff size={20} strokeWidth={1.8} color="#5a5a70" />
              No snapshots yet. Press <kbd style={kbdStyle}>S</kbd> or click the camera button to capture one.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, paddingBottom: 4 }}>
              {items.map(s => (
                <SnapshotTile key={s.id} entry={s}
                  onDownload={() => handleRedownload(s)}
                  onRemove={() => handleRemove(s.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SnapshotTile({ entry, onDownload, onRemove }) {
  const [hover, setHover] = useState(false)
  const ts = new Date(entry.createdAt || Date.now())
  const timeLabel = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', flexShrink: 0,
        width: 200, height: 130,
        borderRadius: 10, overflow: 'hidden',
        background: '#0a0a10',
        border: hover ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.06)',
        boxShadow: hover ? '0 8px 24px rgba(0,0,0,0.5), 0 0 18px rgba(168,85,247,0.25)' : '0 4px 12px rgba(0,0,0,0.35)',
        transition: 'all 0.18s ease-out',
        cursor: 'default',
      }}
    >
      <img src={entry.thumb} alt={entry.label}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {/* Gradient overlay for readable labels */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, transparent 0%, transparent 55%, rgba(0,0,0,0.65) 100%)',
        pointerEvents: 'none',
      }} />
      {/* Label + timestamp */}
      <div style={{
        position: 'absolute', left: 8, right: 8, bottom: 6,
        color: '#f3e8ff', fontSize: 11, fontWeight: 500,
        display: 'flex', justifyContent: 'space-between',
        textShadow: '0 1px 4px rgba(0,0,0,0.7)',
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>
          {entry.label || 'snapshot'}
        </span>
        <span style={{ color: '#c4b5fd', fontFamily: 'Geist Mono, monospace', fontSize: 10 }}>
          {timeLabel}
        </span>
      </div>
      {/* Hover actions */}
      {hover && (
        <div style={{
          position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4,
          animation: 'tile-fade 0.15s ease-out',
        }}>
          <style>{`@keyframes tile-fade { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
          <button onClick={onDownload} title="Download"
            style={tileBtn('rgba(99,102,241,0.85)')}>
            <Download size={11} strokeWidth={2.4} color="#fff" />
          </button>
          <button onClick={onRemove} title="Delete"
            style={tileBtn('rgba(239,68,68,0.85)')}>
            <Trash2 size={11} strokeWidth={2.4} color="#fff" />
          </button>
        </div>
      )}
      {/* "Thumbs only" badge when full PNG was dropped */}
      {!entry.png && (
        <div style={{
          position: 'absolute', top: 6, left: 6,
          padding: '2px 6px', borderRadius: 4,
          background: 'rgba(251,146,60,0.85)', color: '#fff',
          fontSize: 9, fontWeight: 600, fontFamily: 'Geist Mono, monospace',
        }}>thumb</div>
      )}
    </div>
  )
}

const tileBtn = (bg) => ({
  width: 22, height: 22, borderRadius: 6,
  background: bg, border: '1px solid rgba(255,255,255,0.2)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
})

const kbdStyle = {
  padding: '1px 6px', borderRadius: 4,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  fontSize: 10, color: '#c8c8d0',
  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
  margin: '0 4px',
}
