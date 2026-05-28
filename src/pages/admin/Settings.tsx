import { useState, useEffect } from 'react'
import {
  ShoppingCart,
  FileText,
  CreditCard,
  ShieldAlert,
  Info,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import { SCHEDULE } from '@/lib/schedule'
import type { DaySchedule } from '@/lib/schedule'
import {
  ecommerceSettingsSchema,
  invoiceSettingsSchema,
  paymentSettingsSchema,
  type EcommerceSettingsValues,
  type InvoiceSettingsValues,
  type PaymentSettingsValues,
} from '@/schemas/settings'

type SettingsMap = Record<string, string>

interface SettingRow {
  key: string
  value: unknown
  updated_at: string
}

const SETTINGS_KEYS = [
  'store_name',
  'store_address',
  'store_phone',
  'maps_link',
  'quote_destination_email',
  'reply_from_email',
  'social_instagram',
  'social_facebook',
  'legal_forma_juridica',
  'legal_inscripcion',
] as const

type SettingKey = typeof SETTINGS_KEYS[number]

// ─── Helpers para upsert/parse de settings ───────────────────────────────

type UpsertResult = { error: { message: string } | null }
type SettingsBuilder = {
  upsert: (row: { key: string; value: string }) => Promise<UpsertResult>
}
const getSettingsBuilder = () =>
  supabase.from('settings') as unknown as SettingsBuilder

/** Parsea un valor jsonb que puede venir ya parseado o como string JSON. */
function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// ─── Defaults nuevas secciones (espejo de useShopSettings) ────────────────

const ECOMMERCE_DEFAULTS = {
  // valores en céntimos / horas / días / texto crudo
  shipping_flat_rate_cents: 690,
  shipping_free_threshold_cents: 5000,
  order_auto_cancel_hours: 48,
  pickup_deadline_days: 15,
  order_notification_emails: '',
}

const INVOICE_DEFAULTS = {
  legal_company_name: '',
  legal_company_cif: '',
  legal_company_address: '',
  invoice_series_prefix: 'FAC',
  order_series_prefix: 'ORD',
  tax_rate_default: 21,
}

const PAYMENT_DEFAULTS: { redsys_environment: 'test' | 'prod'; redsys_merchant_name: string } = {
  redsys_environment: 'test',
  redsys_merchant_name: 'DC Bikes Cantabria',
}

// ─── UI helpers locales ──────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>
  title: string
  subtitle?: string
}
function SectionHeader({ icon: Icon, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-ink)] text-[var(--color-lavender)]">
        <Icon size={18} aria-hidden={true} />
      </span>
      <div>
        <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

