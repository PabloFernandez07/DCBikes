// quote-submit: recibe el formulario de presupuesto desde el frontend
// con verificación Turnstile + rate-limit por IP. Sustituye el INSERT
// directo desde el cliente anon.
//
// Variables de entorno necesarias:
//   - TURNSTILE_SECRET (env var en Supabase Functions secrets)
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Respuestas:
//   200 → { ok: true, id }
//   400 → input inválido
//   403 → captcha inválido
//   429 → rate-limit superado (>3 solicitudes/hora desde la misma IP)
//   500 → error interno

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { maskIp,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QuoteBody {
  name: string
  email: string
  phone?: string
  message: string
  product_id?: string | null
  cf_turnstile_token: string
  consent_version?: string
}

async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')
  if (!secret) {
    // B-03: fail-closed. Si el secret no está configurado, NO podemos verificar
    // el captcha y aceptar la solicitud abriría un vector de spam/abuso. La
    // política es rechazar siempre hasta que el operador configure el secreto.
    console.error('[quote-submit] TURNSTILE_SECRET MISSING — refusing all submissions (fail-closed)')
    return false
  }
  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  const data = (await res.json()) as { success?: boolean }
  return data.success === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })

  let body: QuoteBody
  try {
    body = (await req.json()) as QuoteBody
  } catch {
    return jsonRes({ ok: false, error: 'invalid json' }, 400)
  }

  const { name, email, phone, message, product_id, cf_turnstile_token } = body
  if (!name || !email || !message) {
    return jsonRes({ ok: false, error: 'missing required fields' }, 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonRes({ ok: false, error: 'invalid email' }, 400)
  }
  if (!cf_turnstile_token) {
    return jsonRes({ ok: false, error: 'captcha token required' }, 403)
  }

  // Captura IP/UA
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const cfip = req.headers.get('cf-connecting-ip') ?? ''
  const ip = (cfip || xff.split(',')[0] || '').trim().slice(0, 64) || null
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 512) || null

  // Verifica captcha
  const captchaOk = await verifyTurnstile(cf_turnstile_token, ip)
  if (!captchaOk) {
    console.warn('[quote-submit] captcha invalid, ip:', maskIp(ip))
    return jsonRes({ ok: false, error: 'captcha verification failed' }, 403)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Rate-limit: max 3 solicitudes/hora desde la misma IP
  if (ip) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countErr } = await supabase
      .from('quote_requests')
      .select('id', { count: 'exact', head: true })
      .eq('consent_ip', ip)
      .gt('created_at', oneHourAgo)
    if (countErr) {
      console.error('[quote-submit] rate-limit count error:', countErr.message)
    } else if ((count ?? 0) >= 3) {
      console.warn(`[quote-submit] rate-limit exceeded for ip ${maskIp(ip)}: ${count}`)
      return jsonRes({ ok: false, error: 'rate limit exceeded; try again in 1 hour' }, 429)
    }
  }

  // Inserta
  const { data: inserted, error: insertErr } = await supabase
    .from('quote_requests')
    .insert({
      name: name.slice(0, 200),
      email: email.slice(0, 200),
      phone: phone?.slice(0, 50) ?? null,
      message: message.slice(0, 5000),
      product_id: product_id ?? null,
      consent_ip: ip,
      consent_user_agent: ua,
      consent_at: new Date().toISOString(),
      consent_version: body.consent_version ?? null,
    })
    .select('id')
    .single()
  if (insertErr) {
    console.error('[quote-submit] insert error:', insertErr.message)
    return jsonRes({ ok: false, error: 'database error' }, 500)
  }

  // Dispara email admin (best-effort, no bloquea respuesta al cliente)
  try {
    await supabase.functions.invoke('send-quote-email', {
      body: { quote_id: inserted.id },
      headers: internalSecretHeader(),
    })
  } catch (err) {
    console.warn('[quote-submit] send-quote-email failed:', err)
  }

  return jsonRes({ ok: true, id: inserted.id }, 200)
})

function jsonRes(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
