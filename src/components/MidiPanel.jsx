import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import {
  ACTIONS, loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  decodeMidiMessage, applyCC, attractorActions,
  // R19.16 — pure projector for "current band" tooltip on TYPE rows.
  // R21.22 — describeClampProximity graduates R20.16's per-band meter
  // to continuous fields (strength/radius/x/y/z/radiusLog).
  describeTypeBand, describeClampProximity, ccToNormalized,
} from '../lib/midiMap'
import { ATTRACTOR_TYPES } from '../lib/namedAttractors'
import {
  MIDI_PRESETS, applyPresetToMap, detectPresetForInput, presetBindingCount,
  // R13.05 — user preset bundle editor
  loadUserPresets, saveUserPresets,
  buildUserPresetFromMap, addUserPreset, removeUserPreset,
  // R14.18 — rename in place
  renameUserPreset,
  // R16.19 — per-bundle colour tag
  setUserPresetColor, userPresetColorStyle, USER_PRESET_COLORS, DEFAULT_USER_PRESET_COLOR,
  MAX_USER_PRESETS,
  // R20.11 — per-bundle keyboard shortcut
  setUserPresetHotkey, hotkeyFromEvent, findUserPresetByHotkey,
  // R21.25 — pre-flight hotkey conflict detector for the warning toast
  detectHotkeyConflict,
} from '../lib/midiPresets'
import {
  // R14.17 — single-bundle JSON export/import
  downloadUserBundleFile,
  parseImport as parseUserBundleImport,
  isAtBundleCap,
  // R15.14 — multi-bundle (all bundles in one file) export/import
  downloadUserBundlesFileMulti,
  parseImportMulti as parseUserBundlesImportMulti,
  summarizeImportImpactMulti,
  // R19.20 — multi-file drop combiner (pure helper, no DOM)
  combineDroppedBundles,
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
  // R19.16 — per-CC last-seen value snapshot so each TYPE row can show
  // which BAND its bound CC currently sits in. Stored as STATE (not
  // a ref) so the render-time read in the TYPE row passes the
  // react-hooks/refs lint rule. We only update it when the incoming
  // CC is actually BOUND to one of our visible rows (filtered against
  // bindingsRef.current at message time) — otherwise a chatty
  // controller pumping unbound CCs would re-render the panel ~60×/sec
  // for no visible effect.
  const [lastCCByNumber, setLastCCByNumber] = useState({})
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
        // R19.16 — only update the per-CC state if this CC is bound to
        // SOMETHING (so we don't trigger an unrelated re-render every
        // 16ms when a chatty controller fires unbound CCs). The
        // functional setState lets us read+write atomically without
        // a stale closure.
        if (bindingsRef.current && bindingsRef.current[String(msg.data1)]) {
          setLastCCByNumber(prev => {
            if (prev[msg.data1] === msg.data2) return prev  // same value → no-op
            return { ...prev, [msg.data1]: msg.data2 }
          })
        }
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

  // R16.19 — set the colour tag for a user bundle. Mirrors the
  // rename handler shape (ref-equal-on-no-op skip), so re-clicking
  // the active swatch is free.
  const setUserBundleColor = (id, color) => {
    const next = setUserPresetColor(userPresets, id, color)
    if (next === userPresets) return false
    setUserPresets(next)
    saveUserPresets(next)
    return true
  }

  // R20.11 — set the keyboard shortcut for a user bundle. Mirrors
  // setUserBundleColor's ref-equal-on-no-op skip. Hotkey conflicts
  // are resolved at the lib layer (the same hotkey can only be bound
  // to ONE bundle; the lib silently un-binds it from any other).
  // R21.25 — detect that silent strip BEFORE the setter runs so the
  // UI can warn the user with a toast. Self-rebinds (the no-op path)
  // and clears (null/'') skip the warning since nothing is stolen.
  const setUserBundleHotkey = (id, hotkey) => {
    const conflict = detectHotkeyConflict(userPresets, id, hotkey)
    const next = setUserPresetHotkey(userPresets, id, hotkey)
    if (next === userPresets) return false
    setUserPresets(next)
    saveUserPresets(next)
    if (conflict) {
      const targetBundle = next.find(p => p.id === id)
      const targetColor = userPresetColorStyle(targetBundle?.color || DEFAULT_USER_PRESET_COLOR)
      showToast(
        `Hotkey \u201c${hotkey}\u201d stolen from \u201c${conflict.name}\u201d \u2192 \u201c${targetBundle?.name || 'bundle'}\u201d`,
        <AlertCircle size={10} color={targetColor.accent} strokeWidth={2.4} />,
      )
    }
    return true
  }

  // R20.11 — global keydown listener that resolves the event's hotkey
  // signature to a bundle and applies it. Bound at the component
  // level so it's only active while the MidiPanel is mounted (which
  // matches the rest of the app's panel-scoped shortcuts). Skips
  // events that originate inside text inputs / textareas / editable
  // content so a power user can type a binding's name without the
  // shortcut firing.
  useEffect(() => {
    const onKey = (e) => {
      // Skip events inside editable surfaces (TopBar search, rename
      // inputs, etc).
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const hk = hotkeyFromEvent(e)
      if (!hk) return
      const bundle = findUserPresetByHotkey(userPresets, hk)
      if (!bundle) return
      // Only consume the event when we know a bundle is bound to it.
      e.preventDefault()
      // Use 'replace' mode to match the chip's default apply behaviour.
      const incoming = applyPresetToMap(bindings, bundle.id, 'replace', userPresets)
      setBindings(incoming)
      saveMidiMap(incoming)
      const color = userPresetColorStyle(bundle.color || DEFAULT_USER_PRESET_COLOR)
      showToast(`Applied \u201c${bundle.name}\u201d (\u2328\ufe0f ${hk})`,
        <Music4 size={10} color={color.accent} strokeWidth={2.4} />)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userPresets, bindings])

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

  // R15.14 — export EVERY user bundle in a single multi-bundle JSON
  // file. Useful for backup / cross-machine sync of the entire
  // "Your Bundles" section without N separate file dialogs. Disabled
  // when the list is empty; toasts the bundle count + filename.
  const exportAllUserBundles = () => {
    if (!Array.isArray(userPresets) || userPresets.length === 0) {
      showToast('No bundles to export — save one first')
      return
    }
    const filename = downloadUserBundlesFileMulti(userPresets)
    if (filename) {
      showToast(`Exported ${userPresets.length} bundle${userPresets.length === 1 ? '' : 's'} → ${filename}`)
    } else {
      showToast('Multi-bundle export failed')
    }
  }

  // R15.14 — import a multi-bundle JSON file. Each incoming bundle is
  // added through the existing addUserPreset path so id-mint + FIFO
  // semantics stay identical to the single-bundle import. Replace-
  // by-name strategy: when an incoming bundle's name (case-insensitive
  // + trimmed) matches an existing one, the existing entry is removed
  // FIRST so the incoming takes its slot without doubling the count.
  // Caps at MAX_USER_PRESETS via the slice in addUserPreset, but we
  // pre-compute the FIFO-drop count via summarizeImportImpactMulti so
  // the user knows BEFORE they confirm.
  const importAllUserBundles = () => {
    if (typeof document === 'undefined') return
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files && input.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const raw = typeof reader.result === 'string' ? reader.result : ''
        const parsed = parseUserBundlesImportMulti(raw)
        if (!parsed.ok) {
          showToast(`Multi-import failed: ${parsed.error}`)
          return
        }
        const impact = summarizeImportImpactMulti(userPresets, parsed.bundles)
        // Single confirm — keeps the workflow boring + reversible
        // (the user can delete individual bundles after import).
        let prompt = `Import ${impact.incoming} bundle${impact.incoming === 1 ? '' : 's'}?`
        const bits = []
        if (impact.willAdd)     bits.push(`${impact.willAdd} new`)
        if (impact.willReplace) bits.push(`${impact.willReplace} replace existing`)
        if (impact.willDrop)    bits.push(`${impact.willDrop} will FIFO-drop oldest`)
        if (bits.length) prompt += `\n${bits.join(' · ')}`
        if (!window.confirm(prompt)) return
        // Walk the incoming bundles, removing any same-name existing
        // entry first (so replace semantics are honoured), then append.
        let next = userPresets
        let added = 0
        for (const inc of parsed.bundles) {
          const target = inc.name.trim().toLowerCase()
          // Find + remove the existing entry with the same name (case-
          // insensitive). addUserPreset already dedupes by ID; we dedupe
          // by NAME here so a re-imported bundle replaces the old one
          // instead of stacking a numbered duplicate.
          next = next.filter(p => !p || typeof p.name !== 'string' || p.name.trim().toLowerCase() !== target)
          const built = buildUserPresetFromMap(inc.name, inc.map, next)
          if (!built) continue
          next = addUserPreset(next, built)
          added++
        }
        setUserPresets(next)
        saveUserPresets(next)
        showToast(`Imported ${added} bundle${added === 1 ? '' : 's'}${impact.willDrop ? ` · ${impact.willDrop} dropped` : ''}`)
      }
      reader.readAsText(file)
    }
    input.click()
  }

  // R18.09 — drag-and-drop import. Auto-detects whether the dropped
  // file is a single-bundle envelope (parseImport) or a multi-bundle
  // envelope (parseImportMulti) by trying multi first (it's a strict
  // shape match, so non-multi files fall through cleanly) then
  // single. Bare arrays at the top level are accepted as multi-shape;
  // bare single objects fall through to single. Pure wrapper around
  // the same lib paths that powered R14.17 + R15.14 — no new IO
  // module, no envelope changes. The drop zone is the PresetBar
  // (matches R17.06's theme-row pattern: drop anywhere on the bar to
  // trigger import). User confirms multi-imports via the same
  // window.confirm gate as the file-picker path.
  //
  // R19.20 — graduates to MULTI-FILE drops (parallels R18.18 theme
  // pack multi-file drop). When N>1 .json files are dropped, each
  // is read in parallel via Promise.all and the per-file parses are
  // COMBINED into a single in-memory multi-bundle envelope before
  // the impact summary fires. Per-file failures (corrupt JSON,
  // wrong-kind envelope, non-.json extension) are counted + toasted
  // but don't block valid files in the same drop — partial success
  // is preserved. Single-file drops keep the exact same behaviour
  // as R18.09; the parseAndImportFiles helper just sees a list of
  // length 1 in that case.
  const importBundleFiles = async (files) => {
    if (!files || files.length === 0) return
    const fileArray = Array.from(files)
    // Pre-filter: drop non-.json files with a per-file toast count.
    // Same UX as R18.18 — invalid files are surfaced but don't
    // abort the valid ones.
    const jsonFiles = []
    let skippedNonJson = 0
    for (const f of fileArray) {
      if (f && typeof f.name === 'string' && f.name.toLowerCase().endsWith('.json')) {
        jsonFiles.push(f)
      } else {
        skippedNonJson++
      }
    }
    if (jsonFiles.length === 0) {
      showToast(skippedNonJson > 0
        ? `${skippedNonJson} non-JSON file${skippedNonJson === 1 ? '' : 's'} skipped`
        : 'No .json files in drop')
      return
    }
    // R19.20 — parallel parse via Promise.all + per-file FileReader.
    // Even on a slow disk a 4-file drop completes in well under a
    // frame, but the parallel path keeps the UI responsive even for
    // larger drops (a friend's whole bundle collection: 8 files).
    const readFile = (file) => new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve({
        name: file.name,
        raw: typeof reader.result === 'string' ? reader.result : '',
      })
      reader.onerror = () => resolve({ name: file.name, raw: '', error: 'read failed' })
      reader.readAsText(file)
    })
    const reads = await Promise.all(jsonFiles.map(readFile))
    // R19.20 — combine logic lives in midiUserBundleIO.combineDroppedBundles
    // so it can be unit-tested without a DOM. Same parseImportMulti →
    // parseImport precedence as the single-file drop; per-file failures
    // are counted but don't block the valid ones.
    const { bundles: combined, parseFails } = combineDroppedBundles(reads)
    if (combined.length === 0) {
      const bits = []
      if (parseFails > 0)     bits.push(`${parseFails} parse failure${parseFails === 1 ? '' : 's'}`)
      if (skippedNonJson > 0) bits.push(`${skippedNonJson} non-JSON skipped`)
      showToast(`Import failed: ${bits.join(' \u00b7 ') || 'no valid bundles in drop'}`)
      return
    }
    // From here we always go through the multi-bundle impact path
    // (even for length-1 since impactMulti's prompt phrasing covers
    // the single case fine + the replace-by-name semantics are the
    // safer default). Cap-respect comes for free: addUserPreset's
    // FIFO drop is projected into the prompt by summarizeImportImpactMulti.
    const impact = summarizeImportImpactMulti(userPresets, combined)
    let prompt = jsonFiles.length === 1
      ? `Import ${impact.incoming} bundle${impact.incoming === 1 ? '' : 's'}?`
      : `Import ${impact.incoming} bundle${impact.incoming === 1 ? '' : 's'} from ${jsonFiles.length} files?`
    const bits = []
    if (impact.willAdd)     bits.push(`${impact.willAdd} new`)
    if (impact.willReplace) bits.push(`${impact.willReplace} replace existing`)
    if (impact.willDrop)    bits.push(`${impact.willDrop} will FIFO-drop oldest`)
    if (bits.length) prompt += `\n${bits.join(' \u00b7 ')}`
    if (parseFails > 0)     prompt += `\n${parseFails} file${parseFails === 1 ? '' : 's'} failed to parse`
    if (skippedNonJson > 0) prompt += `\n${skippedNonJson} non-JSON file${skippedNonJson === 1 ? '' : 's'} skipped`
    if (!window.confirm(prompt)) return
    let next = userPresets
    let added = 0
    for (const inc of combined) {
      const target = inc.name.trim().toLowerCase()
      next = next.filter(p => !p || typeof p.name !== 'string' || p.name.trim().toLowerCase() !== target)
      const built = buildUserPresetFromMap(inc.name, inc.map, next)
      if (!built) continue
      next = addUserPreset(next, built)
      added++
    }
    setUserPresets(next)
    saveUserPresets(next)
    const failBits = []
    if (parseFails > 0)     failBits.push(`${parseFails} fail`)
    if (skippedNonJson > 0) failBits.push(`${skippedNonJson} non-JSON skipped`)
    showToast(`Imported ${added} bundle${added === 1 ? '' : 's'}${impact.willDrop ? ` \u00b7 ${impact.willDrop} dropped` : ''}${failBits.length ? ` \u00b7 ${failBits.join(' \u00b7 ')}` : ''}`)
  }

  // R19.20 — backward-compatible single-file wrapper kept so the
  // PresetBar's onDropFile prop signature doesn't need to change
  // for callers that pass a single File (older R18.09 callsites,
  // any future programmatic drop). Routes through importBundleFiles
  // so all the multi-file handling (impact summary, replace-by-name,
  // FIFO projection, partial-success counting) reuses one code path.
  const importBundleFile = (file) => importBundleFiles(file ? [file] : [])

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
          onExportAllUsers={exportAllUserBundles}
          onImportAllUsers={importAllUserBundles}
          onSetColorUser={setUserBundleColor}
          onSetHotkeyUser={setUserBundleHotkey}
          onDropFile={importBundleFile}
          onDropFiles={importBundleFiles}
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
                  }}>· strength / radius / radius·log / x / y / z / enabled / type</span>
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
                        // R19.16 — for TYPE rows, project the live CC value
                        // through the same band picker the dispatcher uses
                        // so the user sees which quarter the CC currently
                        // sits in. lastCCByNumber is component state (not
                        // a ref) so the render-time read passes the
                        // react-hooks/refs lint rule.
                        let typeBand = null
                        if (a.field === 'type' && cc !== null) {
                          const liveCcValue = lastCCByNumber[Number(cc)]
                          if (Number.isFinite(liveCcValue)) {
                            typeBand = describeTypeBand(ccToNormalized(liveCcValue), ATTRACTOR_TYPES)
                          }
                        }
                        // R21.22 — for STRENGTH / RADIUS / RADIUS·log /
                        // X / Y / Z rows (continuous fields), project the
                        // live CC value through clampProximity so the user
                        // sees how close the knob sits to the slider's
                        // edges. ENABLED rows skip (it's already a 1-bit
                        // toggle so a meter would be redundant); TYPE rows
                        // skip (R20.16 already drew the boundary meter).
                        let clampProx = null
                        const isContinuousField = a.field === 'strength'
                          || a.field === 'radius'  || a.field === 'radiusLog'
                          || a.field === 'x'       || a.field === 'y'
                          || a.field === 'z'
                        if (isContinuousField && cc !== null) {
                          const liveCcValue = lastCCByNumber[Number(cc)]
                          if (Number.isFinite(liveCcValue)) {
                            clampProx = describeClampProximity(ccToNormalized(liveCcValue))
                          }
                        }
                        return (
                          <div key={a.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '5px 6px', marginBottom: 3, borderRadius: 6,
                            background: isLearning ? 'rgba(168,85,247,0.14)' : 'rgba(255,255,255,0.02)',
                            border: isLearning ? '1px solid rgba(168,85,247,0.40)' : '1px solid rgba(255,255,255,0.03)',
                            fontSize: 11, color: '#d8d8e0',
                          }}>
                            <span title={a.field === 'enabled'
                              ? 'Schmitt-trigger toggle: above 0.55 enables, below 0.45 disables, in-between holds previous state.'
                              : a.field === 'radiusLog'
                                ? 'Log-curve radius: bottom half of the knob covers radii 4..8 (fine control at the low end), top half covers 8..16. Pairs well with the linear Radius row above for users who want either feel.'
                                : a.field === 'type'
                                  ? 'Type cycle: the knob sweeps through Attract / Repulse / Vortex / Turb. in equal quarters. A small dead-band at each boundary holds the previous type so a knob sitting on a transition doesn\u2019t flicker.'
                                  : undefined}>
                              {a.field === 'strength' ? 'Strength'
                                : a.field === 'radius' ? 'Radius'
                                : a.field === 'radiusLog' ? 'Radius\u00B7log'
                                : a.field === 'enabled' ? 'Enabled'
                                : a.field === 'type' ? 'Type'
                                : a.field.toUpperCase()}
                              <span style={{ color: '#6a6a80', fontSize: 10, marginLeft: 6 }}>
                                {a.field === 'enabled'
                                  ? 'on/off'
                                  : a.field === 'radiusLog'
                                    ? `${a.min}..${a.max} log`
                                    : a.field === 'type'
                                      ? 'cycle 4'
                                      : `${a.min}..${a.max}`}
                              </span>
                            </span>
                            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              {/* R19.16 — TYPE row's "current band" tag.
                                  Only renders for TYPE rows with a bound CC
                                  AND a value seen on that CC at least once.
                                  Shows "2/4 vortex" with the band index +
                                  type label; a tiny `·hold` suffix surfaces
                                  when the live value sits inside the dead-
                                  band around a boundary so the user knows
                                  pickAttractorTypeForCC is holding the
                                  previous type rather than ping-ponging.
                                  Borrows the type's accent colour from
                                  attractorTypeStyle so the cue is visually
                                  consistent with the rest of the row. */}
                              {typeBand && (() => {
                                const tStyle = attractorTypeStyle(typeBand.label)
                                // R20.16 — proximity meter colour intent:
                                //   safe (deep in band, prox >= 0.40) — type accent
                                //   warn (entering shoulder, 0.10..0.40)  — amber
                                //   danger (in dead-band, prox === 0)     — red
                                const prox = typeBand.proximityToBoundary01
                                const proxFillColor = prox < 0.001
                                  ? 'rgba(239,68,68,0.85)'   // red — at boundary
                                  : prox < 0.40
                                    ? 'rgba(251,191,36,0.80)' // amber — close
                                    : tStyle.fg                // type accent — safe
                                return (
                                  <span title={`Live CC value lands in band ${typeBand.index + 1}/${typeBand.total} (${typeBand.label}). ${typeBand.holdingPrev ? 'Inside dead-band — type held until the knob moves further into the next quarter.' : 'Moving the knob across a boundary flips the type.'} Proximity to nearest flip boundary: ${(prox * 100).toFixed(0)}% safe (1.0=mid-band, 0.0=on boundary).`}
                                    style={{
                                      padding: '1px 6px', borderRadius: 4,
                                      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                                      background: tStyle.bgSoft,
                                      color: tStyle.fg,
                                      border: `1px solid ${tStyle.borderFaint}`,
                                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                                      textTransform: 'uppercase',
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                    }}>
                                    {typeBand.index + 1}/{typeBand.total}
                                    {typeBand.holdingPrev && (
                                      <span style={{
                                        fontSize: 8, color: '#fbbf24',
                                        letterSpacing: 0,
                                      }} title="Dead-band — previous type held">{'\u00b7hold'}</span>
                                    )}
                                    {/* R20.16 — proximity bar meter. Sits inside
                                        the type-band tag so the cue stays grouped
                                        with the band label. 26px wide track with
                                        a horizontal fill that scales with prox01.
                                        Track tint follows the same safe→warn→danger
                                        intent as the fill so users can read the
                                        meter at a glance. */}
                                    <span style={{
                                      display: 'inline-block',
                                      width: 26, height: 4,
                                      borderRadius: 2,
                                      background: 'rgba(0,0,0,0.45)',
                                      border: `1px solid ${tStyle.borderFaint}`,
                                      overflow: 'hidden',
                                      marginLeft: 2,
                                    }}>
                                      <span style={{
                                        display: 'block',
                                        height: '100%',
                                        // Fill goes from LEFT — wide fill = safe;
                                        // narrow fill = boundary-close.
                                        width: `${Math.max(0, Math.min(100, prox * 100))}%`,
                                        background: proxFillColor,
                                        transition: 'width 80ms linear, background 120ms linear',
                                      }} />
                                    </span>
                                  </span>
                                )
                              })()}
                              {/* R21.22 — clamp-proximity meter for
                                  continuous fields. Tiny 26x4 bar inside a
                                  monospace tag showing how close the live
                                  CC is to either clamp edge of the
                                  slider. Three-tier intent matches the
                                  R20.16 TYPE-row meter: red at the rail,
                                  amber in the shoulder, green when safe.
                                  Only renders when a CC is bound AND at
                                  least one message has been seen on it. */}
                              {clampProx && (() => {
                                const prox = clampProx.proximityToBoundary01
                                const atRail = clampProx.atLow || clampProx.atHigh
                                const proxFillColor = atRail
                                  ? 'rgba(239,68,68,0.85)'   // red — at clamp
                                  : prox < 0.25
                                    ? 'rgba(251,191,36,0.80)' // amber — close
                                    : 'rgba(134,239,172,0.85)' // green — safe headroom
                                const proxTextColor = atRail
                                  ? '#fca5a5'
                                  : prox < 0.25
                                    ? '#fbbf24'
                                    : '#86efac'
                                const proxBorderColor = atRail
                                  ? 'rgba(239,68,68,0.40)'
                                  : prox < 0.25
                                    ? 'rgba(251,191,36,0.32)'
                                    : 'rgba(34,197,94,0.32)'
                                const proxBgColor = atRail
                                  ? 'rgba(239,68,68,0.10)'
                                  : prox < 0.25
                                    ? 'rgba(245,158,11,0.08)'
                                    : 'rgba(34,197,94,0.08)'
                                const pct = Math.round(clampProx.v01 * 100)
                                return (
                                  <span title={`Knob at ${pct}% of [${a.min}..${a.max}]. ${atRail ? 'AT THE RAIL — twisting further does nothing.' : prox < 0.25 ? 'Close to clamp — limited headroom in this direction.' : 'Safe — plenty of room either way.'} Proximity: ${(prox * 100).toFixed(0)}% from nearest clamp.`}
                                    style={{
                                      padding: '1px 5px', borderRadius: 4,
                                      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                                      background: proxBgColor,
                                      color: proxTextColor,
                                      border: `1px solid ${proxBorderColor}`,
                                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                                      textTransform: 'uppercase',
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                    }}>
                                    <span>{pct}%</span>
                                    {/* Proximity bar — fill scales from 0 (at clamp) to 100% (centred). */}
                                    <span style={{
                                      display: 'inline-block',
                                      width: 26, height: 4,
                                      borderRadius: 2,
                                      background: 'rgba(0,0,0,0.45)',
                                      border: `1px solid ${proxBorderColor}`,
                                      overflow: 'hidden',
                                    }}>
                                      <span style={{
                                        display: 'block',
                                        height: '100%',
                                        width: `${Math.max(0, Math.min(100, prox * 100))}%`,
                                        background: proxFillColor,
                                        transition: 'width 80ms linear, background 120ms linear',
                                      }} />
                                    </span>
                                  </span>
                                )
                              })()}
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
  // R15.14 — multi-bundle (all-in-one) IO
  onExportAllUsers, onImportAllUsers,
  // R16.19 — per-bundle colour tag
  onSetColorUser,
  // R20.11 — per-bundle keyboard shortcut
  onSetHotkeyUser,
  // R18.09 — drag-and-drop import (auto-detects single vs multi envelope)
  // R19.20 — accepts multi-file drops; PresetBar passes the full file
  // list to the parent so the import path can fan out + combine.
  onDropFile, onDropFiles,
  savingBundle, onStartSave, onCancelSave, onCommitBundle,
  bundleName, onBundleNameChange, liveBindingCount,
}) {
  const canSave = (bundleName || '').trim().length > 0 && liveBindingCount > 0
  const atCap = userPresets.length >= MAX_USER_PRESETS
  // R18.09 — same dragDepth pattern as R17.06 (CustomThemesRow) — a
  // nested-counter tracks dragenter/leave events across child
  // elements so the highlight only clears when the drag ACTUALLY
  // leaves the bar (browsers fire enter+leave on every child a drag
  // crosses; a naive boolean would flicker on every chip boundary).
  // Filters by `dataTransfer.types.includes('Files')` so stray text-
  // drags (selecting text on the page itself) don't trigger the
  // overlay or block the default behaviour.
  const [dragDepth, setDragDepth] = useState(0)
  const hasDropHandler = typeof onDropFiles === 'function' || typeof onDropFile === 'function'
  const dragActive = dragDepth > 0 && hasDropHandler
  const onDragEnter = (e) => {
    if (!hasDropHandler || !e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    setDragDepth(d => d + 1)
  }
  const onDragOverZone = (e) => {
    if (!hasDropHandler || !e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeaveZone = (e) => {
    if (!hasDropHandler || !e.dataTransfer || !e.dataTransfer.types || !e.dataTransfer.types.includes('Files')) return
    setDragDepth(d => Math.max(0, d - 1))
  }
  const onDropZone = (e) => {
    if (!hasDropHandler || !e.dataTransfer) return
    e.preventDefault()
    setDragDepth(0)
    const files = e.dataTransfer.files
    if (!files || files.length === 0) {
      showToast('Drop a .json bundle file to import')
      return
    }
    // R19.20 — prefer onDropFiles when available (multi-file path);
    // fall back to onDropFile with just the first file so legacy
    // callsites keep working.
    if (typeof onDropFiles === 'function') onDropFiles(files)
    else if (typeof onDropFile === 'function') onDropFile(files[0])
  }
  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOverZone}
      onDragLeave={onDragLeaveZone}
      onDrop={onDropZone}
      style={{
      position: 'relative',
      padding: '10px 12px', marginBottom: 10, borderRadius: 8,
      background: 'rgba(168,85,247,0.06)',
      // R18.09 — dashed indigo outline + soft glow while a JSON file
      // is being dragged over the bar. outlineOffset keeps layout
      // stable through the highlight transition.
      outline: dragActive ? '2px dashed rgba(99,102,241,0.55)' : '1px solid rgba(168,85,247,0.18)',
      outlineOffset: dragActive ? 4 : 0,
      border: dragActive ? '1px solid transparent' : '1px solid rgba(168,85,247,0.18)',
      boxShadow: dragActive ? 'inset 0 0 20px rgba(99,102,241,0.08)' : 'none',
      transition: 'outline-color 0.18s ease-out, box-shadow 0.18s ease-out',
    }}>
      {/* R18.09 — drop-zone banner. Surfaces only while a JSON file
          is mid-drag; pointerEvents:none keeps the underlying
          buttons clickable behind it and lets drag events keep
          hitting the parent. */}
      {dragActive && (
        <div style={{
          position: 'absolute', top: -10, left: 0, right: 0,
          padding: '4px 10px', borderRadius: 6,
          background: 'rgba(99,102,241,0.20)',
          color: '#dbeafe',
          fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
          textTransform: 'uppercase', textAlign: 'center',
          border: '1px solid rgba(99,102,241,0.45)',
          backdropFilter: 'blur(6px)',
          pointerEvents: 'none', zIndex: 2,
        }}>
          Drop .json to import bundle <span style={{ opacity: 0.65, fontWeight: 500, marginLeft: 4 }}>(multi-file ok)</span>
        </div>
      )}
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
                  onSetColor={onSetColorUser ? (color) => onSetColorUser(p.id, color) : null}
                  onSetHotkey={onSetHotkeyUser ? (hk) => onSetHotkeyUser(p.id, hk) : null}
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
                : 'Import a single-bundle JSON file (from another machine or a collaborator)'}
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
          {/* R15.14 — Export ALL bundles in one JSON file. Different colour
              (cyan) from the single-bundle Download (indigo) so users can
              tell at a glance which IO surface they're invoking. Disabled
              when nothing to export — the toast in the handler still
              fires if they click anyway (button is disabled, but
              defensive). */}
          {onExportAllUsers && userPresets.length > 0 && (
            <button onClick={onExportAllUsers}
              title={`Download ALL ${userPresets.length} bundle${userPresets.length === 1 ? '' : 's'} in one JSON file`}
              style={{
                padding: '5px 9px', borderRadius: 6, fontSize: 11, fontWeight: 550,
                cursor: 'pointer',
                background: 'rgba(14,165,233,0.10)',
                color: '#7dd3fc',
                border: '1px solid rgba(14,165,233,0.25)',
                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
              }}>
              <Download size={10} strokeWidth={2.4} />
              Export all ({userPresets.length})
            </button>
          )}
          {/* R15.14 — Import a multi-bundle JSON file. Not cap-gated
              because the importer handles replace-by-name + FIFO at
              commit-time (and surfaces the projected impact in the
              confirmation prompt). */}
          {onImportAllUsers && (
            <button onClick={onImportAllUsers}
              title="Import a multi-bundle JSON file (replaces existing bundles by name)"
              style={{
                padding: '5px 9px', borderRadius: 6, fontSize: 11, fontWeight: 550,
                cursor: 'pointer',
                background: 'rgba(14,165,233,0.10)',
                color: '#7dd3fc',
                border: '1px solid rgba(14,165,233,0.25)',
                display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'inherit',
              }}>
              <Upload size={10} strokeWidth={2.4} />
              Import all
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
function UserBundleChip({ preset, onApply, onDelete, onRename, onExport, onSetColor, onSetHotkey }) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(preset.name)
  // R16.19 — colour palette popover toggle. Local state because the
  // popover is a tiny in-chip affordance; lifting to the parent for
  // 8 chips would be 8 conditional renders for no benefit. Click the
  // swatch to open; click outside (or pick a colour) to close.
  const [colorOpen, setColorOpen] = useState(false)
  // R20.11 — hotkey-capture mode. When ON, the next keydown in the
  // chip's hidden input captures the modifier+key combo and binds
  // it to the bundle. Escape cancels. Click the hotkey badge to
  // enter capture mode; click again (or press a hotkey) to exit.
  const [capturingHotkey, setCapturingHotkey] = useState(false)
  // (No useEffect needed to sync `draftName` ↔ `preset.name`: the
  // onDoubleClick handler re-initializes the draft from preset.name
  // every time editing starts, and the at-rest branch displays
  // preset.name directly. The only scenario a sync would cover is
  // "preset name changes externally while the input is open" which
  // is vanishingly rare — and dropping the effect keeps us under
  // React Compiler's `react-hooks/set-state-in-effect` purity rule.)
  // R16.19 — per-bundle colour cue. Pre-built style bundle with all
  // CSS-ready strings (border, bg, fg, glow) — drops into the chip's
  // existing border/bg/fg slots without re-deriving alpha math.
  const colorStyle = userPresetColorStyle(preset.color || DEFAULT_USER_PRESET_COLOR)

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
      position: 'relative',
      display: 'inline-flex', alignItems: 'stretch',
      borderRadius: 6, overflow: 'visible',
      border: `1px solid ${colorStyle.borderSoft}`,
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
          background: colorStyle.bgSoft,
          color: colorStyle.fg,
          border: 'none',
          borderRight: `1px solid ${colorStyle.borderFaint}`,
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontFamily: 'Geist, system-ui, sans-serif',
          userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        {preset.name}
        <span style={{
          fontSize: 9, fontFamily: 'Geist Mono, monospace',
          color: colorStyle.fgMuted,
        }}>
          {Object.keys(preset.map).length}
        </span>
      </button>
      {/* R16.19 — colour swatch + popover picker. Tiny round dot in
          the live accent; click toggles a row of 8 swatches that
          re-tag the bundle in place. Only renders when onSetColor
          is wired (parent opts in by passing the handler). */}
      {onSetColor && (
        <button
          onClick={(e) => { e.stopPropagation(); setColorOpen(o => !o) }}
          title={`Tag colour: ${preset.color || DEFAULT_USER_PRESET_COLOR}. Click to change.`}
          style={{
            padding: '0 5px', cursor: 'pointer',
            background: colorStyle.bgSoft,
            border: 'none',
            borderRight: `1px solid ${colorStyle.borderFaint}`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
            background: colorStyle.accent,
            boxShadow: `0 0 6px rgba(${colorStyle.accentRgb},0.55)`,
            border: '1px solid rgba(255,255,255,0.18)',
          }} />
        </button>
      )}
      {/* R20.11 — per-bundle hotkey badge. Shows the bound hotkey
          when set; "set hotkey" placeholder when unbound. Click to
          enter capture mode — the next keydown sets the binding.
          Escape cancels. Right-click clears the binding. Only
          renders when onSetHotkey is wired. */}
      {onSetHotkey && (
        <button
          onClick={(e) => { e.stopPropagation(); setCapturingHotkey(c => !c) }}
          onContextMenu={(e) => { e.preventDefault(); onSetHotkey(null) }}
          onKeyDown={(e) => {
            if (!capturingHotkey) return
            if (e.key === 'Escape') {
              e.preventDefault()
              setCapturingHotkey(false)
              return
            }
            const hk = hotkeyFromEvent(e)
            if (!hk) return  // skip modifier-only / unbindable
            e.preventDefault()
            e.stopPropagation()
            onSetHotkey(hk)
            setCapturingHotkey(false)
          }}
          title={preset.hotkey
            ? `Hotkey: ${preset.hotkey}. Click to re-bind. Right-click to clear.`
            : 'Click to bind a keyboard shortcut for this bundle.'}
          style={{
            padding: '0 6px', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.04em', textTransform: 'uppercase',
            cursor: 'pointer',
            background: capturingHotkey
              ? 'rgba(251,191,36,0.18)'
              : preset.hotkey
                ? colorStyle.bgSoft
                : 'rgba(255,255,255,0.03)',
            color: capturingHotkey
              ? '#fcd34d'
              : preset.hotkey
                ? colorStyle.fg
                : '#7a7a90',
            border: 'none',
            borderRight: `1px solid ${colorStyle.borderFaint}`,
            display: 'inline-flex', alignItems: 'center',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            minWidth: 26,
            justifyContent: 'center',
            // R20.11 — focus outline reinforces that capture mode is
            // listening for the next key event.
            outline: capturingHotkey ? '1px dashed rgba(251,191,36,0.55)' : 'none',
            outlineOffset: -2,
          }}>
          {capturingHotkey ? 'press\u2026' : (preset.hotkey || '\u2328')}
        </button>
      )}
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
      {/* R16.19 — palette popover. Floats below the chip, dismisses
          on outside click (handled via the document-level listener
          below) and on swatch pick. Width sized to fit 8 swatches +
          gaps in a single row so the popover never wraps. */}
      {onSetColor && colorOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0,
            marginTop: 4, padding: 5,
            display: 'inline-flex', gap: 5, zIndex: 30,
            background: 'rgba(10,10,16,0.92)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 6,
            boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
          }}
        >
          {USER_PRESET_COLORS.map(c => {
            const s = userPresetColorStyle(c)
            const active = (preset.color || DEFAULT_USER_PRESET_COLOR) === c
            return (
              <button
                key={c}
                onClick={() => { onSetColor(c); setColorOpen(false) }}
                title={c}
                style={{
                  width: 16, height: 16, borderRadius: '50%',
                  background: s.accent,
                  border: active
                    ? '2px solid rgba(255,255,255,0.85)'
                    : '1px solid rgba(255,255,255,0.20)',
                  boxShadow: active ? `0 0 8px rgba(${s.accentRgb},0.75)` : 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transform: active ? 'scale(1.08)' : 'scale(1)',
                  transition: 'transform 0.10s ease',
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
