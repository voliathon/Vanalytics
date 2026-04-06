import type { ReactNode } from 'react'

// FFXI Private Use Area element icons (U+E000–E007) → element names
const PUA_ELEMENT_MAP: Record<string, string> = {
  '\uE000': 'Fire',
  '\uE001': 'Ice',
  '\uE002': 'Wind',
  '\uE003': 'Earth',
  '\uE004': 'Lightning',
  '\uE005': 'Water',
  '\uE006': 'Light',
  '\uE007': 'Dark',
}

// Element names → icon image paths (public/img/)
const ELEMENT_ICON_PATH: Record<string, string> = {
  Fire: '/img/fire.png',
  Ice: '/img/ice.png',
  Wind: '/img/wind.png',
  Earth: '/img/earth.png',
  Lightning: '/img/lightning.png',
  Water: '/img/water.png',
  Light: '/img/light.png',
  Dark: '/img/darkness.png',
}

export function elementIcon(element: string, key: string | number) {
  return (
    <img
      key={key}
      src={ELEMENT_ICON_PATH[element]}
      alt={element}
      title={element}
      width={16}
      height={16}
      style={{
        imageRendering: 'pixelated',
        display: 'inline',
        verticalAlign: 'text-bottom',
        marginRight: 1,
      }}
    />
  )
}

/** Replace FFXI PUA element chars (U+E000–E007) with inline icon images */
export function renderDescriptionWithIcons(line: string): ReactNode[] {
  const parts: ReactNode[] = []
  let lastIndex = 0
  const pattern = /[\uE000-\uE007]([-+]?\d+)?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index))
    }
    const element = PUA_ELEMENT_MAP[match[0][0]]
    const bonus = match[1] ?? ''
    parts.push(
      <span key={match.index} style={{ whiteSpace: 'nowrap' }}>
        {elementIcon(element, `icon-${match.index}`)}
        {bonus}
      </span>,
    )
    lastIndex = pattern.lastIndex
  }
  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex))
  }
  if (parts.length === 0) parts.push(line)
  return parts
}
