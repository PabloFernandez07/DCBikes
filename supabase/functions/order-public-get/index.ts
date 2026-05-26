// supabase/functions/order-public-get/index.ts
//
// Fase E — Endpoint público que devuelve datos limitados de un pedido,
// validado por un token HMAC determinista en URL.
//
// Uso:
//   GET /order-public-get?id=<uuid>&token=<hmac>
//   POST /order-public-get  body: { id, token }
//
// Sin auth. CORS abierto para que el frontend público lo consuma.
//
// Devuelve datos NO sensibles:
//   - order_number, status, delivery_method, created_at
//   - subtotal/shipping/total
//   - items: nombre, talla, qty, unit, line_total
//   - customer_first_name (solo nombre, no apellidos ni email)
//   - invoice signed URL si el pedido está accepted+ con factura emitida
//
// NO devuelve: email completo, teléfono, dirección, CIF, ni notas internas.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  CORS_HEADERS,
  getSignedInvoiceUrl,
  jsonError,
  jsonOk,
} from '../_shared/email-utils.ts'
import { verifyOrderToken } from '../_shared/order-token.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...CORS_HEADERS,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
    })
  }
  const ts = () => new Date().toISOString()

  try {
    let id: string | null = null
    let token: string | null = null

    if (req.method === 'GET') {
      const url = new URL(req.url)
      id = url.searchParams.get('id')
      token = url.searchParams.get('token')
    } else if (req.method === 'POST') {
      // Aceptamos `id` o `order_id` (alias) por compatibilidad con frontend
      // que usa `order_id` para consistencia con order-place.
      const body = (await req.json().catch(() => ({}))) as { id?: string; order_id?: string; token?: string }
      id = body.id ?? body.order_id ?? null
      token = body.token ?? null
    } else {
      return jsonError('method not allowed', 405)
    }

    if (!id || !token) return jsonError('id y token requeridos', 400)
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('id inválido', 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, delivery_method, customer_email, customer_first_name, ' +
          'subtotal_cents, shipping_cents, total_cents, created_at, rejection_reason, ' +
          'shipping_city, shipping_postal_code, tracking_number, tracking_carrier, ' +
          'order_items(product_name, product_size_label, quantity, unit_price_cents, line_total_cents)',
      )
      .eq('id', id)
      .maybeSingle()

    if (oErr || !order) {
      // No revelamos si existe el id o no — 403 genérico.
      return jsonError('forbidden', 403)
    }

    // Validar token HMAC.
    const valid = await verifyOrderToken(order.id, order.customer_email, token)
    if (!valid) {
      console.warn(`[${ts()}] token inválido para ${order.order_number}`)
      return jsonError('forbidden', 403)
    }

    // Buscar factura si aplica.
    let invoiceUrl: string | null = null
    let invoiceNumber: string | null = null
    if (['accepted', 'ready_pickup', 'shipped', 'delivered'].includes(order.status)) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, pdf_storage_path')
        .eq('order_id', order.id)
        .maybeSingle()
      if (inv) {
        invoiceNumber = inv.invoice_number
        invoiceUrl = await getSignedInvoiceUrl(supabase, inv.pdf_storage_path, 60 * 60 * 24 * 7)
      }
    }

    return jsonOk({
      order: {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        delivery_method: order.delivery_method,
        customer_first_name: order.customer_first_name,
        subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents,
        total_cents: order.total_cents,
        created_at: order.created_at,
        rejection_reason: order.rejection_reason,
        // Solo la ciudad/CP para que el cliente reconozca su pedido, NO la calle.
        shipping_city: order.shipping_city,
        shipping_postal_code: order.shipping_postal_code,
        tracking_number: order.tracking_number,
        tracking_carrier: order.tracking_carrier,
        items: order.order_items ?? [],
        invoice: invoiceNumber ? { invoice_number: invoiceNumber, signed_url: invoiceUrl } : null,
      },
    })
  } catch (err) {
    console.error(`[${ts()}] ✗ order-public-get:`, String(err))
    return jsonError(String(err))
  }
})
