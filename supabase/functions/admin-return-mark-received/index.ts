// supabase/functions/admin-return-mark-received/index.ts
//
// El admin marca como RECIBIDA la mercancía devuelta. ESTA acción mueve el
// dinero (decisión del titular: el reembolso Redsys y la factura rectificativa
// ocurren al recibir, NO al aprobar).
//
// Auth: requireAdmin (Bearer JWT del admin).
//
// Flujo (POST { return_id }):
//   0. Idempotencia: si el RMA ya está 'refunded', 200 OK sin repetir Redsys
//      (patrón BUG-A4 — no relanzar una devolución ya ejecutada).
//   a. RPC mark_return_received(return_id, admin_id) → approved→received.
//      Idempotente: si no estaba 'approved', la RPC señala estado inválido → 409.
//   b. Carga order_returns + orders. Necesita order.payment_pre_auth_id,
//      order.payment_captured_at y refund_total_cents. Si payment_captured_at
//      es null → 422 (no se capturó dinero, no hay nada que reembolsar).
//   c. runRedsysOperation({ kind:'refund', amountCents: refund_total_cents })
//      con payment_pre_auth_id como id de la operación original. Si KO: NO
//      marcar refunded, alertAdminCancelKo(context 'devolución'), 502. El RMA
//      queda en 'received' y el admin reintenta.
//   d. Si refund OK: invoca generate-credit-invoice { order_id, return_id }
//      (interno) → { credit_invoice_number, credit_invoice_id? }. Luego RPC
//      set_return_refunded(return_id, redsys_code, credit_invoice_id).
//   e. Email de reembolso al cliente (no bloqueante) si existe plantilla.
//   f. NO toca stock (el admin lo ajusta a mano).
//
// Respuesta:
//   200 { ok:true, status:'refunded', credit_invoice_number }
//   422 si el pedido no estaba capturado.
//   502 si Redsys rechaza la devolución (RMA queda en 'received', reintentar).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { jsonError, jsonOk, corsPreflightResponse } from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import {
  alertAdminCancelKo,
  loadConfig,
  logPayment,
  requireAdmin,
  runRedsysOperation,
} from '../_shared/order-admin.ts'

interface ReturnRow {
  id: string
  return_number: string
  status: string
  order_id: string
  refund_total_cents: number | null
  credit_invoice_number: string | null
}

