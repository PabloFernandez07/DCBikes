// supabase/functions/verifactu-cert-upload/index.ts
//
// Subida/gestión del certificado digital del autónomo para Verifactu (envío de
// facturas a la AEAT). La invoca el admin desde Settings con su JWT.
//
//   GET  → estado actual { configured, filename, uploaded_at, nif }
//   POST → sube/reemplaza el certificado:
//          { cert_base64, filename, password, nif? }
//   DELETE → elimina el certificado configurado
//
// El certificado (.p12/.pfx) y su contraseña son MUY sensibles (permiten firmar
// en nombre del titular ante Hacienda). Por eso:
//   - NO se exponen al frontend: el admin los envía y aquí se guardan con
//     service_role en un bucket PRIVADO ('certificates'), nunca accesible
//     públicamente ni vía RLS de cliente.
//   - La contraseña se guarda como objeto separado en el mismo bucket privado.
//   - En settings solo se guardan METADATOS no sensibles (nombre de archivo,
//     fecha, NIF) para mostrar el estado en el admin.
//
// El uso real (firma + envío SOAP/REST a la AEAT) lo hará la integración
// Verifactu, que leerá ambos del bucket con service_role.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders, corsPreflightResponse, jsonError, jsonOk } from '../_shared/email-utils.ts'

const BUCKET = 'certificates'
const CERT_PATH = 'verifactu/cert.p12'
const PWD_PATH = 'verifactu/password'

// Verifica que el caller es un admin vivo (mismo patrón que send-reply-email).
async function requireAdmin(req: Request, supabase: SupabaseClient): Promise<boolean> {
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.toLowerCase().startsWith('bearer ')) return false
  const jwt = authHeader.slice(7).trim()
  const { data: userData, error } = await supabase.auth.getUser(jwt)
  if (error || !userData?.user) return false
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  return !!adminRow
}

async function upsertSetting(supabase: SupabaseClient, key: string, value: unknown) {
  await supabase.from('settings').upsert({ key, value: JSON.stringify(value) })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()
  const cors = buildCorsHeaders(req)

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (!(await requireAdmin(req, supabase))) {
      return jsonError('forbidden', 403, req)
    }

    // ─── Estado actual ───
    if (req.method === 'GET') {
      const { data } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', ['verifactu_cert_filename', 'verifactu_cert_uploaded_at', 'verifactu_cert_nif'])
      const map: Record<string, string> = {}
      for (const row of data ?? []) {
        try {
          map[row.key] = JSON.parse(row.value as string)
        } catch {
          map[row.key] = String(row.value ?? '')
        }
      }
      return jsonOk(
        {
          configured: !!map.verifactu_cert_uploaded_at,
          filename: map.verifactu_cert_filename ?? null,
          uploaded_at: map.verifactu_cert_uploaded_at ?? null,
          nif: map.verifactu_cert_nif ?? null,
        },
        req,
      )
    }

    // ─── Eliminar certificado ───
    if (req.method === 'DELETE') {
      await supabase.storage.from(BUCKET).remove([CERT_PATH, PWD_PATH])
      await upsertSetting(supabase, 'verifactu_cert_filename', '')
      await upsertSetting(supabase, 'verifactu_cert_uploaded_at', '')
      await upsertSetting(supabase, 'verifactu_cert_nif', '')
      console.log(`[${ts()}] verifactu-cert-upload: certificado eliminado`)
      return jsonOk({ configured: false }, req)
    }

    // ─── Subir / reemplazar ───
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as {
      cert_base64?: string
      filename?: string
      password?: string
      nif?: string
    }

    const certB64 = (body.cert_base64 ?? '').replace(/^data:[^;]+;base64,/, '')
    const password = body.password ?? ''
    const filename = (body.filename ?? 'cert.p12').trim()
    const nif = (body.nif ?? '').trim().toUpperCase()

    if (!certB64) return jsonError('Falta el archivo del certificado.', 400, req)
    if (!password) return jsonError('Falta la contraseña del certificado.', 400, req)
    if (!/\.(p12|pfx)$/i.test(filename)) {
      return jsonError('El certificado debe ser un archivo .p12 o .pfx.', 400, req)
    }

    // Decodifica base64 → bytes.
    let bytes: Uint8Array
    try {
      const bin = atob(certB64)
      bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    } catch {
      return jsonError('El archivo del certificado no es válido (base64).', 400, req)
    }
    // Límite defensivo de tamaño (un .p12 normal pesa < 50 KB).
    if (bytes.length === 0 || bytes.length > 512 * 1024) {
      return jsonError('Tamaño de certificado no válido.', 400, req)
    }

    const up1 = await supabase.storage
      .from(BUCKET)
      .upload(CERT_PATH, bytes, { contentType: 'application/x-pkcs12', upsert: true })
    if (up1.error) {
      console.error(`[${ts()}] verifactu-cert-upload: error subiendo cert:`, up1.error.message)
      return jsonError('No se pudo guardar el certificado.', 500, req)
    }

    const up2 = await supabase.storage
      .from(BUCKET)
      .upload(PWD_PATH, new TextEncoder().encode(password), {
        contentType: 'text/plain',
        upsert: true,
      })
    if (up2.error) {
      // Rollback del certificado para no dejar estado inconsistente.
      await supabase.storage.from(BUCKET).remove([CERT_PATH]).catch(() => {})
      console.error(`[${ts()}] verifactu-cert-upload: error guardando contraseña:`, up2.error.message)
      return jsonError('No se pudo guardar la contraseña del certificado.', 500, req)
    }

    const uploadedAt = new Date().toISOString()
    await upsertSetting(supabase, 'verifactu_cert_filename', filename)
    await upsertSetting(supabase, 'verifactu_cert_uploaded_at', uploadedAt)
    await upsertSetting(supabase, 'verifactu_cert_nif', nif)

    console.log(`[${ts()}] ✓ verifactu-cert-upload: certificado guardado (${filename})`)
    return jsonOk({ configured: true, filename, uploaded_at: uploadedAt, nif }, req)
  } catch (err) {
    console.error(`[${ts()}] ✗ verifactu-cert-upload:`, String(err))
    return new Response(JSON.stringify({ ok: false, error: 'error interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
    })
  }
})
