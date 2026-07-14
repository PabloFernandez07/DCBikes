// supabase/functions/_shared/strip-quoted-reply.test.ts
//
// Batería de pruebas del recortador de historial citado.
//
//   npx tsx supabase/functions/_shared/strip-quoted-reply.test.ts
//
// Los cuerpos son correos DE VERDAD (text/plain tal cual llega al buzón,
// saltos CRLF incluidos), no maquetas: el fallo que arreglamos venía
// justamente de probar con cuerpos idealizados de una sola línea.
//
// Tres familias de casos:
//   · CORTA  — historial citado que tiene que desaparecer.
//   · NO TOCA — texto legítimo del cliente que NO se puede truncar. Estos son
//     los importantes: un mensaje con cola es feo, uno truncado pierde la
//     intención del cliente y nadie se entera.
//   · CONSERVA LO DE DEBAJO — el cliente escribe DEBAJO de la cita (respuesta
//     intercalada, reenvío con comentario, PD). La versión vieja de esta batería
//     no tenía NI UNO de estos: todas sus trampas eran de falso positivo («no
//     cortes texto que PARECE una atribución»), ninguna probaba texto legítimo
//     situado DESPUÉS de una cita REAL. Por eso las 25 pruebas pasaban mientras
//     la función se comía la mitad de los correos.

import assert from 'node:assert/strict'
import { stripQuotedReply } from './strip-quoted-reply.ts'

type Case = { name: string; input: string; expected: string }

