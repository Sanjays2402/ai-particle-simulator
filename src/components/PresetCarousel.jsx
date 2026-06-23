import { useState, useEffect } from 'react'
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
} from '../lib/presetThumbnails'

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
  const sorted = (filter === 'recent')
    // Recent: explicit ordering by recency.
    ? recentPresets.map(id => presets.find(p => p.id === id)).filter(Boolean)
    : [...presets]
        .filter(p => filter === 'all' || favoritedPresets.includes(p.id))
        .sort((a, b) => {
          const aFav = favoritedPresets.includes(a.id) ? 0 : 1
          const bFav = favoritedPresets.includes(b.id) ? 0 : 1
          return aFav - bFav
        })

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
              const rows = formatThumbDetails(md)
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
