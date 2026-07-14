import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ChevronLeft, ChevronRight, Eye, FileDown, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { OrderStatusBadge, ORDER_STATUS_META, type OrderStatus } from '@/components/admin/OrderStatusBadge'
import { BulkShipBar } from '@/components/admin/BulkShipBar'
import { BulkShipModal, type BulkShipOrder } from '@/components/admin/BulkShipModal'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { buildOrdersCsv, downloadCsv, defaultCsvFilename, type CsvOrderItem } from '@/lib/csvExport'
import { notifyBadgeRefresh } from '@/lib/adminBadges'
import type { Database } from '@/lib/database.types'

type Order = Database['public']['Tables']['orders']['Row']

/**
 * Un pedido es "seleccionable" para acciones en lote sólo si está aceptado,
 * con método de envío, y no eliminado. Esto centraliza la regla para que
 * el header y la lógica de "seleccionar todos" estén sincronizados.
 */
function isOrderBulkEligible(o: Order): boolean {
  return o.status === 'accepted' && o.delivery_method === 'shipping' && !o.deleted_at
}

/**
 * Seleccionable para acciones en lote GENERALES (p.ej. eliminar): cualquier
 * pedido no eliminado. El envío en lote sigue restringido a isOrderBulkEligible.
 */
function isOrderSelectable(o: Order): boolean {
  return !o.deleted_at
}

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
  const { toasts, toast, dismiss } = useToast()

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
  // `searchInput` refleja lo tecleado; `search` (con debounce de 300 ms) es lo
  // que dispara la query. Sin esto se lanzaba 1 query por tecla (PERF-M5).
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [showDeleted, setShowDeleted] = useState(false)

  // ── Bulk selection ────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkModalOpen, setBulkModalOpen] = useState(false)
  const [exportingCsv, setExportingCsv] = useState(false)

  // Counters
  const [counters, setCounters] = useState({
    total: 0,
    authorized: 0,
    accepted: 0,
    ready_pickup: 0,
  })

  const fetchCounters = useCallback(async () => {
    // Los contadores excluyen pedidos soft-deleted, igual que la lista por
    // defecto; si no, las cards mostraban más pedidos de los visibles (BUG-B1).
    const [totalRes, authRes, accRes, readyRes] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).is('deleted_at', null),
      supabase.from('orders').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'authorized'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'accepted'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('status', 'ready_pickup'),
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
      // 'YYYY-MM-DD' a secas se interpreta como medianoche UTC; con horario
      // de verano eso excluía pedidos de 00:00–02:00 locales (BUG-B2).
      // Añadiendo la hora, el Date se construye en hora LOCAL.
      query = query.gte('created_at', new Date(`${dateFrom}T00:00:00`).toISOString())
    }
    if (dateTo) {
      // Fin de día inclusivo, también construido en hora local.
      const end = new Date(`${dateTo}T23:59:59.999`)
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

  // Debounce de la búsqueda: confirma el término cuando el usuario deja de
  // teclear durante 300 ms (el reset de página ya depende de `search`).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput])

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

  // Reset selection cuando cambian filtros / página / búsqueda. Mantenerla
  // sería confuso porque los pedidos visibles cambian.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, statusFilter, deliveryFilter, dateFrom, dateTo, search, showDeleted])

  // ── Selection helpers ──────────────────────────────────────────
  const selectableOnPage = useMemo(
    () => orders.filter(isOrderSelectable),
    [orders],
  )
  const allOnPageSelected =
    selectableOnPage.length > 0 &&
    selectableOnPage.every(o => selectedIds.has(o.id))
  const someOnPageSelected =
    selectableOnPage.some(o => selectedIds.has(o.id)) && !allOnPageSelected

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllOnPage = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        // Quita los de esta página, conserva el resto (improbable pero por si).
        for (const o of selectableOnPage) next.delete(o.id)
      } else {
        for (const o of selectableOnPage) next.add(o.id)
      }
      return next
    })
  }, [allOnPageSelected, selectableOnPage])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // Pedidos seleccionados en la página actual (los únicos que están cargados
  // en memoria). El bulk modal sólo opera sobre ellos.
  const selectedOrders = useMemo(
    () => orders.filter(o => selectedIds.has(o.id)),
    [orders, selectedIds],
  )

  // Solo los enviables de entre los seleccionados (aceptados + envío). El modal
  // de "marcar enviados" opera únicamente sobre estos; el botón se deshabilita
  // si no hay ninguno (p.ej. si solo seleccionaste pedidos de recogida).
  const bulkShipOrders: BulkShipOrder[] = useMemo(
    () => selectedOrders.filter(isOrderBulkEligible).map(o => ({
      id: o.id,
      order_number: o.order_number,
      customer_first_name: o.customer_first_name,
      customer_last_name: o.customer_last_name,
    })),
    [selectedOrders],
  )

  // ── Borrado en lote (soft-delete) ─────────────────────────────
  const [deletingBulk, setDeletingBulk] = useState(false)
  const handleBulkDelete = useCallback(async () => {
    if (deletingBulk || selectedOrders.length === 0) return
    const n = selectedOrders.length
    const ok = window.confirm(
      `¿Eliminar ${n} pedido${n > 1 ? 's' : ''}? Se marcarán como eliminados ` +
        `(recuperables con el interruptor "mostrar eliminados").`,
    )
    if (!ok) return
    setDeletingBulk(true)
    let done = 0
    let failed = 0
    for (const o of selectedOrders) {
      try {
        const { data, error } = await supabase.functions.invoke('order-delete', {
          body: { order_id: o.id },
        })
        if (error || !(data as { ok?: boolean })?.ok) failed++
        else done++
      } catch {
        failed++
      }
    }
    setDeletingBulk(false)
    setSelectedIds(new Set())
    if (done > 0) toast.success(`${done} pedido${done > 1 ? 's' : ''} eliminado${done > 1 ? 's' : ''}`)
    if (failed > 0) toast.error(`${failed} no se pudieron eliminar`)
    fetchOrders()
    fetchCounters()
    // Eliminar un pedido 'authorized' baja el badge del menú, y esto pasa sin cambiar
    // de ruta: hay que avisar al AdminShell (mismo motivo que en Consultas).
    notifyBadgeRefresh('orders')
  }, [deletingBulk, selectedOrders, toast, fetchOrders, fetchCounters])

  // ── CSV export ────────────────────────────────────────────────
  /**
   * Exporta a CSV. Si `useSelection` es true, exporta los pedidos seleccionados
   * actualmente. Si es false, descarga TODOS los pedidos accepted+shipping no
   * eliminados (consulta independiente a la lista actual, sin paginar).
   */
  const handleExportCsv = useCallback(async (useSelection: boolean) => {
    if (exportingCsv) return
    setExportingCsv(true)
    try {
      let ordersToExport: Order[] = []

      if (useSelection) {
        if (selectedOrders.length === 0) {
          toast.error('No hay pedidos seleccionados.')
          return
        }
        ordersToExport = selectedOrders
      } else {
        // Sin selección: trae TODOS los pedidos pendientes de envío.
        const { data, error } = await supabase
          .from('orders')
          .select('*')
          .eq('status', 'accepted')
          .eq('delivery_method', 'shipping')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (error) {
          console.error('[OrdersList] export csv', error)
          toast.error('Error al cargar pedidos para exportar.')
          return
        }
        ordersToExport = (data as Order[]) ?? []
      }

      if (ordersToExport.length === 0) {
        toast.info('No hay pedidos pendientes de envío para exportar.')
        return
      }

      // Trae items + producto (para weight_grams). Una sola query con join.
      const ids = ordersToExport.map(o => o.id)
      const { data: itemsData, error: itemsErr } = await supabase
        .from('order_items')
        .select('order_id, product_name, product_size_label, quantity, product_id, products:product_id ( weight_grams )')
        .in('order_id', ids)

      if (itemsErr) {
        console.error('[OrdersList] export csv items', itemsErr)
        toast.error('Error al cargar items para exportar.')
        return
      }

      // Agrupa items por order_id.
      type JoinedItem = {
        order_id: string
        product_name: string
        product_size_label: string | null
        quantity: number
        product_id: string | null
        // Supabase tipa la relación como array o single dependiendo del FK. Aceptamos ambos.
        products: { weight_grams: number | null } | { weight_grams: number | null }[] | null
      }
      const itemsByOrder = new Map<string, CsvOrderItem[]>()
      for (const raw of (itemsData as JoinedItem[] | null) ?? []) {
        const productRel = Array.isArray(raw.products) ? raw.products[0] : raw.products
        const weight = productRel?.weight_grams ?? null
        const item: CsvOrderItem = {
          product_name: raw.product_name,
          product_size_label: raw.product_size_label,
          quantity: raw.quantity,
          weight_grams: weight,
        }
        const list = itemsByOrder.get(raw.order_id) ?? []
        list.push(item)
        itemsByOrder.set(raw.order_id, list)
      }

      const rows = ordersToExport.map(o => ({
        order: o,
        items: itemsByOrder.get(o.id) ?? [],
      }))

      const csv = buildOrdersCsv(rows)
      downloadCsv(defaultCsvFilename(), csv)
      toast.success(`Exportados ${ordersToExport.length} ${ordersToExport.length === 1 ? 'pedido' : 'pedidos'}`)
    } finally {
      setExportingCsv(false)
    }
  }, [exportingCsv, selectedOrders, toast])

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
            <ChevronLeft size={16} aria-hidden="true" />
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
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    )
  }, [page, total, totalPages])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            PEDIDOS
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            {counters.total} pedidos en total
          </p>
        </div>
        <button
          type="button"
          onClick={() => { fetchOrders(); fetchCounters() }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] border border-[var(--color-card-hover)] hover:border-[var(--color-lavender)]/40 hover:text-[var(--color-cream)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refrescar lista de pedidos"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Refrescar
        </button>
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
          <div className="flex flex-col gap-1 flex-1 min-w-[130px] sm:flex-none">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[130px] sm:flex-none">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
            />
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[130px] sm:flex-none">
            <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
              Método entrega
            </label>
            <select
              value={deliveryFilter}
              onChange={e => setDeliveryFilter(e.target.value as DeliveryFilter)}
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] px-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
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
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)]" aria-hidden="true" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Nº pedido, email, teléfono…"
                className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-card)] pl-9 pr-3 py-1.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={showDeleted}
            onClick={() => setShowDeleted(v => !v)}
            className="flex items-center gap-2 pb-1.5 cursor-pointer select-none group"
          >
            <span
              className={clsx(
                'relative inline-block h-5 w-10 shrink-0 rounded-full transition-colors',
                showDeleted ? 'bg-[var(--color-lavender)]/60' : 'bg-[var(--color-card-hover)]',
              )}
              aria-hidden="true"
            >
              <span
                className={clsx(
                  'absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-[var(--color-cream)] transition-all',
                  showDeleted ? 'left-[1.375rem]' : 'left-[0.125rem]',
                )}
              />
            </span>
            <span className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-cream-dim)] whitespace-nowrap group-hover:text-[var(--color-cream)] transition-colors">
              Mostrar eliminados
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleExportCsv(false)}
            disabled={exportingCsv}
            className="w-full sm:w-auto justify-center inline-flex items-center gap-1.5 px-3 py-1.5 mb-0.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-lavender)] border border-[var(--color-lavender)]/40 hover:bg-[var(--color-lavender)]/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Exportar pedidos aceptados de envío como CSV (formato transportistas)"
          >
            <FileDown size={13} aria-hidden="true" />
            {exportingCsv ? 'Exportando…' : 'Exportar pendientes envío (CSV)'}
          </button>
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
                    <th className="px-3 py-3.5 w-10 text-left">
                      {/* Checkbox "seleccionar todos los de esta página". Sólo
                          activa los pedidos elegibles (accepted+shipping+!deleted). */}
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los pedidos elegibles de esta página"
                        checked={allOnPageSelected}
                        ref={el => {
                          if (el) el.indeterminate = someOnPageSelected
                        }}
                        onChange={toggleAllOnPage}
                        disabled={selectableOnPage.length === 0}
                        className="accent-[var(--color-lavender)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </th>
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
                    const eligible = isOrderSelectable(o)
                    const checked = selectedIds.has(o.id)
                    return (
                    <tr
                      key={o.id}
                      onClick={() => navigate(`/admin/pedidos/${o.id}`)}
                      className={clsx(
                        'border-b border-[var(--color-card-hover)]/40 last:border-0 cursor-pointer transition-colors',
                        checked && 'bg-[var(--color-lavender)]/10',
                        isDeleted
                          ? 'opacity-60 bg-[var(--color-ink)]/40 hover:bg-[var(--color-card-hover)]/40'
                          : o.status === 'authorized'
                            ? 'bg-yellow-500/5 hover:bg-yellow-500/10'
                            : 'hover:bg-[var(--color-card-hover)]/30',
                      )}
                    >
                      <td
                        className="px-3 py-3 w-10"
                        onClick={e => e.stopPropagation()}
                      >
                        {eligible ? (
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar pedido ${o.order_number}`}
                            checked={checked}
                            onChange={() => toggleOne(o.id)}
                            className="accent-[var(--color-lavender)] cursor-pointer"
                          />
                        ) : null}
                      </td>
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
                          {o.cancelled_by_customer && (
                            <span
                              title="El cliente canceló este pedido"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-red-900/20 text-red-300 border-red-700/40 uppercase"
                            >
                              Cliente canceló
                            </span>
                          )}
                          {o.client_modified_at && !o.cancelled_by_customer && (
                            <span
                              title={`Modificado por el cliente el ${formatDate(o.client_modified_at)}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-orange-500/15 text-orange-200 border-orange-500/40 uppercase"
                            >
                              Modificado
                            </span>
                          )}
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
                          <Eye size={13} aria-hidden="true" />
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
                const eligible = isOrderSelectable(o)
                const checked = selectedIds.has(o.id)
                return (
                <li
                  key={o.id}
                  onClick={() => navigate(`/admin/pedidos/${o.id}`)}
                  className={clsx(
                    'px-4 py-4 cursor-pointer transition-colors',
                    checked && 'bg-[var(--color-lavender)]/10',
                    isDeleted
                      ? 'opacity-60 bg-[var(--color-ink)]/40 hover:bg-[var(--color-card-hover)]/40'
                      : o.status === 'authorized'
                        ? 'bg-yellow-500/5 hover:bg-yellow-500/10'
                        : 'hover:bg-[var(--color-card-hover)]/30',
                  )}
                >
                  {eligible && (
                    <div
                      className="mb-2"
                      onClick={e => e.stopPropagation()}
                    >
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar pedido ${o.order_number}`}
                          checked={checked}
                          onChange={() => toggleOne(o.id)}
                          className="accent-[var(--color-lavender)]"
                        />
                        <span className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
                          {checked ? 'Seleccionado' : 'Seleccionar'}
                        </span>
                      </label>
                    </div>
                  )}
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
                      {o.cancelled_by_customer && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-red-900/20 text-red-300 border-red-700/40 uppercase">
                          Cliente canceló
                        </span>
                      )}
                      {o.client_modified_at && !o.cancelled_by_customer && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] tracking-wide border bg-orange-500/15 text-orange-200 border-orange-500/40 uppercase">
                          Modificado
                        </span>
                      )}
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

      {/* Padding extra para que el bottom bar flotante no tape contenido */}
      {selectedIds.size > 0 && <div aria-hidden="true" className="h-20" />}

      {/* Barra de acciones en lote (sticky bottom) */}
      {selectedIds.size > 0 && (
        <BulkShipBar
          count={selectedIds.size}
          onMarkShipped={() => setBulkModalOpen(true)}
          onExportSelected={() => handleExportCsv(true)}
          onDeleteSelected={handleBulkDelete}
          onClear={clearSelection}
          disabled={exportingCsv}
          shipDisabled={bulkShipOrders.length === 0}
          deleting={deletingBulk}
        />
      )}

      {/* Modal "marcar como enviados (bulk)" */}
      <BulkShipModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        orders={bulkShipOrders}
        toast={toast}
        onAnySuccess={() => {
          // Refresca lista y contadores para que pedidos enviados desaparezcan
          // del filtro "accepted" actual sin esperar a cerrar el modal.
          fetchOrders()
          fetchCounters()
        }}
        onAllSuccess={() => {
          setBulkModalOpen(false)
          clearSelection()
        }}
      />

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
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
