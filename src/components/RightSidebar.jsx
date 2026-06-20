import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Activity, Sparkles, Palette, Gauge, Camera, X, BarChart3, Code2, Copy, ChevronDown, ChevronUp, Bookmark, BookmarkPlus } from 'lucide-react'
import { loadCameraViews, saveCameraViews, appendView, CAMERA_VIEWS_MAX } from '../lib/cameraViews'
import { formatDuration } from '../lib/sessionStats'
import { tokenize } from '../lib/codeTokens'
import { loadKeymap, resolveAction } from '../lib/keymap'
import {
  loadBookmarks, saveBookmarks, appendBookmark, removeBookmark,
  applyScene, captureScene, MAX_BOOKMARKS,
} from '../lib/sceneBookmarks'
import { showToast } from './Toast'

function SectionHeader({ children }) {
  return (
    <div className="section-label-v2" style={{ marginBottom: 12 }}>
      <span className="dot" />
      {children}
    </div>
  )
}

export default function RightSidebar() {
  const { dynamicControls, dynamicValues, setDynamicValue, infoTitle, infoDesc, particleCount, theme, visualStyle } = useStore()
  const [fps, setFps] = useState(60)

  useEffect(() => {
    let frames = 0, last = performance.now(), raf = 0
    const loop = (t) => {
      frames++
      if (t - last >= 1000) { setFps(Math.round((frames * 1000) / (t - last))); frames = 0; last = t }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="sidebar-glow-right" style={{
      position: 'relative',
      width: 260,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'linear-gradient(180deg, rgba(8,8,14,0.72) 0%, rgba(12,12,22,0.68) 100%)',
      backdropFilter: 'blur(28px) saturate(140%)',
      WebkitBackdropFilter: 'blur(28px) saturate(140%)',
      borderLeft: '1px solid rgba(255,255,255,0.06)',
      boxShadow: 'inset 1px 0 0 rgba(255,255,255,0.02), -1px 0 40px rgba(0,0,0,0.25)',
      height: '100%',
    }}>
      {/* Info Panel */}
      <div style={{ padding: '14px 16px 12px' }}>
        <SectionHeader>Info</SectionHeader>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: '#eeeef0', marginBottom: 4, letterSpacing: '-0.02em' }}>
          {infoTitle || 'No simulation'}
        </h2>
        {infoDesc && (
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#8a8aa0' }}>
            {infoDesc}
          </p>
        )}
      </div>

      {/* v3 iter 04: Live telemetry panel */}
      <div style={{ padding: '2px 16px 16px' }}>
        <SectionHeader>Telemetry</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="metric-row">
            <span className="metric-label"><Gauge size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />FPS</span>
            <span className="metric-value" style={{ color: fps >= 55 ? '#86efac' : fps >= 30 ? '#fbbf24' : '#f87171' }}>{fps}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Activity size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Particles</span>
            <span className="metric-value">{(particleCount / 1000).toFixed(1)}K</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Palette size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Theme</span>
            <span className="metric-value" style={{ textTransform: 'capitalize' }}>{theme}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label"><Sparkles size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />Style</span>
            <span className="metric-value" style={{ textTransform: 'capitalize' }}>{visualStyle}</span>
          </div>
        </div>
      </div>

      {/* Dynamic Controls */}
      {dynamicControls.length > 0 && (
        <div style={{ padding: '2px 16px 14px' }}>
          <SectionHeader>Controls</SectionHeader>
          {dynamicControls.map(c => {
            const v = dynamicValues[c.id] ?? c.value
            const pct = ((v - c.min) / (c.max - c.min)) * 100
            return (
              <div key={c.id} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: '#9a9ab0', fontWeight: 500 }}>{c.label}</span>
                  <span className="value-chip">{v.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={c.min} max={c.max}
                  step={(c.max - c.min) / 100}
                  value={v}
                  onChange={e => setDynamicValue(c.id, parseFloat(e.target.value))}
                  style={{ width: '100%', '--val': `${pct}%` }}
                />
              </div>
            )
          })}
        </div>
      )}

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Camera Views</SectionHeader>
        <CameraViews />
      </div>

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Scene Bookmarks</SectionHeader>
        <SceneBookmarks />
      </div>

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Session Stats</SectionHeader>
        <SessionStatsPanel />
      </div>

      <div style={{ padding: '2px 16px 14px' }}>
        <SectionHeader>Preset Source</SectionHeader>
        <CodeViewerPanel />
      </div>

      {/* Keyboard shortcuts hint */}
      <div style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <SectionHeader>Shortcuts</SectionHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11.5, color: '#8a8aa0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Command palette</span>
            <span style={{ display: 'inline-flex', gap: 3 }}><kbd>⌘</kbd><kbd>K</kbd></span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Play / pause</span>
            <kbd>Space</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Random preset</span>
            <kbd>R</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Screenshot</span>
            <kbd>S</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Fullscreen</span>
            <kbd>F</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Save camera view</span>
            <kbd>V</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Save scene bookmark</span>
            <kbd>B</kbd>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Restore last bookmark</span>
            <span style={{ display: 'inline-flex', gap: 3 }}><kbd>⇧</kbd><kbd>B</kbd></span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Saved camera views: capture orbit position+target with a name, save
// up to CAMERA_VIEWS_MAX in localStorage, jump back with a click.
// Keyboard `V` quick-saves the current view; works anywhere outside
// inputs/textareas.
function CameraViews() {
  const [views, setViews] = useState(() => loadCameraViews())

  const save = (name) => {
    const api = window.__particleCamera
    if (!api) {
      showToast('Camera not ready yet')
      return
    }
    const state = api.get()
    const next = appendView(views, { name, pos: state.pos, target: state.target })
    setViews(next)
    saveCameraViews(next)
    showToast(`Saved "${name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
  }

  const restore = (v) => {
    const api = window.__particleCamera
    if (!api) return
    api.set({ pos: v.pos, target: v.target })
    showToast(`Restored "${v.name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
  }

  const remove = (id) => {
    const next = views.filter(v => v.id !== id)
    setViews(next)
    saveCameraViews(next)
  }

  // Keyboard quick-save on the active "saveView" binding (default V).
  // Routed through the keymap so the rebinding UI in Settings can
  // change which key triggers it. We re-bind whenever the views list
  // changes so the auto-incremented name reflects current count.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = loadKeymap()
      if (resolveAction(map, e) !== 'saveView') return
      e.preventDefault()
      const api = window.__particleCamera
      if (!api) { showToast('Camera not ready yet'); return }
      const state = api.get()
      const name = `View ${(views[0]?.id || 0) + 1}`
      const next = appendView(views, { name, pos: state.pos, target: state.target })
      setViews(next)
      saveCameraViews(next)
      showToast(`Saved "${name}"`, <Camera size={10} color="#fff" strokeWidth={2.4} />)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [views])

  const canSaveMore = views.length < CAMERA_VIEWS_MAX

  return (
    <div>
      <button
        onClick={() => {
          const def = `View ${(views[0]?.id || 0) + 1}`
          const name = window.prompt('Name this camera view:', def) || def
          save(name.slice(0, 24))
        }}
        title={canSaveMore ? 'Press V to quick-save' : `Max ${CAMERA_VIEWS_MAX} views — delete one first`}
        style={{
          width: '100%', padding: '8px 0', marginBottom: 8,
          borderRadius: 8, fontSize: 12, fontWeight: 550, cursor: 'pointer',
          background: canSaveMore
            ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: canSaveMore ? '#e9d5ff' : '#5a5a70',
          border: canSaveMore ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.05)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <Camera size={12} strokeWidth={2.2} /> Save current view
        {canSaveMore && <kbd style={{ marginLeft: 4 }}>V</kbd>}
      </button>
      {views.length === 0 ? (
        <div style={{
          padding: '12px 8px', borderRadius: 8, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.05)',
          fontSize: 11, color: '#6a6a80',
        }}>
          No saved views yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {views.map(v => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 9px', borderRadius: 7,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.15s ease-out',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.07)'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' }}
            >
              <button onClick={() => restore(v)}
                title={`pos: [${v.pos.map(n => n.toFixed(1)).join(', ')}]`}
                style={{
                  flex: 1, background: 'none', border: 'none', color: '#d8d8e0',
                  fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
                  padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
                }}>
                <Camera size={11} strokeWidth={2.2} color="#c084fc" />
                {v.name}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a5a70', fontFamily: 'Geist Mono, monospace' }}>
                  {Math.sqrt(v.pos[0]**2 + v.pos[1]**2 + v.pos[2]**2).toFixed(1)}u
                </span>
              </button>
              <button onClick={() => remove(v.id)} title="Delete"
                style={{
                  width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 5, background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.05)', color: '#9a9ab0', cursor: 'pointer',
                }}>
                <X size={9} strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Scene Bookmarks — save the full scene (preset + style + theme +
// palette + FX + force field + audio + camera modulators) to
// localStorage and restore in a click. Camera Views handles camera
// orbit; this handles the *content* the camera is looking at.
// Quick-save: B. Restore most recent: Shift+B. Both respect input
// focus so typing in textareas isn't hijacked.
function SceneBookmarks() {
  const [items, setItems] = useState(() => loadBookmarks())
  const currentPreset = useStore(s => s.currentPreset)
  const infoTitle     = useStore(s => s.infoTitle)

  const save = (name) => {
    const scene = captureScene(useStore.getState())
    const next = appendBookmark(items, { name, scene })
    setItems(next)
    saveBookmarks(next)
    showToast(`Saved "${name}"`, <Bookmark size={10} color="#fff" strokeWidth={2.4} />)
  }

  const restore = (b) => {
    const applied = applyScene(b.scene, useStore.getState())
    showToast(`Restored "${b.name}" (${applied.length})`, <Bookmark size={10} color="#fff" strokeWidth={2.4} />)
  }

  const remove = (id) => {
    const next = removeBookmark(items, id)
    setItems(next)
    saveBookmarks(next)
  }

  // Default name builder — prefer the loaded preset's nice title so
  // bookmarks named "Cherry Blossoms" beat "Scene 4".
  const nextDefaultName = () => {
    if (infoTitle) {
      // Append " 2", " 3" if a bookmark with that title already exists.
      const base = infoTitle.slice(0, 28)
      const dupes = items.filter(it => it.name === base || it.name.startsWith(`${base} `)).length
      return dupes > 0 ? `${base} ${dupes + 1}` : base
    }
    return `Scene ${(items[0]?.id || 0) + 1}`
  }

  // Keyboard: bookmark = quick-save, bookmarkPanel = restore most recent.
  // Routed through the keymap so Settings can rebind both.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      const map = loadKeymap()
      const action = resolveAction(map, e)
      if (action === 'bookmark') {
        e.preventDefault()
        save(nextDefaultName())
      } else if (action === 'bookmarkPanel') {
        if (items.length === 0) { showToast('No bookmarks yet'); return }
        e.preventDefault()
        restore(items[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, infoTitle])

  const canSaveMore = items.length < MAX_BOOKMARKS

  return (
    <div>
      <button
        onClick={() => {
          const def = nextDefaultName()
          const name = window.prompt('Name this scene bookmark:', def) || def
          if (!canSaveMore) {
            showToast(`Max ${MAX_BOOKMARKS} bookmarks — delete one first`)
            return
          }
          save(name.slice(0, 32))
        }}
        title={canSaveMore ? 'Press B to quick-save' : `Max ${MAX_BOOKMARKS} bookmarks — delete one first`}
        style={{
          width: '100%', padding: '8px 0', marginBottom: 8,
          borderRadius: 8, fontSize: 12, fontWeight: 550, cursor: 'pointer',
          background: canSaveMore
            ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(168,85,247,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: canSaveMore ? '#dbeafe' : '#5a5a70',
          border: canSaveMore ? '1px solid rgba(99,102,241,0.35)' : '1px solid rgba(255,255,255,0.05)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <BookmarkPlus size={12} strokeWidth={2.2} /> Save current scene
        {canSaveMore && <kbd style={{ marginLeft: 4 }}>B</kbd>}
      </button>
      {items.length === 0 ? (
        <div style={{
          padding: '12px 8px', borderRadius: 8, textAlign: 'center',
          background: 'rgba(255,255,255,0.02)',
          border: '1px dashed rgba(255,255,255,0.05)',
          fontSize: 11, color: '#6a6a80',
        }}>
          No bookmarks yet. Press <kbd>B</kbd> to save a scene.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(b => {
            const isCurrent = b.scene.currentPreset && b.scene.currentPreset === currentPreset
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 9px', borderRadius: 7,
                background: 'rgba(255,255,255,0.025)',
                border: isCurrent
                  ? '1px solid rgba(99,102,241,0.35)'
                  : '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.15s ease-out',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.07)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = isCurrent ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.05)' }}
              >
                <button onClick={() => restore(b)}
                  title={`preset: ${b.scene.currentPreset || 'custom'} · theme: ${b.scene.theme || '-'}`}
                  style={{
                    flex: 1, background: 'none', border: 'none', color: '#d8d8e0',
                    fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer',
                    padding: 0, display: 'inline-flex', alignItems: 'center', gap: 8,
                    overflow: 'hidden',
                  }}>
                  <Bookmark size={11} strokeWidth={2.2} color={isCurrent ? '#818cf8' : '#a5b4fc'} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.name}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#5a5a70', fontFamily: 'Geist Mono, monospace' }}>
                    {b.scene.currentPreset?.slice(0, 10) || 'custom'}
                  </span>
                </button>
                <button onClick={() => remove(b.id)} title="Delete bookmark"
                  style={{
                    width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 5, background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.05)', color: '#9a9ab0', cursor: 'pointer',
                  }}>
                  <X size={9} strokeWidth={2.5} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Session Stats panel: shows lifetime totals (presets visited, gifs,
// screenshots, total time across all sessions) plus a live ticker for
// the current session. Re-subscribes to sessionStats so other call
// sites (loadPreset, screenshot, gif export) reflect immediately.
function SessionStatsPanel() {
  const stats = useStore(s => s.sessionStats)
  const resetSessionStats = useStore(s => s.resetSessionStats)
  const [now, setNow] = useState(() => Date.now())
  const [sessionStart] = useState(() => Date.now())
  // Tick every 5s so the readout stays current without thrashing
  // re-renders. The Telemetry block already does 1Hz FPS work.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])
  const sessionSec = Math.max(0, (now - sessionStart) / 1000)
  const lifetimeTotal = (stats.lifetimeSeconds || 0) + Math.floor(sessionSec)
  const rows = [
    { label: 'Session', value: formatDuration(sessionSec), accent: '#c084fc' },
    { label: 'Lifetime', value: formatDuration(lifetimeTotal) },
    { label: 'Sessions', value: stats.totalSessions ?? 0 },
    { label: 'Presets loaded', value: stats.presetsLoaded ?? 0 },
    { label: 'Unique presets', value: (stats.uniquePresets?.length ?? 0) },
    { label: 'Screenshots', value: stats.screenshotsTaken ?? 0 },
    { label: 'GIFs exported', value: stats.gifsExported ?? 0 },
    { label: 'Videos exported', value: stats.videosExported ?? 0 },
  ]
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map(r => (
          <div key={r.label} className="metric-row">
            <span className="metric-label">
              <BarChart3 size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />{r.label}
            </span>
            <span className="metric-value" style={r.accent ? { color: r.accent } : undefined}>
              {r.value}
            </span>
          </div>
        ))}
      </div>
      <button onClick={() => {
        if (window.confirm('Reset all session stats? This cannot be undone.')) resetSessionStats()
      }}
        title="Clear lifetime counters"
        style={{
          width: '100%', marginTop: 10, padding: '6px 0', borderRadius: 7,
          fontSize: 11, fontWeight: 500, cursor: 'pointer',
          background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
          border: '1px solid rgba(239,68,68,0.2)',
        }}>
        Reset Stats
      </button>
    </div>
  )
}

// Live preset code viewer (read-only). Shows the source of whatever
// scene is currently rendering with light syntax colouring + line
// numbers. Collapsed by default — opening it reveals the body. Copy
// button stuffs the source onto the clipboard so users can iterate
// in their editor or paste into the AI prompt.
const TOKEN_COLOR = {
  comment: '#7a7a90',
  string:  '#86efac',
  number:  '#fbbf24',
  keyword: '#c084fc',
  builtin: '#f472b6',
  ident:   '#e9e9f0',
  punct:   '#9a9ab0',
  ws:      'inherit',
  text:    '#e9e9f0',
}
function CodeViewerPanel() {
  const source = useStore(s => s.particleFnSource)
  const title  = useStore(s => s.infoTitle)
  const currentPreset = useStore(s => s.currentPreset)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const tokens = open && source ? tokenize(source) : []
  const lineCount = source ? source.split('\n').length : 0
  const sourceBytes = source ? source.length : 0

  const handleCopy = async () => {
    if (!source) return
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
      showToast('Source copied to clipboard', <Copy size={10} color="#fff" strokeWidth={2.4} />)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: ancient browsers / iframe sandboxing.
      window.prompt('Copy the source:', source)
    }
  }

  if (!source) {
    return (
      <div style={{
        padding: '10px 8px', textAlign: 'center', fontSize: 11,
        color: '#6a6a80', background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.05)', borderRadius: 7,
      }}>
        Load a preset to see its source.
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        title={open ? 'Collapse' : 'Expand'}
        style={{
          width: '100%', padding: '7px 10px',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          borderRadius: 8, fontSize: 11.5, fontWeight: 550, cursor: 'pointer',
          background: open
            ? 'linear-gradient(135deg, rgba(168,85,247,0.18), rgba(99,102,241,0.14))'
            : 'rgba(255,255,255,0.03)',
          color: open ? '#e9d5ff' : '#c8c8d0',
          border: open ? '1px solid rgba(168,85,247,0.35)' : '1px solid rgba(255,255,255,0.05)',
          transition: 'all 0.15s ease-out',
        }}
      >
        <Code2 size={12} strokeWidth={2.2} color={open ? '#c084fc' : '#9a9ab0'} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {open ? 'Hide' : 'Show'} source
        </span>
        <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: '#7a7a90', fontWeight: 500 }}>
          {lineCount} ln · {Math.ceil(sourceBytes / 100) / 10}K
        </span>
        {open ? <ChevronUp size={12} strokeWidth={2.2} /> : <ChevronDown size={12} strokeWidth={2.2} />}
      </button>
      {open && (
        <div style={{
          marginTop: 6, borderRadius: 8, overflow: 'hidden',
          border: '1px solid rgba(168,85,247,0.18)',
          background: 'linear-gradient(180deg, rgba(8,8,14,0.6), rgba(10,10,18,0.4))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 0 12px rgba(168,85,247,0.08)',
          animation: 'code-expand 0.18s ease-out',
        }}>
          <style>{`@keyframes code-expand { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          {/* Header strip: title + copy + preset id */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px 6px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            background: 'rgba(0,0,0,0.2)',
          }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 10.5, color: '#c8c8d0', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              <span style={{ color: '#c084fc', fontFamily: 'Geist Mono, monospace' }}>{currentPreset || 'custom'}</span>
              {title && <span style={{ color: '#7a7a90' }}>·</span>}
              {title && <span style={{ color: '#9a9ab0', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>}
            </div>
            <button onClick={handleCopy}
              title="Copy source"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 7px', borderRadius: 5, fontSize: 10.5, fontWeight: 500,
                background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(168,85,247,0.1)',
                color: copied ? '#86efac' : '#e9d5ff',
                border: copied ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(168,85,247,0.3)',
                cursor: 'pointer', transition: 'all 0.15s ease-out',
              }}>
              <Copy size={10} strokeWidth={2.4} />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {/* Body */}
          <pre style={{
            margin: 0, padding: '8px 10px',
            maxHeight: 240, overflow: 'auto',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            fontSize: 10.5, lineHeight: 1.45,
            color: '#e9e9f0',
            whiteSpace: 'pre',
            tabSize: 2,
          }}>
            <code>
              {tokens.map(([type, text], i) => (
                <span key={i} style={{ color: TOKEN_COLOR[type] || TOKEN_COLOR.text }}>{text}</span>
              ))}
            </code>
          </pre>
        </div>
      )}
    </div>
  )
}
