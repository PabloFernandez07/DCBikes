// supabase/functions/order-mark-ready/index.ts
//
// Fase E — Admin marca un pedido (delivery_method='pickup') como listo para
// recoger en tienda. Estado: 'accepted' → 'ready_pickup'.
// Dispara email send-order-ready-pickup.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { buildCorsHeaders, jsonError, jsonOk } from '../_shared/email-utils.ts'
import { loadOrder, logStatusChange, requireAdmin } from '../_shared/order-admin.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status)
    const { supabase, userId } = auth.ctx

    const body = await req.json().catch(() => ({})) as { order_id?: string }
    const orderId = body.order_id
    if (!orderId) return jsonError('order_id required', 400)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404)

    if (order.delivery_method !== 'pickup') {
      return jsonError('este pedido no es de recogida en tienda', 409)
    }
    if (order.status === 'ready_pickup') {
      return jsonOk({ status: 'ready_pickup' })
    }
    if (order.status !== 'accepted') {
      return jsonError(
        `solo se puede marcar listo un pedido 'accepted' (actual: ${order.status})`,
        409,
      )
    }

    const now = new Date().toISOString()
    const { error: uErr } = await supabase
      .from('orders')
      .update({ status: 'ready_pickup', ready_pickup_at: now })
      .eq('id', orderId)
    if (uErr) return jsonError(`update failed: ${uErr.message}`, 500)

    await logStatusChange(supabase, orderId, 'accepted', 'ready_pickup', userId, 'Listo para recoger')

    supabase.functions
      .invoke('send-order-ready-pickup', { body: { order_id: orderId } })
      .catch((err) => console.warn(`[${ts()}] send-order-ready-pickup:`, String(err)))

    console.log(`[${ts()}] ✓ order-mark-ready · ${order.order_number}`)
    return jsonOk({ status: 'ready_pickup' })
  } catch (err) {
    console.error(`[${ts()}] ✗ order-mark-ready:`, String(err))
    return jsonError(String(err))
  }
})
