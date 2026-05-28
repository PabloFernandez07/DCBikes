// supabase/functions/order-auto-cancel/index.ts
//
// Fase E — Llamado por pg_cron cada 30 minutos.
//
// Busca pedidos status='authorized' cuyo payment_pre_auth_at supere
// `order_auto_cancel_hours` (default 48h). Para cada uno:
//   1. Llama Redsys CANCEL (TransactionType=9). Si mock, simula.
//   2. UPDATE status='cancelled', payment_cancelled_at.
//   3. Restaura stock.
//   4. logPayment + logStatusChange.
//   5. Dispara send-order-auto-cancelled.
//
// Auth:
//   - Acepta Authorization: Bearer <service_role_key> (cron lo manda).
//   - Adicional: si está definida la env var ORDER_CRON_SECRET, verifica el
//     header `x-cron-secret` además del bearer.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders, asInt, getSettings, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import {
  loadConfig,
  logPayment,
  logStatusChange,
  restoreStockFor,
  runRedsysOperation,
} from '../_shared/order-admin.ts'

function authorizeCron(req: Request): { ok: boolean; reason?: string } {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!token || token !== serviceRoleKey) {
    return { ok: false, reason: 'invalid bearer (esperado service_role_key)' }
  }
  const expectedSecret = Deno.env.get('ORDER_CRON_SECRET')
  if (expectedSecret) {
    const received = req.headers.get('x-cron-secret') ?? ''
    if (received !== expectedSecret) {
      return { ok: false, reason: 'invalid x-cron-secret' }
    }
  }
  return { ok: true }
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const cronAuth = authorizeCron(req)
    if (!cronAuth.ok) {
      console.warn(`[${ts()}] cron unauthorized:`, cronAuth.reason)
      return jsonError('unauthorized', 401, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const settings = await getSettings(supabase, ['order_auto_cancel_hours'])
    const hours = Math.max(1, Math.min(144, asInt(settings.order_auto_cancel_hours, 48)))
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString()

    const { data: pending, error: qErr } = await supabase
      .from('orders')
      .select('id, order_number, payment_pre_auth_id, total_cents, payment_pre_auth_at')
      .eq('status', 'authorized')
      .lt('payment_pre_auth_at', cutoff)
      .limit(50)

    if (qErr) {
      console.error(`[${ts()}] auto-cancel query error:`, qErr.message)
      return jsonError(qErr.message, 500, req)
    }

    if (!pending || pending.length === 0) {
      return jsonOk({ cancelled: 0, scanned: 0 }, req)
    }

    const config = await loadConfig(supabase)

    let cancelled = 0
    let failed = 0
    for (const order of pending) {
      try {
        if (!order.payment_pre_auth_id) {
          console.warn(`[${ts()}] skip ${order.order_number}: sin payment_pre_auth_id`)
          continue
        }

        const cancelResult = await runRedsysOperation({
          config,
          redsysOrderId: order.payment_pre_auth_id,
          op: { kind: 'cancel', amountCents: order.total_cents },
        })

        const now = new Date().toISOString()
        const { error: uErr } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            payment_cancelled_at: now,
            rejection_reason: `Auto-cancelado por inactividad (>${hours}h)`,
          })
          .eq('id', order.id)
          .eq('status', 'authorized') // optimistic: no pisar si cambió mientras tanto

        if (uErr) {
          console.warn(`[${ts()}] update fail ${order.order_number}:`, uErr.message)
          failed++
          continue
        }

        await restoreStockFor(supabase, order.id)
        await logPayment(supabase, order.id, 'cancel', cancelResult, '9')
        await logStatusChange(
          supabase,
          order.id,
          'authorized',
          'cancelled',
          null,
          `Auto-cancel (>${hours}h sin aceptar)`,
        )

        supabase.functions
          .invoke('send-order-auto-cancelled', {
            body: { order_id: order.id },
            headers: internalSecretHeader(),
          })
          .catch((err) =>
            console.warn(`[${ts()}] send-order-auto-cancelled fail:`, String(err)),
          )

        cancelled++
        console.log(`[${ts()}] ✓ auto-cancel ${order.order_number}`)
      } catch (err) {
        failed++
        console.error(`[${ts()}] auto-cancel exception ${order.order_number}:`, String(err))
      }
    }

    return jsonOk({ scanned: pending.length, cancelled, failed, hours }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-auto-cancel:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
