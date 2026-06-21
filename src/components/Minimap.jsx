import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import {
  sampleScene, projectXZ, lookDirXZ, unprojectXZ, scaleLabelFor,
  projectSavedViews, pickNearestMarker,
} from '../lib/minimap'
import { loadCameraViews } from '../lib/cameraViews'

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
      // is using so dots track the camera's zoom.
      if (snap && viewsRef.current.length > 0) {
        const markers = projectSavedViews(viewsRef.current, snap.sceneHalf, SIZE)
        markersRef.current = markers
        for (const m of markers) {
          // Stroke ring — dimmer when out of bounds (camera zoomed in
          // tight) so the user knows the view exists but is far away.
          const ringColor = m.inBounds ? 'rgba(34,197,94,0.85)' : 'rgba(34,197,94,0.30)'
          const fillColor = m.inBounds ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.06)'
          ctx.fillStyle = fillColor
          ctx.strokeStyle = ringColor
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.arc(m.px, m.py, 3, 0, Math.PI * 2)
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
  }, [enabled])

  // Click → if it lands on a saved-view dot, jump to that view.
  // Otherwise fall back to "recenter orbit target on that XZ point"
  // — the legacy behavior.
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

  if (!enabled) return null

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
      <canvas
        ref={canvasRef}
        onClick={onClick}
        title="Click a green dot to jump to that saved view, or anywhere else to recenter orbit"
        style={{
          width: SIZE, height: SIZE, display: 'block',
          borderRadius: 6, cursor: 'crosshair',
          background: 'rgba(2,2,6,0.72)',
        }}
      />
    </div>
  )
}
