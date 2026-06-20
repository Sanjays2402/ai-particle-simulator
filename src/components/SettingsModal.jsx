import { useState } from 'react'
import { useStore } from '../store'
import { resolveReducedMotion } from '../lib/reducedMotion'
import {
  ACTIONS, loadKeymap, saveKeymap, resetKeymap, setBinding, conflictsFor,
  labelForBinding, labelForCode,
} from '../lib/keymap'

export default function SettingsModal({ onClose }) {
  const { aiApiKey, aiBaseUrl, aiModel, setAiSettings,
          reducedMotionMode, setReducedMotionMode, osPrefersReducedMotion } = useStore()
  const [key, setKey] = useState(aiApiKey)
  const [url, setUrl] = useState(aiBaseUrl)
  const [model, setModel] = useState(aiModel)
  const [keymap, setKeymap] = useState(() => loadKeymap())
  // The action id currently waiting on a keystroke; null = no capture.
  const [capturing, setCapturing] = useState(null)
  const effective = resolveReducedMotion(reducedMotionMode, osPrefersReducedMotion)

  const save = () => {
    setAiSettings(key, url, model)
    saveKeymap(keymap)
    // Tell every listener (HelpOverlay, TopBar already reloads on
    // each keypress) that bindings just changed.
    try { window.dispatchEvent(new Event('particle:keymap-changed')) } catch { /* */ }
    onClose()
  }

  // Capture the next keystroke (excluding Escape, which cancels) and
  // assign it to `actionId`. We attach a one-shot window listener so
  // the user's focus doesn't matter — they can hit any key after
  // pressing the "Click to bind" button.
  const startCapture = (actionId) => {
    setCapturing(actionId)
    const onKey = (e) => {
      // Don't let the captured key trigger the global dispatcher this
      // turn — we're intercepting it for rebinding.
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        // Cancel without changing.
        setCapturing(null)
        window.removeEventListener('keydown', onKey, true)
        return
      }
      // Skip "lone modifier" presses — wait for the actual key.
      if (e.key === 'Shift' || e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') return
      // Bind to the physical code (KeyA, Space, etc) so the mapping
      // is layout-independent. Drop pure-modifier action codes too.
      setKeymap(m => setBinding(m, actionId, e.code))
      setCapturing(null)
      window.removeEventListener('keydown', onKey, true)
    }
    // useCapture=true so we beat the global dispatcher in TopBar.
    window.addEventListener('keydown', onKey, true)
  }

  const resetAll = () => {
    if (!window.confirm('Reset all keyboard shortcuts to defaults?')) return
    const fresh = resetKeymap()
    setKeymap(fresh)
    try { window.dispatchEvent(new Event('particle:keymap-changed')) } catch { /* */ }
  }

  // Group actions for display.
  const groups = []
  for (const a of ACTIONS) {
    let g = groups.find(x => x.group === a.group)
    if (!g) { g = { group: a.group, items: [] }; groups.push(g) }
    g.items.push(a)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 460,
        maxHeight: '88vh',
        overflowY: 'auto',
        borderRadius: 16,
        padding: 24,
        background: 'rgba(12,12,20,0.95)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#eeeef0', marginBottom: 20, letterSpacing: '-0.02em' }}>
          Settings
        </h2>
        <Field label="API Base URL" value={url} onChange={setUrl} placeholder="https://api.openai.com/v1" />
        <Field label="API Key" value={key} onChange={setKey} placeholder="sk-..." type="password" />
        <Field label="Model" value={model} onChange={setModel} placeholder="gpt-4o-mini" />

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#7a7a90', marginBottom: 8 }}>Accessibility</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 6 }}>
            {[
              { id: 'auto',   label: 'Auto',   desc: 'Follow OS pref' },
              { id: 'reduce', label: 'Reduce', desc: 'Suppress animations' },
              { id: 'full',   label: 'Full',   desc: 'Always animate' },
            ].map(opt => {
              const active = reducedMotionMode === opt.id
              return (
                <button key={opt.id} onClick={() => setReducedMotionMode(opt.id)}
                  title={opt.desc}
                  style={{
                    padding: '8px 0', borderRadius: 7, fontSize: 12, fontWeight: 550,
                    cursor: 'pointer', transition: 'all 0.15s ease-out',
                    background: active
                      ? 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.18))'
                      : 'rgba(255,255,255,0.03)',
                    color: active ? '#dbeafe' : '#8a8aa0',
                    border: active ? '1px solid rgba(99,102,241,0.45)' : '1px solid rgba(255,255,255,0.05)',
                  }}>{opt.label}</button>
              )
            })}
          </div>
          <p style={{ fontSize: 11, color: '#7a7a90', lineHeight: 1.5 }}>
            Currently <span style={{ color: effective ? '#86efac' : '#fbbf24', fontWeight: 600 }}>{effective ? 'reduced motion ON' : 'full motion ON'}</span>
            {' '}
            <span style={{ color: '#5a5a70' }}>
              (OS pref: {osPrefersReducedMotion ? 'reduce' : 'no-preference'}).
            </span>
            {' '}When reduced, hue cycle, auto-rotate, camera shake, and background parallax are suppressed.
          </p>
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#7a7a90' }}>Keyboard shortcuts</div>
            <button onClick={resetAll}
              title="Restore default bindings"
              style={{
                fontSize: 10, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', color: '#9a9ab0',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>Reset to defaults</button>
          </div>
          {groups.map(group => (
            <div key={group.group} style={{ marginBottom: 10 }}>
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: '#6a6a80', marginBottom: 4,
              }}>{group.group}</div>
              {group.items.map(a => {
                const isCapturing = capturing === a.id
                const conflicts = conflictsFor(keymap, a.id)
                const hasConflict = conflicts.length > 0
                return (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', marginBottom: 4, borderRadius: 7,
                    background: hasConflict ? 'rgba(239,68,68,0.06)' : 'rgba(255,255,255,0.02)',
                    border: hasConflict ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.04)',
                    fontSize: 12, color: '#d8d8e0',
                  }}>
                    <span>
                      {a.label}
                      {hasConflict && (
                        <span style={{ fontSize: 10, color: '#fca5a5', marginLeft: 6 }}>
                          conflicts with {conflicts.map(id => ACTIONS.find(x => x.id === id)?.label).filter(Boolean).join(', ')}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => startCapture(a.id)}
                      title={isCapturing ? 'Press any key (Esc to cancel)' : 'Click to rebind'}
                      style={{
                        padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                        background: isCapturing
                          ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(99,102,241,0.18))'
                          : 'rgba(255,255,255,0.05)',
                        color: isCapturing ? '#e9d5ff' : '#c8c8d0',
                        border: isCapturing
                          ? '1px solid rgba(168,85,247,0.45)'
                          : '1px solid rgba(255,255,255,0.08)',
                        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                        minWidth: 64, textAlign: 'center',
                      }}
                    >
                      {isCapturing ? 'Press key\u2026' : labelForBinding(a.id, keymap) || labelForCode(keymap[a.id])}
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#7a7a90', marginBottom: 8 }}>Local Data</div>
          <button
            onClick={() => {
              if (!window.confirm('Reset all local settings (theme, quality, palette, favorites, onboarding)?')) return
              try {
                localStorage.removeItem('particle-settings-v1')
                localStorage.removeItem('particle-onboarding-v1-seen')
                localStorage.removeItem('favorite-presets')
                Object.keys(localStorage)
                  .filter(k => k.startsWith('preset-thumb-'))
                  .forEach(k => localStorage.removeItem(k))
              } catch { /* ignore quota / private mode */ }
              window.location.reload()
            }}
            style={{
              width: '100%', padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 550,
              background: 'rgba(239,68,68,0.08)', color: '#fca5a5',
              border: '1px solid rgba(239,68,68,0.25)', cursor: 'pointer',
            }}
          >Reset Local Settings &amp; Reload</button>

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => {
                // Dump everything from the v1 settings blob + favorites
                // into a JSON file. Useful for round-tripping between
                // machines or browsers without share URLs.
                const blob = {
                  v: 1,
                  settings: JSON.parse(localStorage.getItem('particle-settings-v1') || '{}'),
                  favorites: JSON.parse(localStorage.getItem('favorite-presets') || '[]'),
                  recent: JSON.parse(localStorage.getItem('recent-presets') || '[]'),
                }
                const data = JSON.stringify(blob, null, 2)
                const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
                const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }))
                const a = document.createElement('a')
                a.href = url
                a.download = `particle-settings-${ts}.json`
                a.click()
                setTimeout(() => URL.revokeObjectURL(url), 1000)
              }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'rgba(99,102,241,0.1)', color: '#a5b4fc',
                border: '1px solid rgba(99,102,241,0.25)', cursor: 'pointer',
              }}
            >Export JSON</button>
            <label
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 500,
                background: 'rgba(34,197,94,0.08)', color: '#86efac',
                border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              Import JSON
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files && e.target.files[0]
                  if (!f) return
                  try {
                    const text = await f.text()
                    const blob = JSON.parse(text)
                    if (blob.settings)  localStorage.setItem('particle-settings-v1', JSON.stringify(blob.settings))
                    if (blob.favorites) localStorage.setItem('favorite-presets', JSON.stringify(blob.favorites))
                    if (blob.recent)    localStorage.setItem('recent-presets', JSON.stringify(blob.recent))
                    window.location.reload()
                  } catch (err) {
                    window.alert('Could not parse settings JSON: ' + err.message)
                  }
                }}
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: 'rgba(255,255,255,0.04)', color: '#7a7a90', border: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer', transition: 'all 0.15s ease-out',
          }}>Cancel</button>
          <button onClick={save} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: '#6366f1', color: '#ffffff', border: 'none',
            cursor: 'pointer', transition: 'all 0.15s ease-out',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#7a7a90', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          outline: 'none',
          fontFamily: 'inherit',
          background: 'rgba(255,255,255,0.04)',
          color: '#eeeef0',
          border: '1px solid rgba(255,255,255,0.06)',
          transition: 'all 0.15s ease-out',
        }}
        onFocus={e => {
          e.target.style.borderColor = 'rgba(99,102,241,0.4)'
          e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
        }}
        onBlur={e => {
          e.target.style.borderColor = 'rgba(255,255,255,0.06)'
          e.target.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}
