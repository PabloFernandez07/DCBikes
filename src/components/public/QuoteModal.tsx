import { useState, useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Tag } from 'lucide-react'
import { Turnstile } from '@marsidev/react-turnstile'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'
import { PRIVACY_VERSION } from '@/lib/legal-versions'

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

const schema = z.object({
  name: z.string().min(2, 'Indica tu nombre'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  message: z.string().min(20, 'El mensaje debe tener al menos 20 caracteres'),
  privacy: z.boolean().refine(v => v === true, 'Debes aceptar la política de privacidad'),
})

type FormData = z.infer<typeof schema>

interface ProductInfo {
  name: string
  brand?: string | null
  retail_price: number
  discount_percent?: number | null
}

interface QuoteModalProps {
  productId: string | null
  product?: ProductInfo
  onClose: () => void
}

type Status = 'idle' | 'loading' | 'success' | 'error'

interface InvokeResult {
  ok: boolean
  errorMessage?: string
}

async function invokeFn(name: string, body: unknown): Promise<InvokeResult> {
  try {
    const { error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
    if (!error) return { ok: true }
    const message = error.message ?? String(error)
    return { ok: false, errorMessage: message }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, errorMessage: message }
  }
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0 })
}

export function QuoteModal({ productId, product, onClose }: QuoteModalProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorText, setErrorText] = useState<string>('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileLoaded, setTurnstileLoaded] = useState(false)

  // F-06: lazy-load del widget Turnstile — solo se carga cuando el usuario
  // interactúa por primera vez con el formulario. Privacidad (Cloudflare no
  // recibe señal hasta que el usuario realmente va a enviar) y mejora LCP/FID.
  const handleFirstFocus = useCallback(() => {
    setTurnstileLoaded(prev => prev || true)
  }, [])

  const pct = product?.discount_percent
  const hasDiscount = pct != null && pct > 0
  const finalPrice = hasDiscount && product
    ? product.retail_price * (1 - pct / 100)
    : product?.retail_price

  const defaultMessage = product
    ? `Hola, estoy interesado en el producto "${product.name}"${product.brand ? ` de ${product.brand}` : ''}. Me gustaría recibir más información y un presupuesto personalizado.`
    : ''

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { message: defaultMessage, privacy: false },
  })

  const captchaRequired = Boolean(TURNSTILE_SITE_KEY)
  const submitDisabled = captchaRequired && !turnstileToken

  const onSubmit = async (data: FormData) => {
    if (captchaRequired && !turnstileToken) {
      setErrorText('Verifica que no eres un robot antes de enviar.')
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorText('')

    const res = await invokeFn('quote-submit', {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      message: data.message,
      product_id: productId ?? null,
      cf_turnstile_token: turnstileToken ?? '',
      consent_version: PRIVACY_VERSION,
    })

    if (!res.ok) {
      const msg = res.errorMessage ?? ''
      if (/rate.?limit/i.test(msg)) {
        setErrorText('Has enviado demasiadas solicitudes. Vuelve a intentarlo en 1 hora.')
      } else if (/captcha/i.test(msg)) {
        setErrorText('Verifica que no eres un robot antes de enviar.')
      } else {
        setErrorText('No se pudo enviar la solicitud. Inténtalo de nuevo.')
      }
      setStatus('error')
      return
    }

    setStatus('success')
    setTimeout(() => onClose(), 3000)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Pedir presupuesto' : 'Consulta general'}
      size="md"
    >
      {status === 'error' ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-14 h-14 rounded-full bg-[var(--color-brand-red)]/15 flex items-center justify-center">
            <span className="text-[var(--color-brand-red)] text-2xl font-bold">!</span>
          </div>
          <h3 className="font-[var(--font-cond)] text-xl font-semibold text-[var(--color-cream)]">
            Error al enviar
          </h3>
          <p className="text-[var(--color-mid)] text-sm">
            {errorText || 'No se pudo enviar la solicitud. Por favor, inténtalo de nuevo o contáctanos por teléfono.'}
          </p>
          <button
            type="button"
            onClick={() => { setStatus('idle'); setErrorText('') }}
            className="px-4 py-2 rounded-xl border border-[var(--color-lavender)]/30 text-[var(--color-lavender)] font-[var(--font-cond)] text-sm tracking-wide hover:bg-[var(--color-lavender)]/10 transition-colors"
          >
            Volver a intentarlo
          </button>
        </div>
      ) : status === 'success' ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle size={52} className="text-green-400" />
          <h3 className="font-[var(--font-cond)] text-xl font-semibold text-[var(--color-cream)]">
            ¡Solicitud enviada!
          </h3>
          <p className="text-[var(--color-mid)] text-sm">
            Te responderemos lo antes posible. Cerrando...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          {/* Product summary card */}
          {product && (
            <div className="flex items-center gap-4 bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-xl px-4 py-3.5">
              <div className="flex-1 min-w-0">
                {product.brand && (
                  <p className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)] mb-0.5">
                    {product.brand}
                  </p>
                )}
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] text-sm leading-tight truncate">
                  {product.name}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-[var(--font-display)] text-lg text-[var(--color-lavender)] tracking-wide leading-none">
                  {fmt(finalPrice ?? product.retail_price)} €
                </p>
                {hasDiscount && (
                  <div className="flex items-center justify-end gap-1.5 mt-0.5">
                    <span className="text-[var(--color-mid)] text-xs line-through font-[var(--font-cond)]">
                      {fmt(product.retail_price)} €
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-[var(--font-cond)] font-bold bg-[var(--color-brand-red)] text-white px-1.5 py-0.5 rounded">
                      <Tag size={8} />
                      -{pct}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <Field
            label="Nombre"
            type="text"
            required
            placeholder="Tu nombre"
            error={errors.name?.message}
            {...register('name')}
            onFocus={handleFirstFocus}
          />
          <Field
            label="Email"
            type="email"
            required
            placeholder="tu@email.com"
            error={errors.email?.message}
            {...register('email')}
            onFocus={handleFirstFocus}
          />
          <Field
            label="Teléfono"
            type="tel"
            placeholder="+34 600 000 000"
            error={errors.phone?.message}
            {...register('phone')}
            onFocus={handleFirstFocus}
          />
          <Field
            label="Mensaje"
            as="textarea"
            required
            rows={4}
            placeholder="Cuéntanos qué necesitas (mínimo 20 caracteres)..."
            error={errors.message?.message}
            {...register('message')}
            onFocus={handleFirstFocus}
          />
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="privacy"
              className="mt-0.5 w-4 h-4 rounded border-[var(--color-card-hover)] bg-[var(--color-ink)] accent-[var(--color-lavender)] cursor-pointer shrink-0"
              {...register('privacy')}
            />
            <label htmlFor="privacy" className="text-xs text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed cursor-pointer">
              He leído y acepto la{' '}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-[var(--color-lavender)] hover:underline">
                Política de Privacidad
              </a>
              . Mis datos serán tratados por DC Bikes (Supabase, UE-Irlanda) para gestionar mi
              solicitud, enviados a Resend (EE.UU., CCT 2021/914) para notificación por email,
              y verificados con Cloudflare Turnstile (EE.UU., DPF) contra spam.
            </label>
          </div>
          {errors.privacy && (
            <p className="text-xs text-[var(--color-brand-red)] font-[var(--font-body)] -mt-2">{errors.privacy.message}</p>
          )}

          {TURNSTILE_SITE_KEY ? (
            <>
              {turnstileLoaded && (
                <Turnstile
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                  options={{ theme: 'dark', size: 'flexible' }}
                />
              )}
              {/* P-04: aviso legal Cloudflare Turnstile junto al widget */}
              <p className="text-xs text-gray-500 mt-1">
                Verificación anti-fraude vía Cloudflare Turnstile (se carga al interactuar con el formulario).{' '}
                <a href="/cookies" className="underline">Más info</a>.
              </p>
            </>
          ) : (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              ⚠ Captcha no configurado (VITE_TURNSTILE_SITE_KEY). Las solicitudes seguirán rate-limit por IP.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" size="md" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={status === 'loading'}
              disabled={submitDisabled}
              className="flex-1"
            >
              Enviar solicitud
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
