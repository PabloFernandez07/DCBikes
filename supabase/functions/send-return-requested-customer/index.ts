// supabase/functions/send-return-requested-customer/index.ts
//
// Email al cliente cuando registra una solicitud de devolución (RMA).
// Confirma la recepción de la solicitud y lista los productos que devuelve.
// Aún no hay decisión: solo acuse de recibo ("te avisaremos cuando la revisemos").

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
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

interface ReturnRow {
  id: string
  return_number: string
  order_id: string
  customer_email: string
  refund_total_cents: number
}

interface ReturnItemRow {
  product_name: string
  product_size_label: string | null
  quantity: number
  line_refund_cents: number
}

interface OrderRow {
  order_number: string
  customer_first_name: string
}

/** Tabla HTML inline con las líneas devueltas (producto · talla · cant. · importe). */
function renderReturnItems(items: ReturnItemRow[]): string {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;vertical-align:top">
          ${escapeHtml(it.product_name)}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555;text-align:center;white-space:nowrap">
          ${it.product_size_label ? escapeHtml(it.product_size_label) : '—'}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555;text-align:center;white-space:nowrap">
          ${escapeHtml(String(it.quantity))}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;font-weight:600;white-space:nowrap">
          ${escapeHtml(formatPriceCents(it.line_refund_cents))}
        </td>
      </tr>`,
    )
    .join('')

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 16px 0">
      <thead>
        <tr>
          <th align="left" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Producto</th>
          <th align="center" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Talla</th>
          <th align="center" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Cant.</th>
          <th align="right" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Importe</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-return-requested-customer: x-internal-secret inválido o ausente`)
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
      .select('id, return_number, order_id, customer_email, refund_total_cents')
      .eq('id', return_id)
      .single<ReturnRow>()

    if (rErr || !ret) return jsonError('return not found', 404, req)

    const [{ data: items }, { data: order }, settings] = await Promise.all([
      supabase
        .from('order_return_items')
        .select('product_name, product_size_label, quantity, line_refund_cents')
        .eq('return_id', ret.id),
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
    const returnItems = (items ?? []) as ReturnItemRow[]

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(firstName)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Hemos recibido tu <strong>solicitud de devolución ${escapeHtml(ret.return_number)}</strong>${
          orderNumber ? ` del pedido #${escapeHtml(orderNumber)}` : ''
        }.
      </p>

      <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F0F12">Productos a devolver</h3>
      ${renderReturnItems(returnItems)}

      <div style="background:#f8f5ff;border-left:3px solid #C4A2CF;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#4a3a52;font-size:13px;line-height:1.7">
          Importe estimado del reembolso:
          <strong>${formatPriceCents(ret.refund_total_cents)}</strong>.
          El importe final se confirmará al revisar y recibir los productos.
        </p>
      </div>

      <p style="margin:0 0 16px 0;color:#555;font-size:14px">
        Nuestro equipo revisará tu solicitud y
        <strong>te avisaremos por email en cuanto la revisemos</strong> con los
        siguientes pasos para enviarnos los productos.
      </p>

      <p style="margin:0;color:#555;font-size:14px">
        Si necesitas ayuda, no dudes en escribirnos${
          storeEmail ? ` a <a href="mailto:${escapeHtml(storeEmail)}" style="color:#A788B5;text-decoration:none">${escapeHtml(storeEmail)}</a>` : ''
        }.
      </p>
    `

    const html = renderEmail({
      title: 'Hemos recibido tu solicitud de devolución',
      preheader: `Solicitud de devolución ${ret.return_number} recibida · te avisaremos cuando la revisemos.`,
      bodyHtml,
      ctaButton: { label: 'Ver mis pedidos', url: `${siteUrl}/mis-pedidos` },
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
      subject: `Hemos recibido tu solicitud de devolución ${ret.return_number}`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(`[${ts()}] ✓ return-requested-customer · return=${ret.return_number} · resend=${email_id}`)
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-return-requested-customer:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
