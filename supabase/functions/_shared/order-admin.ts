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
import { maskEmail } from './email-utils.ts'

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
  const ok = op.kind === 'capture' ? Number.isFinite(n) && n >= 0 && n <= 99 : true
  // cancel: Redsys devuelve "0900" (anulación correcta). Aceptamos cualquier 0xxx.

  return {
    ok,
    responseCode,
    authCode,
    raw: { ...raw, decoded },
    signatureValid: null,
    simulated: false,
  }
}

/* ─────────── Restaurar stock ─────────── */

export async function restoreStockFor(
  supabase: SupabaseClient,
  orderId: string,
): Promise<void> {
  const { data: items, error } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)
  if (error || !items) {
    console.warn('[order-admin] restoreStockFor: no se pudieron leer items:', error?.message)
    return
  }
  for (const it of items) {
    if (!it.product_id) continue
    const { data: prod } = await supabase
      .from('products')
      .select('stock')
      .eq('id', it.product_id)
      .maybeSingle()
    if (!prod) continue
    await supabase
      .from('products')
      .update({ stock: (prod.stock ?? 0) + it.quantity })
      .eq('id', it.product_id)
  }
}

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
