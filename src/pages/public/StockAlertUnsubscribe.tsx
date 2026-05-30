import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SEO } from '@/components/layout/SEO'
import { Button } from '@/components/ui/Button'

type Status = 'loading' | 'success' | 'error' | 'invalid'

export default function StockAlertUnsubscribe() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [status, setStatus] = useState<Status>('loading')
  const [errorText, setErrorText] = useState<string>('')

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }

    let cancelled = false

    ;(async () => {
      try {
        const { error } = await supabase.functions.invoke('stock-alert-unsubscribe', {
          body: { token },
        })

        if (cancelled) return

        if (error) {
          const msg = error.message ?? String(error)
          if (/invalid|not found|expired/i.test(msg)) {
            setStatus('invalid')
          } else {
            setErrorText(msg)
            setStatus('error')
          }
        } else {
          setStatus('success')
        }
      } catch (err) {
        if (!cancelled) {
          setErrorText(err instanceof Error ? err.message : 'Error inesperado')
          setStatus('error')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <>
      <SEO
        title="Cancelar avisos de disponibilidad"
        description="Cancelación de avisos de stock por email en DC Bikes Cantabria."
        noIndex={true}
      />

      <section className="bg-[var(--color-ink)] min-h-[60vh] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md flex flex-col items-center text-center gap-6">
          {status === 'loading' && (
            <>
              <div className="w-10 h-10 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
              <p className="font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide">
                Procesando tu solicitud...
              </p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={56} className="text-green-400" aria-hidden="true" />
              <h1 className="font-[var(--font-display)] text-4xl text-[var(--color-cream)] tracking-wide leading-tight">
                BAJA CONFIRMADA
              </h1>
              <p className="font-[var(--font-body)] text-[var(--color-mid)] text-base leading-relaxed">
                Has cancelado los avisos de disponibilidad. Ya no recibirás emails de este aviso.
              </p>
              <div className="flex gap-3 flex-wrap justify-center mt-2">
                <Link to="/catalogo">
                  <Button variant="primary" size="lg">Ver catálogo</Button>
                </Link>
                <Link to="/">
                  <Button variant="ghost" size="lg">Volver al inicio</Button>
                </Link>
              </div>
            </>
          )}

          {status === 'invalid' && (
            <>
              <XCircle size={56} className="text-[var(--color-brand-red)]" aria-hidden="true" />
              <h1 className="font-[var(--font-display)] text-4xl text-[var(--color-cream)] tracking-wide leading-tight">
                ENLACE NO VÁLIDO
              </h1>
              <p className="font-[var(--font-body)] text-[var(--color-mid)] text-base leading-relaxed">
                El enlace de baja no es válido o ha caducado. Es posible que ya hayas cancelado este aviso anteriormente.
              </p>
              <div className="flex gap-3 flex-wrap justify-center mt-2">
                <Link to="/">
                  <Button variant="primary" size="lg">Volver al inicio</Button>
                </Link>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={56} className="text-[var(--color-brand-red)]" aria-hidden="true" />
              <h1 className="font-[var(--font-display)] text-4xl text-[var(--color-cream)] tracking-wide leading-tight">
                ERROR
              </h1>
              <p className="font-[var(--font-body)] text-[var(--color-mid)] text-base leading-relaxed">
                {errorText || 'No se pudo procesar la solicitud. Por favor, inténtalo de nuevo más tarde.'}
              </p>
              <div className="flex gap-3 flex-wrap justify-center mt-2">
                <Link to="/">
                  <Button variant="primary" size="lg">Volver al inicio</Button>
                </Link>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  )
}
