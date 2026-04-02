import { useState } from 'react'
import { useStore } from '../store'

export default function SettingsModal({ onClose }) {
  const { aiApiKey, aiBaseUrl, aiModel, setAiSettings } = useStore()
  const [key, setKey] = useState(aiApiKey)
  const [url, setUrl] = useState(aiBaseUrl)
  const [model, setModel] = useState(aiModel)

  const save = () => {
    setAiSettings(key, url, model)
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 384,
        borderRadius: 16,
        padding: 24,
        background: 'rgba(12,12,20,0.95)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#eeeef0', marginBottom: 20, letterSpacing: '-0.02em' }}>
          ⚙ AI Settings
        </h2>
        <Field label="API Base URL" value={url} onChange={setUrl} placeholder="https://api.openai.com/v1" />
        <Field label="API Key" value={key} onChange={setKey} placeholder="sk-..." type="password" />
        <Field label="Model" value={model} onChange={setModel} placeholder="gpt-4o-mini" />
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: 'rgba(255,255,255,0.04)', color: '#7a7a90', border: '1px solid rgba(255,255,255,0.06)',
            cursor: 'pointer', transition: 'all 0.15s ease-out',
          }}>Cancel</button>
          <button onClick={save} style={{
            flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: '#6366f1', color: '#ffffff', border: 'none',
            cursor: 'pointer', transition: 'all 0.15s ease-out',
          }}>Save</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#7a7a90', marginBottom: 6 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
          outline: 'none',
          fontFamily: 'inherit',
          background: 'rgba(255,255,255,0.04)',
          color: '#eeeef0',
          border: '1px solid rgba(255,255,255,0.06)',
          transition: 'all 0.15s ease-out',
        }}
        onFocus={e => {
          e.target.style.borderColor = 'rgba(99,102,241,0.4)'
          e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)'
        }}
        onBlur={e => {
          e.target.style.borderColor = 'rgba(255,255,255,0.06)'
          e.target.style.boxShadow = 'none'
        }}
      />
    </div>
  )
}
