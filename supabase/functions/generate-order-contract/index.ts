// supabase/functions/generate-order-contract/index.ts
//
// Sprint 2 — L-05 / C-07 / C-08: Soporte duradero (art. 98 RDL 1/2007).
//
// Genera un PDF A4 con:
//   - Datos del vendedor y comprador (snapshot del pedido).
//   - Versión de Términos y Condiciones vigente en el momento del pedido.
//   - Resumen legal: desistimiento, garantía, ODR.
//
// El PDF se sube al bucket privado `order-contracts/{order_id}.pdf`.
// La operación es idempotente (upsert: true).
//
// Input (POST JSON): { order_id: string }
// Output: { ok: true, path: string, terms_version: string }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

import {
  buildCorsHeaders,
  asString,
  getSettings,
  jsonError,
  jsonOk,
  type OrderItemRow,
  type OrderRow,
} from '../_shared/email-utils.ts'
import { sanitizeWinAnsi } from '../_shared/pdf-utils.ts'

/* ─────────────── Layout A4 ─────────────── */
const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN_X = 50
const MARGIN_TOP = 50
const MARGIN_BOTTOM = 50

const COLOR_DARK = rgb(0.06, 0.06, 0.07)
const COLOR_GRAY = rgb(0.4, 0.4, 0.42)
const COLOR_PRIMARY = rgb(0.65, 0.53, 0.71) // #A788B5

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = await req.json().catch(() => ({})) as { order_id?: string }
    if (!body.order_id) return jsonError('order_id required', 400, req)
    const orderId = body.order_id

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    /* ─── 1. Cargar pedido + items ─── */
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', orderId)
      .single<OrderRow & { order_items: OrderItemRow[] }>()

    if (oErr || !order) {
      console.warn(`[${ts()}] generate-order-contract: order not found id=${orderId}`)
      return jsonError('order not found', 404, req)
    }

    /* ─── 2. Cargar settings ─── */
    const settings = await getSettings(supabase, [
      'legal_company_name',
      'legal_company_cif',
      'legal_company_address',
      'store_url',
      'terms_version',
      'store_contact_email',
      'quote_destination_email',
    ])

    const companyName = asString(settings.legal_company_name, '[PENDIENTE]').trim() || '[PENDIENTE]'
    const companyCif = asString(settings.legal_company_cif).trim() || '[PENDIENTE]'
    const companyAddress = asString(settings.legal_company_address).trim() || '[PENDIENTE]'
    const storeUrl = asString(settings.store_url, 'https://dcbikescantabria.es').trim() || 'https://dcbikescantabria.es'
    const supportEmail =
      asString(settings.store_contact_email).trim() ||
      asString(settings.quote_destination_email).trim() ||
      'info@dcbikescantabria.es'
    const termsVersion = asString(settings.terms_version).trim() || new Date().toISOString().slice(0, 10)

    /* ─── 3. Generar PDF ─── */
    const pdfBytes = await buildContractPdf({
      order,
      companyName,
      companyCif,
      companyAddress,
      storeUrl,
      supportEmail,
      termsVersion,
    })

    /* ─── 4. Subir a bucket order-contracts ─── */
    const path = `${order.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('order-contracts')
      .upload(path, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
        cacheControl: '3600',
      })

    if (uploadErr) {
      console.error(`[${ts()}] generate-order-contract upload failed order=${orderId}:`, uploadErr.message)
      return jsonError(`upload failed: ${uploadErr.message}`, 500, req)
    }

    console.log(`[${ts()}] ✓ generate-order-contract · order=${order.order_number} · path=${path} · size=${pdfBytes.length}B`)
    return jsonOk({ path, terms_version: termsVersion }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ generate-order-contract fatal:`, String(err))
    return jsonError(`internal error: ${String(err)}`, 500, req)
  }
})

/* ════════════════════════════════════════════════════════════════════
 *  RENDER PDF
 * ═══════════════════════════════════════════════════════════════════ */

