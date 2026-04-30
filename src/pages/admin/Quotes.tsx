import { useState, useEffect, useCallback } from 'react'
import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import type { QuoteRequest } from '@/lib/database.types'

type StatusFilter = 'all' | 'new' | 'read' | 'archived'

interface QuoteWithProduct extends QuoteRequest {
  products: { name: string } | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncate(text: string | null, max: number): string {
  if (!text) return '—'
  if (text.length <= max) return text
  return text.slice(0, max) + '…'
}

const STATUS_LABELS: Record<string, string> = {
  new: 'Nueva',
  read: 'Leída',
  archived: 'Archivada',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-[var(--color-lavender)]/20 text-[var(--color-lavender)] border-[var(--color-lavender)]/30',
  read: 'bg-[var(--color-card-hover)] text-[var(--color-cream-dim)] border-[var(--color-mid)]/20',
  archived: 'bg-[var(--color-brand-red)]/10 text-[var(--color-mid)] border-[var(--color-brand-red)]/20',
}

export function Quotes() {
  const { toasts, toast, dismiss } = useToast()
  const [quotes, setQuotes] = useState<QuoteWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<QuoteWithProduct | null>(null)
  const [newCount, setNewCount] = useState(0)

  const fetchQuotes = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('quote_requests')
      .select('*, products(name)')
      .order('created_at', { ascending: false })
    const rows = (data as QuoteWithProduct[]) ?? []
    setQuotes(rows)
    setNewCount(rows.filter(q => q.status === 'new').length)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchQuotes()
  }, [fetchQuotes])

  const filtered = filter === 'all' ? quotes : quotes.filter(q => q.status === filter)

  const updateStatus = async (quote: QuoteWithProduct, newStatus: string) => {
    type QuoteBuilder = {
      update: (v: { status: string }) => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> }
    }
    const builder = supabase.from('quote_requests') as unknown as QuoteBuilder
    const result = await builder.update({ status: newStatus }).eq('id', quote.id)
    const error = result.error

    if (error) {
      toast.error('Error al actualizar: ' + error.message)
    } else {
      toast.success('Estado actualizado')
      const updated = { ...quote, status: newStatus }
      setQuotes(prev => prev.map(q => (q.id === quote.id ? updated : q)))
      setNewCount(prev => {
        if (quote.status === 'new' && newStatus !== 'new') return prev - 1
        if (quote.status !== 'new' && newStatus === 'new') return prev + 1
        return prev
      })
      if (selected?.id === quote.id) setSelected(updated)
    }
  }

  const tabs: Array<{ key: StatusFilter; label: string; badge?: number }> = [
    { key: 'all', label: 'Todas' },
    { key: 'new', label: 'Nuevas', badge: newCount },
    { key: 'read', label: 'Leídas' },
    { key: 'archived', label: 'Archivadas' },
  ]

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            CONSULTAS
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            Solicitudes de presupuesto recibidas
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-[var(--color-card)] rounded-xl p-1 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-[var(--font-cond)] font-medium tracking-wide transition-all duration-150',
                filter === tab.key
                  ? 'bg-[var(--color-lavender)]/15 text-[var(--color-lavender)]'
                  : 'text-[var(--color-mid)] hover:text-[var(--color-cream)]',
              )}
            >
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--color-brand-red)] text-white text-[10px] font-bold">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--color-mid)] font-[var(--font-body)]">
              No hay consultas en esta categoría.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Fecha</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Email</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden sm:table-cell">Teléfono</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden md:table-cell">Producto</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden lg:table-cell">Mensaje</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => (
                    <tr
                      key={q.id}
                      onClick={() => setSelected(q)}
                      className={clsx(
                        'border-b border-[var(--color-card-hover)]/40 last:border-0 cursor-pointer transition-colors',
                        q.status === 'new'
                          ? 'bg-[var(--color-lavender)]/5 hover:bg-[var(--color-lavender)]/10'
                          : 'hover:bg-[var(--color-card-hover)]/30',
                        selected?.id === q.id && 'ring-1 ring-inset ring-[var(--color-lavender)]/30',
                      )}
                    >
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)] whitespace-nowrap">
                        {formatDate(q.created_at)}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream)] font-[var(--font-body)]">
                        {q.email}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] hidden sm:table-cell">
                        {q.phone ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)] hidden md:table-cell">
                        {q.products?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] hidden lg:table-cell">
                        {truncate(q.message, 80)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-[var(--font-cond)] font-medium tracking-wide border',
                          STATUS_COLORS[q.status] ?? STATUS_COLORS.read,
                        )}>
                          {STATUS_LABELS[q.status] ?? q.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="bg-[var(--color-card)] border border-[var(--color-lavender)]/20 rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Consulta de {selected.email}
                </h3>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  {formatDate(selected.created_at)}
                  {selected.products && ` · Producto: ${selected.products.name}`}
                  {selected.phone && ` · Tel: ${selected.phone}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] transition-colors shrink-0"
                aria-label="Cerrar panel"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-[var(--color-ink)] rounded-xl px-5 py-4">
              <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed whitespace-pre-wrap">
                {selected.message ?? 'Sin mensaje.'}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {selected.status !== 'read' && selected.status !== 'archived' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => updateStatus(selected, 'read')}
                >
                  Marcar como leída
                </Button>
              )}
              {selected.status !== 'archived' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateStatus(selected, 'archived')}
                >
                  Archivar
                </Button>
              )}
              {selected.status === 'archived' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => updateStatus(selected, 'new')}
                >
                  Restaurar
                </Button>
              )}
              <span className={clsx(
                'inline-flex items-center self-center px-3 py-1.5 rounded-full text-xs font-[var(--font-cond)] font-medium tracking-wide border',
                STATUS_COLORS[selected.status] ?? STATUS_COLORS.read,
              )}>
                {STATUS_LABELS[selected.status] ?? selected.status}
              </span>
            </div>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
