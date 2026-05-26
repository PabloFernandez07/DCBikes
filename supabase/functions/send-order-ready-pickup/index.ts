// supabase/functions/send-order-ready-pickup/index.ts
//
// Email al cliente cuando admin marca el pedido como "listo para recoger".

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  buildCorsHeaders,
  asInt,
  asString,
  buildFromAddress,
  escapeHtml,
  formatItemsTable,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  sendViaResend,
  type OrderRow,
} from '../_shared/email-utils.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
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
    if (order.delivery_method !== 'pickup') {
      return jsonError(`order ${order.order_number} is not pickup (delivery_method=${order.delivery_method})`, 400)
    }

    const settings = await getSettings(supabase, [
      'store_address',
      'store_phone',
      'store_hours',
      'quote_destination_email',
      'pickup_deadline_days',
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeHours = asString(settings.store_hours)
    const storeEmail = asString(settings.quote_destination_email)
    const pickupDays = asInt(settings.pickup_deadline_days, 15)
    const siteUrl = getSiteUrl()

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        <strong>Tu pedido #${escapeHtml(order.order_number)} ya está listo para recoger</strong>
        en nuestra tienda. Te esperamos.
      </p>

      <div style="background:#f8f5ff;border-left:3px solid #C4A2CF;padding:16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0 0 6px 0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">
          Dónde recogerlo
        </p>
        <p style="margin:0;color:#222;font-size:15px;font-weight:600;line-height:1.5">
          ${escapeHtml(storeAddress || 'DC Bikes Cantabria · El Astillero')}
        </p>
        ${
          storeHours
            ? `<p style="margin:8px 0 0 0;color:#555;font-size:13px;line-height:1.6">
                <strong>Horario:</strong> ${escapeHtml(storeHours)}
              </p>`
            : ''
        }
        ${
          storePhone
            ? `<p style="margin:6px 0 0 0;color:#555;font-size:13px">
                <strong>Teléfono:</strong> <a href="tel:${escapeHtml(storePhone.replace(/\s+/g, ''))}" style="color:#A788B5;text-decoration:none">${escapeHtml(storePhone)}</a>
              </p>`
            : ''
        }
      </div>

      <div style="background:#fff8e6;border-left:3px solid #e0b94f;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#5a4400;font-size:13px;line-height:1.6">
          <strong>Plazo:</strong> recógelo en los próximos <strong>${pickupDays} días</strong>.
          Pasado ese plazo, contactaremos contigo para coordinar.
        </p>
      </div>

      <p style="margin:0 0 8px 0;color:#666;font-size:13px">
        <strong>Cuando vengas:</strong> trae este email o el número de pedido
        <strong>#${escapeHtml(order.order_number)}</strong>.
      </p>

      <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F0F12">Tu pedido</h3>
      ${formatItemsTable(order.order_items ?? [])}
    `

    const html = renderEmail({
      title: 'Tu pedido está listo para recoger',
      preheader: `Pedido #${order.order_number} listo en tienda · plazo de recogida ${pickupDays} días.`,
      bodyHtml,
      ctaButton: storeAddress
        ? {
            label: 'Cómo llegar',
            url: `https://www.google.com/maps/search/${encodeURIComponent(storeAddress)}`,
          }
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
      subject: `📦 Tu pedido #${order.order_number} está listo para recoger`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(`[${ts()}] ✓ ready-pickup · order=${order.order_number} · resend=${email_id}`)
    return jsonOk({ email_id })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-ready-pickup:`, String(err))
    return jsonError(String(err))
  }
})
