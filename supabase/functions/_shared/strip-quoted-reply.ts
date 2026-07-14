// supabase/functions/_shared/strip-quoted-reply.ts
//
// Recorta el historial citado que los clientes de correo arrastran al responder.
// Sin esto, cada respuesta del cliente entraría en el hilo del panel con la
// conversación entera pegada debajo y sería ilegible a los dos mensajes.
//
// Está aquí (y no dentro de quote-inbound) porque lo usan tres sitios:
//   · supabase/functions/quote-inbound/index.ts   → al recibir el correo
//   · scripts/clean-quoted-replies.ts             → limpieza de lo ya guardado
//   · supabase/functions/_shared/strip-quoted-reply.test.ts → la batería de pruebas
// Un solo recortador: si la heurística cambia, cambia en los tres a la vez.
//
// ───────────────────────────────────────────────────────────────────────────
// EL FALLO QUE ARREGLA ESTA VERSIÓN (julio 2026, encontrado en verificación):
//
// La versión anterior CORTABA POR OFFSET: buscaba el primer marcador de cita y
// hacía `raw.slice(0, cut)` — o sea, tiraba TODO lo que hubiera de ahí a EOF sin
// mirar qué era. Eso da por supuesto que el cliente siempre escribe ARRIBA
// (top-posting). Cuando no lo hace, se le come el mensaje:
//
//     Hola, os contesto abajo:
//     El mar, 14 jul 2026 …, DC Bikes <info@…> escribió:
//     > ¿Qué talla necesitas?
//     Talla M.                            ← ESTO SE PERDÍA
//     > ¿Cuándo puedes pasar?
//     El jueves por la tarde.             ← Y ESTO
//
// El comercio abría el hilo, leía «Hola, os contesto abajo:» y el cliente se
// quedaba sin respuesta. Bastaba UNA línea que empezara por «>» en cualquier
// parte del correo para borrar todo lo que viniera después.
//
// AHORA NO SE CORTA: SE FILTRA. Se recorren las líneas y se eliminan solo los
// trozos que son historial, CONSERVANDO cualquier cosa del cliente que aparezca
// entre medias o debajo. Los marcadores se dividen en dos familias:
//
//   (A) DE LÍNEA — se quita la línea (o la ventana) y se sigue leyendo:
//       · líneas citadas «> …»
//       · la atribución («El mar, 14 jul … <info@…> escribió:»)
//       Detrás de una atribución SIEMPRE viene una cita «>» (Gmail, Apple Mail,
//       Thunderbird), que se quita sola por la primera regla. Lo que el cliente
//       escriba entre las citas SOBREVIVE. Este es el arreglo.
//
//   (B) TERMINALES — de ahí a EOF es historial, y se corta:
//       · «-----Mensaje original-----», «---------- Forwarded message ---------»
//       · la línea de guiones bajos de Outlook
//       · el bloque de cabeceras reenviadas (De:/Enviado:/Para:/Asunto:)
//       Aquí SÍ hay que cortar a EOF porque el historial de Outlook NO va
//       prefijado con «>»: es texto plano indistinguible del del cliente, y no
//       hay ninguna marca por línea a la que agarrarse. Por eso estos marcadores
//       tienen que ser de fiar: los dos primeros los escribe la máquina, nunca
//       una persona; y el bloque de cabeceras se exige ahora mucho más estrecho
//       (ver forwardHeaderBlockEndsAt).
//
// PRINCIPIO DE DISEÑO (el de antes, ahora sí cumplido): ante la duda, NO se
// corta. Un mensaje con algo de cola es feo; un mensaje truncado pierde lo que
// el cliente quería decir y nadie se entera de que falta. Además, quote-inbound
// guarda el cuerpo ORIGINAL en quote_messages.body_raw (migración 0076): si la
// heurística falla con un cliente de correo que no conocemos, el fallo es
// recuperable en vez de definitivo.
//
// INVARIANTE: si el cuerpo no tiene NINGÚN marcador, la salida es exactamente
// `raw.trim()`, byte a byte. Un mensaje limpio no se toca jamás.

/** Línea citada: «> ...». Se tolera una sangría mínima (algunos clientes la meten). */
const QUOTED_LINE = /^ {0,3}>/

/**
 * Separadores explícitos de historial. Los pone el propio cliente de correo,
 * no el usuario, así que aquí se puede cortar hasta EOF sin miedo.
 *   -----Mensaje original-----      (Outlook ES)
 *   -----Original Message-----      (Outlook EN)
 *   ---------- Forwarded message ---------  (Gmail)
 *   ---------- Mensaje reenviado ---------
 */
