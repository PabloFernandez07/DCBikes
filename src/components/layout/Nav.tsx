import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X, Settings, ShoppingCart } from 'lucide-react'
import { clsx } from 'clsx'
import { useCartStore } from '@/stores/cartStore'
import { useUiStore } from '@/stores/uiStore'

const links = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/taller', label: 'Taller' },
  { to: '/contacto', label: 'Contacto' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const itemCount = useCartStore(s => s.items.reduce((a, i) => a + i.quantity, 0))
  const toggleCart = useUiStore(s => s.toggleCart)

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{ background: 'rgba(26,22,32,0.92)', backdropFilter: 'blur(16px)' }}
    >
      <div className="w-full px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 shrink-0" aria-label="DC Bikes Cantabria — inicio">
          <img src="/DC_Bikes_Sin_Fondo.png" alt="DC Bikes" className="h-14 w-auto" />
          <span className="font-[var(--font-display)] text-xl tracking-widest text-[var(--color-cream)]">DC BIKES</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Navegación principal">
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'px-4 py-2 rounded-lg font-[var(--font-cond)] text-base font-medium tracking-wide transition-all duration-200',
                  isActive
                    ? 'text-[var(--color-lavender)] bg-[rgba(196,162,207,0.12)]'
                    : 'text-[var(--color-cream-dim)] hover:text-[var(--color-cream)] hover:bg-[rgba(255,255,255,0.06)]',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCart}
            className="relative p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[rgba(196,162,207,0.1)] transition-all duration-200"
            aria-label={`Abrir carrito${itemCount > 0 ? ` (${itemCount} ${itemCount === 1 ? 'artículo' : 'artículos'})` : ''}`}
          >
            <ShoppingCart size={20} />
            {itemCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--color-brand-red)] text-white text-[10px] font-bold leading-[18px] text-center font-[var(--font-cond)] tabular-nums"
                aria-hidden="true"
              >
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>
          <Link
            to="/admin"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-[var(--font-cond)] text-sm font-medium tracking-wide text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[rgba(196,162,207,0.1)] transition-all duration-200"
            aria-label="Panel de administración"
          >
            <Settings size={15} />
            <span className="hidden sm:inline">Admin</span>
          </Link>
          <button
            className="md:hidden p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="md:hidden border-t border-[var(--color-card)] bg-[var(--color-ink-deep)] px-4 py-3 flex flex-col gap-1"
          onClick={() => setOpen(false)}
        >
          {links.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'px-4 py-3 rounded-xl font-[var(--font-cond)] text-lg font-medium tracking-wide transition-all duration-200',
                  isActive
                    ? 'text-[var(--color-lavender)] bg-[rgba(196,162,207,0.12)]'
                    : 'text-[var(--color-cream-dim)] hover:text-[var(--color-cream)] hover:bg-[rgba(255,255,255,0.06)]',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  )
}
