import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Download, Trash2, Images, ImageOff, LayoutGrid, Rows3, ChevronLeft, ChevronRight, Maximize2, ZoomIn } from 'lucide-react'
import { useStore } from '../store'
import {
  loadSnapshots, saveSnapshots, removeSnapshot, removeSnapshots, downloadSnapshot,
} from '../lib/snapshotGallery'
import { gridLayout, lightboxNav, findSnapshot, formatDimensions } from '../lib/snapshotGrid'
import {
  idleState as zoomIdleState, beginPinch, updatePinch,
  beginPan, updatePan, endGesture, applyDoubleTap,
  toTransform as zoomToTransform, navAllowed as zoomNavAllowed,
  MIN_SCALE as ZOOM_MIN, DOUBLE_TAP_MS,
  applyKeyboardZoomIn, applyKeyboardZoomOut, applyResetZoom,
  applyWheelZoom, classifyZoomKey,
  classifyPanKey, applyKeyboardPan, aggregateHeldPan, scaleDirByHold,
  nextPanAccelCurve,
} from '../lib/pinchZoom'
import { showToast } from './Toast'

// Floating gallery — anchored to the bottom-center of the canvas.
// Two view modes:
//   - 'strip' (default) : horizontal scrolling tiles (the original layout)
//   - 'grid'            : 4-up grid that shows all snapshots at once
// Clicking any tile opens a full-res lightbox with arrow-key navigation
// + the original re-download / delete actions. The view-mode preference
// persists across sessions so power-users keep their preferred layout.
//
// Closes on ESC or by tapping outside; toggled from the TopBar Images button.

const VIEW_KEY = 'particle-snapshot-view-v1'
function loadView() {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'grid' ? 'grid' : 'strip'
  } catch { return 'strip' }
}
function saveView(v) {
  try { localStorage.setItem(VIEW_KEY, v === 'grid' ? 'grid' : 'strip') } catch { /* quota */ }
}

