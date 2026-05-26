-- 0009_consent_audit.sql
-- Refuerza prueba probatoria del consentimiento del cliente en cada pedido.
-- Cumple art. 7.1 RGPD ("el responsable deberá ser capaz de demostrar que aquel
-- consintió el tratamiento de sus datos personales").

alter table orders
  add column if not exists consent_ip text,
  add column if not exists consent_user_agent text,
  add column if not exists consent_terms_version text,
  add column if not exists consent_privacy_version text;

-- Índice por IP para investigaciones futuras de fraude (opcional, pero útil).
create index if not exists idx_orders_consent_ip on orders(consent_ip)
  where consent_ip is not null;

comment on column orders.consent_ip is 'IP del cliente al aceptar términos (RGPD art. 7.1 - prueba consentimiento)';
comment on column orders.consent_user_agent is 'User-Agent del cliente al aceptar términos';
comment on column orders.consent_terms_version is 'Versión de los Términos vigente al momento del consentimiento';
comment on column orders.consent_privacy_version is 'Versión de la Política de Privacidad vigente al momento del consentimiento';
