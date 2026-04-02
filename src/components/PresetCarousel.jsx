import { useStore } from '../store'
import { presets } from '../presets'

export default function PresetCarousel() {
  const { loadPreset, currentPreset } = useStore()

  return (
    <div className="hide-scrollbar" style={{
      height: 72,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 16px',
      overflowX: 'auto',
      flexShrink: 0,
      background: 'rgba(8,8,14,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid rgba(255,255,255,0.04)',
    }}>
      {presets.map(p => (
        <button
          key={p.id}
          onClick={() => loadPreset(p.id)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '8px 16px',
            borderRadius: 12,
            flexShrink: 0,
            cursor: 'pointer',
            transition: 'all 0.15s ease-out',
            background: currentPreset === p.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
            border: currentPreset === p.id ? '1px solid rgba(99,102,241,0.25)' : '1px solid rgba(255,255,255,0.04)',
          }}
          onMouseEnter={e => {
            if (currentPreset !== p.id) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }
          }}
          onMouseLeave={e => {
            if (currentPreset !== p.id) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)'
            }
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <span style={{ fontSize: 18 }}>{p.emoji}</span>
          <span style={{
            fontSize: 10,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            color: currentPreset === p.id ? '#818cf8' : '#7a7a90',
          }}>
            {p.name}
          </span>
        </button>
      ))}
    </div>
  )
}
