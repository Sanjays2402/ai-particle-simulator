import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// Lightweight DOM-overlay mouse trail. Renders ~16 fading dots that
// follow the pointer. Pure CSS opacity + transform; no canvas work,
// so it costs effectively nothing compared to the WebGL particle loop.
//
// Opt-in via the `mouseTrail` store flag; default off so we don't add
// any visual fuzz to the default scene.
const DOT_COUNT = 16

export default function MouseTrail() {
  const enabled = useStore(s => s.mouseTrail)
  const containerRef = useRef(null)
  const dotsRef = useRef([])
  const trailRef = useRef([]) // {x, y} ring buffer
  const idxRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    const onMove = (e) => {
      const buf = trailRef.current
      buf[idxRef.current % DOT_COUNT] = { x: e.clientX, y: e.clientY }
      idxRef.current++
    }
    window.addEventListener('mousemove', onMove)

    let raf
    const tick = () => {
      const buf = trailRef.current
      const dots = dotsRef.current
      const start = idxRef.current
      for (let k = 0; k < DOT_COUNT; k++) {
        const slot = (start - 1 - k + DOT_COUNT * 2) % DOT_COUNT
        const p = buf[slot]
        const el = dots[k]
        if (!el) continue
        if (!p) { el.style.opacity = '0'; continue }
        // Newer dots brighter and bigger.
        const age = k / DOT_COUNT
        const size = 14 * (1 - age) + 4
        el.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px)`
        el.style.width = `${size}px`
        el.style.height = `${size}px`
        el.style.opacity = String(0.7 * (1 - age))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [enabled])

  if (!enabled) return null
  return (
    <div ref={containerRef} style={{
      position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none',
    }}>
      {Array.from({ length: DOT_COUNT }, (_, k) => (
        <div
          key={k}
          ref={el => (dotsRef.current[k] = el)}
          style={{
            position: 'absolute', top: 0, left: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(236,72,153,0.95) 0%, rgba(168,85,247,0.4) 60%, transparent 100%)',
            mixBlendMode: 'screen',
            transition: 'opacity 0.12s linear',
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  )
}
