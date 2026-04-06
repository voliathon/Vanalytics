import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../api/client'
import type { CharacterSummary, InventoryByBag } from '../../types/api'

interface IngredientNeeded {
  itemId: number
  name: string
  iconPath: string | null
  quantity: number
}

interface Props {
  ingredients: IngredientNeeded[]
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

export default function RecipeInventoryCheck({ ingredients }: Props) {
  const { user } = useAuth()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  const [inventoryByBag, setInventoryByBag] = useState<InventoryByBag | null>(null)
  const [loadingChars, setLoadingChars] = useState(true)
  const [loadingInventory, setLoadingInventory] = useState(false)

  // Fetch character list
  useEffect(() => {
    if (!user) return
    setLoadingChars(true)
    api<CharacterSummary[]>('/api/characters')
      .then((chars) => {
        const sorted = [...chars].sort((a, b) => {
          if (!a.lastSyncAt && !b.lastSyncAt) return 0
          if (!a.lastSyncAt) return 1
          if (!b.lastSyncAt) return -1
          return new Date(b.lastSyncAt).getTime() - new Date(a.lastSyncAt).getTime()
        })
        setCharacters(sorted)
        if (sorted.length > 0) setSelectedCharId(sorted[0].id)
      })
      .catch(() => setCharacters([]))
      .finally(() => setLoadingChars(false))
  }, [user])

  // Fetch inventory when character changes
  useEffect(() => {
    if (!selectedCharId) {
      setInventoryByBag(null)
      return
    }
    setLoadingInventory(true)
    setInventoryByBag(null)
    api<InventoryByBag>(`/api/characters/${selectedCharId}/inventory`)
      .then(setInventoryByBag)
      .catch(() => setInventoryByBag(null))
      .finally(() => setLoadingInventory(false))
  }, [selectedCharId])

  // Build item quantity map from all bags
  const quantityMap = useMemo(() => {
    const map = new Map<number, number>()
    if (!inventoryByBag) return map
    for (const items of Object.values(inventoryByBag)) {
      for (const item of items) {
        map.set(item.itemId, (map.get(item.itemId) ?? 0) + item.quantity)
      }
    }
    return map
  }, [inventoryByBag])

  // Craft count
  const craftCount = useMemo(() => {
    if (!inventoryByBag) return 0
    const counts = ingredients.map((i) => {
      const owned = quantityMap.get(i.itemId) ?? 0
      return Math.floor(owned / i.quantity)
    })
    return Math.min(...counts)
  }, [ingredients, quantityMap, inventoryByBag])

  if (!user) return null

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4 mt-4">
      <h2 className="text-sm font-semibold text-gray-400 mb-3">Your Inventory</h2>

      {/* Character selector */}
      {!loadingChars && characters.length === 0 && (
        <p className="text-sm text-gray-500">No characters synced yet.</p>
      )}

      {!loadingChars && characters.length > 1 && (
        <select
          value={selectedCharId ?? ''}
          onChange={(e) => setSelectedCharId(e.target.value)}
          className="bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm px-3 py-1.5 mb-3"
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.server})
            </option>
          ))}
        </select>
      )}

      {/* Loading state */}
      {loadingInventory && (
        <p className="text-sm text-gray-400">Checking inventory...</p>
      )}

      {/* Ingredient table */}
      {!loadingInventory && inventoryByBag !== null && characters.length > 0 && (
        <>
          <ul className="space-y-1 mb-3">
            {ingredients.map((ing) => {
              const owned = quantityMap.get(ing.itemId) ?? 0
              const sufficient = owned >= ing.quantity
              const deficit = ing.quantity - owned
              return (
                <li key={ing.itemId} className="flex items-center gap-2 py-1">
                  <ItemIcon iconPath={ing.iconPath} size={24} />
                  <span className="flex-1 text-sm text-gray-300 truncate">{ing.name}</span>
                  <span className="text-sm text-gray-500 shrink-0">&times;{ing.quantity}</span>
                  <span className={`text-sm shrink-0 w-10 text-right ${sufficient ? 'text-green-400' : 'text-red-400'}`}>
                    {owned}
                  </span>
                  <span className="text-xs shrink-0 w-20 text-right">
                    {sufficient
                      ? <span className="text-green-400">&#10003;</span>
                      : <span className="text-red-400">need {deficit} more</span>
                    }
                  </span>
                </li>
              )
            })}
          </ul>

          {/* Craft count summary */}
          {craftCount > 0 ? (
            <p className="text-sm text-green-400">You can craft this &times;{craftCount} times</p>
          ) : (
            <p className="text-sm text-gray-500">Missing ingredients — cannot craft</p>
          )}
        </>
      )}
    </div>
  )
}
