// supabase/functions/admin-return-get/index.ts
//
// Detalle de una devolución (RMA) para el panel de administración: cabecera
// del RMA + líneas devueltas + datos del pedido asociado.
//
// Auth: requireAdmin (Bearer JWT del admin). Patrón idéntico a order-accept.
//
// Flujo:
//   POST { return_id }
//
// Respuesta:
//   200 { ok:true, return:{...}, items:[...], order:{...} }
//   404 si el RMA no existe.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { jsonError, jsonOk, corsPreflightResponse } from '../_shared/email-utils.ts'
import { requireAdmin } from '../_shared/order-admin.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status, req)
    const { supabase } = auth.ctx

    const body = (await req.json().catch(() => ({}))) as { return_id?: string }
    const returnId = body.return_id ?? null
    if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
      return jsonError('return_id inválido', 400, req)
    }

    // ── Cabecera del RMA ───────────────────────────────────────────────────
    const { data: ret, error: rErr } = await supabase
      .from('order_returns')
      .select('*')
      .eq('id', returnId)
      .maybeSingle()
    if (rErr) {
      console.error(`[${ts()}] admin-return-get header error:`, rErr.message)
      return jsonError('error leyendo la devolución', 500, req)
    }
    if (!ret) return jsonError('devolución no encontrada', 404, req)

    // ── Líneas devueltas ───────────────────────────────────────────────────
    const { data: items, error: iErr } = await supabase
      .from('order_return_items')
      .select('*')
      .eq('return_id', returnId)
      .order('created_at', { ascending: true })
    if (iErr) {
      console.error(`[${ts()}] admin-return-get items error:`, iErr.message)
      return jsonError('error leyendo las líneas de la devolución', 500, req)
    }

    // ── Pedido asociado ────────────────────────────────────────────────────
    const orderId = (ret as { order_id?: string }).order_id ?? null
    let order: Record<string, unknown> | null = null
    if (orderId) {
      const { data: ord, error: oErr } = await supabase
        .from('orders')
        .select(
          'id, order_number, status, customer_email, customer_name, ' +
            'total_cents, payment_pre_auth_id, payment_captured_at, ' +
            'delivery_method, created_at',
        )
        .eq('id', orderId)
        .maybeSingle()
      if (oErr) {
        console.error(`[${ts()}] admin-return-get order error:`, oErr.message)
        return jsonError('error leyendo el pedido', 500, req)
      }
      order = ord ?? null
    }

    return jsonOk({ return: ret, items: items ?? [], order }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-return-get:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
