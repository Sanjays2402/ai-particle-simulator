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
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}>
      <div className="w-96 rounded-2xl p-6" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-glass)', backdropFilter: 'var(--glass-blur-strong)', border: '1px solid var(--border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--accent)' }}>
          ⚙ AI Settings
        </h2>
        <Field label="API Base URL" value={url} onChange={setUrl} placeholder="https://api.openai.com/v1" />
        <Field label="API Key" value={key} onChange={setKey} placeholder="sk-..." type="password" />
        <Field label="Model" value={model} onChange={setModel} placeholder="gpt-4o-mini" />
        <div className="flex gap-2 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            Cancel
          </button>
          <button onClick={save}
            className="flex-1 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#ffffff' }}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div className="mb-3">
      <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{
          background: 'var(--bg-tertiary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
      />
    </div>
  )
}
