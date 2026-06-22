import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Activity, Sparkles, Palette, Gauge, Camera, X, BarChart3, Code2, Copy, ChevronDown, ChevronUp, Bookmark, BookmarkPlus, Pencil, Play, RotateCcw, Route, Square, Repeat, Download, Upload, Shuffle } from 'lucide-react'
import { presets } from '../presets'
import { generateRandomScene, SCENE_BIASES, SCENE_BIAS_DEFAULT } from '../lib/randomScene'
import { loadCameraViews, saveCameraViews, appendView, moveView, moveViewUp, moveViewDown, removeView, CAMERA_VIEWS_MAX } from '../lib/cameraViews'
import {
  PATH_SECONDS_MIN, PATH_SECONDS_MAX, PATH_SECONDS_DEFAULT,
  PATH_MIN_WAYPOINTS, pathDuration, clampSeconds,
} from '../lib/cameraPath'
import {
  downloadBookmarksFile, parseImport, mergeImport, mergeImportViews,
} from '../lib/bookmarksIO'
import { formatDuration } from '../lib/sessionStats'
import { tokenize } from '../lib/codeTokens'
import { loadKeymap, resolveAction } from '../lib/keymap'
import { validatePresetSource, sourceStats, isModified, lineRangeInSource } from '../lib/presetEditor'
import {
  loadBookmarks, saveBookmarks, appendBookmark, removeBookmark,
  applyScene, captureScene, MAX_BOOKMARKS,
} from '../lib/sceneBookmarks'
import { showToast } from './Toast'

function SectionHeader({ children }) {
  return (
    <div className="section-label-v2" style={{ marginBottom: 12 }}>
      <span className="dot" />
      {children}
    </div>
  )
}

