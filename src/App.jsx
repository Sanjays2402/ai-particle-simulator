import { useState, useEffect } from 'react'
import { useStore } from './store'
import ParticleCanvas from './components/ParticleCanvas'
import TopBar from './components/TopBar'
import LeftSidebar from './components/LeftSidebar'
import RightSidebar from './components/RightSidebar'
import PresetCarousel from './components/PresetCarousel'
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
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <TopBar onSettings={() => setShowSettings(true)} />
      <div className="flex flex-1 overflow-hidden">
        <LeftSidebar />
        <div className="flex-1 relative">
          <ParticleCanvas />
        </div>
        <RightSidebar />
      </div>
      <PresetCarousel />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}
