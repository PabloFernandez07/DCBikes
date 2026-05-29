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
  XCircle,
  Pencil,
  Loader2,
  History,
  RefreshCw,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { SEO } from '@/components/layout/SEO'
import { OrderStatusBadge, type OrderStatus } from '@/components/public/OrderStatusBadge'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ToastContainer } from '@/components/ui/Toast'
import { useToast } from '@/hooks/useToast'
import {
  orderShippingSchema,
  type OrderShippingFormValues,
  PROVINCIAS_PENINSULA,
} from '@/schemas/order-shipping'

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
  shipping_notes?: string | null
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
  client_modified_at?: string | null
  cancelled_by_customer?: boolean
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

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
  const { toasts, toast, dismiss } = useToast()

  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Cancel modal
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  // Edit address modal
  const [editOpen, setEditOpen] = useState(false)
  const [savingAddress, setSavingAddress] = useState(false)

  // Factura (descarga / generación bajo demanda)
  const [requestingInvoice, setRequestingInvoice] = useState(false)
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false)
  const [fiscalWantsFull, setFiscalWantsFull] = useState(false)
  const [fiscalDni, setFiscalDni] = useState('')
  const [fiscalBusinessName, setFiscalBusinessName] = useState('')
  const [fiscalCif, setFiscalCif] = useState('')
  const [fiscalAddress, setFiscalAddress] = useState('')

  const {
    register: registerAddress,
    handleSubmit: handleSubmitAddress,
    reset: resetAddress,
    formState: { errors: addressErrors },
  } = useForm<OrderShippingFormValues>({
    resolver: zodResolver(orderShippingSchema),
    defaultValues: {
      address: '',
      city: '',
      postal_code: '',
      province: '',
      notes: '',
    },
  })

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
      // El backend devuelve { ok, order, invoice }. La factura viene en una
      // propiedad SEPARADA (no anidada en order). Fusionamos los campos de
      // factura en el order para que el render condicional del botón de
      // descarga funcione.
      const invoiceData = (data as unknown as {
        invoice?: { invoice_number: string; signed_url: string | null } | null
      }).invoice
      setOrder({
        ...data.order,
        invoice_number: invoiceData?.invoice_number ?? null,
        invoice_signed_url: invoiceData?.signed_url ?? null,
      })
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

  // Pre-fill address form when opening modal.
  const openEditModal = () => {
    if (!order) return
    resetAddress({
      address: order.shipping_address ?? '',
      city: order.shipping_city ?? '',
      postal_code: order.shipping_postal_code ?? '',
      province: order.shipping_province ?? '',
      notes: order.shipping_notes ?? '',
    })
    setEditOpen(true)
  }

  // Solicita (y descarga) la factura. Si el backend responde que faltan datos
  // fiscales, abre el formulario para completarlos y reintenta.
  const requestInvoice = async (extra?: {
    dni?: string
    full_invoice?: boolean
    business_name?: string
    cif?: string
    address?: string
  }) => {
    if (!order || requestingInvoice) return
    const session = readSession()
    if (!session) {
      navigate('/mis-pedidos', { replace: true })
      return
    }
    setRequestingInvoice(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok: boolean
        error?: string
        signed_url?: string | null
        invoice_number?: string | null
        fiscal_data_required?: boolean
        need?: string[]
        full_invoice?: boolean
      }>('customer-request-invoice', {
        body: { token: session.token, order_id: order.id, ...extra },
      })

      if (fnError) {
        const ctx = (fnError as unknown as { context?: Response & { status?: number } }).context
        if (ctx?.status === 401 || ctx?.status === 403) {
          try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
          navigate('/mis-pedidos', { replace: true })
          return
        }
        // Mensaje específico del backend (viene en el cuerpo JSON de la Response).
        let detail = fnError.message
        if (ctx && typeof ctx.json === 'function') {
          try {
            const b = (await ctx.json()) as { error?: string }
            if (b?.error) detail = b.error
          } catch { /* ignore */ }
        }
        toast.error(detail || 'No se pudo generar la factura')
        return
      }

      if (data?.fiscal_data_required) {
        setFiscalWantsFull(!!data.full_invoice)
        setInvoiceFormOpen(true)
        return
      }
      if (!data?.ok) {
        toast.error(data?.error ?? 'No se pudo generar la factura')
        return
      }
      if (data.signed_url) {
        setOrder((prev) =>
          prev
            ? { ...prev, invoice_signed_url: data.signed_url!, invoice_number: data.invoice_number ?? prev.invoice_number }
            : prev,
        )
        setInvoiceFormOpen(false)
        window.open(data.signed_url, '_blank', 'noopener,noreferrer')
        toast.success('Factura lista')
      } else {
        toast.error('La factura se generó pero no se pudo obtener el enlace. Refresca la página.')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al generar la factura')
    } finally {
      setRequestingInvoice(false)
    }
  }

  const submitFiscalForm = () => {
    if (fiscalWantsFull) {
      requestInvoice({
        full_invoice: true,
        business_name: fiscalBusinessName.trim(),
        cif: fiscalCif.trim(),
        address: fiscalAddress.trim(),
      })
    } else {
      requestInvoice({ dni: fiscalDni.trim() })
    }
  }

  // Abre el formulario de factura dejando elegir el tipo (por defecto simplificada).
  const openInvoiceForm = () => {
    if (!order) return
    setFiscalWantsFull(false)
    // Prefill del nombre con el del pedido (útil para la factura completa).
    if (!fiscalBusinessName) {
      setFiscalBusinessName(`${order.customer_first_name} ${order.customer_last_name}`.trim())
    }
    setInvoiceFormOpen(true)
  }

  const handleCancelOrder = async () => {
    if (!order || cancelling) return
    const session = readSession()
    if (!session) {
      navigate('/mis-pedidos', { replace: true })
      return
    }
    setCancelling(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok: boolean
        error?: string
      }>('customer-order-cancel', {
        body: {
          token: session.token,
          order_id: order.id,
          ...(cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
        },
      })
      if (fnError) {
        const ctx = (fnError as unknown as { context?: { status?: number } }).context
        const status = ctx?.status
        if (status === 422) {
          // El edge function devuelve mensaje en data.error si pudo serializar.
          toast.error(data?.error ?? 'No se puede cancelar este pedido en su estado actual.')
        } else if (status === 502) {
          toast.error('Error con la pasarela de pago. Contacta con la tienda.')
        } else if (status === 401 || status === 403) {
          try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
          navigate('/mis-pedidos', { replace: true })
          return
        } else {
          toast.error(fnError.message || 'No se pudo cancelar el pedido')
        }
        return
      }
      if (!data?.ok) {
        toast.error(data?.error ?? 'No se pudo cancelar el pedido')
        return
      }
      toast.success('Pedido cancelado')
      setCancelOpen(false)
      setCancelReason('')
      // Recargamos el detail para reflejar el nuevo estado.
      await fetchDetail(order.id, session.token)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cancelar el pedido')
    } finally {
      setCancelling(false)
    }
  }

  const onSubmitAddress = async (values: OrderShippingFormValues) => {
    if (!order || savingAddress) return
    const session = readSession()
    if (!session) {
      navigate('/mis-pedidos', { replace: true })
      return
    }
    setSavingAddress(true)
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok: boolean
        error?: string
      }>('customer-order-update-address', {
        body: {
          token: session.token,
          order_id: order.id,
          shipping: {
            address: values.address.trim(),
            city: values.city.trim(),
            postal_code: values.postal_code.trim(),
            province: values.province,
            ...(values.notes && values.notes.trim()
              ? { notes: values.notes.trim() }
              : {}),
          },
        },
      })
      if (fnError) {
        const ctx = (fnError as unknown as { context?: { status?: number } }).context
        const status = ctx?.status
        if (status === 422) {
          toast.error(data?.error ?? 'Datos no válidos. Revisa los campos.')
        } else if (status === 401 || status === 403) {
          try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
          navigate('/mis-pedidos', { replace: true })
          return
        } else {
          toast.error(fnError.message || 'Error al actualizar la dirección')
        }
        return
      }
      if (!data?.ok) {
        toast.error(data?.error ?? 'No se pudo actualizar la dirección')
        return
      }
      toast.success('Dirección actualizada')
      setEditOpen(false)
      await fetchDetail(order.id, session.token)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar la dirección')
    } finally {
      setSavingAddress(false)
    }
  }

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

  // Visibilidad acciones cliente.
  const canCancel = order.status === 'authorized'
  const canEditAddress =
    order.delivery_method === 'shipping' &&
    (order.status === 'pending' || order.status === 'authorized' || order.status === 'accepted') &&
    !order.cancelled_by_customer
  const showActions = canCancel || canEditAddress
  const wasModified = !!order.client_modified_at

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
            <ArrowLeft size={13} aria-hidden="true" />
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
              {wasModified && order.client_modified_at && (
                <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[11px] font-[var(--font-cond)] tracking-wide bg-orange-500/10 text-orange-200 border border-orange-500/30">
                  <History size={11} aria-hidden="true" />
                  Modificado el {formatDateTime(order.client_modified_at)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const s = readSession()
                  if (s && order) fetchDetail(order.id, s.token)
                }}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)]/40 transition-colors disabled:opacity-50"
                title="Refrescar pedido"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
                Refrescar
              </button>
              <OrderStatusBadge status={order.status} size="md" />
            </div>
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
                        {reached ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
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
            <Truck size={20} className="text-sky-300 shrink-0 mt-0.5" aria-hidden="true" />
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
            <Package size={15} className="text-[var(--color-lavender)]" aria-hidden="true" />
            Artículos ({(order.items ?? []).length})
          </h2>
          <ul className="space-y-2">
            {(order.items ?? []).map((item, idx) => (
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
                    <Bike size={18} strokeWidth={1} className="text-[var(--color-mid)]" aria-hidden="true" />
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
              {order.delivery_method === 'shipping' ? <Truck size={11} aria-hidden="true" /> : <Store size={11} aria-hidden="true" />}
              {order.delivery_method === 'shipping' ? 'Dirección de envío' : 'Recogida en tienda'}
            </h3>
            {order.delivery_method === 'shipping' ? (
              <div className="text-sm text-[var(--color-cream)] font-[var(--font-body)] space-y-0.5">
                {order.shipping_address && (
                  <p className="inline-flex items-start gap-1.5">
                    <MapPin size={13} className="text-[var(--color-mid)] mt-0.5 shrink-0" aria-hidden="true" />
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

        {/* Factura — disponible para descargar en todo pedido facturable.
            Si aún no se ha emitido, se genera bajo demanda (pidiendo los datos
            fiscales que falten). */}
        {(['accepted', 'ready_pickup', 'shipped', 'delivered', 'returned'].includes(order.status)) && (
          <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[rgba(196,162,207,0.12)] text-[var(--color-lavender)] flex items-center justify-center shrink-0">
                <FileText size={18} aria-hidden="true" />
              </div>
              <div>
                <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)]">
                  {order.invoice_signed_url ? 'Factura disponible' : 'Factura'}
                </p>
                {order.invoice_number ? (
                  <p className="text-xs text-[var(--color-mid)]">{order.invoice_number}</p>
                ) : (
                  <p className="text-xs text-[var(--color-mid)]">Descárgala en PDF cuando la necesites</p>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={requestingInvoice}
              onClick={() =>
                order.invoice_signed_url
                  ? window.open(order.invoice_signed_url, '_blank', 'noopener,noreferrer')
                  : openInvoiceForm()
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold text-sm tracking-wide hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {requestingInvoice ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Download size={14} aria-hidden="true" />
              )}
              {order.invoice_signed_url ? 'Descargar factura PDF' : 'Descargar factura'}
            </button>
          </section>
        )}

        {/* Acciones del cliente (cancelar / modificar dirección) */}
        {showActions && (
          <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-5">
            <h2 className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-3">
              Acciones disponibles
            </h2>
            <div className="flex flex-wrap gap-2">
              {canEditAddress && (
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-[var(--font-cond)] font-semibold tracking-wide bg-[var(--color-card-hover)] text-[var(--color-cream)] border border-[var(--color-mid)]/30 hover:border-[var(--color-lavender)]/50 hover:text-[var(--color-lavender)] transition-colors"
                >
                  <Pencil size={14} aria-hidden="true" />
                  Modificar dirección
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-[var(--font-cond)] font-semibold tracking-wide bg-red-900/15 text-red-300 border border-red-700/40 hover:bg-red-900/25 hover:border-red-600/60 transition-colors"
                >
                  <XCircle size={14} aria-hidden="true" />
                  Cancelar pedido
                </button>
              )}
            </div>
            {canCancel && (
              <p className="text-[11px] text-[var(--color-mid)] mt-3 leading-relaxed font-[var(--font-body)]">
                Mientras tu pedido esté pendiente de aprobación puedes cancelarlo sin coste:
                liberaremos la reserva de pago de tu tarjeta automáticamente.
              </p>
            )}
          </section>
        )}
      </div>

      {/* Modal Cancelar */}
      <Modal
        open={cancelOpen}
        onClose={() => { if (!cancelling) { setCancelOpen(false); setCancelReason('') } }}
        title="¿Cancelar este pedido?"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
            Se liberará la reserva de pago de tu tarjeta automáticamente. No se cargará
            ningún importe. Esta acción no se puede deshacer.
          </p>
          <div>
            <label
              htmlFor="cancel-reason"
              className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-1 block"
            >
              Motivo (opcional)
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Cuéntanos por qué cancelas…"
              className="w-full text-sm text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] px-3 py-2 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/50 focus:outline-none transition-colors resize-y"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCancelOpen(false); setCancelReason('') }}
              disabled={cancelling}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleCancelOrder}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <XCircle size={13} aria-hidden="true" />}
              Sí, cancelar pedido
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Modificar dirección */}
      <Modal
        open={editOpen}
        onClose={() => { if (!savingAddress) setEditOpen(false) }}
        title="Modificar dirección de envío"
        size="md"
      >
        <form onSubmit={handleSubmitAddress(onSubmitAddress)} className="space-y-4">
          <Field
            label="Dirección"
            required
            placeholder="Calle, número, piso, puerta…"
            error={addressErrors.address?.message}
            {...registerAddress('address')}
          />
          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              label="Código postal"
              required
              placeholder="28001"
              inputMode="numeric"
              maxLength={5}
              error={addressErrors.postal_code?.message}
              {...registerAddress('postal_code')}
            />
            <Field
              label="Ciudad"
              required
              placeholder="Madrid"
              error={addressErrors.city?.message}
              {...registerAddress('city')}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="edit-province"
              className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide"
            >
              Provincia
              <span className="text-[var(--color-brand-red)] ml-0.5">*</span>
            </label>
            <select
              id="edit-province"
              className={clsx(
                'w-full bg-[var(--color-ink)] border rounded-lg px-4 py-2.5 text-[var(--color-cream)]',
                'font-[var(--font-body)] text-sm transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-[var(--color-lavender)]/50 focus:border-[var(--color-lavender)]',
                addressErrors.province
                  ? 'border-[var(--color-brand-red)]'
                  : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60',
              )}
              {...registerAddress('province')}
            >
              <option value="">Selecciona provincia…</option>
              {PROVINCIAS_PENINSULA.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            {addressErrors.province && (
              <p className="text-xs text-[var(--color-brand-red)] font-[var(--font-body)]">
                {addressErrors.province.message}
              </p>
            )}
          </div>
          <Field
            label="Notas para la entrega (opcional)"
            as="textarea"
            rows={3}
            placeholder="Indicaciones para el repartidor…"
            error={addressErrors.notes?.message}
            {...registerAddress('notes')}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setEditOpen(false)}
              disabled={savingAddress}
            >
              Cancelar
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={savingAddress}>
              {savingAddress ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Pencil size={13} aria-hidden="true" />}
              Guardar dirección
            </Button>
          </div>
        </form>
      </Modal>

      {/* Datos fiscales para emitir la factura (cuando faltan en el pedido) */}
      <Modal
        open={invoiceFormOpen}
        onClose={() => { if (!requestingInvoice) setInvoiceFormOpen(false) }}
        title="Datos para la factura"
        size="md"
      >
        <div className="space-y-4">
          {/* Selector de tipo de factura */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide">
              Tipo de factura
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { value: false, label: 'Simplificada', desc: 'Con tu NIF/DNI' },
                  { value: true, label: 'Completa', desc: 'Con todos tus datos fiscales' },
                ] as const
              ).map((opt) => {
                const selected = fiscalWantsFull === opt.value
                return (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setFiscalWantsFull(opt.value)}
                    aria-pressed={selected}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      selected
                        ? 'border-[var(--color-lavender)] bg-[rgba(196,162,207,0.10)]'
                        : 'border-[var(--color-card-hover)] hover:border-[var(--color-mid)]/60'
                    }`}
                  >
                    <span className="block font-[var(--font-cond)] font-semibold text-sm text-[var(--color-cream)]">
                      {opt.label}
                    </span>
                    <span className="block text-xs text-[var(--color-mid)] mt-0.5">{opt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
            {fiscalWantsFull
              ? 'Factura completa: incluye tu razón social/nombre, NIF/CIF y dirección fiscal.'
              : 'Factura simplificada: solo necesitamos tu NIF/DNI.'}
          </p>

          {fiscalWantsFull ? (
            <>
              <Field
                label="Razón social o nombre y apellidos"
                required
                value={fiscalBusinessName}
                onChange={(e) => setFiscalBusinessName(e.target.value)}
                placeholder="Empresa S.L. o tu nombre completo"
              />
              <Field
                label="NIF / CIF"
                required
                value={fiscalCif}
                onChange={(e) => setFiscalCif(e.target.value)}
                placeholder="B12345678"
              />
              <Field
                label="Dirección fiscal"
                required
                value={fiscalAddress}
                onChange={(e) => setFiscalAddress(e.target.value)}
                placeholder="Calle, nº, CP, ciudad"
              />
            </>
          ) : (
            <Field
              label="NIF / DNI"
              required
              value={fiscalDni}
              onChange={(e) => setFiscalDni(e.target.value)}
              placeholder="12345678Z"
            />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => { if (!requestingInvoice) setInvoiceFormOpen(false) }}
              disabled={requestingInvoice}
            >
              Cancelar
            </Button>
            <Button variant="primary" size="sm" type="button" onClick={submitFiscalForm} disabled={requestingInvoice}>
              {requestingInvoice ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
              Generar factura
            </Button>
          </div>
        </div>
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
