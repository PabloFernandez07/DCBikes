import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

// Acceso admin: cualquier usuario autenticado en Supabase Auth es admin.
// La seguridad real está en:
//   1. disable_signup=true en Supabase (nadie puede registrarse libremente).
//   2. Solo el propietario crea usuarios desde Supabase Studio.
//   3. RLS policies en la BD restringen escritura a authenticated.
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
