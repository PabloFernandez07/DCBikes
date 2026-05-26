import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useIsAdmin } from '@/hooks/useIsAdmin'

export function ProtectedRoute() {
  const { user, loading, signOut } = useAuth()
  const adminCheck = useIsAdmin()
  const navigate = useNavigate()

  if (loading || (user && adminCheck.loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-ink)]">
        <div className="w-8 h-8 border-2 border-[var(--color-lavender)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!user) return <Navigate to="/admin/login" replace />
  if (!adminCheck.isAdmin) {
    const handleBackToLogin = async () => {
      await signOut()
      navigate('/admin/login', { replace: true })
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-ink)] p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            ACCESO DENEGADO
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
            Tu cuenta <strong className="text-[var(--color-cream)]">{user.email}</strong> no tiene
            permisos de administrador. Si crees que es un error, contacta con el titular.
          </p>
          <button
            type="button"
            onClick={handleBackToLogin}
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-[var(--color-lavender)] text-[var(--color-ink)] text-sm font-[var(--font-cond)] tracking-wide hover:opacity-90 transition-opacity"
          >
            Cerrar sesión y volver
          </button>
        </div>
      </div>
    )
  }
  return <Outlet />
}
