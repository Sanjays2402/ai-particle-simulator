import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { presets } from '../presets'

export default function PresetCarousel() {
  const { loadPreset, currentPreset, favoritedPresets, toggleFavorite } = useStore()
  const [thumbs, setThumbs] = useState({})

  // Load thumbnails from localStorage
  useEffect(() => {
    const t = {}
    presets.forEach(p => {
      const d = localStorage.getItem(`preset-thumb-${p.id}`)
      if (d) t[p.id] = d
    })
    setThumbs(t)
  }, [currentPreset])

  // Sort: favorites first
  const sorted = [...presets].sort((a, b) => {
    const aFav = favoritedPresets.includes(a.id) ? 0 : 1
    const bFav = favoritedPresets.includes(b.id) ? 0 : 1
    return aFav - bFav
  })

  return (
    <div className="hide-scrollbar" style={{
      height: 88,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 16px',
      overflowX: 'auto',
      flexShrink: 0,
      background: 'linear-gradient(180deg, rgba(8,8,14,0.62) 0%, rgba(8,8,14,0.82) 100%)',
      backdropFilter: 'blur(24px) saturate(140%)',
      WebkitBackdropFilter: 'blur(24px) saturate(140%)',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}>
      {sorted.map(p => {
        const isFav = favoritedPresets.includes(p.id)
        const thumb = thumbs[p.id]
        return (
          <div key={p.id} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => loadPreset(p.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                padding: thumb ? '4px 4px 6px' : '8px 16px',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'all 0.15s ease-out',
                background: currentPreset === p.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                border: isFav
                  ? '1px solid rgba(245,158,11,0.35)'
                  : currentPreset === p.id
                    ? '1px solid rgba(99,102,241,0.25)'
                    : '1px solid rgba(255,255,255,0.04)',
              }}
              onMouseEnter={e => {
                if (currentPreset !== p.id) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.transform = 'translateY(-1px)'
                }
              }}
              onMouseLeave={e => {
                if (currentPreset !== p.id) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {thumb ? (
                <img src={thumb} alt={p.name} style={{
                  width: 120, height: 80, borderRadius: 4,
                  objectFit: 'cover',
                  border: '1px solid rgba(255,255,255,0.06)',
                }} />
              ) : (
                <div style={{
                  width: 120, height: 80, borderRadius: 4,
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(129,140,248,0.05))',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 28,
                }}>
                  {p.emoji}
                </div>
              )}
              <span style={{
                fontSize: 10,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                color: currentPreset === p.id ? '#818cf8' : '#7a7a90',
              }}>
                {p.name}
              </span>
            </button>
            {/* Favorite star */}
            <button
              onClick={e => { e.stopPropagation(); toggleFavorite(p.id) }}
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
    </div>
  )
}
