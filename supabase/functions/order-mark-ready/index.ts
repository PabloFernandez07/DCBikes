// supabase/functions/order-mark-ready/index.ts
//
// Fase E — Admin marca un pedido (delivery_method='pickup') como listo para
// recoger en tienda. Estado: 'accepted' → 'ready_pickup'.
// Dispara email send-order-ready-pickup.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { buildCorsHeaders, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
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

    const body = await req.json().catch(() => ({})) as { order_id?: string }
    const orderId = body.order_id
    if (!orderId) return jsonError('order_id required', 400, req)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404, req)

    if (order.delivery_method !== 'pickup') {
      return jsonError('este pedido no es de recogida en tienda', 409, req)
    }
    if (order.status === 'ready_pickup') {
      return jsonOk({ status: 'ready_pickup' }, req)
    }
    if (order.status !== 'accepted') {
      return jsonError(
        `solo se puede marcar listo un pedido 'accepted' (actual: ${order.status})`,
        409,
        req,
      )
    }

    const now = new Date().toISOString()
    const { error: uErr } = await supabase
      .from('orders')
      .update({ status: 'ready_pickup', ready_pickup_at: now })
      .eq('id', orderId)
    if (uErr) return jsonError(`update failed: ${uErr.message}`, 500, req)

    await logStatusChange(supabase, orderId, 'accepted', 'ready_pickup', userId, 'Listo para recoger')

    supabase.functions
      .invoke('send-order-ready-pickup', {
        body: { order_id: orderId },
        headers: internalSecretHeader(),
      })
      .catch((err) => console.warn(`[${ts()}] send-order-ready-pickup:`, String(err)))

    console.log(`[${ts()}] ✓ order-mark-ready · ${order.order_number}`)
    return jsonOk({ status: 'ready_pickup' }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-mark-ready:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
