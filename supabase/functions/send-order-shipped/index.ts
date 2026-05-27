// supabase/functions/send-order-shipped/index.ts
//
// Email al cliente cuando admin marca el pedido como enviado.
// Incluye tracking number + link al carrier si conocemos su sistema.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  buildCorsHeaders,
  asString,
  buildFromAddress,
  escapeHtml,
  formatItemsTable,
  getSettings,
  getSiteUrl,
  getTrackingUrl,
  jsonError,
  jsonOk,
  renderShippingBlock,
  sendViaResend,
  type OrderRow,
} from '../_shared/email-utils.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const ts = () => new Date().toISOString()

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
    if (order.delivery_method !== 'shipping') {
      return jsonError(`order ${order.order_number} is not shipping (delivery_method=${order.delivery_method})`, 400, req)
    }

    const settings = await getSettings(supabase, [
      'store_address',
      'store_phone',
      'quote_destination_email',
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    const tracking = order.tracking_number ?? null
    const carrier = order.tracking_carrier ?? null
    const trackingUrl = getTrackingUrl(carrier, tracking)

    const trackingBlock = tracking
      ? `<div style="background:#f8f5ff;border-left:3px solid #C4A2CF;padding:16px;margin:0 0 20px 0;border-radius:4px">
          <p style="margin:0 0 6px 0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">
            Seguimiento
          </p>
          <p style="margin:0 0 4px 0;color:#222;font-size:16px;font-weight:700;font-family:'Courier New',monospace">
            ${escapeHtml(tracking)}
          </p>
          ${
            carrier
              ? `<p style="margin:4px 0 0 0;color:#555;font-size:13px">
                  Transportista: <strong>${escapeHtml(carrier)}</strong>
                </p>`
              : ''
          }
          ${
            trackingUrl
              ? `<p style="margin:10px 0 0 0">
                  <a href="${escapeHtml(trackingUrl)}" style="color:#A788B5;text-decoration:underline;font-size:13px;font-weight:600">
                    Ver estado del envío →
                  </a>
                </p>`
              : ''
          }
        </div>`
      : `<div style="background:#fafafa;border-left:3px solid #999;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
          <p style="margin:0;color:#555;font-size:13px">
            El número de seguimiento te llegará en cuanto el transportista lo emita.
          </p>
        </div>`

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        <strong>Tu pedido #${escapeHtml(order.order_number)} ya está en camino.</strong>
        Plazo estimado de entrega: <strong>1-3 días laborables</strong>.
      </p>

      ${trackingBlock}

      <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px 0;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">
          Dirección de entrega
        </p>
        ${renderShippingBlock(order)}
      </div>

      <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F0F12">Tu pedido</h3>
      ${formatItemsTable(order.order_items ?? [])}

      <p style="margin:24px 0 0 0;color:#555;font-size:14px">
        Si hubiera cualquier incidencia con la entrega, contacta con nosotros y lo
        resolvemos.
      </p>
    `

    const html = renderEmail({
      title: 'Tu pedido está en camino',
      preheader: `Pedido #${order.order_number} enviado${tracking ? ` · ${tracking}` : ''} · entrega en 1-3 días laborables.`,
      bodyHtml,
      ctaButton: trackingUrl
        ? { label: 'Ver estado del envío', url: trackingUrl }
        : undefined,
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
      subject: `🚚 Tu pedido #${order.order_number} está en camino`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(
      `[${ts()}] ✓ shipped · order=${order.order_number} · tracking=${tracking ?? 'none'} · carrier=${carrier ?? 'none'} · resend=${email_id}`,
    )
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-shipped:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
