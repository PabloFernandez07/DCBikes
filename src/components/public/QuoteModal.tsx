import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle } from 'lucide-react'
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

interface QuoteModalProps {
  productId: string | null
  onClose: () => void
}

type Status = 'idle' | 'loading' | 'success'

export function QuoteModal({ productId, onClose }: QuoteModalProps) {
  const [status, setStatus] = useState<Status>('idle')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

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
      title={productId ? 'Pedir presupuesto' : 'Consulta general'}
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
