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
 * Devuelve los headers para invocar otra Edge Function interna vía
 * `supabase.functions.invoke(name, { headers: internalSecretHeader() })`.
 *
 * CRÍTICO: incluye `Authorization` con el SERVICE_ROLE_KEY. El objeto que
 * se pasa a `functions.invoke({ headers })` REEMPLAZA los headers por
 * defecto del cliente — si solo devolviésemos `x-internal-secret`, se
 * perdería el `Authorization` que la plataforma exige cuando la función
 * receptora tiene `verify_jwt = true`, y la invocación fallaría con 401
 * antes de llegar al handler (y por tanto antes de verificar el secreto).
 *
 * Doble capa: la plataforma valida el JWT service_role (verify_jwt) y el
 * handler valida `x-internal-secret` (verifyInternalSecret).
 */
export function internalSecretHeader(): Record<string, string> {
  return {
    Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
    'x-internal-secret': Deno.env.get('INTERNAL_INVOKE_SECRET') ?? '',
  }
}
