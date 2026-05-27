// supabase/functions/payment-otp-verify/index.ts
//
// Auditoría legal V5 · Sprint 2 · X-17
//
// Endpoint PÚBLICO (sin x-internal-secret ni Bearer) que verifica el
// OTP de 6 dígitos introducido por el cliente. Si pasa todas las
// validaciones, marca el pedido como "OTP verificado" y borra el hash
// (para que un leak posterior de DB no permita replay).
//
// Defensas:
//   • timingSafeEq() para comparar hashes y evitar timing side-channel.
//   • Single-use: si payment_otp_verified_at != NULL → 400 "OTP ya usado".
//   • Caducidad: 5 min desde emisión.
//   • Bloqueo: 5 intentos fallidos → 403, requiere reemisión.
//   • Gate de estado: sólo pedidos en `pending` aceptan verificación.
//
// La respuesta exitosa NO incluye link de Redsys aún — el frontend
// decide a dónde navegar (típicamente /pago/:order_id o el endpoint
// que ya tenga S2-B2). Devolvemos el order_id y status para que el
// caller pueda redirigir con confianza.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsPreflightResponse,
  jsonError,
  jsonOk,
  maskIp,
} from '../_shared/email-utils.ts'
import { timingSafeEq } from '../_shared/security.ts'

const MAX_ATTEMPTS = 5

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

    const body = (await req.json().catch(() => ({}))) as {
      order_id?: string
      otp?: string
    }
    const orderId = (body.order_id ?? '').toString().trim()
    const otp = (body.otp ?? '').toString().trim()

    if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
      return jsonError('order_id inválido', 400, req)
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      return jsonError('OTP inválido (deben ser 6 dígitos)', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: order, error: ordErr } = await supabase
      .from('orders')
      .select(
        'id, order_number, status, payment_otp_hash, payment_otp_expires_at, payment_otp_attempts, payment_otp_verified_at, deleted_at',
      )
      .eq('id', orderId)
      .maybeSingle()

    if (ordErr) {
      console.error(`[${ts()}] ✗ orders lookup error:`, ordErr.message)
      return jsonError('lookup failed', 500, req)
    }
    if (!order || order.deleted_at) {
      // 404 genérico — no distinguimos entre "no existe" y "borrado" para
      // no facilitar enumeración de pedidos.
      return jsonError('pedido no encontrado', 404, req)
    }
    if (order.status !== 'pending') {
      return jsonError('estado inválido para verificación', 409, req)
    }
    if (order.payment_otp_verified_at) {
      // Single-use: ya se consumió en una verificación anterior.
      return jsonError('OTP ya usado', 400, req)
    }
    if (!order.payment_otp_hash || !order.payment_otp_expires_at) {
      return jsonError('no hay OTP activo, solicita uno nuevo', 400, req)
    }

    // Caducidad antes de comprobar bloqueo: si está caducado, devolvemos
    // 400 específico para que el frontend ofrezca "Reenviar código".
    if (new Date(order.payment_otp_expires_at).getTime() < Date.now()) {
      return jsonError('OTP caducado, solicita uno nuevo', 400, req)
    }

    // Bloqueo permanente tras 5 fallos. Sólo se desbloquea reemitiendo
    // OTP (que reinicia attempts a 0).
    if ((order.payment_otp_attempts ?? 0) >= MAX_ATTEMPTS) {
      console.warn(
        `[${ts()}] ✗ OTP bloqueado · order=${order.order_number} · ip=${maskIp(ip)}`,
      )
      return jsonError(
        'Demasiados intentos. Pedido bloqueado, contacta con la tienda.',
        403,
        req,
      )
    }

    const inputHash = await sha256Hex(otp)
    const match = timingSafeEq(inputHash, order.payment_otp_hash)

    if (!match) {
      // Sumar intento fallido. RLS service_role nos permite UPDATE directo.
      const newAttempts = (order.payment_otp_attempts ?? 0) + 1
      const { error: updErr } = await supabase
        .from('orders')
        .update({ payment_otp_attempts: newAttempts })
        .eq('id', orderId)

      if (updErr) {
        console.error(`[${ts()}] ✗ attempt increment failed:`, updErr.message)
        // Continuamos con la respuesta 401: no fingimos éxito si la DB falla,
        // pero no exponemos el detalle interno.
      }

      const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts)
      console.warn(
        `[${ts()}] ✗ OTP fail · order=${order.order_number} · attempts=${newAttempts}/${MAX_ATTEMPTS} · ip=${maskIp(ip)}`,
      )
      return jsonError(
        `Código incorrecto. Intentos restantes: ${remaining}`,
        401,
        req,
      )
    }

    // Éxito: marcar verified_at, borrar hash (one-way: nadie podrá replay),
    // y dejar attempts tal cual (forense).
    const verifiedAt = new Date().toISOString()
    const { error: okErr } = await supabase
      .from('orders')
      .update({
        payment_otp_verified_at: verifiedAt,
        payment_otp_hash: null,
      })
      .eq('id', orderId)
      // Defensa frente a race con otro proceso que ya hubiese verificado:
      // sólo actualizamos si sigue sin verified_at.
      .is('payment_otp_verified_at', null)

    if (okErr) {
      console.error(`[${ts()}] ✗ verified update failed:`, okErr.message)
      return jsonError('persist failed', 500, req)
    }

    console.log(
      `[${ts()}] ✓ OTP verificado · order=${order.order_number} · ip=${maskIp(ip)}`,
    )

    return jsonOk(
      {
        verified: true,
        order_id: order.id,
        order_number: order.order_number,
        verified_at: verifiedAt,
      },
      req,
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ payment-otp-verify:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
