# Cron Vault Setup — Runbook S-02

> **Cierre del hallazgo S-02 de la auditoría legal V3.**
> Las migraciones 0005 y 0012 fueron renombradas a `.template.sql` porque contenían
> placeholders de secretos (`<SERVICE_ROLE_KEY>`, `<PROJECT_REF>`, `<CRON_SECRET>`)
> que nunca debieron commitearse. La migración 0021 recrea los crons leyendo de
> Supabase Vault.

## Contexto de los dos cron jobs

| Job | Schedule | Edge Function | Auth original |
|-----|----------|---------------|---------------|
| `order-auto-cancel-job` | `*/30 * * * *` | `order-auto-cancel` | Bearer `SERVICE_ROLE_KEY` + header `x-cron-secret` |
| `data-retention-cron-job` | `0 3 * * *` (03:00 UTC) | `data-retention-cron` | Bearer `CRON_SECRET` directo |

## Prerrequisito: insertar secretos en Vault

Ejecutar en **SQL Studio de Supabase una sola vez** con los valores reales antes de
aplicar la migración 0021.

```sql
-- Project ref (la parte antes de .supabase.co en tu URL de proyecto)
-- Ejemplo: si tu URL es https://zdfzxjnuksuyagdqoouu.supabase.co, el ref es zdfzxjnuksuyagdqoouu
select vault.create_secret('<TU_PROJECT_REF>', 'supabase_project_ref');

-- Service Role Key (Dashboard → Project Settings → API → service_role)
-- NUNCA uses la anon key aquí
select vault.create_secret('<TU_SERVICE_ROLE_KEY>', 'service_role_key');

-- Secreto para order-auto-cancel (genera con: openssl rand -hex 32)
-- Debe coincidir con la env var ORDER_CRON_SECRET de la edge function
select vault.create_secret('<HEX_64_CHARS>', 'order_cron_secret');

-- Secreto para data-retention-cron (genera con: openssl rand -hex 32)
-- Debe coincidir con la env var DATA_RETENTION_CRON_SECRET de la edge function
-- (En el template original era la env var CRON_SECRET — renombrar si aplica)
select vault.create_secret('<HEX_64_CHARS>', 'data_retention_cron_secret');
```

## Aplicar la migración

```bash
supabase db push
```

Esto aplica `0021_cron_vault_secrets.sql`. Los archivos `.template.sql` son ignorados
por `db push` al no seguir el patrón `*.sql` sin `.template`.

> **Nota:** si usas `supabase db push --include-all`, asegurate de que los `.template.sql`
> no se incluyan. Lo recomendado es mantener el nombre `.template.sql` y no forzar su inclusión.

## Verificación post-aplicación

```sql
-- 1. Confirmar secretos creados
select name from vault.secrets
where name in ('supabase_project_ref', 'service_role_key', 'order_cron_secret', 'data_retention_cron_secret');
-- Debe devolver 4 filas

-- 2. Confirmar crons creados y schedule
select jobname, schedule, active
from cron.job
where jobname in ('order-auto-cancel-job', 'data-retention-cron-job');
-- Debe devolver 2 filas con active = true

-- 3. Tras ~35 min (para order-auto-cancel) o al día siguiente a las 03:00 UTC (para retention):
select jobname,
       run_details.start_time as last_run,
       run_details.status     as last_run_status
from cron.job
left join lateral (
  select start_time, status
  from cron.job_run_details
  where job_run_details.jobid = job.jobid
  order by start_time desc
  limit 1
) run_details on true
where jobname in ('order-auto-cancel-job', 'data-retention-cron-job');
-- last_run_status debe ser 'succeeded'
```

## Configuración en Edge Functions

Las Edge Functions deben validar el secreto recibido contra su env var correspondiente:

| Edge Function | Header esperado | Env var en Supabase |
|---------------|-----------------|---------------------|
| `order-auto-cancel` | `x-cron-secret: <valor>` | `ORDER_CRON_SECRET` |
| `data-retention-cron` | `Authorization: Bearer <valor>` | `DATA_RETENTION_CRON_SECRET` (o `CRON_SECRET` si no se renombró) |

Configurar estas env vars en el **Dashboard de Supabase → Edge Functions → Secrets**
con los **mismos valores** que pasaste a `vault.create_secret`.

## Rollback

Si fuera necesario revertir:

```sql
-- Eliminar los cron jobs
select cron.unschedule('order-auto-cancel-job');
select cron.unschedule('data-retention-cron-job');

-- Eliminar secretos del Vault (requiere el UUID de cada secreto)
-- select id, name from vault.secrets where name in (...);
-- select vault.delete_secret('<uuid>');
```

Los archivos `.template.sql` originales siguen en el repositorio como referencia.
