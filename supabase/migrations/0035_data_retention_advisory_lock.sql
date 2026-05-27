-- 0035_data_retention_advisory_lock.sql
-- Hallazgo Q-11 (auditoría V5): impedir ejecuciones solapadas del cron
-- `data-retention-cron`.
--
-- El cron de retención hace DELETE/UPDATE masivos sobre tablas grandes
-- (orders, payments_log, customer_sessions, quote_requests, etc.). Si dos
-- invocaciones se solapan (pg_cron disparando dos veces por reintento de
-- pg_net, o ejecución manual concurrente con la programada) podrían
-- generarse condiciones de carrera con triggers de auditoría o consumir
-- conexiones del pool de forma innecesaria.
--
-- Esta migración expone la RPC `try_data_retention_lock()` que envuelve
-- `pg_try_advisory_lock`. La edge function la invoca al inicio del handler
-- y, si devuelve false (otra ejecución sigue en marcha), termina con un
-- 200 OK + `skipped`. El lock se libera AUTOMÁTICAMENTE al cerrar la
-- sesión PostgREST (cada request abre una sesión nueva); no es necesario
-- liberarlo manualmente porque el cron no comparte sesión con otras
-- llamadas.
--
-- Nota: usamos pg_try_advisory_lock (no _xact_lock) precisamente porque
-- queremos que el lock sobreviva al statement RPC y se mantenga hasta
-- que la sesión PostgREST que lo adquirió finalice (al terminar la
-- request HTTP del cron).

create or replace function try_data_retention_lock()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select pg_try_advisory_lock(hashtext('data-retention-cron'));
$$;

revoke all on function try_data_retention_lock() from public;
grant execute on function try_data_retention_lock() to service_role;

comment on function try_data_retention_lock() is
  'Intenta adquirir advisory lock de sesión para data-retention-cron. Devuelve true si lo consigue (Q-11).';
