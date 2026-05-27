// api/csp-report.ts
// Vercel serverless function que recolecta violaciones CSP (modo Report-Only).
// Las violaciones se loguean en consola Vercel — revisar en Vercel Dashboard → Logs.
// Tras 7 días sin violaciones nuevas: migrar a Content-Security-Policy enforcing.

export const config = {
  runtime: 'edge',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(null, { status: 405 })
  }
  try {
    const body = await req.text()
    // El payload de CSP report puede venir como 'application/csp-report' o 'application/reports+json'
    console.log('[CSP-REPORT]', body)
  } catch (err) {
    console.error('[CSP-REPORT] parse error:', err)
  }
  // Responder 204 para evitar reintentos del navegador.
  return new Response(null, { status: 204 })
}
