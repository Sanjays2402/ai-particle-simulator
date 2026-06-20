import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { sampleAnalyser, projectToCanvas, peakAmplitude } from '../lib/waveform'

// Audio waveform / oscilloscope overlay. Pinned to the canvas's
// top-right corner whenever audio reactivity is on AND the toggle is
// enabled. Renders to a small canvas at 60 Hz, sampling the live
// AnalyserNode exposed on window.__particleAudioAnalyser by TopBar.
//
// Off by default. When off, returns null (zero cost — no rAF loop).

const WIDTH  = 220
const HEIGHT = 56

export default function WaveformOverlay() {
  const enabled = useStore(s => s.waveformEnabled)
  const audioReactive = useStore(s => s.audioReactive)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const scratchRef = useRef(null)

  const active = enabled && audioReactive

  useEffect(() => {
    if (!active) return
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width  = WIDTH  * dpr
    cv.height = HEIGHT * dpr
    ctx.scale(dpr, dpr)

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick)
      const analyser = typeof window !== 'undefined' ? window.__particleAudioAnalyser : null
      const samples = sampleAnalyser(analyser, scratchRef.current)
      if (samples.length > 0 && (!scratchRef.current || scratchRef.current.length !== analyser.fftSize)) {
        scratchRef.current = new Uint8Array(analyser.fftSize)
      }
      // Clear with a soft fade so old strokes ghost briefly — gives
      // the oscilloscope a faint "scope phosphor" look without
      // queuing an extra blend pass.
      ctx.fillStyle = 'rgba(2,2,6,0.62)'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      // Center line.
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, HEIGHT / 2)
      ctx.lineTo(WIDTH, HEIGHT / 2)
      ctx.stroke()

      if (samples.length === 0) {
        ctx.fillStyle = 'rgba(232,232,240,0.45)'
        ctx.font = '10px Geist Mono, monospace'
        ctx.fillText('waiting for audio...', 10, HEIGHT / 2 + 4)
        return
      }
      const peak = peakAmplitude(samples)
      const pts = projectToCanvas(samples, WIDTH, HEIGHT, 4)
      // Glow envelope.
      ctx.strokeStyle = `rgba(168,85,247,${0.25 + peak * 0.4})`
      ctx.lineWidth = 4
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i]
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      // Hard line on top.
      ctx.strokeStyle = '#a5b4fc'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i]
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      // Peak label, bottom-right.
      ctx.fillStyle = 'rgba(232,232,240,0.55)'
      ctx.font = '9px Geist Mono, JetBrains Mono, monospace'
      ctx.fillText(`peak ${peak.toFixed(2)}`, WIDTH - 60, HEIGHT - 6)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active])

  if (!active) return null

  return (
    <div style={{
      position: 'fixed', right: 18, top: 60, zIndex: 22,
      pointerEvents: 'none',
      borderRadius: 10,
      padding: 4,
      background: 'linear-gradient(180deg, rgba(10,10,16,0.78), rgba(6,6,12,0.85))',
      backdropFilter: 'blur(14px) saturate(140%)',
      WebkitBackdropFilter: 'blur(14px) saturate(140%)',
      border: '1px solid rgba(99,102,241,0.20)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.4), 0 0 18px rgba(99,102,241,0.10)',
    }}>
      <canvas
        ref={canvasRef}
        style={{
          width: WIDTH, height: HEIGHT, display: 'block',
          borderRadius: 6,
          background: 'rgba(2,2,6,0.72)',
        }}
      />
    </div>
  )
}
