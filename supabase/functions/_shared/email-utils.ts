// supabase/functions/_shared/email-utils.ts
//
// Helpers compartidos por las 7 Edge Functions de email transaccional.
// Formato es-ES, parsing tolerante de settings (string JSON / string raw),
// generación de signed URLs para factura, y helpers HTML.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

/* ─────────────────── CORS ─────────────────── */

// CORS dinámico por origen. Permite solo dominios propios.
const ALLOWED_ORIGINS = new Set<string>([
  'https://dc-bikes-cantabria.vercel.app',
  'https://dcbikescantabria.es',
  'https://www.dcbikescantabria.es',
  'http://localhost:5173',
  'http://localhost:4173',
])

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

/**
 * S-01 auditoría V3: respuesta estándar para preflight OPTIONS con CORS dinámico.
 * Usar en todas las Edge Functions:
 *   if (req.method === 'OPTIONS') return corsPreflightResponse(req)
 */
export function corsPreflightResponse(req: Request): Response {
  return new Response(null, { status: 204, headers: buildCorsHeaders(req) })
}

/**
 * @deprecated Eliminado en S2-B1 (B-09). Usar siempre `buildCorsHeaders(req)`
 * en respuestas con Request disponible. Las funciones que devuelvan respuestas
 * sin Request en scope deben construir CORS estrictos a mano — wildcard '*' ya
 * no es aceptable. Mantenido como objeto vacío para evitar romper imports
 * legacy hasta que se completen Sprint 2/3.
 */
export const CORS_HEADERS: Record<string, string> = {}

/**
 * Returns a 200 JSON response. Always pass `req` — sin él la respuesta NO
 * incluirá cabeceras CORS (B-09: prohibido wildcard '*').
 */
