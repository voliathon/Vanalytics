import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import type { RecipeSearchResult, RecipeSummary } from '../types/api'
import { api } from '../api/client'

const CRAFT_OPTIONS: [string, string][] = [
  ['wood', 'Woodworking'], ['smith', 'Smithing'], ['gold', 'Goldsmithing'],
  ['cloth', 'Clothcraft'], ['leather', 'Leathercraft'], ['bone', 'Bonecraft'],
  ['alchemy', 'Alchemy'], ['cook', 'Cooking'],
]

function estimateCost(recipe: RecipeSummary): number {
  if (!recipe.ingredients) return 0
  return recipe.ingredients.reduce(
    (sum, ing) => sum + ing.quantity * (ing.baseSell ?? 0),
    0
  )
}

function formatCost(cost: number): string {
  if (cost === 0) return '\u2014'
  return cost.toLocaleString()
}

export default function RecipeBrowserPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const activeTab = searchParams.get('tab') === 'guide' ? 'guide' : 'browse'

  // ---- Browse tab state ----
  const [craft, setCraft] = useState(searchParams.get('craft') || '')
  const [minLevel, setMinLevel] = useState(searchParams.get('minLevel') || '')
  const [maxLevel, setMaxLevel] = useState(searchParams.get('maxLevel') || '')
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'level')
  const [sortDir, setSortDir] = useState(searchParams.get('sortDir') || 'asc')
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1)
  const [browseResult, setBrowseResult] = useState<RecipeSearchResult | null>(null)
  const [browseLoading, setBrowseLoading] = useState(false)

  // ---- Guide tab state ----
  const [guideCraft, setGuideCraft] = useState(searchParams.get('craft') || '')
  const [guideLevel, setGuideLevel] = useState(searchParams.get('level') || '')
  const [guideResult, setGuideResult] = useState<RecipeSearchResult | null>(null)
  const [guideLoading, setGuideLoading] = useState(false)

  // ---- Tab switching ----
  const setTab = useCallback((tab: 'browse' | 'guide') => {
    const params = new URLSearchParams()
    if (tab === 'guide') params.set('tab', 'guide')
    setSearchParams(params, { replace: true })
  }, [setSearchParams])

  // ---- Browse: sync URL ----
  const syncBrowseUrl = useCallback(() => {
    const params = new URLSearchParams()
    if (craft) params.set('craft', craft)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)
    if (search) params.set('search', search)
    if (sortBy && sortBy !== 'level') params.set('sortBy', sortBy)
    if (sortDir === 'desc') params.set('sortDir', 'desc')
    if (page > 1) params.set('page', page.toString())
    setSearchParams(params, { replace: true })
  }, [craft, minLevel, maxLevel, search, sortBy, sortDir, page, setSearchParams])

  // ---- Browse: reset page on filter change ----
  useEffect(() => {
    if (activeTab === 'browse') setPage(1)
  }, [craft, minLevel, maxLevel, search, sortBy, sortDir]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Browse: fetch ----
  useEffect(() => {
    if (activeTab !== 'browse') return
    syncBrowseUrl()
    setBrowseLoading(true)

    const params = new URLSearchParams()
    if (craft) params.set('craft', craft)
    if (minLevel) params.set('minLevel', minLevel)
    if (maxLevel) params.set('maxLevel', maxLevel)
    if (search) params.set('search', search)
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    params.set('page', page.toString())
    params.set('pageSize', '50')

    api<RecipeSearchResult>(`/api/recipes?${params}`)
      .then(setBrowseResult)
      .catch(() => setBrowseResult(null))
      .finally(() => setBrowseLoading(false))
  }, [activeTab, craft, minLevel, maxLevel, search, sortBy, sortDir, page]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Guide: sync URL ----
  const syncGuideUrl = useCallback(() => {
    const params = new URLSearchParams()
    params.set('tab', 'guide')
    if (guideCraft) params.set('craft', guideCraft)
    if (guideLevel) params.set('level', guideLevel)
    setSearchParams(params, { replace: true })
  }, [guideCraft, guideLevel, setSearchParams])

  // ---- Guide: fetch ----
  useEffect(() => {
    if (activeTab !== 'guide') return
    syncGuideUrl()

    if (!guideCraft || !guideLevel) {
      setGuideResult(null)
      return
    }

    const lvl = Number(guideLevel)
    if (isNaN(lvl) || lvl < 1 || lvl > 110) return

    setGuideLoading(true)
    const minLvl = Math.max(1, lvl - 5)
    const maxLvl = lvl + 5
    const params = new URLSearchParams()
    params.set('craft', guideCraft)
    params.set('minLevel', minLvl.toString())
    params.set('maxLevel', maxLvl.toString())
    params.set('includeIngredients', 'true')
    params.set('sortBy', 'level')
    params.set('sortDir', 'asc')
    params.set('pageSize', '200')

    api<RecipeSearchResult>(`/api/recipes?${params}`)
      .then(setGuideResult)
      .catch(() => setGuideResult(null))
      .finally(() => setGuideLoading(false))
  }, [activeTab, guideCraft, guideLevel]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Guide: sorted recipes by cost ----
  const guideSorted = useMemo(() => {
    if (!guideResult) return []
    return [...guideResult.recipes].sort((a, b) => estimateCost(a) - estimateCost(b))
  }, [guideResult])

  // ---- Browse: sort handler ----
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('asc')
    }
  }

  const totalPages = browseResult ? Math.ceil(browseResult.totalCount / browseResult.pageSize) : 1
  const sortIndicator = (field: string) =>
    sortBy === field ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : ''

  const inputClass = 'bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm px-3 py-1.5 focus:outline-none focus:border-blue-500'

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Recipes</h1>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-700 mb-4">
        <button
          onClick={() => setTab('browse')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'browse'
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Browse
        </button>
        <button
          onClick={() => setTab('guide')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'guide'
              ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Leveling Guide
        </button>
      </div>

      {/* ==================== Browse Tab ==================== */}
      {activeTab === 'browse' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={craft}
              onChange={(e) => setCraft(e.target.value)}
              className={inputClass}
            >
              <option value="">All Crafts</option>
              {CRAFT_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Min Level"
              value={minLevel}
              onChange={(e) => setMinLevel(e.target.value)}
              className={`w-24 ${inputClass}`}
            />
            <input
              type="number"
              placeholder="Max Level"
              value={maxLevel}
              onChange={(e) => setMaxLevel(e.target.value)}
              className={`w-24 ${inputClass}`}
            />
            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`flex-1 min-w-48 ${inputClass}`}
            />
          </div>

          {browseLoading ? (
            <p className="text-gray-400">Loading recipes...</p>
          ) : browseResult && browseResult.recipes.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-10"></th>
                      <th
                        className="text-left px-3 py-2 text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                        onClick={() => handleSort('name')}
                      >
                        Result{sortIndicator('name')}
                      </th>
                      <th
                        className="text-left px-3 py-2 text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                        onClick={() => handleSort('level')}
                      >
                        Craft / Level{sortIndicator('level')}
                      </th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Sub-craft</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-10">Crystal</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Ingredients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {browseResult.recipes.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/recipes/${r.id}`)}
                        className="border-t border-gray-700/50 hover:bg-gray-800/50 cursor-pointer"
                      >
                        <td className="px-3 py-2">
                          {r.resultItemIcon && (
                            <img
                              src={`/item-images/${r.resultItemIcon}`}
                              alt=""
                              className="w-8 h-8"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="text-blue-400 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/recipes/${r.id}`)
                            }}
                          >
                            {r.resultItemName}
                            {r.resultQty > 1 && ` x${r.resultQty}`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {r.primaryCraft} {r.primaryCraftLevel}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {r.subCrafts.map(sc => `${sc.craft} ${sc.level}`).join(', ') || '\u2014'}
                        </td>
                        <td className="px-3 py-2">
                          {r.crystalIcon && (
                            <img
                              src={`/item-images/${r.crystalIcon}`}
                              alt={r.crystalName}
                              title={r.crystalName}
                              className="w-8 h-8"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {r.ingredientCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-gray-500">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded px-3 py-1.5 text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-gray-500">No recipes found.</p>
          )}
        </div>
      )}

      {/* ==================== Leveling Guide Tab ==================== */}
      {activeTab === 'guide' && (
        <div>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 mb-4">
            <select
              value={guideCraft}
              onChange={(e) => setGuideCraft(e.target.value)}
              className={inputClass}
            >
              <option value="">Select Craft</option>
              {CRAFT_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Current Level"
              min={1}
              max={110}
              value={guideLevel}
              onChange={(e) => setGuideLevel(e.target.value)}
              className={`w-32 ${inputClass}`}
            />
          </div>

          {!guideCraft || !guideLevel ? (
            <p className="text-gray-500">
              Select a craft and enter your current level to see skillup recipes.
            </p>
          ) : guideLoading ? (
            <p className="text-gray-400">Loading recipes...</p>
          ) : guideSorted.length > 0 ? (
            <>
              <p className="text-sm text-gray-400 mb-3">
                Recipes that can give skillups at level {guideLevel} ({CRAFT_OPTIONS.find(([v]) => v === guideCraft)?.[1] ?? guideCraft})
                {' '}&mdash; {guideSorted.length} results
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Result</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Level</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium w-10">Crystal</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Est. Cost</th>
                      <th className="text-left px-3 py-2 text-gray-400 font-medium">Ingredients</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guideSorted.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => navigate(`/recipes/${r.id}`)}
                        className="border-t border-gray-700/50 hover:bg-gray-800/50 cursor-pointer"
                      >
                        <td className="px-3 py-2 flex items-center gap-2">
                          {r.resultItemIcon && (
                            <img
                              src={`/item-images/${r.resultItemIcon}`}
                              alt=""
                              className="w-8 h-8 flex-shrink-0"
                            />
                          )}
                          <span
                            className="text-blue-400 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/recipes/${r.id}`)
                            }}
                          >
                            {r.resultItemName}
                            {r.resultQty > 1 && ` x${r.resultQty}`}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {r.primaryCraftLevel}
                        </td>
                        <td className="px-3 py-2">
                          {r.crystalIcon && (
                            <img
                              src={`/item-images/${r.crystalIcon}`}
                              alt={r.crystalName}
                              title={r.crystalName}
                              className="w-8 h-8"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-300">
                          {formatCost(estimateCost(r))}
                        </td>
                        <td className="px-3 py-2 text-gray-400 max-w-xs truncate">
                          {r.ingredients?.map(i => i.name).join(', ') || '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-gray-500">No recipes found for this level range.</p>
          )}
        </div>
      )}
    </div>
  )
}