const HISTORY_SEPARATOR =
  /^\s*-{2,}\s*(?:mensaje original|original message|mensaje reenviado|forwarded message|ursprüngliche nachricht|message d'origine)\s*-{2,}\s*$/i

/** Separador de guiones bajos de Outlook (línea entera de «_»). */
const UNDERSCORE_SEPARATOR = /^\s*_{5,}\s*$/

/**
 * Contenedores de historial en HTML. Si el lector del buzón manda alguna vez el
 * `text/html` en vez del `text/plain`, el recortador de texto plano no reconoce
 * nada y el hilo entero entra como basura. Todos los clientes serios envuelven
 * el historial en uno de estos, así que se corta ahí.
 */
const HTML_QUOTE_MARKER =
  /<blockquote\b|<div[^>]*\b(?:gmail_quote|gmail_attr|moz-cite-prefix|OutlookMessageHeader)\b|<div[^>]*\bid=["']?(?:appendonsend|divRplyFwdMsg)\b/i

/* ─────────────────── Atribución («X escribió:») ─────────────────── */

/**
 * Palabra con la que abre la atribución en cada idioma. Por sí sola NO
 * significa nada: «El sillín me va bien» también empieza por «El». Es solo el
 * candidato; lo que decide es CLOSE + fecha + autor.
 */
const ATTRIBUTION_OPEN = /^\s*(?:el|on|le|am|il|em)\b/i

/**
 * Cierre de la atribución. Tiene que ser lo ÚLTIMO de la ventana: la
 * atribución es una línea suelta, no una frase dentro de un párrafo.
 *   ES «escribió:» · EN «wrote:» · FR «a écrit :» · DE «schrieb:»/«geschrieben:»
 *   IT «ha scritto:» · PT «escreveu:»
 */
const ATTRIBUTION_CLOSE =
  /(?:escribi[oó]|wrote|a\s+écrit|schrieb|geschrieben|ha\s+scritto|escreveu)\s*:\s*$/i

/**
 * Fecha u hora dentro de la ventana: la atribución SIEMPRE lleva cuándo se
 * escribió el mensaje anterior.
 *
 * OJO con el año a secas. Antes valía `\b(?:19|20)\d{2}\b` y eso, EN UNA TIENDA
 * DE BICIS, casa con cualquier PRECIO: «2000 euros», «1999 €», «2050». La señal
 * que se supone que salva el texto legítimo se satisfacía sola en el dominio del
 * cliente. Ahora el año solo cuenta si viene ACOMPAÑADO de un mes o de una fecha
 * numérica — o sea, si de verdad parece una fecha.
 */
const TIME_HINT = /\b\d{1,2}\s*[:.h]\s*\d{2}\b/
const YEAR_HINT = /\b(?:19|20)\d{2}\b/
const MONTH_HINT =
  /\b(?:ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|jan|apr|aug|dec|gen|mag|giu|lug|ott|janv|févr|avr|juin|juil|août|sept|déc|jän|mär|okt|dez)[a-zà-ÿ]*\.?/i
const NUMERIC_DATE_HINT = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/

function hasDateHint(window: string): boolean {
  if (TIME_HINT.test(window)) return true
  if (NUMERIC_DATE_HINT.test(window)) return true
  return YEAR_HINT.test(window) && MONTH_HINT.test(window)
}

/**
 * Autor del mensaje citado: su dirección de correo. La atribución de Gmail,
 * Outlook y Apple Mail siempre la lleva («… DC Bikes <info@dcbikescantabria.com>
 * escribió:»).
 *
 * Es la condición que remata la seguridad. Sin ella, una frase legítima como
 *     «El técnico me llamó a las 10:30 y en el correo me escribió:»
 * (empieza por «El», lleva hora, acaba en «escribió:») se cortaría, y nos
 * comeríamos lo que el cliente decía justo debajo. Con ella, no.
 *
 * Los pocos clientes que firman la atribución solo con el nombre (Thunderbird)
 * se recogen por la otra vía: ver `attributionEndsAt`.
 */
const AUTHOR_HINT = /[\w.+-]+@[\w-]+\.[\w.-]*\w/

/** La atribución de Gmail parte en 2 líneas; 5 dan margen para clientes más verbosos. */
const ATTRIBUTION_MAX_LINES = 5
/** Y un tope de longitud: si la «atribución» ocupa 400+ caracteres, no lo es. */
const ATTRIBUTION_MAX_CHARS = 400

/* ─────────────────── Cabeceras reenviadas (Outlook) ─────────────────── */

/**
 * Claves de cabecera de un mensaje reenviado/citado por Outlook:
 *
 *     De: DC Bikes Cantabria <info@dcbikescantabria.com>
 *     Enviado el: martes, 14 de julio de 2026 19:50
 *     Para: cliente@example.com
 *     Asunto: Re: Consulta
 */
const FORWARD_HEADER =
  /^\s*(?:de|from|von|para|to|an|enviado(?:\s+el)?|sent|gesendet|asunto|subject|betreff|fecha|date|cc|cco|bcc|responder\s+a|reply-to)\s*:\s/i

/** La clave normalizada de una línea de cabecera, o null si no lo es. */
function headerKey(text: string): string | null {
  if (!FORWARD_HEADER.test(text)) return null
  const m = text.match(/^\s*([a-zà-ÿ' -]+?)\s*:\s/i)
  return m ? m[1].toLowerCase().replace(/\s+/g, ' ') : null
}

/* ─────────────────── Motor ─────────────────── */

type Line = { text: string; eol: string }

/**
 * Parte el texto en líneas guardando el TERMINADOR de cada una. Hay que
 * conservarlo: el cuerpo que llega puede ser CRLF (Gmail) o LF, y al volver a
 * unir las líneas que sobreviven no se puede normalizar a la brava el salto de
 * línea de un mensaje de un cliente.
 */
function splitLines(raw: string): Line[] {
  const out: Line[] = []
  const re = /\r\n|\r|\n/g
  let start = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    out.push({ text: raw.slice(start, m.index), eol: m[0] })
    start = m.index + m[0].length
  }
  out.push({ text: raw.slice(start), eol: '' })
  return out
}

/** Una línea sin contenido real (espacios, o el BOM que mete Apple Mail). */
function isBlank(text: string): boolean {
  return text.trim() === ''
}

/** ¿La siguiente línea con contenido es una cita («> …»)? */
function quotedLineFollows(lines: Line[], from: number): boolean {
  for (let j = from; j < lines.length; j++) {
    if (isBlank(lines[j].text)) continue
    return QUOTED_LINE.test(lines[j].text)
  }
  return false
}

/**
 * Si en `i` empieza una atribución, devuelve el índice de su ÚLTIMA línea; si
 * no, -1. Une la línea `i` con las siguientes hasta dar con el cierre, porque
 * Gmail la envuelve a ~78 columnas y llega partida. Para si encuentra una línea
 * en blanco: una atribución no tiene párrafos.
 *
 * Para darla por buena hacen falta las CUATRO señales, no una:
 *   1. abre por «El»/«On»/…                    (ATTRIBUTION_OPEN)
 *   2. cierra en «escribió:»/«wrote:»/… y ahí se acaba la línea  (ATTRIBUTION_CLOSE)
 *   3. lleva fecha u hora de verdad            (hasDateHint)
 *   4. lleva la dirección del autor citado     (AUTHOR_HINT)
 *      …o, en su defecto, debajo empieza la cita con «>» — así se recogen los
 *      clientes que solo ponen el nombre (Thunderbird) sin abrir la mano con
 *      el texto normal.
 *
 * Devolver el FINAL de la ventana (y no el offset del principio, como antes) es
 * lo que permite quitar solo la atribución y seguir leyendo lo de debajo.
 */
function attributionEndsAt(lines: Line[], i: number): number {
  if (!ATTRIBUTION_OPEN.test(lines[i].text)) return -1

  let window = lines[i].text.trim()
  for (let j = i; j < Math.min(i + ATTRIBUTION_MAX_LINES, lines.length); j++) {
    if (j > i) {
      const next = lines[j].text
      if (isBlank(next)) break // línea en blanco → ya no es la misma atribución
      window = `${window} ${next.trim()}`
    }
    if (window.length > ATTRIBUTION_MAX_CHARS) return -1
    if (!ATTRIBUTION_CLOSE.test(window) || !hasDateHint(window)) continue
    return AUTHOR_HINT.test(window) || quotedLineFollows(lines, j + 1) ? j : -1
  }
  return -1
}

/**
 * Si en `i` empieza un bloque de cabeceras reenviadas, devuelve el índice de su
 * última línea; si no, -1.
 *
 * MUCHO más estrecho que antes, y a propósito. La versión vieja cortaba con DOS
 * coincidencias de FORWARD_HEADER en una ventana de 6 líneas… y «Para:»,
 * «Fecha:» y «Asunto:» son exactamente como escribe un cliente una ficha de
 * datos:
 *
 *     Hola, os detallo lo que busco:
 *     Para: mi hijo de 12 años
 *     Fecha: la necesito antes del 20 de agosto
 *
 * Eso se cortaba a EOF y el pedido entero desaparecía. Ahora se exige que el
 * bloque parezca de verdad generado por un cliente de correo:
 *   · ≥2 líneas de cabecera CONSECUTIVAS (Outlook las emite pegadas, sin huecos),
 *   · con ≥2 claves DISTINTAS,
 *   · y con una dirección de correo dentro del bloque — De:/From:/Para:/To:
 *     SIEMPRE la llevan, y una persona enumerando lo que quiere, no.
 */
function forwardHeaderBlockEndsAt(lines: Line[], i: number): number {
  const keys = new Set<string>()
  let block = ''
  let j = i
  for (; j < lines.length; j++) {
    const key = headerKey(lines[j].text)
    if (!key) break
    keys.add(key)
    block += ` ${lines[j].text}`
  }
  const end = j - 1
  if (end <= i) return -1 // una sola cabecera no es un bloque
  if (keys.size < 2) return -1 // …ni la misma clave repetida
  if (!AUTHOR_HINT.test(block)) return -1 // …ni un bloque sin ninguna dirección
  return end
}

/**
 * Vuelve a unir las líneas que sobreviven, colapsando los huecos que deja lo
 * eliminado (dos o más líneas en blanco seguidas → una). Es solo cosmético: no
 * quita contenido, solo el espacio en blanco que aparece donde estaba la cita.
 */
function joinCollapsingBlanks(kept: Line[]): string {
  let out = ''
  let blankRun = 0
  for (const line of kept) {
    if (isBlank(line.text)) {
      blankRun++
      if (blankRun > 1) continue
    } else {
      blankRun = 0
    }
    out += line.text + (line.eol || '\n')
  }
  return out
}

/** Lo que el recortador ha decidido: el cuerpo limpio y lo que ha quitado. */
export interface StripResult {
  /** El cuerpo del cliente, sin el historial citado. */
  clean: string
  /** Los trozos eliminados, en orden. Vacío si no se tocó nada. */
  removed: string[]
  /** true si se cortó a EOF por un marcador terminal (separador/cabeceras/HTML). */
  truncatedTail: boolean
}

/**
 * El recortador de verdad. `stripQuotedReply` es el envoltorio cómodo; esto
 * devuelve además QUÉ se ha quitado, que es lo que necesita el script de
 * limpieza para no reescribir a ciegas el mensaje de un cliente en producción.
 */
export function analyzeQuotedReply(raw: string): StripResult {
  if (!raw) return { clean: '', removed: [], truncatedTail: false }

  const removed: string[] = []
  let truncatedTail = false

  // Si el cuerpo viene en HTML, el historial va dentro de un <blockquote> o de
  // un <div class="gmail_quote">: se corta ahí y el resto se trata como siempre.
  const html = HTML_QUOTE_MARKER.exec(raw)
  let source = raw
  if (html && html.index >= 0) {
    source = raw.slice(0, html.index)
    removed.push(raw.slice(html.index))
    truncatedTail = true
  }

  const lines = splitLines(source)
  const drop = new Array<boolean>(lines.length).fill(false)
  let cutFrom = lines.length

  for (let i = 0; i < lines.length; i++) {
    const { text } = lines[i]

    // ── (A) Marcadores DE LÍNEA: se quita esto y se sigue leyendo lo de abajo.
    // Se comprueban ANTES que los terminales para que una cabecera o un
    // separador que vengan CITADOS («> De: …», «> ----- Mensaje original -----»,
    // el historial de un hilo de tres) no se confundan con los de verdad.
    if (QUOTED_LINE.test(text)) {
      drop[i] = true
      removed.push(text)
      continue
    }

    const attrEnd = attributionEndsAt(lines, i)
    if (attrEnd >= 0) {
      for (let j = i; j <= attrEnd; j++) {
        drop[j] = true
        removed.push(lines[j].text)
      }
      i = attrEnd
      continue
    }

    // ── (B) Marcadores TERMINALES: de aquí a EOF es historial.
    const fwdEnd = forwardHeaderBlockEndsAt(lines, i)
    if (HISTORY_SEPARATOR.test(text) || UNDERSCORE_SEPARATOR.test(text) || fwdEnd >= 0) {
      cutFrom = i
      truncatedTail = true
      for (let j = i; j < lines.length; j++) removed.push(lines[j].text)
      break
    }
  }

  if (removed.length === 0) {
    // Ni un marcador: el cuerpo sale exactamente como entró. Invariante.
    return { clean: raw.trim(), removed: [], truncatedTail: false }
  }

  const kept = lines.filter((_, i) => i < cutFrom && !drop[i])
  const clean = joinCollapsingBlanks(kept).trim()

  // Si el recorte dejara el cuerpo vacío (un correo que es SOLO cita), se
  // devuelve el original: mejor que el admin vea algo raro a que vea una fila
  // en blanco.
  if (!clean) return { clean: raw.trim(), removed: [], truncatedTail: false }

  return { clean, removed: removed.filter(l => !isBlank(l)), truncatedTail }
}

/** Devuelve solo lo que ha escrito el cliente, sin el historial citado. */
export function stripQuotedReply(raw: string): string {
  return analyzeQuotedReply(raw).clean
}
