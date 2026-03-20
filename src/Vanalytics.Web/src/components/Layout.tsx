import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <nav className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold text-blue-400">
            Vanalytics
          </Link>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Link to="/dashboard" className="text-gray-300 hover:text-white">
                  Dashboard
                </Link>
                <Link to="/dashboard/keys" className="text-gray-300 hover:text-white">
                  API Keys
                </Link>
                <button
                  onClick={logout}
                  className="text-gray-400 hover:text-white"
                >
                  Logout
                </button>
                <span className="text-sm text-gray-500">{user.username}</span>
              </>
            ) : (
              <Link
                to="/login"
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium hover:bg-blue-500"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
