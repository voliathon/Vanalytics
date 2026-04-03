import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getVanadielTime,
  elementTextColors,
  elementFillColors,
  elementHighlightColors,
  elementGlowColors,
  type Element,
} from '../lib/vanadiel'

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function TeleportCrystal({ element }: { element: Element }) {
  const fill = elementFillColors[element]
  const highlight = elementHighlightColors[element]
  const glow = elementGlowColors[element]

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 16 16"
      className="shrink-0"
      style={{ marginBottom: '-4px' }}
      aria-hidden="true"
    >
      {/* Central body */}
      <polygon points="8,2 10.5,6 8,10 5.5,6" fill={fill} opacity={0.85} />
      {/* Top spike */}
      <polygon points="7.2,3 8,0.5 8.8,3 8,4" fill={fill} opacity={0.7} />
      {/* Bottom elongated spike */}
      <polygon points="7,9 8,15.5 9,9 8,8" fill={fill} opacity={0.7} />
      {/* Left spike */}
      <polygon points="5.8,5 2.5,4.5 5.5,6.5 6.5,6" fill={fill} opacity={0.6} />
      {/* Right spike */}
      <polygon points="10.2,5 13.5,4.5 10.5,6.5 9.5,6" fill={fill} opacity={0.6} />
      {/* Upper-left spike */}
      <polygon points="6.2,3.5 4,1.5 5.8,4.5 6.8,4" fill={fill} opacity={0.55} />
      {/* Upper-right spike */}
      <polygon points="9.8,3.5 12,1.5 10.2,4.5 9.2,4" fill={fill} opacity={0.55} />
      {/* Lower-left spike */}
      <polygon points="5.8,7.5 3,9 5.8,7 6.5,7.5" fill={fill} opacity={0.5} />
      {/* Lower-right spike */}
      <polygon points="10.2,7.5 13,9 10.2,7 9.5,7.5" fill={fill} opacity={0.5} />
      {/* Inner highlight */}
      <polygon points="8,3.5 9.5,6 8,8.5 6.5,6" fill={highlight} opacity={0.35} />
      {/* Center bright spot */}
      <circle cx="8" cy="5.5" r="0.8" fill={glow} opacity={0.4} />
    </svg>
  )
}

export default function SidebarClock({ onClick }: { onClick?: () => void }) {
  const [time, setTime] = useState(() => getVanadielTime())

  useEffect(() => {
    const id = setInterval(() => setTime(getVanadielTime()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <Link
      to="/server/clock"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-800/50 transition-colors"
    >
      <TeleportCrystal element={time.element} />
      <span className={`text-[11px] ${elementTextColors[time.element]}`}>
        {time.dayOfWeek}
      </span>
      <span className="text-[11px] text-gray-300 ml-auto tabular-nums">
        {pad(time.hour)}:{pad(time.minute)}
      </span>
    </Link>
  )
}
