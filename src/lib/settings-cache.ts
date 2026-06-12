import { supabase } from '@/lib/supabase'

/**
 * Caché compartida a NIVEL DE MÓDULO para la tabla `settings` (PERF-M1).
 *
 * Antes, cada hook (useShopSettings, useLegalIdentity, useStoreAddress,
 * useSchedule) lanzaba su PROPIA query a `settings` en cada montaje: la Home
 * disparaba 3 queries idénticas y el Checkout 4. Ahora todos consumen una
 * única promesa compartida que hace `select('key,value')` UNA vez por TTL.
 *
 * Notas de diseño:
 * - No usamos React Context a propósito: este módulo no toca App.tsx y
 *   funciona igual desde cualquier hook/componente.
 * - La query NO filtra por key: la RLS de `settings` ya restringe al anon a
 *   la whitelist pública (legal_*, store_*, shipping_*_cents, tax_rate_default,
 *   pickup_deadline_days, order_auto_cancel_hours, social_*, maps_link,
 *   store_schedule). Las keys fuera de la whitelist simplemente no vienen y
 *   cada hook aplica su default, igual que antes.
 * - Se cachea la PROMESA (no el resultado) para que montajes simultáneos
 *   compartan el mismo round-trip aunque aún no haya resuelto.
 * - Si la query falla, se invalida la caché para reintentar en el siguiente
 *   montaje (no se cachean errores durante 60s).
 */

const TTL_MS = 60_000

interface CacheEntry {
  promise: Promise<Map<string, unknown>>
  fetchedAt: number
}

let cache: CacheEntry | null = null

async function fetchSettings(): Promise<Map<string, unknown>> {
  const { data, error } = await supabase.from('settings').select('key,value')
  if (error) throw new Error(error.message)

  const map = new Map<string, unknown>()
  for (const row of (data as { key: string; value: unknown }[] | null) ?? []) {
    map.set(row.key, row.value)
  }
  return map
}

/**
 * Devuelve el Map key → value (raw jsonb) de `settings`, compartido entre
 * todos los consumidores. Como máximo un round-trip cada 60s.
 */
export function getSettings(): Promise<Map<string, unknown>> {
  const now = Date.now()
  if (cache && now - cache.fetchedAt < TTL_MS) {
    return cache.promise
  }

  const promise = fetchSettings()
  const entry: CacheEntry = { promise, fetchedAt: now }
  cache = entry

  // Si falla, invalidamos para que el siguiente montaje reintente. Cada
  // consumidor recibe igualmente el rechazo y aplica sus defaults.
  promise.catch(() => {
    if (cache === entry) cache = null
  })

  return promise
}

/**
 * Parseo ÚNICO de un valor jsonb de `settings` (antes había 3 copias del
 * mismo parseo repartidas por los hooks). El valor puede venir ya parseado
 * (jsonb nativo) o como string JSON; los strings no-JSON se devuelven tal
 * cual (valores literales antiguos).
 */
export function parseSettingValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** Convierte un valor de settings a número finito, con fallback. */
export function settingToNumber(raw: unknown, fallback: number): number {
  const parsed = parseSettingValue(raw)
  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed
  if (typeof parsed === 'string' && parsed.trim() !== '') {
    const n = Number(parsed)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

/** Convierte un valor de settings a string, con fallback. */
export function settingToString(raw: unknown, fallback: string): string {
  const parsed = parseSettingValue(raw)
  if (typeof parsed === 'string') return parsed
  if (parsed == null) return fallback
  return String(parsed)
}
