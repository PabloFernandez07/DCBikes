// supabase/functions/_shared/order-admin.ts
//
// Utilidades compartidas por las edge functions admin (order-accept/reject/
// mark-ready/mark-shipped/mark-delivered):
//   - Autenticación del admin (Bearer token de usuario authenticated).
//   - Llamadas server-to-server a Redsys para capturar/cancelar pre-auth.
//   - Helpers para restaurar stock en rechazos/cancels.
//   - Helper de logging en order_status_history + payments_log.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { signRedsysPayload } from './redsys-sign.ts'
import { loadRedsysConfig, type RedsysConfig } from './redsys-config.ts'
import {
  asString,
  buildFromAddress,
  escapeHtml,
  formatPriceCents,
  getSettings,
  maskEmail,
  parseEmailCsv,
  sendViaResend,
} from './email-utils.ts'

/* ─────────── Auth admin ─────────── */

export interface AdminContext {
  supabase: SupabaseClient
  userId: string
  email: string | null
}

/**
 * Verifica el header Authorization Bearer y devuelve el supabase client con
 * service_role + el userId del admin autenticado.
 *
 * Estrategia: usamos un cliente "anon-con-token" SOLO para validar via
 * `auth.getUser()`. Para operar sobre datos usamos service_role (bypassa RLS).
 */
export async function requireAdmin(req: Request): Promise<
  | { ok: true; ctx: AdminContext }
  | { ok: false; status: number; error: string }
> {
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) {
    return { ok: false, status: 401, error: 'missing bearer token' }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: 'invalid bearer token' }
  }

  // Verificar que el usuario está en admin_users vía función is_admin().
  // Defensa en profundidad: aunque disable_signup se invierta accidentalmente
  // en Supabase Auth, un nuevo registro NO es admin.
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: isAdmin, error: adminCheckError } = await supabase
    .rpc('is_admin', { uid: userData.user.id })
  if (adminCheckError) {
    console.error('[requireAdmin] is_admin RPC error:', adminCheckError.message)
    return { ok: false, status: 500, error: 'admin check failed' }
  }
  if (!isAdmin) {
    console.warn(`[requireAdmin] user ${maskEmail(userData.user.email)} not in admin_users`)
    return { ok: false, status: 403, error: 'not authorized as admin' }
  }
  return {
    ok: true,
    ctx: {
      supabase,
      userId: userData.user.id,
      email: userData.user.email ?? null,
    },
  }
}

/* ─────────── Redsys S2S (capture/cancel) ─────────── */

export type RedsysOpType =
  | { kind: 'capture'; amountCents: number }
  | { kind: 'cancel'; amountCents: number }

export interface RedsysOpResult {
  ok: boolean
  responseCode: string | null
  authCode: string | null
  raw: Record<string, unknown>
  signatureValid: boolean | null
  /** True si el modo es mock (no se llamó a Redsys de verdad). */
  simulated: boolean
}

/**
 * Llama al endpoint REST de Redsys para capturar o cancelar la pre-auth.
 * En modo mock, simula la respuesta sin llamar a Redsys.
 */
