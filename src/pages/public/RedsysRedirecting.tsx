import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Lock, CreditCard } from 'lucide-react'
import { SEO } from '@/components/layout/SEO'
import {
  RedsysAutoSubmitForm,
  type RedsysFormData,
} from '@/components/public/RedsysAutoSubmitForm'

interface RedirectingState {
  form_data?: RedsysFormData
  order_id?: string
  public_token?: string
}

/**
 * Pantalla puente entre `/checkout` y la pasarela Redsys real.
 *
 * Recibe `form_data` por `location.state` (lo pasa `Checkout.onSubmit`)
 * y delega el submit invisible al componente `RedsysAutoSubmitForm`.
 *
 * Mientras tanto pinta un spinner branded + copys de pago seguro para
 * que el cliente entienda qué está pasando (~1s en pantalla).
 */
export default function RedsysRedirecting() {
  const location = useLocation()
  const state = (location.state ?? {}) as RedirectingState

  useEffect(() => {
    document.title = 'Redirigiendo al pago · DC Bikes Cantabria'
  }, [])

  // Si entran a la ruta directamente sin state (refresh, link directo),
  // los devolvemos al carrito para evitar pantalla en blanco eterna.
  if (!state.form_data) {
    return <Navigate to="/carrito" replace />
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-20">
      <SEO
        title="Redirigiendo a la pasarela de pago"
        description="Te estamos redirigiendo a Redsys para completar tu pago de forma segura."
        url="https://dc-bikes-cantabria.vercel.app/pedido/redirigiendo"
      />

      <div className="max-w-md mx-auto flex flex-col items-center gap-8 text-center">
        {/* Spinner branded */}
        <div className="relative w-24 h-24 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-2 border-[var(--color-card-hover)]"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--color-lavender)] border-r-[var(--color-lavender)]"
            style={{ animation: 'wspin 0.9s linear infinite' }}
            aria-hidden="true"
          />
          <CreditCard size={32} className="text-[var(--color-lavender)]" />
        </div>

        <div className="space-y-3">
          <h1 className="font-[var(--font-display)] text-4xl text-[var(--color-cream)] tracking-wide">
            Redirigiendo al pago seguro
          </h1>
          <p className="font-[var(--font-body)] text-[var(--color-mid)] leading-relaxed">
            Estamos abriendo la pasarela de Redsys para que introduzcas los
            datos de tu tarjeta. No cierres ni recargues esta página.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)]">
          <Lock size={12} />
          <span>Conexión cifrada · 3D Secure</span>
        </div>
      </div>

      {/* Form invisible que dispara el POST a Redsys */}
      <RedsysAutoSubmitForm formData={state.form_data} />
    </div>
  )
}
