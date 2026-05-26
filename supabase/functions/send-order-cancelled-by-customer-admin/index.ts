// supabase/functions/send-order-cancelled-by-customer-admin/index.ts
//
// Feature O — Notificación al admin cuando un cliente cancela su pedido
// desde "Mis pedidos" (acceso via magic link).
//
// Invocada en fire-and-forget desde customer-order-cancel. Sin auth porque
// la única forma de llegar aquí es via supabase.functions.invoke() desde
// otra edge function (la red privada de Supabase ya lo gatekeepa).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  CORS_HEADERS,
  asString,
  buildFromAddress,
  escapeHtml,
  formatDateTimeES,
  formatPriceCents,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  parseEmailCsv,
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

    const bodyHtml = `
      <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#7f1d1d;font-size:13px;line-height:1.6">
          El cliente ha cancelado este pedido desde su área de "Mis pedidos".
          La pre-autorización en su tarjeta ha sido liberada automáticamente.
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
          <td style="padding:6px 0;color:#222;font-weight:600">#${escapeHtml(order.order_number)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666">Total</td>
          <td style="padding:6px 0;color:#222;font-weight:600">${formatPriceCents(order.total_cents)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666">Fecha del pedido</td>
          <td style="padding:6px 0;color:#222">${escapeHtml(formatDateTimeES(order.created_at))}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#666">Cancelado el</td>
          <td style="padding:6px 0;color:#222">${escapeHtml(formatDateTimeES(new Date()))}</td>
        </tr>
      </table>

      <p style="margin:0 0 12px 0;color:#555;font-size:14px;line-height:1.6">
        El stock de los productos del pedido ha sido restaurado automáticamente.
        No se requiere acción adicional por tu parte, pero puedes revisar el
        historial completo en el panel.
      </p>
    `

    const html = renderEmail({
      title: `Pedido cancelado por el cliente`,
      preheader: `#${order.order_number} · ${customerName} · ${formatPriceCents(order.total_cents)}`,
      bodyHtml,
      ctaButton: { label: 'Ver pedido en el panel', url: adminUrl },
      storeAddress: asString(settings.store_address),
      storePhone: asString(settings.store_phone),
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: recipients,
      subject: `❌ Cliente canceló el pedido #${order.order_number}`,
      html,
    })

    console.log(
      `[${ts()}] ✓ cancelled-by-customer-admin · order=${order.order_number} · to=${recipients.length} · resend=${email_id}`,
    )
    return jsonOk({ email_id, recipients_count: recipients.length })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-cancelled-by-customer-admin:`, String(err))
    return jsonError(String(err))
  }
})
