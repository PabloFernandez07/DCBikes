import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { XCircle, ShieldCheck, ArrowLeft, Mail } from 'lucide-react'
import { SEO } from '@/components/layout/SEO'

/**
 * Página de error de pago. Llegamos aquí cuando:
 *  - El usuario rechaza el pago en el simulador local.
 *  - Redsys devuelve un código de error (ej. tarjeta rechazada).
 *
 * Mantenemos el carrito intacto para que el cliente pueda reintentar
 * sin tener que volver a añadir productos.
 */
export default function PaymentError() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order_id')

  useEffect(() => {
    document.title = 'Pago no completado · DC Bikes Cantabria'
  }, [])

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
      <SEO
        title="Pago no completado"
        description="Tu pago no se ha procesado correctamente."
        noIndex={true}
      />

      <div className="max-w-md mx-auto text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-[rgba(220,60,60,0.12)] flex items-center justify-center text-[var(--color-brand-red)] mx-auto">
          <XCircle size={42} strokeWidth={1.5} aria-hidden="true" />
        </div>

        <div className="space-y-3">
          <h1 className="font-[var(--font-display)] text-4xl text-[var(--color-cream)] tracking-wide">
            Pago no completado
          </h1>
          <p className="font-[var(--font-body)] text-[var(--color-mid)] leading-relaxed">
            Tu pago no se ha procesado correctamente.
          </p>
        </div>

        <div className="bg-[rgba(80,200,120,0.06)] border border-green-500/30 rounded-2xl p-5 flex gap-3 text-left">
          <ShieldCheck
            size={20}
            className="text-green-400 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-sm font-[var(--font-body)] text-[var(--color-cream-dim)] leading-relaxed">
            <strong className="text-[var(--color-cream)]">
              No se ha cargado nada en tu tarjeta.
            </strong>{' '}
            Si tu banco te muestra una pre-autorización temporal, se libera
            automáticamente en pocos minutos.
          </p>
        </div>

        <p className="text-sm font-[var(--font-body)] text-[var(--color-mid)] leading-relaxed">
          Si el problema persiste, comprueba los datos de tu tarjeta o intenta
          con otra. Si crees que es un error nuestro, contáctanos.
        </p>

        <div className="flex flex-col gap-3 pt-2">
          <Link
            to="/carrito"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 transition-all"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Volver al carrito
          </Link>
          <Link
            to="/contacto"
            className="inline-flex items-center justify-center gap-2 text-sm font-[var(--font-cond)] tracking-wide text-[var(--color-lavender)] hover:text-[var(--color-cream)] transition-colors"
          >
            <Mail size={14} />
            Contactar con la tienda
          </Link>
        </div>

        {orderId && (
          <p className="text-[10px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)] pt-2">
            Referencia interna: {orderId}
          </p>
        )}
      </div>
    </div>
  )
}