export default function RightSidebar() {
  const { dynamicControls, dynamicValues, setDynamicValue, infoTitle, infoDesc, particleCount, theme, visualStyle } = useStore()
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) { setFps(Math.round((frames * 1000) / (t - last))); frames = 0; last = t }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="sidebar-glow-right" style={{
      position: 'relative',
      width: 260,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'linear-gradient(180deg, rgba(8,8,14,0.72) 0%, rgba(12,12,22,0.68) 100%)',
      backdropFilter: 'blur(28px) saturate(140%)',
      WebkitBackdropFilter: 'blur(28px) saturate(140%)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.02), -1px 0 40px rgba(0,0,0,0.25)',
      height: '100%',
    }}>
      {/* Info Panel */}
      <div style={{ padding: '14px 16px 12px' }}>
        <SectionHeader>Info</SectionHeader>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: '#eeeef0', marginBottom: 4, letterSpacing: '-0.02em' }}>
          {infoTitle || 'No simulation'}
        </h2>
        {infoDesc && (
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#8a8aa0' }}>
            {infoDesc}
          </p>
        )}
      </div>

      {/* v3 iter 04: Live telemetry panel */}
      <div style={{ padding: '2px 16px 16px' }}>
        <SectionHeader>Telemetry</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="metric-row">
            <span className="metric-label"><Gauge size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />FPS</span>
            <span className="metric-value" style={{ color: fps >= 55 ? '#86efac' : fps >= 30 ? '#fbbf24' : '#f87171' }}>{fps}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Activity size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Particles</span>
            <span className="metric-value">{(particleCount / 1000).toFixed(1)}K</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Palette size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Theme</span>
            <span className="metric-value" style={{ textTransform: 'capitalize' }}>{theme}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Sparkles size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Style</span>
            <span className="metric-value" style={{ textTransform: 'capitalize' }}>{visualStyle}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Controls */}
      {dynamicControls.length > 0 && (
        <div style={{ padding: '2px 16px 14px' }}>
          <SectionHeader>Controls</SectionHeader>
          {dynamicControls.map(c => {
            const v = dynamicValues[c.id] ?? c.value
            const pct = ((v - c.min) / (c.max - c.min)) * 100
            return (
              <div key={c.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#9a9ab0', fontWeight: 500 }}>{c.label}</span>
                  <span className="value-chip">{v.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={c.min} max={c.max}
                  step={(c.max - c.min) / 100}
                  value={v}
                  onChange={e => setDynamicValue(c.id, parseFloat(e.target.value))}
                  style={{ width: '100%', '--val': `${pct}%` }}
                />
              </div>
            )
          })}
        </div>
      )}

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Camera Views</SectionHeader>
        <CameraViews />
      </div>

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Scene Bookmarks</SectionHeader>
        <SceneBookmarks />
      </div>

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Session Stats</SectionHeader>
        <SessionStatsPanel />
      </div>

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Preset Source</SectionHeader>
        <CodeViewerPanel />
      </div>

      {/* Keyboard shortcuts hint */}
      <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <SectionHeader>Shortcuts</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5, color: '#8a8aa0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Command palette</span>
            <span style={{ display: 'inline-flex', gap: 3 }}><kbd>⌘</kbd><kbd>K</kbd></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Play / pause</span>
            <kbd>Space</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Random preset</span>
            <kbd>R</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Screenshot</span>
            <kbd>S</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Fullscreen</span>
            <kbd>F</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Save camera view</span>
            <kbd>V</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Save scene bookmark</span>
            <kbd>B</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Restore last bookmark</span>
            <span style={{ display: 'inline-flex', gap: 3 }}><kbd>⇧</kbd><kbd>B</kbd></span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Saved camera views: capture orbit position+target with a name, save
// up to CAMERA_VIEWS_MAX in localStorage, jump back with a click.
// Keyboard `V` quick-saves the current view; works anywhere outside
// inputs/textareas.
function CameraViews() {
  const [views, setViews] = useState(() => loadCameraViews())

  // Listen for external view-list changes (e.g. bookmark-bundle import
  // injecting new views from a combined v2 file). Re-read from storage
  // instead of trusting the event payload so it can't desync.
  useEffect(() => {
    const onChanged = () => setViews(loadCameraViews())
    window.addEventListener('particle:camera-views-changed', onChanged)
    return () => window.removeEventListener('particle:camera-views-changed', onChanged)
  }, [])

  const save = (name) => {
    const api = window.__particleCamera
    if (!api) {
      showToast('Camera not ready yet')
      return
    }
    const state = api.get()
    const next = appendView(views, { name, pos: state.pos, target: state.target })
    setViews(next)
    saveCameraViews(next)
    showToast(`Saved "${name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
  }

  const restore = (v) => {
    const api = window.__particleCamera
    if (!api) return
    api.set({ pos: v.pos, target: v.target })
    showToast(`Restored "${v.name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
  }

  const remove = (id) => {
    const next = removeView(views, id)
    if (next === views) return
    setViews(next)
    saveCameraViews(next)
  }

  // Reorder helpers — push the picked view up or down in the array.
  // The Camera Path Player walks this list in order, so reordering
  // here directly reorders the played path. No-op at boundaries.
  const moveUp = (idx) => {
    const next = moveViewUp(views, idx)
    if (next === views) return
    setViews(next)
    saveCameraViews(next)
  }
  const moveDown = (idx) => {
    const next = moveViewDown(views, idx)
    if (next === views) return
    setViews(next)
    saveCameraViews(next)
  }

  // R17.07 — drag-and-drop reorder. Graduates the chevron-button
  // up/down (R10.03) with a direct drag gesture for users who'd
  // rather just GRAB the row and drop it where they want it. The
  // wire layer stays thin: HTML5 dragstart sets the source index in
  // state, dragover on each row updates the visual hint
  // (`dragOverIdx`) so the user sees where the drop will land, drop
  // calls moveView(views, from, to) (the same R10.03 lib primitive
  // that powers the chevron buttons). Ref-equal-on-no-op skip is
  // preserved through moveView so dropping a row on its current slot
  // doesn't churn state.
  //
  // We keep `draggingIdx` in STATE (not a ref) because each row reads
  // it during render to compute its `isBeingDragged` styling; the
  // react-hooks/refs lint rule disallows reading refs during render.
  // The slight extra re-render on dragstart / dragend is paid back
  // by the dragOverIdx state already triggering renders during the
  // hover (so we're not adding new render passes — just merging the
  // existing dragOverIdx ones with the dragging-source state).
  const [draggingIdx, setDraggingIdx] = useState(null)
  const [dragOverIdx, setDragOverIdx] = useState(null)
  const onDragStart = (idx) => (e) => {
    setDraggingIdx(idx)
    // dataTransfer needs SOMETHING for Firefox to start the drag at
    // all; the value is unused (we read draggingIdx from state in onDrop).
    try { e.dataTransfer.setData('text/plain', String(idx)) } catch { /* */ }
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDragOver = (idx) => (e) => {
    // Calling preventDefault here is what tells the browser that a
    // drop is allowed at this position; without it, no `drop` fires.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIdx !== idx) setDragOverIdx(idx)
  }
  const onDragLeave = (idx) => () => {
    // Clear the highlight only if we're leaving the SAME row that's
    // currently highlighted — sibling enter events fire before this
    // leave, so a naive clear would flicker the indicator off and
    // back on across each row boundary.
    setDragOverIdx(prev => (prev === idx ? null : prev))
  }
  const onDrop = (idx) => (e) => {
    e.preventDefault()
    const from = draggingIdx
    setDraggingIdx(null)
    setDragOverIdx(null)
    if (from === null || from === undefined) return
    const next = moveView(views, from, idx)
    if (next === views) return  // dropped on itself OR out of bounds
    setViews(next)
    saveCameraViews(next)
  }
  const onDragEnd = () => {
    // Cleanup if the drop happened outside any drop target.
    setDraggingIdx(null)
    setDragOverIdx(null)
  }

  // Keyboard quick-save on the active "saveView" binding (default V).
  // Routed through the keymap so the rebinding UI in Settings can
  // change which key triggers it. We re-bind whenever the views list
  // changes so the auto-incremented name reflects current count.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = loadKeymap()
      if (resolveAction(map, e) !== 'saveView') return
      e.preventDefault()
      const api = window.__particleCamera
      if (!api) { showToast('Camera not ready yet'); return }
      const state = api.get()
      const name = `View ${(views[0]?.id || 0) + 1}`
      const next = appendView(views, { name, pos: state.pos, target: state.target })
      setViews(next)
      saveCameraViews(next)
      showToast(`Saved "${name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [views])

  const canSaveMore = views.length < CAMERA_VIEWS_MAX

  return (
    <div>
      <button
        onClick={() => {
          const def = `View ${(views[0]?.id || 0) + 1}`
          const name = window.prompt('Name this camera view:', def) || def
          save(name.slice(0, 24))
        }}
        title={canSaveMore ? 'Press V to quick-save' : `Max ${CAMERA_VIEWS_MAX} views — delete one first`}
        style={{
          width: '100%', padding: '8px 0', marginBottom: 8,
          borderRadius: 8, fontSize: 12, fontWeight: 550, cursor: 'pointer',
          background: canSaveMore
            ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: canSaveMore ? '#e9d5ff' : '#5a5a70',
          border: canSaveMore ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.05)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Camera size={12} strokeWidth={2.2} /> Save current view
        {canSaveMore && <kbd style={{ marginLeft: 4 }}>V</kbd>}
      </button>
      {views.length === 0 ? (
        <div style={{
          padding: '12px 8px', borderRadius: 8, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.05)',
          fontSize: 11, color: '#6a6a80',
        }}>
          No saved views yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {views.map((v, idx) => {
            // R17.07 — visual hint when the row is the active drop
            // target during a drag. Indigo bar tucked on the LEFT
            // edge (border-left), only painted when dragOverIdx
            // matches AND the row isn't the row being dragged (a
            // self-drop is a no-op so the highlight would be misleading).
            const isDropTarget = dragOverIdx === idx && draggingIdx !== idx
            const isBeingDragged = draggingIdx === idx
            return (
            <div key={v.id}
              draggable={views.length > 1}
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDragLeave={onDragLeave(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 9px', borderRadius: 7,
              background: isDropTarget
                ? 'rgba(99,102,241,0.12)'
                : 'rgba(255,255,255,0.025)',
              border: isDropTarget
                ? '1px solid rgba(99,102,241,0.45)'
                : '1px solid rgba(255,255,255,0.05)',
              borderLeft: isDropTarget
                ? '3px solid rgba(168,85,247,0.85)'
                : (isBeingDragged
                  ? '3px solid rgba(168,85,247,0.4)'
                  : '1px solid rgba(255,255,255,0.05)'),
              transition: 'all 0.15s ease-out',
              opacity: isBeingDragged ? 0.55 : 1,
              cursor: views.length > 1 ? 'grab' : 'default',
            }}
              onMouseEnter={e => { if (!isDropTarget && !isBeingDragged) { e.currentTarget.style.background = 'rgba(168,85,247,0.07)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)' } }}
              onMouseLeave={e => { if (!isDropTarget && !isBeingDragged) { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' } }}
            >
              {/* Play order index — also serves as the drop target label when
                  we eventually wire drag-and-drop. Monospace so the column
                  stays aligned even with 10+ views. */}
              <span title={views.length > 1
                ? `Path order ${idx + 1} — drag to reorder, or use the arrows`
                : `Path order ${idx + 1}`}
                style={{
                  width: 16, textAlign: 'center',
                  fontSize: 9.5, fontWeight: 600,
                  color: '#7a7a90', fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  letterSpacing: '0.04em',
                }}>
                {idx + 1}
              </span>
              <button onClick={() => restore(v)}
                title={`pos: [${v.pos.map(n => n.toFixed(1)).join(', ')}]`}
                style={{
                  flex: 1, background: 'none', border: 'none', color: '#d8d8e0',
                  fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
                  padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                <Camera size={11} strokeWidth={2.2} color="#c084fc" />
                {v.name}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a5a70', fontFamily: 'Geist Mono, monospace' }}>
                  {Math.sqrt(v.pos[0]**2 + v.pos[1]**2 + v.pos[2]**2).toFixed(1)}u
                </span>
              </button>
              {/* Reorder controls — only meaningful when there's more than
                  one view (top can't go up; bottom can't go down). Disabled
                  states stay clickable-but-faded so the column doesn't jump. */}
              {views.length > 1 && (
                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    title={idx === 0 ? 'Already at top' : 'Move up in path order'}
                    style={{
                      width: 16, height: 12, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: 3, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: idx === 0 ? '#3a3a4a' : '#9a9ab0',
                      cursor: idx === 0 ? 'default' : 'pointer',
                      opacity: idx === 0 ? 0.45 : 1,
                      padding: 0,
                    }}>
                    <ChevronUp size={9} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => moveDown(idx)}
                    disabled={idx === views.length - 1}
                    title={idx === views.length - 1 ? 'Already at bottom' : 'Move down in path order'}
                    style={{
                      width: 16, height: 12, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: 3, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: idx === views.length - 1 ? '#3a3a4a' : '#9a9ab0',
                      cursor: idx === views.length - 1 ? 'default' : 'pointer',
                      opacity: idx === views.length - 1 ? 0.45 : 1,
                      padding: 0,
                    }}>
                    <ChevronDown size={9} strokeWidth={2.5} />
                  </button>
                </div>
              )}
              <button onClick={() => remove(v.id)} title="Delete"
                style={{
                  width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 5, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.05)', color: '#9a9ab0', cursor: 'pointer',
                }}>
                <X size={9} strokeWidth={2.5} />
              </button>
            </div>
            )
          })}
        </div>
      )}
      {views.length >= PATH_MIN_WAYPOINTS && (
        <CameraPathPanel views={views} />
      )}
    </div>
  )
}

// Camera Path Player — interpolate between the saved views in order
// over `secondsPerSegment` seconds each. Loop toggle keeps it cycling
// indefinitely for kiosk-style installs; off → stops at the last view.
// While playing, OrbitControls is being driven externally so the user
// shouldn't drag the camera; we surface a Stop button that cancels.
function CameraPathPanel({ views }) {
  const [seconds, setSeconds] = useState(PATH_SECONDS_DEFAULT)
  const [loop, setLoop] = useState(false)
  const [playing, setPlaying] = useState(false)

  const start = () => {
    if (views.length < PATH_MIN_WAYPOINTS) return
    // Snapshot the waypoint poses by value so later edits to the
    // views array don't yank the path mid-flight.
    const waypoints = views.map(v => ({
      pos: v.pos.slice(),
      target: v.target.slice(),
      name: v.name,
    }))
    setPlaying(true)
    window.dispatchEvent(new CustomEvent('particle:camera-path-start', {
      detail: {
        waypoints, secondsPerSegment: clampSeconds(seconds), loop,
        onDone: () => setPlaying(false),
      },
    }))
    showToast(`Playing path · ${views.length} views`, <Route size={10} color="#fff" strokeWidth={2.4} />)
  }
  const stop = () => {
    window.dispatchEvent(new Event('particle:camera-path-stop'))
    setPlaying(false)
  }

  // If the views list shrinks below 2 while we're playing, stop on the
  // next microtask so we never call setState directly in the effect body
  // (react-hooks/set-state-in-effect lint rule).
  useEffect(() => {
    if (views.length < PATH_MIN_WAYPOINTS && playing) {
      queueMicrotask(() => {
        window.dispatchEvent(new Event('particle:camera-path-stop'))
        setPlaying(false)
      })
    }
  }, [views.length, playing])

  const totalSec = pathDuration(views, seconds, loop)
  return (
    <div style={{
      marginTop: 10, paddingTop: 10,
      borderTop: '1px solid rgba(255,255,255,0.06)',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11, color: '#9a9ab0', fontWeight: 600, letterSpacing: '0.02em',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Route size={11} strokeWidth={2.2} color="#a78bfa" />
          Path Player
        </span>
        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#7a7a90' }}>
          {loop ? '~loop' : `~${totalSec.toFixed(1)}s`}
        </span>
      </div>
      {/* Seconds-per-segment slider */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#8a8aa0' }}>Per view</span>
          <span style={{ fontSize: 10.5, color: '#c4b5fd', fontFamily: 'Geist Mono, monospace' }}>
            {seconds.toFixed(1)}s
          </span>
        </div>
        <input type="range"
          min={PATH_SECONDS_MIN} max={PATH_SECONDS_MAX} step={0.5}
          value={seconds} onChange={e => setSeconds(parseFloat(e.target.value))}
          disabled={playing}
          style={{
            width: '100%',
            '--val': `${((seconds - PATH_SECONDS_MIN) / (PATH_SECONDS_MAX - PATH_SECONDS_MIN)) * 100}%`,
            opacity: playing ? 0.5 : 1,
          }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6 }}>
        {playing ? (
          <button onClick={stop} title="Stop the path"
            style={{
              padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 550,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(168,85,247,0.14))',
              color: '#fecaca', border: '1px solid rgba(239,68,68,0.35)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Square size={11} strokeWidth={2.4} /> Stop
          </button>
        ) : (
          <button onClick={start} title={`Play through ${views.length} views`}
            style={{
              padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 550,
              cursor: 'pointer',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.18))',
              color: '#e9d5ff', border: '1px solid rgba(168,85,247,0.4)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
            <Play size={11} strokeWidth={2.4} /> Play path
          </button>
        )}
        <button onClick={() => setLoop(v => !v)} title={loop ? 'Loop: on (cycles forever)' : 'Loop: off (stops at last view)'}
          style={{
            width: 30, height: 30,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 7,
            background: loop ? 'rgba(168,85,247,0.22)' : 'rgba(255,255,255,0.03)',
            color: loop ? '#e9d5ff' : '#8a8aa0',
            border: loop ? '1px solid rgba(168,85,247,0.4)' : '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer',
          }}>
          <Repeat size={11} strokeWidth={2.4} />
        </button>
      </div>
      <p style={{ fontSize: 10.5, color: '#6a6a80', margin: 0, lineHeight: 1.5 }}>
        Smooth-eases between every saved view in order. Use the up/down arrows on each view to reorder the path.
      </p>
    </div>
  )
}

// Scene Bookmarks — save the full scene (preset + style + theme +
// palette + FX + force field + audio + camera modulators) to
// localStorage and restore in a click. Camera Views handles camera
// orbit; this handles the *content* the camera is looking at.
// Quick-save: B. Restore most recent: Shift+B. Both respect input
// focus so typing in textareas isn't hijacked.
function SceneBookmarks() {
  const [items, setItems] = useState(() => loadBookmarks())
  const currentPreset = useStore(s => s.currentPreset)
  const infoTitle     = useStore(s => s.infoTitle)
  // Smash & Save bias (R12.04) — pre-selects a range profile so the
  // user can roll within "Mostly Calm" or "Mostly Wild" instead of a
  // pure surprise every time. Persists across sessions so a user who
  // prefers wild scenes doesn't have to re-select between visits.
  const [smashBias, setSmashBias] = useState(() => {
    try {
      const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('smash-bias') : null
      if (stored && SCENE_BIASES.some(b => b.id === stored)) return stored
    } catch { /* ignore */ }
    return SCENE_BIAS_DEFAULT
  })
  const pickBias = (id) => {
    setSmashBias(id)
    try { if (typeof localStorage !== 'undefined') localStorage.setItem('smash-bias', id) }
    catch { /* quota / private mode */ }
  }

  const save = (name) => {
    const scene = captureScene(useStore.getState())
    const next = appendBookmark(items, { name, scene })
    setItems(next)
    saveBookmarks(next)
    showToast(`Saved "${name}"`, <Bookmark size={10} color="#fff" strokeWidth={2.4} />)
  }

  const restore = (b) => {
    const applied = applyScene(b.scene, useStore.getState())
    showToast(`Restored "${b.name}" (${applied.length})`, <Bookmark size={10} color="#fff" strokeWidth={2.4} />)
  }

  const remove = (id) => {
    const next = removeBookmark(items, id)
    setItems(next)
    saveBookmarks(next)
  }

  // Default name builder — prefer the loaded preset's nice title so
  // bookmarks named "Cherry Blossoms" beat "Scene 4".
  const nextDefaultName = () => {
    if (infoTitle) {
      // Append " 2", " 3" if a bookmark with that title already exists.
      const base = infoTitle.slice(0, 28)
      const dupes = items.filter(it => it.name === base || it.name.startsWith(`${base} `)).length
      return dupes > 0 ? `${base} ${dupes + 1}` : base
    }
    return `Scene ${(items[0]?.id || 0) + 1}`
  }

  // Keyboard: bookmark = quick-save, bookmarkPanel = restore most recent.
  // Routed through the keymap so Settings can rebind both.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = loadKeymap()
      const action = resolveAction(map, e)
      if (action === 'bookmark') {
        e.preventDefault()
        save(nextDefaultName())
      } else if (action === 'bookmarkPanel') {
        if (items.length === 0) { showToast('No bookmarks yet'); return }
        e.preventDefault()
        restore(items[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, infoTitle])

  const canSaveMore = items.length < MAX_BOOKMARKS

  // --- Export / Import (R6.04 + R11.03 combined views bundle) ---
  // Export packages bookmarks AND the live saved camera-view list into
  // a single v2 envelope so share-a-show flows are one file instead of
  // two. When the user has zero views saved the file falls back to v1
  // (bookmarks only) for back-compat with anything reading older exports.
  const exportNow = () => {
    if (items.length === 0) {
      showToast('No bookmarks to export')
      return
    }
    const views = loadCameraViews()
    const filename = downloadBookmarksFile(items, undefined, views)
    if (filename) {
      const viewsTag = views.length > 0 ? ` + ${views.length} view${views.length === 1 ? '' : 's'}` : ''
      showToast(`Exported ${items.length} bookmark${items.length === 1 ? '' : 's'}${viewsTag} → ${filename}`, <Download size={10} color="#fff" strokeWidth={2.4} />)
    } else {
      showToast('Export failed — check console')
    }
  }
  const importFromFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const res = parseImport(text)
        if (!res.ok) {
          showToast(`Import failed: ${res.error}`)
          return
        }
        const incomingViews = Array.isArray(res.views) ? res.views : []
        // Ask once: merge vs replace. Plain confirm keeps the UI calm
        // and matches the existing "Clear All" pattern elsewhere.
        // Combined files (v2) get a clearer prompt so the user knows
        // both bookmarks AND camera views are about to be touched.
        const viewsTag = incomingViews.length > 0
          ? ` + ${incomingViews.length} camera view${incomingViews.length === 1 ? '' : 's'}`
          : ''
        const mode = window.confirm(
          `Import ${res.items.length} bookmark${res.items.length === 1 ? '' : 's'}${viewsTag}?\n\n` +
          `OK = Merge into existing list (dupes by name are skipped).\n` +
          `Cancel = Replace the entire list.`
        ) ? 'merge' : 'replace'
        const merge = mergeImport(items, res.items, mode)
        setItems(merge.items)
        saveBookmarks(merge.items)
        // Apply the views half of the bundle the same way.
        let viewSummary = ''
        if (incomingViews.length > 0) {
          const existingViews = loadCameraViews()
          const viewMerge = mergeImportViews(existingViews, incomingViews, mode)
          saveCameraViews(viewMerge.views)
          // Tell other surfaces (CameraViews panel, Minimap) to refresh.
          window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
          viewSummary = mode === 'merge'
            ? `, +${viewMerge.added} view${viewMerge.added === 1 ? '' : 's'}`
            : `, ${viewMerge.added} view${viewMerge.added === 1 ? '' : 's'} (replaced)`
        }
        const summary = (mode === 'merge'
          ? `Imported ${merge.added}, skipped ${merge.skipped}`
          : `Replaced with ${merge.added}`) + viewSummary
        showToast(summary, <Upload size={10} color="#fff" strokeWidth={2.4} />)
      } catch (e) {
        showToast(`Import error: ${e.message || 'unknown'}`)
      }
    }
    input.click()
  }

  return (
    <div>
      <button
        onClick={() => {
          const def = nextDefaultName()
          const name = window.prompt('Name this scene bookmark:', def) || def
          if (!canSaveMore) {
            showToast(`Max ${MAX_BOOKMARKS} bookmarks — delete one first`)
            return
          }
          save(name.slice(0, 32))
        }}
        title={canSaveMore ? 'Press B to quick-save' : `Max ${MAX_BOOKMARKS} bookmarks — delete one first`}
        style={{
          width: '100%', padding: '8px 0', marginBottom: 8,
          borderRadius: 8, fontSize: 12, fontWeight: 550, cursor: 'pointer',
          background: canSaveMore
            ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: canSaveMore ? '#dbeafe' : '#5a5a70',
          border: canSaveMore ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.05)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <BookmarkPlus size={12} strokeWidth={2.2} /> Save current scene
        {canSaveMore && <kbd style={{ marginLeft: 4 }}>B</kbd>}
      </button>
      {/* Smash & Save — roll a fully-randomised scene (preset + style +
          palette + FX + physics + camera shake + bg gradient) AND
          immediately save it as a bookmark, so users can A/B compare
          surprise configurations without losing the previous winner.
          The bias chip rail below pre-selects a range profile so
          "Mostly Calm" produces gentle scenes and "Mostly Wild"
          cranks every dial. Selection persists across sessions. */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${SCENE_BIASES.length}, 1fr)`,
        gap: 4, marginBottom: 6,
      }}>
        {SCENE_BIASES.map(b => {
          const active = smashBias === b.id
          return (
            <button key={b.id}
              onClick={() => pickBias(b.id)}
              title={b.hint}
              style={{
                padding: '5px 0', borderRadius: 6, fontSize: 10, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.12s ease-out',
                background: active
                  ? 'linear-gradient(135deg, rgba(236,72,153,0.22), rgba(245,158,11,0.18))'
                  : 'rgba(255,255,255,0.04)',
                color: active ? '#fde68a' : '#9a9ab0',
                border: active
                  ? '1px solid rgba(236,72,153,0.4)'
                  : '1px solid rgba(255,255,255,0.06)',
                boxShadow: active ? '0 0 10px rgba(236,72,153,0.2)' : 'none',
              }}>
              {b.label}
            </button>
          )
        })}
      </div>
      <button
        onClick={() => {
          if (!canSaveMore) {
            showToast(`Max ${MAX_BOOKMARKS} bookmarks — delete one first`)
            return
          }
          try {
            const presetIds = presets.map(p => p.id)
            const { name, scene } = generateRandomScene(presetIds, { bias: smashBias })
            // Apply first so the user sees the result instantly...
            applyScene(scene, useStore.getState())
            // ...then save it (use the freshly-applied store state so
            // any settings the user had on but the random scene didn't
            // touch are preserved in the bookmark).
            const next = appendBookmark(items, { name, scene })
            setItems(next)
            saveBookmarks(next)
            const biasLabel = SCENE_BIASES.find(b => b.id === smashBias)?.label || ''
            showToast(`Smashed (${biasLabel}) → "${name.replace(/^Smash /, '')}"`, <Shuffle size={10} color="#fff" strokeWidth={2.4} />)
          } catch (e) {
            showToast(`Smash failed: ${e.message || 'unknown'}`)
          }
        }}
        title={canSaveMore ? `Roll a ${SCENE_BIASES.find(b => b.id === smashBias)?.label || 'random'} scene and save it as a bookmark` : `Max ${MAX_BOOKMARKS} bookmarks — delete one first`}
        disabled={!canSaveMore}
        style={{
          width: '100%', padding: '8px 0', marginBottom: 8,
          borderRadius: 8, fontSize: 12, fontWeight: 550,
          cursor: canSaveMore ? 'pointer' : 'not-allowed',
          background: canSaveMore
            ? 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(245,158,11,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: canSaveMore ? '#fde68a' : '#5a5a70',
          border: canSaveMore ? '1px solid rgba(236,72,153,0.32)' : '1px solid rgba(255,255,255,0.05)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          opacity: canSaveMore ? 1 : 0.6,
        }}
      >
        <Shuffle size={12} strokeWidth={2.2} /> Smash &amp; Save
      </button>
      {/* Export / Import buttons — share whole bookmark collections
          as portable JSON files. Import shows a confirm asking
          merge-vs-replace; merge skips dupes by name. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <button onClick={exportNow}
          disabled={items.length === 0}
          title={items.length === 0 ? 'No bookmarks to export' : `Download ${items.length} bookmarks as JSON`}
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: items.length === 0 ? 'not-allowed' : 'pointer',
            background: items.length === 0
              ? 'rgba(255,255,255,0.03)'
              : 'rgba(99,102,241,0.10)',
            color: items.length === 0 ? '#5a5a70' : '#c7d2fe',
            border: items.length === 0
              ? '1px solid rgba(255,255,255,0.05)'
              : '1px solid rgba(99,102,241,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            opacity: items.length === 0 ? 0.55 : 1,
          }}>
          <Download size={11} strokeWidth={2.2} /> Export
        </button>
        <button onClick={importFromFile}
          title="Load bookmarks from a JSON file"
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(168,85,247,0.10)',
            color: '#e9d5ff',
            border: '1px solid rgba(168,85,247,0.25)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
          <Upload size={11} strokeWidth={2.2} /> Import
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{
          padding: '12px 8px', borderRadius: 8, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.05)',
          fontSize: 11, color: '#6a6a80',
        }}>
          No bookmarks yet. Press <kbd>B</kbd> to save a scene.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(b => {
            const isCurrent = b.scene.currentPreset && b.scene.currentPreset === currentPreset
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 9px', borderRadius: 7,
                background: 'rgba(255,255,255,0.025)',
                border: isCurrent
                  ? '1px solid rgba(99,102,241,0.35)'
                  : '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.15s ease-out',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = isCurrent ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)' }}
              >
                <button onClick={() => restore(b)}
                  title={`preset: ${b.scene.currentPreset || 'custom'} · theme: ${b.scene.theme || '-'}`}
                  style={{
                    flex: 1, background: 'none', border: 'none', color: '#d8d8e0',
                    fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
                    padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
                    overflow: 'hidden',
                  }}>
                  <Bookmark size={11} strokeWidth={2.2} color={isCurrent ? '#818cf8' : '#a5b4fc'} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a5a70', fontFamily: 'Geist Mono, monospace' }}>
                    {b.scene.currentPreset?.slice(0, 10) || 'custom'}
                  </span>
                </button>
                <button onClick={() => remove(b.id)} title="Delete bookmark"
                  style={{
                    width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 5, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.05)', color: '#9a9ab0', cursor: 'pointer',
                  }}>
                  <X size={9} strokeWidth={2.5} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Session Stats panel: shows lifetime totals (presets visited, gifs,
// screenshots, total time across all sessions) plus a live ticker for
// the current session. Re-subscribes to sessionStats so other call
// sites (loadPreset, screenshot, gif export) reflect immediately.
function SessionStatsPanel() {
  const stats = useStore(s => s.sessionStats)
  const resetSessionStats = useStore(s => s.resetSessionStats)
  const [now, setNow] = useState(() => Date.now())
  const [sessionStart] = useState(() => Date.now())
  // Tick every 5s so the readout stays current without thrashing
  // re-renders. The Telemetry block already does 1Hz FPS work.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])
  const sessionSec = Math.max(0, (now - sessionStart) / 1000)
  const lifetimeTotal = (stats.lifetimeSeconds || 0) + Math.floor(sessionSec)
  const rows = [
    { label: 'Session', value: formatDuration(sessionSec), accent: '#c084fc' },
    { label: 'Lifetime', value: formatDuration(lifetimeTotal) },
    { label: 'Sessions', value: stats.totalSessions ?? 0 },
    { label: 'Presets loaded', value: stats.presetsLoaded ?? 0 },
    { label: 'Unique presets', value: (stats.uniquePresets?.length ?? 0) },
    { label: 'Screenshots', value: stats.screenshotsTaken ?? 0 },
    { label: 'GIFs exported', value: stats.gifsExported ?? 0 },
    { label: 'Videos exported', value: stats.videosExported ?? 0 },
  ]
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <div key={r.label} className="metric-row">
            <span className="metric-label">
              <BarChart3 size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />{r.label}
            </span>
            <span className="metric-value" style={r.accent ? { color: r.accent } : undefined}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <button onClick={() => {
        if (window.confirm('Reset all session stats? This cannot be undone.')) resetSessionStats()
      }}
        title="Clear lifetime counters"
        style={{
          width: '100%', marginTop: 10, padding: '6px 0', borderRadius: 7,
          fontSize: 11, fontWeight: 500, cursor: 'pointer',
          background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
          border: '1px solid rgba(239,68,68,0.2)',
        }}>
        Reset Stats
      </button>
    </div>
  )
}

// Live preset code viewer (read-only). Shows the source of whatever
// scene is currently rendering with light syntax colouring + line
// numbers. Collapsed by default — opening it reveals the body. Copy
// button stuffs the source onto the clipboard so users can iterate
// in their editor or paste into the AI prompt.
const TOKEN_COLOR = {
  comment: '#7a7a90',
  string:  '#86efac',
  number:  '#fbbf24',
  keyword: '#c084fc',
  builtin: '#f472b6',
  ident:   '#e9e9f0',
  punct:   '#9a9ab0',
  ws:      'inherit',
  text:    '#e9e9f0',
}
function CodeViewerPanel() {
  const source = useStore(s => s.particleFnSource)
  const title  = useStore(s => s.infoTitle)
  const currentPreset = useStore(s => s.currentPreset)
  const loadCustomCode = useStore(s => s.loadCustomCode)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  // Edit mode + draft buffer. We seed the buffer from `source` every
  // time the user enters edit mode so swapping presets while not
  // editing doesn't blow away in-flight changes.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [validation, setValidation] = useState({ ok: true })
  // Ref so the "→ line N" jump button can focus + select the failing
  // line in the textarea. Created here so it's stable across renders.
  const textareaRef = useRef(null)
  const tokens = open && !editing && source ? tokenize(source) : []
  const stats = sourceStats(editing ? draft : source)
  const lineCount = stats.lines
  const sourceBytes = stats.bytes
  const dirty = editing && isModified(source || '', draft)

  const handleCopy = async () => {
    const text = editing ? draft : source
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      showToast('Source copied to clipboard', <Copy size={10} color="#fff" strokeWidth={2.4} />)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: ancient browsers / iframe sandboxing.
      window.prompt('Copy the source:', text)
    }
  }

  const enterEdit = () => {
    setDraft(source || '')
    setValidation({ ok: true })
    setEditing(true)
  }
  const cancelEdit = () => {
    setEditing(false)
    setDraft('')
    setValidation({ ok: true })
  }
  const handleDraftChange = (e) => {
    const next = e.target.value
    setDraft(next)
    // Live-validate; the Compile button stays disabled until clean.
    setValidation(validatePresetSource(next))
  }
  const handleCompile = () => {
    const v = validatePresetSource(draft)
    setValidation(v)
    if (!v.ok) return
    // Swap the live fn through the store's existing path. Title/desc
    // get a small "(edited)" marker so users can tell at a glance.
    const heading = title ? `${title} (edited)` : 'Custom Preset'
    const desc = currentPreset
      ? `Edited from "${currentPreset}".`
      : 'Edited from your own code.'
    loadCustomCode(draft, heading, desc)
    showToast('Preset recompiled', <Play size={10} color="#fff" strokeWidth={2.4} />)
    // Exit edit mode so the user can see the new source rendered.
    setEditing(false)
    setDraft('')
  }
  const handleRevert = () => {
    setDraft(source || '')
    setValidation({ ok: true })
  }

  if (!source && !editing) {
    return (
      <div style={{
        padding: '10px 8px', textAlign: 'center', fontSize: 11,
        color: '#6a6a80', background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 7,
      }}>
        Load a preset to see its source.
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Collapse' : 'Expand'}
        style={{
          width: '100%', padding: '7px 10px',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          borderRadius: 8, fontSize: 11.5, fontWeight: 550, cursor: 'pointer',
          background: open
            ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: open ? '#e9d5ff' : '#c8c8d0',
          border: open ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.05)',
          transition: 'all 0.15s ease-out',
        }}
      >
        <Code2 size={12} strokeWidth={2.2} color={open ? '#c084fc' : '#9a9ab0'} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {open ? 'Hide' : 'Show'} source
        </span>
        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#7a7a90', fontWeight: 500 }}>
          {lineCount} ln · {Math.ceil(sourceBytes / 100) / 10}K
        </span>
        {open ? <ChevronUp size={12} strokeWidth={2.2} /> : <ChevronDown size={12} strokeWidth={2.2} />}
      </button>
      {open && (
        <div style={{
          marginTop: 6, borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(168,85,247,0.18)',
          background: 'linear-gradient(180deg, rgba(8,8,14,0.6), rgba(10,10,18,0.4))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 0 12px rgba(168,85,247,0.08)',
          animation: 'code-expand 0.18s ease-out',
        }}>
          <style>{`@keyframes code-expand { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {/* Header strip: title + edit/compile/copy + preset id */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px 6px 10px', gap: 6,
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 10.5, color: '#c8c8d0', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0,
            }}>
              <span style={{ color: '#c084fc', fontFamily: 'Geist Mono, monospace' }}>{currentPreset || 'custom'}</span>
              {title && <span style={{ color: '#7a7a90' }}>·</span>}
              {title && <span style={{ color: '#9a9ab0', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>}
              {editing && <span style={{ color: '#fcd34d', fontFamily: 'Geist Mono, monospace', fontSize: 9 }}>(editing)</span>}
            </div>
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              {editing ? (
                <>
                  <CodeBtn onClick={handleRevert} disabled={!dirty} title="Revert draft to current source">
                    <RotateCcw size={10} strokeWidth={2.4} /> Revert
                  </CodeBtn>
                  <CodeBtn onClick={cancelEdit} title="Discard edits">
                    <X size={10} strokeWidth={2.4} /> Cancel
                  </CodeBtn>
                  <CodeBtn
                    onClick={handleCompile}
                    primary
                    disabled={!validation.ok || !dirty}
                    title={!validation.ok ? validation.error : dirty ? 'Recompile and apply' : 'No changes'}
                  >
                    <Play size={10} strokeWidth={2.4} /> Compile
                  </CodeBtn>
                </>
              ) : (
                <>
                  <CodeBtn onClick={enterEdit} title="Edit source — recompile to apply">
                    <Pencil size={10} strokeWidth={2.4} /> Edit
                  </CodeBtn>
                  <CodeBtn onClick={handleCopy} primary={copied ? false : true} title="Copy source">
                    <Copy size={10} strokeWidth={2.4} /> {copied ? 'Copied' : 'Copy'}
                  </CodeBtn>
                </>
              )}
            </div>
          </div>

          {/* Inline validation banner */}
          {editing && !validation.ok && (
            <div style={{
              padding: '6px 10px', fontSize: 10.5,
              background: 'rgba(239,68,68,0.10)', color: '#fca5a5',
              borderBottom: '1px solid rgba(239,68,68,0.25)',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8,
            }}>
              <span style={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1, minWidth: 0,
              }}>{validation.error}</span>
              {Number.isFinite(validation.line) && (
                <button
                  onClick={() => {
                    const ta = textareaRef.current
                    if (!ta) return
                    const range = lineRangeInSource(draft, validation.line)
                    if (!range) return
                    ta.focus()
                    ta.setSelectionRange(range.start, range.end)
                    // Scroll the line into view. Rough heuristic: scroll
                    // so the failing line sits in the upper third of the
                    // visible textarea height.
                    const lineHeight = ta.scrollHeight / Math.max(1, draft.split('\n').length)
                    ta.scrollTop = Math.max(0, (validation.line - 1) * lineHeight - ta.clientHeight / 3)
                  }}
                  title={`Jump to line ${validation.line}${validation.column ? `, col ${validation.column}` : ''}`}
                  style={{
                    flexShrink: 0,
                    padding: '2px 7px', borderRadius: 5, fontSize: 10,
                    background: 'rgba(239,68,68,0.18)', color: '#fecaca',
                    border: '1px solid rgba(239,68,68,0.40)',
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    cursor: 'pointer', fontWeight: 600,
                  }}
                >→ line {validation.line}{validation.column ? `:${validation.column}` : ''}</button>
              )}
            </div>
          )}
          {editing && validation.ok && validation.warnings && validation.warnings.length > 0 && (
            <div style={{
              padding: '6px 10px', fontSize: 10.5,
              background: 'rgba(245,158,11,0.08)', color: '#fcd34d',
              borderBottom: '1px solid rgba(245,158,11,0.20)',
            }}>
              {validation.warnings.join(' · ')}
            </div>
          )}

          {/* Body — pre (read-only) or textarea (editing) */}
          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={handleDraftChange}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              style={{
                width: '100%', minHeight: 260, maxHeight: 420,
                padding: '8px 10px',
                margin: 0, border: 'none', outline: 'none',
                background: 'transparent', color: '#e9e9f0',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                fontSize: 10.5, lineHeight: 1.45, tabSize: 2,
                resize: 'vertical',
                caretColor: '#c084fc',
              }}
            />
          ) : (
            <pre style={{
              margin: 0, padding: '8px 10px',
              maxHeight: 240, overflow: 'auto',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              fontSize: 10.5, lineHeight: 1.45,
              color: '#e9e9f0',
              whiteSpace: 'pre',
              tabSize: 2,
            }}>
              <code>
                {tokens.map(([type, text], i) => (
                  <span key={i} style={{ color: TOKEN_COLOR[type] || TOKEN_COLOR.text }}>{text}</span>
                ))}
              </code>
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// Small button used in the code-viewer header. `primary` lights it up
// in the brand gradient; `disabled` greys it out.
function CodeBtn({ onClick, primary, disabled, title, children }) {
  const baseBg = disabled
    ? 'rgba(255,255,255,0.02)'
    : primary
      ? 'linear-gradient(135deg, rgba(168,85,247,0.20), rgba(99,102,241,0.16))'
      : 'rgba(255,255,255,0.04)'
  const fg = disabled
    ? '#5a5a70'
    : primary ? '#e9d5ff' : '#c8c8d0'
  const bd = disabled
    ? '1px solid rgba(255,255,255,0.05)'
    : primary ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.06)'
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '3px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 500,
        background: baseBg, color: fg, border: bd,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s ease-out',
      }}
    >{children}</button>
  )
}
