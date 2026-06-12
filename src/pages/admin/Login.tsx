import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    if (!loading && user) navigate('/admin', { replace: true })
  }, [user, loading, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: authError } = await signIn(email, password)
    setSubmitting(false)
    if (authError) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
    } else {
      navigate('/admin', { replace: true })
    }
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setResetError('')
    setResetLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/admin`,
    })
    setResetLoading(false)
    if (err) {
      setResetError('No se pudo enviar el email. Verifica la dirección.')
    } else {
      setResetSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-ink-deep)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-4">
          <img
            src="/DC_Bikes_Sin_Fondo_320.webp"
            alt="DC Bikes"
            width={320}
            height={321}
            className="h-20 w-auto mx-auto"
          />
          <div>
            <h1 className="text-3xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
              DC BIKES
            </h1>
            <p className="text-sm font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase mt-1">
              Panel de administración
            </p>
          </div>
        </div>

        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-7 space-y-5 shadow-2xl">
          {!resetMode ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={e => setEmail((e.target as HTMLInputElement).value)}
              />
              <Field
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword((e.target as HTMLInputElement).value)}
              />

              {error && (
                <p className="text-sm text-[var(--color-brand-red)] font-[var(--font-body)] bg-[var(--color-brand-red)]/10 px-4 py-3 rounded-lg border border-[var(--color-brand-red)]/20">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full mt-2"
                loading={submitting}
              >
                Entrar
              </Button>

              <button
                type="button"
                onClick={() => { setResetMode(true); setResetEmail(email) }}
                className="w-full text-center text-xs font-[var(--font-cond)] text-[var(--color-mid)] hover:text-[var(--color-lavender)] tracking-wide transition-colors pt-1"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </form>
          ) : resetSent ? (
            <div className="text-center space-y-4 py-2">
              <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto">
                <span className="text-green-400 text-xl" role="img" aria-hidden="true">✓</span>
              </div>
              <p className="text-sm font-[var(--font-body)] text-[var(--color-cream)]">
                Email enviado a <strong>{resetEmail}</strong>
              </p>
              <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                Revisa tu bandeja de entrada y sigue el enlace para restablecer tu contraseña.
              </p>
              <button
                type="button"
                onClick={() => { setResetMode(false); setResetSent(false) }}
                className="text-xs font-[var(--font-cond)] text-[var(--color-lavender)] hover:underline tracking-wide"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <p className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide mb-1">
                  Restablecer contraseña
                </p>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                  Escribe tu email y te enviaremos un enlace para crear una nueva contraseña.
                </p>
              </div>
              <Field
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={resetEmail}
                onChange={e => setResetEmail((e.target as HTMLInputElement).value)}
              />
              {resetError && (
                <p className="text-sm text-[var(--color-brand-red)] font-[var(--font-body)] bg-[var(--color-brand-red)]/10 px-4 py-3 rounded-lg border border-[var(--color-brand-red)]/20">
                  {resetError}
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={resetLoading}
              >
                Enviar enlace
              </Button>
              <button
                type="button"
                onClick={() => { setResetMode(false); setResetError('') }}
                className="w-full text-center text-xs font-[var(--font-cond)] text-[var(--color-mid)] hover:text-[var(--color-lavender)] tracking-wide transition-colors"
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
