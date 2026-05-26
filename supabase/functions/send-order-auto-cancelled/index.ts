// supabase/functions/send-order-auto-cancelled/index.ts
//
// Email al cliente (con copia a admins) cuando pg_cron auto-cancela un pedido
// que el admin no aceptó/rechazó en el plazo (`order_auto_cancel_hours`).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  CORS_HEADERS,
  asInt,
  asString,
  buildFromAddress,
  escapeHtml,
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
      'store_address',
      'store_phone',
      'quote_destination_email',
      'order_notification_emails',
      'order_auto_cancel_hours',
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const autoCancelHours = asInt(settings.order_auto_cancel_hours, 48)
    const adminBcc = parseEmailCsv(settings.order_notification_emails)
    const siteUrl = getSiteUrl()

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(order.customer_first_name)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Lamentamos comunicarte que <strong>tu pedido #${escapeHtml(order.order_number)}
        ha sido cancelado automáticamente</strong>. No hemos podido confirmar su
        disponibilidad en el plazo establecido (${autoCancelHours} horas).
      </p>

      <div style="background:#f0f7f0;border-left:3px solid #2a7d3a;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#1a4d1a;font-size:13px;line-height:1.7">
          <strong>La pre-autorización en tu tarjeta ha sido liberada.</strong><br/>
          No se ha cargado ningún importe (${formatPriceCents(order.total_cents)}).
          La liberación puede tardar <strong>1-3 días laborables</strong> en reflejarse en
          tu cuenta según tu banco.
        </p>
      </div>

      <p style="margin:0 0 16px 0;color:#555;font-size:14px">
        Sentimos mucho las molestias. Si quieres intentarlo de nuevo o consultar
        disponibilidad de productos, estamos a tu disposición.
      </p>

      <p style="margin:0;color:#555;font-size:14px">
        Gracias por tu paciencia.
      </p>
    `

    const html = renderEmail({
      title: 'Tu pedido ha sido cancelado automáticamente',
      preheader: `Pedido #${order.order_number} cancelado · sin cargo · pre-autorización liberada.`,
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
      bcc: adminBcc.length > 0 ? adminBcc : undefined,
      subject: `Tu pedido #${order.order_number} ha sido cancelado automáticamente`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(
      `[${ts()}] ✓ auto-cancelled · order=${order.order_number} · bcc=${adminBcc.length} · resend=${email_id}`,
    )
    return jsonOk({ email_id, admin_bcc_count: adminBcc.length })
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-auto-cancelled:`, String(err))
    return jsonError(String(err))
  }
})
