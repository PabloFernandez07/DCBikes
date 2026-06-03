import { Eye, EyeOff, Star, ShoppingCart, Ban, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export type BulkAction =
  | 'activate'
  | 'deactivate'
  | 'feature'
  | 'unfeature'
  | 'enable_online'
  | 'disable_online'
  | 'delete'

interface BulkActionsBarProps {
  count: number
  onAction: (action: BulkAction) => void
  onClear: () => void
  disabled?: boolean
}

/**
 * Barra flotante que aparece cuando hay 1+ productos seleccionados en la lista.
 * Ofrece acciones rápidas en lote: visibilidad web (active), destacado
 * (featured), venta online (is_purchasable) y eliminación.
 */
export function BulkActionsBar({ count, onAction, onClear, disabled }: BulkActionsBarProps) {
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

      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
        {/* Visibilidad en la web */}
        <Button variant="secondary" size="sm" onClick={() => onAction('activate')} disabled={disabled}>
          <Eye size={14} aria-hidden="true" />
          Activar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAction('deactivate')} disabled={disabled}>
          <EyeOff size={14} aria-hidden="true" />
          Desactivar
        </Button>

        <Divider />

        {/* Destacado */}
        <Button variant="secondary" size="sm" onClick={() => onAction('feature')} disabled={disabled}>
          <Star size={14} aria-hidden="true" />
          Destacar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAction('unfeature')} disabled={disabled}>
          <Star size={14} aria-hidden="true" className="opacity-50" />
          Quitar destacado
        </Button>

        <Divider />

        {/* Venta online */}
        <Button variant="secondary" size="sm" onClick={() => onAction('enable_online')} disabled={disabled}>
          <ShoppingCart size={14} aria-hidden="true" />
          Activar online
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAction('disable_online')} disabled={disabled}>
          <Ban size={14} aria-hidden="true" />
          Desactivar online
        </Button>

        <Divider />

        {/* Eliminar */}
        <Button variant="danger" size="sm" onClick={() => onAction('delete')} disabled={disabled}>
          <Trash2 size={14} aria-hidden="true" />
          Eliminar
        </Button>

        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="p-1.5 rounded-md text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)] transition-colors disabled:opacity-50"
          aria-label="Limpiar selección"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

function Divider() {
  return <span aria-hidden="true" className="hidden sm:block w-px h-5 bg-[var(--color-lavender)]/25" />
}