export default function SnapshotGallery({ open, onClose }) {
  const [items, setItems] = useState(() => loadSnapshots())
  const [view, setView] = useState(() => loadView())
  const [lightboxId, setLightboxId] = useState(null)
  // R18.06 — grid-view multi-select state. Long-press a tile to enter
  // selection mode (a bar surfaces above the grid). Once in selection
  // mode, taps toggle selection without opening the lightbox.
  // Selection is purely transient UI — a hard refresh always starts
  // empty. Cleared automatically when the gallery closes or switches
  // back to the strip view (selection is grid-only).
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  // Reconcile selection at render-time against the live items list so
  // an externally-removed snapshot drops out of the bar's counts
  // without a setState-in-effect dance. Same trick used by
  // NamedAttractorsBlock R17.17.
  const validSelectedIds = useMemo(() => {
    if (selectedIds.size === 0) return selectedIds
    const liveIds = new Set(items.map(s => s && s.id))
    let allLive = true
    const next = new Set()
    for (const id of selectedIds) {
      if (liveIds.has(id)) next.add(id)
      else allLive = false
    }
    return allLive ? selectedIds : next
  }, [selectedIds, items])
  const inSelectMode = validSelectedIds.size > 0
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())
  const selectAll = () => setSelectedIds(new Set(items.map(s => s.id)))
  const deleteSelected = () => {
    if (validSelectedIds.size === 0) return
    const count = validSelectedIds.size
    if (!window.confirm(`Delete ${count} selected snapshot${count === 1 ? '' : 's'}? This cannot be undone.`)) return
    const next = removeSnapshots(items, validSelectedIds)
    setItems(next)
    saveSnapshots(next)
    setSelectedIds(new Set())
    if (lightboxId != null && !next.some(s => s.id === lightboxId)) setLightboxId(null)
    window.dispatchEvent(new CustomEvent('particle:snapshot-removed', { detail: next.length }))
  }

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
  // ESC: prefer closing the lightbox first so a single press doesn't
  // accidentally dismiss the entire gallery. Arrow-key nav lives inside
  // the Lightbox so it can gate itself when the user has pinch-zoomed in
  // (we don't want a tap-zoom-and-pan to accidentally swipe to the next
  // image).
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (lightboxId != null) setLightboxId(null)
        else onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, lightboxId])

  if (!open) return null

  const handleRemove = (id) => {
    const next = removeSnapshot(items, id)
    setItems(next)
    saveSnapshots(next)
    // If the deleted one was open in the lightbox, step to the next.
    if (lightboxId === id) {
      const nextId = lightboxNav(next, id, +1)
      setLightboxId(nextId)
    }
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
    setLightboxId(null)
    window.dispatchEvent(new CustomEvent('particle:snapshot-removed', { detail: 0 }))
  }
  const handleSetView = (next) => {
    setView(next)
    saveView(next)
    // R18.06 — clearing selection when switching away from grid keeps
    // the strip view free of any selection-mode UI (selection is
    // grid-only by design — strip is for scanning, not bulk ops).
    if (next !== 'grid') setSelectedIds(new Set())
  }
  // R18.06 — also clear selection when gallery closes so reopen
  // starts fresh (parallels lightbox-id reset on close).
  useEffect(() => {
    if (!open) setSelectedIds(new Set())
  }, [open])

  const layout = gridLayout(items.length)
  const lightboxEntry = lightboxId != null ? findSnapshot(items, lightboxId) : null

  return (
    <>
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
          maxHeight: view === 'grid' ? '70vh' : '40vh',
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
            {/* View toggle: strip vs grid. Only shown when there's
                something to look at — empty state doesn't need it. */}
            {items.length > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 6, overflow: 'hidden',
              }}>
                <button onClick={() => handleSetView('strip')} title="Strip view"
                  style={viewBtn(view === 'strip')}>
                  <Rows3 size={11} strokeWidth={2.2} />
                </button>
                <button onClick={() => handleSetView('grid')} title="Grid view"
                  style={viewBtn(view === 'grid')}>
                  <LayoutGrid size={11} strokeWidth={2.2} />
                </button>
              </div>
            )}
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
        <div style={{
          padding: 12,
          overflowX: view === 'grid' ? 'hidden' : 'auto',
          overflowY: view === 'grid' ? 'auto' : 'hidden',
        }}>
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
          ) : view === 'grid' ? (
            <>
              {/* R18.06 — multi-select bulk-delete bar. Surfaces only
                  in grid view when at least one tile is selected.
                  Long-press a tile to enter selection mode; subsequent
                  taps toggle selection (the tile's `onClick` is gated
                  on `inSelectMode` so a normal tap-to-open-lightbox
                  still works at rest). */}
              {inSelectMode && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 10px', marginBottom: 10, borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.30)',
                }}>
                  <span style={{
                    fontSize: 11.5, fontWeight: 600, color: '#fca5a5',
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    letterSpacing: '0.02em', flex: 1,
                  }}>
                    {validSelectedIds.size} of {items.length} selected
                  </span>
                  {validSelectedIds.size < items.length && (
                    <button onClick={selectAll}
                      title="Add every remaining snapshot to the selection"
                      style={{
                        padding: '4px 9px', borderRadius: 5,
                        fontSize: 10.5, fontWeight: 550,
                        background: 'rgba(255,255,255,0.04)',
                        color: '#c8c8d0',
                        border: '1px solid rgba(255,255,255,0.08)',
                        cursor: 'pointer',
                      }}>Select all</button>
                  )}
                  <button onClick={clearSelection}
                    title="Clear the selection (exit multi-select mode)"
                    style={{
                      padding: '4px 9px', borderRadius: 5,
                      fontSize: 10.5, fontWeight: 550,
                      background: 'rgba(255,255,255,0.04)',
                      color: '#c8c8d0',
                      border: '1px solid rgba(255,255,255,0.08)',
                      cursor: 'pointer',
                    }}>Clear</button>
                  <button onClick={deleteSelected}
                    title={`Delete the ${validSelectedIds.size} selected snapshot${validSelectedIds.size === 1 ? '' : 's'}`}
                    style={{
                      padding: '4px 10px', borderRadius: 5,
                      fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em',
                      background: 'linear-gradient(135deg, rgba(239,68,68,0.30), rgba(168,85,247,0.22))',
                      color: '#fee2e2',
                      border: '1px solid rgba(239,68,68,0.55)',
                      cursor: 'pointer',
                    }}>Delete {validSelectedIds.size}</button>
                </div>
              )}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                gap: 10, paddingBottom: 4,
              }}>
                {items.map(s => (
                  <SnapshotTile key={s.id} entry={s} compact
                    selectable
                    isSelected={validSelectedIds.has(s.id)}
                    inSelectMode={inSelectMode}
                    onLongPress={() => toggleSelect(s.id)}
                    onClick={() => {
                      if (inSelectMode) toggleSelect(s.id)
                      else setLightboxId(s.id)
                    }}
                    onDownload={() => handleRedownload(s)}
                    onRemove={() => handleRemove(s.id)} />
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 10, paddingBottom: 4 }}>
              {items.map(s => (
                <SnapshotTile key={s.id} entry={s}
                  onClick={() => setLightboxId(s.id)}
                  onDownload={() => handleRedownload(s)}
                  onRemove={() => handleRemove(s.id)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    {lightboxEntry && (
      <Lightbox
        entry={lightboxEntry}
        items={items}
        onClose={() => setLightboxId(null)}
        onPrev={() => {
          const id = lightboxNav(items, lightboxId, -1)
          if (id != null) setLightboxId(id)
        }}
        onNext={() => {
          const id = lightboxNav(items, lightboxId, +1)
          if (id != null) setLightboxId(id)
        }}
        onDownload={() => handleRedownload(lightboxEntry)}
        onRemove={() => handleRemove(lightboxEntry.id)}
      />
    )}
    </>
  )
}

function SnapshotTile({ entry, compact, onClick, onDownload, onRemove, selectable, isSelected, inSelectMode, onLongPress }) {
  const [hover, setHover] = useState(false)
  const ts = new Date(entry.createdAt || Date.now())
  const timeLabel = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  // Grid tiles flex to fill their column; strip tiles use a fixed
  // 200×130 footprint so the horizontal scroll stays smooth.
  const sizing = compact
    ? { width: '100%', aspectRatio: '200 / 130' }
    : { width: 200, height: 130 }
  // R18.06 — long-press detection. Wired to native pointer events so
  // the same handler covers mouse + touch + pen. A press that holds
  // for ≥ LONG_PRESS_MS or that moves more than LONG_PRESS_SLOP_PX
  // gets treated as long-press (the move guard lets a scroll/swipe
  // bail out cleanly without triggering selection). After firing,
  // the next pointerup is swallowed so the subsequent synthetic
  // click handler doesn't toggle selection a second time.
  const LONG_PRESS_MS = 450
  const LONG_PRESS_SLOP_PX = 8
  const pressTimerRef = useRef(null)
  const longPressFiredRef = useRef(false)
  const pressStartRef = useRef(null)
  const cancelPress = () => {
    if (pressTimerRef.current != null) {
      clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    pressStartRef.current = null
  }
  const handlePointerDown = (e) => {
    if (!selectable || typeof onLongPress !== 'function') return
    // Right-click / middle-click never count as long-press.
    if (e.button != null && e.button !== 0) return
    longPressFiredRef.current = false
    pressStartRef.current = { x: e.clientX, y: e.clientY }
    pressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true
      pressTimerRef.current = null
      onLongPress()
    }, LONG_PRESS_MS)
  }
  const handlePointerMove = (e) => {
    if (!pressStartRef.current) return
    const dx = e.clientX - pressStartRef.current.x
    const dy = e.clientY - pressStartRef.current.y
    if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) cancelPress()
  }
  const handlePointerUp = () => cancelPress()
  const handlePointerCancel = () => cancelPress()
  // Swallow the synthetic click after a long-press fires, so the
  // gallery's onClick (which would normally toggle selection or
  // open the lightbox) doesn't run twice.
  const handleClick = (e) => {
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onClick?.()
  }
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      title={inSelectMode
        ? (isSelected ? 'Tap to remove from selection' : 'Tap to add to selection')
        : (selectable ? 'Click to view full-size · long-press to multi-select' : 'Click to view full-size')}
      style={{
        position: 'relative', flexShrink: 0,
        ...sizing,
        borderRadius: 10, overflow: 'hidden',
        background: '#0a0a10',
        // R18.06 — red border + glow when selected; lifted-saturation
        // (95% brightness) when in select mode but not selected so the
        // current selection scope is scannable across many tiles.
        border: isSelected
          ? '2px solid rgba(239,68,68,0.85)'
          : (hover ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.06)'),
        boxShadow: isSelected
          ? '0 0 20px rgba(239,68,68,0.45)'
          : (hover ? '0 8px 24px rgba(0,0,0,0.5), 0 0 18px rgba(168,85,247,0.25)' : '0 4px 12px rgba(0,0,0,0.35)'),
        transition: 'all 0.18s ease-out',
        cursor: 'pointer',
        // Prevent native browser long-press text/image action sheet
        // on mobile so the long-press is delivered to our handler
        // before the OS intercepts.
        userSelect: selectable ? 'none' : undefined,
        WebkitUserSelect: selectable ? 'none' : undefined,
        WebkitTouchCallout: selectable ? 'none' : undefined,
        touchAction: 'manipulation',
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
      {hover && !inSelectMode && (
        <div style={{
          position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4,
          animation: 'tile-fade 0.15s ease-out',
        }}>
          <style>{`@keyframes tile-fade { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }`}</style>
          <button onClick={(e) => { e.stopPropagation(); onClick?.() }} title="Open full-size"
            style={tileBtn('rgba(168,85,247,0.85)')}>
            <Maximize2 size={11} strokeWidth={2.4} color="#fff" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDownload() }} title="Download"
            style={tileBtn('rgba(99,102,241,0.85)')}>
            <Download size={11} strokeWidth={2.4} color="#fff" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} title="Delete"
            style={tileBtn('rgba(239,68,68,0.85)')}>
            <Trash2 size={11} strokeWidth={2.4} color="#fff" />
          </button>
        </div>
      )}
      {/* R18.06 — selection checkmark indicator. Always visible in
          select-mode so the user can see which tiles are selected
          without hovering each one. Filled red when selected, empty
          ring when in select-mode but unselected (visual affordance
          to add). pointerEvents: none — the whole tile is the toggle
          target, the badge is purely visual. */}
      {inSelectMode && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 20, height: 20, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: isSelected ? 'rgba(239,68,68,0.90)' : 'rgba(0,0,0,0.55)',
          border: isSelected ? '2px solid rgba(254,202,202,0.95)' : '2px solid rgba(255,255,255,0.55)',
          boxShadow: isSelected ? '0 0 10px rgba(239,68,68,0.55)' : 'none',
          color: '#fee2e2',
          fontSize: 11, fontWeight: 800, lineHeight: 1,
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          pointerEvents: 'none', zIndex: 2,
        }}>{isSelected ? '\u2713' : ''}</div>
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

