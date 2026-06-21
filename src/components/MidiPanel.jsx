import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  ACTIONS, loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  decodeMidiMessage, applyCC, attractorActions,
} from '../lib/midiMap'
import {
  MIDI_PRESETS, applyPresetToMap, detectPresetForInput, presetBindingCount,
} from '../lib/midiPresets'
import { Music4, X, CheckCircle2, AlertCircle, Zap } from 'lucide-react'

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
  // immediately so a refresh keeps the preset live.
  const applyPreset = (presetId, mode) => {
    const next = applyPresetToMap(bindings, presetId, mode)
    setBindings(next)
    saveMidiMap(next)
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

        {/* Controller presets — pre-baked CC→action maps for common hardware */}
        <PresetBar
          presets={MIDI_PRESETS}
          detectedId={detectedPresetId}
          onApply={applyPreset}
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
                {grouped.map(group => (
                  <div key={group.attractorId} style={{
                    border: '1px solid rgba(168,85,247,0.18)',
                    borderRadius: 8,
                    padding: '6px 8px',
                    marginBottom: 6,
                    background: 'rgba(168,85,247,0.03)',
                  }}>
                    <div style={{
                      fontSize: 11, fontWeight: 600, color: '#e9d5ff',
                      marginBottom: 4, padding: '2px 0',
                    }}>{group.name}</div>
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
                ))}
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
function PresetBar({ presets, detectedId, onApply }) {
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
              title={`${p.description} — ${presetBindingCount(p.id)} bindings. Shift-click to merge.`}
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
                {presetBindingCount(p.id)}
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
    </div>
  )
}
