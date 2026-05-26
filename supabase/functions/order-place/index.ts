// supabase/functions/order-place/index.ts
//
// Fase E — Crea un pedido y devuelve los datos para iniciar el pago Redsys.
//
// Flujo:
//   1. Valida body (zod-light manual).
//   2. Comprueba stock con UPDATE atómico por producto (decrementa solo si hay).
//      Si algún producto no tiene stock → rollback de los UPDATEs ya hechos
//      (re-incremento) y devuelve 409.
//   3. Calcula totales SERVER-SIDE leyendo retail_price de products + settings
//      shipping_flat_rate_cents / shipping_free_threshold_cents / tax_rate_default.
//   4. Reserva número correlativo con RPC next_order_number(year).
//   5. INSERT orders (status='pending') + INSERT order_items (snapshot).
//   6. INSERT order_status_history (pending → pending, creación).
//   7. Genera public_access_token HMAC(order_id + email).
//   8. Según RedsysConfig.mode:
//        - mock: devuelve mock_url donde el frontend simula el pago.
//        - test/prod: construye payload Redsys y firma HMAC SHA-256 V1.
//   9. Response: { ok, order_id, order_number, public_token, payment }.
//
// El status sigue siendo 'pending' hasta que el webhook redsys-notification
// lo mueva a 'authorized' (o 'payment_failed').

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  CORS_HEADERS,
  asInt,
  asString,
  getSettings,
  jsonError,
  jsonOk,
} from '../_shared/email-utils.ts'
import { loadRedsysConfig, type RedsysConfig } from '../_shared/redsys-config.ts'
import { buildRedsysOrderId, signRedsysPayload } from '../_shared/redsys-sign.ts'
import { generateOrderToken } from '../_shared/order-token.ts'

/* ─────────────── Tipos input ─────────────── */

interface InputItem {
  product_id: string
  quantity: number
}

interface InputCustomer {
  first_name: string
  last_name: string
  email: string
  phone: string
}

interface InputShippingAddress {
  address: string
  city: string
  postal_code: string
  province: string
  notes?: string | null
}

interface InputInvoiceB2B {
  business_name: string
  cif: string
  address: string
}

interface InputConsents {
  accepted_terms: boolean
  accepted_privacy: boolean
  marketing_opt_in?: boolean
}

interface InputBody {
  items: InputItem[]
  customer: InputCustomer
  delivery_method: 'shipping' | 'pickup'
  shipping_address?: InputShippingAddress | null
  needs_invoice?: boolean
  invoice_b2b?: InputInvoiceB2B | null
  consents: InputConsents
}

/* ─────────────── Validación ─────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateBody(raw: unknown): { ok: true; body: InputBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'body inválido' }
  const b = raw as Record<string, unknown>

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, error: 'items vacío' }
  }
  if (b.items.length > 50) {
    return { ok: false, error: 'demasiados items (máx 50)' }
  }
  const items: InputItem[] = []
  for (const it of b.items as Array<Record<string, unknown>>) {
    const product_id = asString(it.product_id)
    const quantity = asInt(it.quantity, 0)
    if (!product_id || !/^[0-9a-f-]{36}$/i.test(product_id)) {
      return { ok: false, error: `product_id inválido: ${product_id}` }
    }
    if (quantity <= 0 || quantity > 99) {
      return { ok: false, error: `quantity inválida para ${product_id}` }
    }
    items.push({ product_id, quantity })
  }

  const c = (b.customer ?? {}) as Record<string, unknown>
  const customer: InputCustomer = {
    first_name: asString(c.first_name).trim(),
    last_name: asString(c.last_name).trim(),
    email: asString(c.email).trim().toLowerCase(),
    phone: asString(c.phone).trim(),
  }
  if (!customer.first_name || !customer.last_name) {
    return { ok: false, error: 'nombre/apellidos requeridos' }
  }
  if (!EMAIL_RE.test(customer.email)) {
    return { ok: false, error: 'email inválido' }
  }
  if (customer.phone.length < 6) {
    return { ok: false, error: 'teléfono inválido' }
  }

  const delivery_method = b.delivery_method
  if (delivery_method !== 'shipping' && delivery_method !== 'pickup') {
    return { ok: false, error: 'delivery_method inválido' }
  }

  let shipping_address: InputShippingAddress | null = null
  if (delivery_method === 'shipping') {
    const sa = (b.shipping_address ?? {}) as Record<string, unknown>
    shipping_address = {
      address: asString(sa.address).trim(),
      city: asString(sa.city).trim(),
      postal_code: asString(sa.postal_code).trim(),
      province: asString(sa.province).trim(),
      notes: asString(sa.notes).trim() || null,
    }
    if (
      !shipping_address.address ||
      !shipping_address.city ||
      !shipping_address.postal_code ||
      !shipping_address.province
    ) {
      return { ok: false, error: 'dirección de envío incompleta' }
    }
    if (!/^\d{5}$/.test(shipping_address.postal_code)) {
      return { ok: false, error: 'código postal inválido' }
    }
  }

  const needs_invoice = !!b.needs_invoice
  let invoice_b2b: InputInvoiceB2B | null = null
  if (needs_invoice) {
    const inv = (b.invoice_b2b ?? {}) as Record<string, unknown>
    invoice_b2b = {
      business_name: asString(inv.business_name).trim(),
      cif: asString(inv.cif).trim().toUpperCase(),
      address: asString(inv.address).trim(),
    }
    if (!invoice_b2b.business_name || !invoice_b2b.cif || !invoice_b2b.address) {
      return { ok: false, error: 'datos de factura B2B incompletos' }
    }
  }

  const co = (b.consents ?? {}) as Record<string, unknown>
  const consents: InputConsents = {
    accepted_terms: !!co.accepted_terms,
    accepted_privacy: !!co.accepted_privacy,
    marketing_opt_in: !!co.marketing_opt_in,
  }
  if (!consents.accepted_terms || !consents.accepted_privacy) {
    return { ok: false, error: 'debes aceptar términos y política de privacidad' }
  }

  return {
    ok: true,
    body: {
      items,
      customer,
      delivery_method,
      shipping_address,
      needs_invoice,
      invoice_b2b,
      consents,
    },
  }
}

/* ─────────────── Stock con UPDATE atómico ─────────────── */

