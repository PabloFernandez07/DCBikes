import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { timingSafeEq } from '../_shared/security.ts'
import { maskEmail } from '../_shared/email-utils.ts'

/**
 * quote-inbound — mete en el hilo de una consulta la respuesta que el cliente
 * ha enviado por email.
 *
 * La invoca n8n cuando llega un correo al buzón de la tienda. n8n es un
 * sistema externo, así que NO reutiliza INTERNAL_INVOKE_SECRET: si n8n se
 * viese comprometido, ese secreto abriría todas las funciones internas. Lleva
 * su propio QUOTE_INBOUND_SECRET, y solo puede hacer esto.
 *
 * Payload esperado:
 *   { to: string, from: string, subject?: string, body: string }
 *
 * `to` es la dirección a la que respondió el cliente y lleva el token que
 * identifica la consulta: buzon+q<token>@dominio. Sin token no se puede
 * atribuir el mensaje a ningún hilo y se descarta (mejor perderlo que
 * colgarlo de la consulta equivocada, que expondría datos de un cliente a
 * otro en el panel).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-quote-inbound-secret',
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })

/** Extrae el token de `buzon+q<token>@dominio`. */
function extractToken(to: string): string | null {
  return to.match(/\+q([a-f0-9]{12})@/i)?.[1]?.toLowerCase() ?? null
}

/**
 * Corta el historial citado que los clientes de correo arrastran al responder.
 * Sin esto, cada respuesta traería pegada la conversación entera y el hilo
 * sería ilegible a los dos mensajes.
 *
 * Es heurístico a propósito: no existe forma fiable de hacerlo (no hay
 * estándar), así que se cortan los patrones habituales y, si ninguno aparece,
 * se deja el cuerpo íntegro — preferible un mensaje con cola que un mensaje
 * truncado a medias.
 */
function stripQuotedReply(raw: string): string {
  const markers = [
    /^\s*>.*$/m,                                        // líneas citadas con «>»
    /^-{2,}\s*Mensaje original\s*-{2,}/im,
    /^-{2,}\s*Original Message\s*-{2,}/im,
    /^_{5,}\s*$/m,                                      // separador de Outlook
    // Línea de atribución de Gmail. Tilde opcional (no todos los clientes la
    // ponen) y hasta 160 caracteres: la real es larga («El mié, 13 jul 2026 a
    // las 10:23, DC Bikes Cantabria (<info@…>) escribió:»).
    /^\s*El\s.{0,160}escribi[oó]:\s*$/im,               // Gmail ES
    /^\s*On\s.{0,160}wrote:\s*$/im,                     // Gmail EN
    /^\s*De:\s.+$/im,                                   // cabecera reenviada (Outlook ES)
    /^\s*From:\s.+$/im,
  ]
  let cut = raw.length
  for (const re of markers) {
    const m = raw.match(re)
    if (m?.index !== undefined && m.index < cut) cut = m.index
  }
  const body = raw.slice(0, cut).trim()
  return body || raw.trim()
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const ts = () => new Date().toISOString()

  // Auth: secreto dedicado, fail-closed si no está configurado.
  const expected = Deno.env.get('QUOTE_INBOUND_SECRET') ?? ''
  if (!expected) {
    console.error(`[${ts()}] QUOTE_INBOUND_SECRET no configurada — rechazando todo (fail-closed)`)
    return json({ error: 'not configured' }, 503)
  }
  if (!timingSafeEq(req.headers.get('x-quote-inbound-secret') ?? '', expected)) {
    console.warn(`[${ts()}] ✗ quote-inbound: secreto inválido`)
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const { to, from, subject, body, message_id } = await req.json()

    if (typeof to !== 'string' || typeof body !== 'string' || !body.trim()) {
      return json({ error: 'faltan campos: to, body' }, 400)
    }

    const token = extractToken(to)
    if (!token) {
      console.warn(`[${ts()}] correo sin token en el destinatario, descartado`)
      return json({ ok: false, reason: 'sin token' })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: quote } = await supabase
      .from('quote_requests')
      .select('id, email, status')
      .eq('reply_token', token)
      .maybeSingle()

    if (!quote) {
      console.warn(`[${ts()}] token ${token} no corresponde a ninguna consulta`)
      return json({ ok: false, reason: 'consulta no encontrada' })
    }

    const clean = stripQuotedReply(body)

    const { error: insErr } = await supabase.from('quote_messages').insert({
      quote_id: quote.id,
      direction: 'in',
      body: clean,
      subject: typeof subject === 'string' ? subject : null,
      email_id: typeof message_id === 'string' && message_id ? message_id : null,
    })

    // 23505 = el correo ya estaba en el hilo. Pasa cuando el lector del buzón
    // reintenta porque no le llegó nuestra respuesta. No es un error: se
    // responde ok para que deje de reintentarlo, y no se duplica el mensaje.
    if (insErr?.code === '23505') {
      console.log(`[${ts()}] correo ${message_id} ya estaba en el hilo, ignorado`)
      return json({ ok: true, duplicate: true, quote_id: quote.id })
    }
    if (insErr) throw new Error(insErr.message)

    // Vuelve a «nueva» para que reaparezca en la pestaña de pendientes: el
    // cliente ha contestado y la pelota está otra vez en tu tejado.
    await supabase
      .from('quote_requests')
      .update({ status: 'new' })
      .eq('id', quote.id)

    console.log(`[${ts()}] ✓ respuesta de ${maskEmail(String(from ?? ''))} añadida al hilo ${quote.id}`)
    return json({ ok: true, quote_id: quote.id })
  } catch (err) {
    console.error(`[${ts()}] ✗ quote-inbound:`, String(err))
    return json({ error: String(err) }, 500)
  }
})
