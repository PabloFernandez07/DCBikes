-- 0058_stock_alerts.sql
-- Feature "Avísame cuando esté disponible": tabla de alertas de stock por talla.
--
-- Flujo:
--   1. El visitante se suscribe desde la ficha de producto (talla sin stock).
--   2. La edge function `stock-alert-submit` inserta aquí con service_role.
--   3. El cron `stock-alert-cron-job` (cada 5 min) invoca `stock-alert-cron`
--      → `send-stock-alert`, que sella notified_at y envía el email.
--   4. El interesado puede darse de baja vía enlace en el email
--      → `stock-alert-unsubscribe` fija revoked_at.
--   5. `data-retention-cron` purga el email de las filas revocadas o antiguas.
--
-- Base legal: consentimiento explícito (RGPD art. 6.1.a).
--   - revoked_at: revocación → purga en ≤ 7 días (art. 17.1.b).
--   - purged_at:  retención máxima 13 meses (art. 5.1.e).
--
-- Idempotente (IF NOT EXISTS / DO $$).

-- ════════════════════════════════════════════════════════════════
-- ─── Extensiones ────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create extension if not exists "pgcrypto";
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ════════════════════════════════════════════════════════════════
-- ─── Tabla stock_alerts ─────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists stock_alerts (
  id                uuid        primary key default gen_random_uuid(),
  product_id        uuid        not null references products(id) on delete cascade,
  email             text        not null,
  unsubscribe_token text        not null unique,

  -- Prueba probatoria del consentimiento (RGPD art. 7.1)
  consent_ip        text,
  consent_user_agent text,
  consent_at        timestamptz,
  consent_version   text,

  created_at        timestamptz default now(),

  -- Ciclo de vida de la alerta
  notified_at       timestamptz,  -- sellado antes de enviar email (anti-reenvío)
  revoked_at        timestamptz,  -- interesado revocó consentimiento
  purged_at         timestamptz   -- cron anonimizó el email (RGPD art. 5.1.e)
);

comment on table stock_alerts is
  'Suscripciones "Avísame cuando esté disponible". Insert vía service_role (edge function). RLS admin para SELECT/UPDATE.';
comment on column stock_alerts.unsubscribe_token is
  'Token aleatorio hex-32B para enlace de baja. Único en tabla.';
comment on column stock_alerts.notified_at is
  'Sellado ANTES de enviar el email para evitar reenvíos (anti-carrera). NULL = pendiente de notificación.';
comment on column stock_alerts.revoked_at is
  'Timestamp de revocación de consentimiento. Dispara purga en ≤ 7 días (RGPD art. 17.1.b).';
comment on column stock_alerts.purged_at is
  'Timestamp en el que el cron anonimizó el email. NULL = aún contiene email original (RGPD art. 5.1.e).';

-- ════════════════════════════════════════════════════════════════
-- ─── Índice único parcial (idempotente) ─────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Garantiza que no pueda haber dos suscripciones activas para el mismo
-- par (product_id, email normalizado). "Activa" = no notificada y no revocada.
-- El INSERT de la edge function hace ON CONFLICT contra este índice.
create unique index if not exists stock_alerts_active_uniq
  on stock_alerts (product_id, lower(email))
  where notified_at is null and revoked_at is null;

-- ════════════════════════════════════════════════════════════════
-- ─── Índices operacionales ──────────────────────────────────────
-- ════════════════════════════════════════════════════════════════

-- Cron / send-stock-alert: busca alertas pendientes de notificación por producto
create index if not exists stock_alerts_pending_product_idx
  on stock_alerts (product_id)
  where notified_at is null and revoked_at is null;

-- stock-alert-unsubscribe: lookup por token
create index if not exists stock_alerts_token_idx
  on stock_alerts (unsubscribe_token);

-- data-retention-cron: cola de revocadas pendientes de purga
create index if not exists stock_alerts_revoked_idx
  on stock_alerts (revoked_at)
  where revoked_at is not null;

-- data-retention-cron: cola de antiguas pendientes de purga
create index if not exists stock_alerts_purged_idx
  on stock_alerts (purged_at)
  where purged_at is null;

-- ════════════════════════════════════════════════════════════════
-- ─── RLS ────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- INSERT: ninguna policy pública. El insert lo hace la edge function
-- stock-alert-submit con service_role (bypassa RLS).
-- SELECT / UPDATE: solo admin (is_admin()), igual que quote_requests.

alter table stock_alerts enable row level security;

-- Nombres de policy: mismo patrón que quote_requests en 0013_admin_users.sql
drop policy if exists stock_alerts_select_admin on stock_alerts;
drop policy if exists stock_alerts_update_admin on stock_alerts;

create policy stock_alerts_select_admin on stock_alerts
  for select to authenticated
  using (is_admin());

create policy stock_alerts_update_admin on stock_alerts
  for update to authenticated
  using (is_admin())
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── Cron: stock-alert-cron-job cada 5 minutos ──────────────────
-- ════════════════════════════════════════════════════════════════
-- Mismo mecanismo que order-auto-cancel-job y data-retention-cron-job
-- en 0021_cron_vault_secrets.sql: pg_cron + pg_net + vault.decrypted_secrets.
-- El secreto `stock_alert_cron_secret` debe existir en Vault antes de
-- aplicar esta migración (ver runbook de cron-vault-setup.md).
--
-- PRERREQUISITO MANUAL en SQL Studio:
--   select vault.create_secret('stock-alert-cron-job-secret', 'stock_alert_cron_secret');
-- (mismo patrón que data_retention_cron_secret y order_cron_secret)

do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'stock-alert-cron-job';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'stock-alert-cron-job',
  '*/5 * * * *',
  $$
    select net.http_post(
      url     := (
        select 'https://' || decrypted_secret || '.supabase.co/functions/v1/stock-alert-cron'
        from vault.decrypted_secrets
        where name = 'supabase_project_ref'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'stock_alert_cron_secret'
        )
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

-- ════════════════════════════════════════════════════════════════
-- ─── Verificación ───────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Confirmar job activo:
--   select jobname, schedule, active from cron.job where jobname = 'stock-alert-cron-job';
--
-- Confirmar secreto en Vault:
--   select name from vault.secrets where name = 'stock_alert_cron_secret';
--
-- Ver historial de ejecuciones:
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'stock-alert-cron-job')
--     order by start_time desc limit 20;
