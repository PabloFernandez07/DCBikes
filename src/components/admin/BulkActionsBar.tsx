import { ShoppingCart, Ban, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BulkActionsBarProps {
  count: number
  onEnablePurchasable: () => void
  onDisablePurchasable: () => void
  onClear: () => void
  disabled?: boolean
}

/**
 * Barra flotante que aparece cuando hay 1+ productos seleccionados en la lista.
 * Permite acciones en lote sobre `is_purchasable`.
 */
export function BulkActionsBar({
  count,
  onEnablePurchasable,
  onDisablePurchasable,
  onClear,
  disabled,
}: BulkActionsBarProps) {
  return (
    <div
      role="region"
      aria-label="Acciones en lote"
      className="flex flex-wrap items-center gap-3 bg-[var(--color-lavender)]/10 border border-[var(--color-lavender)]/40 rounded-xl px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-[var(--color-lavender)] text-[var(--color-ink)] text-xs font-bold">
          {count}
        </span>
        <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
          {count === 1 ? 'producto seleccionado' : 'productos seleccionados'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 ml-auto">
        <Button
          variant="secondary"
          size="sm"
          onClick={onEnablePurchasable}
          disabled={disabled}
        >
          <ShoppingCart size={14} />
          Activar online
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisablePurchasable}
          disabled={disabled}
        >
          <Ban size={14} />
          Desactivar online
        </Button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="p-1.5 rounded-md text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)] transition-colors disabled:opacity-50"
          aria-label="Limpiar selección"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
