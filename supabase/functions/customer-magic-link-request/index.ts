// supabase/functions/customer-magic-link-request/index.ts
//
// Feature N — Cliente pide un magic link para ver "Mis pedidos".
//
// Flujo:
//   1. POST { email }. Sin auth (público).
//   2. Valida formato email + rate-limit (max 5/hora por email).
//   3. Comprueba SILENCIOSAMENTE si existe al menos un pedido vivo con ese
//      email. Si NO existe → devuelve igual { ok:true, message:... } para
//      evitar enumeración (un atacante no puede saber si el email tiene
//      cuenta o no).
//   4. Si existe → crea customer_session y envía email vía
//      send-customer-magic-link.
//
// Respuesta siempre 200 (excepto rate limit 429 y formato 400) para no
// dar señales al atacante.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { buildCorsHeaders, jsonError, jsonOk, maskEmail, maskIp,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import {
  countRecentSessionsForEmail,
  createCustomerSession,
} from '../_shared/customer-session.ts'

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1h
// S-09: rate-limit adicional por IP (20 req/h) — defiende contra ataques distribuidos por email
const IP_RATE_LIMIT_MAX = 20
const PUBLIC_MESSAGE =
  'Si existe un pedido asociado a ese email, recibirás un enlace en breve.'

serve(async (req) => {
  const cors = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as { email?: string }
    const email = (body.email ?? '').toString().trim().toLowerCase()
    if (!email || !EMAIL_RE.test(email)) {
      return jsonError('Email inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // S-09: extraer IP antes de los rate-limits (se necesita para ambos checks)
    const ipHeader =
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      req.headers.get('cf-connecting-ip')
    const ip = ipHeader ? ipHeader.split(',')[0].trim() : null
    const ua = req.headers.get('user-agent')

    // S-09: rate-limit por IP (20 req/hora) — primer check, antes del de email,
    // para bloquear ataques distribuidos multi-email desde la misma IP.
    if (ip) {
      const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
      const { count: ipCount, error: ipErr } = await supabase
        .from('customer_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', ip)
        .gte('created_at', oneHourAgo)
      if (!ipErr && (ipCount ?? 0) >= IP_RATE_LIMIT_MAX) {
        console.warn(`[${ts()}] rate-limit IP · ip=${maskIp(ip)} · count=${ipCount}`)
        return jsonError('Demasiadas solicitudes. Inténtalo de nuevo en una hora.', 429, req)
      }
    }

    // Rate limit: 5 solicitudes / hora / email.
    const recent = await countRecentSessionsForEmail(
      supabase,
      email,
      RATE_LIMIT_WINDOW_MS,
    )
    if (recent >= RATE_LIMIT_MAX) {
      console.warn(
        `[${ts()}] rate-limit email · email=${maskEmail(email)} · count=${recent}`,
      )
      return jsonError(
        'Demasiadas solicitudes. Inténtalo de nuevo en una hora.',
        429,
        req,
      )
    }

    // ¿Hay algún pedido vivo asociado a este email?
    const { count: orderCount, error: cErr } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_email', email)
      .is('deleted_at', null)

    if (cErr) {
      console.error(`[${ts()}] orders count error:`, cErr.message)
      // Aun así devolvemos OK público para no revelar nada. Pero NO creamos
      // sesión ni email (no hay datos válidos).
      return jsonOk({ message: PUBLIC_MESSAGE }, req)
    }

    if (!orderCount || orderCount === 0) {
      // Anti-enumeración: respuesta idéntica al caso "sí existe".
      console.log(
        `[${ts()}] magic-link request · email=${maskEmail(email)} · no-orders (silent ok)`,
      )
      return jsonOk({ message: PUBLIC_MESSAGE }, req)
    }

    let token: string
    try {
      const session = await createCustomerSession(supabase, email, ip, ua)
      token = session.token
    } catch (err) {
      console.error(`[${ts()}] createCustomerSession failed:`, String(err))
      // Devolvemos OK público igualmente — no revelamos errores internos.
      return jsonOk({ message: PUBLIC_MESSAGE }, req)
    }

    // Invocar send-customer-magic-link (fire-and-forget — no bloqueamos al cliente).
    supabase.functions
      .invoke('send-customer-magic-link', { body: { email, token } })
      .then((res) => {
        if (res.error) {
          console.warn(
            `[${ts()}] send-customer-magic-link invoke error:`,
            res.error.message,
          )
        }
      })
      .catch((err) =>
        console.warn(`[${ts()}] send-customer-magic-link exception:`, String(err)),
      )

    console.log(
      `[${ts()}] ✓ magic-link request · email=${maskEmail(email)} · orders=${orderCount}`,
    )
    return jsonOk({ message: PUBLIC_MESSAGE }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-magic-link-request:`, String(err))
    return jsonError(String(err), 500, req)
  }
})
