-- 0024_data_breaches_rls_audit.sql
-- Cierre del hallazgo S-06 (auditoría legal V3): auditoría y refuerzo de RLS sobre data_breaches.
-- Las policies creadas en 0010 usan `using (true)` — cualquier usuario autenticado podía leer/escribir.
-- La policy "for all" de 0013 es correcta pero coexiste con las laxas de 0010 (la más permisiva gana).
-- Esta migración elimina todas las policies previas y recrea SOLO las que exigen is_admin().
-- Garantiza que SOLO is_admin() puede leer/insertar/actualizar registros.

-- Drop policies previas (idempotente — incluye las de 0010, 0013 y nombres alternativos)
drop policy if exists data_breaches_admin_select on data_breaches;
drop policy if exists data_breaches_admin_insert on data_breaches;
drop policy if exists data_breaches_admin_update on data_breaches;
drop policy if exists data_breaches_admin_delete on data_breaches;
drop policy if exists data_breaches_select on data_breaches;
drop policy if exists data_breaches_insert on data_breaches;
drop policy if exists data_breaches_update on data_breaches;
drop policy if exists data_breaches_admin on data_breaches;

-- Asegura RLS habilitado (idempotente)
alter table data_breaches enable row level security;

-- Solo admins pueden leer brechas
create policy data_breaches_admin_select on data_breaches
  for select to authenticated using (is_admin());

-- Solo admins pueden registrar nuevas brechas
create policy data_breaches_admin_insert on data_breaches
  for insert to authenticated with check (is_admin());

-- Solo admins pueden actualizar brechas (p.ej. cambiar resolution_status, añadir aepd_case_number)
create policy data_breaches_admin_update on data_breaches
  for update to authenticated using (is_admin()) with check (is_admin());

-- No permitimos DELETE de brechas (audit trail inmutable art. 33.5 RGPD).
-- Para "cerrar" una brecha se actualiza resolution_status='resolved', no se borra.

comment on table data_breaches is
  'Registro de brechas de seguridad (RGPD art. 33-34). Audit trail inmutable: no DELETE policy.
   Acceso restringido a is_admin(). Cierre via resolution_status=resolved, nunca DELETE.
   Migración 0024: S-06 — eliminadas policies laxas (using true) de 0010 y 0013.';
