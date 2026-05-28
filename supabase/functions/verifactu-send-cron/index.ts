// supabase/functions/verifactu-send-cron/index.ts
//
// Auditoría legal V5 · Sprint 3 · B-22 — SKELETON.
//
// Cron de envío de facturas a la AEAT (Verifactu · RD 1007/2023). El envío
// SOAP real está APLAZADO por decisión del titular (2026-05-27): se activará
// cuando contrate asesoría fiscal y cambie el setting `verifactu_mode` a
// 'verifactu'. Mientras el gate esté en 'no_verifactu', este cron no realiza
// ninguna mutación y responde { skipped: true }.
//
// Auth:
//   - Header `Authorization: Bearer <CRON_SECRET>` obligatorio.
//   - Comparación en tiempo constante con `timingSafeEq()` (anti timing
//     side-channel) — mismo helper que el resto de secretos del proyecto.
//
// Estados de envío (columna invoices.verifactu_status — migración 0050):
//   disabled | pending | sent | failed | retired
//
// Flujo futuro (cuando verifactu_mode='verifactu'):
//   1. Seleccionar invoices con verifactu_status='pending'.
//   2. Construir el XML SOAP del registro de facturación + firma XAdES.
//   3. POST al endpoint SOAP de la AEAT.
//   4. Persistir verifactu_response_xml, verifactu_sent_at y mover
//      verifactu_status a 'sent' o 'failed' según la respuesta.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { jsonError, jsonOk, corsPreflightResponse, getSettings } from '../_shared/email-utils.ts'
import { timingSafeEq } from '../_shared/security.ts'

function authorize(req: Request): { ok: boolean; reason?: string } {
  const expected = Deno.env.get('CRON_SECRET') ?? ''
  if (!expected) {
    // Fail-closed: sin secreto configurado no se autoriza ninguna ejecución.
    return { ok: false, reason: 'CRON_SECRET env var no configurada' }
  }
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
  if (!timingSafeEq(token, expected)) {
    return { ok: false, reason: 'invalid bearer' }
  }
  return { ok: true }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const auth = authorize(req)
    if (!auth.ok) {
      console.warn(`[${ts()}] verifactu-send-cron unauthorized:`, auth.reason)
      return jsonError('unauthorized', 401, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const settings = await getSettings(supabase, ['verifactu_mode'])
    const verifactuMode =
      typeof settings.verifactu_mode === 'string'
        ? settings.verifactu_mode.trim().toLowerCase()
        : 'no_verifactu'

    // Gate cerrado: el envío real a la AEAT está aplazado.
    if (verifactuMode !== 'verifactu') {
      console.log(`[${ts()}] verifactu-send-cron · gate cerrado (verifactu_mode=${verifactuMode}) — sin envío`)
      return jsonOk({ skipped: true, reason: 'verifactu_mode is not active' }, req)
    }

    // ─────────────────────────────────────────────────────────────
    // TODO (fase futura · gate 'verifactu' activo): integración SOAP AEAT.
    //
    //   const { data: pending } = await supabase
    //     .from('invoices')
    //     .select('id, invoice_number, hash, previous_hash, qr_payload')
    //     .eq('verifactu_status', 'pending')
    //     .order('issued_at', { ascending: true })
    //     .limit(50)
    //
    //   for (const inv of pending ?? []) {
    //     1. const soapXml = buildVerifactuSoapEnvelope(inv)           // RegistroFacturacionAlta
    //     2. const signedXml = await signXAdES(soapXml, certPem, keyPem) // firma cualificada
    //     3. const res = await fetch(AEAT_SOAP_ENDPOINT, { method: 'POST', headers: {...}, body: signedXml })
    //     4. const responseXml = await res.text()
    //     5. const ok = parseAeatAck(responseXml)
    //     6. await supabase.from('invoices').update({
    //          verifactu_status: ok ? 'sent' : 'failed',
    //          verifactu_sent_at: new Date().toISOString(),
    //          verifactu_response_xml: responseXml,
    //        }).eq('id', inv.id)
    //   }
    // ─────────────────────────────────────────────────────────────

    console.log(`[${ts()}] verifactu-send-cron · gate abierto pero envío SOAP no implementado (skeleton)`)
    return jsonOk({ ok: true, mode: 'verifactu', sent: 0, note: 'SOAP AEAT no implementado (skeleton)' }, req)
  } catch (err) {
    console.error(`[${ts()}] FAIL verifactu-send-cron fatal:`, String(err))
    return jsonError('internal error', 500, req)
  }
})
