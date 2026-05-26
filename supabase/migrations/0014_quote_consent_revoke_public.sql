-- 0014_quote_consent_revoke_public.sql
-- 1. Añade columnas para prueba probatoria del consentimiento (art. 7.1 RGPD).
-- 2. Revoca la policy pública de INSERT en quote_requests.
--    Los INSERTs pasarán por la edge function quote-submit (service_role).

alter table quote_requests
  add column if not exists consent_ip text,
  add column if not exists consent_user_agent text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_version text;

create index if not exists idx_quote_requests_consent_ip_created
  on quote_requests(consent_ip, created_at desc)
  where consent_ip is not null;

-- Revocar INSERT público (lo asume edge function con service_role)
-- Hay 2 variantes en BD: con espacios y con underscores. Dropear ambas.
drop policy if exists public_insert_quotes on quote_requests;
drop policy if exists "public insert quotes" on quote_requests;

comment on column quote_requests.consent_ip is 'IP capturada por edge function (art. 7.1 RGPD)';
comment on column quote_requests.consent_user_agent is 'UA capturado por edge function';
comment on column quote_requests.consent_at is 'Timestamp consentimiento';
comment on column quote_requests.consent_version is 'Versión política privacidad vigente';