export async function runRedsysOperation(opts: {
  config: RedsysConfig
  redsysOrderId: string
  op: RedsysOpType
}): Promise<RedsysOpResult> {
  const { config, redsysOrderId, op } = opts

  if (config.mode === 'mock') {
    return {
      ok: true,
      responseCode: '0000',
      authCode: 'MOCK' + Math.floor(Math.random() * 900000 + 100000),
      raw: { simulated: true, kind: op.kind, amount: op.amountCents, redsysOrderId },
      signatureValid: null,
      simulated: true,
    }
  }

  const transactionType = op.kind === 'capture' ? '2' : '9'

  const params: Record<string, string | number> = {
    DS_MERCHANT_MERCHANTCODE: config.merchantCode,
    DS_MERCHANT_TERMINAL: config.terminal,
    DS_MERCHANT_ORDER: redsysOrderId,
    DS_MERCHANT_AMOUNT: String(op.amountCents),
    DS_MERCHANT_CURRENCY: '978',
    DS_MERCHANT_TRANSACTIONTYPE: transactionType,
  }

  const signed = await signRedsysPayload(params, config.secretBase64)

  const restBody = {
    Ds_SignatureVersion: signed.Ds_SignatureVersion,
    Ds_MerchantParameters: signed.Ds_MerchantParameters,
    Ds_Signature: signed.Ds_Signature,
  }

  let raw: Record<string, unknown> = {}
  try {
    const res = await fetch(config.restEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(restBody),
    })
    raw = (await res.json().catch(() => ({}))) as Record<string, unknown>
  } catch (err) {
    return {
      ok: false,
      responseCode: null,
      authCode: null,
      raw: { error: String(err) },
      signatureValid: null,
      simulated: false,
    }
  }

  // Respuesta REST: { Ds_SignatureVersion, Ds_MerchantParameters, Ds_Signature }.
  // Decodificamos los parámetros para extraer Ds_Response y Ds_AuthorisationCode.
  let decoded: Record<string, unknown> = {}
  const merchParams = String(raw['Ds_MerchantParameters'] ?? '')
  if (merchParams) {
    try {
      const normalized = merchParams.replace(/-/g, '+').replace(/_/g, '/')
      const padding =
        normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
      const json = atob(normalized + padding)
      decoded = JSON.parse(json) as Record<string, unknown>
    } catch (_err) {
      // ignore decode failure
    }
  }

  const responseCode = String(decoded['Ds_Response'] ?? '') || null
  const authCode = String(decoded['Ds_AuthorisationCode'] ?? '') || null
  const n = responseCode ? parseInt(responseCode, 10) : NaN

  // Códigos de respuesta Redsys (Ds_Response):
  //   0000..0099 → "autorizada para pagos y preautorizaciones"
  //   0900       → "autorizada para devoluciones y CONFIRMACIONES"
  //   0400       → "transacción anulada" (respuesta de anulación correcta)
  //   9222       → "ya existe una anulación asociada" → idempotente, OK.
  //
  // FIX 2026-06-21: la CONFIRMACIÓN de preautorización (captura, type 2)
  // devuelve 0900 en éxito, NO 0000. La validación anterior (capture solo
  // 0..99) daba por FALLIDA una captura correcta de 0900 → revertía el pedido
  // a 'rejected' con el dinero ya capturado y mostraba error al aceptar.
  // Tanto captura como anulación se consideran OK con 0..99 o 0900.
  const captureOk =
    Number.isFinite(n) && ((n >= 0 && n <= 99) || n === 900)
  const cancelOk =
    Number.isFinite(n) && ((n >= 0 && n <= 99) || n === 400 || n === 900 || n === 9222)
  const ok = op.kind === 'capture' ? captureOk : cancelOk

  return {
    ok,
    responseCode,
    authCode,
    raw: { ...raw, decoded },
    signatureValid: null,
    simulated: false,
  }
}

/* ─────────── Alerta admin: anulación Redsys KO (4.2) ─────────── */

/**
 * 4.2 (auditoría 2026-06-11): cuando una anulación de pre-autorización
 * devuelve KO, además del log enviamos email de alerta al admin para que
 * libere la retención manualmente desde el portal de Redsys. Sin esta
 * alerta el dinero del cliente quedaba retenido hasta la caducidad de la
 * pre-auth sin que nadie se enterase (riesgo de reclamación / AEPD).
 *
 * Destinatarios: settings.order_notification_emails (CSV), con fallback a
 * quote_destination_email — mismo patrón que send-order-new-admin.
 * Best-effort: nunca lanza (el flujo de cancelación ya terminó para el
 * cliente; un fallo de email no debe romperlo).
 */
