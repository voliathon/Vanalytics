import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import type { RecipeDetail } from '../types/api'
import { api, ApiError } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import RecipeInventoryCheck from '../components/economy/RecipeInventoryCheck'

const CRAFT_KEYS: Record<string, string> = {
  Woodworking: 'wood',
  Smithing: 'smith',
  Goldsmithing: 'gold',
  Clothcraft: 'cloth',
  Leathercraft: 'leather',
  Bonecraft: 'bone',
  Alchemy: 'alchemy',
  Cooking: 'cook',
}

function ItemIcon({ iconPath, size }: { iconPath: string | null; size: number }) {
  if (!iconPath) return <div style={{ width: size, height: size }} className="rounded bg-gray-800 shrink-0" />
  return (
    <img
      src={`/item-images/${iconPath}`}
      alt=""
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  )
}

export default function RecipeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    setLoading(true)
    setNotFound(false)
    api<RecipeDetail>(`/api/recipes/${id}`)
      .then(setRecipe)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true)
        }
        setRecipe(null)
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <LoadingSpinner />

  if (notFound || !recipe) {
    return (
      <div className="py-8">
        <p className="text-gray-400 mb-3">Recipe not found.</p>
        <Link to="/recipes" className="text-sm text-blue-400 hover:underline">
          &larr; Back to Recipes
        </Link>
      </div>
    )
  }

  const craftKey = CRAFT_KEYS[recipe.primaryCraft] ?? recipe.primaryCraft.toLowerCase()

  // Determine HQ crystal display: only show if different item from NQ crystal
  const showHqCrystal =
    recipe.hqCrystal !== null && recipe.hqCrystal.itemId !== recipe.crystal.itemId

  // Collect non-null HQ results
  const hqResults: { label: string; result: NonNullable<RecipeDetail['resultHq1']> }[] = []
  if (recipe.resultHq1) hqResults.push({ label: 'HQ', result: recipe.resultHq1 })
  if (recipe.resultHq2) hqResults.push({ label: 'HQ2', result: recipe.resultHq2 })
  if (recipe.resultHq3) hqResults.push({ label: 'HQ3', result: recipe.resultHq3 })

  // Skill requirements: only non-zero entries
  const skillReqs = Object.entries(recipe.skillRequirements).filter(([, v]) => v > 0)

  const allIngredients = [
    { itemId: recipe.crystal.itemId, name: recipe.crystal.name, iconPath: recipe.crystal.iconPath, quantity: recipe.crystal.quantity },
    ...recipe.ingredients.map(i => ({ itemId: i.itemId, name: i.name, iconPath: i.iconPath, quantity: i.quantity })),
  ]

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-400 mb-4">
        <Link to="/recipes" className="hover:text-blue-400 hover:underline">
          Recipes
        </Link>
        <span className="text-gray-500">&gt;</span>
        <Link
          to={`/recipes?craft=${craftKey}`}
          className="hover:text-blue-400 hover:underline"
        >
          {recipe.primaryCraft}
        </Link>
        <span className="text-gray-500">&gt;</span>
        <span className="text-gray-300">{recipe.result.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <ItemIcon iconPath={recipe.result.iconPath} size={48} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold mb-1">
            <Link
              to={`/items/${recipe.result.itemId}`}
              className="hover:text-blue-400 hover:underline"
            >
              {recipe.result.name}
            </Link>
          </h1>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Primary craft */}
            <span className="bg-blue-900/50 text-blue-400 px-2 py-0.5 rounded text-xs font-medium">
              {recipe.primaryCraft} Lv.{recipe.primaryCraftLevel}
            </span>

            {/* Sub-crafts */}
            {recipe.subCrafts.map((sc, i) => (
              <span
                key={i}
                className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs font-medium"
              >
                {sc.craft} Lv.{sc.level}
              </span>
            ))}

            {/* Crystal */}
            <span className="flex items-center gap-1 bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs font-medium">
              <ItemIcon iconPath={recipe.crystal.iconPath} size={20} />
              {recipe.crystal.name}
            </span>

            {/* HQ Crystal (only if distinct) */}
            {showHqCrystal && recipe.hqCrystal && (
              <span className="flex items-center gap-1 bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs font-medium">
                <ItemIcon iconPath={recipe.hqCrystal.iconPath} size={20} />
                {recipe.hqCrystal.name}
              </span>
            )}

            {/* Desynth */}
            {recipe.isDesynth && (
              <span className="bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded text-xs font-medium">
                Desynth
              </span>
            )}

            {/* Content tag */}
            {recipe.contentTag && (
              <span className="bg-gray-800 text-gray-400 px-2 py-0.5 rounded text-xs font-medium">
                {recipe.contentTag}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Left: Ingredients */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Ingredients</h2>
            <ul className="space-y-1">
              {/* Crystal as first row */}
              <li className="flex items-center gap-2 py-1">
                <ItemIcon iconPath={recipe.crystal.iconPath} size={24} />
                <span className="flex-1 text-sm text-gray-300">{recipe.crystal.name}</span>
                <span className="text-sm text-gray-500">&times;{recipe.crystal.quantity}</span>
              </li>

              {/* Separator */}
              {recipe.ingredients.length > 0 && (
                <li className="border-t border-gray-700/60" />
              )}

              {/* Ingredients */}
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2 py-1">
                  <ItemIcon iconPath={ing.iconPath} size={24} />
                  <Link
                    to={`/items/${ing.itemId}`}
                    className="flex-1 text-sm text-blue-400 hover:underline truncate"
                  >
                    {ing.name}
                  </Link>
                  <span className="text-sm text-gray-500">&times;{ing.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-400 mb-3">Results</h2>
            <ul className="space-y-2">
              {/* NQ result */}
              <li className="flex items-center gap-3">
                <ItemIcon iconPath={recipe.result.iconPath} size={32} />
                <Link
                  to={`/items/${recipe.result.itemId}`}
                  className="flex-1 text-sm text-blue-400 hover:underline"
                >
                  {recipe.result.name}
                </Link>
                <span className="text-sm text-gray-500">&times;{recipe.result.quantity}</span>
                <span className="text-xs text-gray-500 w-10 text-right">Normal</span>
              </li>

              {/* HQ tiers */}
              {hqResults.map(({ label, result }) => (
                <li key={label} className="flex items-center gap-3">
                  <ItemIcon iconPath={result.iconPath} size={32} />
                  <Link
                    to={`/items/${result.itemId}`}
                    className="flex-1 text-sm text-blue-400 hover:underline"
                  >
                    {result.name}
                  </Link>
                  <span className="text-sm text-gray-500">&times;{result.quantity}</span>
                  <span className="text-xs text-yellow-400 w-10 text-right">{label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Skill Requirements */}
      {skillReqs.length > 0 && (
        <p className="text-sm text-gray-400">
          <span className="font-medium text-gray-300">Skill Requirements:</span>{' '}
          {skillReqs.map(([craft, level], i) => (
            <span key={craft}>
              {craft} {level}{i < skillReqs.length - 1 ? ', ' : ''}
            </span>
          ))}
        </p>
      )}

      <RecipeInventoryCheck ingredients={allIngredients} />
    </div>
  )
}
