// supabase/functions/send-payment-otp/index.ts
//
// Auditoría legal V5 · Sprint 2 · X-17
//
// Genera un OTP de 6 dígitos, lo persiste como SHA-256 hex en
// orders.payment_otp_hash y envía el código en claro al customer_email
// del pedido. Caducidad fija de 5 minutos. Resetea payment_otp_attempts
// a 0 (cada emisión es un "borrón y cuenta nueva" frente al bloqueo
// por 5 intentos).
//
// Endpoint INTERNO: requiere header `x-internal-secret` válido. Sólo lo
// llaman:
//   • order-place (cuando require_payment_otp=true y el pedido se crea)
//   • request-payment-otp (reenvíos públicos rate-limited)
//
// Nunca expuesto directamente al frontend para evitar enumeración.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderEmail } from '../_shared/email-template.ts'
import {
  asString,
  buildFromAddress,
  corsPreflightResponse,
  escapeHtml,
  getSettings,
  getSiteUrl,
  jsonError,
  jsonOk,
  maskEmail,
  sendViaResend,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

/** Duración de validez del OTP: 5 minutos. */
const OTP_TTL_MS = 5 * 60 * 1000

/** sha256(hex) — hash determinista del OTP en claro. */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Genera un OTP numérico de 6 dígitos usando crypto.getRandomValues
 * (no Math.random — es PRNG no-criptográfico). Rango uniforme
 * [100000, 999999] mediante módulo de un entero de 32 bits sin signo;
 * el sesgo es despreciable (2^32 % 900000 ≈ 0,02%) para la finalidad
 * de un OTP de 5 min de vida con bloqueo a 5 intentos.
 */
function generateOtp(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  const code = 100000 + (arr[0] % 900000)
  return String(code)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // Endpoint interno — sin header válido, 403 sin filtrar detalle.
  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-payment-otp: x-internal-secret inválido o ausente`)
    return jsonError('forbidden', 403, req)
  }

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as { order_id?: string }
    const orderId = (body.order_id ?? '').toString().trim()
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Cargar pedido. Sólo se emite OTP para pedidos en pending y no borrados.
    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .select('id, order_number, status, customer_email, deleted_at')
      .eq('id', orderId)
      .maybeSingle()

    if (ordErr) {
      console.error(`[${ts()}] ✗ orders lookup error:`, ordErr.message)
      return jsonError('order lookup failed', 500, req)
    }
    if (!order || order.deleted_at) {
      return jsonError('order not found', 404, req)
    }
    if (order.status !== 'pending') {
      return jsonError('invalid order status for OTP', 409, req)
    }
    if (!order.customer_email) {
      return jsonError('order missing customer_email', 422, req)
    }

    // Generar OTP, hash y caducidad.
    const otp = generateOtp()
    const otpHash = await sha256Hex(otp)
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

    const { error: updErr } = await supabase
      .from('orders')
      .update({
        payment_otp_hash: otpHash,
        payment_otp_expires_at: expiresAt,
        payment_otp_attempts: 0,
        // Si hubiese un verified_at previo (caso imposible salvo bug),
        // lo limpiamos para no abrir un re-uso.
        payment_otp_verified_at: null,
      })
      .eq('id', orderId)

    if (updErr) {
      console.error(`[${ts()}] ✗ orders update error:`, updErr.message)
      return jsonError('persist failed', 500, req)
    }

    // Construir email.
    const settings = await getSettings(supabase, [
      'store_name',
      'store_address',
      'store_phone',
      'quote_destination_email',
    ])
    const storeName = asString(settings.store_name) || 'DC Bikes Cantabria'
    const storeAddress = asString(settings.store_address)
    const storePhone = asString(settings.store_phone)
    const storeEmail = asString(settings.quote_destination_email)
    const siteUrl = getSiteUrl()

    // OTP en cuerpo claro — bloque destacado. El email se queda en bandeja
    // del cliente; sin el OTP la verificación es imposible (hash one-way).
    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola,</p>

      <p style="margin:0 0 16px 0">
        Estás a punto de iniciar el pago del pedido
        <strong>#${escapeHtml(order.order_number)}</strong>. Para confirmar que
        eres tú quien está pagando, introduce el siguiente código en la página
        de verificación:
      </p>

      <div style="background:#f8f5ff;border:2px solid #C4A2CF;border-radius:8px;padding:24px 16px;margin:24px 0;text-align:center">
        <div style="font-family:'Courier New',monospace;font-size:34px;letter-spacing:10px;color:#0F0F12;font-weight:700">
          ${escapeHtml(otp)}
        </div>
        <p style="margin:10px 0 0 0;color:#666;font-size:12px;letter-spacing:1px;text-transform:uppercase">
          Código válido durante 5 minutos
        </p>
      </div>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:14px 16px;margin:20px 0">
        <p style="margin:0;color:#666;font-size:13px;line-height:1.6">
          <strong style="color:#0F0F12">Por seguridad:</strong> nadie de
          ${escapeHtml(storeName)} ni de tu banco te pedirá nunca este código
          por teléfono, email o redes. Si no has iniciado tú este pago, ignora
          este mensaje — el código caducará automáticamente y no podrá usarse.
        </p>
      </div>
    `

    const html = renderEmail({
      title: 'Código de verificación de pago',
      preheader: `Tu código de verificación para el pago del pedido #${order.order_number}`,
      bodyHtml,
      storeAddress,
      storePhone,
      storeEmail,
      footerLinks: [
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Términos de venta', url: `${siteUrl}/terminos-venta` },
      ],
    })

    let emailId = ''
    try {
      emailId = await sendViaResend({
        from: buildFromAddress(),
        to: [order.customer_email],
        subject: `Código de verificación de pago — ${storeName} #${order.order_number}`,
        html,
        reply_to: storeEmail || undefined,
      })
    } catch (err) {
      console.error(`[${ts()}] ✗ Resend send failed:`, String(err))
      return jsonError('email send failed', 502, req)
    }

    console.log(
      `[${ts()}] ✓ payment-otp email · order=${order.order_number} · to=${maskEmail(order.customer_email)} · resend=${emailId}`,
    )

    return jsonOk(
      {
        sent: true,
        masked_email: maskEmail(order.customer_email),
        expires_at: expiresAt,
      },
      req,
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ send-payment-otp:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
