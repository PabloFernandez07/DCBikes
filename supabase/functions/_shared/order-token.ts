// supabase/functions/_shared/order-token.ts
//
// HMAC con timestamp para validar el acceso público a la confirmación de un pedido.
//
// El token se genera al crear el pedido (`order-place`) y se incluye en la URL
// que devolvemos al frontend: /pedido/confirmacion?id={uuid}&token={hmac}.
//
// `order-public-get` valida la firma sin tocar BD aparte de leer la orden:
// si el token coincide con el HMAC esperado y no ha caducado, se autoriza
// la lectura limitada.
//
// Formato actual (sprint 3.2):
//   token = `${issuedAtMs}.${base64UrlSig}`
//   firma = HMAC-SHA256(orderId + ':' + email + ':' + issuedAtMs, secret)
//   validez: 30 días desde issuedAt
//
// Retro-compatibilidad:
//   Durante 60 días tras deploy aceptamos también el formato antiguo
//   (firma desnuda sin timestamp). Logueamos warning para analítica.
//   Tras 2026-07-25 eliminar el bloque marcado [DEPRECATED].
//
// El secreto se lee de la env var ORDER_TOKEN_SECRET. Como fallback (dev) se
// deriva del SUPABASE_SERVICE_ROLE_KEY namespaceado.

const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 días

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getSecret(): string {
  const explicit = Deno.env.get('ORDER_TOKEN_SECRET')
  if (explicit && explicit.length > 0) return explicit
  // Fallback determinista pero NO el service_role completo (lo "namespaceamos").
  const fallbackBase = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return `dc-bikes:order-token:${fallbackBase}`
}

async function hmacSha256B64Url(data: string): Promise<string> {
  const secret = getSecret()
  const key = await crypto.subtle.importKey(
    'raw',
    utf8(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, utf8(data))
  return toBase64Url(new Uint8Array(sig))
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

/**
 * Genera el token público para un pedido. Incluye timestamp para permitir
 * caducidad. Formato: `${issuedAtMs}.${b64UrlSig}`.
 */
export async function generateOrderToken(
  orderId: string,
  customerEmail: string,
): Promise<string> {
  const issuedAt = Date.now()
  const email = normalizeEmail(customerEmail)
  const sig = await hmacSha256B64Url(`${orderId}:${email}:${issuedAt}`)
  return `${issuedAt}.${sig}`
}

/**
 * Verifica si el token recibido corresponde al esperado y no ha caducado.
 * Comparación timing-safe.
 *
 * Acepta dos formatos:
 *   - Nuevo: `${issuedAt}.${sig}` — valida firma + TTL (30 días).
 *   - [DEPRECATED — eliminar tras 2026-07-25] Antiguo: solo firma —
 *     valida firma de `${orderId}:${email}` sin expiración.
 */
export async function verifyOrderToken(
  orderId: string,
  customerEmail: string,
  receivedToken: string,
): Promise<boolean> {
  if (!receivedToken) return false
  const email = normalizeEmail(customerEmail)

  // Formato nuevo: contiene un punto separador.
  if (receivedToken.includes('.')) {
    const dotIdx = receivedToken.indexOf('.')
    const issuedAtStr = receivedToken.slice(0, dotIdx)
    const sig = receivedToken.slice(dotIdx + 1)
    const issuedAt = Number.parseInt(issuedAtStr, 10)
    if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false
    if (Date.now() - issuedAt > TTL_MS) return false
    const expected = await hmacSha256B64Url(`${orderId}:${email}:${issuedAt}`)
    return timingSafeEqual(sig, expected)
  }

  // [DEPRECATED — eliminar tras 2026-07-25] Formato antiguo: solo firma.
  console.warn(
    `[order-token] usando token formato antiguo (sin timestamp) para order ${orderId}`,
  )
  const expectedLegacy = await hmacSha256B64Url(`${orderId}:${email}`)
  return timingSafeEqual(receivedToken, expectedLegacy)
}
