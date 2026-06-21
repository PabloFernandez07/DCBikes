// supabase/functions/send-return-requested-admin/index.ts
//
// Email al admin (interno) cuando un cliente registra una solicitud de
// devolución (RMA). Destinatarios: settings.order_notification_emails (CSV),
// con fallback a quote_destination_email — mismo patrón que send-order-new-admin
// y alertAdminCancelKo. Incluye pedido, motivo traducido y link al panel.

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
  parseEmailCsv,
  sendViaResend,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

interface ReturnRow {
  id: string
  return_number: string
  order_id: string
  reason_code: string
  reason_text: string | null
  store_pays_return: boolean
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
  customer_last_name: string
  customer_email: string
}

/** Traduce el reason_code de la devolución a texto español para el admin. */
const REASON_LABELS: Record<string, string> = {
  wrong_size: 'Talla incorrecta',
  not_liked: 'No me convence',
  defective: 'Producto defectuoso',
  damaged: 'Llegó dañado',
  wrong_item: 'Producto equivocado',
  other: 'Otro',
}

function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code
}

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
    console.warn(`[${ts()}] ✗ send-return-requested-admin: x-internal-secret inválido o ausente`)
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
      .select('id, return_number, order_id, reason_code, reason_text, store_pays_return, refund_total_cents')
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
        .select('order_number, customer_first_name, customer_last_name, customer_email')
        .eq('id', ret.order_id)
        .single<OrderRow>(),
      getSettings(supabase, [
        'order_notification_emails',
        'quote_destination_email',
      ]),
    ])

    let recipients = parseEmailCsv(settings.order_notification_emails)
    if (recipients.length === 0) {
      const fallback = asString(settings.quote_destination_email)
      if (fallback) recipients = [fallback]
    }
    if (recipients.length === 0) {
      console.warn('[send-return-requested-admin] sin destinatarios admin (settings.order_notification_emails)')
      return jsonError('no admin recipients configured', 422, req)
    }

    const siteUrl = getSiteUrl()
    const orderNumber = order?.order_number ?? ''
    const customerName = order
      ? `${order.customer_first_name} ${order.customer_last_name}`.trim()
      : ''
    const customerEmail = order?.customer_email ?? ''
    const returnItems = (items ?? []) as ReturnItemRow[]

    const bodyHtml = `
      <p style="margin:0 0 16px 0;font-size:15px">
        Nueva <strong>solicitud de devolución ${escapeHtml(ret.return_number)}</strong>.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#666;width:180px">Pedido</td><td style="padding:6px 0;color:#222;font-weight:600">${escapeHtml(orderNumber || '(desconocido)')}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Cliente</td><td style="padding:6px 0;color:#222">${escapeHtml(customerName || '(desconocido)')}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Email</td><td style="padding:6px 0;color:#222">${escapeHtml(customerEmail)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Motivo</td><td style="padding:6px 0;color:#222;font-weight:600">${escapeHtml(reasonLabel(ret.reason_code))}</td></tr>
        ${
          ret.reason_text && ret.reason_text.trim().length > 0
            ? `<tr><td style="padding:6px 0;color:#666;vertical-align:top">Comentario</td><td style="padding:6px 0;color:#222">${escapeHtml(ret.reason_text.trim())}</td></tr>`
            : ''
        }
        <tr><td style="padding:6px 0;color:#666">Coste devolución</td><td style="padding:6px 0;color:#222">${
          ret.store_pays_return ? 'Lo asume la tienda' : 'Lo asume el cliente'
        }</td></tr>
        <tr><td style="padding:6px 0;color:#666">Reembolso solicitado</td><td style="padding:6px 0;color:#222;font-weight:600">${formatPriceCents(ret.refund_total_cents)}</td></tr>
      </table>

      <h3 style="margin:24px 0 8px 0;font-size:16px;color:#0F0F12">Productos a devolver</h3>
      ${renderReturnItems(returnItems)}

      <p style="margin:20px 0 0 0;color:#555;font-size:14px">
        Revisa la solicitud y aprueba o rechaza la devolución desde el panel.
      </p>
    `

    const html = renderEmail({
      title: `Nueva solicitud de devolución ${ret.return_number}`,
      preheader: `Devolución ${ret.return_number}${orderNumber ? ` · pedido ${orderNumber}` : ''} · ${reasonLabel(ret.reason_code)}.`,
      bodyHtml,
      ctaButton: { label: 'Gestionar devoluciones', url: `${siteUrl}/admin/devoluciones` },
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: recipients,
      subject: `🔁 Nueva solicitud de devolución ${ret.return_number}${orderNumber ? ` — pedido ${orderNumber}` : ''}`,
      html,
    })

    console.log(`[${ts()}] ✓ return-requested-admin · return=${ret.return_number} · recipients=${recipients.length} · resend=${email_id}`)
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-return-requested-admin:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
