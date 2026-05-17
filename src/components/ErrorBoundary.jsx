import { Component } from 'react'

// Simple top-level error boundary. The particle compiler usually traps
// runtime errors per frame, but if anything inside the React tree
// blows up (eg. a postprocessing pass on an unsupported GPU) we want
// a soft recovery UI instead of a blank page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, info: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.setState({ info })
    // Surface to the dev console for repro.
    // eslint-disable-next-line no-console
    console.error('[ParticleSim] crashed:', error, info)
  }

  reset = () => {
    this.setState({ error: null, info: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 30%, #1a1030 0%, #050508 70%)',
        color: '#f3e8ff',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}>
        <div style={{
          maxWidth: 480,
          padding: 24,
          borderRadius: 16,
          background: 'rgba(12,12,20,0.85)',
          border: '1px solid rgba(168,85,247,0.4)',
          boxShadow: '0 0 40px rgba(168,85,247,0.25)',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>💥 Something exploded</div>
          <p style={{ color: '#c0b8d8', fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
            The simulator hit a runtime error. Your settings and preset
            are still saved — recover the scene with the buttons below.
          </p>
          <pre style={{
            background: 'rgba(0,0,0,0.45)',
            padding: 10,
            borderRadius: 8,
            fontSize: 11,
            color: '#fca5a5',
            maxHeight: 140,
            overflow: 'auto',
            marginBottom: 16,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {String(this.state.error && this.state.error.message || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={this.reset}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
              }}
            >Try again</button>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
                background: 'rgba(255,255,255,0.06)', color: '#eeeef0',
                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              }}
            >Hard reload</button>
          </div>
        </div>
      </div>
    )
  }
}
