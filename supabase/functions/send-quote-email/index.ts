import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { maskEmail,
  corsPreflightResponse,
  escapeHtml,
} from '../_shared/email-utils.ts'
import { verifyInternalSecret } from '../_shared/security.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
const FROM_NAME      = 'DC Bikes Cantabria'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)

  const ts = () => new Date().toISOString()

  if (!verifyInternalSecret(req)) {
    console.warn(`[${new Date().toISOString()}] ✗ send-quote-email: x-internal-secret inválido o ausente`)
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: CORS })
  }

  try {
    const body = await req.json()
    const { quote_id } = body
    console.log(`[${ts()}] [1/5] Recibido quote_id:`, quote_id)

    if (!quote_id) {
      console.error(`[${ts()}] ✗ quote_id vacío o ausente`)
      return new Response(JSON.stringify({ error: 'quote_id required' }), { status: 400, headers: CORS })
    }

    // Verificar que RESEND_API_KEY está configurada
    if (!RESEND_API_KEY) {
      console.error(`[${ts()}] ✗ RESEND_API_KEY no está configurada en los secrets de la función`)
      throw new Error('RESEND_API_KEY no configurada')
    }
    console.log(`[${ts()}] [1/5] RESEND_API_KEY presente: sí`)
    console.log(`[${ts()}] [1/5] FROM_EMAIL:`, FROM_EMAIL)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // PASO 2 — Leer la consulta
    console.log(`[${ts()}] [2/5] Buscando quote en BD...`)
    const { data: quote, error: qErr } = await supabase
      .from('quote_requests')
      .select('*, products(name, slug)')
      .eq('id', quote_id)
      .single()

    if (qErr || !quote) {
      console.error(`[${ts()}] ✗ Quote no encontrado:`, qErr?.message ?? 'no data')
      throw new Error('Quote not found: ' + (qErr?.message ?? 'no data'))
    }
    console.log(`[${ts()}] [2/5] Quote encontrado — email cliente:`, maskEmail(quote.email), '· producto:', (quote.products as { name: string } | null)?.name ?? 'ninguno')

    // PASO 3 — Leer email destino
    console.log(`[${ts()}] [3/5] Leyendo quote_destination_email de settings...`)
    const { data: setting, error: sErr } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'quote_destination_email')
      .single()

    if (sErr) {
      console.warn(`[${ts()}] ⚠ No se encontró quote_destination_email en settings:`, sErr.message, '— usando fallback')
    }

    const rawDestination = (setting?.value as string | null) ?? '"info@dcbikescantabria.com"'
    const destination    = rawDestination.replace(/^"|"$/g, '')
    console.log(`[${ts()}] [3/5] Email destino:`, maskEmail(destination))

    // PASO 4 — Construir y enviar email
    const productNameRaw = (quote.products as { name: string } | null)?.name ?? 'Consulta general (taller)'
    const productName = escapeHtml(productNameRaw)
    const receivedAt  = escapeHtml(new Date(quote.created_at).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }))

    // B-01: TODO valor controlado por usuario debe pasar por escapeHtml para
    // mitigar HTML injection y stored-XSS en clientes de correo que renderizan HTML.
    // Para teléfono: saneamos primero a [\d+\s\-()] y luego escapamos por defensa en
    // profundidad (mailto/tel sólo permiten el subset, pero protegemos por si cambia).
    const safeEmail = escapeHtml(String(quote.email ?? ''))
    const phoneSanitized = String(quote.phone ?? '').replace(/[^\d+\s\-()]/g, '')
    const safePhone = escapeHtml(phoneSanitized)
    const safeMessage = escapeHtml(quote.message ?? '—').replace(/\n/g, '<br>')

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f8f8">
        <div style="background:#1A1620;padding:28px 32px;text-align:center">
          <p style="color:#C4A2CF;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px">Nueva consulta de presupuesto</p>
          <h1 style="color:#EEF3F8;font-size:26px;margin:0;letter-spacing:1px">DC Bikes Cantabria</h1>
          <p style="color:#7E6E8A;font-size:12px;margin:6px 0 0">El Astillero · Cantabria</p>
        </div>
        <div style="padding:32px;background:#ffffff;border:1px solid #e8e8e8">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:12px 0;color:#999;width:130px;font-size:12px;text-transform:uppercase;letter-spacing:1px">Producto</td>
              <td style="padding:12px 0;font-weight:600;color:#1A1620">${productName}</td>
            </tr>
            <tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:12px 0;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px">Email</td>
              <td style="padding:12px 0"><a href="mailto:${safeEmail}" style="color:#C4A2CF;text-decoration:none">${safeEmail}</a></td>
            </tr>
            <tr style="border-bottom:1px solid #f0f0f0">
              <td style="padding:12px 0;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px">Teléfono</td>
              <td style="padding:12px 0;color:#333">${safePhone ? `<a href="tel:${safePhone}" style="color:#C4A2CF;text-decoration:none">${safePhone}</a>` : '—'}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;color:#999;font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:top">Mensaje</td>
              <td style="padding:12px 0;color:#333;line-height:1.6">${safeMessage}</td>
            </tr>
          </table>
        </div>
        <div style="background:#f5f5f5;padding:16px 32px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #e8e8e8">
          Recibido el ${receivedAt} · <a href="https://dcbikescantabria.com/admin/consultas" style="color:#C4A2CF;text-decoration:none">Ver en el panel</a>
        </div>
      </div>`

    console.log(`[${ts()}] [4/5] Llamando a Resend API — from: ${FROM_NAME} → to: ${maskEmail(destination)}`)

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:    `${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [destination],
        subject: `💬 Nueva consulta: ${productNameRaw}`,
        html,
      }),
    })

    const resendBody = await resendRes.json()
    console.log(`[${ts()}] [4/5] Resend HTTP status:`, resendRes.status)
    console.log(`[${ts()}] [4/5] Resend respuesta:`, JSON.stringify(resendBody))

    if (!resendRes.ok) {
      console.error(`[${ts()}] ✗ Resend rechazó el email:`, JSON.stringify(resendBody))
      throw new Error(JSON.stringify(resendBody))
    }

    // PASO 5 — Éxito
    console.log(`[${ts()}] [5/5] ✓ Email enviado correctamente. Resend ID:`, resendBody.id)
    return new Response(JSON.stringify({ ok: true, email_id: resendBody.id }), {
      headers: { 'Content-Type': 'application/json', ...CORS },
    })

  } catch (err) {
    console.error(`[${ts()}] ✗ Error fatal en send-quote-email:`, String(err))
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS },
    })
  }
})
