// supabase/functions/request-payment-otp/index.ts
//
// Auditoría legal V5 · Sprint 2 · X-17
//
// Endpoint PÚBLICO (sin x-internal-secret) que el frontend llama para
// solicitar (o reenviar) un OTP de pago. Rate-limited estrictamente
// por IP para impedir flooding del buzón del cliente y abuso de
// Resend desde un atacante que conozca el order_id.
//
// Diseño:
//   • Valida que el pedido existe, no está borrado, está en `pending`
//     y aún no se ha verificado.
//   • Rate-limit en memoria del worker: 5 req / hora / IP. No es
//     perfecto (Supabase Edge Functions pueden tener múltiples workers
//     activos) pero es una primera barrera; el coste real lo paga
//     Resend que también aplica su propio rate-limit por API key.
//   • Anti-enumeración: si el pedido no cumple condiciones, devolvemos
//     siempre el mismo 404 genérico (no diferenciamos "no existe" de
//     "ya verificado" para no facilitar al atacante saber qué OTPs son
//     reabribles).
//   • Reenvía la invocación interna a send-payment-otp con el header
//     x-internal-secret (la generación + persistencia del OTP vive
//     centralizada en send-payment-otp).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsPreflightResponse,
  jsonError,
  jsonOk,
  maskIp,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'

/** 5 req/h por IP (rate-limit en memoria del worker). */
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000

// Ventana móvil de timestamps por IP. No persistimos: si el worker se
// recicla, el límite se relaja. Es aceptable: Resend + el bloqueo a 5
// intentos en payment-otp-verify cubren el caso peor.
const ipHits = new Map<string, number[]>()

function checkAndRecordIp(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const arr = (ipHits.get(ip) ?? []).filter((t) => t > cutoff)
  if (arr.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, arr)
    return false
  }
  arr.push(now)
  ipHits.set(ip, arr)
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const ipHeader =
      req.headers.get('x-real-ip') ??
      req.headers.get('x-forwarded-for') ??
      req.headers.get('cf-connecting-ip')
    const ip = ipHeader ? ipHeader.split(',')[0].trim() : null

    if (ip && !checkAndRecordIp(ip)) {
      console.warn(`[${ts()}] rate-limit request-payment-otp · ip=${maskIp(ip)}`)
      return jsonError(
        'Demasiadas solicitudes. Inténtalo de nuevo más tarde.',
        429,
        req,
      )
    }

    const body = (await req.json().catch(() => ({}))) as { order_id?: string }
    const orderId = (body.order_id ?? '').toString().trim()
    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verificación previa: el pedido debe existir, estar en pending y
    // no haberse verificado todavía. Anti-enumeración: usamos 404 genérico
    // para todos los casos de "no aplica".
    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .select('id, status, payment_otp_verified_at, deleted_at')
      .eq('id', orderId)
      .maybeSingle()

    if (ordErr) {
      console.error(`[${ts()}] ✗ orders lookup error:`, ordErr.message)
      return jsonError('lookup failed', 500, req)
    }
    if (
      !order ||
      order.deleted_at ||
      order.status !== 'pending' ||
      order.payment_otp_verified_at
    ) {
      return jsonError('pedido no disponible para verificación', 404, req)
    }

    // Invocación interna a send-payment-otp. NO es fire-and-forget: queremos
    // devolver al cliente el masked_email + expires_at para que el frontend
    // muestre "Hemos enviado el código a t***@example.com — caduca en 5 min".
    const { data: sendData, error: sendErr } = await supabase.functions.invoke(
      'send-payment-otp',
      {
        body: { order_id: orderId },
        headers: internalSecretHeader(),
      },
    )

    if (sendErr) {
      console.error(`[${ts()}] ✗ send-payment-otp invoke error:`, sendErr.message)
      return jsonError('No se pudo enviar el código. Inténtalo de nuevo.', 502, req)
    }

    const payload = (sendData ?? {}) as {
      ok?: boolean
      masked_email?: string
      expires_at?: string
    }

    if (!payload.ok) {
      console.warn(`[${ts()}] ✗ send-payment-otp respondió no-ok`)
      return jsonError('No se pudo enviar el código. Inténtalo de nuevo.', 502, req)
    }

    console.log(
      `[${ts()}] ✓ request-payment-otp · order=${orderId.slice(0, 8)}… · ip=${maskIp(ip)}`,
    )

    return jsonOk(
      {
        sent: true,
        masked_email: payload.masked_email,
        expires_at: payload.expires_at,
      },
      req,
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ request-payment-otp:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
