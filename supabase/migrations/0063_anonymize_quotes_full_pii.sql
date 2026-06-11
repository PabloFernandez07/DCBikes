-- 0063_anonymize_quotes_full_pii.sql
-- A-1 (auditoría legal 2026-06-11): la anonimización por retención de
-- quote_requests solo cubría `message`, dejando email, phone, consent_ip y
-- consent_user_agent intactos indefinidamente — incumplía RGPD art. 5.1.e
-- (limitación del plazo de conservación): el email/teléfono identifican al
-- interesado igual o más que el mensaje libre.
--
-- Amplía anonymize_old_quote_messages() (0040) para purgar TODA la PII de la
-- solicitud, alineada con lo que hace data-retention-cron en el resto de
-- tablas (stock_alerts/customer_sessions):
--   email              → '[purgado]'  (columna NOT NULL → marcador)
--   phone              → null
--   consent_ip         → null
--   consent_user_agent → null
--   message            → marcador estándar (igual que 0040)

create or replace function anonymize_old_quote_messages() returns void
language sql
security definer
set search_path = public
as $$
  update quote_requests
  set message = '[anonimizado por retención RGPD art. 5.1.e]',
      email = '[purgado]',
      phone = null,
      consent_ip = null,
      consent_user_agent = null,
      anonymized_at = now()
  where anonymized_at is null
    and created_at < now() - interval '1 year';
$$;

revoke all on function anonymize_old_quote_messages() from public;
grant execute on function anonymize_old_quote_messages() to service_role;

comment on function anonymize_old_quote_messages() is
  'X-12 + A-1: anonimiza TODA la PII (message, email, phone, consent_ip, '
  'consent_user_agent) de quote_requests con >1 año de antigüedad. Invocada '
  'por data-retention-cron. Mantiene la fila para estadística pero elimina '
  'cualquier dato identificable y registra el momento en anonymized_at.';
