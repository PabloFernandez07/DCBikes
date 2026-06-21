// supabase/functions/customer-return-request/index.ts
//
// Devoluciones — Paso 2: el cliente (logged in via magic link) solicita la
// devolución de una o varias líneas de un pedido.
//
// Acepta:
//   POST { token, order_id, items: [{ order_item_id, quantity }], reason_code, reason_text? }
//
// Flujo:
//   1. Verifica session token → email.
//   2. Valida payload (items no vacío, reason_code en el set permitido).
//   3. Llama a la RPC create_return_request, que valida elegibilidad de forma
//      autoritativa (pertenencia, plazo, cupo, categoría devolvible) y crea
//      order_returns + order_return_items de forma atómica. Si la RPC lanza
//      una excepción de elegibilidad → 422 con el mensaje.
//   4. Dispara emails (fire-and-forget) al cliente y al admin.
//   5. Devuelve { ok, return_number }.
//
// La validación de negocio vive en la RPC (no aquí): este endpoint replica el
// chequeo de elegibilidad de customer-return-eligibility solo a efectos de UX,
// pero la fuente de verdad transaccional es create_return_request.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { jsonError, jsonOk, corsPreflightResponse, maskEmail } from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'
import { internalSecretHeader } from '../_shared/security.ts'

// Motivos permitidos para la devolución. Congelado con el frontend; la RPC
// puede revalidarlo, pero rechazamos barato aquí antes de tocar BD.
// Set CANÓNICO — debe coincidir con el CHECK de order_returns.reason_code (0066)
// y con el frontend (ReturnRequestModal) y backend-rpcs (store_pays_return).
const ALLOWED_REASON_CODES = new Set([
  'wrong_size', // Talla incorrecta
  'not_liked', // No me convence
  'defective', // Producto defectuoso  → store_pays_return
  'damaged', // Llegó dañado          → store_pays_return
  'wrong_item', // Me enviaron otro    → store_pays_return
  'other', // Otro motivo
])

interface RequestItem {
  order_item_id: string
  quantity: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      order_id?: string
      items?: unknown
      reason_code?: string
      reason_text?: string
    }
    const token = body.token ?? ''
    const orderId = body.order_id ?? ''
    const reasonCode = body.reason_code ?? ''
    const reasonText = typeof body.reason_text === 'string' ? body.reason_text.trim() : null

    if (!token) return jsonError('token requerido', 400, req)
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }
    if (!ALLOWED_REASON_CODES.has(reasonCode)) {
      return jsonError('motivo de devolución inválido', 400, req)
    }

    // Normaliza y valida items: array no vacío de {order_item_id uuid, quantity>0}.
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return jsonError('debes seleccionar al menos un producto', 400, req)
    }
    const items: RequestItem[] = []
    for (const raw of body.items) {
      const it = raw as { order_item_id?: unknown; quantity?: unknown }
      const id = typeof it.order_item_id === 'string' ? it.order_item_id : ''
      const qty = Number(it.quantity)
      if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
        return jsonError('order_item_id inválido', 400, req)
      }
      if (!Number.isInteger(qty) || qty <= 0) {
        return jsonError('cantidad inválida', 400, req)
      }
      items.push({ order_item_id: id, quantity: qty })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1) Verifica sesión.
    const session = await verifyCustomerSession(supabase, token)
    if (!session) return jsonError('Sesión expirada o inválida', 401, req)

    // 2) RPC autoritativa: valida elegibilidad + crea la RMA atómicamente.
    //    La pertenencia del pedido al email se valida dentro de la RPC
    //    (p_customer_email), así que no la duplicamos aquí.
    const { data: rpcData, error: rpcErr } = await supabase.rpc('create_return_request', {
      p_order_id: orderId,
      p_customer_email: session.email,
      p_items: items,
      p_reason_code: reasonCode,
      p_reason_text: reasonText,
    })

    if (rpcErr) {
      const msg = rpcErr.message ?? ''
      // Errores de elegibilidad/validación de negocio → 422 con el mensaje de
      // la RPC (plazo expirado, cupo excedido, categoría no devolvible, etc.).
      // Distinguimos un puñado de casos por código si la RPC los marca; el
      // resto cae como 422 genérico salvo que sea claramente interno.
      if (msg.includes('forbidden') || msg.includes('not found')) {
        return jsonError('forbidden', 403, req)
      }
      console.warn(`[${ts()}] create_return_request rejected · order=${orderId} · ${msg}`)
      return jsonError(msg || 'No se pudo crear la devolución', 422, req)
    }

    // La RPC devuelve la fila creada (objeto o array de un elemento).
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData
    const returnId =
      row && typeof row === 'object' && 'id' in row
        ? String((row as { id: string }).id)
        : null
    const returnNumber =
      row && typeof row === 'object' && 'return_number' in row
        ? String((row as { return_number: string }).return_number)
        : null

    if (!returnId) {
      console.error(`[${ts()}] create_return_request sin id en respuesta · order=${orderId}`)
      return jsonError('error creando la devolución', 500, req)
    }

    // 3) Emails (fire-and-forget, en paralelo). No bloquean la respuesta:
    //    si fallan, la RMA ya existe y el admin la verá en su panel.
    supabase.functions
      .invoke('send-return-requested-customer', {
        body: { return_id: returnId },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(`[${ts()}] send-return-requested-customer invoke:`, String(err)),
      )
    supabase.functions
      .invoke('send-return-requested-admin', {
        body: { return_id: returnId },
        headers: internalSecretHeader(),
      })
      .catch((err) =>
        console.warn(`[${ts()}] send-return-requested-admin invoke:`, String(err)),
      )

    console.log(
      `[${ts()}] ✓ return-request · email=${maskEmail(session.email)} · order=${orderId} · rma=${returnNumber ?? returnId}`,
    )
    return jsonOk({ return_number: returnNumber }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-return-request:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