interface StockedProduct {
  id: string
  name: string
  sku: string | null
  size_label: string | null
  retail_price: number
  is_purchasable: boolean
  decremented: number
}

/**
 * Para cada item: UPDATE products SET stock = stock - qty
 *                  WHERE id=? AND is_purchasable=true AND active=true AND stock>=qty
 *                  RETURNING *.
 * Si alguno falla → revertir los anteriores (re-incrementar).
 */
async function reserveStock(
  supabase: SupabaseClient,
  items: InputItem[],
): Promise<
  | { ok: true; products: StockedProduct[] }
  | { ok: false; error: string; conflictProductId?: string }
> {
  const reserved: StockedProduct[] = []
  for (const it of items) {
    // Implementación: leer producto, validar, hacer UPDATE con condición.
    // Usamos RPC-style con SQL via .from().update() y filtro stock>=qty.
    const { data: prod, error: pErr } = await supabase
      .from('products')
      .select('id, name, sku, size_label, retail_price, is_purchasable, active, stock')
      .eq('id', it.product_id)
      .maybeSingle()

    if (pErr || !prod) {
      await rollbackReserved(supabase, reserved)
      return { ok: false, error: `producto no encontrado: ${it.product_id}`, conflictProductId: it.product_id }
    }
    if (!prod.is_purchasable || !prod.active) {
      await rollbackReserved(supabase, reserved)
      return { ok: false, error: `producto no disponible para compra online: ${prod.name}`, conflictProductId: prod.id }
    }
    if ((prod.stock ?? 0) < it.quantity) {
      await rollbackReserved(supabase, reserved)
      return { ok: false, error: `sin stock suficiente: ${prod.name}`, conflictProductId: prod.id }
    }

    // UPDATE atómico con condición.
    const { data: updRows, error: uErr } = await supabase
      .from('products')
      .update({ stock: (prod.stock ?? 0) - it.quantity })
      .eq('id', it.product_id)
      .eq('stock', prod.stock) // optimistic concurrency: solo si el stock NO cambió
      .select('id, stock')

    if (uErr || !updRows || updRows.length === 0) {
      await rollbackReserved(supabase, reserved)
      return {
        ok: false,
        error: `conflicto de stock (otro pedido en curso): ${prod.name}. Reintenta.`,
        conflictProductId: prod.id,
      }
    }

    reserved.push({
      id: prod.id,
      name: prod.name,
      sku: prod.sku,
      size_label: prod.size_label,
      retail_price: Number(prod.retail_price),
      is_purchasable: prod.is_purchasable,
      decremented: it.quantity,
    })
  }
  return { ok: true, products: reserved }
}

async function rollbackReserved(
  supabase: SupabaseClient,
  reserved: StockedProduct[],
): Promise<void> {
  for (const r of reserved) {
    const { data: cur } = await supabase
      .from('products')
      .select('stock')
      .eq('id', r.id)
      .maybeSingle()
    if (!cur) continue
    await supabase
      .from('products')
      .update({ stock: (cur.stock ?? 0) + r.decremented })
      .eq('id', r.id)
  }
}

/* ─────────────── Cálculo totales ─────────────── */

interface Totals {
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  tax_rate: number
}

