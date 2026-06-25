import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'
import {
  recaptureThumbnail, clearAllThumbnails, summarizeBulkRebuild,
  // R19.13 — per-thumb metadata side-store powers the hover badge
  readThumbMetadata, summarizeThumbAge,
  // R20.19 — rich-detail formatter for the click-to-expand panel
  formatThumbDetails,
  // R21.24 — Clear action inside the detail panel
  clearThumbnail,
  // R22.29 — per-thumb user note
  setThumbNote, THUMB_NOTE_MAX_LEN,
  // R23.34 — note filter: count-only summary still used for the global
  // "tagged tiles" badge (mode-independent — counts every note,
  // doesn't run any matcher).
  summarizeNoteFilter,
  // R24.37 — regex mode toggle (graduates R23.34's substring-only matcher)
  NOTE_FILTER_MODE_SUBSTRING, NOTE_FILTER_MODE_REGEX,
  isValidNoteFilterMode, isValidQueryForMode,
  presetsMatchingNoteWithMode, summarizeNoteFilterWithMode,
  // R25.42 — recent-patterns history dropdown
  loadNoteFilterHistory, saveNoteFilterHistory,
  addNoteFilterHistoryEntry, removeNoteFilterHistoryEntry,
  clearNoteFilterHistory,
  // R26.42 — pin entries to the top of the dropdown (graduates R25.42)
  togglePinNoteFilterHistoryEntry, sortNoteFilterHistoryForDisplay,
  // R27.42 — bulk-unpin footer button when 2+ entries are pinned
  countPinnedNoteFilterHistoryEntries, bulkUnpinNoteFilterHistoryEntries,
  // R28.42 — Undo restore action for the bulk-unpin toast.
  // snapshot... captures the (query, mode) keys of every pinned entry
  // BEFORE the wipe; restore... re-pins those entries against whatever
  // list is live when the user clicks Undo (so concurrent edits between
  // unpin + restore compose safely).
  snapshotPinnedNoteFilterHistoryKeys, restorePinnedNoteFilterHistoryEntries,
  // R29.42 — multi-level undo CHAIN across rapid successive bulk-unpins
  // (parallels R23.35 hotkey chain). Stack of unpin frames; window-gated
  // chaining; pop+restore steps back one level per Undo click.
  pushBulkUnpinChainFrame, popBulkUnpinChainFrame, formatBulkUnpinChainBadge,
} from '../lib/presetThumbnails'
import { showToast } from './Toast'

