// supabase/functions/generate-invoice-pdf/index.ts
//
// Fase H — Generación de facturas PDF (A4) con pdf-lib.
//
// Flujo:
//   1. Input: { order_id }.
//   2. Lee orden + items + settings legales (legal_company_name/cif/address).
//   3. Si ya existe factura para el order_id → devuelve la existente (no regenera).
//   4. Llama RPC next_b2c_invoice_number(YEAR) → contador correlativo atómico
//      (la antigua next_invoice_number(int) fue dropeada por C-03 auditoría V3).
//   5. Construye PDF A4 (Helvetica con codificación WinAnsi → soporta ñ/áéíóú/€).
//   6. Upload PDF al bucket privado 'invoices' en {year}/{invoice_number}.pdf.
//   7. INSERT en tabla `invoices` con snapshots legales + importes.
//   8. Si falla el INSERT (ej. carrera) → borra el archivo subido.
//   9. Response: { ok: true, invoice_number, storage_path }.
//
// Llamada esperada desde:
//   - `order-accept` (admin): después de capturar pre-auth Redsys, antes de
//     `send-order-accepted-customer`.
//   - Manualmente por admin en caso de reemisión.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import QRCode from 'https://esm.sh/qrcode@1.5.3'

import {
  buildCorsHeaders,
  asString,
  getSettings,
  jsonError,
  jsonOk,
  type OrderItemRow,
  type OrderRow,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import {
  buildInvoiceNumber,
  computeTaxBreakdown,
  computeTaxBreakdownMulti,
  summarizeTaxBreakdown,
  type TaxLine,
  formatDateDMY,
  formatEuroCents,
  sanitizeWinAnsi,
} from '../_shared/pdf-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'
import { isValidSpanishTaxId } from '../_shared/spanish-id.ts'

/* ─────────── Constantes layout A4 (puntos PDF, 72pt = 1in) ─────────── */
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 40
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 60

// Colors (corporativos — púrpura discreto en headings)
const COLOR_PRIMARY = rgb(0.65, 0.53, 0.71) // #A788B5
const COLOR_DARK = rgb(0.06, 0.06, 0.07)    // #0F0F12
const COLOR_GRAY = rgb(0.4, 0.4, 0.42)
const COLOR_LIGHT = rgb(0.9, 0.9, 0.92)
const COLOR_TABLE_HEAD_BG = rgb(0.97, 0.95, 0.99)
const COLOR_BLACK = rgb(0, 0, 0)

const INVOICE_STATUS_VALID = new Set([
  'accepted',
  'ready_pickup',
  'shipped',
  'delivered',
  'returned',
])

interface ExistingInvoice {
  invoice_number: string
  pdf_storage_path: string
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    // Solo invocable internamente (order-accept) con x-internal-secret.
    // Tras la migración de claves de Supabase el SERVICE_ROLE_KEY inyectado
    // dejó de ser un JWT, así que verify_jwt=true rechazaba el invoke con 401
    // y la factura nunca se generaba. Ahora verify_jwt=false + este check es
    // la auth real (mismo patrón que generate-order-contract y send-*).
    if (!verifyInternalSecret(req)) {
      console.warn(`[${ts()}] generate-invoice-pdf: x-internal-secret inválido o ausente`)
      return jsonError('forbidden', 403, req)
    }

    const body = await req.json().catch(() => ({})) as { order_id?: string }
    const orderId = body.order_id
    if (!orderId) return jsonError('order_id required', 400, req)

    const supabase: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    /* ─── 1. Cargar orden + items ─── */
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single<OrderRow & { order_items: OrderItemRow[] }>()

    if (oErr || !order) {
      console.warn(`[${ts()}] order not found id=${orderId}`)
      return jsonError('order not found', 404, req)
    }

    if (!INVOICE_STATUS_VALID.has(order.status)) {
      return jsonError(
        `no se puede facturar un pedido en estado "${order.status}". Acepta el pedido primero.`,
        400,
        req,
      )
    }

    if (!order.order_items || order.order_items.length === 0) {
      return jsonError('order has no items', 400, req)
    }

    /* ─── 1b. Gate: NIF/DNI del comprador OBLIGATORIO en toda factura ─── */
    // Decisión del titular: ninguna factura se emite sin identificar al
    // comprador. En B2B el identificador es invoice_cif; en B2C, customer_dni.
    // (El mínimo legal sería solo >400€ — RD 1619/2012 art. 7.1 — pero aquí se
    // exige siempre.)
    const isB2BOrder = order.needs_invoice === true && !!order.invoice_cif
    if (!isB2BOrder && !order.customer_dni) {
      return jsonError(
        'Falta el NIF/DNI del comprador. Es obligatorio para emitir la factura (campo customer_dni vacío).',
        400,
        req,
      )
    }

    /* ─── 2. Idempotencia: si ya hay factura, devolverla ─── */
    const { data: existing } = await supabase
      .from('invoices')
      .select('invoice_number, pdf_storage_path')
      .eq('order_id', order.id)
      .maybeSingle<ExistingInvoice>()

    if (existing) {
      console.log(
        `[${ts()}] · invoice already exists order=${order.order_number} · invoice=${existing.invoice_number}`,
      )
      return jsonOk({
        invoice_number: existing.invoice_number,
        storage_path: existing.pdf_storage_path,
        already_existed: true,
      }, req)
    }

    /* ─── 3. Settings legales emisor + prefijo + verifactu_mode ─── */
    const settings = await getSettings(supabase, [
      'legal_company_name',
      'legal_company_cif',
      'legal_company_address',
      'invoice_series_prefix',
      'store_phone',
      'quote_destination_email',
      'verifactu_mode',
    ])

    const companyName = asString(settings.legal_company_name).trim()
    const companyCif = asString(settings.legal_company_cif).trim()
    const companyAddress = asString(settings.legal_company_address).trim()
    const invoicePrefix = asString(settings.invoice_series_prefix, 'FAC').trim() || 'FAC'
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)

    if (!companyName || !companyCif || !companyAddress) {
      return jsonError(
        'Falta configurar datos fiscales en /admin/settings → Facturación (razón social, CIF, dirección).',
        400,
        req,
      )
    }

    // Gate legal: el NIF/CIF del emisor debe ser VÁLIDO (dígito de control).
    // Bloquea el placeholder "12345678X" y cualquier identificador falso. Emitir
    // una factura con un NIF inválido la hace nula y, peor, quema un número
    // correlativo que luego no se puede reutilizar (la serie debe ser continua).
    // Hasta que el titular configure su NIF real, NO se emite ninguna factura.
    if (!isValidSpanishTaxId(companyCif)) {
      console.warn(`[${ts()}] generate-invoice-pdf: NIF/CIF emisor inválido (placeholder?) — emisión bloqueada`)
      return jsonError(
        'El NIF/CIF del emisor configurado no es válido (¿sigue el valor de ejemplo?). ' +
          'Configura el NIF real del autónomo en /admin/configuración → Facturación antes de emitir facturas.',
        409,
        req,
      )
    }

    /* ─── 3b. Gate Verifactu: la modalidad debe estar decidida ─── */
    // RD 1007/2023: no se puede emitir factura sin saber si aplica Verifactu o no.
    const verifactuMode = settings.verifactu_mode as 'verifactu' | 'no_verifactu' | null | undefined
    if (verifactuMode !== 'verifactu' && verifactuMode !== 'no_verifactu') {
      return jsonError(
        'Modo Verifactu no configurado. El administrador debe definir settings.verifactu_mode antes de emitir facturas.',
        503,
        req,
      )
    }

    /* ─── 4. Obtener correlativo atómico (serie B2C o B2B) ─── */
    // Sprint 4.1 — Series correlativas separadas (recomendación AEAT):
    //   B2C (factura simplificada): FAC-{year}-N
    //   B2B (factura completa):     FAC-B-{year}-N
    const isB2B = order.needs_invoice === true && !!order.invoice_cif
    const year = new Date().getUTCFullYear()
    const rpcName = isB2B ? 'next_b2b_invoice_number' : 'next_b2c_invoice_number'
    const { data: counterData, error: counterErr } = await supabase.rpc(rpcName, {
      p_year: year,
    })
    if (counterErr || typeof counterData !== 'number') {
      console.error(`[${ts()}] ${rpcName} failed`, counterErr)
      return jsonError(`fallo al obtener número de factura: ${counterErr?.message ?? 'unknown'}`, 500, req)
    }
    const effectivePrefix = isB2B ? `${invoicePrefix}-B` : invoicePrefix
    const invoiceNumber = buildInvoiceNumber(effectivePrefix, year, counterData)
    const storagePath = `${year}/${invoiceNumber}.pdf`

    /* ─── 5. Calcular desglose IVA (multi-tipo C-12) ─── */
    const taxRatePct = Number(order.tax_rate) || 21
    // computeTaxBreakdownMulti agrupa por tax_rate_pct por item.
    // Como OrderItemRow no incluye tax_rate_pct todavía, cada item hereda defaultRatePct (taxRatePct).
    // Cuando se añada tax_rate_pct a order_items, el desglose aparecerá automáticamente.
    const taxLines = computeTaxBreakdownMulti(
      order.order_items,
      order.shipping_cents,
      taxRatePct,
    )
    const breakdown = summarizeTaxBreakdown(taxLines)

    // Verificación de consistencia con total persistido en orders
    if (breakdown.total_cents !== order.total_cents) {
      console.warn(
        `[${ts()}] ⚠ tax breakdown mismatch order=${order.order_number}: computed=${breakdown.total_cents} stored=${order.total_cents}`,
      )
      // Si discrepa por redondeo, ajustamos al stored para que la factura cuadre con lo cobrado.
      const diff = order.total_cents - breakdown.total_cents
      breakdown.tax_cents += diff
      breakdown.total_cents = order.total_cents
    }

    /* ─── 6. Hash chain Verifactu (RD 1007/2023) ─── */
    // 6a-6c) El hash + previous_hash + INSERT se calculan dentro de la RPC atómica
    //   `append_invoice_chained` (migración 0051, B-28): adquiere
    //   pg_advisory_xact_lock(hashtext('invoices_chain')), lee la cabeza de la
    //   cadena, calcula el SHA-256 e inserta — todo en UNA transacción, lo que
    //   elimina el TOCTOU que permitía bifurcar la cadena. Por eso aquí ya NO se
    //   lee la cabeza ni se calcula el hash en JS (se hacía en pasos separados).
    //   La RPC usa su propio now() como issued_at tanto para el hash como para
    //   la fila → hash y fecha persistida coinciden (el JS antiguo divergía).

    // 6d) QR payload (formato validación AEAT). Usa la fecha de emisión; la RPC
    //   sella su propio now(), por lo que puede diferir en milisegundos del QR,
    //   pero el QR solo expone la fecha (DD-MM-YYYY), no la hora, así que coincide.
    const issuedIso = new Date().toISOString()
    const issuedDateDMY = issuedIso.slice(0, 10).split('-').reverse().join('-') // DD-MM-YYYY
    const qrPayload =
      `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?` +
      `nif=${encodeURIComponent(companyCif)}` +
      `&numserie=${encodeURIComponent(invoiceNumber)}` +
      `&fecha=${encodeURIComponent(issuedDateDMY)}` +
      `&importe=${(breakdown.total_cents / 100).toFixed(2)}`

    // TODO: firma XAdES (RD 1007/2023 art. 8) — queda pendiente para fase posterior.
    // signature se deja null en esta fase.

    /* ─── 7. Generar PDF ─── */
    const pdfBytes = await renderInvoicePdf({
      order,
      invoiceNumber,
      issuer: { name: companyName, cif: companyCif, address: companyAddress },
      breakdown,
      taxLines,
      taxRatePct,
      storePhone,
      storeEmail,
      verifactuMode,
      qrPayload,
    })

    /* ─── 8. Upload a Storage ─── */
    const uploadRes = await supabase.storage.from('invoices').upload(
      storagePath,
      pdfBytes,
      { contentType: 'application/pdf', upsert: false },
    )
    if (uploadRes.error) {
      console.error(`[${ts()}] storage upload failed`, uploadRes.error)
      return jsonError(`fallo al subir PDF: ${uploadRes.error.message}`, 500, req)
    }

    /* ─── 9. Persistir factura vía RPC atómica (rollback storage si falla) ─── */
    // append_invoice_chained (0051, B-28) hace lock + lectura de cabeza + hash +
    // INSERT en una sola transacción. Sustituye al SELECT/SHA-256/INSERT no
    // atómico anterior, que podía bifurcar la cadena de hash Verifactu.
    const invoiceType: 'b2b' | 'b2c' = isB2B ? 'b2b' : 'b2c'
    // TODO: invocar AEAT SOAP/REST endpoint (modo verifactu real-time) — fase posterior.
    const aeatStatus = verifactuMode === 'verifactu' ? 'pending_send' : 'not_applicable'
    const buyerNif = (order.invoice_cif as string | null) ?? ''
    const { data: appended, error: insErr } = await supabase
      .rpc('append_invoice_chained', {
        p_order_id: order.id,
        p_invoice_number: invoiceNumber,
        p_invoice_type: invoiceType,
        p_pdf_storage_path: storagePath,
        p_issuer_company_name: companyName,
        p_issuer_cif: companyCif,
        p_issuer_address: companyAddress,
        p_base_cents: breakdown.base_cents,
        p_tax_cents: breakdown.tax_cents,
        p_total_cents: breakdown.total_cents,
        p_buyer_nif: buyerNif,
        p_qr_payload: qrPayload,
        p_verifactu_mode: verifactuMode,
        p_aeat_status: aeatStatus,
      })
      .single<{ invoice_id: string; hash: string; previous_hash: string | null; issued_at: string }>()

    if (insErr || !appended) {
      console.error(`[${ts()}] append_invoice_chained failed, rolling back storage`, insErr)
      await supabase.storage.from('invoices').remove([storagePath]).catch((e) =>
        console.warn(`[${ts()}] rollback remove failed`, e),
      )
      return jsonError(`fallo al persistir factura: ${insErr?.message ?? 'unknown'}`, 500, req)
    }

    console.log(
      `[${ts()}] ✓ invoice created order=${order.order_number} · invoice=${invoiceNumber} · pdf=${storagePath} · size=${pdfBytes.length}B · hash=${appended.hash.slice(0, 12)}…`,
    )

    return jsonOk({
      invoice_number: invoiceNumber,
      storage_path: storagePath,
      size_bytes: pdfBytes.length,
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ generate-invoice-pdf fatal:`, err)
    return jsonError('internal error', 500, req)
  }
})

/* ════════════════════════════════════════════════════════════════════
 *  RENDER PDF
 * ═══════════════════════════════════════════════════════════════════ */

interface RenderArgs {
  order: OrderRow & { order_items: OrderItemRow[] }
  invoiceNumber: string
  issuer: { name: string; cif: string; address: string }
  breakdown: { base_cents: number; tax_cents: number; total_cents: number }
  taxLines: TaxLine[]
  taxRatePct: number
  storePhone: string
  storeEmail: string
  verifactuMode: 'verifactu' | 'no_verifactu'
  qrPayload: string
}

async function renderInvoicePdf(args: RenderArgs): Promise<Uint8Array> {
  const {
    order,
    invoiceNumber,
    issuer,
    breakdown,
    taxLines,
    taxRatePct,
    storePhone,
    storeEmail,
    verifactuMode,
    qrPayload,
  } = args

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(`Factura ${invoiceNumber}`)
  pdfDoc.setAuthor(issuer.name)
  pdfDoc.setSubject(`Factura de pedido ${order.order_number}`)
  pdfDoc.setCreator('DC Bikes Cantabria')
  pdfDoc.setProducer('pdf-lib')
  pdfDoc.setCreationDate(new Date())

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const page = pdfDoc.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN_TOP

  /* ─── HEADER: marca + número factura ─── */
  drawText(page, 'DC BIKES CANTABRIA', MARGIN_X, y, { font: fontBold, size: 16, color: COLOR_DARK })
  drawText(page, 'FACTURA', PAGE_W - MARGIN_X, y, {
    font: fontBold,
    size: 18,
    color: COLOR_PRIMARY,
    align: 'right',
  })
  y -= 18

  drawText(page, sanitizeWinAnsi(issuer.name), MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
  drawText(page, `Nº ${invoiceNumber}`, PAGE_W - MARGIN_X, y, {
    font: fontBold,
    size: 11,
    color: COLOR_DARK,
    align: 'right',
  })
  y -= 12

  drawText(page, `NIF/CIF: ${sanitizeWinAnsi(issuer.cif)}`, MARGIN_X, y, {
    font,
    size: 9,
    color: COLOR_GRAY,
  })
  drawText(page, `Fecha emisión: ${formatDateDMY(new Date())}`, PAGE_W - MARGIN_X, y, {
    font,
    size: 9,
    color: COLOR_GRAY,
    align: 'right',
  })
  y -= 12

  // Address (puede ser multilinea si tiene \n)
  const issuerAddressLines = wrapText(sanitizeWinAnsi(issuer.address), font, 9, 300)
  for (const line of issuerAddressLines) {
    drawText(page, line, MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
    y -= 11
  }
  if (storePhone || storeEmail) {
    drawText(
      page,
      [storePhone, storeEmail].filter(Boolean).map(sanitizeWinAnsi).join(' · '),
      MARGIN_X,
      y,
      { font, size: 9, color: COLOR_GRAY },
    )
    y -= 11
  }

  y -= 8
  drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, y, COLOR_PRIMARY, 1.2)
  y -= 18

  /* ─── DESTINATARIO ─── */
  drawText(page, 'FACTURAR A', MARGIN_X, y, {
    font: fontBold,
    size: 10,
    color: COLOR_PRIMARY,
  })
  y -= 14

  const customerName = sanitizeWinAnsi(
    `${order.customer_first_name} ${order.customer_last_name}`.trim(),
  )
  drawText(page, customerName, MARGIN_X, y, { font: fontBold, size: 11, color: COLOR_DARK })
  y -= 13

  const contactLine = [order.customer_email, order.customer_phone]
    .filter(Boolean)
    .map(sanitizeWinAnsi)
    .join(' · ')
  drawText(page, contactLine, MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
  y -= 12

  // C-09: mostrar NIF/DNI del receptor en facturas B2C con NIF aportado.
  if (!order.needs_invoice && order.customer_dni) {
    drawText(page, `NIF/DNI: ${sanitizeWinAnsi(order.customer_dni)}`, MARGIN_X, y, {
      font,
      size: 9,
      color: COLOR_DARK,
    })
    y -= 12
  }

  if (order.needs_invoice && order.invoice_business_name) {
    y -= 4
    drawText(page, sanitizeWinAnsi(order.invoice_business_name), MARGIN_X, y, {
      font: fontBold,
      size: 10,
      color: COLOR_DARK,
    })
    y -= 12
    if (order.invoice_cif) {
      drawText(page, `NIF/CIF: ${sanitizeWinAnsi(order.invoice_cif)}`, MARGIN_X, y, {
        font,
        size: 9,
        color: COLOR_DARK,
      })
      y -= 11
    }
    if (order.invoice_address) {
      const addrLines = wrapText(sanitizeWinAnsi(order.invoice_address), font, 9, 300)
      for (const line of addrLines) {
        drawText(page, line, MARGIN_X, y, { font, size: 9, color: COLOR_DARK })
        y -= 11
      }
    }
  } else if (order.delivery_method === 'shipping' && order.shipping_address) {
    // En B2C, mostrar dirección de envío como referencia
    drawText(page, 'Dirección de envío:', MARGIN_X, y, {
      font,
      size: 9,
      color: COLOR_GRAY,
    })
    y -= 11
    const shipLine = [
      order.shipping_address,
      [order.shipping_postal_code, order.shipping_city].filter(Boolean).join(' '),
      order.shipping_province,
    ]
      .filter(Boolean)
      .map(sanitizeWinAnsi)
      .join(', ')
    const lines = wrapText(shipLine, font, 9, 300)
    for (const line of lines) {
      drawText(page, line, MARGIN_X, y, { font, size: 9, color: COLOR_DARK })
      y -= 11
    }
  }

  y -= 10

  /* ─── REFERENCIA PEDIDO ─── */
  const refBoxY = y
  drawRect(page, MARGIN_X, refBoxY - 42, PAGE_W - 2 * MARGIN_X, 42, undefined, COLOR_LIGHT, 0.5)
  drawText(page, 'Pedido', MARGIN_X + 10, refBoxY - 14, {
    font,
    size: 8,
    color: COLOR_GRAY,
  })
  drawText(page, sanitizeWinAnsi(order.order_number), MARGIN_X + 10, refBoxY - 26, {
    font: fontBold,
    size: 11,
    color: COLOR_DARK,
  })

  drawText(page, 'Fecha pedido', MARGIN_X + 180, refBoxY - 14, {
    font,
    size: 8,
    color: COLOR_GRAY,
  })
  drawText(page, formatDateDMY(order.created_at), MARGIN_X + 180, refBoxY - 26, {
    font: fontBold,
    size: 11,
    color: COLOR_DARK,
  })

  drawText(page, 'Entrega', MARGIN_X + 320, refBoxY - 14, {
    font,
    size: 8,
    color: COLOR_GRAY,
  })
  drawText(
    page,
    order.delivery_method === 'shipping' ? 'Envío a domicilio' : 'Recogida en tienda',
    MARGIN_X + 320,
    refBoxY - 26,
    { font: fontBold, size: 11, color: COLOR_DARK },
  )

  y = refBoxY - 42 - 18

  /* ─── TABLA DE LÍNEAS ─── */
  // Columnas: Concepto / Talla / Cant. / Base unit / IVA unit / Total línea
  const colX = {
    concept: MARGIN_X + 8,
    size: 290,
    qty: 340,
    base: 380,
    iva: 440,
    total: PAGE_W - MARGIN_X - 8,
  }
  const rowH = 22

  // Header row
  drawRect(page, MARGIN_X, y - rowH + 6, PAGE_W - 2 * MARGIN_X, rowH, COLOR_TABLE_HEAD_BG)
  const headerY = y - 8
  drawText(page, 'Concepto', colX.concept, headerY, {
    font: fontBold,
    size: 8,
    color: COLOR_GRAY,
  })
  drawText(page, 'Talla', colX.size, headerY, {
    font: fontBold,
    size: 8,
    color: COLOR_GRAY,
    align: 'center',
  })
  drawText(page, 'Cant.', colX.qty, headerY, {
    font: fontBold,
    size: 8,
    color: COLOR_GRAY,
    align: 'center',
  })
  drawText(page, 'Base', colX.base, headerY, {
    font: fontBold,
    size: 8,
    color: COLOR_GRAY,
    align: 'right',
  })
  drawText(page, 'IVA', colX.iva, headerY, {
    font: fontBold,
    size: 8,
    color: COLOR_GRAY,
    align: 'right',
  })
  drawText(page, 'Total', colX.total, headerY, {
    font: fontBold,
    size: 8,
    color: COLOR_GRAY,
    align: 'right',
  })
  y -= rowH + 2

  drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, y + 14, COLOR_PRIMARY, 0.8)

  // Filas
  const rate = taxRatePct / 100
  for (const item of order.order_items) {
    if (y < MARGIN_BOTTOM + 200) break // protección por overflow (1 página normalmente basta)

    const unitWithIVA = item.unit_price_cents
    const unitBase = Math.round(unitWithIVA / (1 + rate))
    const unitIVA = unitWithIVA - unitBase
    const baseLine = unitBase * item.quantity
    const ivaLine = unitIVA * item.quantity

    // Concepto puede ser largo → wrap a 250pt
    const conceptLines = wrapText(
      sanitizeWinAnsi(item.product_name),
      font,
      9,
      colX.size - colX.concept - 10,
    )
    drawText(page, conceptLines[0] ?? '', colX.concept, y, {
      font,
      size: 9,
      color: COLOR_DARK,
    })
    if (conceptLines[1]) {
      drawText(page, conceptLines[1], colX.concept, y - 10, {
        font,
        size: 8,
        color: COLOR_GRAY,
      })
    }

    drawText(page, sanitizeWinAnsi(item.product_size_label ?? '—'), colX.size, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'center',
    })
    drawText(page, String(item.quantity), colX.qty, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'center',
    })
    drawText(page, formatEuroCents(baseLine), colX.base, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'right',
    })
    drawText(page, formatEuroCents(ivaLine), colX.iva, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'right',
    })
    drawText(page, formatEuroCents(item.line_total_cents), colX.total, y, {
      font: fontBold,
      size: 9,
      color: COLOR_DARK,
      align: 'right',
    })

    // Avance: si concepto wraps, dejar más espacio
    y -= conceptLines.length > 1 ? 24 : rowH
    drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, y + 6, COLOR_LIGHT, 0.4)
  }

  // Línea de envío si aplica
  if (order.shipping_cents > 0) {
    const shipBase = Math.round(order.shipping_cents / (1 + rate))
    const shipIva = order.shipping_cents - shipBase
    drawText(page, 'Gastos de envío', colX.concept, y, {
      font,
      size: 9,
      color: COLOR_DARK,
    })
    drawText(page, '—', colX.size, y, {
      font,
      size: 9,
      color: COLOR_GRAY,
      align: 'center',
    })
    drawText(page, '1', colX.qty, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'center',
    })
    drawText(page, formatEuroCents(shipBase), colX.base, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'right',
    })
    drawText(page, formatEuroCents(shipIva), colX.iva, y, {
      font,
      size: 9,
      color: COLOR_DARK,
      align: 'right',
    })
    drawText(page, formatEuroCents(order.shipping_cents), colX.total, y, {
      font: fontBold,
      size: 9,
      color: COLOR_DARK,
      align: 'right',
    })
    y -= rowH
    drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, y + 6, COLOR_LIGHT, 0.4)
  }

  /* ─── TOTALES ─── */
  y -= 14
  const totalsX = PAGE_W - MARGIN_X - 220
  const totalsLabelX = totalsX
  const totalsValueX = PAGE_W - MARGIN_X - 8

  // Base imponible total
  drawText(page, 'Base imponible', totalsLabelX, y, {
    font,
    size: 10,
    color: COLOR_GRAY,
  })
  drawText(page, formatEuroCents(breakdown.base_cents), totalsValueX, y, {
    font,
    size: 10,
    color: COLOR_DARK,
    align: 'right',
  })
  y -= 14

  // Desglose IVA por tipo (C-12 multi-tipo)
  // Si hay un único tipo se muestra una línea; si hay varios, una línea por tipo.
  if (taxLines.length <= 1) {
    // Modo mono-tipo (caso habitual): una sola línea "IVA (21%): X €"
    const rateLbl = taxRatePct.toFixed(2).replace('.00', '')
    drawText(page, `IVA (${rateLbl}%)`, totalsLabelX, y, {
      font,
      size: 10,
      color: COLOR_GRAY,
    })
    drawText(page, formatEuroCents(breakdown.tax_cents), totalsValueX, y, {
      font,
      size: 10,
      color: COLOR_DARK,
      align: 'right',
    })
    y -= 14
  } else {
    // Modo multi-tipo: encabezado + una línea por tipo
    drawText(page, 'Desglose IVA', totalsLabelX, y, {
      font,
      size: 9,
      color: COLOR_GRAY,
    })
    y -= 12
    for (const tl of taxLines) {
      const rateLbl = tl.rate_pct.toFixed(2).replace('.00', '')
      drawText(page, `  Base ${rateLbl}%: ${formatEuroCents(tl.base_cents)}  IVA: ${formatEuroCents(tl.iva_cents)}`, totalsLabelX, y, {
        font,
        size: 8.5,
        color: COLOR_GRAY,
      })
      y -= 11
    }
  }
  y -= 4

  // Doble línea separadora
  drawHLine(page, totalsX, PAGE_W - MARGIN_X, y + 8, COLOR_DARK, 0.8)
  drawHLine(page, totalsX, PAGE_W - MARGIN_X, y + 6, COLOR_DARK, 0.8)

  drawText(page, 'TOTAL', totalsLabelX, y - 6, {
    font: fontBold,
    size: 13,
    color: COLOR_DARK,
  })
  drawText(page, formatEuroCents(breakdown.total_cents), totalsValueX, y - 6, {
    font: fontBold,
    size: 13,
    color: COLOR_DARK,
    align: 'right',
  })
  y -= 30

  /* ─── PAGO ─── */
  y -= 10
  drawText(page, 'Forma de pago', MARGIN_X, y, {
    font: fontBold,
    size: 9,
    color: COLOR_PRIMARY,
  })
  y -= 12
  const paymentMethodLabel = order.payment_method === 'bizum' ? 'Bizum' : 'Tarjeta'
  drawText(
    page,
    `${paymentMethodLabel} (Redsys) — Estado: PAGADO`,
    MARGIN_X,
    y,
    { font, size: 9, color: COLOR_DARK },
  )
  y -= 20

  /* ─── VERIFACTU: QR + leyenda (solo si verifactu_mode === 'verifactu') ─── */
  if (verifactuMode === 'verifactu') {
    // Generar QR como data URL PNG y embeber en esquina inferior derecha sobre el pie.
    const qrDataUrl: string = await QRCode.toDataURL(qrPayload, { width: 96, margin: 1 })
    // Extraer bytes PNG desde data URL base64
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '')
    const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const qrImage = await pdfDoc.embedPng(pngBytes)

    // Posición: esquina inferior derecha, encima del pie legal
    const qrSize = 72 // 72pt ≈ 1 inch
    const qrX = PAGE_W - MARGIN_X - qrSize
    const qrY = MARGIN_BOTTOM + 42

    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })

    // Leyenda AEAT obligatoria bajo el QR
    drawText(page, 'VERI*FACTU', qrX + qrSize / 2, qrY - 10, {
      font: fontBold,
      size: 7,
      color: COLOR_DARK,
      align: 'center',
    })
    drawText(page, 'Factura verificable en sede.agenciatributaria.gob.es', qrX + qrSize / 2, qrY - 20, {
      font,
      size: 6,
      color: COLOR_GRAY,
      align: 'center',
    })
  }

  /* ─── PIE LEGAL ─── */
  drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, MARGIN_BOTTOM + 38, COLOR_LIGHT, 0.5)

  const footerLines = [
    `Factura ${invoiceNumber} · ${formatDateDMY(new Date())} · Página 1/1`,
    sanitizeWinAnsi(
      'Derecho de desistimiento de 14 días según art. 102 RDL 1/2007 (Ley General Defensa Consumidores y Usuarios).',
    ),
    sanitizeWinAnsi(
      `Devoluciones: ${storeEmail || 'contacto@dc-bikes-cantabria.com'} · Consulta las condiciones en nuestra web.`,
    ),
  ]
  let footerY = MARGIN_BOTTOM + 24
  for (const line of footerLines) {
    drawText(page, line, MARGIN_X, footerY, {
      font,
      size: 7.5,
      color: COLOR_GRAY,
    })
    footerY -= 9
  }

  return await pdfDoc.save()
}

/* ════════════════════════════════════════════════════════════════════
 *  HELPERS DRAW
 * ═══════════════════════════════════════════════════════════════════ */

interface DrawTextOpts {
  font: PDFFont
  size: number
  color: ReturnType<typeof rgb>
  align?: 'left' | 'right' | 'center'
}

function drawText(page: PDFPage, text: string, x: number, y: number, opts: DrawTextOpts) {
  const clean = sanitizeWinAnsi(text)
  const width = opts.font.widthOfTextAtSize(clean, opts.size)
  let drawX = x
  if (opts.align === 'right') drawX = x - width
  else if (opts.align === 'center') drawX = x - width / 2
  page.drawText(clean, {
    x: drawX,
    y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  })
}

function drawHLine(
  page: PDFPage,
  x1: number,
  x2: number,
  y: number,
  color: ReturnType<typeof rgb> = COLOR_BLACK,
  thickness = 0.5,
) {
  page.drawLine({
    start: { x: x1, y },
    end: { x: x2, y },
    thickness,
    color,
  })
}

function drawRect(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
  fill?: ReturnType<typeof rgb>,
  borderColor?: ReturnType<typeof rgb>,
  borderWidth = 0,
) {
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: fill,
    borderColor,
    borderWidth,
  })
}

/** Word-wrap simple: divide texto en líneas que quepan en `maxWidth` pt. Soporta multi-línea \n. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const result: string[] = []
  const paragraphs = text.split(/\r?\n/)
  for (const para of paragraphs) {
    if (!para.trim()) {
      result.push('')
      continue
    }
    const words = para.split(/\s+/)
    let line = ''
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate
      } else {
        if (line) result.push(line)
        line = w
      }
    }
    if (line) result.push(line)
  }
  return result
}
