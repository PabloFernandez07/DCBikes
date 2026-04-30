import { clsx } from 'clsx'
import type { Category } from '@/lib/database.types'

interface CategoryFilterProps {
  categories: Category[]
  selected: string | null
  onSelect: (id: string | null) => void
}

export function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
      role="group"
      aria-label="Filtrar por categoría"
    >
      <button
        onClick={() => onSelect(null)}
        className={clsx(
          'shrink-0 px-4 py-2 rounded-full font-[var(--font-cond)] text-sm font-medium tracking-wide transition-all duration-200 border',
          selected === null
            ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)]'
            : 'bg-transparent text-[var(--color-mid)] border-[var(--color-card)] hover:border-[var(--color-lavender)]/50 hover:text-[var(--color-cream)]',
        )}
        aria-pressed={selected === null}
      >
        Todos
      </button>

      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={clsx(
            'shrink-0 px-4 py-2 rounded-full font-[var(--font-cond)] text-sm font-medium tracking-wide transition-all duration-200 border',
            selected === cat.id
              ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)]'
              : 'bg-transparent text-[var(--color-mid)] border-[var(--color-card)] hover:border-[var(--color-lavender)]/50 hover:text-[var(--color-cream)]',
          )}
          aria-pressed={selected === cat.id}
        >
          {cat.name}
        </button>
      ))}
    </div>
  )
}
