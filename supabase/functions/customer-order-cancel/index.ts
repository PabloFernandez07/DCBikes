// supabase/functions/customer-order-cancel/index.ts
//
// Feature O — El cliente cancela un pedido en estado 'authorized' desde
// "Mis pedidos" (acceso via magic link).
//
// Flujo:
//   1. Verifica session token (magic link).
//   2. Carga pedido. Valida pertenencia (email) + no soft-deleted + status='authorized'.
//   3. Llama Redsys TransactionType=9 (cancel pre-auth). En mock simula OK.
//   4. Si Redsys falla → 502, NO actualiza status (el dinero sigue retenido).
//   5. UPDATE orders: status='cancelled', cancelled_by_customer=true,
//      client_modified_at=NOW, payment_cancelled_at=NOW, rejection_reason.
//   6. INSERT order_status_history (changed_by=NULL → identifica "cliente").
//   7. Restaura stock + logPayment.
//   8. Dispara email a admin (send-order-cancelled-by-customer-admin) fire-and-forget.
//
// Reutilizamos el mismo helper que usa order-reject (runRedsysOperation con
// op.kind='cancel'). La diferencia esencial es que aquí changed_by=NULL y
// cancelled_by_customer=true (marca de auditoría que distingue cancelación
// del cliente vs cancelación de admin vs auto-cancel por cron).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders, jsonError, jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import {
  alertAdminCancelKo,
  loadConfig,
  loadOrder,
  logPayment,
  logStatusChange,
  restoreStockFor,
  runRedsysOperation,
} from '../_shared/order-admin.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      order_id?: string
    }
    const token = body.token ?? ''
    const orderId = body.order_id ?? ''

    if (!token) return jsonError('token requerido', 400, req)
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Verifica sesión.
    const session = await verifyCustomerSession(supabase, token)
    if (!session) return jsonError('Sesión expirada o inválida', 401, req)

    // 2) Carga pedido + verifica pertenencia. Necesitamos también deleted_at,
    // así que hacemos un select más amplio que loadOrder().
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, delivery_method, payment_pre_auth_id, ' +
          'total_cents, customer_email, deleted_at',
      )
      .eq('id', orderId)
      .maybeSingle<{
        id: string
        order_number: string
        status: string
        delivery_method: string
        payment_pre_auth_id: string | null
        total_cents: number
        customer_email: string
        deleted_at: string | null
      }>()

    if (oErr) {
      console.error(`[${ts()}] customer-order-cancel read error:`, oErr.message)
      return jsonError('error leyendo el pedido', 500, req)
    }
    if (!order) return jsonError('forbidden', 403, req)

    // 403 sin diferenciar: pedido borrado o de otro cliente.
    if (
      order.deleted_at !== null ||
      String(order.customer_email).toLowerCase() !== session.email
    ) {
      console.warn(
        `[${ts()}] customer-order-cancel forbidden · session=${session.email} · order=${order.order_number}`,
      )
      return jsonError('forbidden', 403, req)
    }

    // 3) Solo 'authorized' es cancelable por el cliente.
    if (order.status !== 'authorized') {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No se puede cancelar un pedido en estado ${order.status}`,
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json', ...cors },
        },
      )
    }

    // 4) Carga config Redsys + cancela pre-auth.
    const config = await loadConfig(supabase)

    if (!order.payment_pre_auth_id && config.mode !== 'mock') {
      // En 'test'/'prod' necesitamos el order id de Redsys; sin él no podemos
      // cancelar. Fallback seguro: error 502.
      console.error(
        `[${ts()}] customer-order-cancel sin payment_pre_auth_id · ${order.order_number}`,
      )
      return jsonError('Error cancelando el pago, contacta con la tienda', 502, req)
    }

    // 4-bis) Transición atómica vía RPC ANTES de Redsys. Si Redsys falla
    // luego, revertimos a 'authorized' es complejo (la RPC inversa requeriría
    // un permiso especial). En su lugar, hacemos primero la RPC y, si
    // Redsys devuelve KO, mantenemos el pedido como cancelled pero
    // alertamos al admin vía log (el dinero queda retenido hasta que el
    // admin resuelva manualmente).
    const { data: cancelRpc, error: cancelErr } = await supabase.rpc('cancel_order_by_customer', {
      p_order_id: order.id,
      p_customer_email: session.email,
    })
    if (cancelErr) {
      const msg = cancelErr.message ?? ''
      if (msg.includes('forbidden')) {
        return jsonError('forbidden', 403, req)
      }
      if (msg.includes('invalid state')) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: `No se puede cancelar un pedido en este estado`,
          }),
          { status: 422, headers: { 'Content-Type': 'application/json', ...cors } },
        )
      }
      if (msg.includes('order not found')) {
        return jsonError('pedido no encontrado', 404, req)
      }
      console.error(`[${ts()}] cancel_order_by_customer rpc error:`, msg)
      return jsonError('error procesando pedido', 500, req)
    }
    const rpcRow = Array.isArray(cancelRpc) ? cancelRpc[0] : cancelRpc
    const prevStatus = (rpcRow && typeof rpcRow === 'object' && 'prev_status' in rpcRow)
      ? String((rpcRow as { prev_status?: string }).prev_status ?? 'authorized')
      : 'authorized'

    const cancelResult = await runRedsysOperation({
      config,
      redsysOrderId: order.payment_pre_auth_id ?? '',
      op: { kind: 'cancel', amountCents: order.total_cents },
    })

    if (!cancelResult.ok && !cancelResult.simulated) {
      console.error(
        `[${ts()}] cancel Redsys KO POST-RPC · ${order.order_number} · code=${cancelResult.responseCode}`,
      )
      // Loguea el intento aunque haya fallado (auditoría).
      await logPayment(supabase, order.id, 'cancel', cancelResult, '9')
      // No revertimos la cancelación: el cliente ya recibió "cancelado" de la
      // RPC. El admin debe resolver el reembolso manualmente.
      // 4.2: email de alerta al admin — sin él la retención KO pasaba
      // desapercibida hasta que el cliente reclamase.
      await alertAdminCancelKo(supabase, {
        orderId: order.id,
        orderNumber: order.order_number,
        redsysOrderId: order.payment_pre_auth_id ?? null,
        amountCents: order.total_cents,
        responseCode: cancelResult.responseCode,
        context: 'cancelación por el cliente (customer-order-cancel)',
      })
    }

    // 6) Auditoría + restauración de stock + log de pago.
    const reason = 'Cancelado por el cliente'
    await restoreStockFor(supabase, order.id)
    await logPayment(supabase, order.id, 'cancel', cancelResult, '9')
    await logStatusChange(supabase, order.id, prevStatus, 'cancelled', null, reason)

    // 7) Emails (fire-and-forget). Lanzados en paralelo para reducir latencia.
    //    a) Confirmación al cliente.
    supabase.functions
      .invoke('send-order-cancelled-by-customer-confirmation', {
        body: { order_id: order.id },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(
          `[${ts()}] send-order-cancelled-by-customer-confirmation invoke:`,
          String(err),
        ),
      )
    //    b) Notificación al admin.
    supabase.functions
      .invoke('send-order-cancelled-by-customer-admin', {
        body: { order_id: order.id },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(
          `[${ts()}] send-order-cancelled-by-customer-admin invoke:`,
          String(err),
        ),
      )

    console.log(
      `[${ts()}] ✓ customer-order-cancel · ${order.order_number} · mode=${config.mode}`,
    )
    return jsonOk({ status: 'cancelled', mode: config.mode }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-order-cancel:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
