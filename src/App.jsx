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

  useEffect(() => {
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
