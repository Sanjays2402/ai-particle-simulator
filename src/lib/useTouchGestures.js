import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import {
  distance, pinchToCountDelta, classifyGesture, pointFromTouch,
} from './touchGestures'

// useTouchGestures — attach 2-touch gesture handling to a DOM ref.
// Pinch: live particle-count adjustment based on inter-finger distance.
//        Settles when the user lifts a finger. Caps at [min, max].
// Swipe: horizontal two-finger swipe = next/prev preset, single-fire
//        per gesture (cooldown prevents spam).
//
// Single-finger interaction is left alone so OrbitControls keeps the
// usual one-finger rotate behaviour.
export function useTouchGestures(domRef) {
  const startPointsRef = useRef(null)  // { p0, p1, count } captured at touchstart
  const lastSwipeAt = useRef(0)

  useEffect(() => {
    const el = domRef && domRef.current
    if (!el) return undefined

    const onStart = (e) => {
      if (!e.touches || e.touches.length !== 2) return
      const p0 = pointFromTouch(e.touches, 0)
      const p1 = pointFromTouch(e.touches, 1)
      if (!p0 || !p1) return
      const startCount = useStore.getState().particleCount
      const startDist = distance(p0, p1)
      startPointsRef.current = { p0, p1, startCount, startDist }
    }

    const onMove = (e) => {
      const start = startPointsRef.current
      if (!start || !e.touches || e.touches.length !== 2) return
      const c0 = pointFromTouch(e.touches, 0)
      const c1 = pointFromTouch(e.touches, 1)
      if (!c0 || !c1) return

      // Live pinch → live particle count. Apply the delta from the
      // STARTING distance, not the last frame, so the user sees a
      // continuous response from 100% of their gesture (not just
      // small deltas between consecutive frames).
      const currDist = distance(c0, c1)
      const pinchDelta = currDist - start.startDist
      if (Math.abs(pinchDelta) >= 18) {
        const next = pinchToCountDelta(pinchDelta, start.startCount)
        const cur = useStore.getState().particleCount
        if (next !== cur) useStore.getState().setParticleCount(next)
      }
    }

    const onEnd = (e) => {
      const start = startPointsRef.current
      // If we lost a finger, classify what just happened. We rely on
      // the touches AT START vs touches AT END for the final position.
      // changedTouches holds the ones that just lifted.
      if (!start) return
      if (e.changedTouches && e.changedTouches.length > 0) {
        // Combine: anything still on screen + the just-lifted finger.
        const remaining = e.touches ? Array.from(e.touches) : []
        const lifted = Array.from(e.changedTouches)
        const all = [...remaining, ...lifted]
        const c0 = pointFromTouch(all, 0)
        const c1 = pointFromTouch(all, 1)
        const gesture = classifyGesture(start.p0, start.p1, c0, c1)
        if (gesture === 'swipe-left' || gesture === 'swipe-right') {
          const now = performance.now()
          if (now - lastSwipeAt.current > 600) {
            lastSwipeAt.current = now
            const { nextPreset, prevPreset } = useStore.getState()
            if (gesture === 'swipe-left') nextPreset()
            else prevPreset()
          }
        }
      }
      // Reset on any end so a 3-finger touch doesn't poison the
      // next gesture.
      if (!e.touches || e.touches.length < 2) {
        startPointsRef.current = null
      }
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [domRef])
}
