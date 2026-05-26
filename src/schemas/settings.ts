import { z } from 'zod'

/**
 * Schemas Zod para las nuevas secciones de configuración del admin (Fase J):
 *  - E-commerce        → coste envío, umbral free, auto-cancel, recogida, emails notif.
 *  - Facturación       → datos legales emisor, prefijos, IVA por defecto.
 *  - Pasarela Redsys   → entorno (test/prod) + nombre comercio.
 *
 * Las credenciales sensibles de Redsys (FUC, Terminal, SHA-256) NO se gestionan
 * desde aquí: viven en Supabase Vault, accesibles solo a Edge Functions con
 * service_role.
 */

// ─────────────────────────────────────────────────────────────
// E-commerce
// ─────────────────────────────────────────────────────────────

export const ecommerceSettingsSchema = z.object({
  // Coste envío en céntimos (admin lo introduce en €, se convierte antes de validar).
  shipping_flat_rate_cents: z
    .number({ message: 'Debe ser un número' })
    .int('Debe ser un entero (céntimos)')
    .min(0, 'No puede ser negativo')
    .max(10000, 'Máximo 100 €'),

  shipping_free_threshold_cents: z
    .number({ message: 'Debe ser un número' })
    .int('Debe ser un entero (céntimos)')
    .min(0, 'No puede ser negativo'),

  // Pre-auth Redsys caduca a los 7 días → max 144 h.
  order_auto_cancel_hours: z
    .number({ message: 'Debe ser un número' })
    .int('Debe ser un entero')
    .min(1, 'Mínimo 1 hora')
    .max(144, 'Máximo 144 h (6 días) por límite Redsys'),

  // CSV de emails admin (puede ir vacío). Si no es vacío, validar cada uno.
  order_notification_emails: z
    .string()
    .refine(
      s =>
        s.trim() === '' ||
        s
          .split(',')
          .every(
            e => z.string().email().safeParse(e.trim()).success && e.trim() !== '',
          ),
      'Debe ser un email o lista separada por comas',
    ),

  pickup_deadline_days: z
    .number({ message: 'Debe ser un número' })
    .int('Debe ser un entero')
    .min(1, 'Mínimo 1 día')
    .max(60, 'Máximo 60 días'),
})

export type EcommerceSettingsValues = z.infer<typeof ecommerceSettingsSchema>

// ─────────────────────────────────────────────────────────────
// Facturación
// ─────────────────────────────────────────────────────────────

// CIF español (B12345678) o NIF persona física (12345678X). Acepta ambos.
const cifOrNifRegex = /^[A-Z]\d{8}$|^\d{8}[A-Z]$/

export const invoiceSettingsSchema = z.object({
  legal_company_name: z.string().min(1, 'Razón social obligatoria').max(120),

  legal_company_cif: z
    .string()
    .trim()
    .toUpperCase()
    .regex(cifOrNifRegex, 'CIF (B12345678) o NIF (12345678X) no válido'),

  legal_company_address: z
    .string()
    .min(5, 'Dirección demasiado corta')
    .max(200),

  invoice_series_prefix: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(10, 'Máximo 10 caracteres')
    .regex(/^[A-Z]+$/, 'Solo letras mayúsculas (A-Z)'),

  order_series_prefix: z
    .string()
    .min(2, 'Mínimo 2 caracteres')
    .max(10, 'Máximo 10 caracteres')
    .regex(/^[A-Z]+$/, 'Solo letras mayúsculas (A-Z)'),

  tax_rate_default: z
    .number({ message: 'Debe ser un número' })
    .min(0, 'No puede ser negativo')
    .max(100, 'Máximo 100 %'),
})

export type InvoiceSettingsValues = z.infer<typeof invoiceSettingsSchema>

// ─────────────────────────────────────────────────────────────
// Pasarela de pago (Redsys, sin credenciales)
// ─────────────────────────────────────────────────────────────

export const paymentSettingsSchema = z.object({
  redsys_environment: z.enum(['test', 'prod']),

  // Nombre que aparece en el TPV virtual. Redsys limita a ~60 chars.
  redsys_merchant_name: z
    .string()
    .min(1, 'Nombre obligatorio')
    .max(60, 'Máximo 60 caracteres'),
})

export type PaymentSettingsValues = z.infer<typeof paymentSettingsSchema>
