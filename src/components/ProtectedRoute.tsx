import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'
import { Loader } from './Loader'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loader full />
  if (!user) return <Navigate to="/masuk" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}
