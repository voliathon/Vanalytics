import { useState, useEffect, useRef } from 'react'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'

interface AnimationEntry {
  name: string
  category: string
  paths: string[]
}

interface AnimationGroup {
  category: string
  animations: AnimationEntry[]
}

interface AnimationControlsProps {
  groups: AnimationGroup[]
  loading: boolean
  currentFrame: number
  totalFrames: number
  playing: boolean
  speed: number
  onAnimationSelect: (paths: string[]) => void
  onPlayPause: () => void
  onSpeedChange: (speed: number) => void
  onSeek: (frame: number) => void
  onStepBack: () => void
  onStepForward: () => void
  motionCount: number
  motionIndex: number
  onMotionIndexChange: (index: number) => void
}

const SPEED_OPTIONS = [0.25, 0.5, 1.0, 1.5, 2.0]

export default function AnimationControls({
  groups, loading, currentFrame, totalFrames,
  playing, speed,
  onAnimationSelect, onPlayPause, onSpeedChange, onSeek,
  onStepBack, onStepForward,
  motionCount, motionIndex, onMotionIndexChange,
}: AnimationControlsProps) {
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedAnimIndex, setSelectedAnimIndex] = useState(0)
  const initialSelectedRef = useRef(false)

  // Auto-select "Emote" category (bow animation, consistent across races) or first category
  useEffect(() => {
    if (groups.length > 0 && !selectedCategory) {
      const emote = groups.find(g => g.category === 'Emote')
      setSelectedCategory(emote ? emote.category : groups[0].category)
    }
  }, [groups, selectedCategory])

  // Auto-select animation when category changes
  useEffect(() => {
    const group = groups.find(g => g.category === selectedCategory)
    if (group && group.animations.length > 0) {
      // On initial Emote selection, find the "Emote" animation entry
      let idx = 0
      if (!initialSelectedRef.current && selectedCategory === 'Emote') {
        const emoteIdx = group.animations.findIndex(a => a.name === 'Emote')
        if (emoteIdx >= 0) idx = emoteIdx
        initialSelectedRef.current = true
      }
      setSelectedAnimIndex(idx)
      onAnimationSelect(group.animations[idx].paths)
    }
  }, [selectedCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentGroup = groups.find(g => g.category === selectedCategory)
  const animations = currentGroup?.animations ?? []

  const handleAnimChange = (idx: number) => {
    setSelectedAnimIndex(idx)
    if (animations[idx]) {
      onAnimationSelect(animations[idx].paths)
    }
  }

  if (loading) return <div className="text-xs text-gray-500 p-2">Loading animations...</div>
  if (groups.length === 0) return null

  return (
    <div className="bg-gray-900/80 border border-gray-700/50 rounded-b-md px-3 py-2 space-y-2">
      {/* Category + Animation + Motion pickers */}
      <div className="flex gap-2">
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 flex-1"
        >
          {groups.map(g => (
            <option key={g.category} value={g.category}>{g.category}</option>
          ))}
        </select>
        <select
          value={selectedAnimIndex}
          onChange={e => handleAnimChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 flex-1"
        >
          {animations.map((a, i) => (
            <option key={i} value={i}>{a.name}</option>
          ))}
        </select>
        {motionCount > 0 && (
          <select
            value={motionIndex}
            onChange={e => onMotionIndexChange(Number(e.target.value))}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 w-28"
            title="Each animation DAT contains multiple motions (e.g., idle, walk, run)"
          >
            {Array.from({ length: motionCount }, (_, i) => (
              <option key={i} value={i}>Motion {i + 1}</option>
            ))}
          </select>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center gap-2">
        <button onClick={onStepBack} className="p-1 text-gray-400 hover:text-gray-200" title="Step back">
          <SkipBack className="h-4 w-4" />
        </button>
        <button onClick={onPlayPause} className="p-1 text-gray-400 hover:text-gray-200" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <button onClick={onStepForward} className="p-1 text-gray-400 hover:text-gray-200" title="Step forward">
          <SkipForward className="h-4 w-4" />
        </button>

        {/* Scrubber */}
        <input
          type="range"
          min={0}
          max={Math.max(1, totalFrames - 1)}
          value={currentFrame}
          onChange={e => onSeek(Number(e.target.value))}
          className="flex-1 h-1 accent-blue-500"
        />

        {/* Frame counter */}
        <span className="text-xs text-gray-400 w-16 text-right tabular-nums">
          {currentFrame}/{totalFrames}
        </span>

        {/* Speed */}
        <select
          value={speed}
          onChange={e => onSpeedChange(Number(e.target.value))}
          className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-gray-300"
        >
          {SPEED_OPTIONS.map(s => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>
    </div>
  )
}
