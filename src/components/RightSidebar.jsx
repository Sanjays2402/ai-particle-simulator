import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Activity, Sparkles, Palette, Gauge, Camera, X, BarChart3, Code2, Copy, ChevronDown, ChevronUp, Bookmark, BookmarkPlus, Pencil, Play, RotateCcw, Route, Square, Repeat, Download, Upload, Shuffle } from 'lucide-react'
import { presets } from '../presets'
import { generateRandomScene, SCENE_BIASES, SCENE_BIAS_DEFAULT,
  // R20.07 — per-chip bias overrides
  loadBiasOverride, saveBiasOverride, hasBiasOverride, resetBiasOverride,
  getSceneBias, sanitizeBiasOverride,
} from '../lib/randomScene'
// R21.23 — bias overrides export/import as portable JSON file
import {
  downloadBiasOverridesFile,
  parseImport as parseBiasOverridesImport,
  mergeImport as mergeBiasOverridesImport,
  exportableBiasIds,
  // R23.33 — multi-file drop combiner (parallels R19.20 midi bundles)
  combineDroppedBiasFiles,
  // R24.36 — preview-panel projector (parallels wind R14.15 / crossfade R14.16)
  buildBiasImportPreviewRows,
} from '../lib/biasOverridesIO'
import {
  loadCameraViews, saveCameraViews, appendView, moveView, moveViewUp, moveViewDown,
  removeView, CAMERA_VIEWS_MAX,
  // R22.12 — touch-drag reorder hit-test (graduates R17.07 desktop-only DnD)
  resolveTouchTargetIdx,
} from '../lib/cameraViews'
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

  // R22.12 — touch-drag reorder. Graduates R17.07's HTML5 native
  // drag-and-drop (desktop-only — touch devices don't fire dragstart
  // on touch). Touch users get a long-press-to-grab-then-drag gesture
  // wired through pointer/touch events:
  //   1. touchstart on a row: arm a 350ms timer + record starting Y.
  //   2. touchmove before the timer fires: if the touch moved more
  //      than LONG_PRESS_SLOP_PX (8) cancel the timer so a scroll
  //      gesture stays a scroll.
  //   3. Timer fires: enter drag mode (set draggingIdx, fire haptic
  //      feedback if available, mark touch as captured so subsequent
  //      moves don't scroll the panel).
  //   4. touchmove after timer fires: use resolveTouchTargetIdx to
  //      hit-test against per-row bounding rects to update dragOverIdx.
  //   5. touchend: run moveView if the drop target differs from the
  //      source idx (re-uses the R17.07 moveView primitive).
  //
  // R23.31 — touch handlers ALSO bind to the up/down chevron buttons
  // so a thumb-targeted long-press on the (16×12px) chevron starts a
  // drag instead of either missing the row entirely or firing the
  // chevron's onClick. Without this, two complaints surface on touch:
  //   - 16×12px is hard to reach with a thumb (the row itself is the
  //     intended drag target).
  //   - When the user DOES land a long-press on the chevron, releasing
  //     fires a synthetic click → the chevron moves the view one step
  //     beyond the user's intent.
  // Fix: a `touchDragHandlers(idx)` factory returns the same five
  // touch handlers spread onto both the row AND the chevron buttons.
  // A `suppressNextClickRef` flag tracks whether drag mode was active
  // when the touch ended; the chevron's onClick checks the flag and
  // bails to avoid the synthetic click.
  //
  // rowRefs holds the live DOM nodes by row idx so the touchmove
  // hit-test can read getBoundingClientRect on every frame without
  // a re-render. Cleared on view-list change so deleted rows aren't
  // hit-tested as ghosts.
  const rowRefs = useRef(new Map())
  const setRowRef = (idx) => (el) => {
    if (el) rowRefs.current.set(idx, el)
    else rowRefs.current.delete(idx)
  }
  // Touch drag state. We keep these in REFS (not state) because
  // touchmove fires at ~60Hz and we don't want to re-render the
  // whole panel on every frame. The visual drag state (`draggingIdx`,
  // `dragOverIdx`) IS in React state so the rows know to highlight,
  // but we only call setState when those values ACTUALLY change.
  const touchStartYRef = useRef(0)
  const touchTimerRef = useRef(0)
  const touchActiveRef = useRef(false)
  // R23.31 — flag set on touchend AFTER drag mode fired, cleared on
  // the next synthetic click. Chevron onClick checks this to suppress
  // the click that would otherwise fire one move beyond the drag.
  const suppressNextClickRef = useRef(false)
  const TOUCH_LONG_PRESS_MS = 350
  const TOUCH_LONG_PRESS_SLOP_PX = 8

  const cancelTouchTimer = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = 0
    }
  }

  const onTouchStart = (idx) => (e) => {
    if (views.length <= 1) return  // nothing to reorder
    // Multi-touch (e.g. pinch-to-zoom) — bail out so we don't fight
    // browser gestures.
    if (e.touches && e.touches.length > 1) {
      cancelTouchTimer()
      return
    }
    const t = e.touches?.[0]
    if (!t) return
    touchStartYRef.current = t.clientY
    touchActiveRef.current = false
    cancelTouchTimer()
    touchTimerRef.current = setTimeout(() => {
      touchTimerRef.current = 0
      touchActiveRef.current = true
      setDraggingIdx(idx)
      // Haptic feedback when entering drag (Android vibration API).
      // Silently skipped on iOS / desktop / browsers that gate it.
      try { navigator.vibrate?.(10) } catch { /* unsupported */ }
    }, TOUCH_LONG_PRESS_MS)
  }

  const onTouchMove = (idx) => (e) => {
    const t = e.touches?.[0]
    if (!t) return
    // Pre-arm phase: cancel the timer if the user scrolled away.
    if (!touchActiveRef.current) {
      const dy = Math.abs(t.clientY - touchStartYRef.current)
      if (dy > TOUCH_LONG_PRESS_SLOP_PX) cancelTouchTimer()
      return
    }
    // Drag-active phase: prevent default to lock the scroll position
    // while the user drags a row, then hit-test the new target idx.
    // Wrapped in try in case the browser refuses passive override.
    try { e.preventDefault() } catch { /* passive listener */ }
    const ranges = []
    for (let i = 0; i < views.length; i++) {
      const el = rowRefs.current.get(i)
      if (!el) { ranges.push(null); continue }
      const r = el.getBoundingClientRect()
      ranges.push({ top: r.top, bottom: r.bottom })
    }
    const target = resolveTouchTargetIdx(t.clientY, ranges)
    if (target !== null && target !== idx /* ignore self */) {
      setDragOverIdx(prev => (prev === target ? prev : target))
    } else if (target === idx) {
      // Over the row being dragged — clear hint so we don't paint
      // a misleading "drop here" indicator on the source row itself.
      setDragOverIdx(prev => (prev === null ? prev : null))
    }
  }

  const onTouchEnd = () => {
    cancelTouchTimer()
    if (!touchActiveRef.current) {
      // Was just a tap that never crossed the long-press threshold.
      // Don't fire any reorder — the underlying restore-button click
      // (if any) handles it.
      return
    }
    touchActiveRef.current = false
    // R23.31 — flag the next synthetic click for suppression so the
    // chevron / row body's onClick handler doesn't run after a drag.
    // Cleared by the click handler itself (one-shot).
    suppressNextClickRef.current = true
    const from = draggingIdx
    const to = dragOverIdx
    setDraggingIdx(null)
    setDragOverIdx(null)
    if (from === null || to === null || from === to) return
    const next = moveView(views, from, to)
    if (next === views) return
    setViews(next)
    saveCameraViews(next)
  }

  const onTouchCancel = () => {
    cancelTouchTimer()
    if (touchActiveRef.current) {
      touchActiveRef.current = false
      setDraggingIdx(null)
      setDragOverIdx(null)
    }
  }

  // R23.31 — touch handler factory. `stopProp` is true when the
  // caller is a CHILD of the row (chevron / restore-button); the
  // chevron/button's onTouchStart will fire AND the row's onTouchStart
  // would also fire by bubbling — both calls re-arm the timer and call
  // cancelTouchTimer twice, which works correctly here (the first call
  // arms, second cancels-then-arms; net effect is one armed timer),
  // but stopPropagation is the cleaner contract: each surface owns its
  // touch lifecycle.
  const touchDragHandlers = (idx, { stopProp = true } = {}) => ({
    onTouchStart: (e) => {
      if (stopProp) e.stopPropagation()
      onTouchStart(idx)(e)
    },
    onTouchMove: (e) => {
      if (stopProp) e.stopPropagation()
      onTouchMove(idx)(e)
    },
    onTouchEnd: (e) => {
      if (stopProp) e.stopPropagation()
      onTouchEnd(e)
    },
    onTouchCancel: (e) => {
      if (stopProp) e.stopPropagation()
      onTouchCancel(e)
    },
  })

  // R23.31 — chevron click guard. Suppresses the synthetic click that
  // fires on touchend AFTER a successful long-press drag (browsers
  // emit a click on tap-release even if preventDefault ran on
  // earlier touch events; this guard is the click-side counterpart).
  // One-shot: clears the flag on first inspection. Returns true when
  // the click should proceed, false when it should be swallowed.
  const consumeClickIfSuppressed = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return false
    }
    return true
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
              ref={setRowRef(idx)}
              draggable={views.length > 1}
              onDragStart={onDragStart(idx)}
              onDragOver={onDragOver(idx)}
              onDragLeave={onDragLeave(idx)}
              onDrop={onDrop(idx)}
              onDragEnd={onDragEnd}
              onTouchStart={onTouchStart(idx)}
              onTouchMove={onTouchMove(idx)}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchCancel}
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
              // R22.12 — let the touchmove handler decide when to
              // preventDefault. `manipulation` removes the 300ms tap
              // delay on mobile without disabling pan/scroll.
              touchAction: 'manipulation',
              WebkitUserSelect: isBeingDragged ? 'none' : undefined,
            }}
              onMouseEnter={e => { if (!isDropTarget && !isBeingDragged) { e.currentTarget.style.background = 'rgba(168,85,247,0.07)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)' } }}
              onMouseLeave={e => { if (!isDropTarget && !isBeingDragged) { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' } }}
            >
              {/* Play order index — also serves as a drag-handle on
                  touch (R24.39). Desktop users grab anywhere on the
                  row to drag; touch users have a few overlapping
                  affordances: the row body (R22.12), the chevrons
                  (R23.31), and now the #N badge itself (R24.39 — the
                  badge already wears `cursor: grab` styling so users
                  reach for it expecting drag, and parallels the
                  R18.19 named-attractor #N badge drag handle).
                  Monospace so the column stays aligned even with 10+
                  views.
                  R22.12 — tooltip mentions touch long-press alongside
                  desktop drag/arrows.
                  R24.39 — when views.length > 1 we attach
                  touchDragHandlers AND a grab cursor so the badge
                  reads as the affordance it now is. */}
              <span title={views.length > 1
                ? `Path order ${idx + 1} \u2014 drag to reorder (long-press to drag on touch), or use the arrows`
                : `Path order ${idx + 1}`}
                {...(views.length > 1 ? touchDragHandlers(idx) : {})}
                style={{
                  width: 16, textAlign: 'center',
                  fontSize: 9.5, fontWeight: 600,
                  color: '#7a7a90', fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  letterSpacing: '0.04em',
                  // R24.39 — grab cursor mirrors the R18.19 named-
                  // attractor #N badge drag affordance. Only when
                  // there's more than one view (single-view list has
                  // nothing to reorder).
                  cursor: views.length > 1 ? 'grab' : 'default',
                  // R24.39 — manipulation removes the 300ms tap delay
                  // on iOS without disabling pan/scroll; matches the
                  // chevron + row body settings so the badge behaves
                  // consistently with the rest of the touch surface.
                  touchAction: views.length > 1 ? 'manipulation' : 'auto',
                  // R24.39 — prevent native iOS callout / selection on
                  // long-press so the badge becomes a clean drag
                  // handle. Parallels R23.31 chevron settings.
                  userSelect: views.length > 1 ? 'none' : 'auto',
                  WebkitUserSelect: views.length > 1 ? 'none' : 'auto',
                  WebkitTouchCallout: views.length > 1 ? 'none' : undefined,
                  // Slightly more visible when the row has reorder
                  // capability so the affordance reads as interactive
                  // (without going so far that it dominates the row).
                  opacity: views.length > 1 ? 0.85 : 1,
                  // Compact display tweak — display:inline-flex so
                  // the touch hit-box matches the visible 16px wide
                  // box rather than the line's natural baseline.
                  display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  // Slight padding extends the touch target without
                  // changing the visual width (background is
                  // transparent so the padding is invisible).
                  padding: views.length > 1 ? '2px 0' : 0,
                }}>
                {idx + 1}
              </span>
              <button onClick={() => {
                if (!consumeClickIfSuppressed()) return
                restore(v)
              }}
                title={`pos: [${v.pos.map(n => n.toFixed(1)).join(', ')}]`}
                {...touchDragHandlers(idx)}
                style={{
                  flex: 1, background: 'none', border: 'none', color: '#d8d8e0',
                  fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
                  padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
                  // R23.31 — manipulation removes 300ms tap delay without
                  // disabling pan/scroll. Matches the row-level setting.
                  touchAction: 'manipulation',
                }}>
                <Camera size={11} strokeWidth={2.2} color="#c084fc" />
                {v.name}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a5a70', fontFamily: 'Geist Mono, monospace' }}>
                  {Math.sqrt(v.pos[0]**2 + v.pos[1]**2 + v.pos[2]**2).toFixed(1)}u
                </span>
              </button>
              {/* Reorder controls — only meaningful when there's more than
                  one view (top can't go up; bottom can't go down). Disabled
                  states stay clickable-but-faded so the column doesn't jump.
                  R23.31 — chevrons also wear touchDragHandlers so a thumb
                  long-press on a chevron starts a drag (parallels the row
                  body); short-press still triggers their onClick. The
                  consumeClickIfSuppressed guard ensures a drag's
                  synthetic-click doesn't accidentally fire moveUp/moveDown. */}
              {views.length > 1 && (
                <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                  <button onClick={() => {
                    if (!consumeClickIfSuppressed()) return
                    moveUp(idx)
                  }}
                    disabled={idx === 0}
                    title={idx === 0 ? 'Already at top' : 'Move up in path order (long-press to drag on touch)'}
                    {...touchDragHandlers(idx)}
                    style={{
                      width: 16, height: 12, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: 3, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: idx === 0 ? '#3a3a4a' : '#9a9ab0',
                      cursor: idx === 0 ? 'default' : 'pointer',
                      opacity: idx === 0 ? 0.45 : 1,
                      padding: 0,
                      touchAction: 'manipulation',
                    }}>
                    <ChevronUp size={9} strokeWidth={2.5} />
                  </button>
                  <button onClick={() => {
                    if (!consumeClickIfSuppressed()) return
                    moveDown(idx)
                  }}
                    disabled={idx === views.length - 1}
                    title={idx === views.length - 1 ? 'Already at bottom' : 'Move down in path order (long-press to drag on touch)'}
                    {...touchDragHandlers(idx)}
                    style={{
                      width: 16, height: 12, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center',
                      borderRadius: 3, background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: idx === views.length - 1 ? '#3a3a4a' : '#9a9ab0',
                      cursor: idx === views.length - 1 ? 'default' : 'pointer',
                      opacity: idx === views.length - 1 ? 0.45 : 1,
                      padding: 0,
                      touchAction: 'manipulation',
                    }}>
                    <ChevronDown size={9} strokeWidth={2.5} />
                  </button>
                </div>
              )}
              <button onClick={() => {
                if (!consumeClickIfSuppressed()) return
                remove(v.id)
              }} title="Delete"
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
  // R20.07 — per-chip bias override editor. `editingBias` holds the
  // chip id currently being edited (or null when the editor is closed).
  // `draftJSON` is the textarea content; commit-on-Apply runs through
  // sanitizeBiasOverride so corrupt input never corrupts state.
  // `overrideError` shows JSON parse / schema failures inline so the
  // user knows why Apply didn't land. `overrideTick` is a render-only
  // counter that re-evaluates hasBiasOverride() after a save (the
  // helper reads localStorage directly so we need an explicit nudge).
  const [editingBias, setEditingBias] = useState(null)
  const [draftJSON, setDraftJSON] = useState('')
  const [overrideError, setOverrideError] = useState(null)
  const [overrideTick, setOverrideTick] = useState(0)
  const openBiasEditor = (id) => {
    const live = loadBiasOverride(id)
    setEditingBias(id)
    // Seed the textarea with EITHER the existing override (so a
    // re-open shows previous edits) OR the shipped default so the
    // user has a complete schema to tweak from. Pretty-printed so
    // hand-editing is comfortable.
    if (Object.keys(live).length > 0) {
      setDraftJSON(JSON.stringify(live, null, 2))
    } else {
      // Build a seed map of ONLY the editable fields (skip the
      // immutable id/label/hint identity triple — those would be
      // silently dropped on Apply if a user typed them, and they
      // never need to be edited).
      const shipped = getSceneBias(id)
      const editable = {}
      for (const k of Object.keys(shipped)) {
        if (k === 'id' || k === 'label' || k === 'hint') continue
        editable[k] = shipped[k]
      }
      setDraftJSON(JSON.stringify(editable, null, 2))
    }
    setOverrideError(null)
  }
  const closeBiasEditor = () => {
    setEditingBias(null)
    setDraftJSON('')
    setOverrideError(null)
  }
  const applyBiasEdit = () => {
    try {
      const parsed = JSON.parse(draftJSON)
      const safe = sanitizeBiasOverride(parsed)
      // If sanitisation drops EVERY key, treat as "user typed garbage"
      // rather than silently writing an empty override (which would
      // wipe any existing edit).
      const sourceKeys = parsed && typeof parsed === 'object'
        ? Object.keys(parsed).length : 0
      if (sourceKeys > 0 && Object.keys(safe).length === 0) {
        setOverrideError('No valid override fields found. Check key names + value shapes.')
        return
      }
      saveBiasOverride(editingBias, safe)
      setOverrideError(null)
      setOverrideTick(t => t + 1)
      showToast(`Bias "${editingBias}" updated (${Object.keys(safe).length} field${Object.keys(safe).length === 1 ? '' : 's'})`, <Pencil size={10} color="#fff" strokeWidth={2.4} />)
      closeBiasEditor()
    } catch (e) {
      setOverrideError(`JSON parse error: ${e.message || 'invalid'}`)
    }
  }
  const resetBiasEdit = () => {
    if (!editingBias) return
    resetBiasOverride(editingBias)
    setOverrideTick(t => t + 1)
    showToast(`Bias "${editingBias}" reset to defaults`, <RotateCcw size={10} color="#fff" strokeWidth={2.4} />)
    closeBiasEditor()
  }

  // R21.23 — bias overrides export/import. The override map is
  // persisted PER-CHIP in localStorage; we collect every chip's
  // override into a single map before handing it to the IO module
  // (and back the other way during import). overrideTick drives the
  // hasAnyBiasOverride read so the export button enables/disables
  // immediately after an edit, without waiting for the next render
  // from elsewhere.
  const _biasTick = overrideTick
  const collectAllBiasOverrides = () => {
    const map = {}
    for (const id of exportableBiasIds()) {
      const live = loadBiasOverride(id)
      if (Object.keys(live).length > 0) map[id] = live
    }
    return map
  }
  const hasAnyBiasOverride = (() => {
    // Mark overrideTick as a render-time dep so the export button
    // enables immediately after an Apply / Reset.
    void _biasTick
    for (const id of exportableBiasIds()) {
      if (hasBiasOverride(id)) return true
    }
    return false
  })()
  const exportBiasOverridesNow = () => {
    const map = collectAllBiasOverrides()
    if (Object.keys(map).length === 0) {
      showToast('No bias overrides to export — edit a chip first')
      return
    }
    const filename = downloadBiasOverridesFile(map)
    if (filename) {
      const n = Object.keys(map).length
      showToast(`Exported ${n} bias override${n === 1 ? '' : 's'} \u2192 ${filename}`,
        <Download size={10} color="#fff" strokeWidth={2.4} />)
    } else {
      showToast('Bias export failed — check console')
    }
  }
  // R21.23 + R22.28 — shared apply path for the file-picker (R21.23) AND
  // the drag-drop drop zone (R22.28). Pass a File OR a string of raw
  // JSON. Returns true on a successful staged import (UI used for
  // confirm-callback semantics).
  //
  // R24.36 — graduates the inline window.confirm path to flow through
  // the same staged preview panel as the multi-file drop. The single-
  // file picker stages `{ items, perFile: [{ name, ok: true,
  // chipCount }], parseFails: 0, mode: 'merge' }`; the preview UI is
  // identical to the multi-file drop's, so the user gets a consistent
  // diff view regardless of how they kicked off the import.
  const parseAndApplyBiasImport = async (fileOrText) => {
    try {
      const text = typeof fileOrText === 'string'
        ? fileOrText
        : await fileOrText.text()
      const res = parseBiasOverridesImport(text)
      if (!res.ok) {
        showToast(`Bias import failed: ${res.error}`)
        return false
      }
      // Surface the staging gate through the same path the multi-file
      // drop uses so single-file imports also get a preview.
      const name = typeof fileOrText === 'string'
        ? 'pasted.json'
        : (fileOrText?.name || 'file.json')
      const chipCount = Object.keys(res.items).length
      setBiasImportPending({
        items: res.items,
        perFile: [{ name, ok: true, chipCount }],
        parseFails: 0,
        mode: 'merge',
      })
      return true
    } catch (e) {
      showToast(`Bias import error: ${e.message || 'unknown'}`)
      return false
    }
  }
  const importBiasOverridesFromFile = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      await parseAndApplyBiasImport(file)
    }
    input.click()
  }
  // R22.28 — drag-and-drop import. Parallels R17.06 (custom themes) +
  // R18.09 (MIDI bundles): nested dragDepth counter so the drop zone
  // highlight only clears when the drag ACTUALLY leaves the bias
  // container (browsers fire enter/leave on every child element a drag
  // crosses; naive boolean would flicker at every chip boundary).
  // Filters by `dataTransfer.types.includes('Files')` so stray text-
  // drags don't trigger the overlay.
  // R23.33 — multi-file drop now graduates the R22.28 first-file-only
  // gesture to handle N .json files at once (parallels R19.20 MIDI
  // bundles + R18.18 themes). Files are read in parallel via Promise.
  // all, sorted by filename so the result is deterministic across
  // machines, then combined via combineDroppedBiasFiles. Cross-file
  // conflicts resolve last-file-wins (alphabetical). Single-file path
  // still flows through the same combiner — chip count = 1 — so the
  // unified pipeline behaves identically for a 1-file drop as the
  // pre-R23.33 special-case did.
  const [biasDragDepth, setBiasDragDepth] = useState(0)
  const biasDragActive = biasDragDepth > 0
  // R24.36 — staged import preview. Holds { items, perFile, parseFails,
  // mode } when a drop is awaiting commit. Shows a per-chip diff list +
  // mode toggle in a preview panel below the chip rail, parallels the
  // wind (R14.15) + crossfade (R14.16) import previews. `null` when no
  // import is pending. Apply commits + clears; Cancel clears without
  // touching the live overrides.
  const [biasImportPending, setBiasImportPending] = useState(null)
  const onBiasDragEnter = (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setBiasDragDepth(d => d + 1)
  }
  const onBiasDragOver = (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onBiasDragLeave = (e) => {
    if (!e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) return
    setBiasDragDepth(d => Math.max(0, d - 1))
  }
  // R24.36 — commit the staged bias import after the preview confirms.
  // Same merge math as the pre-R24.36 path, just gated behind the
  // preview's Apply button. Persists each chip's resolved override (and
  // CLEARS chips that drop out under replace mode).
  const commitBiasImport = () => {
    if (!biasImportPending) return
    const { items, mode } = biasImportPending
    const fileCount = biasImportPending.perFile?.filter(p => p.ok).length || 0
    const parseFails = biasImportPending.parseFails || 0
    const existing = collectAllBiasOverrides()
    const merge = mergeBiasOverridesImport(existing, items, mode)
    for (const id of exportableBiasIds()) {
      if (Object.prototype.hasOwnProperty.call(merge.items, id)) {
        saveBiasOverride(id, merge.items[id])
      } else if (mode === 'replace') {
        resetBiasOverride(id)
      }
    }
    setOverrideTick(t => t + 1)
    const failNote = parseFails > 0
      ? ` (${parseFails} file${parseFails === 1 ? '' : 's'} skipped)`
      : ''
    const fileNote = fileCount > 1 ? ` (from ${fileCount} files)` : ''
    const summary = mode === 'merge'
      ? `Imported ${merge.added}, skipped ${merge.skipped}${fileNote}${failNote}`
      : `Replaced \u2014 ${merge.added} chip${merge.added === 1 ? '' : 's'} now active${fileNote}${failNote}`
    showToast(summary, <Upload size={10} color="#fff" strokeWidth={2.4} />)
    setBiasImportPending(null)
  }
  // R23.33 — apply path for a COMBINED items map (the multi-file result
  // from combineDroppedBiasFiles).
  //
  // R24.36 — graduates the inline window.confirm with a staged preview
  // panel. Mirrors wind (R14.15) + crossfade (R14.16): the panel
  // surfaces a per-chip diff + Merge/Replace toggle before any data
  // lands. Apply commits via commitBiasImport; Cancel clears via
  // setBiasImportPending(null).
  const applyCombinedBiasItems = (items, perFile, parseFails) => {
    if (Object.keys(items).length === 0) {
      // Every file failed — surface the count so the user knows nothing
      // landed (the combiner already records per-file errors).
      showToast(`Bias import: ${parseFails} file${parseFails === 1 ? '' : 's'} had no valid overrides`)
      return false
    }
    // R24.36 — stage instead of inline-confirm. Default mode is 'merge'
    // (the more conservative outcome — preserves the user's current
    // edits). The preview panel surfaces the diff + lets the user flip
    // to 'replace' before clicking Apply.
    setBiasImportPending({ items, perFile, parseFails, mode: 'merge' })
    return true
  }
  const onBiasDrop = async (e) => {
    if (!e.dataTransfer) return
    e.preventDefault()
    setBiasDragDepth(0)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) {
      showToast('Drop one or more .json bias overrides files to import')
      return
    }
    // Filter to .json files first so a stray PDF / image in a multi-
    // file drop doesn't blow up the parse pass. Sort alphabetically so
    // cross-file conflicts (last-file-wins) resolve deterministically.
    const jsonFiles = Array.from(files)
      .filter(f => /\.json$/i.test(f.name || ''))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    const skipped = files.length - jsonFiles.length
    if (jsonFiles.length === 0) {
      showToast(`No .json files in drop (skipped ${skipped})`)
      return
    }
    // Read all files in parallel — partial failures don't block the
    // batch (combiner counts them as parseFails).
    const reads = await Promise.all(jsonFiles.map(async (f) => {
      try {
        const raw = await f.text()
        return { raw, name: f.name }
      } catch (err) {
        return { error: err?.message || 'read failed', name: f.name }
      }
    }))
    const combined = combineDroppedBiasFiles(reads)
    applyCombinedBiasItems(combined.items, combined.perFile, combined.parseFails)
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
          cranks every dial. Selection persists across sessions.
          R22.28 — the rail + buttons together form a drop zone for
          bias-overrides .json files (parallels R17.06 themes +
          R18.09 MIDI bundles). Drop anywhere in the indigo-dashed
          region to import. */}
      <div
        onDragEnter={onBiasDragEnter}
        onDragOver={onBiasDragOver}
        onDragLeave={onBiasDragLeave}
        onDrop={onBiasDrop}
        style={{
          position: 'relative',
          padding: biasDragActive ? '6px' : '0',
          marginBottom: 6,
          borderRadius: 8,
          outline: biasDragActive ? '2px dashed rgba(99,102,241,0.55)' : '1px solid transparent',
          outlineOffset: biasDragActive ? 4 : 0,
          background: biasDragActive ? 'rgba(99,102,241,0.05)' : 'transparent',
          transition: 'outline-color 0.18s ease-out, background 0.18s ease-out, padding 0.12s ease-out',
        }}>
        {biasDragActive && (
          <div style={{
            position: 'absolute', top: -10, left: 0, right: 0,
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(99,102,241,0.20)',
            color: '#dbeafe',
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
            textAlign: 'center',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            border: '1px solid rgba(99,102,241,0.4)',
            pointerEvents: 'none',
            zIndex: 5,
          }}>Drop .json to import bias overrides (multi-file ok)</div>
        )}
        <div style={{
          display: 'grid', gridTemplateColumns: `repeat(${SCENE_BIASES.length}, 1fr)`,
          gap: 4, marginBottom: 6,
        }}>
        {SCENE_BIASES.map(b => {
          const active = smashBias === b.id
          // R20.07 — refresh on overrideTick so the dot appears the
          // moment Apply lands without waiting for the next render
          // pass from elsewhere. Reading the value here marks it as
          // a render-time dependency without setState-in-effect.
          const _tick = overrideTick
          const isEdited = (_tick, hasBiasOverride(b.id))
          return (
            <button key={b.id}
              onClick={() => pickBias(b.id)}
              onContextMenu={(e) => { e.preventDefault(); openBiasEditor(b.id) }}
              title={`${b.hint}${isEdited ? '\n\nThis bias has user overrides — right-click (or Edit) to view + tweak the JSON.' : '\n\nRight-click to edit this bias as JSON.'}`}
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
                position: 'relative',
              }}>
              {b.label}
              {/* R20.07 — small dot in the corner shows when this chip
                  has user overrides applied. Lets the user spot which
                  chips they've customised at a glance. */}
              {isEdited && (
                <span style={{
                  position: 'absolute', top: 3, right: 4,
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#22d3ee',
                  boxShadow: '0 0 4px rgba(34,211,238,0.7)',
                }} title="User overrides active" />
              )}
            </button>
          )
        })}
      </div>
      {/* R20.07 — small "edit bias" link row. Surfaces the editor for
          the currently-selected chip so users discover the override
          path without having to right-click.
          R21.23 — also carries Export / Import for the full override
          map (parallels wind R12.17 + crossfade R13.14 IO buttons). */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        marginBottom: 6, gap: 6, fontSize: 10,
      }}>
        <button
          onClick={exportBiasOverridesNow}
          title={`Export every chip's bias overrides as a portable JSON file. Empty overrides (chips you haven't edited) are skipped.`}
          disabled={!hasAnyBiasOverride}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 4,
            background: hasAnyBiasOverride ? 'rgba(99,102,241,0.10)' : 'rgba(255,255,255,0.03)',
            color: hasAnyBiasOverride ? '#c7d2fe' : '#5a5a70',
            border: hasAnyBiasOverride
              ? '1px solid rgba(99,102,241,0.25)'
              : '1px solid rgba(255,255,255,0.05)',
            cursor: hasAnyBiasOverride ? 'pointer' : 'not-allowed',
            fontSize: 9, letterSpacing: '0.04em',
            textTransform: 'uppercase', fontWeight: 600,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            opacity: hasAnyBiasOverride ? 1 : 0.55,
          }}>
          <Download size={9} strokeWidth={2.2} /> Export
        </button>
        <button
          onClick={importBiasOverridesFromFile}
          title="Load a bias overrides JSON file. Merge keeps your existing overrides; Replace wipes them and uses the imported set."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(168,85,247,0.10)',
            color: '#e9d5ff',
            border: '1px solid rgba(168,85,247,0.25)',
            cursor: 'pointer', fontSize: 9, letterSpacing: '0.04em',
            textTransform: 'uppercase', fontWeight: 600,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>
          <Upload size={9} strokeWidth={2.2} /> Import
        </button>
        <button
          onClick={() => openBiasEditor(smashBias)}
          title={`Open the JSON editor for the "${SCENE_BIASES.find(b => b.id === smashBias)?.label || smashBias}" bias (counts, speed, chances, force-type weights).`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 6px', borderRadius: 4,
            background: 'rgba(255,255,255,0.04)',
            color: '#9a9ab0',
            border: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer', fontSize: 9, letterSpacing: '0.04em',
            textTransform: 'uppercase', fontWeight: 600,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>
          <Pencil size={9} strokeWidth={2.2} /> Edit bias JSON
        </button>
      </div>
      {/* R24.36 — staged import preview. Surfaces a per-chip diff +
          Merge/Replace toggle before any bias data lands. Parallels
          wind R14.15 + crossfade R14.16 import previews. Apply commits
          via commitBiasImport; Cancel clears via setBiasImportPending(null). */}
      {biasImportPending && (
        <BiasOverridesImportPreview
          pending={biasImportPending}
          existing={collectAllBiasOverrides()}
          onModeChange={(mode) => setBiasImportPending(p => p ? { ...p, mode } : p)}
          onCancel={() => setBiasImportPending(null)}
          onCommit={commitBiasImport}
        />
      )}
      </div>{/* R22.28 — close bias drop-zone wrapper */}
      {editingBias && (
        <div style={{
          padding: 10, marginBottom: 8,
          borderRadius: 8,
          background: 'linear-gradient(180deg, rgba(34,211,238,0.06), rgba(168,85,247,0.04))',
          border: '1px solid rgba(34,211,238,0.30)',
          boxShadow: '0 8px 22px rgba(0,0,0,0.4)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 6,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              color: '#67e8f9', textTransform: 'uppercase',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            }}>
              Editing: {editingBias}
            </span>
            <button onClick={closeBiasEditor} style={{
              width: 18, height: 18, padding: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 4, fontSize: 10, lineHeight: 1, fontWeight: 700,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#9a9ab0', cursor: 'pointer',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            }}>{'\u00d7'}</button>
          </div>
          <textarea
            value={draftJSON}
            onChange={(e) => setDraftJSON(e.target.value)}
            spellCheck={false}
            rows={10}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: 8, borderRadius: 5,
              background: 'rgba(2,2,8,0.65)',
              border: overrideError
                ? '1px solid rgba(239,68,68,0.55)'
                : '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              fontSize: 10, lineHeight: 1.45,
              resize: 'vertical',
            }}
          />
          {overrideError && (
            <div style={{
              fontSize: 10, color: '#fda4af',
              padding: '4px 0',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            }}>{overrideError}</div>
          )}
          <div style={{
            display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end',
          }}>
            <button onClick={resetBiasEdit}
              title="Wipe ALL overrides for this bias and restore the shipped defaults"
              style={{
                padding: '4px 9px', borderRadius: 4,
                fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
                background: 'rgba(239,68,68,0.12)',
                color: '#fca5a5', cursor: 'pointer',
                border: '1px solid rgba(239,68,68,0.30)',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                textTransform: 'uppercase',
              }}>Reset</button>
            <button onClick={applyBiasEdit}
              title="Validate + apply overrides. Corrupt values are dropped; unknown keys are ignored."
              style={{
                padding: '4px 11px', borderRadius: 4,
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                background: 'linear-gradient(135deg, rgba(34,211,238,0.35), rgba(168,85,247,0.25))',
                color: '#e0f2fe', cursor: 'pointer',
                border: '1px solid rgba(34,211,238,0.50)',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                textTransform: 'uppercase',
              }}>Apply</button>
          </div>
          <div style={{
            fontSize: 9, color: '#7a7a90', marginTop: 6,
            lineHeight: 1.4,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>
            Editable fields: counts/speedRange/glowRange/attractRange ([min,max] arrays),
            *Chance probabilities (0..1), forceTypes (array of attractor/repulsor/vortex/turbulence/null).
            Unknown keys silently dropped. Corrupt values fall back to shipped defaults.
          </div>
        </div>
      )}
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

// R24.36 — BiasOverridesImportPreview: surfaces what an imported bias-
// overrides file (single OR multi-file) will actually CHANGE before
// the user commits. Parallels the wind import preview (R14.15) +
// crossfade import preview (R14.16): same staging pattern, same per-
// row action badges (add / skip / overwrite), same Merge/Replace
// toggle that recomputes the diff in-place.
//
// Why we surfaced this: the multi-file drop had a window.confirm()
// that only displayed an aggregate count ("Import 3 bias overrides
// from 5 files?"). When you've spent time tuning per-chip settings,
// a yes/no prompt against an opaque count is anxiety-inducing — you
// can't see WHICH chips will get overwritten. The preview turns the
// decision into an informed click: per-chip diff with the chip's name,
// the live override (italic when chip is currently on shipped
// defaults), the incoming field count, and a colour-coded action
// badge.
// R25.41 — Pretty-print the value(s) for one bias field-diff row. Used
// inside BiasOverridesImportPreview to render the right-edge value
// summary like \"[5K, 30K] \u2192 [1K, 5K]\" or \"0.30 \u2192 0.55\". Pure /
// no DOM so it stays trivially testable when the time comes.
function formatBiasFieldDiffValue(d) {
  const fmtRange = (r) => Array.isArray(r) && r.length === 2
    ? `[${formatCompactNum(r[0])}, ${formatCompactNum(r[1])}]`
    : '?'
  const fmtChance = (c) => Number.isFinite(c) ? c.toFixed(2) : '?'
  const fmtForceTypes = (arr) => Array.isArray(arr)
    ? `[${arr.length}]`   // count-only — full list shown in tooltip
    : '?'
  const fmtOne = (v) => {
    if (d.kind === 'range')      return fmtRange(v)
    if (d.kind === 'chance')     return fmtChance(v)
    if (d.kind === 'forceTypes') return fmtForceTypes(v)
    return String(v)
  }
  if (d.action === 'add')       return `\u2014 \u2192 ${fmtOne(d.incoming)}`
  if (d.action === 'live-only') return `${fmtOne(d.live)} \u2192 \u2014`
  if (d.action === 'change')    return `${fmtOne(d.live)} \u2192 ${fmtOne(d.incoming)}`
  return fmtOne(d.incoming)
}

// Tiny number formatter for the bias-diff inline values. Keeps the
// right column scannable without losing precision for small numbers.
//   >= 10K  \u2192 \"10K\" / \"32K\"
//   >= 1000 \u2192 \"1.5K\"
//   integer \u2192 as-is
//   float   \u2192 2 decimals
function formatCompactNum(v) {
  if (!Number.isFinite(v)) return '?'
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}K`
  if (Math.abs(v) >= 1000)  return `${(v / 1000).toFixed(1)}K`
  if (Number.isInteger(v))  return `${v}`
  return v.toFixed(2)
}

function BiasOverridesImportPreview({ pending, existing, onModeChange, onCancel, onCommit }) {
  const mode = pending.mode === 'replace' ? 'replace' : 'merge'
  const rows = buildBiasImportPreviewRows(pending.items, existing, mode)
  // R25.41 — expanded-row tracker. Click a chip row to expand it
  // in-place; the per-field diff renders below the summary line.
  // Set keyed by chip id; defaults to all-collapsed so the preview
  // surface stays tight by default (the per-field diff is opt-in).
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const toggleExpanded = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const perFile = pending.perFile || []
  const okFiles = perFile.filter(p => p.ok)
  const fileCount = okFiles.length
  const fileNames = okFiles.map(p => p.name).join(', ')
  const parseFails = pending.parseFails || 0
  const willWrite = rows.filter(r => r.wouldWrite).length
  const willSkip = mode === 'merge' ? rows.filter(r => !r.wouldWrite).length : 0
  const willOverwrite = mode === 'replace' ? rows.filter(r => r.isExisting).length : 0
  // Replace mode also wipes any LIVE override the import didn't touch —
  // surface that count so users know they're not just adding/overwriting
  // but also dropping.
  const liveIds = new Set(Object.keys(existing || {}))
  const incomingIds = new Set(rows.map(r => r.id))
  const willDropOnReplace = mode === 'replace'
    ? [...liveIds].filter(id => !incomingIds.has(id)).length
    : 0
  // Title row text — describes the source of the staged import.
  const sourceLabel = fileCount > 1
    ? `${fileCount} files`
    : (okFiles[0]?.name || 'file')
  return (
    <div style={{
      marginTop: 8, padding: 10, borderRadius: 8,
      background: 'rgba(99,102,241,0.06)',
      border: '1px solid rgba(99,102,241,0.25)',
      animation: 'bias-import-rise 0.18s cubic-bezier(0.2,0.8,0.2,1)',
    }}>
      <style>{`@keyframes bias-import-rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8, gap: 6,
      }}>
        <span style={{ fontSize: 11, color: '#c7d2fe', fontWeight: 600, letterSpacing: '0.02em' }}>
          Preview: {rows.length} bias chip{rows.length === 1 ? '' : 's'} in import
        </span>
        <span style={{
          fontSize: 10, color: '#7a7a90', fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={fileNames || sourceLabel}>
          {sourceLabel}
        </span>
      </div>
      {/* Mode selector — Merge / Replace */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
        <button onClick={() => onModeChange('merge')}
          title="Keep existing overrides, only apply chips the file mentions that aren't already overridden."
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: mode === 'merge' ? 'rgba(168,85,247,0.22)' : 'rgba(255,255,255,0.04)',
            color: mode === 'merge' ? '#e9d5ff' : '#8a8aa0',
            border: mode === 'merge' ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.07)',
          }}>Merge</button>
        <button onClick={() => onModeChange('replace')}
          title="Drop all existing overrides, then write the chips from the file."
          style={{
            padding: '6px 0', borderRadius: 7, fontSize: 11, fontWeight: 550,
            cursor: 'pointer',
            background: mode === 'replace' ? 'rgba(236,72,153,0.20)' : 'rgba(255,255,255,0.04)',
            color: mode === 'replace' ? '#fbcfe8' : '#8a8aa0',
            border: mode === 'replace' ? '1px solid rgba(236,72,153,0.42)' : '1px solid rgba(255,255,255,0.07)',
          }}>Replace</button>
      </div>
      {/* Diff list — one row per chip the import touches. */}
      {rows.length === 0 ? (
        <p style={{
          fontSize: 10.5, color: '#7a7a90', fontStyle: 'italic',
          margin: 0, marginBottom: 8, lineHeight: 1.5,
          padding: '6px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.08)',
        }}>
          No valid bias chips in this file.
        </p>
      ) : (
        <div style={{
          maxHeight: 144, overflowY: 'auto',
          marginBottom: 8, padding: 4, borderRadius: 6,
          background: 'rgba(0,0,0,0.18)',
          border: '1px solid rgba(255,255,255,0.04)',
        }}>
          {rows.map(r => {
            const isSkip = r.action === 'skip'
            const isOverwrite = r.action === 'overwrite'
            const liveFieldCount = r.live ? Object.keys(r.live).length : 0
            const isExpanded = expandedIds.has(r.id)
            // R25.41 — per-field diff is only visible when expanded.
            // In merge mode the row's action is 'skip' or 'add' so the
            // per-field diff still has informational value (\"this is
            // what we WOULD have changed if you flipped to Replace\");
            // expand still works to surface it.
            const diffRows = (r.fieldDiff || []).filter(d => {
              if (mode === 'merge' && d.action === 'live-only') return false
              return d.action !== 'unchanged'
            })
            const hasInterestingDiff = diffRows.length > 0
            return (
              <div key={r.id}>
                <div
                  onClick={() => hasInterestingDiff && toggleExpanded(r.id)}
                  title={hasInterestingDiff
                    ? (isExpanded ? 'Click to collapse field diff' : 'Click to expand field diff')
                    : 'No field-level changes to show'}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 10.5, padding: '3px 6px',
                    fontFamily: 'inherit', color: isSkip ? '#7a7a90' : '#d8d8e0',
                    opacity: isSkip ? 0.7 : 1,
                    cursor: hasInterestingDiff ? 'pointer' : 'default',
                    borderRadius: 4,
                    background: isExpanded ? 'rgba(99,102,241,0.10)' : 'transparent',
                    transition: 'background 0.12s ease-out',
                  }}>
                <span style={{
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '38%', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }} title={r.label}>
                  {/* R25.41 — expand caret. Only shown when the row has
                      a non-empty diff to surface (otherwise expansion
                      is a no-op and the caret would lie). */}
                  {hasInterestingDiff && (
                    <span style={{
                      fontSize: 8, color: '#7a7a90',
                      transition: 'transform 0.18s cubic-bezier(0.2,0.8,0.2,1)',
                      transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                      display: 'inline-block', width: 8,
                    }}>{'\u25b6'}</span>
                  )}
                  {r.label}
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.04)', color: '#9a9ab0',
                    border: '1px solid rgba(255,255,255,0.06)',
                    fontStyle: r.live ? 'normal' : 'italic',
                  }} title={r.live
                    ? `Live override: ${liveFieldCount} field${liveFieldCount === 1 ? '' : 's'} set`
                    : 'No live override \u2014 chip uses shipped default'}>
                    {r.live ? `${liveFieldCount}f` : 'default'}
                  </span>
                  <span style={{ color: '#7a7a90', fontSize: 10 }}>{'\u2192'}</span>
                  <span style={{
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    fontSize: 9.5, padding: '1px 5px', borderRadius: 4,
                    background: isSkip
                      ? 'rgba(255,255,255,0.03)'
                      : isOverwrite
                        ? 'rgba(245,158,11,0.10)'
                        : 'rgba(34,197,94,0.10)',
                    color: isSkip ? '#7a7a90' : isOverwrite ? '#fde68a' : '#86efac',
                    border: isSkip
                      ? '1px solid rgba(255,255,255,0.05)'
                      : isOverwrite
                        ? '1px solid rgba(245,158,11,0.30)'
                        : '1px solid rgba(34,197,94,0.30)',
                  }} title={`Incoming: ${r.fieldCount} field${r.fieldCount === 1 ? '' : 's'}`}>
                    {`${r.fieldCount}f`}
                    {isSkip && (
                      <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700 }}>SKIP</span>
                    )}
                    {isOverwrite && (
                      <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700 }}>OVR</span>
                    )}
                    {!isSkip && !isOverwrite && (
                      <span style={{ marginLeft: 4, fontSize: 8, fontWeight: 700 }}>ADD</span>
                    )}
                  </span>
                </span>
                </div>
                {/* R25.41 — per-FIELD diff panel. Expands inline under
                    the row when toggled. Each diff row shows the field
                    name, kind tag, action badge, and value(s) so the
                    user can audit the change at a glance. */}
                {isExpanded && hasInterestingDiff && (
                  <div style={{
                    padding: '4px 6px 6px 18px',
                    background: 'rgba(99,102,241,0.04)',
                    borderRadius: 4,
                    borderLeft: '2px solid rgba(99,102,241,0.30)',
                    margin: '0 0 2px 6px',
                  }}>
                    {diffRows.map(d => {
                      const isAdd = d.action === 'add'
                      const isChange = d.action === 'change'
                      const isLiveOnly = d.action === 'live-only'
                      const tagBg = isAdd ? 'rgba(34,197,94,0.10)'
                                  : isChange ? 'rgba(245,158,11,0.10)'
                                  : 'rgba(239,68,68,0.10)'
                      const tagBd = isAdd ? '1px solid rgba(34,197,94,0.30)'
                                  : isChange ? '1px solid rgba(245,158,11,0.30)'
                                  : '1px solid rgba(239,68,68,0.30)'
                      const tagFg = isAdd ? '#86efac'
                                  : isChange ? '#fde68a'
                                  : '#fca5a5'
                      const tagText = isAdd ? 'ADD'
                                    : isChange ? 'CHG'
                                    : 'DROP'
                      return (
                        <div key={d.field} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '2px 0',
                          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                          fontSize: 9.5,
                        }}>
                          <span style={{
                            padding: '1px 4px', borderRadius: 3,
                            background: tagBg,
                            color: tagFg,
                            border: tagBd,
                            fontSize: 8, fontWeight: 700, letterSpacing: '0.04em',
                            minWidth: 28, textAlign: 'center',
                          }}>{tagText}</span>
                          <span style={{ color: '#c8c8d4', fontWeight: 600, minWidth: 100 }}
                                title={`${d.kind} field`}>
                            {d.field}
                          </span>
                          <span style={{
                            color: '#7a7a90',
                            fontSize: 9, padding: '0 3px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: 3,
                          }}>{d.kind === 'forceTypes' ? 'list' : d.kind}</span>
                          <span style={{
                            color: '#a8a8b8', flex: 1, textAlign: 'right',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }} title={`${isLiveOnly ? 'live → drop' : isChange ? 'live → incoming' : 'incoming'}: ${formatBiasFieldDiffValue(d)}`}>
                            {formatBiasFieldDiffValue(d)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {/* Impact line — mode-aware summary so the user understands the
          exact outcome before clicking Apply. parseFails count surfaces
          here too so a multi-file drop with some corrupt files
          documents itself. */}
      <p style={{
        fontSize: 10.5, color: mode === 'replace' ? '#fbcfe8' : '#a5b4fc',
        margin: 0, marginBottom: 8, lineHeight: 1.5,
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
      }}>
        {mode === 'replace'
          ? `Replace: write ${willWrite} chip${willWrite === 1 ? '' : 's'}${willOverwrite ? ` (${willOverwrite} overwrite)` : ''}${willDropOnReplace ? `, drop ${willDropOnReplace}` : ''}.`
          : `Merge: add ${willWrite} new${willSkip ? ` \u00b7 skip ${willSkip} existing` : ''}.`}
        {parseFails > 0 && (
          <span style={{ color: '#fbbf24', display: 'block', marginTop: 2 }}>
            {parseFails} file{parseFails === 1 ? '' : 's'} skipped {'\u2014'} couldn{'\u2019'}t parse.
          </span>
        )}
      </p>
      {/* Apply / Cancel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <button onClick={onCancel}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 550,
            cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)',
            color: '#c8c8d4',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>Cancel</button>
        <button onClick={onCommit}
          disabled={willWrite === 0 && mode === 'merge'}
          title={(willWrite === 0 && mode === 'merge') ? 'Nothing new to merge' : `Apply ${mode}`}
          style={{
            padding: '7px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
            cursor: (willWrite === 0 && mode === 'merge') ? 'not-allowed' : 'pointer',
            background: (willWrite === 0 && mode === 'merge')
              ? 'rgba(255,255,255,0.04)'
              : mode === 'replace'
                ? 'linear-gradient(135deg, rgba(236,72,153,0.28), rgba(168,85,247,0.18))'
                : 'linear-gradient(135deg, rgba(99,102,241,0.28), rgba(168,85,247,0.18))',
            color: (willWrite === 0 && mode === 'merge') ? '#5a5a70' : '#ffffff',
            border: (willWrite === 0 && mode === 'merge')
              ? '1px solid rgba(255,255,255,0.07)'
              : mode === 'replace'
                ? '1px solid rgba(236,72,153,0.45)'
                : '1px solid rgba(99,102,241,0.45)',
            opacity: (willWrite === 0 && mode === 'merge') ? 0.6 : 1,
          }}>Apply {mode === 'replace' ? 'Replace' : 'Merge'}</button>
      </div>
    </div>
  )
}
