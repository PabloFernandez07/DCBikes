// supabase/functions/generate-credit-invoice/index.ts
//
// Fase devoluciones — Generación de la FACTURA RECTIFICATIVA (abono) en PDF.
//
// Una rectificativa anula total o parcialmente una factura ordinaria ya emitida
// (TipoFactura AEAT 'R1', art. 80 LIVA). Sus importes son NEGATIVOS y lleva su
// propia serie correlativa (R-FAC / R-FAC-B), pero encadena su huella sobre la
// MISMA cadena global VeriFactu que las ordinarias.
//
// Es un CLON estructural de generate-invoice-pdf adaptado al abono:
//   1. Input: { order_id, return_id }. Auth interna (x-internal-secret).
//   2. Lee la devolución (order_returns + order_return_items) y la factura
//      ORIGINAL del pedido (invoice_type b2c|b2b). Sin original → 422.
//   3. Desglosa el reembolso (refund_total_cents) en base/IVA NEGATIVOS con el
//      mismo tax_rate del pedido.
//   4. Genera el PDF "FACTURA RECTIFICATIVA / ABONO" (referencia a la original,
//      motivo DEV-xxxx, líneas devueltas en negativo, QR VeriFactu).
//   5. Sube el PDF al bucket privado 'invoices' y persiste la fila vía la RPC
//      atómica append_credit_invoice_chained (huella encadenada).
//   6. Response: { ok, credit_invoice_number, credit_invoice_id, storage_path }.
//
// Llamada esperada desde:
//   - `admin-return-mark-received` (interno, internalSecretHeader()).

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
  type OrderRow,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import {
  buildInvoiceNumber,
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

// Colors (idénticos a la factura ordinaria — púrpura discreto en headings)
const COLOR_PRIMARY = rgb(0.65, 0.53, 0.71) // #A788B5
const COLOR_DARK = rgb(0.06, 0.06, 0.07)    // #0F0F12
const COLOR_GRAY = rgb(0.4, 0.4, 0.42)
const COLOR_LIGHT = rgb(0.9, 0.9, 0.92)
const COLOR_TABLE_HEAD_BG = rgb(0.97, 0.95, 0.99)
const COLOR_BLACK = rgb(0, 0, 0)

/* ─────────── Tipos de filas leídas ─────────── */

interface OriginalInvoiceRow {
  id: string
  invoice_number: string
  invoice_type: 'b2c' | 'b2b'
  issued_at: string
}

interface ReturnRow {
  id: string
  return_number: string
  order_id: string
  reason_code: string
  reason_text: string | null
  is_full_order: boolean
  refund_items_cents: number
  refund_shipping_cents: number
  refund_total_cents: number
  credit_invoice_id: string | null
}

interface ReturnItemRow {
  product_name: string
  product_size_label: string | null
  unit_price_cents: number
  quantity: number
  line_refund_cents: number
}

// Motivos de devolución → etiqueta legible para el PDF.
const REASON_LABELS: Record<string, string> = {
  wrong_size: 'Talla incorrecta',
  not_liked: 'No satisface al cliente',
  defective: 'Producto defectuoso',
  damaged: 'Producto dañado',
  wrong_item: 'Artículo equivocado',
  other: 'Otro motivo',
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    // Auth interna: misma estrategia que generate-invoice-pdf. verify_jwt=false +
    // verifyInternalSecret es la auth real. La invoca admin-return-mark-received
    // con internalSecretHeader().
    if (!verifyInternalSecret(req)) {
      console.warn(`[${ts()}] generate-credit-invoice: x-internal-secret inválido o ausente`)
      return jsonError('forbidden', 403, req)
    }

    const body = await req.json().catch(() => ({})) as { order_id?: string; return_id?: string }
    const orderId = body.order_id
    const returnId = body.return_id
    if (!orderId) return jsonError('order_id required', 400, req)
    if (!returnId) return jsonError('return_id required', 400, req)

    const supabase: SupabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    /* ─── 1. Cargar devolución (RMA) + líneas devueltas ─── */
    const { data: ret, error: rErr } = await supabase
      .from('order_returns')
      .select('*')
      .eq('id', returnId)
      .single<ReturnRow>()

    if (rErr || !ret) {
      console.warn(`[${ts()}] return not found id=${returnId}`)
      return jsonError('return not found', 404, req)
    }

    if (ret.order_id !== orderId) {
      return jsonError('return no pertenece al pedido indicado', 400, req)
    }

    // Idempotencia: si esta devolución ya tiene rectificativa, devolverla.
    if (ret.credit_invoice_id) {
      const { data: prior } = await supabase
        .from('invoices')
        .select('id, invoice_number, pdf_storage_path')
        .eq('id', ret.credit_invoice_id)
        .maybeSingle<{ id: string; invoice_number: string; pdf_storage_path: string }>()
      if (prior) {
        console.log(
          `[${ts()}] · rectificativa ya existe return=${ret.return_number} · invoice=${prior.invoice_number}`,
        )
        return jsonOk({
          credit_invoice_number: prior.invoice_number,
          credit_invoice_id: prior.id,
          storage_path: prior.pdf_storage_path,
          already_existed: true,
        }, req)
      }
    }

    if (ret.refund_total_cents <= 0) {
      return jsonError('la devolución no tiene importe a abonar (refund_total_cents = 0)', 400, req)
    }

    const { data: returnItems, error: riErr } = await supabase
      .from('order_return_items')
      .select('product_name, product_size_label, unit_price_cents, quantity, line_refund_cents')
      .eq('return_id', returnId)

    if (riErr) {
      console.error(`[${ts()}] order_return_items query failed`, riErr)
      return jsonError('fallo al leer líneas de la devolución', 500, req)
    }
    const items: ReturnItemRow[] = (returnItems ?? []) as ReturnItemRow[]

    /* ─── 2. Cargar pedido (datos del destinatario + tax_rate) ─── */
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single<OrderRow>()

    if (oErr || !order) {
      console.warn(`[${ts()}] order not found id=${orderId}`)
      return jsonError('order not found', 404, req)
    }

    /* ─── 3. Factura ORIGINAL del pedido (la que se rectifica) ─── */
    // No se puede rectificar lo que no existe: sin factura ordinaria → 422.
    const { data: original, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_type, issued_at')
      .eq('order_id', orderId)
      .in('invoice_type', ['b2c', 'b2b'])
      .order('issued_at', { ascending: true })
      .limit(1)
      .maybeSingle<OriginalInvoiceRow>()

    if (invErr) {
      console.error(`[${ts()}] original invoice query failed`, invErr)
      return jsonError('fallo al leer la factura original', 500, req)
    }
    if (!original) {
      return jsonError(
        'No existe factura ordinaria para este pedido. No se puede emitir una rectificativa sin factura original.',
        422,
        req,
      )
    }

    /* ─── 4. Settings legales emisor + verifactu_mode ─── */
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

    // Mismo gate que la ordinaria: NIF/CIF del emisor VÁLIDO (no placeholder).
    // Emitir un abono con NIF inválido lo hace nulo y quema un correlativo
    // rectificativo que no se puede reutilizar (la serie debe ser continua).
    if (!isValidSpanishTaxId(companyCif)) {
      console.warn(`[${ts()}] generate-credit-invoice: NIF/CIF emisor inválido — emisión bloqueada`)
      return jsonError(
        'El NIF/CIF del emisor configurado no es válido (¿sigue el valor de ejemplo?). ' +
          'Configura el NIF real del autónomo en /admin/configuración → Facturación antes de emitir facturas.',
        409,
        req,
      )
    }

    const verifactuMode = settings.verifactu_mode as 'verifactu' | 'no_verifactu' | null | undefined
    if (verifactuMode !== 'verifactu' && verifactuMode !== 'no_verifactu') {
      return jsonError(
        'Modo Verifactu no configurado. El administrador debe definir settings.verifactu_mode antes de emitir facturas.',
        503,
        req,
      )
    }

    /* ─── 5. Correlativo atómico de la serie RECTIFICATIVA (R-FAC / R-FAC-B) ─── */
    // El tipo de la rectificativa hereda el de la factura original:
    //   original b2c → rectificativa_b2c (serie R-FAC)
    //   original b2b → rectificativa_b2b (serie R-FAC-B)
    const isB2B = original.invoice_type === 'b2b'
    const year = new Date().getUTCFullYear()
    const rpcName = isB2B ? 'next_rect_b2b_invoice_number' : 'next_rect_b2c_invoice_number'
    const { data: counterData, error: counterErr } = await supabase.rpc(rpcName, {
      p_year: year,
    })
    if (counterErr || typeof counterData !== 'number') {
      console.error(`[${ts()}] ${rpcName} failed`, counterErr)
      return jsonError(`fallo al obtener número de rectificativa: ${counterErr?.message ?? 'unknown'}`, 500, req)
    }
    // Prefijo rectificativo: R-FAC (B2C) / R-FAC-B (B2B), a partir del prefijo base.
    const rectPrefix = isB2B ? `R-${invoicePrefix}-B` : `R-${invoicePrefix}`
    const creditInvoiceNumber = buildInvoiceNumber(rectPrefix, year, counterData)
    const storagePath = `${year}/${creditInvoiceNumber}.pdf`
    const invoiceType: 'rectificativa_b2c' | 'rectificativa_b2b' = isB2B
      ? 'rectificativa_b2b'
      : 'rectificativa_b2c'

    /* ─── 6. Desglose del abono (importes NEGATIVOS) ─── */
    // Fuente de verdad del total a abonar: refund_total_cents del RMA (items
    // devueltos + envío si is_full_order). Lo desglosamos con el MISMO tax_rate
    // del pedido para que base + IVA = total exacto al céntimo, igual que la
    // ordinaria (round(total / (1 + rate))).
    const taxRatePct = Number(order.tax_rate) || 21
    const rate = taxRatePct / 100
    const refundTotal = ret.refund_total_cents
    const refundBase = Math.round(refundTotal / (1 + rate))
    const refundTax = refundTotal - refundBase

    // En la fila de invoices y en la huella, base/cuota/total van NEGATIVOS.
    const negBase = -refundBase
    const negTax = -refundTax
    const negTotal = -refundTotal

    /* ─── 7. QR tributario (importe NEGATIVO, coherente con la huella) ─── */
    const issuedIso = new Date().toISOString()
    const issuedDateDMY = issuedIso.slice(0, 10).split('-').reverse().join('-') // DD-MM-YYYY
    const qrPayload =
      `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?` +
      `nif=${encodeURIComponent(companyCif)}` +
      `&numserie=${encodeURIComponent(creditInvoiceNumber)}` +
      `&fecha=${encodeURIComponent(issuedDateDMY)}` +
      `&importe=${(negTotal / 100).toFixed(2)}`

    /* ─── 8. Generar PDF de la rectificativa ─── */
    const pdfBytes = await renderCreditInvoicePdf({
      order,
      ret,
      items,
      creditInvoiceNumber,
      original,
      issuer: { name: companyName, cif: companyCif, address: companyAddress },
      base_cents: negBase,
      tax_cents: negTax,
      total_cents: negTotal,
      taxRatePct,
      storePhone,
      storeEmail,
      verifactuMode,
      qrPayload,
    })

    /* ─── 9. Upload a Storage (mismo bucket privado 'invoices') ─── */
    const uploadRes = await supabase.storage.from('invoices').upload(
      storagePath,
      pdfBytes,
      { contentType: 'application/pdf', upsert: false },
    )
    if (uploadRes.error) {
      console.error(`[${ts()}] storage upload failed`, uploadRes.error)
      return jsonError(`fallo al subir PDF: ${uploadRes.error.message}`, 500, req)
    }

    /* ─── 10. Persistir vía RPC atómica de huella (rollback storage si falla) ─── */
    // append_credit_invoice_chained (0067) hace lock + lectura de cabeza global +
    // hash R1 + INSERT con importes negativos + rectifies_invoice_id + return_id,
    // todo en una transacción. Mismo patrón que append_invoice_chained.
    const aeatStatus = verifactuMode === 'verifactu' ? 'pending_send' : 'not_applicable'
    const buyerNif = (order.invoice_cif as string | null) ?? ''
    const { data: appended, error: insErr } = await supabase
      .rpc('append_credit_invoice_chained', {
        p_order_id: orderId,
        p_invoice_number: creditInvoiceNumber,
        p_invoice_type: invoiceType,
        p_pdf_storage_path: storagePath,
        p_issuer_company_name: companyName,
        p_issuer_cif: companyCif,
        p_issuer_address: companyAddress,
        p_base_cents: negBase,
        p_tax_cents: negTax,
        p_total_cents: negTotal,
        p_buyer_nif: buyerNif,
        p_qr_payload: qrPayload,
        p_verifactu_mode: verifactuMode,
        p_aeat_status: aeatStatus,
        p_rectifies_invoice_id: original.id,
        p_return_id: returnId,
      })
      .single<{ invoice_id: string; hash: string; previous_hash: string | null; issued_at: string }>()

    if (insErr || !appended) {
      console.error(`[${ts()}] append_credit_invoice_chained failed, rolling back storage`, insErr)
      await supabase.storage.from('invoices').remove([storagePath]).catch((e) =>
        console.warn(`[${ts()}] rollback remove failed`, e),
      )
      return jsonError(`fallo al persistir rectificativa: ${insErr?.message ?? 'unknown'}`, 500, req)
    }

    console.log(
      `[${ts()}] ✓ rectificativa creada return=${ret.return_number} · invoice=${creditInvoiceNumber} ` +
        `· rectifica=${original.invoice_number} · pdf=${storagePath} · size=${pdfBytes.length}B ` +
        `· hash=${appended.hash.slice(0, 12)}…`,
    )

    return jsonOk({
      credit_invoice_number: creditInvoiceNumber,
      credit_invoice_id: appended.invoice_id,
      storage_path: storagePath,
      size_bytes: pdfBytes.length,
    }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ generate-credit-invoice fatal:`, err)
    return jsonError('internal error', 500, req)
  }
})

/* ════════════════════════════════════════════════════════════════════
 *  RENDER PDF — FACTURA RECTIFICATIVA / ABONO
 * ═══════════════════════════════════════════════════════════════════ */

interface RenderArgs {
  order: OrderRow
  ret: ReturnRow
  items: ReturnItemRow[]
  creditInvoiceNumber: string
  original: OriginalInvoiceRow
  issuer: { name: string; cif: string; address: string }
  base_cents: number
  tax_cents: number
  total_cents: number
  taxRatePct: number
  storePhone: string
  storeEmail: string
  verifactuMode: 'verifactu' | 'no_verifactu'
  qrPayload: string
}

async function renderCreditInvoicePdf(args: RenderArgs): Promise<Uint8Array> {
  const {
    order,
    ret,
    items,
    creditInvoiceNumber,
    original,
    issuer,
    base_cents,
    tax_cents,
    total_cents,
    taxRatePct,
    storePhone,
    storeEmail,
    verifactuMode,
    qrPayload,
  } = args

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(`Factura rectificativa ${creditInvoiceNumber}`)
  pdfDoc.setAuthor(issuer.name)
  pdfDoc.setSubject(`Abono de la factura ${original.invoice_number} (devolución ${ret.return_number})`)
  pdfDoc.setCreator('DC Bikes Cantabria')
  pdfDoc.setProducer('pdf-lib')
  pdfDoc.setCreationDate(new Date())

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Paginación: igual que la ordinaria, pero la rectificativa es corta (cabe en
  // una página en la práctica). Mantenemos el mecanismo por robustez.
  const pages: PDFPage[] = []
  let currentPageNum = 0

  function addNewPage(): PDFPage {
    const pg = pdfDoc.addPage([PAGE_W, PAGE_H])
    pages.push(pg)
    currentPageNum++
    return pg
  }

  const colX = {
    concept: MARGIN_X + 8,
    size: 290,
    qty: 340,
    base: 380,
    iva: 440,
    total: PAGE_W - MARGIN_X - 8,
  }
  const rowH = 18

  function drawTableHeader(pg: PDFPage, atY: number): number {
    drawRect(pg, MARGIN_X, atY - rowH + 6, PAGE_W - 2 * MARGIN_X, rowH, COLOR_TABLE_HEAD_BG)
    const headerY = atY - 8
    drawText(pg, 'Concepto', colX.concept, headerY, { font: fontBold, size: 8, color: COLOR_GRAY })
    drawText(pg, 'Talla', colX.size, headerY, { font: fontBold, size: 8, color: COLOR_GRAY, align: 'center' })
    drawText(pg, 'Cant.', colX.qty, headerY, { font: fontBold, size: 8, color: COLOR_GRAY, align: 'center' })
    drawText(pg, 'Base', colX.base, headerY, { font: fontBold, size: 8, color: COLOR_GRAY, align: 'right' })
    drawText(pg, 'IVA', colX.iva, headerY, { font: fontBold, size: 8, color: COLOR_GRAY, align: 'right' })
    drawText(pg, 'Total', colX.total, headerY, { font: fontBold, size: 8, color: COLOR_GRAY, align: 'right' })
    drawHLine(pg, MARGIN_X, PAGE_W - MARGIN_X, headerY - 9, COLOR_PRIMARY, 0.8)
    return headerY - 22
  }

  function drawPageFooter(
    pg: PDFPage,
    pageNum: number,
    totalPages: number,
    isLastPage: boolean,
  ): void {
    drawHLine(pg, MARGIN_X, PAGE_W - MARGIN_X, MARGIN_BOTTOM + 38, COLOR_LIGHT, 0.5)
    let footerY = MARGIN_BOTTOM + 24

    drawText(
      pg,
      `Factura rectificativa ${creditInvoiceNumber} · ${formatDateDMY(new Date())} · Página ${pageNum}/${totalPages}`,
      MARGIN_X,
      footerY,
      { font, size: 7.5, color: COLOR_GRAY },
    )
    footerY -= 9

    if (isLastPage) {
      // Leyenda legal de la rectificativa: referencia a la factura original y
      // base legal del abono (art. 80 LIVA / RD 1619/2012 art. 15).
      drawText(
        pg,
        sanitizeWinAnsi(
          `Factura rectificativa de la factura ${original.invoice_number} (art. 80 LIVA · RD 1619/2012 art. 15). ` +
            `Importes negativos = abono.`,
        ),
        MARGIN_X,
        footerY,
        { font, size: 7.5, color: COLOR_GRAY },
      )
      footerY -= 9

      const devolucionesEmail = storeEmail || null
      const devolucionesLine = devolucionesEmail
        ? sanitizeWinAnsi(`Devoluciones: ${devolucionesEmail} · Consulta las condiciones en nuestra web.`)
        : sanitizeWinAnsi('Devoluciones: consulta las condiciones en nuestra web.')
      drawText(pg, devolucionesLine, MARGIN_X, footerY, { font, size: 7.5, color: COLOR_GRAY })
    }
  }

  // ─── Página 1 ───
  let page = addNewPage()
  let y = PAGE_H - MARGIN_TOP

  /* ─── HEADER: marca + "FACTURA RECTIFICATIVA / ABONO" ─── */
  drawText(page, 'DC BIKES CANTABRIA', MARGIN_X, y, { font: fontBold, size: 16, color: COLOR_DARK })
  drawText(page, 'RECTIFICATIVA', PAGE_W - MARGIN_X, y, {
    font: fontBold,
    size: 15,
    color: COLOR_PRIMARY,
    align: 'right',
  })
  y -= 16
  drawText(page, 'ABONO', PAGE_W - MARGIN_X, y, {
    font: fontBold,
    size: 11,
    color: COLOR_PRIMARY,
    align: 'right',
  })
  y -= 16

  drawText(page, sanitizeWinAnsi(issuer.name), MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
  drawText(page, `Nº ${creditInvoiceNumber}`, PAGE_W - MARGIN_X, y, {
    font: fontBold,
    size: 11,
    color: COLOR_DARK,
    align: 'right',
  })
  y -= 12

  drawText(page, `NIF/CIF: ${sanitizeWinAnsi(issuer.cif)}`, MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
  drawText(page, `Fecha emisión: ${formatDateDMY(new Date())}`, PAGE_W - MARGIN_X, y, {
    font,
    size: 9,
    color: COLOR_GRAY,
    align: 'right',
  })
  y -= 12

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

  /* ─── DESTINATARIO (mismo criterio que la ordinaria) ─── */
  drawText(page, 'ABONAR A', MARGIN_X, y, { font: fontBold, size: 10, color: COLOR_PRIMARY })
  y -= 14

  const customerName = sanitizeWinAnsi(
    `${order.customer_first_name} ${order.customer_last_name}`.trim(),
  )
  const isFullInvoice = order.needs_invoice === true && !!order.invoice_business_name
  const primaryName = isFullInvoice
    ? sanitizeWinAnsi(order.invoice_business_name as string)
    : customerName
  drawText(page, primaryName, MARGIN_X, y, { font: fontBold, size: 11, color: COLOR_DARK })
  y -= 13

  const contactLine = [order.customer_email, order.customer_phone]
    .filter(Boolean)
    .map(sanitizeWinAnsi)
    .join(' · ')
  drawText(page, contactLine, MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
  y -= 12

  if (isFullInvoice) {
    if (order.invoice_cif) {
      drawText(page, `NIF/CIF: ${sanitizeWinAnsi(order.invoice_cif)}`, MARGIN_X, y, {
        font, size: 9, color: COLOR_DARK,
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
  } else if (order.customer_dni) {
    drawText(page, `NIF/DNI: ${sanitizeWinAnsi(order.customer_dni)}`, MARGIN_X, y, {
      font, size: 9, color: COLOR_DARK,
    })
    y -= 12
  }

  y -= 10

  /* ─── REFERENCIA: factura original + devolución ─── */
  const refBoxY = y
  drawRect(page, MARGIN_X, refBoxY - 42, PAGE_W - 2 * MARGIN_X, 42, undefined, COLOR_LIGHT, 0.5)

  drawText(page, 'Rectifica factura', MARGIN_X + 10, refBoxY - 14, { font, size: 8, color: COLOR_GRAY })
  drawText(page, sanitizeWinAnsi(original.invoice_number), MARGIN_X + 10, refBoxY - 26, {
    font: fontBold, size: 11, color: COLOR_DARK,
  })

  drawText(page, 'Fecha original', MARGIN_X + 180, refBoxY - 14, { font, size: 8, color: COLOR_GRAY })
  drawText(page, formatDateDMY(original.issued_at), MARGIN_X + 180, refBoxY - 26, {
    font: fontBold, size: 11, color: COLOR_DARK,
  })

  drawText(page, 'Devolución', MARGIN_X + 320, refBoxY - 14, { font, size: 8, color: COLOR_GRAY })
  drawText(page, sanitizeWinAnsi(ret.return_number), MARGIN_X + 320, refBoxY - 26, {
    font: fontBold, size: 11, color: COLOR_DARK,
  })

  y = refBoxY - 42 - 14

  /* ─── MOTIVO del abono ─── */
  const reasonLabel = REASON_LABELS[ret.reason_code] ?? 'Devolución'
  const motivoText = ret.reason_text
    ? `Motivo: ${reasonLabel} — ${ret.reason_text}`
    : `Motivo: ${reasonLabel}`
  for (const line of wrapText(sanitizeWinAnsi(motivoText), font, 9, PAGE_W - 2 * MARGIN_X - 16)) {
    drawText(page, line, MARGIN_X, y, { font, size: 9, color: COLOR_GRAY })
    y -= 11
  }
  if (ret.is_full_order) {
    drawText(page, 'Devolución del pedido completo (incluye gastos de envío).', MARGIN_X, y, {
      font, size: 9, color: COLOR_GRAY,
    })
    y -= 11
  }
  y -= 8

  /* ─── TABLA DE LÍNEAS DEVUELTAS (importes NEGATIVOS) ─── */
  y = drawTableHeader(page, y)

  const PAGE_BREAK_THRESHOLD = MARGIN_BOTTOM + 60
  const rate = taxRatePct / 100

  for (const item of items) {
    const conceptLines = wrapText(
      sanitizeWinAnsi(item.product_name),
      font,
      9,
      colX.size - colX.concept - 10,
    )
    const estimatedRowH = conceptLines.length > 1 ? 24 : rowH

    if (y - estimatedRowH < PAGE_BREAK_THRESHOLD) {
      page = addNewPage()
      y = PAGE_H - MARGIN_TOP
      y = drawTableHeader(page, y)
    }

    // line_refund_cents es el importe (positivo) reembolsado por esta línea.
    // En el abono se muestra en negativo. Base/IVA se derivan del mismo modo.
    const lineRefund = item.line_refund_cents
    const lineBase = Math.round(lineRefund / (1 + rate))
    const lineIva = lineRefund - lineBase

    drawText(page, conceptLines[0] ?? '', colX.concept, y, { font, size: 9, color: COLOR_DARK })
    if (conceptLines[1]) {
      drawText(page, conceptLines[1], colX.concept, y - 10, { font, size: 8, color: COLOR_GRAY })
    }

    drawText(page, sanitizeWinAnsi(item.product_size_label ?? '—'), colX.size, y, {
      font, size: 9, color: COLOR_DARK, align: 'center',
    })
    drawText(page, String(item.quantity), colX.qty, y, {
      font, size: 9, color: COLOR_DARK, align: 'center',
    })
    drawText(page, formatEuroCents(-lineBase), colX.base, y, {
      font, size: 9, color: COLOR_DARK, align: 'right',
    })
    drawText(page, formatEuroCents(-lineIva), colX.iva, y, {
      font, size: 9, color: COLOR_DARK, align: 'right',
    })
    drawText(page, formatEuroCents(-lineRefund), colX.total, y, {
      font: fontBold, size: 9, color: COLOR_DARK, align: 'right',
    })

    y -= estimatedRowH
    drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, y + 11, COLOR_LIGHT, 0.4)
  }

  // Línea de envío abonado (solo si la devolución es del pedido completo y hay
  // importe de envío reembolsado).
  if (ret.refund_shipping_cents > 0) {
    if (y - rowH < PAGE_BREAK_THRESHOLD) {
      page = addNewPage()
      y = PAGE_H - MARGIN_TOP
      y = drawTableHeader(page, y)
    }
    const shipRefund = ret.refund_shipping_cents
    const shipBase = Math.round(shipRefund / (1 + rate))
    const shipIva = shipRefund - shipBase
    drawText(page, 'Gastos de envío (abono)', colX.concept, y, { font, size: 9, color: COLOR_DARK })
    drawText(page, '—', colX.size, y, { font, size: 9, color: COLOR_GRAY, align: 'center' })
    drawText(page, '1', colX.qty, y, { font, size: 9, color: COLOR_DARK, align: 'center' })
    drawText(page, formatEuroCents(-shipBase), colX.base, y, {
      font, size: 9, color: COLOR_DARK, align: 'right',
    })
    drawText(page, formatEuroCents(-shipIva), colX.iva, y, {
      font, size: 9, color: COLOR_DARK, align: 'right',
    })
    drawText(page, formatEuroCents(-shipRefund), colX.total, y, {
      font: fontBold, size: 9, color: COLOR_DARK, align: 'right',
    })
    y -= rowH
    drawHLine(page, MARGIN_X, PAGE_W - MARGIN_X, y + 11, COLOR_LIGHT, 0.4)
  }

  /* ─── TOTALES (NEGATIVOS) ─── */
  y -= 14
  const totalsX = PAGE_W - MARGIN_X - 220
  const totalsLabelX = totalsX
  const totalsValueX = PAGE_W - MARGIN_X - 8

  drawText(page, 'Base imponible', totalsLabelX, y, { font, size: 10, color: COLOR_GRAY })
  drawText(page, formatEuroCents(base_cents), totalsValueX, y, {
    font, size: 10, color: COLOR_DARK, align: 'right',
  })
  y -= 14

  const rateLbl = taxRatePct.toFixed(2).replace('.00', '')
  drawText(page, `IVA (${rateLbl}%)`, totalsLabelX, y, { font, size: 10, color: COLOR_GRAY })
  drawText(page, formatEuroCents(tax_cents), totalsValueX, y, {
    font, size: 10, color: COLOR_DARK, align: 'right',
  })
  y -= 18

  drawHLine(page, totalsX, PAGE_W - MARGIN_X, y + 8, COLOR_DARK, 0.8)
  drawHLine(page, totalsX, PAGE_W - MARGIN_X, y + 6, COLOR_DARK, 0.8)

  drawText(page, 'TOTAL ABONO', totalsLabelX, y - 6, { font: fontBold, size: 13, color: COLOR_DARK })
  drawText(page, formatEuroCents(total_cents), totalsValueX, y - 6, {
    font: fontBold, size: 13, color: COLOR_DARK, align: 'right',
  })
  y -= 30

  /* ─── REEMBOLSO ─── */
  y -= 10
  drawText(page, 'Reembolso', MARGIN_X, y, { font: fontBold, size: 9, color: COLOR_PRIMARY })
  y -= 12
  drawText(
    page,
    `Importe abonado al medio de pago original (tarjeta · Redsys): ${formatEuroCents(total_cents)}`,
    MARGIN_X,
    y,
    { font, size: 9, color: COLOR_DARK },
  )
  y -= 20

  /* ─── QR TRIBUTARIO: SIEMPRE en ambas modalidades (mismo criterio C-3) ─── */
  {
    const qrDataUrl: string = await QRCode.toDataURL(qrPayload, { width: 96, margin: 1 })
    const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, '')
    const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const qrImage = await pdfDoc.embedPng(pngBytes)

    const qrSize = 72
    const qrX = PAGE_W - MARGIN_X - qrSize
    const qrY = MARGIN_BOTTOM + 42

    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize })

    if (verifactuMode === 'verifactu') {
      drawText(page, 'VERI*FACTU', qrX + qrSize / 2, qrY - 10, {
        font: fontBold, size: 7, color: COLOR_DARK, align: 'center',
      })
      drawText(page, 'Factura verificable en sede.agenciatributaria.gob.es', qrX + qrSize / 2, qrY - 20, {
        font, size: 6, color: COLOR_GRAY, align: 'center',
      })
    } else {
      drawText(page, 'QR tributario (RD 1007/2023)', qrX + qrSize / 2, qrY - 10, {
        font, size: 6, color: COLOR_GRAY, align: 'center',
      })
    }
  }

  /* ─── PIE LEGAL en TODAS las páginas ─── */
  const totalPages = pages.length
  for (let i = 0; i < pages.length; i++) {
    drawPageFooter(pages[i], i + 1, totalPages, i === pages.length - 1)
  }

  return await pdfDoc.save()
}

/* ════════════════════════════════════════════════════════════════════
 *  HELPERS DRAW (idénticos a generate-invoice-pdf)
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
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color })
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
  page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor, borderWidth })
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
