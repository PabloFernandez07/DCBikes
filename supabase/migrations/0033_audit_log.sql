-- 0033_audit_log.sql
-- Hallazgo Q-05 (auditoría V5): bitácora central de cambios en tablas sensibles.
--
-- Cubre RGPD art. 5.1.f (integridad/confidencialidad) y art. 32 (medidas
-- técnicas y organizativas). Cualquier INSERT/UPDATE/DELETE en tablas críticas
-- queda registrado con snapshot jsonb del old/new row, autor (auth.uid()) y
-- timestamp.
--
-- Tablas auditadas (triggers AFTER):
--   - settings           (toda operación)
--   - admin_users        (toda operación)
--   - data_breaches      (toda operación)
--   - products           (SOLO cuando retail_price cambia — WHEN clause)
--
-- Inmutabilidad estricta (mismo patrón que consent_audit Q-04):
--   - SELECT: solo is_admin()
--   - INSERT: vía trigger (no exponer policy directa)
--   - UPDATE/DELETE: REVOKE explícito.

create table if not exists audit_log (
  id           bigserial primary key,
  table_name   text not null,
  operation    text not null check (operation in ('INSERT','UPDATE','DELETE')),
  row_id       text,   -- text porque algunas tablas usan bigint, otras uuid
  actor_id     uuid,   -- auth.uid() cuando aplique
  actor_email  text,   -- claim jwt.email si está disponible
  old_row      jsonb,
  new_row      jsonb,
  changed_at   timestamptz not null default now()
);

create index if not exists audit_log_table_idx
  on audit_log(table_name, changed_at desc);
create index if not exists audit_log_actor_idx
  on audit_log(actor_id, changed_at desc)
  where actor_id is not null;

alter table audit_log enable row level security;

drop policy if exists audit_log_admin_select on audit_log;
create policy audit_log_admin_select on audit_log
  for select to authenticated
  using (is_admin());

-- Inmutabilidad: nadie puede modificar/borrar (la trigger inserta vía
-- security definer, así que el bypass de RLS es interno y controlado).
revoke update, delete on audit_log from anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════
-- ─── Función trigger genérica ───────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- security definer + search_path bloqueado para evitar hijacking.
-- Lee claims JWT (sub, email) si la operación viene de un cliente autenticado;
-- en operaciones via service_role los claims son null y queda actor_id NULL
-- (el contexto se reconstruye por table_name + new_row).

create or replace function audit_log_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_email  text;
  v_row_id text;
begin
  begin
    v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  exception when others then
    v_actor := null;
  end;
  v_email := nullif(current_setting('request.jwt.claim.email', true), '');

  -- Extrae id como text — funciona para uuid, bigint, etc.
  v_row_id := coalesce(
    (to_jsonb(new))->>'id',
    (to_jsonb(old))->>'id'
  );

  insert into audit_log(
    table_name, operation, row_id, actor_id, actor_email, old_row, new_row
  )
  values (
    tg_table_name,
    tg_op,
    v_row_id,
    v_actor,
    v_email,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return coalesce(new, old);
end
$$;

revoke all on function audit_log_trigger() from public;

comment on function audit_log_trigger() is
  'Trigger genérica de auditoría (Q-05 V5). Captura claims JWT y snapshot jsonb.';

-- ════════════════════════════════════════════════════════════════
-- ─── Triggers en tablas sensibles ───────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- settings ── toda operación
drop trigger if exists settings_audit_trigger on settings;
create trigger settings_audit_trigger
  after insert or update or delete on settings
  for each row execute function audit_log_trigger();

-- admin_users ── toda operación
drop trigger if exists admin_users_audit_trigger on admin_users;
create trigger admin_users_audit_trigger
  after insert or update or delete on admin_users
  for each row execute function audit_log_trigger();

-- data_breaches ── toda operación
drop trigger if exists data_breaches_audit_trigger on data_breaches;
create trigger data_breaches_audit_trigger
  after insert or update or delete on data_breaches
  for each row execute function audit_log_trigger();

-- products ── SOLO cuando cambia retail_price (cláusula WHEN evita ruido)
-- Trigger separada por operación porque WHEN no admite mezclar NEW/OLD
-- en un trigger AFTER INSERT OR UPDATE OR DELETE.
drop trigger if exists products_price_insert_audit on products;
create trigger products_price_insert_audit
  after insert on products
  for each row
  when (new.retail_price is not null)
  execute function audit_log_trigger();

drop trigger if exists products_price_update_audit on products;
create trigger products_price_update_audit
  after update on products
  for each row
  when (old.retail_price is distinct from new.retail_price)
  execute function audit_log_trigger();

drop trigger if exists products_price_delete_audit on products;
create trigger products_price_delete_audit
  after delete on products
  for each row
  execute function audit_log_trigger();

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on table audit_log is
  'Bitácora central de cambios (Q-05 V5). RGPD art. 5.1.f / art. 32. Sin UPDATE/DELETE.';
comment on column audit_log.row_id is
  'Id de la fila afectada como text (compatible con uuid y bigint).';
comment on column audit_log.actor_id is
  'auth.uid() cuando la operación proviene de un cliente autenticado. NULL si fue service_role o superuser.';
