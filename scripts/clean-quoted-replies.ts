// scripts/clean-quoted-replies.ts
//
// Limpia el historial citado que ya está GUARDADO en quote_messages.
//
// Los mensajes entrantes anteriores al arreglo de julio de 2026 se guardaron
// con la atribución de Gmail pegada debajo («El mar, 14 jul 2026 a las 19:50,
// DC Bikes Cantabria <info@…> escribió:»), porque el recortador viejo no la
// reconocía cuando venía partida en varias líneas. Este script vuelve a pasar
// el recortador NUEVO —el mismo que usa quote-inbound, no una copia— sobre lo
// que ya hay en la base de datos.
//
// Uso (desde la raíz del repo):
//   npx tsx scripts/clean-quoted-replies.ts           # simulacro: enseña el antes/después
//   npx tsx scripts/clean-quoted-replies.ts --apply   # escribe los cambios
//
// ───────────────────────────────────────────────────────────────────────────
// LEE ESTO ANTES DE TOCAR NADA. Este script REESCRIBE mensajes de clientes
// reales en PRODUCCIÓN. Dos cosas casi salen muy caras:
//
// 1. NO TOCA LOS MENSAJES ORIGINALES DE LAS CONSULTAS, Y ES A PROPÓSITO.
//    El trigger de 0075 siembra el mensaje del formulario web en el hilo con
//    direction='in' — la misma dirección que las respuestas por correo. Como
//    este script filtraba por `direction=eq.in` a secas, le pasaba el recortador
//    de CORREO a un texto que NUNCA vino de un cliente de correo: lo escribió el
//    cliente en un <textarea>. Si ese texto lleva una línea que empiece por «>»
//    (una viñeta, algo pegado), el recortador se la come, y con --apply eso es un
//    UPDATE definitivo sobre la consulta del cliente. El comercio leería la
//    consulta truncada creyendo que es lo que pidió.
//    Los originales se marcan con email_id='quote:<uuid>' (0075) y aquí se
//    EXCLUYEN por eso. Solo se tocan las entrantes de verdad, las que traen un
//    id de correo de Gmail.
//
// 2. LA RED DE SEGURIDAD DE ANTES NO SERVÍA. Abortaba solo si el recorte dejaba
//    el cuerpo VACÍO — y en todos los casos de pérdida real la salida NO estaba
//    vacía («Hola,», «Quiero presupuesto para:»…), así que no saltaba nunca.
//    Ahora: (a) se vuelca todo a un JSON ANTES de tocar nada; (b) se comprueba
//    que lo que se quita sea explicable como historial y no un trozo del mensaje
//    del cliente; lo que no cuadre se saca a revisión manual en vez de escribirlo.
//
// Es idempotente: pasarlo dos veces no cambia nada la segunda vez.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { analyzeQuotedReply } from '../supabase/functions/_shared/strip-quoted-reply.ts'

const APPLY = process.argv.includes('--apply')

/* ── credenciales desde .env.local (no se imprimen nunca) ── */
const env = new Map<string, string>()
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  if (m) env.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''))
}
const URL_BASE = env.get('VITE_SUPABASE_URL')
const KEY = env.get('SERVICE_ROLE_KEY')
if (!URL_BASE || !KEY) throw new Error('Faltan VITE_SUPABASE_URL o SERVICE_ROLE_KEY en .env.local')

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

type Row = { id: string; quote_id: string; created_at: string; body: string; email_id: string | null }

// Solo las entrantes DE VERDAD:
//   · email_id no nulo         → vino de un lector de buzón (Gmail)
//   · email_id no 'quote:%'    → NO es el mensaje original del formulario (0075)
// Ver el punto 1 de la cabecera: pasarle el recortador de correo al original es
// exactamente cómo se destruye la consulta de un cliente.
const query = new URLSearchParams({
  direction: 'eq.in',
  email_id: 'not.is.null',
  select: 'id,quote_id,created_at,body,email_id',
  order: 'created_at.desc',
})
const res = await fetch(
  `${URL_BASE}/rest/v1/quote_messages?${query}&email_id=not.like.quote:*`,
  { headers },
)
if (!res.ok) throw new Error(`GET quote_messages: ${res.status} ${await res.text()}`)
const rows: Row[] = await res.json()

