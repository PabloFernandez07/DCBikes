// supabase/functions/admin-return-list/index.ts
//
// Lista las devoluciones (RMA) para el panel de administración.
//
// Auth: el frontend admin invoca con su JWT (Authorization Bearer). Se valida
// con requireAdmin (auth.getUser + is_admin RPC, service_role para operar).
// Patrón idéntico a order-accept / admin-generate-invoice.
//
// Flujo:
//   POST { status? }   → status opcional para filtrar (requested/approved/
//                         received/refunded/rejected). Sin status: todas.
//
// Respuesta:
//   200 { ok:true, returns:[{ id, return_number, order_number, customer_email,
//          status, reason_code, refund_total_cents, created_at }] }
//
// Orden: created_at desc. Se hace join a orders para obtener order_number.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { jsonError, jsonOk, corsPreflightResponse } from '../_shared/email-utils.ts'
import { requireAdmin } from '../_shared/order-admin.ts'

interface ReturnRow {
  id: string
  return_number: string
  status: string
  reason_code: string | null
  refund_total_cents: number | null
  created_at: string
  customer_email: string | null
  orders: { order_number: string } | { order_number: string }[] | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status, req)
    const { supabase } = auth.ctx

    const body = (await req.json().catch(() => ({}))) as { status?: string }
    const status = typeof body.status === 'string' ? body.status.trim() : ''

    // Join a orders para el order_number. customer_email vive en order_returns
    // (snapshot del email del pedido en el momento de la solicitud).
    let query = supabase
      .from('order_returns')
      .select(
        'id, return_number, status, reason_code, refund_total_cents, ' +
          'created_at, customer_email, orders ( order_number )',
      )
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)

    const { data, error } = await query.returns<ReturnRow[]>()
    if (error) {
      console.error(`[${ts()}] admin-return-list query error:`, error.message)
      return jsonError('error listando devoluciones', 500, req)
    }

    const returns = (data ?? []).map((r) => {
      // El embed puede venir como objeto o array según la cardinalidad inferida.
      const order = Array.isArray(r.orders) ? r.orders[0] : r.orders
      return {
        id: r.id,
        return_number: r.return_number,
        order_number: order?.order_number ?? null,
        customer_email: r.customer_email,
        status: r.status,
        reason_code: r.reason_code,
        refund_total_cents: r.refund_total_cents ?? 0,
        created_at: r.created_at,
      }
    })

    return jsonOk({ returns }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-return-list:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
