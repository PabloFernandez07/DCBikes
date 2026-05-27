// supabase/functions/_shared/security.ts
//
// Helpers de seguridad compartidos entre Edge Functions.
//
// timingSafeEq: comparación constante en tiempo, byte a byte, evitando
// short-circuit que filtraría longitud/prefijo de secretos vía side-channel.
// Devuelve `false` si las longitudes difieren (sin cortocircuitar el bucle
// para evitar leak por timing del check de longitud).

export function timingSafeEq(a: string, b: string): boolean {
  const sa = String(a ?? '')
  const sb = String(b ?? '')
  const enc = new TextEncoder()
  const ba = enc.encode(sa)
  const bb = enc.encode(sb)

  // Recorremos siempre el máximo de los dos para no filtrar longitudes,
  // acumulando un OR en `diff`. Si las longitudes difieren, sumamos 1
  // al final para forzar mismatch sin salir antes.
  const len = Math.max(ba.length, bb.length)
  let diff = ba.length ^ bb.length
  for (let i = 0; i < len; i++) {
    const xa = i < ba.length ? ba[i] : 0
    const xb = i < bb.length ? bb[i] : 0
    diff |= xa ^ xb
  }
  return diff === 0
}

/**
 * Valida que la request entrante lleve el header `x-internal-secret`
 * coincidente con la env `INTERNAL_INVOKE_SECRET`.
 *
 * Devuelve `true` solo si el secret está configurado en la función
 * receptora y el header recibido coincide en comparación constante.
 * Si la env no está configurada, devuelve `false` (fail-closed).
 */
export function verifyInternalSecret(req: Request): boolean {
  const expected = Deno.env.get('INTERNAL_INVOKE_SECRET') ?? ''
  if (!expected) {
    console.error('[security] INTERNAL_INVOKE_SECRET no configurada — refusing all internal invokes (fail-closed)')
    return false
  }
  const received = req.headers.get('x-internal-secret') ?? ''
  return timingSafeEq(received, expected)
}

/**
 * Devuelve el header `x-internal-secret` correctamente formado para
 * propagar entre Edge Functions. Si la env no está configurada,
 * devuelve cadena vacía (el receptor rechazará la llamada con 403).
 */
export function internalSecretHeader(): { 'x-internal-secret': string } {
  return { 'x-internal-secret': Deno.env.get('INTERNAL_INVOKE_SECRET') ?? '' }
}
