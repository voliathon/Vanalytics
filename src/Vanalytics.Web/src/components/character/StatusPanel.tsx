import { useState, useMemo } from 'react'
import type { CharacterDetail, GearEntry, GameItemDetail } from '../../types/api'
import { calculateBaseStats, STAT_KEYS } from '../../lib/ffxi-stats'
import type { BaseStats } from '../../lib/ffxi-stats'

interface StatusPanelProps {
  character: CharacterDetail
  gear: GearEntry[]
  itemCache: Map<number, GameItemDetail>
}

const TABS = ['Base', 'Combat', 'Skills'] as const
type Tab = typeof TABS[number]

/** Mapping from merit key to BaseStats key */
const MERIT_TO_STAT: Record<string, keyof BaseStats> = {
  max_hp: 'hp',
  max_mp: 'mp',
  str: 'str',
  dex: 'dex',
  vit: 'vit',
  agi: 'agi',
  int: 'int',
  mnd: 'mnd',
  chr: 'chr',
}

/** Combat stat keys displayed on the Combat tab */
const COMBAT_STAT_KEYS = [
  'attack',
  'def',
  'accuracy',
  'evasion',
  'rangedAccuracy',
  'rangedAttack',
  'magicAccuracy',
  'magicDamage',
  'magicEvasion',
  'enmity',
  'haste',
  'storeTP',
] as const

type CombatStatKey = typeof COMBAT_STAT_KEYS[number]

const COMBAT_STAT_LABELS: Record<CombatStatKey, string> = {
  attack: 'Attack',
  def: 'Defense',
  accuracy: 'Accuracy',
  evasion: 'Evasion',
  rangedAccuracy: 'R.Accuracy',
  rangedAttack: 'R.Attack',
  magicAccuracy: 'M.Accuracy',
  magicDamage: 'M.Damage',
  magicEvasion: 'M.Evasion',
  enmity: 'Enmity',
  haste: 'Haste',
  storeTP: 'Store TP',
}

const STAT_LABELS: Record<keyof BaseStats, string> = {
  hp: 'HP',
  mp: 'MP',
  str: 'STR',
  dex: 'DEX',
  vit: 'VIT',
  agi: 'AGI',
  int: 'INT',
  mnd: 'MND',
  chr: 'CHR',
}

export default function StatusPanel({ character, gear, itemCache }: StatusPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('Base')

  const activeJob = character.jobs.find(j => j.isActive)
  const hasRaceAndJob = !!character.race && !!activeJob

  // Debug: remove after verifying base stats work
  console.log('[StatusPanel]', { race: character.race, gender: character.gender, activeJob, hasRaceAndJob })

  // Check whether all equipped items have been fetched
  const equippedIds = useMemo(
    () => gear.filter(g => g.itemId > 0).map(g => g.itemId),
    [gear],
  )
  const allItemsLoaded = useMemo(
    () => equippedIds.every(id => itemCache.has(id)),
    [equippedIds, itemCache],
  )

  // Base stats from race + job calculation
  const baseStats = useMemo<BaseStats | null>(() => {
    if (!hasRaceAndJob) return null
    return calculateBaseStats(
      character.race,
      character.gender,
      activeJob!.job,
      activeJob!.level,
      character.subJob,
      character.subJobLevel ?? 0,
    )
  }, [character.race, character.gender, activeJob, character.subJob, character.subJobLevel, hasRaceAndJob])

  // Bonus stats from equipment + merits
  const bonusStats = useMemo<BaseStats | null>(() => {
    if (!allItemsLoaded) return null
    const bonus: BaseStats = { hp: 0, mp: 0, str: 0, dex: 0, vit: 0, agi: 0, int: 0, mnd: 0, chr: 0 }

    // Sum equipment stats
    for (const id of equippedIds) {
      const item = itemCache.get(id)
      if (!item) continue
      for (const key of STAT_KEYS) {
        const val = item[key]
        if (val != null) bonus[key] += val
      }
    }

    // Add merit bonuses
    if (character.merits) {
      for (const [meritKey, statKey] of Object.entries(MERIT_TO_STAT)) {
        const count = character.merits[meritKey]
        if (count != null && count > 0) {
          bonus[statKey] += count
        }
      }
    }

    return bonus
  }, [equippedIds, itemCache, allItemsLoaded, character.merits])

  // Combat stats from equipment only
  const combatStats = useMemo<Record<CombatStatKey, number> | null>(() => {
    if (!allItemsLoaded) return null
    const totals = {} as Record<CombatStatKey, number>
    for (const key of COMBAT_STAT_KEYS) totals[key] = 0

    for (const id of equippedIds) {
      const item = itemCache.get(id)
      if (!item) continue
      for (const key of COMBAT_STAT_KEYS) {
        const val = item[key]
        if (val != null) totals[key] += val
      }
    }
    return totals
  }, [equippedIds, itemCache, allItemsLoaded])

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Base' && (
        <BaseTab baseStats={baseStats} bonusStats={bonusStats} />
      )}
      {activeTab === 'Combat' && (
        <CombatTab combatStats={combatStats} allItemsLoaded={allItemsLoaded} />
      )}
      {activeTab === 'Skills' && <SkillsTab />}
    </div>
  )
}

function BaseTab({
  baseStats,
  bonusStats,
}: {
  baseStats: BaseStats | null
  bonusStats: BaseStats | null
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 border-b border-gray-700">
          <th className="text-left py-1 font-medium">Stat</th>
          <th className="text-right py-1 font-medium">Base</th>
          <th className="text-right py-1 font-medium">Bonus</th>
          <th className="text-right py-1 font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {STAT_KEYS.map(key => {
          const base = baseStats ? baseStats[key] : null
          const bonus = bonusStats ? bonusStats[key] : null
          const total = base != null && bonus != null ? base + bonus : null
          return (
            <tr key={key} className="border-b border-gray-800">
              <td className="py-1 text-gray-300">{STAT_LABELS[key]}</td>
              <td className="py-1 text-right text-gray-300">
                {base != null ? base : '—'}
              </td>
              <td className={`py-1 text-right ${bonus != null && bonus > 0 ? 'text-green-400' : bonus != null && bonus < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {bonus != null ? (bonus > 0 ? `+${bonus}` : bonus < 0 ? `${bonus}` : '—') : '—'}
              </td>
              <td className="py-1 text-right text-gray-200 font-medium">
                {total != null ? total : '—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CombatTab({
  combatStats,
  allItemsLoaded,
}: {
  combatStats: Record<CombatStatKey, number> | null
  allItemsLoaded: boolean
}) {
  if (!allItemsLoaded) {
    return <p className="text-gray-400 text-sm">Loading...</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-gray-400 border-b border-gray-700">
          <th className="text-left py-1 font-medium">Stat</th>
          <th className="text-right py-1 font-medium">Equipment</th>
        </tr>
      </thead>
      <tbody>
        {COMBAT_STAT_KEYS.map(key => (
          <tr key={key} className="border-b border-gray-800">
            <td className="py-1 text-gray-300">{COMBAT_STAT_LABELS[key]}</td>
            <td className="py-1 text-right text-gray-200 font-medium">
              {combatStats ? combatStats[key] : 0}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SkillsTab() {
  return (
    <p className="text-gray-500 text-sm italic">
      Coming soon — requires addon update
    </p>
  )
}
