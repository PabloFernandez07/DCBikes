// supabase/functions/send-order-accepted-customer/index.ts
//
// Email al cliente cuando el admin acepta el pedido.
// Incluye factura PDF como attachment (si existe en bucket `invoices`).
// Si no existe factura (caso edge: Fase E llamó sin esperar Fase H), envía
// el email igualmente SIN attachment y registra warning.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  buildCorsHeaders,
  asString,
  buildFromAddress,
  downloadInvoicePdf,
  escapeHtml,
  formatItemsTable,
  formatPriceCents,
  formatTotalsBlock,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  renderShippingBlock,
  sendViaResend,
  type OrderRow,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

interface InvoiceRow {
  invoice_number: string
  pdf_storage_path: string
  total_cents: number
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-order-accepted-customer: x-internal-secret inválido o ausente`)
    return jsonError('forbidden', 403, req)
  }

  try {
    const { order_id } = await req.json().catch(() => ({}))
    if (!order_id) return jsonError('order_id required', 400, req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single<OrderRow>()

    if (oErr || !order) return jsonError('order not found', 404, req)

    // Buscar factura asociada (puede no existir aún)
    const { data: invoice } = await supabase
      .from('invoices')
      .select('invoice_number, pdf_storage_path, total_cents')
      .eq('order_id', order.id)
      .maybeSingle<InvoiceRow>()

    const settings = await getSettings(supabase, [
      'store_address',
      'store_phone',
      'quote_destination_email',
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    // Adjuntar factura si existe
    // S-05 (auditoría legal V3): la signed URL ya NO se incluye en el cuerpo
    // del email. El PDF se adjunta directamente; el CTA dirige a /mis-pedidos.
    let attachment = null
    if (invoice) {
      attachment = await downloadInvoicePdf(supabase, invoice.pdf_storage_path)
      if (!attachment) {
        console.warn(
          `[${ts()}] ⚠ invoice file unreadable (path=${invoice.pdf_storage_path}) — enviando sin adjunto`,
        )
      }
    } else {
      console.warn(
        `[${ts()}] ⚠ no invoice row for order=${order.order_number} — Fase E debería generar la factura antes de llamar este email. Continuando sin adjunto.`,
      )
    }

    const deliveryMessage =
      order.delivery_method === 'shipping'
        ? `Lo prepararemos y enviaremos en los próximos días. Recibirás otro email con el número de seguimiento cuando salga del almacén.`
        : `Te avisaremos por email en cuanto esté listo para recoger en nuestra tienda.`

    const deliveryBlock =
      order.delivery_method === 'shipping'
        ? `<p style="margin:0 0 6px 0;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Dirección de envío</p>
           ${renderShippingBlock(order)}`
        : `<p style="margin:0 0 6px 0;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Recogida en</p>
           <p style="margin:0;color:#222;font-size:14px">${escapeHtml(storeAddress || 'Nuestra tienda en El Astillero')}</p>`

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Buenas noticias — hemos <strong style="color:#2a7d3a">confirmado tu pedido
        #${escapeHtml(order.order_number)}</strong>. Acabamos de cargar
        <strong>${formatPriceCents(order.total_cents)}</strong> en tu tarjeta.
      </p>

      <p style="margin:0 0 16px 0">${deliveryMessage}</p>

      ${
        invoice
          ? `<div style="background:#f0f7f0;border-left:3px solid #2a7d3a;padding:12px 16px;margin:20px 0;border-radius:4px">
              <p style="margin:0 0 6px 0;color:#1a4d1a;font-size:13px;font-weight:600">
                Factura ${escapeHtml(invoice.invoice_number)}
              </p>
              <p style="margin:0;color:#1a4d1a;font-size:13px;line-height:1.6">
                ${attachment ? 'Adjunta a este email en PDF.' : 'Disponible online (te haremos llegar el adjunto en breve).'}
              </p>
            </div>`
          : ''
      }

      <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F0F12">Resumen</h3>
      ${formatItemsTable(order.order_items ?? [])}
      ${formatTotalsBlock({
        subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents,
        total_cents: order.total_cents,
      })}

      <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:16px;margin:16px 0">
        ${deliveryBlock}
      </div>

      <p style="margin:24px 0 0 0;color:#555;font-size:14px">
        Gracias por confiar en DC Bikes Cantabria.
      </p>
    `

    const html = renderEmail({
      title: 'Tu pedido ha sido aceptado',
      preheader: `Pedido #${order.order_number} confirmado · ${formatPriceCents(order.total_cents)}${invoice ? ` · Factura ${invoice.invoice_number}` : ''}.`,
      bodyHtml,
      ctaButton: { label: 'Ver mis pedidos', url: `${siteUrl}/mis-pedidos` },
      storeAddress,
      storePhone,
      storeEmail,
      footerLinks: [
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Devoluciones', url: `${siteUrl}/devoluciones` },
      ],
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: [order.customer_email],
      subject: `✅ Tu pedido #${order.order_number} ha sido aceptado`,
      html,
      reply_to: storeEmail || undefined,
      attachments: attachment
        ? [{ filename: attachment.filename, content: attachment.base64 }]
        : undefined,
    })

    console.log(
      `[${ts()}] ✓ accepted-customer · order=${order.order_number} · invoice=${invoice?.invoice_number ?? 'none'} · attached=${!!attachment} · resend=${email_id}`,
    )
    return jsonOk({ email_id, invoice_attached: !!attachment }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-accepted-customer:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
