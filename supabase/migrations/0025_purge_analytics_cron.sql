-- 0025_purge_analytics_cron.sql
-- Cierre del hallazgo P-09 (auditoría legal V3): plazo conservación analítico.
-- RAT 2.4 declara conservación de datos analíticos a 13 meses.
-- Este cron elimina/anonimiza product_views y search_queries antiguos.
--
-- Mecanismo: pg_cron diario a las 03:30 (offset respecto a data-retention-cron 03:00).
-- Secrets vía vault (ver Docs/runbooks/cron-vault-setup.md, mismo patrón S-02).

create extension if not exists pg_cron;

-- Función SQL que purga datos analíticos > 13 meses
create or replace function purge_analytics_older_than_13_months()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - interval '13 months';
  views_deleted int := 0;
  queries_deleted int := 0;
begin
  -- product_views: elimina filas > 13 meses (defensivo: solo si la tabla existe)
  if to_regclass('public.product_views') is not null then
    delete from product_views where created_at < cutoff;
    get diagnostics views_deleted = row_count;
  else
    raise notice 'purge_analytics: product_views no existe; purge skipped para esa tabla';
  end if;

  -- search_queries: elimina filas > 13 meses (defensivo: solo si la tabla existe)
  if to_regclass('public.search_queries') is not null then
    delete from search_queries where created_at < cutoff;
    get diagnostics queries_deleted = row_count;
  else
    raise notice 'purge_analytics: search_queries no existe; purge skipped para esa tabla';
  end if;

  raise notice 'purge_analytics: views=% queries=% cutoff=%', views_deleted, queries_deleted, cutoff;
end $$;

comment on function purge_analytics_older_than_13_months() is
  'P-09 auditoría V3: purga datos analíticos > 13m (plazo RAT 2.4 + art. 5.1.e RGPD).';

-- Schedule diario 03:30 UTC — idempotente: elimina job anterior antes de crear
do $$
declare
  job_id bigint;
begin
  select jobid into job_id from cron.job where jobname = 'purge-analytics-13m';
  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;
end $$;

select cron.schedule(
  'purge-analytics-13m',
  '30 3 * * *',
  $$select purge_analytics_older_than_13_months();$$
);

-- ════════════════════════════════════════════════════════════════
-- ─── Verificación ───────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Para comprobar que el job está activo:
--   select * from cron.job where jobname = 'purge-analytics-13m';
--
-- Para ver el historial de ejecuciones:
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'purge-analytics-13m')
--     order by start_time desc limit 20;
--
-- Para desactivar temporalmente:
--   select cron.unschedule('purge-analytics-13m');
