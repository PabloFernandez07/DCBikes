// supabase/functions/order-reject/index.ts
//
// Fase E — Admin rechaza un pedido en estado 'authorized'.
//
// Flujo:
//   1. Auth admin.
//   2. Carga orden. Status debe ser 'authorized' (idempotencia: 'rejected' → OK).
//   3. Body: { order_id, rejection_reason }.
//   4. Llama Redsys CANCEL (TransactionType=9). En mock simula OK.
//   5. UPDATE orders SET status='rejected', rejection_reason, payment_cancelled_at.
//   6. Restaura stock de los items.
//   7. logPayment + logStatusChange.
//   8. Email send-order-rejected-customer.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { buildCorsHeaders, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import {
  loadConfig,
  loadOrder,
  logPayment,
  logStatusChange,
  requireAdmin,
  restoreStockFor,
  runRedsysOperation,
} from '../_shared/order-admin.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status, req)
    const { supabase, userId } = auth.ctx

    const body = await req.json().catch(() => ({})) as {
      order_id?: string
      rejection_reason?: string | null
    }
    const orderId = body.order_id
    if (!orderId) return jsonError('order_id required', 400, req)
    const reason = (body.rejection_reason ?? '').trim().slice(0, 1000)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404, req)

    if (order.status === 'rejected') {
      return jsonOk({ status: 'rejected' }, req)
    }
    if (order.status !== 'authorized') {
      return jsonError(
        `solo se pueden rechazar pedidos 'authorized' (actual: ${order.status})`,
        409,
        req,
      )
    }

    const config = await loadConfig(supabase)
    if (!order.payment_pre_auth_id) {
      return jsonError('falta payment_pre_auth_id', 500, req)
    }

    // B-05: transición atómica vía RPC con SELECT ... FOR UPDATE.
    const { data: rejectRpc, error: rejectErr } = await supabase.rpc('reject_order', {
      p_order_id: orderId,
      p_admin_id: userId,
      p_reason: reason || null,
    })
    if (rejectErr) {
      const msg = rejectErr.message ?? ''
      if (msg.includes('invalid state')) {
        return jsonError('conflicto de concurrencia: pedido ya procesado', 409, req)
      }
      if (msg.includes('order not found')) {
        return jsonError('pedido no encontrado', 404, req)
      }
      console.error(`[${ts()}] reject_order rpc error:`, msg)
      return jsonError('error procesando pedido', 500, req)
    }
    const rpcRow = Array.isArray(rejectRpc) ? rejectRpc[0] : rejectRpc
    const prevStatus = (rpcRow && typeof rpcRow === 'object' && 'prev_status' in rpcRow)
      ? String((rpcRow as { prev_status?: string }).prev_status ?? 'authorized')
      : 'authorized'

    const cancelResult = await runRedsysOperation({
      config,
      redsysOrderId: order.payment_pre_auth_id,
      op: { kind: 'cancel', amountCents: order.total_cents },
    })

    // Para cancel toleramos si Redsys ya canceló o el código no es estrictamente OK;
    // el efecto final es liberar la reserva. Marcamos pero logueamos.
    if (!cancelResult.ok) {
      console.warn(`[${ts()}] cancel devolvió no-ok · ${order.order_number} · code=${cancelResult.responseCode}`)
    }

    await restoreStockFor(supabase, orderId)
    await logPayment(supabase, orderId, 'cancel', cancelResult, '9')
    await logStatusChange(
      supabase,
      orderId,
      prevStatus,
      'rejected',
      userId,
      reason || (cancelResult.simulated ? 'Rechazado (mock)' : 'Rechazado por admin'),
    )

    // Email cliente.
    supabase.functions
      .invoke('send-order-rejected-customer', {
        body: { order_id: orderId },
        headers: internalSecretHeader(),
      })
      .catch((err) => console.warn(`[${ts()}] send-order-rejected-customer:`, String(err)))

    console.log(`[${ts()}] ✓ order-reject · ${order.order_number}`)
    return jsonOk({ status: 'rejected', mode: config.mode }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-reject:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
