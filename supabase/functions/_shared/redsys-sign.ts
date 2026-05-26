// supabase/functions/_shared/redsys-sign.ts
//
// Firma HMAC SHA-256 V1 para Redsys.
//
// Algoritmo según docs Redsys (HostedPayment / REST):
//   1. Serializar el objeto de parámetros `Ds_Merchant_*` a JSON y base64-encode
//      → Ds_MerchantParameters.
//   2. Derivar clave de firma cifrando el `Ds_Merchant_Order` con 3DES-CBC
//      (IV = 8 bytes a 0) usando como clave la `merchant_secret` decodificada
//      desde base64. La salida es de 8 bytes; usar esos 8 bytes (en realidad la
//      misma longitud que el bloque cifrado del orderId) como secreto.
//   3. HMAC-SHA256 del string base64 de parámetros (paso 1) usando la clave
//      derivada del paso 2. Base64 del HMAC → Ds_Signature.
//
// Notas Deno:
// - 3DES no existe en SubtleCrypto. Usamos `node-forge` vía esm.sh, que sí
//   funciona en Deno (testado: import default sin DOM globals).
// - Para Base64 usamos btoa/atob de globalThis.
// - Para verificar signatures entrantes (webhook), normalizamos URL-safe
//   base64 (Redsys envía `Ds_MerchantParameters` con `+/=` o `-_=` según versión).

import forge from 'https://esm.sh/node-forge@1.3.1'

// ─────────────────── Helpers base64 ───────────────────

