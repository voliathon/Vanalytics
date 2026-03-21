import { Link } from 'react-router-dom'

export default function BazaarActivityPage() {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src="/vanalytics-square-logo.png" alt="" className="h-10 w-10 shrink-0 -mr-1" />
        <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="h-6" />
      </div>

      <h1 className="text-2xl font-bold mb-2">Bazaar Activity</h1>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <p className="text-gray-400 mb-2">Bazaar tracking is coming soon.</p>
        <p className="text-sm text-gray-500 mb-4">
          Live bazaar presence detection and item browsing will be available in a future update.
        </p>
        <Link to="/items" className="text-sm text-blue-400 hover:underline">
          Browse the Item Database
        </Link>
      </div>
    </div>
  )
}
