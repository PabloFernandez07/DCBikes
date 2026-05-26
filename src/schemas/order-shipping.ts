import { z } from 'zod'
import { PROVINCIAS_PENINSULA } from './checkout'

/**
 * Schema mínimo para modificación de dirección de envío de un pedido ya creado.
 *
 * Reutiliza el catálogo `PROVINCIAS_PENINSULA` de checkout.ts y aplica la
 * misma validación de código postal (península, 5 dígitos empezando 0-5).
 */

const postalCodePeninsulaRegex = /^[0-5]\d{4}$/

export const orderShippingSchema = z.object({
  address: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(200, 'Máximo 200 caracteres'),
  city: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(80, 'Máximo 80 caracteres'),
  postal_code: z
    .string()
    .regex(
      postalCodePeninsulaRegex,
      'CP no válido (solo península, 5 dígitos empezando 0-5)',
    ),
  province: z
    .string()
    .refine(
      v => PROVINCIAS_PENINSULA.includes(v as (typeof PROVINCIAS_PENINSULA)[number]),
      'Provincia obligatoria',
    ),
  notes: z.string().max(500, 'Máximo 500 caracteres').optional().or(z.literal('')),
})

export type OrderShippingFormValues = z.infer<typeof orderShippingSchema>

export { PROVINCIAS_PENINSULA }
