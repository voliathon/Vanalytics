import { useState, useEffect } from 'react'
import { api, ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useLoginModal } from '../context/LoginModalContext'
import type { CharacterSummary } from '../types/api'
import CharacterCard from '../components/CharacterCard'

export default function CharactersPage() {
  const { user, loading: authLoading } = useAuth()
  const { open: openLogin } = useLoginModal()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchCharacters = async () => {
    try {
      const data = await api<CharacterSummary[]>('/api/characters')
      setCharacters(data)
    } catch {
      setError('Failed to load characters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) fetchCharacters()
  }, [user])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this character?')) return
    try {
      await api(`/api/characters/${id}`, { method: 'DELETE' })
      fetchCharacters()
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }

  if (authLoading) return <p className="text-gray-400">Loading...</p>

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-2xl font-bold mb-3">Sign in to view your characters</h1>
        <p className="text-gray-400 max-w-md mb-6">
          Track your FFXI characters with real-time gear updates, inventory sync, and session analytics.
        </p>
        <button
          onClick={openLogin}
          className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          Sign In
        </button>
      </div>
    )
  }

  if (loading) return <p className="text-gray-400">Loading characters...</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Characters</h1>

      {error && (
        <div className="mb-4 rounded bg-red-900/50 border border-red-700 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <p className="text-sm text-gray-500 mb-6">
        Characters are automatically added when your Windower addon syncs.
      </p>

      {characters.length === 0 ? (
        <p className="text-gray-500">No characters registered yet.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {characters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
