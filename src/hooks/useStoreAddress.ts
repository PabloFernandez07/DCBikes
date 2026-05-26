import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

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
 * Hook que lee `settings.store_address` desde Supabase y devuelve la
 * dirección postal oficial del titular. Devuelve el fallback canónico
 * mientras carga o si la key no existe.
 */
export function useStoreAddress(): string {
  const [address, setAddress] = useState<string>(STORE_ADDRESS_FALLBACK)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'store_address')
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        const raw = data.value
        const parsed = typeof raw === 'string' ? safeParse(raw) : raw
        const value = typeof parsed === 'string' ? parsed.trim() : ''
        if (value) setAddress(value)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return address
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
