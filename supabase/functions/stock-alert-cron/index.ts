// supabase/functions/stock-alert-cron/index.ts
//
// Cron job que invoca `send-stock-alert` para procesar TODAS las alertas
// de stock pendientes. Ejecutado cada 5 minutos por pg_cron + pg_net
// (ver migración 0058_stock_alerts.sql).
//
// Auth: header `Authorization: Bearer <CRON_SECRET>` obligatorio.
// El secreto usado es `stock_alert_cron_secret` (almacenado en Vault).
// Mismo patrón que `data-retention-cron`.
//
// verify_jwt = false (ver supabase/config.toml):
//   El cron llama con su propio secreto como Bearer, no con un JWT de
//   plataforma. La seguridad la provee timingSafeEq contra CRON_SECRET.
//
// Variables de entorno necesarias:
//   - CRON_SECRET (el valor de stock_alert_cron_secret en Vault)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   - INTERNAL_INVOKE_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsPreflightResponse,
  jsonOk,
  jsonError,
} from '../_shared/email-utils.ts'
import { timingSafeEq, internalSecretHeader } from '../_shared/security.ts'

// Autoriza la request comparando el Bearer token con CRON_SECRET.
// Mismo patrón que data-retention-cron (timingSafeEq, fail-closed).
function authorize(req: Request): { ok: boolean; reason?: string } {
  const expected = Deno.env.get('STOCK_ALERT_CRON_SECRET') ?? ''
  if (!expected) {
    return { ok: false, reason: 'STOCK_ALERT_CRON_SECRET env var no configurada' }
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token || !timingSafeEq(token, expected)) {
    return { ok: false, reason: 'invalid bearer' }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    // Verificar CRON_SECRET (timing-safe, fail-closed)
    const auth = authorize(req)
    if (!auth.ok) {
      console.warn(`[${ts()}] stock-alert-cron: no autorizado — ${auth.reason}`)
      return jsonError('unauthorized', 401, req)
    }

    console.log(`[${ts()}] stock-alert-cron: iniciando — invocando send-stock-alert (todas las alertas)`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Invoca send-stock-alert sin product_id → procesa todas las alertas pendientes
    let result: unknown = null
    let invokeErr: unknown = null
    try {
      const res = await supabase.functions.invoke('send-stock-alert', {
        body: {}, // sin product_id → todas las alertas
        headers: internalSecretHeader(),
      })
      result = res.data
      invokeErr = res.error
    } catch (e) {
      invokeErr = e
    }

    if (invokeErr) {
      const detail =
        (invokeErr as { message?: string })?.message ??
        String(invokeErr)
      console.error(`[${ts()}] stock-alert-cron: send-stock-alert falló:`, detail)
      return jsonError(`send-stock-alert error: ${detail}`, 502, req)
    }

    const sent = (result as { sent?: number } | null)?.sent ?? 0
    console.log(`[${ts()}] stock-alert-cron: completado — emails enviados=${sent}`)

    return jsonOk({ ok: true, sent }, req)
  } catch (err) {
    console.error(`[${ts()}] stock-alert-cron: error fatal:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
