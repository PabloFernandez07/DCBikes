// supabase/functions/order-mark-shipped/index.ts
//
// Fase E — Admin marca un pedido (delivery_method='shipping') como enviado.
// Estado: 'accepted' → 'shipped'. Body: { order_id, tracking_number, tracking_carrier }.
// Dispara email send-order-shipped.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { CORS_HEADERS, jsonError, jsonOk } from '../_shared/email-utils.ts'
import { loadOrder, logStatusChange, requireAdmin } from '../_shared/order-admin.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status)
    const { supabase, userId } = auth.ctx

    const body = (await req.json().catch(() => ({}))) as {
      order_id?: string
      tracking_number?: string
      tracking_carrier?: string
    }
    const orderId = body.order_id
    const trackingNumber = (body.tracking_number ?? '').trim()
    const trackingCarrier = (body.tracking_carrier ?? '').trim()
    if (!orderId) return jsonError('order_id required', 400)
    if (!trackingNumber) return jsonError('tracking_number required', 400)
    if (!trackingCarrier) return jsonError('tracking_carrier required', 400)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404)

    if (order.delivery_method !== 'shipping') {
      return jsonError('este pedido no es de envío a domicilio', 409)
    }
    if (order.status === 'shipped') {
      return jsonOk({ status: 'shipped' })
    }
    if (order.status !== 'accepted') {
      return jsonError(
        `solo se puede marcar enviado un pedido 'accepted' (actual: ${order.status})`,
        409,
      )
    }

    const now = new Date().toISOString()
    const { error: uErr } = await supabase
      .from('orders')
      .update({
        status: 'shipped',
        shipped_at: now,
        tracking_number: trackingNumber.slice(0, 100),
        tracking_carrier: trackingCarrier.slice(0, 50),
      })
      .eq('id', orderId)
    if (uErr) return jsonError(`update failed: ${uErr.message}`, 500)

    await logStatusChange(
      supabase,
      orderId,
      'accepted',
      'shipped',
      userId,
      `Enviado vía ${trackingCarrier} · tracking ${trackingNumber}`,
    )

    supabase.functions
      .invoke('send-order-shipped', { body: { order_id: orderId } })
      .catch((err) => console.warn(`[${ts()}] send-order-shipped:`, String(err)))

    console.log(`[${ts()}] ✓ order-mark-shipped · ${order.order_number} · ${trackingCarrier} ${trackingNumber}`)
    return jsonOk({ status: 'shipped' })
  } catch (err) {
    console.error(`[${ts()}] ✗ order-mark-shipped:`, String(err))
    return jsonError(String(err))
  }
})
