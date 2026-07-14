// supabase/functions/data-retention-cron/index.ts
//
// Sprint 5.2 + Auditoría v2 (N6, N13, N15, N16) + Auditoría legal V5
// (Q-11, Q-12, Q-14) — RGPD art. 5.1.e (limitación del plazo de
// conservación). Ejecutado diariamente por pg_cron.
//
// Acciones (ejecutadas en paralelo con Promise.allSettled):
//   1. `customer_sessions` con expires_at < hoy-30d y purged_at IS NULL →
//      soft-purge: UPDATE email/token_hash/ip_address/user_agent a valores
//      anonimizados + purged_at = now() (Q-12, patrón soft-purge).
//   2. `customer_sessions` con expires_at < hoy-90d → DELETE físico
//      (las 30..90d ya están anonimizadas; se conserva el id histórico
//      durante 60 días extra para trazabilidad mínima) (Q-12).
//   3. `payments_log.raw_payload` con created_at < hoy-6a → anonimizar
//      payload (registro contable se conserva).
//   4a. `quote_requests` revocadas hace >7d → RPC purge_revoked_quote_requests()
//      (art. 17.1.b). Purga la PII Y BORRA el hilo de quote_messages.
//   4b. `quote_requests` con created_at < hoy-13m → RPC
//      anonymize_old_quote_messages() (Q-14 + A-1). Idem.
//      Las dos viven en SQL (migración 0076) para que el borrado del hilo y la
//      anonimización de la consulta vayan en la MISMA transacción. Antes se
//      hacían aquí con UPDATEs que (a) reventaban con 23514 por el CHECK del
//      formato del email y (b) no tocaban quote_messages: la retención de
//      consultas no funcionaba por ningún lado.
//   5. `product_views` con viewed_at < hoy-24m → DELETE.
//   6. `search_queries` con searched_at < hoy-24m → DELETE.
//   7. `orders` con created_at < hoy-6a y `anonymized_at is null` →
//      anonimizar PII (conservación contable AEAT impide borrar).
//   8a. `stock_alerts` con revoked_at < hoy-7d y purged_at IS NULL →
//      purga por revocación de consentimiento (art. 17.1.b RGPD).
//   8b. `stock_alerts` con created_at < hoy-13m y purged_at IS NULL →
//      anonimizar email + purged_at = now() (art. 5.1.e RGPD).
//
// Concurrencia:
//   Antes de cualquier mutación se invoca RPC `try_data_retention_lock()`
//   (Q-11). Si devuelve false, otra ejecución sigue en marcha y abortamos
//   con 200 OK { skipped: true }.
//
// Auth:
//   - Header `Authorization: Bearer <CRON_SECRET>` obligatorio.
//   - `CRON_SECRET` configurada como env var de la edge function y debe
//     coincidir con el valor inyectado por pg_cron en el `net.http_post`.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { CORS_HEADERS, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { timingSafeEq } from '../_shared/security.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const SIX_YEARS_MS = 6 * 365 * DAY_MS
const THIRTEEN_MONTHS_MS = Math.round(13 * 30.4375 * DAY_MS)
const TWENTYFOUR_MONTHS_MS = Math.round(24 * 30.4375 * DAY_MS)
const THIRTY_DAYS_MS = 30 * DAY_MS
const SEVEN_DAYS_MS = 7 * DAY_MS
const NINETY_DAYS_MS = 90 * DAY_MS

interface ActionResult {
  name: string
  count: number
  error?: string
}

function authorize(req: Request): { ok: boolean; reason?: string } {
  // pg_cron envía `Authorization: Bearer <data_retention_cron_secret>` leyendo
  // ese secreto de Vault (ver 0021_cron_vault_secrets.sql). En las Edge
  // Functions ese mismo valor está en la variable DATA_RETENTION_CRON_SECRET.
  // Antes esta función comparaba contra CRON_SECRET, un secreto DISTINTO →
  // el Bearer nunca cuadraba y la purga RGPD diaria devolvía 401 sin ejecutar.
  // Comparación constante en tiempo (timingSafeEq) como el resto de crons.
  const expected = Deno.env.get('DATA_RETENTION_CRON_SECRET') ?? ''
  if (!expected) {
    return { ok: false, reason: 'DATA_RETENTION_CRON_SECRET env var no configurada' }
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!timingSafeEq(token, expected)) {
    return { ok: false, reason: 'invalid bearer' }
  }
  return { ok: true }
}

/* ─── 1. customer_sessions expiradas >30d → SOFT-PURGE ────────── */
async function softPurgeExpiredSessions(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
  const { data, error } = await supabase
    .from('customer_sessions')
    .update({
      email: 'anonimizado@anonimizado.local',
      token_hash: '',
      ip_address: null,
      user_agent: null,
      purged_at: new Date().toISOString(),
    })
    .lt('expires_at', cutoff)
    .is('purged_at', null)
    .select('id')
  if (error) return { name: 'sessions_soft_purged', count: 0, error: error.message }
  return { name: 'sessions_soft_purged', count: data?.length ?? 0 }
}

