import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bike } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'

export default function Login() {
  const { user, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

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

  return (
    <div className="min-h-screen bg-[var(--color-ink-deep)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-brand-red)] mx-auto">
            <Bike size={32} className="text-white" />
          </div>
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
          </form>
        </div>
      </div>
    </div>
  )
}
