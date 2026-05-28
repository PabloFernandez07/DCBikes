// _shared/turnstile.ts
//
// Verificación de Cloudflare Turnstile compartida entre edge functions.
//
// B-03: fail-closed. Si TURNSTILE_SECRET no está configurado, NO podemos
// verificar el captcha; aceptar la solicitud abriría un vector de spam/abuso.
// La política es rechazar siempre hasta que el operador configure el secreto.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

/**
 * Verifica un token de Turnstile contra el endpoint de Cloudflare.
 *
 * @param token  El `turnstile_token` recibido del cliente.
 * @param ip     IP remota del cliente (opcional, se pasa como `remoteip`).
 * @param logTag Etiqueta de log para identificar la función que llama.
 * @returns      `true` solo si Cloudflare confirma success. Fail-closed:
 *               devuelve `false` si el secret no está configurado.
 */
export async function verifyTurnstile(
  token: string,
  ip: string | null,
  logTag = 'turnstile',
): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET')
  if (!secret) {
    console.error(
      `[${logTag}] TURNSTILE_SECRET MISSING — refusing all submissions (fail-closed)`,
    )
    return false
  }
  if (!token) return false

  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)

  try {
    const res = await fetch(SITEVERIFY_URL, { method: 'POST', body: form })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch (err) {
    // Fallo de red al llamar a Cloudflare → fail-closed (no podemos confirmar).
    console.error(`[${logTag}] siteverify request failed (fail-closed):`, String(err))
    return false
  }
}
