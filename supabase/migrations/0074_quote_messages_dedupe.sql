-- 0074_quote_messages_dedupe.sql
-- Blinda el hilo contra mensajes entrantes duplicados.
--
-- El lector del buzón (Apps Script / n8n / cron) puede reenviar el mismo
-- correo más de una vez: si el POST llega pero la respuesta se pierde, el
-- lector lo reintenta creyendo que falló. Sin esto, la misma respuesta del
-- cliente aparecería dos veces en el hilo.
--
-- La defensa va aquí y no en el lector, porque así vale para cualquier lector
-- que enganchemos ahora o después: la idempotencia es del servidor.
--
-- email_id guarda el id del correo en su origen (el de Resend en los
-- salientes, el de Gmail en los entrantes). Son espacios de ids distintos, no
-- colisionan entre sí.

create unique index if not exists quote_messages_email_id_uniq
  on quote_messages (email_id)
  where email_id is not null;

comment on index quote_messages_email_id_uniq is
  'Idempotencia: el mismo correo no puede entrar dos veces en el hilo aunque '
  'el lector del buzón reintente. quote-inbound trata el 23505 como «ya '
  'estaba» y responde ok.';
