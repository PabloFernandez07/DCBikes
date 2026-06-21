// supabase/functions/send-return-refunded-customer/index.ts
//
// Email al cliente cuando el reembolso de su devolución se ha COMPLETADO.
// La invoca admin-return-mark-received tras ejecutar el reembolso Redsys OK.
// Confirma el importe reembolsado a la tarjeta (1-3 días laborables) y, si se
// emitió, referencia la factura rectificativa (abono) asociada a la devolución.

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
  credit_invoice_id: string | null
}

interface OrderRow {
  order_number: string
  customer_first_name: string
}

interface CreditInvoiceRow {
  invoice_number: string
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-return-refunded-customer: x-internal-secret inválido o ausente`)
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
      .select('id, return_number, order_id, customer_email, refund_total_cents, credit_invoice_id')
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

    // Factura rectificativa (abono), si existe — referencia informativa.
    let creditInvoice: CreditInvoiceRow | null = null
    if (ret.credit_invoice_id) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('id', ret.credit_invoice_id)
        .maybeSingle<CreditInvoiceRow>()
      creditInvoice = inv ?? null
    }

    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    const firstName = order?.customer_first_name ?? ''
    const orderNumber = order?.order_number ?? ''

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola <strong>${escapeHtml(firstName)}</strong>,</p>

      <p style="margin:0 0 16px 0">
        Hemos completado el <strong style="color:#2a7d3a">reembolso de tu devolución
        ${escapeHtml(ret.return_number)}</strong>${
          orderNumber ? ` del pedido #${escapeHtml(orderNumber)}` : ''
        }.
      </p>

      <div style="background:#f0f7f0;border-left:3px solid #2a7d3a;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#1a4d1a;font-size:13px;line-height:1.7">
          Hemos reembolsado <strong>${formatPriceCents(ret.refund_total_cents)}</strong>
          a la tarjeta con la que realizaste el pedido. La operación puede tardar
          <strong>1-3 días laborables</strong> en reflejarse en tu cuenta según tu banco.
        </p>
      </div>

      ${
        creditInvoice
          ? `<div style="background:#f8f5ff;border-left:3px solid #C4A2CF;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
              <p style="margin:0;color:#4a3a52;font-size:13px;line-height:1.7">
                Hemos emitido la <strong>factura rectificativa
                ${escapeHtml(creditInvoice.invoice_number)}</strong> correspondiente a este
                reembolso. La tienes disponible en tu área de pedidos.
              </p>
            </div>`
          : ''
      }

      <p style="margin:0;color:#555;font-size:14px">
        Gracias por confiar en DC Bikes Cantabria. Si tienes cualquier duda${
          storeEmail ? `, escríbenos a <a href="mailto:${escapeHtml(storeEmail)}" style="color:#A788B5;text-decoration:none">${escapeHtml(storeEmail)}</a>` : ''
        }.
      </p>
    `

    const html = renderEmail({
      title: `Reembolso de ${ret.return_number} completado`,
      preheader: `Te hemos reembolsado ${formatPriceCents(ret.refund_total_cents)} de la devolución ${ret.return_number}.`,
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
      subject: `💸 Reembolso de tu devolución ${ret.return_number} completado`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(`[${ts()}] ✓ return-refunded-customer · return=${ret.return_number} · credit=${creditInvoice?.invoice_number ?? 'none'} · resend=${email_id}`)
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-return-refunded-customer:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
