import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ShieldCheck, Mail, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SEO } from '@/components/layout/SEO'

/**
 * Auditoría legal V5 · Sprint 2 · X-17
 *
 * Página intermedia entre la creación del pedido y la redirección a
 * Redsys. El cliente recibe un OTP de 6 dígitos por email y lo
 * introduce aquí. La verificación se hace contra la edge function
 * `payment-otp-verify`. Si pasa, redirigimos a `/pago/:orderId` que
 * es el endpoint donde S2-B2 acopla la redirección a Redsys.
 *
 * El UUID del pedido viaja en la URL — no es secreto (idéntico al
 * patrón actual de `/pedido/redirigiendo`), y el OTP por sí solo no
 * permite hacer nada sin coincidir hash + caducidad + estado pending.
 */

const REDIRECT_DELAY_MS = 1200
const RESEND_COOLDOWN_SECONDS = 30

type Phase = 'idle' | 'verifying' | 'success' | 'error'

interface RequestResponse {
  ok?: boolean
  sent?: boolean
  masked_email?: string
  expires_at?: string
  error?: string
}

interface VerifyResponse {
  ok?: boolean
  verified?: boolean
  order_id?: string
  order_number?: string
  error?: string
}

export default function PaymentOtp() {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()

  const [otp, setOtp] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resending, setResending] = useState(false)
  const requestedRef = useRef(false)

  const otpValid = useMemo(() => /^\d{6}$/.test(otp), [otp])
  const validOrderId = useMemo(
    () => !!orderId && /^[0-9a-f-]{36}$/i.test(orderId),
    [orderId],
  )

  /**
   * Solicita un OTP al backend. Se llama en el primer mount (un único
   * envío automático) y desde el botón "Reenviar código".
   */
  const requestOtp = useCallback(
    async (isResend: boolean) => {
      if (!validOrderId) return
      if (isResend) {
        setResending(true)
      }
      setErrorMsg(null)
      try {
        const { data, error } = await supabase.functions.invoke<RequestResponse>(
          'request-payment-otp',
          { body: { order_id: orderId } },
        )
        if (error) {
          // Error genérico — el backend ya rate-limita / valida.
          throw new Error(
            error.message || 'No hemos podido enviar el código. Inténtalo de nuevo.',
          )
        }
        if (!data?.ok) {
          throw new Error(data?.error || 'No hemos podido enviar el código.')
        }
        setMaskedEmail(data.masked_email ?? null)
        setExpiresAt(data.expires_at ?? null)
        if (isResend) {
          setResendCooldown(RESEND_COOLDOWN_SECONDS)
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'No hemos podido enviar el código. Inténtalo de nuevo más tarde.',
        )
      } finally {
        setResending(false)
      }
    },
    [orderId, validOrderId],
  )

  // Envío automático en el primer render. Usamos un ref para evitar
  // doble envío en StrictMode (dev) y evitar peticiones repetidas al
  // re-render por dependencias.
  useEffect(() => {
    if (!validOrderId) return
    if (requestedRef.current) return
    requestedRef.current = true
    void requestOtp(false)
  }, [validOrderId, requestOtp])

  // Cooldown del botón "Reenviar código".
  useEffect(() => {
    if (resendCooldown <= 0) return
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendCooldown])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validOrderId || !otpValid || phase === 'verifying') return
    setPhase('verifying')
    setErrorMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke<VerifyResponse>(
        'payment-otp-verify',
        { body: { order_id: orderId, otp } },
      )
      if (error) {
        throw new Error(error.message || 'Código incorrecto')
      }
      if (!data?.ok || !data.verified) {
        throw new Error(data?.error || 'Código incorrecto')
      }
      setPhase('success')
      // Pequeño retardo para que el usuario vea el feedback antes del
      // redirect al endpoint que orquesta Redsys (lo monta S2-B2).
      setTimeout(() => {
        navigate(`/pago/${orderId}`, { replace: true })
      }, REDIRECT_DELAY_MS)
    } catch (err) {
      setPhase('error')
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'No hemos podido verificar el código.',
      )
    }
  }

  if (!validOrderId) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
        <SEO title="Verificación de pago" noIndex />
        <div className="max-w-xl mx-auto bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 sm:p-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(255,80,80,0.12)] text-red-300 mx-auto mb-4">
            <AlertCircle size={28} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide mb-2">
            Enlace no válido
          </h1>
          <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
            El identificador del pedido no es correcto. Vuelve al checkout para
            iniciar el pago de nuevo.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
      <SEO
        title="Verificación de pago"
        description="Introduce el código de 6 dígitos que hemos enviado a tu email para autorizar el pago."
        noIndex
      />

      <div className="max-w-xl mx-auto">
        <header className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(196,162,207,0.12)] border border-[var(--color-lavender)]/30 text-[var(--color-lavender)] mx-auto">
            <ShieldCheck size={22} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl text-[var(--color-cream)] tracking-wide">
            Verificación de pago
          </h1>
          <p className="font-[var(--font-body)] text-[var(--color-mid)] max-w-md mx-auto leading-relaxed">
            Por seguridad, te hemos enviado un código de 6 dígitos a tu email
            antes de redirigirte al pago.
          </p>
        </header>

        <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 sm:p-8">
          {phase === 'success' ? (
            <div className="space-y-4 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(80,200,120,0.12)] text-green-400 mx-auto">
                <ShieldCheck size={28} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2 className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide">
                Código verificado
              </h2>
              <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
                Te estamos redirigiendo a la pasarela de pago segura…
              </p>
            </div>
          ) : (
            <>
              {/* Banner email destino enmascarado */}
              {maskedEmail && (
                <div className="mb-5 flex items-start gap-3 text-xs text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
                  <Mail
                    size={16}
                    className="text-[var(--color-lavender)] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>
                    Hemos enviado un código a{' '}
                    <strong className="text-[var(--color-cream)]">{maskedEmail}</strong>
                    . Revisa también la carpeta de spam. Caduca en{' '}
                    <strong>5 minutos</strong>.
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="otp"
                    className="block text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2"
                  >
                    Código de 6 dígitos
                  </label>
                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    placeholder="000000"
                    required
                    aria-describedby="otp-help"
                    className="w-full text-center text-2xl tracking-[0.5em] font-[var(--font-cond)] text-[var(--color-cream)] bg-[var(--color-ink)] px-4 py-3 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/60 focus:outline-none transition-colors"
                  />
                  <p
                    id="otp-help"
                    className="mt-2 text-[11px] text-[var(--color-mid)] font-[var(--font-body)]"
                  >
                    Tras 5 intentos fallidos, el pedido se bloqueará por
                    seguridad y deberás contactar con la tienda.
                  </p>
                </div>

                {errorMsg && (
                  <p
                    className="text-sm text-red-300 font-[var(--font-body)]"
                    role="alert"
                  >
                    {errorMsg}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!otpValid || phase === 'verifying'}
                  className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 active:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {phase === 'verifying' ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      Verificando…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} aria-hidden="true" />
                      Verificar y continuar al pago
                    </>
                  )}
                </button>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void requestOtp(true)}
                    disabled={resending || resendCooldown > 0}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-lavender)]/40 text-[var(--color-lavender)] font-[var(--font-cond)] font-semibold text-xs tracking-widest uppercase hover:bg-[rgba(196,162,207,0.08)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw
                      size={13}
                      className={resending ? 'animate-spin' : ''}
                      aria-hidden="true"
                    />
                    {resendCooldown > 0
                      ? `Reenviar en ${resendCooldown}s`
                      : resending
                        ? 'Reenviando…'
                        : 'Reenviar código'}
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/checkout')}
                    className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hover:text-[var(--color-lavender)] transition-colors"
                  >
                    <ArrowLeft size={13} aria-hidden="true" />
                    Volver al checkout
                  </button>
                </div>
              </form>
            </>
          )}
        </section>

        <p className="text-center text-[11px] text-[var(--color-mid)] font-[var(--font-body)] mt-6 leading-relaxed max-w-md mx-auto">
          Nunca compartas este código con nadie. Ni DC Bikes Cantabria ni tu
          banco te lo pedirán por teléfono, email o redes sociales.
        </p>
      </div>
    </div>
  )
}