export default function PresetCarousel() {
  const { loadPreset, currentPreset, favoritedPresets, recentPresets, toggleFavorite } = useStore()
  const [thumbs, setThumbs] = useState({})
  // R19.13 — per-preset metadata cache (capturedAt + width/height +
  // source). Refreshed alongside thumbs whenever a particle:thumbnail-
  // ready event fires so the badge reflects the freshest cache state.
  const [meta, setMeta] = useState({})
  // R20.19 — which tile's metadata detail panel is currently open.
  // Toggles via badge click. Auto-closes on Escape, on outside-click,
  // and when the tile's metadata is wiped (rebuild / bulk-clear).
  const [detailId, setDetailId] = useState(null)
  // Tri-state filter: 'all' | 'favs' | 'recent'.
  const [filter, setFilter] = useState('all')
  // R23.34 — note-search query. When non-empty, intersects the
  // category-filtered list with presetsMatchingNote so a user can
  // surface every tile tagged e.g. "demo" in one step. Empty/null
  // query is a no-op so the carousel stays exactly as it was without
  // the search affordance touched. Kept as plain state (not a ref)
  // because tile list filters off it during render.
  const [noteQuery, setNoteQuery] = useState('')
  const [noteFilterOpen, setNoteFilterOpen] = useState(false)
  // R24.37 — note filter MODE: 'substring' (default, R23.34 baseline)
  // or 'regex' (power-user pattern matching with anchors / wildcards /
  // alternation / character classes). Persisted so a regex-loving user
  // doesn't have to flip the toggle every session. Sanitised on load
  // through isValidNoteFilterMode so a corrupt value can't crash the
  // matcher.
  const [noteFilterMode, setNoteFilterMode] = useState(() => {
    try {
      if (typeof localStorage === 'undefined') return NOTE_FILTER_MODE_SUBSTRING
      const raw = localStorage.getItem('preset-note-filter-mode-v1')
      return isValidNoteFilterMode(raw) ? raw : NOTE_FILTER_MODE_SUBSTRING
    } catch { return NOTE_FILTER_MODE_SUBSTRING }
  })
  // R25.42 — recent-patterns history (MRU-ordered, capped). Loaded on
  // mount; saved on every change via saveNoteFilterHistory. Sanitised
  // on read + write so persisted corrupt JSON / hand-edited values
  // can't crash the panel.
  const [noteFilterHistory, setNoteFilterHistory] = useState(() => loadNoteFilterHistory())
  // Dropdown open state. Auto-closes on Escape / outside-click /
  // history-pick. Kept separate from the input's open state so a user
  // can open the search input without immediately seeing the history
  // (especially when the input has a draft query — the dropdown is
  // about RECENT, not CURRENT).
  const [historyOpen, setHistoryOpen] = useState(false)
  // R29.42 — multi-level bulk-unpin undo chain stack. A ref (not state)
  // because it's read/written from event handlers + toast closures and
  // never drives a render directly; the toast's own Undo chip carries
  // the visible chain depth. Each frame is { keys, at }; the pure
  // pushBulkUnpinChainFrame helper handles window-gated chaining + the
  // FIFO cap. Survives toast dismissals so a user mid-cleanup can keep
  // stepping back.
  const bulkUnpinChainRef = useRef([])
  // R30.42 — mirror the chain DEPTH into render state so the dropdown's
  // Unpin footer button can show a persistent "x2 / x3" pip (the toast
  // badge from R29.42 vanishes after 2.4s; the pip on the button lets a
  // user mid-cleanup still see how many undo levels are banked). The ref
  // stays the source of truth for the handlers; this just shadows its
  // length for the render path. Updated through setBulkUnpinChain so the
  // two never drift.
  const [bulkUnpinChainDepth, setBulkUnpinChainDepth] = useState(0)
  const setBulkUnpinChain = (next) => {
    bulkUnpinChainRef.current = next
    setBulkUnpinChainDepth(Array.isArray(next) ? next.length : 0)
  }
  // Save the history to localStorage with the ref-equal-on-no-op
  // contract preserved from the lib (no redundant writes when nothing
  // changed).
  const persistNoteFilterHistory = (next) => {
    if (next === noteFilterHistory) return   // no-op
    setNoteFilterHistory(next)
    saveNoteFilterHistory(next)
  }
  // Commit current (query, mode) to history. Called from the Enter-
  // dismiss path (user signalled intent) and from the X-close path
  // when the query is non-empty (user reviewed the filter before
  // closing). Empty query is a no-op.
  const commitToHistory = () => {
    const raw = typeof noteQuery === 'string' ? noteQuery : ''
    if (!raw.trim()) return
    const next = addNoteFilterHistoryEntry(noteFilterHistory, raw, noteFilterMode)
    persistNoteFilterHistory(next)
  }
  // Apply a history entry to the live filter — sets query + mode, closes
  // the dropdown. Bumps the entry to the head of the MRU so re-using a
  // pattern keeps it sticky.
  const applyHistoryEntry = (entry) => {
    if (!entry || typeof entry.query !== 'string') return
    setNoteQuery(entry.query)
    if (isValidNoteFilterMode(entry.mode) && entry.mode !== noteFilterMode) {
      setNoteFilterMode(entry.mode)
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('preset-note-filter-mode-v1', entry.mode)
        }
      } catch { /* quota */ }
    }
    setHistoryOpen(false)
    // Bump to head (MRU). Same query + mode -> already-head -> ref-equal no-op.
    const bumped = addNoteFilterHistoryEntry(noteFilterHistory, entry.query, entry.mode)
    persistNoteFilterHistory(bumped)
  }
  // Remove one entry from history (X button on hover).
  const removeHistoryEntry = (entry) => {
    if (!entry) return
    const next = removeNoteFilterHistoryEntry(noteFilterHistory, entry.query, entry.mode)
    persistNoteFilterHistory(next)
  }
  // R26.42 — toggle pin flag on one history entry. Right-click the row
  // OR the star glyph to pin/unpin. Pinned entries sort first via
  // sortNoteFilterHistoryForDisplay so they stay accessible across
  // many subsequent searches without being lost to the FIFO cap.
  const togglePinHistoryEntry = (entry) => {
    if (!entry) return
    const next = togglePinNoteFilterHistoryEntry(noteFilterHistory, entry.query, entry.mode)
    persistNoteFilterHistory(next)
  }
  // Wipe the whole history (footer button).
  const clearHistory = () => {
    persistNoteFilterHistory(clearNoteFilterHistory())
    setHistoryOpen(false)
  }
  // R27.42 — bulk-unpin every pinned entry in one click. The lib helper
  // returns input ref unchanged when nothing is pinned (no-op), so the
  // persist call is a true no-op when the user spam-clicks an empty
  // surface. We keep the dropdown open after the wipe so the user can
  // see the visual confirmation (every star flips back to hollow).
  //
  // R28.42 — Toast with an Undo action chip lets the user revert a
  // misclick without losing hours of pin tagging. Pattern parallels
  // MidiPanel's R22.30 hotkey-transfer undo chip:
  //   1. Snapshot the pinned KEYS (not the whole list) BEFORE the wipe.
  //   2. Run the wipe + persist as before.
  //   3. Surface a toast with an Undo button whose onClick restores
  //      the snapshot against whatever list is live at click-time.
  // The snapshot is minimal (just query+mode) so concurrent edits
  // between unpin + restore compose safely. restorePinned... has a
  // ref-equal-on-no-op guard so an Undo on a list that no longer
  // contains any of the snapshotted entries is a graceful zero-cost
  // no-op (e.g. the user deleted every restored entry already).
  const bulkUnpinHistory = () => {
    // Snapshot BEFORE we wipe so we can re-pin on Undo. We capture
    // from the LIVE state value (not the staged 'next') because the
    // snapshot's job is to remember what was pinned PRE-wipe.
    const pinnedKeys = snapshotPinnedNoteFilterHistoryKeys(noteFilterHistory)
    const next = bulkUnpinNoteFilterHistoryEntries(noteFilterHistory)
    if (next === noteFilterHistory) return
    persistNoteFilterHistory(next)
    // No toast if somehow the snapshot is empty (shouldn't happen —
    // the button only renders when >= 2 entries pinned). Defensive
    // skip keeps the surface tidy.
    if (pinnedKeys.length === 0) return
    // R29.42 — push this unpin onto the chain stack. Window-gated: an
    // unpin within BULK_UNPIN_CHAIN_MS of the previous one CHAINS (so
    // two cleanup sweeps stack into a 2-level undo); a settled chain
    // resets to a single frame. The pure helper owns the windowing +
    // FIFO cap. setBulkUnpinChain updates both the ref (source of truth
    // for handlers) and the depth state (R30.42 footer pip) atomically.
    setBulkUnpinChain(pushBulkUnpinChainFrame(
      bulkUnpinChainRef.current, pinnedKeys, Date.now(),
    ))
    showBulkUnpinToast()
  }
  // R29.42 — render the bulk-unpin toast for the CURRENT chain depth.
  // Factored out of bulkUnpinHistory so the Undo handler can re-surface
  // it after popping a level (so a 3-deep chain shows x3 -> x2 -> plain
  // as the user steps back). Each Undo pops the top frame, restores its
  // keys against the live history, then re-shows the toast for whatever
  // depth remains (or stays silent when the chain empties).
  const showBulkUnpinToast = () => {
    const stack = bulkUnpinChainRef.current
    const top = stack[stack.length - 1]
    if (!top) return
    const undoUnpin = () => {
      // Pop the most-recent frame; restore ITS keys (not the whole
      // chain). The remaining stack stays so the next Undo steps back
      // another level.
      const { frame, rest } = popBulkUnpinChainFrame(bulkUnpinChainRef.current)
      setBulkUnpinChain(rest)
      if (!frame) return
      // Functional read: compute restoration against the LIVE history
      // (may have changed via concurrent edits between unpin + undo —
      // adds, removes, individual pins). restorePinned... is ref-equal-
      // on-no-op so this is cheap when nothing's actually different.
      setNoteFilterHistory(curr => {
        const restored = restorePinnedNoteFilterHistoryEntries(curr, frame.keys)
        if (restored === curr) return curr
        // Persist outside React's setState so the storage write is
        // tied to the actual state transition (parallels every other
        // persist call in this component).
        try { saveNoteFilterHistory(restored) } catch { /* quota */ }
        return restored
      })
      // Re-surface the toast for the remaining chain depth so the user
      // sees the next level is still undoable (x2 -> plain Undo, etc.).
      if (bulkUnpinChainRef.current.length > 0) showBulkUnpinToast()
    }
    // R29.42 — depth badge ("x2", "x3", ...) only when 2+ frames are
    // stacked. Single-level undo keeps the plain chip (no badge) so the
    // common case looks exactly like R28.42.
    const badge = formatBulkUnpinChainBadge(stack)
    showToast(
      `Unpinned ${top.keys.length} pattern${top.keys.length === 1 ? '' : 's'}`,
      // Unicode pin glyph (monochrome star to match the R26.42 star
      // aesthetic — lucide 1.8 doesn't ship Pin). Icon span is wrapped
      // by Toast.jsx.
      <span style={{ fontSize: 11, color: '#fbbf24', fontWeight: 700 }}>{'\u2605'}</span>,
      { label: 'Undo', onClick: undoUnpin },
      badge ? { text: badge.text, color: '#fbbf24', title: `${badge.count} bulk-unpins chained — Undo steps back one level at a time.` } : undefined,
    )
  }
  // Close dropdown when input collapses entirely.
  useEffect(() => {
    if (!noteFilterOpen) setHistoryOpen(false)
  }, [noteFilterOpen])
  // Atomic mode-toggle: flip + persist + close the popover. Wrapped here
  // so the chip click + keyboard shortcut share the same code path.
  const toggleNoteFilterMode = () => {
    const next = noteFilterMode === NOTE_FILTER_MODE_REGEX
      ? NOTE_FILTER_MODE_SUBSTRING
      : NOTE_FILTER_MODE_REGEX
    setNoteFilterMode(next)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('preset-note-filter-mode-v1', next)
      }
    } catch { /* quota / private mode */ }
  }
  // Track which preset just had its thumb rebuilt — used to animate the
  // refresh icon for a moment so the user gets feedback the click landed.
  const [busyId, setBusyId] = useState(null)
  // While the bulk rebuild is wiping + the prerenderer is repopulating,
  // surface a compact "rebuilding..." state on the filter button.
  const [bulkBusy, setBulkBusy] = useState(false)

  // Load thumbnails from localStorage. Also listens for the
  // 'particle:thumbnail-ready' event the prerenderer fires so
  // freshly-generated thumbs appear without waiting for the user
  // to switch presets.
  useEffect(() => {
    const refresh = () => {
      const t = {}
      const m = {}
      presets.forEach(p => {
        const d = localStorage.getItem(`preset-thumb-${p.id}`)
        if (d) {
          t[p.id] = d
          // R19.13 — keep the metadata cache in lockstep with the thumb
          // cache so the hover badge never points at a thumb that's
          // been wiped (or vice versa). readThumbMetadata returns
          // null on missing/corrupt entries, which the badge UI
          // handles gracefully.
          const md = readThumbMetadata(p.id)
          if (md) m[p.id] = md
        }
      })
      setThumbs(t)
      setMeta(m)
    }
    refresh()
    window.addEventListener('particle:thumbnail-ready', refresh)
    return () => window.removeEventListener('particle:thumbnail-ready', refresh)
  }, [currentPreset])

  // R20.19 — Escape closes the detail panel; outside-click handler
  // lives on the panel itself (stopPropagation on clicks INSIDE it).
  // Bulk-clear / rebuild-this-thumb listeners drop the open detail
  // automatically so a wiped tile doesn't keep a stale panel open.
  useEffect(() => {
    if (!detailId) return
    const onKey = (e) => { if (e.key === 'Escape') setDetailId(null) }
    const onBulk = () => setDetailId(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('particle:thumbnail-bulk-cleared', onBulk)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('particle:thumbnail-bulk-cleared', onBulk)
    }
  }, [detailId])

  // Rebuild exactly one preset's thumbnail on demand. Fires the same
  // particle:thumbnail-ready event the prerenderer uses so the in-memory
  // thumb map refreshes; bumps a short-lived busyId so the icon spins.
  const rebuildThumb = (preset) => {
    setBusyId(preset.id)
    // Defer the heavy compile + render to the next macrotask so the
    // busy-state paint lands before we block the main thread.
    setTimeout(() => {
      const ok = recaptureThumbnail(preset)
      if (ok) {
        try { window.dispatchEvent(new CustomEvent('particle:thumbnail-ready', { detail: { id: preset.id } })) }
        catch { /* CustomEvent unsupported on ancient browsers */ }
      }
      setBusyId(null)
    }, 16)
  }

  // Bulk "rebuild all stale thumbs": confirm, wipe every cached entry,
  // and let the existing PresetThumbnailPrerenderer + live-capture path
  // repopulate during idle frames. We DON'T re-render synchronously
  // here because compiling 46 presets back-to-back on the main thread
  // would jank the UI for ~3-5s. Wiping is O(N) and the prerenderer's
  // requestIdleCallback cadence is invisible to the user.
  //
  // bulkBusy stays true until the prerenderer fires `particle:
  // thumbnail-ready` at least once or 12s pass — either way the user
  // sees their carousel refilling tile-by-tile so the "rebuilding"
  // label feels honest.
  const rebuildAllThumbs = () => {
    const summary = summarizeBulkRebuild(presets)
    if (summary.withThumb === 0) return  // nothing to clear
    const ok = window.confirm(
      `Rebuild all ${summary.withThumb} cached thumbnails?\n\n`
      + `Stale thumbs will be wiped and re-rendered in the background `
      + `as the carousel refreshes. This is safe to cancel at any time.`,
    )
    if (!ok) return
    const cleared = clearAllThumbnails(presets)
    // Refresh the in-memory map immediately so the placeholder emoji
    // tiles return for everything — visually confirms the wipe landed.
    setThumbs({})
    setBulkBusy(true)
    // The prerenderer already listens for its own cadence; just emit
    // a sentinel event so any other listener can re-sync immediately.
    try { window.dispatchEvent(new CustomEvent('particle:thumbnail-bulk-cleared', { detail: { cleared } })) }
    catch { /* CustomEvent unsupported on ancient browsers */ }
    // Auto-clear the bulkBusy state once the prerenderer drips in
    // the first refresh OR after a hard timeout — whichever first.
    const sweep = () => { setBulkBusy(false); window.removeEventListener('particle:thumbnail-ready', sweep) }
    window.addEventListener('particle:thumbnail-ready', sweep)
    window.setTimeout(sweep, 12000)
  }

  // Recompute the bulk-summary on every render — cheap O(N) localStorage
  // reads for ~46 presets, well under a frame. Kept in render so the
  // counter on the bulk button updates the moment a single rebuild lands.
  const bulkSummary = summarizeBulkRebuild(presets)
  const canBulkRebuild = bulkSummary.withThumb > 0

  // Sort: favorites first
  const sortedByFilter = (filter === 'recent')
    // Recent: explicit ordering by recency.
    ? recentPresets.map(id => presets.find(p => p.id === id)).filter(Boolean)
    : [...presets]
        .filter(p => filter === 'all' || favoritedPresets.includes(p.id))
        .sort((a, b) => {
          const aFav = favoritedPresets.includes(a.id) ? 0 : 1
          const bFav = favoritedPresets.includes(b.id) ? 0 : 1
          return aFav - bFav
        })
  // R23.34 — apply note-search on top of the existing filter. Empty
  // query is a no-op (presetsMatchingNote returns the input array by
  // reference); non-empty query intersects with the note matcher so
  // a user can stack "Favs + 'demo'" or "Recent + 'wrong'". noteSummary
  // surfaces a count badge on the search input so the user knows how
  // many tiles match before scanning the list.
  // R24.37 — query value is no longer pre-normalized (substring still
  // lower-cases / trims internally; regex consumes the raw query so
  // case-sensitive anchors like ^Demo work as expected). The substring
  // path still goes through normalizeNoteQuery internally so the chip
  // empty-state branch stays accurate.
  const noteQueryRaw = typeof noteQuery === 'string' ? noteQuery : ''
  const noteQueryActive = noteQueryRaw.trim().length > 0
  const noteQueryUsable = isValidQueryForMode(noteQueryRaw, noteFilterMode)
  const sorted = presetsMatchingNoteWithMode(sortedByFilter, noteQueryRaw, noteFilterMode)
  const noteSummary = noteQueryActive
    ? summarizeNoteFilterWithMode(sortedByFilter, noteQueryRaw, noteFilterMode)
    : null
  // R23.34 — global "tagged" badge always reflects how many tiles in
  // the FULL preset list (independent of category filter) have notes.
  // Used to gate the search button — no point opening a search input
  // when there are zero notes to search across.
  const globalTaggedSummary = summarizeNoteFilter(presets, '')

  return (
    <div className="hide-scrollbar" style={{
      height: 100,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 16px',
      overflowX: 'auto',
      flexShrink: 0,
      background: 'linear-gradient(180deg, rgba(8,8,14,0.62) 0%, rgba(8,8,14,0.82) 100%)',
      backdropFilter: 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
      <button
        onClick={() => setFilter(f => f === 'all' ? 'favs' : f === 'favs' ? 'recent' : 'all')}
        title={`Filter: ${filter} (click to cycle)`}
        style={{
          flexShrink: 0,
          height: 70, width: 56,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 10, cursor: 'pointer',
          background: filter !== 'all'
            ? 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.2))'
            : 'rgba(255,255,255,0.04)',
          color: filter !== 'all' ? '#f3e8ff' : '#8a8aa0',
          border: filter !== 'all' ? '1px solid rgba(168,85,247,0.45)' : '1px solid rgba(255,255,255,0.07)',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
          flexDirection: 'column', gap: 4,
        }}
      >
        <span style={{ fontSize: 18, lineHeight: 1 }}>
          {filter === 'favs' ? '★' : filter === 'recent' ? '⏱' : '☰'}
        </span>
        <span style={{ fontSize: 9 }}>{filter === 'favs' ? 'Favs' : filter === 'recent' ? 'Recent' : 'All'}</span>
      </button>
      {/* Bulk "Rebuild all stale thumbs" — sits next to the filter so
          power users can find it without a hunt, but only renders when
          there's actually something cached to clear. Compact 56px wide
          mirror of the filter button. Counter line hints at scale
          ("32 / 46") so the click feels informed. */}
      {canBulkRebuild && (
        <button
          onClick={rebuildAllThumbs}
          disabled={bulkBusy}
          title={bulkBusy
            ? 'Rebuilding thumbnails in the background — they\'ll refill as you watch.'
            : `Wipe all ${bulkSummary.withThumb} cached thumbnails and re-render them in the background.`}
          style={{
            flexShrink: 0,
            height: 70, width: 56,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 10, cursor: bulkBusy ? 'progress' : 'pointer',
            background: bulkBusy
              ? 'linear-gradient(135deg, rgba(34,197,94,0.32), rgba(16,185,129,0.22))'
              : 'rgba(255,255,255,0.04)',
            color: bulkBusy ? '#a7f3d0' : '#8a8aa0',
            border: bulkBusy ? '1px solid rgba(34,197,94,0.45)' : '1px solid rgba(255,255,255,0.07)',
            fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
            flexDirection: 'column', gap: 4,
            transition: 'background 0.18s, border-color 0.18s, color 0.18s',
          }}
        >
          <span style={{
            fontSize: 18, lineHeight: 1,
            display: 'inline-block',
            animation: bulkBusy ? 'thumb-rebuild-spin 1.4s linear infinite' : 'none',
            transformOrigin: 'center',
          }}>↻</span>
          <span style={{ fontSize: 9 }}>
            {bulkBusy ? 'Building' : `${bulkSummary.withThumb}/${bulkSummary.total}`}
          </span>
        </button>
      )}
      {/* R23.34 — note-filter button + collapsible input. Only renders
          when at least one tile has a saved note (no point offering a
          search across zero hits). Click toggles the input open; when
          open the input commands focus + shows the live match count.
          Empty/whitespace query is a no-op so toggling open without
          typing doesn't disturb the list ordering. Escape clears the
          query AND closes the input so a user can bail out without
          reaching for the mouse. The count badge sits on the chip
          itself when the input is closed but the query is non-empty
          (e.g. the user typed, closed via X, came back) so the user
          knows the filter is still applied. */}
      {globalTaggedSummary.totalWithNotes > 0 && (
        <div style={{
          flexShrink: 0,
          height: 70,
          display: 'inline-flex', alignItems: 'center',
          gap: 4,
        }}>
          {!noteFilterOpen ? (
            <button
              onClick={() => setNoteFilterOpen(true)}
              title={noteQueryActive
                ? `Note filter: "${noteQuery}" — ${noteFilterMode} mode (${noteSummary?.matching || 0} match${(noteSummary?.matching || 0) === 1 ? '' : 'es'})${!noteQueryUsable ? ' — invalid pattern' : ''}`
                : `Filter by thumbnail note — ${globalTaggedSummary.totalWithNotes} tile${globalTaggedSummary.totalWithNotes === 1 ? '' : 's'} tagged`}
              style={{
                height: 70, width: 56,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 10, cursor: 'pointer',
                background: noteQueryActive
                  ? (noteQueryUsable
                    ? 'linear-gradient(135deg, rgba(245,158,11,0.28), rgba(251,191,36,0.18))'
                    : 'linear-gradient(135deg, rgba(239,68,68,0.28), rgba(248,113,113,0.18))')
                  : 'rgba(255,255,255,0.04)',
                color: noteQueryActive ? (noteQueryUsable ? '#fde68a' : '#fecaca') : '#8a8aa0',
                border: noteQueryActive
                  ? (noteQueryUsable ? '1px solid rgba(245,158,11,0.45)' : '1px solid rgba(239,68,68,0.45)')
                  : '1px solid rgba(255,255,255,0.07)',
                fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
                flexDirection: 'column', gap: 4,
                transition: 'background 0.18s, border-color 0.18s, color 0.18s',
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{'\u2315'}</span>
              <span style={{ fontSize: 9 }}>
                {noteQueryActive ? `${noteSummary?.matching || 0}` : 'Note'}
              </span>
            </button>
          ) : (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              height: 70, padding: '0 8px',
              borderRadius: 10,
              background: noteQueryActive && !noteQueryUsable
                ? 'rgba(239,68,68,0.08)'
                : 'rgba(245,158,11,0.08)',
              border: noteQueryActive && !noteQueryUsable
                ? '1px solid rgba(239,68,68,0.55)'
                : '1px solid rgba(245,158,11,0.40)',
              position: 'relative',   // R25.42 — anchor for history dropdown
            }}>
              <span style={{
                fontSize: 14, lineHeight: 1,
                color: noteQueryActive && !noteQueryUsable ? '#fecaca' : '#fde68a',
              }}>{'\u2315'}</span>
              <input
                type="text"
                autoFocus
                value={noteQuery}
                onChange={(e) => setNoteQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    if (historyOpen) {
                      // Escape closes the dropdown first; second Esc clears the
                      // query + closes the input (the original R23.34 behaviour).
                      setHistoryOpen(false)
                      return
                    }
                    setNoteQuery('')
                    setNoteFilterOpen(false)
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    // R25.42 — Enter commits the current pattern to history
                    // (signal of intent: user explicitly applied it) THEN
                    // dismisses the input. Empty query is a no-op in commit.
                    commitToHistory()
                    setNoteFilterOpen(false)
                  } else if (e.key === 'ArrowDown' && noteFilterHistory.length > 0) {
                    e.preventDefault()
                    // R25.42 — Down arrow surfaces the history dropdown for
                    // keyboard-only navigation. Clicking still works the
                    // same. Doesn't auto-apply — user picks then Enter.
                    setHistoryOpen(true)
                  }
                }}
                placeholder={noteFilterMode === NOTE_FILTER_MODE_REGEX
                  ? 'Regex: ^demo$, h.llo, [a-z]+...'
                  : 'Search notes...'}
                title={`Filter the carousel by thumbnail note text. ${globalTaggedSummary.totalWithNotes} tiles tagged; ${noteFilterMode === NOTE_FILTER_MODE_REGEX
                  ? 'regex mode (case-insensitive, anchors + wildcards + character classes supported)'
                  : 'substring + case-insensitive match'}.`}
                style={{
                  background: 'transparent',
                  border: 'none', outline: 'none',
                  color: noteQueryActive && !noteQueryUsable ? '#fecaca' : '#fef3c7',
                  fontSize: 11,
                  width: 120,
                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                }}
              />
              {/* R24.37 — mode toggle pip. Click to flip substring <-> regex.
                  When regex mode is active, the chip wears an indigo tint so
                  the user can tell at a glance which matcher is running
                  without inspecting the placeholder text. */}
              <button
                type="button"
                onClick={toggleNoteFilterMode}
                title={noteFilterMode === NOTE_FILTER_MODE_REGEX
                  ? 'Regex mode (click to switch back to substring)'
                  : 'Substring mode (click to switch to regex)'}
                style={{
                  width: 22, height: 16,
                  borderRadius: 4,
                  background: noteFilterMode === NOTE_FILTER_MODE_REGEX
                    ? 'rgba(99,102,241,0.22)'
                    : 'rgba(255,255,255,0.04)',
                  border: noteFilterMode === NOTE_FILTER_MODE_REGEX
                    ? '1px solid rgba(99,102,241,0.55)'
                    : '1px solid rgba(255,255,255,0.10)',
                  color: noteFilterMode === NOTE_FILTER_MODE_REGEX ? '#c7d2fe' : '#9a9ab0',
                  fontSize: 9, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                  padding: 0,
                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  letterSpacing: '0.05em',
                }}
              >.*</button>
              {/* R25.42 — history dropdown toggle. Only renders when at
                  least one history entry exists; otherwise the user has
                  no patterns to surface. Click toggles the dropdown
                  below the input. */}
              {noteFilterHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen(v => !v)}
                  title={`Recent patterns (${noteFilterHistory.length}) — click to ${historyOpen ? 'hide' : 'show'} dropdown`}
                  style={{
                    width: 22, height: 16,
                    borderRadius: 4,
                    background: historyOpen
                      ? 'rgba(34,211,238,0.22)'
                      : 'rgba(255,255,255,0.04)',
                    border: historyOpen
                      ? '1px solid rgba(34,211,238,0.55)'
                      : '1px solid rgba(255,255,255,0.10)',
                    color: historyOpen ? '#67e8f9' : '#9a9ab0',
                    fontSize: 9, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    letterSpacing: '0.05em',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 10 }}>{'\u29c9'}</span>
                  <span style={{ fontSize: 8 }}>{noteFilterHistory.length}</span>
                </button>
              )}
              <span style={{
                fontSize: 9,
                color: noteQueryActive && !noteQueryUsable ? '#fecaca' : '#a8a8b0',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                minWidth: 24, textAlign: 'right',
              }} title={noteQueryActive && !noteQueryUsable
                ? 'Pattern not valid — no tiles match until pattern compiles.'
                : `${noteSummary?.matching ?? 0} of ${globalTaggedSummary.totalWithNotes} tagged tiles match`}>
                {noteQueryActive
                  ? (noteQueryUsable
                    ? `${noteSummary?.matching ?? 0}/${globalTaggedSummary.totalWithNotes}`
                    : `bad`)
                  : `${globalTaggedSummary.totalWithNotes}`}
              </span>
              {noteQueryActive && (
                <button
                  type="button"
                  onClick={() => setNoteQuery('')}
                  title="Clear search"
                  style={{
                    width: 16, height: 16,
                    borderRadius: '50%',
                    background: 'rgba(245,158,11,0.18)',
                    border: '1px solid rgba(245,158,11,0.35)',
                    color: '#fde68a',
                    fontSize: 10, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                    padding: 0,
                  }}
                >{'\u00d7'}</button>
              )}
              <button
                type="button"
                onClick={() => {
                  // R25.42 — closing via X also commits the query to
                  // history if non-empty (parallels Enter dismissal).
                  // Empty query is a no-op in commitToHistory.
                  commitToHistory()
                  setNoteFilterOpen(false)
                }}
                title="Close search (filter stays applied)"
                style={{
                  width: 16, height: 16,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#9a9ab0',
                  fontSize: 10, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                  padding: 0,
                }}
              >{'\u2715'}</button>
              {/* R25.42 — recent-patterns dropdown. Renders below the
                  input row, MRU-ordered, with per-row apply (click) +
                  remove (×) + a footer "Clear all". Click-outside +
                  Escape close it (Escape inside the input is handled
                  above so we re-use the input handler's path). */}
              {historyOpen && noteFilterHistory.length > 0 && (
                <>
                  {/* Backdrop captures outside clicks — anchored beside
                      the row, transparent so the page reads through. */}
                  <span
                    onClick={() => setHistoryOpen(false)}
                    style={{
                      position: 'fixed', inset: 0,
                      zIndex: 200, background: 'transparent',
                      cursor: 'default',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      right: 0,
                      width: 240,
                      maxHeight: 280,
                      overflowY: 'auto',
                      padding: '6px 0',
                      borderRadius: 8,
                      background: 'rgba(15,15,25,0.97)',
                      border: '1px solid rgba(34,211,238,0.30)',
                      boxShadow: '0 8px 22px rgba(0,0,0,0.55)',
                      zIndex: 201,
                      fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{
                      padding: '0 10px 4px',
                      fontSize: 8.5, color: '#5a5a70',
                      letterSpacing: '0.10em', textTransform: 'uppercase',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      marginBottom: 4,
                    }}>Recent patterns ({noteFilterHistory.length})</div>
                    {/* R26.42 — sort pinned-first for visual stability so a
                        pinned pattern doesn't drift down as new searches
                        bump unpinned entries. */}
                    {sortNoteFilterHistoryForDisplay(noteFilterHistory).map((entry, i) => {
                      const isRegex = entry.mode === NOTE_FILTER_MODE_REGEX
                      const isPinned = entry.pinned === true
                      return (
                        <div key={`${entry.mode}::${entry.query}`} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '5px 8px',
                          cursor: 'pointer',
                          borderRadius: 4,
                          background: isPinned
                            ? 'rgba(245,158,11,0.06)'
                            : (i === 0 ? 'rgba(34,211,238,0.05)' : 'transparent'),
                          transition: 'background 0.10s ease-out',
                        }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isPinned
                              ? 'rgba(245,158,11,0.14)'
                              : 'rgba(34,211,238,0.12)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isPinned
                              ? 'rgba(245,158,11,0.06)'
                              : (i === 0 ? 'rgba(34,211,238,0.05)' : 'transparent')
                          }}
                          onClick={() => applyHistoryEntry(entry)}
                          onContextMenu={(e) => {
                            // R26.42 — right-click toggles pin (no native
                            // menu). Browsers that suppress contextmenu
                            // events on touch still get the star button.
                            e.preventDefault()
                            togglePinHistoryEntry(entry)
                          }}
                          title={isPinned
                            ? `Pinned \u2014 click to apply, right-click to unpin`
                            : `Click to apply "${entry.query}" (${entry.mode}); right-click to pin`}
                        >
                          <span style={{
                            fontSize: 8, padding: '1px 4px',
                            borderRadius: 3, fontWeight: 700,
                            background: isRegex
                              ? 'rgba(99,102,241,0.18)'
                              : 'rgba(245,158,11,0.14)',
                            color: isRegex ? '#c7d2fe' : '#fde68a',
                            border: isRegex
                              ? '1px solid rgba(99,102,241,0.40)'
                              : '1px solid rgba(245,158,11,0.30)',
                            letterSpacing: '0.04em',
                            minWidth: 22, textAlign: 'center',
                          }}>{isRegex ? '.*' : 'AB'}</span>
                          <span style={{
                            flex: 1, color: '#e8e8f0', fontSize: 10.5,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{entry.query}</span>
                          {/* R26.42 — pin button. Star when pinned (amber);
                              hollow star when unpinned (mutes to invisible
                              until row hover via opacity). Click-to-toggle. */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); togglePinHistoryEntry(entry) }}
                            title={isPinned ? 'Unpin from list' : 'Pin to top of list'}
                            style={{
                              width: 14, height: 14,
                              borderRadius: '50%',
                              background: isPinned
                                ? 'rgba(245,158,11,0.18)'
                                : 'rgba(255,255,255,0.04)',
                              border: isPinned
                                ? '1px solid rgba(245,158,11,0.50)'
                                : '1px solid rgba(255,255,255,0.10)',
                              color: isPinned ? '#fde68a' : '#7a7a90',
                              fontSize: 9, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                              padding: 0, flexShrink: 0,
                              opacity: isPinned ? 1 : 0.55,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background 0.12s, color 0.12s, opacity 0.12s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '1'
                              if (!isPinned) {
                                e.currentTarget.style.background = 'rgba(245,158,11,0.10)'
                                e.currentTarget.style.color = '#fde68a'
                                e.currentTarget.style.borderColor = 'rgba(245,158,11,0.30)'
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = isPinned ? '1' : '0.55'
                              if (!isPinned) {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                                e.currentTarget.style.color = '#7a7a90'
                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                              }
                            }}
                          >{isPinned ? '\u2605' : '\u2606'}</button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeHistoryEntry(entry) }}
                            title="Remove from history"
                            style={{
                              width: 14, height: 14,
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(255,255,255,0.10)',
                              color: '#7a7a90',
                              fontSize: 10, lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                              padding: 0, flexShrink: 0,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                              e.currentTarget.style.color = '#fca5a5'
                              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.30)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                              e.currentTarget.style.color = '#7a7a90'
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'
                            }}
                          >{'\u00d7'}</button>
                        </div>
                      )
                    })}
                    <div style={{
                      borderTop: '1px solid rgba(255,255,255,0.04)',
                      marginTop: 4, padding: '4px 8px 0',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 6,
                    }}>
                      <span style={{ fontSize: 8.5, color: '#5a5a70' }}>
                        {'\u2193'} arrow / click {'\u00b7'} right-click to pin
                      </span>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {/* R27.42 — Bulk-unpin button. Only renders when
                            at least 2 entries are pinned (with 1 pinned,
                            unpinning is a single right-click on the row —
                            the bulk button adds nothing). Amber to match
                            the pin star colour family; sits next to the
                            red Clear so the two destructive actions are
                            grouped. */}
                        {countPinnedNoteFilterHistoryEntries(noteFilterHistory) >= 2 && (
                          <button
                            type="button"
                            onClick={bulkUnpinHistory}
                            title={`Unpin all ${countPinnedNoteFilterHistoryEntries(noteFilterHistory)} pinned patterns at once (entries stay in history; just flip back to unpinned).${bulkUnpinChainDepth >= 2 ? ` ${bulkUnpinChainDepth} undo levels banked from recent sweeps.` : ''}`}
                            style={{
                              padding: '2px 8px',
                              fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em',
                              background: 'rgba(245,158,11,0.10)',
                              color: '#fde68a',
                              border: '1px solid rgba(245,158,11,0.30)',
                              borderRadius: 4, cursor: 'pointer',
                              textTransform: 'uppercase',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <span>Unpin</span>
                            <span style={{
                              fontSize: 8, padding: '0 3px', borderRadius: 2,
                              background: 'rgba(0,0,0,0.32)', color: '#fde68a',
                              border: '1px solid rgba(245,158,11,0.45)',
                              fontWeight: 700,
                            }}>{countPinnedNoteFilterHistoryEntries(noteFilterHistory)}</span>
                            {/* R30.42 — undo-depth pip. Surfaces the banked
                                bulk-unpin chain depth ("x2" / "x3") right on
                                the button so a user mid-cleanup keeps that
                                awareness after the R29.42 toast (which carried
                                the same badge) auto-dismisses at 2.4s. Only
                                renders at depth >= 2 (a single level needs no
                                badge — parallels formatBulkUnpinChainBadge). */}
                            {bulkUnpinChainDepth >= 2 && (
                              <span style={{
                                fontSize: 8, padding: '0 3px', borderRadius: 2,
                                background: 'rgba(99,102,241,0.22)', color: '#c7d2fe',
                                border: '1px solid rgba(99,102,241,0.45)',
                                fontWeight: 700, letterSpacing: 0,
                                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                              }}>{`x${bulkUnpinChainDepth}`}</span>
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={clearHistory}
                          title="Wipe the whole recent-patterns list"
                          style={{
                            padding: '2px 8px',
                            fontSize: 8.5, fontWeight: 700, letterSpacing: '0.06em',
                            background: 'rgba(239,68,68,0.10)',
                            color: '#fca5a5',
                            border: '1px solid rgba(239,68,68,0.30)',
                            borderRadius: 4, cursor: 'pointer',
                            textTransform: 'uppercase',
                          }}
                        >Clear</button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
      {/* R23.34 — empty-results banner. When a query is active but
          nothing in the current category-filter matches it, surface a
          friendly note so the user doesn't think the carousel broke.
          Inline so it doesn't push the layout around when not active.
          R24.37 — invalid regex gets its own messaging so users know
          the pattern (not the query string itself) is the problem. */}
      {noteQueryActive && sorted.length === 0 && (
        <div style={{
          flexShrink: 0,
          height: 70, padding: '0 14px',
          display: 'inline-flex', alignItems: 'center',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: noteQueryUsable
            ? '1px dashed rgba(245,158,11,0.35)'
            : '1px dashed rgba(239,68,68,0.45)',
          color: noteQueryUsable ? '#fde68a' : '#fecaca',
          fontSize: 11, fontStyle: 'italic',
        }}>
          {noteQueryUsable
            ? <>No tagged tiles match {'\u201c'}{noteQuery}{'\u201d'}</>
            : <>Invalid regex {'\u2014'} type a valid pattern (or switch to substring)</>}
        </div>
      )}
      {sorted.map(p => {
        const isFav = favoritedPresets.includes(p.id)
        const thumb = thumbs[p.id]
        const isBusy = busyId === p.id
        // R19.13 — per-preset metadata for the hover badge. Only
        // surfaces when we ACTUALLY have metadata for this preset
        // (recent rebuilds, fresh installs, or live captures).
        // summarizeThumbAge returns a compact relative-time string
        // ("3h", "now", "2d") — null when capturedAt is missing or
        // unparseable.
        const md = thumb ? meta[p.id] : null
        const age = md ? summarizeThumbAge(md) : null
        return (
          <div key={p.id} style={{ position: 'relative', flexShrink: 0 }} className="preset-tile">
            <button
              onClick={() => loadPreset(p.id)}
              className="preset-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: thumb ? '5px 5px 7px' : '10px 16px',
                borderRadius: 14,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
                background: currentPreset === p.id
                  ? 'linear-gradient(135deg, rgba(139,92,246,0.18) 0%, rgba(236,72,153,0.18) 100%)'
                  : 'rgba(255,255,255,0.03)',
                border: isFav
                  ? '1px solid rgba(245,158,11,0.45)'
                  : currentPreset === p.id
                    ? '1px solid rgba(168,85,247,0.45)'
                    : '1px solid rgba(255,255,255,0.05)',
                boxShadow: currentPreset === p.id
                  ? '0 8px 24px rgba(139,92,246,0.25), 0 0 0 1px rgba(168,85,247,0.2) inset'
                  : 'none',
                transform: currentPreset === p.id ? 'translateY(-2px)' : 'translateY(0)',
              }}
              onMouseEnter={e => {
                if (currentPreset !== p.id) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'
                  e.currentTarget.style.borderColor = 'rgba(168,85,247,0.3)'
                  e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.4)'
                }
              }}
              onMouseLeave={e => {
                if (currentPreset !== p.id) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  e.currentTarget.style.transform = 'translateY(0) scale(1)'
                  e.currentTarget.style.borderColor = isFav ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.05)'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
              {thumb ? (
                <img src={thumb} alt={p.name} style={{
                  width: 120, height: 72, borderRadius: 8,
                  objectFit: 'cover',
                  border: '1px solid rgba(255,255,255,0.08)',
                  // Slight dim while busy so the user sees the rebuild
                  // is in progress; restores instantly when done.
                  filter: isBusy ? 'brightness(0.55) saturate(0.7)' : 'none',
                  transition: 'filter 0.18s ease-out',
                }} />
              ) : (
                <div style={{
                  width: 120, height: 72, borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.12))',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 30,
                  filter: currentPreset === p.id ? 'none' : 'saturate(0.85)',
                }}>
                  {p.emoji}
                </div>
              )}
              <span style={{
                fontSize: 10.5,
                fontWeight: currentPreset === p.id ? 600 : 500,
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
                color: currentPreset === p.id ? '#e9d5ff' : '#8a8aa0',
              }}>
                {p.name}
              </span>
            </button>
            {/* Rebuild-this-thumb button — only shown on hover, and only
                for presets that already have a thumb (no point rebuilding
                a placeholder; the prerenderer covers those). Located at
                top-left so the existing favorite star at top-right stays
                in place. */}
            {thumb && (
              <button
                onClick={e => { e.stopPropagation(); rebuildThumb(p) }}
                className="thumb-rebuild-btn"
                disabled={isBusy}
                title={isBusy ? 'Rebuilding thumb...' : 'Rebuild this thumbnail (re-renders from preset source)'}
                style={{
                  position: 'absolute', top: 2, left: 2,
                  width: 22, height: 22,
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isBusy ? 'rgba(168,85,247,0.42)' : 'rgba(0,0,0,0.55)',
                  border: '1px solid rgba(168,85,247,0.32)',
                  color: '#e9d5ff', cursor: isBusy ? 'progress' : 'pointer',
                  fontSize: 12, lineHeight: 1, fontWeight: 700,
                  padding: 0,
                  transition: 'all 0.15s ease-out',
                  zIndex: 2,
                }}
              >
                <span style={{
                  display: 'inline-block',
                  // Continuous rotation while busy; static otherwise.
                  animation: isBusy ? 'thumb-rebuild-spin 0.9s linear infinite' : 'none',
                  transformOrigin: 'center',
                }}>↻</span>
              </button>
            )}
            {/* R19.13 — hover-only metadata badge. Sits at the bottom-
                left of the tile, hidden by default + faded in via the
                .thumb-meta-badge rule below the carousel markup. Only
                renders when both the thumb AND its metadata are present
                so a half-stale state (thumb without meta) skips the
                badge entirely rather than showing junk. Format:
                "120×80 · render · 3h" — dimensions, source, age.
                R20.19 — also clickable: opens a richer detail panel
                with the full ISO time, particle count (when present),
                render time (when present), byte size (when present)
                and a "Rebuild" / "Clear" pair scoped to the open tile. */}
            {thumb && md && age && (
              <button
                type="button"
                className="thumb-meta-badge"
                onClick={(e) => {
                  e.stopPropagation()
                  setDetailId(prev => prev === p.id ? null : p.id)
                }}
                title="Click to see full thumbnail metadata"
                style={{
                  position: 'absolute', bottom: 26, left: 5,
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontSize: 8.5, fontWeight: 600,
                  letterSpacing: '0.04em',
                  fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  background: detailId === p.id ? 'rgba(99,102,241,0.55)' : 'rgba(0,0,0,0.75)',
                  color: md.source === 'live' ? '#a7f3d0' : '#c7d2fe',
                  border: detailId === p.id
                    ? '1px solid rgba(99,102,241,0.85)'
                    : `1px solid ${md.source === 'live' ? 'rgba(34,197,94,0.40)' : 'rgba(99,102,241,0.40)'}`,
                  backdropFilter: 'blur(4px)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  zIndex: 2,
                  textTransform: 'lowercase',
                }}>
                {md.width}{'\u00d7'}{md.height}
                <span style={{ color: '#7a7a90', margin: '0 3px' }}>{'\u00b7'}</span>
                {md.source}
                <span style={{ color: '#7a7a90', margin: '0 3px' }}>{'\u00b7'}</span>
                {age}
              </button>
            )}
            {/* R20.19 — metadata detail panel. Renders ABOVE the tile
                (anchored to its bottom-left) when the badge is clicked.
                Pure key/value table from formatThumbDetails — the lib
                handles every shape decision so the renderer stays
                paint-only. Click-outside (handled by the panel's stop-
                propagation guards + ambient Escape listener) closes
                the panel. */}
            {thumb && md && detailId === p.id && (() => {
              const allRows = formatThumbDetails(md)
              // R22.29 — note row is rendered separately (multi-line +
              // editable) so we strip it from the telemetry grid.
              const rows = allRows.filter(r => r.key !== 'note')
              const noteRow = allRows.find(r => r.key === 'note')
              return (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="thumb-detail-panel"
                  style={{
                    position: 'absolute',
                    bottom: 50, left: 0,
                    minWidth: 240, maxWidth: 320,
                    padding: '8px 10px',
                    borderRadius: 7,
                    background: 'linear-gradient(180deg, rgba(8,8,18,0.96), rgba(4,4,12,0.98))',
                    border: '1px solid rgba(99,102,241,0.45)',
                    boxShadow: '0 16px 36px rgba(0,0,0,0.7), 0 0 24px rgba(99,102,241,0.18)',
                    backdropFilter: 'blur(14px)',
                    zIndex: 5,
                    color: '#e2e8f0',
                    fontSize: 11,
                    fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                  }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    paddingBottom: 6, marginBottom: 6,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
                      color: '#a5b4fc', textTransform: 'uppercase',
                    }}>{p.name} thumb</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDetailId(null) }}
                      title="Close"
                      style={{
                        width: 18, height: 18, padding: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 4, fontSize: 10, lineHeight: 1, fontWeight: 700,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: '#9a9ab0', cursor: 'pointer',
                      }}>{'\u00d7'}</button>
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ fontSize: 10, color: '#7a7a90' }}>
                      No metadata available.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                      {rows.map(row => (
                        <div key={row.key} style={{ display: 'contents' }}>
                          <span style={{
                            color: '#7a7a90',
                            fontSize: 9.5, letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            paddingTop: 1,
                          }}>{row.label}</span>
                          <span title={row.hint || undefined} style={{
                            color: '#e2e8f0',
                            fontSize: 10.5,
                            wordBreak: 'break-word',
                          }}>{row.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* R22.29 — per-thumb user note. Free-form text the
                      user can attach to a thumbnail to label it ("good
                      demo shot", "wrong colors", "use for OG card",
                      etc). Persists alongside the metadata via
                      setThumbNote; saves on Enter / blur (Shift+Enter
                      newline). Capped at THUMB_NOTE_MAX_LEN — the
                      counter goes amber within 20 of the cap so users
                      see how much room they have left. */}
                  <ThumbNoteEditor
                    presetId={p.id}
                    initialNote={noteRow ? noteRow.value : ''}
                    onSaved={(savedNote) => {
                      // Update the in-memory metadata map so the badge +
                      // detail panel reflect the new note immediately
                      // without waiting for the prerenderer event.
                      setMeta(prev => {
                        const cur = prev[p.id]
                        if (!cur) return prev
                        const next = { ...cur }
                        if (savedNote) next.note = savedNote
                        else delete next.note
                        return { ...prev, [p.id]: next }
                      })
                    }}
                  />
                  {/* R21.24 — Rebuild / Clear action buttons scoped to
                      this tile. Currently the hover-only rebuild button
                      on the tile is the ONLY way to trigger a per-tile
                      rebuild; surfacing the action inside the panel
                      means the user can rebuild WITHOUT first having to
                      close the detail panel and hover the tile. Clear
                      is brand new — previously the only way to wipe a
                      single thumb without rebuilding it was to use the
                      bulk "Rebuild all" path (which wipes everything).
                      Both actions auto-close the panel afterwards so
                      the user sees the resulting visual update on the
                      tile instead of staring at an empty/stale panel. */}
                  <div style={{
                    display: 'flex', gap: 6, marginTop: 8, paddingTop: 8,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Re-use the same rebuild path the hover button
                        // uses (setBusyId + setTimeout + recaptureThumbnail
                        // + particle:thumbnail-ready event). Closing the
                        // panel BEFORE the rebuild runs means the user
                        // sees the new thumb arrive instead of an
                        // already-stale rich panel.
                        setDetailId(null)
                        rebuildThumb(p)
                      }}
                      title="Re-render this preset's thumbnail using the live capture path. The new thumb replaces the cached one and the badge metadata updates."
                      style={{
                        flex: 1,
                        padding: '5px 8px', borderRadius: 5,
                        fontSize: 10, fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: 'rgba(99,102,241,0.14)',
                        color: '#c7d2fe',
                        border: '1px solid rgba(99,102,241,0.32)',
                        cursor: 'pointer',
                        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                        display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', gap: 4,
                      }}>
                      <span style={{ fontSize: 12 }}>{'\u21bb'}</span> Rebuild
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        // clearThumbnail handles localStorage + metadata
                        // side-store via the cascade. Drop the in-memory
                        // map entries so the placeholder emoji tile shows
                        // immediately without waiting for a refresh event.
                        const wiped = clearThumbnail(p.id)
                        if (wiped) {
                          setThumbs(prev => {
                            const { [p.id]: _gone, ...rest } = prev
                            return rest
                          })
                          setMeta(prev => {
                            const { [p.id]: _gone, ...rest } = prev
                            return rest
                          })
                        }
                        setDetailId(null)
                      }}
                      title="Delete this preset's cached thumbnail + metadata. The placeholder emoji returns until the prerenderer or live capture path generates a fresh thumb."
                      style={{
                        flex: 1,
                        padding: '5px 8px', borderRadius: 5,
                        fontSize: 10, fontWeight: 600,
                        letterSpacing: '0.06em', textTransform: 'uppercase',
                        background: 'rgba(239,68,68,0.10)',
                        color: '#fca5a5',
                        border: '1px solid rgba(239,68,68,0.30)',
                        cursor: 'pointer',
                        fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                        display: 'inline-flex', alignItems: 'center',
                        justifyContent: 'center', gap: 4,
                      }}>
                      <span style={{ fontSize: 12 }}>{'\u00d7'}</span> Clear
                    </button>
                  </div>
                  <div style={{
                    marginTop: 8, paddingTop: 6,
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 9, color: '#7a7a90',
                  }}>
                    Press Esc to close. Click outside to dismiss.
                  </div>
                </div>
              )
            })()}
            {/* Favorite star */}
            <button
              onClick={e => { e.stopPropagation(); toggleFavorite(p.id) }}
              className={`fav-btn ${isFav ? 'active' : ''}`}
              style={{
                position: 'absolute', top: 2, right: 2,
                width: 22, height: 22,
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isFav ? 'rgba(245,158,11,0.2)' : 'rgba(0,0,0,0.5)',
                border: 'none', cursor: 'pointer',
                fontSize: 12, lineHeight: 1,
                transition: 'all 0.15s ease-out',
                zIndex: 2,
              }}
            >
              {isFav ? '⭐' : '☆'}
            </button>
          </div>
        )
      })}
      {/* Tile-scoped styles: the rebuild button is hidden by default and
          fades in when the user hovers the tile (or while it's busy so
          the spinner is always visible). Keeping the rule next to the
          markup so future preset-tile tweaks find it without a hunt. */}
      <style>{`
        .preset-tile .thumb-rebuild-btn { opacity: 0; transform: scale(0.85); pointer-events: none; }
        .preset-tile:hover .thumb-rebuild-btn,
        .preset-tile .thumb-rebuild-btn[disabled] { opacity: 1; transform: scale(1); pointer-events: auto; }
        @keyframes thumb-rebuild-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        /* R19.13 — hover-only metadata badge. Tracks the rebuild button's
           pattern (hidden at rest, fades in on hover) so the tile stays
           visually tidy until the user is actively scanning it. */
        .preset-tile .thumb-meta-badge { opacity: 0; transition: opacity 0.18s ease-out; }
        .preset-tile:hover .thumb-meta-badge { opacity: 1; }
      `}</style>
    </div>
  )
}

