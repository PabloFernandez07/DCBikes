// supabase/functions/admin-return-approve/index.ts
//
// El admin APRUEBA una solicitud de devolución (RMA). Esta acción NO mueve
// dinero: solo autoriza al cliente a enviar la mercancía de vuelta. El
// reembolso Redsys y la factura rectificativa ocurren al MARCAR RECIBIDO
// (admin-return-mark-received) — decisión del titular.
//
// Auth: requireAdmin (Bearer JWT del admin).
//
// Flujo:
//   POST { return_id }
//   1. requireAdmin.
//   2. RPC approve_return(p_return_id, p_admin_id) → requested→approved.
//   3. Invoca send-return-approved-customer (no bloqueante, internalSecretHeader):
//      el cliente recibe instrucciones de envío de vuelta, importe a reembolsar
//      y quién paga el envío de retorno.
//
// Respuesta:
//   200 { ok:true, status:'approved', refund_total_cents }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { jsonError, jsonOk, corsPreflightResponse } from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import { requireAdmin } from '../_shared/order-admin.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status, req)
    const { supabase, userId } = auth.ctx

    const body = (await req.json().catch(() => ({}))) as { return_id?: string }
    const returnId = body.return_id ?? null
    if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
      return jsonError('return_id inválido', 400, req)
    }

    // ── Aprobar vía RPC (transición de estado atómica con lock pesimista) ────
    const { error: rpcErr } = await supabase.rpc('approve_return', {
      p_return_id: returnId,
      p_admin_id: userId,
    })
    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      if (msg.includes('not found')) return jsonError('devolución no encontrada', 404, req)
      // La RPC valida el estado origen; si no estaba en 'requested', 409.
      if (msg.includes('invalid state') || msg.includes('invalid status')) {
        return jsonError('la devolución no está en estado solicitable de aprobación', 409, req)
      }
      console.error(`[${ts()}] approve_return rpc error:`, msg)
      return jsonError('error aprobando la devolución', 500, req)
    }

    // ── Releer importe para la respuesta ────────────────────────────────────
    const { data: ret } = await supabase
      .from('order_returns')
      .select('refund_total_cents, return_number')
      .eq('id', returnId)
      .maybeSingle<{ refund_total_cents: number | null; return_number: string }>()

    // ── Email al cliente (no bloqueante, fire-and-forget) ───────────────────
    supabase.functions
      .invoke('send-return-approved-customer', {
        body: { return_id: returnId },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(`[${ts()}] send-return-approved-customer:`, String(err)),
      )

    console.log(
      `[${ts()}] ✓ admin-return-approve · ${ret?.return_number ?? returnId} · admin=${userId}`,
    )
    return jsonOk(
      { status: 'approved', refund_total_cents: ret?.refund_total_cents ?? 0 },
      req,
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-return-approve:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
