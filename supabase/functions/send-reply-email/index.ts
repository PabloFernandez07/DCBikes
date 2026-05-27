import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { maskEmail,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
const FROM_NAME      = 'DC Bikes Cantabria'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)

  const ts = () => new Date().toISOString()

  try {
    const { quote_id, subject, body } = await req.json()
    console.log(`[${ts()}] send-reply-email — quote_id: ${quote_id}`)

    if (!quote_id || !subject || !body) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos: quote_id, subject, body' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } },
      )
    }

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY no configurada')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Leer el quote para obtener el email del cliente
    const { data: quote, error: qErr } = await supabase
      .from('quote_requests')
      .select('*, products(name)')
      .eq('id', quote_id)
      .single()

    if (qErr || !quote) {
      console.error(`[${ts()}] Quote no encontrado:`, qErr?.message)
      throw new Error('Quote not found')
    }
    console.log(`[${ts()}] Enviando respuesta a:`, maskEmail(quote.email))

    // Leer reply_from en settings (email real de la tienda para el Reply-To)
    const { data: replySetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'reply_from_email')
      .single()

    const replyTo = ((replySetting?.value as string | null) ?? '"info@dcbikescantabria.es"')
      .replace(/^"|"$/g, '')

    // Convertir saltos de línea del body de texto plano a HTML
    const bodyHtml = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')

    const productName = (quote.products as { name: string } | null)?.name

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8f8f8">
        <div style="background:#1A1620;padding:28px 32px;text-align:center">
          <p style="color:#C4A2CF;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 6px">
            Respuesta a tu consulta
          </p>
          <h1 style="color:#EEF3F8;font-size:26px;margin:0;letter-spacing:1px">DC Bikes Cantabria</h1>
          <p style="color:#7E6E8A;font-size:12px;margin:6px 0 0">El Astillero · Cantabria</p>
        </div>

        <div style="padding:32px;background:#ffffff;border:1px solid #e8e8e8">
          ${productName ? `
            <div style="background:#f8f5ff;border-left:3px solid #C4A2CF;padding:10px 16px;margin-bottom:24px;font-size:13px;color:#555">
              En referencia a tu consulta sobre: <strong>${productName}</strong>
            </div>
          ` : ''}

          <div style="font-size:15px;color:#333;line-height:1.8">
            ${bodyHtml}
          </div>
        </div>

        <div style="background:#f5f5f5;padding:20px 32px;border-top:1px solid #e8e8e8">
          <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#333">DC Bikes Cantabria</p>
          <p style="margin:0;font-size:12px;color:#999">El Astillero, Cantabria · dcbikescantabria.es</p>
          <p style="margin:8px 0 0;font-size:11px;color:#bbb">
            Para responder a este mensaje, escríbenos a
            <a href="mailto:${replyTo}" style="color:#C4A2CF">${replyTo}</a>
          </p>
        </div>
      </div>`

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from:     `${FROM_NAME} <${FROM_EMAIL}>`,
        to:       [quote.email],
        reply_to: replyTo,
        subject,
        html,
      }),
    })

    const resendBody = await resendRes.json()
    console.log(`[${ts()}] Resend status: ${resendRes.status}`, JSON.stringify(resendBody))

    if (!resendRes.ok) {
      throw new Error(JSON.stringify(resendBody))
    }

    // Marcar como respondida
    await supabase
      .from('quote_requests')
      .update({ status: 'replied' })
      .eq('id', quote_id)

    console.log(`[${ts()}] ✓ Respuesta enviada. Resend ID:`, resendBody.id)

    return new Response(
      JSON.stringify({ ok: true, email_id: resendBody.id }),
      { headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ Error:`, String(err))
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } },
    )
  }
})
