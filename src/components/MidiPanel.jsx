import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  ACTIONS, loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  decodeMidiMessage, applyCC, attractorActions,
} from '../lib/midiMap'
import {
  MIDI_PRESETS, applyPresetToMap, detectPresetForInput, presetBindingCount,
  // R13.05 — user preset bundle editor
  loadUserPresets, saveUserPresets,
  buildUserPresetFromMap, addUserPreset, removeUserPreset,
  // R14.18 — rename in place
  renameUserPreset,
  MAX_USER_PRESETS,
} from '../lib/midiPresets'
import {
  // R14.17 — single-bundle JSON export/import
  downloadUserBundleFile,
  parseImport as parseUserBundleImport,
  isAtBundleCap,
} from '../lib/midiUserBundleIO'
import { attractorTypeStyle } from '../lib/namedAttractors'
import { Music4, X, CheckCircle2, AlertCircle, Zap, Save, Trash2, Download, Upload } from 'lucide-react'
import { showToast } from './Toast'

// Floating Web MIDI control panel. Opens from the LeftSidebar's
// "MIDI Controller" button. Connects to navigator.requestMIDIAccess,
// listens for CC messages, applies them through src/lib/midiMap, and
// gives the user a "Learn" workflow: click Learn on an action row,
// twist a knob on hardware → that CC is bound to that action.
//
// We mount this only when `open` is true so the listener pump only
// runs when the user is actively wiring things up. Bindings keep
// working in the background via a separate always-on hook below.

