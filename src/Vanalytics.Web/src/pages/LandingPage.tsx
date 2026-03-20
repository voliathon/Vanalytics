import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="text-center py-20">
      <h1 className="text-5xl font-bold mb-4">
        <span className="text-blue-400">Vanalytics</span>
      </h1>
      <p className="text-xl text-gray-400 mb-2">Vana'diel + Analytics</p>
      <p className="text-gray-500 mb-8 max-w-lg mx-auto">
        Track your Final Fantasy XI character progress. Sync your jobs, gear,
        and crafting skills automatically with the Windower addon.
      </p>
      <div className="flex justify-center gap-4">
        {user ? (
          <Link
            to="/dashboard"
            className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            to="/login"
            className="rounded bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Get Started
          </Link>
        )}
      </div>
    </div>
  )
}