/**
 * ¿Es explicable como historial de correo lo que el recortador ha quitado?
 *
 * Si no encontramos ni una cita, ni una atribución, ni un separador, ni un
 * bloque de cabeceras en lo eliminado, es que no sabemos qué hemos quitado — y
 * entonces no se reescribe: se saca a revisión manual. Vale más una fila sucia
 * que el mensaje de un cliente machacado sin vuelta atrás.
 */
const HISTORY_EVIDENCE =
  /^\s{0,3}>|^\s*-{2,}\s*(?:mensaje original|original message|mensaje reenviado|forwarded message)|^\s*_{5,}\s*$|(?:escribi[oó]|wrote|a\s+écrit|schrieb|ha\s+scritto|escreveu)\s*:\s*$|^\s*(?:de|from|para|to|asunto|subject|enviado|sent|fecha|date)\s*:\s/im

function isExplainable(removed: string[]): boolean {
  return removed.some(chunk => HISTORY_EVIDENCE.test(chunk))
}

const analyzed = rows.map(r => {
  const { clean, removed } = analyzeQuotedReply(r.body)
  return { ...r, clean, removed }
})

// Sucia = el recortador le ha QUITADO historial citado. Se compara contra
// `body.trim()` y no contra `body` a posta: varias consultas reales traen un
// espacio suelto al final, y reescribir en producción el mensaje de un cliente
// para quitarle un espacio es tocar por tocar.
const dirty = analyzed.filter(r => r.clean !== r.body.trim())
const safe = dirty.filter(r => r.clean.trim() && isExplainable(r.removed))
const review = dirty.filter(r => !safe.includes(r))

console.log(`quote_messages entrantes de correo:  ${rows.length}  (los originales del formulario quedan fuera a propósito)`)
console.log(`Con historial citado pegado:         ${dirty.length}`)
console.log(`  · seguras de limpiar:              ${safe.length}`)
console.log(`  · a revisión manual:               ${review.length}`)
console.log(APPLY ? '\nModo: APLICAR\n' : '\nModo: simulacro (--apply para escribir)\n')

/* ── Copia de seguridad ANTES de tocar nada ── */
// El script reescribe mensajes de clientes reales y el recortador es una
// heurística. Sin esto, un fallo suyo es irreversible.
if (APPLY && dirty.length > 0) {
  mkdirSync(new URL('../.backups/', import.meta.url), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const file = new URL(`../.backups/quote_messages-${stamp}.json`, import.meta.url)
  writeFileSync(
    file,
    JSON.stringify(dirty.map(({ id, quote_id, created_at, email_id, body }) => ({ id, quote_id, created_at, email_id, body })), null, 2),
  )
  console.log(`Copia de seguridad de ${dirty.length} fila(s) → ${file.pathname}\n`)
}

for (const r of safe) {
  console.log('─'.repeat(78))
  console.log(`id ${r.id}  ·  hilo ${r.quote_id}  ·  ${r.created_at}`)
  console.log(`  ANTES:   ${JSON.stringify(r.body)}`)
  console.log(`  DESPUÉS: ${JSON.stringify(r.clean)}`)

  if (!APPLY) continue
  const upd = await fetch(`${URL_BASE}/rest/v1/quote_messages?id=eq.${r.id}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    // body_raw conserva lo que había: si el recorte se pasa de listo, se puede
    // recuperar. Es la misma red que quote-inbound pone en las entrantes nuevas.
    body: JSON.stringify({ body: r.clean, body_raw: r.body }),
  })
  if (!upd.ok) throw new Error(`PATCH ${r.id}: ${upd.status} ${await upd.text()}`)
  console.log('  → actualizado')
}

if (review.length > 0) {
  console.log('\n' + '═'.repeat(78))
  console.log('A REVISIÓN MANUAL — NO se han tocado. El recortador quitaría texto que no')
  console.log('sabe explicar como historial de correo, y eso puede ser el mensaje del cliente:')
  for (const r of review) {
    console.log('─'.repeat(78))
    console.log(`id ${r.id}  ·  hilo ${r.quote_id}`)
    console.log(`  ANTES:   ${JSON.stringify(r.body)}`)
    console.log(`  QUEDARÍA:${JSON.stringify(r.clean)}`)
    console.log(`  QUITARÍA:${JSON.stringify(r.removed)}`)
  }
}

console.log('\n' + '─'.repeat(78))
console.log(
  dirty.length === 0
    ? 'Nada que limpiar.'
    : APPLY
      ? `${safe.length} fila(s) limpiadas · ${review.length} a revisión manual.`
      : 'Simulacro: no se ha escrito nada.',
)
