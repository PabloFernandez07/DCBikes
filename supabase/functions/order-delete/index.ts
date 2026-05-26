// supabase/functions/order-delete/index.ts
//
// Feature M — Soft-delete de pedidos pendientes (admin).
//
// Solo se permiten eliminar pedidos en estado:
//   - 'pending'        → cliente no llegó a pagar.
//   - 'payment_failed' → pago rechazado, sin pre-auth válida.
//
// Para 'authorized'/'accepted'/etc usa order-reject + cancel de Redsys.
// Aquí NO tocamos Redsys (no hay pre-auth válida que liberar).
// NO disparamos emails (eliminación silenciosa).
//
// Flujo:
//   1. Auth admin (Bearer).
//   2. Carga orden. Verifica status válido + deleted_at IS NULL.
//   3. UPDATE deleted_at = now().
//   4. INSERT order_status_history (to_status='deleted', changed_by, reason).
//   5. Devuelve { ok: true }.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { CORS_HEADERS, jsonError, jsonOk } from '../_shared/email-utils.ts'
import { requireAdmin, logStatusChange } from '../_shared/order-admin.ts'

const DELETABLE_STATUSES = new Set(['pending', 'payment_failed'])

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
      reason?: string | null
    }
    const orderId = body.order_id
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id requerido (uuid)', 400)
    }

    // Lectura: incluimos deleted_at para detectar idempotencia.
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('id, order_number, status, deleted_at')
      .eq('id', orderId)
      .maybeSingle<{
        id: string
        order_number: string
        status: string
        deleted_at: string | null
      }>()

    if (oErr) {
      console.error(`[${ts()}] order-delete read error:`, oErr.message)
      return jsonError(`error leyendo el pedido: ${oErr.message}`, 500)
    }
    if (!order) return jsonError('pedido no encontrado', 404)

    if (order.deleted_at !== null) {
      return jsonError('Ya eliminado', 409)
    }

    if (!DELETABLE_STATUSES.has(order.status)) {
      return jsonError(
        `Solo se pueden eliminar pedidos pendientes de pago o con pago fallido. Estado actual: ${order.status}`,
        422,
      )
    }

    const now = new Date().toISOString()
    const { error: uErr } = await supabase
      .from('orders')
      .update({ deleted_at: now })
      .eq('id', orderId)
      .is('deleted_at', null) // race-safety: si otro admin lo borró en el mismo instante, no pisamos.

    if (uErr) {
      console.error(`[${ts()}] order-delete update error:`, uErr.message)
      return jsonError(`error eliminando el pedido: ${uErr.message}`, 500)
    }

    const cleanReason =
      typeof body.reason === 'string' && body.reason.trim().length > 0
        ? body.reason.trim().slice(0, 500)
        : 'sin motivo indicado'

    await logStatusChange(
      supabase,
      orderId,
      order.status,
      'deleted',
      userId,
      `Eliminado por admin: ${cleanReason}`,
    )

    console.log(
      `[${ts()}] ✓ order-delete · ${order.order_number} · prev=${order.status} · by=${userId}`,
    )
    return jsonOk({})
  } catch (err) {
    console.error(`[${ts()}] ✗ order-delete:`, String(err))
    return jsonError(String(err))
  }
})
