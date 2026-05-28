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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  CORS_HEADERS,
  asInt,
  asString,
  getSettings,
  jsonError,
  jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { loadRedsysConfig, type RedsysConfig } from '../_shared/redsys-config.ts'
import { buildRedsysOrderId, signRedsysPayload } from '../_shared/redsys-sign.ts'
import { generateOrderToken } from '../_shared/order-token.ts'
import { internalSecretHeader } from '../_shared/security.ts'

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
  /**
   * Sprint 1 V5 (F-01): rename de accepted_privacy → read_privacy
   * (confirmación de lectura, no consentimiento RGPD; base legal contrato
   * art. 6.1.b). Se acepta cualquiera de los dos por compatibilidad mientras
   * el frontend converge al nuevo nombre.
   */
  read_privacy: boolean
}

interface InputBody {
  items: InputItem[]
  customer: InputCustomer
  delivery_method: 'shipping' | 'pickup'
  shipping_address?: InputShippingAddress | null
  needs_invoice?: boolean
  invoice_b2b?: InputInvoiceB2B | null
  consents: InputConsents
  /** Versión vigente de los Términos y Condiciones aceptados (prueba RGPD). */
  terms_version?: string | null
  /** Versión vigente de la Política de Privacidad aceptada (prueba RGPD). */
  privacy_version?: string | null
}

/* ─────────────── Validación ─────────────── */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Versión por defecto de los documentos legales para consent_audit (Q-04 V5).
 * El frontend puede sobreescribirla enviando terms_version/privacy_version en
 * el payload; si no, se cae a esta constante o al env var CONSENT_VERSION.
 */
const DEFAULT_CONSENT_VERSION =
  Deno.env.get('CONSENT_VERSION') ?? '2026-05-27-v5'

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
    // read_privacy es el nombre nuevo (Sprint 1 V5); accepted_privacy se
    // sigue aceptando hasta que el frontend complete el rename.
    read_privacy: !!co.read_privacy || !!co.accepted_privacy,
  }
  if (!consents.accepted_terms || !consents.read_privacy) {
    return { ok: false, error: 'debes aceptar términos y confirmar lectura de privacidad' }
  }

  // Versiones de los documentos legales aceptados (opcionales — el frontend
  // se actualizará gradualmente para enviarlas; mientras tanto se guardan
  // como null y seguimos teniendo accepted_*_at como evidencia mínima).
  const terms_version = asString(b.terms_version).trim().slice(0, 32) || null
  const privacy_version = asString(b.privacy_version).trim().slice(0, 32) || null

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
      terms_version,
      privacy_version,
    },
  }
}

/* ─────────────── Stock snapshot ─────────────── */

// Snapshot que viaja a order_items tras llamar a reserve_stock RPC.
interface StockedProduct {
  id: string
  name: string
  sku: string | null
  size_label: string | null
  retail_price: number
  is_purchasable: boolean
  decremented: number
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
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    // B-27: rechazo temprano de payloads desproporcionados (anti-DoS).
    const cl = Number(req.headers.get('content-length') ?? '0')
    if (Number.isFinite(cl) && cl > 8192) {
      return jsonError('payload demasiado grande', 413, req)
    }

    const rawBody = await req.json().catch(() => null)
    const v = validateBody(rawBody)
    if (!v.ok) return jsonError(v.error, 400, req)
    const body = v.body

    // Captura IP/UA del cliente para prueba probatoria del consentimiento
    // (RGPD art. 7.1). Priorizamos cf-connecting-ip (si está detrás de
    // Cloudflare/Supabase Edge), luego primer hop de x-forwarded-for.
    const xff = req.headers.get('x-forwarded-for') ?? ''
    const cfip = req.headers.get('cf-connecting-ip') ?? ''
    const consent_ip = (cfip || xff.split(',')[0] || '').trim().slice(0, 64) || null
    const consent_user_agent =
      (req.headers.get('user-agent') ?? '').slice(0, 512) || null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Reservar stock — RPC atómica (B-07 / S2-B2 V5).
    // reserve_stock(p_items jsonb) hace UPDATE ... WHERE stock >= qty por
    // cada item dentro de una sola transacción del lado Postgres. Si algún
    // item no tiene stock → raise → toda la operación se revierte.
    //
    // Aún necesitamos cargar los products tras reservar para conocer
    // retail_price/name/sku/size_label (snapshot en order_items).
    const reserveItems = body.items.map((it) => ({ product_id: it.product_id, qty: it.quantity }))
    const { error: reserveError } = await supabase.rpc('reserve_stock', { p_items: reserveItems })
    if (reserveError) {
      const msg = reserveError.message || ''
      if (msg.includes('insufficient stock')) {
        return jsonError('Sin stock para uno o más productos', 409, req)
      }
      console.error(`[${ts()}] reserve_stock error:`, msg)
      return jsonError('error reservando stock', 500, req)
    }

