import { useEffect, useRef, useState } from 'react'
import { Command } from 'cmdk'
import { useStore } from '../store'
import { presets } from '../presets'
import {
  loadCameraViews, saveCameraViews, appendView, removeView,
  renameView, buildCameraPaletteActions, buildCameraDeleteActions,
  buildCameraRenameActions, duplicateView, buildCameraDuplicateActions,
  duplicateAllViews, duplicateViews, selectIdRange,
  removeViews,
  // R43.H — select-all / clear header state
  allIdsSelected, someIdsSelected, toggleSelectAll,
  // R44.H — invert selection
  invertSelection,
  // R45.H — header two-click range mode
  rangeClick,
} from '../lib/cameraViews'
import { labelForId as framingLabelForId } from '../lib/framingGuides'
import {
  // R44.N — frame a selected subset of saved views (eased camera tween)
  framingForSelectedViews, frameViewsCameraMove,
  FIT_TWEEN_MS, tweenProgress, tweenCameraStep,
} from '../lib/minimap'
import { resolveReducedMotion } from '../lib/reducedMotion'
import { formatCalmToast } from '../lib/calmMode'
import { showToast } from './Toast'
import {
  Play, Pause, Shuffle, Camera, Link2, Download, Settings as Cog,
  Magnet, Mic, RotateCcw, Maximize2, Sparkles, Eye, Video, Crop, Wind,
  Save, Trash2, Pencil, Copy,
} from 'lucide-react'

