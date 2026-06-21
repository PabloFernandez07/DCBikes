import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, RefreshCw, RotateCcw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'

// ─── Estados y motivos RMA ──────────────────────────────────────────
// El estado de la devolución es independiente del de pedido, así que
// definimos aquí su propio badge (coherente en color con OrderStatusBadge).
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'received' | 'refunded'

interface ReturnStatusMeta {
  label: string
  className: string
}

export const RETURN_STATUS_META: Record<ReturnStatus, ReturnStatusMeta> = {
  requested: {
    label: 'Solicitada',
    className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  },
  approved: {
    label: 'Aprobada',
    className: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  rejected: {
    label: 'Rechazada',
    className: 'bg-[var(--color-brand-red)]/15 text-[var(--color-brand-red)] border-[var(--color-brand-red)]/30',
  },
  received: {
    label: 'Recibida',
    className: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  refunded: {
    label: 'Reembolsada',
    className: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
}

export function ReturnStatusBadge({ status, size = 'sm' }: { status: ReturnStatus; size?: 'sm' | 'md' }) {
  const meta = RETURN_STATUS_META[status]
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full font-[var(--font-cond)] font-medium tracking-wide border',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
        meta
          ? meta.className
          : 'bg-[var(--color-card-hover)] text-[var(--color-cream-dim)] border-[var(--color-mid)]/20',
      )}
    >
      {meta?.label ?? status}
    </span>
  )
}

// Traducción de los códigos de motivo del backend al español.
export const RETURN_REASON_LABELS: Record<string, string> = {
  defective: 'Producto defectuoso',
  wrong_item: 'Artículo incorrecto',
  wrong_size: 'Talla incorrecta',
  not_as_described: 'No coincide con la descripción',
  changed_mind: 'Cambio de opinión',
  damaged_shipping: 'Dañado en el envío',
  other: 'Otros',
}

export function reasonLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return RETURN_REASON_LABELS[code] ?? code
}

interface ReturnRow {
  id: string
  return_number: string
  order_number: string
  customer_email: string
  status: ReturnStatus
  reason_code: string | null
  refund_total_cents: number
  created_at: string
}

const STATUS_FILTERS: Array<{ key: 'all' | ReturnStatus; label: string }> = [
  { key: 'all', label: 'Todas' },
  { key: 'requested', label: 'Solicitadas' },
  { key: 'approved', label: 'Aprobadas' },
  { key: 'received', label: 'Recibidas' },
  { key: 'refunded', label: 'Reembolsadas' },
  { key: 'rejected', label: 'Rechazadas' },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ReturnsList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toasts, toast, dismiss } = useToast()

  const initialStatus = searchParams.get('status') ?? 'all'

  const [returns, setReturns] = useState<ReturnRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>(initialStatus)

  const fetchReturns = useCallback(async () => {
    setLoading(true)
    try {
      // El JWT de admin lo inyecta supabase.functions.invoke automáticamente.
      const body: Record<string, unknown> = {}
      if (statusFilter && statusFilter !== 'all') body.status = statusFilter

      const { data, error } = await supabase.functions.invoke<{ returns: ReturnRow[] }>(
        'admin-return-list',
        { body },
      )
      if (error) throw new Error(error.message)
      setReturns(data?.returns ?? [])
    } catch (err) {
      console.error('[ReturnsList]', err)
      setReturns([])
      toast.error(err instanceof Error ? err.message : 'Error al cargar devoluciones')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, toast])

  useEffect(() => { fetchReturns() }, [fetchReturns])

  // Sincroniza el filtro de estado en la URL (enlaces compartibles).
  useEffect(() => {
    const next = new URLSearchParams(searchParams)
    if (statusFilter && statusFilter !== 'all') {
      next.set('status', statusFilter)
    } else {
      next.delete('status')
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest flex items-center gap-3">
            <RotateCcw size={22} className="text-[var(--color-lavender)]" aria-hidden="true" />
            DEVOLUCIONES
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            {returns.length} {returns.length === 1 ? 'devolución' : 'devoluciones'}
            {statusFilter !== 'all' ? ' con el filtro actual' : ' en total'}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchReturns}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] border border-[var(--color-card-hover)] hover:border-[var(--color-lavender)]/40 hover:text-[var(--color-cream)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refrescar lista de devoluciones"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refrescar
        </button>
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setStatusFilter(s.key)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-[var(--font-cond)] font-medium tracking-wide transition-all duration-150 border',
              statusFilter === s.key
                ? 'bg-[var(--color-lavender)]/15 text-[var(--color-lavender)] border-[var(--color-lavender)]/40'
                : 'bg-[var(--color-card)] text-[var(--color-mid)] border-[var(--color-card-hover)] hover:text-[var(--color-cream)] hover:border-[var(--color-mid)]/40',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Table / cards */}
      <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : returns.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--color-mid)] font-[var(--font-body)]">
            No hay devoluciones con los filtros seleccionados.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Nº RMA</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Pedido</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Cliente</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Motivo</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Importe</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Estado</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Fecha</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(r => (
                    <tr
                      key={r.id}
                      onClick={() => navigate(`/admin/devoluciones/${r.id}`)}
                      className="border-b border-[var(--color-card-hover)]/40 last:border-0 cursor-pointer transition-colors hover:bg-[var(--color-card-hover)]/30"
                    >
                      <td className="px-4 py-3 font-[var(--font-cond)] text-[var(--color-lavender)] tracking-wide whitespace-nowrap">
                        {r.return_number}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-cond)] tracking-wide whitespace-nowrap">
                        {r.order_number}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream)] font-[var(--font-body)]">
                        {r.customer_email}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-cream-dim)] font-[var(--font-body)]">
                        {reasonLabel(r.reason_code)}
                      </td>
                      <td className="px-4 py-3 text-right font-[var(--font-cond)] font-medium text-[var(--color-cream)] whitespace-nowrap">
                        {formatCents(r.refund_total_cents)} €
                      </td>
                      <td className="px-4 py-3">
                        <ReturnStatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)] whitespace-nowrap">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); navigate(`/admin/devoluciones/${r.id}`) }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-[var(--font-cond)] text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors"
                        >
                          <Eye size={13} aria-hidden="true" />
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-[var(--color-card-hover)]/40">
              {returns.map(r => (
                <li
                  key={r.id}
                  onClick={() => navigate(`/admin/devoluciones/${r.id}`)}
                  className="px-4 py-4 cursor-pointer transition-colors hover:bg-[var(--color-card-hover)]/30"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-[var(--font-cond)] text-[var(--color-lavender)] tracking-wide">
                        {r.return_number}
                      </p>
                      <p className="text-xs text-[var(--color-mid)] mt-0.5">
                        Pedido {r.order_number} · {formatDate(r.created_at)}
                      </p>
                    </div>
                    <ReturnStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-[var(--color-cream)] font-[var(--font-body)]">
                    {r.customer_email}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-xs text-[var(--color-cream-dim)]">
                      {reasonLabel(r.reason_code)}
                    </span>
                    <span className="font-[var(--font-cond)] font-medium text-[var(--color-cream)]">
                      {formatCents(r.refund_total_cents)} €
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
