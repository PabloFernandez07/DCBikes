// supabase/functions/send-order-confirmation-customer/index.ts
//
// Email al cliente cuando entra un pedido (status=authorized).
// Mensaje: "Hemos recibido tu pedido. Estamos verificando disponibilidad."

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
  formatTotalsBlock,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
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

    if (oErr || !order) {
      console.error(`[${ts()}] order not found:`, oErr?.message)
      return jsonError('order not found', 404)
    }

    const settings = await getSettings(supabase, [
      'store_address',
      'store_phone',
      'quote_destination_email',
      'order_auto_cancel_hours',
      'legal_company_name',
    ])

    const autoCancelHours = asInt(settings.order_auto_cancel_hours, 48)
    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    const deliveryHtml =
      order.delivery_method === 'pickup'
        ? `<p style="margin:0 0 6px 0;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Método de entrega</p>
           <p style="margin:0 0 6px 0;color:#222;font-size:14px"><strong>Recogida en tienda</strong></p>
           ${storeAddress ? `<p style="margin:0;color:#555;font-size:14px">${escapeHtml(storeAddress)}</p>` : ''}`
        : `<p style="margin:0 0 6px 0;color:#666;font-size:13px;text-transform:uppercase;letter-spacing:1px;font-weight:600">Dirección de envío</p>
           ${renderShippingBlock(order)}`

    // TODO Fase E: signed token. Por ahora linkamos sin token; el endpoint
    // order-public-get rechazará la consulta hasta que Fase E genere el token.
    const confirmationUrl = `${siteUrl}/pedido/confirmacion?id=${encodeURIComponent(order.id)}`

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Hemos recibido tu pedido <strong>#${escapeHtml(order.order_number)}</strong> y estamos
        verificando la disponibilidad de los productos. Te confirmaremos en un plazo
        máximo de <strong>${autoCancelHours} horas</strong>.
      </p>

      <div style="background:#fff8e6;border-left:3px solid #e0b94f;padding:12px 16px;margin:20px 0;border-radius:4px">
        <p style="margin:0;color:#5a4400;font-size:13px;line-height:1.6">
          <strong>Importante:</strong> tu pago está en pre-autorización. Si no podemos
          atender el pedido, la reserva se libera automáticamente.
          <strong>No se ha cargado nada en tu tarjeta todavía.</strong>
        </p>
      </div>

      <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F0F12">Resumen del pedido</h3>
      ${formatItemsTable(order.order_items ?? [])}
      ${formatTotalsBlock({
        subtotal_cents: order.subtotal_cents,
        shipping_cents: order.shipping_cents,
        total_cents: order.total_cents,
      })}

      <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:16px;margin:16px 0">
        ${deliveryHtml}
      </div>

      <p style="margin:24px 0 0 0;color:#555;font-size:14px">
        Si tienes cualquier pregunta, responde a este email y te ayudamos enseguida.
      </p>
    `

    const html = renderEmail({
      title: 'Hemos recibido tu pedido',
      preheader: `Pedido #${order.order_number} recibido — pendiente de confirmación en ${autoCancelHours}h.`,
      bodyHtml,
      ctaButton: { label: 'Ver mi pedido', url: confirmationUrl },
      storeAddress,
      storePhone,
      storeEmail,
      footerLinks: [
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Cookies', url: `${siteUrl}/cookies` },
        { label: 'Términos de venta', url: `${siteUrl}/terminos-venta` },
      ],
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: [order.customer_email],
      subject: `Hemos recibido tu pedido #${order.order_number} en DC Bikes`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(`[${ts()}] ✓ confirmation-customer enviado · order=${order.order_number} · resend=${email_id}`)
    return jsonOk({ email_id })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-confirmation-customer:`, String(err))
    return jsonError(String(err))
  }
})
