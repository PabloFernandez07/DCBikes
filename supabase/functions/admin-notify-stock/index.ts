// supabase/functions/admin-notify-stock/index.ts
//
// Permite al admin enviar manualmente las alertas de stock de un producto
// concreto sin esperar al cron. Útil cuando el admin acaba de marcar stock
// disponible en el panel y quiere notificar al instante.
//
// Auth: JWT Supabase + tabla admin_users. Mismo patrón que
// `admin-generate-invoice` y `send-reply-email`.
//
// Flujo:
//   POST { product_id } → invoca send-stock-alert con { product_id }
//                       → devuelve { ok: true, sent: N }
//
// No requiere verify_jwt=false: el admin invoca con su JWT real (verify_jwt=true
// por defecto, como admin-generate-invoice).
//
// Variables de entorno necesarias:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//   - INTERNAL_INVOKE_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsPreflightResponse,
  jsonOk,
  jsonError,
} from '../_shared/email-utils.ts'
import { internalSecretHeader } from '../_shared/security.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // ── 1. Autenticación de admin ──────────────────────────────────────────────
  // Patrón idéntico a admin-generate-invoice:
  //   1) Leer JWT Bearer del header
  //   2) supabaseAuth.auth.getUser(jwt)
  //   3) Comprobar que el user_id existe en admin_users
  let adminUserId: string
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
      console.warn(`[${ts()}] admin-notify-stock: JWT inválido —`, userErr?.message)
      return jsonError('unauthorized', 401, req)
    }

    const { data: adminRow } = await supabaseAuth
      .from('admin_users')
      .select('id')
      .eq('id', userData.user.id)
      .maybeSingle()

    if (!adminRow) {
      console.warn(`[${ts()}] admin-notify-stock: user ${userData.user.id} no es admin`)
      return jsonError('forbidden', 403, req)
    }

    adminUserId = userData.user.id
  } catch (err) {
    console.error(`[${ts()}] admin-notify-stock: auth check exception:`, String(err))
    return jsonError('auth check failed', 500, req)
  }

  // ── 2. Parseo y validación del body ───────────────────────────────────────
  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as { product_id?: string }
    const productId = body.product_id ?? null

    if (!productId || typeof productId !== 'string') {
      return jsonError('product_id requerido', 400, req)
    }
    // Validación básica de formato UUID
    if (!/^[0-9a-f-]{36}$/i.test(productId)) {
      return jsonError('product_id inválido', 400, req)
    }

    console.log(`[${ts()}] admin-notify-stock: product=${productId} admin=${adminUserId}`)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 3. Invocar send-stock-alert con product_id (interno, doble auth) ─────
    let result: unknown = null
    let invokeErr: unknown = null
    try {
      const res = await supabase.functions.invoke('send-stock-alert', {
        body: { product_id: productId },
        headers: internalSecretHeader(),
      })
      result = res.data
      invokeErr = res.error
    } catch (e) {
      invokeErr = e
    }

    if (invokeErr) {
      // Intentar extraer el mensaje de error del body de la función receptora
      const detail =
        (invokeErr as { message?: string })?.message ??
        String(invokeErr)
      console.warn(`[${ts()}] admin-notify-stock: send-stock-alert falló: ${detail}`)
      return jsonError(`send-stock-alert error: ${detail}`, 502, req)
    }

    const sent = (result as { sent?: number } | null)?.sent ?? 0
    console.log(`[${ts()}] admin-notify-stock: OK — product=${productId} sent=${sent} admin=${adminUserId}`)

    return jsonOk({ sent }, req)
  } catch (err) {
    console.error(`[${ts()}] admin-notify-stock: error interno:`, String(err))
    return jsonError('error interno', 500, req)
  }
})
