import { useRef, useEffect, useState } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'
import { buildShareUrl } from '../lib/share'
import { captureFromCanvas, appendSnapshot, loadSnapshots, saveSnapshots } from '../lib/snapshotGallery'
import { createLoop, DEMO_LOOPS } from '../lib/demoAudioLoops'
import { loadKeymap, resolveAction } from '../lib/keymap'
import { TIMER_DELAYS, labelForDelay, BURST_COUNTS, labelForBurst } from '../lib/selfTimer'
import { formatCalmToast } from '../lib/calmMode'
import { showToast } from './Toast'
import {
  Play, Pause, RotateCcw, Maximize2, Shuffle, Magnet, Camera, Link2,
  Mic, Download, Settings, Repeat, Sparkles, Zap, Paintbrush, Send, Images, Music2, Timer, Layers, Wind,
} from 'lucide-react'

// R34.C — module-level screenshot helpers. Kept out of the component
// so the capture-now / legacy-screenshot event listeners (and the
// keymap dispatcher) can reference them without becoming effect deps
// (they read live state via useStore.getState(), no closure needed).

// Do the real PNG capture from the live canvas + stash it in the
// in-app gallery. Fired by the ScreenshotTimer overlay's
// `particle:capture-now` after a countdown, or directly for 0 delay.
function captureScreenshotNow() {
  const canvas = document.querySelector('#particle-canvas canvas')
  if (!canvas) return
  const { infoTitle, currentPreset, bumpSessionStat } = useStore.getState()
  const name = (infoTitle || currentPreset || 'particles').replace(/\s+/g, '-').toLowerCase()
  const ts = Date.now()
  const link = document.createElement('a')
  link.download = `particle-${name}-${ts}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
  bumpSessionStat('screenshotsTaken', 1)
  // Also stash the snapshot in the in-app gallery so users can revisit
  // / re-download without re-firing the scene. After the download so
  // the gallery op can't slow down the user-facing save.
  try {
    const entry = captureFromCanvas(canvas)
    if (entry) {
      const next = appendSnapshot(loadSnapshots(), {
        ...entry,
        label: infoTitle || currentPreset || 'particles',
        preset: currentPreset || null,
      })
      saveSnapshots(next)
      window.dispatchEvent(new CustomEvent('particle:snapshot-saved', { detail: next.length }))
    }
  } catch (e) { console.warn('Snapshot gallery stash failed:', e) }
}

// Entry point for a screenshot request: route through the self-timer
// when a delay is set, else capture immediately. The burst count rides
// on the timed path (it needs the countdown's staging moment).
function requestScreenshot() {
  const { screenshotTimerDelay, screenshotBurstCount } = useStore.getState()
  if (screenshotTimerDelay > 0) {
    window.dispatchEvent(new CustomEvent('particle:screenshot-timed', {
      detail: { delay: screenshotTimerDelay, burst: screenshotBurstCount },
    }))
  } else {
    captureScreenshotNow()
  }
}

export default function TopBar({ onSettings, onToggleGallery, galleryOpen, snapshotCount }) {
  const { playing, setPlaying, loadRandom, smashRandom, mouseAttract, setMouseAttract, paintMode, setPaintMode, clearPaintPoints, setAudioReactive, isRecording, startRecording, stopRecording, recordingBuffer, enterReplay, isReplaying, screenshotTimerDelay, setScreenshotTimerDelay, screenshotBurstCount, setScreenshotBurstCount } = useStore()
  const audioCtxRef = useRef(null)
  const streamRef = useRef(null)
  const analyserRef = useRef(null)
  const demoLoopRef = useRef(null)
  // Which audio source is active: null | 'mic' | 'demo'. Tracked
  // separately from `audioReactive` so toggling between sources doesn't
  // need a full teardown of the store flag. `activeDemoKind` mirrors
  // demoLoopRef.current?.kind so the render path never has to read
  // the ref (which would violate the React refs rule).
  const [audioSource, setAudioSource] = useState(null)
  const [activeDemoKind, setActiveDemoKind] = useState(null)
  const [demoMenuOpen, setDemoMenuOpen] = useState(false)

  const handleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else document.documentElement.requestFullscreen()
  }

  const handleExport = () => {
    const { particleFnSource, infoTitle, particleCount, glowIntensity } = useStore.getState()
    const html = generateExportHTML(particleFnSource, infoTitle, particleCount, glowIntensity)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(infoTitle || 'particles').replace(/\s+/g, '-').toLowerCase()}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleScreenshot = () => requestScreenshot()

  const handleShare = () => {
    const url = buildShareUrl(useStore.getState())
    navigator.clipboard.writeText(url).then(() => {
      const notif = document.getElementById('perf-notif')
      if (notif) { notif.textContent = '🔗 URL copied to clipboard!'; notif.style.opacity = '1'; setTimeout(() => notif.style.opacity = '0', 2000) }
    }).catch(() => {
      window.prompt('Share URL:', url)
    })
  }

  const handleTweet = () => {
    const s = useStore.getState()
    const url = buildShareUrl(s)
    const name = s.infoTitle || s.currentPreset || 'a particle scene'
    const text = encodeURIComponent(`Check out "${name}" in AI Particle Simulator`)
    const u = encodeURIComponent(url)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${u}`,
      '_blank', 'noopener,noreferrer')
  }

  // Shared teardown — used by both mic-off and demo-stop so we never
  // leave a dangling stream / ctx / oscillator behind.
  const teardownAudio = () => {
    if (demoLoopRef.current) { demoLoopRef.current.stop(); demoLoopRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
    analyserRef.current = null
    // Tell waveform/etc subscribers the analyser is gone.
    if (typeof window !== 'undefined') window.__particleAudioAnalyser = null
    setAudioReactive(false)
    setAudioSource(null)
    setActiveDemoKind(null)
    useStore.getState().setAudioLevel(0)
    useStore.getState().setAudioBands(0, 0, 0)
    useStore.getState().setAudioBeat(0)
  }

  // Start the analyser-polling loop against the active analyser. The
  // store's bass/mid/treble/level/beat values get updated every frame
  // — same code path the mic uses, so any audio-reactive feature
  // (camera shake, audio scaling, visualizer bar) just works.
  const startAnalyserLoop = () => {
    const analyser = analyserRef.current
    if (!analyser) return
    const data = new Uint8Array(analyser.frequencyBinCount)
    const bassHistory = []
    let lastBeatTime = 0
    const poll = () => {
      if (!audioCtxRef.current || analyserRef.current !== analyser) return
      analyser.getByteFrequencyData(data)
      const n = data.length
      const bassEnd = Math.floor(n * 0.12)
      const midEnd = Math.floor(n * 0.40)
      let sumBass = 0, sumMid = 0, sumTreble = 0, sumAll = 0
      for (let k = 0; k < n; k++) {
        const v = data[k]
        sumAll += v
        if (k < bassEnd) sumBass += v
        else if (k < midEnd) sumMid += v
        else sumTreble += v
      }
      const bass   = (sumBass   / Math.max(1, bassEnd))         / 255
      const mid    = (sumMid    / Math.max(1, midEnd - bassEnd))/ 255
      const treble = (sumTreble / Math.max(1, n - midEnd))      / 255
      const avg    = sumAll / n / 255
      useStore.getState().setAudioLevel(avg)
      useStore.getState().setAudioBands(bass, mid, treble)
      bassHistory.push(bass)
      if (bassHistory.length > 60) bassHistory.shift()
      const baseline = bassHistory.reduce((s, b) => s + b, 0) / bassHistory.length
      const now = performance.now()
      if (bass > baseline * 1.4 && bass > 0.18 && now - lastBeatTime > 200) {
        lastBeatTime = now
        useStore.getState().setAudioBeat(1)
      } else {
        const cur = useStore.getState().audioBeat
        if (cur > 0) useStore.getState().setAudioBeat(Math.max(0, cur - 0.04))
      }
      requestAnimationFrame(poll)
    }
    poll()
  }

  const handleMic = async () => {
    // If demo is playing, swap it out for the mic without flicker.
    if (audioSource === 'demo') teardownAudio()
    if (audioSource === 'mic') { teardownAudio(); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const src = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      src.connect(analyser)
      analyserRef.current = analyser
      if (typeof window !== 'undefined') window.__particleAudioAnalyser = analyser
      setAudioSource('mic')
      setAudioReactive(true)
      startAnalyserLoop()
    } catch (e) {
      console.error('Mic access denied:', e)
    }
  }

  // Toggle one of the built-in demo loops. Pipes a synthesized signal
  // through the same analyser the mic uses so every audio-reactive
  // feature (level/bass/beat, camera shake) responds identically.
  const handleDemo = async (kind) => {
    // Toggle off if the same loop is already running.
    if (audioSource === 'demo' && activeDemoKind === kind) {
      teardownAudio()
      setDemoMenuOpen(false)
      return
    }
    // Swap mic / other demo out first so we never stack contexts.
    teardownAudio()
    try {
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      // Resume in case the browser auto-suspended the context (Safari
      // does this until a user gesture).
      if (ctx.state === 'suspended') await ctx.resume()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      analyserRef.current = analyser
      if (typeof window !== 'undefined') window.__particleAudioAnalyser = analyser
      const loop = createLoop(ctx, kind)
      if (!loop) return
      demoLoopRef.current = loop
      // Connect the loop to BOTH the analyser (for visuals) and
      // destination (so users actually hear the music). Routing
      // through the analyser-only branch would make the feature
      // confusing — "where's the audio?".
      loop.node.connect(analyser)
      loop.node.connect(ctx.destination)
      setAudioSource('demo')
      setActiveDemoKind(kind)
      setAudioReactive(true)
      setDemoMenuOpen(false)
      startAnalyserLoop()
    } catch (e) {
      console.error('Demo loop start failed:', e)
    }
  }

  // Tear down when the component unmounts so no audio leaks if the
  // user navigates away mid-loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => teardownAudio(), [])

  // R34.C — screenshot capture wiring. `particle:capture-now` does the
  // real PNG capture (fired by the ScreenshotTimer overlay after its
  // countdown, or directly for a 0-delay). `particle:screenshot` is
  // the legacy command-palette trigger — route it through the timer
  // so the chosen delay applies everywhere. Both handlers call
  // module-level helpers, so this effect has no reactive deps.
  useEffect(() => {
    const onCaptureNow = () => captureScreenshotNow()
    const onLegacyScreenshot = () => requestScreenshot()
    document.addEventListener('particle:capture-now', onCaptureNow)
    document.addEventListener('particle:screenshot', onLegacyScreenshot)
    return () => {
      document.removeEventListener('particle:capture-now', onCaptureNow)
      document.removeEventListener('particle:screenshot', onLegacyScreenshot)
    }
  }, [])

  useEffect(() => {
    // Live keymap snapshot — reloaded on every keypress so a remap
    // applied in Settings takes effect without a refresh. Cheap (one
    // localStorage read), runs only when a non-typing keystroke hits
    // the window.
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = loadKeymap()
      const actionId = resolveAction(map, e)
      if (!actionId) {
        // Digit shortcuts (1–9, 0) are not in the remap registry yet —
        // they preserve the legacy "jump to preset N" behaviour.
        if (e.code && e.code.startsWith('Digit')) {
          const num = e.code === 'Digit0' ? 9 : parseInt(e.code.slice(5)) - 1
          if (num >= 0 && num < presets.length) {
            useStore.getState().loadPreset(presets[num].id)
          }
        }
        return
      }
      const { setPlaying, playing, loadRandom, nextPreset, prevPreset, toggleFavorite } = useStore.getState()
      switch (actionId) {
        case 'play':       e.preventDefault(); setPlaying(!playing); break
        case 'random':     loadRandom(); break
        case 'next':       e.preventDefault(); nextPreset(); break
        case 'prev':       e.preventDefault(); prevPreset(); break
        case 'fullscreen': handleFullscreen(); break
        case 'favorite': {
          const cur = useStore.getState().currentPreset
          if (cur) {
            toggleFavorite(cur)
            const notif = document.getElementById('perf-notif')
            if (notif) {
              const isFav = useStore.getState().favoritedPresets.includes(cur)
              notif.textContent = isFav ? '★ Added to favorites' : '☆ Removed from favorites'
              notif.style.opacity = '1'
              setTimeout(() => notif.style.opacity = '0', 1500)
            }
          }
          break
        }
        case 'screenshot': requestScreenshot(); break
        // saveView, bookmark, bookmarkPanel, help are handled by the
        // components that own those features — they read the keymap
        // themselves so the dispatcher doesn't need refs into them.
        default: break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: 'linear-gradient(180deg, rgba(6,6,10,0.78) 0%, rgba(10,10,18,0.62) 100%)',
      backdropFilter: 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: '#eeeef0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <span className="logo-mark">
            <Sparkles size={12} strokeWidth={2.5} color="#fff" />
          </span>
          Particle Simulator
        </span>
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
          title="Open command palette"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px 4px 10px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: '#9a9ab0',
            fontSize: 11,
            cursor: 'pointer',
            transition: 'all 0.18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.08)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)' }}
        >
          Search
          <span style={{ display: 'inline-flex', gap: 2 }}><kbd>⌘</kbd><kbd>K</kbd></span>
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Btn onClick={() => setPlaying(!playing)} title={playing ? 'Pause (Space)' : 'Play (Space)'}>
          {playing ? <Pause size={14} strokeWidth={2.2} /> : <Play size={14} strokeWidth={2.2} />}
        </Btn>
        <RecordBtn isRecording={isRecording} onClick={() => isRecording ? stopRecording() : startRecording()} />
        {recordingBuffer.length > 0 && !isReplaying && (
          <Btn onClick={enterReplay} title="Enter Replay"><Repeat size={14} strokeWidth={2.2} /></Btn>
        )}
        <Btn onClick={() => {
          const { loadPreset, currentPreset, loadCustomCode, particleFnSource, infoTitle, infoDesc } = useStore.getState()
          if (currentPreset) loadPreset(currentPreset)
          else loadCustomCode(particleFnSource, infoTitle, infoDesc)
        }} title="Reset Camera"><RotateCcw size={14} strokeWidth={2.2} /></Btn>
        <Divider />
        <Btn onClick={handleFullscreen} title="Fullscreen (F)"><Maximize2 size={14} strokeWidth={2.2} /></Btn>
        <Btn onClick={loadRandom} title="Random Preset (R)"><Shuffle size={14} strokeWidth={2.2} /></Btn>
        <Btn onClick={smashRandom} title="Smash — random preset + style + theme"><Zap size={14} strokeWidth={2.2} /></Btn>
        <Btn onClick={() => setMouseAttract(!mouseAttract)} title="Mouse Attract" active={mouseAttract}><Magnet size={14} strokeWidth={2.2} /></Btn>
        <Btn
          onClick={() => { if (paintMode) clearPaintPoints(); setPaintMode(!paintMode) }}
          title={paintMode ? 'Paint Mode · click again to clear & exit' : 'Paint Mode — drag to stamp attractors'}
          active={paintMode}
        ><Paintbrush size={14} strokeWidth={2.2} /></Btn>
        <Btn onClick={handleMic} title={audioSource === 'mic' ? 'Stop mic' : 'Sound Reactivity (mic)'} active={audioSource === 'mic'}><Mic size={14} strokeWidth={2.2} /></Btn>
        <DemoAudioBtn
          active={audioSource === 'demo'}
          activeKind={activeDemoKind}
          open={demoMenuOpen}
          onToggle={() => setDemoMenuOpen(o => !o)}
          onPick={handleDemo}
        />
        <Divider />
        <CalmModeBtn />
        <Divider />
        <Btn onClick={handleScreenshot} title="Screenshot (S)"><Camera size={14} strokeWidth={2.2} /></Btn>
        <TimerBtn
          delay={screenshotTimerDelay}
          onCycle={() => {
            const idx = TIMER_DELAYS.indexOf(screenshotTimerDelay)
            const next = TIMER_DELAYS[(idx + 1) % TIMER_DELAYS.length]
            setScreenshotTimerDelay(next)
          }}
        />
        {screenshotTimerDelay > 0 && (
          <BurstBtn
            count={screenshotBurstCount}
            onCycle={() => {
              const idx = BURST_COUNTS.indexOf(screenshotBurstCount)
              const next = BURST_COUNTS[(idx + 1) % BURST_COUNTS.length]
              setScreenshotBurstCount(next)
            }}
          />
        )}
        <GalleryBtn onClick={onToggleGallery} active={galleryOpen} count={snapshotCount} />
        <Btn onClick={handleShare} title="Share URL"><Link2 size={14} strokeWidth={2.2} /></Btn>
        <Btn onClick={handleTweet} title="Tweet this scene"><Send size={14} strokeWidth={2.2} /></Btn>
        <Btn onClick={handleExport} title="Export HTML"><Download size={14} strokeWidth={2.2} /></Btn>
        <Divider />
        <Btn onClick={onSettings} title="Settings"><Settings size={14} strokeWidth={2.2} /></Btn>
      </div>
      </div>
    </div>
  )
}

