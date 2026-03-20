import { useState } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import type { ApiKeyResponse } from '../types/api'

export default function ApiKeysPage() {
  const { user } = useAuth()
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(user?.hasApiKey ?? false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    setError('')
    setLoading(true)
    try {
      const res = await api<ApiKeyResponse>('/api/keys/generate', { method: 'POST' })
      setApiKey(res.apiKey)
      setHasKey(true)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm('Revoke your API key? The Windower addon will stop syncing.')) return
    setError('')
    setLoading(true)
    try {
      await api('/api/keys', { method: 'DELETE' })
      setApiKey(null)
      setHasKey(false)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">API Key Management</h1>

      <div className="max-w-lg rounded-lg border border-gray-800 bg-gray-900 p-6">
        <p className="text-sm text-gray-400 mb-4">
          Your API key is used by the Windower addon to sync character data.
          Generating a new key invalidates the previous one.
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {apiKey && (
          <div className="mb-4 rounded bg-gray-800 border border-gray-700 p-3">
            <p className="text-xs text-gray-500 mb-1">
              Copy this key now — it won't be shown again.
            </p>
            <code className="text-sm text-green-400 break-all select-all">{apiKey}</code>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {hasKey ? 'Regenerate Key' : 'Generate Key'}
          </button>

          {hasKey && (
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="rounded border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
            >
              Revoke Key
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