export function jsonOk(data: Record<string, unknown>, req?: Request): Response {
  const corsHeaders = req ? buildCorsHeaders(req) : {}
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/**
 * Returns an error JSON response. Always pass `req` — sin él la respuesta NO
 * incluirá cabeceras CORS (B-09: prohibido wildcard '*').
 */
export function jsonError(message: string, status = 500, req?: Request): Response {
  const corsHeaders = req ? buildCorsHeaders(req) : {}
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

/* ─────────────────── PII masking (S-10) ─────────────────── */

/**
 * S-10 (auditoría legal V3): enmascara email para logs.
 * Ejemplo: "user@example.com" → "u***@example.com"
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '<empty>'
  const at = email.indexOf('@')
  if (at < 1) return '<invalid>'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const visible = local.charAt(0)
  return `${visible}${'*'.repeat(Math.max(2, local.length - 1))}@${domain}`
}

/**
 * S-10: enmascara IP para logs.
 * IPv4: 192.168.1.42 → 192.168.1.x
 * IPv6: trunca a primeros 3 bloques
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip || ip === 'unknown') return '<unknown>'
  if (ip.includes(':')) {
    // IPv6: queda primeros 3 bloques
    const parts = ip.split(':')
    return parts.slice(0, 3).join(':') + ':xxxx'
  }
  const parts = ip.split('.')
  if (parts.length !== 4) return '<malformed>'
  return parts.slice(0, 3).join('.') + '.x'
}

/* ─────────────────── Formatters ─────────────────── */

/** 690 → "6,90 €" · 5000 → "50,00 €" */
export function formatPriceCents(cents: number | null | undefined): string {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents / 100 : 0
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** ISO → "26 de mayo de 2026" */
export function formatDateES(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** ISO → "26/05/2026 14:32" para timestamps de auditoría */
export function formatDateTimeES(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Escape HTML para inyectar valores controlados por usuario en plantilla */
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* ─────────────────── Tabla de items ─────────────────── */

export interface OrderItemRow {
  product_name: string
  product_size_label?: string | null
  quantity: number
  unit_price_cents: number
  line_total_cents: number
}

/** Tabla HTML inline con resumen de líneas del pedido. */
export function formatItemsTable(items: OrderItemRow[]): string {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;vertical-align:top">
          ${escapeHtml(it.product_name)}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555;text-align:center;white-space:nowrap">
          ${it.product_size_label ? escapeHtml(it.product_size_label) : '—'}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555;text-align:center;white-space:nowrap">
          ${escapeHtml(String(it.quantity))}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#555;text-align:right;white-space:nowrap">
          ${escapeHtml(formatPriceCents(it.unit_price_cents))}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eeeeee;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;font-weight:600;white-space:nowrap">
          ${escapeHtml(formatPriceCents(it.line_total_cents))}
        </td>
      </tr>`,
    )
    .join('')

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:8px 0 16px 0">
      <thead>
        <tr>
          <th align="left" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Producto</th>
          <th align="center" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Talla</th>
          <th align="center" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Cant.</th>
          <th align="right" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">PVP</th>
          <th align="right" style="padding:10px 8px;background-color:#f8f5ff;border-bottom:2px solid #C4A2CF;font-family:Arial,Helvetica,sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#666;font-weight:600">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

/** Bloque de totales (subtotal · envío · total) */
export function formatTotalsBlock(opts: {
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
}): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 24px 0">
      <tr>
        <td style="padding:6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666">Subtotal (IVA incluido)</td>
        <td style="padding:6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;white-space:nowrap">
          ${formatPriceCents(opts.subtotal_cents)}
        </td>
      </tr>
      <tr>
        <td style="padding:6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#666">Envío</td>
        <td style="padding:6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;text-align:right;white-space:nowrap">
          ${opts.shipping_cents === 0 ? '<span style="color:#2a7d3a;font-weight:600">Gratis</span>' : formatPriceCents(opts.shipping_cents)}
        </td>
      </tr>
      <tr>
        <td style="padding:12px 8px 6px 8px;border-top:2px solid #0F0F12;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#0F0F12;font-weight:700">Total</td>
        <td style="padding:12px 8px 6px 8px;border-top:2px solid #0F0F12;font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#0F0F12;text-align:right;font-weight:700;white-space:nowrap">
          ${formatPriceCents(opts.total_cents)}
        </td>
      </tr>
    </table>`
}

/* ─────────────────── Storage / Factura ─────────────────── */

/**
 * Devuelve la signed URL del PDF de factura asociado al pedido.
 * Devuelve null si no existe factura todavía o el bucket falla.
 *
 * S-05 (auditoría legal V3): TTL default 1h (era 7d). Pasar TTL explícito en
 * cada caller cuando se requiera más. Nunca usar en cuerpo de emails — el PDF
 * se adjunta directamente; para navegador, redirigir a /mis-pedidos.
 */
export async function getSignedInvoiceUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 3600,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('invoices')
      .createSignedUrl(storagePath, expiresInSeconds)
    if (error || !data?.signedUrl) {
      console.warn('[email-utils] getSignedInvoiceUrl error:', error?.message)
      return null
    }
    return data.signedUrl
  } catch (err) {
    console.warn('[email-utils] getSignedInvoiceUrl exception:', String(err))
    return null
  }
}

/**
 * Descarga el PDF de la factura como Uint8Array (para attachment a Resend).
 * Devuelve null si no se puede leer.
 */
export async function downloadInvoicePdf(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<{ filename: string; base64: string } | null> {
  try {
    const { data, error } = await supabase.storage.from('invoices').download(storagePath)
    if (error || !data) {
      console.warn('[email-utils] downloadInvoicePdf error:', error?.message)
      return null
    }
    const buf = new Uint8Array(await data.arrayBuffer())
    // base64 (Deno tiene btoa pero rompe con bytes > 0x7f → encode manual)
    let binary = ''
    const chunk = 0x8000
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk))
    }
    const base64 = btoa(binary)
    const filename = storagePath.split('/').pop() ?? 'factura.pdf'
    return { filename, base64 }
  } catch (err) {
    console.warn('[email-utils] downloadInvoicePdf exception:', String(err))
    return null
  }
}

/* ─────────────────── Settings ─────────────────── */

/**
 * Lee varias keys de la tabla `settings` y devuelve un mapa `{key: value}`.
 * Los valores se almacenan como JSON (text/number/array). Esta función intenta
 * parsearlos como JSON; si falla, los devuelve como string crudo (sin comillas
 * de envoltura por compatibilidad con el patrón actual de send-quote-email).
 */
export async function getSettings(
  supabase: SupabaseClient,
  keys: string[],
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {}
  if (keys.length === 0) return result

  const { data, error } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', keys)

  if (error) {
    console.warn('[email-utils] getSettings error:', error.message)
    return result
  }

  for (const row of data ?? []) {
    const raw = row.value as unknown
    if (typeof raw === 'string') {
      // Intenta JSON.parse; si falla, queda como string sin comillas envueltas.
      try {
        result[row.key] = JSON.parse(raw)
      } catch {
        result[row.key] = raw.replace(/^"|"$/g, '')
      }
    } else {
      result[row.key] = raw
    }
  }

  return result
}

/** Coerciona a string limpio. Devuelve '' si null/undefined. */
export function asString(v: unknown, fallback = ''): string {
  if (v == null) return fallback
  if (typeof v === 'string') return v
  return String(v)
}

/** Coerciona a int. Devuelve fallback si NaN. */
export function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Parsea CSV de emails ("a@x.com, b@y.com") → array limpio, dedupe.
 * B-34: valida cada entrada contra un patrón de email, normaliza a minúsculas
 * y descarta las inválidas. Evita inyectar destinatarios malformados en Resend
 * (header injection, CC/BCC a direcciones basura) desde settings editables.
 */
export function parseEmailCsv(csv: unknown): string[] {
  if (!csv) return []
  const raw = typeof csv === 'string' ? csv : String(csv)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => EMAIL_RE.test(s)),
    ),
  )
}

/* ─────────────────── Resend wrapper ─────────────────── */

export interface ResendAttachment {
  filename: string
  /** Content base64 (sin prefijo `data:`). */
  content: string
}

