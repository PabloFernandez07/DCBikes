// supabase/functions/order-mark-delivered/index.ts
//
// Fase E — Admin marca un pedido como entregado. Estado final del flujo OK.
// Acepta transición desde 'shipped' (envío) o 'ready_pickup' (recogida).
// No dispara email (el cliente ya recibió "listo para recoger" o "enviado").

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { buildCorsHeaders, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { loadOrder, logStatusChange, requireAdmin } from '../_shared/order-admin.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status, req)
    const { supabase, userId } = auth.ctx

    const body = (await req.json().catch(() => ({}))) as { order_id?: string }
    const orderId = body.order_id
    if (!orderId) return jsonError('order_id required', 400, req)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404, req)

    if (order.status === 'delivered') {
      return jsonOk({ status: 'delivered' }, req)
    }
    if (order.status !== 'shipped' && order.status !== 'ready_pickup') {
      return jsonError(
        `solo se puede marcar entregado desde 'shipped' o 'ready_pickup' (actual: ${order.status})`,
        409,
        req,
      )
    }

    const { error: uErr } = await supabase
      .from('orders')
      .update({ status: 'delivered' })
      .eq('id', orderId)
    if (uErr) return jsonError(`update failed: ${uErr.message}`, 500, req)

    await logStatusChange(supabase, orderId, order.status, 'delivered', userId, 'Entregado al cliente')

    console.log(`[${ts()}] ✓ order-mark-delivered · ${order.order_number}`)
    return jsonOk({ status: 'delivered' }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-mark-delivered:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