/* ─── 2. customer_sessions expiradas >90d → DELETE físico ─────── */
async function hardDeleteOldSessions(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - NINETY_DAYS_MS).toISOString()
  const { data, error } = await supabase
    .from('customer_sessions')
    .delete()
    .lt('expires_at', cutoff)
    .select('id')
  if (error) return { name: 'sessions_deleted', count: 0, error: error.message }
  return { name: 'sessions_deleted', count: data?.length ?? 0 }
}

/* ─── 3. payments_log.raw_payload >6 años → ANONIMIZAR ────────── */
async function anonymizePayments(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - SIX_YEARS_MS).toISOString()
  const { data, error } = await supabase
    .from('payments_log')
    .update({
      raw_payload: { anonymized: true, anonymized_at: new Date().toISOString() },
    })
    .lt('created_at', cutoff)
    .not('raw_payload', 'cs', '{"anonymized":true}')
    .select('id')
  if (error) return { name: 'payments_anonymized', count: 0, error: error.message }
  return { name: 'payments_anonymized', count: data?.length ?? 0 }
}

/* ─── 4a/4b. quote_requests → PURGAR (por revocación y por antigüedad) ─────
 *
 * ESTO ESTABA ROTO POR PARTIDA DOBLE, y no se notaba porque todavía no había
 * ninguna consulta que purgar (0 de >13 meses, 0 revocadas):
 *
 *   1. REVENTABA SIEMPRE. Los dos UPDATEs escribían `email: '[purgado]'`, y la
 *      tabla tiene el CHECK `quote_requests_email_format_check`
 *      (email ~ '^[^…@]+@[^…@]+\.[^…@]+$') desde 0048. '[purgado]' no es un
 *      email → 23514. Y el error se tragaba en `{ name, count: 0, error }` sin
 *      lanzar: la purga fallaba EN SILENCIO y el cron seguía devolviendo 200.
 *
 *   2. NO TOCABA quote_messages. El hilo —que desde 0073/0075 tiene una copia
 *      literal de la PII más rica del sistema: nombre, teléfono, dirección, lo
 *      que el cliente cuente— se quedaba vivo para siempre. Incumplimiento del
 *      art. 5.1.e en un proyecto que pasó auditoría legal.
 *
 * Ahora las dos purgas viven en SQL (migración 0076) y esto solo las invoca:
 *   · Borran el hilo Y anonimizan la consulta EN LA MISMA TRANSACCIÓN. Antes,
 *     con dos pasos desde aquí, un fallo entre medias dejaba la consulta
 *     anonimizada y el hilo con toda la PII dentro — lo peor de los dos mundos.
 *   · Una sola implementación. Antes había dos mecanismos que se ignoraban
 *     mutuamente y miraban columnas distintas (purged_at aquí, anonymized_at en
 *     la función SQL, que además NO LA LLAMABA NADIE: era código muerto).
 *   · El centinela del email pasa el CHECK ('purgado@anonimizado.invalid').
 *
 * Los plazos (7 días tras revocar / 13 meses) viven ahora dentro de las
 * funciones SQL; las constantes de aquí se conservan para el resto de acciones.
 */
async function purgeRevokedQuotes(supabase: SupabaseClient): Promise<ActionResult> {
  const { data, error } = await supabase.rpc('purge_revoked_quote_requests')
  if (error) return { name: 'quotes_revoked_purged', count: 0, error: error.message }
  return { name: 'quotes_revoked_purged', count: (data as number | null) ?? 0 }
}

async function purgeOldQuotes(supabase: SupabaseClient): Promise<ActionResult> {
  const { data, error } = await supabase.rpc('anonymize_old_quote_messages')
  if (error) return { name: 'quotes_aged_purged', count: 0, error: error.message }
  return { name: 'quotes_aged_purged', count: (data as number | null) ?? 0 }
}

/* ─── 5. product_views >24 meses → DELETE ─────────────────────── */
async function purgeOldProductViews(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - TWENTYFOUR_MONTHS_MS).toISOString()
  // El esquema usa `viewed_at` (no created_at) en product_views.
  const { data, error } = await supabase
    .from('product_views')
    .delete()
    .lt('viewed_at', cutoff)
    .select('id')
  if (error) return { name: 'product_views_deleted', count: 0, error: error.message }
  return { name: 'product_views_deleted', count: data?.length ?? 0 }
}

/* ─── 6. search_queries >24 meses → DELETE ────────────────────── */
async function purgeOldSearches(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - TWENTYFOUR_MONTHS_MS).toISOString()
  // El esquema usa `searched_at` (no created_at) en search_queries.
  const { data, error } = await supabase
    .from('search_queries')
    .delete()
    .lt('searched_at', cutoff)
    .select('id')
  if (error) return { name: 'searches_deleted', count: 0, error: error.message }
  return { name: 'searches_deleted', count: data?.length ?? 0 }
}

