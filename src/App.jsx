import { useState, useEffect, useRef } from 'react'
import { useStore } from './store'
import ParticleCanvas from './components/ParticleCanvas'
import TopBar from './components/TopBar'
import LeftSidebar from './components/LeftSidebar'
import RightSidebar from './components/RightSidebar'
import PresetCarousel from './components/PresetCarousel'
import Timeline from './components/Timeline'
import SettingsModal from './components/SettingsModal'
import StatusStrip from './components/StatusStrip'
import Toast from './components/Toast'
import { CommandPalette } from './components/CommandPalette'
import HelpOverlay from './components/HelpOverlay'
import DebugHUD from './components/DebugHUD'
import Onboarding from './components/Onboarding'
import MouseTrail from './components/MouseTrail'
import SnapshotGallery from './components/SnapshotGallery'
import Slideshow from './components/Slideshow'
import Minimap from './components/Minimap'
import MidiPanel from './components/MidiPanel'
import WaveformOverlay from './components/WaveformOverlay'
import CameraPathPlayer from './components/CameraPathPlayer'
import PresetThumbnailPrerenderer from './components/PresetThumbnailPrerenderer'
import MobileGestureHint from './components/MobileGestureHint'
import { useGlobalMidi } from './lib/useGlobalMidi'
import { loadSnapshots } from './lib/snapshotGallery'
import { useIsMobile } from './lib/useIsMobile'
import { getOSPrefersReduced, subscribeOSReducedMotion } from './lib/reducedMotion'
import { Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [midiOpen, setMidiOpen] = useState(false)
  // Listen for the global "open MIDI panel" event so any UI surface
  // (LeftSidebar button, command palette later) can trigger it.
  useEffect(() => {
    const onOpen = () => setMidiOpen(true)
    window.addEventListener('particle:open-midi', onOpen)
    return () => window.removeEventListener('particle:open-midi', onOpen)
  }, [])
  // Always-on Web MIDI listener — only requests access if the user
  // already has saved bindings (so a no-controller user never sees a
  // permission prompt).
  useGlobalMidi()
  // Splash is suppressed for reduced-motion users (the scale-in/fade-out
  // is purely decorative). Initialize state from the OS pref directly
  // so we never need a synchronous setState in an effect — that pattern
  // triggers the cascading-render lint and means a wasted render cycle.
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      const userMode = localStorage.getItem('reduced-motion-mode') || 'auto'
      if (userMode === 'reduce') return false
      if (userMode === 'full') return true
      // auto: defer to OS
      return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    } catch { return true }
  })
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [snapshotCount, setSnapshotCount] = useState(() => loadSnapshots().length)
  const isMobile = useIsMobile()
  const [leftOpen, setLeftOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 720)
  const [rightOpen, setRightOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 720)
  const loadPreset = useStore(s => s.loadPreset)
  const loadCustomCode = useStore(s => s.loadCustomCode)
  const orb1 = useRef(null), orb2 = useRef(null), orb3 = useRef(null)

  useEffect(() => {
    // For reduced-motion users showSplash was already initialized to
    // false; the timer only matters for full-motion users.
    if (!showSplash) return
    const t = setTimeout(() => setShowSplash(false), 1700)
    return () => clearTimeout(t)
  }, [showSplash])

  // Keep the snapshot badge in lock-step with the gallery's localStorage
  // state. TopBar fires this event on every successful screenshot, and
  // the gallery panel fires it after delete / clear all.
  useEffect(() => {
    const refresh = () => setSnapshotCount(loadSnapshots().length)
    window.addEventListener('particle:snapshot-saved', refresh)
    window.addEventListener('particle:snapshot-removed', refresh)
    return () => {
      window.removeEventListener('particle:snapshot-saved', refresh)
      window.removeEventListener('particle:snapshot-removed', refresh)
    }
  }, [])

  // Reduced-motion bootstrap: seed the store with the OS pref once
  // on mount, then subscribe so any later flip (user changes OS pref
  // mid-session) reflects without a refresh. The actual feature gates
  // read `reducedMotionMode` + `osPrefersReducedMotion` from the store
  // and resolve via lib/reducedMotion.
  useEffect(() => {
    const seed = getOSPrefersReduced()
    useStore.getState().setOSPrefersReducedMotion(seed)
    const unsub = subscribeOSReducedMotion((v) => {
      useStore.getState().setOSPrefersReducedMotion(v)
    })
    return unsub
  }, [])

  useEffect(() => {
    const onMove = (e) => {
      const { reducedMotionMode, osPrefersReducedMotion } = useStore.getState()
      // Skip the parallax math entirely under reduced motion — keeps
      // the orbs static so vestibular users don't get the drift.
      if (reducedMotionMode === 'reduce' || (reducedMotionMode === 'auto' && osPrefersReducedMotion)) {
        if (orb1.current) orb1.current.style.transform = 'translate(0,0)'
        if (orb2.current) orb2.current.style.transform = 'translate(0,0)'
        if (orb3.current) orb3.current.style.transform = 'translate(0,0)'
        return
      }
      const x = (e.clientX / window.innerWidth - 0.5) * 2
      const y = (e.clientY / window.innerHeight - 0.5) * 2
      if (orb1.current) orb1.current.style.transform = `translate(${x * 30}px, ${y * 30}px)`
      if (orb2.current) orb2.current.style.transform = `translate(${x * -40}px, ${y * -40}px)`
      if (orb3.current) orb3.current.style.transform = `translate(${x * 20}px, ${y * -20}px)`
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    const hash = window.location.hash
    if (hash.startsWith('#share=')) {
      try {
        const encoded = hash.slice(7)
        const json = decodeURIComponent(atob(encoded))
        const data = JSON.parse(json)
        const s = useStore.getState()
        // V1 fields (always honored).
        if (data.count) s.setParticleCount(data.count)
        if (data.speed) s.setSpeed(data.speed)
        if (data.glow) s.setGlowIntensity(data.glow)
        if (data.style) s.setVisualStyle(data.style)
        if (data.theme) s.setTheme(data.theme)

        // V2 fields — ignore silently when missing so old links keep working.
        if (data.trails != null) s.setTrails(data.trails)
        if (data.autoRotate != null) s.setAutoRotate(data.autoRotate)
        if (data.autoRotateSpeed != null) s.setAutoRotateSpeed(data.autoRotateSpeed)
        if (data.audioMode) s.setAudioMode(data.audioMode)
        if (data.mouseAttract != null) s.setMouseAttract(data.mouseAttract)
        if (data.palette) {
          s.setPaletteEnabled(true)
          if (data.palette.a) s.setPaletteA(data.palette.a)
          if (data.palette.b) s.setPaletteB(data.palette.b)
          if (data.palette.mix != null) s.setPaletteMix(data.palette.mix)
        }
        if (data.fx) {
          if (data.fx.ca != null)  s.setChromaticAberration(data.fx.ca)
          if (data.fx.caI != null) s.setChromaticIntensity(data.fx.caI)
          if (data.fx.vg != null)  s.setVignette(data.fx.vg)
          if (data.fx.vgI != null) s.setVignetteIntensity(data.fx.vgI)
          if (data.fx.fg != null)  s.setFilmGrain(data.fx.fg)
          if (data.fx.fgI != null) s.setFilmGrainIntensity(data.fx.fgI)
        }
        if (data.kaleido) {
          s.setKaleidoscopeEnabled(true)
          if (data.kaleido.segs != null) s.setKaleidoscopeSegments(data.kaleido.segs)
        }
        if (data.hueCycle) {
          s.setHueCycleEnabled(true)
          if (data.hueCycle.speed != null) s.setHueCycleSpeed(data.hueCycle.speed)
        }
        if (Array.isArray(data.forceFieldCenter) && data.forceFieldCenter.length === 3) {
          s.setForceFieldCenter(data.forceFieldCenter)
        }

        // Load scene last so dynamic controls and infoTitle render on top.
        if (data.preset) loadPreset(data.preset)
        else if (data.code) loadCustomCode(data.code)
        return
      } catch (e) { console.error('Failed to decode share URL:', e) }
    }
    loadPreset('spiral-galaxy')
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden relative app-enter">
      <div className="absolute inset-0 z-0">
        <ParticleCanvas />
      </div>
      <div ref={orb1} className="orb orb-1" style={{ zIndex: 1 }} />
      <div ref={orb2} className="orb orb-2" style={{ zIndex: 1 }} />
      <div ref={orb3} className="orb orb-3" style={{ zIndex: 1 }} />

      <div className="relative z-10 flex flex-col h-full w-full pointer-events-none">
        <div className="pointer-events-auto"><TopBar onSettings={() => setShowSettings(true)} onToggleGallery={() => setGalleryOpen(o => !o)} galleryOpen={galleryOpen} snapshotCount={snapshotCount} /></div>
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar + toggle */}
          <div className="pointer-events-auto slide-in-left" style={{
            position: isMobile ? 'absolute' : 'relative',
            top: isMobile ? 64 : undefined,
            bottom: isMobile ? 0 : undefined,
            left: 0,
            zIndex: isMobile ? 25 : 'auto',
            display: leftOpen ? 'block' : 'none',
          }}>
            <LeftSidebar />
            <button className="sidebar-toggle left" onClick={() => setLeftOpen(false)} title="Hide sidebar">
              <ChevronLeft size={14} />
            </button>
          </div>
          {!leftOpen && (
            <button
              onClick={() => setLeftOpen(true)}
              title="Show sidebar"
              className="pointer-events-auto"
              style={{
                position: 'absolute', left: 0, top: 72, zIndex: 30,
                width: 26, height: 44,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(180deg, rgba(168,85,247,0.18), rgba(236,72,153,0.12))',
                border: '1px solid rgba(168,85,247,0.35)', borderLeft: 'none',
                borderRadius: '0 10px 10px 0',
                color: '#fff',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 0 14px rgba(168,85,247,0.3)',
              }}>
              <ChevronRight size={14} />
            </button>
          )}

          <div className="flex-1 relative" />

          {!rightOpen && (
            <button
              onClick={() => setRightOpen(true)}
              title="Show sidebar"
              className="pointer-events-auto"
              style={{
                position: 'absolute', right: 0, top: 72, zIndex: 30,
                width: 26, height: 44,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(180deg, rgba(168,85,247,0.18), rgba(236,72,153,0.12))',
                border: '1px solid rgba(168,85,247,0.35)', borderRight: 'none',
                borderRadius: '10px 0 0 10px',
                color: '#fff',
                cursor: 'pointer',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 0 14px rgba(168,85,247,0.3)',
              }}>
              <ChevronLeft size={14} />
            </button>
          )}
          <div className="pointer-events-auto slide-in-right" style={{
            position: isMobile ? 'absolute' : 'relative',
            top: isMobile ? 64 : undefined,
            bottom: isMobile ? 0 : undefined,
            right: 0,
            zIndex: isMobile ? 25 : 'auto',
            display: rightOpen ? 'block' : 'none',
          }}>
            <RightSidebar />
            <button className="sidebar-toggle right" onClick={() => setRightOpen(false)} title="Hide sidebar">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <div className="pointer-events-auto"><Timeline /></div>
        <div className="pointer-events-auto"><PresetCarousel /></div>
      </div>

      <StatusStrip />
      <Toast />
      <SnapshotGallery open={galleryOpen} onClose={() => setGalleryOpen(false)} />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <CommandPalette onSettings={() => setShowSettings(true)} />
      <HelpOverlay />
      <DebugHUD />
      <Onboarding />
      <MouseTrail />
      <Slideshow />
      <Minimap />
      <WaveformOverlay />
      <CameraPathPlayer />
      <PresetThumbnailPrerenderer />
      <MobileGestureHint />
      <MidiPanel open={midiOpen} onClose={() => setMidiOpen(false)} />

      {showSplash && (
        <div className="splash">
          <div className="splash-logo">
            <Sparkles size={30} strokeWidth={2.2} color="#fff" />
          </div>
        </div>
      )}
    </div>
  )
}
