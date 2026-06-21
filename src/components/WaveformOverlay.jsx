import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import {
  sampleAnalyser, projectToCanvas, peakAmplitude,
  sampleAnalyserSpectrum, projectSpectrumToBars, projectSpectrumToLogBars,
} from '../lib/waveform'

// Audio waveform / oscilloscope overlay. Pinned to the canvas's
// top-right corner whenever audio reactivity is on AND the toggle is
// enabled. Renders to a small canvas at 60 Hz, sampling the live
// AnalyserNode exposed on window.__particleAudioAnalyser by TopBar.
//
// Off by default. When off, returns null (zero cost — no rAF loop).
//
// Two modes (toggled by the chip in the overlay's top-left corner):
//   - 'time'      — oscilloscope polyline (raw time-domain wiggle)
//   - 'frequency' — 32-bar graphic-EQ spectrum (frequency-domain)
// Mode is persisted to localStorage via the store's setWaveformMode.

const WIDTH  = 220
const HEIGHT = 56
const BAR_COUNT = 32

export default function WaveformOverlay() {
  const enabled = useStore(s => s.waveformEnabled)
  const audioReactive = useStore(s => s.audioReactive)
  const mode = useStore(s => s.waveformMode)
  const setMode = useStore(s => s.setWaveformMode)
  const spectrumScale = useStore(s => s.spectrumScale)
  const setSpectrumScale = useStore(s => s.setSpectrumScale)
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
      // Fade background — slightly heavier in time mode so old strokes
      // ghost briefly (oscilloscope phosphor look), lighter in
      // frequency mode so bars don't blur into one another.
      ctx.fillStyle = mode === 'time' ? 'rgba(2,2,6,0.62)' : 'rgba(2,2,6,0.85)'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      // Baseline (only meaningful in time mode — spectrum bars sit on
      // the floor, no need for a midline).
      if (mode === 'time') {
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, HEIGHT / 2)
        ctx.lineTo(WIDTH, HEIGHT / 2)
        ctx.stroke()
      }

      if (mode === 'time') {
        const samples = sampleAnalyser(analyser, scratchRef.current)
        if (samples.length > 0 && (!scratchRef.current || scratchRef.current.length !== analyser.fftSize)) {
          scratchRef.current = new Uint8Array(analyser.fftSize)
        }
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
        return
      }

      // Frequency / spectrum mode.
      const spectrum = sampleAnalyserSpectrum(analyser, scratchRef.current)
      if (spectrum.length > 0 && (!scratchRef.current || scratchRef.current.length !== analyser.frequencyBinCount)) {
        scratchRef.current = new Uint8Array(analyser.frequencyBinCount)
      }
      if (spectrum.length === 0) {
        ctx.fillStyle = 'rgba(232,232,240,0.45)'
        ctx.font = '10px Geist Mono, monospace'
        ctx.fillText('waiting for audio...', 10, HEIGHT / 2 + 4)
        return
      }
      const bars = (spectrumScale === 'log')
        ? projectSpectrumToLogBars(spectrum, WIDTH, HEIGHT, BAR_COUNT, 4)
        : projectSpectrumToBars(spectrum, WIDTH, HEIGHT, BAR_COUNT, 4)
      const colW = WIDTH / BAR_COUNT
      const barW = Math.max(1, colW - 1)
      let sumIntensity = 0
      for (let i = 0; i < bars.length; i++) {
        const [x, h] = bars[i]
        // Color ramp left→right: indigo (bass) → magenta (treble).
        // Compute hue from the bar index for a clean EQ-style gradient.
        const t = i / Math.max(1, bars.length - 1)
        const hue = 250 - t * 80   // 250° (indigo) → 170° (cyan-ish), then we shift past 0° via wrap
        const hueWrapped = (hue + 360) % 360
        const baseY = HEIGHT - 4
        const topY = baseY - h
        // Glow under-bar.
        ctx.fillStyle = `hsla(${hueWrapped}, 90%, 65%, ${0.18 + (h / HEIGHT) * 0.45})`
        ctx.fillRect(x + 0.5, topY - 1, barW, h + 2)
        // Hard cap with brighter hue.
        ctx.fillStyle = `hsla(${hueWrapped}, 95%, 70%, 0.92)`
        ctx.fillRect(x + 0.5, topY, barW, Math.min(2, h))
        sumIntensity += (h / HEIGHT)
      }
      const avgIntensity = sumIntensity / Math.max(1, bars.length)
      ctx.fillStyle = 'rgba(232,232,240,0.55)'
      ctx.font = '9px Geist Mono, JetBrains Mono, monospace'
      ctx.fillText(`avg ${avgIntensity.toFixed(2)}`, WIDTH - 56, HEIGHT - 6)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, mode, spectrumScale])

  if (!active) return null

  // Tiny mode toggle pill — single chip that swaps label on tap.
  // Lives inside the overlay so users discover it without an extra
  // panel and the overlay stays a single self-contained widget.
  // In frequency mode we also surface a linear/log chip so users
  // can swap between the EQ-style linear distribution and a more
  // musical log-frequency bar layout.
  const next = mode === 'time' ? 'frequency' : 'time'
  const label = mode === 'time' ? 'time' : 'freq'
  const nextScale  = spectrumScale === 'log' ? 'linear' : 'log'
  const scaleLabel = spectrumScale === 'log' ? 'log' : 'lin'

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
      <button
        type="button"
        onClick={() => setMode(next)}
        title={`Switch to ${next === 'time' ? 'oscilloscope' : 'spectrum'} view`}
        style={{
          position: 'absolute', top: 8, left: 8,
          pointerEvents: 'auto',
          padding: '2px 8px', borderRadius: 5,
          fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#dbeafe',
          background: 'rgba(99,102,241,0.18)',
          border: '1px solid rgba(99,102,241,0.4)',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          cursor: 'pointer',
          backdropFilter: 'blur(4px)',
        }}>{label}</button>
      {mode === 'frequency' && (
        <button
          type="button"
          onClick={() => setSpectrumScale(nextScale)}
          title={`Switch spectrum to ${nextScale === 'log' ? 'log frequency (musical)' : 'linear frequency (EQ-style)'} scale`}
          style={{
            position: 'absolute', top: 8, left: 56,
            pointerEvents: 'auto',
            padding: '2px 8px', borderRadius: 5,
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: spectrumScale === 'log' ? '#fde68a' : '#d8d8e0',
            background: spectrumScale === 'log'
              ? 'rgba(245,158,11,0.16)'
              : 'rgba(255,255,255,0.06)',
            border: spectrumScale === 'log'
              ? '1px solid rgba(245,158,11,0.40)'
              : '1px solid rgba(255,255,255,0.14)',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>{scaleLabel}</button>
      )}
    </div>
  )
}
