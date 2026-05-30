// supabase/functions/send-stock-alert/index.ts
//
// Función INTERNA: consulta `stock_alerts` con alertas pendientes,
// sella `notified_at` ANTES de enviar (anti-reenvío/carrera), y envía
// el email al suscriptor via Resend con enlace de baja.
//
// Seguridad: verifyInternalSecret (primera comprobación, fail-closed).
// Invocada por: stock-alert-cron (todas las alertas) y admin-notify-stock
// (filtrado por product_id).
//
// Variables de entorno necesarias:
//   - INTERNAL_INVOKE_SECRET
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   - RESEND_API_KEY
//   - RESEND_FROM_EMAIL
//   - SITE_URL

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { verifyInternalSecret } from '../_shared/security.ts'
import {
  corsPreflightResponse,
  buildCorsHeaders,
  sendViaResend,
  buildFromAddress,
  getSiteUrl,
  escapeHtml,
} from '../_shared/email-utils.ts'
import { renderEmail } from '../_shared/email-template.ts'

interface StockAlertRow {
  id: string
  email: string
  unsubscribe_token: string
  products: {
    name: string
    slug: string
    size_label: string | null
  } | null
}

// Helper interno para respuestas JSON con CORS dinámico
function jsonRes(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)

  const ts = () => new Date().toISOString()

  // Primera línea de defensa: secret interno (fail-closed)
  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] send-stock-alert: x-internal-secret inválido o ausente`)
    return jsonRes({ ok: false, error: 'forbidden' }, 403, req)
  }

  if (req.method !== 'POST') {
    return jsonRes({ ok: false, error: 'method not allowed' }, 405, req)
  }

  // Parseo del body — product_id es opcional (si viene, filtra por producto)
  let productIdFilter: string | null = null
  try {
    const body = (await req.json().catch(() => ({}))) as { product_id?: string }
    productIdFilter = body.product_id ?? null
  } catch {
    // Sin body → procesar todas las alertas pendientes
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Recupera alertas pendientes (notified_at IS NULL, revoked_at IS NULL).
  // Usamos !inner para que PostgREST excluya alertas cuyo producto fue eliminado.
  // El filtro stock > 0 se aplica en JS tras el fetch para evitar dependencia
  // del comportamiento de filtros sobre relaciones en PostgREST (que varía según
  // versión y puede requerir sintaxis .filter('products.stock', 'gt', 0)).
  // Si product_id viene informado, filtra solo ese producto.
  let query = supabase
    .from('stock_alerts')
    .select(`
      id,
      email,
      unsubscribe_token,
      products!inner (
        name,
        slug,
        size_label,
        stock
      )
    `)
    .is('notified_at', null)
    .is('revoked_at', null)

  if (productIdFilter) {
    query = query.eq('product_id', productIdFilter)
  }

  const { data: alerts, error: fetchErr } = await query

  if (fetchErr) {
    console.error(`[${ts()}] send-stock-alert fetch error:`, fetchErr.message)
    return jsonRes({ ok: false, error: 'database error' }, 500, req)
  }

  // Filtrar en JS: solo alertas cuyo producto tiene stock > 0.
  // El campo `stock` viene del JOIN con !inner — si es null o <= 0, omitimos.
  const allRows = (alerts ?? []) as unknown as (StockAlertRow & { products: (StockAlertRow['products'] & { stock: number }) | null })[]
  const rows: StockAlertRow[] = allRows.filter(
    (r) => r.products !== null && (r.products as unknown as { stock: number }).stock > 0,
  )
  console.log(`[${ts()}] send-stock-alert: ${rows.length} alertas con stock disponible (de ${allRows.length} pendientes)${productIdFilter ? ` (product=${productIdFilter})` : ''}`)

  let sent = 0
  let siteUrl = ''
  try {
    siteUrl = getSiteUrl()
  } catch (err) {
    console.error(`[${ts()}] send-stock-alert: SITE_URL no configurada:`, String(err))
    return jsonRes({ ok: false, error: 'SITE_URL missing' }, 500, req)
  }

  for (const alert of rows) {
    const product = alert.products
    if (!product) {
      console.warn(`[${ts()}] send-stock-alert: alerta ${alert.id} sin producto — omitiendo`)
      continue
    }

    // SELLAR notified_at ANTES de enviar para evitar reenvíos en caso de
    // ejecuciones concurrentes del cron. Si el envío falla después, la alerta
    // queda sellada igualmente (loguamos el fallo pero no reabrimos).
    const { error: sealErr } = await supabase
      .from('stock_alerts')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', alert.id)
      .is('notified_at', null) // Doble comprobación anti-carrera

    if (sealErr) {
      console.error(`[${ts()}] send-stock-alert: error sellando notified_at para ${alert.id}:`, sealErr.message)
      // No enviamos si no podemos sellar (evitamos duplicados)
      continue
    }

    // Construir URLs del email
    const productUrl = `${siteUrl}/producto/${escapeHtml(product.slug)}`
    const unsubscribeUrl = `${siteUrl}/avisos/baja?token=${encodeURIComponent(alert.unsubscribe_token)}`
    const productNameRaw = product.name
    const sizeLabelRaw = product.size_label ?? null
    const safeProductName = escapeHtml(productNameRaw)
    const safeSizeLabel = sizeLabelRaw ? escapeHtml(sizeLabelRaw) : null

    // Asunto: "Ya disponible: {producto} (talla {size_label})"
    const subject = sizeLabelRaw
      ? `Ya disponible: ${productNameRaw} (talla ${sizeLabelRaw})`
      : `Ya disponible: ${productNameRaw}`

    // Cuerpo del email usando renderEmail (plantilla compartida de DC Bikes)
    const bodyHtml = `
      <p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#222;line-height:1.6">
        Buenas noticias. El producto que tenías en tu lista de deseos ya está disponible de nuevo.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 24px 0;background:#f8f5ff;border-radius:6px;border:1px solid #e0d6f0">
        <tr>
          <td style="padding:20px 24px">
            <p style="margin:0 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#999">Producto</p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#1A1620">${safeProductName}</p>
            ${safeSizeLabel
              ? `<p style="margin:6px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666">Talla: <strong style="color:#1A1620">${safeSizeLabel}</strong></p>`
              : ''}
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#999;text-align:center">
        ¿Ya no necesitas este aviso?
        <a href="${unsubscribeUrl}" style="color:#C4A2CF;text-decoration:underline">Darse de baja</a>
      </p>`

    const html = renderEmail({
      title: '¡Ya está disponible!',
      preheader: `${productNameRaw}${sizeLabelRaw ? ` (talla ${sizeLabelRaw})` : ''} vuelve a estar en stock`,
      bodyHtml,
      ctaButton: {
        label: 'Ver producto',
        url: productUrl,
      },
      footerLinks: [
        { label: 'Darse de baja de avisos', url: unsubscribeUrl },
      ],
    })

    // Envío vía Resend (loguamos el fallo pero no reabrimos notified_at)
    try {
      const emailId = await sendViaResend({
        from: buildFromAddress(),
        to: [alert.email],
        subject,
        html,
      })
      console.log(`[${ts()}] send-stock-alert: email enviado — alert=${alert.id} resend_id=${emailId}`)
      sent++
    } catch (sendErr) {
      // La alerta quedó sellada; el fallo de envío se registra en log pero no
      // se revierte notified_at (evita bucle de reenvíos).
      console.error(`[${ts()}] send-stock-alert: FALLO al enviar email para alert=${alert.id}:`, String(sendErr))
    }
  }

  console.log(`[${ts()}] send-stock-alert: completado — enviados=${sent} de ${rows.length}`)
  return jsonRes({ ok: true, sent }, 200, req)
})
