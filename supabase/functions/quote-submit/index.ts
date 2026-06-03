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
import { verifyTurnstile } from '../_shared/turnstile.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS })

  // B-27: rechazo temprano de payloads desproporcionados (anti-DoS).
  const cl = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(cl) && cl > 8192) {
    return jsonRes({ ok: false, error: 'payload too large' }, 413)
  }

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
  const captchaOk = await verifyTurnstile(cf_turnstile_token, ip, 'quote-submit')
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

  // La tabla quote_requests NO tiene columna `name` (minimización de PII; la
  // retención purga `message`). Conservamos el nombre dentro del mensaje para que
  // el comercio sepa quién consulta, y se purga junto con el resto.
  const composedMessage = `Nombre: ${name}\n\n${message}`.slice(0, 5000)

  // Inserta
  const { data: inserted, error: insertErr } = await supabase
    .from('quote_requests')
    .insert({
      email: email.slice(0, 200),
      phone: phone?.slice(0, 50) ?? null,
      message: composedMessage,
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
