-- 0073_quote_messages.sql
-- Hilo de conversación por consulta, visible SOLO en el admin (el cliente
-- sigue viendo correos normales, nunca un chat).
--
-- Hoy send-reply-email envía la respuesta y no la guarda en ningún sitio: no
-- queda rastro de qué se contestó ni cuándo. Esta tabla guarda cada mensaje
-- del hilo, entrante o saliente.
--
-- reply_token da a cada consulta una dirección de respuesta única
-- (buzon+q<token>@gmail.com en el Reply-To). Cuando el cliente responde, el
-- correo de vuelta lleva escrito a qué consulta pertenece, así que no hay que
-- adivinarlo por asunto ni por remitente.

create table if not exists quote_messages (
  id         uuid primary key default gen_random_uuid(),
  quote_id   uuid not null references quote_requests(id) on delete cascade,
  direction  text not null check (direction in ('in', 'out')),
  body       text not null,
  subject    text,
  email_id   text,                                   -- id del email en Resend (solo salientes)
  created_at timestamptz not null default now()
);

create index if not exists quote_messages_quote_created_idx
  on quote_messages (quote_id, created_at);

alter table quote_messages enable row level security;

-- Solo admins, en lectura y escritura. No hay policy pública: el hilo es
-- interno. La ingesta de respuestas entrantes va por service_role (edge
-- function), que se salta RLS.
drop policy if exists quote_messages_admin_all on quote_messages;
create policy quote_messages_admin_all on quote_messages
  for all to authenticated
  using (is_admin())
  with check (is_admin());

comment on table quote_messages is
  'Hilo de conversación de una consulta. direction=in son mensajes del cliente '
  '(el original + sus respuestas por email); direction=out son las respuestas '
  'enviadas desde el admin. Solo visible para admins.';

-- ─── Dirección de respuesta única por consulta ────────────────────────────
alter table quote_requests
  add column if not exists reply_token text unique default encode(gen_random_bytes(6), 'hex');

update quote_requests
   set reply_token = encode(gen_random_bytes(6), 'hex')
 where reply_token is null
   and anonymized_at is null;

comment on column quote_requests.reply_token is
  'Token de la dirección de respuesta única (Reply-To: buzon+q<token>@…). '
  'Permite atribuir al hilo correcto la respuesta que el cliente manda por '
  'email. Se purga al anonimizar.';

-- ─── El mensaje original pasa a ser el primer mensaje del hilo ────────────
-- Así el hilo se pinta de forma uniforme, sin tratar el original como un caso
-- aparte. Se excluyen las consultas ya anonimizadas por retención.
insert into quote_messages (quote_id, direction, body, created_at)
select q.id, 'in', q.message, q.created_at
  from quote_requests q
 where q.message is not null
   and q.message <> ''
   and q.anonymized_at is null
   and not exists (select 1 from quote_messages m where m.quote_id = q.id);

-- ─── Retención RGPD (art. 5.1.e) ──────────────────────────────────────────
-- El hilo es texto libre con PII y, a diferencia de quote_requests, no aporta
-- nada estadístico que conservar: al anonimizar la consulta se borra entero.
-- Sin esto, la purga de 0063 dejaría los datos personales vivos en la tabla
-- nueva, que es exactamente el fallo A-1 que corrigió esa migración.
create or replace function anonymize_old_quote_messages() returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from quote_messages m
   using quote_requests q
   where m.quote_id = q.id
     and q.anonymized_at is null
     and q.created_at < now() - interval '1 year';

  update quote_requests
     set message            = '[anonimizado por retención RGPD art. 5.1.e]',
         email              = '[purgado]',
         phone              = null,
         consent_ip         = null,
         consent_user_agent = null,
         reply_token        = null,
         anonymized_at      = now()
   where anonymized_at is null
     and created_at < now() - interval '1 year';
end;
$$;

revoke all on function anonymize_old_quote_messages() from public;
grant execute on function anonymize_old_quote_messages() to service_role;

comment on function anonymize_old_quote_messages() is
  'X-12 + A-1 + 0073: purga TODA la PII de quote_requests con >1 año '
  '(message, email, phone, consent_ip, consent_user_agent, reply_token) y '
  'borra el hilo completo en quote_messages. Invocada por data-retention-cron.';
