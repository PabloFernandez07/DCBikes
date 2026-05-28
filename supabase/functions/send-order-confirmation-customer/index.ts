// supabase/functions/send-order-confirmation-customer/index.ts
//
// Email al cliente cuando entra un pedido (status=authorized).
// Mensaje: "Hemos recibido tu pedido. Estamos verificando disponibilidad."

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
  formatTotalsBlock,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  renderShippingBlock,
  sendViaResend,
  type OrderRow,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-order-confirmation-customer: x-internal-secret inválido o ausente`)
    return jsonError('forbidden', 403, req)
  }

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

    if (oErr || !order) {
      console.error(`[${ts()}] order not found:`, oErr?.message)
      return jsonError('order not found', 404, req)
    }

    const settings = await getSettings(supabase, [
      'store_address',
      'store_phone',
      'quote_destination_email',
      'store_contact_email',
      'order_auto_cancel_hours',
      'legal_company_name',
      'legal_company_cif',
      'legal_company_address',
    ])

    const autoCancelHours = asInt(settings.order_auto_cancel_hours, 48)
    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const supportEmail = (settings.store_contact_email as string | undefined) ?? 'info@dcbikescantabria.es'
    const legalCompanyName = asString(settings.legal_company_name, 'DC Bikes Cantabria')
    const legalCompanyCif = asString(settings.legal_company_cif)
    const legalCompanyAddress = asString(settings.legal_company_address) || storeAddress
    const siteUrl = getSiteUrl()

    // Placeholders user-friendly cuando los settings legales aún no están
    // configurados, para que el email siga cumpliendo art. 98 RDL 1/2007
    // de forma legible aunque la BD esté sin rellenar.
    const cifDisplay = legalCompanyCif || '[pendiente de configuración]'
    const addrDisplay = legalCompanyAddress || '[pendiente de configuración]'

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

      <!-- Bloque legal art. 98 RDL 1/2007 (Texto Refundido LGDCU).
           Confirmación duradera del contrato a distancia: identificación del
           vendedor, desistimiento, garantía legal, ODR y protección de datos. -->
      <hr style="border:0;border-top:1px solid #e8e8e8;margin:28px 0 20px 0"/>

      <h3 style="margin:0 0 12px 0;font-size:16px;color:#0F0F12">Información legal del contrato</h3>

      <p style="margin:0 0 6px 0;color:#444;font-size:14px"><strong>Vendedor</strong></p>
      <ul style="margin:0 0 16px 18px;padding:0;color:#555;font-size:13px;line-height:1.6">
        <li>${escapeHtml(legalCompanyName)} (DC Bikes Cantabria)</li>
        <li>NIF: ${escapeHtml(cifDisplay)}</li>
        <li>${escapeHtml(addrDisplay)}</li>
        <li>Email: ${escapeHtml(supportEmail)} · Tel: +34 942 054 501</li>
      </ul>

      <p style="margin:0 0 6px 0;color:#444;font-size:14px"><strong>Derecho de desistimiento</strong></p>
      <p style="margin:0 0 8px 0;color:#555;font-size:13px;line-height:1.6">
        Como consumidor, tienes derecho a desistir del contrato sin justificación
        en un plazo de <strong>catorce (14) días naturales</strong> desde la recepción
        del producto (art. 102 del Real Decreto Legislativo 1/2007).
      </p>
      <p style="margin:0 0 6px 0;color:#555;font-size:13px">Puedes ejercer este derecho:</p>
      <ul style="margin:0 0 16px 18px;padding:0;color:#555;font-size:13px;line-height:1.6">
        <li>Descargando el <a href="${siteUrl}/devoluciones-formulario.pdf" style="color:#A788B5;text-decoration:underline">formulario oficial UE</a> y enviándonoslo cumplimentado.</li>
        <li>O comunicándolo por email a ${escapeHtml(supportEmail)} indicando tu número de pedido.</li>
        <li>Consulta la <a href="${siteUrl}/devoluciones" style="color:#A788B5;text-decoration:underline">política de devoluciones completa</a>.</li>
      </ul>

      <p style="margin:0 0 6px 0;color:#444;font-size:14px"><strong>Garantía legal</strong></p>
      <p style="margin:0 0 16px 0;color:#555;font-size:13px;line-height:1.6">
        Todos los productos cuentan con la garantía legal de <strong>tres (3) años por
        falta de conformidad</strong> establecida en el art. 120 del RDL 1/2007 (redacción
        del Real Decreto-ley 7/2021).
      </p>

      <p style="margin:0 0 6px 0;color:#444;font-size:14px"><strong>Resolución de conflictos</strong></p>
      <p style="margin:0 0 6px 0;color:#555;font-size:13px;line-height:1.6">
        Si tienes una reclamación, puedes contactarnos en ${escapeHtml(supportEmail)} o:
      </p>
      <ul style="margin:0 0 16px 18px;padding:0;color:#555;font-size:13px;line-height:1.6">
        <li>Usar la <a href="https://ec.europa.eu/consumers/odr/" style="color:#A788B5;text-decoration:underline">plataforma europea de resolución de litigios en línea (ODR)</a>.</li>
        <li>Acudir a la Dirección General de Consumo del Gobierno de Cantabria.</li>
      </ul>

      <p style="margin:0 0 6px 0;color:#444;font-size:14px"><strong>Protección de datos</strong></p>
      <p style="margin:0 0 0 0;color:#555;font-size:13px;line-height:1.6">
        Tratamos tus datos para ejecutar este contrato (art. 6.1.b RGPD) y para
        cumplir nuestras obligaciones fiscales y contables (art. 6.1.c RGPD,
        art. 30 Código de Comercio, art. 66 LGT). Plazo de conservación: 6 años desde
        la última operación. Más información en nuestra
        <a href="${siteUrl}/privacidad" style="color:#A788B5;text-decoration:underline">Política de Privacidad</a>.
      </p>

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
      legalCompanyName,
      legalCompanyCif,
      legalCompanyAddress,
      showOdrBlock: true,
      footerLinks: [
        { label: 'Aviso Legal', url: `${siteUrl}/aviso-legal` },
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Cookies', url: `${siteUrl}/cookies` },
        { label: 'Términos de venta', url: `${siteUrl}/terminos-venta` },
        { label: 'Devoluciones', url: `${siteUrl}/devoluciones` },
      ],
    })

    /* ─── Adjuntos L-05 / C-07 / C-08 (best-effort; no bloquean el envío) ─── */

    // Helper: descarga un PDF de un bucket y lo codifica en base64.
    // Devuelve null si el archivo no existe o si falla la descarga.
    const downloadPdf = async (bucket: string, path: string): Promise<string | null> => {
      try {
        const { data, error } = await supabase.storage.from(bucket).download(path)
        if (error || !data) {
          console.warn(`[${ts()}] [confirmation-customer] storage download failed bucket=${bucket} path=${path}:`, error?.message)
          return null
        }
        const buf = new Uint8Array(await data.arrayBuffer())
        // btoa + chunking (safe para bytes > 0x7F en Deno)
        let binary = ''
        const chunk = 0x8000
        for (let i = 0; i < buf.length; i += chunk) {
          binary += String.fromCharCode(...buf.subarray(i, i + chunk))
        }
        return btoa(binary)
      } catch (err) {
        console.warn(`[${ts()}] [confirmation-customer] downloadPdf exception bucket=${bucket} path=${path}:`, String(err))
        return null
      }
    }

    // a) Contrato del pedido (soporte duradero art. 98 RDL 1/2007 — hallazgo L-05)
    //    Los contratos se versionan ({order_number}-v{n}.pdf, B-26): localizamos
    //    el de versión más alta dentro de la carpeta del pedido.
    const resolveLatestContractPath = async (): Promise<string | null> => {
      const { data: files, error } = await supabase.storage
        .from('order-contracts')
        .list(order.id, { limit: 1000 })
      if (error || !files || files.length === 0) {
        if (error) console.warn(`[${ts()}] [confirmation-customer] contract list failed:`, error.message)
        return null
      }
      const re = /-v(\d+)\.pdf$/
      let best: { name: string; n: number } | null = null
      for (const f of files) {
        const m = re.exec(f.name)
        if (!m) continue
        const n = parseInt(m[1], 10)
        if (Number.isFinite(n) && (!best || n > best.n)) best = { name: f.name, n }
      }
      return best ? `${order.id}/${best.name}` : null
    }
    const contractPath = await resolveLatestContractPath()
    const contractBase64 = contractPath ? await downloadPdf('order-contracts', contractPath) : null

    // b) Formulario oficial de desistimiento (C-07 / C-08)
    const withdrawalBase64 = await downloadPdf('legal-templates', 'devoluciones-formulario.pdf')

    const attachments = [
      ...(contractBase64
        ? [{ filename: `contrato-pedido-${order.order_number}.pdf`, content: contractBase64 }]
        : []),
      ...(withdrawalBase64
        ? [{ filename: 'formulario-desistimiento.pdf', content: withdrawalBase64 }]
        : []),
    ]

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: [order.customer_email],
      subject: `Hemos recibido tu pedido #${order.order_number} en DC Bikes`,
      html,
      reply_to: storeEmail || undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    console.log(
      `[${ts()}] ✓ confirmation-customer enviado · order=${order.order_number}` +
      ` · contract=${!!contractBase64} · withdrawal=${!!withdrawalBase64}` +
      ` · resend=${email_id}`,
    )
    return jsonOk({ email_id, contract_attached: !!contractBase64, withdrawal_attached: !!withdrawalBase64 }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-order-confirmation-customer:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
