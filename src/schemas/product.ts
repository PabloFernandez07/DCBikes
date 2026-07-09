import { z } from 'zod'

/**
 * Schemas Zod centralizados para Producto.
 *
 * - `productSchema`: representación completa del producto (BD).
 * - `productFormSchema`: subset usado en el form admin. Para evitar el clásico
 *   "input vs output" de Zod (que rompe `zodResolver` cuando se usa `.default()`
 *   o `.optional()`), todos los campos string son `z.string()` siempre — el form
 *   se encarga de inicializar a `''` y nosotros validamos `min(...)` solo donde
 *   sea obligatorio. Para EAN/talla/grupo: validamos por regex solo si la
 *   cadena no está vacía.
 * - `ProductFormValues`: tipo inferido para react-hook-form.
 */

const slugRegex = /^[a-z0-9-]+$/
const ean13Regex = /^\d{13}$/

/**
 * Normaliza un decimal escrito "a la española" antes de validar/convertir:
 *   "12,50"    → "12.50"
 *   "1.299,95" → "1299.95"  (los puntos son separadores de miles)
 *   "12.50"    → "12.50"    (sin coma se deja igual)
 * Sin esto, el form rechazaba la coma decimal sin un mensaje útil (BUG-B5).
 * Úsala también al convertir a número al guardar: `Number(normalizeDecimalEs(v))`.
 */
export function normalizeDecimalEs(v: string): string {
  const s = v.trim()
  if (!s.includes(',')) return s
  return s.replace(/\./g, '').replace(',', '.')
}

// ─── Producto completo (BD) ─────────────────────────────────────────────
export const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  slug: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .regex(slugRegex, 'Solo minúsculas, números y guiones'),
  category_id: z.string().uuid('Selecciona una categoría'),

  description: z.string().optional().nullable(),
  short_description: z.string().max(160, 'Máximo 160 caracteres').optional().nullable(),

  retail_price: z.number().positive('Debe ser mayor que 0'),
  stock: z.number().int('Debe ser entero').nonnegative('No puede ser negativo'),

  sku: z.string().optional().nullable(),
  ean: z
    .string()
    .regex(ean13Regex, 'EAN-13: exactamente 13 dígitos')
    .optional()
    .nullable(),
  brand: z.string().optional().nullable(),

  featured: z.boolean(),
  active: z.boolean(),

  // Carrito / agrupación
  is_purchasable: z.boolean(),
  size_label: z.string().optional().nullable(),
  model_group: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  flavor: z.string().optional().nullable(),
  weight_grams: z.number().int().positive().optional().nullable(),
})

export type ProductValues = z.infer<typeof productSchema>

// ─── Form admin (todos los strings siempre presentes) ─────────────────

export const productFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres'),

  slug: z
    .string()
    .trim()
    .min(2, 'Mínimo 2 caracteres')
    .regex(slugRegex, 'Solo minúsculas, números y guiones'),

  category_id: z.string().uuid('Selecciona una categoría'),

  sku: z.string(),

  ean: z
    .string()
    .refine((v) => v.trim() === '' || ean13Regex.test(v.trim()), {
      message: 'EAN-13: exactamente 13 dígitos',
    }),

  brand: z.string(),

  short_description: z.string().max(160, 'Máximo 160 caracteres'),
  description: z.string(),

  retail_price: z
    .string()
    .min(1, 'PVP requerido')
    .refine(
      (v) => {
        // Acepta coma decimal ("12,50") normalizando es-ES antes de validar.
        const n = Number(normalizeDecimalEs(v))
        return Number.isFinite(n) && n > 0
      },
      { message: 'PVP debe ser mayor que 0 (usa punto o coma decimal: 12,50)' },
    ),

  discount_percent: z.string().refine(
    (v) => {
      if (v.trim() === '') return true
      const n = Number(normalizeDecimalEs(v))
      return Number.isFinite(n) && n >= 0 && n <= 100
    },
    { message: 'Entre 0 y 100 (admite coma decimal: 12,5)' },
  ),

  stock: z
    .string()
    .min(1, 'Stock requerido')
    .refine(
      (v) => {
        const n = Number(v)
        return Number.isInteger(n) && n >= 0
      },
      { message: 'Stock debe ser un entero ≥ 0' },
    ),

  featured: z.boolean(),
  active: z.boolean(),

  // Nuevos campos
  is_purchasable: z.boolean(),
  // Override de devolución por producto: true=devolvible, false=no, null=hereda
  // de la categoría (categories.is_returnable).
  is_returnable: z.boolean().nullable(),
  // Producto de ocasión / segunda mano (muestra etiqueta y permite filtrar).
  is_second_hand: z.boolean(),
  size_label: z.string(),
  model_group: z.string(),
  color: z.string(),
  flavor: z.string(),
  weight_grams: z.string().refine(
    (v) => {
      if (v.trim() === '') return true
      const n = Number(v)
      return Number.isInteger(n) && n > 0
    },
    { message: 'Debe ser un entero positivo' },
  ),
})

export type ProductFormValues = z.infer<typeof productFormSchema>
