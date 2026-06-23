import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  sampleAnalyser, projectToCanvas, peakAmplitude,
  sampleAnalyserSpectrum, projectSpectrumToBars, projectSpectrumToLogBars,
  makePeakHoldState, tickPeakHolds, resetPeakHolds, PEAK_LINE_THICKNESS,
  readPeakTrail, nextTrailCurve,
  // R19.12 — per-curve tunable param schema (exp.exponent, log.base)
  PEAK_TRAIL_CURVE_PARAMS, isCurveParamsAtDefaults,
  // R21.21 — palette-aware tint variant + chip rail helpers (graduates
  // R20.13's peakTrailHueForBarIndex; the older helper is still exported
  // for backwards-compat but no longer used by the overlay paint path).
  peakTrailHueForBarIndexPalette,
  PEAK_TRAIL_PALETTES, nextTrailPalette,
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
  const peakHolds = useStore(s => s.spectrumPeakHolds)
  const setPeakHolds = useStore(s => s.setSpectrumPeakHolds)
  const peakCurve = useStore(s => s.spectrumPeakCurve)
  const setPeakCurve = useStore(s => s.setSpectrumPeakCurve)
  // R19.12 — per-curve tunable params (exp.exponent, log.base) live
  // here so the trail re-paints the moment a param slider moves. The
  // params object identity changes on every patch (lib uses spread-
  // copy semantics) so the useEffect deps catch every change.
  const peakCurveParams = useStore(s => s.spectrumPeakCurveParams)
  const setPeakCurveParam = useStore(s => s.setSpectrumPeakCurveParam)
  const resetPeakCurveParams = useStore(s => s.resetSpectrumPeakCurveParams)
  // R20.13 — frequency-coloured tint for the trail. When ON, the trail
  // overlay paints in a warm→cool ramp keyed to barIndex (low bars =
  // warm red-orange, high bars = cool blue-violet) so the trail layer
  // reads as a frequency map distinct from the bar fills below. When
  // OFF (default — matches R19.12's look), the trail inherits the bar's
  // own hue and reads as a glow extension. Persisted across sessions.
  const peakTrailTint = useStore(s => s.spectrumPeakTrailTint)
  const setPeakTrailTint = useStore(s => s.setSpectrumPeakTrailTint)
  // R21.21 — alternate hue palettes. Only used when the tint above is
  // ON; the chip appears beside the tint chip when active so users
  // discover the rail without an extra panel. Cycles warmCool →
  // rainbow → cool → warm → mono → warmCool on click. Persisted.
  const peakTrailPalette = useStore(s => s.spectrumPeakTrailPalette)
  const setPeakTrailPalette = useStore(s => s.setSpectrumPeakTrailPalette)
  // Popover open state for the param editor — hidden by default to
  // keep the overlay tidy. Opens via long-press on the curve chip
  // OR via a dedicated `…` button (rendered only when params exist
  // for the active curve).
  const [paramsOpen, setParamsOpen] = useState(false)
  const canvasRef = useRef(null)
  const rafRef = useRef(0)
  const scratchRef = useRef(null)
  // Peak-hold state — Float32Array of held bar heights + Int32Array of
  // frames-since-plateau, allocated once per active session. Re-created
  // when the bar count changes (BAR_COUNT is stable, but we still gate
  // the alloc on first run inside the rAF tick).
  const peakStateRef = useRef(null)

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
      // Tick the peak-hold state ONCE per frame using the freshly-
      // projected bars. Lazy-allocate when the toggle flips ON so we
      // don't pay the Float32Array cost when the user doesn't want peaks.
      if (peakHolds) {
        if (!peakStateRef.current || peakStateRef.current.peaks.length !== bars.length) {
          peakStateRef.current = makePeakHoldState(bars.length)
        }
        tickPeakHolds(peakStateRef.current, bars)
      } else if (peakStateRef.current) {
        // Toggle just flipped off — clear so a re-enable starts fresh.
        resetPeakHolds(peakStateRef.current)
      }
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
        // Peak-hold line: thin horizontal slab at the held peak height.
        // Only draws when peaks are visibly above the live bar — when
        // the peak has caught back up to the bar there's no daylight to
        // paint, and drawing on top of the cap looks like a fat line.
        if (peakHolds && peakStateRef.current) {
          const peakH = peakStateRef.current.peaks[i] || 0
          if (peakH > h + 1) {  // ≥ 1px gap so we don't paint on top of the cap
            const peakY = baseY - peakH
            ctx.fillStyle = `hsla(${hueWrapped}, 100%, 84%, 0.92)`
            ctx.fillRect(x + 0.5, peakY, barW, PEAK_LINE_THICKNESS)
          }
          // R15.07 — peak-hold trail. Replays the last ~200ms of peak
          // positions at a falling alpha so transients leave a
          // cinematic afterimage instead of vanishing in one frame.
          // Walks oldest → newest so the youngest sample paints LAST
          // (on top) — the gradient reads as a head-leading flame.
          // R16.17 — `peakCurve` reshapes the alpha distribution:
          // 'exp' bias toward fresh, 'log' bias toward the tail.
          // R19.12 — `peakCurveParams` tunes the shape per-curve
          // (exp.exponent, log.base) — the live params object is
          // passed straight through to readPeakTrail.
          const tail = readPeakTrail(peakStateRef.current, i, h, { curve: peakCurve, curveParams: peakCurveParams })
          // R20.13 — when tint is ON, the trail uses its OWN warm→cool
          // hue ramp keyed to barIndex (separate from the bar's hue
          // above). When OFF, the trail inherits the bar's own hue so
          // it reads as a glow extension (R15.07 / R16.17 / R19.12 look).
          // R21.21 — when tint is ON, the active PALETTE name selects
          // the hue ramp shape (warmCool / rainbow / cool / warm / mono).
          // Default 'warmCool' preserves the exact R20.13 look so an
          // existing user with tint enabled sees no behavioural change.
          const trailHue = peakTrailTint
            ? peakTrailHueForBarIndexPalette(i, bars.length, peakTrailPalette)
            : hueWrapped
          for (let k = 0; k < tail.length; k++) {
            const sample = tail[k]
            const trailY = baseY - sample.height
            ctx.fillStyle = `hsla(${trailHue}, 100%, 84%, ${sample.alpha})`
            ctx.fillRect(x + 0.5, trailY, barW, PEAK_LINE_THICKNESS)
          }
        }
        sumIntensity += (h / HEIGHT)
      }
      const avgIntensity = sumIntensity / Math.max(1, bars.length)
      ctx.fillStyle = 'rgba(232,232,240,0.55)'
      ctx.font = '9px Geist Mono, JetBrains Mono, monospace'
      ctx.fillText(`avg ${avgIntensity.toFixed(2)}`, WIDTH - 56, HEIGHT - 6)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [active, mode, spectrumScale, peakHolds, peakCurve, peakCurveParams, peakTrailTint, peakTrailPalette])

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
      {mode === 'frequency' && (
        <button
          type="button"
          onClick={() => setPeakHolds(!peakHolds)}
          title={peakHolds
            ? 'Peak-hold lines ON — thin line stays at each bar\u2019s recent peak. Click to hide.'
            : 'Peak-hold lines OFF — click to show classic EQ peak markers.'}
          style={{
            position: 'absolute', top: 8, left: 96,
            pointerEvents: 'auto',
            padding: '2px 8px', borderRadius: 5,
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: peakHolds ? '#bef264' : '#d8d8e0',
            background: peakHolds
              ? 'rgba(132,204,22,0.16)'
              : 'rgba(255,255,255,0.06)',
            border: peakHolds
              ? '1px solid rgba(132,204,22,0.40)'
              : '1px solid rgba(255,255,255,0.14)',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>pk</button>
      )}
      {/* R16.17 — per-bar fade-out curve preset chip. Cycles linear →
          exp → log → linear on click. Only renders when peak-holds
          are ON (the trail rides on the held peaks, so the chip would
          have no audible effect with peaks off). Sky-blue accent so it
          reads as adjacent-but-distinct from the `pk` toggle.
          R19.12 — also acts as a long-press handle for the params
          popover: hold the chip for ~400ms to open the param editor
          (exp's exponent, log's base). Linear has no params so the
          long-press is a no-op there. A small `·` indicator next to
          the chip label shows when the curve has non-default params. */}
      {mode === 'frequency' && peakHolds && (
        <CurveChipWithLongPress
          peakCurve={peakCurve}
          peakCurveParams={peakCurveParams}
          onClick={() => setPeakCurve(nextTrailCurve(peakCurve))}
          onLongPress={() => {
            // Open the popover only when the active curve actually has
            // tunable params — otherwise the click handler still cycles
            // the curve, so a long-press while on 'linear' is harmless.
            const schema = PEAK_TRAIL_CURVE_PARAMS[peakCurve]
            if (schema && Object.keys(schema).length > 0) setParamsOpen(true)
          }}
        />
      )}
      {/* R20.13 — frequency-coloured tint chip. Toggles between trail
          inheriting the bar's hue (default, R15.07/R16.17/R19.12 look)
          and the warm→cool frequency-keyed ramp (bass warm, treble
          cool). Only renders alongside the peak-hold chip so the
          option only surfaces when there's actually a trail to tint. */}
      {mode === 'frequency' && peakHolds && (
        <button
          type="button"
          onClick={() => setPeakTrailTint(!peakTrailTint)}
          title={peakTrailTint
            ? 'Frequency tint ON — trail uses warm (bass) → cool (treble) hue ramp. Click to inherit the bar\u2019s own hue.'
            : 'Frequency tint OFF — trail inherits the bar\u2019s hue. Click to paint the trail as a warm→cool frequency map.'}
          style={{
            position: 'absolute', top: 8, left: 154,
            pointerEvents: 'auto',
            padding: '2px 8px', borderRadius: 5,
            fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase',
            // When ON, use a gradient that hints at the warm→cool ramp
            // so the chip itself previews the visual it controls.
            color: peakTrailTint ? '#fed7aa' : '#d8d8e0',
            background: peakTrailTint
              ? 'linear-gradient(90deg, rgba(251,146,60,0.22), rgba(139,92,246,0.22))'
              : 'rgba(255,255,255,0.06)',
            border: peakTrailTint
              ? '1px solid rgba(251,146,60,0.40)'
              : '1px solid rgba(255,255,255,0.14)',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>tint</button>
      )}
      {/* R21.21 — palette chip rail (only renders when tint is ON since
          the palette only affects the trail's tinted output). Clicking
          cycles through warmCool → rainbow → cool → warm → mono. The
          chip's background previews the palette via a horizontal
          gradient sampled from PEAK_TRAIL_PALETTES so the user can
          recognise which palette is active without expanding a menu. */}
      {mode === 'frequency' && peakHolds && peakTrailTint && (() => {
        const def = PEAK_TRAIL_PALETTES[peakTrailPalette] || PEAK_TRAIL_PALETTES.warmCool
        // Build a 3-stop linear-gradient preview so the chip itself
        // shows the palette's shape (start / mid / end). Mid stop helps
        // the rainbow palette read as wider than warmCool at a glance.
        const midHue = (def.start + def.end) / 2
        const previewGradient = `linear-gradient(90deg, hsla(${def.start},80%,55%,0.32), hsla(${midHue},80%,55%,0.32), hsla(${def.end},80%,55%,0.32))`
        return (
          <button
            type="button"
            onClick={() => setPeakTrailPalette(nextTrailPalette(peakTrailPalette))}
            title={`Trail palette: ${def.label}. Click to cycle (${Object.keys(PEAK_TRAIL_PALETTES).length} options: warm→cool, rainbow, cool, warm, mono).`}
            style={{
              position: 'absolute', top: 8, left: 188,
              pointerEvents: 'auto',
              padding: '2px 8px', borderRadius: 5,
              fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#f1f5f9',
              background: previewGradient,
              border: '1px solid rgba(255,255,255,0.22)',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
              // Tight chip — palette label is at most 7 chars (warm→cool)
              minWidth: 46, textAlign: 'center',
            }}>{def.label}</button>
        )
      })()}
      {/* R19.12 — params popover. Renders a single slider per param
          for the active curve. Hidden by default; opens via the curve
          chip's long-press handler (above). Reset button surfaces a
          single-click path back to the shipped defaults across ALL
          curves (matches the existing chip-override patterns where
          resets are atomic, not per-knob). */}
      {mode === 'frequency' && peakHolds && paramsOpen && (
        <div style={{
          position: 'absolute', top: 36, left: 8, right: 8,
          padding: '10px 12px',
          borderRadius: 8,
          background: 'linear-gradient(180deg, rgba(10,10,20,0.94), rgba(6,6,14,0.96))',
          border: '1px solid rgba(56,189,248,0.45)',
          boxShadow: '0 10px 32px rgba(0,0,0,0.6), 0 0 18px rgba(56,189,248,0.18)',
          backdropFilter: 'blur(14px)',
          pointerEvents: 'auto',
          zIndex: 4,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
              color: '#7dd3fc', textTransform: 'uppercase',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            }}>
              {peakCurve} curve
            </span>
            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              {!isCurveParamsAtDefaults(peakCurveParams) && (
                <button
                  type="button"
                  onClick={() => resetPeakCurveParams()}
                  title="Reset every curve's params back to the shipped defaults"
                  style={{
                    padding: '2px 7px', borderRadius: 4,
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.06em',
                    color: '#fca5a5', textTransform: 'uppercase',
                    background: 'rgba(239,68,68,0.10)',
                    border: '1px solid rgba(239,68,68,0.32)',
                    cursor: 'pointer',
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  }}>reset</button>
              )}
              <button
                type="button"
                onClick={() => setParamsOpen(false)}
                title="Close params editor"
                style={{
                  width: 18, height: 18, padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, fontSize: 10, lineHeight: 1, fontWeight: 700,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#9a9ab0', cursor: 'pointer',
                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                }}>{'\u00d7'}</button>
            </div>
          </div>
          {Object.entries(PEAK_TRAIL_CURVE_PARAMS[peakCurve] || {}).map(([key, def]) => {
            const live = (peakCurveParams && peakCurveParams[peakCurve]
              && key in peakCurveParams[peakCurve])
              ? peakCurveParams[peakCurve][key]
              : def.default
            const atDefault = live === def.default
            return (
              <div key={key} style={{ marginBottom: 6 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 3, fontSize: 10,
                }}>
                  <span style={{ color: '#c8c8d0', fontWeight: 500 }}>{def.label}</span>
                  <span style={{
                    color: atDefault ? '#7a7a90' : '#7dd3fc',
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    fontSize: 10, fontWeight: 600,
                  }}>{live.toFixed(2)}{!atDefault && (<span style={{ color: '#56b6e6', marginLeft: 4 }}>{'\u2022'}</span>)}</span>
                </div>
                <input
                  type="range"
                  min={def.min} max={def.max} step={def.step} value={live}
                  onChange={(e) => setPeakCurveParam(peakCurve, key, parseFloat(e.target.value))}
                  title={def.hint}
                  style={{ width: '100%' }}
                />
              </div>
            )
          })}
          <div style={{
            fontSize: 9, color: '#7a7a90',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            marginTop: 4, lineHeight: 1.4,
          }}>
            {PEAK_TRAIL_CURVE_PARAMS[peakCurve] && Object.values(PEAK_TRAIL_CURVE_PARAMS[peakCurve])[0]?.hint}
          </div>
        </div>
      )}
    </div>
  )
}

// R19.12 — tiny wrapper around the curve chip that detects a long-
// press (≥400ms hold without movement) and fires onLongPress, while
// preserving the original click handler for the cycle behaviour.
// Click fires when the chord ENDS in under 400ms; long-press fires
// at 400ms and suppresses the subsequent click. Pointer-event based
// so it works on touch + mouse.
function CurveChipWithLongPress({ peakCurve, peakCurveParams, onClick, onLongPress }) {
  const timerRef = useRef(0)
  const firedRef = useRef(false)
  const startPress = () => {
    firedRef.current = false
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      firedRef.current = true
      if (onLongPress) onLongPress()
    }, 400)
  }
  const endPress = () => {
    clearTimeout(timerRef.current)
    timerRef.current = 0
    if (!firedRef.current && onClick) onClick()
    firedRef.current = false
  }
  const cancelPress = () => {
    clearTimeout(timerRef.current)
    timerRef.current = 0
    firedRef.current = false
  }
  useEffect(() => () => clearTimeout(timerRef.current), [])
  // R19.12 — show a small dot next to the chip label if THIS curve
  // has been tweaked away from its shipped defaults. The dot reads
  // as an unmistakable "I'm carrying custom params" cue without
  // taking extra screen real estate.
  const customDot = peakCurveParams && peakCurveParams[peakCurve]
    && Object.entries(PEAK_TRAIL_CURVE_PARAMS[peakCurve] || {}).some(
      ([k, def]) => peakCurveParams[peakCurve][k] !== def.default)
  return (
    <button
      type="button"
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      title={(peakCurve === 'linear'
        ? 'Trail fade curve: LINEAR — even falloff. Click to bias toward fresh samples (EXP).'
        : peakCurve === 'exp'
          ? 'Trail fade curve: EXP — fresh samples dominate, tail fades fast. Click for LOG. Hold to tweak the exponent.'
          : 'Trail fade curve: LOG — tail lingers, recent samples ramp gently. Click for LINEAR. Hold to tweak the base.')
        + (customDot ? ' \u2022 custom params active' : '')}
      style={{
        position: 'absolute', top: 8, left: 122,
        pointerEvents: 'auto',
        padding: '2px 8px', borderRadius: 5,
        fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: peakCurve === 'linear' ? '#d8d8e0' : peakCurve === 'exp' ? '#7dd3fc' : '#a5f3fc',
        background: peakCurve === 'linear'
          ? 'rgba(255,255,255,0.06)'
          : peakCurve === 'exp'
            ? 'rgba(56,189,248,0.16)'
            : 'rgba(34,211,238,0.16)',
        border: peakCurve === 'linear'
          ? '1px solid rgba(255,255,255,0.14)'
          : peakCurve === 'exp'
            ? '1px solid rgba(56,189,248,0.40)'
            : '1px solid rgba(34,211,238,0.40)',
        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        cursor: 'pointer',
        backdropFilter: 'blur(4px)',
        display: 'inline-flex', alignItems: 'center', gap: 4,
      }}>
      {peakCurve === 'linear' ? 'lin' : peakCurve}
      {customDot && <span style={{
        width: 4, height: 4, borderRadius: '50%',
        background: '#7dd3fc',
        boxShadow: '0 0 4px rgba(125,211,252,0.6)',
        display: 'inline-block',
      }} />}
    </button>
  )
}
