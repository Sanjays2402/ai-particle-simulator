import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { resolveReducedMotion } from '../lib/reducedMotion'
import {
  ACTIONS, loadMidiMap, saveMidiMap, setBinding, clearAllBindings,
  decodeMidiMessage, applyCC, attractorActions,
  // R19.16 — pure projector for "current band" tooltip on TYPE rows.
  // R21.22 — describeClampProximity graduates R20.16's per-band meter
  // to continuous fields (strength/radius/x/y/z/radiusLog).
  describeTypeBand, describeClampProximity, ccToNormalized,
  // R22.27 — user-tunable warning threshold for the clamp meter
  classifyClampProximity,
  sanitizeClampWarnThreshold, isClampWarnThresholdAtDefault,
  CLAMP_WARN_THRESHOLD_DEFAULT, CLAMP_WARN_THRESHOLD_MIN, CLAMP_WARN_THRESHOLD_MAX,
  // R23.32 — per-field clamp warn threshold overrides
  setClampWarnFieldOverride,
  sanitizeClampWarnOverrides, hasClampWarnFieldOverride,
  // R24.40 — per-(attractor, field) overrides (graduates R23.32)
  resolveClampWarnThresholdFor,
  setClampWarnAttractorFieldOverride,
  sanitizeClampWarnAttractorOverrides,
  hasClampWarnAttractorFieldOverride,
  pruneClampWarnAttractorOverrides,
  // R25.45 — bulk-clear per-attractor + count projector
  clearClampWarnAttractorOverrides,
  countClampWarnAttractorOverridesFor,
  // R26.45 — bulk-clear per-field-across-attractors + count projector
  clearClampWarnFieldOverridesAcross,
  countClampWarnFieldOverridesAcross,
  // R27.45 — list per-attractor overrides for this field (preview chips)
  listClampWarnFieldOverridesAcross,
  // R31.45 — tri-state projector for the multi-select All/None toggle
  clampSelectAllTriState,
} from '../lib/midiMap'
import { ATTRACTOR_TYPES } from '../lib/namedAttractors'
// R26.20 — touch-drag hit-test helper. Same pure projector the camera-
// path R22.12 / R23.31 touch DnD uses; lifting it here keeps the
// MidiPanel binding-group DnD logic symmetric with the camera-path
// pattern without duplicating the half-open-interval math.
import { resolveTouchTargetWithGaps } from '../lib/cameraViews'
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
  // R23.35 — undo-chain toggle window (1s default; click Undo within
  // the window to flip-flop the assignment, after the window the
  // chip surfaces a "too late" hint instead of silently expiring)
  UNDO_CHAIN_MS, isWithinUndoWindow,
  // R24.38 — chain-counter badge formatter for the toast pip
  formatHotkeyChainBadge,
  // R28.43 — non-linear fade curve constant for the chain-badge toast
  // (slow first 500ms, fast last 500ms; graduates R27.43's linear)
  HOTKEY_CHAIN_FADE_CURVE_RECOMMENDED,
  // R29.43 — chip-cycle helpers + label for the PERSISTED fade-curve
  // preference (graduates R28.43's hard-coded recommendation to a
  // user-selectable + reload-surviving choice)
  HOTKEY_CHAIN_FADE_CURVES,
  labelForHotkeyChainFadeCurve, sanitizeHotkeyChainFadeCurve,
  // R30.43 — live preview swatch: replay the actual fade math over the
  // 1s window next to the cycle chip so users feel the curve before
  // triggering a real chain. fadeDirectionColor is the same projector
  // the Toast badge uses; HOTKEY_CHAIN_COLOR_FORWARD is a representative
  // base hue (the amber forward-direction colour) to animate from.
  fadeDirectionColor, HOTKEY_CHAIN_COLOR_FORWARD,
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
import { attractorTypeStyle, dropIndexForGap, stepKeyboardGapCursor, describeGapReorderAnnouncement } from '../lib/namedAttractors'
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
  // R22.27 — user-tunable warning threshold for the clamp-proximity
  // meter. Graduates R21.22's hard-coded `< 0.25 = amber` cutoff.
  // Persisted to localStorage so the user's chosen sensitivity sticks
  // across sessions. The popover surfaces via a long-press on any
  // continuous-field clamp meter — discoverable without an extra
  // global panel, scoped to the place where the threshold matters.
  // R23.32 — adds per-field OVERRIDES on top of the global setting.
  // The popover gains a row of per-field chips so power users can
  // tighten STRENGTH (where rail = silent attractor) and loosen
  // X/Y/Z (where rail = at canvas edge, often intentional).
  // Persisted to a parallel localStorage key so the global ↔ per-field
  // chain stays clear.
  const [clampWarnThreshold, setClampWarnThresholdState] = useState(() => {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem('midi-clamp-warn-threshold-v1')
        : null
      if (raw === null) return CLAMP_WARN_THRESHOLD_DEFAULT
      const parsed = parseFloat(raw)
      return sanitizeClampWarnThreshold(parsed)
    } catch { return CLAMP_WARN_THRESHOLD_DEFAULT }
  })
  // R23.32 — per-field overrides map. Default empty (every field uses
  // global). load + sanitize on init so a corrupt persisted JSON can't
  // crash the panel.
  const [clampWarnOverrides, setClampWarnOverridesState] = useState(() => {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem('midi-clamp-warn-overrides-v1')
        : null
      if (raw === null) return {}
      const parsed = JSON.parse(raw)
      return sanitizeClampWarnOverrides(parsed)
    } catch { return {} }
  })
  // R24.40 — per-(attractor, field) overrides map. Default empty.
  // Persisted under its own storage key so R23.32's per-field map stays
  // untouched. Sanitized on load so a corrupt persisted JSON can't
  // crash the panel.
  const [clampWarnAttractorOverrides, setClampWarnAttractorOverridesState] = useState(() => {
    try {
      const raw = typeof localStorage !== 'undefined'
        ? localStorage.getItem('midi-clamp-warn-attractor-overrides-v1')
        : null
      if (raw === null) return {}
      const parsed = JSON.parse(raw)
      return sanitizeClampWarnAttractorOverrides(parsed)
    } catch { return {} }
  })
  const setClampWarnThreshold = (raw) => {
    const next = sanitizeClampWarnThreshold(raw)
    setClampWarnThresholdState(next)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('midi-clamp-warn-threshold-v1', String(next))
      }
    } catch { /* quota / private mode */ }
  }
  const resetClampWarnThreshold = () => {
    setClampWarnThresholdState(CLAMP_WARN_THRESHOLD_DEFAULT)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('midi-clamp-warn-threshold-v1')
      }
    } catch { /* quota / private mode */ }
  }
  // R23.32 — set a per-field override. Pass `value`=null to clear.
  // Re-uses lib's setClampWarnFieldOverride which handles the ref-
  // equal-on-no-op contract + sanitisation + clear semantics.
  const setClampWarnFieldOverrideUI = (field, value) => {
    const next = setClampWarnFieldOverride(clampWarnOverrides, field, value)
    if (next === clampWarnOverrides) return  // no-op
    setClampWarnOverridesState(next)
    try {
      if (typeof localStorage !== 'undefined') {
        if (Object.keys(next).length === 0) {
          localStorage.removeItem('midi-clamp-warn-overrides-v1')
        } else {
          localStorage.setItem('midi-clamp-warn-overrides-v1', JSON.stringify(next))
        }
      }
    } catch { /* quota / private mode */ }
  }
  // R24.40 — set a per-(attractor, field) override. Pass `value`=null
  // to clear THIS cell (preserves the attractor's other fields).
  // Delegates to setClampWarnAttractorFieldOverride for the ref-equal-
  // on-no-op contract + sanitization + empty-prune.
  const setClampWarnAttractorFieldOverrideUI = (attractorId, field, value) => {
    const next = setClampWarnAttractorFieldOverride(clampWarnAttractorOverrides, attractorId, field, value)
    if (next === clampWarnAttractorOverrides) return  // no-op
    setClampWarnAttractorOverridesState(next)
    try {
      if (typeof localStorage !== 'undefined') {
        if (Object.keys(next).length === 0) {
          localStorage.removeItem('midi-clamp-warn-attractor-overrides-v1')
        } else {
          localStorage.setItem('midi-clamp-warn-attractor-overrides-v1', JSON.stringify(next))
        }
      }
    } catch { /* quota / private mode */ }
  }
  // R25.45 — wipe EVERY per-(attractor, field) override for ONE attractor
  // in a single call. Delegates to clearClampWarnAttractorOverrides which
  // has the ref-equal-on-no-op contract baked in.
  const clearAllClampWarnOverridesForAttractor = (attractorId) => {
    const next = clearClampWarnAttractorOverrides(clampWarnAttractorOverrides, attractorId)
    if (next === clampWarnAttractorOverrides) return  // no-op
    setClampWarnAttractorOverridesState(next)
    try {
      if (typeof localStorage !== 'undefined') {
        if (Object.keys(next).length === 0) {
          localStorage.removeItem('midi-clamp-warn-attractor-overrides-v1')
        } else {
          localStorage.setItem('midi-clamp-warn-attractor-overrides-v1', JSON.stringify(next))
        }
      }
    } catch { /* quota / private mode */ }
  }
  // R26.45 — wipe THIS field's per-attractor override on EVERY attractor
  // that has one (the TRANSPOSE of R25.45). Companion bulk-clear so a
  // power user can reset (say) every STRENGTH meter to its per-field
  // fallback without losing X/Y/Z per-attractor tuning. Delegates to
  // clearClampWarnFieldOverridesAcross which has the ref-equal-on-no-op
  // contract baked in.
  const clearAllClampWarnOverridesForField = (field) => {
    const next = clearClampWarnFieldOverridesAcross(clampWarnAttractorOverrides, field)
    if (next === clampWarnAttractorOverrides) return  // no-op
    setClampWarnAttractorOverridesState(next)
    try {
      if (typeof localStorage !== 'undefined') {
        if (Object.keys(next).length === 0) {
          localStorage.removeItem('midi-clamp-warn-attractor-overrides-v1')
        } else {
          localStorage.setItem('midi-clamp-warn-attractor-overrides-v1', JSON.stringify(next))
        }
      }
    } catch { /* quota / private mode */ }
  }
  // Popover open state — null when closed, otherwise an object
  // { attractorId, field } describing which meter was long-pressed.
  // R23.32 — was previously just `a.id` (attractor scope); now carries
  // the field too so the popover knows whose per-field override to
  // edit. attractorId stays in the key so a stale row can't keep the
  // popover open after a delete (just like R22.27).
  const [clampThresholdPopoverFor, setClampThresholdPopoverFor] = useState(null)
  const [learnFor, setLearnFor] = useState(null) // actionId waiting for next CC
  // R13.05 — user-authored bundle list. Persisted separately from the
  // live binding map so saving a bundle never touches the live state.
  const [userPresets, setUserPresets] = useState(() => loadUserPresets())
  // Save-bundle form open/closed + draft name.
  const [savingBundle, setSavingBundle] = useState(false)
  const [bundleName, setBundleName] = useState('')
  // R25.20 — MidiPanel binding-group drag-and-drop reorder. Grab a
  // group header by its grab handle and drop on another header to
  // reorder the underlying namedAttractors list. Each group header is
  // tagged with its INDEX inside the live attractor list (NOT the
  // group iteration order, which can differ for stale/orphan groups
  // — see `attractorRows` grouping below). Stale groups (attractor
  // deleted but bindings persisted) are NOT draggable because they
  // don't map to a live list entry. Pure wire on the lib's
  // moveAttractorByIndex helper which is already pinned in tests
  // (R15.20 / R18.19 / R17.07 all use it).
  const [draggingGroupIdx, setDraggingGroupIdx] = useState(null)
  const [dragOverGroupIdx, setDragOverGroupIdx] = useState(null)
  // R27.20 — gap-drop zones for explicit "insert here" semantics
  // (graduates R26.20's drop-on-row gesture). Parallels R19.19's
  // named-attractor gap-drop in LeftSidebar. dropIndexForGap from
  // namedAttractors.js encapsulates the splice-bookkeeping math.
  const [gapOverGroupIdx, setGapOverGroupIdx] = useState(null)
  // R29.20 — keyboard accessibility for the gap-drop reorder. A
  // keyboard-only user presses Enter/Space on a group's grab handle to
  // LIFT it, then Arrow Up/Down walks a drop cursor through the gap
  // zones (stepKeyboardGapCursor skips the two no-op gaps adjacent to
  // the lifted row + clamps at the ends), Enter/Space commits the move
  // via dropIndexForGap, Escape cancels. liftedGroupIdx is the lifted
  // row's index (null = nothing lifted); keyboardGapCursor is the
  // cursor's current gap index. Parallels R15.20 chevron reorder but
  // with insert-at-gap semantics so it matches the mouse/touch gap-drop.
  const [liftedGroupIdx, setLiftedGroupIdx] = useState(null)
  const [keyboardGapCursor, setKeyboardGapCursor] = useState(null)
  // R30.20 — aria-live announcement text for the keyboard reorder.
  // R29.20's lift/arrow/commit gesture was SILENT to screen readers;
  // this state feeds a visually-hidden role="status" region so each
  // step ("Drop position 3 of 5", "Moved Eye to position 2 of 5") is
  // spoken. describeGapReorderAnnouncement (pure, in namedAttractors.js)
  // phrases every transition; we just push its output here.
  const [gapReorderAnnounce, setGapReorderAnnounce] = useState('')
  const moveNamedAttractorByIndex = useStore(s => s.moveNamedAttractorByIndex)
  // R26.20 — touch-drag support for the binding-group reorder
  // (graduates R25.20's desktop-only HTML5 native DnD; touch devices
  // don't fire dragstart so they were locked out). Parallels camera-
  // path R22.12 / R23.31 touch DnD:
  //   1. touchstart on the grab handle (⠇): arm a 350ms long-press
  //      timer + record starting Y.
  //   2. touchmove before timer fires: cancel if moved > 8px (so a
  //      scroll stays a scroll).
  //   3. Timer fires: enter drag mode + 10ms haptic if available.
  //   4. touchmove during drag: hit-test against per-group bounding
  //      rects via resolveTouchTargetIdx, update dragOverGroupIdx.
  //   5. touchend: run moveNamedAttractorByIndex.
  // Group refs hold the live DOM nodes by liveIdx for the touchmove
  // getBoundingClientRect read. Cleared on each render via the
  // ref-callback pattern (setGroupRef(idx)) so deleted groups don't
  // ghost-hit-test.
  const groupRefs = useRef(new Map())
  const setGroupRef = (idx) => (el) => {
    if (el) groupRefs.current.set(idx, el)
    else groupRefs.current.delete(idx)
  }
  // Touch-drag state in refs (touchmove fires at ~60Hz; setState would
  // re-render the whole panel). Visual state lives in draggingGroupIdx
  // / dragOverGroupIdx React state, updated only when those values
  // actually change.
  const touchStartYRef = useRef(0)
  const touchTimerRef = useRef(0)
  const touchActiveRef = useRef(false)
  // Flag set on touchend AFTER drag mode fired; click-side counterpart
  // suppresses the synthetic click the browser emits on tap-release so
  // it doesn't fire any onClick on the group surface mid-drag.
  const suppressNextGroupClickRef = useRef(false)
  const TOUCH_GROUP_LONG_PRESS_MS = 350
  const TOUCH_GROUP_SLOP_PX = 8

  const cancelGroupTouchTimer = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current)
      touchTimerRef.current = 0
    }
  }
  const onGroupTouchStart = (idx, totalGroups) => (e) => {
    if (totalGroups <= 1) return  // nothing to reorder
    // Multi-touch (pinch-zoom) — bail so we don't fight browser gestures.
    if (e.touches && e.touches.length > 1) {
      cancelGroupTouchTimer()
      return
    }
    const t = e.touches?.[0]
    if (!t) return
    touchStartYRef.current = t.clientY
    touchActiveRef.current = false
    cancelGroupTouchTimer()
    touchTimerRef.current = setTimeout(() => {
      touchTimerRef.current = 0
      touchActiveRef.current = true
      setDraggingGroupIdx(idx)
      // Haptic feedback when entering drag (Android vibration API).
      // Silently skipped on iOS / desktop / browsers that gate it.
      try { navigator.vibrate?.(10) } catch { /* unsupported */ }
    }, TOUCH_GROUP_LONG_PRESS_MS)
  }
  const onGroupTouchMove = (idx, totalGroups) => (e) => {
    const t = e.touches?.[0]
    if (!t) return
    // Pre-arm: cancel the timer if user scrolled away from start.
    if (!touchActiveRef.current) {
      const dy = Math.abs(t.clientY - touchStartYRef.current)
      if (dy > TOUCH_GROUP_SLOP_PX) cancelGroupTouchTimer()
      return
    }
    // Drag-active: lock scroll + hit-test the new target idx.
    try { e.preventDefault() } catch { /* passive listener */ }
    const ranges = []
    for (let i = 0; i < totalGroups; i++) {
      const el = groupRefs.current.get(i)
      if (!el) { ranges.push(null); continue }
      const r = el.getBoundingClientRect()
      ranges.push({ top: r.top, bottom: r.bottom })
    }
    // R28.20 — Use the gap-aware hit-test so a thumb dragging between
    // rows can land on the explicit gap-drop target instead of always
    // resolving to the nearest row. Result is { kind, ...} discriminated
    // by 'row' (existing dragOverGroupIdx semantic) vs 'gap' (new
    // gapOverGroupIdx semantic — parallels the desktop gap-drop from
    // R27.20). Falls back to row hit-test when the touch isn't near
    // a boundary.
    const target = resolveTouchTargetWithGaps(t.clientY, ranges)
    if (target && target.kind === 'gap') {
      // Gap mode: clear the row hint + set the gap hint. We accept
      // gap-above-self (gapIdx === idx) and gap-below-self
      // (gapIdx === idx + 1) for visual highlighting BUT the drop
      // handler will short-circuit them as no-op (dropIndexForGap
      // returns null for those cases — already pinned in R19.19's
      // tests).
      setDragOverGroupIdx(prev => (prev === null ? prev : null))
      setGapOverGroupIdx(prev => (prev === target.gapIdx ? prev : target.gapIdx))
    } else if (target && target.kind === 'row') {
      // Row mode: clear the gap hint + set the row hint (skip self
      // since dropping a row onto itself is a no-op).
      setGapOverGroupIdx(prev => (prev === null ? prev : null))
      if (target.idx !== idx) {
        setDragOverGroupIdx(prev => (prev === target.idx ? prev : target.idx))
      } else {
        setDragOverGroupIdx(prev => (prev === null ? prev : null))
      }
    } else {
      // No target — clear both hints. Drop will be a no-op.
      setDragOverGroupIdx(prev => (prev === null ? prev : null))
      setGapOverGroupIdx(prev => (prev === null ? prev : null))
    }
  }
  const onGroupTouchEnd = () => {
    cancelGroupTouchTimer()
    if (!touchActiveRef.current) {
      // Just a tap that never crossed the long-press threshold. Don't
      // fire any reorder.
      return
    }
    touchActiveRef.current = false
    // Flag the next synthetic click for suppression (parallels camera-
    // path's suppressNextClickRef).
    suppressNextGroupClickRef.current = true
    const from = draggingGroupIdx
    // R28.20 — Two drop modes: GAP (insert-here) wins when the user's
    // touch ended over a gap zone, ROW (reorder-onto-row) otherwise.
    // Gap mode uses dropIndexForGap for the splice-bookkeeping;
    // row mode uses the existing direct moveAttractorByIndex(from, to).
    // Both modes reset their hint state before exit.
    const gapTarget = gapOverGroupIdx
    const rowTarget = dragOverGroupIdx
    setDraggingGroupIdx(null)
    setDragOverGroupIdx(null)
    setGapOverGroupIdx(null)
    if (from === null) return
    if (gapTarget !== null) {
      // Gap mode: insert at the gap position via dropIndexForGap which
      // handles the splice-bookkeeping + self-gap no-op cases (R19.19,
      // already pinned in namedAttractors.test.mjs).
      const insertIdx = dropIndexForGap(from, gapTarget, (namedAttractors || []).length)
      if (insertIdx == null) return
      moveNamedAttractorByIndex(from, insertIdx)
      return
    }
    // Row mode (R26.20 baseline).
    if (rowTarget === null || rowTarget === from) return
    moveNamedAttractorByIndex(from, rowTarget)
  }
  const onGroupTouchCancel = () => {
    cancelGroupTouchTimer()
    if (touchActiveRef.current) {
      touchActiveRef.current = false
      setDraggingGroupIdx(null)
      setDragOverGroupIdx(null)
      // R28.20 — clear gap hint on touch-cancel too (e.g. user lifts
      // finger off-screen mid-drag) so we don't leave a stale gap
      // indicator painted on the panel.
      setGapOverGroupIdx(null)
    }
  }
  // Click-side counterpart — chain the suppressed click so any nested
  // onClick (e.g. Learn / Remove buttons inside the group rows) doesn't
  // fire on tap-release of a long-press drag. One-shot: clears the flag
  // on first inspection.
  const consumeGroupClickIfSuppressed = () => {
    if (suppressNextGroupClickRef.current) {
      suppressNextGroupClickRef.current = false
      return false
    }
    return true
  }
  // R29.20 — keyboard reorder handler for the group grab handle. The
  // handle is focusable (tabIndex=0, role=button); this keydown drives
  // the lift / arrow / commit / cancel lifecycle so a keyboard-only
  // user can reach the gap-drop zones the mouse/touch paths already use.
  //   - Enter / Space (not lifted) : LIFT this group (cursor unset).
  //   - Enter / Space (lifted)     : COMMIT at the cursor's gap, or just
  //                                  drop-in-place (cancel) if no cursor.
  //   - ArrowUp / ArrowDown        : step the gap cursor (lifts first if
  //                                  needed so the first arrow also works).
  //   - Escape                     : cancel the lift, no move.
  // `liveIdx` is the group's index in the live attractor list; `total`
  // is the list length. Only wired on draggable groups (live + >1).
  const onGroupHandleKeyDown = (liveIdx, total) => (e) => {
    const key = e.key
    const isActivate = key === 'Enter' || key === ' ' || key === 'Spacebar'
    const isUp = key === 'ArrowUp'
    const isDown = key === 'ArrowDown'
    const isCancel = key === 'Escape'
    if (!isActivate && !isUp && !isDown && !isCancel) return
    const lifted = liftedGroupIdx === liveIdx
    // R30.20 — resolve the lifted row's name so announcements name the
    // actual attractor ("Moved Eye to position 2 of 5").
    const liftedName = ((namedAttractors || [])[liveIdx] || {}).name
    if (isCancel) {
      if (lifted) {
        e.preventDefault()
        setLiftedGroupIdx(null)
        setKeyboardGapCursor(null)
        setGapReorderAnnounce(describeGapReorderAnnouncement('cancel', { from: liveIdx, total, name: liftedName }))
      }
      return
    }
    if (isActivate) {
      e.preventDefault()
      if (!lifted) {
        // Lift this group; arm the cursor at "unset" so the next arrow
        // seeds it past the row.
        setLiftedGroupIdx(liveIdx)
        setKeyboardGapCursor(null)
        setGapReorderAnnounce(describeGapReorderAnnouncement('lift', { from: liveIdx, total, name: liftedName }))
        return
      }
      // Already lifted → commit at the cursor (if any).
      if (keyboardGapCursor != null) {
        const insertIdx = dropIndexForGap(liveIdx, keyboardGapCursor, total)
        if (insertIdx != null) moveNamedAttractorByIndex(liveIdx, insertIdx)
      }
      setGapReorderAnnounce(describeGapReorderAnnouncement('commit', { from: liveIdx, gapIdx: keyboardGapCursor, total, name: liftedName }))
      setLiftedGroupIdx(null)
      setKeyboardGapCursor(null)
      return
    }
    // Arrow up/down. Lift first if not already lifted so the gesture is
    // discoverable without a separate "press Enter to grab" step.
    e.preventDefault()
    if (!lifted) {
      setLiftedGroupIdx(liveIdx)
      // Announce the implicit lift so the first arrow press is narrated
      // even when the user skipped the explicit Enter-to-grab step.
      setGapReorderAnnounce(describeGapReorderAnnouncement('lift', { from: liveIdx, total, name: liftedName }))
    }
    const dir = isUp ? -1 : 1
    const nextCursor = stepKeyboardGapCursor(liveIdx, lifted ? keyboardGapCursor : null, dir, total)
    if (nextCursor != null) {
      setKeyboardGapCursor(nextCursor)
      setGapReorderAnnounce(describeGapReorderAnnouncement('move', { from: liveIdx, gapIdx: nextCursor, total, name: liftedName }))
    }
  }
  // R29.20 — clear the keyboard lift if the attractor list changes out
  // from under it (add/remove/external reorder) so a stale cursor can't
  // commit a move against a list that no longer matches.
  useEffect(() => {
    if (liftedGroupIdx != null && liftedGroupIdx >= (namedAttractors || []).length) {
      setLiftedGroupIdx(null)
      setKeyboardGapCursor(null)
    }
  }, [namedAttractors, liftedGroupIdx])
  // Group touch-handler factory — spread onto the grab handle (which
  // arms the drag) and the group surface (which acts as drop target +
  // continues the gesture once armed). stopProp=true on the handle so
  // the same touchstart doesn't bubble + re-arm the group's own
  // handler (which would also work but the cleaner contract is each
  // surface owns its touch lifecycle).
  const groupTouchHandlers = (idx, totalGroups, { stopProp = false } = {}) => ({
    onTouchStart: (e) => {
      if (stopProp) e.stopPropagation()
      onGroupTouchStart(idx, totalGroups)(e)
    },
    onTouchMove: (e) => {
      if (stopProp) e.stopPropagation()
      onGroupTouchMove(idx, totalGroups)(e)
    },
    onTouchEnd: (e) => {
      if (stopProp) e.stopPropagation()
      onGroupTouchEnd(e)
    },
    onTouchCancel: (e) => {
      if (stopProp) e.stopPropagation()
      onGroupTouchCancel(e)
    },
  })
  // Subscribe to the live attractor list so per-attractor MIDI rows
  // appear/disappear and re-label in real time as the user adds,
  // renames, or deletes attractors. attractorActions() is pure data
  // (id + label + range), so this is cheap to re-derive each render.
  const namedAttractors = useStore(s => s.namedAttractors)
  const attractorRows = attractorActions({ namedAttractors })
  // R29.43 — live persisted fade-curve preference for the hotkey UNDO
  // chain badge. Read from the store so the chip's selection survives
  // reload + the toast closure (showHotkeyTransferToast) captures the
  // latest value each render. cycle advances + persists in one call.
  const hotkeyChainFadeCurve = useStore(s => s.hotkeyChainFadeCurve)
  const cycleHotkeyChainFadeCurve = useStore(s => s.cycleHotkeyChainFadeCurve)
  // R29.43 — keep the latest persisted fade-curve in a ref so the
  // recursive chain-toast closure (showHotkeyTransferToast) reads the
  // CURRENT preference even if the user cycles the chip mid-chain.
  // Synced via effect (not read during render) to satisfy the
  // react-hooks ref rules.
  const hotkeyChainFadeCurveRef = useRef(hotkeyChainFadeCurve)
  useEffect(() => { hotkeyChainFadeCurveRef.current = hotkeyChainFadeCurve }, [hotkeyChainFadeCurve])
  // R24.40 — GC orphan per-attractor overrides when an attractor is
  // deleted. Without this pass, persisted overrides accumulate cruft:
  // delete attractor A, recreate B with attr-2 id, B inherits A's
  // overrides. pruneClampWarnAttractorOverrides has a ref-equal-on-
  // no-op contract so the common case (no orphans) skips state work.
  useEffect(() => {
    const liveIds = Array.isArray(namedAttractors)
      ? namedAttractors.map(a => a && a.id).filter(Boolean)
      : []
    const pruned = pruneClampWarnAttractorOverrides(clampWarnAttractorOverrides, liveIds)
    if (pruned === clampWarnAttractorOverrides) return  // no-op
    setClampWarnAttractorOverridesState(pruned)
    try {
      if (typeof localStorage !== 'undefined') {
        if (Object.keys(pruned).length === 0) {
          localStorage.removeItem('midi-clamp-warn-attractor-overrides-v1')
        } else {
          localStorage.setItem('midi-clamp-warn-attractor-overrides-v1', JSON.stringify(pruned))
        }
      }
    } catch { /* quota / private mode */ }
  }, [namedAttractors, clampWarnAttractorOverrides])
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
  // R22.30 — toast also carries an UNDO action chip: click Undo to
  // restore the displaced binding to the original bundle in one tap.
  // R23.35 — graduates R22.30 with TOGGLE-CHAINING: the restore toast
  // also carries an Undo action (valid for UNDO_CHAIN_MS ≈ 1s) that
  // re-runs the original assignment, surfacing yet another restore
  // toast with its own undo. A user can flip-flop the assignment
  // without going back to the panel. Past the window the chip surfaces
  // a "too late" hint instead of silently expiring — the toast becomes
  // self-documenting about why the gesture stopped working.
  //
  // R24.38 — surfaces a visual "chain counter" badge on each toast in
  // the chain so the user can see at a glance how many flips deep
  // they are (1, 2, 3...). Useful for the indecisive flipper — at flip
  // #5 the badge reads "x5" and signals "maybe stop". Step 1 doesn't
  // paint a badge (first toast in the chain — no chain yet to count).
  //
  // We use functional setState (prev => ...) so each flip in the chain
  // sees LIVE state instead of the snapshot captured when the toast
  // first surfaced — concurrent edits between flips compose safely
  // (the lib's 1-hotkey-1-bundle invariant handles symmetric strips
  // either way).
  //
  // Internal helper — showHotkeyTransferToast renders the toast for
  // one step of the chain. It accepts the WINNER (took the hotkey)
  // and LOSER (had it stripped). On Undo, it FLIPS roles + calls
  // itself: winner becomes the new loser, loser becomes the new
  // winner. Recursion is bounded by user input + the 1s window, not
  // by depth (each click resets the issuedAt clock). `chainStep` is
  // 1-based: 1 = first toast (no badge), 2+ = restore toasts (with
  // badge "x2", "x3", ...).
  const showHotkeyTransferToast = (winnerId, loserId, hotkey, prevList, chainStep = 1) => {
    const winner = prevList.find(p => p.id === winnerId)
    const loser  = prevList.find(p => p.id === loserId)
    if (!winner || !loser) return  // either bundle deleted between flips
    const winnerColor = userPresetColorStyle(winner.color || DEFAULT_USER_PRESET_COLOR)
    // R23.35 — issuedAt clock for the toggle window. This helper is
    // only called from event handlers (button clicks downstream of
    // setUserBundleHotkey), never during render — but the React
    // Compiler can't trace that across the recursive closure structure,
    // so the impure-Date.now check fires false-positive. Suppressing
    // is correct here; if it ever DID fire during render the result
    // would be a harmless 1-second-of-undo opportunity, not a crash.
    // eslint-disable-next-line react-hooks/purity
    const issuedAt = Date.now()
    const flipBack = () => {
      // R23.35 — gate on the toggle window. Inside → run the flip.
      // Past the window → surface a "too late" hint so the user
      // understands the chip's no-op behaviour.
      const now = Date.now()
      if (!isWithinUndoWindow(issuedAt, now)) {
        showToast(
          `Undo expired \u2014 too late to flip back (${UNDO_CHAIN_MS / 1000}s window)`,
          <AlertCircle size={10} color="#fbbf24" strokeWidth={2.4} />,
        )
        return
      }
      // Functional setState so we flip against LIVE state (a concurrent
      // edit between this toast surfacing + the click composes safely).
      setUserPresets(prev => {
        // Re-bind hotkey to the LOSER (current owner LOSES it back to
        // the previous holder). The lib's 1-hotkey-1-bundle invariant
        // handles the symmetric strip from the current winner.
        const flipped = setUserPresetHotkey(prev, loserId, hotkey)
        if (flipped === prev) return prev  // bundle vanished — bail
        saveUserPresets(flipped)
        // Chain the next step: the OLD loser is now the NEW winner;
        // the OLD winner is now the NEW loser. Re-issue the toast
        // (with its own 1s window). R24.38 — increment chainStep so
        // the badge counts up across the chain.
        showHotkeyTransferToast(loserId, winnerId, hotkey, flipped, chainStep + 1)
        return flipped
      })
    }
    // R27.43 — Fade the badge colour over the undo window. When a chain
    // step has a directional colour (step >= 2), pass the fade config
    // to showToast so Toast.jsx ticks a 50ms interval and lerps the
    // badge from cyan/amber → grey as Date.now() - mountedAt walks
    // 0 → UNDO_CHAIN_MS. Step 1 has no badge so there's nothing to
    // fade; we leave fade undefined on null badges.
    //
    // R28.43 — Pass curve='easeInCubic' so the badge holds its
    // direction colour for ~500ms (well past the human's perceptual
    // lag) before accelerating to grey in the last 500ms. Linear was
    // perceptually "already fading" by t=250ms which felt rushed; the
    // cubic curve gives the user breathing room early then signals
    // urgency emphatically as the window closes. Specifically the
    // chosen curve is t' = t^3: at t=0.5 the colour has only walked
    // 12.5% toward grey, so the badge reads as ~bright through the
    // first half of the window.
    //
    // R29.43 — the curve is now the user's PERSISTED preference (read
    // from the synced ref so deep recursive chain steps pick up a
    // mid-chain chip change). sanitize guards a corrupt persisted value
    // back to the recommended easeInCubic so the badge always fades
    // sensibly; HOTKEY_CHAIN_FADE_CURVE_RECOMMENDED stays the fallback.
    const fadeCurve = sanitizeHotkeyChainFadeCurve(hotkeyChainFadeCurveRef.current)
    const formatted = formatHotkeyChainBadge(chainStep, UNDO_CHAIN_MS)
    const badge = formatted
      ? (formatted.color
        ? { ...formatted, fade: {
            baseColor: formatted.color,
            windowMs: UNDO_CHAIN_MS,
            curve: fadeCurve,
          } }
        : formatted)
      : undefined
    showToast(
      `Hotkey \u201c${hotkey}\u201d \u2192 \u201c${winner.name}\u201d (stolen from \u201c${loser.name}\u201d)`,
      <AlertCircle size={10} color={winnerColor.accent} strokeWidth={2.4} />,
      { label: 'Undo', onClick: flipBack },
      badge,
    )
  }
  const setUserBundleHotkey = (id, hotkey) => {
    const beforeList = userPresets
    const conflict = detectHotkeyConflict(beforeList, id, hotkey)
    const next = setUserPresetHotkey(beforeList, id, hotkey)
    if (next === beforeList) return false
    setUserPresets(next)
    saveUserPresets(next)
    if (conflict) {
      // Kick off the toast chain. The first step's WINNER is the
      // target bundle (just took the hotkey); the LOSER is the
      // pre-existing holder (just got stripped). Subsequent flips
      // alternate via showHotkeyTransferToast's recursive structure.
      showHotkeyTransferToast(id, conflict.id, hotkey, next)
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
        {/* R30.20 — visually-hidden aria-live region for the keyboard
            gap-drop reorder. Screen readers announce each lift / cursor
            move / commit / cancel as the user drives the gesture with
            Enter + arrows. Kept persistently mounted (only the text
            changes) so assistive tech reliably picks up updates; the
            clip/0-size pattern hides it visually without display:none
            (which SRs skip). aria-atomic so the whole phrase is re-read,
            not just the diff. */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
            overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0,
          }}
        >{gapReorderAnnounce}</div>
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
          fadeCurve={hotkeyChainFadeCurve}
          fadeCurveLabel={labelForHotkeyChainFadeCurve(hotkeyChainFadeCurve)}
          fadeCurveCycleHint={HOTKEY_CHAIN_FADE_CURVES.map(labelForHotkeyChainFadeCurve).join(' \u2192 ')}
          onCycleFadeCurve={cycleHotkeyChainFadeCurve}
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
                {grouped.map((group, groupIdxInIter) => {
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
                  // R25.20 — resolve the group's index in the live
                  // namedAttractors list for the DnD handlers. Stale
                  // groups (no live entry) are -1 → not draggable.
                  const liveIdx = liveAttr
                    ? (namedAttractors || []).indexOf(liveAttr)
                    : -1
                  const draggable = liveIdx >= 0 && (namedAttractors || []).length > 1
                  const isBeingDragged = draggable && draggingGroupIdx === liveIdx
                  const isDropTarget    = draggable && dragOverGroupIdx === liveIdx
                                          && draggingGroupIdx != null && draggingGroupIdx !== liveIdx
                  // R26.20 — total live groups; used by touch handlers so
                  // single-attractor lists skip the long-press arm.
                  const totalGroups = (namedAttractors || []).length
                  // R27.20 — gap-drop zone visibility + state. Each
                  // group has a gap-ABOVE it (index = groupIdxInIter).
                  // The gap renders inert at 4px height by default
                  // (subtle spacer) and expands to 18px with an
                  // indigo dashed strip when a drag is active AND
                  // this gap is the hovered target. Single-group
                  // lists skip the gap entirely (nothing to insert
                  // between).
                  const showGap = draggable && grouped.length > 1
                  const isGapTarget = showGap && gapOverGroupIdx === groupIdxInIter
                                      && draggingGroupIdx != null
                  // R29.20 — keyboard reorder state for THIS group.
                  // isKeyboardLifted: this group is the one the user
                  // grabbed via keyboard. isKeyboardGapTarget: the
                  // keyboard drop-cursor currently points at the gap
                  // ABOVE this group. Both reuse the gap-zone highlight
                  // so the keyboard path looks identical to the
                  // mouse/touch gap-drop.
                  const isKeyboardLifted = draggable && liftedGroupIdx === liveIdx
                  const isKeyboardGapTarget = showGap && liftedGroupIdx != null
                                      && keyboardGapCursor === groupIdxInIter
                  return (
                    <div key={group.attractorId} style={{ display: 'contents' }}>
                      {/* R27.20 — gap-above-this-group drop zone.
                          Renders inert at 4px tall by default
                          (visually invisible thin spacer between
                          groups, matches the 6px marginBottom of the
                          group divs above) but expands to 18px with
                          an indigo dashed strip when a drag is active
                          AND this gap is the hovered target. The
                          expand-on-hover gives the user a much larger
                          landing target than a 1px line would while
                          keeping the at-rest layout tidy. Pure wire
                          layer on the lib's dropIndexForGap +
                          moveAttractorByIndex primitives which are
                          already pinned in namedAttractors.test.mjs
                          (R19.19's test coverage). */}
                      {showGap && (
                        <div
                          onDragOver={(e) => {
                            if (draggingGroupIdx == null) return
                            e.preventDefault()
                            try { e.dataTransfer.dropEffect = 'move' } catch { /* */ }
                            if (gapOverGroupIdx !== groupIdxInIter) setGapOverGroupIdx(groupIdxInIter)
                            if (dragOverGroupIdx !== null) setDragOverGroupIdx(null)
                          }}
                          onDragLeave={() => {
                            if (gapOverGroupIdx === groupIdxInIter) setGapOverGroupIdx(null)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const from = draggingGroupIdx
                            setDraggingGroupIdx(null)
                            setDragOverGroupIdx(null)
                            setGapOverGroupIdx(null)
                            if (from == null) return
                            // R19.19 — dropIndexForGap encapsulates the
                            // splice-bookkeeping math + the no-op cases
                            // (dropping into own slot — either gap above
                            // or gap below the dragged group). Returns
                            // null on no-op so the store call short-
                            // circuits cleanly.
                            const insertIdx = dropIndexForGap(from, groupIdxInIter, (namedAttractors || []).length)
                            if (insertIdx == null) return
                            moveNamedAttractorByIndex(from, insertIdx)
                          }}
                          style={{
                            height: (isGapTarget || isKeyboardGapTarget) ? 18 : 4,
                            margin: '-2px 0 -1px 0',
                            borderRadius: 4,
                            background: (isGapTarget || isKeyboardGapTarget)
                              ? 'linear-gradient(90deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))'
                              : 'transparent',
                            border: (isGapTarget || isKeyboardGapTarget)
                              ? '1px dashed rgba(99,102,241,0.55)'
                              : '1px dashed transparent',
                            transition: 'height 0.12s ease-out, background 0.12s ease-out, border-color 0.12s ease-out',
                          }}
                          title={`Drop here to insert this attractor at position ${groupIdxInIter + 1}`}
                        />
                      )}
                      <div
                      ref={draggable ? setGroupRef(liveIdx) : undefined}
                      onDragOver={draggable ? (e) => {
                        // Allow drop only when a group drag is in progress
                        // and we're not the SAME group being dragged.
                        if (draggingGroupIdx == null || draggingGroupIdx === liveIdx) return
                        e.preventDefault()
                        if (dragOverGroupIdx !== liveIdx) setDragOverGroupIdx(liveIdx)
                      } : undefined}
                      onDragLeave={draggable ? () => {
                        // Only clear if we're leaving the SAME group
                        // we're highlighting (sibling-enter-before-leave
                        // guard mirrors R17.07 / R18.19).
                        if (dragOverGroupIdx === liveIdx) setDragOverGroupIdx(null)
                      } : undefined}
                      onDrop={draggable ? (e) => {
                        e.preventDefault()
                        const from = draggingGroupIdx
                        const to = liveIdx
                        setDraggingGroupIdx(null)
                        setDragOverGroupIdx(null)
                        setGapOverGroupIdx(null)
                        if (from == null || from === to) return
                        moveNamedAttractorByIndex(from, to)
                      } : undefined}
                      {...(draggable ? groupTouchHandlers(liveIdx, totalGroups) : {})}
                      style={{
                        border: isDropTarget
                          ? '1px solid rgba(168,85,247,0.65)'
                          : `1px solid ${isStale ? 'rgba(168,85,247,0.18)' : groupStyle.borderFaint}`,
                        borderRadius: 8,
                        padding: '6px 8px',
                        marginBottom: 6,
                        background: isDropTarget
                          ? 'rgba(168,85,247,0.12)'
                          : isStale ? 'rgba(168,85,247,0.03)' : groupStyle.bgFaint,
                        opacity: isBeingDragged ? 0.55 : 1,
                        transition: 'background 0.12s ease-out, border-color 0.12s ease-out, opacity 0.12s ease-out',
                        position: 'relative',
                      }}>
                      <div style={{
                        fontSize: 11, fontWeight: 600,
                        color: isStale ? '#e9d5ff' : groupStyle.fg,
                        marginBottom: 4, padding: '2px 0',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {/* R25.20 — drag handle. Renders only when this
                            group is draggable (live attractor + >1 in
                            list). Grab + drop transfers via HTML5 native
                            DnD on the handle ONLY — not the whole header
                            — so clicking on the group name doesn't start
                            a drag. */}
                        {draggable && (
                          <span
                            draggable
                            onDragStart={(e) => {
                              setDraggingGroupIdx(liveIdx)
                              // Required for Firefox to actually fire the
                              // drag (it ignores dragstart when dataTransfer
                              // hasn't been set).
                              try {
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', String(liveIdx))
                              } catch { /* unavailable in some testing envs */ }
                            }}
                            onDragEnd={() => {
                              setDraggingGroupIdx(null)
                              setDragOverGroupIdx(null)
                              setGapOverGroupIdx(null)
                            }}
                            // R26.20 — touch handlers spread onto the
                            // grab handle so a thumb-down on the ⠇
                            // glyph starts the long-press timer
                            // directly. stopProp=true so the same
                            // touchstart doesn't bubble to the group
                            // surface's own handler (would re-arm the
                            // timer; works but the cleaner contract is
                            // each surface owns its lifecycle).
                            {...groupTouchHandlers(liveIdx, totalGroups, { stopProp: true })}
                            onClick={(e) => {
                              // R26.20 — swallow the synthetic click
                              // that browsers emit on tap-release after
                              // a long-press drag; without this, the
                              // browser fires a click on the grab
                              // handle (no onClick handler currently
                              // but defensive in case future code adds
                              // one) AND on bubbling parent buttons
                              // (which is the real risk).
                              if (!consumeGroupClickIfSuppressed()) {
                                e.preventDefault()
                                e.stopPropagation()
                              }
                            }}
                            // R29.20 — keyboard reorder: focusable handle
                            // + keydown lifecycle so keyboard-only users
                            // reach the gap-drop zones (Enter lifts,
                            // arrows move the cursor, Enter commits,
                            // Escape cancels).
                            tabIndex={0}
                            role="button"
                            aria-label={isKeyboardLifted
                              ? `Reordering ${liveAttr?.name || 'attractor'} binding group. Arrow up/down to choose a position, Enter to drop, Escape to cancel.`
                              : `Reorder ${liveAttr?.name || 'attractor'} binding group. Press Enter or arrow keys to grab, then arrow up/down to move.`}
                            onKeyDown={onGroupHandleKeyDown(liveIdx, totalGroups)}
                            title="Drag to reorder this attractor's binding group (touch: long-press to grab; keyboard: focus + Enter, then arrows)"
                            style={{
                              cursor: 'grab',
                              color: isKeyboardLifted ? '#a5b4fc' : isStale ? '#a78bfa' : groupStyle.fgMuted,
                              fontSize: 12, lineHeight: 1,
                              userSelect: 'none',
                              WebkitUserSelect: 'none',
                              WebkitTouchCallout: 'none',
                              padding: '0 2px',
                              borderRadius: 3,
                              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                              fontWeight: 700,
                              touchAction: 'manipulation',
                              // R29.20 — lifted state gets an indigo ring
                              // so a keyboard user sees which row is grabbed.
                              outline: isKeyboardLifted ? '1px solid rgba(99,102,241,0.6)' : 'none',
                              background: isKeyboardLifted ? 'rgba(99,102,241,0.14)' : 'transparent',
                            }}
                          >{'\u2807'}</span>
                        )}
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
                        {/* R25.20 — show the live position index as a
                            monospace badge next to the type. Cue for
                            "where am I in the list now?" after a drag. */}
                        {draggable && (
                          <span style={{
                            fontSize: 8.5, fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                            color: '#5a5a70', letterSpacing: '0.04em',
                            padding: '0 4px', borderRadius: 3,
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            fontWeight: 600,
                            marginLeft: 2,
                          }}>#{liveIdx + 1}</span>
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
                                // R22.27 — three-tier classifier uses
                                // the user-tunable threshold instead of
                                // R21.22's hard-coded 0.25.
                                // R23.32 — threshold resolution walks
                                // per-field override → global → DEFAULT
                                // via resolveClampWarnThreshold so the
                                // meter respects per-field tightening
                                // / loosening when present.
                                // R24.40 — graduates to the 4-tier
                                // resolveClampWarnThresholdFor: per-
                                // (attractor, field) overrides take
                                // precedence over per-field-globals so
                                // power users can pin one attractor's
                                // STRENGTH meter strict while leaving
                                // every other attractor's STRENGTH
                                // meter on the per-field-global value.
                                const effectiveThreshold = resolveClampWarnThresholdFor(
                                  a.attractor && a.attractor.id, a.field,
                                  clampWarnThreshold, clampWarnOverrides, clampWarnAttractorOverrides,
                                )
                                const tier = classifyClampProximity(prox, atRail, effectiveThreshold)
                                const proxFillColor =
                                  tier === 'danger' ? 'rgba(239,68,68,0.85)' :  // red — at clamp
                                  tier === 'warn'   ? 'rgba(251,191,36,0.80)' : // amber — close
                                                      'rgba(134,239,172,0.85)'  // green — safe
                                const proxTextColor =
                                  tier === 'danger' ? '#fca5a5' :
                                  tier === 'warn'   ? '#fbbf24' :
                                                      '#86efac'
                                const proxBorderColor =
                                  tier === 'danger' ? 'rgba(239,68,68,0.40)' :
                                  tier === 'warn'   ? 'rgba(251,191,36,0.32)' :
                                                      'rgba(34,197,94,0.32)'
                                const proxBgColor =
                                  tier === 'danger' ? 'rgba(239,68,68,0.10)' :
                                  tier === 'warn'   ? 'rgba(245,158,11,0.08)' :
                                                      'rgba(34,197,94,0.08)'
                                const pct = Math.round(clampProx.v01 * 100)
                                // R22.27 — small "edited" dot when the
                                // threshold is non-default, so the user
                                // knows the meter is reading on their
                                // custom scale. R23.32 — also flags
                                // when the FIELD has its own override
                                // (distinct from a global edit) so
                                // users can tell which meters are on
                                // the per-field track.
                                // R24.40 — per-attractor override
                                // surfaces as an additional flag too;
                                // tooltip below distinguishes which
                                // tier is driving the live meter.
                                const editedGlobal = !isClampWarnThresholdAtDefault(clampWarnThreshold)
                                const editedField = hasClampWarnFieldOverride(a.field, clampWarnThreshold, clampWarnOverrides)
                                const editedAttractor = hasClampWarnAttractorFieldOverride(
                                  a.attractor && a.attractor.id, a.field,
                                  clampWarnThreshold, clampWarnOverrides, clampWarnAttractorOverrides,
                                )
                                const edited = editedGlobal || editedField || editedAttractor
                                const isOpenForMe = clampThresholdPopoverFor
                                  && clampThresholdPopoverFor.attractorId === a.id
                                  && clampThresholdPopoverFor.field === a.field
                                return (
                                  <span title={`Knob at ${pct}% of [${a.min}..${a.max}]. ${tier === 'danger' ? 'AT THE RAIL — twisting further does nothing.' : tier === 'warn' ? 'Close to clamp — limited headroom in this direction.' : 'Safe — plenty of room either way.'} Proximity: ${(prox * 100).toFixed(0)}% from nearest clamp. Long-press to tweak the warn threshold (currently ${Math.round(effectiveThreshold * 100)}%${editedAttractor ? ', per-attractor override' : editedField ? ', per-field override' : editedGlobal ? ', global override' : ', default'}).`}
                                    onPointerDown={(e) => {
                                      // R22.27 — long-press (≥400ms) to
                                      // open the threshold-tweak popover.
                                      // Pure pointer-event so works on
                                      // touch + mouse. Right-click /
                                      // multi-touch bail.
                                      if (e.button != null && e.button !== 0) return
                                      const tmrId = setTimeout(() => {
                                        // R23.32 — popover scope is
                                        // (attractor, field) so the
                                        // per-field controls know whose
                                        // override to edit.
                                        setClampThresholdPopoverFor({ attractorId: a.id, field: a.field })
                                        e.currentTarget.__pressFired = true
                                      }, 400)
                                      e.currentTarget.__pressTimer = tmrId
                                      e.currentTarget.__pressFired = false
                                    }}
                                    onPointerUp={(e) => {
                                      if (e.currentTarget.__pressTimer) {
                                        clearTimeout(e.currentTarget.__pressTimer)
                                        e.currentTarget.__pressTimer = null
                                      }
                                    }}
                                    onPointerLeave={(e) => {
                                      if (e.currentTarget.__pressTimer) {
                                        clearTimeout(e.currentTarget.__pressTimer)
                                        e.currentTarget.__pressTimer = null
                                      }
                                    }}
                                    style={{
                                      padding: '1px 5px', borderRadius: 4,
                                      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                                      background: proxBgColor,
                                      color: proxTextColor,
                                      border: `1px solid ${proxBorderColor}`,
                                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                                      textTransform: 'uppercase',
                                      display: 'inline-flex', alignItems: 'center', gap: 4,
                                      cursor: 'pointer',
                                      position: 'relative',
                                      // touchAction:'manipulation' removes
                                      // the 300ms iOS tap delay without
                                      // killing scroll/pinch.
                                      touchAction: 'manipulation',
                                    }}>
                                    <span>{pct}%</span>
                                    {/* R22.27 — edited dot. Cyan pip
                                        shown when the warn threshold has
                                        been moved off the shipped default.
                                        Lives between the % readout and
                                        the bar so it's adjacent to the
                                        tier classification it modifies. */}
                                    {edited && (
                                      <span style={{
                                        width: 4, height: 4, borderRadius: '50%',
                                        background: 'rgba(34,211,238,0.85)',
                                        boxShadow: '0 0 3px rgba(34,211,238,0.6)',
                                      }} title={`Warn threshold: ${Math.round(clampWarnThreshold * 100)}% (custom; default ${Math.round(CLAMP_WARN_THRESHOLD_DEFAULT * 100)}%)`} />
                                    )}
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
                                    {/* R22.27 — popover for tweaking the
                                        warn threshold. Anchored to THIS
                                        meter (we filter by attractorId +
                                        field) so it appears where the
                                        user pressed. position: absolute
                                        lifts it above the table layout;
                                        pointerEvents on the backdrop
                                        captures click-outside to close.
                                        R23.32 — popover now carries
                                        per-field props so the chip can
                                        target either GLOBAL (R22.27
                                        baseline) or this specific
                                        field's override. */}
                                    {isOpenForMe && (
                                      <ClampThresholdPopover
                                        field={a.field}
                                        fieldLabel={a.label}
                                        globalValue={clampWarnThreshold}
                                        onChangeGlobal={setClampWarnThreshold}
                                        onResetGlobal={resetClampWarnThreshold}
                                        fieldOverrideValue={clampWarnOverrides[a.field]}
                                        onChangeField={(v) => setClampWarnFieldOverrideUI(a.field, v)}
                                        onClearField={() => setClampWarnFieldOverrideUI(a.field, null)}
                                        attractorId={a.attractor && a.attractor.id}
                                        attractorLabel={a.attractor && a.attractor.name}
                                        attractorOverrideValue={
                                          clampWarnAttractorOverrides[a.attractor && a.attractor.id]
                                          && clampWarnAttractorOverrides[a.attractor && a.attractor.id][a.field]
                                        }
                                        onChangeAttractor={(v) => setClampWarnAttractorFieldOverrideUI(a.attractor && a.attractor.id, a.field, v)}
                                        onClearAttractor={() => setClampWarnAttractorFieldOverrideUI(a.attractor && a.attractor.id, a.field, null)}
                                        /* R28.45 — per-cell wipe targeted by
                                           id (parallels onClearAttractor but
                                           accepts an arbitrary id, not just
                                           the current attractor). Lets the
                                           preview chips below the "STRENGTH
                                           all (N)" button be clickable: tap
                                           any chip to clear JUST that
                                           attractor's override on this field
                                           without leaving the popover or
                                           dropping every other attractor's
                                           override too. */
                                        onClearAttractorCell={(id) => setClampWarnAttractorFieldOverrideUI(id, a.field, null)}
                                        attractorOverrideCount={countClampWarnAttractorOverridesFor(clampWarnAttractorOverrides, a.attractor && a.attractor.id)}
                                        onClearAllForAttractor={() => clearAllClampWarnOverridesForAttractor(a.attractor && a.attractor.id)}
                                        fieldOverrideCountAcross={countClampWarnFieldOverridesAcross(clampWarnAttractorOverrides, a.field)}
                                        /* R27.45 — list the attractors that
                                           will be wiped (id + value) and the
                                           live namedAttractors for label
                                           resolution so the popover can
                                           paint inline preview chips before
                                           the user clicks "STRENGTH all". */
                                        fieldOverridesAcross={listClampWarnFieldOverridesAcross(clampWarnAttractorOverrides, a.field)}
                                        namedAttractors={namedAttractors}
                                        onClearAllForField={() => clearAllClampWarnOverridesForField(a.field)}
                                        onClose={() => setClampThresholdPopoverFor(null)}
                                        />
                                    )}
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
                    {/* R27.20 — trailing gap below the LAST group only
                        (so dropping past the bottom group inserts at the
                        end). Renders during an active mouse drag OR when
                        a keyboard reorder is lifted (R29.20) so the
                        keyboard drop-cursor can point at the end. */}
                    {showGap && groupIdxInIter === grouped.length - 1 && (draggingGroupIdx != null || liftedGroupIdx != null) && (
                      <div
                        onDragOver={(e) => {
                          e.preventDefault()
                          try { e.dataTransfer.dropEffect = 'move' } catch { /* */ }
                          const trailingIdx = (namedAttractors || []).length
                          if (gapOverGroupIdx !== trailingIdx) setGapOverGroupIdx(trailingIdx)
                          if (dragOverGroupIdx !== null) setDragOverGroupIdx(null)
                        }}
                        onDragLeave={() => {
                          const trailingIdx = (namedAttractors || []).length
                          if (gapOverGroupIdx === trailingIdx) setGapOverGroupIdx(null)
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const from = draggingGroupIdx
                          setDraggingGroupIdx(null)
                          setDragOverGroupIdx(null)
                          setGapOverGroupIdx(null)
                          if (from == null) return
                          const trailingIdx = (namedAttractors || []).length
                          const insertIdx = dropIndexForGap(from, trailingIdx, trailingIdx)
                          if (insertIdx == null) return
                          moveNamedAttractorByIndex(from, insertIdx)
                        }}
                        style={{
                          height: (gapOverGroupIdx === (namedAttractors || []).length || keyboardGapCursor === (namedAttractors || []).length) ? 24 : 8,
                          marginTop: 2,
                          borderRadius: 4,
                          background: (gapOverGroupIdx === (namedAttractors || []).length || keyboardGapCursor === (namedAttractors || []).length)
                            ? 'linear-gradient(90deg, rgba(99,102,241,0.18), rgba(168,85,247,0.12))'
                            : 'rgba(255,255,255,0.015)',
                          border: (gapOverGroupIdx === (namedAttractors || []).length || keyboardGapCursor === (namedAttractors || []).length)
                            ? '1px dashed rgba(99,102,241,0.55)'
                            : '1px dashed rgba(255,255,255,0.05)',
                          transition: 'height 0.12s ease-out, background 0.12s ease-out, border-color 0.12s ease-out',
                        }}
                        title="Drop here to move this attractor to the end of the list"
                      />
                    )}
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

// R30.43 — live preview swatch for the hotkey UNDO-chain fade curve.
// Sits next to the cycle chip and CONTINUOUSLY replays the exact fade
// the Toast badge will perform — base direction colour walking toward
// the faded grey over the 1s window, reshaped by the user's chosen
// curve — so a user can FEEL the difference between linear / slow-fast
// / fast-slow before they ever trigger a real chain.
//
// Self-contained animation: a 50ms tick (mirrors Toast.jsx's fade-tick
// cadence) walks elapsed 0 -> windowMs, then holds at the faded
// endpoint for a short beat and loops. fadeDirectionColor is the SAME
// pure projector the live badge uses, so the swatch never lies about
// the feel. The dot's box-shadow glow scales with remaining brightness
// so the "urgency" reads even in peripheral vision.
//
// Reduced-motion: when the user prefers reduced motion we DON'T run the
// ambient loop — the swatch paints a static mid-window sample of the
// curve so the chip still previews a representative colour without a
// pulsing dot.
//
// R31.43 — INTERACTIVE single-shot. When `interactive` is set the swatch
// renders as its own button (a SIBLING of the cycle chip, never nested
// inside it) so a user can CLICK it to replay the fade once on demand —
// a deterministic, full play-through from the bright start — instead of
// having to catch the ambient loop mid-cycle. This is the only way a
// reduced-motion user can FEEL the curve at all (their ambient loop is
// suppressed); a single user-initiated play is acceptable under
// reduced-motion because it's explicit opt-in, not auto-playing chrome.
// Each click bumps `playToken`:
//   - not reduced : restarts the ambient loop from elapsed 0 so the
//                   user sees a fresh full fade on demand.
//   - reduced     : runs ONE pass (0 -> window, brief hold) then settles
//                   back to the static mid-window sample.
function FadeCurvePreviewSwatch({ curve, windowMs = UNDO_CHAIN_MS, baseColor = HOTKEY_CHAIN_COLOR_FORWARD, interactive = false }) {
  const reducedMotionMode = useStore(s => s.reducedMotionMode)
  const osPrefersReducedMotion = useStore(s => s.osPrefersReducedMotion)
  const reduced = resolveReducedMotion(reducedMotionMode, osPrefersReducedMotion)
  // elapsed within the loop: [0, windowMs] fade, then a HOLD_MS pause at
  // the grey endpoint before restarting so the loop reads as discrete
  // "chains" rather than a seamless throb. elapsed === -1 is the
  // "settled / static" sentinel (reduced mode after a one-shot).
  const HOLD_MS = 360
  const TICK_MS = 50
  const [elapsed, setElapsed] = useState(-1)
  // Bumped on each interactive TAP. Re-keys the animation effect so a
  // tap restarts the loop (not reduced) or fires a one-shot (reduced).
  const [playToken, setPlayToken] = useState(0)
  // R32.43 — PINNED state. A long-press on the interactive swatch pins
  // the ambient loop running CONTINUOUSLY until the next tap, so a user
  // who wants to study the curve's feel (or compare two side-by-side)
  // can keep it animating instead of re-tapping the single-shot. This is
  // the only way a reduced-motion user gets a CONTINUOUS preview — and
  // it's even more explicit opt-in than R31.43's single tap (a
  // deliberate press-and-hold), so it stays defensible under reduced
  // motion: a single tap stops it. While pinned the loop ignores the
  // reduced-motion gate (runs the same ambient loop normal motion uses).
  const [pinned, setPinned] = useState(false)
  const startRef = useRef(0)
  // Long-press lifecycle (interactive only). Arm a timer on pointerdown;
  // if it fires before release we PIN + mark pressFiredRef so the ensuing
  // click is swallowed (doesn't immediately unpin). A short tap cancels
  // the timer before it fires and falls through to the click handler.
  const LONG_PRESS_MS = 420
  const pressTimerRef = useRef(0)
  const pressFiredRef = useRef(false)
  const armPress = () => {
    pressFiredRef.current = false
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current)
    pressTimerRef.current = setTimeout(() => {
      pressFiredRef.current = true
      setPinned(true)
      try { navigator.vibrate?.(10) } catch { /* unsupported */ }
    }, LONG_PRESS_MS)
  }
  const cancelPress = () => {
    if (pressTimerRef.current) { clearTimeout(pressTimerRef.current); pressTimerRef.current = 0 }
  }
  // Tear the press timer down on unmount so a hold-then-unmount doesn't
  // fire setPinned on a dead component.
  useEffect(() => () => { if (pressTimerRef.current) clearTimeout(pressTimerRef.current) }, [])
  const onSwatchTap = (e) => {
    e.stopPropagation()
    // Swallow the synthetic click that trails a long-press (the press
    // already pinned; this click must not immediately unpin it).
    if (pressFiredRef.current) { pressFiredRef.current = false; return }
    // A genuine tap UNPINS when pinned ("...until the next click"); when
    // not pinned it replays the fade once (R31.43 behaviour preserved).
    if (pinned) { setPinned(false); return }
    setPlayToken(p => p + 1)
  }
  useEffect(() => {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    // Pure static (no interval) only when reduced, NOT pinned, and no
    // one-shot is pending. When pinned the loop runs regardless of the
    // reduced gate (explicit opt-in). Render falls back to the mid-window
    // sample whenever no interval is spinning.
    if (reduced && !pinned && playToken === 0) return
    startRef.current = now()
    const id = setInterval(() => {
      const dt = now() - startRef.current
      if (reduced && !pinned) {
        // One-shot: walk 0 -> window, hold, then settle back to static
        // (sentinel -1) and stop. Self-clears so we don't spin an idle
        // interval after the single pass completes.
        if (dt >= windowMs + HOLD_MS) { setElapsed(-1); clearInterval(id); return }
        setElapsed(dt > windowMs ? windowMs : dt)
      } else {
        // Ambient continuous loop (normal motion, OR pinned in either
        // mode). A tap bumps playToken / a long-press toggles pinned —
        // both re-run this effect, resetting startRef so the visible fade
        // restarts from the bright start on demand.
        const period = windowMs + HOLD_MS
        const phase = dt % period
        setElapsed(phase > windowMs ? windowMs : phase)
      }
    }, TICK_MS)
    return () => clearInterval(id)
  }, [reduced, windowMs, playToken, pinned])
  // Static sample at ~45% of the window when idle (no interval running):
  // reduced + not pinned + no one-shot, or the post-one-shot sentinel.
  // Pinned is never static — the loop always drives elapsed.
  const isStatic = !pinned && ((reduced && playToken === 0) || elapsed < 0)
  const sampleElapsed = isStatic ? windowMs * 0.45 : elapsed
  const color = fadeDirectionColor(baseColor, sampleElapsed, windowMs, sanitizeHotkeyChainFadeCurve(curve))
  // Brightness proxy: how far through the window (0 = fresh, 1 = faded).
  const t = windowMs > 0 ? Math.min(1, sampleElapsed / windowMs) : 1
  const glow = Math.max(0, 1 - t)
  const dot = (
    <span style={{
      width: 9, height: 9, borderRadius: '50%',
      background: color,
      boxShadow: `0 0 ${2 + glow * 6}px ${color}`,
      transition: reduced ? 'none' : 'background 50ms linear, box-shadow 50ms linear',
    }} />
  )
  if (!interactive) {
    return (
      <span
        aria-hidden="true"
        title="Live preview of the chain-badge fade over the 1s undo window"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, flex: '0 0 auto',
        }}
      >{dot}</span>
    )
  }
  return (
    <button
      type="button"
      aria-label={pinned ? 'Fade preview pinned (looping). Click to stop.' : 'Replay the chain-badge fade preview'}
      aria-pressed={pinned}
      title={pinned
        ? 'Looping. Click to stop; the preview settles back to a single sample.'
        : 'Click to replay the fade once. Press and hold to pin it looping (click again to stop).'}
      onClick={onSwatchTap}
      onPointerDown={armPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 16, height: 16, flex: '0 0 auto', padding: 0,
        borderRadius: '50%', cursor: 'pointer',
        background: pinned ? 'rgba(99,102,241,0.16)' : 'transparent',
        // Pinned wears a brighter, fuller ring so the looping state reads
        // at a glance vs the resting single-shot affordance.
        border: pinned ? '1px solid rgba(129,140,248,0.85)' : '1px solid rgba(99,102,241,0.28)',
        boxShadow: pinned ? '0 0 6px rgba(99,102,241,0.45)' : 'none',
        transition: 'border-color 0.12s ease-out, background 0.12s ease-out, box-shadow 0.12s ease-out',
        // Block the iOS long-press callout / text selection so the hold
        // gesture reads cleanly as a pin (parallels the clamp chip press).
        touchAction: 'manipulation', WebkitTouchCallout: 'none', userSelect: 'none',
      }}
      onMouseEnter={(e) => { if (!pinned) e.currentTarget.style.borderColor = 'rgba(99,102,241,0.55)' }}
      onMouseLeave={(e) => { if (!pinned) e.currentTarget.style.borderColor = 'rgba(99,102,241,0.28)' }}
    >{dot}</button>
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
  // R29.43 — persisted hotkey-chain fade-curve preference + cycle.
  // R30.43 — fadeCurve (the raw active curve id) drives the live preview
  // swatch next to the cycle chip.
  fadeCurve, fadeCurveLabel, onCycleFadeCurve, fadeCurveCycleHint,
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
        {/* R29.43 — hotkey UNDO-chain fade-curve cycle chip. Lives in
            the Controller Presets header (next to the merge hint)
            because the chain badge it tunes only appears when a bundle
            hotkey is re-bound — same surface the user is working in.
            Clicking cycles linear → fast-slow → slow-fast and persists;
            the label shows the active feel. Parallels the spectrum
            peak-curve chip (R16.17) + lightbox pan-curve chip (R17.20)
            visual + interaction language. */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {typeof onCycleFadeCurve === 'function' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <button
                type="button"
                onClick={() => onCycleFadeCurve()}
                title={`Undo-chain badge fade feel: ${fadeCurveLabel}. Click to cycle (${fadeCurveCycleHint}). Controls how the chain counter colour fades over the 1s undo window after re-binding a bundle hotkey. Persists across reloads.`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 7px', borderRadius: 5,
                  fontSize: 9, fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  fontWeight: 600, letterSpacing: '0.04em',
                  cursor: 'pointer',
                  background: 'rgba(99,102,241,0.10)',
                  color: '#c7d2fe',
                  border: '1px solid rgba(99,102,241,0.30)',
                  transition: 'background 0.12s ease-out, border-color 0.12s ease-out',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.18)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.10)' }}
              >
                <span aria-hidden="true" style={{ opacity: 0.7 }}>{'\u223f'}</span>
                <span>{fadeCurveLabel}</span>
              </button>
              {/* R30.43 — live fade preview: animates the actual badge
                  fade over the 1s window so the user feels the curve
                  before triggering a chain. Static mid-window sample
                  under reduced-motion.
                  R31.43 — now its OWN button (sibling of the cycle chip,
                  not nested) so a click replays the fade once on demand
                  (single-shot) rather than only the ambient loop — and
                  it's the only way a reduced-motion user can feel the
                  curve at all. */}
              <FadeCurvePreviewSwatch curve={fadeCurve} interactive />
            </div>
          )}
          <span style={{
            fontSize: 10, color: '#8a8aa0', fontFamily: 'Geist Mono, monospace',
          }}>
            shift-click to merge
          </span>
        </div>
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

// R22.27 — popover for tweaking the clamp-meter warn threshold.
// Surfaces above the meter that was long-pressed (`position: absolute`).
// Click-outside closes it (handled by the backdrop's onClick); reset
// button restores the shipped default. Slider step is 0.01 to match
// the sanitize precision (we don't want sub-percent noise).
//
// R23.32 — graduates the single-slider design with a per-FIELD
// override row. Header row shows the FIELD label so the user knows
// the popover is scoped to (this attractor, this field). Two modes:
//   - GLOBAL slider (top, cyan): adjusts the R22.27 global threshold
//     applied to every meter without a per-field override.
//   - PER-FIELD slider (bottom, indigo): adjusts THIS field's
//     override; takes priority over the global slider when set.
//     Indigo "Use global" button clears the override.
// Both sliders are independently editable; tooltips explain the
// priority order. Header pip shows which value drives the LIVE meter.
function ClampThresholdPopover({
  field, fieldLabel,
  globalValue, onChangeGlobal, onResetGlobal,
  fieldOverrideValue, onChangeField, onClearField,
  // R24.40 — per-(attractor, field) override props. attractorId/Label
  // identify the specific attractor whose meter was long-pressed;
  // attractorOverrideValue is the current per-cell value (or undefined
  // if none). onChangeAttractor / onClearAttractor target THIS cell
  // only.
  attractorId, attractorLabel,
  attractorOverrideValue, onChangeAttractor, onClearAttractor,
  // R25.45 — bulk-clear for the current attractor: wipe EVERY per-
  // (attractor, field) override this attractor has, in one click.
  // attractorOverrideCount tells the popover how many cells would be
  // wiped — drives the button's count label + disabled state. onClearAllForAttractor
  // delegates to clearClampWarnAttractorOverrides under the hood.
  attractorOverrideCount = 0,
  onClearAllForAttractor,
  // R26.45 — bulk-clear for the current FIELD across every attractor:
  // wipe THIS field's per-attractor override on every attractor that
  // has one, in one click. fieldOverrideCountAcross tells the popover
  // how many attractors would be touched. Companion to R25.45's
  // "Clear all for this attractor" — same surface, transposed axis.
  fieldOverrideCountAcross = 0,
  onClearAllForField,
  // R27.45 — explicit list of the [{ id, value }] cells that will be
  // wiped by the field-across button, paired with the live
  // namedAttractors list for label resolution. UI uses this to paint
  // inline preview chips ABOVE the wipe button so the user sees
  // exactly which attractors are about to be reset (parallels
  // R26.41's chip-row counts UX — surface the scope explicitly,
  // don't hide it behind the button's count badge alone).
  fieldOverridesAcross = [],
  namedAttractors = [],
  // R28.45 — per-cell wipe handler. Called with the attractor id
  // when the user clicks a preview chip. Lets the user clear ONE
  // attractor's override on this field directly from the preview
  // panel — no need to navigate to that attractor's row, open its
  // own popover, and click "Clear attr." separately. Graduates the
  // R27.45 chips from read-only previews to actionable per-cell
  // wipe buttons.
  onClearAttractorCell,
  onClose,
}) {
  const minPct = Math.round(CLAMP_WARN_THRESHOLD_MIN * 100)
  const maxPct = Math.round(CLAMP_WARN_THRESHOLD_MAX * 100)
  const defPct = Math.round(CLAMP_WARN_THRESHOLD_DEFAULT * 100)
  const globalPct = Math.round(globalValue * 100)
  const globalAtDefault = isClampWarnThresholdAtDefault(globalValue)
  const hasFieldOverride = Number.isFinite(fieldOverrideValue)
  // R23.32 — slider value for the per-field row. When no override is
  // set, seed the slider at the GLOBAL value so the user can adjust
  // from a sensible starting point instead of jumping to MIN.
  const fieldPct = hasFieldOverride
    ? Math.round(sanitizeClampWarnThreshold(fieldOverrideValue) * 100)
    : globalPct
  // R24.40 — per-attractor slider. Seed at the per-field value (the
  // tier 2 fallback) so the user adjusts from whichever scale is
  // currently driving the meter for this field.
  const hasAttractorOverride = Number.isFinite(attractorOverrideValue)
  const attractorPct = hasAttractorOverride
    ? Math.round(sanitizeClampWarnThreshold(attractorOverrideValue) * 100)
    : fieldPct
  // Effective value driving the live meter — used for the header pip
  // colour so the user knows which slider is "active" right now.
  // Resolution mirrors resolveClampWarnThresholdFor (tier 1 → 2 → 3 → 4).
  const effectivePct = hasAttractorOverride ? attractorPct
                     : hasFieldOverride     ? fieldPct
                                            : globalPct
  // R24.40 — which TIER is driving the live meter? Drives the header
  // pip colour + scope text so users see at a glance whether they're
  // editing a per-attractor (violet), per-field (indigo), or global
  // (cyan) value.
  const activeTier = hasAttractorOverride ? 'attractor'
                   : hasFieldOverride     ? 'field'
                                          : 'global'
  const activePipColor = activeTier === 'attractor' ? '#c4b5fd'
                       : activeTier === 'field'     ? '#a5b4fc'
                                                    : '#67e8f9'
  // Escape key closes — paired with onClose so the user has a
  // keyboard-only path (the popover is small enough that mouse-out
  // would be too fiddly; explicit dismissal is friendlier).
  // R29.45 — multi-select mode for the per-cell preview chips (mobile-
  // friendly graduation of R28.45's single-tap-to-wipe). Long-press a
  // chip to ENTER multi-select; subsequent taps toggle chips in/out of
  // the selection; a "Clear N / Cancel" bar commits a bulk per-cell
  // wipe (parallels R17.17 attractor multi-select). Desktop users can
  // still single-tap to wipe one cell when NOT in multi-select mode.
  const [chipMultiSelect, setChipMultiSelect] = useState(false)
  const [selectedChipIds, setSelectedChipIds] = useState(() => new Set())
  // Long-press timer + the moved-too-far guard share these refs so a
  // scroll/drag doesn't fire the long-press (matches R18.06 snapshot
  // long-press semantics).
  const chipPressTimerRef = useRef(0)
  const chipPressFiredRef = useRef(false)
  const CHIP_LONG_PRESS_MS = 450
  // Reconcile the selection against the live override list: ids that
  // vanish externally (the cell got wiped by another path, or the
  // attractor was deleted) drop out of the selection so the "Clear N"
  // count never lies. Computed at render via useMemo-free derivation
  // since fieldOverridesAcross is already a cheap array.
  const liveChipIds = new Set(fieldOverridesAcross.map(c => c.id))
  const validSelectedChipIds = [...selectedChipIds].filter(id => liveChipIds.has(id))
  // Exit multi-select automatically when there are fewer than 2 chips
  // left to act on (the whole feature only makes sense with a list).
  useEffect(() => {
    if (chipMultiSelect && fieldOverridesAcross.length < 2) {
      setChipMultiSelect(false)
      setSelectedChipIds(new Set())
    }
  }, [chipMultiSelect, fieldOverridesAcross.length])
  const exitChipMultiSelect = () => {
    setChipMultiSelect(false)
    setSelectedChipIds(new Set())
  }
  const toggleChipSelected = (id) => {
    setSelectedChipIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  // R30.45 — "Select all / none" toggle for the multi-select bar
  // (parallels R17.17's attractor select-all). Wiping every cell for a
  // field shouldn't require N individual taps. When some-or-none are
  // selected, the toggle selects EVERY live chip; when all are already
  // selected, it clears back to none. allChipsSelected drives the label
  // + action so the single button covers both directions.
  const allChipsSelected = fieldOverridesAcross.length > 0
    && validSelectedChipIds.length === fieldOverridesAcross.length
  // R31.45 — tri-state of the selection so the toggle can render an
  // INDETERMINATE dash (some) distinct from an empty box (none) and a
  // check (all). validSelectedChipIds is the reconciled count (ids that
  // outlived their cells already dropped) so 'all' can't be faked.
  const chipSelectTriState = clampSelectAllTriState(validSelectedChipIds.length, fieldOverridesAcross.length)
  const toggleSelectAllChips = () => {
    setSelectedChipIds(allChipsSelected
      ? new Set()
      : new Set(fieldOverridesAcross.map(c => c.id)))
  }
  // Long-press lifecycle for a chip. On touchstart/mousedown, arm a
  // timer; if it fires before release (and the pointer didn't move far)
  // we ENTER multi-select with this chip pre-selected. The click
  // handler checks chipPressFiredRef to swallow the synthetic click so
  // the long-press doesn't ALSO wipe the cell.
  const startChipPress = (id) => {
    chipPressFiredRef.current = false
    if (chipPressTimerRef.current) clearTimeout(chipPressTimerRef.current)
    chipPressTimerRef.current = setTimeout(() => {
      chipPressFiredRef.current = true
      setChipMultiSelect(true)
      setSelectedChipIds(prev => {
        const next = new Set(prev)
        next.add(id)
        return next
      })
      try { navigator.vibrate?.(10) } catch { /* unsupported */ }
    }, CHIP_LONG_PRESS_MS)
  }
  const cancelChipPress = () => {
    if (chipPressTimerRef.current) { clearTimeout(chipPressTimerRef.current); chipPressTimerRef.current = 0 }
  }
  // One-shot consume of the long-press-fired flag (parallels
  // consumeGroupClickIfSuppressed). Reading a ref inside a named event-
  // handler helper keeps the read OUT of the render path so the React
  // Compiler's "no refs during render" rule stays happy — the inline
  // chip click handler calls this instead of touching .current directly.
  const consumeChipPressIfFired = () => {
    if (chipPressFiredRef.current) {
      chipPressFiredRef.current = false
      return true
    }
    return false
  }
  useEffect(() => () => { if (chipPressTimerRef.current) clearTimeout(chipPressTimerRef.current) }, [])
  // Commit the bulk wipe: clear every SELECTED cell via the existing
  // per-cell handler (delegates to setClampWarnAttractorFieldOverride
  // with value=null — same path R28.45 single-tap uses, so no new lib
  // surface). Then exit multi-select.
  const commitChipBulkClear = () => {
    if (typeof onClearAttractorCell === 'function') {
      for (const id of validSelectedChipIds) onClearAttractorCell(id)
    }
    exitChipMultiSelect()
  }
  // Escape key closes the popover (or exits multi-select first if it's
  // active, so a single Escape doesn't blow away the whole popover when
  // the user just wanted out of selection mode).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (chipMultiSelect) { exitChipMultiSelect(); return }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, chipMultiSelect])
  // R24.40 — show the per-attractor row only when we have a live
  // attractor id (every continuous attractor meter does, but the
  // back-compat path passes null/undefined for non-attractor meters).
  const showAttractorRow = typeof attractorId === 'string' && !!attractorId
  return (
    <>
      {/* Backdrop — captures click-outside so the popover dismisses
          when the user taps anywhere else. Transparent so the page
          stays visible behind it. */}
      <span
        onClick={(e) => { e.stopPropagation(); onClose() }}
        style={{
          position: 'fixed', inset: 0,
          background: 'transparent',
          zIndex: 100,
          cursor: 'default',
        }}
      />
      {/* Popover surface — anchored to the meter via the parent's
          position:relative. Width chosen so the slider has enough
          travel to feel responsive (~180px). R23.32 — widened to
          fit the per-field row underneath the global row.
          R24.40 — widened again to fit the per-(attractor, field)
          row below the per-field row. */}
      <span
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          minWidth: 280, maxWidth: 340,
          padding: '10px 12px',
          borderRadius: 7,
          background: 'rgba(15,15,25,0.96)',
          border: hasAttractorOverride
            ? '1px solid rgba(167,139,250,0.55)'   // violet — per-attractor active
            : hasFieldOverride
              ? '1px solid rgba(99,102,241,0.45)'  // indigo — per-field active
              : '1px solid rgba(34,211,238,0.35)', // cyan — global active
          boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
          zIndex: 101,
          color: '#e8e8f0',
          fontSize: 10,
          fontWeight: 500,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textTransform: 'none',
          letterSpacing: 'normal',
          display: 'block',
        }}
      >
        {/* R23.32 — scope header. Tells the user which attractor field
            this popover is scoped to so the per-field row makes sense.
            R24.40 — also surfaces the attractor name (when present)
            so the per-attractor row is unambiguous. */}
        <div style={{
          marginBottom: 8, paddingBottom: 6,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        }}>
          <span style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.10em',
            color: '#9a9ab0', textTransform: 'uppercase',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '60%',
          }} title={attractorLabel ? `${attractorLabel} \u00b7 ${fieldLabel || field}` : (fieldLabel || field)}>
            {fieldLabel || field}
          </span>
          <span style={{
            fontSize: 9, color: activePipColor,
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            fontWeight: 700,
          }} title={
            activeTier === 'attractor'
              ? `Per-attractor override on ${attractorLabel || attractorId} \u00b7 ${fieldLabel} (${effectivePct}%) drives this meter.`
              : activeTier === 'field'
                ? `Per-field override (${effectivePct}%) drives this meter; this attractor has no per-attractor override.`
                : `Global threshold (${effectivePct}%) drives this meter; no per-field or per-attractor override.`}>
            {'\u00b7'} {effectivePct}% {'\u00b7'}
          </span>
        </div>

        {/* GLOBAL slider — R22.27 baseline. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 4, gap: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            color: '#67e8f9', textTransform: 'uppercase',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>Global</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: globalAtDefault ? '#9a9ab0' : '#67e8f9',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>{globalPct}%</span>
        </div>
        <input
          type="range"
          min={minPct}
          max={maxPct}
          step={1}
          value={globalPct}
          onChange={(e) => onChangeGlobal(Number(e.target.value) / 100)}
          title={hasAttractorOverride
            ? `Sets the GLOBAL threshold. This meter currently uses the PER-ATTRACTOR slider below; the global only affects meters without a per-field or per-attractor override.`
            : hasFieldOverride
              ? `Sets the GLOBAL threshold (used by meters WITHOUT a per-field override). This field has its own override; the slider below takes priority.`
              : `Sets the threshold applied to every continuous-field meter without a per-field override. ${globalPct}%.`}
          style={{
            width: '100%',
            accentColor: '#22d3ee',
            cursor: 'pointer',
            opacity: (hasFieldOverride || hasAttractorOverride) ? 0.55 : 1,
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 2, marginBottom: 8, fontSize: 8.5,
          color: '#5a5a70',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        }}>
          <span>{minPct}%</span>
          <span>{maxPct}%</span>
        </div>

        {/* PER-FIELD slider — R23.32 graduates the global-only popover. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 4, gap: 8,
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            color: hasFieldOverride ? '#a5b4fc' : '#7a7a90', textTransform: 'uppercase',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }} title={hasFieldOverride
            ? `Per-field override active \u2014 this slider drives every ${fieldLabel} meter that doesn't have its own per-attractor override.`
            : `No override set. Drag to attach a per-field override; every ${fieldLabel} meter without a per-attractor override will read on this scale.`}>
            This field
            {hasFieldOverride && (
              <span style={{
                marginLeft: 4, fontSize: 8.5, color: '#a5b4fc',
              }}>{'\u2022'} active</span>
            )}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: hasFieldOverride ? '#a5b4fc' : '#7a7a90',
            fontFamily: 'Geist Mono, JetBrains Mono, monospace',
          }}>{fieldPct}%</span>
        </div>
        <input
          type="range"
          min={minPct}
          max={maxPct}
          step={1}
          value={fieldPct}
          onChange={(e) => onChangeField(Number(e.target.value) / 100)}
          title={hasAttractorOverride
            ? `Per-field override for ${fieldLabel} (${fieldPct}%). This meter currently uses the PER-ATTRACTOR slider below; the per-field slider only affects ${fieldLabel} meters on OTHER attractors that don't have their own override.`
            : hasFieldOverride
              ? `Per-field override for ${fieldLabel}. Currently ${fieldPct}%; the global threshold is ${globalPct}%.`
              : `Drag to attach a per-field override for ${fieldLabel}. Once set, this slider takes priority over the global threshold for every ${fieldLabel} meter without its own per-attractor override.`}
          style={{
            width: '100%',
            accentColor: '#a5b4fc',
            cursor: 'pointer',
            opacity: hasAttractorOverride ? 0.55 : 1,
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 2, fontSize: 8.5,
          color: '#5a5a70',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        }}>
          <span>{minPct}%</span>
          <span>{maxPct}%</span>
        </div>

        {/* R24.40 — PER-(attractor, field) slider. Only renders when we
            have an attractor id (every named-attractor meter passes
            one; back-compat call sites without one fall through to the
            R23.32 2-slider layout). */}
        {showAttractorRow && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 8, marginBottom: 4, gap: 8,
            }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                color: hasAttractorOverride ? '#c4b5fd' : '#7a7a90', textTransform: 'uppercase',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                maxWidth: '70%',
              }} title={hasAttractorOverride
                ? `Per-attractor override active \u2014 this slider ONLY affects the ${fieldLabel} meter on ${attractorLabel || attractorId}.`
                : `No override set. Drag to attach a per-attractor override for ${attractorLabel || attractorId}'s ${fieldLabel}; OTHER attractors' ${fieldLabel} meters stay on the per-field slider.`}>
                This attractor
                {attractorLabel && (
                  <span style={{
                    marginLeft: 4,
                    fontSize: 8.5, fontWeight: 600,
                    color: hasAttractorOverride ? '#c4b5fd' : '#5a5a70',
                    textTransform: 'none', letterSpacing: 'normal',
                  }}>({attractorLabel})</span>
                )}
                {hasAttractorOverride && (
                  <span style={{
                    marginLeft: 4, fontSize: 8.5, color: '#c4b5fd',
                  }}>{'\u2022'} active</span>
                )}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700,
                color: hasAttractorOverride ? '#c4b5fd' : '#7a7a90',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              }}>{attractorPct}%</span>
            </div>
            <input
              type="range"
              min={minPct}
              max={maxPct}
              step={1}
              value={attractorPct}
              onChange={(e) => onChangeAttractor(Number(e.target.value) / 100)}
              title={hasAttractorOverride
                ? `Per-attractor override for ${attractorLabel || attractorId} \u00b7 ${fieldLabel}. Currently ${attractorPct}%; the per-field threshold is ${fieldPct}%.`
                : `Drag to attach a per-attractor override for ${attractorLabel || attractorId}'s ${fieldLabel}. ONLY this attractor's ${fieldLabel} meter will read on this scale; every other attractor stays on the per-field slider.`}
              style={{
                width: '100%',
                accentColor: '#a78bfa',
                cursor: 'pointer',
              }}
            />
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginTop: 2, fontSize: 8.5,
              color: '#5a5a70',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            }}>
              <span>{minPct}%</span>
              <span>{maxPct}%</span>
            </div>
          </>
        )}

        <div style={{
          marginTop: 8, fontSize: 9.5, lineHeight: 1.45, color: '#a8a8b8',
        }}>
          Priority: <span style={{ color: '#c4b5fd', fontWeight: 700 }}>this attractor</span>
          {' '}{'\u203a'}{' '}<span style={{ color: '#a5b4fc', fontWeight: 700 }}>this field</span>
          {' '}{'\u203a'}{' '}<span style={{ color: '#67e8f9', fontWeight: 700 }}>global</span>.
          Pin one attractor's STRENGTH strict (rail = silent attractor) without
          touching every other attractor's STRENGTH meter.
        </div>
        {/* R27.45 — Inline preview chips listing the attractors that
            will be reset by the "STRENGTH all (M)" wipe button below.
            Renders only when 2+ cells will be wiped (matches the
            button's gating from R26.45 so chips never appear when the
            wipe button is hidden). Each chip shows attractor label +
            current per-attractor threshold so the user can sanity-check
            the scope ("am I sure I want to reset this 5% override on
            attr-bass?") before clicking. Click an individual chip to
            jump straight to clearing just THAT cell (delegates to the
            existing onClearAttractor which is per-(attractor, field)
            scoped — works for any attractor whose meter the user opens
            next). Chips paint in the field's accent (indigo) with a
            small "%" pip showing the threshold value. */}
        {fieldOverridesAcross.length >= 2 && (
          <div style={{
            marginTop: 8, padding: '6px 8px',
            borderRadius: 5,
            background: 'rgba(139,92,246,0.04)',
            border: '1px solid rgba(139,92,246,0.20)',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              fontSize: 8.5, fontWeight: 700, letterSpacing: '0.10em',
              color: '#8a8aa0', textTransform: 'uppercase',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              marginBottom: 4, gap: 6,
            }}>
              <span>
                {chipMultiSelect
                  ? `Select cells \u00b7 ${validSelectedChipIds.length} picked`
                  : `${fieldLabel} resets ${fieldOverridesAcross.length} attractor${fieldOverridesAcross.length === 1 ? '' : 's'}`}
              </span>
              {/* R29.45 — multi-select action bar. In select mode shows
                  Clear N + Cancel; out of mode shows a subtle hint that
                  long-press opens multi-select (only when a per-cell
                  wipe handler is wired). */}
              {chipMultiSelect ? (
                <span style={{ display: 'inline-flex', gap: 4, textTransform: 'none', letterSpacing: 0 }}>
                  {/* R30.45 — Select all / none toggle. One button covers
                      both directions (label flips on allChipsSelected) so
                      wiping every cell for a field is a single tap rather
                      than N. Parallels R17.17's attractor select-all.
                      R31.45 — tri-state indicator box: empty (none),
                      indeterminate dash (some — a hand-picked subset),
                      check (all). 'some' no longer looks identical to
                      'none'; the dash + amber accent flag a partial
                      selection at a glance. */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleSelectAllChips() }}
                    disabled={fieldOverridesAcross.length === 0}
                    title={chipSelectTriState === 'all'
                      ? 'All cells selected. Click to deselect every cell.'
                      : chipSelectTriState === 'some'
                        ? `${validSelectedChipIds.length} of ${fieldOverridesAcross.length} ${fieldLabel} cells selected. Click to select all.`
                        : `Select all ${fieldOverridesAcross.length} ${fieldLabel} cells at once.`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                      cursor: fieldOverridesAcross.length === 0 ? 'not-allowed' : 'pointer',
                      background: chipSelectTriState === 'all'
                        ? 'rgba(99,102,241,0.18)'
                        : chipSelectTriState === 'some'
                          ? 'rgba(245,158,11,0.14)'
                          : 'rgba(255,255,255,0.05)',
                      color: chipSelectTriState === 'all'
                        ? '#c7d2fe'
                        : chipSelectTriState === 'some'
                          ? '#fcd34d'
                          : '#a8a8b8',
                      border: chipSelectTriState === 'all'
                        ? '1px solid rgba(99,102,241,0.42)'
                        : chipSelectTriState === 'some'
                          ? '1px solid rgba(245,158,11,0.40)'
                          : '1px solid rgba(255,255,255,0.10)',
                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    }}
                  >
                    {/* Tri-state indicator glyph box. */}
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 10, height: 10, borderRadius: 2,
                        fontSize: 9, lineHeight: 1, fontWeight: 800,
                        background: chipSelectTriState === 'all'
                          ? '#6366f1'
                          : chipSelectTriState === 'some'
                            ? 'rgba(245,158,11,0.30)'
                            : 'transparent',
                        border: chipSelectTriState === 'none'
                          ? '1px solid rgba(255,255,255,0.30)'
                          : chipSelectTriState === 'some'
                            ? '1px solid rgba(245,158,11,0.55)'
                            : '1px solid #6366f1',
                        color: chipSelectTriState === 'all' ? '#fff' : '#fcd34d',
                      }}>
                      {chipSelectTriState === 'all' ? '\u2713' : chipSelectTriState === 'some' ? '\u2013' : ''}
                    </span>
                    <span>{chipSelectTriState === 'all' ? 'None' : 'All'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); commitChipBulkClear() }}
                    disabled={validSelectedChipIds.length === 0}
                    title={`Clear ${validSelectedChipIds.length} selected ${fieldLabel} cell${validSelectedChipIds.length === 1 ? '' : 's'} in one action.`}
                    style={{
                      padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                      cursor: validSelectedChipIds.length === 0 ? 'not-allowed' : 'pointer',
                      background: validSelectedChipIds.length === 0 ? 'rgba(255,255,255,0.04)' : 'rgba(239,68,68,0.18)',
                      color: validSelectedChipIds.length === 0 ? '#5a5a70' : '#fca5a5',
                      border: validSelectedChipIds.length === 0 ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(239,68,68,0.42)',
                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                      opacity: validSelectedChipIds.length === 0 ? 0.6 : 1,
                    }}
                  >Clear {validSelectedChipIds.length}</button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); exitChipMultiSelect() }}
                    title="Exit multi-select without clearing anything."
                    style={{
                      padding: '1px 7px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.05)', color: '#a8a8b8',
                      border: '1px solid rgba(255,255,255,0.10)',
                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    }}
                  >Cancel</button>
                </span>
              ) : (typeof onClearAttractorCell === 'function' && fieldOverridesAcross.length >= 2 && (
                <span style={{
                  textTransform: 'none', letterSpacing: 0, fontWeight: 500,
                  color: '#5a5a70', fontSize: 8,
                }} title="Long-press a chip to select several, then clear them together.">
                  hold to multi-select
                </span>
              ))}
            </div>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              maxHeight: 64, overflowY: 'auto',
            }}>
              {/* eslint-disable-next-line react-hooks/refs -- the chip
                  click handler reads chipPressFiredRef at CLICK time (an
                  event handler, not render) to swallow the synthetic
                  click that follows a long-press; the read is correct
                  but the compiler conservatively flags the captured ref
                  inside this memoized .map closure (same pattern as
                  consumeGroupClickIfSuppressed, which is unflagged only
                  because it sits outside a .map). */}
              {fieldOverridesAcross.map(({ id, value }) => {
                // Label resolution: live attractor wins; stale (deleted
                // attractor still has persisted override) falls back to
                // a truncated id so users can still identify the cell.
                const liveAttr = (namedAttractors || []).find(a => a && a.id === id)
                const label = liveAttr && liveAttr.name
                  ? liveAttr.name
                  : (id.length > 12 ? `${id.slice(0, 9)}\u2026` : id)
                const pct = Math.round(value * 100)
                const isStale = !liveAttr
                const isCurrent = id === attractorId
                const cellActionable = typeof onClearAttractorCell === 'function'
                const isSelected = chipMultiSelect && selectedChipIds.has(id)
                // R28.45 / R29.45 — click behaviour depends on mode:
                //   - multi-select mode: tap TOGGLES this chip's
                //     membership in the selection set (no wipe yet).
                //   - normal mode: tap wipes JUST this cell (R28.45).
                // Either way the long-press handlers below can flip into
                // multi-select. chipPressFiredRef swallows the synthetic
                // click that fires after a long-press so the hold doesn't
                // ALSO wipe / toggle.
                const handleClick = cellActionable
                  ? (e) => {
                    e.stopPropagation()  // don't bubble to outer click handlers
                    if (consumeChipPressIfFired()) return
                    if (chipMultiSelect) { toggleChipSelected(id); return }
                    onClearAttractorCell(id)
                  }
                  : undefined
                const clickable = !!handleClick
                const pressHandlers = cellActionable ? {
                  onMouseDown: () => startChipPress(id),
                  onMouseUp: cancelChipPress,
                  onMouseLeave: cancelChipPress,
                  onTouchStart: () => startChipPress(id),
                  onTouchEnd: cancelChipPress,
                  onTouchMove: cancelChipPress,
                  onTouchCancel: cancelChipPress,
                } : {}
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={handleClick}
                    disabled={!clickable}
                    {...pressHandlers}
                    title={isStale
                      ? `${id} (stale \u2014 attractor deleted) currently at ${pct}% \u2014 ${chipMultiSelect ? 'tap to select' : 'click to wipe (hold to multi-select)'}`
                      : clickable
                        ? `${liveAttr.name} (id=${id}) currently at ${pct}% \u2014 ${chipMultiSelect ? 'tap to select/deselect' : 'click to clear THIS cell only (hold to multi-select)'}`
                        : `${liveAttr.name} (id=${id}) currently at ${pct}% \u2014 will reset to per-field threshold`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      padding: '2px 6px', borderRadius: 4,
                      fontSize: 9.5, fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                      background: isSelected
                        ? 'rgba(239,68,68,0.18)'
                        : isCurrent
                          ? 'rgba(196,181,253,0.20)'
                          : isStale
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(99,102,241,0.10)',
                      color: isSelected ? '#fca5a5' : isCurrent ? '#ddd6fe' : isStale ? '#7a7a90' : '#c7d2fe',
                      border: isSelected
                        ? '1px solid rgba(239,68,68,0.55)'
                        : isCurrent
                          ? '1px solid rgba(167,139,250,0.55)'
                          : isStale
                            ? '1px solid rgba(255,255,255,0.06)'
                            : '1px solid rgba(99,102,241,0.25)',
                      fontStyle: isStale ? 'italic' : 'normal',
                      cursor: clickable ? 'pointer' : 'default',
                      // R29.45 — block the native long-press callout +
                      // text-selection on mobile so the hold reads as a
                      // gesture, not a copy action.
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                      touchAction: 'manipulation',
                      // Reset native button styling so the chip matches
                      // the span baseline visually.
                      font: 'inherit',
                      lineHeight: 'normal',
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      appearance: 'none',
                      // Subtle hover affordance on the chip — slight
                      // background lift signals interactivity without
                      // crowding the panel.
                      transition: 'background 0.12s ease-out, border-color 0.12s ease-out',
                    }}
                    onMouseEnter={clickable ? (e) => {
                      // Indigo lift on hover (matches the per-field
                      // chip palette so the eye groups it with the
                      // surrounding row). Selected chips keep their red
                      // fill so the hover doesn't mask the selection.
                      if (isSelected) return
                      e.currentTarget.style.background = isCurrent
                        ? 'rgba(196,181,253,0.30)'
                        : 'rgba(99,102,241,0.18)'
                    } : undefined}
                    onMouseLeave={clickable ? (e) => {
                      // Also cancel any armed long-press (mouse left the
                      // chip mid-hold). Selected chips restore their red
                      // fill rather than the indigo/idle baseline.
                      cancelChipPress()
                      e.currentTarget.style.background = isSelected
                        ? 'rgba(239,68,68,0.18)'
                        : isCurrent
                          ? 'rgba(196,181,253,0.20)'
                          : isStale
                            ? 'rgba(255,255,255,0.04)'
                            : 'rgba(99,102,241,0.10)'
                    } : undefined}
                  >
                    {/* Tiny dot prefix in the type accent — same colour
                        as the attractor's row badge so the chip ties
                        back to the named-attractor list visually. */}
                    {liveAttr && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: attractorTypeStyle(liveAttr.type).fg,
                        display: 'inline-block', flexShrink: 0,
                      }} />
                    )}
                    <span style={{
                      maxWidth: 80,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{label}</span>
                    <span style={{
                      fontSize: 8.5, padding: '0 3px', borderRadius: 2,
                      background: 'rgba(0,0,0,0.32)',
                      color: isCurrent ? '#c4b5fd' : '#a5b4fc',
                      fontWeight: 700,
                    }}>{pct}%</span>
                    {/* R28.45 / R29.45 — trailing glyph adapts to mode:
                        normal = wipe hint (x); multi-select selected =
                        filled check; multi-select unselected = hollow
                        ring. Renders only when clickable (back-compat:
                        read-only callers see no affordance). */}
                    {clickable && (
                      <span aria-hidden="true" style={{
                        fontSize: 9, color: isSelected ? '#fca5a5' : '#5a5a70',
                        marginLeft: 1, lineHeight: 1, fontWeight: isSelected ? 700 : 400,
                      }}>{chipMultiSelect ? (isSelected ? '\u2713' : '\u25cb') : '\u00d7'}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap',
          marginTop: 10, paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}>
          {/* R24.40 — clears THIS attractor's per-field override. Disabled
              when no per-attractor override exists. */}
          {showAttractorRow && (
            <button
              onClick={() => { onClearAttractor() }}
              disabled={!hasAttractorOverride}
              title={hasAttractorOverride
                ? `Clear this attractor's override; ${attractorLabel || attractorId} \u00b7 ${fieldLabel} will fall back to the per-field threshold (${fieldPct}%).`
                : 'No per-attractor override to clear'}
              style={{
                padding: '3px 9px', borderRadius: 4,
                fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                background: hasAttractorOverride ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.04)',
                color: hasAttractorOverride ? '#ddd6fe' : '#5a5a70',
                border: hasAttractorOverride
                  ? '1px solid rgba(167,139,250,0.40)'
                  : '1px solid rgba(255,255,255,0.05)',
                cursor: hasAttractorOverride ? 'pointer' : 'not-allowed',
                textTransform: 'uppercase',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                opacity: hasAttractorOverride ? 1 : 0.55,
              }}
            >Clear attr.</button>
          )}
          {/* R25.45 — bulk-clear EVERY per-(attractor, field) override
              for the current attractor in one click. Disabled when the
              attractor has 0 or 1 overrides (1 = the same as "Clear attr."
              for the current field). The count is surfaced so the user
              knows exactly how many cells they're about to wipe. */}
          {showAttractorRow && attractorOverrideCount >= 2 && (
            <button
              onClick={() => {
                if (typeof onClearAllForAttractor === 'function') onClearAllForAttractor()
              }}
              title={`Clear all ${attractorOverrideCount} per-field overrides for ${attractorLabel || attractorId}; every field on this attractor falls back to the per-field threshold.`}
              style={{
                padding: '3px 9px', borderRadius: 4,
                fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                background: 'rgba(196,181,253,0.16)',
                color: '#ddd6fe',
                border: '1px solid rgba(167,139,250,0.50)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>Clear all</span>
              <span style={{
                fontSize: 8.5, padding: '0 4px', borderRadius: 3,
                background: 'rgba(0,0,0,0.32)', color: '#c4b5fd',
                border: '1px solid rgba(167,139,250,0.45)',
                fontWeight: 700,
              }}>{attractorOverrideCount}</span>
            </button>
          )}
          {/* R26.45 — bulk-clear THIS field across every attractor.
              Companion to R25.45 (per-attractor wipe) with the AXIS
              transposed: instead of "wipe every field for this
              attractor", this wipes "every attractor's override for
              this field". Only renders when at least 2 attractors
              have a per-attractor override for this field (1 would
              just be the same as "Clear attr." on the current row,
              redundant — same threshold as R25.45 uses for symmetry).
              Distinct VIOLET-DEEP tint vs R25.45's pale violet so the
              two adjacent buttons read as distinct at a glance. */}
          {fieldOverrideCountAcross >= 2 && (
            <button
              onClick={() => {
                if (typeof onClearAllForField === 'function') onClearAllForField()
              }}
              title={`Clear ${fieldLabel} per-attractor overrides on every attractor that has one (${fieldOverrideCountAcross} attractor${fieldOverrideCountAcross === 1 ? '' : 's'}); every ${fieldLabel} meter falls back to the per-field threshold (${fieldPct}%).`}
              style={{
                padding: '3px 9px', borderRadius: 4,
                fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
                background: 'rgba(139,92,246,0.18)',
                color: '#ddd6fe',
                border: '1px solid rgba(139,92,246,0.55)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span>{fieldLabel} all</span>
              <span style={{
                fontSize: 8.5, padding: '0 4px', borderRadius: 3,
                background: 'rgba(0,0,0,0.32)', color: '#c4b5fd',
                border: '1px solid rgba(139,92,246,0.45)',
                fontWeight: 700,
              }}>{fieldOverrideCountAcross}</span>
            </button>
          )}
          {/* R23.32 — "Use global" clears this field's override so it
              falls back to the global threshold. Disabled when no
              override is set (nothing to clear). */}
          <button
            onClick={() => { onClearField() }}
            disabled={!hasFieldOverride}
            title={hasFieldOverride
              ? `Clear this field's override; every ${fieldLabel} meter without its own per-attractor override will read on the global threshold (${globalPct}%) again.`
              : 'No per-field override to clear'}
            style={{
              padding: '3px 9px', borderRadius: 4,
              fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
              background: hasFieldOverride ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
              color: hasFieldOverride ? '#c7d2fe' : '#5a5a70',
              border: hasFieldOverride
                ? '1px solid rgba(99,102,241,0.32)'
                : '1px solid rgba(255,255,255,0.05)',
              cursor: hasFieldOverride ? 'pointer' : 'not-allowed',
              textTransform: 'uppercase',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              opacity: hasFieldOverride ? 1 : 0.55,
            }}
          >Use global</button>
          {/* R22.27 — Reset GLOBAL to shipped default. Disabled when
              already at default. R23.32 — relabelled "Reset global" so
              the user knows which slider it targets. */}
          <button
            onClick={() => { onResetGlobal() }}
            disabled={globalAtDefault}
            title={globalAtDefault ? 'Already at the shipped default' : `Reset GLOBAL to ${defPct}% (this field's and this attractor's overrides stay as-is)`}
            style={{
              padding: '3px 9px', borderRadius: 4,
              fontSize: 9.5, fontWeight: 600, letterSpacing: '0.04em',
              background: globalAtDefault ? 'rgba(255,255,255,0.04)' : 'rgba(239,68,68,0.10)',
              color: globalAtDefault ? '#5a5a70' : '#fca5a5',
              border: globalAtDefault
                ? '1px solid rgba(255,255,255,0.05)'
                : '1px solid rgba(239,68,68,0.30)',
              cursor: globalAtDefault ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              opacity: globalAtDefault ? 0.55 : 1,
            }}
          >Reset global</button>
          <button
            onClick={onClose}
            style={{
              padding: '3px 11px', borderRadius: 4,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
              background: 'linear-gradient(135deg, rgba(34,211,238,0.30), rgba(99,102,241,0.22))',
              color: '#e0f2fe',
              border: '1px solid rgba(34,211,238,0.45)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
            }}
          >Done</button>
        </div>
      </span>
    </>
  )
}
