// supabase/functions/customer-request-invoice/index.ts
//
// Permite al cliente (autenticado vía magic link / customer session) solicitar
// y descargar la factura de un pedido suyo. Si el pedido ya tiene factura,
// devuelve la URL firmada existente. Si no, completa los datos fiscales que
// falten (DNI del comprador en B2C > 400 €, o datos de empresa para factura
// completa B2B) e invoca internamente `generate-invoice-pdf`.
//
// Flujo:
//   POST { token, order_id, dni?, full_invoice?, business_name?, cif?, address? }
//
// Respuestas:
//   200 { ok:true, invoice_number, signed_url }            → factura lista
//   200 { ok:false, error:'fiscal_data_required', need:[...] } → faltan datos
//                                                                (el front pide
//                                                                 un formulario)
//   4xx { ok:false, error }                                → otros errores
//
// Seguridad: la emisión real (números correlativos, hash, etc.) la hace
// `generate-invoice-pdf`, que además bloquea si el NIF del emisor no es válido.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  getSignedInvoiceUrl,
  jsonError,
  jsonOk,
  corsPreflightResponse,
  maskEmail,
} from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'
import { internalSecretHeader } from '../_shared/security.ts'
import { isValidSpanishTaxId } from '../_shared/spanish-id.ts'

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

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      token?: string
      order_id?: string
      dni?: string
      full_invoice?: boolean
      business_name?: string
      cif?: string
      address?: string
    }

    const token = body.token ?? null
    const orderId = body.order_id ?? null
    if (!token) return jsonError('token requerido', 400, req)
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Sesión válida del cliente.
    const session = await verifyCustomerSession(supabase, token)
    if (!session) return jsonError('Sesión expirada o inválida', 401, req)

    // 2. Cargar pedido y comprobar pertenencia + no soft-deleted.
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, customer_email, customer_dni, ' +
          'needs_invoice, invoice_business_name, invoice_cif, invoice_address, ' +
          'total_cents, deleted_at',
      )
      .eq('id', orderId)
      .maybeSingle<{
        id: string
        order_number: string
        status: string
        customer_email: string
        customer_dni: string | null
        needs_invoice: boolean
        invoice_business_name: string | null
        invoice_cif: string | null
        invoice_address: string | null
        total_cents: number
        deleted_at: string | null
      }>()

    if (oErr) {
      console.error(`[${ts()}] customer-request-invoice read error:`, oErr.message)
      return jsonError('error leyendo el pedido', 500, req)
    }
    if (!order) return jsonError('forbidden', 403, req)
    if (
      order.deleted_at !== null ||
      String(order.customer_email).toLowerCase() !== session.email
    ) {
      console.warn(
        `[${ts()}] customer-request-invoice forbidden · session=${maskEmail(session.email)} · order=${order.order_number}`,
      )
      return jsonError('forbidden', 403, req)
    }

    // 3. El pedido debe estar en un estado facturable.
    if (!BILLABLE_STATUSES.has(order.status)) {
      return jsonError(
        'La factura estará disponible cuando la tienda acepte el pedido.',
        409,
        req,
      )
    }

    // 4. ¿Ya existe factura? → devolver la existente (no regenerar).
    const { data: existing } = await supabase
      .from('invoices')
      .select('invoice_number, pdf_storage_path')
      .eq('order_id', order.id)
      .maybeSingle<{ invoice_number: string; pdf_storage_path: string }>()

    if (existing) {
      const signedUrl = await getSignedInvoiceUrl(supabase, existing.pdf_storage_path, 60 * 60)
      return jsonOk({ invoice_number: existing.invoice_number, signed_url: signedUrl }, req)
    }

    // 5. Determinar si faltan datos fiscales para poder emitir.
    const wantsFullInvoice = body.full_invoice === true || order.needs_invoice === true
    const updates: Record<string, unknown> = {}
    const missing: string[] = []

    // 5a. Factura completa (B2B): exige razón social + CIF válido + dirección.
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
      // 5b. Factura simplificada (B2C): el titular exige SIEMPRE el NIF/DNI del
      // comprador para emitir la factura (más estricto que el mínimo legal de
      // >400 € del RD 1619/2012 art. 7.1).
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

    // 6. Persistir los datos fiscales aportados (si los hay).
    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await supabase.from('orders').update(updates).eq('id', order.id)
      if (upErr) {
        console.error(`[${ts()}] customer-request-invoice update error:`, upErr.message)
        return jsonError('No se pudieron guardar los datos fiscales.', 500, req)
      }
    }

    // 7. Generar la factura (interno, con doble capa de auth).
    // supabase-js lanza FunctionsHttpError en respuestas no-2xx; capturamos
    // para leer el cuerpo de error de generate-invoice-pdf y propagar el motivo.
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
      // Intentar extraer el mensaje real del cuerpo de la Response del error.
      let detail =
        (genData as { error?: string } | null)?.error ??
        (genErr as { message?: string })?.message ??
        'No se pudo generar la factura.'
      const ctx = (genErr as { context?: { json?: () => Promise<{ error?: string }> } }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          const b = await ctx.json()
          if (b?.error) detail = b.error
        } catch { /* ignore */ }
      }
      console.warn(`[${ts()}] generate-invoice-pdf via customer falló: ${detail}`)
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
      // Fallback: releer la fila recién creada.
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number, pdf_storage_path')
        .eq('order_id', order.id)
        .maybeSingle<{ invoice_number: string; pdf_storage_path: string }>()
      if (inv) signedUrl = await getSignedInvoiceUrl(supabase, inv.pdf_storage_path, 60 * 60)
    }

    console.log(
      `[${ts()}] ✓ customer-request-invoice · order=${order.order_number} · ${invoiceNumber ?? '?'}`,
    )
    return jsonOk({ invoice_number: invoiceNumber, signed_url: signedUrl }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-request-invoice:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
