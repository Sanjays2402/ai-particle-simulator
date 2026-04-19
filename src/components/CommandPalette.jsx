import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useStore } from '../store'
import { presets } from '../presets'
import {
  Play, Pause, Shuffle, Camera, Link2, Download, Settings as Cog,
  Magnet, Mic, RotateCcw, Maximize2, Sparkles,
} from 'lucide-react'

export function CommandPalette({ onSettings }) {
  const [open, setOpen] = useState(false)
  const {
    loadPreset, setPlaying, playing, setMouseAttract, mouseAttract,
  } = useStore()

  useEffect(() => {
    const h = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const run = (fn) => () => { fn(); setOpen(false) }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(4,4,8,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '14vh',
        animation: 'cp-fade 0.15s ease-out',
      }}
    >
      <Command
        onClick={(e) => e.stopPropagation()}
        label="Command Palette"
        style={{
          width: 640, maxWidth: '90vw',
          background: 'linear-gradient(180deg, rgba(20,20,30,0.92) 0%, rgba(14,14,22,0.95) 100%)',
          backdropFilter: 'blur(28px) saturate(140%)',
          WebkitBackdropFilter: 'blur(28px) saturate(140%)',
          border: '1px solid rgba(168,85,247,0.25)',
          borderRadius: 16,
          boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05) inset, 0 0 40px rgba(168,85,247,0.2)',
          overflow: 'hidden',
          animation: 'cp-slide 0.18s cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <Sparkles size={16} color="#c084fc" strokeWidth={2} />
          <Command.Input
            autoFocus
            placeholder="Type a command or search preset…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#f2f2f5', fontSize: 14, fontWeight: 500,
              letterSpacing: '-0.01em',
            }}
          />
          <kbd style={kbd}>ESC</kbd>
        </div>
        <Command.List style={{
          maxHeight: 400, overflow: 'auto',
          padding: 6,
        }}>
          <Command.Empty style={{
            padding: 20, textAlign: 'center', color: '#6a6a80', fontSize: 13,
          }}>
            No results.
          </Command.Empty>

          <Command.Group heading="Playback" style={groupHeading}>
            <Item icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} shortcut="Space" onSelect={run(() => setPlaying(!playing))} />
            <Item icon={RotateCcw} label="Reset Camera" onSelect={run(() => {
              const { loadPreset, currentPreset } = useStore.getState()
              if (currentPreset) loadPreset(currentPreset)
            })} />
            <Item icon={Maximize2} label="Toggle Fullscreen" shortcut="F" onSelect={run(() => document.documentElement.requestFullscreen?.())} />
            <Item icon={Shuffle} label="Random Preset" shortcut="R" onSelect={run(() => {
              const list = presets
              const p = list[Math.floor(Math.random() * list.length)]
              loadPreset(p.id)
            })} />
          </Command.Group>

          <Command.Group heading="Tools" style={groupHeading}>
            <Item icon={Magnet} label={`${mouseAttract ? 'Disable' : 'Enable'} Mouse Attract`} onSelect={run(() => setMouseAttract(!mouseAttract))} />
            <Item icon={Camera} label="Screenshot" shortcut="S" onSelect={run(() => document.dispatchEvent(new CustomEvent('particle:screenshot')))} />
            <Item icon={Link2} label="Copy Share URL" onSelect={run(() => navigator.clipboard?.writeText(location.href))} />
            <Item icon={Cog} label="Open Settings" onSelect={run(() => onSettings?.())} />
          </Command.Group>

          <Command.Group heading="Presets" style={groupHeading}>
            {presets.map(p => (
              <Item key={p.id} emoji={p.emoji} label={p.name} sub={p.description} onSelect={run(() => loadPreset(p.id))} />
            ))}
          </Command.Group>
        </Command.List>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.05)',
          fontSize: 11, color: '#6a6a80',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        }}>
          <span><kbd style={kbdSm}>↑↓</kbd> Navigate</span>
          <span><kbd style={kbdSm}>↵</kbd> Select</span>
          <span><kbd style={kbdSm}>⌘K</kbd> Open</span>
        </div>
      </Command>
    </div>
  )
}

const groupHeading = {
  padding: '8px 12px 4px',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#8a8aa0',
}

const kbd = {
  padding: '2px 6px', borderRadius: 4,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
  fontSize: 10, color: '#8a8aa0',
}
const kbdSm = { ...kbd, padding: '1px 5px', fontSize: 9 }

function Item({ icon: Icon, emoji, label, sub, shortcut, onSelect }) {
  return (
    <Command.Item
      onSelect={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: 10,
        cursor: 'pointer', color: '#d8d8e0', fontSize: 13,
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        fontSize: 14,
      }}>
        {emoji || (Icon && <Icon size={14} strokeWidth={2} color="#c084fc" />)}
      </span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 500, color: '#f2f2f5', letterSpacing: '-0.01em' }}>{label}</span>
        {sub && <span style={{ fontSize: 11, color: '#7a7a90' }}>{sub}</span>}
      </div>
      {shortcut && <kbd style={kbd}>{shortcut}</kbd>}
    </Command.Item>
  )
}
