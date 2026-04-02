import { useStore } from '../store'
import { presets } from '../presets'

export default function PresetCarousel() {
  const { loadPreset, currentPreset } = useStore()

  return (
    <div className="h-20 flex items-center gap-3 px-4 overflow-x-auto shrink-0"
      style={{ background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)' }}>
      {presets.map(p => (
        <button
          key={p.id}
          onClick={() => loadPreset(p.id)}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl shrink-0 transition-all"
          style={{
            background: currentPreset === p.id ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
            border: currentPreset === p.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
            transform: 'translateY(0)',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = currentPreset === p.id ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)' }}
        >
          <span className="text-lg">{p.emoji}</span>
          <span className="text-[10px] font-medium whitespace-nowrap"
            style={{ color: currentPreset === p.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
            {p.name}
          </span>
        </button>
      ))}
    </div>
  )
}
