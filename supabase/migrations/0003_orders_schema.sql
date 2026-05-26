-- DC Bikes Cantabria — Carrito Fase D
-- Crea el modelo de pedidos, items, historial de estados, log de pagos Redsys,
-- facturas y contadores correlativos anuales (atómicos).
-- Idempotente: usa IF NOT EXISTS / OR REPLACE donde aplica.

create extension if not exists "pgcrypto";

-- ════════════════════════════════════════════════════════════════
-- ─── orders ─────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text unique not null,                       -- 'ORD-2026-0001'
  status                 text not null
    check (status in (
      'pending','authorized','accepted','rejected','cancelled',
      'ready_pickup','shipped','delivered','returned','payment_failed'
    )),
  delivery_method        text not null
    check (delivery_method in ('shipping','pickup')),

  -- Datos cliente (guest checkout)
  customer_email         text not null,
  customer_phone         text not null,
  customer_first_name    text not null,
  customer_last_name     text not null,

  -- Dirección envío (null si pickup)
  shipping_address       text,
  shipping_city          text,
  shipping_postal_code   text,
  shipping_province      text,
  shipping_notes         text,

  -- Facturación B2B
  needs_invoice          boolean not null default false,
  invoice_business_name  text,
  invoice_cif            text,
  invoice_address        text,

  -- Importes (en céntimos para evitar errores de coma flotante)
  subtotal_cents         int not null check (subtotal_cents >= 0),
  shipping_cents         int not null check (shipping_cents >= 0),
  total_cents            int not null check (total_cents >= 0),
  tax_rate               numeric(4,2) not null,

  -- Pago Redsys
  payment_provider       text default 'redsys',
  payment_method         text,                                       -- 'card' | 'bizum'
  payment_pre_auth_id    text,                                       -- Redsys order id (12 chars)
  payment_pre_auth_at    timestamptz,
  payment_captured_at    timestamptz,
  payment_cancelled_at   timestamptz,

  -- Audit + estado
  notes_internal         text,
  rejection_reason       text,
  accepted_by            uuid references auth.users(id),
  accepted_at            timestamptz,
  ready_pickup_at        timestamptz,
  shipped_at             timestamptz,
  tracking_number        text,
  tracking_carrier       text,

  -- Consentimientos GDPR
  accepted_terms_at      timestamptz not null,
  accepted_privacy_at    timestamptz not null,
  marketing_opt_in       boolean not null default false,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Trigger updated_at (reutiliza set_updated_at() de 0001_initial.sql).
-- Si por alguna razón no existe, la creamos.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists orders_updated_at on orders;
create trigger orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- ─── order_items ────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders(id) on delete cascade,
  product_id          uuid references products(id) on delete set null,
  product_name        text not null,                                 -- snapshot
  product_sku         text,
  product_size_label  text,
  unit_price_cents    int not null check (unit_price_cents >= 0),
  quantity            int not null check (quantity > 0),
  line_total_cents    int not null check (line_total_cents >= 0)
);

