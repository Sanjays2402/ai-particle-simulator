import { useStore } from '../store'

export default function RightSidebar() {
  const { dynamicControls, dynamicValues, setDynamicValue, infoTitle, infoDesc } = useStore()

  return (
    <div style={{
      width: 260,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      background: 'rgba(8,8,14,0.9)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderLeft: '1px solid rgba(255,255,255,0.04)',
    }}>
      {/* Info Panel */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        <h3 style={{
          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#5a5a70', marginBottom: 12,
        }}>Info</h3>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: '#eeeef0', marginBottom: 4, letterSpacing: '-0.02em' }}>
          {infoTitle || 'No simulation'}
        </h2>
        {infoDesc && (
          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#7a7a90' }}>
            {infoDesc}
          </p>
        )}
      </div>

      {/* Dynamic Controls */}
      {dynamicControls.length > 0 && (
        <div style={{ padding: '14px 16px' }}>
          <h3 style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.08em', color: '#5a5a70', marginBottom: 12,
          }}>Controls</h3>
          {dynamicControls.map(c => {
            const v = dynamicValues[c.id] ?? c.value
            const pct = ((v - c.min) / (c.max - c.min)) * 100
            return (
            <div key={c.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                <span style={{ color: '#7a7a90' }}>{c.label}</span>
                <span style={{
                  color: '#c084fc',
                  fontWeight: 500,
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {v.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={c.min} max={c.max}
                step={(c.max - c.min) / 100}
                value={v}
                onChange={e => setDynamicValue(c.id, parseFloat(e.target.value))}
                style={{ width: '100%', '--val': `${pct}%` }}
              />
            </div>
          )})}
        </div>
      )}

      {dynamicControls.length === 0 && (
        <div style={{
          padding: 16, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <p style={{ fontSize: 13, textAlign: 'center', color: '#4a4a60' }}>
            Dynamic controls will appear here when the simulation uses addControl()
          </p>
        </div>
      )}
    </div>
  )
}