export async function alertAdminCancelKo(
  supabase: SupabaseClient,
  opts: {
    orderId: string
    orderNumber: string
    redsysOrderId: string | null
    amountCents: number
    responseCode: string | null
    /** Origen de la anulación: 'rechazo admin' | 'cancelación cliente' | 'auto-cancel cron'. */
    context: string
  },
): Promise<void> {
  try {
    const settings = await getSettings(supabase, [
      'order_notification_emails',
      'quote_destination_email',
    ])
    let recipients = parseEmailCsv(settings.order_notification_emails)
    if (recipients.length === 0) {
      const fallback = asString(settings.quote_destination_email)
      if (fallback) recipients = [fallback]
    }
    if (recipients.length === 0) {
      console.warn('[order-admin] alertAdminCancelKo: sin destinatarios admin (settings.order_notification_emails)')
      return
    }

    const html = `
      <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:0 0 20px 0;border-radius:4px">
        <p style="margin:0;color:#7f1d1d;font-size:13px;line-height:1.6">
          <strong>Acción requerida:</strong> la anulación de la pre-autorización en Redsys
          ha fallado. El pedido ya figura como cancelado para el cliente, pero la retención
          del importe sigue activa. Anula la operación manualmente desde el portal de Redsys.
        </p>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px 0;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#666;width:160px">Pedido</td><td style="padding:6px 0;color:#222;font-weight:600">${escapeHtml(opts.orderNumber)}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Importe retenido</td><td style="padding:6px 0;color:#222;font-weight:600">${escapeHtml(formatPriceCents(opts.amountCents))}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Ds_Merchant_Order</td><td style="padding:6px 0;color:#222">${escapeHtml(opts.redsysOrderId ?? '(desconocido)')}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Código respuesta Redsys</td><td style="padding:6px 0;color:#222">${escapeHtml(opts.responseCode ?? '(sin respuesta / error de red)')}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Origen de la anulación</td><td style="padding:6px 0;color:#222">${escapeHtml(opts.context)}</td></tr>
      </table>
      <p style="margin:0;color:#666;font-size:13px">
        El intento KO ha quedado registrado en payments_log para auditoría.
      </p>`

    await sendViaResend({
      from: buildFromAddress(),
      to: recipients,
      subject: `⚠️ Anulación Redsys KO — pedido ${opts.orderNumber}`,
      html,
    })
    console.log(`[order-admin] alertAdminCancelKo enviada · ${opts.orderNumber} · code=${opts.responseCode}`)
  } catch (err) {
    console.warn(`[order-admin] alertAdminCancelKo fallo (non-blocking) · ${opts.orderNumber}:`, String(err))
  }
}

/* ─────────── Restaurar stock ─────────── */

// BUG-C2 (auditoría técnica 2026-06-12): el antiguo restoreStockFor() vivía
// aquí y llamaba a restore_stock sin candado, permitiendo doble-restore si
// dos caminos coincidían. Sustituido por restoreStockOnce() en
// _shared/stock-restore.ts (idempotente vía orders.stock_restored_at).
// Importar desde allí — NO reimplementar restauración directa aquí.

/* ─────────── Historial + log helper ─────────── */

export async function logStatusChange(
  supabase: SupabaseClient,
  orderId: string,
  fromStatus: string,
  toStatus: string,
  changedBy: string | null,
  reason: string,
): Promise<void> {
  await supabase.from('order_status_history').insert({
    order_id: orderId,
    from_status: fromStatus,
    to_status: toStatus,
    changed_by: changedBy,
    reason,
  })
}

export async function logPayment(
  supabase: SupabaseClient,
  orderId: string,
  operationType: 'capture' | 'cancel',
  result: RedsysOpResult,
  txType: '2' | '9',
): Promise<void> {
  await supabase.from('payments_log').insert({
    order_id: orderId,
    payment_provider: result.simulated ? 'mock' : 'redsys',
    operation_type: operationType,
    redsys_response_code: result.responseCode,
    redsys_authorization_code: result.authCode,
    redsys_transaction_type: txType,
    raw_payload: result.raw,
    signature_valid: result.signatureValid,
  })
}

/* ─────────── Cargar pedido + config + helpers ─────────── */

export interface LoadedOrder {
  id: string
  order_number: string
  status: string
  delivery_method: 'shipping' | 'pickup' | string
  payment_pre_auth_id: string | null
  total_cents: number
  customer_email: string
}

export async function loadOrder(
  supabase: SupabaseClient,
  orderId: string,
): Promise<LoadedOrder | null> {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id, order_number, status, delivery_method, payment_pre_auth_id, total_cents, customer_email',
    )
    .eq('id', orderId)
    .maybeSingle<LoadedOrder>()
  if (error) {
    console.warn('[order-admin] loadOrder error:', error.message)
    return null
  }
  return data
}

export async function loadConfig(supabase: SupabaseClient): Promise<RedsysConfig> {
  return loadRedsysConfig(supabase)
}