function base64Encode(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

function base64Decode(b64: string): Uint8Array {
  // Soporta base64 URL-safe normalizando a alfabeto estándar.
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const bin = atob(normalized + padding)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function utf8Encode(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function utf8Decode(b: Uint8Array): string {
  return new TextDecoder().decode(b)
}

// ─────────────────── 3DES-CBC encryption ───────────────────
// Forge usa Buffer-like strings (raw bytes). Convertimos Uint8Array → binary string.

function bytesToBinaryString(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

function binaryStringToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff
  return out
}

/**
 * Cifra el orderId con 3DES-CBC (IV nulo) usando merchantSecret (base64).
 * Retorna los bytes cifrados (mismo tamaño que el input padding-aligned a 8 bytes).
 * Esa salida es la clave del HMAC del paso 3.
 */
function derive3DESKey(orderId: string, merchantSecretB64: string): Uint8Array {
  const keyBytes = base64Decode(merchantSecretB64)
  // 3DES requiere clave de 24 bytes. Si la clave decodificada tiene menos,
  // hay que padearla a la derecha con ceros (comportamiento estándar Redsys).
  let key24: Uint8Array
  if (keyBytes.length >= 24) {
    key24 = keyBytes.subarray(0, 24)
  } else {
    key24 = new Uint8Array(24)
    key24.set(keyBytes)
  }

  // IV de 8 bytes a cero.
  const iv = new Uint8Array(8)

  // Padding manual con ceros a múltiplo de 8 bytes (Redsys requiere zero-padding,
  // NO PKCS#7). Forge por defecto aplica PKCS#7 → desactivamos ambos paddings.
  const inputBytes = utf8Encode(orderId)
  const padLen = (8 - (inputBytes.length % 8)) % 8
  const padded = new Uint8Array(inputBytes.length + padLen)
  padded.set(inputBytes)
  // (resto del buffer ya está a 0)

  const cipher = forge.cipher.createCipher(
    '3DES-CBC',
    forge.util.createBuffer(bytesToBinaryString(key24)),
  )
  cipher.start({ iv: forge.util.createBuffer(bytesToBinaryString(iv)) })
  // Desactivar padding interno de forge: el input ya viene padded a 8.
  // `pad` se llama al final con el último bloque incompleto; `() => true`
  // significa "no añadas nada, considera el bloque completo".
  ;(cipher.mode as unknown as { pad: (output: unknown, options: unknown) => boolean })
    .pad = () => true
  ;(cipher.mode as unknown as { unpad: (output: unknown, options: unknown) => boolean })
    .unpad = () => true

  cipher.update(forge.util.createBuffer(bytesToBinaryString(padded)))
  cipher.finish()

  const output = cipher.output.getBytes()
  return binaryStringToBytes(output)
}

// ─────────────────── HMAC SHA-256 ───────────────────

async function hmacSha256(keyBytes: Uint8Array, dataBytes: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes)
  return new Uint8Array(sig)
}

// ─────────────────── API pública ───────────────────

export interface RedsysSignedPayload {
  Ds_SignatureVersion: 'HMAC_SHA256_V1'
  Ds_MerchantParameters: string
  Ds_Signature: string
}

/**
 * Firma un payload Redsys. `params` debe contener al menos `DS_MERCHANT_ORDER`
 * (case-insensitive — aceptamos tanto `Ds_Merchant_Order` como `DS_MERCHANT_ORDER`).
 */
export async function signRedsysPayload(
  params: Record<string, string | number>,
  merchantSecretB64: string,
): Promise<RedsysSignedPayload> {
  // Localizar el orderId aceptando varias capitalizaciones.
  const orderId = String(
    params['DS_MERCHANT_ORDER'] ??
      params['Ds_Merchant_Order'] ??
      params['ds_merchant_order'] ??
      '',
  )
  if (!orderId) {
    throw new Error('signRedsysPayload: falta DS_MERCHANT_ORDER en params')
  }

  // Paso 1: base64(JSON(params)).
  const json = JSON.stringify(params)
  const merchantParametersB64 = base64Encode(utf8Encode(json))

  // Paso 2: derivar clave 3DES desde orderId.
  const derivedKey = derive3DESKey(orderId, merchantSecretB64)

  // Paso 3: HMAC-SHA256 sobre el string base64 (NO bytes JSON crudos — el
  // protocolo Redsys firma el string base64 tal cual).
  const hmac = await hmacSha256(derivedKey, utf8Encode(merchantParametersB64))
  const signatureB64 = base64Encode(hmac)

  return {
    Ds_SignatureVersion: 'HMAC_SHA256_V1',
    Ds_MerchantParameters: merchantParametersB64,
    Ds_Signature: signatureB64,
  }
}

/**
 * Verifica una firma recibida (webhook). Devuelve `{ valid, params }` con los
 * parámetros decodificados (útil para que el caller los use sin repetir el
 * decode si la firma es válida).
 *
 * Acepta `Ds_Signature` en formato URL-safe (Redsys notifica usando `-_`).
 * Devuelve `valid=false` si decode/parse falla; nunca lanza por payload
 * corrupto (sí lanza si la merchantSecret está mal formada).
 */
export async function verifyRedsysSignature(
  rawMerchantParametersB64: string,
  receivedSignatureB64: string,
  merchantSecretB64: string,
): Promise<{ valid: boolean; params: Record<string, string> }> {
  let params: Record<string, string> = {}
  try {
    const jsonBytes = base64Decode(rawMerchantParametersB64)
    const json = utf8Decode(jsonBytes)
    params = JSON.parse(json)
  } catch (err) {
    console.warn('[redsys-sign] verify: no se pudo parsear MerchantParameters:', String(err))
    return { valid: false, params: {} }
  }

  const orderId = String(
    params['Ds_Order'] ??
      params['DS_ORDER'] ??
      params['Ds_Merchant_Order'] ??
      params['DS_MERCHANT_ORDER'] ??
      '',
  )
  if (!orderId) {
    console.warn('[redsys-sign] verify: payload sin Ds_Order/Ds_Merchant_Order')
    return { valid: false, params }
  }

  const derivedKey = derive3DESKey(orderId, merchantSecretB64)
  const expected = await hmacSha256(derivedKey, utf8Encode(rawMerchantParametersB64))
  const expectedB64 = base64Encode(expected)

  // Normalizar la firma recibida (Redsys usa URL-safe en notificaciones).
  const normalizedReceived = receivedSignatureB64
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const normalizedExpected = expectedB64

  // Comparación timing-safe simple.
  const valid =
    normalizedReceived.length === normalizedExpected.length &&
    timingSafeEqual(normalizedReceived, normalizedExpected)

  return { valid, params }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Helper: convierte order_number tipo "ORD-2026-0042" a un Ds_Merchant_Order
 * válido (12 chars, primeros 4 numéricos, resto alfanumérico mayúsculas).
 *
 * Estrategia:
 *   - Tomamos el sufijo numérico (0042) → padding a 4 dígitos.
 *   - Concatenamos los últimos 8 chars del año + secuencia + timestamp suffix.
 *   - Resultado: 4 dígitos numéricos seguidos de hasta 8 alfanuméricos.
 *
 * Esto se guarda en orders.payment_pre_auth_id para correlar el webhook.
 */
export function buildRedsysOrderId(orderNumber: string, fallbackSeed?: string): string {
  // Extraer dígitos del order_number.
  const digits = orderNumber.replace(/\D/g, '')
  // Primeros 4 chars: últimos 4 dígitos del number, padded.
  const seqDigits = digits.slice(-4).padStart(4, '0')

  // Suffix alfanumérico (uppercase, 8 chars).
  const seed = (fallbackSeed ?? orderNumber).toUpperCase().replace(/[^A-Z0-9]/g, '')
  // Mezclar con timestamp ms (base36) para garantizar unicidad si se reintenta.
  const tsSuffix = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const tail = (seed + tsSuffix).slice(-8).padEnd(8, 'X')

  return (seqDigits + tail).slice(0, 12)
}
