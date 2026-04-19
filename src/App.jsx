import { useState, useEffect } from 'react'
import { useStore } from './store'
import ParticleCanvas from './components/ParticleCanvas'
import TopBar from './components/TopBar'
import LeftSidebar from './components/LeftSidebar'
import RightSidebar from './components/RightSidebar'
import PresetCarousel from './components/PresetCarousel'
import Timeline from './components/Timeline'
import SettingsModal from './components/SettingsModal'

export default function App() {
  const [showSettings, setShowSettings] = useState(false)
  const loadPreset = useStore(s => s.loadPreset)
  const loadCustomCode = useStore(s => s.loadCustomCode)

  useEffect(() => {
    // Check for shared URL
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
        if (data.preset) {
          loadPreset(data.preset)
        } else if (data.code) {
          loadCustomCode(data.code)
        }
        return
      } catch (e) {
        console.error('Failed to decode share URL:', e)
      }
    }
    loadPreset('spiral-galaxy')
  }, [])

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden relative">
      {/* Full-bleed canvas — sidebars float over it */}
      <div className="absolute inset-0 z-0">
        <ParticleCanvas />
      </div>
      <div className="relative z-10 flex flex-col h-full w-full pointer-events-none">
        <div className="pointer-events-auto"><TopBar onSettings={() => setShowSettings(true)} /></div>
        <div className="flex flex-1 overflow-hidden">
          <div className="pointer-events-auto"><LeftSidebar /></div>
          <div className="flex-1 relative" />
          <div className="pointer-events-auto"><RightSidebar /></div>
        </div>
        <div className="pointer-events-auto"><Timeline /></div>
        <div className="pointer-events-auto"><PresetCarousel /></div>
      </div>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
