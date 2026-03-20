import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CharacterDetailPage from './pages/CharacterDetailPage'
import ApiKeysPage from './pages/ApiKeysPage'
import PublicProfilePage from './pages/PublicProfilePage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/characters/:id"
              element={
                <ProtectedRoute>
                  <CharacterDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/keys"
              element={
                <ProtectedRoute>
                  <ApiKeysPage />
                </ProtectedRoute>
              }
            />
            <Route path="/:server/:name" element={<PublicProfilePage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
