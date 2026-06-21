import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  sampleScene, projectXZ, lookDirXZ, unprojectXZ, scaleLabelFor,
  projectSavedViews, pickNearestMarker, tooltipPlacement,
} from '../lib/minimap'
import { loadCameraViews, saveCameraViews, removeView } from '../lib/cameraViews'
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
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
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
    return () => cancelAnimationFrame(rafRef.current)
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

  if (!enabled) return null

  // hoverName was captured at hover-time (see onMouseMove), so the
  // render path doesn't have to read viewsRef.current — keeps the
  // react-hooks/refs rule happy.
  const hoverLabel = hoverName || 'View'

  return (
    <div style={{
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
      </div>
    </div>
  )
}