interface ContractArgs {
  order: OrderRow & { order_items: OrderItemRow[] }
  companyName: string
  companyCif: string
  companyAddress: string
  storeUrl: string
  supportEmail: string
  termsVersion: string
}

async function buildContractPdf(args: ContractArgs): Promise<Uint8Array> {
  const { order, companyName, companyCif, companyAddress, storeUrl, supportEmail, termsVersion } = args

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Contrato pedido ${order.order_number}`)
  pdf.setAuthor(companyName)
  pdf.setSubject('Contrato de compraventa a distancia')
  pdf.setCreator('DC Bikes Cantabria')
  pdf.setProducer('pdf-lib')
  pdf.setCreationDate(new Date())

  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const page = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - MARGIN_TOP
  const usableW = PAGE_W - 2 * MARGIN_X

  /* ── helpers locales ── */
  const line = (text: string, f = font, size = 10, color = COLOR_DARK) => {
    const clean = sanitizeWinAnsi(text)
    page.drawText(clean, { x: MARGIN_X, y, size, font: f, color })
    y -= size + 5
  }

  const heading = (text: string) => {
    y -= 6
    const clean = sanitizeWinAnsi(text)
    page.drawText(clean, { x: MARGIN_X, y, size: 11, font: fontBold, color: COLOR_PRIMARY })
    y -= 17
    // underline
    page.drawLine({
      start: { x: MARGIN_X, y: y + 4 },
      end: { x: MARGIN_X + usableW, y: y + 4 },
      thickness: 0.5,
      color: COLOR_PRIMARY,
    })
    y -= 4
  }

  const smallLine = (text: string, color = COLOR_GRAY) => {
    const clean = sanitizeWinAnsi(text)
    page.drawText(clean, { x: MARGIN_X, y, size: 9, font, color })
    y -= 13
  }

  /* ── Título ── */
  page.drawText('CONTRATO DE COMPRAVENTA A DISTANCIA', {
    x: MARGIN_X, y, size: 15, font: fontBold, color: COLOR_DARK,
  })
  y -= 20
  page.drawLine({
    start: { x: MARGIN_X, y },
    end: { x: MARGIN_X + usableW, y },
    thickness: 1.5,
    color: COLOR_DARK,
  })
  y -= 14

  smallLine(`Versión de Términos: ${termsVersion}`)
  smallLine(`Fecha del pedido: ${new Date(order.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`)
  smallLine(`Número de pedido: ${order.order_number}`)
  smallLine(`Documento generado el: ${new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`)

  /* ── Vendedor ── */
  heading('1. VENDEDOR')
  smallLine(`Razón social: ${companyName}`)
  smallLine(`NIF/CIF: ${companyCif}`)
  smallLine(`Dirección: ${companyAddress}`)
  smallLine(`Email de contacto: ${supportEmail}`)
  smallLine(`Web: ${storeUrl}`)

  /* ── Comprador ── */
  heading('2. COMPRADOR')
  const buyerName = `${order.customer_first_name ?? ''} ${order.customer_last_name ?? ''}`.trim()
  smallLine(`Nombre: ${buyerName}`)
  smallLine(`Email: ${order.customer_email ?? ''}`)
  if (order.customer_phone) smallLine(`Teléfono: ${order.customer_phone}`)
  if (order.customer_dni) smallLine(`NIF/DNI: ${order.customer_dni}`)
  if (order.delivery_method === 'shipping' && order.shipping_address) {
    const addrParts = [
      order.shipping_address,
      [order.shipping_postal_code, order.shipping_city].filter(Boolean).join(' '),
      order.shipping_province,
    ].filter(Boolean).join(', ')
    smallLine(`Dirección de envío: ${addrParts}`)
  } else {
    smallLine('Método de entrega: Recogida en tienda')
  }

  /* ── Productos ── */
  heading('3. PRODUCTOS ADQUIRIDOS')
  for (const item of order.order_items ?? []) {
    const totalLine = ((item.unit_price_cents * item.quantity) / 100).toFixed(2)
    const unitPrice = (item.unit_price_cents / 100).toFixed(2)
    const sizePart = item.product_size_label ? ` (Talla: ${item.product_size_label})` : ''
    smallLine(`${item.quantity}x ${item.product_name}${sizePart} — ${unitPrice} €/ud — Total: ${totalLine} €`)
  }
  y -= 4
  if (order.shipping_cents > 0) {
    smallLine(`Gastos de envío: ${(order.shipping_cents / 100).toFixed(2)} €`)
  }
  const totalStr = ((order.total_cents ?? 0) / 100).toFixed(2)
  y -= 2
  page.drawText(`TOTAL: ${totalStr} €`, {
    x: MARGIN_X, y, size: 11, font: fontBold, color: COLOR_DARK,
  })
  y -= 16

  /* ── Términos resumidos ── */
  heading('4. CONDICIONES GENERALES (VERSIÓN ' + termsVersion + ')')

  const conditions = [
    '4.1 Perfección del contrato: el contrato se perfecciona en el momento en que el vendedor',
    '    confirma el pedido mediante email al comprador (art. 23 LSSI-CE; art. 1262 C. Civil).',
    '',
    '4.2 Derecho de desistimiento (art. 102 RDL 1/2007): el comprador dispone de 14 días',
    '    naturales desde la recepción del producto para desistir sin indicar motivo alguno.',
    '    Para ejercerlo, utilice el formulario oficial adjunto a este email o comuníquelo por',
    `    escrito a ${supportEmail}. Las bicicletas montadas a medida quedan excluidas`,
    '    del desistimiento según el art. 103.c RDL 1/2007.',
    '',
    '4.3 Plazo de entrega (art. 66 bis RDL 1/2007): el plazo máximo es 30 días naturales.',
    '    El plazo habitual es 2-5 días laborables para Península.',
    '',
    '4.4 Garantía legal (art. 120 RDL 1/2007, redacción RD-ley 7/2021): 3 años por falta',
    '    de conformidad desde la entrega del producto.',
    '',
    '4.5 Resolución de litigios: el comprador puede acudir a la plataforma europea de',
    '    resolución de litigios en línea (ODR): https://ec.europa.eu/consumers/odr/',
    '',
    `4.6 Texto completo y vigente de las condiciones: ${storeUrl}/terminos`,
  ]

  for (const l of conditions) {
    if (y < MARGIN_BOTTOM + 80) break // protección overflow
    smallLine(l, l.startsWith('4.') ? COLOR_DARK : COLOR_GRAY)
  }

  /* ── Firma y reconocimiento ── */
  if (y > MARGIN_BOTTOM + 60) {
    heading('5. ACEPTACIÓN')
    smallLine('El comprador aceptó los Términos y Condiciones y la Política de Privacidad')
    smallLine('al completar el proceso de compra online.')
    if (order.accepted_terms_at) {
      smallLine(`Fecha de aceptación: ${new Date(order.accepted_terms_at as string).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}`)
    }
  }

  /* ── Pie de página ── */
  page.drawLine({
    start: { x: MARGIN_X, y: MARGIN_BOTTOM + 18 },
    end: { x: MARGIN_X + usableW, y: MARGIN_BOTTOM + 18 },
    thickness: 0.4,
    color: COLOR_GRAY,
  })
  const footerText = sanitizeWinAnsi(
    `Documento con valor de soporte duradero (art. 98 RDL 1/2007) — Generado automáticamente · Pedido ${order.order_number}`,
  )
  page.drawText(footerText, {
    x: MARGIN_X,
    y: MARGIN_BOTTOM + 6,
    size: 7.5,
    font,
    color: COLOR_GRAY,
  })

  return await pdf.save()
}
