import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useStore } from '../store'
import { presets } from '../presets'
import {
  loadCameraViews, saveCameraViews, appendView, removeView,
  renameView, buildCameraPaletteActions, buildCameraDeleteActions,
  buildCameraRenameActions,
} from '../lib/cameraViews'
import { labelForId as framingLabelForId } from '../lib/framingGuides'
import { formatCalmToast } from '../lib/calmMode'
import { showToast } from './Toast'
import {
  Play, Pause, Shuffle, Camera, Link2, Download, Settings as Cog,
  Magnet, Mic, RotateCcw, Maximize2, Sparkles, Eye, Video, Crop, Wind,
  Save, Trash2, Pencil,
} from 'lucide-react'

export function CommandPalette({ onSettings }) {
  const [open, setOpen] = useState(false)
  // R36.H — saved camera views surfaced as palette actions. Re-read from
  // storage each time the palette opens so a view saved this session
  // shows up without a refresh.
  const [cameraViews, setCameraViews] = useState([])
  // R38.H — inline rename: which view's rename field is open, + its draft.
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const framingGuideId = useStore(s => s.framingGuideId)
  const cycleFramingGuide = useStore(s => s.cycleFramingGuide)
  const {
    loadPreset, setPlaying, playing, setMouseAttract, mouseAttract, loadRandom,
  } = useStore()

  useEffect(() => {
    const h = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => {
          // Refresh the saved-view list as we open so it's current.
          if (!o) setCameraViews(loadCameraViews())
          // Always reset any half-typed rename when toggling the palette.
          setRenamingId(null)
          setRenameDraft('')
          return !o
        })
      }
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const run = (fn) => () => { fn(); setOpen(false) }

  // R36.H — restore a saved camera view via the global camera API the
  // RightSidebar panel also uses (no ref drilling through the canvas).
  const restoreView = (view) => {
    const api = window.__particleCamera
    if (api && view && view.pos) api.set({ pos: view.pos, target: view.target })
  }

  // R37.H — save the CURRENT camera as a new view straight from the
  // palette, and delete a saved view by id. Both persist + fire the
  // shared `particle:camera-views-changed` event so the RightSidebar
  // list re-syncs without a refresh — the whole saved-view lifecycle
  // (save / restore / delete) now lives in the palette.
  const saveCurrentView = () => {
    const api = window.__particleCamera
    if (!api) { showToast('Camera not ready yet'); return }
    const state = api.get()
    const current = loadCameraViews()
    const name = `View ${(current.reduce((m, v) => Math.max(m, v.id || 0), 0)) + 1}`
    const next = appendView(current, { name, pos: state.pos, target: state.target })
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Saved "${name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
  }

  const deleteView = (viewId) => {
    const current = loadCameraViews()
    const next = removeView(current, viewId)
    if (next === current) return
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast('View deleted', <Trash2 size={10} color="#fff" strokeWidth={2.4} />)
  }

  // R38.H — rename a saved view inline (no window.prompt), and clear all
  // saved views at once, completing the saved-view lifecycle in the
  // palette. `renamingId` opens an inline text field on one rename row;
  // committing runs the pure renameView (ref-equal-on-no-op skips a
  // redundant save) and re-syncs the RightSidebar via the shared event.
  const commitRename = (viewId) => {
    const name = renameDraft.trim()
    if (!name) { setRenamingId(null); return }
    const current = loadCameraViews()
    const next = renameView(current, viewId, name)
    setRenamingId(null)
    setRenameDraft('')
    if (next === current) return // no-op (blank / identical / missing)
    saveCameraViews(next)
    setCameraViews(next)
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Renamed to "${name}"`, <Pencil size={10} color="#fff" strokeWidth={2.4} />)
  }

  const clearAllViews = () => {
    const current = loadCameraViews()
    if (current.length === 0) return
    saveCameraViews([])
    setCameraViews([])
    window.dispatchEvent(new CustomEvent('particle:camera-views-changed'))
    showToast(`Cleared ${current.length} saved view${current.length === 1 ? '' : 's'}`,
      <Trash2 size={10} color="#fff" strokeWidth={2.4} />)
  }

  if (!open) return null

  const cameraActions = buildCameraPaletteActions(cameraViews)
  const deleteActions = buildCameraDeleteActions(cameraViews)
  const renameActions = buildCameraRenameActions(cameraViews)

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
            <Item icon={Shuffle} label="Random Preset" shortcut="R" onSelect={run(() => loadRandom())} />
          </Command.Group>

          <Command.Group heading="Tools" style={groupHeading}>
            <Item icon={Magnet} label={`${mouseAttract ? 'Disable' : 'Enable'} Mouse Attract`} onSelect={run(() => setMouseAttract(!mouseAttract))} />
            <Item icon={Eye} label="Zen Mode — hide all UI" shortcut="Z" onSelect={run(() => window.dispatchEvent(new CustomEvent('particle:toggle-zen')))} />
            <Item icon={Camera} label="Screenshot" shortcut="S" onSelect={run(() => document.dispatchEvent(new CustomEvent('particle:screenshot')))} />
            <Item icon={Link2} label="Copy Share URL" onSelect={run(() => navigator.clipboard?.writeText(location.href))} />
            <Item icon={Cog} label="Open Settings" onSelect={run(() => onSettings?.())} />
          </Command.Group>

          {/* R36.H — Camera group: saved views + zen + framing as
              searchable actions so power users never touch the sidebar.
              R37.H — plus save-current + per-view delete so the whole
              saved-view lifecycle lives in the palette. */}
          <Command.Group heading="Camera" style={groupHeading}>
            <Item icon={Eye} label="Enter Zen Mode" shortcut="Z" onSelect={run(() => window.dispatchEvent(new CustomEvent('particle:toggle-zen')))} />
            <Item
              icon={Crop}
              label="Cycle Framing Guide"
              sub={`Now: ${framingLabelForId(framingGuideId)}`}
              shortcut="]"
              onSelect={run(() => cycleFramingGuide())}
            />
            <Item
              icon={Wind}
              label={`${useStore.getState().calmMode ? 'Disable' : 'Enable'} Calm Mode`}
              sub="Pause auto-rotate, shake, hue-cycle & zen orbit"
              onSelect={run(() => {
                const next = !useStore.getState().calmMode
                useStore.getState().setCalmMode(next)
                // R37.K — name what the gate changed (same toast as TopBar).
                const t = formatCalmToast(next)
                showToast(
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, lineHeight: 1.3 }}>
                    <span style={{ fontWeight: 600 }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: '#9a9ab0' }}>{t.detail}</span>
                  </span>,
                  <Wind size={10} color="#fff" strokeWidth={2.4} />,
                )
              })}
            />
            {/* R37.H — save the current camera as a new view. */}
            <Item
              icon={Save}
              label="Save Current Camera View"
              sub="Snapshot the current camera angle"
              keywords="camera view save store new"
              onSelect={run(saveCurrentView)}
            />
            {cameraActions.length === 0 ? (
              <Item icon={Video} label="No saved views yet" sub="Press V on the scene to save the current camera" onSelect={() => {}} />
            ) : (
              cameraActions.map(a => (
                <Item
                  key={a.id}
                  icon={Video}
                  label={a.label}
                  sub={`Restore view · ${a.sub}`}
                  keywords={a.keywords}
                  onSelect={run(() => restoreView(a.view))}
                />
              ))
            )}
            {/* R37.H — per-view delete actions (only when views exist). */}
            {deleteActions.map(a => (
              <Item
                key={a.id}
                icon={Trash2}
                label={a.label}
                sub={a.sub}
                keywords={a.keywords}
                onSelect={run(() => deleteView(a.viewId))}
              />
            ))}
            {/* R38.H — per-view rename: selecting the row opens an inline
                text field (Enter commits, Esc cancels) so a power user can
                relabel a view without leaving the palette or hitting a
                window.prompt. */}
            {renameActions.map(a => (
              renamingId === a.viewId ? (
                <div
                  key={a.id}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', borderRadius: 10,
                    border: '1px solid rgba(168,85,247,0.4)',
                    background: 'rgba(168,85,247,0.08)', margin: '2px 0',
                  }}
                >
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 26, height: 26, borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <Pencil size={14} strokeWidth={2} color="#c084fc" />
                  </span>
                  <input
                    autoFocus
                    value={renameDraft}
                    maxLength={40}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') { e.preventDefault(); commitRename(a.viewId) }
                      else if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null); setRenameDraft('') }
                    }}
                    placeholder={a.currentName}
                    style={{
                      flex: 1, background: 'rgba(0,0,0,0.25)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
                      outline: 'none', color: '#f2f2f5', fontSize: 13, fontWeight: 500,
                      padding: '6px 10px', fontFamily: 'inherit',
                    }}
                  />
                  <button
                    onClick={() => commitRename(a.viewId)}
                    style={renameBtn}
                  >Save</button>
                </div>
              ) : (
                <Item
                  key={a.id}
                  icon={Pencil}
                  label={a.label}
                  sub={a.sub}
                  keywords={a.keywords}
                  onSelect={() => { setRenamingId(a.viewId); setRenameDraft(a.currentName) }}
                />
              )
            ))}
            {/* R38.H — wipe every saved view at once (only when some exist). */}
            {cameraActions.length > 0 && (
              <Item
                icon={Trash2}
                label="Clear All Saved Views"
                sub={`Delete all ${cameraActions.length} saved camera view${cameraActions.length === 1 ? '' : 's'}`}
                keywords="camera view clear all delete remove wipe reset"
                onSelect={run(clearAllViews)}
              />
            )}
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

const renameBtn = {
  padding: '5px 12px', borderRadius: 7,
  background: 'linear-gradient(135deg, rgba(139,92,246,0.3) 0%, rgba(236,72,153,0.25) 100%)',
  border: '1px solid rgba(168,85,247,0.5)',
  color: '#e9d5ff', cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
}

function Item({ icon: Icon, emoji, label, sub, shortcut, keywords, onSelect }) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords ? [keywords] : undefined}
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
