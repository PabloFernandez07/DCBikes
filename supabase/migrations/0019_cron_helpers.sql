-- 0019_cron_helpers.sql
-- RPC para consultar el último run de un job pg_cron desde edge functions.
-- El schema `cron` no está expuesto en PostgREST por defecto, por lo que la
-- edge function `cron-healthcheck` necesita una función SECURITY DEFINER
-- accesible solo al rol service_role.

create or replace function public.cron_job_last_run(p_jobname text)
returns timestamptz
language sql
security definer
set search_path = public, cron
as $$
  select max(start_time)
    from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = p_jobname);
$$;

revoke all on function public.cron_job_last_run(text) from public;
grant execute on function public.cron_job_last_run(text) to service_role;

comment on function public.cron_job_last_run(text) is
  'Devuelve el start_time del último run del job pg_cron indicado. Usado por la edge function cron-healthcheck.';
