// supabase/functions/_shared/order-token.ts
//
// HMAC determinista para validar el acceso público a la confirmación de un pedido.
//
// El token se genera al crear el pedido (`order-place`) y se incluye en la URL
// que devolvemos al frontend: /pedido/confirmacion?id={uuid}&token={hmac}.
//
// `order-public-get` valida la firma sin tocar BD aparte de leer la orden:
// si el token coincide con el HMAC esperado (order_id + customer_email + secret),
// se autoriza la lectura limitada.
//
// El secreto se lee de la env var ORDER_TOKEN_SECRET. Como fallback (dev) se
// deriva del SUPABASE_SERVICE_ROLE_KEY para tener algo no-trivial sin requerir
// configuración manual desde el primer minuto.

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

/**
 * Genera el token público para un pedido. Determinista: misma input → misma output.
 * Lo guardamos en la URL devuelta al cliente al hacer order-place.
 */
export async function generateOrderToken(
  orderId: string,
  customerEmail: string,
): Promise<string> {
  return hmacSha256B64Url(`${orderId}:${customerEmail.toLowerCase().trim()}`)
}

/**
 * Verifica si el token recibido corresponde al esperado para el par order/email.
 * Comparación timing-safe.
 */
export async function verifyOrderToken(
  orderId: string,
  customerEmail: string,
  receivedToken: string,
): Promise<boolean> {
  const expected = await generateOrderToken(orderId, customerEmail)
  if (expected.length !== receivedToken.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ receivedToken.charCodeAt(i)
  }
  return diff === 0
}
