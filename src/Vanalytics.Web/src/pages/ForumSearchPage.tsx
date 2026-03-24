import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Pin, Lock } from 'lucide-react'
import { api } from '../api/client'
import type { ForumSearchResult, PaginatedSearchResults } from '../types/api'
import UserAvatar from '../components/UserAvatar'
import ForumSearchBar from '../components/forum/ForumSearchBar'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function ForumSearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [results, setResults] = useState<ForumSearchResult[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchResults = async (append = false) => {
    if (!query || query.length < 3) return
    setLoading(true)
    setError('')
    try {
      const last = append && results.length > 0 ? results[results.length - 1] : null
      const params = new URLSearchParams({ q: query, limit: '25' })
      if (last) {
        params.set('afterId', String(last.threadId))
      }
      const data = await api<PaginatedSearchResults>(`/api/forum/search?${params}`)
      setResults(prev => append ? [...prev, ...data.results] : data.results)
      setHasMore(data.hasMore)
    } catch {
      setError('Search failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setResults([])
    fetchResults()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-sm text-gray-500">
        <Link to="/forum" className="hover:text-blue-400">Forum</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-300">Search results for "{query}"</span>
      </div>

      <div className="max-w-lg">
        <ForumSearchBar />
      </div>

      {loading && results.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      )}

      {error && <p className="text-red-400 text-center py-10">{error}</p>}

      {!loading && results.length === 0 && query.length >= 3 && (
        <p className="text-gray-500 text-center py-10">
          No results found for "{query}". Try a longer or more specific search term.
        </p>
      )}

      <div className="space-y-3">
        {results.map(r => (
          <Link
            key={r.threadId}
            to={`/forum/${r.categorySlug}/${r.threadSlug}`}
            className="block rounded-lg border border-gray-800 bg-gray-900 p-4 hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              {r.isPinned && <Pin className="h-3.5 w-3.5 text-blue-400" />}
              {r.isLocked && <Lock className="h-3.5 w-3.5 text-amber-400" />}
              <h3 className="text-sm font-semibold text-gray-100">{r.threadTitle}</h3>
            </div>
            <p className="text-xs text-gray-500 mb-2 line-clamp-2">{r.matchSnippet}</p>
            <div className="flex items-center gap-3 text-xs text-gray-600">
              <span className="rounded bg-gray-800 px-2 py-0.5 text-gray-400">{r.categoryName}</span>
              <div className="flex items-center gap-1">
                <UserAvatar username={r.authorUsername} size="sm" />
                <span>{r.authorUsername}</span>
              </div>
              <span>{r.replyCount} replies</span>
              <span>{r.voteCount} votes</span>
              <span>{timeAgo(r.lastPostAt)}</span>
            </div>
          </Link>
        ))}
      </div>

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => fetchResults(true)}
            disabled={loading}
            className="rounded bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
