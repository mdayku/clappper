import React, { useEffect, useState } from 'react'

interface Props {
  isOpen: boolean
  onClose: () => void
}

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'replicate', label: 'Replicate', placeholder: 'r8_...' }
]

export default function KeyManagerModal({ isOpen, onClose }: Props) {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [selectedProvider, setSelectedProvider] = useState('openai')
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadKeys()
    }
  }, [isOpen])

  const loadKeys = async () => {
    try {
      const keys = await window.clappper.getApiKeys()
      setApiKeys(keys || {})
      setError(null)
    } catch (err) {
      console.error('Failed to load API keys:', err)
      setError('Failed to load API keys')
    }
  }

  const handleSave = async () => {
    if (!keyInput.trim()) {
      setError('Please enter an API key')
      return
    }

    try {
      setError(null)
      setSuccess(null)
      await window.clappper.setApiKey(selectedProvider, keyInput.trim())
      await loadKeys()
      setKeyInput('')
      setSuccess(`${PROVIDERS.find(p => p.id === selectedProvider)?.label} key saved successfully!`)
    } catch (err: any) {
      console.error('Failed to save API key:', err)
      setError(err?.message || 'Failed to save API key')
    }
  }

  const handleRemove = async (provider: string) => {
    if (!confirm(`Remove ${PROVIDERS.find(p => p.id === provider)?.label} API key?`)) {
      return
    }

    try {
      setError(null)
      setSuccess(null)
      await window.clappper.removeApiKey(provider)
      await loadKeys()
      setSuccess(`${PROVIDERS.find(p => p.id === provider)?.label} key removed`)
    } catch (err: any) {
      console.error('Failed to remove API key:', err)
      setError(err?.message || 'Failed to remove API key')
    }
  }

  if (!isOpen) return null

  const currentProvider = PROVIDERS.find(p => p.id === selectedProvider)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: 24,
          maxWidth: 560,
          width: '90%',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>API Key Manager</h2>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>
          Manage API keys for external providers. These keys are stored locally and never shared.
        </p>

        {/* Add/Update Key Section */}
        <div style={{ marginBottom: 24, padding: 16, background: '#f8f9fa', borderRadius: 6 }}>
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 'bold',
                marginBottom: 6
              }}
            >
              Provider
            </label>
            <select
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #ccc',
                borderRadius: 4,
                background: '#fff'
              }}
            >
              {PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 'bold',
                marginBottom: 6
              }}
            >
              API Key
            </label>
            <input
              type="password"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              placeholder={currentProvider?.placeholder}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 13,
                border: '1px solid #ccc',
                borderRadius: 4,
                fontFamily: 'monospace'
              }}
            />
          </div>

          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              borderRadius: 4,
              border: 'none',
              background: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Save Key
          </button>
        </div>

        {/* Stored Keys List */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, marginTop: 0, marginBottom: 10 }}>Stored Keys</h3>
          {Object.keys(apiKeys).length === 0 ? (
            <div style={{ fontSize: 13, color: '#888', fontStyle: 'italic' }}>
              No API keys stored yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(apiKeys).map(([provider, key]) => {
                const providerInfo = PROVIDERS.find(p => p.id === provider)
                return (
                  <div
                    key={provider}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      border: '1px solid #ddd',
                      borderRadius: 4,
                      background: '#fafafa'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 'bold' }}>
                        {providerInfo?.label || provider}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: '#666',
                          fontFamily: 'monospace',
                          marginTop: 2
                        }}
                      >
                        {key.substring(0, 10)}...{key.substring(key.length - 4)}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(provider)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        borderRadius: 4,
                        border: '1px solid #ccc',
                        background: '#fff',
                        cursor: 'pointer',
                        color: '#c00'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {error && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 4,
              background: '#fee',
              color: '#c00',
              fontSize: 12
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              marginBottom: 12,
              padding: 10,
              borderRadius: 4,
              background: '#efe',
              color: '#060',
              fontSize: 12
            }}
          >
            {success}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

