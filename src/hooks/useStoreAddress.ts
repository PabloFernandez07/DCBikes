import { useEffect, useState } from 'react'
import { getSettings, parseSettingValue } from '@/lib/settings-cache'

/**
 * Dirección postal canónica del titular (fuente de verdad única).
 * Sincronizado con la migración 0017_settings_store_address_seed.sql.
 *
 * Sirve como fallback cuando la lectura desde `settings.store_address`
 * todavía no ha resuelto o si la fila no existe.
 */
export const STORE_ADDRESS_FALLBACK =
  'Calle La Cantábrica, Bloque 2N, 1º BAJO, 39610 El Astillero, Cantabria'

/**
 * Hook que lee `settings.store_address` y devuelve la dirección postal
 * oficial del titular. Devuelve el fallback canónico mientras carga o si
 * la key no existe.
 *
 * PERF-M1: consume la caché compartida de `settings`
 * (src/lib/settings-cache.ts) en vez de lanzar su propia query.
 */
export function useStoreAddress(): string {
  const [address, setAddress] = useState<string>(STORE_ADDRESS_FALLBACK)

  useEffect(() => {
    let cancelled = false

    getSettings()
      .then(byKey => {
        if (cancelled || !byKey.has('store_address')) return
        const parsed = parseSettingValue(byKey.get('store_address'))
        const value = typeof parsed === 'string' ? parsed.trim() : ''
        if (value) setAddress(value)
      })
      .catch(() => {
        // Error de red/RLS: se mantiene el fallback canónico.
      })

    return () => {
      cancelled = true
    }
  }, [])

  return address
}
