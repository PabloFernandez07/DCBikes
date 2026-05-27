-- 0021_cron_vault_secrets.sql
-- Cierre del hallazgo S-02 (auditoría legal V3): secretos cron en Vault.
-- Las migraciones 0005 y 0012 fueron renombradas a .template.sql porque contenían
-- placeholders <SERVICE_ROLE_KEY>, <PROJECT_REF> y <CRON_SECRET> que nunca debieron
-- commitearse. Esta migración recrea los cron jobs leyendo secretos desde Supabase Vault.
--
-- PRERREQUISITO MANUAL (ejecutar en SQL Studio antes de aplicar esta migración):
--   ver Docs/runbooks/cron-vault-setup.md
--
-- NOTAS DE AJUSTE respecto al template original:
--   0005: jobname real era 'order-auto-cancel-job' (con sufijo -job)
--         auth: Bearer <SERVICE_ROLE_KEY> + header x-cron-secret: <CRON_SECRET>
--   0012: jobname real era 'data-retention-cron-job' (con sufijo -job)
--         auth: Bearer <CRON_SECRET> directamente (sin service_role_key separado)
--   Ambos timeouts preservados (30 000 ms y 60 000 ms respectivamente).

-- ════════════════════════════════════════════════════════════════
-- ─── Extensiones ────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ════════════════════════════════════════════════════════════════
-- ─── Limpia jobs previos si existían ────────────────────────────
-- ════════════════════════════════════════════════════════════════
do $$
declare
  job record;
begin
  for job in
    select jobid from cron.job
    where jobname in ('order-auto-cancel-job', 'data-retention-cron-job')
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

-- ════════════════════════════════════════════════════════════════
-- ─── order-auto-cancel-job: cada 30 min ─────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Cancela pedidos sin pago pendientes (libera pre-autorizaciones Redsys).
-- Auth: service_role_key como Bearer + x-cron-secret para validación adicional.
select cron.schedule(
  'order-auto-cancel-job',
  '*/30 * * * *',
  $$
    select net.http_post(
      url     := (
        select 'https://' || decrypted_secret || '.supabase.co/functions/v1/order-auto-cancel'
        from vault.decrypted_secrets
        where name = 'supabase_project_ref'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
        ),
        'x-cron-secret', (
          select decrypted_secret from vault.decrypted_secrets where name = 'order_cron_secret'
        )
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

-- ════════════════════════════════════════════════════════════════
-- ─── data-retention-cron-job: diario a las 03:00 UTC ────────────
-- ════════════════════════════════════════════════════════════════
-- Purga datos según RGPD art. 5.1.e:
--   - customer_sessions expiradas hace >30 días
--   - raw_payload de payments_log con >6 años de antigüedad
-- Auth: data_retention_cron_secret como Bearer token directo
--       (igual que el template original, que usaba <CRON_SECRET> como Bearer).
select cron.schedule(
  'data-retention-cron-job',
  '0 3 * * *',
  $$
    select net.http_post(
      url     := (
        select 'https://' || decrypted_secret || '.supabase.co/functions/v1/data-retention-cron'
        from vault.decrypted_secrets
        where name = 'supabase_project_ref'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'data_retention_cron_secret'
        )
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);

comment on extension pg_cron is 'Habilitado para data-retention-cron y order-auto-cancel';

-- ════════════════════════════════════════════════════════════════
-- ─── Verificación ───────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Confirmar jobs activos:
--   select jobname, schedule, active from cron.job
--   where jobname in ('order-auto-cancel-job', 'data-retention-cron-job');
--
-- Confirmar secretos en Vault:
--   select name from vault.secrets
--   where name in ('supabase_project_ref','service_role_key','order_cron_secret','data_retention_cron_secret');
