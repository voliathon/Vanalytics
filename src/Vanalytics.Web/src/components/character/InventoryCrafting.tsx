import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import { itemImageUrl } from '../../utils/imageUrl'
import type { InventoryByBag, CraftingEntry, RecipeSummary, RecipeSearchResult } from '../../types/api'

const PAGE_SIZE = 25

const CRAFT_OPTIONS: [string, string][] = [
  ['Woodworking', 'Woodworking'],
  ['Smithing', 'Smithing'],
  ['Goldsmithing', 'Goldsmithing'],
  ['Clothcraft', 'Clothcraft'],
  ['Leathercraft', 'Leathercraft'],
  ['Bonecraft', 'Bonecraft'],
  ['Alchemy', 'Alchemy'],
  ['Cooking', 'Cooking'],
]

interface MatchedRecipe {
  recipe: RecipeSummary
  craftCount: number
  missingCount: number
  missingDetails: { name: string; deficit: number }[]
}

interface Props {
  inventory: InventoryByBag
  craftingSkills: CraftingEntry[]
  onRowEnter?: (itemId: number) => void
  onRowMove?: (e: React.MouseEvent) => void
  onRowLeave?: () => void
}

export default function InventoryCrafting({ inventory, craftingSkills, onRowEnter, onRowMove, onRowLeave }: Props) {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [craftFilter, setCraftFilter] = useState('')
  const [mySkillsOnly, setMySkillsOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [readyPage, setReadyPage] = useState(1)
  const [almostPage, setAlmostPage] = useState(1)

  useEffect(() => {
    let cancelled = false

    async function fetchAll() {
      setLoading(true)
      try {
        const first = await api<RecipeSearchResult>(
          '/api/recipes?includeIngredients=true&pageSize=200&includeDesynth=false'
        )
        if (cancelled) return

        const all = [...first.recipes]
        const totalPages = Math.ceil(first.totalCount / 200)

        for (let page = 2; page <= totalPages; page++) {
          const next = await api<RecipeSearchResult>(
            `/api/recipes?includeIngredients=true&pageSize=200&includeDesynth=false&page=${page}`
          )
          if (cancelled) return
          all.push(...next.recipes)
        }

        setRecipes(all)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchAll()
    return () => { cancelled = true }
  }, [])

  // Reset pages when filters change
  useEffect(() => { setReadyPage(1); setAlmostPage(1) }, [craftFilter, mySkillsOnly, search])

  const inventoryMap = useMemo(() => {
    const map = new Map<number, number>()
    for (const items of Object.values(inventory)) {
      for (const item of items) {
        map.set(item.itemId, (map.get(item.itemId) ?? 0) + item.quantity)
      }
    }
    return map
  }, [inventory])

  const { readyToCraft, almostReady } = useMemo(() => {
    const ready: MatchedRecipe[] = []
    const almost: MatchedRecipe[] = []
    const q = search.toLowerCase()

    for (const recipe of recipes) {
      if (!recipe.ingredients || recipe.ingredients.length === 0) continue
      if (craftFilter && recipe.primaryCraft !== craftFilter) continue

      if (mySkillsOnly) {
        const skill = craftingSkills.find(e => e.craft === recipe.primaryCraft)
        if (!skill || skill.level < recipe.primaryCraftLevel) continue
      }

      // Text search: match result name or ingredient names
      if (q && !recipe.resultItemName.toLowerCase().includes(q) &&
          !recipe.ingredients.some(i => i.name.toLowerCase().includes(q))) {
        continue
      }

      let missingCount = 0
      const missingDetails: { name: string; deficit: number }[] = []
      const ratios: number[] = []
      let hasNonCrystalIngredient = false

      for (const ing of recipe.ingredients) {
        const owned = inventoryMap.get(ing.itemId) ?? 0
        const needed = ing.quantity
        ratios.push(owned / needed)
        if (owned < needed) {
          missingCount++
          missingDetails.push({ name: ing.name, deficit: needed - owned })
        } else if (ing.itemId !== recipe.crystalItemId) {
          hasNonCrystalIngredient = true
        }
      }

      // Skip recipes where the only owned ingredient is the crystal
      if (!hasNonCrystalIngredient && missingCount > 0) continue

      const craftCount = Math.floor(Math.min(...ratios))

      if (missingCount === 0 && craftCount >= 1) {
        ready.push({ recipe, craftCount, missingCount, missingDetails })
      } else if (missingCount === 1 || missingCount === 2) {
        almost.push({ recipe, craftCount, missingCount, missingDetails })
      }
    }

    ready.sort((a, b) => b.recipe.primaryCraftLevel - a.recipe.primaryCraftLevel)
    almost.sort((a, b) =>
      a.missingCount - b.missingCount || b.recipe.primaryCraftLevel - a.recipe.primaryCraftLevel
    )

    return { readyToCraft: ready, almostReady: almost }
  }, [recipes, inventoryMap, craftFilter, mySkillsOnly, craftingSkills, search])

  if (loading) {
    return <p className="text-sm text-gray-400">Checking recipes against your inventory...</p>
  }

  const readyTotal = readyToCraft.length
  const readyPages = Math.ceil(readyTotal / PAGE_SIZE)
  const readySlice = readyToCraft.slice((readyPage - 1) * PAGE_SIZE, readyPage * PAGE_SIZE)

  const almostTotal = almostReady.length
  const almostPages = Math.ceil(almostTotal / PAGE_SIZE)
  const almostSlice = almostReady.slice((almostPage - 1) * PAGE_SIZE, almostPage * PAGE_SIZE)

  const rowHandlers = (itemId: number) => ({
    onMouseEnter: onRowEnter ? () => onRowEnter(itemId) : undefined,
    onMouseMove: onRowMove,
    onMouseLeave: onRowLeave,
  })

  return (
    <div>
      {/* Filter controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={craftFilter}
          onChange={e => setCraftFilter(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm px-3 py-1.5 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Crafts</option>
          {CRAFT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <div className="relative">
          <input
            type="text"
            placeholder="Search recipes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-48 px-3 py-1.5 pr-8 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
            >
              &times;
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-400">
          <input
            type="checkbox"
            checked={mySkillsOnly}
            onChange={e => setMySkillsOnly(e.target.checked)}
            className="styled-checkbox"
          />
          Only recipes I can skill up on
        </label>
      </div>

      {/* Ready to Craft */}
      <div className="rounded-lg border border-green-800/50 bg-green-950/20 p-3 mb-2">
        <p className="text-sm text-green-400 font-medium">Ready to Craft ({readyTotal})</p>
      </div>
      {readyTotal === 0 ? (
        <p className="text-sm text-gray-400 mb-4">
          You don&apos;t have complete materials for any recipes.
        </p>
      ) : (
        <div className="mb-4">
          <div className="max-h-[400px] overflow-y-auto styled-scrollbar">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                  <th className="py-2 px-2 text-left w-10"></th>
                  <th className="py-2 px-2 text-left">Result</th>
                  <th className="py-2 px-2 text-left">Craft</th>
                  <th className="py-2 px-2 text-left">Qty</th>
                  <th className="py-2 px-2 text-left">Crystal</th>
                </tr>
              </thead>
              <tbody>
                {readySlice.map(m => (
                  <tr
                    key={m.recipe.id}
                    className="border-t border-gray-700/50 hover:bg-gray-800/50"
                    {...rowHandlers(m.recipe.resultItemId)}
                  >
                    <td className="py-1 px-2">
                      {m.recipe.resultItemIcon && (
                        <img src={itemImageUrl(m.recipe.resultItemIcon)} alt="" className="h-8 w-8" />
                      )}
                    </td>
                    <td className="py-1 px-2">
                      <Link to={`/recipes/${m.recipe.id}`} className="text-blue-400 hover:underline">
                        {m.recipe.resultItemName}
                      </Link>
                      {m.recipe.resultQty > 1 && (
                        <span className="text-gray-500 ml-1">x{m.recipe.resultQty}</span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-gray-300">
                      {m.recipe.primaryCraft} {m.recipe.primaryCraftLevel}
                    </td>
                    <td className="py-1 px-2 text-gray-200">&times;{m.craftCount}</td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1">
                        {m.recipe.crystalIcon && (
                          <img src={itemImageUrl(m.recipe.crystalIcon)} alt="" className="h-5 w-5" />
                        )}
                        <span className="text-gray-300">{m.recipe.crystalName}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {readyPages > 1 && (
            <Pagination page={readyPage} totalPages={readyPages} onPageChange={setReadyPage} />
          )}
        </div>
      )}

      {/* Almost Ready */}
      {almostTotal > 0 && (
        <>
          <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 mb-2">
            <p className="text-sm text-amber-400 font-medium">
              Almost Ready ({almostTotal}) — missing 1-2 ingredients
            </p>
          </div>
          <div>
            <div className="max-h-[400px] overflow-y-auto styled-scrollbar">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                    <th className="py-2 px-2 text-left w-10"></th>
                    <th className="py-2 px-2 text-left">Result</th>
                    <th className="py-2 px-2 text-left">Craft</th>
                    <th className="py-2 px-2 text-left">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {almostSlice.map(m => (
                    <tr
                      key={m.recipe.id}
                      className="border-t border-gray-700/50 hover:bg-gray-800/50"
                      {...rowHandlers(m.recipe.resultItemId)}
                    >
                      <td className="py-1 px-2">
                        {m.recipe.resultItemIcon && (
                          <img src={itemImageUrl(m.recipe.resultItemIcon)} alt="" className="h-8 w-8" />
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <Link to={`/recipes/${m.recipe.id}`} className="text-blue-400 hover:underline">
                          {m.recipe.resultItemName}
                        </Link>
                        {m.recipe.resultQty > 1 && (
                          <span className="text-gray-500 ml-1">x{m.recipe.resultQty}</span>
                        )}
                      </td>
                      <td className="py-1 px-2 text-gray-300">
                        {m.recipe.primaryCraft} {m.recipe.primaryCraftLevel}
                      </td>
                      <td className="py-1 px-2 text-xs text-red-400">
                        {m.missingDetails.map((d, i) => (
                          <span key={d.name}>
                            {i > 0 && ', '}
                            {d.name} (need {d.deficit} more)
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {almostPages > 1 && (
              <Pagination page={almostPage} totalPages={almostPages} onPageChange={setAlmostPage} />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Pagination({ page, totalPages, onPageChange }: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  return (
    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300"
        >
          Prev
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-gray-300"
        >
          Next
        </button>
      </div>
    </div>
  )
}
