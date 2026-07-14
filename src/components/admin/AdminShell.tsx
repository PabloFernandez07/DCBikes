import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  RotateCcw,
  FolderOpen,
  Layers,
  Upload,
  Images,
  MessageSquare,
  Settings,
  Menu,
  X,
  LogOut,
  Bike,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { onBadgeRefresh, type AdminBadge } from '@/lib/adminBadges'

type BadgeKey = AdminBadge

// Los dos badges avisan de trabajo PENDIENTE, así que solo cuentan lo que el dueño
// puede ver y atender. La papelera es un borrado lógico (deleted_at): una fila en la
// papelera ya no existe para él, aunque siga sin leer/sin aprobar. Sin el
// `.is('deleted_at', null)` el punto rojo seguía contando consultas que ya había
// tirado a la basura sin abrirlas (status sigue siendo 'new'), y lo mismo habría
// pasado con un pedido 'authorized' eliminado. Además así cuadran con las listas:
// OrdersList ya excluye los borrados en sus contadores y Quotes solo muestra las no
// borradas en la bandeja.
//
// Devuelven null si la consulta FALLA. Antes hacían `.then(({ count }) => count ?? 0)`
// sin mirar `error`: si la consulta se caía (RLS, sesión caducada, red), el badge
// mostraba 0 y el dueño concluía que no tenía trabajo pendiente. Un fallo de red no
// puede parecerse a una bandeja vacía. Con null, useBadgeCount conserva el último
// valor conocido en vez de inventarse un cero.
const badgeQueries: Record<BadgeKey, () => PromiseLike<number | null>> = {
  quotes: () =>
    supabase
      .from('quote_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .is('deleted_at', null)
      .then(({ count, error }) => {
        if (error) {
          console.error('[BADGE quotes]', error.message)
          return null
        }
        return count ?? 0
      }),
  orders: () =>
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'authorized')
      .is('deleted_at', null)
      .then(({ count, error }) => {
        if (error) {
          console.error('[BADGE orders]', error.message)
          return null
        }
        return count ?? 0
      }),
}

// El badge se quedaba pegado: solo consultaba al montar el AdminShell, y como es
// una SPA no se remonta al navegar → tras leer/responder una consulta seguía
// mostrando el contador viejo hasta recargar. Refresca cada 60 s, al cambiar de ruta
// y —lo que faltaba— cuando una pantalla avisa por el bus de que ha tocado los datos
// (p. ej. mandar una consulta a la papelera, que no cambia de ruta).
function useBadgeCount(badge: BadgeKey) {
  const [count, setCount] = useState(0)
  const { pathname } = useLocation()

  useEffect(() => {
    let cancelled = false

    const fetchCount = () => {
      badgeQueries[badge]().then(c => {
        // c === null → la consulta falló: se conserva el último valor conocido
        // en vez de enseñar un 0 que significaría «nada pendiente».
        if (!cancelled && c !== null) setCount(c)
      })
    }

    fetchCount()
    const interval = window.setInterval(fetchCount, 60_000)
    const unsubscribe = onBadgeRefresh(badge, fetchCount)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      unsubscribe()
    }
  }, [badge, pathname])

  return count
}

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end: boolean
  badge?: BadgeKey
}

const navItems: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/productos', label: 'Productos', icon: Package, end: false },
  { to: '/admin/pedidos', label: 'Pedidos', icon: ShoppingBag, end: false, badge: 'orders' },
  { to: '/admin/devoluciones', label: 'Devoluciones', icon: RotateCcw, end: false },
  { to: '/admin/categorias', label: 'Categorías', icon: FolderOpen, end: false },
  { to: '/admin/agrupaciones', label: 'Agrupaciones', icon: Layers, end: false },
  { to: '/admin/importar', label: 'Importar Excel', icon: Upload, end: false },
  { to: '/admin/imagenes', label: 'Imágenes', icon: Images, end: false },
  { to: '/admin/consultas', label: 'Consultas', icon: MessageSquare, end: false, badge: 'quotes' },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings, end: false },
  { to: '/admin/brechas', label: 'Brechas RGPD', icon: ShieldAlert, end: false },
]

export function AdminShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const pendingQuotes = useBadgeCount('quotes')
  const pendingOrders = useBadgeCount('orders')

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login')
  }

  const sidebar = (
    <aside
      className={clsx(
        'flex flex-col h-full w-60 bg-[var(--color-ink-deep)] border-r border-[var(--color-card)]',
      )}
    >
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-card)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-brand-red)] flex items-center justify-center shrink-0">
          <Bike size={16} className="text-white" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-[var(--font-cond)] font-semibold text-[var(--color-lavender)] tracking-widest uppercase leading-tight">
            DC Bikes
          </p>
          <p className="text-[10px] text-[var(--color-mid)] tracking-wide">Panel Admin</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const badgeValue =
            item.badge === 'quotes' ? pendingQuotes :
            item.badge === 'orders' ? pendingOrders :
            0
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-[var(--font-cond)] font-medium tracking-wide transition-all duration-150',
                  isActive
                    ? 'bg-[var(--color-lavender)]/15 text-[var(--color-lavender)]'
                    : 'text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)]',
                )
              }
            >
              <item.icon size={17} className="shrink-0" aria-hidden={true} />
              <span className="flex-1">{item.label}</span>
              {item.badge && badgeValue > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-brand-red)] text-white text-[10px] font-bold">
                  {badgeValue > 99 ? '99+' : badgeValue}
                </span>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-[var(--color-card)]">
        <div className="flex items-center gap-3 px-3 py-2 mb-1 rounded-lg bg-[var(--color-card)]/50">
          <div className="w-7 h-7 rounded-full bg-[var(--color-lavender)]/20 flex items-center justify-center shrink-0">
            <span className="text-[var(--color-lavender)] text-xs font-bold">
              {user?.email?.[0]?.toUpperCase() ?? 'A'}
            </span>
          </div>
          <p className="text-xs text-[var(--color-cream-dim)] truncate flex-1 font-[var(--font-body)]">
            {user?.email ?? 'admin'}
          </p>
        </div>
        <Link
          to="/"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-[var(--font-cond)] font-medium tracking-wide text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)] transition-all duration-150 mb-0.5"
        >
          <ArrowLeft size={16} className="shrink-0" aria-hidden="true" />
          Volver a la tienda
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-[var(--font-cond)] font-medium tracking-wide text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-all duration-150"
        >
          <LogOut size={16} className="shrink-0" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-[var(--color-ink)] overflow-hidden">
      <div className="hidden lg:flex flex-col w-60 shrink-0">{sidebar}</div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 flex flex-col w-60">{sidebar}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[var(--color-ink-deep)] border-b border-[var(--color-card)]">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)] transition-colors"
            aria-label="Abrir menú"
          >
            {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
          <span className="text-sm font-[var(--font-cond)] font-semibold text-[var(--color-lavender)] tracking-widest uppercase">
            DC Bikes Admin
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-[var(--color-ink)] p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
