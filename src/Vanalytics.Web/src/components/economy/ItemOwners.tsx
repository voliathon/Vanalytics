import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api/client'
import type { ItemOwnersResponse, ItemOwnerEntry } from '../../types/api'
import LoadingSpinner from '../LoadingSpinner'

function OwnerRow({ owner }: { owner: ItemOwnerEntry }) {
  return (
    <tr
      className="border-t border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
    >
      <td className="px-3 py-2">
        <Link
          to={`/${owner.server}/${owner.name}`}
          className="font-medium text-gray-100 hover:text-blue-400 hover:underline"
        >
          {owner.name}
        </Link>
      </td>
      <td className="px-3 py-2 text-gray-400">{owner.server}</td>
      <td className="px-3 py-2 text-gray-400">
        {owner.job && owner.level ? `${owner.job} ${owner.level}` : '—'}
      </td>
    </tr>
  )
}

function OwnerTable({ entries, emptyText }: { entries: ItemOwnerEntry[]; emptyText: string }) {
  if (entries.length === 0) {
    return <p className="text-sm text-gray-500 py-3">{emptyText}</p>
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
          <th className="px-3 py-2">Name</th>
          <th className="px-3 py-2">Server</th>
          <th className="px-3 py-2">Job</th>
        </tr>
      </thead>
      <tbody>
        {entries.map(e => (
          <OwnerRow key={`${e.server}-${e.name}`} owner={e} />
        ))}
      </tbody>
    </table>
  )
}

export default function ItemOwners({ itemId }: { itemId: number }) {
  const [data, setData] = useState<ItemOwnersResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api<ItemOwnersResponse>(`/api/items/${itemId}/owners`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [itemId])

  if (loading) return <LoadingSpinner />
  if (!data) return <p className="text-sm text-gray-500">Failed to load owner data.</p>

  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-400 mb-3">Who's Using This?</h2>

      <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Equipped by</h3>
      <OwnerTable
        entries={data.equipped}
        emptyText="No public characters have this equipped."
      />

      {data.inventory.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Also in inventory</h3>
          <OwnerTable
            entries={data.inventory}
            emptyText=""
          />
        </div>
      )}
    </div>
  )
}
