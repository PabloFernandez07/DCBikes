-- 0012_data_retention_cron.sql
-- Cron diario que ejecuta retention policies:
--   - Borrar customer_sessions expiradas hace >30 días.
--   - Anonimizar raw_payload de payments_log con >6 años de antigüedad.
--
-- ⚠️ IMPORTANTE — Esta migración es un TEMPLATE. Antes de aplicar, reemplaza:
--   <PROJECT_REF>       → ref del proyecto Supabase (p.ej. zdfzxjnuksuyagdqoouu)
--   <SERVICE_ROLE_KEY>  → service role key del proyecto (solo si lo prefieres
--                         a CRON_SECRET; ver edge function data-retention-cron)
--   <CRON_SECRET>       → secreto compartido configurado en env var
--                         `CRON_SECRET` de la edge function data-retention-cron.
--
-- Requisitos previos:
--   1. Proyecto Supabase en plan Pro (pg_cron + pg_net).
--   2. Edge function `data-retention-cron` desplegada.
--   3. Env var `CRON_SECRET` configurada en la edge function.

-- ════════════════════════════════════════════════════════════════
-- ─── Extensiones ────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ════════════════════════════════════════════════════════════════
-- ─── Schedule: diario a las 03:00 UTC ───────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Eliminar primero si ya existe (idempotencia al reaplicar).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'data-retention-cron-job') then
    perform cron.unschedule('data-retention-cron-job');
  end if;
end $$;

select cron.schedule(
  'data-retention-cron-job',
  '0 3 * * *',  -- 3:00 AM UTC cada día
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/data-retention-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <CRON_SECRET>'
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
-- Para comprobar que el job está activo:
--   select * from cron.job where jobname = 'data-retention-cron-job';
--
-- Para ver el historial de ejecuciones:
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname='data-retention-cron-job')
--     order by start_time desc limit 20;
--
-- Para desactivar temporalmente:
--   select cron.unschedule('data-retention-cron-job');
