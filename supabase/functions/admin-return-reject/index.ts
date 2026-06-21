// supabase/functions/admin-return-reject/index.ts
//
// El admin RECHAZA una solicitud de devolución (RMA). No mueve dinero ni stock.
//
// Auth: requireAdmin (Bearer JWT del admin).
//
// Flujo:
//   POST { return_id, note }
//   1. requireAdmin.
//   2. RPC reject_return(p_return_id, p_admin_id, p_note) → requested→rejected.
//   3. Invoca send-return-rejected-customer (no bloqueante, internalSecretHeader):
//      el cliente recibe el motivo del rechazo.
//
// Respuesta:
//   200 { ok:true }

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

    const body = (await req.json().catch(() => ({}))) as {
      return_id?: string
      note?: string
    }
    const returnId = body.return_id ?? null
    if (!returnId || !/^[0-9a-f-]{36}$/i.test(returnId)) {
      return jsonError('return_id inválido', 400, req)
    }
    const note =
      typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : ''

    // ── Rechazar vía RPC ─────────────────────────────────────────────────────
    const { error: rpcErr } = await supabase.rpc('reject_return', {
      p_return_id: returnId,
      p_admin_id: userId,
      p_note: note,
    })
    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      if (msg.includes('not found')) return jsonError('devolución no encontrada', 404, req)
      if (msg.includes('invalid state') || msg.includes('invalid status')) {
        return jsonError('la devolución no está en estado rechazable', 409, req)
      }
      console.error(`[${ts()}] reject_return rpc error:`, msg)
      return jsonError('error rechazando la devolución', 500, req)
    }

    // ── Email al cliente (no bloqueante, fire-and-forget) ───────────────────
    supabase.functions
      .invoke('send-return-rejected-customer', {
        body: { return_id: returnId },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(`[${ts()}] send-return-rejected-customer:`, String(err)),
      )

    console.log(`[${ts()}] ✓ admin-return-reject · ${returnId} · admin=${userId}`)
    return jsonOk({}, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-return-reject:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
