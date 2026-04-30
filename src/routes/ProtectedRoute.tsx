import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-ink)]">
      <div className="w-8 h-8 border-2 border-[var(--color-lavender)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/admin/login" replace />
  return <Outlet />
}
