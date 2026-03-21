import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function SidebarLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `block rounded px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-gray-800 text-white'
            : 'text-gray-400 hover:bg-gray-800/50 hover:text-gray-200'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Public pages (landing, login, public profiles) get no sidebar
  const isPublicPage =
    location.pathname === '/' ||
    location.pathname === '/login' ||
    (!user && !location.pathname.startsWith('/dashboard'))

  if (isPublicPage) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100">
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Outlet />
        </main>
      </div>
    )
  }

  // Dashboard pages get the sidebar layout
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-gray-800 bg-gray-900 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="border-b border-gray-800 px-4 py-4">
          <Link to="/" className="flex items-center gap-2 min-w-0" onClick={() => setSidebarOpen(false)}>
            <img src="/vanalytics-square-logo.png" alt="" className="h-8 w-8 shrink-0" />
            <img
              src="/vanalytics-typography-horizontal-logo.png"
              alt="Vana'lytics"
              className="min-w-0 max-w-full"
            />
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-3 py-4" onClick={() => setSidebarOpen(false)}>
          <SidebarLink to="/dashboard" label="Characters" />
          <SidebarLink to="/dashboard/keys" label="API Keys" />
        </nav>

        {/* User footer */}
        <div className="border-t border-gray-800 px-4 py-3">
          <p className="text-sm text-gray-400 truncate mb-2">{user?.username}</p>
          <button
            onClick={() => { logout(); setSidebarOpen(false) }}
            className="w-full rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-400 hover:text-white"
            aria-label="Open menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <Link to="/" className="flex items-center gap-2">
            <img src="/vanalytics-square-logo.png" alt="" className="h-7 w-7" />
            <img src="/vanalytics-typography-horizontal-logo.png" alt="Vana'lytics" className="h-5" />
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