/* ─── 8a. stock_alerts revocadas >7d → PURGAR email ───────────── */
async function purgeRevokedStockAlerts(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()
  const { data, error } = await supabase
    .from('stock_alerts')
    .update({
      email: '[purgado]',
      purged_at: new Date().toISOString(),
    })
    .lt('revoked_at', cutoff)
    .is('purged_at', null)
    .select('id')
  if (error) return { name: 'stock_alerts_revoked_purged', count: 0, error: error.message }
  return { name: 'stock_alerts_revoked_purged', count: data?.length ?? 0 }
}

/* ─── 8b. stock_alerts >13 meses → ANONIMIZAR email ───────────── */
async function purgeOldStockAlerts(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - THIRTEEN_MONTHS_MS).toISOString()
  const { data, error } = await supabase
    .from('stock_alerts')
    .update({
      email: '[purgado]',
      purged_at: new Date().toISOString(),
    })
    .lt('created_at', cutoff)
    .is('purged_at', null)
    .select('id')
  if (error) return { name: 'stock_alerts_aged_purged', count: 0, error: error.message }
  return { name: 'stock_alerts_aged_purged', count: data?.length ?? 0 }
}

/* ─── 7. orders >6 años → ANONIMIZAR (no borrar — contable) ────
 * B-23: además de la PII del propio pedido, anonimiza las tablas hijas que
 * pueden contener datos personales en texto libre:
 *   • order_status_history.reason  → '[anonimizado]'
 *   • order_items.product_name     → '[anonimizado]'
 * Solo sobre los pedidos que se acaban de anonimizar en esta ejecución. */
async function anonymizeOldOrders(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - SIX_YEARS_MS).toISOString()
  const { data, error } = await supabase
    .from('orders')
    .update({
      customer_email: 'anonimizado@anonimizado.local',
      customer_phone: null,
      customer_first_name: 'Anonimizado',
      customer_last_name: '',
      shipping_address: null,
      shipping_city: null,
      shipping_postal_code: null,
      shipping_province: null,
      shipping_notes: null,
      consent_ip: null,
      consent_user_agent: null,
      anonymized_at: new Date().toISOString(),
    })
    .lt('created_at', cutoff)
    .is('anonymized_at', null)
    .select('id')
  if (error) return { name: 'orders_anonymized', count: 0, error: error.message }

  const orderIds = (data ?? []).map((r) => (r as { id: string }).id)
  if (orderIds.length > 0) {
    const { error: histErr } = await supabase
      .from('order_status_history')
      .update({ reason: '[anonimizado]' })
      .in('order_id', orderIds)
      .not('reason', 'is', null)
    if (histErr) {
      console.warn(`[B-23] order_status_history.reason anonymize falló: ${histErr.message}`)
    }

    const { error: itemErr } = await supabase
      .from('order_items')
      .update({ product_name: '[anonimizado]' })
      .in('order_id', orderIds)
    if (itemErr) {
      console.warn(`[B-23] order_items.product_name anonymize falló: ${itemErr.message}`)
    }
  }

  return { name: 'orders_anonymized', count: orderIds.length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = authorize(req)
    if (!auth.ok) {
      console.warn(`[${ts()}] data-retention-cron unauthorized:`, auth.reason)
      return jsonError('unauthorized', 401, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Q-11: advisory lock — si otra ejecución sigue en marcha, abortar.
    const { data: lockData, error: lockError } = await supabase.rpc('try_data_retention_lock')
    if (lockError) {
      console.error(`[${ts()}] data-retention-cron lock rpc error:`, lockError.message)
      return jsonError('lock rpc failed', 500, req)
    }
    if (!lockData) {
      console.warn(`[${ts()}] data-retention-cron skipped: previous run still in progress`)
      return jsonOk({ skipped: 'previous run still in progress' }, req)
    }

    const settled = await Promise.allSettled([
      softPurgeExpiredSessions(supabase),
      hardDeleteOldSessions(supabase),
      anonymizePayments(supabase),
      purgeRevokedQuotes(supabase),
      purgeOldQuotes(supabase),
      purgeOldProductViews(supabase),
      purgeOldSearches(supabase),
      anonymizeOldOrders(supabase),
      // Acciones 8a y 8b: stock_alerts (RGPD art. 5.1.e + 17.1.b)
      purgeRevokedStockAlerts(supabase),
      purgeOldStockAlerts(supabase),
    ])

    const counts: Record<string, number> = {}
    const errors: string[] = []
    for (const s of settled) {
      if (s.status === 'fulfilled') {
        counts[s.value.name] = s.value.count
        if (s.value.error) errors.push(`${s.value.name}: ${s.value.error}`)
      } else {
        errors.push(`unexpected: ${String(s.reason)}`)
      }
    }

    console.log(
      `[${ts()}] OK data-retention-cron · ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')} · errors=${errors.length}`,
    )

    return jsonOk({
      ok: errors.length === 0,
      counts,
      errors,
    }, req)
  } catch (err) {
    console.error(`[${ts()}] FAIL data-retention-cron fatal:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