export function Settings() {
  const { toasts, toast, dismiss } = useToast()
  const [values, setValues] = useState<SettingsMap>({})
  const [original, setOriginal] = useState<SettingsMap>({})
  const [scheduleRows, setScheduleRows] = useState<DaySchedule[]>(SCHEDULE)
  const [originalSchedule, setOriginalSchedule] = useState<DaySchedule[]>(SCHEDULE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ─── Estado nuevas secciones (Fase J) ──────────────────────────────────
  // Para shipping en céntimos guardamos también el valor en € para que el
  // input del admin sea ergonómico. Convertimos al guardar.
  const [ecommerceValues, setEcommerceValues] = useState({
    shipping_flat_rate_euros: '6.90',
    shipping_free_threshold_euros: '50.00',
    order_auto_cancel_hours: '48',
    pickup_deadline_days: '15',
    order_notification_emails: '',
  })
  const [ecommerceErrors, setEcommerceErrors] = useState<Record<string, string>>({})
  const [savingEcommerce, setSavingEcommerce] = useState(false)

  const [invoiceValues, setInvoiceValues] = useState({
    legal_company_name: '',
    legal_company_cif: '',
    legal_company_address: '',
    invoice_series_prefix: 'FAC',
    order_series_prefix: 'ORD',
    tax_rate_default: '21',
  })
  const [invoiceErrors, setInvoiceErrors] = useState<Record<string, string>>({})
  const [savingInvoice, setSavingInvoice] = useState(false)

  const [paymentValues, setPaymentValues] = useState<{
    redsys_environment: 'test' | 'prod'
    redsys_merchant_name: string
  }>({
    redsys_environment: 'test',
    redsys_merchant_name: 'DC Bikes Cantabria',
  })
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({})
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => {
    supabase
      .from('settings')
      .select('*')
      .then(({ data }) => {
        const map: SettingsMap = {}
        const rows = (data as SettingRow[] | null) ?? []

        // Para las nuevas keys necesitamos los valores parseados también.
        const parsedByKey = new Map<string, unknown>()

        for (const row of rows) {
          parsedByKey.set(row.key, parseJsonValue(row.value))
          try {
            if (row.key === 'store_schedule') {
              const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value
              if (Array.isArray(parsed) && parsed.length === 7) {
                setScheduleRows(parsed as DaySchedule[])
                setOriginalSchedule(parsed as DaySchedule[])
              }
            } else {
              map[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : String(row.value ?? '')
            }
          } catch {
            map[row.key] = String(row.value ?? '')
          }
        }
        setValues(map)
        setOriginal(map)

        // ─── Hidratar nuevas secciones ──────────────────────────────────
        const num = (k: string, fallback: number): number => {
          const v = parsedByKey.get(k)
          if (typeof v === 'number' && Number.isFinite(v)) return v
          if (typeof v === 'string' && v.trim() !== '') {
            const n = Number(v)
            if (Number.isFinite(n)) return n
          }
          return fallback
        }
        const str = (k: string, fallback: string): string => {
          const v = parsedByKey.get(k)
          if (typeof v === 'string') return v
          if (v == null) return fallback
          return String(v)
        }

        const shippingCents = num('shipping_flat_rate_cents', ECOMMERCE_DEFAULTS.shipping_flat_rate_cents)
        const thresholdCents = num('shipping_free_threshold_cents', ECOMMERCE_DEFAULTS.shipping_free_threshold_cents)

        setEcommerceValues({
          shipping_flat_rate_euros: (shippingCents / 100).toFixed(2),
          shipping_free_threshold_euros: (thresholdCents / 100).toFixed(2),
          order_auto_cancel_hours: String(num('order_auto_cancel_hours', ECOMMERCE_DEFAULTS.order_auto_cancel_hours)),
          pickup_deadline_days: String(num('pickup_deadline_days', ECOMMERCE_DEFAULTS.pickup_deadline_days)),
          order_notification_emails: str('order_notification_emails', ECOMMERCE_DEFAULTS.order_notification_emails),
        })

        setInvoiceValues({
          legal_company_name: str('legal_company_name', INVOICE_DEFAULTS.legal_company_name),
          legal_company_cif: str('legal_company_cif', INVOICE_DEFAULTS.legal_company_cif),
          legal_company_address: str('legal_company_address', INVOICE_DEFAULTS.legal_company_address),
          invoice_series_prefix: str('invoice_series_prefix', INVOICE_DEFAULTS.invoice_series_prefix),
          order_series_prefix: str('order_series_prefix', INVOICE_DEFAULTS.order_series_prefix),
          tax_rate_default: String(num('tax_rate_default', INVOICE_DEFAULTS.tax_rate_default)),
        })

        const env = str('redsys_environment', PAYMENT_DEFAULTS.redsys_environment)
        setPaymentValues({
          redsys_environment: env === 'prod' ? 'prod' : 'test',
          redsys_merchant_name: str('redsys_merchant_name', PAYMENT_DEFAULTS.redsys_merchant_name),
        })

        setLoading(false)
      })
  }, [])

  const set = (key: SettingKey, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const setSlot = (dayIdx: number, slot: 'morning' | 'afternoon', value: string) => {
    setScheduleRows(prev =>
      prev.map((d, i) => i === dayIdx ? { ...d, [slot]: value.trim() || null } : d)
    )
  }

  const handleSave = async () => {
    setSaving(true)
    const changed = SETTINGS_KEYS.filter(k => values[k] !== original[k])
    const settingsBuilder = getSettingsBuilder()

    const results = await Promise.all([
      ...changed.map(key => {
        const val: string = JSON.stringify(values[key] ?? '')
        return settingsBuilder.upsert({ key, value: val })
      }),
      JSON.stringify(scheduleRows) !== JSON.stringify(originalSchedule)
        ? settingsBuilder.upsert({ key: 'store_schedule', value: JSON.stringify(scheduleRows) })
        : Promise.resolve({ error: null }),
    ])

    setSaving(false)
    const anyError = results.find(r => r.error)
    if (anyError?.error) {
      toast.error('Error al guardar: ' + anyError.error.message)
    } else {
      setOriginal({ ...values })
      setOriginalSchedule([...scheduleRows])
      toast.success('Configuración guardada')
    }
  }

  // ─── Save handlers nuevas secciones ────────────────────────────────────

  const handleSaveEcommerce = async () => {
    setEcommerceErrors({})

    // Convertir € → céntimos.
    const flatRateEuros = parseFloat(ecommerceValues.shipping_flat_rate_euros.replace(',', '.'))
    const freeThresholdEuros = parseFloat(
      ecommerceValues.shipping_free_threshold_euros.replace(',', '.'),
    )
    const autoCancelHours = parseInt(ecommerceValues.order_auto_cancel_hours, 10)
    const pickupDays = parseInt(ecommerceValues.pickup_deadline_days, 10)

    const parsed: EcommerceSettingsValues = {
      shipping_flat_rate_cents: Number.isFinite(flatRateEuros)
        ? Math.round(flatRateEuros * 100)
        : NaN,
      shipping_free_threshold_cents: Number.isFinite(freeThresholdEuros)
        ? Math.round(freeThresholdEuros * 100)
        : NaN,
      order_auto_cancel_hours: Number.isFinite(autoCancelHours) ? autoCancelHours : NaN,
      pickup_deadline_days: Number.isFinite(pickupDays) ? pickupDays : NaN,
      order_notification_emails: ecommerceValues.order_notification_emails.trim(),
    }

    const validation = ecommerceSettingsSchema.safeParse(parsed)
    if (!validation.success) {
      const errs: Record<string, string> = {}
      for (const issue of validation.error.issues) {
        const path = issue.path[0]
        if (typeof path === 'string') errs[path] = issue.message
      }
      // Mapear las claves zod (en céntimos) a los IDs del form (en euros).
      const formErrs: Record<string, string> = {}
      if (errs.shipping_flat_rate_cents)
        formErrs.shipping_flat_rate_euros = errs.shipping_flat_rate_cents
      if (errs.shipping_free_threshold_cents)
        formErrs.shipping_free_threshold_euros = errs.shipping_free_threshold_cents
      if (errs.order_auto_cancel_hours)
        formErrs.order_auto_cancel_hours = errs.order_auto_cancel_hours
      if (errs.pickup_deadline_days) formErrs.pickup_deadline_days = errs.pickup_deadline_days
      if (errs.order_notification_emails)
        formErrs.order_notification_emails = errs.order_notification_emails
      setEcommerceErrors(formErrs)
      toast.error('Revisa los campos marcados')
      return
    }

    setSavingEcommerce(true)
    const builder = getSettingsBuilder()
    const v = validation.data
    const results = await Promise.all([
      builder.upsert({ key: 'shipping_flat_rate_cents', value: JSON.stringify(v.shipping_flat_rate_cents) }),
      builder.upsert({ key: 'shipping_free_threshold_cents', value: JSON.stringify(v.shipping_free_threshold_cents) }),
      builder.upsert({ key: 'order_auto_cancel_hours', value: JSON.stringify(v.order_auto_cancel_hours) }),
      builder.upsert({ key: 'pickup_deadline_days', value: JSON.stringify(v.pickup_deadline_days) }),
      builder.upsert({ key: 'order_notification_emails', value: JSON.stringify(v.order_notification_emails) }),
    ])
    setSavingEcommerce(false)
    const anyError = results.find(r => r.error)
    if (anyError?.error) {
      toast.error('Error al guardar: ' + anyError.error.message)
    } else {
      toast.success('Configuración de e-commerce guardada')
    }
  }

  const handleSaveInvoice = async () => {
    setInvoiceErrors({})

    const taxRate = parseFloat(invoiceValues.tax_rate_default.replace(',', '.'))

    const parsed: InvoiceSettingsValues = {
      legal_company_name: invoiceValues.legal_company_name.trim(),
      legal_company_cif: invoiceValues.legal_company_cif.trim().toUpperCase(),
      legal_company_address: invoiceValues.legal_company_address.trim(),
      invoice_series_prefix: invoiceValues.invoice_series_prefix.trim().toUpperCase(),
      order_series_prefix: invoiceValues.order_series_prefix.trim().toUpperCase(),
      tax_rate_default: Number.isFinite(taxRate) ? taxRate : NaN,
    }

    const validation = invoiceSettingsSchema.safeParse(parsed)
    if (!validation.success) {
      const errs: Record<string, string> = {}
      for (const issue of validation.error.issues) {
        const path = issue.path[0]
        if (typeof path === 'string') errs[path] = issue.message
      }
      setInvoiceErrors(errs)
      toast.error('Revisa los campos marcados')
      return
    }

    setSavingInvoice(true)
    const builder = getSettingsBuilder()
    const v = validation.data
    const results = await Promise.all([
      builder.upsert({ key: 'legal_company_name', value: JSON.stringify(v.legal_company_name) }),
      builder.upsert({ key: 'legal_company_cif', value: JSON.stringify(v.legal_company_cif) }),
      builder.upsert({ key: 'legal_company_address', value: JSON.stringify(v.legal_company_address) }),
      builder.upsert({ key: 'invoice_series_prefix', value: JSON.stringify(v.invoice_series_prefix) }),
      builder.upsert({ key: 'order_series_prefix', value: JSON.stringify(v.order_series_prefix) }),
      builder.upsert({ key: 'tax_rate_default', value: JSON.stringify(v.tax_rate_default) }),
    ])
    setSavingInvoice(false)
    const anyError = results.find(r => r.error)
    if (anyError?.error) {
      toast.error('Error al guardar: ' + anyError.error.message)
    } else {
      // Reflejar valores normalizados en el form (CIF en mayúsculas, etc.).
      setInvoiceValues(prev => ({
        ...prev,
        legal_company_cif: v.legal_company_cif,
        invoice_series_prefix: v.invoice_series_prefix,
        order_series_prefix: v.order_series_prefix,
      }))
      toast.success('Datos de facturación guardados')
    }
  }

  const handleSavePayment = async () => {
    setPaymentErrors({})

    const parsed: PaymentSettingsValues = {
      redsys_environment: paymentValues.redsys_environment,
      redsys_merchant_name: paymentValues.redsys_merchant_name.trim(),
    }

    const validation = paymentSettingsSchema.safeParse(parsed)
    if (!validation.success) {
      const errs: Record<string, string> = {}
      for (const issue of validation.error.issues) {
        const path = issue.path[0]
        if (typeof path === 'string') errs[path] = issue.message
      }
      setPaymentErrors(errs)
      toast.error('Revisa los campos marcados')
      return
    }

    setSavingPayment(true)
    const builder = getSettingsBuilder()
    const v = validation.data
    const results = await Promise.all([
      builder.upsert({ key: 'redsys_environment', value: JSON.stringify(v.redsys_environment) }),
      builder.upsert({ key: 'redsys_merchant_name', value: JSON.stringify(v.redsys_merchant_name) }),
    ])
    setSavingPayment(false)
    const anyError = results.find(r => r.error)
    if (anyError?.error) {
      toast.error('Error al guardar: ' + anyError.error.message)
    } else {
      toast.success('Configuración de pago guardada')
    }
  }

  const v = (key: SettingKey) => values[key] ?? ''

  // Aviso legal crítico: faltan datos fiscales obligatorios para operar.
  const fiscalChecks = [
    { id: 'legal_company_name', label: 'Razón comercial', value: invoiceValues.legal_company_name.trim() },
    { id: 'legal_company_cif', label: 'CIF / NIF', value: invoiceValues.legal_company_cif.trim() },
    { id: 'legal_company_address', label: 'Dirección fiscal', value: invoiceValues.legal_company_address.trim() },
  ]
  const fiscalIncomplete = !loading && fiscalChecks.some(c => !c.value)

  return (
    <>
      <div className="space-y-6 max-w-2xl">
        {/* Banner crítico — datos fiscales incompletos */}
        {fiscalIncomplete && (
          <div
            role="alert"
            className="rounded-2xl border-2 border-[var(--color-brand-red)] bg-[var(--color-brand-red)]/10 p-5"
          >
            <div className="flex items-start gap-3">
              <ShieldAlert size={22} className="text-[var(--color-brand-red)] shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide text-sm mb-2">
                  <span role="img" aria-hidden="true">⚠</span> AVISO LEGAL CRÍTICO
                </p>
                <p className="text-xs text-[var(--color-cream-dim)] leading-relaxed mb-3">
                  Los datos fiscales del titular están incompletos. La web{' '}
                  <strong className="text-[var(--color-cream)]">NO PUEDE operar legalmente sin ellos</strong>:
                </p>
                <ul className="space-y-1 text-xs font-[var(--font-body)] mb-3">
                  {fiscalChecks.map(c => (
                    <li key={c.id} className="flex items-center gap-2">
                      <span
                        className={
                          c.value
                            ? 'text-green-400 font-mono'
                            : 'text-[var(--color-brand-red)] font-mono'
                        }
                      >
                        {c.value ? '✓' : '☐'}
                      </span>
                      <span
                        className={
                          c.value ? 'text-[var(--color-mid)] line-through' : 'text-[var(--color-cream-dim)]'
                        }
                      >
                        {c.label} (<code className="text-[var(--color-lavender)]">{c.id}</code>)
                        {!c.value && (
                          <span className="text-[var(--color-brand-red)] ml-2 not-italic">← rellenar</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[var(--color-mid)] leading-relaxed">
                  Hasta cumplimentar, el Aviso Legal mostrará{' '}
                  <strong className="text-[var(--color-cream-dim)]">"[Pendiente]"</strong> en lugar del
                  titular, y las facturas no podrán emitirse correctamente. Rellena los campos en la sección{' '}
                  <strong className="text-[var(--color-cream)]">Facturación</strong> más abajo.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
            CONFIGURACIÓN
          </h1>
          <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
            Ajustes generales de la tienda
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Section 1: Store Info */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                Contacto y ubicación
              </h2>

              <Field
                label="Nombre de la tienda"
                value={v('store_name')}
                onChange={e => set('store_name', (e.target as HTMLInputElement).value)}
              />
              <Field
                label="Dirección"
                value={v('store_address')}
                onChange={e => set('store_address', (e.target as HTMLInputElement).value)}
              />
              <Field
                label="Teléfono"
                type="tel"
                value={v('store_phone')}
                onChange={e => set('store_phone', (e.target as HTMLInputElement).value)}
              />
              <p className="text-xs text-[var(--color-mid)] -mt-2">
                Los horarios se gestionan en la sección <span className="text-[var(--color-cream)]">"Horarios semanales"</span> más abajo.
              </p>
              <Field
                label="Enlace Google Maps (Cómo llegar)"
                type="url"
                placeholder="https://maps.app.goo.gl/..."
                helpText="URL del pin de Google Maps. Aparece en el botón 'Cómo llegar' y en el panel del mapa."
                value={v('maps_link')}
                onChange={e => set('maps_link', (e.target as HTMLInputElement).value)}
              />
            </section>

            {/* Section: Horarios semanales */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Horarios semanales
                </h2>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  Controla el indicador ABIERTO/CERRADO y la tabla de horarios en Home y Contacto. Formato: <code className="text-[var(--color-lavender)]">09:30–14:00</code>. Deja vacío para marcar ese tramo como cerrado.
                </p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-[100px_1fr_1fr] gap-3 mb-1">
                  <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">Día</span>
                  <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">Mañana</span>
                  <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-widest uppercase">Tarde</span>
                </div>
                {scheduleRows.map((day, i) => (
                  <div key={day.label} className="grid grid-cols-[100px_1fr_1fr] gap-3 items-center">
                    <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
                      {day.label}
                    </span>
                    <input
                      type="text"
                      value={day.morning ?? ''}
                      placeholder="Cerrado"
                      onChange={e => setSlot(i, 'morning', e.target.value)}
                      className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] placeholder:text-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
                    />
                    <input
                      type="text"
                      value={day.afternoon ?? ''}
                      placeholder="Cerrado"
                      onChange={e => setSlot(i, 'afternoon', e.target.value)}
                      className="h-9 px-3 rounded-lg bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-sm font-[var(--font-body)] text-[var(--color-cream)] placeholder:text-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Section 2: Email */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Configuración de email
                </h2>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  Controla cómo llegan y se envían los emails de presupuesto
                </p>
              </div>

              <Field
                label="Email donde recibes las solicitudes"
                type="email"
                required
                placeholder="tu@email.com"
                helpText="Aquí llegan los avisos cuando un cliente envía una solicitud de presupuesto."
                value={v('quote_destination_email')}
                onChange={e => set('quote_destination_email', (e.target as HTMLInputElement).value)}
              />

              <Field
                label="Email de respuesta al cliente (Reply-To)"
                type="email"
                placeholder="info@dcbikescantabria.es"
                helpText="Cuando respondas a un cliente desde el panel, este email aparece como remitente de respuesta. El cliente podrá responder directamente aquí."
                value={v('reply_from_email')}
                onChange={e => set('reply_from_email', (e.target as HTMLInputElement).value)}
              />
            </section>

            {/* Section 3: Social */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                Redes sociales
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Instagram"
                  type="url"
                  placeholder="https://instagram.com/..."
                  value={v('social_instagram')}
                  onChange={e => set('social_instagram', (e.target as HTMLInputElement).value)}
                />
                <Field
                  label="Facebook"
                  type="url"
                  placeholder="https://facebook.com/..."
                  value={v('social_facebook')}
                  onChange={e => set('social_facebook', (e.target as HTMLInputElement).value)}
                />
              </div>
            </section>

            {/* Section 4: Datos legales (aparecen en /aviso-legal) */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <div>
                <h2 className="text-base font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
                  Datos legales
                </h2>
                <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)] mt-0.5">
                  Estos datos aparecen en la página de Aviso Legal. Mientras estén vacíos se muestra "pendiente".
                  El teléfono y la dirección se cogen automáticamente de la sección "Contacto y ubicación".
                </p>
              </div>

              <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
                El NIF/CIF se configura en la sección{' '}
                <strong className="text-[var(--color-cream-dim)]">Facturación</strong>{' '}
                (clave <code className="text-[var(--color-cream-dim)]">legal_company_cif</code>) para
                evitar duplicación. Aquí solo se gestiona la forma jurídica y la inscripción registral.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Forma jurídica"
                  placeholder="Ej: Autónomo / S.L. / S.A."
                  helpText="Tipo de actividad económica. Para autónomos, escribe 'Empresario individual (autónomo)'."
                  value={v('legal_forma_juridica')}
                  onChange={e => set('legal_forma_juridica', (e.target as HTMLInputElement).value)}
                />
              </div>

              <Field
                label="Inscripción registral"
                placeholder="Ej: Registro Mercantil de Cantabria, Tomo X, Folio Y, Hoja S-Z"
                helpText="Solo si eres sociedad mercantil (S.L./S.A.). Si eres autónomo, escribe 'No aplica'."
                value={v('legal_inscripcion')}
                onChange={e => set('legal_inscripcion', (e.target as HTMLInputElement).value)}
              />
            </section>

            {/* Save button (secciones generales) */}
            <div className="flex justify-end">
              <Button variant="primary" onClick={handleSave} loading={saving}>
                Guardar configuración
              </Button>
            </div>

            {/* ─────────────────────────────────────────────────────────── */}
            {/* Fase J — Nuevas secciones                                    */}
            {/* ─────────────────────────────────────────────────────────── */}

            {/* Section: E-commerce */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <SectionHeader
                icon={ShoppingCart}
                title="E-commerce"
                subtitle="Reglas del carrito y pedidos: envío, plazos y notificaciones."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Coste de envío (€)"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={ecommerceValues.shipping_flat_rate_euros}
                  onChange={e =>
                    setEcommerceValues(prev => ({
                      ...prev,
                      shipping_flat_rate_euros: (e.target as HTMLInputElement).value,
                    }))
                  }
                  error={ecommerceErrors.shipping_flat_rate_euros}
                  helpText="Tarifa plana aplicada a envíos a domicilio (península). Recogida en tienda siempre es gratis."
                />
                <Field
                  label="Umbral envío gratis (€)"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={ecommerceValues.shipping_free_threshold_euros}
                  onChange={e =>
                    setEcommerceValues(prev => ({
                      ...prev,
                      shipping_free_threshold_euros: (e.target as HTMLInputElement).value,
                    }))
                  }
                  error={ecommerceErrors.shipping_free_threshold_euros}
                  helpText="Si el pedido supera este importe, el envío es gratis."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Auto-cancelar pedidos no aceptados (horas)"
                  type="number"
                  min="1"
                  max="144"
                  required
                  value={ecommerceValues.order_auto_cancel_hours}
                  onChange={e =>
                    setEcommerceValues(prev => ({
                      ...prev,
                      order_auto_cancel_hours: (e.target as HTMLInputElement).value,
                    }))
                  }
                  error={ecommerceErrors.order_auto_cancel_hours}
                  helpText="Si no aceptas el pedido en este plazo, se libera la reserva. Máximo 144 h (6 días) por límite Redsys."
                />
                <Field
                  label="Plazo máximo para recoger en tienda (días)"
                  type="number"
                  min="1"
                  max="60"
                  required
                  value={ecommerceValues.pickup_deadline_days}
                  onChange={e =>
                    setEcommerceValues(prev => ({
                      ...prev,
                      pickup_deadline_days: (e.target as HTMLInputElement).value,
                    }))
                  }
                  error={ecommerceErrors.pickup_deadline_days}
                  helpText="Días que el cliente tiene para recoger su pedido en tienda."
                />
              </div>

              <Field
                label="Emails que reciben notificación de nuevos pedidos"
                type="text"
                placeholder="admin@dcbikescantabria.es, ventas@dcbikescantabria.es"
                value={ecommerceValues.order_notification_emails}
                onChange={e =>
                  setEcommerceValues(prev => ({
                    ...prev,
                    order_notification_emails: (e.target as HTMLInputElement).value,
                  }))
                }
                error={ecommerceErrors.order_notification_emails}
                helpText="Lista separada por comas. Estas direcciones recibirán un aviso cada vez que llegue un pedido pendiente de aceptar."
              />

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  onClick={handleSaveEcommerce}
                  loading={savingEcommerce}
                >
                  Guardar e-commerce
                </Button>
              </div>
            </section>

            {/* Section: Facturación */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <SectionHeader
                icon={FileText}
                title="Facturación"
                subtitle="Datos del emisor que aparecerán en cada factura y prefijos de numeración."
              />

              <div className="rounded-lg border border-[var(--color-card-hover)] bg-[var(--color-ink)]/40 px-3 py-2.5 flex gap-2 items-start">
                <Info size={14} className="text-[var(--color-lavender)] mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-xs text-[var(--color-mid)] leading-relaxed">
                  Estos datos aparecerán en cada factura emitida. Cambiarlos{' '}
                  <strong className="text-[var(--color-cream-dim)]">NO modifica facturas pasadas</strong>{' '}
                  — la facturación legal se preserva con un snapshot del momento de emisión.
                </p>
              </div>

              <Field
                label="Razón social"
                required
                placeholder="DC Bikes Cantabria, S.L."
                value={invoiceValues.legal_company_name}
                onChange={e =>
                  setInvoiceValues(prev => ({
                    ...prev,
                    legal_company_name: (e.target as HTMLInputElement).value,
                  }))
                }
                error={invoiceErrors.legal_company_name}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="CIF / NIF"
                  required
                  placeholder="B12345678 ó 12345678X"
                  value={invoiceValues.legal_company_cif}
                  onChange={e =>
                    setInvoiceValues(prev => ({
                      ...prev,
                      legal_company_cif: (e.target as HTMLInputElement).value.toUpperCase(),
                    }))
                  }
                  error={invoiceErrors.legal_company_cif}
                  helpText="CIF empresa (B12345678) o NIF autónomo (12345678X)."
                />
                <Field
                  label="IVA por defecto (%)"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  required
                  value={invoiceValues.tax_rate_default}
                  onChange={e =>
                    setInvoiceValues(prev => ({
                      ...prev,
                      tax_rate_default: (e.target as HTMLInputElement).value,
                    }))
                  }
                  error={invoiceErrors.tax_rate_default}
                  helpText="21 % en España (tipo general)."
                />
              </div>

              <Field
                label="Dirección fiscal"
                as="textarea"
                rows={2}
                required
                placeholder="Calle La Cantábrica, Bloque 2N, 1º BAJO, 39610 El Astillero, Cantabria"
                value={invoiceValues.legal_company_address}
                onChange={e =>
                  setInvoiceValues(prev => ({
                    ...prev,
                    legal_company_address: (e.target as HTMLInputElement).value,
                  }))
                }
                error={invoiceErrors.legal_company_address}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label="Prefijo número factura"
                  required
                  placeholder="FAC"
                  value={invoiceValues.invoice_series_prefix}
                  onChange={e =>
                    setInvoiceValues(prev => ({
                      ...prev,
                      invoice_series_prefix: (e.target as HTMLInputElement).value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, ''),
                    }))
                  }
                  error={invoiceErrors.invoice_series_prefix}
                  helpText="Ejemplo: FAC → FAC-2026-0001"
                />
                <Field
                  label="Prefijo número pedido"
                  required
                  placeholder="ORD"
                  value={invoiceValues.order_series_prefix}
                  onChange={e =>
                    setInvoiceValues(prev => ({
                      ...prev,
                      order_series_prefix: (e.target as HTMLInputElement).value
                        .toUpperCase()
                        .replace(/[^A-Z]/g, ''),
                    }))
                  }
                  error={invoiceErrors.order_series_prefix}
                  helpText="Ejemplo: ORD → ORD-2026-0001"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  onClick={handleSaveInvoice}
                  loading={savingInvoice}
                >
                  Guardar facturación
                </Button>
              </div>
            </section>

            {/* Section: Pasarela de pago Redsys */}
            <section className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl p-6 space-y-5">
              <SectionHeader
                icon={CreditCard}
                title="Pasarela de pago Redsys"
                subtitle="Entorno y nombre comercio mostrado al cliente en el TPV."
              />

              {/* Selector entorno */}
              <div className="flex flex-col gap-2">
                <span className="text-sm font-[var(--font-cond)] font-medium text-[var(--color-cream-dim)] tracking-wide">
                  Entorno
                  <span className="text-[var(--color-brand-red)] ml-0.5">*</span>
                </span>
                <div className="inline-flex rounded-lg border border-[var(--color-card-hover)] bg-[var(--color-ink)] p-1 w-fit">
                  {(
                    [
                      { value: 'test' as const, label: 'Test' },
                      { value: 'prod' as const, label: 'Producción' },
                    ] as const
                  ).map(opt => {
                    const selected = paymentValues.redsys_environment === opt.value
                    const isProd = opt.value === 'prod'
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() =>
                          setPaymentValues(prev => ({
                            ...prev,
                            redsys_environment: opt.value,
                          }))
                        }
                        aria-pressed={selected}
                        className={`px-4 py-1.5 rounded-md text-sm font-[var(--font-cond)] tracking-wide transition-colors ${
                          selected
                            ? isProd
                              ? 'bg-[var(--color-brand-red)] text-[var(--color-cream)]'
                              : 'bg-[var(--color-lavender)] text-[var(--color-ink)]'
                            : 'text-[var(--color-mid)] hover:text-[var(--color-cream)]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>

                {/* Badge contextual del entorno seleccionado */}
                {paymentValues.redsys_environment === 'test' ? (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-[var(--font-cond)] w-fit">
                    <Info size={14} aria-hidden="true" />
                    Modo pruebas — no se procesan pagos reales
                  </div>
                ) : (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--color-brand-red)]/15 border border-[var(--color-brand-red)]/40 text-[var(--color-brand-red)] text-xs font-[var(--font-cond)] font-semibold w-fit">
                    <ShieldAlert size={14} aria-hidden="true" />
                    Modo producción — los pagos son REALES
                  </div>
                )}
                {paymentErrors.redsys_environment && (
                  <p className="text-xs text-[var(--color-brand-red)] font-[var(--font-body)] mt-1">
                    {paymentErrors.redsys_environment}
                  </p>
                )}
              </div>

              <Field
                label="Nombre del comercio mostrado en TPV"
                required
                placeholder="DC Bikes Cantabria"
                maxLength={60}
                value={paymentValues.redsys_merchant_name}
                onChange={e =>
                  setPaymentValues(prev => ({
                    ...prev,
                    redsys_merchant_name: (e.target as HTMLInputElement).value,
                  }))
                }
                error={paymentErrors.redsys_merchant_name}
                helpText="Este texto aparece en la pantalla de pago Redsys y en el extracto bancario del cliente. Máx. 60 caracteres."
              />

              {/* Banner credenciales Vault */}
              <div className="rounded-lg border border-[var(--color-card-hover)] bg-[var(--color-ink)]/60 p-4 flex gap-3 items-start">
                <ShieldAlert
                  size={18}
                  className="text-[var(--color-lavender)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <div className="text-xs text-[var(--color-cream-dim)] leading-relaxed space-y-1">
                  <p>
                    <span aria-hidden="true">🔒 </span>
                    <strong className="text-[var(--color-cream)]">
                      Las credenciales sensibles
                    </strong>{' '}
                    (FUC, Terminal, Clave SHA-256) se gestionan vía{' '}
                    <strong className="text-[var(--color-cream)]">Supabase Vault</strong>{' '}
                    del proyecto, NO desde aquí.
                  </p>
                  <p className="text-[var(--color-mid)]">
                    Para cambiarlas, contacta con el administrador técnico del
                    proyecto. Solo las Edge Functions con service_role pueden
                    leerlas.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  onClick={handleSavePayment}
                  loading={savingPayment}
                >
                  Guardar pasarela de pago
                </Button>
              </div>
            </section>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}
