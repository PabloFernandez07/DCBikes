// supabase/functions/send-order-new-admin/index.ts
//
// Notificación al admin (o varios admin) cuando entra un pedido nuevo.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  CORS_HEADERS,
  asInt,
  asString,
  buildFromAddress,
  escapeHtml,
  formatItemsTable,
  formatPriceCents,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  parseEmailCsv,
  renderShippingBlock,
  sendViaResend,
  type OrderRow,
} from '../_shared/email-utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  const ts = () => new Date().toISOString()

  try {
    const { order_id } = await req.json().catch(() => ({}))
    if (!order_id) return jsonError('order_id required', 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', order_id)
      .single<OrderRow>()

    if (oErr || !order) return jsonError('order not found', 404)

    const settings = await getSettings(supabase, [
      'order_notification_emails',
      'quote_destination_email',
      'order_auto_cancel_hours',
      'store_address',
      'store_phone',
    ])

    // Destinatarios: CSV de admin emails. Fallback: quote_destination_email.
    let recipients = parseEmailCsv(settings.order_notification_emails)
    if (recipients.length === 0) {
      const fallback = asString(settings.quote_destination_email)
      if (fallback) recipients = [fallback]
    }
    if (recipients.length === 0) {
      return jsonError('no admin recipients configured (settings.order_notification_emails)', 400)
    }

    const autoCancelHours = asInt(settings.order_auto_cancel_hours, 48)
    const siteUrl = getSiteUrl()
    const adminUrl = `${siteUrl}/admin/pedidos/${encodeURIComponent(order.id)}`

    const customerName = `${order.customer_first_name} ${order.customer_last_name}`.trim()

    const deliveryHtml =
      order.delivery_method === 'pickup'
        ? `<p style="margin:0;color:#222;font-size:14px"><strong>Recogida en tienda</strong></p>`
        : renderShippingBlock(order)

    const bodyHtml = `
      <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#7f1d1d;font-size:13px;line-height:1.6">
          <strong>Acción requerida:</strong> tienes hasta
          <strong>${autoCancelHours} horas</strong> para aceptar o rechazar este pedido.
          Si no respondes, se cancelará automáticamente y se liberará el cobro.
        </p>
      </div>

      <h3 style="margin:0 0 12px 0;font-size:16px;color:#0F0F12">Datos del cliente</h3>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;color:#666;width:120px">Nombre</td>
          <td style="padding:6px 0;color:#222;font-weight:600">${escapeHtml(customerName)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666">Email</td>
          <td style="padding:6px 0"><a href="mailto:${escapeHtml(order.customer_email)}" style="color:#A788B5;text-decoration:none">${escapeHtml(order.customer_email)}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666">Teléfono</td>
          <td style="padding:6px 0"><a href="tel:${escapeHtml(order.customer_phone.replace(/\s+/g, ''))}" style="color:#A788B5;text-decoration:none">${escapeHtml(order.customer_phone)}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666;vertical-align:top">Entrega</td>
          <td style="padding:6px 0;color:#222">${deliveryHtml}</td>
        </tr>
        ${
          order.needs_invoice
            ? `<tr>
              <td style="padding:6px 0;color:#666;vertical-align:top">Factura B2B</td>
              <td style="padding:6px 0;color:#222">
                ${escapeHtml(order.invoice_business_name ?? '')}<br/>
                CIF: ${escapeHtml(order.invoice_cif ?? '')}<br/>
                ${escapeHtml(order.invoice_address ?? '')}
              </td>
            </tr>`
            : ''
        }
      </table>

      <h3 style="margin:0 0 8px 0;font-size:16px;color:#0F0F12">Productos</h3>
      ${formatItemsTable(order.order_items ?? [])}

      <p style="margin:8px 0 0 0;text-align:right;font-size:18px;color:#0F0F12;font-weight:700">
        Total: ${formatPriceCents(order.total_cents)}
        <span style="font-weight:400;font-size:13px;color:#666"> (${escapeHtml(order.payment_method ?? 'redsys')})</span>
      </p>
    `

    const html = renderEmail({
      title: `Nuevo pedido #${order.order_number}`,
      preheader: `${customerName} · ${formatPriceCents(order.total_cents)} · ${order.delivery_method === 'pickup' ? 'Recogida tienda' : 'Envío'}`,
      bodyHtml,
      ctaButton: { label: 'Abrir en el panel de administración', url: adminUrl },
      storeAddress: asString(settings.store_address),
      storePhone: asString(settings.store_phone),
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: recipients,
      subject: `🔔 Nuevo pedido #${order.order_number} pendiente de tu confirmación`,
      html,
    })

    console.log(
      `[${ts()}] ✓ new-admin enviado · order=${order.order_number} · to=${recipients.length} addrs · resend=${email_id}`,
    )
    return jsonOk({ email_id, recipients_count: recipients.length })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-new-admin:`, String(err))
    return jsonError(String(err))
  }
})