function RecordBtn({ isRecording, onClick }) {
  return (
    <button
      onClick={onClick}
      title={isRecording ? 'Stop Recording' : 'Record'}
      style={{
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 0.15s ease-out',
        background: isRecording ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
        border: isRecording ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <span style={{
        display: 'inline-block',
        width: isRecording ? 10 : 12,
        height: isRecording ? 10 : 12,
        borderRadius: isRecording ? 2 : '50%',
        background: '#ef4444',
        animation: isRecording ? 'pulse-rec 1s ease-in-out infinite' : 'none',
      }} />
      <style>{`@keyframes pulse-rec { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </button>
  )
}

function Divider() {
  return <div style={{
    width: 1, height: 18,
    background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.1) 50%, transparent)',
    margin: '0 6px',
  }} />
}

// Gallery toggle with a subtle count badge in the corner so users
// always know how many snapshots are stashed. Looks like the other
// toolbar buttons when count=0 and gains the badge once items exist.
function GalleryBtn({ onClick, active, count }) {
  return (
    <button
      onClick={onClick}
      title={count > 0 ? `Snapshot Gallery (${count})` : 'Snapshot Gallery — empty'}
      style={{
        position: 'relative',
        width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9, cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        background: active
          ? 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(236,72,153,0.2) 100%)'
          : 'rgba(255,255,255,0.035)',
        color: active ? '#e9d5ff' : '#c8c8d0',
        border: active ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.05)',
        boxShadow: active ? '0 0 16px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.color = '#c8c8d0'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      <Images size={14} strokeWidth={2.2} />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -3, right: -3,
          minWidth: 14, height: 14, padding: '0 4px',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          color: '#fff', fontSize: 9, fontWeight: 700,
          borderRadius: 7, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid rgba(10,10,16,0.95)',
          fontFamily: 'Geist Mono, monospace',
          lineHeight: 1,
        }}>{count > 99 ? '99+' : count}</span>
      )}
    </button>
  )
}

// R34.C — screenshot self-timer toggle. Click cycles the delay
// (Off -> 3s -> 5s -> 10s -> Off); the active delay shows as a badge so
// users always know whether the next screenshot will count down. Acts
// as the discoverable surface for the feature next to the camera button.
function TimerBtn({ delay, onCycle }) {
  const active = delay > 0
  return (
    <button
      onClick={onCycle}
      title={active
        ? `Self-timer: ${labelForDelay(delay)} — click to change (Off / 3s / 5s / 10s)`
        : 'Self-timer: Off — click to count down before capture'}
      style={{
        position: 'relative',
        width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9, cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        background: active
          ? 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(236,72,153,0.2) 100%)'
          : 'rgba(255,255,255,0.035)',
        color: active ? '#e9d5ff' : '#c8c8d0',
        border: active ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.05)',
        boxShadow: active ? '0 0 16px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.color = '#c8c8d0'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      <Timer size={14} strokeWidth={2.2} />
      {active && (
        <span style={{
          position: 'absolute', top: -3, right: -4,
          minWidth: 14, height: 14, padding: '0 3px',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          color: '#fff', fontSize: 8.5, fontWeight: 700,
          borderRadius: 7, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid rgba(10,10,16,0.95)',
          fontFamily: 'Geist Mono, monospace',
          lineHeight: 1,
        }}>{labelForDelay(delay)}</span>
      )}
    </button>
  )
}

// R35.C — burst-mode toggle. Only shown when the self-timer is armed
// (it rides on the countdown). Click cycles 1 -> 3 -> 5 shots; the count
// shows as a badge when > 1 so the user knows the next capture fires a
// sequence they can pick the best frame from.
function BurstBtn({ count, onCycle }) {
  const active = count > 1
  return (
    <button
      onClick={onCycle}
      title={active
        ? `Burst: ${labelForBurst(count)} shots after the countdown — click to change (Single / x3 / x5)`
        : 'Burst: Single — click to capture a sequence after the countdown'}
      style={{
        position: 'relative',
        width: 30, height: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 9, cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        background: active
          ? 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(236,72,153,0.2) 100%)'
          : 'rgba(255,255,255,0.035)',
        color: active ? '#e9d5ff' : '#c8c8d0',
        border: active ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.05)',
        boxShadow: active ? '0 0 16px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.color = '#c8c8d0'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      <Layers size={14} strokeWidth={2.2} />
      {active && (
        <span style={{
          position: 'absolute', top: -3, right: -4,
          minWidth: 14, height: 14, padding: '0 3px',
          background: 'linear-gradient(135deg, #a855f7, #ec4899)',
          color: '#fff', fontSize: 8.5, fontWeight: 700,
          borderRadius: 7, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid rgba(10,10,16,0.95)',
          fontFamily: 'Geist Mono, monospace',
          lineHeight: 1,
        }}>{labelForBurst(count)}</span>
      )}
    </button>
  )
}

// R36.K — global calm-mode master toggle. One click gates the four
// ambient camera/colour motions (auto-rotate, camera shake, hue-cycle,
// zen ambient orbit) so the user can instantly settle a busy scene
// without touching four controls or their accessibility setting. Reads
// the store directly so it stays a self-contained toolbar button.
function CalmModeBtn() {
  const calmMode = useStore(s => s.calmMode)
  const setCalmMode = useStore(s => s.setCalmMode)
  // R37.K — naming what the one-click gate changed. The toggle silently
  // affects four motions; the auto-fading toast names them so the user
  // sees exactly what was paused / resumed.
  const onToggle = () => {
    const next = !calmMode
    setCalmMode(next)
    const t = formatCalmToast(next)
    showToast(
      <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
        <span style={{ fontWeight: 600 }}>{t.title}</span>
        <span style={{ fontSize: 11, color: '#9a9ab0' }}>{t.detail}</span>
      </span>,
      <Wind size={10} color="#fff" strokeWidth={2.4} />,
    )
  }
  return (
    <Btn
      onClick={onToggle}
      active={calmMode}
      title={calmMode
        ? 'Calm mode ON — auto-rotate, shake, hue-cycle & zen orbit paused. Click to resume.'
        : 'Calm mode — pause auto-rotate, camera shake, hue-cycle & zen orbit at once'}
    >
      <Wind size={14} strokeWidth={2.2} />
    </Btn>
  )
}

function Btn({ children, onClick, title, active }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 9,
        fontSize: 13,
        cursor: 'pointer',
        transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
        background: active
          ? 'linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(236,72,153,0.2) 100%)'
          : 'rgba(255,255,255,0.035)',
        color: active ? '#e9d5ff' : '#c8c8d0',
        border: active ? '1px solid rgba(168,85,247,0.5)' : '1px solid rgba(255,255,255,0.05)',
        boxShadow: active ? '0 0 16px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
          e.currentTarget.style.color = '#c8c8d0'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      {children}
    </button>
  )
}

// Demo Audio Loops button — opens a small popover listing the
// built-in synthesized loops. Clicking a loop starts it (and feeds
// it into the same analyser the mic uses); clicking the active loop
// again stops it. Closes on outside click via the popover backdrop.
function DemoAudioBtn({ active, activeKind, open, onToggle, onPick }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={onToggle}
        title={active ? `Playing: ${activeKind} — click to choose another or stop` : 'Built-in demo audio loops (no mic needed)'}
        style={{
          width: 30, height: 30, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          borderRadius: 9, cursor: 'pointer',
          transition: 'all 0.18s cubic-bezier(0.2, 0.8, 0.2, 1)',
          background: active
            ? 'linear-gradient(135deg, rgba(34,197,94,0.25) 0%, rgba(99,102,241,0.18) 100%)'
            : 'rgba(255,255,255,0.035)',
          color: active ? '#bbf7d0' : '#c8c8d0',
          border: active ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.05)',
          boxShadow: active ? '0 0 16px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
        }}
        onMouseEnter={e => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)'
            e.currentTarget.style.color = '#fff'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.035)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.color = '#c8c8d0'
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
      >
        <Music2 size={14} strokeWidth={2.2} />
      </button>
      {open && (
        <>
          {/* Outside-click catcher */}
          <div onClick={onToggle} style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'transparent',
          }} />
          <div style={{
            position: 'absolute', top: 38, right: 0, zIndex: 65,
            width: 240,
            background: 'linear-gradient(180deg, rgba(14,14,22,0.96) 0%, rgba(10,10,18,0.94) 100%)',
            backdropFilter: 'blur(20px) saturate(140%)',
            WebkitBackdropFilter: 'blur(20px) saturate(140%)',
            border: '1px solid rgba(34,197,94,0.25)',
            borderRadius: 12,
            boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(34,197,94,0.15)',
            padding: 6,
            animation: 'demo-pop 0.16s cubic-bezier(0.2,0.8,0.2,1)',
          }}>
            <style>{`@keyframes demo-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
            <div style={{
              padding: '6px 10px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#86efac',
              borderBottom: '1px solid rgba(34,197,94,0.12)', marginBottom: 4,
            }}>
              Demo Audio Loops
            </div>
            {DEMO_LOOPS.map(l => {
              const isCurrent = active && activeKind === l.id
              return (
                <button key={l.id} onClick={() => onPick(l.id)}
                  style={{
                    width: '100%', display: 'flex', flexDirection: 'column',
                    alignItems: 'flex-start', gap: 2,
                    padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                    background: isCurrent
                      ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(99,102,241,0.12))'
                      : 'transparent',
                    color: isCurrent ? '#bbf7d0' : '#d8d8e0',
                    border: isCurrent ? '1px solid rgba(34,197,94,0.35)' : '1px solid transparent',
                    transition: 'all 0.12s ease-out', textAlign: 'left',
                    marginBottom: 2,
                  }}
                  onMouseEnter={e => {
                    if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={e => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 550 }}>{l.label}</span>
                    {isCurrent && <span style={{
                      marginLeft: 'auto', fontSize: 9, fontFamily: 'Geist Mono, monospace',
                      color: '#86efac', padding: '1px 6px', borderRadius: 4,
                      background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                    }}>PLAYING</span>}
                  </div>
                  <span style={{ fontSize: 10.5, color: '#7a7a90', lineHeight: 1.4 }}>{l.desc}</span>
                </button>
              )
            })}
            {active && (
              <button onClick={() => onPick(activeKind)}
                style={{
                  width: '100%', marginTop: 6, padding: '7px 0',
                  borderRadius: 7, fontSize: 11, fontWeight: 550, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.08)', color: '#fca5a5',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}>
                Stop
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function generateExportHTML(code, title, count, glow) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title || 'Particle Simulation'}</title>
<style>*{margin:0;padding:0}body{background:#050508;overflow:hidden}canvas{display:block}</style>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/controls/OrbitControls.js"><\/script>
</head><body><script>
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,1000);
camera.position.set(0,5,15);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);
document.body.appendChild(renderer.domElement);
const controls=new THREE.OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;

const COUNT=${count};
const positions=new Float32Array(COUNT*3);
const colors=new Float32Array(COUNT*3);
const geo=new THREE.BufferGeometry();
geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
const mat=new THREE.PointsMaterial({size:2.5,vertexColors:true,transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true});
const points=new THREE.Points(geo,mat);
scene.add(points);

const controlValues={};
const addControl=(id,label,min,max,initial)=>{controlValues[id]=initial};
const setInfo=()=>{};
const particleFn=new Function('i','count','target','color','time','THREE','addControl','setInfo','controls',${JSON.stringify(code)});
try{const _t=new THREE.Vector3(),_c=new THREE.Color();particleFn(0,COUNT,_t,_c,0,THREE,addControl,setInfo,controlValues)}catch(e){}

const _target=new THREE.Vector3(),_color=new THREE.Color();
let t=0;
function animate(){
  requestAnimationFrame(animate);
  t+=0.016;
  for(let i=0;i<COUNT;i++){
    _target.set(0,0,0);_color.setRGB(1,1,1);
    try{particleFn(i,COUNT,_target,_color,t,THREE,()=>{},()=>{},controlValues)}catch(e){break}
    const i3=i*3;
    positions[i3]=_target.x;positions[i3+1]=_target.y;positions[i3+2]=_target.z;
    colors[i3]=_color.r;colors[i3+1]=_color.g;colors[i3+2]=_color.b;
  }
  geo.attributes.position.needsUpdate=true;
  geo.attributes.color.needsUpdate=true;
  controls.update();
  renderer.render(scene,camera);
}
animate();
onresize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)};
<\/script></body></html>`
}
