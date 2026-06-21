-- ════════════════════════════════════════════════════════════════
-- 0066_order_returns.sql
-- ────────────────────────────────────────────────────────────────
-- Feature de devoluciones (RMA · Return Merchandise Authorization).
--
-- Modela la solicitud y gestión de devoluciones de pedidos:
--   - Marca qué categorías admiten devolución (is_returnable, fail-safe a false).
--   - Registra el momento de entrega (delivered_at) como base del plazo legal.
--   - Cabecera de devolución (order_returns) + líneas (order_return_items).
--   - Numeración secuencial anual de RMA (return_counter + next_return_number).
--
-- Toda MUTACIÓN va por edge function con service_role. authenticated SOLO
-- tiene SELECT (admins, vía is_admin()). Mismo patrón inmutable de
-- 0029_rls_immutable_logs.sql.
--
-- Verificado contra prod (zdfzxjnuksuyagdqoouu):
--   - set_updated_at() YA existe en public (plpgsql, sin args) → se reusa.
--   - order_status_history tiene order_id / to_status / created_at → backfill OK.
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- ─── 1. categories.is_returnable ────────────────────────────────
-- ════════════════════════════════════════════════════════════════
alter table categories
  add column if not exists is_returnable boolean not null default false;

comment on column categories.is_returnable is
  'Indica si los productos de esta categoría admiten devolución. '
  'Default false = fail-safe: una categoría debe marcarse explícitamente como devolvible.';

-- ════════════════════════════════════════════════════════════════
-- ─── 2. orders.delivered_at ─────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
alter table orders
  add column if not exists delivered_at timestamptz;

comment on column orders.delivered_at is
  'Momento de entrega del pedido. Base del plazo de devolución (RMA).';

-- Backfill: para pedidos ya entregados sin delivered_at, copiamos el created_at
-- de la PRIMERA transición a 'delivered' registrada en order_status_history.
update orders o
  set delivered_at = h.created_at
  from (
    select distinct on (order_id) order_id, created_at
      from order_status_history
      where to_status = 'delivered'
      order by order_id, created_at asc
  ) h
  where h.order_id = o.id
    and o.status = 'delivered'
    and o.delivered_at is null;

