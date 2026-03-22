import { useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'

interface CategoryTreeProps {
  categories: string[]
  selectedCategory: string
  selectedSkill: string
  selectedSlots: string
  onCategoryChange: (category: string) => void
  onSkillChange: (skill: string) => void
  onSlotsChange: (slots: string) => void
}

const WEAPON_TYPES = [
  { id: 1, name: 'Hand-to-Hand' }, { id: 2, name: 'Dagger' }, { id: 3, name: 'Sword' },
  { id: 4, name: 'Great Sword' }, { id: 5, name: 'Axe' }, { id: 6, name: 'Great Axe' },
  { id: 7, name: 'Scythe' }, { id: 8, name: 'Polearm' }, { id: 9, name: 'Katana' },
  { id: 10, name: 'Great Katana' }, { id: 11, name: 'Club' }, { id: 12, name: 'Staff' },
  { id: 25, name: 'Archery' }, { id: 26, name: 'Marksmanship' },
]

const ARMOR_SLOTS = [
  'Head', 'Body', 'Hands', 'Legs', 'Feet', 'Back', 'Waist', 'Neck', 'Ear', 'Ring',
]

const EXPANDABLE = new Set(['Weapon', 'Armor'])

export default function CategoryTree({
  categories, selectedCategory, selectedSkill, selectedSlots,
  onCategoryChange, onSkillChange, onSlotsChange,
}: CategoryTreeProps) {
  const [expanded, setExpanded] = useState<string | null>(
    selectedCategory && EXPANDABLE.has(selectedCategory) ? selectedCategory : null
  )

  const handleCategoryClick = (cat: string) => {
    if (EXPANDABLE.has(cat)) {
      setExpanded(expanded === cat ? null : cat)
      onCategoryChange(cat)
      onSkillChange('')
      onSlotsChange('')
    } else {
      setExpanded(null)
      onCategoryChange(selectedCategory === cat ? '' : cat)
      onSkillChange('')
      onSlotsChange('')
    }
  }

  const handleSubcategoryClick = (cat: string, subValue: string) => {
    onCategoryChange(cat)
    if (cat === 'Weapon') {
      onSkillChange(selectedSkill === subValue ? '' : subValue)
      onSlotsChange('')
    } else if (cat === 'Armor') {
      onSlotsChange(selectedSlots === subValue ? '' : subValue)
      onSkillChange('')
    }
  }

  const clearAll = () => {
    onCategoryChange('')
    onSkillChange('')
    onSlotsChange('')
    setExpanded(null)
  }

  const hasSelection = selectedCategory !== ''

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Category</span>
        {hasSelection && (
          <button onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>
      <div>
        {categories.map((cat) => {
          const isExpanded = expanded === cat
          const isSelected = selectedCategory === cat
          const isExpandable = EXPANDABLE.has(cat)

          return (
            <div key={cat}>
              <button
                onClick={() => handleCategoryClick(cat)}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors ${
                  isSelected && !selectedSkill && !selectedSlots
                    ? 'bg-blue-600/20 text-blue-400'
                    : isSelected
                    ? 'text-blue-300'
                    : 'text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                {isExpandable ? (
                  isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                             : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate">{cat}</span>
              </button>

              {cat === 'Weapon' && isExpanded && (
                <div className="ml-6 border-l border-gray-700 pl-2">
                  {WEAPON_TYPES.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => handleSubcategoryClick('Weapon', w.id.toString())}
                      className={`block w-full px-2 py-1 text-xs text-left transition-colors ${
                        selectedSkill === w.id.toString()
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                      }`}
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
              )}

              {cat === 'Armor' && isExpanded && (
                <div className="ml-6 border-l border-gray-700 pl-2">
                  {ARMOR_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => handleSubcategoryClick('Armor', slot)}
                      className={`block w-full px-2 py-1 text-xs text-left transition-colors ${
                        selectedSlots === slot
                          ? 'bg-blue-600/20 text-blue-400'
                          : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-300'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
