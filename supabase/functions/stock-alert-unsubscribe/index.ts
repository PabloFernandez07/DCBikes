// supabase/functions/stock-alert-unsubscribe/index.ts
//
// Baja de suscripción de alerta de stock. Pública (sin JWT).
// Acepta el token de baja tanto en el body JSON como en query string (?token=).
//
// Contrato de respuesta (el frontend depende de esto):
//   200 → { ok: true }               (baja procesada o ya revocada — idempotente)
//   400 → { ok: false, error }       (token ausente o inválido)
//   500 → error interno
//
// La operación es idempotente: si el token ya está revocado (revoked_at IS NOT NULL),
// devuelve { ok: true } igualmente sin modificar nada.
//
// CORS dinámico (buildCorsHeaders). Acepta GET y POST para facilitar
// el uso desde el enlace del email (GET con ?token=) y desde el frontend (POST).
//
// Variables de entorno necesarias:
//   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsPreflightResponse,
  buildCorsHeaders,
} from '../_shared/email-utils.ts'

// Helper interno para respuestas JSON con CORS dinámico
function jsonRes(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
  })
}

Deno.serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)

  const ts = () => new Date().toISOString()

  // Acepta GET (enlace email) y POST (llamada frontend)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: buildCorsHeaders(req) })
  }

  // Extraer token: query string (?token=) o body JSON { token }
  let token: string | null = null

  if (req.method === 'GET') {
    const url = new URL(req.url)
    token = url.searchParams.get('token')
  } else {
    // POST: intentar leer body JSON
    try {
      const body = (await req.json().catch(() => ({}))) as { token?: string }
      token = body.token ?? null
      // Fallback: si no hay body JSON, intentar query string también en POST
      if (!token) {
        const url = new URL(req.url)
        token = url.searchParams.get('token')
      }
    } catch {
      const url = new URL(req.url)
      token = url.searchParams.get('token')
    }
  }

  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return jsonRes({ ok: false, error: 'token de baja requerido' }, 400, req)
  }

  // Validación básica de formato (64 chars hex, como los generados por generateUnsubscribeToken)
  const cleanToken = token.trim()
  if (!/^[0-9a-f]{64}$/i.test(cleanToken)) {
    return jsonRes({ ok: false, error: 'token de baja inválido' }, 400, req)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // UPDATE idempotente: solo actúa si revoked_at IS NULL.
  // Si el token no existe o ya está revocado, count=0 y devolvemos ok igualmente.
  const { data, error: updateErr } = await supabase
    .from('stock_alerts')
    .update({ revoked_at: new Date().toISOString() })
    .eq('unsubscribe_token', cleanToken)
    .is('revoked_at', null)
    .select('id')

  if (updateErr) {
    console.error(`[${ts()}] stock-alert-unsubscribe: error BD:`, updateErr.message)
    return jsonRes({ ok: false, error: 'error de base de datos' }, 500, req)
  }

  const affected = (data ?? []).length
  if (affected > 0) {
    console.log(`[${ts()}] stock-alert-unsubscribe: baja procesada — token=***${cleanToken.slice(-8)}`)
  } else {
    // Token no encontrado o ya revocado — idempotente, igual ok
    console.log(`[${ts()}] stock-alert-unsubscribe: token ya revocado o no encontrado — idempotente`)
  }

  return jsonRes({ ok: true }, 200, req)
})
