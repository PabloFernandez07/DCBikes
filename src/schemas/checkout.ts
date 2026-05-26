import { z } from 'zod'
import { isValidSpanishId } from '@/lib/spanish-id'

/**
 * Schemas Zod para el formulario de checkout.
 *
 * Validamos:
 *  - Datos cliente (nombre, apellidos, email, teléfono ES).
 *  - Entrega: shipping (con dirección completa) o pickup.
 *  - Facturación B2B opcional (si needs_invoice → CIF, razón social, dirección).
 *  - Consentimientos legales (términos y privacidad obligatorios).
 *
 * Validación de campos condicionales mediante `superRefine`.
 */

// Provincias península (excluye Baleares, Canarias, Ceuta, Melilla).
export const PROVINCIAS_PENINSULA = [
  'Álava',
  'Albacete',
  'Alicante',
  'Almería',
  'Asturias',
  'Ávila',
  'Badajoz',
  'Barcelona',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Cantabria',
  'Castellón',
  'Ciudad Real',
  'Córdoba',
  'Cuenca',
  'Girona',
  'Granada',
  'Guadalajara',
  'Guipúzcoa',
  'Huelva',
  'Huesca',
  'Jaén',
  'La Coruña',
  'La Rioja',
  'León',
  'Lleida',
  'Lugo',
  'Madrid',
  'Málaga',
  'Murcia',
  'Navarra',
  'Ourense',
  'Palencia',
  'Pontevedra',
  'Salamanca',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia',
  'Valladolid',
  'Vizcaya',
  'Zamora',
  'Zaragoza',
] as const

const phoneEsRegex = /^(?:\+34|0034|34)?[\s-]?[6789]\d{2}[\s-]?\d{3}[\s-]?\d{3}$/
const postalCodePeninsulaRegex = /^[0-5]\d{4}$/

export const checkoutSchema = z
  .object({
    // ─── Datos cliente ──────────────────────────────────────────────────
    first_name: z.string().min(2, 'Mínimo 2 caracteres').max(60),
    last_name: z.string().min(2, 'Mínimo 2 caracteres').max(80),
    email: z.email('Email no válido').max(120),
    phone: z
      .string()
      .min(9, 'Teléfono no válido')
      .regex(phoneEsRegex, 'Teléfono español no válido (ej. 612 345 678)'),

    // ─── Entrega ────────────────────────────────────────────────────────
    delivery_method: z.enum(['shipping', 'pickup']),

    // Si shipping: dirección completa
    shipping_address: z.string().optional(),
    shipping_city: z.string().optional(),
    shipping_postal_code: z.string().optional(),
    shipping_province: z.string().optional(),
    shipping_notes: z.string().max(500, 'Máximo 500 caracteres').optional(),

    // ─── Facturación B2B (opcional) ─────────────────────────────────────
    needs_invoice: z.boolean(),
    invoice_business_name: z.string().optional(),
    invoice_cif: z.string().optional(),
    invoice_address: z.string().optional(),

    // ─── Consentimientos legales ────────────────────────────────────────
    accepted_terms: z
      .boolean()
      .refine(v => v === true, 'Debes aceptar los Términos y Condiciones'),
    accepted_privacy: z
      .boolean()
      .refine(v => v === true, 'Debes aceptar la Política de Privacidad'),
    accepted_approval_flow: z
      .boolean()
      .refine(
        v => v === true,
        'Debes aceptar el plazo de confirmación de 48h',
      ),
  })
  .superRefine((data, ctx) => {
    // Si shipping → exigir todos los campos de dirección.
    if (data.delivery_method === 'shipping') {
      if (!data.shipping_address || data.shipping_address.trim().length < 5) {
        ctx.addIssue({
          code: 'custom',
          path: ['shipping_address'],
          message: 'Dirección obligatoria',
        })
      }
      if (!data.shipping_city || data.shipping_city.trim().length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['shipping_city'],
          message: 'Ciudad obligatoria',
        })
      }
      if (!data.shipping_postal_code) {
        ctx.addIssue({
          code: 'custom',
          path: ['shipping_postal_code'],
          message: 'Código postal obligatorio',
        })
      } else if (!postalCodePeninsulaRegex.test(data.shipping_postal_code)) {
        ctx.addIssue({
          code: 'custom',
          path: ['shipping_postal_code'],
          message: 'CP no válido (solo península, 5 dígitos empezando 0-5)',
        })
      }
      if (
        !data.shipping_province ||
        !PROVINCIAS_PENINSULA.includes(
          data.shipping_province as (typeof PROVINCIAS_PENINSULA)[number],
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['shipping_province'],
          message: 'Provincia obligatoria',
        })
      }
    }

    // Si needs_invoice → exigir CIF, razón social, dirección fiscal.
    if (data.needs_invoice) {
      if (
        !data.invoice_business_name ||
        data.invoice_business_name.trim().length < 2
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoice_business_name'],
          message: 'Razón social obligatoria',
        })
      }
      if (!data.invoice_cif) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoice_cif'],
          message: 'CIF obligatorio',
        })
      } else if (!isValidSpanishId(data.invoice_cif.trim())) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoice_cif'],
          message:
            'NIF/NIE/CIF no válido. Verifica el formato y la letra de control.',
        })
      }
      if (
        !data.invoice_address ||
        data.invoice_address.trim().length < 5
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['invoice_address'],
          message: 'Dirección fiscal obligatoria',
        })
      }
    }
  })

export type CheckoutFormValues = z.infer<typeof checkoutSchema>

export const checkoutDefaults: CheckoutFormValues = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  delivery_method: 'shipping',
  shipping_address: '',
  shipping_city: '',
  shipping_postal_code: '',
  shipping_province: '',
  shipping_notes: '',
  needs_invoice: false,
  invoice_business_name: '',
  invoice_cif: '',
  invoice_address: '',
  accepted_terms: false,
  accepted_privacy: false,
  accepted_approval_flow: false,
}
