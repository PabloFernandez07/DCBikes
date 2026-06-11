// supabase/functions/customer-data-export/index.ts
//
// X-10 (auditoría legal V5) — Endpoint de portabilidad RGPD art. 15/art. 20.
//
// Permite a un cliente identificado por su magic-link descargar una copia
// completa en JSON de todos sus datos personales tratados por DC Bikes:
//   - orders (todos los campos)
//   - order_items asociados
//   - quote_requests con su email
//   - consent_audit (registros de consentimientos otorgados/revocados)
//   - customer_sessions (datos no sensibles)
//   - stock_alerts con su email (M-7; sin unsubscribe_token)
//   - data_subject_requests (M-7; sus solicitudes de derechos previas)
//
// Registra el ejercicio del derecho en `data_subject_requests` para
// poder evidenciarlo ante la AEPD si fuese requerido.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import {
  buildCorsHeaders,
  corsPreflightResponse,
  jsonError,
  maskEmail,
} from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'

interface SessionRow {
  id: string
  created_at: string
  expires_at: string
  ip_address: string | null
  user_agent: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return jsonError('method not allowed', 405, req)
    }

    // M-7 (auditoría 2026-06-11): el token se acepta PREFERENTEMENTE por
    // header `Authorization: Bearer <token>` (no aparece en logs de acceso,
    // historial del navegador ni en cabeceras Referer). El regex de 64 hex
    // evita confundirlo con el JWT anon que inyecta supabase.functions.invoke.
    let token: string | null = null
    const auth = req.headers.get('authorization') ?? ''
    const m = auth.match(/^Bearer\s+([0-9a-f]{64})$/i)
    if (m) token = m[1]

    // Compatibilidad: token en body POST (uso actual del frontend
    // MyOrdersSession.tsx vía supabase.functions.invoke con body { token }).
    if (!token && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { token?: string }
      token = body.token ?? null
    }

    // DEPRECADO (M-7): token por querystring en GET. Un token de sesión en la
    // URL queda persistido en logs/historial/Referer. Se mantiene de momento
    // para no romper enlaces antiguos, pero NO debe usarse en código nuevo —
    // eliminar cuando se confirme que ningún cliente lo utiliza.
    if (!token && req.method === 'GET') {
      token = new URL(req.url).searchParams.get('token')
    }

    if (!token) return jsonError('token requerido', 400, req)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const session = await verifyCustomerSession(supabase, token)
    if (!session) {
      console.warn(`[${ts()}] customer-data-export forbidden · invalid session`)
      return jsonError('Sesión expirada o inválida', 401, req)
    }

    const masked = maskEmail(session.email)

    // 1) Orders del cliente (todos los campos relevantes).
    const { data: ordersData, error: oErr } = await supabase
      .from('orders')
      .select('*')
      .eq('customer_email', session.email)
      .order('created_at', { ascending: false })

    if (oErr) {
      console.error(`[${ts()}] data-export orders error · ${masked}:`, oErr.message)
      return jsonError('error leyendo pedidos', 500, req)
    }

    const orders = ordersData ?? []
    const orderIds = orders.map((o) => (o as { id: string }).id)

    // 2) Order items de esos pedidos.
    let orderItems: unknown[] = []
    if (orderIds.length > 0) {
      const { data: itemsData, error: iErr } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds)

      if (iErr) {
        console.error(`[${ts()}] data-export items error · ${masked}:`, iErr.message)
        return jsonError('error leyendo items', 500, req)
      }
      orderItems = itemsData ?? []
    }

    // 3) Quote requests.
    const { data: quotesData, error: qErr } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('email', session.email)
      .order('created_at', { ascending: false })

    if (qErr) {
      console.error(`[${ts()}] data-export quotes error · ${masked}:`, qErr.message)
      return jsonError('error leyendo solicitudes', 500, req)
    }

    // 4) Consent audit (defensivo: tabla nueva — si no existe aún, array vacío).
    let consentAudit: unknown[] = []
    try {
      const { data: consentData, error: cErr } = await supabase
        .from('consent_audit')
        .select('*')
        .eq('customer_email', session.email)
        .order('created_at', { ascending: false })

      if (cErr) {
        // Probable: relación inexistente todavía (PGRST205) o RLS. Loguea y continúa.
        console.warn(
          `[${ts()}] data-export consent_audit unavailable · ${masked}: ${cErr.message}`,
        )
      } else {
        consentAudit = consentData ?? []
      }
    } catch (err) {
      console.warn(`[${ts()}] data-export consent_audit exception · ${masked}:`, String(err))
    }

    // 5) Customer sessions (solo columnas no sensibles).
    const { data: sessionsData, error: sErr } = await supabase
      .from('customer_sessions')
      .select('id, created_at, expires_at, ip_address, user_agent')
      .eq('email', session.email)
      .order('created_at', { ascending: false })

    if (sErr) {
      console.error(`[${ts()}] data-export sessions error · ${masked}:`, sErr.message)
      return jsonError('error leyendo sesiones', 500, req)
    }

    const sessions: SessionRow[] = (sessionsData ?? []) as SessionRow[]

    // 5b) M-7: stock_alerts del interesado ("Avísame cuando esté disponible").
    // Se excluye unsubscribe_token: es un secreto operativo, no un dato
    // personal — exponerlo permitiría revocar la alerta a quien intercepte
    // el export.
    let stockAlerts: unknown[] = []
    try {
      const { data: alertsData, error: aErr } = await supabase
        .from('stock_alerts')
        .select(
          'id, product_id, email, consent_ip, consent_user_agent, consent_at, consent_version, created_at, notified_at, revoked_at, purged_at',
        )
        .eq('email', session.email)
        .order('created_at', { ascending: false })
      if (aErr) {
        console.warn(`[${ts()}] data-export stock_alerts unavailable · ${masked}: ${aErr.message}`)
      } else {
        stockAlerts = alertsData ?? []
      }
    } catch (err) {
      console.warn(`[${ts()}] data-export stock_alerts exception · ${masked}:`, String(err))
    }

    // 5c) M-7: solicitudes de derechos RGPD previas del interesado
    // (data_subject_requests) — forman parte de sus datos tratados (art. 15).
    let dsrHistory: unknown[] = []
    try {
      const { data: dsrData, error: dErr } = await supabase
        .from('data_subject_requests')
        .select('*')
        .eq('requester_email', session.email)
        .order('request_received_at', { ascending: false })
      if (dErr) {
        console.warn(`[${ts()}] data-export DSR history unavailable · ${masked}: ${dErr.message}`)
      } else {
        dsrHistory = dsrData ?? []
      }
    } catch (err) {
      console.warn(`[${ts()}] data-export DSR history exception · ${masked}:`, String(err))
    }

    // 6) Registro del ejercicio del derecho (defensivo: tabla puede no existir aún).
    try {
      const { error: dsrErr } = await supabase.from('data_subject_requests').insert({
        type: 'access',
        requester_email: session.email,
        status: 'fulfilled',
        resolved_at: new Date().toISOString(),
      })
      if (dsrErr) {
        console.warn(
          `[${ts()}] data-export DSR insert skipped · ${masked}: ${dsrErr.message}`,
        )
      }
    } catch (err) {
      console.warn(`[${ts()}] data-export DSR insert exception · ${masked}:`, String(err))
    }

    const payload = {
      exported_at: new Date().toISOString(),
      customer_email: session.email,
      orders,
      order_items: orderItems,
      quote_requests: quotesData ?? [],
      consent_audit: consentAudit,
      sessions,
      stock_alerts: stockAlerts,
      data_subject_requests: dsrHistory,
    }

    console.log(
      `[${ts()}] ✓ data-export · ${masked} · orders=${orders.length} · items=${orderItems.length} · quotes=${(quotesData ?? []).length} · consent=${consentAudit.length} · sessions=${sessions.length} · stock_alerts=${stockAlerts.length} · dsr=${dsrHistory.length}`,
    )

    const cors = buildCorsHeaders(req)
    return new Response(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="mis-datos-dcbikes.json"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[${ts()}] ✗ customer-data-export:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
