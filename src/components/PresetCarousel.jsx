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
