-- 0028_fix_analytics_purge.sql
-- Hallazgo Q-02 (auditoría V5): la función purge_analytics_older_than_13_months()
-- definida en 0025 usaba la columna `created_at`, pero el esquema real de
-- product_views (0001_initial.sql) usa `viewed_at` y search_queries usa
-- `searched_at`. La función no purgaba nada porque la condición filtraba
-- por una columna inexistente — failure silencioso del cron.
--
-- Esta migración reescribe la función usando las columnas reales y mantiene
-- el patrón defensivo to_regclass() para no fallar si la tabla no existe.
-- Cumple art. 5.1.e RGPD (limitación del plazo) y RAT 2.4 (13 meses).

create or replace function purge_analytics_older_than_13_months()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cutoff timestamptz := now() - interval '13 months';
  views_deleted int := 0;
  queries_deleted int := 0;
begin
  -- product_views: columna real `viewed_at` (no `created_at`)
  if to_regclass('public.product_views') is not null then
    delete from product_views where viewed_at < cutoff;
    get diagnostics views_deleted = row_count;
  else
    raise notice 'purge_analytics: product_views no existe; purge skipped para esa tabla';
  end if;

  -- search_queries: columna real `searched_at` (no `created_at`)
  if to_regclass('public.search_queries') is not null then
    delete from search_queries where searched_at < cutoff;
    get diagnostics queries_deleted = row_count;
  else
    raise notice 'purge_analytics: search_queries no existe; purge skipped para esa tabla';
  end if;

  raise notice 'purge_analytics: views=% queries=% cutoff=%', views_deleted, queries_deleted, cutoff;
end $$;

comment on function purge_analytics_older_than_13_months() is
  'Q-02 V5: purga datos analíticos > 13m usando viewed_at/searched_at (cols reales). RGPD 5.1.e + RAT 2.4.';

-- Validación: invocar la función ahora para garantizar que ejecuta sin error
-- contra el esquema real. Si la columna fuera incorrecta, la migración fallaría.
do $$
begin
  perform purge_analytics_older_than_13_months();
end $$;
