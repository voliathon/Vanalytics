// Vana'diel time computation — deterministic, client-side only.
// Constants match the backend VanadielClock.cs exactly.

const VANADIEL_EPOCH = Date.UTC(2002, 5, 23, 15, 0, 0) // June 23 2002 15:00 UTC
const TIME_MULTIPLIER = 25
const MS_PER_REAL_DAY = 86_400_000
const DAYS_PER_YEAR = 360
const INITIAL_VANA_OFFSET = (898 * DAYS_PER_YEAR + 30) * MS_PER_REAL_DAY

const WEEKDAYS = [
  'Firesday', 'Earthsday', 'Watersday', 'Windsday',
  'Iceday', 'Lightningsday', 'Lightsday', 'Darksday',
] as const

const ELEMENTS = [
  'Fire', 'Earth', 'Water', 'Wind',
  'Ice', 'Lightning', 'Light', 'Dark',
] as const

export type Element = typeof ELEMENTS[number]

export interface VanadielTime {
  hour: number
  minute: number
  dayOfWeek: string
  element: Element
}

export function getVanadielTime(now?: Date): VanadielTime {
  const elapsed = (now ?? new Date()).getTime() - VANADIEL_EPOCH
  const vanaMs = INITIAL_VANA_OFFSET + elapsed * TIME_MULTIPLIER

  const dayIndex = Math.floor((vanaMs / MS_PER_REAL_DAY) % 8)
  const msInDay = vanaMs % MS_PER_REAL_DAY

  return {
    hour: Math.floor(msInDay / 3_600_000),
    minute: Math.floor((msInDay % 3_600_000) / 60_000),
    dayOfWeek: WEEKDAYS[dayIndex],
    element: ELEMENTS[dayIndex],
  }
}

// Tailwind text color classes for day name
export const elementTextColors: Record<Element, string> = {
  Fire: 'text-red-400',
  Earth: 'text-yellow-600',
  Water: 'text-blue-400',
  Wind: 'text-green-400',
  Ice: 'text-cyan-300',
  Lightning: 'text-purple-400',
  Light: 'text-yellow-200',
  Dark: 'text-gray-400',
}

// SVG fill colors for crystal body
export const elementFillColors: Record<Element, string> = {
  Fire: '#ef4444',
  Earth: '#ca8a04',
  Water: '#3b82f6',
  Wind: '#22c55e',
  Ice: '#06b6d4',
  Lightning: '#a855f7',
  Light: '#eab308',
  Dark: '#6b7280',
}

// SVG fill colors for crystal inner highlight
export const elementHighlightColors: Record<Element, string> = {
  Fire: '#fca5a5',
  Earth: '#fde047',
  Water: '#93c5fd',
  Wind: '#86efac',
  Ice: '#67e8f9',
  Lightning: '#d8b4fe',
  Light: '#fef08a',
  Dark: '#d1d5db',
}

// SVG fill colors for crystal center glow
export const elementGlowColors: Record<Element, string> = {
  Fire: '#fef2f2',
  Earth: '#fefce8',
  Water: '#eff6ff',
  Wind: '#f0fdf4',
  Ice: '#ecfeff',
  Lightning: '#faf5ff',
  Light: '#fefce8',
  Dark: '#f3f4f6',
}

// Card background + border classes (used by VanadielClockPage)
export const elementBgColors: Record<Element, string> = {
  Fire: 'bg-red-900/30 border-red-800',
  Earth: 'bg-yellow-900/30 border-yellow-800',
  Water: 'bg-blue-900/30 border-blue-800',
  Wind: 'bg-green-900/30 border-green-800',
  Ice: 'bg-cyan-900/30 border-cyan-800',
  Lightning: 'bg-purple-900/30 border-purple-800',
  Light: 'bg-yellow-900/20 border-yellow-700',
  Dark: 'bg-gray-800/50 border-gray-700',
}
