import { clsx } from 'clsx'
import type { Product } from '@/lib/database.types'

interface SizeSelectorProps {
  variants: Product[]
  selectedVariant: Product | null
  onSelect: (variant: Product) => void
}

/**
 * Botones tipo "pill" para seleccionar talla.
 * - La variante seleccionada se resalta con el color lavanda.
 * - Las variantes con stock=0 se renderizan tachadas y deshabilitadas (no se
 *   pueden seleccionar para evitar bloqueos en la UI, pero se muestran como
 *   referencia de tallas existentes).
 */
export function SizeSelector({ variants, selectedVariant, onSelect }: SizeSelectorProps) {
  if (variants.length < 2) return null

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
          Talla
        </span>
        {selectedVariant && (
          <span className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-mid)]">
            {selectedVariant.stock > 0
              ? `${selectedVariant.stock} disponible${selectedVariant.stock !== 1 ? 's' : ''}`
              : 'Sin stock'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Talla">
        {variants.map(variant => {
          const isSelected = selectedVariant?.id === variant.id
          const outOfStock = variant.stock <= 0
          const label = variant.size_label?.trim() || '—'

          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={outOfStock}
              disabled={outOfStock}
              onClick={() => !outOfStock && onSelect(variant)}
              className={clsx(
                'relative min-w-[3.5rem] px-4 py-2 rounded-xl text-sm font-[var(--font-cond)] tracking-wide border transition-all duration-200',
                isSelected
                  ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)] font-semibold'
                  : outOfStock
                    ? 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] cursor-not-allowed line-through opacity-50'
                    : 'bg-transparent text-[var(--color-cream)] border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.5)] hover:text-[var(--color-lavender)] cursor-pointer',
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