export default function MidiPanel({ open, onClose }) {
  const [status, setStatus] = useState('idle') // idle | requesting | ok | denied | unsupported
  const [errorMsg, setErrorMsg] = useState('')
  const [inputs, setInputs] = useState([])
  const [bindings, setBindings] = useState(() => loadMidiMap())
  const [lastCC, setLastCC] = useState(null)   // {cc, value, deviceName}
  const [learnFor, setLearnFor] = useState(null) // actionId waiting for next CC
  // R13.05 — user-authored bundle list. Persisted separately from the
  // live binding map so saving a bundle never touches the live state.
  const [userPresets, setUserPresets] = useState(() => loadUserPresets())
  // Save-bundle form open/closed + draft name.
  const [savingBundle, setSavingBundle] = useState(false)
  const [bundleName, setBundleName] = useState('')
  // Subscribe to the live attractor list so per-attractor MIDI rows
  // appear/disappear and re-label in real time as the user adds,
  // renames, or deletes attractors. attractorActions() is pure data
  // (id + label + range), so this is cheap to re-derive each render.
  const namedAttractors = useStore(s => s.namedAttractors)
  const attractorRows = attractorActions({ namedAttractors })
  const accessRef = useRef(null)
  // refs so the message callback (registered once) sees latest state.
  const bindingsRef = useRef(bindings)
  const learnForRef = useRef(learnFor)
  useEffect(() => { bindingsRef.current = bindings }, [bindings])
  useEffect(() => { learnForRef.current = learnFor }, [learnFor])

  // Acquire MIDIAccess and wire up listeners. We re-run when the
  // panel opens so a denied first attempt can be retried on a later
  // reopen (e.g. after the user grants permission via site settings).
  useEffect(() => {
    if (!open) return
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      // Defer synchronous setState — the React Compiler flags
      // setState-in-effect-body as a cascading-render hazard.
      queueMicrotask(() => {
        setStatus('unsupported')
        setErrorMsg('Web MIDI is not supported in this browser.')
      })
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setStatus('requesting')
      setErrorMsg('')
    })
    navigator.requestMIDIAccess({ sysex: false }).then(access => {
      if (cancelled) return
      accessRef.current = access
      setStatus('ok')
      // Snapshot connected inputs for the UI.
      const ins = []
      access.inputs.forEach(input => ins.push({ id: input.id, name: input.name || 'MIDI input' }))
      setInputs(ins)
      const onMessage = (event) => {
        const msg = decodeMidiMessage(event.data)
        if (!msg) return
        if (msg.type !== 0xB0) return  // CC only for now
        setLastCC({ cc: msg.data1, value: msg.data2, deviceName: event.currentTarget?.name || 'MIDI' })
        // If a Learn is pending, capture this CC instead of dispatching.
        // We read the latest bindings via the ref (sync-updated by the
        // effect above) so we don't need this effect to depend on
        // `bindings` — that would tear down the access on every change.
        if (learnForRef.current) {
          const next = setBinding(bindingsRef.current, msg.data1, learnForRef.current)
          setBindings(next)
          saveMidiMap(next)
          setLearnFor(null)
          return
        }
        // Normal dispatch via the always-on hook is handled separately;
        // we still apply here so the user sees changes immediately while
        // the panel is open even on first connect.
        applyCC(bindingsRef.current, msg.data1, msg.data2, useStore.getState())
      }
      access.inputs.forEach(input => { input.onmidimessage = onMessage })
      // Watch for hot-plug.
      access.onstatechange = () => {
        const refresh = []
        access.inputs.forEach(input => {
          input.onmidimessage = onMessage
          refresh.push({ id: input.id, name: input.name || 'MIDI input' })
        })
        setInputs(refresh)
      }
    }).catch(err => {
      if (cancelled) return
      setStatus('denied')
      setErrorMsg(err && err.message ? err.message : 'MIDI permission denied.')
    })
    return () => {
      cancelled = true
      // Don't tear down listeners — the always-on hook keeps them
      // alive so bindings still fire after closing this panel.
    }
  }, [open])

  const startLearn = (actionId) => setLearnFor(prev => prev === actionId ? null : actionId)
  const clearBinding = (actionId) => {
    // Remove every CC that points to this action.
    const next = { ...bindings }
    for (const [cc, id] of Object.entries(next)) {
      if (id === actionId) delete next[cc]
    }
    setBindings(next)
    saveMidiMap(next)
  }
  const resetAll = () => {
    if (!window.confirm('Clear ALL MIDI bindings?')) return
    setBindings(clearAllBindings())
  }

  // Apply a controller preset. mode = 'replace' wipes existing
  // bindings; 'merge' keeps untouched CCs intact. We persist
  // immediately so a refresh keeps the preset live. R13.05 — passes
  // userPresets so a user-saved bundle resolves alongside shipped
  // ones; same code path either way.
  const applyPreset = (presetId, mode) => {
    const next = applyPresetToMap(bindings, presetId, mode, userPresets)
    setBindings(next)
    saveMidiMap(next)
  }

  // R13.05 — commit the current bindings as a new user bundle.
  // Refuses empty names and empty maps (the lib guards both but we
  // surface the failure with a clearer message). Caps at
  // MAX_USER_PRESETS by dropping the oldest entry.
  const commitBundle = () => {
    const built = buildUserPresetFromMap(bundleName, bindings, userPresets)
    if (!built) {
      // Either the name was empty/whitespace or the live map had no
      // built-in CC actions to save. Both cases are handled by the
      // form gating below, but the lib's null-return is the source
      // of truth so we double-check here.
      return
    }
    const next = addUserPreset(userPresets, built)
    setUserPresets(next)
    saveUserPresets(next)
    setSavingBundle(false)
    setBundleName('')
  }

  const deleteUserBundle = (id) => {
    if (!window.confirm('Delete this saved bundle?')) return
    const next = removeUserPreset(userPresets, id)
    setUserPresets(next)
    saveUserPresets(next)
  }

  // R14.18 — rename a user bundle in place. The lib's
  // renameUserPreset returns the SAME array ref on no-op (blank
  // name, missing id, identical name), so we only save when the
  // ref actually changed.
  const renameUserBundle = (id, newName) => {
    const next = renameUserPreset(userPresets, id, newName)
    if (next === userPresets) return false
    setUserPresets(next)
    saveUserPresets(next)
    return true
  }

  // R14.17 — download one user bundle as a portable JSON file. The
  // filename is auto-slugified from the bundle name + dated. We use
  // the showToast pattern the rest of the app uses for non-blocking
  // feedback rather than the existing window.confirm style in this
  // panel — exports succeed silently 99% of the time and a toast
  // lines up better with that.
  const exportUserBundle = (bundle) => {
    if (!bundle) return
    const filename = downloadUserBundleFile(bundle)
    if (filename) {
      const count = Object.keys(bundle.map || {}).length
      showToast(`Exported "${bundle.name}" (${count} binding${count === 1 ? '' : 's'}) → ${filename}`)
    } else {
      showToast(`Export failed for "${bundle.name}"`)
    }
  }

  // R14.17 — import a user bundle from a JSON file. Opens a hidden
  // file picker, parses + sanitizes, then appends via addUserPreset
  // (which mints a fresh id + FIFO-drops the oldest at cap). Refuses
  // when the user is already AT the cap so they don't lose a bundle
  // silently to the FIFO drop — the UI surfaces this state at the
  // button level too.
  const importUserBundle = () => {
    if (typeof document === 'undefined') return
    if (isAtBundleCap(userPresets)) {
      showToast(`At bundle cap (${MAX_USER_PRESETS}) — delete one first`)
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        const parsed = parseUserBundleImport(raw)
        if (!parsed.ok) {
          showToast(`Import failed: ${parsed.error}`)
          return
        }
        // buildUserPresetFromMap mints a fresh id + adds vendor +
        // createdAt — exactly what we need for a freshly imported
        // bundle. Pass the existing list so the id-mint avoids
        // collisions with anything already saved.
        const built = buildUserPresetFromMap(parsed.bundle.name, parsed.bundle.map, userPresets)
        if (!built) {
          showToast('Import failed: bundle had no valid bindings')
          return
        }
        const next = addUserPreset(userPresets, built)
        setUserPresets(next)
        saveUserPresets(next)
        const count = Object.keys(built.map).length
        showToast(`Imported "${built.name}" (${count} binding${count === 1 ? '' : 's'})`)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // Try to auto-detect a likely preset from the connected inputs.
  // Returns the preset id of the FIRST match, or null. Surface only —
  // we don't auto-apply, the user has to opt in.
  const detectedPresetId = (() => {
    for (const inp of inputs) {
      const id = detectPresetForInput(inp.name)
      if (id) return id
    }
    return null
  })()

  // For each action, find the CC currently bound to it (first match wins).
  const ccFor = (actionId) => {
    for (const [cc, id] of Object.entries(bindings)) {
      if (id === actionId) return cc
    }
    return null
  }

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(4,4,8,0.55)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxWidth: '92vw', maxHeight: '84vh', overflowY: 'auto',
        background: 'linear-gradient(180deg, rgba(20,20,30,0.94) 0%, rgba(14,14,22,0.96) 100%)',
        backdropFilter: 'blur(28px) saturate(140%)',
        WebkitBackdropFilter: 'blur(28px) saturate(140%)',
        border: '1px solid rgba(99,102,241,0.25)',
        borderRadius: 16,
        boxShadow: '0 30px 80px rgba(0,0,0,0.6), 0 0 40px rgba(99,102,241,0.18)',
        padding: '20px 22px 18px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1, #a855f7, #ec4899)',
              boxShadow: '0 0 14px rgba(99,102,241,0.4)',
            }}>
              <Music4 size={14} strokeWidth={2.4} color="#fff" />
            </span>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#eeeef0', letterSpacing: '-0.02em' }}>
              MIDI Controller
            </h2>
          </div>
          <button onClick={onClose} title="Close"
            style={{
              width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8, background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)', color: '#9a9ab0', cursor: 'pointer',
            }}
          ><X size={14} /></button>
        </div>

        {/* Status banner */}
        <StatusBanner status={status} message={errorMsg} inputs={inputs} lastCC={lastCC} />

        {/* Controller presets — pre-baked CC→action maps for common hardware
            + R13.05 user-authored bundles + R14.17 single-bundle JSON IO */}
        <PresetBar
          presets={MIDI_PRESETS}
          userPresets={userPresets}
          detectedId={detectedPresetId}
          onApply={applyPreset}
          onDeleteUser={deleteUserBundle}
          onRenameUser={renameUserBundle}
          onExportUser={exportUserBundle}
          onImportUser={importUserBundle}
          savingBundle={savingBundle}
          onStartSave={() => { setSavingBundle(true); setBundleName('') }}
          onCancelSave={() => { setSavingBundle(false); setBundleName('') }}
          onCommitBundle={commitBundle}
          bundleName={bundleName}
          onBundleNameChange={setBundleName}
          liveBindingCount={Object.keys(bindings).length}
        />

        {/* Action list */}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#8a8aa0',
            }}>Bindings</div>
            <button onClick={resetAll}
              title="Clear all bindings"
              style={{
                fontSize: 10, padding: '4px 8px', borderRadius: 6, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', color: '#9a9ab0',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>Clear all</button>
          </div>
          {ACTIONS.map(a => {
            const cc = ccFor(a.id)
            const isLearning = learnFor === a.id
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 10px', marginBottom: 4, borderRadius: 7,
                background: isLearning ? 'rgba(168,85,247,0.10)' : 'rgba(255,255,255,0.02)',
                border: isLearning ? '1px solid rgba(168,85,247,0.40)' : '1px solid rgba(255,255,255,0.04)',
                fontSize: 12, color: '#d8d8e0',
              }}>
                <span>{a.label} <span style={{ color: '#6a6a80', fontSize: 10, marginLeft: 4 }}>{a.min}..{a.max}</span></span>
                <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  {cc !== null && (
                    <span style={{
                      padding: '2px 7px', borderRadius: 5, fontSize: 10,
                      background: 'rgba(34,197,94,0.10)', color: '#86efac',
                      border: '1px solid rgba(34,197,94,0.25)',
                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    }}>CC {cc}</span>
                  )}
                  <button onClick={() => startLearn(a.id)}
                    title={isLearning ? 'Press a knob/slider on the controller…' : 'Click then move the controller'}
                    style={{
                      padding: '3px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                      background: isLearning
                        ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(99,102,241,0.18))'
                        : 'rgba(255,255,255,0.05)',
                      color: isLearning ? '#e9d5ff' : '#c8c8d0',
                      border: isLearning
                        ? '1px solid rgba(168,85,247,0.45)'
                        : '1px solid rgba(255,255,255,0.08)',
                      fontFamily: 'Geist Mono, monospace', minWidth: 56, textAlign: 'center',
                    }}
                  >{isLearning ? 'Move…' : 'Learn'}</button>
                  {cc !== null && (
                    <button onClick={() => clearBinding(a.id)}
                      title="Remove this binding"
                      style={{
                        padding: '3px 7px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                        background: 'rgba(255,255,255,0.03)', color: '#9a9ab0',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}><X size={10} /></button>
                  )}
                </span>
              </div>
            )
          })}
          {/* Named attractor bindings (R12.05 + R13.18) — one row per
              field per attractor the user has saved. We group them
              visually by attractor so the panel stays readable even
              with a 12-attractor scene × 5 fields = 60 rows. Same
              Learn / clear UX as the built-in actions; action ids
              are namespaced under `attr:<id>:<field>` so a deleted
              attractor leaves a clearly-labelled stale row (still
              removable). */}
          {attractorRows.length > 0 && (() => {
            // Group by attractorId so each attractor's 5 field rows
            // sit under a single header. Preserves the array order
            // (which matches the user's saved attractor order) so
            // long-press / drag ordering work in tandem with this UI.
            const grouped = []
            const seen = new Map()
            for (const r of attractorRows) {
              let bucket = seen.get(r.attractorId)
              if (!bucket) {
                bucket = { attractorId: r.attractorId, name: r.attractor?.name || r.attractorId, rows: [] }
                seen.set(r.attractorId, bucket)
                grouped.push(bucket)
              }
              bucket.rows.push(r)
            }
            return (
              <>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: '#a78bfa',
                  marginTop: 14, marginBottom: 6,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  Named Attractors
                  <span style={{
                    fontWeight: 500, color: '#7a7a90', letterSpacing: 0,
                    textTransform: 'none', fontSize: 10,
                  }}>· strength / radius / x / y / z</span>
                </div>
                {grouped.map(group => {
                  // R14.05 — pull the LIVE attractor so the group header
                  // borrows the attractor's type-specific accent. Stale
                  // groups (deleted attractor still has bindings) fall
                  // back to the violet "missing" tone via the FALLBACK
                  // path inside attractorTypeStyle.
                  const liveAttr = (namedAttractors || []).find(a => a && a.id === group.attractorId)
                  const groupStyle = liveAttr
                    ? attractorTypeStyle(liveAttr.type)
                    : attractorTypeStyle('attractor')
                  const isStale = !liveAttr
                  return (
                    <div key={group.attractorId} style={{
                      border: `1px solid ${isStale ? 'rgba(168,85,247,0.18)' : groupStyle.borderFaint}`,
                      borderRadius: 8,
                      padding: '6px 8px',
                      marginBottom: 6,
                      background: isStale ? 'rgba(168,85,247,0.03)' : groupStyle.bgFaint,
                    }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600,
                        color: isStale ? '#e9d5ff' : groupStyle.fg,
                        marginBottom: 4, padding: '2px 0',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {/* Tiny dot — same colour, just a denser cue
                            so the header is scannable even at narrow
                            widths where the border isn't obvious. */}
                        <span aria-hidden="true" style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: isStale ? 'rgba(168,85,247,0.85)' : groupStyle.accent,
                          boxShadow: isStale ? 'none' : `0 0 6px ${groupStyle.borderSoft}`,
                          display: 'inline-block',
                        }} />
                        {group.name}
                        {liveAttr && (
                          <span style={{
                            fontSize: 9, fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                            color: groupStyle.fgMuted, opacity: 0.85,
                            textTransform: 'uppercase', letterSpacing: '0.06em',
                            fontWeight: 500,
                          }}>{liveAttr.type === 'turbulence' ? 'turb' : liveAttr.type}</span>
                        )}
                      </div>
                      {group.rows.map(a => {
                        const cc = ccFor(a.id)
                        const isLearning = learnFor === a.id
                        return (
                          <div key={a.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '5px 6px', marginBottom: 3, borderRadius: 6,
                            background: isLearning ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.02)',
                            border: isLearning ? '1px solid rgba(168,85,247,0.40)' : '1px solid rgba(255,255,255,0.03)',
                            fontSize: 11, color: '#d8d8e0',
                          }}>
                            <span>
                              {a.field === 'strength' ? 'Strength'
                                : a.field === 'radius' ? 'Radius'
                                : a.field.toUpperCase()}
                              <span style={{ color: '#6a6a80', fontSize: 10, marginLeft: 6 }}>
                                {a.min}..{a.max}
                              </span>
                            </span>
                            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {cc !== null && (
                                <span style={{
                                  padding: '2px 7px', borderRadius: 5, fontSize: 10,
                                  background: 'rgba(34,197,94,0.10)', color: '#86efac',
                                  border: '1px solid rgba(34,197,94,0.25)',
                                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                                }}>CC {cc}</span>
                              )}
                              <button onClick={() => startLearn(a.id)}
                                title={isLearning ? 'Press a knob/slider on the controller…' : 'Click then move the controller'}
                                style={{
                                  padding: '2px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                                  background: isLearning
                                    ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(99,102,241,0.18))'
                                    : 'rgba(255,255,255,0.05)',
                                  color: isLearning ? '#e9d5ff' : '#c8c8d0',
                                  border: isLearning
                                    ? '1px solid rgba(168,85,247,0.45)'
                                    : '1px solid rgba(255,255,255,0.08)',
                                  fontFamily: 'Geist Mono, monospace', minWidth: 54, textAlign: 'center',
                                }}
                              >{isLearning ? 'Move…' : 'Learn'}</button>
                              {cc !== null && (
                                <button onClick={() => clearBinding(a.id)}
                                  title="Remove this binding"
                                  style={{
                                    padding: '2px 6px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.03)', color: '#9a9ab0',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                  }}><X size={10} /></button>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            )
          })()}
        </div>

        <div style={{
          fontSize: 11, color: '#6a6a80', textAlign: 'center',
          paddingTop: 10, marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)',
        }}>
          Click <strong>Learn</strong> then twist a knob or move a fader. Bindings persist locally.
        </div>
      </div>
    </div>
  )
}

function StatusBanner({ status, message, inputs, lastCC }) {
  if (status === 'idle')        return null
  if (status === 'requesting')  return <Banner color="indigo" icon={<Music4 size={12} />}>Requesting MIDI access…</Banner>
  if (status === 'unsupported') return <Banner color="amber"  icon={<AlertCircle size={12} />}>{message}</Banner>
  if (status === 'denied')      return <Banner color="red"    icon={<AlertCircle size={12} />}>MIDI access denied: {message}</Banner>
  // ok
  const ccLabel = lastCC ? `CC ${lastCC.cc} = ${lastCC.value} (${lastCC.deviceName})` : 'Waiting for input...'
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8, marginBottom: 10,
      background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)',
      color: '#bbf7d0', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <CheckCircle2 size={12} strokeWidth={2.4} />
        {inputs.length === 0 ? 'No inputs connected — plug in a controller and twist a knob.' : `${inputs.length} input${inputs.length === 1 ? '' : 's'}: ${inputs.map(i => i.name).join(', ')}`}
      </span>
      <span style={{ fontFamily: 'Geist Mono, monospace', color: '#a5f3d0' }}>{ccLabel}</span>
    </div>
  )
}

function Banner({ color, icon, children }) {
  const bg = color === 'amber'  ? 'rgba(245,158,11,0.08)'
           : color === 'red'    ? 'rgba(239,68,68,0.08)'
           : color === 'indigo' ? 'rgba(99,102,241,0.08)'
           : 'rgba(255,255,255,0.04)'
  const fg = color === 'amber'  ? '#fcd34d'
           : color === 'red'    ? '#fca5a5'
           : color === 'indigo' ? '#a5b4fc'
           : '#c8c8d0'
  const bd = color === 'amber'  ? 'rgba(245,158,11,0.25)'
           : color === 'red'    ? 'rgba(239,68,68,0.25)'
           : color === 'indigo' ? 'rgba(99,102,241,0.25)'
           : 'rgba(255,255,255,0.08)'
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 8, marginBottom: 10,
      background: bg, color: fg, border: `1px solid ${bd}`, fontSize: 11,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{icon}{children}</div>
  )
}

