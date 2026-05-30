// supabase/functions/stock-alert-submit/index.ts
//
// Recibe la suscripción "Avísame cuando esté disponible" desde el frontend.
// Pública (sin JWT), protegida con Turnstile + rate-limit por IP.
//
// Variables de entorno necesarias:
//   - TURNSTILE_SECRET
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//
// Contrato de respuesta (el frontend depende de estos mensajes exactos):
//   200 → { ok: true }
//   400 → input inválido (email, product_id, stock ya disponible)
//   403 → captcha inválido (mensaje contiene "captcha")
//   409 → suscripción ya activa para ese par product_id+email
//   429 → rate-limit superado (mensaje contiene "rate limit")
//   500 → error interno

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsPreflightResponse,
  buildCorsHeaders,
  maskIp,
} from '../_shared/email-utils.ts'
import { verifyTurnstile } from '../_shared/turnstile.ts'

interface StockAlertBody {
  product_id: string
  email: string
  cf_turnstile_token: string
  consent_version?: string
}

// Helper interno para respuestas JSON con CORS dinámico
function jsonRes(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
  })
}

// Genera token aleatorio hex 32 bytes (64 chars) para el enlace de baja.
// Mismo patrón que customer-session.ts (generateRandomToken).
function generateUnsubscribeToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: buildCorsHeaders(req) })
  }

  // Anti-DoS: rechaza payloads desproporcionados (~4 KB)
  const cl = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(cl) && cl > 4096) {
    return jsonRes({ ok: false, error: 'payload too large' }, 413, req)
  }

  // Parseo del body
  let body: StockAlertBody
  try {
    body = (await req.json()) as StockAlertBody
  } catch {
    return jsonRes({ ok: false, error: 'invalid json' }, 400, req)
  }

  const { product_id, email, cf_turnstile_token, consent_version } = body

  // Validación de campos obligatorios
  if (!product_id || typeof product_id !== 'string') {
    return jsonRes({ ok: false, error: 'product_id requerido' }, 400, req)
  }
  if (!email || typeof email !== 'string') {
    return jsonRes({ ok: false, error: 'email requerido' }, 400, req)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonRes({ ok: false, error: 'email inválido' }, 400, req)
  }
  if (!cf_turnstile_token) {
    return jsonRes({ ok: false, error: 'captcha token required' }, 403, req)
  }

  // Captura IP y User-Agent (RGPD art. 7.1 — prueba de consentimiento)
  const xff = req.headers.get('x-forwarded-for') ?? ''
  const cfip = req.headers.get('cf-connecting-ip') ?? ''
  const ip = (cfip || xff.split(',')[0] || '').trim().slice(0, 64) || null
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 512) || null

  // Verificación del captcha (fail-closed)
  const captchaOk = await verifyTurnstile(cf_turnstile_token, ip, 'stock-alert-submit')
  if (!captchaOk) {
    console.warn('[stock-alert-submit] captcha inválido, ip:', maskIp(ip))
    return jsonRes({ ok: false, error: 'captcha verification failed' }, 403, req)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Rate-limit: máximo 3 suscripciones/hora desde la misma IP
  if (ip) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: countErr } = await supabase
      .from('stock_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('consent_ip', ip)
      .gt('created_at', oneHourAgo)
    if (countErr) {
      console.error('[stock-alert-submit] rate-limit count error:', countErr.message)
    } else if ((count ?? 0) >= 3) {
      console.warn(`[stock-alert-submit] rate-limit superado para ip ${maskIp(ip)}: ${count}`)
      return jsonRes({ ok: false, error: 'rate limit exceeded; intenta de nuevo en 1 hora' }, 429, req)
    }
  }

  // Verificar que el producto existe y está sin stock
  // Si tiene stock, el aviso carece de sentido → informar al cliente
  const { data: product, error: productErr } = await supabase
    .from('products')
    .select('id, stock, active')
    .eq('id', product_id)
    .maybeSingle<{ id: string; stock: number; active: boolean }>()

  if (productErr) {
    console.error('[stock-alert-submit] product lookup error:', productErr.message)
    return jsonRes({ ok: false, error: 'error de base de datos' }, 500, req)
  }
  if (!product) {
    return jsonRes({ ok: false, error: 'producto no encontrado' }, 400, req)
  }
  if (product.stock > 0) {
    return jsonRes({ ok: false, error: 'el producto ya está disponible; puedes añadirlo al carrito' }, 400, req)
  }

  // Generar token de baja único
  const unsubscribeToken = generateUnsubscribeToken()

  // INSERT idempotente: el índice único parcial `stock_alerts_active_uniq`
  // sobre (product_id, lower(email)) WHERE notified_at IS NULL AND revoked_at IS NULL
  // garantiza que no existan dos suscripciones activas para el mismo par.
  //
  // supabase-js v2 no expone ON CONFLICT DO NOTHING para índices parciales,
  // así que capturamos el error PostgreSQL 23505 (unique_violation) y devolvemos
  // { ok: true } igualmente — operación idempotente para el cliente.
  const { error: insertErr } = await supabase
    .from('stock_alerts')
    .insert({
      product_id,
      email: email.toLowerCase().trim().slice(0, 200),
      unsubscribe_token: unsubscribeToken,
      consent_ip: ip,
      consent_user_agent: ua,
      consent_at: new Date().toISOString(),
      consent_version: consent_version ?? null,
    })

  if (insertErr) {
    // 23505 = unique_violation: ya existe suscripción activa para este par
    if (insertErr.code === '23505') {
      console.log('[stock-alert-submit] suscripción ya existente — idempotente, devolviendo ok')
      return jsonRes({ ok: true }, 200, req)
    }
    console.error('[stock-alert-submit] insert error:', insertErr.message)
    return jsonRes({ ok: false, error: 'error de base de datos' }, 500, req)
  }

  console.log(`[stock-alert-submit] suscripción creada — product=${product_id} ip=${maskIp(ip)}`)
  return jsonRes({ ok: true }, 200, req)
})
