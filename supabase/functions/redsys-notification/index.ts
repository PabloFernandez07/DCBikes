// supabase/functions/redsys-notification/index.ts
//
// Webhook público que recibe notifications de Redsys (modo test/prod) o del
// simulador interno (modo mock) tras autorización/rechazo de la pre-autorización.
//
// Redsys envía POST con `Content-Type: application/x-www-form-urlencoded` y los
// campos:
//   Ds_SignatureVersion (HMAC_SHA256_V1)
//   Ds_MerchantParameters (base64 url-safe del JSON con Ds_Order, Ds_Response, ...)
//   Ds_Signature (base64 url-safe HMAC SHA-256)
//
// En modo mock simulamos el mismo payload sin firmar (signature_valid=null en log)
// — la página /mock-redsys-pago llama a este endpoint vía POST JSON con la flag
// `__mock_authorized` true/false y el order_id interno.
//
// Lógica:
//   1. Detecta payload Redsys (form-urlencoded) o mock (JSON).
//   2. Si Redsys: verifica firma. Si inválida → log + 403.
//   3. Localiza order por Ds_Order (== payment_pre_auth_id) o por id mock.
//   4. Si la respuesta es OK (Ds_Response numérico 0-99): UPDATE status=authorized.
//   5. Si no: status=payment_failed.
//   6. Inserta payments_log con raw_payload.
//   7. Inserta order_status_history.
//   8. Si authorized: invoca send-order-confirmation-customer + send-order-new-admin.
//
// Devuelve siempre 200 a Redsys (excepto firma inválida → 403) — Redsys reintenta
// si recibe error HTTP, así que no queremos que reintente por bugs nuestros una
// vez que el pedido ya está marcado.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { escapeHtml, getSettings, asString, jsonError, jsonOk, sendViaResend, buildFromAddress,
  corsPreflightResponse,
} from '../_shared/email-utils.ts'
import { loadRedsysConfig } from '../_shared/redsys-config.ts'
import { verifyRedsysSignature } from '../_shared/redsys-sign.ts'
import { internalSecretHeader } from '../_shared/security.ts'

interface NotificationOutcome {
  authorized: boolean
  responseCode: string | null
  authCode: string | null
  redsysOrderId: string | null
  paymentMethod: 'card' | 'bizum' | null
  rawPayload: Record<string, unknown>
  signatureValid: boolean | null
  source: 'redsys' | 'mock'
  /** B-14: sha256 hex de Ds_MerchantParameters para anti-replay. null en mock. */
  merchantParamsHash: string | null
}

// B-14: sha256 hex helper para anti-replay de notificaciones Redsys.
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

function isOkResponseCode(code: string | null): boolean {
  if (code == null) return false
  const n = parseInt(code, 10)
  return Number.isFinite(n) && n >= 0 && n <= 99
}

// Sanitiza el payload de Redsys antes de persistirlo en payments_log: descarta
// campos sensibles (datos de tarjeta, identificadores de tarjeta-habiente, etc.)
// y conserva solo claves necesarias para auditoría/conciliación.
// Cumple minimización RGPD (art. 5.1.c) y reduce superficie ante una brecha.
function sanitizeRedsysPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return { sanitized: true }
  const out: Record<string, unknown> = {}
  const allowedKeys = new Set([
    'Ds_Response',
    'Ds_Order',
    'Ds_Amount',
    'Ds_Date',
    'Ds_Hour',
    'Ds_Currency',
    'Ds_MerchantCode',
    'Ds_Terminal',
    'Ds_TransactionType',
    'Ds_SecurePayment',
    'Ds_Card_Country',
    'Ds_Card_Brand',
    'Ds_PaymentMethod',
    'simulated',
    '__mock',
    'order_id',
    'authorized',
    'note',
    'warning',
  ])
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (allowedKeys.has(k)) {
      out[k] = v
    } else if (k === 'Ds_AuthorisationCode' && typeof v === 'string') {
      // Conserva los últimos 4 caracteres para auditoría, anonimiza el resto.
      out[k] = v.length > 4 ? '****' + v.slice(-4) : '****'
    } else if (k === 'decoded' && v && typeof v === 'object') {
      // Aplicar la misma sanitización recursivamente al objeto decoded
      out[k] = sanitizeRedsysPayload(v)
    }
    // Cualquier otra key se descarta (PAN, CVV, expiry, holder, IPs, etc.).
  }
  return out
}

