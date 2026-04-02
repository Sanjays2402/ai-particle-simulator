import { useStore } from '../store'

export default function RightSidebar() {
  const { dynamicControls, dynamicValues, setDynamicValue, infoTitle, infoDesc } = useStore()

  return (
    <div className="w-64 flex flex-col overflow-y-auto shrink-0"
      style={{ background: 'var(--bg-glass)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderLeft: '1px solid var(--border)' }}>
      
      {/* Info Panel */}
      <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2"
          style={{ color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.05em' }}>Info</h3>
        <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--accent)' }}>
          {infoTitle || 'No simulation'}
        </h2>
        {infoDesc && (
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {infoDesc}
          </p>
        )}
      </div>

      {/* Dynamic Controls */}
      {dynamicControls.length > 0 && (
        <div className="p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.05em' }}>Controls</h3>
          {dynamicControls.map(c => (
            <div key={c.id} className="mb-4">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: 'var(--text-secondary)' }}>{c.label}</span>
                <span style={{ color: 'var(--accent)' }}>
                  {(dynamicValues[c.id] ?? c.value).toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={c.min} max={c.max}
                step={(c.max - c.min) / 100}
                value={dynamicValues[c.id] ?? c.value}
                onChange={e => setDynamicValue(c.id, parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          ))}
        </div>
      )}

      {dynamicControls.length === 0 && (
        <div className="p-4 flex-1 flex items-center justify-center">
          <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
            Dynamic controls will appear here when the simulation uses addControl()
          </p>
        </div>
      )}
    </div>
  )
}