export function CommandPalette({ onSettings }) {
  const [open, setOpen] = useState(false)
  // R36.H — saved camera views surfaced as palette actions. Re-read from
  // storage each time the palette opens so a view saved this session
  // shows up without a refresh.
  const [cameraViews, setCameraViews] = useState([])
  // R38.H — inline rename: which view's rename field is open, + its draft.
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  // R41.H — multi-select duplicate: when `selecting` is on, the saved
  // views render as a checkbox list (escaping cmdk's row model, the way
  // the rename row does) so the user can pick a SUBSET to fork — the
  // middle ground between R39.H (one view) and R40.H (all views).
  // `selectedIds` is the chosen set; `anchorId` seeds shift-click range
  // selection.
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [anchorId, setAnchorId] = useState(null)
  // R45.H — explicit two-click "Range" mode (an alternative to shift-click,
  // reachable without a modifier — friendlier on touch). When armed, the
  // first row click sets the range anchor, the second selects the whole
  // block between them (via the pure rangeClick state machine) and disarms
  // the mode. `rangeMode` is the armed toggle; `rangeAnchorId` is the
  // pending first-click anchor inside that mode.
  const [rangeMode, setRangeMode] = useState(false)
  const [rangeAnchorId, setRangeAnchorId] = useState(null)
  // R44.N — handle for the "Fit selected" camera tween's rAF loop, so a
  // second fit (or the palette closing) cancels an in-flight tween instead
  // of stacking two animations fighting over the camera (mirrors Minimap).
  const fitRafRef = useRef(0)
  const framingGuideId = useStore(s => s.framingGuideId)
  const cycleFramingGuide = useStore(s => s.cycleFramingGuide)
  const {
    loadPreset, setPlaying, playing, setMouseAttract, mouseAttract, loadRandom,
  } = useStore()

  useEffect(() => {
    const h = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => {
          // Refresh the saved-view list as we open so it's current.
          if (!o) setCameraViews(loadCameraViews())
          // Always reset any half-typed rename when toggling the palette.
          setRenamingId(null)
          setRenameDraft('')
          // R41.H — reset any in-progress multi-select on toggle so the
          // palette never reopens mid-selection.
          setSelecting(false)
          setSelectedIds(new Set())
          setAnchorId(null)
          // R45.H — reset the two-click range mode too.
          setRangeMode(false)
          setRangeAnchorId(null)
          return !o
        })
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  // R44.N — stop any in-flight "Fit selected" camera tween on unmount so it
  // doesn't keep driving the camera after the palette is gone.
  useEffect(() => () => {
    if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = 0 }
  }, [])

  // R45.N — mirror the live multi-selection into the store so the minimap
  // (which is always mounted while enabled) can offer a matching "Fit
  // selected" button reading the SAME selection. We only publish the
  // selection while actually in select mode; leaving the mode (or closing
  // the palette) clears it so a stale selection can't linger on the minimap.
  // setSelectedViewIds skips a no-op set, so re-publishing each render is
  // cheap. Cleared on unmount too.
  useEffect(() => {
    const set = useStore.getState().setSelectedViewIds
    if (selecting) set([...selectedIds])
    else set([])
  }, [selecting, selectedIds])
  useEffect(() => () => { useStore.getState().setSelectedViewIds([]) }, [])

  const run = (fn) => () => { fn(); setOpen(false) }

  // R36.H — restore a saved camera view via the global camera API the
  // RightSidebar panel also uses (no ref drilling through the canvas).
  const restoreView = (view) => {
    const api = window.__particleCamera
    if (api && view && view.pos) api.set({ pos: view.pos, target: view.target })
  }

  // R37.H — save the CURRENT camera as a new view straight from the
  // palette, and delete a saved view by id. Both persist + fire the
  // shared `particle:camera-views-changed` event so the RightSidebar
  // list re-syncs without a refresh — the whole saved-view lifecycle
  // (save / restore / delete) now lives in the palette.
  const saveCurrentView = () => {
    const api = window.__particleCamera
    if (!api) { showToast('Camera not ready yet'); return }
    const state = api.get()
    const current = loadCameraViews()
    const name = `View ${(current.reduce((m, v) => Math.max(m, v.id || 0), 0)) + 1}`
    const next = appendView(current, { name, pos: state.pos, target: state.target })
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Saved "${name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
  }

  const deleteView = (viewId) => {
    const current = loadCameraViews()
    const next = removeView(current, viewId)
    if (next === current) return
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast('View deleted', <Trash2 size={10} color="#fff" strokeWidth={2.4} />)
  }

  // R38.H — rename a saved view inline (no window.prompt), and clear all
  // saved views at once, completing the saved-view lifecycle in the
  // palette. `renamingId` opens an inline text field on one rename row;
  // committing runs the pure renameView (ref-equal-on-no-op skips a
  // redundant save) and re-syncs the RightSidebar via the shared event.
  const commitRename = (viewId) => {
    const name = renameDraft.trim()
    if (!name) { setRenamingId(null); return }
    const current = loadCameraViews()
    const next = renameView(current, viewId, name)
    setRenamingId(null)
    setRenameDraft('')
    if (next === current) return // no-op (blank / identical / missing)
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Renamed to "${name}"`, <Pencil size={10} color="#fff" strokeWidth={2.4} />)
  }

  const clearAllViews = () => {
    const current = loadCameraViews()
    if (current.length === 0) return
    saveCameraViews([])
    setCameraViews([])
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Cleared ${current.length} saved view${current.length === 1 ? '' : 's'}`,
      <Trash2 size={10} color="#fff" strokeWidth={2.4} />)
  }

  // R39.H — duplicate a saved view: clone its camera angle as a new
  // "<name> copy" view so a user can base a tweak on an existing framing
  // without re-aiming the camera. Pure duplicateView (ref-equal-on-no-op)
  // does the clone; we persist + re-sync the RightSidebar via the shared
  // event, exactly like the other lifecycle actions.
  const duplicateViewById = (viewId) => {
    const current = loadCameraViews()
    const next = duplicateView(current, viewId)
    if (next === current) return // not present / not cloneable (no angle)
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Duplicated "${next[0].name}"`, <Copy size={10} color="#fff" strokeWidth={2.4} />)
  }

  // R40.H — duplicate ALL saved views at once: clone the whole set as
  // "<name> copy" so a user can fork an entire framing collection before
  // a round of edits. Pure duplicateAllViews (ref-equal-on-no-op when
  // nothing is cloneable) does the work; we persist + re-sync as usual.
  const duplicateAll = () => {
    const current = loadCameraViews()
    const next = duplicateAllViews(current)
    if (next === current) return // none cloneable (no angle-bearing views)
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    const added = next.length - current.length
    showToast(
      added > 0
        ? `Duplicated ${added} view${added === 1 ? '' : 's'}`
        : 'Views duplicated (some dropped at the cap)',
      <Copy size={10} color="#fff" strokeWidth={2.4} />,
    )
  }

  // R41.H — multi-select duplicate (middle ground between R39.H's one and
  // R40.H's all): toggle a view's membership in the selection set. A
  // shift-click extends from the last anchor to the clicked row via the
  // pure selectIdRange (display-order, inclusive); a plain click toggles
  // just that row + reseats the anchor.
  const toggleSelected = (viewId, shiftKey) => {
    const orderedIds = cameraViews.map(v => v.id)
    // R45.H — when the explicit two-click Range mode is armed, route the
    // click through the pure rangeClick state machine instead of the plain
    // toggle: first click arms the anchor, second click selects the block
    // between them and disarms the mode. A shift-click still uses the
    // additive range path below so power users keep both.
    if (rangeMode && !shiftKey) {
      const r = rangeClick(orderedIds, rangeAnchorId, viewId, selectedIds)
      setSelectedIds(r.selected)
      setRangeAnchorId(r.pendingAnchorId)
      if (r.completed) {
        setRangeMode(false)
        setAnchorId(viewId) // reseat the shift-click anchor at the range end
      }
      return
    }
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (shiftKey && anchorId != null) {
        // Range-select from the anchor to the clicked row (additive).
        for (const id of selectIdRange(orderedIds, anchorId, viewId)) next.add(id)
      } else if (next.has(viewId)) {
        next.delete(viewId)
      } else {
        next.add(viewId)
      }
      return next
    })
    // A plain click reseats the anchor; a shift-click keeps the original
    // anchor so successive shift-clicks grow from the same origin.
    if (!shiftKey) setAnchorId(viewId)
  }

  // R45.H — arm / disarm the explicit two-click Range mode from the header.
  // Arming clears any pending range anchor so the next row click is a clean
  // first-click; disarming drops the pending anchor too.
  const toggleRangeMode = () => {
    setRangeMode(prev => {
      const next = !prev
      setRangeAnchorId(null)
      return next
    })
  }

  // R43.H — header select-all / clear toggle: when every view is already
  // selected, clear; otherwise select them all (the mail-client header-
  // checkbox rule). Pure toggleSelectAll computes the next set from the
  // live duplicable-view ids so stale ids never leak in. Resets the
  // shift-click anchor since a bulk toggle has no single origin row.
  const toggleAllSelected = () => {
    const orderedIds = cameraViews
      .filter(v => v && v.id != null && Array.isArray(v.pos) && v.pos.length >= 3 &&
        v.pos.every(n => Number.isFinite(Number(n))))
      .map(v => v.id)
    setSelectedIds(prev => toggleSelectAll(orderedIds, prev))
    setAnchorId(null)
  }

  // R44.H — invert the selection: flip every selectable view's checked
  // state in one click. Lets a user pick "all but these three" by ticking
  // the three then inverting, instead of ticking the rest by hand. Pure
  // invertSelection reconciles against the live duplicable-view ids so a
  // stale id can't leak in. Resets the shift-click anchor (a bulk flip has
  // no single origin row).
  const invertSelected = () => {
    const orderedIds = cameraViews
      .filter(v => v && v.id != null && Array.isArray(v.pos) && v.pos.length >= 3 &&
        v.pos.every(n => Number.isFinite(Number(n))))
      .map(v => v.id)
    setSelectedIds(prev => invertSelection(orderedIds, prev))
    setAnchorId(null)
  }

  // R44.N — "Fit selected": frame ONLY the chosen subset of saved views,
  // the companion to the minimap's R42.N/R43.N "Fit all". Computes the
  // subset's centroid + spread (framingForSelectedViews), keeps the
  // camera's current viewing direction (so it dollies, not teleports), and
  // tweens over ~0.6s eased — exactly mirroring the Minimap onFitAll path.
  // Reduced motion (or no usable camera start) → instant snap. A second
  // click cancels the in-flight tween. No-op (nothing selected with a
  // usable position) just toasts.
  const fitSelected = () => {
    const api = typeof window !== 'undefined' ? window.__particleCamera : null
    if (!api || typeof api.set !== 'function') { showToast('Camera not ready yet'); return }
    const framing = framingForSelectedViews(loadCameraViews(), selectedIds)
    if (!framing) { showToast('No selected views to frame'); return }
    let snap = null
    try { snap = typeof api.get === 'function' ? api.get() : null } catch { snap = null }
    const startPos = snap && Array.isArray(snap.pos) ? snap.pos : null
    const startTarget = snap && Array.isArray(snap.target) ? snap.target : null
    const move = frameViewsCameraMove(framing, startPos, startTarget)
    if (!move) { showToast('No selected views to frame'); return }

    // Cancel any tween already running so two fits don't fight.
    if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = 0 }

    const st = useStore.getState()
    const reduced = resolveReducedMotion(st.reducedMotionMode, st.osPrefersReducedMotion)
    const end = { pos: move.pos, target: move.target }
    const done = () => showToast(`Framed ${framing.count} selected view${framing.count === 1 ? '' : 's'}`)
    if (reduced || !startPos || !startTarget) {
      api.set(end)
      done()
      return
    }
    const start = { pos: startPos.slice(), target: startTarget.slice() }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const step = () => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const p = tweenProgress(now - t0, FIT_TWEEN_MS)
      const cam = tweenCameraStep(start, end, p)
      if (cam) api.set(cam)
      if (p >= 1) { fitRafRef.current = 0; return }
      fitRafRef.current = requestAnimationFrame(step)
    }
    fitRafRef.current = requestAnimationFrame(step)
    done()
  }

  // R41.H — fork just the selected subset. Pure duplicateViews
  // (ref-equal-on-no-op when nothing selected is cloneable) does the
  // work; persist + re-sync exactly like the other lifecycle actions,
  // then leave selection mode.
  const duplicateSelected = () => {
    const current = loadCameraViews()
    const next = duplicateViews(current, selectedIds)
    setSelecting(false)
    setSelectedIds(new Set())
    setAnchorId(null)
    if (next === current) return // none selected-and-cloneable
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    const added = next.length - current.length
    showToast(
      added > 0
        ? `Duplicated ${added} selected view${added === 1 ? '' : 's'}`
        : 'Views duplicated (some dropped at the cap)',
      <Copy size={10} color="#fff" strokeWidth={2.4} />,
    )
  }

  const enterSelectMode = () => {
    setSelecting(true)
    setSelectedIds(new Set())
    setAnchorId(null)
    setRangeMode(false)
    setRangeAnchorId(null)
  }
  const cancelSelectMode = () => {
    setSelecting(false)
    setSelectedIds(new Set())
    setAnchorId(null)
    setRangeMode(false)
    setRangeAnchorId(null)
  }

  // R42.H — bulk-delete the selected subset (graduates the per-view
  // delete + the R41.H duplicate-subset into a shared multi-select bar).
  // Pure removeViews (ref-equal-on-no-op) does the work; a window.confirm
  // gates the destructive action. Persist + re-sync like every other
  // lifecycle action, then leave selection mode.
  const deleteSelected = () => {
    const count = selectedIds.size
    if (count === 0) return
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const ok = window.confirm(`Delete ${count} selected camera view${count === 1 ? '' : 's'}? This can't be undone.`)
      if (!ok) return
    }
    const current = loadCameraViews()
    const next = removeViews(current, selectedIds)
    setSelecting(false)
    setSelectedIds(new Set())
    setAnchorId(null)
    if (next === current) return // nothing selected was present
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    const removed = current.length - next.length
    showToast(
      `Deleted ${removed} selected view${removed === 1 ? '' : 's'}`,
      <Trash2 size={10} color="#fff" strokeWidth={2.4} />,
    )
  }

  if (!open) return null

  const cameraActions = buildCameraPaletteActions(cameraViews)
  const deleteActions = buildCameraDeleteActions(cameraViews)
  const renameActions = buildCameraRenameActions(cameraViews)
  const duplicateActions = buildCameraDuplicateActions(cameraViews)
  // R41.H — the angle-bearing (duplicable) views, in display order, for
  // the multi-select panel + its "Duplicate (N)" gate. selectedIds may
  // briefly hold ids that have since vanished; reconcile against the live
  // list so the count never over-reports.
  const duplicableViews = cameraViews.filter(v =>
    v && v.id != null && Array.isArray(v.pos) && v.pos.length >= 3 &&
    v.pos.every(n => Number.isFinite(Number(n))),
  )
  const selectedCount = duplicableViews.reduce((n, v) => n + (selectedIds.has(v.id) ? 1 : 0), 0)
  // R43.H — header select-all toggle tri-state, derived from the live
  // duplicable-view ids so a stale id in selectedIds can't skew it.
  const duplicableIds = duplicableViews.map(v => v.id)
  const allSelected = allIdsSelected(duplicableIds, selectedIds)
  const someSelected = someIdsSelected(duplicableIds, selectedIds)

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,4,8,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '14vh',
        animation: 'cp-fade 0.15s ease-out',
      }}
    >
      <Command
        onClick={(e) => e.stopPropagation()}
        label="Command Palette"
        style={{
          width: 640, maxWidth: '90vw',
          background: 'linear-gradient(180deg, rgba(20,20,30,0.92) 0%, rgba(14,14,22,0.95) 100%)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 16,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 40px rgba(168,85,247,0.2)',
          overflow: 'hidden',
          animation: 'cp-slide 0.18s cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Sparkles size={16} color="#c084fc" strokeWidth={2} />
          <Command.Input
            autoFocus
            placeholder="Type a command or search preset…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#f2f2f5', fontSize: 14, fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          />
          <kbd style={kbd}>ESC</kbd>
        </div>
        <Command.List style={{
          maxHeight: 400, overflow: 'auto',
          padding: 6,
        }}>
          <Command.Empty style={{
            padding: 20, textAlign: 'center', color: '#6a6a80', fontSize: 13,
          }}>
            No results.
          </Command.Empty>

          <Command.Group heading="Playback" style={groupHeading}>
            <Item icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} shortcut="Space" onSelect={run(() => setPlaying(!playing))} />
            <Item icon={RotateCcw} label="Reset Camera" onSelect={run(() => {
              const { loadPreset, currentPreset } = useStore.getState()
              if (currentPreset) loadPreset(currentPreset)
            })} />
            <Item icon={Maximize2} label="Toggle Fullscreen" shortcut="F" onSelect={run(() => document.documentElement.requestFullscreen?.())} />
            <Item icon={Shuffle} label="Random Preset" shortcut="R" onSelect={run(() => loadRandom())} />
          </Command.Group>

          <Command.Group heading="Tools" style={groupHeading}>
            <Item icon={Magnet} label={`${mouseAttract ? 'Disable' : 'Enable'} Mouse Attract`} onSelect={run(() => setMouseAttract(!mouseAttract))} />
            <Item icon={Eye} label="Zen Mode — hide all UI" shortcut="Z" onSelect={run(() => window.dispatchEvent(new CustomEvent('particle:toggle-zen')))} />
            <Item icon={Camera} label="Screenshot" shortcut="S" onSelect={run(() => document.dispatchEvent(new CustomEvent('particle:screenshot')))} />
            <Item icon={Link2} label="Copy Share URL" onSelect={run(() => navigator.clipboard?.writeText(location.href))} />
            <Item icon={Cog} label="Open Settings" onSelect={run(() => onSettings?.())} />
          </Command.Group>

          {/* R36.H — Camera group: saved views + zen + framing as
              searchable actions so power users never touch the sidebar.
              R37.H — plus save-current + per-view delete so the whole
              saved-view lifecycle lives in the palette. */}
          <Command.Group heading="Camera" style={groupHeading}>
            <Item icon={Eye} label="Enter Zen Mode" shortcut="Z" onSelect={run(() => window.dispatchEvent(new CustomEvent('particle:toggle-zen')))} />
            <Item
              icon={Crop}
              label="Cycle Framing Guide"
              sub={`Now: ${framingLabelForId(framingGuideId)}`}
              shortcut="]"
              onSelect={run(() => cycleFramingGuide())}
            />
            <Item
              icon={Wind}
              label={`${useStore.getState().calmMode ? 'Disable' : 'Enable'} Calm Mode`}
              sub="Pause auto-rotate, shake, hue-cycle & zen orbit"
              onSelect={run(() => {
                const next = !useStore.getState().calmMode
                useStore.getState().setCalmMode(next)
                // R37.K — name what the gate changed (same toast as TopBar).
                const t = formatCalmToast(next)
                showToast(
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: '#9a9ab0' }}>{t.detail}</span>
                  </span>,
                  <Wind size={10} color="#fff" strokeWidth={2.4} />,
                )
              })}
            />
            {/* R37.H — save the current camera as a new view. */}
            <Item
              icon={Save}
              label="Save Current Camera View"
              sub="Snapshot the current camera angle"
              keywords="camera view save store new"
              onSelect={run(saveCurrentView)}
            />
            {cameraActions.length === 0 ? (
              <Item icon={Video} label="No saved views yet" sub="Press V on the scene to save the current camera" onSelect={() => {}} />
            ) : (
              cameraActions.map(a => (
                <Item
                  key={a.id}
                  icon={Video}
                  label={a.label}
                  sub={`Restore view · ${a.sub}`}
                  keywords={a.keywords}
                  onSelect={run(() => restoreView(a.view))}
                />
              ))
            )}
            {/* R37.H — per-view delete actions (only when views exist). */}
            {deleteActions.map(a => (
              <Item
                key={a.id}
                icon={Trash2}
                label={a.label}
                sub={a.sub}
                keywords={a.keywords}
                onSelect={run(() => deleteView(a.viewId))}
              />
            ))}
            {/* R39.H — per-view duplicate: clone an existing angle as a
                new "<name> copy" view so a user can base a tweak on an
                existing framing without re-aiming the camera. Only
                cloneable (angle-bearing) views surface here. */}
            {duplicateActions.map(a => (
              <Item
                key={a.id}
                icon={Copy}
                label={a.label}
                sub={a.sub}
                keywords={a.keywords}
                onSelect={run(() => duplicateViewById(a.viewId))}
              />
            ))}
            {/* R38.H — per-view rename: selecting the row opens an inline
                text field (Enter commits, Esc cancels) so a power user can
                relabel a view without leaving the palette or hitting a
                window.prompt. */}
            {renameActions.map(a => (
              renamingId === a.viewId ? (
                <div
                  key={a.id}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10,
                    border: '1px solid rgba(168,85,247,0.4)',
                    background: 'rgba(168,85,247,0.08)', margin: '2px 0',
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <Pencil size={14} strokeWidth={2} color="#c084fc" />
                  </span>
                  <input
                    autoFocus
                    value={renameDraft}
                    maxLength={40}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(a.viewId) }
                      else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); setRenameDraft('') }
                    }}
                    placeholder={a.currentName}
                    style={{
                      flex: 1, background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                      outline: 'none', color: '#f2f2f5', fontSize: 13, fontWeight: 500,
                      padding: '6px 10px', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => commitRename(a.viewId)}
                    style={renameBtn}
                  >Save</button>
                </div>
              ) : (
                <Item
                  key={a.id}
                  icon={Pencil}
                  label={a.label}
                  sub={a.sub}
                  keywords={a.keywords}
                  onSelect={() => { setRenamingId(a.viewId); setRenameDraft(a.currentName) }}
                />
              )
            ))}
            {/* R41.H/R42.H — multi-select bar: pick a SUBSET of views and
                either fork them (duplicate) OR prune them (delete) in one
                pass. The middle ground between the per-view actions and the
                all-views actions. When 2+ views exist, an entry row arms a
                checkbox list (escaping cmdk like the rename row).
                Shift-click range-selects. */}
            {!selecting && duplicableViews.length >= 2 && (
              <Item
                icon={Copy}
                label="Select Views…"
                sub={`Pick a subset of the ${duplicableViews.length} views to duplicate or delete`}
                keywords="camera view duplicate delete selected subset multi clone copy fork remove prune some pick choose"
                onSelect={() => enterSelectMode()}
              />
            )}
            {selecting && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  margin: '4px 0', padding: '10px 11px', borderRadius: 10,
                  border: '1px solid rgba(168,85,247,0.4)',
                  background: 'rgba(168,85,247,0.07)',
                }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8,
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: '#a78bfa',
                  }}>Select views</span>
                  <span style={{ fontSize: 10, color: '#8a8aa0', fontVariantNumeric: 'tabular-nums' }}>
                    {selectedCount}/{duplicableViews.length}
                  </span>
                </div>
                {/* R43.H — select-all / clear header + R44.H — invert.
                    Select-all checks every view (or clears when all are
                    checked); the box shows a check when all are selected, a
                    dash when some. Invert flips every view's state so a user
                    can pick "all but these three" by ticking three then
                    inverting. */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 7 }}>
                  <button
                    onClick={toggleAllSelected}
                    title={allSelected ? 'Clear selection' : 'Select all views'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, flex: 1,
                      padding: '6px 9px', borderRadius: 8, cursor: 'pointer',
                      textAlign: 'left',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: '#c4b5fd', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                      transition: 'all 0.12s ease-out',
                    }}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                      background: (allSelected || someSelected) ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${(allSelected || someSelected) ? 'rgba(168,85,247,0.7)' : 'rgba(255,255,255,0.14)'}`,
                      color: '#fff', fontSize: 11, lineHeight: 1,
                    }}>{allSelected ? '\u2713' : someSelected ? '\u2212' : ''}</span>
                    <span style={{ flex: 1, color: '#a78bfa', letterSpacing: '0.02em' }}>
                      {allSelected ? 'Clear all' : 'Select all'}
                    </span>
                  </button>
                  {/* R44.H — invert: flip every view's checked state. */}
                  <button
                    onClick={invertSelected}
                    title="Invert selection — check the unchecked, uncheck the checked"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      color: '#a78bfa', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                      letterSpacing: '0.02em', flexShrink: 0,
                      transition: 'all 0.12s ease-out',
                    }}
                  >
                    {/* Two half-filled squares glyph cue for "swap states". */}
                    <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>{'\u21c4'}</span>
                    Invert
                  </button>
                  {/* R45.H — Range: arm an explicit two-click range mode
                      (no modifier needed — touch-friendly). When armed, the
                      first row click sets the anchor, the second selects the
                      whole block. The button stays lit while armed. */}
                  <button
                    onClick={toggleRangeMode}
                    title={rangeMode
                      ? 'Range mode armed — click two rows to select the block (click again to cancel)'
                      : 'Select a range — click to arm, then click the first + last rows'}
                    aria-pressed={rangeMode}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                      background: rangeMode
                        ? 'linear-gradient(135deg, rgba(99,102,241,0.3) 0%, rgba(168,85,247,0.24) 100%)'
                        : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${rangeMode ? 'rgba(129,140,248,0.6)' : 'rgba(255,255,255,0.05)'}`,
                      color: rangeMode ? '#c7d2fe' : '#a78bfa',
                      fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
                      letterSpacing: '0.02em', flexShrink: 0,
                      boxShadow: rangeMode ? '0 0 12px rgba(99,102,241,0.3)' : 'none',
                      transition: 'all 0.12s ease-out',
                    }}
                  >
                    {/* Bracket glyph cue for "span a range". */}
                    <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>{'\u2630'}</span>
                    Range
                  </button>
                </div>
                {/* R45.H — armed-mode hint: tells the user what the two
                    clicks do, and which row is the pending anchor. */}
                {rangeMode && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '5px 9px', marginBottom: 7, borderRadius: 7,
                    background: 'rgba(99,102,241,0.1)',
                    border: '1px solid rgba(99,102,241,0.28)',
                    fontSize: 10.5, color: '#c7d2fe', letterSpacing: '0.01em',
                  }}>
                    <span aria-hidden="true" style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: '#818cf8', boxShadow: '0 0 6px rgba(129,140,248,0.8)',
                    }} />
                    {rangeAnchorId == null
                      ? 'Range mode: click the first row of the block'
                      : 'Now click the last row to select the block'}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 9 }}>
                  {duplicableViews.map(v => {
                    const on = selectedIds.has(v.id)
                    const isRangeAnchor = rangeMode && rangeAnchorId === v.id
                    const name = (typeof v.name === 'string' && v.name.trim()) ? v.name.trim() : `View ${v.id}`
                    return (
                      <button
                        key={v.id}
                        onClick={(e) => toggleSelected(v.id, e.shiftKey)}
                        title={rangeMode
                          ? (rangeAnchorId == null ? 'Click to set the range start' : 'Click to select up to here')
                          : 'Click to toggle · Shift+click to select a range'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '7px 9px', borderRadius: 8, cursor: 'pointer',
                          textAlign: 'left',
                          background: on ? 'rgba(168,85,247,0.16)' : 'rgba(255,255,255,0.03)',
                          border: isRangeAnchor
                            ? '1px solid rgba(129,140,248,0.85)'
                            : `1px solid ${on ? 'rgba(168,85,247,0.45)' : 'rgba(255,255,255,0.06)'}`,
                          boxShadow: isRangeAnchor ? '0 0 10px rgba(99,102,241,0.4)' : 'none',
                          color: on ? '#e9d5ff' : '#9a9ab0',
                          fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
                          transition: 'all 0.12s ease-out',
                        }}
                      >
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 16, height: 16, borderRadius: 5, flexShrink: 0,
                          background: on ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.06)',
                          border: `1px solid ${on ? 'rgba(168,85,247,0.7)' : 'rgba(255,255,255,0.14)'}`,
                          color: '#fff', fontSize: 11, lineHeight: 1,
                        }}>{on ? '\u2713' : ''}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      </button>
                    )
                  })}
                </div>
                {/* R44.N — "Fit selected": frame ONLY the chosen subset on
                    the live camera (eased dolly), the companion to the
                    minimap's "Fit all". Non-destructive, so it sits on its
                    own row above the duplicate/delete lifecycle actions and
                    keeps the panel open. */}
                <button
                  onClick={() => fitSelected()}
                  disabled={selectedCount === 0}
                  title={selectedCount === 0 ? 'Select at least one view' : `Frame the ${selectedCount} selected view${selectedCount === 1 ? '' : 's'} on the camera`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    width: '100%', padding: '6px 0', borderRadius: 7, marginBottom: 7,
                    background: selectedCount === 0
                      ? 'rgba(255,255,255,0.04)'
                      : 'linear-gradient(135deg, rgba(16,185,129,0.26) 0%, rgba(34,197,94,0.2) 100%)',
                    border: `1px solid ${selectedCount === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(34,197,94,0.5)'}`,
                    color: selectedCount === 0 ? '#6a6a80' : '#bbf7d0',
                    cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>{'\u2922'}</span>
                  {selectedCount === 0 ? 'Fit selected' : `Fit selected (${selectedCount})`}
                </button>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => duplicateSelected()}
                    disabled={selectedCount === 0}
                    title={selectedCount === 0 ? 'Select at least one view' : `Clone the ${selectedCount} selected view${selectedCount === 1 ? '' : 's'}`}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 7,
                      background: selectedCount === 0
                        ? 'rgba(255,255,255,0.04)'
                        : 'linear-gradient(135deg, rgba(139,92,246,0.35) 0%, rgba(236,72,153,0.28) 100%)',
                      border: `1px solid ${selectedCount === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(168,85,247,0.5)'}`,
                      color: selectedCount === 0 ? '#6a6a80' : '#e9d5ff',
                      cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                    }}
                  >{selectedCount === 0 ? 'Duplicate' : `Duplicate (${selectedCount})`}</button>
                  {/* R42.H — bulk DELETE the same selected subset, so the
                      multi-select bar covers both forking and pruning. Red-
                      keyed + window.confirm-gated to distinguish it from the
                      duplicate action. */}
                  <button
                    onClick={() => deleteSelected()}
                    disabled={selectedCount === 0}
                    title={selectedCount === 0 ? 'Select at least one view' : `Delete the ${selectedCount} selected view${selectedCount === 1 ? '' : 's'}`}
                    style={{
                      flex: 1, padding: '6px 0', borderRadius: 7,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      background: selectedCount === 0
                        ? 'rgba(255,255,255,0.04)'
                        : 'linear-gradient(135deg, rgba(239,68,68,0.3) 0%, rgba(220,38,38,0.24) 100%)',
                      border: `1px solid ${selectedCount === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(248,113,113,0.5)'}`,
                      color: selectedCount === 0 ? '#6a6a80' : '#fecaca',
                      cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                    }}
                  >
                    <Trash2 size={11} strokeWidth={2.2} />
                    {selectedCount === 0 ? 'Delete' : `Delete (${selectedCount})`}
                  </button>
                  <button
                    onClick={() => cancelSelectMode()}
                    title="Cancel selection"
                    style={{
                      padding: '6px 14px', borderRadius: 7,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#9a9ab0', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                    }}
                  >Cancel</button>
                </div>
              </div>
            )}
            {/* R40.H — fork the WHOLE set at once (clone every saved view
                as "<name> copy"). Only when 2+ duplicable views exist —
                with a single view the per-view duplicate above suffices. */}
            {!selecting && duplicateActions.length >= 2 && (
              <Item
                icon={Copy}
                label="Duplicate All Saved Views"
                sub={`Clone all ${duplicateActions.length} views as "<name> copy"`}
                keywords="camera view duplicate all clone copy fork bulk set collection"
                onSelect={run(duplicateAll)}
              />
            )}
            {/* R38.H — wipe every saved view at once (only when some exist). */}
            {cameraActions.length > 0 && (
              <Item
                icon={Trash2}
                label="Clear All Saved Views"
                sub={`Delete all ${cameraActions.length} saved camera view${cameraActions.length === 1 ? '' : 's'}`}
                keywords="camera view clear all delete remove wipe reset"
                onSelect={run(clearAllViews)}
              />
            )}
          </Command.Group>

          <Command.Group heading="Presets" style={groupHeading}>
            {presets.map(p => (
              <Item key={p.id} emoji={p.emoji} label={p.name} sub={p.description} onSelect={run(() => loadPreset(p.id))} />
            ))}
          </Command.Group>
        </Command.List>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)',
          fontSize: 11, color: '#6a6a80',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        }}>
          <span><kbd style={kbdSm}>↑↓</kbd> Navigate</span>
          <span><kbd style={kbdSm}>↵</kbd> Select</span>
          <span><kbd style={kbdSm}>⌘K</kbd> Open</span>
        </div>
      </Command>
    </div>
  )
}

const groupHeading = {
  padding: '8px 12px 4px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#8a8aa0',
}

const kbd = {
  padding: '2px 6px', borderRadius: 4,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
  fontSize: 10, color: '#8a8aa0',
}
const kbdSm = { ...kbd, padding: '1px 5px', fontSize: 9 }

const renameBtn = {
  padding: '5px 12px', borderRadius: 7,
  background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(236,72,153,0.25) 100%)',
  border: '1px solid rgba(168,85,247,0.5)',
  color: '#e9d5ff', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
}

function Item({ icon: Icon, emoji, label, sub, shortcut, keywords, onSelect }) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords ? [keywords] : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: 10,
        cursor: 'pointer', color: '#d8d8e0', fontSize: 13,
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: 14,
      }}>
        {emoji || (Icon && <Icon size={14} strokeWidth={2} color="#c084fc" />)}
      </span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 500, color: '#f2f2f5', letterSpacing: '-0.01em' }}>{label}</span>
        {sub && <span style={{ fontSize: 11, color: '#7a7a90' }}>{sub}</span>}
      </div>
      {shortcut && <kbd style={kbd}>{shortcut}</kbd>}
    </Command.Item>
  )
}
