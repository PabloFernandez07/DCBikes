import { useEffect, useState } from 'react'
import { getSettings, settingToNumber, settingToString } from '@/lib/settings-cache'

/**
 * Hook que lee las settings del carrito (Fase J) y devuelve un objeto
 * tipado con defaults. Si una key no existe en BD (porque la migración seed
 * todavía no se aplicó o el admin la borró), se usa el default sensato.
 *
 * Uso:
 *   const { settings, loading, error } = useShopSettings()
 *   const shippingCents = settings.shippingFlatRateCents
 *
 * PERF-M1: los datos vienen de la caché compartida de `settings`
 * (src/lib/settings-cache.ts) — una única query para todos los hooks de
 * settings en vez de una por montaje. El parseo JSONB también está unificado
 * allí (settingToNumber / settingToString).
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

    getSettings()
      .then(byKey => {
        if (cancelled) return

        setSettings({
          shippingFlatRateCents: settingToNumber(
            byKey.get('shipping_flat_rate_cents'),
            SHOP_SETTINGS_DEFAULTS.shippingFlatRateCents,
          ),
          shippingFreeThresholdCents: settingToNumber(
            byKey.get('shipping_free_threshold_cents'),
            SHOP_SETTINGS_DEFAULTS.shippingFreeThresholdCents,
          ),
          orderAutoCancelHours: settingToNumber(
            byKey.get('order_auto_cancel_hours'),
            SHOP_SETTINGS_DEFAULTS.orderAutoCancelHours,
          ),
          pickupDeadlineDays: settingToNumber(
            byKey.get('pickup_deadline_days'),
            SHOP_SETTINGS_DEFAULTS.pickupDeadlineDays,
          ),
          taxRateDefault: settingToNumber(
            byKey.get('tax_rate_default'),
            SHOP_SETTINGS_DEFAULTS.taxRateDefault,
          ),
          legalCompanyName: settingToString(
            byKey.get('legal_company_name'),
            SHOP_SETTINGS_DEFAULTS.legalCompanyName,
          ),
          legalCompanyCif: settingToString(
            byKey.get('legal_company_cif'),
            SHOP_SETTINGS_DEFAULTS.legalCompanyCif,
          ),
          legalCompanyAddress: settingToString(
            byKey.get('legal_company_address'),
            SHOP_SETTINGS_DEFAULTS.legalCompanyAddress,
          ),
          invoiceSeriesPrefix: settingToString(
            byKey.get('invoice_series_prefix'),
            SHOP_SETTINGS_DEFAULTS.invoiceSeriesPrefix,
          ),
          orderSeriesPrefix: settingToString(
            byKey.get('order_series_prefix'),
            SHOP_SETTINGS_DEFAULTS.orderSeriesPrefix,
          ),
        })
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e : new Error(String(e)))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { settings, loading, error }
}
