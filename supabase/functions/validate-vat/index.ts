// supabase/functions/validate-vat/index.ts
//
// Auditoría legal V5 · Sprint 3 · X-08
//
// Valida un NIF-IVA intracomunitario contra el servicio VIES de la Comisión
// Europea (SOAP) para operaciones B2B. Público (sin auth) con rate-limit
// 10 req/h/IP en la tabla `validate_vat_rate` (migración 0049).
//
// Petición:
//   POST { country_code: "ES", vat_number: "B12345678" }
//   (vat_number SIN el prefijo de país; country_code es el prefijo ISO)
//
// Respuestas:
//   200 → { valid: boolean, name: string|null, address: string|null }
//   400 → input inválido
//   429 → rate-limit superado (>10 req/h/IP)
//   502 → VIES no disponible / respondió error transitorio
//   500 → error interno
//
// Nota: VIES solo confirma la VALIDEZ del NIF-IVA a efectos de operaciones
// intracomunitarias. No es una validación de letra de control nacional (eso
// ya lo hace `isValidSpanishId` en el frontend). El nombre/dirección llegan
// vacíos si el Estado miembro no los publica.

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonError, jsonOk, corsPreflightResponse } from '../_shared/email-utils.ts'

const VIES_ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/services/checkVatService'
const MAX_PER_HOUR = 10

// Estados miembro de la UE (prefijos ISO usados por VIES; "EL" para Grecia).
const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK', 'XI',
])

interface ValidateVatBody {
  country_code?: string
  vat_number?: string
}

function clientIp(req: Request): string {
  const cf = (req.headers.get('cf-connecting-ip') ?? '').trim()
  if (cf) return cf.slice(0, 64)
  const xff = (req.headers.get('x-forwarded-for') ?? '').trim()
  if (xff) return xff.split(',')[0].trim().slice(0, 64)
  return 'unknown'
}

interface RateLimitResult {
  allowed: boolean
  count: number
}

/**
 * Rate-limit por IP/hora en tabla `validate_vat_rate`.
 * Bucket alineado a la hora UTC; PK=(ip_address, bucket_hour) serializa
 * requests concurrentes de la misma IP en la misma hora.
 * Política fail-open: ante error de tabla NO bloqueamos (degradación suave).
 */
async function checkRateLimit(
  supabase: SupabaseClient,
  ip: string,
): Promise<RateLimitResult> {
  const now = new Date()
  const bucket = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    0,
    0,
    0,
  )).toISOString()

  const { error: insErr } = await supabase
    .from('validate_vat_rate')
    .insert({ ip_address: ip, bucket_hour: bucket, request_count: 1 })

  if (!insErr) return { allowed: true, count: 1 }

  const code = (insErr as { code?: string }).code
  if (code !== '23505') {
    console.warn('[validate-vat] rate-limit insert error:', insErr.message)
    return { allowed: true, count: 0 }
  }

  const { data: row, error: selErr } = await supabase
    .from('validate_vat_rate')
    .select('request_count')
    .eq('ip_address', ip)
    .eq('bucket_hour', bucket)
    .maybeSingle()

  if (selErr || !row) {
    console.warn('[validate-vat] rate-limit select error:', selErr?.message)
    return { allowed: true, count: 0 }
  }

  const nextCount = (row.request_count ?? 0) + 1
  const { error: updErr } = await supabase
    .from('validate_vat_rate')
    .update({ request_count: nextCount })
    .eq('ip_address', ip)
    .eq('bucket_hour', bucket)

  if (updErr) {
    console.warn('[validate-vat] rate-limit update error:', updErr.message)
    return { allowed: true, count: nextCount }
  }

  return { allowed: nextCount <= MAX_PER_HOUR, count: nextCount }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function buildSoapEnvelope(countryCode: string, vatNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:checkVat>
      <urn:countryCode>${escapeXml(countryCode)}</urn:countryCode>
      <urn:vatNumber>${escapeXml(vatNumber)}</urn:vatNumber>
    </urn:checkVat>
  </soapenv:Body>
</soapenv:Envelope>`
}

/** Extrae el contenido de la primera etiqueta `<tag>...</tag>` (sin namespaces). */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[a-zA-Z0-9]+:)?${tag}>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?${tag}>`)
  const m = xml.match(re)
  return m ? m[1].trim() : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)
  const ts = () => new Date().toISOString()

  try {
    if (req.method !== 'POST') return jsonError('method not allowed', 405, req)

    const body = (await req.json().catch(() => ({}))) as ValidateVatBody
    const countryCode = (body.country_code ?? '').toString().trim().toUpperCase()
    const vatNumber = (body.vat_number ?? '')
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[\s-]/g, '')

    if (!countryCode || !EU_COUNTRY_CODES.has(countryCode)) {
      return jsonError('country_code no válido (estado miembro UE)', 400, req)
    }
    if (!vatNumber || !/^[A-Z0-9]{2,12}$/.test(vatNumber)) {
      return jsonError('vat_number no válido', 400, req)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const ip = clientIp(req)
    const rate = await checkRateLimit(supabase, ip)
    if (!rate.allowed) {
      console.warn(`[${ts()}] validate-vat rate-limit · ip=${ip} · count=${rate.count}`)
      return jsonError('demasiadas peticiones, vuelve a intentarlo en una hora', 429, req)
    }

    // Consulta VIES SOAP. Timeout defensivo: el VIES suele tardar y a veces
    // devuelve MS_UNAVAILABLE / TIMEOUT. En ese caso → 502 (transitorio).
    let viesXml: string
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10_000)
      const res = await fetch(VIES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          SOAPAction: '',
        },
        body: buildSoapEnvelope(countryCode, vatNumber),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      viesXml = await res.text()
      if (!res.ok && !viesXml.includes('checkVatResponse')) {
        console.warn(`[${ts()}] VIES HTTP ${res.status}`)
        return jsonError('servicio VIES no disponible, inténtalo más tarde', 502, req)
      }
    } catch (err) {
      console.warn(`[${ts()}] VIES fetch error:`, String(err))
      return jsonError('servicio VIES no disponible, inténtalo más tarde', 502, req)
    }

    // Faults del VIES (servicio sobrecargado, país inválido a su criterio…).
    if (viesXml.includes('<faultstring>') || viesXml.includes(':Fault>')) {
      const fault = extractTag(viesXml, 'faultstring') ?? 'fault'
      // INVALID_INPUT es input nuestro malformado; el resto son transitorios.
      if (/INVALID_INPUT/i.test(fault)) {
        return jsonError('NIF-IVA con formato no aceptado por VIES', 400, req)
      }
      console.warn(`[${ts()}] VIES fault: ${fault}`)
      return jsonError('servicio VIES no disponible, inténtalo más tarde', 502, req)
    }

    const validRaw = extractTag(viesXml, 'valid')
    const valid = validRaw === 'true'
    const nameRaw = extractTag(viesXml, 'name')
    const addressRaw = extractTag(viesXml, 'address')
    // VIES devuelve "---" cuando el dato no se publica.
    const norm = (v: string | null) => (v && v !== '---' ? v : null)

    return jsonOk(
      {
        valid,
        name: norm(nameRaw),
        address: norm(addressRaw),
      },
      req,
    )
  } catch (err) {
    console.error(`[${ts()}] ✗ validate-vat:`, String(err))
    // SEC-M3: nunca exponer String(err) en el body. Detalle solo en logs.
    return jsonError('error interno', 500, req)
  }
})
