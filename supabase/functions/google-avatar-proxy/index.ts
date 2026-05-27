import { CORS_HEADERS, jsonError, corsPreflightResponse } from '../_shared/email-utils.ts'

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

  const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    },
  })
})
