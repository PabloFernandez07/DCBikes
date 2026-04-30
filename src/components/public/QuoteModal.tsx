import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle, Tag } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

const schema = z.object({
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  message: z.string().min(20, 'El mensaje debe tener al menos 20 caracteres'),
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

type Status = 'idle' | 'loading' | 'success'

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0 })
}

export function QuoteModal({ productId, product, onClose }: QuoteModalProps) {
  const [status, setStatus] = useState<Status>('idle')

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
    defaultValues: { message: defaultMessage },
  })

  const onSubmit = async (data: FormData) => {
    setStatus('loading')
    try {
      const { data: quote, error } = await supabase
        .from('quote_requests')
        .insert({
          product_id: productId ?? null,
          email: data.email,
          phone: data.phone ?? null,
          message: data.message,
        })
        .select('id')
        .single()

      if (error) throw error

      await supabase.functions.invoke('send-quote-email', {
        body: { quote_id: quote.id },
      })

      setStatus('success')
      setTimeout(() => onClose(), 3000)
    } catch {
      setStatus('idle')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? 'Pedir presupuesto' : 'Consulta general'}
      size="md"
    >
      {status === 'success' ? (
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
            label="Email"
            type="email"
            required
            placeholder="tu@email.com"
            error={errors.email?.message}
            {...register('email')}
          />
          <Field
            label="Teléfono"
            type="tel"
            placeholder="+34 600 000 000"
            error={errors.phone?.message}
            {...register('phone')}
          />
          <Field
            label="Mensaje"
            as="textarea"
            required
            rows={4}
            placeholder="Cuéntanos qué necesitas (mínimo 20 caracteres)..."
            error={errors.message?.message}
            {...register('message')}
          />
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" size="md" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="md" loading={status === 'loading'} className="flex-1">
              Enviar solicitud
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