-- ════════════════════════════════════════════════════════════════
-- ─── 3. order_returns (cabecera RMA) ────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists order_returns (
  id                  uuid primary key default gen_random_uuid(),
  return_number       text unique not null,
  order_id            uuid not null references orders(id) on delete restrict,
  customer_email      text not null,

  -- Estado de la devolución. Default 'requested' = recién solicitada por el cliente.
  status              text not null default 'requested'
                        check (status in ('requested','approved','rejected','received','refunded','cancelled')),

  -- Motivo codificado + texto libre opcional.
  reason_code         text not null
                        check (reason_code in ('wrong_size','not_liked','defective','damaged','wrong_item','other')),
  reason_text         text,

  -- ¿La tienda asume el coste de devolución? (p.ej. producto defectuoso).
  store_pays_return   boolean not null default false,
  -- Devolución del pedido completo (vs. devolución parcial de líneas).
  is_full_order       boolean not null default false,

  -- Desglose del reembolso en céntimos.
  refund_items_cents    int not null default 0 check (refund_items_cents >= 0),
  refund_shipping_cents int not null default 0 check (refund_shipping_cents >= 0),
  refund_total_cents    int not null default 0 check (refund_total_cents >= 0),

  -- Trazabilidad del reembolso vía Redsys.
  redsys_refund_order_id text,
  redsys_response_code   text,
  refunded_at            timestamptz,

  -- Factura rectificativa (abono) asociada, si se emitió.
  credit_invoice_id   uuid references invoices(id) on delete set null,

  -- Decisión administrativa (aprobación / rechazo).
  admin_decision_by   uuid references auth.users(id),
  admin_decision_at   timestamptz,
  admin_decision_note text,

  -- Recepción física de la mercancía devuelta.
  received_by         uuid references auth.users(id),
  received_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table order_returns is
  'Cabecera de devolución (RMA). Toda mutación vía edge function service_role; '
  'authenticated solo SELECT (is_admin()).';

create index if not exists idx_order_returns_order_id       on order_returns(order_id);
create index if not exists idx_order_returns_status         on order_returns(status);
create index if not exists idx_order_returns_customer_email on order_returns(customer_email);

-- ════════════════════════════════════════════════════════════════
-- ─── 4. order_return_items (líneas de la devolución) ────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists order_return_items (
  id                 uuid primary key default gen_random_uuid(),
  return_id          uuid not null references order_returns(id) on delete cascade,
  order_item_id      uuid not null references order_items(id) on delete restrict,

  -- Snapshot del producto en el momento de la devolución (nombre / talla),
  -- por si el catálogo cambia después.
  product_name       text not null,
  product_size_label text,

  unit_price_cents   int not null check (unit_price_cents >= 0),
  quantity           int not null check (quantity > 0),
  line_refund_cents  int not null check (line_refund_cents >= 0),

  -- Una línea de pedido solo puede aparecer una vez por devolución.
  unique (return_id, order_item_id)
);

comment on table order_return_items is
  'Líneas devueltas de una RMA. Snapshot de nombre/talla/precio para inmutabilidad histórica.';

create index if not exists idx_order_return_items_return_id     on order_return_items(return_id);
create index if not exists idx_order_return_items_order_item_id on order_return_items(order_item_id);

-- ════════════════════════════════════════════════════════════════
-- ─── 5. Numeración secuencial anual de RMA ──────────────────────
-- ════════════════════════════════════════════════════════════════
-- Contador por año. next_return_number incrementa atómicamente y devuelve
-- el nuevo número. SECURITY DEFINER + search_path fijado para evitar
-- inyección por search_path. Solo service_role puede ejecutarla.
create table if not exists return_counter (
  year        int primary key,
  last_number int not null default 0
);

comment on table return_counter is
  'Contador secuencial de devoluciones por año. Backing de next_return_number().';

create or replace function next_return_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number int;
begin
  insert into return_counter (year, last_number)
    values (p_year, 1)
    on conflict (year)
    do update set last_number = return_counter.last_number + 1
    returning last_number into v_number;

  return v_number;
end;
$$;

revoke all on function next_return_number(int) from public;
grant execute on function next_return_number(int) to service_role;

-- ════════════════════════════════════════════════════════════════
-- ─── 6. Trigger updated_at en order_returns ─────────────────────
-- ════════════════════════════════════════════════════════════════
-- set_updated_at() ya existe en el esquema (verificado en prod) → se reusa.
drop trigger if exists trg_order_returns_updated_at on order_returns;

create trigger trg_order_returns_updated_at
  before update on order_returns
  for each row
  execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════
-- ─── 7. RLS (patrón inmutable de 0029) ──────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Las 3 tablas: SELECT admin (is_admin()) sobre las dos con datos visibles
-- en panel; service_role bypassa para toda mutación. NO se concede
-- INSERT/UPDATE/DELETE a authenticated.

alter table order_returns       enable row level security;
alter table order_return_items  enable row level security;
alter table return_counter      enable row level security;

-- ─── order_returns ───────────────────────────────────────────────
create policy order_returns_select_admin on order_returns
  for select to authenticated
  using (is_admin());

create policy order_returns_service_role on order_returns
  for all to service_role
  using (true)
  with check (true);

-- ─── order_return_items ──────────────────────────────────────────
create policy order_return_items_select_admin on order_return_items
  for select to authenticated
  using (is_admin());

create policy order_return_items_service_role on order_return_items
  for all to service_role
  using (true)
  with check (true);

-- ─── return_counter ──────────────────────────────────────────────
-- Tabla interna de numeración: sin SELECT para authenticated, solo service_role.
create policy return_counter_service_role on return_counter
  for all to service_role
  using (true)
  with check (true);