function inferPayMethod(params: Record<string, unknown>): 'card' | 'bizum' | null {
  // Redsys devuelve Ds_PaymentMethod (ej. 'C' tarjeta, 'z' bizum) y/o Ds_Card_Brand.
  const pm = String(params['Ds_PaymentMethod'] ?? params['DS_PAYMENTMETHOD'] ?? '').toUpperCase()
  if (pm === 'Z') return 'bizum'
  if (pm === 'C' || pm === 'D' || pm === 'R' || pm === 'T') return 'card'
  // Fallback heurístico por Ds_Card_Brand.
  if (params['Ds_Card_Brand'] || params['DS_CARD_BRAND']) return 'card'
  return null
}

interface MockBody {
  __mock?: boolean
  order_id?: string
  authorized?: boolean
}

async function parsePayload(
  contentType: string,
  rawBody: string,
  mockBody: MockBody | null,
  supabase: SupabaseClient,
): Promise<NotificationOutcome | null> {
  // Mock: JSON con {__mock: true, order_id, authorized: bool}.
  // CRÍTICO: solo se acepta si el modo Redsys configurado es 'mock'. En
  // producción (test/prod), un atacante podría marcar pedidos como
  // 'authorized' sin pagar si esta verificación no existe → fraude.
  if (contentType.includes('application/json')) {
    if (!mockBody?.__mock || !mockBody.order_id) return null
    const config = await loadRedsysConfig(supabase)
    if (config.mode !== 'mock') {
      console.warn(
        '[redsys-notification] payload __mock RECHAZADO porque el modo Redsys actual es:',
        config.mode,
        '· order_id:',
        mockBody.order_id?.slice(0, 8),
      )
      return null
    }
    return {
      authorized: !!mockBody.authorized,
      responseCode: mockBody.authorized ? '0000' : '0190',
      authCode: mockBody.authorized
        ? 'MOCK' + Math.floor(Math.random() * 900000 + 100000)
        : null,
      redsysOrderId: null,
      paymentMethod: mockBody.authorized ? 'card' : null,
      rawPayload: { ...mockBody, simulated: true },
      signatureValid: null,
      source: 'mock',
      merchantParamsHash: null,
    }
  }

  // Redsys: form-urlencoded.
  const form = new URLSearchParams(rawBody)
  const Ds_SignatureVersion = form.get('Ds_SignatureVersion') ?? ''
  const Ds_MerchantParameters = form.get('Ds_MerchantParameters') ?? ''
  const Ds_Signature = form.get('Ds_Signature') ?? ''

  if (!Ds_MerchantParameters || !Ds_Signature) {
    console.warn('[redsys-notification] payload sin campos requeridos:', rawBody.slice(0, 200))
    return null
  }

  const config = await loadRedsysConfig(supabase)
  if (config.mode === 'mock') {
    // No deberían llegar webhooks reales en modo mock, pero por seguridad
    // verificamos igual con la clave de test pública.
    console.warn('[redsys-notification] webhook real recibido en modo mock — verificando con clave test')
  }

  const { valid, params } = await verifyRedsysSignature(
    Ds_MerchantParameters,
    Ds_Signature,
    config.secretBase64,
  )

  if (!valid) {
    console.warn('[redsys-notification] firma INVÁLIDA. version:', Ds_SignatureVersion)
  }

  const responseCode = String(params['Ds_Response'] ?? params['DS_RESPONSE'] ?? '')
  const authCode = String(params['Ds_AuthorisationCode'] ?? params['DS_AUTHORISATIONCODE'] ?? '') || null
  const redsysOrderId = String(params['Ds_Order'] ?? params['DS_ORDER'] ?? '') || null

  // B-14: hash determinista del payload firmado para anti-replay.
  const merchantParamsHash = await sha256Hex(Ds_MerchantParameters)

  return {
    authorized: valid && isOkResponseCode(responseCode),
    responseCode,
    authCode,
    redsysOrderId,
    paymentMethod: inferPayMethod(params),
    rawPayload: params,
    signatureValid: valid,
    source: 'redsys',
    merchantParamsHash,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  // Hoisted so catch block can reference them for S-12 error logging.
  let supabase: ReturnType<typeof createClient> | null = null
  let rawBody: string | null = null

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 1. Parsear payload (mock o Redsys). Leemos el body una sola vez.
    const ct = req.headers.get('content-type') ?? ''
    rawBody = await req.text()
    let mockBody: MockBody | null = null
    let orderIdFromMock: string | null = null
    if (ct.includes('application/json')) {
      try {
        mockBody = JSON.parse(rawBody) as MockBody
        orderIdFromMock = mockBody?.__mock ? mockBody.order_id ?? null : null
      } catch (_err) {
        mockBody = null
      }
    }
    const outcome = await parsePayload(ct, rawBody, mockBody, supabase)

    if (!outcome) {
      return jsonError('payload inválido', 400, req)
    }

    // B-14: anti-replay. SOLO se aplica a callbacks Redsys con firma válida.
    // Mock se exime (el simulador interno reusa el mismo order_id sin payload
    // firmado). Si el hash ya existe → callback duplicado → 200 silencioso.
    if (
      outcome.source === 'redsys' &&
      outcome.signatureValid === true &&
      outcome.merchantParamsHash
    ) {
      const { error: dedupErr } = await supabase
        .from('redsys_notification_dedup')
        .insert({
          merchant_params_hash: outcome.merchantParamsHash,
          ds_order: outcome.redsysOrderId,
          ds_response: outcome.responseCode,
        })
      if (dedupErr) {
        // Postgres unique violation → callback ya procesado previamente.
        // (code 23505 / status 409). Cualquier otro error se loguea pero
        // se permite continuar para no romper Redsys.
        const code = (dedupErr as { code?: string }).code
        if (code === '23505') {
          console.log(
            `[${ts()}] duplicate callback ignored · hash=${outcome.merchantParamsHash.slice(0, 12)}...`,
          )
          return jsonOk({ ok: true, duplicate: true }, req)
        }
        console.warn(
          `[${ts()}] redsys_notification_dedup insert error (non-blocking):`,
          dedupErr.message,
        )
      }
    }

    if (outcome.source === 'redsys' && outcome.signatureValid === false) {
      // Log defensivo: aún así guardamos el intento para auditoría.
      await supabase.from('payments_log').insert({
        order_id: null,
        payment_provider: 'redsys',
        operation_type: 'notification',
        redsys_response_code: outcome.responseCode,
        redsys_authorization_code: outcome.authCode,
        redsys_transaction_type: String(outcome.rawPayload['Ds_TransactionType'] ?? ''),
        raw_payload: sanitizeRedsysPayload(outcome.rawPayload),
        signature_valid: false,
      })
      console.warn(`[${ts()}] ✗ redsys-notification firma inválida → 403`)
      return jsonError('forbidden', 403, req)
    }

    // 2. Localizar pedido.
    let order:
      | { id: string; status: string; customer_email: string; order_number: string; total_cents: number }
      | null = null

    if (outcome.source === 'mock' && orderIdFromMock) {
      const { data } = await supabase
        .from('orders')
        .select('id, status, customer_email, order_number, total_cents')
        .eq('id', orderIdFromMock)
        .maybeSingle()
      order = data ?? null
    } else if (outcome.redsysOrderId) {
      const { data } = await supabase
        .from('orders')
        .select('id, status, customer_email, order_number, total_cents')
        .eq('payment_pre_auth_id', outcome.redsysOrderId)
        .maybeSingle()
      order = data ?? null
    }

    if (!order) {
      console.warn(`[${ts()}] order no encontrada · mock=${orderIdFromMock} · redsys=${outcome.redsysOrderId}`)
      // No bloqueamos a Redsys: respondemos 200 igualmente (no reintentar).
      await supabase.from('payments_log').insert({
        order_id: null,
        payment_provider: 'redsys',
        operation_type: 'notification',
        redsys_response_code: outcome.responseCode,
        redsys_authorization_code: outcome.authCode,
        redsys_transaction_type: String(outcome.rawPayload['Ds_TransactionType'] ?? ''),
        raw_payload: sanitizeRedsysPayload({ ...outcome.rawPayload, warning: 'order not found' }),
        signature_valid: outcome.signatureValid,
      })
      return jsonOk({ ignored: true }, req)
    }

    // 3. Idempotencia: si ya está authorized/accepted/rejected/cancelled,
    // solo loguear y devolver 200.
    if (order.status !== 'pending') {
      console.log(`[${ts()}] order ya en estado ${order.status} · ${order.order_number} — log only`)
      await supabase.from('payments_log').insert({
        order_id: order.id,
        payment_provider: 'redsys',
        operation_type: 'notification',
        redsys_response_code: outcome.responseCode,
        redsys_authorization_code: outcome.authCode,
        redsys_transaction_type: String(outcome.rawPayload['Ds_TransactionType'] ?? ''),
        raw_payload: sanitizeRedsysPayload({ ...outcome.rawPayload, note: 'duplicate notification ignored' }),
        signature_valid: outcome.signatureValid,
      })
      return jsonOk({ ok: true, status: order.status }, req)
    }

    // B-13 (S2-B1): validar Ds_Amount contra order.total_cents.
    // Bloquea ataques de modificación del importe (atacante intercepta el form
    // o forja un callback con un Ds_Amount inferior al real). Aplicamos solo a
    // callbacks Redsys con firma válida — el mock no envía Ds_Amount. Ya hemos
    // pasado verificación de firma y deduplicación; cualquier mismatch aquí
    // representa fraude o bug grave.
    if (outcome.source === 'redsys' && outcome.signatureValid === true) {
      const rawAmount = outcome.rawPayload['Ds_Amount'] ?? outcome.rawPayload['DS_AMOUNT']
      const dsAmountCents = parseInt(String(rawAmount ?? '0'), 10)
      if (!Number.isFinite(dsAmountCents) || dsAmountCents !== order.total_cents) {
        console.error(
          `[${ts()}] ✗ redsys-notification AMOUNT MISMATCH · order=${order.order_number} · expected=${order.total_cents}c · received=${dsAmountCents}c`,
        )
        await supabase.from('payments_log').insert({
          order_id: order.id,
          payment_provider: 'redsys',
          operation_type: 'notification',
          redsys_response_code: outcome.responseCode,
          redsys_authorization_code: outcome.authCode,
          redsys_transaction_type: String(outcome.rawPayload['Ds_TransactionType'] ?? ''),
          raw_payload: sanitizeRedsysPayload({
            ...outcome.rawPayload,
            warning: 'amount_mismatch',
            expected_cents: order.total_cents,
            received_cents: dsAmountCents,
          }),
          signature_valid: true,
        })
        return jsonError('amount mismatch', 400, req)
      }
    }

    // 4. Decidir nuevo status.
    const nextStatus = outcome.authorized ? 'authorized' : 'payment_failed'
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
    }
    if (outcome.authorized) {
      updatePayload.payment_pre_auth_at = new Date().toISOString()
      if (outcome.paymentMethod) updatePayload.payment_method = outcome.paymentMethod
    }

    // B-05: optimistic lock — solo actualiza si sigue en 'pending'. Si otro
    // proceso ya transitó el estado, count=0 y la idempotencia previa nos
    // protege (ya verificamos status !== 'pending' arriba), pero esta línea
    // cierra la ventana de race entre el SELECT y el UPDATE.
    const { error: uErr, count: uCount } = await supabase
      .from('orders')
      .update(updatePayload, { count: 'exact' })
      .eq('id', order.id)
      .eq('status', 'pending')
    if (uErr) {
      console.error(`[${ts()}] update order error:`, uErr.message)
      return jsonError(uErr.message, 500, req)
    }
    if (uCount === 0) {
      console.warn(
        `[${ts()}] redsys-notification race · ${order.order_number} · estado cambió entre SELECT y UPDATE — log only`,
      )
      // Loguea la notificación duplicada y devuelve 200 (Redsys no debe reintentar).
      await supabase.from('payments_log').insert({
        order_id: order.id,
        payment_provider: outcome.source === 'mock' ? 'mock' : 'redsys',
        operation_type: 'notification',
        redsys_response_code: outcome.responseCode,
        redsys_authorization_code: outcome.authCode,
        redsys_transaction_type: String(outcome.rawPayload['Ds_TransactionType'] ?? '1'),
        raw_payload: sanitizeRedsysPayload({ ...outcome.rawPayload, note: 'race lost — no update applied' }),
        signature_valid: outcome.signatureValid,
      })
      return jsonOk({ ok: true, status: 'race_lost' }, req)
    }

    // 5. Log + history.
    await supabase.from('payments_log').insert({
      order_id: order.id,
      payment_provider: outcome.source === 'mock' ? 'mock' : 'redsys',
      operation_type: 'notification',
      redsys_response_code: outcome.responseCode,
      redsys_authorization_code: outcome.authCode,
      redsys_transaction_type: String(outcome.rawPayload['Ds_TransactionType'] ?? '1'),
      raw_payload: sanitizeRedsysPayload(outcome.rawPayload),
      signature_valid: outcome.signatureValid,
    })

    await supabase.from('order_status_history').insert({
      order_id: order.id,
      from_status: 'pending',
      to_status: nextStatus,
      reason: outcome.authorized
        ? `Redsys ${outcome.source} pre-auth OK (${outcome.responseCode})`
        : `Redsys ${outcome.source} rechazó pago (${outcome.responseCode})`,
    })

    // 6. Emails (solo si autorizado).
    if (outcome.authorized) {
      // Disparamos en paralelo. No bloqueamos respuesta si fallan: el admin
      // puede reenviar manualmente desde el panel.
      const emailJobs = [
        supabase.functions.invoke('send-order-confirmation-customer', {
          body: { order_id: order.id },
          headers: internalSecretHeader(),
        }),
        supabase.functions.invoke('send-order-new-admin', {
          body: { order_id: order.id },
          headers: internalSecretHeader(),
        }),
      ]
      const results = await Promise.allSettled(emailJobs)
      for (const r of results) {
        if (r.status === 'rejected') {
          console.warn(`[${ts()}] email job failed:`, String(r.reason))
        }
      }
    }

    console.log(
      `[${ts()}] ✓ redsys-notification · ${order.order_number} · ${outcome.source} · ${nextStatus}`,
    )
    return jsonOk({ ok: true, status: nextStatus }, req)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[${ts()}] ✗ redsys-notification FATAL:`, errMsg)

    // S-12: persistir en payments_log con operation_type='notification' + warning flag.
    // (El CHECK constraint solo permite preauth/capture/cancel/refund/notification.)
    if (supabase) {
      try {
        await supabase.from('payments_log').insert({
          order_id: null,
          payment_provider: 'redsys',
          operation_type: 'notification',
          raw_payload: {
            warning: 'fatal_error',
            error_message: errMsg.slice(0, 500),
            body_preview: rawBody != null ? rawBody.slice(0, 1000) : null,
          },
          signature_valid: null,
        })
      } catch (logErr) {
        console.error(`[${ts()}] payments_log insert failed:`, String(logErr))
      }
    }

    // S-12: alerta DPO best-effort (no bloquea la respuesta 200 a Redsys).
    if (supabase) {
      try {
        const alertSettings = await getSettings(supabase, ['dpo_contact_email', 'store_contact_email'])
        const alertTo =
          asString(alertSettings.dpo_contact_email).trim() ||
          asString(alertSettings.store_contact_email).trim()
        if (alertTo) {
          await sendViaResend({
            from: buildFromAddress(),
            to: [alertTo],
            subject: '[ALERTA] Error fatal en redsys-notification',
            html: `<p>Error fatal procesando notificación Redsys. Revisar <code>payments_log</code> (warning=fatal_error) para detalles.</p><pre style="background:#f5f5f5;padding:12px;font-size:12px">${escapeHtml(errMsg.slice(0, 500))}</pre><p>Este mensaje es automático. <strong>Verificar que el pago no quedó en estado inconsistente.</strong></p>`,
          })
        }
      } catch {
        // Alerta best-effort — no propagar
      }
    }

    // Redsys necesita 200 OK para no reintentar indefinidamente.
    return jsonOk({ ok: false }, req)
  }
})
