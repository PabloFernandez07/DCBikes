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
//   validez: 7 días desde issuedAt (S-04: reducido de 30d)
//
// El secreto se lee de la env var ORDER_TOKEN_SECRET (obligatoria).
// Configurar en: Supabase Dashboard > Project Settings > Edge Functions > Secrets.

const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días (S-04: era 30d, reducido por auditoría legal V3)

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
  const secret = Deno.env.get('ORDER_TOKEN_SECRET')
  if (!secret || secret.length === 0) {
    throw new Error('ORDER_TOKEN_SECRET env var es obligatoria (S-04 auditoría legal V3)')
  }
  return secret
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
 * Solo acepta el formato actual: `${issuedAt}.${sig}` — valida firma + TTL (7 días).
 * Tokens en formato antiguo (sin timestamp) ya no son válidos (S-04 auditoría legal V3).
 */
export async function verifyOrderToken(
  orderId: string,
  customerEmail: string,
  receivedToken: string,
): Promise<boolean> {
  if (!receivedToken) return false
  const email = normalizeEmail(customerEmail)

  // Formato requerido: contiene un punto separador (issuedAt.sig).
  if (!receivedToken.includes('.')) return false

  const dotIdx = receivedToken.indexOf('.')
  const issuedAtStr = receivedToken.slice(0, dotIdx)
  const sig = receivedToken.slice(dotIdx + 1)
  const issuedAt = Number.parseInt(issuedAtStr, 10)
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false
  if (Date.now() - issuedAt > TTL_MS) return false
  const expected = await hmacSha256B64Url(`${orderId}:${email}:${issuedAt}`)
  return timingSafeEqual(sig, expected)
}

// Audit trail:
//   2026-05-27 (S-04 auditoría legal V3): TTL 30d -> 7d, drop rama legacy, secret obligatorio.
