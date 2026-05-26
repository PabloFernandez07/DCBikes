import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle, CreditCard, Bike, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SEO } from '@/components/layout/SEO'
import { useCartStore } from '@/stores/cartStore'

function fmtEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface PendingOrderPayload {
  customer_first_name?: string
  customer_last_name?: string
  customer_email?: string
  delivery_method?: 'shipping' | 'pickup'
  shipping_city?: string | null
  items?: Array<{
    product_id: string
    quantity: number
    snapshot: {
      name: string
      size_label: string | null
      unit_price_cents: number
      image_url: string | null
      slug: string
    }
  }>
  subtotal_cents?: number
  shipping_cents?: number
  total_cents?: number
  tax_rate?: number
  created_at?: string
}

export default function PendingRedsys() {
  const [payload, setPayload] = useState<PendingOrderPayload | null>(null)
  const clearCart = useCartStore(s => s.clear)

  useEffect(() => {
    document.title = 'Pedido pendiente · DC Bikes Cantabria'
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('dcbikes_pending_order')
      if (raw) {
        setPayload(JSON.parse(raw) as PendingOrderPayload)
      }
    } catch {
      setPayload(null)
    }
    // Vaciar el carrito una vez que el cliente "tramitó" — el snapshot ya está
    // congelado en localStorage.dcbikes_pending_order para visualizarlo aquí.
    clearCart()
  }, [clearCart])

  const total = payload?.total_cents ?? 0
  const subtotal = payload?.subtotal_cents ?? 0
  const shipping = payload?.shipping_cents ?? 0
  const taxRate = payload?.tax_rate ?? 21
  const baseCents = Math.round(total / (1 + taxRate / 100))
  const taxCents = total - baseCents

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
      <SEO
        title="Pedido pendiente"
        description="Tu pedido está casi listo. Estamos integrando la pasarela de pago."
        url="https://dc-bikes-cantabria.vercel.app/pedido/pendiente-redsys"
      />

      <div className="max-w-2xl mx-auto flex flex-col items-center gap-8 text-center">
        <div className="w-20 h-20 rounded-full bg-[rgba(196,162,207,0.12)] flex items-center justify-center text-[var(--color-lavender)]">
          <CheckCircle size={42} strokeWidth={1.5} />
        </div>

        <div className="space-y-3">
          <h1 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] tracking-wide">
            Tu pedido está casi listo
          </h1>
          <p className="font-[var(--font-body)] text-[var(--color-mid)] max-w-lg mx-auto">
            Hemos recibido tus datos correctamente. Estamos integrando la
            pasarela de pago segura Redsys para confirmar el cobro.
          </p>
        </div>

        {/* Aviso técnico Fase E */}
        <div className="w-full bg-[rgba(196,162,207,0.08)] border border-[var(--color-lavender)]/30 rounded-2xl p-5 text-left flex gap-3">
          <CreditCard
            size={22}
            className="text-[var(--color-lavender)] shrink-0 mt-0.5"
          />
          <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] leading-relaxed space-y-1">
            <p className="font-semibold text-[var(--color-cream)]">
              Pasarela de pago en integración
            </p>
            <p>
              En la versión final aquí serás redirigido a Redsys para introducir
              los datos de tu tarjeta de forma segura (pre-autorización). El
              importe se cargará en tu cuenta solo cuando la tienda confirme la
              disponibilidad del pedido (máx. 48&nbsp;h).
            </p>
          </div>
        </div>

        {/* Resumen pedido pendiente */}
        {payload ? (
          <div className="w-full bg-[var(--color-card)] rounded-2xl p-6 text-left space-y-5">
            <header className="flex items-baseline justify-between border-b border-[var(--color-card-hover)] pb-3">
              <h2 className="font-[var(--font-display)] text-xl tracking-widest text-[var(--color-cream)]">
                Resumen del pedido
              </h2>
              <span className="text-[11px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)]">
                Pendiente
              </span>
            </header>

            {payload.customer_email && (
              <div className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] space-y-1">
                <p>
                  <strong className="text-[var(--color-cream)]">
                    {payload.customer_first_name} {payload.customer_last_name}
                  </strong>{' '}
                  · {payload.customer_email}
                </p>
                <p className="text-[var(--color-mid)] text-xs">
                  Entrega:{' '}
                  {payload.delivery_method === 'pickup'
                    ? 'Recogida en tienda'
                    : `Envío a ${payload.shipping_city ?? 'dirección indicada'}`}
                </p>
              </div>
            )}

            {payload.items && payload.items.length > 0 && (
              <ul className="space-y-2">
                {payload.items.map(item => (
                  <li
                    key={item.product_id}
                    className="flex items-center gap-3 py-2 border-b border-[var(--color-card-hover)] last:border-0"
                  >
                    <div className="w-12 h-12 bg-[var(--color-ink)] rounded-lg overflow-hidden flex items-center justify-center shrink-0">
                      {item.snapshot.image_url ? (
                        <img
                          src={item.snapshot.image_url}
                          alt={item.snapshot.name}
                          className="w-full h-full object-contain p-0.5"
                        />
                      ) : (
                        <Bike
                          size={18}
                          strokeWidth={1}
                          className="text-[var(--color-mid)]"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-[var(--font-cond)] text-sm font-semibold text-[var(--color-cream)] line-clamp-1">
                        {item.snapshot.name}
                      </p>
                      <p className="text-[11px] text-[var(--color-mid)]">
                        {item.snapshot.size_label
                          ? `Talla ${item.snapshot.size_label} · `
                          : ''}
                        Cantidad {item.quantity}
                      </p>
                    </div>
                    <span className="font-[var(--font-cond)] text-sm text-[var(--color-cream-dim)] tabular-nums">
                      {fmtEuros(item.snapshot.unit_price_cents * item.quantity)}{' '}
                      €
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1.5 text-sm font-[var(--font-cond)] border-t border-[var(--color-card-hover)] pt-4">
              <div className="flex justify-between">
                <span className="text-[var(--color-mid)]">Subtotal</span>
                <span className="text-[var(--color-cream)] tabular-nums">
                  {fmtEuros(subtotal)} €
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-mid)]">Envío</span>
                <span className="text-[var(--color-cream)] tabular-nums">
                  {shipping === 0 ? 'Gratis' : `${fmtEuros(shipping)} €`}
                </span>
              </div>
              <div className="flex justify-between items-baseline pt-2 border-t border-[var(--color-card-hover)]">
                <span className="font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-cream-dim)]">
                  Total
                </span>
                <span className="font-[var(--font-display)] text-2xl text-[var(--color-lavender)] tracking-wide tabular-nums">
                  {fmtEuros(total)} €
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-mid)] pt-1 tabular-nums">
                Base imponible {fmtEuros(baseCents)} € + IVA {taxRate}%{' '}
                {fmtEuros(taxCents)} €
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-mid)]">
            No encontramos un pedido pendiente en este navegador.
          </p>
        )}

        <div className="flex items-center gap-2 text-xs font-[var(--font-cond)] text-[var(--color-mid)]">
          <Lock size={12} />
          <span>Pago seguro vía Redsys (próximamente)</span>
        </div>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
        >
          Volver al inicio
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            try {
              localStorage.removeItem('dcbikes_pending_order')
            } catch {
              // ignore
            }
            window.location.href = '/catalogo'
          }}
        >
          Descartar pedido y seguir comprando
        </Button>
      </div>
    </div>
  )
}
