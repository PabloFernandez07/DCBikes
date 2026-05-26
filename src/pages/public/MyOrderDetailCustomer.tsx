import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Bike,
  Truck,
  Store,
  Download,
  FileText,
  Package,
  MapPin,
  CheckCircle2,
  Circle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { SEO } from '@/components/layout/SEO'
import { OrderStatusBadge, type OrderStatus } from '@/components/public/OrderStatusBadge'

const STORAGE_KEY = 'dcbikes_customer_session'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

interface StoredSession {
  token: string
  savedAt: number
}

function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (!parsed?.token || !parsed?.savedAt) return null
    if (Date.now() - parsed.savedAt > SESSION_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

interface CustomerOrderItem {
  product_name: string
  product_size_label: string | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  image_url?: string | null
}

interface CustomerOrderDetail {
  id: string
  order_number: string
  status: OrderStatus
  delivery_method: 'shipping' | 'pickup'
  customer_first_name: string
  customer_last_name: string
  customer_email: string
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_province: string | null
  tracking_number: string | null
  tracking_carrier: string | null
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  tax_rate: number
  items: CustomerOrderItem[]
  invoice_signed_url?: string | null
  invoice_number?: string | null
  created_at: string
}

interface DetailResponse {
  ok: boolean
  order?: CustomerOrderDetail
  error?: string
}

function fmtEuros(cents: number) {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

// Timeline simplificado para el cliente: pending → authorized → accepted →
// shipped/ready_pickup → delivered. Estados terminales negativos (rejected,
// cancelled, payment_failed, returned) se muestran como "Cerrado".
type TimelineStep = {
  key: string
  label: string
}

function buildTimeline(deliveryMethod: 'shipping' | 'pickup'): TimelineStep[] {
  return [
    { key: 'pending', label: 'Pedido recibido' },
    { key: 'authorized', label: 'Pago autorizado' },
    { key: 'accepted', label: 'Aceptado' },
    deliveryMethod === 'shipping'
      ? { key: 'shipped', label: 'Enviado' }
      : { key: 'ready_pickup', label: 'Listo para recoger' },
    { key: 'delivered', label: 'Entregado' },
  ]
}

const STEP_ORDER: Record<string, number> = {
  pending: 0,
  authorized: 1,
  accepted: 2,
  ready_pickup: 3,
  shipped: 3,
  delivered: 4,
}

export default function MyOrderDetailCustomer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchDetail = useCallback(async (orderId: string, token: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<DetailResponse>(
        'customer-order-detail',
        { body: { token, order_id: orderId } },
      )
      if (fnError) {
        const ctx = (fnError as unknown as { context?: { status?: number } }).context
        if (ctx?.status === 401 || ctx?.status === 403) {
          try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
          navigate('/mis-pedidos', { replace: true })
          return
        }
        throw new Error(fnError.message)
      }
      if (!data?.ok || !data.order) {
        if (data?.error === 'unauthorized' || data?.error === 'forbidden') {
          navigate('/mis-pedidos', { replace: true })
          return
        }
        throw new Error(data?.error ?? 'No se pudo cargar el pedido')
      }
      setOrder(data.order)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar el pedido')
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    const session = readSession()
    if (!session) {
      navigate('/mis-pedidos', { replace: true })
      return
    }
    if (!id) {
      navigate('/mis-pedidos', { replace: true })
      return
    }
    fetchDetail(id, session.token)
  }, [id, navigate, fetchDetail])

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20 text-center">
        <div className="inline-block w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
        <p className="mt-4 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
          Cargando pedido…
        </p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20 text-center space-y-4">
        <h1 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide">
          No pudimos cargar este pedido
        </h1>
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
          {error ?? 'Vuelve a la lista de pedidos.'}
        </p>
        <Link
          to="/mis-pedidos/sesion"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
        >
          Volver a mis pedidos
        </Link>
      </div>
    )
  }

  const timeline = buildTimeline(order.delivery_method)
  const currentIdx = STEP_ORDER[order.status] ?? -1
  const isClosed =
    order.status === 'rejected' ||
    order.status === 'cancelled' ||
    order.status === 'payment_failed' ||
    order.status === 'returned'

  const baseCents = Math.round(order.total_cents / (1 + order.tax_rate / 100))
  const taxCents = order.total_cents - baseCents

  // Volver a sesión preservándola: el token está en localStorage, lo pasamos por URL.
  const session = readSession()
  const backToList = session
    ? `/mis-pedidos/sesion?token=${encodeURIComponent(session.token)}`
    : '/mis-pedidos'

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-12">
      <SEO title={`Pedido ${order.order_number}`} noIndex />

      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <header>
          <Link
            to={backToList}
            className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hover:text-[var(--color-lavender)] mb-3 transition-colors"
          >
            <ArrowLeft size={13} />
            Volver a mis pedidos
          </Link>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl text-[var(--color-cream)] tracking-wide">
                Pedido {order.order_number}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-mid)] font-[var(--font-body)]">
                {formatDate(order.created_at)}
              </p>
            </div>
            <OrderStatusBadge status={order.status} size="md" />
          </div>
        </header>

        {/* Timeline */}
        {!isClosed && (
          <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
            <h2 className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-5">
              Estado del pedido
            </h2>
            <ol className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {timeline.map((step, idx) => {
                const reached = idx <= currentIdx
                const isCurrent = idx === currentIdx
                return (
                  <li key={step.key} className="flex flex-col items-center text-center gap-1.5">
                    <div className="relative w-full flex items-center justify-center">
                      {idx > 0 && (
                        <span
                          className={clsx(
                            'absolute right-1/2 top-1/2 -translate-y-1/2 h-px w-full',
                            reached ? 'bg-[var(--color-lavender)]/60' : 'bg-[var(--color-card-hover)]',
                          )}
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={clsx(
                          'relative z-10 inline-flex items-center justify-center w-7 h-7 rounded-full border-2 transition-colors',
                          reached
                            ? 'bg-[var(--color-lavender)]/20 border-[var(--color-lavender)] text-[var(--color-lavender)]'
                            : 'bg-[var(--color-card)] border-[var(--color-card-hover)] text-[var(--color-mid)]',
                          isCurrent && 'ring-2 ring-[var(--color-lavender)]/30',
                        )}
                      >
                        {reached ? <CheckCircle2 size={14} /> : <Circle size={10} />}
                      </span>
                    </div>
                    <span
                      className={clsx(
                        'text-[11px] font-[var(--font-cond)] tracking-wide leading-tight',
                        reached ? 'text-[var(--color-cream)]' : 'text-[var(--color-mid)]',
                      )}
                    >
                      {step.label}
                    </span>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {/* Tracking si aplica */}
        {order.status === 'shipped' && order.tracking_number && (
          <section className="bg-[rgba(56,189,248,0.06)] border border-sky-500/30 rounded-2xl p-5 flex items-start gap-3">
            <Truck size={20} className="text-sky-300 shrink-0 mt-0.5" />
            <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] mb-0.5">
                Tu pedido está en camino
              </p>
              <p>
                {order.tracking_carrier && (
                  <span className="text-[var(--color-mid)]">{order.tracking_carrier} · </span>
                )}
                <span className="font-mono text-[var(--color-cream)]">{order.tracking_number}</span>
              </p>
            </div>
          </section>
        )}

        {/* Items */}
        <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6">
          <h2 className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] tracking-wide mb-4 inline-flex items-center gap-2">
            <Package size={15} className="text-[var(--color-lavender)]" />
            Artículos ({order.items.length})
          </h2>
          <ul className="space-y-2">
            {order.items.map((item, idx) => (
              <li
                key={`${item.product_name}-${idx}`}
                className="flex items-center gap-3 py-2 border-b border-[var(--color-card-hover)] last:border-0"
              >
                <div className="w-14 h-14 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      className="w-full h-full object-contain p-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <Bike size={18} strokeWidth={1} className="text-[var(--color-mid)]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] line-clamp-2">
                    {item.product_name}
                  </p>
                  <p className="text-[11px] text-[var(--color-mid)]">
                    {item.product_size_label ? `Talla ${item.product_size_label} · ` : ''}
                    Cantidad {item.quantity} · {fmtEuros(item.unit_price_cents)} €
                  </p>
                </div>
                <span className="font-[var(--font-cond)] text-sm text-[var(--color-cream-dim)] tabular-nums whitespace-nowrap">
                  {fmtEuros(item.line_total_cents)} €
                </span>
              </li>
            ))}
          </ul>

          {/* Totals */}
          <div className="mt-5 pt-4 border-t border-[var(--color-card-hover)] space-y-1.5 text-sm font-[var(--font-cond)]">
            <div className="flex justify-between">
              <span className="text-[var(--color-mid)]">Subtotal</span>
              <span className="text-[var(--color-cream-dim)] tabular-nums">{fmtEuros(order.subtotal_cents)} €</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-mid)]">Envío</span>
              <span className="text-[var(--color-cream-dim)] tabular-nums">
                {order.shipping_cents === 0 ? 'Gratis' : `${fmtEuros(order.shipping_cents)} €`}
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-3 mt-2 border-t border-[var(--color-card-hover)]/60">
              <span className="font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-cream-dim)]">
                Total
              </span>
              <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] tracking-wide tabular-nums">
                {fmtEuros(order.total_cents)} €
              </span>
            </div>
            <p className="text-[10px] text-[var(--color-mid)] pt-1 tabular-nums text-right">
              Base {fmtEuros(baseCents)} € + IVA {order.tax_rate}% {fmtEuros(taxCents)} €
            </p>
          </div>
        </section>

        {/* Datos cliente + entrega */}
        <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 grid sm:grid-cols-2 gap-5">
          <div>
            <h3 className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2">
              Cliente
            </h3>
            <p className="text-sm text-[var(--color-cream)] font-[var(--font-body)]">
              {order.customer_first_name} {order.customer_last_name}
            </p>
            <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5 break-all">
              {order.customer_email}
            </p>
          </div>

          <div>
            <h3 className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2 inline-flex items-center gap-1.5">
              {order.delivery_method === 'shipping' ? <Truck size={11} /> : <Store size={11} />}
              {order.delivery_method === 'shipping' ? 'Dirección de envío' : 'Recogida en tienda'}
            </h3>
            {order.delivery_method === 'shipping' ? (
              <div className="text-sm text-[var(--color-cream)] font-[var(--font-body)] space-y-0.5">
                {order.shipping_address && (
                  <p className="inline-flex items-start gap-1.5">
                    <MapPin size={13} className="text-[var(--color-mid)] mt-0.5 shrink-0" />
                    <span>{order.shipping_address}</span>
                  </p>
                )}
                <p className="text-[var(--color-cream-dim)] pl-[18px]">
                  {order.shipping_postal_code} {order.shipping_city}
                  {order.shipping_province && `, ${order.shipping_province}`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
                Te avisaremos por email cuando esté listo para recoger en tienda.
              </p>
            )}
          </div>
        </section>

        {/* Factura */}
        {order.invoice_signed_url && (
          <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[rgba(196,162,207,0.12)] text-[var(--color-lavender)] flex items-center justify-center shrink-0">
                <FileText size={18} />
              </div>
              <div>
                <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)]">
                  Factura disponible
                </p>
                {order.invoice_number && (
                  <p className="text-xs text-[var(--color-mid)]">{order.invoice_number}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => order.invoice_signed_url && window.open(order.invoice_signed_url, '_blank', 'noopener,noreferrer')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold text-sm tracking-wide hover:brightness-110 transition-all"
            >
              <Download size={14} />
              Descargar factura PDF
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
