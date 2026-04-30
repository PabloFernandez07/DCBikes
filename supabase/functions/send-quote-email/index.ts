import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' },
    })
  }

  try {
    const { quote_id } = await req.json()
    if (!quote_id) return new Response(JSON.stringify({ error: 'quote_id required' }), { status: 400 })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Leer la consulta
    const { data: quote, error: qErr } = await supabase
      .from('quote_requests')
      .select('*, products(name, slug)')
      .eq('id', quote_id)
      .single()
    if (qErr || !quote) throw new Error('Quote not found')

    // Leer email destino de settings
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'quote_destination_email')
      .single()
    const destination = (setting?.value as string) ?? 'info@dcbikescantabria.es'

    const productName = (quote.products as { name: string } | null)?.name ?? 'sin producto específico'

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#1A1620;padding:24px;text-align:center">
          <h1 style="color:#C4A2CF;font-size:28px;margin:0">DC Bikes Cantabria</h1>
          <p style="color:#7E6E8A;margin:4px 0 0">Nueva consulta de presupuesto</p>
        </div>
        <div style="padding:32px;background:#fff;border:1px solid #eee">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="padding:8px 0;color:#666;width:140px">Producto</td>
                <td style="padding:8px 0;font-weight:600">${productName}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Email</td>
                <td style="padding:8px 0">${quote.email}</td></tr>
            <tr><td style="padding:8px 0;color:#666">Teléfono</td>
                <td style="padding:8px 0">${quote.phone ?? '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#666;vertical-align:top">Mensaje</td>
                <td style="padding:8px 0">${quote.message ?? '—'}</td></tr>
          </table>
        </div>
        <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:12px;color:#999">
          Consulta recibida el ${new Date(quote.created_at).toLocaleString('es-ES')}
        </div>
      </div>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from:    'DC Bikes Cantabria <noreply@dcbikescantabria.es>',
        to:      [destination.replace(/^"|"$/g, '')],
        subject: `💬 Consulta presupuesto: ${productName}`,
        html,
      }),
    })

    if (!res.ok) throw new Error(await res.text())

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
