-- 0040_anonymize_old_quotes.sql
-- X-12 · Anonimización automática de mensajes en quote_requests
-- RGPD art. 5.1.e (limitación del plazo de conservación).
--
-- Tras 1 año desde su creación, los mensajes libres asociados a una solicitud
-- de presupuesto se sustituyen por un marcador estándar. La fila se conserva
-- por requisitos contables/estadísticos pero el contenido textual identificable
-- desaparece.
--
-- La función la invoca el cron `data-retention-cron` (ver S2-Q1).

alter table quote_requests
  add column if not exists anonymized_at timestamptz;

create or replace function anonymize_old_quote_messages() returns void
language sql
security definer
set search_path = public
as $$
  update quote_requests
  set message = '[anonimizado por retención RGPD art. 5.1.e]',
      anonymized_at = now()
  where message is not null
    and message <> '[anonimizado por retención RGPD art. 5.1.e]'
    and created_at < now() - interval '1 year';
$$;

revoke all on function anonymize_old_quote_messages() from public;
grant execute on function anonymize_old_quote_messages() to service_role;

comment on function anonymize_old_quote_messages() is
  'X-12: anonimiza mensajes de quote_requests con >1 año de antigüedad. '
  'Invocada por data-retention-cron. Mantiene la fila pero sustituye message '
  'por marcador estándar y registra el momento en anonymized_at.';
comment on column quote_requests.anonymized_at is
  'X-12: timestamp del momento en que el mensaje fue anonimizado por retención RGPD.';
