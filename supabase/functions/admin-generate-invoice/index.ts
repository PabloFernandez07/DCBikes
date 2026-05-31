// supabase/functions/admin-generate-invoice/index.ts
//
// Permite al ADMIN emitir y descargar la factura de cualquier pedido desde el
// panel de administración. Es el equivalente de `customer-request-invoice` pero
// con autenticación de admin (JWT Supabase) en vez de sesión de cliente.
//
// Auth: el frontend admin invoca con su JWT (Authorization Bearer). Se valida
// con SUPABASE_SERVICE_ROLE_KEY y se comprueba que el usuario existe en
// `admin_users`. Patrón idéntico a `send-reply-email`.
//
// Flujo:
//   POST { order_id, full_invoice?, dni?, business_name?, cif?, address? }
//
// Respuestas:
//   200 { ok:true, invoice_number, signed_url }               → factura lista
//   200 { ok:false, fiscal_data_required:true, need:[...],
//          full_invoice:bool }                                 → faltan datos
//   4xx { ok:false, error }                                    → otros errores
//
// Diferencias respecto a customer-request-invoice:
//  - Sin validación de customer_sessions ni pertenencia del pedido al email.
//  - El admin puede facturar CUALQUIER pedido en estado facturable.
//  - No requiere entrada en config.toml (verify_jwt por defecto true — el admin
//    invoca con su JWT real, igual que send-reply-email y verifactu-cert-upload).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  getSignedInvoiceUrl,
  jsonError,
  jsonOk,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import { isValidSpanishTaxId } from '../_shared/spanish-id.ts'

