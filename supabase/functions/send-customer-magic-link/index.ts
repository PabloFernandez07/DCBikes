// supabase/functions/send-customer-magic-link/index.ts
//
// Feature N — Envía el email con el magic link "Mis pedidos".
//
// Invocada internamente por customer-magic-link-request (que aplica el
// rate-limit y la decisión anti-enumeración). CORS abierto por simplicidad
// pero NO usar directamente desde frontend — siempre vía magic-link-request.

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
  maskEmail,
  sendViaResend,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

/** sha256(hex) — usado para validar token recibido contra customer_sessions.token_hash. */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // B-02: auth interna obligatoria. Sin header válido → 403, sin filtrar
  // detalle adicional al cliente.
  if (!verifyInternalSecret(req)) {
    console.warn(`[${ts()}] ✗ send-customer-magic-link: x-internal-secret inválido o ausente`)
    return jsonError('forbidden', 403, req)
  }

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      email?: string
      token?: string
    }
    const email = (body.email ?? '').toString().trim().toLowerCase()
    const token = (body.token ?? '').toString().trim()

    if (!email) return jsonError('email requerido', 400, req)
    if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
      return jsonError('token inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // B-04: el token debe existir en customer_sessions, no haber caducado y
    // pertenecer al email recibido (en minúsculas). Esto evita que un caller
    // legítimo con el secret reutilice esta función para enviar magic-links
    // arbitrarios o re-enviar tokens que el cliente ya revocó.
    const tokenHash = await sha256Hex(token)
    const { data: session, error: sessErr } = await supabase
      .from('customer_sessions')
      .select('id, email, expires_at')
      .eq('token_hash', tokenHash)
      .eq('email', email)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (sessErr) {
      console.error(`[${ts()}] ✗ customer_sessions lookup error:`, sessErr.message)
      return jsonError('session lookup failed', 500, req)
    }
    if (!session) {
      console.warn(`[${ts()}] ✗ token/email no encontrado o expirado · email=${maskEmail(email)}`)
      return jsonError('invalid or expired token', 400, req)
    }

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

    const magicUrl = `${siteUrl}/mis-pedidos/sesion?token=${encodeURIComponent(token)}`

    const bodyHtml = `
      <p style="margin:0 0 16px 0">Hola,</p>

      <p style="margin:0 0 16px 0">
        Hemos recibido una solicitud para acceder a tus pedidos en
        <strong>${escapeHtml(storeName)}</strong>. Pulsa el botón de abajo para
        ver tu listado durante las próximas 24 horas.
      </p>

      <p style="margin:0 0 16px 0">
        Si no has sido tú, simplemente ignora este email — el enlace caducará
        solo y nadie podrá acceder a tu información.
      </p>

      <div style="background:#fafafa;border:1px solid #eee;border-radius:6px;padding:14px 16px;margin:20px 0">
        <p style="margin:0;color:#666;font-size:13px;line-height:1.6">
          <strong style="color:#0F0F12">Por seguridad:</strong> el enlace es de un solo
          uso por sesión, válido durante 24 horas, y no contiene ningún dato sensible.
        </p>
      </div>
    `

    const html = renderEmail({
      title: 'Tu acceso a Mis pedidos',
      preheader: `Accede a tus pedidos en ${storeName} durante las próximas 24 horas.`,
      bodyHtml,
      ctaButton: { label: 'Ver mis pedidos', url: magicUrl },
      storeAddress,
      storePhone,
      storeEmail,
      footerLinks: [
        { label: 'Política de privacidad', url: `${siteUrl}/privacidad` },
        { label: 'Cookies', url: `${siteUrl}/cookies` },
      ],
    })

    const email_id = await sendViaResend({
      from: buildFromAddress(),
      to: [email],
      subject: `Tu acceso a mis pedidos en ${storeName}`,
      html,
      reply_to: storeEmail || undefined,
    })

    console.log(
      `[${ts()}] ✓ magic-link email · to=${maskEmail(email)} · resend=${email_id}`,
    )
    return jsonOk({ email_id }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ send-customer-magic-link:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