// Controller-preset bar — one chip per shipped bundle plus a tiny
// "auto-detected" badge when one of the connected inputs matches by
// name. Click the chip to apply the bundle (Replace mode); Shift-click
// to merge into the existing map without wiping pre-existing bindings.
//
// R13.05 — also renders any USER-authored bundles (vendor === 'Custom')
// in a second row below the shipped chips, with a small X on each so
// the user can delete a bundle. A "+ Save current" button opens an
// inline form to capture the current binding map as a new bundle.
function PresetBar({
  presets, userPresets = [], detectedId, onApply, onDeleteUser, onRenameUser,
  onExportUser, onImportUser,
  savingBundle, onStartSave, onCancelSave, onCommitBundle,
  bundleName, onBundleNameChange, liveBindingCount,
}) {
  const canSave = (bundleName || '').trim().length > 0 && liveBindingCount > 0
  const atCap = userPresets.length >= MAX_USER_PRESETS
  return (
    <div style={{
      padding: '10px 12px', marginBottom: 10, borderRadius: 8,
      background: 'rgba(168,85,247,0.06)',
      border: '1px solid rgba(168,85,247,0.18)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: '#c4b5fd',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <Zap size={11} strokeWidth={2.4} />
          Controller Presets
        </span>
        <span style={{
          fontSize: 10, color: '#8a8aa0', fontFamily: 'Geist Mono, monospace',
        }}>
          shift-click to merge
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {presets.map(p => {
          const isDetected = detectedId === p.id
          return (
            <button
              key={p.id}
              onClick={(e) => onApply(p.id, e.shiftKey ? 'merge' : 'replace')}
              title={`${p.description} — ${presetBindingCount(p.id, userPresets)} bindings. Shift-click to merge.`}
              style={{
                padding: '5px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                background: isDetected
                  ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(168,85,247,0.14))'
                  : 'rgba(255,255,255,0.04)',
                color: isDetected ? '#bbf7d0' : '#c8c8d0',
                border: isDetected
                  ? '1px solid rgba(34,197,94,0.45)'
                  : '1px solid rgba(255,255,255,0.10)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: 'Geist, system-ui, sans-serif',
                transition: 'background 0.12s ease',
              }}
            >
              {p.name}
              <span style={{
                fontSize: 9, fontFamily: 'Geist Mono, monospace',
                color: isDetected ? '#86efac' : '#8a8aa0',
              }}>
                {presetBindingCount(p.id, userPresets)}
              </span>
              {isDetected && (
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 4,
                  background: 'rgba(34,197,94,0.22)', color: '#86efac',
                  fontFamily: 'Geist Mono, monospace',
                }}>detected</span>
              )}
            </button>
          )
        })}
      </div>
      {/* R13.05 — user-authored bundles. Hidden until at least one
          exists or the user clicks "Save current" so the panel stays
          tidy out of the box. */}
      {(userPresets.length > 0 || savingBundle) && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 10, marginBottom: 6,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#fbcfe8',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Save size={11} strokeWidth={2.4} />
              Your Bundles
              <span style={{
                fontSize: 9, fontWeight: 500, color: '#7a7a90', letterSpacing: 0,
                textTransform: 'none', fontFamily: 'Geist Mono, monospace',
              }}>
                {userPresets.length}/{MAX_USER_PRESETS}
              </span>
            </span>
          </div>
          {userPresets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: savingBundle ? 8 : 0 }}>
              {userPresets.map(p => (
                <UserBundleChip
                  key={p.id}
                  preset={p}
                  onApply={(mode) => onApply(p.id, mode)}
                  onDelete={() => onDeleteUser(p.id)}
                  onRename={onRenameUser ? (newName) => onRenameUser(p.id, newName) : null}
                  onExport={onExportUser ? () => onExportUser(p) : null}
                />
              ))}
            </div>
          )}
          {/* Save form — inline so it stays in context */}
          {savingBundle && (
            <div style={{
              display: 'flex', gap: 6, alignItems: 'center',
              padding: 6, borderRadius: 6,
              background: 'rgba(236,72,153,0.05)',
              border: '1px solid rgba(236,72,153,0.20)',
            }}>
              <input
                value={bundleName}
                onChange={(e) => onBundleNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canSave) onCommitBundle()
                  if (e.key === 'Escape') onCancelSave()
                }}
                placeholder={liveBindingCount === 0 ? 'No bindings to save yet' : 'Bundle name'}
                maxLength={32}
                autoFocus
                disabled={liveBindingCount === 0}
                style={{
                  flex: 1, padding: '4px 8px', borderRadius: 5, fontSize: 11,
                  background: 'rgba(0,0,0,0.25)', color: '#f3e8ff',
                  border: '1px solid rgba(236,72,153,0.25)',
                  outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button onClick={onCommitBundle} disabled={!canSave}
                title={!canSave ? (liveBindingCount === 0 ? 'No bindings to save' : 'Type a name') : `Save ${liveBindingCount} bindings`}
                style={{
                  padding: '4px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  cursor: canSave ? 'pointer' : 'not-allowed',
                  background: canSave
                    ? 'linear-gradient(135deg, rgba(236,72,153,0.25), rgba(168,85,247,0.18))'
                    : 'rgba(255,255,255,0.04)',
                  color: canSave ? '#fff' : '#5a5a70',
                  border: canSave ? '1px solid rgba(236,72,153,0.45)' : '1px solid rgba(255,255,255,0.07)',
                  fontFamily: 'inherit',
                }}>Save</button>
              <button onClick={onCancelSave}
                style={{
                  padding: '4px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.03)', color: '#9a9ab0',
                  border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'inherit',
                }}>Cancel</button>
            </div>
          )}
        </>
      )}
      {/* "+ Save current" button — always visible (when not editing)
          so users discover the feature without having to know it
          exists. Disabled at cap so we don't quietly lose entries.
          R14.17 — pairs with "Import bundle" so a fresh install
          can pick up a friend's bundle file without first having
          to save one of their own (otherwise the whole "Your
          Bundles" section never appears). */}
      {!savingBundle && (
        <div style={{
          marginTop: userPresets.length > 0 ? 8 : 6,
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <button onClick={onStartSave}
            disabled={atCap}
            title={atCap
              ? `At cap (${MAX_USER_PRESETS}) — delete one first`
              : 'Save the current bindings as a reusable bundle'}
            style={{
              padding: '5px 9px', borderRadius: 6, fontSize: 11, fontWeight: 550,
              cursor: atCap ? 'not-allowed' : 'pointer',
              background: atCap ? 'rgba(255,255,255,0.03)' : 'rgba(236,72,153,0.08)',
              color: atCap ? '#5a5a70' : '#fbcfe8',
              border: atCap ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(236,72,153,0.25)',
              display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
            }}>
            <Save size={10} strokeWidth={2.4} />
            {atCap ? `Bundle cap reached (${MAX_USER_PRESETS})` : 'Save current as bundle'}
          </button>
          {/* R14.17 — import a bundle from a JSON file. Same cap-disable
              behaviour so the import doesn't silently FIFO-drop an
              existing bundle the user might still want. */}
          {onImportUser && (
            <button onClick={onImportUser}
              disabled={atCap}
              title={atCap
                ? `At cap (${MAX_USER_PRESETS}) — delete one first`
                : 'Import a bundle JSON file (from another machine or a collaborator)'}
              style={{
                padding: '5px 9px', borderRadius: 6, fontSize: 11, fontWeight: 550,
                cursor: atCap ? 'not-allowed' : 'pointer',
                background: atCap ? 'rgba(255,255,255,0.03)' : 'rgba(99,102,241,0.10)',
                color: atCap ? '#5a5a70' : '#c7d2fe',
                border: atCap ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(99,102,241,0.25)',
                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
              }}>
              <Upload size={10} strokeWidth={2.4} />
              Import bundle
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// R14.18 — UserBundleChip: a single user-authored bundle chip with
// double-click-to-rename inline editing. Replaces the static apply +
// trash row PresetBar used to render inline so the rename state
// machine + autoFocus input ref can live in one place.
//
// Layout matches the previous inline row exactly: [apply | export |
// trash] when at rest; switches to [name-input | save | cancel]
// while editing. Edit gesture is double-click on the name (matches
// NamedAttractorRow in LeftSidebar so the pattern is consistent
// across the app). Enter saves; Escape cancels; blur saves with
// fallback-to-cancel when the trimmed name is empty.
function UserBundleChip({ preset, onApply, onDelete, onRename, onExport }) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(preset.name)
  // (No useEffect needed to sync `draftName` ↔ `preset.name`: the
  // onDoubleClick handler re-initializes the draft from preset.name
  // every time editing starts, and the at-rest branch displays
  // preset.name directly. The only scenario a sync would cover is
  // "preset name changes externally while the input is open" which
  // is vanishingly rare — and dropping the effect keeps us under
  // React Compiler's `react-hooks/set-state-in-effect` purity rule.)

  const commitRename = () => {
    if (!onRename) { setEditing(false); return }
    const trimmed = (draftName || '').trim()
    if (!trimmed) {
      // Blank → revert + dismiss without calling rename (lib would
      // reject anyway, this just keeps the input from ping-ponging).
      setDraftName(preset.name)
      setEditing(false)
      return
    }
    onRename(trimmed)
    setEditing(false)
  }
  const cancelRename = () => {
    setDraftName(preset.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'stretch',
        borderRadius: 6, overflow: 'hidden',
        border: '1px solid rgba(168,85,247,0.45)',
        boxShadow: '0 0 10px rgba(168,85,247,0.18)',
      }}>
        <input
          type="text"
          value={draftName}
          autoFocus
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commitRename() }
            else if (e.key === 'Escape') { e.preventDefault(); cancelRename() }
          }}
          maxLength={32}
          placeholder="Bundle name"
          style={{
            minWidth: 0, width: Math.max(90, (draftName?.length || 0) * 7 + 24),
            padding: '5px 9px', fontSize: 11,
            background: 'rgba(0,0,0,0.30)',
            color: '#f3e8ff',
            border: 'none', outline: 'none',
            fontFamily: 'Geist, system-ui, sans-serif',
            borderRight: '1px solid rgba(168,85,247,0.30)',
          }}
        />
        <button onClick={commitRename} title="Save name (Enter)"
          style={{
            padding: '0 7px', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            background: 'rgba(34,197,94,0.10)', color: '#86efac',
            border: 'none', borderRight: '1px solid rgba(34,197,94,0.25)',
            display: 'inline-flex', alignItems: 'center',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            letterSpacing: '0.02em',
          }}>OK</button>
        <button onClick={cancelRename} title="Cancel (Escape)"
          style={{
            padding: '0 6px', fontSize: 11, cursor: 'pointer',
            background: 'rgba(255,255,255,0.03)', color: '#9a9ab0',
            border: 'none',
            display: 'inline-flex', alignItems: 'center',
          }}><X size={10} /></button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'stretch',
      borderRadius: 6, overflow: 'hidden',
      border: '1px solid rgba(236,72,153,0.30)',
    }}>
      <button
        onClick={(e) => onApply(e.shiftKey ? 'merge' : 'replace')}
        onDoubleClick={(e) => {
          // R14.18 — double-click to start editing. Only when a
          // rename handler is wired; otherwise this is a plain
          // apply button. preventDefault stops the double-tap from
          // selecting the chip text on mobile.
          if (!onRename) return
          e.preventDefault()
          e.stopPropagation()
          setDraftName(preset.name)
          setEditing(true)
        }}
        title={`${preset.description} · ${Object.keys(preset.map).length} bindings. Shift-click to merge${onRename ? '. Double-click name to rename' : ''}.`}
        style={{
          padding: '5px 9px', fontSize: 11, cursor: 'pointer',
          background: 'rgba(236,72,153,0.08)',
          color: '#fbcfe8',
          border: 'none',
          borderRight: '1px solid rgba(236,72,153,0.20)',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'Geist, system-ui, sans-serif',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        {preset.name}
        <span style={{
          fontSize: 9, fontFamily: 'Geist Mono, monospace',
          color: 'rgba(251,207,232,0.7)',
        }}>
          {Object.keys(preset.map).length}
        </span>
      </button>
      {/* R14.17 — per-bundle Export. Between apply + trash so the
          destructive trash stays the rightmost (least fat-fingerable)
          action. */}
      {onExport && (
        <button onClick={onExport} title={`Download "${preset.name}" as JSON`}
          style={{
            padding: '0 6px', fontSize: 11, cursor: 'pointer',
            background: 'rgba(99,102,241,0.08)', color: '#a5b4fc',
            border: 'none',
            borderRight: '1px solid rgba(99,102,241,0.18)',
            display: 'inline-flex', alignItems: 'center',
          }}>
          <Download size={10} />
        </button>
      )}
      <button onClick={onDelete} title="Delete this bundle"
        style={{
          padding: '0 6px', fontSize: 11, cursor: 'pointer',
          background: 'rgba(239,68,68,0.06)', color: '#fca5a5',
          border: 'none',
          display: 'inline-flex', alignItems: 'center',
        }}>
        <Trash2 size={10} />
      </button>
    </div>
  )
}
