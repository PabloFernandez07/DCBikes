import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import { clsx } from 'clsx'

const links = [
  { to: '/catalogo', label: 'Catálogo' },
  { to: '/taller', label: 'Taller' },
  { to: '/contacto', label: 'Contacto' },
]

export function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{ background: 'rgba(26,22,32,0.92)', backdropFilter: 'blur(16px)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 shrink-0" aria-label="DC Bikes Cantabria — inicio">
          <img src="/DC_Bikes_Sin_Fondo.png" alt="DC Bikes" className="h-12 w-auto" />
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
          <ThemeToggle />
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
