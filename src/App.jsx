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
import { Sparkles } from 'lucide-react'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const loadPreset = useStore(s => s.loadPreset)
  const loadCustomCode = useStore(s => s.loadCustomCode)
  const orb1 = useRef(null), orb2 = useRef(null), orb3 = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1700)
    return () => clearTimeout(t)
  }, [])

  // v2 iter 12: mouse parallax on orbs
  useEffect(() => {
    const onMove = (e) => {
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
        if (data.count) useStore.getState().setParticleCount(data.count)
        if (data.speed) useStore.getState().setSpeed(data.speed)
        if (data.glow) useStore.getState().setGlowIntensity(data.glow)
        if (data.style) useStore.getState().setVisualStyle(data.style)
        if (data.theme) useStore.getState().setTheme(data.theme)
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
      {/* v2 iter 12: volumetric parallax orbs over canvas, below UI */}
      <div ref={orb1} className="orb orb-1" style={{ zIndex: 1 }} />
      <div ref={orb2} className="orb orb-2" style={{ zIndex: 1 }} />
      <div ref={orb3} className="orb orb-3" style={{ zIndex: 1 }} />
      <div className="relative z-10 flex flex-col h-full w-full pointer-events-none">
        <div className="pointer-events-auto"><TopBar onSettings={() => setShowSettings(true)} /></div>
        <div className="flex flex-1 overflow-hidden">
          <div className="pointer-events-auto slide-in-left"><LeftSidebar /></div>
          <div className="flex-1 relative" />
          <div className="pointer-events-auto slide-in-right"><RightSidebar /></div>
        </div>
        <div className="pointer-events-auto"><Timeline /></div>
        <div className="pointer-events-auto"><PresetCarousel /></div>
      </div>

      <StatusStrip />
      <Toast />

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <CommandPalette onSettings={() => setShowSettings(true)} />

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
