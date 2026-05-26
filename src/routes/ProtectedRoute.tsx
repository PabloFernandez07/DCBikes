import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

// Allowlist de emails admin. CSV en VITE_ADMIN_EMAILS (.env.local + Vercel
// env vars en prod). Si no está configurado, fail-closed (rechaza todo).
// IMPORTANTE: el frontend NO es la fuente de verdad — el backend
// (requireAdmin en _shared/order-admin.ts) hace su propio check de allowlist
// con su env var ADMIN_EMAILS. Este check evita que el frontend exponga
// la UI de admin a usuarios no autorizados, pero NO autoriza nada por sí solo.
const ADMIN_EMAILS_RAW = (import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? ''
const ADMIN_EMAILS = ADMIN_EMAILS_RAW
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  if (ADMIN_EMAILS.length === 0) {
    // Fail-closed: si el env var no está configurado en build, rechazamos todo.
    // Excepción: en dev local sin VITE_ADMIN_EMAILS dejamos pasar (no bloquea
    // desarrollo). Detección via import.meta.env.DEV.
    return import.meta.env.DEV === true
  }
  return ADMIN_EMAILS.includes(email.toLowerCase())
}

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-ink)]">
      <div className="w-8 h-8 border-2 border-[var(--color-lavender)] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/admin/login" replace />
  if (!isAdminEmail(user.email)) {
    // Usuario autenticado pero NO en allowlist — bloqueamos UI.
    // Para forzar logout completo el user debería cerrar sesión desde
    // /admin/login (lo expondremos como mensaje en una iteración futura).
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-ink)] p-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            ACCESO DENEGADO
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
            Tu cuenta no tiene permisos de administrador en esta tienda.
            Si crees que es un error, contacta con el administrador del sitio.
          </p>
          <a
            href="/admin/login"
            className="inline-block mt-4 px-4 py-2 rounded-lg bg-[var(--color-lavender)] text-[var(--color-ink)] text-sm font-[var(--font-cond)] tracking-wide"
          >
            Volver a login
          </a>
        </div>
      </div>
    )
  }
  return <Outlet />
}
