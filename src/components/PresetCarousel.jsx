import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'
import { recaptureThumbnail } from '../lib/presetThumbnails'

export default function PresetCarousel() {
  const { loadPreset, currentPreset, favoritedPresets, recentPresets, toggleFavorite } = useStore()
  const [thumbs, setThumbs] = useState({})
  // Tri-state filter: 'all' | 'favs' | 'recent'.
  const [filter, setFilter] = useState('all')
  // Track which preset just had its thumb rebuilt — used to animate the
  // refresh icon for a moment so the user gets feedback the click landed.
  const [busyId, setBusyId] = useState(null)

  // Load thumbnails from localStorage. Also listens for the
  // 'particle:thumbnail-ready' event the prerenderer fires so
  // freshly-generated thumbs appear without waiting for the user
  // to switch presets.
  useEffect(() => {
    const refresh = () => {
      const t = {}
      presets.forEach(p => {
        const d = localStorage.getItem(`preset-thumb-${p.id}`)
        if (d) t[p.id] = d
      })
      setThumbs(t)
    }
    refresh()
    window.addEventListener('particle:thumbnail-ready', refresh)
    return () => window.removeEventListener('particle:thumbnail-ready', refresh)
  }, [currentPreset])

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
      {sorted.map(p => {
        const isFav = favoritedPresets.includes(p.id)
        const thumb = thumbs[p.id]
        const isBusy = busyId === p.id
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
      `}</style>
    </div>
  )
}
