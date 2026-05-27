import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Mail, Send, CheckCircle2, ArrowLeft, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { SEO } from '@/components/layout/SEO'

const STORAGE_KEY = 'dcbikes_customer_session'
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function MyOrdersRequestAccess() {
  const [email, setEmail] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [existingSession, setExistingSession] = useState<StoredSession | null>(null)

  useEffect(() => {
    setExistingSession(readSession())
  }, [])

  const emailValid = useMemo(() => EMAIL_RE.test(email.trim()), [email])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || !emailValid) return
    // F-07 (V5): bloqueo defensivo — la validación visual se hace mediante disabled,
    // pero conservamos check inline por si alguien manipula el DOM.
    if (!privacyAccepted) {
      setErrorMsg('Debes confirmar que has leído la Política de Privacidad para continuar.')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    try {
      const { error } = await supabase.functions.invoke('customer-magic-link-request', {
        body: { email: email.trim().toLowerCase() },
      })
      if (error) throw new Error(error.message)
      setSubmitted(true)
    } catch (err) {
      // El endpoint nunca debería fallar por anti-enumeración, pero por si la red cae:
      setErrorMsg(err instanceof Error ? err.message : 'No hemos podido enviar el enlace. Inténtalo de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
      <SEO
        title="Mis pedidos"
        description="Accede a tus pedidos en DC Bikes Cantabria mediante un enlace seguro enviado a tu correo."
        noIndex
      />

      <div className="max-w-xl mx-auto">
        {/* Hero */}
        <header className="text-center space-y-3 mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(196,162,207,0.12)] border border-[var(--color-lavender)]/30 text-[var(--color-lavender)] mx-auto">
            <Package size={22} strokeWidth={1.5} />
          </div>
          <h1 className="font-[var(--font-display)] text-4xl sm:text-5xl text-[var(--color-cream)] tracking-wide">
            Mis pedidos
          </h1>
          <p className="font-[var(--font-body)] text-[var(--color-mid)] max-w-md mx-auto leading-relaxed">
            Introduce tu email y te enviaremos un enlace de acceso a tus pedidos.
          </p>
        </header>

        {/* Banner sesión activa */}
        {existingSession && !submitted && (
          <div className="mb-8 bg-[rgba(196,162,207,0.08)] border border-[var(--color-lavender)]/30 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
            <CheckCircle2 size={20} className="text-[var(--color-lavender)] shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] mb-0.5">
                Ya tienes una sesión activa
              </p>
              <p className="mb-3">
                Puedes acceder directamente a tus pedidos sin volver a solicitar el enlace.
              </p>
              <Link
                to={`/mis-pedidos/sesion?token=${encodeURIComponent(existingSession.token)}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold text-sm tracking-wide hover:brightness-110 transition-all"
              >
                Ir a mis pedidos
              </Link>
            </div>
          </div>
        )}

        {/* Form / Success */}
        <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 sm:p-8">
          {submitted ? (
            <div className="space-y-5 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[rgba(80,200,120,0.12)] text-green-400 mx-auto">
                <CheckCircle2 size={28} strokeWidth={1.5} />
              </div>
              <h2 className="font-[var(--font-display)] text-2xl text-[var(--color-cream)] tracking-wide">
                Revisa tu bandeja de entrada
              </h2>
              <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed max-w-md mx-auto">
                Si existe un pedido asociado a{' '}
                <strong className="text-[var(--color-cream)]">{email}</strong>, recibirás un enlace en tu bandeja en breve. Revisa también la carpeta de spam.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center pt-2">
                <button
                  type="button"
                  onClick={() => { setSubmitted(false); setErrorMsg(null) }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-[var(--color-lavender)]/40 text-[var(--color-lavender)] font-[var(--font-cond)] font-semibold text-sm tracking-wide hover:bg-[rgba(196,162,207,0.08)] transition-all"
                >
                  Reenviar enlace
                </button>
                <Link
                  to="/catalogo"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold text-sm tracking-wide hover:brightness-110 transition-all"
                >
                  Volver al catálogo
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="block text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-2"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)] pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full text-base text-[var(--color-cream)] font-[var(--font-body)] bg-[var(--color-ink)] pl-10 pr-3 py-2.5 rounded-lg border border-[var(--color-card-hover)] focus:border-[var(--color-lavender)]/60 focus:outline-none transition-colors"
                  />
                </div>
                <p className="mt-2 text-[11px] text-[var(--color-mid)] font-[var(--font-body)]">
                  Usaremos el mismo email con el que hiciste tu pedido.
                </p>
              </div>

              {/* F-07 (V5): checkbox de privacidad obligatorio.
                  Base legal art. 6.1.b RGPD (ejecución del contrato de compraventa). */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={privacyAccepted}
                  onChange={e => setPrivacyAccepted(e.target.checked)}
                  required
                  className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--color-lavender)] cursor-pointer"
                  aria-describedby="privacy-help"
                />
                <span
                  id="privacy-help"
                  className="text-xs text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed"
                >
                  He leído la{' '}
                  <Link
                    to="/privacidad"
                    className="text-[var(--color-lavender)] underline underline-offset-2 hover:no-underline"
                  >
                    Política de Privacidad
                  </Link>
                  . Mis datos se tratan en base al art. 6.1.b RGPD (ejecución de la relación contractual) para enviarme el enlace de acceso a mis pedidos.
                </span>
              </label>

              {errorMsg && (
                <p className="text-sm text-red-300 font-[var(--font-body)]" role="alert">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={!emailValid || !privacyAccepted || submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[var(--color-lavender)] text-[var(--color-ink)] font-[var(--font-cond)] font-semibold tracking-widest hover:brightness-110 active:brightness-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Enviando…
                  </>
                ) : (
                  <>
                    <Send size={15} />
                    Enviar enlace de acceso
                  </>
                )}
              </button>

              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] hover:text-[var(--color-lavender)] mt-2 transition-colors"
              >
                <ArrowLeft size={13} />
                Volver al inicio
              </Link>
            </form>
          )}
        </section>

        <p className="text-center text-[11px] text-[var(--color-mid)] font-[var(--font-body)] mt-6 leading-relaxed max-w-md mx-auto">
          Por seguridad, no almacenamos contraseñas: cada acceso se realiza mediante un enlace temporal enviado a tu email.
        </p>
      </div>
    </div>
  )
}
