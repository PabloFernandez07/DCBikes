import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  CheckCircle,
  Bike,
  Mail,
  Truck,
  Store,
  Lock,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useCartStore } from '@/stores/cartStore'
import { useShopSettings } from '@/hooks/useShopSettings'
import { SEO } from '@/components/layout/SEO'

function fmtEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface OrderItemPublic {
  product_name: string
  product_size_label: string | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
  image_url?: string | null
}

interface OrderDetail {
  order_number: string
  status: string
  delivery_method: 'shipping' | 'pickup'
  customer_first_name: string
  customer_last_name: string
  customer_email: string
  shipping_city?: string | null
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  tax_rate: number
  items: OrderItemPublic[]
  created_at: string
}

/**
 * Página de confirmación post-pago autorizado.
 *
 * Llama a `order-public-get` con el token firmado para mostrar el resumen
 * del pedido sin requerir login (el cliente es guest). Vacía el carrito
 * al montar — solo aquí, porque hasta este punto el usuario podría haber
 * cancelado en Redsys y querer reintentar.
 */
export default function OrderConfirmation() {
  const { order_id } = useParams<{ order_id: string }>()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const clearCart = useCartStore(s => s.clear)
  const { settings } = useShopSettings()

  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Pedido recibido · DC Bikes Cantabria'
  }, [])

  // Vaciar el carrito una sola vez al montar la confirmación.
  useEffect(() => {
    clearCart()
    try {
      localStorage.removeItem('dcbikes_pending_order')
    } catch {
      // ignore
    }
  }, [clearCart])

  // Fetch del pedido público.
  useEffect(() => {
    if (!order_id || !token) {
      setError('Enlace de confirmación inválido. Faltan parámetros.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)

    supabase.functions
      .invoke('order-public-get', {
        body: { order_id, token },
      })
      .then(({ data, error: fnError }) => {
        if (cancelled) return
        if (fnError) {
          setError(fnError.message || 'No se pudo cargar el pedido')
          setLoading(false)
          return
        }
        if (!data?.ok || !data.order) {
          setError(data?.error || 'Pedido no encontrado o token caducado')
          setLoading(false)
          return
        }
        setOrder(data.order as OrderDetail)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [order_id, token])

  const autoCancelHours = settings.orderAutoCancelHours
  const taxRate = order?.tax_rate ?? settings.taxRateDefault
  const total = order?.total_cents ?? 0
  const baseCents = Math.round(total / (1 + taxRate / 100))
  const taxCents = total - baseCents

  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20 text-center text-[var(--color-mid)]">
        Cargando tu pedido…
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-md mx-auto text-center space-y-6">
          <h1 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide">
            No pudimos cargar tu pedido
          </h1>
          <p className="text-[var(--color-mid)] font-[var(--font-body)]">
            {error ?? 'Verifica que has llegado a esta página desde el enlace que te enviamos por email.'}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-12">
      <SEO
        title={`Pedido ${order.order_number} recibido`}
        description="Hemos recibido tu pedido y lo estamos revisando."
        noIndex={true}
      />

      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header celebratorio */}
        <header className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-[rgba(80,200,120,0.12)] flex items-center justify-center text-green-400 mx-auto">
            <CheckCircle size={42} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] tracking-wide">
            ¡Pedido recibido! <span role="img" aria-hidden="true">🎉</span>
          </h1>
          <p className="font-[var(--font-cond)] text-2xl text-[var(--color-lavender)] tracking-widest">
            {order.order_number}
          </p>
          <p className="font-[var(--font-body)] text-[var(--color-mid)] max-w-lg mx-auto leading-relaxed">
            Estamos revisando tu pedido. Te confirmaremos en un máximo de{' '}
            <strong className="text-[var(--color-cream-dim)]">
              {autoCancelHours} horas
            </strong>{' '}
            si podemos preparártelo.
          </p>
        </header>

        {/* Estado actual */}
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[rgba(196,162,207,0.12)] border border-[var(--color-lavender)]/30 text-[var(--color-lavender)] text-xs font-[var(--font-cond)] uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-lavender)] animate-pulse" />
            Pendiente de confirmación
          </span>
        </div>

        {/* Aviso "no se ha cargado nada" */}
        <div className="bg-[rgba(80,200,120,0.06)] border border-green-500/30 rounded-2xl p-5 flex gap-3">
          <ShieldCheck
            size={22}
            className="text-green-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] leading-relaxed space-y-1">
            <p className="font-semibold text-[var(--color-cream)]">
              Importante: aún no se ha cargado nada en tu tarjeta
            </p>
            <p>
              Solo hemos <strong>reservado</strong> el importe en pre-autorización. Si rechazamos el pedido por falta de stock, la reserva se libera automáticamente y no verás ningún cargo.
            </p>
          </div>
        </div>

        {/* Resumen */}
        <section className="bg-[var(--color-card)] rounded-2xl p-6 space-y-5">
          <div className="flex items-baseline justify-between border-b border-[var(--color-card-hover)] pb-3">
            <h2 className="font-[var(--font-display)] text-xl tracking-widest text-[var(--color-cream)]">
              Resumen
            </h2>
            <span className="text-[11px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)]">
              {new Date(order.created_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>

          {/* Items */}
          <ul className="space-y-2">
            {order.items.map((item, idx) => (
              <li
                key={`${item.product_name}-${idx}`}
                className="flex items-center gap-3 py-2 border-b border-[var(--color-card-hover)] last:border-0"
              >
                <div className="w-12 h-12 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      className="w-full h-full object-contain p-0.5"
                      loading="lazy"
                    />
                  ) : (
                    <Bike
                      size={18}
                      strokeWidth={1}
                      className="text-[var(--color-mid)]"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] line-clamp-1">
                    {item.product_name}
                  </p>
                  <p className="text-[11px] text-[var(--color-mid)]">
                    {item.product_size_label
                      ? `Talla ${item.product_size_label} · `
                      : ''}
                    Cantidad {item.quantity}
                  </p>
                </div>
                <span className="font-[var(--font-cond)] text-sm text-[var(--color-cream-dim)] tabular-nums">
                  {fmtEuros(item.line_total_cents)} €
                </span>
              </li>
            ))}
          </ul>

          {/* Totales */}
          <div className="space-y-1.5 text-sm font-[var(--font-cond)] pt-2">
            <div className="flex justify-between">
              <span className="text-[var(--color-mid)]">Subtotal</span>
              <span className="text-[var(--color-cream)] tabular-nums">
                {fmtEuros(order.subtotal_cents)} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-mid)]">Envío</span>
              <span className="text-[var(--color-cream)] tabular-nums">
                {order.shipping_cents === 0
                  ? 'Gratis'
                  : `${fmtEuros(order.shipping_cents)} €`}
              </span>
            </div>
            <div className="flex justify-between items-baseline pt-3 border-t border-[var(--color-card-hover)]">
              <span className="font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-cream-dim)]">
                Total reservado
              </span>
              <span className="font-[var(--font-display)] text-3xl text-[var(--color-lavender)] tracking-wide tabular-nums">
                {fmtEuros(order.total_cents)} €
              </span>
            </div>
            <p className="text-[10px] text-[var(--color-mid)] pt-1 tabular-nums">
              Base imponible {fmtEuros(baseCents)} € + IVA {taxRate}%{' '}
              {fmtEuros(taxCents)} €
            </p>
          </div>
        </section>

        {/* Entrega */}
        <section className="bg-[var(--color-card)] rounded-2xl p-5 flex items-start gap-3">
          {order.delivery_method === 'pickup' ? (
            <Store
              size={20}
              className="text-[var(--color-lavender)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <Truck
              size={20}
              className="text-[var(--color-lavender)] shrink-0 mt-0.5"
              aria-hidden="true"
            />
          )}
          <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
            <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] mb-0.5">
              {order.delivery_method === 'pickup'
                ? 'Recogida en tienda'
                : `Envío a ${order.shipping_city ?? 'tu dirección'}`}
            </p>
            <p className="text-xs text-[var(--color-mid)]">
              {order.delivery_method === 'pickup'
                ? 'Te avisaremos por email cuando esté listo para recoger.'
                : 'Cuando lo enviemos, recibirás un email con el tracking.'}
            </p>
          </div>
        </section>

        {/* Email enviado */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            <Mail size={14} className="text-[var(--color-lavender)]" aria-hidden="true" />
            <span>
              Hemos enviado los detalles a{' '}
              <strong className="text-[var(--color-cream)]">
                {order.customer_email}
              </strong>
            </span>
          </div>
          <p className="text-[10px] text-[var(--color-mid)] font-[var(--font-cond)] uppercase tracking-widest inline-flex items-center gap-1.5">
            <Lock size={10} aria-hidden="true" /> Pago seguro vía Redsys
          </p>
        </div>

        {/* Información legal archivable — L-07 */}
        <section className="bg-[var(--color-card)] rounded-2xl p-5 space-y-3 text-sm font-[var(--font-body)]">
          <h2 className="font-[var(--font-display)] text-lg tracking-widest text-[var(--color-cream)]">
            Información importante
          </h2>
          <ul className="text-[var(--color-mid)] space-y-2 list-disc pl-5 leading-relaxed">
            <li>
              <strong className="text-[var(--color-cream-dim)]">Derecho de desistimiento:</strong>{' '}
              14 días naturales desde la recepción del producto (art. 102 RDL 1/2007).{' '}
              <Link to="/devoluciones" className="text-[var(--color-lavender)] underline underline-offset-2">
                Más info y formulario
              </Link>.
            </li>
            <li>
              <strong className="text-[var(--color-cream-dim)]">Garantía legal:</strong>{' '}
              3 años desde la entrega (arts. 114–127 RDL 1/2007).
            </li>
            <li>
              <strong className="text-[var(--color-cream-dim)]">Resolución de litigios:</strong>{' '}
              plataforma ODR{' '}
              <a
                href="https://ec.europa.eu/consumers/odr/"
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-lavender)] underline underline-offset-2"
              >
                ec.europa.eu/consumers/odr/
              </a>.
            </li>
            <li>
              <strong className="text-[var(--color-cream-dim)]">Idioma del contrato:</strong>{' '}
              Español.
            </li>
          </ul>
        </section>

        {/* CTA + Imprimir */}
        <div className="flex flex-wrap justify-center gap-3 pt-4 print:hidden">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--color-lavender)]/40 text-[var(--color-lavender)] font-[var(--font-cond)] font-semibold tracking-widest hover:border-[var(--color-lavender)] transition-all"
          >
            Guardar / Imprimir PDF
          </button>
          <Link
            to="/catalogo"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
          >
            Volver al catálogo
          </Link>
        </div>
      </div>
    </div>
  )
}
