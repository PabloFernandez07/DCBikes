// supabase/functions/admin-resend-email/index.ts
//
// Permite al ADMIN reenviar un email transaccional de un pedido desde el panel.
//
// Por qué existe: las funciones de envío (send-order-*) son INTERNAS — exigen
// `x-internal-secret` y están pensadas para llamarse servidor-a-servidor (desde
// order-place, order-accept, etc.). El navegador del admin NO tiene ese secreto,
// así que cuando el panel las invocaba directamente recibía 403 forbidden
// ("Edge Function returned a non-2xx status code"). Esta función es un proxy
// autenticado: valida el JWT de admin y reenvía a la send-* correcta firmando
// la llamada con el secreto interno.
//
// Auth: JWT de admin (Authorization Bearer), igual que admin-generate-invoice.
//
// POST { order_id, fn }  →  fn debe estar en ALLOWED (allowlist de send-*).
//   200 { ok:true }
//   4xx { ok:false, error }

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { jsonError, jsonOk, corsPreflightResponse } from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'

// Solo se puede reenviar a estas funciones (evita usar el proxy como SSRF
// interno hacia cualquier edge function).
const ALLOWED = new Set([
  'send-order-confirmation-customer',
  'send-order-accepted-customer',
  'send-order-rejected-customer',
  'send-order-auto-cancelled',
  'send-order-ready-pickup',
  'send-order-shipped',
])

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // ── 1. Autenticación de admin (patrón admin-generate-invoice) ──────────────
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return jsonError('missing bearer token', 401, req)
    }
    const jwt = authHeader.slice(7).trim()

    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(jwt)
    if (userErr || !userData?.user) {
      return jsonError('unauthorized', 401, req)
    }
    const { data: adminRow } = await supabaseAuth
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!adminRow) {
      return jsonError('forbidden', 403, req)
    }
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-resend-email auth exception:`, String(err))
    return jsonError('auth check failed', 500, req)
  }

  // ── 2. Body + validación ───────────────────────────────────────────────────
  if (req.method !== 'POST') return jsonError('method not allowed', 405, req)
  const body = (await req.json().catch(() => ({}))) as { order_id?: string; fn?: string }
  const orderId = body.order_id ?? ''
  const fn = body.fn ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return jsonError('order_id inválido', 400, req)
  if (!ALLOWED.has(fn)) return jsonError(`función no permitida: ${fn}`, 400, req)

  // ── 3. Reenvío firmado con el secreto interno ──────────────────────────────
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { error } = await supabase.functions.invoke(fn, {
      body: { order_id: orderId },
      headers: internalSecretHeader(),
    })
    if (error) {
      console.error(`[${ts()}] ✗ admin-resend-email · ${fn} · ${orderId}:`, error.message)
      return jsonError('no se pudo reenviar el email', 502, req)
    }
    console.log(`[${ts()}] ✓ admin-resend-email · ${fn} · ${orderId}`)
    return jsonOk({ ok: true }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ admin-resend-email exception:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
