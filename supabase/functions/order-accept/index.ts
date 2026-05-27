// supabase/functions/order-accept/index.ts
//
// Fase E — Admin acepta un pedido en estado 'authorized'.
//
// Flujo:
//   1. Auth admin (Bearer).
//   2. Carga orden. Status debe ser 'authorized' (idempotencia: si ya
//      está 'accepted', devuelve OK sin hacer nada).
//   3. Lee notes_internal del body (opcional).
//   4. Llama Redsys S2S CAPTURE (TransactionType=2) o simula si mode=mock.
//      Si falla → devuelve error 502, NO modifica status.
//   5. UPDATE orders SET status='accepted', accepted_by, accepted_at,
//      payment_captured_at, notes_internal.
//   6. logStatusChange + logPayment.
//   7. Invoca generate-invoice-pdf. Si falla, marcamos accepted pero
//      logueamos warning (no bloqueamos al admin: el PDF se puede
//      reintentar desde el panel admin).
//   8. Invoca send-order-accepted-customer (en background, fire-and-forget).
//   9. Response: { ok, invoice_number?, status: 'accepted' }.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

import { buildCorsHeaders, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import {
  loadConfig,
  loadOrder,
  logPayment,
  logStatusChange,
  requireAdmin,
  runRedsysOperation,
} from '../_shared/order-admin.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = await requireAdmin(req)
    if (!auth.ok) return jsonError(auth.error, auth.status, req)
    const { supabase, userId } = auth.ctx

    const body = await req.json().catch(() => ({})) as {
      order_id?: string
      notes_internal?: string | null
    }
    const orderId = body.order_id
    if (!orderId) return jsonError('order_id required', 400, req)

    const order = await loadOrder(supabase, orderId)
    if (!order) return jsonError('order not found', 404, req)

    // Idempotencia.
    if (order.status === 'accepted') {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('order_id', orderId)
        .maybeSingle()
      return jsonOk({ status: 'accepted', invoice_number: inv?.invoice_number ?? null }, req)
    }

    if (order.status !== 'authorized') {
      return jsonError(
        `solo se pueden aceptar pedidos en estado 'authorized' (actual: ${order.status})`,
        409,
        req,
      )
    }

    // Captura en Redsys.
    const config = await loadConfig(supabase)
    if (!order.payment_pre_auth_id) {
      return jsonError('falta payment_pre_auth_id — no se puede capturar', 500, req)
    }

    const captureResult = await runRedsysOperation({
      config,
      redsysOrderId: order.payment_pre_auth_id,
      op: { kind: 'capture', amountCents: order.total_cents },
    })

    if (!captureResult.ok) {
      console.warn(`[${ts()}] capture FAIL · ${order.order_number} · code=${captureResult.responseCode}`)
      await logPayment(supabase, orderId, 'capture', captureResult, '2')
      return jsonError(
        `Redsys rechazó la captura (código ${captureResult.responseCode ?? 'n/a'}). El pedido sigue en 'authorized'.`,
        502,
        req,
      )
    }

    // UPDATE order.
    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      status: 'accepted',
      accepted_by: userId,
      accepted_at: now,
      payment_captured_at: now,
    }
    if (typeof body.notes_internal === 'string' && body.notes_internal.trim().length > 0) {
      updatePayload.notes_internal = body.notes_internal.trim().slice(0, 5000)
    }
    const { error: uErr } = await supabase.from('orders').update(updatePayload).eq('id', orderId)
    if (uErr) {
      console.error(`[${ts()}] update order error:`, uErr.message)
      // El capture en Redsys ya pasó. No revertimos automáticamente — se queda
      // como capturado en Redsys y el admin tendrá que arreglar a mano.
      return jsonError(`captura OK pero falló actualizar el pedido: ${uErr.message}`, 500, req)
    }

    await logPayment(supabase, orderId, 'capture', captureResult, '2')
    await logStatusChange(
      supabase,
      orderId,
      'authorized',
      'accepted',
      userId,
      captureResult.simulated
        ? `Aceptado (mock capture)`
        : `Aceptado (Redsys capture ${captureResult.responseCode})`,
    )

    // Generar factura. Si falla, log warning pero NO revertir.
    let invoiceNumber: string | null = null
    try {
      const { data: invData, error: invErr } = await supabase.functions.invoke(
        'generate-invoice-pdf',
        { body: { order_id: orderId } },
      )
      if (invErr) {
        console.warn(`[${ts()}] generate-invoice-pdf error:`, invErr.message)
      } else if (invData && typeof invData === 'object' && 'invoice_number' in invData) {
        invoiceNumber = String((invData as { invoice_number?: string }).invoice_number ?? '') || null
      }
    } catch (err) {
      console.warn(`[${ts()}] generate-invoice-pdf exception:`, String(err))
    }

    // Email cliente (fire-and-forget — no bloqueamos respuesta).
    supabase.functions
      .invoke('send-order-accepted-customer', {
        body: { order_id: orderId },
        headers: internalSecretHeader(),
      })
      .catch((err) => console.warn(`[${ts()}] send-order-accepted-customer:`, String(err)))

    console.log(`[${ts()}] ✓ order-accept · ${order.order_number} · invoice=${invoiceNumber ?? 'pending'}`)
    return jsonOk({
      status: 'accepted',
      invoice_number: invoiceNumber,
      mode: config.mode,
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-accept:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
