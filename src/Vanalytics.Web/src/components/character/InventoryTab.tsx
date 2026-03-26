import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { InventoryByBag, InventoryItem } from '../../types/api'

const BAG_ORDER = [
  'Inventory', 'Safe', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

interface Props {
  characterId: string
}

export default function InventoryTab({ characterId }: Props) {
  const [inventory, setInventory] = useState<InventoryByBag | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeBag, setActiveBag] = useState<string>('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    api<InventoryByBag>(`/api/characters/${characterId}/inventory`)
      .then(data => {
        setInventory(data)
        // Set active bag to first available bag
        const bags = BAG_ORDER.filter(b => data[b] && data[b].length > 0)
        if (bags.length > 0 && !activeBag) setActiveBag(bags[0])
      })
      .catch(() => setInventory(null))
      .finally(() => setLoading(false))
  }, [characterId])

  const availableBags = useMemo(() => {
    if (!inventory) return []
    return BAG_ORDER.filter(b => inventory[b] && inventory[b].length > 0)
  }, [inventory])

  const activeItems = useMemo(() => {
    if (!inventory || !activeBag || !inventory[activeBag]) return []
    const items = inventory[activeBag]
    if (!search) return items
    const q = search.toLowerCase()
    return items.filter(item =>
      item.itemName.toLowerCase().includes(q) ||
      String(item.itemId).includes(q)
    )
  }, [inventory, activeBag, search])

  if (loading) return <p className="text-gray-400 py-4">Loading inventory...</p>
  if (!inventory || availableBags.length === 0) {
    return <p className="text-gray-400 py-4">No inventory data yet.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-64 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Bag tabs */}
      <div className="flex flex-wrap gap-1 border-b border-gray-700 mb-4">
        {availableBags.map(bag => (
          <button
            key={bag}
            onClick={() => setActiveBag(bag)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              activeBag === bag
                ? 'text-blue-400 border-b-2 border-blue-400 -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {bag}
            <span className="ml-1.5 text-xs text-gray-500">
              ({inventory[bag]?.length ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* Items table */}
      {activeItems.length === 0 ? (
        <p className="text-gray-400 text-sm py-4">
          {search ? 'No items match your search.' : 'This bag is empty.'}
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
              <th className="px-4 py-2 text-left w-12"></th>
              <th className="px-4 py-2 text-left">Item</th>
              <th className="px-4 py-2 text-left">Category</th>
              <th className="px-4 py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {activeItems.map(item => (
              <tr
                key={`${item.slotIndex}-${item.itemId}`}
                className="border-t border-gray-700/50 hover:bg-gray-800/50"
              >
                <td className="px-4 py-1.5">
                  {item.iconPath && (
                    <img
                      src={`/item-images/${item.iconPath}`}
                      alt=""
                      className="w-6 h-6"
                      loading="lazy"
                    />
                  )}
                </td>
                <td className="px-4 py-1.5 text-gray-100">
                  {item.itemName}
                  <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
                </td>
                <td className="px-4 py-1.5 text-gray-400">{item.category ?? '—'}</td>
                <td className="px-4 py-1.5 text-right text-gray-300">
                  {item.quantity}{item.stackSize > 1 ? `/${item.stackSize}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
