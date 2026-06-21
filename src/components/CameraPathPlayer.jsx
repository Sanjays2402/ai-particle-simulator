// Camera Path Player — invisible driver that ticks the camera-path
// state machine whenever the user starts a path, then snaps the
// OrbitControls position/target each frame.
//
// Wiring contract:
//   - Listens for the global `particle:camera-path-start` event whose
//     `detail` is { waypoints, secondsPerSegment, loop, onDone? }.
//   - Also listens for `particle:camera-path-stop` to cancel mid-flight.
//   - On every rAF, calls tickPath + samplePath and forwards the
//     resulting pose into window.__particleCamera (the same handle
//     CameraViews uses for save/restore). When non-looping paths
//     finish, calls onDone() so the UI can clear its playing state.
//
// Renders nothing — pure side effect.
import { useEffect, useRef } from 'react'
import { tickPath, samplePath, startState, PATH_MIN_WAYPOINTS } from '../lib/cameraPath'

export default function CameraPathPlayer() {
  const stateRef = useRef(null)
  const pathRef  = useRef(null)
  const rafRef   = useRef(0)
  const lastTsRef = useRef(0)
  const doneRef  = useRef(null)

  useEffect(() => {
    const loop = (ts) => {
      const dt = lastTsRef.current ? (ts - lastTsRef.current) / 1000 : 0
      lastTsRef.current = ts
      const p = pathRef.current
      const s = stateRef.current
      if (!p || !s || !window.__particleCamera) {
        rafRef.current = requestAnimationFrame(loop)
        return
      }
      const next = tickPath(s, p, dt)
      stateRef.current = next
      const pose = samplePath(next, p)
      if (pose) window.__particleCamera.set(pose)
      // Non-looping path completed → call onDone once, drop state.
      if (next.finished) {
        const onDone = doneRef.current
        pathRef.current = null
        stateRef.current = null
        doneRef.current = null
        if (typeof onDone === 'function') onDone()
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    const onStart = (e) => {
      const { waypoints, secondsPerSegment, loop, onDone } = e.detail || {}
      if (!Array.isArray(waypoints) || waypoints.length < PATH_MIN_WAYPOINTS) return
      pathRef.current = { waypoints, secondsPerSegment, loop }
      stateRef.current = startState()
      doneRef.current = onDone || null
      lastTsRef.current = 0 // reset dt baseline so the first frame doesn't lurch
    }
    const onStop = () => {
      const onDone = doneRef.current
      pathRef.current = null
      stateRef.current = null
      doneRef.current = null
      if (typeof onDone === 'function') onDone()
    }
    window.addEventListener('particle:camera-path-start', onStart)
    window.addEventListener('particle:camera-path-stop',  onStop)
    return () => {
      window.removeEventListener('particle:camera-path-start', onStart)
      window.removeEventListener('particle:camera-path-stop',  onStop)
    }
  }, [])

  return null
}
