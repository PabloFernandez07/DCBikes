import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { OrderStatusBadge, ORDER_STATUS_META, type OrderStatus } from '@/components/admin/OrderStatusBadge'
import type { Database } from '@/lib/database.types'

type Order = Database['public']['Tables']['orders']['Row']

const PAGE_SIZE = 30

type DeliveryFilter = 'all' | 'shipping' | 'pickup'

const STATUS_FILTERS: Array<{ key: 'all' | OrderStatus | 'pending_approval' | 'active' | 'closed'; label: string }> = [
  { key: 'all',              label: 'Todos' },
  { key: 'authorized',       label: 'Pendientes aprobación' },
  { key: 'accepted',         label: 'Aceptados' },
  { key: 'ready_pickup',     label: 'Listos recogida' },
  { key: 'shipped',          label: 'Enviados' },
  { key: 'delivered',        label: 'Entregados' },
  { key: 'rejected',         label: 'Rechazados' },
  { key: 'cancelled',        label: 'Cancelados' },
  { key: 'pending',          label: 'Pendiente pago' },
  { key: 'payment_failed',   label: 'Pago fallido' },
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

function todayIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export default function OrdersList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialStatus = searchParams.get('status') ?? 'all'
  const initialDate = searchParams.get('date')

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)

  const [statusFilter, setStatusFilter] = useState<string>(initialStatus)
  const [dateFrom, setDateFrom] = useState<string>(initialDate === 'today' ? new Date().toISOString().slice(0, 10) : '')
  const [dateTo, setDateTo] = useState<string>('')
  const [deliveryFilter, setDeliveryFilter] = useState<DeliveryFilter>('all')
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  // Counters
  const [counters, setCounters] = useState({
    total: 0,
    authorized: 0,
    accepted: 0,
    ready_pickup: 0,
  })

  const fetchCounters = useCallback(async () => {
    const [totalRes, authRes, accRes, readyRes] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'authorized'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'accepted'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'ready_pickup'),
    ])
    setCounters({
      total: totalRes.count ?? 0,
      authorized: authRes.count ?? 0,
      accepted: accRes.count ?? 0,
      ready_pickup: readyRes.count ?? 0,
    })
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (!showDeleted) {
      query = query.is('deleted_at', null)
    }
    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter as OrderStatus)
    }
    if (deliveryFilter !== 'all') {
      query = query.eq('delivery_method', deliveryFilter)
    }
    if (dateFrom) {
      query = query.gte('created_at', new Date(dateFrom).toISOString())
    }
    if (dateTo) {
      // inclusive end of day
      const end = new Date(dateTo)
      end.setHours(23, 59, 59, 999)
      query = query.lte('created_at', end.toISOString())
    }
    const term = search.trim()
    if (term) {
      // OR sobre número pedido / email / teléfono
      const safe = term.replace(/[%,()]/g, '')
      query = query.or(
        `order_number.ilike.%${safe}%,customer_email.ilike.%${safe}%,customer_phone.ilike.%${safe}%`,
      )
    }

    const { data, count, error } = await query
    if (error) {
      console.error('[OrdersList]', error)
      setOrders([])
      setTotal(0)
    } else {
      setOrders((data as Order[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [page, statusFilter, deliveryFilter, dateFrom, dateTo, search, showDeleted])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchCounters() }, [fetchCounters])

  // Sync filters into URL (only status for shareable links).
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

  // Reset page on filter change
  useEffect(() => {
    setPage(0)
  }, [statusFilter, deliveryFilter, dateFrom, dateTo, search, showDeleted])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const Pagination = useMemo(() => {
    return (
      <div className="flex items-center justify-between gap-3 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
        <p>
          {total === 0 ? 'Sin resultados' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} de ${total}`}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Página anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="px-2 text-[var(--color-cream-dim)] font-[var(--font-cond)]">
            {page + 1} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => (p + 1 < totalPages ? p + 1 : p))}
            disabled={page + 1 >= totalPages}
            className="p-1.5 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Página siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    )
  }, [page, total, totalPages])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
          PEDIDOS
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
          {counters.total} pedidos en total
        </p>
      </div>

      {/* Counter cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CounterCard
          label="Total pedidos"
          value={counters.total}
          accent="lavender"
          onClick={() => setStatusFilter('all')}
          active={statusFilter === 'all'}
        />
        <CounterCard
          label="Pendientes aprobación"
          value={counters.authorized}
          accent="yellow"
          onClick={() => setStatusFilter('authorized')}
          active={statusFilter === 'authorized'}
          highlight={counters.authorized > 0}
        />
        <CounterCard
          label="Aceptados"
          value={counters.accepted}
          accent="blue"
          onClick={() => setStatusFilter('accepted')}
          active={statusFilter === 'accepted'}
        />
        <CounterCard
          label="Listos recogida"
          value={counters.ready_pickup}
          accent="purple"
          onClick={() => setStatusFilter('ready_pickup')}
          active={statusFilter === 'ready_pickup'}
        />
      </div>

      {/* Filters */}
      <div className="space-y-3">
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

        {/* Row: date + delivery + search */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Método entrega
            </label>
            <select
              value={deliveryFilter}
              onChange={e => setDeliveryFilter(e.target.value as DeliveryFilter)}
              className="text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            >
              <option value="all">Todos</option>
              <option value="shipping">Envío</option>
              <option value="pickup">Recogida</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Buscar
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Nº pedido, email, teléfono…"
                className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] pl-9 pr-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 pb-1.5 cursor-pointer select-none">
            <span
              className={clsx(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                showDeleted ? 'bg-[var(--color-lavender)]/60' : 'bg-[var(--color-card-hover)]',
              )}
              aria-hidden="true"
            >
              <span
                className={clsx(
                  'inline-block h-3.5 w-3.5 transform rounded-full bg-[var(--color-cream)] transition-transform',
                  showDeleted ? 'translate-x-4.5' : 'translate-x-0.5',
                )}
                style={{ transform: showDeleted ? 'translateX(1.125rem)' : 'translateX(0.125rem)' }}
              />
            </span>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={e => setShowDeleted(e.target.checked)}
              className="sr-only"
            />
            <span className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] whitespace-nowrap">
              Mostrar eliminados
            </span>
          </label>
        </div>
      </div>

      {/* Top pagination */}
      <div className="px-1">{Pagination}</div>

      {/* Table / cards */}
      <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--color-mid)] font-[var(--font-body)]">
            No hay pedidos con los filtros seleccionados.
          </p>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Nº</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Fecha</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Cliente</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Total</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Método</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Estado</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => {
                    const isDeleted = !!o.deleted_at
                    return (
                    <tr
                      key={o.id}
                      onClick={() => navigate(`/admin/pedidos/${o.id}`)}
                      className={clsx(
                        'border-b border-[var(--color-card-hover)]/40 last:border-0 cursor-pointer transition-colors',
                        isDeleted
                          ? 'opacity-60 bg-[var(--color-ink)]/40 hover:bg-[var(--color-card-hover)]/40'
                          : o.status === 'authorized'
                            ? 'bg-yellow-500/5 hover:bg-yellow-500/10'
                            : 'hover:bg-[var(--color-card-hover)]/30',
                      )}
                    >
                      <td className={clsx(
                        'px-4 py-3 font-[var(--font-cond)] text-[var(--color-lavender)] tracking-wide whitespace-nowrap',
                        isDeleted && 'line-through',
                      )}>
                        {o.order_number}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)] whitespace-nowrap">
                        {formatDate(o.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-[var(--color-cream)] font-[var(--font-body)]">
                          {o.customer_first_name} {o.customer_last_name}
                        </p>
                        <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                          {o.customer_email}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-[var(--font-cond)] font-medium text-[var(--color-cream)] whitespace-nowrap">
                        {formatCents(o.total_cents)} €
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-cream-dim)] font-[var(--font-body)]">
                        {o.delivery_method === 'shipping' ? 'Envío' : 'Recogida'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <OrderStatusBadge status={o.status as OrderStatus} />
                          {isDeleted && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-[var(--color-card-hover)] text-[var(--color-mid)] border-[var(--color-mid)]/30 uppercase">
                              Eliminado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); navigate(`/admin/pedidos/${o.id}`) }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-[var(--font-cond)] text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors"
                        >
                          <Eye size={13} />
                          Ver
                        </button>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="md:hidden divide-y divide-[var(--color-card-hover)]/40">
              {orders.map(o => {
                const isDeleted = !!o.deleted_at
                return (
                <li
                  key={o.id}
                  onClick={() => navigate(`/admin/pedidos/${o.id}`)}
                  className={clsx(
                    'px-4 py-4 cursor-pointer transition-colors',
                    isDeleted
                      ? 'opacity-60 bg-[var(--color-ink)]/40 hover:bg-[var(--color-card-hover)]/40'
                      : o.status === 'authorized'
                        ? 'bg-yellow-500/5 hover:bg-yellow-500/10'
                        : 'hover:bg-[var(--color-card-hover)]/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className={clsx(
                        'font-[var(--font-cond)] text-[var(--color-lavender)] tracking-wide',
                        isDeleted && 'line-through',
                      )}>
                        {o.order_number}
                      </p>
                      <p className="text-xs text-[var(--color-mid)] mt-0.5">{formatDate(o.created_at)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <OrderStatusBadge status={o.status as OrderStatus} />
                      {isDeleted && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-[var(--color-card-hover)] text-[var(--color-mid)] border-[var(--color-mid)]/30 uppercase">
                          Eliminado
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-[var(--color-cream)] font-[var(--font-body)]">
                    {o.customer_first_name} {o.customer_last_name}
                  </p>
                  <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">{o.customer_email}</p>
                  <div className="flex items-center justify-between mt-2 text-sm">
                    <span className="text-xs text-[var(--color-cream-dim)]">
                      {o.delivery_method === 'shipping' ? 'Envío' : 'Recogida'}
                    </span>
                    <span className="font-[var(--font-cond)] font-medium text-[var(--color-cream)]">
                      {formatCents(o.total_cents)} €
                    </span>
                  </div>
                </li>
              )})}
            </ul>
          </>
        )}
      </div>

      {/* Bottom pagination */}
      <div className="px-1">{Pagination}</div>
    </div>
  )
}

interface CounterCardProps {
  label: string
  value: number
  accent: 'lavender' | 'yellow' | 'blue' | 'purple'
  onClick: () => void
  active?: boolean
  highlight?: boolean
}

function CounterCard({ label, value, accent, onClick, active, highlight }: CounterCardProps) {
  const colors: Record<CounterCardProps['accent'], string> = {
    lavender: 'text-[var(--color-lavender)]',
    yellow: 'text-yellow-300',
    blue: 'text-blue-300',
    purple: 'text-purple-300',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left bg-[var(--color-card)] border rounded-2xl p-4 transition-all hover:bg-[var(--color-card-hover)]/60',
        active
          ? 'border-[var(--color-lavender)]/40'
          : 'border-[var(--color-card-hover)]',
        highlight && 'ring-1 ring-yellow-500/30',
      )}
    >
      <p className={clsx('text-2xl font-[var(--font-display)] leading-none', colors[accent])}>
        {value}
      </p>
      <p className="text-[11px] font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide mt-1 uppercase">
        {label}
      </p>
    </button>
  )
}

// Avoid unused import warning when ORDER_STATUS_META isn't used externally.
void ORDER_STATUS_META
void todayIso
