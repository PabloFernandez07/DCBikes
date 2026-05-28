import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[rgba(196,162,207,0.1)] transition-all duration-200"
    >
      <span
        className="absolute transition-all duration-300"
        style={{
          opacity: theme === 'dark' ? 1 : 0,
          transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)',
        }}
      >
        <Moon size={18} aria-hidden="true" />
      </span>
      <span
        className="absolute transition-all duration-300"
        style={{
          opacity: theme === 'light' ? 1 : 0,
          transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)',
        }}
      >
        <Sun size={18} aria-hidden="true" />
      </span>
    </button>
  )
}
