-- DC Bikes Cantabria — Carrito Fase E
-- Programa el job pg_cron que invoca la edge function `order-auto-cancel`
-- cada 30 minutos para liberar pre-autorizaciones de Redsys que llevan
-- demasiado tiempo sin que el admin las acepte (default 48h).
--
-- ⚠️ IMPORTANTE — Esta migración NO se aplica tal cual: contiene placeholders
--    que deben reemplazarse por valores reales antes de ejecutar.
--
-- Requisitos previos:
--   1. El proyecto Supabase debe estar en plan Pro (pg_cron + pg_net).
--   2. Extensiones habilitadas:
--        create extension if not exists pg_cron;
--        create extension if not exists pg_net;
--   3. Tener a mano:
--      - <PROJECT_REF>           el ref del proyecto Supabase
--                                (ej: `abcdefghijklmnop`).
--      - <SERVICE_ROLE_KEY>      la service_role key (NO la anon).
--      - <CRON_SECRET>           (opcional) un secreto adicional configurado
--                                en la env var `ORDER_CRON_SECRET` de la
--                                edge function. Si no la usas, omite el
--                                header `x-cron-secret`.
--
-- Cómo aplicar:
--   - Opción A (recomendada): copiar el bloque de abajo en el SQL editor
--     de Supabase Studio sustituyendo los placeholders, y ejecutar.
--   - Opción B: usar `supabase db push` tras reemplazar los placeholders
--     en este archivo (NO commitear las credenciales).

-- ════════════════════════════════════════════════════════════════
-- ─── Extensiones ────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ════════════════════════════════════════════════════════════════
-- ─── Schedule: cada 30 minutos ──────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Eliminar primero si ya existe (idempotencia al reaplicar).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'order-auto-cancel-job') then
    perform cron.unschedule('order-auto-cancel-job');
  end if;
end $$;

select cron.schedule(
  'order-auto-cancel-job',
  '*/30 * * * *',
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/order-auto-cancel',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
        'x-cron-secret', '<CRON_SECRET>'        -- borra esta línea si no usas ORDER_CRON_SECRET
      ),
      body    := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $$
);

-- ════════════════════════════════════════════════════════════════
-- ─── Verificación ───────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Para comprobar que el job está activo:
--   select * from cron.job where jobname = 'order-auto-cancel-job';
--
-- Para ver el historial de ejecuciones (status, return code):
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname='order-auto-cancel-job')
--     order by start_time desc limit 20;
--
-- Para desactivar temporalmente:
--   select cron.unschedule('order-auto-cancel-job');