// R22.29 — per-thumb user note editor. Free-form text the user can
// attach to a thumbnail to label it. Local state for the in-progress
// draft; commits to localStorage via setThumbNote on Save / blur /
// Enter. Empty / whitespace clears the note (collapses to no note).
//
// Lives as a leaf so the local draft state doesn't bubble up to the
// PresetCarousel parent on every keystroke (would re-render the whole
// grid for 46 tiles on each character typed). Mounting/unmounting on
// detail-panel open/close is fine — the editor is render-cheap and
// the data lives in localStorage, not React state.
function ThumbNoteEditor({ presetId, initialNote, onSaved }) {
  const [draft, setDraft] = useState(initialNote || '')
  const [editing, setEditing] = useState(false)
  // Sync the draft when the detail panel opens onto a different
  // preset id (rare — we usually unmount/remount, but be safe).
  // Resetting `editing` ensures the textarea doesn't carry a draft
  // from the previous tile.
  useEffect(() => {
    setDraft(initialNote || '')
    setEditing(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId])

  const trimmed = draft.trim().slice(0, THUMB_NOTE_MAX_LEN)
  const charsLeft = THUMB_NOTE_MAX_LEN - trimmed.length
  const dirty = trimmed !== (initialNote || '')

  const save = () => {
    if (!dirty) {
      setEditing(false)
      return
    }
    const ok = setThumbNote(presetId, trimmed)
    if (ok) {
      setEditing(false)
      if (typeof onSaved === 'function') onSaved(trimmed)
    }
  }
  const cancel = () => {
    setDraft(initialNote || '')
    setEditing(false)
  }
  const clear = () => {
    setDraft('')
    const ok = setThumbNote(presetId, '')
    if (ok) {
      setEditing(false)
      if (typeof onSaved === 'function') onSaved('')
    }
  }

  // Read-only view — single line of italic text + edit pencil.
  // Empty state: "+ Add note" placeholder.
  if (!editing) {
    return (
      <div style={{
        marginTop: 8, paddingTop: 6,
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          minHeight: 18,
        }}>
          {initialNote ? (
            <span
              onClick={() => setEditing(true)}
              title="Click to edit this note"
              style={{
                flex: 1, fontSize: 10.5, lineHeight: 1.5,
                color: '#fde68a', fontStyle: 'italic',
                wordBreak: 'break-word',
                cursor: 'pointer',
                padding: '2px 4px', margin: '-2px -4px',
                borderRadius: 4,
                transition: 'background 0.12s ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.08)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              \u201c{initialNote}\u201d
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              title={`Attach a note to this thumbnail (\u2264${THUMB_NOTE_MAX_LEN} chars).`}
              style={{
                flex: 1, textAlign: 'left',
                padding: '3px 6px', borderRadius: 4,
                background: 'rgba(255,255,255,0.03)',
                color: '#7a7a90',
                border: '1px dashed rgba(255,255,255,0.10)',
                fontSize: 10, fontStyle: 'italic',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >+ Add note</button>
          )}
        </div>
      </div>
    )
  }

  // Edit mode — textarea + Save / Cancel / Clear buttons.
  const overCap = charsLeft <= 0
  const nearCap = charsLeft <= 20
  return (
    <div style={{
      marginTop: 8, paddingTop: 6,
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, THUMB_NOTE_MAX_LEN))}
        onKeyDown={(e) => {
          // Enter saves; Shift+Enter inserts newline. Esc cancels.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel()
          }
        }}
        onBlur={() => {
          // Blur saves silently (matches the camera-view rename pattern
          // R14.18 — least-surprise for a free-text editor).
          if (dirty) save()
        }}
        rows={3}
        maxLength={THUMB_NOTE_MAX_LEN}
        placeholder="Label this thumbnail \u2014 e.g. 'good demo shot', 'wrong colors', 'use for OG card'."
        style={{
          width: '100%', boxSizing: 'border-box',
          padding: '5px 7px', borderRadius: 5,
          background: 'rgba(2,2,8,0.65)',
          border: '1px solid rgba(245,158,11,0.35)',
          color: '#fde68a',
          fontFamily: 'inherit',
          fontSize: 10.5, lineHeight: 1.45,
          resize: 'vertical',
          minHeight: 50,
        }}
      />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 5, gap: 6,
      }}>
        <span style={{
          fontSize: 9, color: overCap ? '#fca5a5' : nearCap ? '#fbbf24' : '#7a7a90',
          fontFamily: 'Geist Mono, JetBrains Mono, monospace',
        }}>
          {trimmed.length}/{THUMB_NOTE_MAX_LEN} \u2014 Enter saves, Esc cancels
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {initialNote && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clear() }}
              title="Remove this note"
              style={{
                padding: '3px 7px', borderRadius: 4,
                fontSize: 9.5, fontWeight: 600,
                background: 'rgba(239,68,68,0.10)',
                color: '#fca5a5',
                border: '1px solid rgba(239,68,68,0.30)',
                cursor: 'pointer',
                fontFamily: 'Geist Mono, JetBrains Mono, monospace',
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}
            >Clear</button>
          )}
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); cancel() }}
            title="Cancel without saving (Esc)"
            style={{
              padding: '3px 7px', borderRadius: 4,
              fontSize: 9.5, fontWeight: 600,
              background: 'rgba(255,255,255,0.04)',
              color: '#9a9ab0',
              border: '1px solid rgba(255,255,255,0.10)',
              cursor: 'pointer',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}
          >Cancel</button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); save() }}
            disabled={!dirty}
            title={dirty ? 'Save the note (Enter)' : 'No changes to save'}
            style={{
              padding: '3px 9px', borderRadius: 4,
              fontSize: 9.5, fontWeight: 700,
              background: dirty
                ? 'linear-gradient(135deg, rgba(245,158,11,0.35), rgba(236,72,153,0.20))'
                : 'rgba(255,255,255,0.04)',
              color: dirty ? '#fed7aa' : '#5a5a70',
              border: dirty
                ? '1px solid rgba(245,158,11,0.45)'
                : '1px solid rgba(255,255,255,0.05)',
              cursor: dirty ? 'pointer' : 'not-allowed',
              fontFamily: 'Geist Mono, JetBrains Mono, monospace',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              opacity: dirty ? 1 : 0.55,
            }}
          >Save</button>
        </div>
      </div>
    </div>
  )
}