// Estados en los que el admin puede emitir factura (igual que customer-request-invoice).
const BILLABLE_STATUSES = new Set([
  'accepted',
  'ready_pickup',
  'shipped',
  'delivered',
  'returned',
])

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // ── 1. Autenticación de admin ──────────────────────────────────────────────
  // Patrón idéntico al de `send-reply-email` y `verifactu-cert-upload`:
  // leemos el JWT Bearer del header y verificamos que corresponde a un admin.
  let adminUserId: string
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonError('missing bearer token', 401, req)
    }
    const jwt = authHeader.slice(7).trim()

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      console.warn(`[${ts()}] ✗ admin-generate-invoice: JWT inválido`, userErr?.message)
      return jsonError('unauthorized', 401, req)
    }

    const { data: adminRow } = await supabaseAuth
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle()

    if (!adminRow) {
      console.warn(
        `[${ts()}] ✗ admin-generate-invoice: user ${userData.user.id} no es admin`,
      )
      return jsonError('forbidden', 403, req)
    }

    adminUserId = userData.user.id
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-generate-invoice auth check exception:`, String(err))
    return jsonError('auth check failed', 500, req)
  }

  // ── 2. Parseo del body ─────────────────────────────────────────────────────
  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      order_id?: string
      full_invoice?: boolean
      dni?: string
      business_name?: string
      cif?: string
      address?: string
    }

    const orderId = body.order_id ?? null
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 3. Cargar pedido (sin comprobar pertenencia — el admin accede a todos) ─
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, customer_dni, ' +
          'needs_invoice, invoice_business_name, invoice_cif, invoice_address, ' +
          'total_cents, deleted_at',
      )
      .eq('id', orderId)
      .maybeSingle<{
        id: string
        order_number: string
        status: string
        customer_dni: string | null
        needs_invoice: boolean
        invoice_business_name: string | null
        invoice_cif: string | null
        invoice_address: string | null
        total_cents: number
        deleted_at: string | null
      }>()

    if (oErr) {
      console.error(`[${ts()}] admin-generate-invoice read error:`, oErr.message)
      return jsonError('error leyendo el pedido', 500, req)
    }
    if (!order) return jsonError('pedido no encontrado', 404, req)

    // Pedidos soft-deleted no son facturables.
    if (order.deleted_at !== null) {
      return jsonError('El pedido ha sido eliminado y no puede facturarse.', 409, req)
    }

    // ── 4. Comprobar estado facturable ─────────────────────────────────────────
    if (!BILLABLE_STATUSES.has(order.status)) {
      return jsonError(
        'La factura estará disponible cuando la tienda acepte el pedido.',
        409,
        req,
      )
    }

    // ── 5. ¿Ya existe factura? → devolver la existente (no regenerar) ──────────
    const { data: existing } = await supabase
      .from('invoices')
      .select('invoice_number, pdf_storage_path')
      .eq('order_id', order.id)
      .maybeSingle<{ invoice_number: string; pdf_storage_path: string }>()

    if (existing) {
      const signedUrl = await getSignedInvoiceUrl(supabase, existing.pdf_storage_path, 60 * 60)
      console.log(
        `[${ts()}] admin-generate-invoice (existing) · order=${order.order_number} · ${existing.invoice_number} · admin=${adminUserId}`,
      )
      return jsonOk({ invoice_number: existing.invoice_number, signed_url: signedUrl }, req)
    }

    // ── 6. Validar y preparar datos fiscales ──────────────────────────────────
    // Misma lógica que customer-request-invoice:
    // Factura completa (B2B): exige razón social + CIF válido + dirección.
    // Factura simplificada (B2C): exige SIEMPRE el NIF/DNI del comprador.
    const wantsFullInvoice = body.full_invoice === true || order.needs_invoice === true
    const updates: Record<string, unknown> = {}
    const missing: string[] = []

    if (wantsFullInvoice) {
      const businessName = (body.business_name ?? order.invoice_business_name ?? '').trim()
      const cifRaw = (body.cif ?? order.invoice_cif ?? '').trim()
      const address = (body.address ?? order.invoice_address ?? '').trim()

      if (!businessName) missing.push('business_name')
      if (!cifRaw) missing.push('cif')
      else if (!isValidSpanishTaxId(cifRaw)) {
        return jsonError('El NIF/CIF introducido no es válido.', 400, req)
      }
      if (!address) missing.push('address')

      if (missing.length === 0) {
        updates.needs_invoice = true
        if (body.business_name) updates.invoice_business_name = businessName
        if (body.cif) updates.invoice_cif = cifRaw.toUpperCase()
        if (body.address) updates.invoice_address = address
      }
    } else {
      // Factura simplificada: NIF/DNI obligatorio (política interna más estricta
      // que el mínimo legal de >400 € del RD 1619/2012 art. 7.1).
      const effectiveDni = (body.dni ?? order.customer_dni ?? '').trim()
      if (!effectiveDni) {
        missing.push('dni')
      } else if (!isValidSpanishTaxId(effectiveDni)) {
        return jsonError('El NIF/DNI introducido no es válido.', 400, req)
      } else if (body.dni) {
        updates.customer_dni = effectiveDni.toUpperCase()
      }
    }

    if (missing.length > 0) {
      return jsonOk(
        {
          fiscal_data_required: true,
          full_invoice: wantsFullInvoice,
          need: missing,
        },
        req,
      )
    }

    // ── 7. Persistir datos fiscales aportados ─────────────────────────────────
    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await supabase.from('orders').update(updates).eq('id', order.id)
      if (upErr) {
        console.error(`[${ts()}] admin-generate-invoice update error:`, upErr.message)
        return jsonError('No se pudieron guardar los datos fiscales.', 500, req)
      }
    }

    // ── 8. Invocar generate-invoice-pdf (interno, doble capa de auth) ─────────
    // supabase-js lanza FunctionsHttpError en respuestas no-2xx; capturamos el
    // cuerpo de error de generate-invoice-pdf para propagar el motivo real.
    let genData: unknown = null
    let genErr: unknown = null
    try {
      const res = await supabase.functions.invoke('generate-invoice-pdf', {
        body: { order_id: order.id },
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
        'No se pudo generar la factura.'
      const ctx = (genErr as { context?: { json?: () => Promise<{ error?: string }> } }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const b = await ctx.json()
          if (b?.error) detail = b.error
        } catch { /* ignorar */ }
      }
      console.warn(`[${ts()}] generate-invoice-pdf via admin falló: ${detail}`)
      return jsonError(detail, 502, req)
    }

    const invoiceNumber =
      (genData as { invoice_number?: string } | null)?.invoice_number ?? null
    const storagePath =
      (genData as { storage_path?: string } | null)?.storage_path ?? null

    let signedUrl: string | null = null
    if (storagePath) {
      signedUrl = await getSignedInvoiceUrl(supabase, storagePath, 60 * 60)
    } else {
      // Fallback: releer la fila recién creada por generate-invoice-pdf.
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, pdf_storage_path')
        .eq('order_id', order.id)
        .maybeSingle<{ invoice_number: string; pdf_storage_path: string }>()
      if (inv) signedUrl = await getSignedInvoiceUrl(supabase, inv.pdf_storage_path, 60 * 60)
    }

    console.log(
      `[${ts()}] ✓ admin-generate-invoice · order=${order.order_number} · ${invoiceNumber ?? '?'} · admin=${adminUserId}`,
    )
    return jsonOk({ invoice_number: invoiceNumber, signed_url: signedUrl }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-generate-invoice:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