// Full-screen-ish lightbox showing the original PNG (or thumb fallback)
// at native size. Arrow keys move between snapshots (gated by zoom);
// clicking the backdrop or pressing ESC closes. On touch devices,
// two-finger pinch zooms, single-finger drag pans, double-tap toggles
// between idle and 2x zoom centered on the tap location. Designed to
// feel like Apple Photos: dark vignette, minimal chrome, image
// centered with letterboxing.
function Lightbox({ entry, items, onClose, onPrev, onNext, onDownload, onRemove }) {
  // Memoise the formatted timestamp so the per-render `new Date(...)`
  // isn't classified as an impure-call during render by the react
  // compiler lint pass (matches the rule rest-of-codebase obeys).
  const tsLabel = useMemo(() => {
    const ts = new Date(entry.createdAt || 0)
    return ts.toLocaleString([], {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }, [entry.createdAt])
  const idx = items.findIndex(it => it.id === entry.id)
  const total = items.length
  const hasMore = total > 1
  // R17.20 — persisted pan acceleration curve preset. Lightbox subscribes
  // to the store directly so the chip click immediately re-shapes the
  // active sweep (the hold-keys effect re-reads panCurveRef each tick).
  const panCurve = useStore(s => s.lightboxPanCurve)
  const setPanCurve = useStore(s => s.setLightboxPanCurve)

  // Pinch-zoom state machine. We keep `zoom` in React state so the
  // transform re-renders on each gesture frame, and `zoomRef` mirrors
  // it for non-React touch handlers that fire faster than state can
  // settle (touchmove can run at 120Hz on iOS).
  const stageRef = useRef(null)
  const [zoom, setZoom] = useState(zoomIdleState)
  const zoomRef = useRef(zoom)
  // Sync the ref inside an effect, not during render — refs may not be
  // mutated during render (react-hooks/refs).
  useEffect(() => { zoomRef.current = zoom }, [zoom])
  const lastTapRef = useRef(0)

  // Reset zoom when the displayed snapshot changes (next / prev / open).
  // Routed through a microtask so the setState doesn't run synchronously
  // in the effect body (react-hooks/set-state-in-effect rule).
  useEffect(() => {
    queueMicrotask(() => setZoom(zoomIdleState()))
  }, [entry.id])

  const stageSize = () => {
    const el = stageRef.current
    if (!el) return { w: 0, h: 0 }
    const r = el.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }

  // Touch handlers — feed events into the pure state machine in
  // pinchZoom.js. Single-finger taps double as our pan source when
  // zoomed in, AND as the double-tap detector.
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY }
      setZoom(prev => beginPinch(prev, a, b))
    } else if (e.touches.length === 1) {
      const p = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      // Double-tap detection — within DOUBLE_TAP_MS of the last tap
      // means the user wants to toggle the zoom-in / zoom-out shortcut.
      const now = Date.now()
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        // Convert tap to stage-local coords (subtract stage's top/left).
        const r = stageRef.current?.getBoundingClientRect()
        const local = r ? { x: p.x - r.left, y: p.y - r.top } : null
        const size = stageSize()
        setZoom(prev => applyDoubleTap(prev, local, size.w, size.h))
        lastTapRef.current = 0  // consume tap so triple-tap doesn't refire
        e.preventDefault()
        return
      }
      lastTapRef.current = now
      // When zoomed in, a single-finger drag pans the image.
      if (zoomRef.current.scale > ZOOM_MIN) {
        setZoom(prev => beginPan(prev, p))
      }
    }
  }
  const onTouchMove = (e) => {
    if (e.touches.length === 2) {
      const a = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      const b = { x: e.touches[1].clientX, y: e.touches[1].clientY }
      const size = stageSize()
      setZoom(prev => updatePinch(prev, a, b, size.w, size.h))
      e.preventDefault()
    } else if (e.touches.length === 1 && zoomRef.current.gesture === 'pan') {
      const p = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      const size = stageSize()
      setZoom(prev => updatePan(prev, p, size.w, size.h))
      e.preventDefault()
    }
  }
  const onTouchEnd = (e) => {
    if (e.touches.length === 0) {
      const size = stageSize()
      setZoom(prev => endGesture(prev, size.w, size.h))
    }
  }

  // Keyboard nav lives in the lightbox itself so we can gate it by zoom.
  // R11.15: +/=/- and 0 also drive desktop zoom — mirrors the pinch
  // behaviour for users without a touchscreen.
  // R15.13: WASD pan now AUTO-REPEATS while the key is held. We run
  // our own deterministic ~60ms repeat timer (instead of relying on
  // OS-defined keyboard repeat which varies by platform) so pan speed
  // feels identical on macOS / Windows / Linux. Holding W produces a
  // smooth upward sweep; W + A together produce a diagonal sweep that
  // stays unit-speed (normalised inside aggregateHeldPan).
  const heldKeysRef = useRef(new Set())
  const repeatTimerRef = useRef(0)
  const repeatTimeoutRef = useRef(0)
  // R16.20 — timestamp of when the first pan key in the current
  // chord went down. Used to compute the acceleration multiplier
  // (panAccelMultiplier(now - holdStartTs)). Reset whenever the
  // held set drops to empty so a fresh press starts at 1×.
  const holdStartTsRef = useRef(0)
  // R17.20 — mirror the panCurve into a ref so the hold-keys effect
  // (which only re-runs when onNext/onPrev change) reads the LIVE
  // curve every tick. Updating the ref from inside the effect tick is
  // fine — refs are mutable, and the effect's setInterval closure
  // re-reads .current each call.
  const panCurveRef = useRef(panCurve)
  useEffect(() => { panCurveRef.current = panCurve }, [panCurve])

  useEffect(() => {
    const PAN_REPEAT_MS = 60   // ~16 ticks/second — smooth without overshoot
    const PAN_HOLD_DELAY_MS = 180 // wait this long before repeat kicks in
    // Capture the held-keys Set up-front so the cleanup function
    // refers to a stable local rather than reaching back through
    // heldKeysRef.current (ESLint's react-hooks/exhaustive-deps
    // warns against that pattern because a ref CAN swap mid-lifecycle;
    // ours doesn't, but a local capture keeps the lint output clean).
    const heldKeys = heldKeysRef.current

    // Apply one aggregated step from the currently-held keys.
    // Returns true if a step was actually applied (used by the
    // initial-delay path to suppress the very first repeat if every
    // key lifted during the delay window).
    // R16.20 — scales the aggregated direction by the held-time
    // acceleration multiplier so a long sweep covers ground faster
    // than tap-tap-tap.
    const stepHeldKeys = () => {
      const held = heldKeysRef.current
      if (held.size === 0) return false
      if (!zoomRef.current || zoomRef.current.scale <= ZOOM_MIN) return false
      const dir = aggregateHeldPan(held, classifyPanKey)
      if (!dir) return false
      const elapsedMs = holdStartTsRef.current
        ? Date.now() - holdStartTsRef.current
        : 0
      // R17.20 — pass the live curve preset into the acceleration
      // math so flipping the chip mid-sweep reshapes the rest of the
      // hold in real time.
      const scaledDir = scaleDirByHold(dir, elapsedMs, { curve: panCurveRef.current })
      const el = stageRef.current
      const r = el ? el.getBoundingClientRect() : { width: 0, height: 0 }
      setZoom(prev => applyKeyboardPan(prev, scaledDir, r.width, r.height))
      return true
    }

    const clearRepeat = () => {
      if (repeatTimerRef.current) {
        clearInterval(repeatTimerRef.current)
        repeatTimerRef.current = 0
      }
      if (repeatTimeoutRef.current) {
        clearTimeout(repeatTimeoutRef.current)
        repeatTimeoutRef.current = 0
      }
    }

    const onKey = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        if (!zoomNavAllowed(zoomRef.current)) {
          // Show user we're suppressing nav so they know what's happening.
          // No alert/toast — just preventDefault. Pressing the Reset
          // button (visible when zoomed) or double-tapping clears it.
          return
        }
        e.preventDefault()
        if (e.key === 'ArrowRight') onNext()
        else onPrev()
        return
      }
      // Desktop zoom shortcuts. Ignore when a text input has focus so
      // typing "+" / "-" in a search box (none today, but defensive)
      // doesn't accidentally zoom the image.
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return
      // WASD pan (R12.19 + R15.13 hold-to-repeat) — desktop alternative
      // to drag when zoomed. Checked BEFORE the zoom intent so 'a' / 'd'
      // (which look like unrelated letters) don't accidentally trigger
      // zoom logic. Only intercept the key when actually zoomed in — at
      // idle scale we let WASD fall through to the rest of the app so
      // future shortcuts can claim them. zoomRef.current keeps us in
      // sync with the latest state without re-binding this listener
      // every zoom change.
      const panDir = classifyPanKey(e.key)
      if (panDir) {
        if (zoomRef.current && zoomRef.current.scale > ZOOM_MIN) {
          e.preventDefault()
          // R15.13 — only the initial keydown (NOT browser-fired
          // KeyboardEvent.repeat) drives our state machine. The
          // browser would otherwise double-step every tick because
          // its repeat rate is separate from ours.
          if (!e.repeat) {
            // Apply the first step immediately so a single tap feels
            // identical to R12.19's behaviour — the auto-repeat is a
            // bonus on TOP of the per-press step.
            const el = stageRef.current
            const r = el ? el.getBoundingClientRect() : { width: 0, height: 0 }
            setZoom(prev => applyKeyboardPan(prev, panDir, r.width, r.height))
            // R16.20 — start the hold timer when the chord begins
            // (size === 0 before adding this key). If a second key
            // joins later we DON'T reset the timer — the user's
            // single sustained sweep keeps building speed.
            if (heldKeysRef.current.size === 0) {
              holdStartTsRef.current = Date.now()
            }
            heldKeysRef.current.add(e.key)
            // Schedule the repeat timer once. Subsequent held keys
            // join the existing beat (the stepHeldKeys closure
            // re-reads the held set every tick), so we don't stack
            // intervals.
            if (!repeatTimerRef.current && !repeatTimeoutRef.current) {
              repeatTimeoutRef.current = setTimeout(() => {
                repeatTimeoutRef.current = 0
                // Every pan key may have lifted during the delay
                // window — bail without kicking off a stale loop.
                if (heldKeysRef.current.size === 0) return
                repeatTimerRef.current = setInterval(() => {
                  if (!stepHeldKeys()) {
                    // All keys lifted (or scale dropped back to idle
                    // mid-repeat) — kill the timer.
                    clearInterval(repeatTimerRef.current)
                    repeatTimerRef.current = 0
                  }
                }, PAN_REPEAT_MS)
              }, PAN_HOLD_DELAY_MS)
            }
          }
        }
        // At idle: don't preventDefault, don't return — but also
        // don't fall through to the zoom classifier (none of WASD
        // map to a zoom intent anyway). Safe to early-out.
        return
      }
      const intent = classifyZoomKey(e.key)
      if (!intent) return
      const el = stageRef.current
      const r = el ? el.getBoundingClientRect() : { width: 0, height: 0 }
      e.preventDefault()
      if (intent === 'in')    setZoom(prev => applyKeyboardZoomIn(prev, r.width, r.height))
      else if (intent === 'out') setZoom(prev => applyKeyboardZoomOut(prev, r.width, r.height))
      else if (intent === 'reset') setZoom(applyResetZoom())
    }
    // R15.13 — when a pan key lifts, drop it from the held set. If
    // that was the last held pan key, kill the repeat timer too so
    // we're not burning a 60ms tick forever.
    // R16.20 — also reset the hold-start timestamp so the NEXT press
    // begins at 1× rather than picking up where this hold left off.
    const onKeyUp = (e) => {
      if (!classifyPanKey(e.key)) return
      heldKeysRef.current.delete(e.key)
      if (heldKeysRef.current.size === 0) {
        clearRepeat()
        holdStartTsRef.current = 0
      }
    }
    // R15.13 — also clear on blur so alt-tabbing mid-hold doesn't
    // leave a phantom auto-pan running when the window comes back.
    const onBlur = () => {
      heldKeysRef.current.clear()
      clearRepeat()
      holdStartTsRef.current = 0
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      clearRepeat()
      heldKeys.clear()
    }
  }, [onNext, onPrev])

  // Wheel zoom on the stage — desktop equivalent of pinch. Anchor at
  // the cursor's position (in stage-local coords) so the world point
  // under the mouse stays fixed.
  const onWheel = (e) => {
    const el = stageRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const anchor = { x: e.clientX - r.left, y: e.clientY - r.top }
    setZoom(prev => applyWheelZoom(prev, e.deltaY, anchor, r.width, r.height))
    e.preventDefault()
  }

  const isZoomed = zoom.scale > ZOOM_MIN
  // While zoomed, swallow backdrop-click-to-close so the user can pan
  // freely without dismissing the lightbox. Reset button is the way out.
  const backdropClick = isZoomed ? (e) => e.stopPropagation() : onClose
  const resetZoom = () => setZoom(zoomIdleState())

  return (
    <div
      onClick={backdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(2,2,8,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex', flexDirection: 'column',
        animation: 'lightbox-fade 0.18s ease-out',
      }}
    >
      <style>{`@keyframes lightbox-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
      {/* Header strip */}
      <div onClick={e => e.stopPropagation()} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55), transparent)',
      }}>
        <div style={{ color: '#e9d5ff', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span>{entry.label || 'Snapshot'}</span>
          <span style={{ color: '#7a7a90', fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500 }}>
            {tsLabel}
          </span>
          {entry.w > 0 && entry.h > 0 && (
            <span style={{ color: '#7a7a90', fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500 }}>
              · {formatDimensions(entry.w, entry.h)}
            </span>
          )}
          {hasMore && (
            <span style={{ color: '#9a9ab0', fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 500 }}>
              · {idx + 1} / {total}
            </span>
          )}
          {isZoomed && (
            <span title="Pinch / wheel zoom is active. Use WASD or hjkl to pan (hold for smooth sweep). Double-tap, press 0, or click Reset to zoom out."
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 7px', borderRadius: 5,
                background: 'rgba(168,85,247,0.16)',
                color: '#e9d5ff', border: '1px solid rgba(168,85,247,0.4)',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
              <ZoomIn size={9} strokeWidth={2.4} />
              {zoom.scale.toFixed(1)}x · WASD·hold
            </span>
          )}
        </div>
        <div style={{ display: 'inline-flex', gap: 6 }}>
          {isZoomed && (
            <button
              type="button"
              onClick={() => setPanCurve(nextPanAccelCurve(panCurve))}
              title={panCurve === 'linear'
                ? 'Pan accel curve: LINEAR — even ramp from 1× to 3× over the hold window. Click for EXP (slow start, sprint finish).'
                : panCurve === 'exp'
                  ? 'Pan accel curve: EXP — gentle wake-up, sprint late. Click for LOG (fast start, settle).'
                  : panCurve === 'log'
                    ? 'Pan accel curve: LOG — fast help early, then settle. Click for OFF (no acceleration, holds stay 1×).'
                    : 'Pan accel: OFF — holds stay at 1× forever. Click for LINEAR.'}
              style={{
                padding: '6px 10px', borderRadius: 8,
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: panCurve === 'linear' ? '#d8d8e0'
                  : panCurve === 'exp' ? '#7dd3fc'
                  : panCurve === 'log' ? '#a5f3fc'
                  : '#fcd34d',
                background: panCurve === 'linear' ? 'rgba(255,255,255,0.06)'
                  : panCurve === 'exp' ? 'rgba(56,189,248,0.16)'
                  : panCurve === 'log' ? 'rgba(34,211,238,0.16)'
                  : 'rgba(245,158,11,0.16)',
                border: panCurve === 'linear' ? '1px solid rgba(255,255,255,0.14)'
                  : panCurve === 'exp' ? '1px solid rgba(56,189,248,0.40)'
                  : panCurve === 'log' ? '1px solid rgba(34,211,238,0.40)'
                  : '1px solid rgba(245,158,11,0.40)',
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              <span style={{ opacity: 0.65, fontWeight: 500 }}>accel</span>
              {panCurve === 'linear' ? 'lin' : panCurve}
            </button>
          )}
          {isZoomed && (
            <button onClick={resetZoom} title="Reset zoom (0)"
              style={lightboxBtn('rgba(168,85,247,0.18)', 'rgba(168,85,247,0.4)', '#e9d5ff')}>
              Reset
            </button>
          )}
          <button onClick={onDownload} title="Download"
            style={lightboxBtn('rgba(99,102,241,0.18)', 'rgba(99,102,241,0.4)', '#c7d2fe')}>
            <Download size={13} strokeWidth={2.2} /> Download
          </button>
          <button onClick={onRemove} title="Delete"
            style={lightboxBtn('rgba(239,68,68,0.12)', 'rgba(239,68,68,0.3)', '#fca5a5')}>
            <Trash2 size={13} strokeWidth={2.2} />
          </button>
          <button onClick={onClose} title="Close (ESC)"
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', color: '#cfcfde',
              border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>
      </div>
      {/* Image stage + nav */}
      <div
        ref={stageRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onWheel={onWheel}
        style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 18px 18px',
          overflow: 'hidden',
          // Disable browser-native pinch-zoom + double-tap-to-zoom so
          // our handlers can own them. `pan-y` keeps vertical scroll
          // working in the (rare) case the lightbox doesn't fill the
          // viewport; `pinch-zoom` is intentionally absent.
          touchAction: 'none',
        }}
      >
        {hasMore && !isZoomed && (
          <button onClick={(e) => { e.stopPropagation(); onPrev() }} title="Previous (←)"
            style={navArrow('left')}>
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>
        )}
        <img
          onClick={e => e.stopPropagation()}
          src={entry.png || entry.thumb}
          alt={entry.label || 'snapshot'}
          draggable={false}
          style={{
            maxWidth: '100%', maxHeight: '100%',
            objectFit: 'contain',
            borderRadius: 12,
            boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(168,85,247,0.18)',
            background: '#0a0a10',
            transform: zoomToTransform(zoom),
            // Disable smooth transitions during an active gesture so the
            // image tracks the user's fingers in real time; re-enable on
            // idle so the reset / double-tap snap is animated.
            transition: zoom.gesture === 'idle' ? 'transform 0.18s cubic-bezier(0.2,0.8,0.2,1)' : 'none',
            transformOrigin: 'center center',
            // Prevent the default image-drag ghost so single-finger pan
            // doesn't trigger an awkward grey ghost on desktop browsers.
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitUserDrag: 'none',
          }}
        />
        {hasMore && !isZoomed && (
          <button onClick={(e) => { e.stopPropagation(); onNext() }} title="Next (→)"
            style={navArrow('right')}>
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>
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

const viewBtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 26, height: 22,
  background: active ? 'rgba(168,85,247,0.22)' : 'transparent',
  color: active ? '#e9d5ff' : '#8a8aa0',
  border: 'none', cursor: 'pointer',
})

const lightboxBtn = (bg, border, color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 8,
  background: bg, color, border: `1px solid ${border}`,
  fontSize: 12, fontWeight: 550, cursor: 'pointer',
})

const navArrow = (side) => ({
  position: 'absolute', top: '50%', transform: 'translateY(-50%)',
  [side]: 20,
  width: 44, height: 44, borderRadius: '50%',
  background: 'rgba(20,20,30,0.7)', color: '#e9d5ff',
  border: '1px solid rgba(168,85,247,0.3)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
})

const kbdStyle = {
  padding: '1px 6px', borderRadius: 4,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  fontSize: 10, color: '#c8c8d0',
  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
  margin: '0 4px',
}