-- ════════════════════════════════════════════════════════════════
-- ─── order_status_history ───────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid references auth.users(id),                        -- null si sistema (cron)
  reason      text,
  created_at  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- ─── payments_log ───────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists payments_log (
  id                          uuid primary key default gen_random_uuid(),
  order_id                    uuid references orders(id) on delete cascade,
  payment_provider            text not null default 'redsys',
  operation_type              text not null
    check (operation_type in ('preauth','capture','cancel','refund','notification')),
  redsys_response_code        text,
  redsys_authorization_code   text,
  redsys_transaction_type     text,
  raw_payload                 jsonb not null,
  signature_valid             boolean,
  created_at                  timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════
-- ─── invoices ───────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists invoices (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null unique references orders(id) on delete restrict,
  invoice_number        text unique not null,                        -- 'FAC-2026-0001'
  invoice_type          text not null check (invoice_type in ('b2c','b2b')),
  pdf_storage_path      text not null,
  issued_at             timestamptz not null default now(),
  -- Snapshot datos legales tienda al momento de emisión
  issuer_company_name   text not null,
  issuer_cif            text not null,
  issuer_address        text not null,
  -- Importes (céntimos)
  base_cents            int not null check (base_cents >= 0),
  tax_cents             int not null check (tax_cents >= 0),
  total_cents           int not null check (total_cents >= 0)
);

-- ════════════════════════════════════════════════════════════════
-- ─── Contadores correlativos anuales ────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists order_counter (
  year        int primary key,
  last_number int not null default 0
);

create table if not exists invoice_counter (
  year        int primary key,
  last_number int not null default 0
);

-- ════════════════════════════════════════════════════════════════
-- ─── Funciones atómicas de numeración ───────────────────────────
-- ════════════════════════════════════════════════════════════════
-- security definer + revoke public + grant service_role:
-- garantiza que solo edge functions con service_role puedan invocarlas
-- (no se exponen via cliente anon/authenticated).

create or replace function next_order_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into order_counter (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = order_counter.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

create or replace function next_invoice_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into invoice_counter (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = invoice_counter.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

revoke all on function next_order_number(int)   from public;
revoke all on function next_invoice_number(int) from public;
grant execute on function next_order_number(int)   to service_role;
grant execute on function next_invoice_number(int) to service_role;

-- ════════════════════════════════════════════════════════════════
-- ─── Índices ────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Pedidos "en vuelo" (cron auto-cancel + dashboard admin).
create index if not exists idx_orders_status_inflight
  on orders(status)
  where status in ('pending','authorized');

-- Búsqueda por email cliente (soporte / reenvíos).
create index if not exists idx_orders_customer_email
  on orders(customer_email);

-- Listados admin ordenados por fecha.
create index if not exists idx_orders_created_at
  on orders(created_at desc);

-- Cron auto-cancel: scan por payment_pre_auth_at de pedidos authorized.
create index if not exists idx_orders_payment_pre_auth_at
  on orders(payment_pre_auth_at)
  where status = 'authorized';

-- order_items: join FK.
create index if not exists idx_order_items_order_id
  on order_items(order_id);

create index if not exists idx_order_items_product_id
  on order_items(product_id)
  where product_id is not null;

-- payments_log: join FK + lookup por order.
create index if not exists idx_payments_log_order_id
  on payments_log(order_id);

-- order_status_history: timeline por pedido.
create index if not exists idx_order_status_history_order_id
  on order_status_history(order_id);

-- invoices: invoice_number ya tiene UNIQUE → no añadir índice extra.
-- (order_id también tiene UNIQUE.)

-- ════════════════════════════════════════════════════════════════
-- ─── RLS ────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_status_history  enable row level security;
alter table payments_log          enable row level security;
alter table invoices              enable row level security;
alter table order_counter         enable row level security;
alter table invoice_counter       enable row level security;

-- orders: INSERT permitido a anon/authenticated (guest checkout).
--         SELECT/UPDATE solo authenticated (admin).
--         El cliente público NO puede leer orders desde JS: la confirmación
--         post-pago se sirve via Edge Function pública con service_role
--         (validada por token firmado en URL).
drop policy if exists orders_insert_anon  on orders;
drop policy if exists orders_select_admin on orders;
drop policy if exists orders_update_admin on orders;
create policy orders_insert_anon  on orders for insert to anon, authenticated with check (true);
create policy orders_select_admin on orders for select to authenticated using (true);
create policy orders_update_admin on orders for update to authenticated using (true);

-- order_items: mismas reglas que orders.
drop policy if exists order_items_insert_anon  on order_items;
drop policy if exists order_items_select_admin on order_items;
drop policy if exists order_items_update_admin on order_items;
create policy order_items_insert_anon  on order_items for insert to anon, authenticated with check (true);
create policy order_items_select_admin on order_items for select to authenticated using (true);
create policy order_items_update_admin on order_items for update to authenticated using (true);

-- order_status_history, payments_log, invoices: SOLO admin authenticated.
-- (Edge functions con service_role bypassan RLS automáticamente.)
drop policy if exists order_status_history_admin on order_status_history;
create policy order_status_history_admin on order_status_history
  for all to authenticated using (true) with check (true);

drop policy if exists payments_log_admin on payments_log;
create policy payments_log_admin on payments_log
  for all to authenticated using (true) with check (true);

drop policy if exists invoices_admin on invoices;
create policy invoices_admin on invoices
  for all to authenticated using (true) with check (true);

-- Contadores: tablas internas, solo admin (en la práctica solo service_role
-- escribe vía las funciones next_*_number, pero blindamos por si acaso).
drop policy if exists order_counter_admin on order_counter;
create policy order_counter_admin on order_counter
  for all to authenticated using (true) with check (true);

drop policy if exists invoice_counter_admin on invoice_counter;
create policy invoice_counter_admin on invoice_counter
  for all to authenticated using (true) with check (true);

-- ════════════════════════════════════════════════════════════════
-- ─── Storage: bucket 'invoices' (privado) ───────────────────────
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Lectura/escritura authenticated. Edge functions con service_role bypassan RLS.
drop policy if exists "invoices_admin_read"   on storage.objects;
drop policy if exists "invoices_admin_write"  on storage.objects;
drop policy if exists "invoices_admin_update" on storage.objects;
drop policy if exists "invoices_admin_delete" on storage.objects;

create policy "invoices_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'invoices');

create policy "invoices_admin_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'invoices');

create policy "invoices_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'invoices')
  with check (bucket_id = 'invoices');

create policy "invoices_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'invoices');
