// supabase/functions/order-mark-shipped/index.ts
//
// Fase E — Admin marca un pedido (delivery_method='shipping') como enviado.
// Estado: 'accepted' → 'shipped'. Body: { order_id, tracking_number, tracking_carrier }.
// Dispara email send-order-shipped.

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

    const body = (await req.json().catch(() => ({}))) as {
      order_id?: string
      tracking_number?: string
      tracking_carrier?: string
    }
    const orderId = body.order_id
    const trackingNumber = (body.tracking_number ?? '').trim()
    const trackingCarrier = (body.tracking_carrier ?? '').trim()
    if (!orderId) return jsonError('order_id required', 400, req)
    if (!trackingNumber) return jsonError('tracking_number required', 400, req)
    if (!trackingCarrier) return jsonError('tracking_carrier required', 400, req)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404, req)

    if (order.delivery_method !== 'shipping') {
      return jsonError('este pedido no es de envío a domicilio', 409, req)
    }
    if (order.status === 'shipped') {
      return jsonOk({ status: 'shipped' }, req)
    }
    if (order.status !== 'accepted') {
      return jsonError(
        `solo se puede marcar enviado un pedido 'accepted' (actual: ${order.status})`,
        409,
        req,
      )
    }

    // B-05: transición atómica vía RPC mark_shipped_order.
    const { data: shipRpc, error: shipErr } = await supabase.rpc('mark_shipped_order', {
      p_order_id: orderId,
      p_admin_id: userId,
      p_tracking_number: trackingNumber.slice(0, 100),
      p_tracking_carrier: trackingCarrier.slice(0, 50),
    })
    if (shipErr) {
      const msg = shipErr.message ?? ''
      if (msg.includes('invalid state')) {
        return jsonError('conflicto de concurrencia: pedido ya procesado', 409, req)
      }
      if (msg.includes('invalid delivery_method')) {
        return jsonError('este pedido no es de envío a domicilio', 409, req)
      }
      if (msg.includes('order not found')) {
        return jsonError('pedido no encontrado', 404, req)
      }
      console.error(`[${ts()}] mark_shipped_order rpc error:`, msg)
      return jsonError('error procesando pedido', 500, req)
    }
    const rpcRow = Array.isArray(shipRpc) ? shipRpc[0] : shipRpc
    const prevStatus = (rpcRow && typeof rpcRow === 'object' && 'prev_status' in rpcRow)
      ? String((rpcRow as { prev_status?: string }).prev_status ?? 'accepted')
      : 'accepted'

    await logStatusChange(
      supabase,
      orderId,
      prevStatus,
      'shipped',
      userId,
      `Enviado vía ${trackingCarrier} · tracking ${trackingNumber}`,
    )

    supabase.functions
      .invoke('send-order-shipped', {
        body: { order_id: orderId },
        headers: internalSecretHeader(),
      })
      .catch((err) => console.warn(`[${ts()}] send-order-shipped:`, String(err)))

    console.log(`[${ts()}] ✓ order-mark-shipped · ${order.order_number} · ${trackingCarrier} ${trackingNumber}`)
    return jsonOk({ status: 'shipped' }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-mark-shipped:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
