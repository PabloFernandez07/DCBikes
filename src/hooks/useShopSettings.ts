import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Hook que lee las settings del carrito (Fase J) y devuelve un objeto
 * tipado con defaults. Si una key no existe en BD (porque la migración seed
 * todavía no se aplicó o el admin la borró), se usa el default sensato.
 *
 * Uso:
 *   const { settings, loading, error } = useShopSettings()
 *   const shippingCents = settings.shippingFlatRateCents
 *
 * Las keys raw en BD se parsean desde JSONB. Strings vienen como `"text"`,
 * números como `690`. Tolerante a ambos formatos por seguridad.
 */

export interface ShopSettings {
  shippingFlatRateCents: number
  shippingFreeThresholdCents: number
  orderAutoCancelHours: number
  pickupDeadlineDays: number
  taxRateDefault: number
  legalCompanyName: string
  legalCompanyCif: string
  legalCompanyAddress: string
  invoiceSeriesPrefix: string
  orderSeriesPrefix: string
}

export const SHOP_SETTINGS_DEFAULTS: ShopSettings = {
  shippingFlatRateCents: 690,
  shippingFreeThresholdCents: 5000,
  orderAutoCancelHours: 48,
  pickupDeadlineDays: 15,
  taxRateDefault: 21,
  legalCompanyName: '',
  legalCompanyCif: '',
  legalCompanyAddress: '',
  invoiceSeriesPrefix: 'FAC',
  orderSeriesPrefix: 'ORD',
}

const SHOP_SETTINGS_KEYS = [
  'shipping_flat_rate_cents',
  'shipping_free_threshold_cents',
  'order_auto_cancel_hours',
  'pickup_deadline_days',
  'tax_rate_default',
  'legal_company_name',
  'legal_company_cif',
  'legal_company_address',
  'invoice_series_prefix',
  'order_series_prefix',
] as const

interface SettingRow {
  key: string
  value: unknown
}

/** Parsea un valor jsonb que puede venir ya parseado o como string JSON. */
function parseJsonValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

function toNumber(raw: unknown, fallback: number): number {
  const parsed = parseJsonValue(raw)
  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed
  if (typeof parsed === 'string' && parsed.trim() !== '') {
    const n = Number(parsed)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function toString(raw: unknown, fallback: string): string {
  const parsed = parseJsonValue(raw)
  if (typeof parsed === 'string') return parsed
  if (parsed == null) return fallback
  return String(parsed)
}

export function useShopSettings(): {
  settings: ShopSettings
  loading: boolean
  error: Error | null
} {
  const [settings, setSettings] = useState<ShopSettings>(SHOP_SETTINGS_DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase
      .from('settings')
      .select('key,value')
      .in('key', SHOP_SETTINGS_KEYS as unknown as string[])
      .then(({ data, error: queryError }) => {
        if (cancelled) return
        if (queryError) {
          setError(new Error(queryError.message))
          setLoading(false)
          return
        }

        const rows = (data as SettingRow[] | null) ?? []
        const byKey = new Map<string, unknown>()
        for (const row of rows) byKey.set(row.key, row.value)

        setSettings({
          shippingFlatRateCents: toNumber(
            byKey.get('shipping_flat_rate_cents'),
            SHOP_SETTINGS_DEFAULTS.shippingFlatRateCents,
          ),
          shippingFreeThresholdCents: toNumber(
            byKey.get('shipping_free_threshold_cents'),
            SHOP_SETTINGS_DEFAULTS.shippingFreeThresholdCents,
          ),
          orderAutoCancelHours: toNumber(
            byKey.get('order_auto_cancel_hours'),
            SHOP_SETTINGS_DEFAULTS.orderAutoCancelHours,
          ),
          pickupDeadlineDays: toNumber(
            byKey.get('pickup_deadline_days'),
            SHOP_SETTINGS_DEFAULTS.pickupDeadlineDays,
          ),
          taxRateDefault: toNumber(
            byKey.get('tax_rate_default'),
            SHOP_SETTINGS_DEFAULTS.taxRateDefault,
          ),
          legalCompanyName: toString(
            byKey.get('legal_company_name'),
            SHOP_SETTINGS_DEFAULTS.legalCompanyName,
          ),
          legalCompanyCif: toString(
            byKey.get('legal_company_cif'),
            SHOP_SETTINGS_DEFAULTS.legalCompanyCif,
          ),
          legalCompanyAddress: toString(
            byKey.get('legal_company_address'),
            SHOP_SETTINGS_DEFAULTS.legalCompanyAddress,
          ),
          invoiceSeriesPrefix: toString(
            byKey.get('invoice_series_prefix'),
            SHOP_SETTINGS_DEFAULTS.invoiceSeriesPrefix,
          ),
          orderSeriesPrefix: toString(
            byKey.get('order_series_prefix'),
            SHOP_SETTINGS_DEFAULTS.orderSeriesPrefix,
          ),
        })
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { settings, loading, error }
}
