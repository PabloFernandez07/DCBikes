// supabase/functions/send-order-rejected-customer/index.ts
//
// Email al cliente cuando el admin rechaza el pedido (o no hay stock, etc).
// Enfatiza que la pre-autorización ha sido liberada y NO hay cargo.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  buildCorsHeaders,
  asString,
  buildFromAddress,
  escapeHtml,
  formatPriceCents,
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

    const settings = await getSettings(supabase, [
      'store_address',
      'store_phone',
      'quote_destination_email',
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    const reason =
      order.rejection_reason && order.rejection_reason.trim().length > 0
        ? order.rejection_reason.trim()
        : 'no disponibilidad de stock en este momento'

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Lamentablemente <strong>no podemos atender tu pedido
        #${escapeHtml(order.order_number)}</strong>.
      </p>

      <div style="background:#fafafa;border-left:3px solid #999;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0 0 4px 0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">
          Motivo
        </p>
        <p style="margin:0;color:#333;font-size:14px;line-height:1.6">
          ${escapeHtml(reason)}
        </p>
      </div>

      <div style="background:#f0f7f0;border-left:3px solid #2a7d3a;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#1a4d1a;font-size:13px;line-height:1.7">
          <strong>La pre-autorización en tu tarjeta se ha liberado automáticamente.</strong><br/>
          No se ha cargado ningún importe (${formatPriceCents(order.total_cents)}).
          La liberación puede tardar <strong>1-3 días laborables</strong> en reflejarse en tu
          cuenta según tu banco.
        </p>
      </div>

      <p style="margin:0 0 16px 0;color:#555;font-size:14px">
        Sentimos mucho las molestias. Si necesitas ayuda o quieres consultar disponibilidad
        de otros productos, no dudes en escribirnos${storeEmail ? ` a <a href="mailto:${escapeHtml(storeEmail)}" style="color:#A788B5;text-decoration:none">${escapeHtml(storeEmail)}</a>` : ''}.
      </p>

      <p style="margin:0;color:#555;font-size:14px">
        Quedamos a tu disposición.
      </p>
    `

    const html = renderEmail({
      title: 'No hemos podido atender tu pedido',
      preheader: `Pedido #${order.order_number} cancelado · pre-autorización liberada · no se ha cobrado nada.`,
      bodyHtml,
      ctaButton: { label: 'Volver a la tienda', url: `${siteUrl}/catalogo` },
      secondaryLinks: storeEmail
        ? [{ label: 'Contactar con la tienda', url: `mailto:${storeEmail}` }]
        : undefined,
      storeAddress,
      storePhone,
      storeEmail,
      footerLinks: [
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Términos de venta', url: `${siteUrl}/terminos-venta` },
      ],
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: [order.customer_email],
      subject: `Lamentamos no poder atender tu pedido #${order.order_number}`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(`[${ts()}] ✓ rejected-customer · order=${order.order_number} · resend=${email_id}`)
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-rejected-customer:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
