-- 0013_admin_users.sql
-- Defensa en profundidad: separa "usuario autenticado" de "administrador".
-- Aunque disable_signup se invierta por error en Supabase Auth, un nuevo
-- registro NO es admin hasta que se le añada explícitamente a admin_users.

create table if not exists admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'admin' check (role in ('admin','support')),
  granted_at timestamptz default now(),
  granted_by uuid references auth.users(id) on delete set null,
  notes      text
);

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = uid
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;

alter table admin_users enable row level security;

create policy admin_users_select_admin on admin_users
  for select to authenticated using (is_admin());
create policy admin_users_modify_admin on admin_users
  for all to authenticated using (is_admin()) with check (is_admin());

-- Seed inicial: los 2 admins existentes (Pablo dev + DC Bikes cliente).
insert into admin_users (user_id, role, notes) values
  ('27491008-2d9d-4410-bc7b-c46c460cdbc1', 'admin', 'Pablo Fernández — desarrollador'),
  ('f29d7069-449b-4d81-99cb-cc34d4f981c3', 'admin', 'DC Bikes Cantabria — titular')
on conflict (user_id) do nothing;

-- Reescribir RLS policies de las tablas sensibles.
-- Patrón: DROP policy "*_authenticated", CREATE policy con is_admin().

-- orders
drop policy if exists orders_select_admin on orders;
drop policy if exists orders_update_admin on orders;
create policy orders_select_admin on orders for select to authenticated using (is_admin());
create policy orders_update_admin on orders for update to authenticated using (is_admin());
-- INSERT anónimo se mantiene (guest checkout, ya existente).
-- DELETE: solo admin via service_role (no exponer).

-- order_items
drop policy if exists order_items_select_admin on order_items;
drop policy if exists order_items_update_admin on order_items;
create policy order_items_select_admin on order_items for select to authenticated using (is_admin());
create policy order_items_update_admin on order_items for update to authenticated using (is_admin());

-- payments_log
drop policy if exists payments_log_admin on payments_log;
create policy payments_log_admin on payments_log for all to authenticated using (is_admin()) with check (is_admin());

-- invoices
drop policy if exists invoices_admin on invoices;
create policy invoices_admin on invoices for all to authenticated using (is_admin()) with check (is_admin());

-- order_status_history
drop policy if exists order_status_history_admin on order_status_history;
create policy order_status_history_admin on order_status_history for all to authenticated using (is_admin()) with check (is_admin());

-- customer_sessions (la policy admin existente)
drop policy if exists customer_sessions_admin_all on customer_sessions;
create policy customer_sessions_admin_all on customer_sessions for all to authenticated using (is_admin()) with check (is_admin());

-- quote_requests (admin lee y actualiza)
-- Nombres reales en BD productiva: auth_quotes_r y auth_quotes_u (no _select/_update).
drop policy if exists quote_requests_select_admin on quote_requests;
drop policy if exists quote_requests_update_admin on quote_requests;
drop policy if exists auth_quotes_r on quote_requests;
drop policy if exists auth_quotes_u on quote_requests;
create policy quote_requests_select_admin on quote_requests for select to authenticated using (is_admin());
create policy quote_requests_update_admin on quote_requests for update to authenticated using (is_admin());

-- data_breaches (todas)
drop policy if exists data_breaches_admin_select on data_breaches;
drop policy if exists data_breaches_admin_insert on data_breaches;
drop policy if exists data_breaches_admin_update on data_breaches;
create policy data_breaches_admin on data_breaches for all to authenticated using (is_admin()) with check (is_admin());

comment on table admin_users is 'Allowlist de usuarios admin (RGPD art. 32.1.b - separación de privilegios)';
comment on function is_admin is 'Devuelve true si el usuario está en admin_users. Usar en RLS policies.';