const cases: Case[] = [
  /* ─────────────── El fallo real de producción ─────────────── */
  {
    // Copiado literalmente de quote_messages en producción (id e7a5a11f…).
    // Gmail envuelve el text/plain a ~78 columnas, así que la atribución
    // llega PARTIDA: el «<» se queda al final de una línea y el
    // «info@…> escribió:» cae en la siguiente.
    name: 'Gmail ES · atribución partida en 2 líneas (regresión de producción)',
    input:
      'Prueba de chat\r\n\r\nEl El mar, 14 jul 2026 a las 19:50, DC Bikes Cantabria <\r\ninfo@dcbikescantabria.com> escribió:',
    expected: 'Prueba de chat',
  },
  {
    name: 'Gmail ES · atribución partida + cita «>» debajo',
    input: [
      'Perfecto, me paso el sábado por la mañana.',
      'Gracias!',
      '',
      'El mar, 14 jul 2026 a las 19:50, DC Bikes Cantabria <',
      'info@dcbikescantabria.com> escribió:',
      '',
      '> Hola,',
      '>',
      '> Gracias por contactar con DC Bikes Cantabria.',
      '> Tenemos la talla M disponible.',
      '>',
      '> ---',
      '> DC Bikes Cantabria',
    ].join('\r\n'),
    expected: 'Perfecto, me paso el sábado por la mañana.\r\nGracias!',
  },
  {
    name: 'Gmail ES · atribución partida en 3 líneas (nombre largo)',
    input: [
      'Me interesa, ¿cuánto costaría?',
      '',
      'El mar, 14 jul 2026 a las 19:50, DC Bikes Cantabria - Taller y Tienda de',
      'Bicicletas <',
      'info@dcbikescantabria.com> escribió:',
    ].join('\n'),
    expected: 'Me interesa, ¿cuánto costaría?',
  },
  {
    name: 'Gmail ES · atribución en una sola línea (no se rompe lo que ya iba)',
    input:
      'Vale, gracias.\n\nEl mié, 13 jul 2026 a las 10:23, DC Bikes <info@dcbikescantabria.com> escribió:\n\n> Buenos días',
    expected: 'Vale, gracias.',
  },

  /* ─────────────── Otros clientes ─────────────── */
  {
    name: 'Gmail EN · atribución partida',
    input: [
      'Sounds good, I will drop by on Saturday.',
      '',
      'On Tue, 14 Jul 2026 at 19:50, DC Bikes Cantabria <',
      'info@dcbikescantabria.com> wrote:',
      '',
      '> Hello, the bike is ready.',
    ].join('\r\n'),
    expected: 'Sounds good, I will drop by on Saturday.',
  },
  {
    name: 'Apple Mail ES · atribución + cita indentada',
    input: [
      '¿Tenéis la 27,5 en stock?',
      '',
      'Enviado desde mi iPhone',
      '',
      'El 14 jul 2026, a las 19:50, DC Bikes Cantabria <info@dcbikescantabria.com> escribió:',
      '',
      '﻿',
      '> Hola, sí, nos queda una.',
    ].join('\n'),
    // La firma del iPhone es del propio cliente: no se toca (cortar ahí sería
    // inventarse un marcador que no existe).
    expected: '¿Tenéis la 27,5 en stock?\n\nEnviado desde mi iPhone',
  },
  {
    name: 'Outlook ES · guiones bajos + cabeceras De:/Enviado el:/Para:/Asunto:',
    input: [
      'Buenos días,',
      '',
      'Confirmo la cita del jueves.',
      '',
      'Un saludo.',
      '',
      '________________________________',
      'De: DC Bikes Cantabria <info@dcbikescantabria.com>',
      'Enviado el: martes, 14 de julio de 2026 19:50',
      'Para: cliente@example.com',
      'Asunto: Re: Consulta sobre una Giant TCR',
      '',
      'Hola, tenemos hueco el jueves a las 10:00.',
    ].join('\r\n'),
    expected: 'Buenos días,\r\n\r\nConfirmo la cita del jueves.\r\n\r\nUn saludo.',
  },
  {
    name: 'Outlook ES · cabeceras sin separador de guiones bajos',
    input: [
      'De acuerdo, lo dejo el lunes en el taller.',
      '',
      'De: DC Bikes Cantabria <info@dcbikescantabria.com>',
      'Enviado: martes, 14 de julio de 2026 19:50',
      'Para: cliente@example.com',
      'Asunto: RE: Presupuesto',
      '',
      'Puedes traerla cuando quieras.',
    ].join('\r\n'),
    expected: 'De acuerdo, lo dejo el lunes en el taller.',
  },
  {
    name: 'Outlook EN · -----Original Message-----',
    input: [
      'Thanks, that works for me.',
      '',
      '-----Original Message-----',
      'From: DC Bikes Cantabria <info@dcbikescantabria.com>',
      'Sent: Tuesday, July 14, 2026 7:50 PM',
      'To: customer@example.com',
      'Subject: Re: Quote',
      '',
      'We have it in stock.',
    ].join('\r\n'),
    expected: 'Thanks, that works for me.',
  },
  {
    name: 'Outlook ES · -----Mensaje original-----',
    input:
      'Sí, adelante con la reparación.\r\n\r\n-----Mensaje original-----\r\nDe: DC Bikes <info@dcbikescantabria.com>\r\nAsunto: Presupuesto\r\n\r\nSerían 45 €.',
    expected: 'Sí, adelante con la reparación.',
  },
  {
    name: 'Gmail · ---------- Mensaje reenviado ---------',
    input: [
      'Os reenvío lo que me dijo el fabricante.',
      '',
      '---------- Mensaje reenviado ---------',
      'De: Giant Iberia <soporte@giant.example>',
      'Fecha: mar, 14 jul 2026',
      'Asunto: Garantía',
      '',
      'La garantía cubre el cuadro.',
    ].join('\n'),
    expected: 'Os reenvío lo que me dijo el fabricante.',
  },
  {
    name: 'Respuesta con «>» y sin ninguna atribución',
    input: 'Sí, me viene bien.\n\n> ¿Te va bien el jueves a las 10?\n> Un saludo',
    expected: 'Sí, me viene bien.',
  },
  {
    name: 'Thunderbird ES · atribución sin dirección de correo, pero con cita debajo',
    input: 'Perfecto.\n\nEl 14/7/26 a las 19:50, Marta Díaz escribió:\n> Te confirmo la cita.',
    expected: 'Perfecto.',
  },
  {
    name: 'Francés · a écrit :',
    input:
      'Merci, je passerai samedi.\n\nLe mar. 14 juil. 2026 à 19:50, DC Bikes <info@dcbikescantabria.com> a écrit :\n\n> Bonjour,',
    expected: 'Merci, je passerai samedi.',
  },
  {
    name: 'Alemán · schrieb:',
    input:
      'Danke, ich komme am Samstag.\n\nAm Di., 14. Juli 2026 um 19:50 Uhr schrieb DC Bikes <info@dcbikescantabria.com>:\n\n> Hallo,',
    // Aquí el cierre («schrieb:») NO va al final de la línea: va en medio y
    // detrás viene el remitente. No casa la atribución… pero la cita «>» de
    // debajo sí corta. Se queda una línea de cola: es EXACTAMENTE el
    // compromiso que queremos (cola sí, truncar no).
    expected:
      'Danke, ich komme am Samstag.\n\nAm Di., 14. Juli 2026 um 19:50 Uhr schrieb DC Bikes <info@dcbikescantabria.com>:',
  },

  /* ─────────────── Sin cita ─────────────── */
  {
    name: 'Respuesta limpia · sin ninguna cita',
    input:
      'Hola, quería saber si tenéis la Giant TCR en talla M y qué precio tendría con el descuento.\n\nGracias,\nJuan',
    expected:
      'Hola, quería saber si tenéis la Giant TCR en talla M y qué precio tendría con el descuento.\n\nGracias,\nJuan',
  },
  {
    name: 'Consulta original del formulario (así entra en el hilo)',
    input:
      'Nombre: Aroa Ortiz Otero\n\nBuenos días, tengo una Liv Intrigue E 2 de 2019 y he visto que hay un adaptador para cargar la batería fuera de la bici. ¿Sabéis si es original de Giant?',
    expected:
      'Nombre: Aroa Ortiz Otero\n\nBuenos días, tengo una Liv Intrigue E 2 de 2019 y he visto que hay un adaptador para cargar la batería fuera de la bici. ¿Sabéis si es original de Giant?',
  },

  /* ─────────────── TRAMPAS: texto legítimo que NO se puede tocar ─────────────── */
  {
    name: 'TRAMPA · «El sillín me va bien» (frase que abre por «El»)',
    input:
      'El sillín me va bien, pero el manillar me queda ancho.\n¿Podéis cambiarlo?',
    expected: 'El sillín me va bien, pero el manillar me queda ancho.\n¿Podéis cambiarlo?',
  },
  {
    name: 'TRAMPA · «El cuadro de 27,5 me interesa» (abre por «El» y lleva números)',
    input: 'El cuadro de 27,5 me interesa.\nEl de 29 lo veo grande para mi altura (1,70).',
    expected: 'El cuadro de 27,5 me interesa.\nEl de 29 lo veo grande para mi altura (1,70).',
  },
  {
    name: 'TRAMPA · abre por «El», lleva fecha Y hora, y ninguna palabra clave',
    input:
      'El lunes 20 de julio de 2026 a las 10:00 paso por la tienda a dejar la bici.\nSi no os viene bien, decidme.',
    expected:
      'El lunes 20 de julio de 2026 a las 10:00 paso por la tienda a dejar la bici.\nSi no os viene bien, decidme.',
  },
  {
    name: 'TRAMPA · abre por «El», lleva hora Y acaba en «escribió:» — pero sin autor',
    // La trampa más fina: tres de las cuatro señales. Falta la dirección del
    // autor citado y debajo no hay cita, así que NO se corta. Si se cortara,
    // nos comeríamos lo que el cliente cuenta a continuación, que es el meollo.
    input:
      'El técnico me llamó ayer a las 10:30 y en el correo me escribió:\n\nque la bici estaba lista, pero al recogerla el cambio seguía rozando.\n¿Podéis revisarlo?',
    expected:
      'El técnico me llamó ayer a las 10:30 y en el correo me escribió:\n\nque la bici estaba lista, pero al recogerla el cambio seguía rozando.\n¿Podéis revisarlo?',
  },
  {
    name: 'TRAMPA · «On Monday I wrote to you» (abre por «On» y lleva «wrote»)',
    input:
      'On Monday I wrote to you about the 2026 model, but nobody replied.\nCould you check?',
    expected:
      'On Monday I wrote to you about the 2026 model, but nobody replied.\nCould you check?',
  },
  {
    name: 'TRAMPA · una sola cabecera suelta escrita por el cliente',
    // «Fecha:» sola no es un bloque de cabeceras reenviadas: hacen falta dos.
    input: 'Os paso los datos de la compra.\n\nFecha: 14 de julio de 2026\n\nLa bici la compré en tienda, no online.',
    expected: 'Os paso los datos de la compra.\n\nFecha: 14 de julio de 2026\n\nLa bici la compré en tienda, no online.',
  },
  {
    name: 'TRAMPA · flecha «->» al principio de línea (no es una cita «>»)',
    input: 'Quiero dos cosas:\n-> Cambiar la cadena\n-> Ajustar el cambio trasero',
    expected: 'Quiero dos cosas:\n-> Cambiar la cadena\n-> Ajustar el cambio trasero',
  },
  {
    name: 'TRAMPA · el correo es SOLO cita (no dejamos la fila en blanco)',
    input: '> Hola, ¿sigues interesado?',
    expected: '> Hola, ¿sigues interesado?',
  },

  /* ───── EL FALLO GORDO: texto del cliente DEBAJO de una cita real ─────
   * Estos son los que se comía la versión de offset (`raw.slice(0, cut)`).
   * Son los dos patrones más caros para una tienda: la respuesta intercalada
   * (el cliente contesta punto por punto debajo de cada pregunta citada) y el
   * reenvío con el comentario debajo. */
  {
    name: 'INTERCALADA · el cliente contesta debajo de cada pregunta citada',
    input: [
      'Hola, os contesto abajo:',
      '',
      'El mar, 14 jul 2026 a las 19:50, DC Bikes Cantabria <',
      'info@dcbikescantabria.com> escribió:',
      '',
      '> ¿Qué talla necesitas?',
      'Talla M.',
      '',
      '> ¿Queréis que añada las luces al presupuesto?',
      'Sí, añadid también las luces.',
      '',
      '> ¿Cuándo puedes pasar por la tienda?',
      'El jueves por la tarde, sobre las 18h.',
    ].join('\r\n'),
    // Sobreviven las TRES respuestas. Antes sobrevivía solo «Hola, os contesto
    // abajo:» y el comercio se quedaba sin talla, sin luces y sin día.
    expected:
      'Hola, os contesto abajo:\r\n\r\nTalla M.\r\n\r\nSí, añadid también las luces.\r\n\r\nEl jueves por la tarde, sobre las 18h.',
  },
  {
    name: 'INTERCALADA · variante mínima, cita sin atribución y reclamación debajo',
    input: 'Hola\r\n\r\nEn vuestro correo ponía:\r\n> plazo 3 semanas\r\n\r\nHan pasado 6.',
    expected: 'Hola\r\n\r\nEn vuestro correo ponía:\r\n\r\nHan pasado 6.',
  },
  {
    name: 'REENVÍO · el cliente comenta DEBAJO de lo que le dijo el fabricante',
    input: [
      'Hola, os reenvío lo que me dijo el fabricante.',
      '',
      'El lun, 13 jul 2026 a las 9:00, Soporte Giant <soporte@giant.example> escribió:',
      '',
      '> La garantía cubre el cuadro',
      '',
      '¿Entonces me lo cubrís vosotros? La bici está partida por la potencia.',
    ].join('\r\n'),
    expected:
      'Hola, os reenvío lo que me dijo el fabricante.\r\n\r\n¿Entonces me lo cubrís vosotros? La bici está partida por la potencia.',
  },
  {
    name: 'RECLAMACIÓN · cita del plazo y exige la devolución debajo',
    input: [
      'Buenas,',
      '',
      'El mar, 14 jul 2026 a las 19:50, DC Bikes Cantabria <info@dcbikescantabria.com> escribió:',
      '',
      '> El plazo de entrega es de 3 semanas.',
      '',
      'Han pasado 6 semanas y sigo sin la bici. Pido la devolución del dinero.',
    ].join('\r\n'),
    expected:
      'Buenas,\r\n\r\nHan pasado 6 semanas y sigo sin la bici. Pido la devolución del dinero.',
  },
  {
    name: 'PD · el cliente añade una posdata DESPUÉS de la cita',
    input: [
      'Perfecto, me la quedo.',
      '',
      'El mar, 14 jul 2026 a las 19:50, DC Bikes <info@dcbikescantabria.com> escribió:',
      '',
      '> Te la reservamos hasta el viernes.',
      '',
      'PD: añadid también un casco talla L y unos guantes.',
    ].join('\r\n'),
    expected: 'Perfecto, me la quedo.\r\n\r\nPD: añadid también un casco talla L y unos guantes.',
  },

  /* ───── Las TRAMPAS nuevas que descubrió la verificación ───── */
  {
    name: 'TRAMPA · ficha de datos con «Para:» y «Fecha:» (bloque de cabeceras falso)',
    // Dos «cabeceras» seguidas, que es lo que exigía la regla vieja para cortar
    // a EOF. Pero no hay ninguna dirección de correo: no es un reenvío, es un
    // cliente enumerando lo que quiere. Antes se perdía TODO el pedido.
    input: [
      'Hola,',
      '',
      'Os detallo lo que busco:',
      'Para: mi hijo de 12 años',
      'Fecha: la necesito antes del 20 de agosto',
      'Asunto: bici de montaña, no muy pesada',
      '',
      'Mi teléfono es el 600 123 456.',
    ].join('\r\n'),
    expected: [
      'Hola,',
      '',
      'Os detallo lo que busco:',
      'Para: mi hijo de 12 años',
      'Fecha: la necesito antes del 20 de agosto',
      'Asunto: bici de montaña, no muy pesada',
      '',
      'Mi teléfono es el 600 123 456.',
    ].join('\r\n'),
  },
  {
    name: 'TRAMPA · un PRECIO no es una fecha («2000 euros» no basta para cortar)',
    // `\b(?:19|20)\d{2}\b` casaba con cualquier precio de tienda de bicis. Aquí
    // la frase abre por «El», acaba en «escribió:» y lleva «2000»… y aun así NO
    // se puede cortar: no hay ni fecha de verdad ni autor.
    input:
      'El comercial de la marca, cuando le dije que mi tope eran 2000 euros, me escribió:\n\nque con ese presupuesto no llegaba. ¿Vosotros qué me ofrecéis?',
    expected:
      'El comercial de la marca, cuando le dije que mi tope eran 2000 euros, me escribió:\n\nque con ese presupuesto no llegaba. ¿Vosotros qué me ofrecéis?',
  },

  /* ───── HTML: si el lector manda text/html en vez de text/plain ───── */
  {
    name: 'HTML · el historial va en un <blockquote> (no entra el churro entero)',
    input:
      '<div dir="ltr">Me interesa la Giant TCR en talla M.</div><br><div class="gmail_quote"><div dir="ltr" class="gmail_attr">El mar, 14 jul 2026 a las 19:50, DC Bikes &lt;info@dcbikescantabria.com&gt; escribió:<br></div><blockquote class="gmail_quote"><div>Hola, la tenemos en stock.</div></blockquote></div>',
    expected: '<div dir="ltr">Me interesa la Giant TCR en talla M.</div><br>',
  },

  /* ───── Pérdida ACOTADA y conocida (queda documentada, no es sorpresa) ───── */
  {
    name: 'VIÑETA «>» · se pierden las viñetas, pero NO lo que va debajo',
    // Un «>» al principio de línea es indistinguible de una cita: esas dos
    // líneas se pierden. Lo que ya NO se pierde es el resto del mensaje, que es
    // lo que antes se llevaba por delante (el presupuesto y el teléfono).
    // Por eso quote-inbound guarda además el cuerpo crudo en body_raw.
    input: [
      'Quiero presupuesto para:',
      '> Bici de carretera talla M',
      '> Casco y luces',
      '',
      'Mi presupuesto son 2000 euros. Mi teléfono es 600 123 456.',
    ].join('\r\n'),
    expected: 'Quiero presupuesto para:\r\n\r\nMi presupuesto son 2000 euros. Mi teléfono es 600 123 456.',
  },
]

let failed = 0
for (const c of cases) {
  const got = stripQuotedReply(c.input)
  const ok = got === c.expected
  if (!ok) failed++
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${c.name}`)
  if (!ok) {
    console.log(`        esperado: ${JSON.stringify(c.expected)}`)
    console.log(`        obtenido: ${JSON.stringify(got)}`)
  }
}

console.log(`\n${cases.length - failed}/${cases.length} pruebas pasadas`)
assert.equal(failed, 0, `${failed} prueba(s) fallidas`)