    // Cargar productos reservados para el snapshot de order_items.
    // Si alguno desapareció entre la reserva y este SELECT (delete físico),
    // restauramos stock y abortamos.
    const productIds = body.items.map((it) => it.product_id)
    const { data: prodRows, error: prodErr } = await supabase
      .from('products')
      .select('id, name, sku, size_label, retail_price, is_purchasable, active')
      .in('id', productIds)
    if (prodErr || !prodRows || prodRows.length !== productIds.length) {
      await supabase.rpc('restore_stock', { p_items: reserveItems })
      console.error(`[${ts()}] product fetch post-reserve error:`, prodErr?.message)
      return jsonError('producto no encontrado', 409, req)
    }
    const prodById = new Map(prodRows.map((p) => [p.id, p]))
    const products: StockedProduct[] = body.items.map((it) => {
      const p = prodById.get(it.product_id)!
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        size_label: p.size_label,
        retail_price: Number(p.retail_price),
        is_purchasable: p.is_purchasable,
        decremented: it.quantity,
      }
    })
    // Defensa adicional: si algún producto vino marcado no-purchasable o
    // inactivo (raza con admin que lo desactivó), abortar.
    for (const p of products) {
      if (!p.is_purchasable) {
        await supabase.rpc('restore_stock', { p_items: reserveItems })
        return jsonError(`producto no disponible para compra online: ${p.name}`, 409, req)
      }
    }

    // 2. Calcular totales.
    const settings = await getSettings(supabase, [
      'shipping_flat_rate_cents',
      'shipping_free_threshold_cents',
      'tax_rate_default',
      'order_series_prefix',
      'legal_company_name',
      'legal_company_cif',
      'legal_company_address',
      'require_payment_otp',
      'verifactu_mode',
    ])

    // B-22: gate Verifactu (RD 1007/2023). El envío real a la AEAT está aplazado;
    // mientras `verifactu_mode='no_verifactu'` las facturas se emiten sin envío.
    // Solo dejamos rastro de que el modo está activo: generate-invoice-pdf será
    // quien marque `verifactu_status='pending'` en la factura resultante.
    const verifactuActive =
      typeof settings.verifactu_mode === 'string' &&
      settings.verifactu_mode.trim().toLowerCase() === 'verifactu'
    if (verifactuActive) {
      console.log(`[${ts()}] order-place · verifactu_mode activo — la factura quedará pending de envío AEAT`)
    }

    // Gate fiscal (L-02 / C-02): bloquear pedidos si los datos legales no están
    // configurados — sin ellos no se puede emitir factura legal válida.
    const legalReady =
      typeof settings.legal_company_name === 'string' && settings.legal_company_name.trim().length > 0 &&
      typeof settings.legal_company_cif === 'string' && settings.legal_company_cif.trim().length > 0 &&
      typeof settings.legal_company_address === 'string' && settings.legal_company_address.trim().length > 0
    if (!legalReady) {
      return jsonError('Tienda no operativa temporalmente. Estamos completando la configuración fiscal.', 503, req)
    }
    const totals = computeTotals(products, body.items, body.delivery_method, settings)
    const orderPrefix = asString(settings.order_series_prefix, 'ORD')

    // 3. Numeración correlativa.
    const year = new Date().getUTCFullYear()
    const { data: nextNumData, error: numErr } = await supabase.rpc('next_order_number', {
      p_year: year,
    })
    if (numErr || nextNumData == null) {
      await supabase.rpc('restore_stock', { p_items: reserveItems })
      console.error(`[${ts()}] next_order_number error:`, numErr?.message)
      return jsonError('no se pudo reservar número de pedido', 500, req)
    }
    const seq = String(nextNumData).padStart(4, '0')
    const orderNumber = `${orderPrefix}-${year}-${seq}`

    // 4. Cargar config Redsys (puede fallar si mode=prod sin env vars).
    let config: RedsysConfig
    try {
      config = await loadRedsysConfig(supabase)
    } catch (err) {
      await supabase.rpc('restore_stock', { p_items: reserveItems })
      console.error(`[${ts()}] redsys-config:`, String(err))
      return jsonError(String(err), 500, req)
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
        consent_ip,
        consent_user_agent,
        consent_terms_version: body.terms_version ?? null,
        consent_privacy_version: body.privacy_version ?? null,
      })
      .select('id')
      .single<{ id: string }>()

    if (insErr || !insertedOrder) {
      await supabase.rpc('restore_stock', { p_items: reserveItems })
      console.error(`[${ts()}] insert order error:`, insErr?.message)
      return jsonError('no se pudo crear el pedido', 500, req)
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
      await supabase.rpc('restore_stock', { p_items: reserveItems })
      return jsonError('no se pudieron guardar las líneas', 500, req)
    }

    // 8. Historial.
    await supabase.from('order_status_history').insert({
      order_id: orderId,
      from_status: null,
      to_status: 'pending',
      reason: 'order created',
    })

    // 8.b. consent_audit (Q-04 V5): bitácora granular inmutable de
    // consentimientos. Una fila por cada checkbox aceptado en el checkout.
    //   - accepted_terms → consent_type='terms' / action='grant'
    //   - read_privacy   → consent_type='privacy' / action='confirm_read'
    //     (no es consentimiento RGPD: la base legal es contrato art. 6.1.b,
    //     pero conservamos prueba de que el usuario tuvo acceso al texto).
    const termsVersion = body.terms_version ?? DEFAULT_CONSENT_VERSION
    const privacyVersion = body.privacy_version ?? DEFAULT_CONSENT_VERSION
    const consentRows = [
      {
        order_id: orderId,
        customer_email: body.customer.email,
        consent_type: 'terms',
        consent_version: termsVersion,
        consent_action: 'grant',
        ip_address: consent_ip,
        user_agent: consent_user_agent,
      },
      {
        order_id: orderId,
        customer_email: body.customer.email,
        consent_type: 'privacy',
        consent_version: privacyVersion,
        consent_action: 'confirm_read',
        ip_address: consent_ip,
        user_agent: consent_user_agent,
      },
    ]
    const { error: consentErr } = await supabase
      .from('consent_audit')
      .insert(consentRows)
    if (consentErr) {
      // No bloqueante: el pedido ya existe. Las columnas consent_* en orders
      // y order_status_history mantienen prueba mínima. Log y seguimos.
      console.error(
        `[${ts()}] consent_audit insert failed (non-blocking):`,
        consentErr.message,
      )
    }

    // 9. Public access token.
    const publicToken = await generateOrderToken(orderId, body.customer.email)

    // 9.b. OTP gate (X-17 / Sprint 2 V5).
    //
    // Si `require_payment_otp` está activo, el cliente debe introducir un
    // código de 6 dígitos enviado por email antes de ser redirigido a
    // Redsys. Aquí solo decidimos a dónde mandar al frontend: la lógica
    // de generación/validación del OTP la implementa el agente S2-X2-OTP
    // (edge function payment-otp-verify, página React, migración 0040).
    //
    // El valor del setting puede llegar como boolean, string 'true'/'false'
    // o número — aceptamos las tres formas (idéntico patrón a otros gates
    // booleanos del proyecto).
    const otpRaw = settings.require_payment_otp
    const requireOtp =
      otpRaw === true ||
      otpRaw === 1 ||
      (typeof otpRaw === 'string' && otpRaw.trim().toLowerCase() === 'true')

    if (requireOtp) {
      console.log(`[${ts()}] ✓ order-place ${config.mode} · ${orderNumber} · OTP requerido — redirigiendo a /pedido/${orderId}/otp`)
      return jsonOk({
        order_id: orderId,
        order_number: orderNumber,
        public_token: publicToken,
        payment: {
          mode: 'otp_required',
          redirect_to: `/pedido/${orderId}/otp?token=${encodeURIComponent(publicToken)}`,
          redsys_order_id: redsysOrderId,
        },
      }, req)
    }

    // 10. Generar contrato PDF (soporte duradero L-05) — non-blocking.
    //     Si falla, el pedido ya existe y el email se enviará igualmente.
    //     El adjunto se omitirá silenciosamente; el error queda en los logs.
    //     B-19: invocación interna vía supabase.functions.invoke con
    //     x-internal-secret (evita CORS interno y fija auth fail-closed).
    supabase.functions
      .invoke('generate-order-contract', {
        body: { order_id: orderId },
        headers: internalSecretHeader(),
      })
      .catch((err: unknown) => {
        console.error(`[${ts()}] [order-place] contract generation failed (non-blocking):`, String(err))
      })

    // 11. Payload según modo.
    // mode: mock devuelve URL interna; test/prod construye payload Redsys firmado.
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
      }, req)
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
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ order-place:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
