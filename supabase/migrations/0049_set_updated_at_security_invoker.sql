-- ════════════════════════════════════════════════════════════════
-- 0049_set_updated_at_security_invoker.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · Q-26 (search_path mutable en trigger)
--
-- La función set_updated_at() (definida en 0001_initial.sql y reescrita en
-- 0003_orders_schema.sql) no fija search_path. Aunque es trivial (solo hace
-- new.updated_at = now()), una función de trigger sin search_path fijo es
-- un hallazgo recurrente de los advisors de Supabase ("function_search_path_mutable")
-- y una mala práctica de seguridad.
--
-- La recreamos con:
--   security invoker        → corre con los privilegios del rol que dispara
--                             el trigger; no necesita escalar (solo escribe
--                             una columna de la fila NEW). No debe ser
--                             SECURITY DEFINER.
--   set search_path = public, pg_temp
--                           → evita resolución de objetos por un search_path
--                             manipulado.
--
-- CREATE OR REPLACE conserva los triggers existentes que la referencian
-- (orders_updated_at y cualquier otro), por lo que no hace falta recrearlos.
-- ════════════════════════════════════════════════════════════════

create or replace function set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Trigger BEFORE UPDATE: fija updated_at = now(). SECURITY INVOKER + search_path fijo (Q-26 V5).';