function computeTotals(
  products: StockedProduct[],
  items: InputItem[],
  deliveryMethod: 'shipping' | 'pickup',
  settings: Record<string, unknown>,
): Totals {
  // retail_price está en euros (numeric(10,2)). Convertir a céntimos.
  let subtotalCents = 0
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const p = products[i]
    const unitCents = Math.round(p.retail_price * 100)
    subtotalCents += unitCents * it.quantity
  }

  const flat = asInt(settings.shipping_flat_rate_cents, 690)
  const threshold = asInt(settings.shipping_free_threshold_cents, 5000)
  let shippingCents = 0
  if (deliveryMethod === 'shipping') {
    shippingCents = subtotalCents >= threshold ? 0 : flat
  }

  const taxRateRaw = settings.tax_rate_default
  const taxRate =
    typeof taxRateRaw === 'number' ? taxRateRaw : parseFloat(String(taxRateRaw ?? '21.00')) || 21.0

  return {
    subtotal_cents: subtotalCents,
    shipping_cents: shippingCents,
    total_cents: subtotalCents + shippingCents,
    tax_rate: taxRate,
  }
}

/* ─────────────── Construcción payload Redsys ─────────────── */

async function buildRedsysFormData(opts: {
  config: RedsysConfig
  orderId: string // 12 chars Ds_Merchant_Order
  amountCents: number
  customerEmail: string
  description: string
}): Promise<{
  action_url: string
  Ds_SignatureVersion: 'HMAC_SHA256_V1'
  Ds_MerchantParameters: string
  Ds_Signature: string
}> {
  const { config, orderId, amountCents, customerEmail, description } = opts

  const params: Record<string, string | number> = {
    DS_MERCHANT_MERCHANTCODE: config.merchantCode,
    DS_MERCHANT_TERMINAL: config.terminal,
    DS_MERCHANT_ORDER: orderId,
    DS_MERCHANT_AMOUNT: String(amountCents),
    DS_MERCHANT_CURRENCY: '978',
    // TransactionType 1 = pre-autorización.
    DS_MERCHANT_TRANSACTIONTYPE: '1',
    DS_MERCHANT_PRODUCTDESCRIPTION: description.slice(0, 125),
    DS_MERCHANT_MERCHANTNAME: config.merchantName.slice(0, 25),
    DS_MERCHANT_MERCHANTURL: config.paymentNotificationUrl,
    DS_MERCHANT_URLOK: config.paymentOkUrl,
    DS_MERCHANT_URLKO: config.paymentKoUrl,
    DS_MERCHANT_PAYMETHODS: config.payMethods,
    DS_MERCHANT_CONSUMERLANGUAGE: '001', // ES
    DS_MERCHANT_TITULAR: customerEmail.slice(0, 60),
  }

  const signed = await signRedsysPayload(params, config.secretBase64)
  return {
    action_url: config.endpoint,
    Ds_SignatureVersion: signed.Ds_SignatureVersion,
    Ds_MerchantParameters: signed.Ds_MerchantParameters,
    Ds_Signature: signed.Ds_Signature,
  }
}

