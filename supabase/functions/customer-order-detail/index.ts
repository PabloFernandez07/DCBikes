// supabase/functions/customer-order-detail/index.ts
//
// Feature N — Detalle completo de un pedido para el cliente "logged in"
// via magic link.
//
// Acepta:
//   POST { token, order_id }
//   GET  ?token=...&order_id=...
//
// Verifica:
//   1. Token válido (no expirado).
//   2. El pedido pertenece al email de la sesión.
//   3. El pedido no está soft-deleted.
//
// A diferencia de order-public-get (token HMAC determinista),
// aquí el cliente está "autenticado" via magic link, así que devolvemos
// más datos: dirección completa, datos facturación, tracking, factura.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  CORS_HEADERS,
  getSignedInvoiceUrl,
  jsonError,
  jsonOk,
} from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'

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
    let token: string | null = null
    let orderId: string | null = null

    if (req.method === 'GET') {
      const url = new URL(req.url)
      token = url.searchParams.get('token')
      orderId = url.searchParams.get('order_id')
    } else if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        token?: string
        order_id?: string
      }
      token = body.token ?? null
      orderId = body.order_id ?? null
    } else {
      return jsonError('method not allowed', 405)
    }

    if (!token) return jsonError('token requerido', 400)
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const session = await verifyCustomerSession(supabase, token)
    if (!session) return jsonError('Sesión expirada o inválida', 401)

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        // Datos del pedido + items. Excluye notes_internal (uso admin).
        'id, order_number, status, delivery_method, customer_email, ' +
          'customer_first_name, customer_last_name, customer_phone, ' +
          'shipping_address, shipping_city, shipping_postal_code, ' +
          'shipping_province, shipping_notes, ' +
          'needs_invoice, invoice_business_name, invoice_cif, invoice_address, ' +
          'subtotal_cents, shipping_cents, total_cents, tax_rate, ' +
          'payment_method, rejection_reason, ' +
          'accepted_at, ready_pickup_at, shipped_at, ' +
          'tracking_number, tracking_carrier, created_at, ' +
          'deleted_at, ' +
          'client_modified_at, cancelled_by_customer, ' +
          'order_items(product_id, product_name, product_sku, product_size_label, ' +
          'quantity, unit_price_cents, line_total_cents)',
      )
      .eq('id', orderId)
      .maybeSingle()

    if (oErr) {
      console.error(`[${ts()}] customer-order-detail read error:`, oErr.message)
      return jsonError('error leyendo el pedido', 500)
    }
    if (!order) return jsonError('forbidden', 403)

    // Verifica pertenencia + no soft-deleted (en una sola respuesta 403 para
    // no diferenciar entre "no es tuyo" y "no existe").
    if (
      order.deleted_at !== null ||
      String(order.customer_email).toLowerCase() !== session.email
    ) {
      console.warn(
        `[${ts()}] customer-order-detail forbidden · session=${session.email} · order=${order.order_number}`,
      )
      return jsonError('forbidden', 403)
    }

    // Factura si aplica.
    let invoice: { invoice_number: string; signed_url: string | null } | null = null
    if (
      ['accepted', 'ready_pickup', 'shipped', 'delivered'].includes(
        String(order.status),
      )
    ) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, pdf_storage_path')
        .eq('order_id', order.id)
        .maybeSingle<{ invoice_number: string; pdf_storage_path: string }>()
      if (inv) {
        // TTL 1h (auditoría v2 N15): la URL firmada de factura caduca pronto;
        // si el cliente la necesita de nuevo, vuelve a pedir un detalle.
        const signedUrl = await getSignedInvoiceUrl(
          supabase,
          inv.pdf_storage_path,
          60 * 60,
        )
        invoice = { invoice_number: inv.invoice_number, signed_url: signedUrl }
      }
    }

    // Enriquece items con image_url: 1 query batch a product_images + getPublicUrl.
    // Mantiene el snapshot si el producto fue eliminado (product_id puede ser null).
    const rawItems = (order as { order_items?: Array<Record<string, unknown>> }).order_items ?? []
    const productIds = rawItems
      .map((i) => i.product_id as string | null)
      .filter((id): id is string => !!id)
    const imageMap = new Map<string, string>()
    if (productIds.length > 0) {
      const { data: imgs } = await supabase
        .from('product_images')
        .select('product_id, storage_path')
        .in('product_id', productIds)
        .order('sort_order', { ascending: true })
      for (const img of imgs ?? []) {
        const pid = (img as { product_id: string }).product_id
        if (imageMap.has(pid)) continue // primera imagen por producto
        const { data: urlData } = supabase.storage
          .from('product-images')
          .getPublicUrl((img as { storage_path: string }).storage_path)
        imageMap.set(pid, urlData.publicUrl)
      }
    }
    const items = rawItems.map((i) => ({
      ...i,
      image_url: i.product_id ? imageMap.get(i.product_id as string) ?? null : null,
    }))

    // Stripping deleted_at + order_items del payload (renombramos a items).
    const { deleted_at: _ignored, order_items: _oi, ...orderRest } = order as Record<string, unknown>
    const orderPublic = { ...orderRest, items }

    console.log(
      `[${ts()}] ✓ order-detail · email=${session.email} · order=${order.order_number} · items=${items.length}`,
    )
    return jsonOk({ order: orderPublic, invoice })
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-order-detail:`, String(err))
    return jsonError(String(err))
  }
})
