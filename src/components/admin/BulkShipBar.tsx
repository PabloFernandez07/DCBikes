import { Truck, FileDown, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BulkShipBarProps {
  count: number
  onMarkShipped: () => void
  onExportSelected: () => void
  onClear: () => void
  disabled?: boolean
}

/**
 * Barra flotante fija al fondo de la pantalla que aparece cuando hay >=1
 * pedido seleccionado en `/admin/pedidos`. Permite acciones en lote sobre
 * pedidos aceptados de envío: marcar como enviados o exportar CSV.
 *
 * Estilo inspirado en `BulkActionsBar` (productos), pero posicionada como
 * sticky bottom para no requerir scroll y mantener visibilidad mientras el
 * admin navega por la tabla.
 */
export function BulkShipBar({
  count,
  onMarkShipped,
  onExportSelected,
  onClear,
  disabled,
}: BulkShipBarProps) {
  return (
    <div
      role="region"
      aria-label="Acciones en lote sobre pedidos"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-4xl"
    >
      <div className="flex flex-wrap items-center gap-3 bg-[var(--color-card)]/95 backdrop-blur-md border border-[var(--color-lavender)]/50 rounded-2xl px-4 py-3 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-full bg-[var(--color-lavender)] text-[var(--color-ink)] text-xs font-bold">
            {count}
          </span>
          <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
            {count === 1 ? 'pedido seleccionado' : 'pedidos seleccionados'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
          <Button
            variant="primary"
            size="sm"
            onClick={onMarkShipped}
            disabled={disabled}
            className="flex-1 sm:flex-none justify-center"
          >
            <Truck size={14} aria-hidden="true" />
            Marcar como enviados
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={onExportSelected}
            disabled={disabled}
            className="flex-1 sm:flex-none justify-center"
          >
            <FileDown size={14} aria-hidden="true" />
            Exportar CSV seleccionados
          </Button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="p-1.5 rounded-md text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] transition-colors disabled:opacity-50"
            aria-label="Limpiar selección"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
