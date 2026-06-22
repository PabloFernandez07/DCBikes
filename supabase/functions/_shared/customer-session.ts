// supabase/functions/_shared/customer-session.ts
//
// Helpers para el flujo de magic link "Mis pedidos" (Feature N).
//
// Diseño:
//   - Token plano: 32 bytes random → hex (64 chars). Suficiente entropía
//     (256 bits) para hacer el bruteforce inviable.
//   - Guardamos SHA-256(token) en BD, nunca el token plano. Si la tabla
//     customer_sessions filtrase, los hashes son inútiles sin reversa.
//   - TTL: 24h. Suficiente para que el cliente abra el link tarde, no tan
//     largo como para considerarse una "sesión permanente".
//   - Token reusable durante el TTL (no marcamos used_at), lo que permite
//     volver a /mis-pedidos varias veces sin pedir otro email.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const TOKEN_BYTES = 32

/* ─────────── Hashing ─────────── */

function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
  }
  return out
}

/** Genera 32 bytes random → 64 chars hex. */
function generateRandomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

/** SHA-256 hex digest. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return bytesToHex(new Uint8Array(digest))
}

/* ─────────── API pública ─────────── */

export interface CustomerSessionCreated {
  token: string
  expiresAt: Date
}

/**
 * Crea una sesión de cliente y devuelve el token plano (para enviarlo por
 * email). En BD solo se guarda el hash.
 */
export async function createCustomerSession(
  supabaseAdmin: SupabaseClient,
  email: string,
  ip: string | null,
  userAgent: string | null,
): Promise<CustomerSessionCreated> {
  const token = generateRandomToken()
  const tokenHash = await sha256Hex(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  const { error } = await supabaseAdmin.from('customer_sessions').insert({
    email: email.toLowerCase().trim(),
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    ip_address: ip,
    user_agent: userAgent,
  })

  if (error) {
    throw new Error(`createCustomerSession: ${error.message}`)
  }

  return { token, expiresAt }
}

/**
 * Verifica un token recibido del frontend.
 * Hashea el token + busca por token_hash con expires_at > now().
 * Si válido → devuelve el email asociado. Si no → null.
 *
 * Comparación timing-safe a través del lookup por índice (no comparamos
 * strings manualmente en JS).
 */
export async function verifyCustomerSession(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<{ email: string } | null> {
  if (!token || typeof token !== 'string') return null
  // Formato esperado: 64 chars hex. Rechazo barato antes de tocar BD.
  if (!/^[0-9a-f]{64}$/i.test(token)) return null

  const tokenHash = await sha256Hex(token.toLowerCase())
  const nowIso = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('customer_sessions')
    .select('email, expires_at')
    .eq('token_hash', tokenHash)
    .gt('expires_at', nowIso)
    .maybeSingle<{ email: string; expires_at: string }>()

  if (error) {
    console.warn('[customer-session] verifyCustomerSession error:', error.message)
    return null
  }
  if (!data) return null

  // Expiración DESLIZANTE: las 24h cuentan desde el último uso, no desde el
  // envío del email. Sin esto, si el email pasaba horas en la bandeja antes del
  // primer clic, la ventana útil real era < 24h ("lo uso y al volver ya
  // expiró"). Si al token le queda menos de media vida, lo renovamos a now+24h.
  // Solo escribimos al cruzar el umbral → no amplificamos writes en cada fetch.
  const remainingMs = new Date(data.expires_at).getTime() - Date.now()
  if (remainingMs < TOKEN_TTL_MS / 2) {
    await supabaseAdmin
      .from('customer_sessions')
      .update({ expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() })
      .eq('token_hash', tokenHash)
  }

  return { email: data.email }
}

/**
 * Cuenta sesiones creadas en la última hora para un email.
 * Usado por rate-limit en customer-magic-link-request.
 */
export async function countRecentSessionsForEmail(
  supabaseAdmin: SupabaseClient,
  email: string,
  windowMs = 60 * 60 * 1000,
): Promise<number> {
  const sinceIso = new Date(Date.now() - windowMs).toISOString()
  const { count, error } = await supabaseAdmin
    .from('customer_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('email', email.toLowerCase().trim())
    .gte('created_at', sinceIso)
  if (error) {
    console.warn('[customer-session] countRecentSessionsForEmail error:', error.message)
    return 0
  }
  return count ?? 0
}
