import { buildCorsHeaders, jsonError, corsPreflightResponse } from '../_shared/email-utils.ts'

/**
 * Tope de tamaño del avatar. Estaba en 4 KB y era DEMASIADO PEQUEÑO: bloqueaba
 * 4 de las 5 fotos de las reseñas reales (medidas: 3,3 / 4,9 / 8,0 / 19,2 /
 * 29,3 KB), y como el 413 devuelve JSON en vez de una imagen, el navegador lo
 * cortaba con ERR_BLOCKED_BY_ORB y se veía el icono de imagen rota.
 *
 * 256 KB deja ~9x de margen sobre el avatar más grande visto y sigue siendo un
 * tope real contra la amplificación, que es lo que B-31 quería evitar.
 */
const LIMITE_BYTES = 256 * 1024

const ALLOWED_HOSTS = new Set([
  'lh3.googleusercontent.com',
  'lh4.googleusercontent.com',
  'lh5.googleusercontent.com',
  'lh6.googleusercontent.com',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return corsPreflightResponse(req)

  if (req.method !== 'GET') {
    return jsonError('Method not allowed', 405, req)
  }

  const { searchParams } = new URL(req.url)
  const target = searchParams.get('url')
  if (!target) return jsonError('Missing url param', 400, req)

  let parsed: URL
  try {
    parsed = new URL(target)
  } catch {
    return jsonError('Invalid url', 400, req)
  }

  if (parsed.protocol !== 'https:') return jsonError('Only https allowed', 400, req)
  if (!ALLOWED_HOSTS.has(parsed.host)) return jsonError('Host not allowed', 400, req)

  let upstream: Response
  try {
    upstream = await fetch(parsed.toString(), {
      headers: {
        'Accept': 'image/*',
        'User-Agent': 'dcbikes-avatar-proxy/1.0',
      },
    })
  } catch {
    return jsonError('Upstream fetch failed', 502, req)
  }

  if (!upstream.ok) return jsonError('Upstream error', 502, req)

  // Rechazo temprano: si el propio upstream ya declara que se pasa del tope, no
  // hace falta descargar nada.
  const declarado = Number(upstream.headers.get('content-length') ?? '0')
  if (Number.isFinite(declarado) && declarado > LIMITE_BYTES) {
    return jsonError('Payload too large', 413, req)
  }

  // Si dice explícitamente que NO es una imagen, fuera. Cuando no manda
  // cabecera se asume jpeg (comportamiento de siempre): rechazar por una
  // cabecera ausente tumbaría avatares perfectamente válidos.
  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
  if (!contentType.startsWith('image/')) {
    return jsonError('Upstream is not an image', 502, req)
  }

  // B-31: el tope se cuenta sobre los BYTES REALES, no sobre lo que diga la
  // cabecera. Content-Length se puede omitir (respuesta chunked) o mentir, y
  // entonces el cap anterior no protegía de nada: se colaba un cuerpo de
  // tamaño arbitrario. Contando de verdad, el límite sí se cumple siempre.
  const cuerpo = await leerConTope(upstream, LIMITE_BYTES)
  if (!cuerpo) return jsonError('Payload too large', 413, req)

  return new Response(cuerpo, {
    status: 200,
    headers: {
      ...buildCorsHeaders(req),
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  })
})

/**
 * Lee el cuerpo entero, abortando en cuanto se pasa del tope.
 * Devuelve null si se pasa (así el que llama responde 413).
 */
async function leerConTope(res: Response, tope: number): Promise<Uint8Array | null> {
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array()

  const trozos: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > tope) {
      await reader.cancel()
      return null
    }
    trozos.push(value)
  }

  const salida = new Uint8Array(total)
  let offset = 0
  for (const t of trozos) {
    salida.set(t, offset)
    offset += t.byteLength
  }
  return salida
}
