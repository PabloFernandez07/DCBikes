import { useState, useRef } from 'react'
import { Search, X } from 'lucide-react'
import { clsx } from 'clsx'

interface SearchBarProps {
  onSearch: (term: string) => void
  placeholder?: string
}

export function SearchBar({ onSearch, placeholder = 'Buscar bicicletas...' }: SearchBarProps) {
  const [value, setValue] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setValue(term)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onSearch(term)
    }, 400)
  }

  const clear = () => {
    setValue('')
    onSearch('')
  }

  return (
    <div className="relative w-full max-w-md">
      <Search
        size={16}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-mid)] pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={clsx(
          'w-full pl-10 pr-10 py-2.5 rounded-xl',
          'bg-[var(--color-card)] border border-[var(--color-card)] text-[var(--color-cream)]',
          'placeholder-[var(--color-mid)] font-[var(--font-body)] text-sm',
          'focus:outline-none focus:border-[var(--color-lavender)] focus:ring-2 focus:ring-[rgba(196,162,207,0.2)]',
          'transition-colors duration-200',
        )}
        aria-label="Buscar productos"
      />
      {value && (
        <button
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)] hover:text-[var(--color-cream)] transition-colors"
          aria-label="Limpiar búsqueda"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
