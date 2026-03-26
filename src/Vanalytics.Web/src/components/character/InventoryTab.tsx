import { useState, useEffect, useMemo } from 'react'
import { api } from '../../api/client'
import type { InventoryByBag, InventoryItem } from '../../types/api'

const BAG_ORDER = [
  'Inventory', 'Safe', 'Storage', 'Locker',
  'Satchel', 'Sack', 'Case',
  'Wardrobe', 'Wardrobe2', 'Wardrobe3', 'Wardrobe4',
  'Wardrobe5', 'Wardrobe6', 'Wardrobe7', 'Wardrobe8',
]

type SortField = 'itemName' | 'category' | 'quantity'
type SortDir = 'asc' | 'desc'

interface Props {
  characterId: string
}

export default function InventoryTab({ characterId }: Props) {
  const [inventory, setInventory] = useState<InventoryByBag | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeBag, setActiveBag] = useState<string>('')
  const [search, setSearch] = useState('')
  const [tableExpanded, setTableExpanded] = useState(false)
  const [sortField, setSortField] = useState<SortField>('itemName')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [categoryFilter, setCategoryFilter] = useState<string>('')

  useEffect(() => {
    setLoading(true)
    api<InventoryByBag>(`/api/characters/${characterId}/inventory`)
      .then(data => {
        setInventory(data)
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

  // All categories across all bags for the filter dropdown
  const allCategories = useMemo(() => {
    if (!inventory) return []
    const cats = new Set<string>()
    for (const items of Object.values(inventory)) {
      for (const item of items) {
        if (item.category) cats.add(item.category)
      }
    }
    return Array.from(cats).sort()
  }, [inventory])

  const isSearching = search.length > 0

  // Search results across all bags
  const searchResults = useMemo(() => {
    if (!inventory || !isSearching) return []
    const q = search.toLowerCase()
    const results: (InventoryItem & { bag: string })[] = []
    for (const bag of BAG_ORDER) {
      const items = inventory[bag]
      if (!items) continue
      for (const item of items) {
        if (item.itemName.toLowerCase().includes(q) || String(item.itemId).includes(q)) {
          results.push({ ...item, bag })
        }
      }
    }
    return results
  }, [inventory, search, isSearching])

  // Items for the active bag tab — filtered and sorted
  const activeItems = useMemo(() => {
    if (!inventory || !activeBag || !inventory[activeBag]) return []
    let items = [...inventory[activeBag]]

    if (categoryFilter) {
      items = items.filter(item => item.category === categoryFilter)
    }

    items.sort((a, b) => {
      let cmp = 0
      if (sortField === 'itemName') cmp = a.itemName.localeCompare(b.itemName)
      else if (sortField === 'category') cmp = (a.category ?? '').localeCompare(b.category ?? '')
      else if (sortField === 'quantity') cmp = a.quantity - b.quantity
      return sortDir === 'desc' ? -cmp : cmp
    })

    return items
  }, [inventory, activeBag, sortField, sortDir, categoryFilter])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  const handleSearchResultClick = (bag: string) => {
    setActiveBag(bag)
    setTableExpanded(true)
    setSearch('')
  }

  const handleBagClick = (bag: string) => {
    if (activeBag === bag) {
      setTableExpanded(prev => !prev)
    } else {
      setActiveBag(bag)
      setTableExpanded(true)
    }
  }

  if (loading) return <p className="text-gray-400 py-4">Loading inventory...</p>
  if (!inventory || availableBags.length === 0) {
    return <p className="text-gray-400 py-4">No inventory data yet.</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Inventory</h2>
        <div className="relative w-64">
          <input
            type="text"
            placeholder="Search all bags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 pr-8 bg-gray-700 border border-gray-600 rounded text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 text-sm"
              aria-label="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* Search results (cross-bag) */}
      {isSearching && (
        searchResults.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No items match your search.</p>
        ) : (
          <div>
            <p className="text-gray-400 text-xs mb-2">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} across all bags
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                  <th className="px-4 py-2 text-left w-10"></th>
                  <th className="px-4 py-2 text-left">Item</th>
                  <th className="px-4 py-2 text-left">Category</th>
                  <th className="px-4 py-2 text-left">Bag</th>
                  <th className="px-4 py-2 text-right w-20">Qty</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.map(item => (
                  <tr
                    key={`${item.bag}-${item.slotIndex}-${item.itemId}`}
                    className="border-t border-gray-700/50 hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => handleSearchResultClick(item.bag)}
                  >
                    <td className="px-4 py-1.5">
                      {item.iconPath && (
                        <img src={`/item-images/${item.iconPath}`} alt="" className="w-6 h-6" loading="lazy" />
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-gray-100">
                      {item.itemName}
                      <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
                    </td>
                    <td className="px-4 py-1.5 text-gray-400">{item.category ?? '\u2014'}</td>
                    <td className="px-4 py-1.5 text-gray-400">{item.bag}</td>
                    <td className="px-4 py-1.5 text-right text-gray-300">
                      {item.quantity}{item.stackSize > 1 ? `/${item.stackSize}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Bag tabs + collapsible table */}
      {!isSearching && (
        <>
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-700 mb-4">
            {availableBags.map(bag => (
              <button
                key={bag}
                onClick={() => handleBagClick(bag)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  activeBag === bag && tableExpanded
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
            {tableExpanded && (
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="ml-auto px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>

          {tableExpanded && (
            activeItems.length === 0 ? (
              <p className="text-gray-400 text-sm py-4">
                {categoryFilter ? 'No items in this category.' : 'This bag is empty.'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-400 text-xs uppercase">
                    <th className="px-4 py-2 text-left w-10"></th>
                    <th
                      className="px-4 py-2 text-left cursor-pointer hover:text-gray-200 select-none"
                      onClick={() => handleSort('itemName')}
                    >
                      Item{sortIndicator('itemName')}
                    </th>
                    <th
                      className="px-4 py-2 text-left cursor-pointer hover:text-gray-200 select-none"
                      onClick={() => handleSort('category')}
                    >
                      Category{sortIndicator('category')}
                    </th>
                    <th
                      className="px-4 py-2 text-right cursor-pointer hover:text-gray-200 select-none w-20"
                      onClick={() => handleSort('quantity')}
                    >
                      Qty{sortIndicator('quantity')}
                    </th>
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
                          <img src={`/item-images/${item.iconPath}`} alt="" className="w-6 h-6" loading="lazy" />
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-gray-100">
                        {item.itemName}
                        <span className="ml-2 text-gray-600 text-xs">#{item.itemId}</span>
                      </td>
                      <td className="px-4 py-1.5 text-gray-400">{item.category ?? '\u2014'}</td>
                      <td className="px-4 py-1.5 text-right text-gray-300">
                        {item.quantity}{item.stackSize > 1 ? `/${item.stackSize}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </>
      )}
    </div>
  )
}
