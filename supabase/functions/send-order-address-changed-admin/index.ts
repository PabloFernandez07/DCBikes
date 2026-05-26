// supabase/functions/send-order-address-changed-admin/index.ts
//
// Feature O — Notificación al admin cuando un cliente modifica la dirección
// de envío de un pedido (pending/authorized/accepted + shipping).
//
// Invocada en fire-and-forget desde customer-order-update-address.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  buildCorsHeaders,
  asString,
  buildFromAddress,
  escapeHtml,
  formatDateTimeES,
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
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const ts = () => new Date().toISOString()

  try {
    const body = (await req.json().catch(() => ({}))) as {
      order_id?: string
      diff?: string
    }
    const order_id = body.order_id
    const diff = (body.diff ?? '').trim()
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
      'store_address',
      'store_phone',
    ])

    let recipients = parseEmailCsv(settings.order_notification_emails)
    if (recipients.length === 0) {
      const fallback = asString(settings.quote_destination_email)
      if (fallback) recipients = [fallback]
    }
    if (recipients.length === 0) {
      return jsonError(
        'no admin recipients configured (settings.order_notification_emails)',
        400,
      )
    }

    const siteUrl = getSiteUrl()
    const adminUrl = `${siteUrl}/admin/pedidos/${encodeURIComponent(order.id)}`
    const customerName = `${order.customer_first_name} ${order.customer_last_name}`.trim()

    // Render del diff como lista bullet, fallback a string crudo.
    const diffItems = diff
      .split(' · ')
      .map((p) => p.trim())
      .filter(Boolean)
    const diffHtml =
      diffItems.length > 0
        ? `<ul style="margin:0;padding-left:20px;color:#333;font-size:14px;line-height:1.7">
            ${diffItems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}
          </ul>`
        : `<p style="margin:0;color:#666;font-size:14px">${escapeHtml(diff || 'sin detalle')}</p>`

    const bodyHtml = `
      <div style="background:#fffbeb;border-left:3px solid #d97706;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#78350f;font-size:13px;line-height:1.6">
          El cliente ha modificado la dirección de envío de este pedido.
          <strong>Revisa antes de preparar el envío.</strong>
        </p>
      </div>

      <h3 style="margin:0 0 12px 0;font-size:16px;color:#0F0F12">Datos del cliente</h3>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-collapse:collapse">
        <tr>
          <td style="padding:6px 0;color:#666;width:140px">Nombre</td>
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
          <td style="padding:6px 0;color:#666">Pedido</td>
          <td style="padding:6px 0;color:#222;font-weight:600">#${escapeHtml(order.order_number)} <span style="color:#666;font-weight:400">(${escapeHtml(order.status)})</span></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666">Modificado el</td>
          <td style="padding:6px 0;color:#222">${escapeHtml(formatDateTimeES(new Date()))}</td>
        </tr>
      </table>

      <h3 style="margin:0 0 8px 0;font-size:16px;color:#0F0F12">Cambios realizados</h3>
      <div style="background:#f8f5ff;border-left:3px solid #C4A2CF;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        ${diffHtml}
      </div>

      <h3 style="margin:0 0 8px 0;font-size:16px;color:#0F0F12">Nueva dirección de envío</h3>
      <div style="background:#fafafa;border:1px solid #eaeaea;padding:14px 16px;margin:0 0 20px 0;border-radius:4px">
        ${renderShippingBlock(order)}
      </div>
    `

    const html = renderEmail({
      title: `Dirección modificada por el cliente`,
      preheader: `#${order.order_number} · ${customerName} · revisa antes de enviar`,
      bodyHtml,
      ctaButton: { label: 'Ver pedido en el panel', url: adminUrl },
      storeAddress: asString(settings.store_address),
      storePhone: asString(settings.store_phone),
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: recipients,
      subject: `🔄 Dirección modificada en pedido #${order.order_number}`,
      html,
    })

    console.log(
      `[${ts()}] ✓ address-changed-admin · order=${order.order_number} · to=${recipients.length} · resend=${email_id}`,
    )
    return jsonOk({ email_id, recipients_count: recipients.length })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-address-changed-admin:`, String(err))
    return jsonError(String(err))
  }
})
