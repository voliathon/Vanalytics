import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { ItemRecipeInfo } from '../../types/api'

interface Props {
  itemId: number
}

export default function ItemCrafting({ itemId }: Props) {
  const [data, setData] = useState<ItemRecipeInfo | null>(null)

  useEffect(() => {
    api<ItemRecipeInfo>(`/api/recipes/by-item/${itemId}`)
      .then(setData)
      .catch(() => setData(null))
  }, [itemId])

  if (!data) return null
  if (data.craftedFrom.length === 0 && data.usedIn.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-3">Crafting</h2>

      {data.craftedFrom.length > 0 && (
        <div className="mb-3">
          <p className="text-xs uppercase text-gray-500 mb-1.5">Crafted From</p>
          <ul className="space-y-1">
            {data.craftedFrom.map((r) => (
              <li key={r.id}>
                <Link to={`/recipes/${r.id}`} className="text-sm text-gray-300 hover:text-blue-400">
                  {r.primaryCraft} Lv.{r.primaryCraftLevel} &mdash; {r.resultItemName}
                  {r.resultQty > 1 && (
                    <span className="ml-1 text-gray-400">&times;{r.resultQty}</span>
                  )}
                  {r.isHqResult && (
                    <span className="ml-1 text-yellow-400 font-medium">(HQ)</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.usedIn.length > 0 && (
        <div>
          <p className="text-xs uppercase text-gray-500 mb-1.5">Used In</p>
          <ul className="space-y-1">
            {data.usedIn.map((r) => (
              <li key={r.id}>
                <Link to={`/recipes/${r.id}`} className="text-sm text-gray-300 hover:text-blue-400">
                  {r.primaryCraft} Lv.{r.primaryCraftLevel} &mdash; {r.resultItemName}
                </Link>
                {r.quantity > 1 && (
                  <span className="ml-1 text-xs text-gray-500">(&times;{r.quantity} needed)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
