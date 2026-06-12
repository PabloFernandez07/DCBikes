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
// BUG-C2 (auditoría técnica 2026-06-12): segunda rama para pedidos
// 'pending' / 'payment_failed' más antiguos que el mismo umbral: el cliente
// abandonó el checkout (o el pago falló) y el stock reservado en order-place
// quedaba comprometido para siempre. Se cancelan + restoreStockOnce
// (idempotente). Para estos pedidos NO hay pre-autorización confirmada
// (payment_pre_auth_at NULL) → no se llama a Redsys; solo si por anomalía
// existiera payment_pre_auth_at se anula también en Redsys.
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
  alertAdminCancelKo,
  loadConfig,
  logPayment,
  logStatusChange,
  runRedsysOperation,
  type RedsysOpResult,
} from '../_shared/order-admin.ts'
import { restoreStockOnce } from '../_shared/stock-restore.ts'

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

    // BUG-C2: pedidos abandonados sin pago confirmado (pending) o con pago
    // rechazado (payment_failed) más antiguos que el umbral. Su stock sigue
    // reservado (salvo que redsys-notification ya lo restaurase al fallar
    // el pago — restoreStockOnce lo detecta y no duplica). Excluimos los
    // soft-borrados: order-delete ya restauró su stock.
    const { data: stale, error: q2Err } = await supabase
      .from('orders')
      .select('id, order_number, status, payment_pre_auth_id, payment_pre_auth_at, total_cents, created_at')
      .in('status', ['pending', 'payment_failed'])
      .is('deleted_at', null)
      .lt('created_at', cutoff)
      .limit(50)

    if (q2Err) {
      console.error(`[${ts()}] auto-cancel stale query error:`, q2Err.message)
      return jsonError(q2Err.message, 500, req)
    }

    const authorizedRows = pending ?? []
    const staleRows = stale ?? []

    if (authorizedRows.length === 0 && staleRows.length === 0) {
      return jsonOk({ cancelled: 0, scanned: 0 }, req)
    }

    const config = await loadConfig(supabase)

    let cancelled = 0
    let failed = 0
    for (const order of authorizedRows) {
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

        // 4.2: anulación KO real → alerta al admin. Seguimos cancelando el
        // pedido (el cron debe liberar el stock igualmente); la retención
        // queda pendiente de resolución manual en el portal de Redsys.
        if (!cancelResult.ok && !cancelResult.simulated) {
          console.warn(
            `[${ts()}] auto-cancel Redsys KO · ${order.order_number} · code=${cancelResult.responseCode}`,
          )
          await alertAdminCancelKo(supabase, {
            orderId: order.id,
            orderNumber: order.order_number,
            redsysOrderId: order.payment_pre_auth_id,
            amountCents: order.total_cents,
            responseCode: cancelResult.responseCode,
            context: 'auto-cancelación por inactividad (order-auto-cancel cron)',
          })
        }

        const now = new Date().toISOString()
        const { error: uErr, count: uCount } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            payment_cancelled_at: now,
            rejection_reason: `Auto-cancelado por inactividad (>${hours}h)`,
          }, { count: 'exact' })
          .eq('id', order.id)
          .eq('status', 'authorized') // optimistic: no pisar si cambió mientras tanto

        if (uErr) {
          console.warn(`[${ts()}] update fail ${order.order_number}:`, uErr.message)
          failed++
          continue
        }
        // BUG-C2: si el estado cambió entre el SELECT y el UPDATE (p.ej. un
        // admin lo aceptó), count=0 → NO restaurar stock de un pedido vivo.
        if (uCount === 0) {
          console.warn(`[${ts()}] race perdida ${order.order_number}: estado cambió — skip`)
          continue
        }

        await restoreStockOnce(supabase, order.id)
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

    // ─── BUG-C2: rama pending / payment_failed abandonados ───────────
    // Sin pre-autorización confirmada no hay retención en Redsys que anular;
    // solo si payment_pre_auth_at existe (anomalía: el pedido recibió preauth
    // pero quedó atascado en pending) anulamos también la operación Redsys.
    // No se envía email al cliente: nunca llegó a pagar (pending) o ya supo
    // del fallo (payment_failed); el flujo authorized sí lo notifica porque
    // tiene dinero retenido.
    let staleCancelled = 0
    for (const order of staleRows) {
      try {
        let cancelResult: RedsysOpResult | null = null
        if (order.payment_pre_auth_at && order.payment_pre_auth_id) {
          // Caso anómalo: hubo preauth real → liberar la retención en Redsys.
          cancelResult = await runRedsysOperation({
            config,
            redsysOrderId: order.payment_pre_auth_id,
            op: { kind: 'cancel', amountCents: order.total_cents },
          })
          if (!cancelResult.ok && !cancelResult.simulated) {
            console.warn(
              `[${ts()}] stale-cancel Redsys KO · ${order.order_number} · code=${cancelResult.responseCode}`,
            )
            await alertAdminCancelKo(supabase, {
              orderId: order.id,
              orderNumber: order.order_number,
              redsysOrderId: order.payment_pre_auth_id,
              amountCents: order.total_cents,
              responseCode: cancelResult.responseCode,
              context: `auto-cancelación de pedido ${order.status} abandonado (order-auto-cancel cron)`,
            })
          }
        }

        const now = new Date().toISOString()
        const { error: uErr, count: uCount } = await supabase
          .from('orders')
          .update({
            status: 'cancelled',
            payment_cancelled_at: now,
            rejection_reason: `Auto-cancelado: ${order.status === 'pending' ? 'checkout abandonado' : 'pago fallido'} (>${hours}h)`,
          }, { count: 'exact' })
          .eq('id', order.id)
          .eq('status', order.status) // optimistic: si Redsys lo autorizó mientras tanto, no pisar

        if (uErr) {
          console.warn(`[${ts()}] stale update fail ${order.order_number}:`, uErr.message)
          failed++
          continue
        }
        if (uCount === 0) {
          // El pedido transitó (p.ej. llegó la notificación de pago) — skip.
          console.warn(`[${ts()}] stale race perdida ${order.order_number}: estado cambió — skip`)
          continue
        }

        // Idempotente: si redsys-notification ya restauró al marcar
        // payment_failed, aquí es noop.
        await restoreStockOnce(supabase, order.id)
        if (cancelResult) {
          await logPayment(supabase, order.id, 'cancel', cancelResult, '9')
        }
        await logStatusChange(
          supabase,
          order.id,
          order.status,
          'cancelled',
          null,
          `Auto-cancel pedido ${order.status} (>${hours}h)`,
        )

        staleCancelled++
        console.log(`[${ts()}] ✓ auto-cancel stale ${order.order_number} (era ${order.status})`)
      } catch (err) {
        failed++
        console.error(`[${ts()}] auto-cancel stale exception ${order.order_number}:`, String(err))
      }
    }

    return jsonOk({
      scanned: authorizedRows.length + staleRows.length,
      cancelled,
      stale_cancelled: staleCancelled,
      failed,
      hours,
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-auto-cancel:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
