/**
 * DC Bikes — lector del buzón para el hilo de consultas.
 *
 * Corre en Google Apps Script DENTRO de la cuenta dcbikescantabria@gmail.com,
 * así que no hace falta darle acceso al buzón a nadie: ya es suyo. Sin Google
 * Cloud, sin OAuth, sin n8n.
 *
 * Qué hace: busca los correos SIN LEER cuyo destinatario lleva el token de una
 * consulta (…+q<token>@gmail.com) y los manda a la edge function quote-inbound,
 * que los coloca en el hilo correcto del panel.
 *
 * Los correos que NO llevan token ni se tocan: no se leen, no se marcan, no se
 * envían a ningún sitio. Solo viaja lo que es respuesta a una consulta.
 *
 * ─── Instalación (5 minutos) ──────────────────────────────────────────────
 *  1. Entra en https://script.google.com CON LA CUENTA dcbikescantabria@gmail.com
 *     (importante: si entras con otra cuenta, leerá el buzón equivocado).
 *  2. «Nuevo proyecto», borra lo que haya y pega este fichero entero.
 *  3. Rellena SECRETO abajo con el valor que te he dado.
 *  4. Guarda (💾) y pulsa «Ejecutar». Google te pedirá permiso para leer Gmail:
 *     acéptalo (te avisará de que la app «no está verificada» — es tuya, entra
 *     en «Configuración avanzada» → «Ir a …»).
 *  5. Menú izquierdo → «Activadores» (el reloj ⏰) → «Añadir activador»:
 *        Función:        revisarRespuestas
 *        Origen:         Basado en tiempo
 *        Tipo:           Temporizador por minutos
 *        Intervalo:      Cada minuto
 *     Guardar. Ya está: las respuestas entrarán solas en el panel.
 */

// ─── Configuración ─────────────────────────────────────────────────────────
const FUNCION_URL = 'https://zdfzxjnuksuyagdqoouu.supabase.co/functions/v1/quote-inbound';
const SECRETO     = 'PEGA_AQUÍ_EL_SECRETO';

// Cuántos hilos recientes mirar en cada pasada. 50 es de sobra para un minuto;
// si el script estuviera parado varios días, las pasadas siguientes van
// vaciando la cola porque solo mira lo no leído.
const MAX_HILOS = 50;

/** El token que send-reply-email pone en el Reply-To: buzon+q<12 hex>@dominio */
const PATRON_TOKEN = /[^\s,<]+\+q[a-f0-9]{12}@[^\s,>]+/i;

function revisarRespuestas() {
  const hilos = GmailApp.search('is:unread newer_than:7d', 0, MAX_HILOS);

  hilos.forEach(function (hilo) {
    hilo.getMessages().forEach(function (msg) {
      if (!msg.isUnread()) return;

      // ¿Va dirigido a una consulta concreta? Si no, no es asunto nuestro.
      const destinatarios = msg.getTo() + ',' + msg.getCc();
      const encontrado = destinatarios.match(PATRON_TOKEN);
      if (!encontrado) return;

      const respuesta = UrlFetchApp.fetch(FUNCION_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-quote-inbound-secret': SECRETO },
        payload: JSON.stringify({
          to:         encontrado[0],
          from:       msg.getFrom(),
          subject:    msg.getSubject(),
          body:       msg.getPlainBody(),
          message_id: msg.getId(),          // el servidor lo usa para no duplicar
        }),
        muteHttpExceptions: true,
      });

      const codigo = respuesta.getResponseCode();

      if (codigo < 300) {
        // Marcarlo leído es lo que evita reenviarlo en la pasada siguiente. Solo
        // se hace si el envío llegó: si falló, sigue sin leer y se reintenta
        // dentro de un minuto. Y si por lo que sea se enviara dos veces, el
        // servidor lo descarta por message_id, así que no habrá duplicados.
        msg.markRead();
        Logger.log('OK · ' + msg.getFrom() + ' → ' + respuesta.getContentText());
      } else {
        Logger.log('FALLO ' + codigo + ' · ' + msg.getFrom() + ' → ' + respuesta.getContentText());
      }
    });
  });
}

/**
 * Ejecuta esto UNA VEZ a mano (desplegable de arriba → probar → Ejecutar) para
 * comprobar que el secreto es correcto antes de montar el activador.
 * Debe salir «401» en el registro: significa que la función existe y responde,
 * pero rechaza a quien no trae el secreto bueno. Si sale 401 con el secreto
 * puesto, el secreto está mal copiado.
 */
function probarConexion() {
  const sinSecreto = UrlFetchApp.fetch(FUNCION_URL, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ to: 'x@y.z', body: 'test' }),
    muteHttpExceptions: true,
  });
  Logger.log('Sin secreto (debe ser 401): ' + sinSecreto.getResponseCode());

  const conSecreto = UrlFetchApp.fetch(FUNCION_URL, {
    method: 'post', contentType: 'application/json',
    headers: { 'x-quote-inbound-secret': SECRETO },
    payload: JSON.stringify({ to: 'sin+token@ejemplo.com', body: 'test' }),
    muteHttpExceptions: true,
  });
  Logger.log('Con secreto (debe ser 200 y decir «sin token»): '
    + conSecreto.getResponseCode() + ' ' + conSecreto.getContentText());
}