interface OrderRow {
  id: string
  order_number: string
  payment_pre_auth_id: string | null
  payment_captured_at: string | null
}

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

    // ── Cargar RMA actual (para idempotencia y datos) ───────────────────────
    const { data: retPre, error: retPreErr } = await supabase
      .from('order_returns')
      .select(
        'id, return_number, status, order_id, refund_total_cents, credit_invoice_number',
      )
      .eq('id', returnId)
      .maybeSingle<ReturnRow>()
    if (retPreErr) {
      console.error(`[${ts()}] mark-received read RMA error:`, retPreErr.message)
      return jsonError('error leyendo la devolución', 500, req)
    }
    if (!retPre) return jsonError('devolución no encontrada', 404, req)

    // ── 0. Idempotencia: ya reembolsada → no repetir Redsys (BUG-A4) ────────
    if (retPre.status === 'refunded') {
      console.log(
        `[${ts()}] admin-return-mark-received · ${retPre.return_number} ya refunded — noop`,
      )
      return jsonOk(
        { status: 'refunded', credit_invoice_number: retPre.credit_invoice_number },
        req,
      )
    }

    // ── a. Transición approved→received vía RPC (idempotente/atómica) ────────
    const { error: rcvErr } = await supabase.rpc('mark_return_received', {
      p_return_id: returnId,
      p_admin_id: userId,
    })
    if (rcvErr) {
      const msg = rcvErr.message ?? ''
      if (msg.includes('not found')) return jsonError('devolución no encontrada', 404, req)
      // La RPC exige estado 'approved'; cualquier otro → conflicto.
      if (msg.includes('invalid state') || msg.includes('invalid status')) {
        return jsonError(
          'la devolución debe estar aprobada antes de marcarla como recibida',
          409,
          req,
        )
      }
      console.error(`[${ts()}] mark_return_received rpc error:`, msg)
      return jsonError('error marcando la devolución como recibida', 500, req)
    }

    // ── b. Cargar pedido + comprobar captura ────────────────────────────────
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('id, order_number, payment_pre_auth_id, payment_captured_at')
      .eq('id', retPre.order_id)
      .maybeSingle<OrderRow>()
    if (oErr) {
      console.error(`[${ts()}] mark-received read order error:`, oErr.message)
      return jsonError('error leyendo el pedido', 500, req)
    }
    if (!order) return jsonError('pedido asociado no encontrado', 404, req)

    if (!order.payment_captured_at) {
      // El RMA ya está en 'received'; el dinero nunca se capturó, así que no hay
      // nada que devolver por Redsys. Que el admin gestione el caso a mano.
      return jsonError(
        'el pedido no fue capturado, no se puede reembolsar por Redsys',
        422,
        req,
      )
    }
    if (!order.payment_pre_auth_id) {
      return jsonError(
        'falta el identificador de la operación original (payment_pre_auth_id) — no se puede reembolsar',
        422,
        req,
      )
    }

    const refundCents = retPre.refund_total_cents ?? 0
    if (refundCents <= 0) {
      return jsonError('el importe a reembolsar es 0 — revisar la devolución', 422, req)
    }

    // ── c. Reembolso Redsys (type 3) sobre la operación original ────────────
    const config = await loadConfig(supabase)
    const refundResult = await runRedsysOperation({
      config,
      redsysOrderId: order.payment_pre_auth_id,
      op: { kind: 'refund', amountCents: refundCents },
    })

    // Log del intento (OK o KO) para auditoría en payments_log.
    await logPayment(supabase, order.id, 'refund', refundResult, '3')

    if (!refundResult.ok) {
      console.warn(
        `[${ts()}] refund FAIL · ${retPre.return_number} · order=${order.order_number} · code=${refundResult.responseCode}`,
      )
      // No marcamos refunded: el RMA queda en 'received'. Alertamos al admin
      // para que gestione la devolución a mano desde el portal de Redsys.
      await alertAdminCancelKo(supabase, {
        orderId: order.id,
        orderNumber: order.order_number,
        redsysOrderId: order.payment_pre_auth_id,
        amountCents: refundCents,
        responseCode: refundResult.responseCode,
        context: 'devolución',
      })
      return jsonError(
        `Redsys rechazó la devolución (código ${refundResult.responseCode ?? 'n/a'}). El RMA queda como recibido; reinténtalo o gestiónalo desde el portal de Redsys.`,
        502,
        req,
      )
    }

    // ── d. Factura rectificativa (interna) ──────────────────────────────────
    // generate-credit-invoice es responsabilidad de otro lote; aquí la
    // invocamos. Patrón de captura de error idéntico a admin-generate-invoice.
    let creditInvoiceNumber: string | null = null
    let creditInvoiceId: string | null = null
    {
      let genData: unknown = null
      let genErr: unknown = null
      try {
        const res = await supabase.functions.invoke('generate-credit-invoice', {
          body: { order_id: order.id, return_id: returnId },
          headers: internalSecretHeader(),
        })
        genData = res.data
        genErr = res.error
      } catch (e) {
        genErr = e
      }

      if (genErr) {
        let detail =
          (genData as { error?: string } | null)?.error ??
          (genErr as { message?: string })?.message ??
          'No se pudo generar la factura rectificativa.'
        const ctx = (genErr as { context?: { json?: () => Promise<{ error?: string }> } }).context
        if (ctx && typeof ctx.json === 'function') {
          try {
            const b = await ctx.json()
            if (b?.error) detail = b.error
          } catch { /* ignorar */ }
        }
        // El dinero YA se reembolsó en Redsys. No revertimos por un fallo de la
        // rectificativa: persistimos el reembolso y dejamos la factura para
        // reintento. Marcamos refunded igualmente (con credit_invoice_id null)
        // para no relanzar Redsys; el admin regenera la rectificativa aparte.
        console.error(
          `[${ts()}] generate-credit-invoice falló tras refund OK · ${retPre.return_number}: ${detail}`,
        )
      } else {
        creditInvoiceNumber =
          (genData as { credit_invoice_number?: string } | null)?.credit_invoice_number ?? null
        creditInvoiceId =
          (genData as { credit_invoice_id?: string } | null)?.credit_invoice_id ?? null
      }
    }

    // ── d (cont). Persistir reembolso: received→refunded ────────────────────
    const { error: setErr } = await supabase.rpc('set_return_refunded', {
      p_return_id: returnId,
      p_redsys_code: refundResult.responseCode,
      p_credit_invoice_id: creditInvoiceId,
    })
    if (setErr) {
      // El reembolso Redsys está hecho y registrado en payments_log; si la
      // transición de estado falla, lo señalamos para intervención manual (no
      // reintentamos Redsys: la idempotencia de la cabecera lo impediría una
      // vez en 'refunded', pero aquí seguimos en 'received').
      console.error(
        `[${ts()}] set_return_refunded FAIL tras refund OK · ${retPre.return_number}:`,
        setErr.message,
      )
      return jsonError(
        `El reembolso en Redsys se realizó (código ${refundResult.responseCode ?? 'n/a'}) pero no se pudo actualizar el estado de la devolución: ${setErr.message}. Revisar manualmente.`,
        500,
        req,
      )
    }

    // ── e. Email de reembolso al cliente (no bloqueante) ────────────────────
    // El lote de emails decide la plantilla del "reembolso completado". Si no
    // existe función específica, esta invocación fallará y solo dejará un
    // warning — el flujo de dinero ya terminó y no debe romperse por el email.
    supabase.functions
      .invoke('send-return-refunded-customer', {
        body: { return_id: returnId },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(`[${ts()}] send-return-refunded-customer (omitible):`, String(err)),
      )

    console.log(
      `[${ts()}] ✓ admin-return-mark-received · ${retPre.return_number} · order=${order.order_number} · refund=${refundResult.responseCode} · rectificativa=${creditInvoiceNumber ?? 'pendiente'} · admin=${userId}`,
    )
    return jsonOk(
      { status: 'refunded', credit_invoice_number: creditInvoiceNumber },
      req,
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-return-mark-received:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
