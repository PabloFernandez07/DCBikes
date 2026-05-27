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
// B-16 (Sprint 2 V5): tampoco shipping_city ni shipping_postal_code —
// el cliente recibe esos datos en email de confirmación y en su sesión
// magic-link; en el endpoint público sumaban superficie sin valor real.
//
// B-15 (Sprint 2 V5): rate-limit por IP, 30 req/min, en tabla
// `order_public_get_rate`. Si se excede → 429.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  getSignedInvoiceUrl,
  jsonError,
  jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyOrderToken } from '../_shared/order-token.ts'

const MAX_PER_MIN = 30

interface RateLimitResult {
  allowed: boolean
  count: number
}

function clientIp(req: Request): string {
  // Misma prioridad que order-place: cf-connecting-ip > primer hop de XFF.
  const cf = (req.headers.get('cf-connecting-ip') ?? '').trim()
  if (cf) return cf.slice(0, 64)
  const xff = (req.headers.get('x-forwarded-for') ?? '').trim()
  if (xff) return xff.split(',')[0].trim().slice(0, 64)
  return 'unknown'
}

/**
 * B-15: rate-limit por IP/minuto en tabla `order_public_get_rate`.
 *
 * Bucket alineado al minuto UTC. PK=(ip_address, bucket_minute) garantiza
 * que dos requests concurrentes del mismo IP en el mismo minuto se
 * serializan a nivel de fila (atómico).
 *
 * Política fail-open: si la tabla está caída o hay errores inesperados,
 * NO bloqueamos el endpoint (preferimos servir un legit con rate-limit
 * degradado que romper a todos los clientes con 503).
 */
async function checkRateLimit(
  supabase: SupabaseClient,
  ip: string,
): Promise<RateLimitResult> {
  const now = new Date()
  const bucket = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    0,
    0,
  )).toISOString()

  // Intento 1: INSERT. Si la fila no existe, count=1, todo bien.
  const { error: insErr } = await supabase
    .from('order_public_get_rate')
    .insert({ ip_address: ip, bucket_minute: bucket, request_count: 1 })

  if (!insErr) {
    return { allowed: true, count: 1 }
  }

  const code = (insErr as { code?: string }).code
  if (code !== '23505') {
    // Error inesperado distinto de unique_violation → fail-open + log.
    console.warn('[order-public-get] rate-limit insert error:', insErr.message)
    return { allowed: true, count: 0 }
  }

  // Intento 2: leer + incrementar. Supabase-js no expone `col = col + 1`
  // directamente; aceptamos under-count en race extrema (dos requests
  // simultáneos pueden contar como uno solo). El límite es defensivo,
  // no exacto.
  const { data: row, error: selErr } = await supabase
    .from('order_public_get_rate')
    .select('request_count')
    .eq('ip_address', ip)
    .eq('bucket_minute', bucket)
    .maybeSingle()

  if (selErr || !row) {
    console.warn('[order-public-get] rate-limit select error:', selErr?.message)
    return { allowed: true, count: 0 }
  }

  const nextCount = (row.request_count ?? 0) + 1
  const { error: updErr } = await supabase
    .from('order_public_get_rate')
    .update({ request_count: nextCount })
    .eq('ip_address', ip)
    .eq('bucket_minute', bucket)

  if (updErr) {
    console.warn('[order-public-get] rate-limit update error:', updErr.message)
    return { allowed: true, count: nextCount }
  }

  return { allowed: nextCount <= MAX_PER_MIN, count: nextCount }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
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
      return jsonError('method not allowed', 405, req)
    }

    if (!id || !token) return jsonError('id y token requeridos', 400, req)
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError('id inválido', 400, req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // B-15: rate-limit por IP (30 req/min).
    const ip = clientIp(req)
    const rate = await checkRateLimit(supabase, ip)
    if (!rate.allowed) {
      console.warn(`[${ts()}] rate-limit excedido · ip=${ip} · count=${rate.count}`)
      return jsonError('demasiadas peticiones, vuelve a intentarlo en un minuto', 429, req)
    }

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, delivery_method, customer_email, customer_first_name, ' +
          'subtotal_cents, shipping_cents, total_cents, created_at, rejection_reason, ' +
          'tracking_number, tracking_carrier, ' +
          'order_items(product_name, product_size_label, quantity, unit_price_cents, line_total_cents)',
      )
      .eq('id', id)
      .maybeSingle()

    if (oErr || !order) {
      // No revelamos si existe el id o no — 403 genérico.
      return jsonError('forbidden', 403, req)
    }

    // Validar token HMAC.
    const valid = await verifyOrderToken(order.id, order.customer_email, token)
    if (!valid) {
      console.warn(`[${ts()}] token inválido para ${order.order_number}`)
      return jsonError('forbidden', 403, req)
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
        // TTL 1h (auditoría v2 N15): URL firmada de factura caduca pronto.
        invoiceUrl = await getSignedInvoiceUrl(supabase, inv.pdf_storage_path, 60 * 60)
      }
    }

    // B-16: payload mínimo. NO incluye shipping_city/shipping_postal_code.
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
        tracking_number: order.tracking_number,
        tracking_carrier: order.tracking_carrier,
        items: order.order_items ?? [],
        invoice: invoiceNumber ? { invoice_number: invoiceNumber, signed_url: invoiceUrl } : null,
      },
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-public-get:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
