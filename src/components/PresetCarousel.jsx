import { useStore } from '../store'
import { presets } from '../presets'

export default function PresetCarousel() {
  const { loadPreset, currentPreset } = useStore()

  return (
    <div className="h-20 flex items-center gap-3 px-4 border-t overflow-x-auto shrink-0"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
      {presets.map(p => (
        <button
          key={p.id}
          onClick={() => loadPreset(p.id)}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-xl shrink-0 transition-all hover:scale-105"
          style={{
            background: currentPreset === p.id ? 'rgba(0,255,136,0.12)' : 'var(--bg-tertiary)',
            border: currentPreset === p.id ? '1px solid rgba(0,255,136,0.4)' : '1px solid var(--border)',
          }}
        >
          <span className="text-lg">{p.emoji}</span>
          <span className="text-[10px] font-medium whitespace-nowrap"
            style={{ color: currentPreset === p.id ? 'var(--neon)' : 'var(--text-secondary)' }}>
            {p.name}
          </span>
        </button>
      ))}
    </div>
  )
}
