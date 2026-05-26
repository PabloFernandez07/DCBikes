// supabase/functions/send-order-cancelled-by-customer-confirmation/index.ts
//
// Email al cliente confirmando que ÉL canceló su propio pedido (desde /mis-pedidos).
// Distinto a send-order-rejected-customer (que es cuando admin rechaza).
// El copy es de "confirmación de tu acción", no de disculpa.

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
      'store_address',
      'store_phone',
      'quote_destination_email',
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Hemos recibido tu solicitud de cancelación del pedido
        <strong>#${escapeHtml(order.order_number)}</strong> y la hemos procesado correctamente.
      </p>

      <div style="background:#f0f7f0;border-left:3px solid #2a7d3a;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#1a4d1a;font-size:13px;line-height:1.7">
          <strong>La pre-autorización en tu tarjeta se ha liberado automáticamente.</strong><br/>
          No se ha cargado ningún importe (${formatPriceCents(order.total_cents)}).
          La liberación puede tardar <strong>1-3 días laborables</strong> en reflejarse en tu
          cuenta según tu banco.
        </p>
      </div>

      <p style="margin:0 0 16px 0;color:#555;font-size:14px">
        Si has cancelado por error o quieres volver a hacer un pedido, estamos aquí
        para ayudarte${storeEmail ? ` en <a href="mailto:${escapeHtml(storeEmail)}" style="color:#A788B5;text-decoration:none">${escapeHtml(storeEmail)}</a>` : ''}.
      </p>

      <p style="margin:0;color:#555;font-size:14px">
        Gracias por haber considerado DC Bikes Cantabria.
      </p>
    `

    const html = renderEmail({
      title: 'Pedido cancelado correctamente',
      preheader: `Pedido #${order.order_number} cancelado a tu petición · pre-autorización liberada · no se ha cobrado nada.`,
      bodyHtml,
      ctaButton: { label: 'Volver a la tienda', url: `${siteUrl}/catalogo` },
      secondaryLinks: storeEmail
        ? [{ label: 'Contactar con la tienda', url: `mailto:${storeEmail}` }]
        : undefined,
      storeAddress,
      storePhone,
      storeEmail,
      myOrdersUrl: `${siteUrl}/mis-pedidos`,
      footerLinks: [
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Términos de venta', url: `${siteUrl}/terminos-venta` },
      ],
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: [order.customer_email],
      subject: `Tu pedido #${order.order_number} ha sido cancelado`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(
      `[${ts()}] ✓ cancelled-by-customer-confirmation · order=${order.order_number} · resend=${email_id}`,
    )
    return jsonOk({ email_id })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-cancelled-by-customer-confirmation:`, String(err))
    return jsonError(String(err))
  }
})
