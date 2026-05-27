// supabase/functions/data-retention-cron/index.ts
//
// Sprint 5.2 + Auditoría v2 (N6, N13, N15, N16) — RGPD art. 5.1.e (limitación
// del plazo de conservación). Ejecutado diariamente por pg_cron
// (ver migración 0012_data_retention_cron.sql).
//
// Acciones (ejecutadas en paralelo con Promise.allSettled):
//   1. `customer_sessions` cuya `expires_at` < hoy-30d → DELETE.
//   2. `payments_log.raw_payload` con created_at < hoy-6a → anonimizar payload
//      (registro contable se conserva).
//   3. `quote_requests` con created_at < hoy-13m → DELETE.
//      Nota: el esquema actual no tiene `replied_at`; usamos antigüedad
//      absoluta. Si en el futuro se añade ese campo, restringir a las
//      resueltas (replied_at not null).
//   4. `product_views` con viewed_at < hoy-24m → DELETE.
//   5. `search_queries` con searched_at < hoy-24m → DELETE.
//   6. `orders` con created_at < hoy-6a y `anonymized_at is null` →
//      anonimizar PII (conservación contable AEAT impide borrar).
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

const DAY_MS = 24 * 60 * 60 * 1000
const SIX_YEARS_MS = 6 * 365 * DAY_MS
const THIRTEEN_MONTHS_MS = Math.round(13 * 30.4375 * DAY_MS)
const TWENTYFOUR_MONTHS_MS = Math.round(24 * 30.4375 * DAY_MS)
const THIRTY_DAYS_MS = 30 * DAY_MS

interface ActionResult {
  name: string
  count: number
  error?: string
}

function authorize(req: Request): { ok: boolean; reason?: string } {
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  if (!expected) {
    return { ok: false, reason: 'CRON_SECRET env var no configurada' }
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token || token !== expected) {
    return { ok: false, reason: 'invalid bearer' }
  }
  return { ok: true }
}

/* ─── 1. customer_sessions expiradas >30d → DELETE ────────────── */
async function purgeExpiredSessions(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()
  const { data, error } = await supabase
    .from('customer_sessions')
    .delete()
    .lt('expires_at', cutoff)
    .select('id')
  if (error) return { name: 'sessions_deleted', count: 0, error: error.message }
  return { name: 'sessions_deleted', count: data?.length ?? 0 }
}

/* ─── 2. payments_log.raw_payload >6 años → ANONIMIZAR ────────── */
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

/* ─── 3. quote_requests >13 meses → DELETE ────────────────────── */
async function purgeOldQuotes(supabase: SupabaseClient): Promise<ActionResult> {
  const cutoff = new Date(Date.now() - THIRTEEN_MONTHS_MS).toISOString()
  const { data, error } = await supabase
    .from('quote_requests')
    .delete()
    .lt('created_at', cutoff)
    .select('id')
  if (error) return { name: 'quotes_deleted', count: 0, error: error.message }
  return { name: 'quotes_deleted', count: data?.length ?? 0 }
}

/* ─── 4. product_views >24 meses → DELETE ─────────────────────── */
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

/* ─── 5. search_queries >24 meses → DELETE ────────────────────── */
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

/* ─── 6. orders >6 años → ANONIMIZAR (no borrar — contable) ──── */
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
  return { name: 'orders_anonymized', count: data?.length ?? 0 }
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

    const settled = await Promise.allSettled([
      purgeExpiredSessions(supabase),
      anonymizePayments(supabase),
      purgeOldQuotes(supabase),
      purgeOldProductViews(supabase),
      purgeOldSearches(supabase),
      anonymizeOldOrders(supabase),
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
      `[${ts()}] ✓ data-retention-cron · ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' · ')} · errors=${errors.length}`,
    )

    return jsonOk({
      ok: errors.length === 0,
      counts,
      errors,
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ data-retention-cron fatal:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
