// supabase/functions/send-return-rejected-customer/index.ts
//
// Email al cliente cuando el admin NO acepta su devolución. Comunica el motivo
// (admin_decision_note) de forma clara y deja vía de contacto abierta.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  buildCorsHeaders,
  asString,
  buildFromAddress,
  escapeHtml,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  sendViaResend,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

interface ReturnRow {
  id: string
  return_number: string
  order_id: string
  customer_email: string
  admin_decision_note: string | null
}

interface OrderRow {
  order_number: string
  customer_first_name: string
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-return-rejected-customer: x-internal-secret inválido o ausente`)
    return jsonError('forbidden', 403, req)
  }

  try {
    const { return_id } = await req.json().catch(() => ({}))
    if (!return_id) return jsonError('return_id required', 400, req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: ret, error: rErr } = await supabase
      .from('order_returns')
      .select('id, return_number, order_id, customer_email, admin_decision_note')
      .eq('id', return_id)
      .single<ReturnRow>()

    if (rErr || !ret) return jsonError('return not found', 404, req)

    const [{ data: order }, settings] = await Promise.all([
      supabase
        .from('orders')
        .select('order_number, customer_first_name')
        .eq('id', ret.order_id)
        .single<OrderRow>(),
      getSettings(supabase, [
        'store_address',
        'store_phone',
        'quote_destination_email',
      ]),
    ])

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    const firstName = order?.customer_first_name ?? ''
    const orderNumber = order?.order_number ?? ''
    const note =
      ret.admin_decision_note && ret.admin_decision_note.trim().length > 0
        ? ret.admin_decision_note.trim()
        : 'la devolución no cumple las condiciones de nuestra política de devoluciones'

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(firstName)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Hemos revisado tu <strong>devolución ${escapeHtml(ret.return_number)}</strong>${
          orderNumber ? ` del pedido #${escapeHtml(orderNumber)}` : ''
        } y, lamentablemente, <strong>no podemos aceptarla</strong>.
      </p>

      <div style="background:#fafafa;border-left:3px solid #999;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0 0 4px 0;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600">
          Motivo
        </p>
        <p style="margin:0;color:#333;font-size:14px;line-height:1.6">
          ${escapeHtml(note)}
        </p>
      </div>

      <p style="margin:0 0 16px 0;color:#555;font-size:14px">
        Sentimos las molestias. Si crees que se trata de un error o necesitas
        más información, no dudes en escribirnos${
          storeEmail ? ` a <a href="mailto:${escapeHtml(storeEmail)}" style="color:#A788B5;text-decoration:none">${escapeHtml(storeEmail)}</a>` : ''
        } y lo revisaremos contigo.
      </p>

      <p style="margin:0;color:#555;font-size:14px">
        Quedamos a tu disposición.
      </p>
    `

    const html = renderEmail({
      title: `Devolución ${ret.return_number} no aceptada`,
      preheader: `No hemos podido aceptar tu devolución ${ret.return_number}.`,
      bodyHtml,
      ctaButton: { label: 'Ver mis pedidos', url: `${siteUrl}/mis-pedidos` },
      secondaryLinks: storeEmail
        ? [{ label: 'Contactar con la tienda', url: `mailto:${storeEmail}` }]
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
      to: [ret.customer_email],
      subject: `Tu devolución ${ret.return_number} no ha sido aceptada`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(`[${ts()}] ✓ return-rejected-customer · return=${ret.return_number} · resend=${email_id}`)
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-return-rejected-customer:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