export interface ResendPayload {
  from: string
  to: string[]
  subject: string
  html: string
  reply_to?: string
  cc?: string[]
  bcc?: string[]
  attachments?: ResendAttachment[]
}

const RESEND_API = 'https://api.resend.com/emails'

/**
 * Envía email a través de Resend. Lanza Error si la respuesta no es 200.
 * Devuelve el `id` de Resend que las funciones pueden propagar al caller.
 */
export async function sendViaResend(payload: ResendPayload): Promise<string> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('RESEND_API_KEY no configurada')

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(
      `Resend HTTP ${res.status}: ${typeof body === 'object' ? JSON.stringify(body) : String(body)}`,
    )
  }
  return (body as { id?: string }).id ?? ''
}

/** Construye `from` siguiendo convención `Display Name <email@dominio>`. */
export function buildFromAddress(): string {
  const email = Deno.env.get('RESEND_FROM_EMAIL') ?? 'onboarding@resend.dev'
  return `DC Bikes Cantabria <${email}>`
}

/* ─────────────────── URLs base ─────────────────── */

/**
 * URL pública del sitio (frontend). Requiere env SITE_URL configurada.
 * B-30: eliminado el fallback hardcoded — un fallback silencioso podía generar
 * enlaces a un dominio incorrecto (magic links, facturas) si la env faltaba.
 * Fail-closed: lanza si no está configurada.
 */
export function getSiteUrl(): string {
  const url = Deno.env.get('SITE_URL')
  if (!url) throw new Error('SITE_URL env var missing')
  return url.replace(/\/+$/, '')
}

/* ─────────────────── Tracking carriers ─────────────────── */

const TRACKING_URLS: Record<string, (n: string) => string> = {
  seur: (n) => `https://www.seur.com/livetracking/?segOnlineIdentificador=${encodeURIComponent(n)}`,
  'correos express': (n) =>
    `https://www.correosexpress.com/web/correosexpress/envio-nacional?numEnvio=${encodeURIComponent(n)}`,
  correos: (n) => `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?tracking-number=${encodeURIComponent(n)}`,
  mrw: (n) => `https://www.mrw.es/seguimiento-envios-mrw/?numero=${encodeURIComponent(n)}`,
  nacex: (n) =>
    `https://www.nacex.com/seguimientoDetalle.do?agencia_origen=&numero_albaran=${encodeURIComponent(n)}`,
  gls: (n) => `https://gls-group.com/ES/es/seguimiento-envios?match=${encodeURIComponent(n)}`,
  dhl: (n) => `https://www.dhl.com/es-es/home/tracking/tracking-parcel.html?submit=1&tracking-id=${encodeURIComponent(n)}`,
  ups: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`,
}

/** Devuelve URL de tracking si el carrier es conocido (case-insensitive). null si no. */
export function getTrackingUrl(
  carrier: string | null | undefined,
  trackingNumber: string | null | undefined,
): string | null {
  if (!carrier || !trackingNumber) return null
  const key = carrier.trim().toLowerCase()
  const builder = TRACKING_URLS[key]
  return builder ? builder(trackingNumber.trim()) : null
}

/* ─────────────────── Tipos comunes de Order ─────────────────── */

export interface OrderRow {
  id: string
  order_number: string
  status: string
  delivery_method: 'shipping' | 'pickup' | string
  customer_email: string
  customer_phone: string
  customer_first_name: string
  customer_last_name: string
  shipping_address: string | null
  shipping_city: string | null
  shipping_postal_code: string | null
  shipping_province: string | null
  shipping_notes: string | null
  customer_dni: string | null
  needs_invoice: boolean
  invoice_business_name: string | null
  invoice_cif: string | null
  invoice_address: string | null
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  tax_rate: number | string
  payment_method: string | null
  rejection_reason: string | null
  ready_pickup_at: string | null
  shipped_at: string | null
  tracking_number: string | null
  tracking_carrier: string | null
  created_at: string
  order_items: OrderItemRow[]
}

/** Helper para escribir un párrafo "Dirección de envío". */
export function renderShippingBlock(order: OrderRow): string {
  if (order.delivery_method === 'pickup') {
    return `<p style="margin:0 0 6px 0;color:#222;font-size:14px"><strong>Recogida en tienda</strong></p>`
  }
  const parts = [
    escapeHtml(`${order.customer_first_name} ${order.customer_last_name}`.trim()),
    escapeHtml(order.shipping_address ?? ''),
    [escapeHtml(order.shipping_postal_code ?? ''), escapeHtml(order.shipping_city ?? '')]
      .filter(Boolean)
      .join(' '),
    escapeHtml(order.shipping_province ?? ''),
    order.shipping_notes
      ? `<em style="color:#777">Notas: ${escapeHtml(order.shipping_notes)}</em>`
      : '',
  ].filter(Boolean)
  return `<p style="margin:0;color:#222;font-size:14px;line-height:1.6">
    ${parts.join('<br/>')}
  </p>`
}
