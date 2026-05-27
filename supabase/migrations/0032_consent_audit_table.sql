-- 0032_consent_audit_table.sql
-- Hallazgo Q-04 (auditoría V5): auditoría inmutable de consentimientos.
--
-- RGPD art. 7.1: "el responsable deberá ser capaz de demostrar que aquel
-- consintió el tratamiento de sus datos personales".
--
-- Esta tabla complementa las columnas consent_* de orders (0009_consent_audit.sql)
-- añadiendo una bitácora granular por acción de consentimiento (acepta términos,
-- confirma lectura privacidad, revoca marketing, solicita export/erasure, etc.).
-- A diferencia de orders.consent_*, aquí se registra cada evento por separado
-- con su versión, base legal y momento exacto.
--
-- Inmutabilidad estricta:
--   - SELECT: solo is_admin() (authenticated)
--   - INSERT: solo service_role (edge functions con SERVICE_ROLE_KEY)
--   - UPDATE / DELETE: REVOKE explícito para todos los roles aplicativos.
--   Solo el superuser de Postgres (no expuesto) puede modificar/borrar.

create table if not exists consent_audit (
  id              bigserial primary key,
  order_id        uuid references orders(id) on delete set null,
  customer_email  text not null,
  consent_type    text not null check (consent_type in (
    'terms','privacy','cookies','marketing','data_export','data_erasure'
  )),
  consent_version text not null,
  consent_action  text not null check (consent_action in (
    'grant','revoke','confirm_read'
  )),
  ip_address      text,
  user_agent      text,
  occurred_at     timestamptz not null default now()
);

create index if not exists consent_audit_email_idx
  on consent_audit(customer_email);
create index if not exists consent_audit_order_idx
  on consent_audit(order_id);
create index if not exists consent_audit_occurred_idx
  on consent_audit(occurred_at desc);

alter table consent_audit enable row level security;

-- SELECT: solo administradores (mismo patrón que payments_log/invoices)
drop policy if exists consent_audit_admin_select on consent_audit;
create policy consent_audit_admin_select on consent_audit
  for select to authenticated
  using (is_admin());

-- INSERT: solo service_role (edge functions order-place / customer-magic-link-request)
drop policy if exists consent_audit_service_insert on consent_audit;
create policy consent_audit_service_insert on consent_audit
  for insert to service_role
  with check (true);

-- Inmutabilidad: revocar UPDATE y DELETE para todos los roles aplicativos.
revoke update, delete on consent_audit from anon, authenticated, service_role;

comment on table consent_audit is
  'Auditoría inmutable de consentimientos (Q-04 V5). RGPD art. 7.1 prueba probatoria. Sin UPDATE/DELETE.';
comment on column consent_audit.consent_type is
  'Tipo de consentimiento: terms, privacy, cookies, marketing, data_export, data_erasure.';
comment on column consent_audit.consent_action is
  'Acción: grant (otorga), revoke (revoca), confirm_read (declara lectura — no consentimiento RGPD).';
comment on column consent_audit.consent_version is
  'Versión del documento legal vigente (ej. 2026-05-27-v5).';
