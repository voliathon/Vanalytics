import { useState } from 'react'
import { api } from '../../api/client'
import type { ReactionSummary } from '../../types/api'

interface Props {
  postId: number
  reactions: ReactionSummary
  userReactions: string[]
  disabled?: boolean
}

const reactionConfig = [
  { type: 'like', emoji: '\uD83D\uDC4D', activeClass: 'bg-blue-900/40 text-blue-400 border-blue-800/50' },
  { type: 'thanks', emoji: '\u2764\uFE0F', activeClass: 'bg-red-900/40 text-red-400 border-red-800/50' },
  { type: 'funny', emoji: '\uD83D\uDE04', activeClass: 'bg-amber-900/40 text-amber-400 border-amber-800/50' },
] as const

export default function ForumReactionBar({ postId, reactions: initialReactions, userReactions: initialUserReactions, disabled }: Props) {
  const [reactions, setReactions] = useState(initialReactions)
  const [userReactions, setUserReactions] = useState(initialUserReactions)
  const [loading, setLoading] = useState(false)

  const toggle = async (type: string) => {
    if (disabled || loading) return

    // Optimistic update
    const prevReactions = reactions
    const prevUserReactions = userReactions
    const isActive = userReactions.includes(type)
    const delta = isActive ? -1 : 1

    setReactions(prev => ({
      ...prev,
      [type]: Math.max(0, (prev[type as keyof ReactionSummary] ?? 0) + delta),
    }))
    setUserReactions(prev =>
      isActive ? prev.filter(r => r !== type) : [...prev, type]
    )

    try {
      setLoading(true)
      const result = await api<{ reactions: ReactionSummary; userReactions: string[] }>(
        `/api/forum/posts/${postId}/react`,
        { method: 'POST', body: JSON.stringify({ reactionType: type }) }
      )
      setReactions(result.reactions)
      setUserReactions(result.userReactions)
    } catch {
      setReactions(prevReactions)
      setUserReactions(prevUserReactions)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      {reactionConfig.map(({ type, emoji, activeClass }) => {
        const isActive = userReactions.includes(type)
        const count = reactions[type as keyof ReactionSummary] ?? 0
        return (
          <button
            key={type}
            onClick={() => toggle(type)}
            disabled={disabled}
            title={disabled ? 'Sign in to react' : isActive ? `Remove ${type}` : type.charAt(0).toUpperCase() + type.slice(1)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              isActive
                ? activeClass
                : 'text-gray-600 hover:text-gray-300 border border-transparent hover:border-gray-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span>{emoji}</span>
            <span>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
