import { useState, useEffect } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  FolderOpen,
  Layers,
  Upload,
  MessageSquare,
  Settings,
  Menu,
  X,
  LogOut,
  Bike,
  ArrowLeft,
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

function usePendingQuotes() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    supabase
      .from('quote_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .then(({ count: c }) => setCount(c ?? 0))
  }, [])

  return count
}

function usePendingOrders() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const fetchCount = () => {
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'authorized')
        .then(({ count: c }) => {
          if (!cancelled) setCount(c ?? 0)
        })
    }

    fetchCount()
    const interval = window.setInterval(fetchCount, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return count
}

type BadgeKey = 'quotes' | 'orders'

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
  { to: '/admin/categorias', label: 'Categorías', icon: FolderOpen, end: false },
  { to: '/admin/agrupaciones', label: 'Agrupaciones', icon: Layers, end: false },
  { to: '/admin/importar', label: 'Importar Excel', icon: Upload, end: false },
  { to: '/admin/consultas', label: 'Consultas', icon: MessageSquare, end: false, badge: 'quotes' },
  { to: '/admin/configuracion', label: 'Configuración', icon: Settings, end: false },
]

export function AdminShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const pendingQuotes = usePendingQuotes()
  const pendingOrders = usePendingOrders()

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
          <Bike size={16} className="text-white" />
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
              <item.icon size={17} className="shrink-0" />
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
          <ArrowLeft size={16} className="shrink-0" />
          Volver a la tienda
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-[var(--font-cond)] font-medium tracking-wide text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-all duration-150"
        >
          <LogOut size={16} className="shrink-0" />
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
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="text-sm font-[var(--font-cond)] font-semibold text-[var(--color-lavender)] tracking-widest uppercase">
            DC Bikes Admin
          </span>
        </header>

        <main className="flex-1 overflow-y-auto bg-[var(--color-ink)] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
