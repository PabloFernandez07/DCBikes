// supabase/functions/data-retention-cron/index.ts
//
// Sprint 5.2 — Cumplimiento RGPD: ejecución diaria de políticas de retención.
//
// Llamado por pg_cron (ver migración 0012_data_retention_cron.sql) una vez al día.
//
// Acciones:
//   1. Borra registros de `customer_sessions` cuyas sesiones expiraron hace
//      más de 30 días (RGPD art. 5.1.e — limitación del plazo de conservación).
//   2. Anonimiza `raw_payload` en `payments_log` con más de 6 años de antigüedad
//      (plazo de conservación contable AEAT/Mercantil). El registro contable
//      se conserva (order_id, response_code, importe…) pero el payload bruto
//      se sustituye por un placeholder.
//
// Auth:
//   - Header `Authorization: Bearer <CRON_SECRET>` obligatorio.
//   - `CRON_SECRET` se configura como env var de la edge function y debe coincidir
//     con el valor inyectado por pg_cron en el `net.http_post`.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { CORS_HEADERS, jsonError, jsonOk } from '../_shared/email-utils.ts'

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405)

    const auth = authorize(req)
    if (!auth.ok) {
      console.warn(`[${ts()}] data-retention-cron unauthorized:`, auth.reason)
      return jsonError('unauthorized', 401)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const errors: string[] = []

    /* ─── 1. Borrar customer_sessions expiradas hace >30 días ─── */
    const sessionCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: deletedSessions, error: sessionsError } = await supabase
      .from('customer_sessions')
      .delete()
      .lt('expires_at', sessionCutoff)
      .select('id')

    if (sessionsError) {
      console.error(`[${ts()}] sessions delete error:`, sessionsError.message)
      errors.push(`sessions: ${sessionsError.message}`)
    }

    /* ─── 2. Anonimizar raw_payload en payments_log con >6 años ─── */
    const sixYearsAgo = new Date(Date.now() - 6 * 365 * 24 * 60 * 60 * 1000).toISOString()
    const { data: anonymized, error: anonymizeError } = await supabase
      .from('payments_log')
      .update({
        raw_payload: { anonymized: true, anonymized_at: new Date().toISOString() },
      })
      .lt('created_at', sixYearsAgo)
      .not('raw_payload', 'cs', '{"anonymized":true}')
      .select('id')

    if (anonymizeError) {
      console.error(`[${ts()}] payments anonymize error:`, anonymizeError.message)
      errors.push(`payments: ${anonymizeError.message}`)
    }

    const deletedCount = deletedSessions?.length ?? 0
    const anonymizedCount = anonymized?.length ?? 0

    console.log(
      `[${ts()}] ✓ data-retention-cron · sessions_deleted=${deletedCount} · payments_anonymized=${anonymizedCount} · errors=${errors.length}`,
    )

    return jsonOk({
      ok: errors.length === 0,
      deleted_sessions: deletedCount,
      anonymized_payments: anonymizedCount,
      errors,
    })
  } catch (err) {
    console.error(`[${ts()}] ✗ data-retention-cron fatal:`, String(err))
    return jsonError(String(err))
  }
})
