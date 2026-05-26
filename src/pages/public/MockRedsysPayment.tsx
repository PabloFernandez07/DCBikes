import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Lock,
  CreditCard,
  ArrowLeft,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { SEO } from '@/components/layout/SEO'

function fmtEuros(cents: number): string {
  return (cents / 100).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface OrderPublicData {
  order_number: string
  total_cents: number
  customer_first_name: string
  customer_last_name: string
  customer_email: string
  status: string
}

/**
 * Simulador del TPV Virtual Redsys — solo en entorno `mock`.
 *
 * Carga el pedido vía `order-public-get` (Edge Function pública con token
 * firmado) y permite al usuario autorizar o rechazar el pago con dos
 * botones grandes. Llama a `mock-redsys-confirm` (endpoint helper del
 * backend) que se encarga de toda la lógica de transición de estado +
 * disparar emails.
 *
 * Si el endpoint helper no existe, este componente queda inutilizable y
 * el usuario debe volver al checkout — está documentado en el banner.
 */
export default function MockRedsysPayment() {
  const { order_id } = useParams<{ order_id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') ?? ''

  const { toasts, toast, dismiss } = useToast()

  const [order, setOrder] = useState<OrderPublicData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<'authorize' | 'reject' | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'TPV Simulado · DC Bikes Cantabria'
  }, [])

  // Fetch resumen del pedido (con token público firmado).
  useEffect(() => {
    if (!order_id || !token) {
      setError('Enlace de pago inválido. Faltan parámetros.')
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
          setError(data?.error || 'Pedido no encontrado o token inválido')
          setLoading(false)
          return
        }
        setOrder(data.order as OrderPublicData)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [order_id, token])

  const handleOutcome = useCallback(
    async (outcome: 'authorized' | 'rejected') => {
      if (!order_id || !token) return
      setSubmitting(outcome === 'authorized' ? 'authorize' : 'reject')
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          'mock-redsys-confirm',
          {
            body: { order_id, token, outcome },
          },
        )
        if (fnError) throw fnError
        if (!data?.ok) {
          throw new Error(data?.error || 'No se pudo procesar la simulación')
        }
        if (outcome === 'authorized') {
          navigate(`/pedido/confirmacion/${order_id}?token=${token}`, {
            replace: true,
          })
        } else {
          navigate(`/pedido/error?order_id=${order_id}`, { replace: true })
        }
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Error procesando la simulación'
        toast.error(message)
        setSubmitting(null)
      }
    },
    [order_id, token, navigate, toast],
  )

  // Loading / error states.
  if (loading) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20 text-center text-[var(--color-mid)]">
        Cargando información del pedido…
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-md mx-auto text-center space-y-6">
          <XCircle
            size={48}
            className="text-[var(--color-brand-red)] mx-auto"
          />
          <h1 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide">
            Enlace inválido
          </h1>
          <p className="text-[var(--color-mid)] font-[var(--font-body)]">
            {error ?? 'No se pudo cargar el pedido.'}
          </p>
          <Link
            to="/carrito"
            className="inline-flex items-center gap-2 text-[var(--color-lavender)] hover:text-[var(--color-cream)] transition-colors"
          >
            <ArrowLeft size={16} /> Volver al carrito
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-10">
      <SEO
        title="TPV Virtual Simulado"
        description="Entorno de pruebas de la pasarela de pago. No se procesa pago real."
      />

      <div className="max-w-xl mx-auto space-y-6">
        {/* Header simulando Redsys con disclaimer evidente */}
        <header className="bg-[var(--color-card)] rounded-2xl overflow-hidden border border-yellow-500/30">
          <div className="bg-yellow-500/15 px-5 py-3 flex items-center gap-2 border-b border-yellow-500/30">
            <AlertTriangle
              size={18}
              className="text-yellow-400 shrink-0"
              aria-hidden="true"
            />
            <p className="text-xs font-[var(--font-cond)] uppercase tracking-widest text-yellow-200">
              TPV Virtual <strong>SIMULADO</strong> · Modo desarrollo
            </p>
          </div>
          <div className="px-5 py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--color-ink)] flex items-center justify-center">
              <CreditCard size={20} className="text-[var(--color-lavender)]" />
            </div>
            <div className="flex-1">
              <p className="font-[var(--font-display)] text-lg text-[var(--color-cream)] tracking-wide">
                Pago Redsys (sandbox local)
              </p>
              <p className="text-[11px] text-[var(--color-mid)]">
                Esta es una simulación. <strong>NO</strong> se procesa pago
                real ni se carga ninguna tarjeta.
              </p>
            </div>
          </div>
        </header>

        {/* Card resumen pedido */}
        <section className="bg-[var(--color-card)] rounded-2xl p-6 space-y-4">
          <div className="flex items-baseline justify-between border-b border-[var(--color-card-hover)] pb-3">
            <h2 className="font-[var(--font-display)] text-xl tracking-widest text-[var(--color-cream)]">
              Resumen
            </h2>
            <span className="text-[10px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)]">
              {order.order_number}
            </span>
          </div>

          <div className="space-y-1.5 text-sm font-[var(--font-body)] text-[var(--color-cream-dim)]">
            <p>
              <strong className="text-[var(--color-cream)]">
                {order.customer_first_name} {order.customer_last_name}
              </strong>
            </p>
            <p className="text-[var(--color-mid)]">{order.customer_email}</p>
          </div>

          <div className="flex justify-between items-baseline pt-3 border-t border-[var(--color-card-hover)]">
            <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
              Importe a pre-autorizar
            </span>
            <span className="font-[var(--font-display)] text-3xl text-[var(--color-lavender)] tracking-wide tabular-nums">
              {fmtEuros(order.total_cents)} €
            </span>
          </div>
        </section>

        {/* Botones acción */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Button
            type="button"
            variant="primary"
            size="lg"
            loading={submitting === 'authorize'}
            disabled={submitting !== null}
            onClick={() => handleOutcome('authorized')}
            className="w-full font-[var(--font-display)] tracking-widest justify-center"
          >
            <CheckCircle2 size={18} aria-hidden="true" />
            Autorizar pago
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={submitting === 'reject'}
            disabled={submitting !== null}
            onClick={() => handleOutcome('rejected')}
            className="w-full font-[var(--font-display)] tracking-widest justify-center"
          >
            <XCircle size={18} aria-hidden="true" />
            Rechazar pago
          </Button>
        </div>

        <div className="flex items-center justify-between text-xs font-[var(--font-cond)] text-[var(--color-mid)]">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={12} /> Conexión local · sin datos sensibles
          </span>
          <button
            type="button"
            onClick={() => navigate('/checkout')}
            disabled={submitting !== null}
            className="text-[var(--color-lavender)] hover:text-[var(--color-cream)] transition-colors underline-offset-2 hover:underline disabled:opacity-50"
          >
            Cancelar y volver
          </button>
        </div>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
