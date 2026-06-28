import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  sampleScene, projectXZ, lookDirXZ, unprojectXZ, scaleLabelFor,
  projectSavedViews, pickNearestMarker, tooltipPlacement,
  framingForViews, frameViewsCameraMove,
  // R43.N — animated fit-all tween
  FIT_TWEEN_MS, tweenProgress, tweenCameraStep,
  // R45.N — frame only the selected subset (shared palette selection)
  framingForSelectedViews,
} from '../lib/minimap'
import { loadCameraViews, saveCameraViews, removeView } from '../lib/cameraViews'
import { resolveReducedMotion } from '../lib/reducedMotion'
import { showToast } from './Toast'

// Minimap overlay — a small top-down (XZ-plane) widget pinned to the
// canvas's bottom-right corner. Shows where the camera sits relative
// to the scene radius and lets the user click anywhere on the map to
// recenter the orbit target. Off by default; toggle via the LeftSidebar
// "View" section so it doesn't add cost when unused.
//
// All projection math lives in lib/minimap.js (unit-tested); this
// component is just the React wiring + canvas drawing.

const SIZE = 132   // px square

export default function Minimap() {
  const enabled = useStore(s => s.minimapEnabled)
  // R45.N — the live saved-view multi-selection mirrored from the command
  // palette. When non-empty, the minimap offers a matching "Fit selected"
  // button so framing a chosen subset is reachable without the palette open.
  const selectedViewIds = useStore(s => s.selectedViewIds)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  // R43.N — handle for the "Fit all" camera tween's rAF loop, so a second
  // Fit click (or unmount) cancels an in-flight tween instead of stacking
  // two animations fighting over the camera.
  const fitRafRef = useRef(0)
  // Cache the saved-views list + a markers projection. We refresh
  // both periodically (cheap — up to 6 views) so newly-saved views
  // appear without needing a store subscription wired in.
  const viewsRef = useRef([])
  const markersRef = useRef([])
  const viewsTickRef = useRef(0)
  // Hover state for R11.13 tooltips. `hoverId` identifies the marker
  // the cursor is over; `hoverPlace` is the {left, top, side} placement
  // for the floating label; `hoverName` is the view's friendly label
  // captured at hover-time so the render path never has to read the
  // viewsRef (which the react-hooks/refs rule forbids during render).
  const [hoverId, setHoverId] = useState(null)
  const [hoverPlace, setHoverPlace] = useState(null)
  const [hoverName, setHoverName] = useState('')
  // R42.N — saved-view count mirrored into state so the render path can
  // gate the "Fit all" button without reading viewsRef (which the
  // react-hooks/refs rule forbids during render). Updated whenever the
  // tick loop refreshes the cached views list.
  const [viewCount, setViewCount] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    // Hi-DPI: render at devicePixelRatio resolution but display at SIZE.
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width  = SIZE * dpr
    cv.height = SIZE * dpr
    ctx.scale(dpr, dpr)

    // Seed views immediately on enable so the first frame already
    // paints any saved views.
    viewsRef.current = loadCameraViews()
    setViewCount(viewsRef.current.length)

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      const api = typeof window !== 'undefined' ? window.__particleCamera : null
      const snap = sampleScene(api)
      // Refresh saved views every ~30 frames (~0.5s @ 60Hz) so newly
      // saved/deleted ones show up without a store subscription.
      viewsTickRef.current += 1
      if (viewsTickRef.current >= 30) {
        viewsTickRef.current = 0
        viewsRef.current = loadCameraViews()
        // R42.N — keep the render-side count in sync (functional set
        // skips a re-render when the length is unchanged, so the 0.5s
        // refresh doesn't churn React when nothing's been saved/deleted).
        setViewCount(prev => (prev === viewsRef.current.length ? prev : viewsRef.current.length))
      }
      // Clear.
      ctx.clearRect(0, 0, SIZE, SIZE)
      // Frame.
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1)
      // Grid: 4x4 quadrants so the user has a sense of scale.
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.beginPath()
      for (let g = 1; g < 4; g++) {
        ctx.moveTo((g * SIZE) / 4, 0); ctx.lineTo((g * SIZE) / 4, SIZE)
        ctx.moveTo(0, (g * SIZE) / 4); ctx.lineTo(SIZE, (g * SIZE) / 4)
      }
      ctx.stroke()
      // Center crosshair (the scene origin / orbit target proxy).
      ctx.strokeStyle = 'rgba(168,85,247,0.6)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(SIZE / 2 - 4, SIZE / 2); ctx.lineTo(SIZE / 2 + 4, SIZE / 2)
      ctx.moveTo(SIZE / 2, SIZE / 2 - 4); ctx.lineTo(SIZE / 2, SIZE / 2 + 4)
      ctx.stroke()

      // Saved camera view markers — small dots under the camera dot
      // so the user's current position always stays the prominent
      // feature. We project them with the SAME sceneHalf the camera
      // is using so dots track the camera's zoom. Hovered marker
      // (R11.13) gets a brighter ring + thicker stroke so the user
      // sees the connection between dot and label.
      if (snap && viewsRef.current.length > 0) {
        const markers = projectSavedViews(viewsRef.current, snap.sceneHalf, SIZE)
        markersRef.current = markers
        for (const m of markers) {
          const isHover = m.id === hoverId
          // Stroke ring — dimmer when out of bounds (camera zoomed in
          // tight) so the user knows the view exists but is far away.
          const ringColor = isHover
            ? 'rgba(167,243,208,0.95)'
            : m.inBounds ? 'rgba(34,197,94,0.85)' : 'rgba(34,197,94,0.30)'
          const fillColor = isHover
            ? 'rgba(167,243,208,0.45)'
            : m.inBounds ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.06)'
          ctx.fillStyle = fillColor
          ctx.strokeStyle = ringColor
          ctx.lineWidth = isHover ? 1.6 : 1
          ctx.beginPath()
          ctx.arc(m.px, m.py, isHover ? 4 : 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      } else {
        markersRef.current = []
      }

      if (snap) {
        const [cx, , cz] = snap.camera
        const [px, py] = projectXZ(cx, cz, snap.sceneHalf, SIZE)
        // Camera direction line.
        const [dx, dz] = lookDirXZ(snap.camera, snap.target)
        if (dx !== 0 || dz !== 0) {
          ctx.strokeStyle = 'rgba(99,102,241,0.7)'
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + dx * 14, py + dz * 14)
          ctx.stroke()
        }
        // Camera dot.
        ctx.fillStyle = '#a5b4fc'
        ctx.beginPath()
        ctx.arc(px, py, 3.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'
        ctx.lineWidth = 1
        ctx.stroke()

        // Scale label.
        ctx.fillStyle = 'rgba(232,232,240,0.55)'
        ctx.font = '9px Geist Mono, JetBrains Mono, monospace'
        ctx.fillText(scaleLabelFor(snap.sceneHalf), 6, SIZE - 6)
      } else {
        // Placeholder when the canvas API isn't ready yet.
        ctx.fillStyle = 'rgba(232,232,240,0.4)'
        ctx.font = '10px Geist Mono, monospace'
        ctx.fillText('warming up...', 14, SIZE / 2)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(rafRef.current)
      // R43.N — also stop any in-flight fit tween when the minimap is
      // disabled / unmounts so it doesn't keep driving a hidden camera.
      if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = 0 }
    }
  }, [enabled, hoverId])

  // Click → if it lands on a saved-view dot, jump to that view
  // (Shift+click → delete the view inline, R13.15). Otherwise fall
  // back to "recenter orbit target on that XZ point" — the legacy
  // behavior. Shift+click on empty canvas is treated as a normal
  // recenter so the modifier is only meaningful when it hits a dot.
  const onClick = (e) => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const api = window.__particleCamera
    if (!api) return
    // First check the markers. We use a generous 8px hit radius so
    // mobile / touch users don't have to be pixel-precise.
    const hitId = pickNearestMarker(markersRef.current, px, py, 8)
    if (hitId !== null && hitId !== undefined) {
      // R13.15 — Shift+click deletes the view inline, skipping the
      // panel trip. We persist immediately AND fire the camera-views
      // -changed event so RightSidebar's CameraViews list re-syncs
      // without a refresh. Hover state is cleared so the tooltip
      // doesn't briefly point at a ghost.
      if (e.shiftKey) {
        const v = viewsRef.current.find(view => view && view.id === hitId)
        const nextViews = removeView(viewsRef.current, hitId)
        if (nextViews === viewsRef.current) {
          // No-op — the view was already gone (stale marker). Bail
          // before persisting so we don't churn localStorage.
          return
        }
        viewsRef.current = nextViews
        markersRef.current = markersRef.current.filter(m => m.id !== hitId)
        saveCameraViews(nextViews)
        try {
          window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
        } catch { /* */ }
        if (hoverId === hitId) {
          setHoverId(null); setHoverPlace(null); setHoverName('')
        }
        // Inline feedback so the user knows the click registered as
        // a delete rather than a jump. Minimap is a tiny overlay,
        // toast is the cheapest signal that doesn't move things.
        showToast(`Deleted "${(v && v.name) || 'view'}"`)
        return
      }
      // Find the original view and apply pos + target.
      const v = viewsRef.current.find(view => view && view.id === hitId)
      if (v && Array.isArray(v.pos) && Array.isArray(v.target)) {
        api.set({ pos: v.pos.slice(), target: v.target.slice() })
        return
      }
    }
    // Fallback: recenter the orbit target.
    const snap = sampleScene(api)
    if (!snap) return
    const [wx, wz] = unprojectXZ(px, py, snap.sceneHalf, SIZE)
    api.set({ pos: snap.camera, target: [wx, snap.target[1], wz] })
  }

  // Mouse-move hit test → drives the hover-tooltip state. We use the
  // same pickNearestMarker helper as the click handler so the hit
  // geometry is exactly consistent; a marker the user can click on
  // will be the one whose tooltip is shown.
  const onMouseMove = (e) => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const id = pickNearestMarker(markersRef.current, px, py, 10)
    if (id === null || id === undefined) {
      if (hoverId !== null) { setHoverId(null); setHoverPlace(null) }
      return
    }
    if (id !== hoverId) {
      const marker = markersRef.current.find(m => m.id === id)
      const view = viewsRef.current.find(v => v && v.id === id)
      if (marker) {
        setHoverId(id)
        setHoverPlace(tooltipPlacement(marker, SIZE))
        setHoverName(view?.name || 'View')
      }
    }
  }
  const onMouseLeave = () => {
    if (hoverId !== null) {
      setHoverId(null)
      setHoverPlace(null)
      setHoverName('')
    }
  }

  // R42.N — "Fit all": recenter + pull the camera back so every saved
  // view is in frame. Reads the live saved-view list + the current
  // camera (to keep its viewing direction so the move feels like a dolly,
  // not a teleport), computes the fit move purely, and applies it through
  // the camera API. A no-op (no usable views, no camera) just toasts.
  // R43.N — instead of an instant snap, TWEEN from the current camera to
  // the fitted one over ~0.6s (eased) so the "fit" reads as a graceful
  // pull-back. A reduced-motion user still gets the instant snap (an
  // animated camera move is exactly what that setting suppresses). A
  // second Fit click cancels the in-flight tween so they never stack.
  const onFitAll = () => {
    const framing = framingForViews(viewsRef.current)
    if (!framing) { showToast('No saved views to frame'); return }
    applyFitMove(framing)
  }

  // R45.N — "Fit selected": frame ONLY the subset the user multi-selected in
  // the command palette (mirrored into the store), the minimap-side companion
  // to the palette's own "Fit selected" so it's reachable without opening the
  // palette. Reuses framingForSelectedViews (the same pure helper the palette
  // uses) + the shared applyFitMove tween path below.
  const onFitSelected = () => {
    const framing = framingForSelectedViews(viewsRef.current, selectedViewIds)
    if (!framing) { showToast('No selected views to frame'); return }
    applyFitMove(framing)
  }

  // Shared fit-move applier (R42.N/R43.N/R45.N): given a framing, dolly the
  // live camera to fit it. Keeps the camera's current viewing direction so
  // the move reads as a graceful pull-back, not a teleport; reduced-motion
  // users get the instant snap. A second fit cancels the in-flight tween.
  const applyFitMove = (framing) => {
    const api = typeof window !== 'undefined' ? window.__particleCamera : null
    if (!api || typeof api.set !== 'function') return
    let snap = null
    try { snap = typeof api.get === 'function' ? api.get() : null } catch { snap = null }
    const startPos = snap && Array.isArray(snap.pos) ? snap.pos : null
    const startTarget = snap && Array.isArray(snap.target) ? snap.target : null
    const move = frameViewsCameraMove(framing, startPos, startTarget)
    if (!move) { showToast('No saved views to frame'); return }

    // Cancel any tween already running so two Fit clicks don't fight.
    if (fitRafRef.current) { cancelAnimationFrame(fitRafRef.current); fitRafRef.current = 0 }

    const st = useStore.getState()
    const reduced = resolveReducedMotion(st.reducedMotionMode, st.osPrefersReducedMotion)
    const end = { pos: move.pos, target: move.target }
    const label = `Framed ${framing.count} view${framing.count === 1 ? '' : 's'}`
    // Reduced motion, or no usable start to tween from → instant snap.
    if (reduced || !startPos || !startTarget) {
      api.set(end)
      showToast(label)
      return
    }

    const start = { pos: startPos.slice(), target: startTarget.slice() }
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const step = () => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      const p = tweenProgress(now - t0, FIT_TWEEN_MS)
      const cam = tweenCameraStep(start, end, p)
      if (cam) api.set(cam)
      if (p >= 1) {
        fitRafRef.current = 0
        return
      }
      fitRafRef.current = requestAnimationFrame(step)
    }
    fitRafRef.current = requestAnimationFrame(step)
    showToast(label)
  }

  if (!enabled) return null

  // hoverName was captured at hover-time (see onMouseMove), so the
  // render path doesn't have to read viewsRef.current — keeps the
  // react-hooks/refs rule happy.
  const hoverLabel = hoverName || 'View'
  // R45.N — how many views are in the live palette selection (mirrored from
  // the store). Drives the "Fit selected" button's visibility + count badge.
  const selectedCount = Array.isArray(selectedViewIds) ? selectedViewIds.length : 0

  return (
    <div className="zen-hideable" style={{
      position: 'fixed', right: 18, bottom: 78, zIndex: 22,
      pointerEvents: 'auto',
      borderRadius: 10,
      padding: 4,
      background: 'linear-gradient(180deg, rgba(10,10,16,0.78), rgba(6,6,12,0.85))',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      border: '1px solid rgba(168,85,247,0.18)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.4), 0 0 18px rgba(99,102,241,0.08)',
    }}>
      {/* Wrapper has position:relative so the absolute tooltip pins
          to the same coordinate space as our canvas pixel math. */}
      <div style={{ position: 'relative', width: SIZE, height: SIZE }}>
        <canvas
          ref={canvasRef}
          onClick={onClick}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          title="Click a green dot to jump to that saved view (Shift+click to delete it). Click anywhere else to recenter orbit."
          style={{
            width: SIZE, height: SIZE, display: 'block',
            borderRadius: 6, cursor: 'crosshair',
            background: 'rgba(2,2,6,0.72)',
          }}
        />
        {hoverPlace && hoverName && (
          <div
            // pointerEvents:none so the tooltip never steals the marker's
            // own hover hit-test — the cursor still drives the canvas.
            style={{
              position: 'absolute',
              left: hoverPlace.left, top: hoverPlace.top,
              maxWidth: 90,
              padding: '3px 7px', borderRadius: 6,
              background: 'rgba(20,20,30,0.92)',
              color: '#e9d5ff',
              border: '1px solid rgba(34,197,94,0.45)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.55)',
              fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
              fontFamily: 'Geist, system-ui, sans-serif',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              pointerEvents: 'none',
              // Subtle fade so the label doesn't pop in jarringly when
              // hovering across multiple dots.
              animation: 'minimap-tip-fade 0.12s ease-out',
            }}
          >
            <style>{`@keyframes minimap-tip-fade { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            {hoverLabel}
          </div>
        )}
        {/* R42.N — "Fit all" button: one tap to recenter + pull the camera
            back so every saved-view dot is in frame. Only shown with 2+
            views (a single view is just a "jump to it" click). Sits in the
            top-right corner of the minimap so it doesn't cover the scale
            label (bottom-left) or the camera dot. */}
        {viewCount >= 2 && (
          <button
            onClick={onFitAll}
            title="Frame all saved views — recenter + zoom to fit every green dot"
            style={{
              position: 'absolute', top: 4, right: 4, zIndex: 2,
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 5,
              background: 'rgba(34,197,94,0.16)',
              border: '1px solid rgba(34,197,94,0.4)',
              color: '#bbf7d0', cursor: 'pointer',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              transition: 'all 0.15s ease-out',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(34,197,94,0.28)'
              e.currentTarget.style.borderColor = 'rgba(34,197,94,0.6)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(34,197,94,0.16)'
              e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)'
            }}
          >
            <span style={{ fontSize: 10, lineHeight: 1 }}>{'\u2922'}</span>
            FIT
          </button>
        )}
        {/* R45.N — "Fit selected" button: appears when the user has a live
            multi-selection going in the command palette (mirrored through
            the store). One tap frames ONLY that subset on the camera, the
            minimap-side companion to the palette's own "Fit selected" — so
            it's reachable without the palette open. Indigo (vs the green
            FIT-all) so the two are visually distinct; sits just below FIT. */}
        {selectedCount > 0 && (
          <button
            onClick={onFitSelected}
            title={`Frame the ${selectedCount} selected view${selectedCount === 1 ? '' : 's'} (from the command palette selection)`}
            style={{
              position: 'absolute', top: viewCount >= 2 ? 26 : 4, right: 4, zIndex: 2,
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 6px', borderRadius: 5,
              background: 'rgba(99,102,241,0.18)',
              border: '1px solid rgba(99,102,241,0.45)',
              color: '#c7d2fe', cursor: 'pointer',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              transition: 'all 0.15s ease-out',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(99,102,241,0.3)'
              e.currentTarget.style.borderColor = 'rgba(129,140,248,0.7)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(99,102,241,0.18)'
              e.currentTarget.style.borderColor = 'rgba(99,102,241,0.45)'
            }}
          >
            <span style={{ fontSize: 10, lineHeight: 1 }}>{'\u2922'}</span>
            {selectedCount}
          </button>
        )}
      </div>
    </div>
  )
}