/* ─────────────── Handler ─────────────── */

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405)

    const rawBody = await req.json().catch(() => null)
    const v = validateBody(rawBody)
    if (!v.ok) return jsonError(v.error, 400)
    const body = v.body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Reservar stock.
    const stockRes = await reserveStock(supabase, body.items)
    if (!stockRes.ok) {
      return jsonError(stockRes.error, 409)
    }
    const products = stockRes.products

    // 2. Calcular totales.
    const settings = await getSettings(supabase, [
      'shipping_flat_rate_cents',
      'shipping_free_threshold_cents',
      'tax_rate_default',
      'order_series_prefix',
    ])
    const totals = computeTotals(products, body.items, body.delivery_method, settings)
    const orderPrefix = asString(settings.order_series_prefix, 'ORD')

    // 3. Numeración correlativa.
    const year = new Date().getUTCFullYear()
    const { data: nextNumData, error: numErr } = await supabase.rpc('next_order_number', {
      p_year: year,
    })
    if (numErr || nextNumData == null) {
      await rollbackReserved(supabase, products)
      console.error(`[${ts()}] next_order_number error:`, numErr?.message)
      return jsonError('no se pudo reservar número de pedido', 500)
    }
    const seq = String(nextNumData).padStart(4, '0')
    const orderNumber = `${orderPrefix}-${year}-${seq}`

    // 4. Cargar config Redsys (puede fallar si mode=prod sin env vars).
    let config: RedsysConfig
    try {
      config = await loadRedsysConfig(supabase)
    } catch (err) {
      await rollbackReserved(supabase, products)
      console.error(`[${ts()}] redsys-config:`, String(err))
      return jsonError(String(err), 500)
    }

    // 5. Pre-generar Ds_Merchant_Order para correlar webhook (test/prod).
    // En modo mock también lo usamos como id interno aunque no se firme nada.
    const redsysOrderId = buildRedsysOrderId(orderNumber)

    // 6. INSERT orders.
    const now = new Date().toISOString()
    const { data: insertedOrder, error: insErr } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        status: 'pending',
        delivery_method: body.delivery_method,
        customer_email: body.customer.email,
        customer_phone: body.customer.phone,
        customer_first_name: body.customer.first_name,
        customer_last_name: body.customer.last_name,
        shipping_address: body.shipping_address?.address ?? null,
        shipping_city: body.shipping_address?.city ?? null,
        shipping_postal_code: body.shipping_address?.postal_code ?? null,
        shipping_province: body.shipping_address?.province ?? null,
        shipping_notes: body.shipping_address?.notes ?? null,
        needs_invoice: body.needs_invoice ?? false,
        invoice_business_name: body.invoice_b2b?.business_name ?? null,
        invoice_cif: body.invoice_b2b?.cif ?? null,
        invoice_address: body.invoice_b2b?.address ?? null,
        subtotal_cents: totals.subtotal_cents,
        shipping_cents: totals.shipping_cents,
        total_cents: totals.total_cents,
        tax_rate: totals.tax_rate,
        payment_provider: 'redsys',
        payment_pre_auth_id: redsysOrderId,
        accepted_terms_at: now,
        accepted_privacy_at: now,
        marketing_opt_in: !!body.consents.marketing_opt_in,
      })
      .select('id')
      .single<{ id: string }>()

    if (insErr || !insertedOrder) {
      await rollbackReserved(supabase, products)
      console.error(`[${ts()}] insert order error:`, insErr?.message)
      return jsonError('no se pudo crear el pedido', 500)
    }
    const orderId = insertedOrder.id

    // 7. INSERT order_items (snapshot).
    const itemsRows = body.items.map((it, i) => {
      const p = products[i]
      const unitCents = Math.round(p.retail_price * 100)
      return {
        order_id: orderId,
        product_id: it.product_id,
        product_name: p.name,
        product_sku: p.sku,
        product_size_label: p.size_label,
        unit_price_cents: unitCents,
        quantity: it.quantity,
        line_total_cents: unitCents * it.quantity,
      }
    })
    const { error: itemsErr } = await supabase.from('order_items').insert(itemsRows)
    if (itemsErr) {
      console.error(`[${ts()}] insert order_items error:`, itemsErr.message)
      // Best-effort cleanup. Stock ya descontado se queda comprometido al
      // pedido pending; el cron de auto-cancel lo liberará vía rechazo.
      await supabase.from('orders').delete().eq('id', orderId)
      await rollbackReserved(supabase, products)
      return jsonError('no se pudieron guardar las líneas', 500)
    }

    // 8. Historial.
    await supabase.from('order_status_history').insert({
      order_id: orderId,
      from_status: null,
      to_status: 'pending',
      reason: 'order created',
    })

    // 9. Public access token.
    const publicToken = await generateOrderToken(orderId, body.customer.email)

    // 10. Payload según modo.
    if (config.mode === 'mock') {
      // mock_url debe ser RELATIVO (path-only) para que React Router lo trate
      // como ruta interna. Si fuera absoluto (https://dominio/...), navigate()
      // lo concatenaría al pathname actual y daría 404.
      const mockUrl = `/mock-redsys-pago/${encodeURIComponent(orderId)}?token=${encodeURIComponent(
        publicToken,
      )}`
      console.log(`[${ts()}] ✓ order-place mock · ${orderNumber} · total=${totals.total_cents}c`)
      return jsonOk({
        order_id: orderId,
        order_number: orderNumber,
        public_token: publicToken,
        payment: {
          mode: 'mock',
          mock_url: mockUrl,
          redsys_order_id: redsysOrderId,
        },
      })
    }

    // mode test / prod
    const description = `Pedido ${orderNumber} DC Bikes Cantabria`
    const formData = await buildRedsysFormData({
      config,
      orderId: redsysOrderId,
      amountCents: totals.total_cents,
      customerEmail: body.customer.email,
      description,
    })

    console.log(
      `[${ts()}] ✓ order-place ${config.mode} · ${orderNumber} · redsys=${redsysOrderId} · total=${totals.total_cents}c`,
    )
    return jsonOk({
      order_id: orderId,
      order_number: orderNumber,
      public_token: publicToken,
      payment: {
        mode: 'redsys',
        form_data: formData,
      },
    })
  } catch (err) {
    console.error(`[${ts()}] ✗ order-place:`, String(err))
    return jsonError(String(err))
  }
})
