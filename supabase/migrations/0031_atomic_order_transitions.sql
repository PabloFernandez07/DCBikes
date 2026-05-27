-- ════════════════════════════════════════════════════════════════
-- 0031_atomic_order_transitions.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 1 · B-05 + B-06 + B-07
--
-- Optimistic / pessimistic locking en transiciones de estado de pedido y
-- en la reserva/restauración de stock. Elimina race conditions cuando
-- dos sesiones admin (o dos clientes) intentan operar sobre la misma
-- fila simultáneamente.
--
-- Patrón en cada RPC:
--   1. SELECT ... FOR UPDATE                       → lock pesimista de la fila
--   2. Validar estado actual contra estado esperado
--   3. UPDATE                                       → realizar transición
--   4. RETURN { order_id, prev_status, new_status }
--
-- SECURITY DEFINER + search_path = public, pg_temp para evitar
-- inyección por search_path. GRANT EXECUTE únicamente a service_role:
-- las edge functions llaman con service_role y NO se exponen al rol
-- anon/authenticated.
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- accept_order(p_order_id, p_admin_id)
-- pending? NO — Redsys debe haber confirmado pago previamente.
-- Solo authorized → accepted.
-- ────────────────────────────────────────────────────────────────
create or replace function accept_order(
  p_order_id uuid,
  p_admin_id uuid
)
returns table (order_id uuid, prev_status text, new_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev_status text;
begin
  -- Lock pesimista de la fila concreta.
  select status into v_prev_status
    from orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_prev_status = 'accepted' then
    -- Idempotente: dos clicks consecutivos del mismo admin.
    return query select p_order_id, v_prev_status, v_prev_status;
    return;
  end if;

  if v_prev_status <> 'authorized' then
    raise exception 'invalid state % (expected authorized)', v_prev_status
      using errcode = 'P0001';
  end if;

  update orders
    set status         = 'accepted',
        accepted_by    = p_admin_id,
        accepted_at    = now()
    where id = p_order_id;

  return query select p_order_id, v_prev_status, 'accepted'::text;
end;
$$;

revoke all on function accept_order(uuid, uuid) from public;
grant execute on function accept_order(uuid, uuid) to service_role;

-- ────────────────────────────────────────────────────────────────
-- reject_order(p_order_id, p_admin_id, p_reason)
-- authorized → rejected   (rechazo previo a captura)
-- accepted   → rejected   (cubre dos casos:
--                          a) revert tras capture KO en accept_order,
--                          b) devolución acordada con cliente antes de envío)
-- Idempotente: si ya rejected, devuelve OK sin hacer nada.
-- ────────────────────────────────────────────────────────────────
create or replace function reject_order(
  p_order_id uuid,
  p_admin_id uuid,
  p_reason text
)
returns table (order_id uuid, prev_status text, new_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev_status text;
begin
  select status into v_prev_status
    from orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_prev_status = 'rejected' then
    return query select p_order_id, v_prev_status, v_prev_status;
    return;
  end if;

  if v_prev_status not in ('authorized', 'accepted') then
    raise exception 'invalid state % (expected authorized or accepted)', v_prev_status
      using errcode = 'P0001';
  end if;

  update orders
    set status               = 'rejected',
        rejection_reason     = nullif(p_reason, ''),
        payment_cancelled_at = now()
    where id = p_order_id;

  return query select p_order_id, v_prev_status, 'rejected'::text;
end;
$$;

revoke all on function reject_order(uuid, uuid, text) from public;
grant execute on function reject_order(uuid, uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────────
-- mark_shipped_order(p_order_id, p_admin_id, p_tracking_number, p_tracking_carrier)
-- accepted → shipped.
--
-- NOTA: el plan original mencionaba p_tracking_url, pero el schema usa
-- tracking_number + tracking_carrier (orders.tracking_number /
-- orders.tracking_carrier). Mantenemos coherencia con el schema real.
-- ────────────────────────────────────────────────────────────────
create or replace function mark_shipped_order(
  p_order_id uuid,
  p_admin_id uuid,
  p_tracking_number text,
  p_tracking_carrier text
)
returns table (order_id uuid, prev_status text, new_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev_status     text;
  v_delivery_method text;
begin
  select status, delivery_method
    into v_prev_status, v_delivery_method
    from orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_delivery_method <> 'shipping' then
    raise exception 'invalid delivery_method % (expected shipping)', v_delivery_method
      using errcode = 'P0001';
  end if;

  if v_prev_status = 'shipped' then
    return query select p_order_id, v_prev_status, v_prev_status;
    return;
  end if;

  if v_prev_status <> 'accepted' then
    raise exception 'invalid state % (expected accepted)', v_prev_status
      using errcode = 'P0001';
  end if;

  update orders
    set status           = 'shipped',
        shipped_at       = now(),
        tracking_number  = left(coalesce(p_tracking_number, ''), 100),
        tracking_carrier = left(coalesce(p_tracking_carrier, ''), 50)
    where id = p_order_id;

  return query select p_order_id, v_prev_status, 'shipped'::text;
end;
$$;

revoke all on function mark_shipped_order(uuid, uuid, text, text) from public;
grant execute on function mark_shipped_order(uuid, uuid, text, text) to service_role;

-- ────────────────────────────────────────────────────────────────
-- cancel_order_by_customer(p_order_id, p_customer_email)
-- Cliente cancela su propio pedido. Estados permitidos: 'authorized'
-- (única transición real soportada por la edge function actual).
-- Verifica además customer_email y deleted_at.
-- ────────────────────────────────────────────────────────────────
create or replace function cancel_order_by_customer(
  p_order_id uuid,
  p_customer_email text
)
returns table (order_id uuid, prev_status text, new_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev_status text;
  v_email       text;
  v_deleted_at  timestamptz;
begin
  select status, customer_email, deleted_at
    into v_prev_status, v_email, v_deleted_at
    from orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_deleted_at is not null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if lower(v_email) <> lower(coalesce(p_customer_email, '')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_prev_status = 'cancelled' then
    return query select p_order_id, v_prev_status, v_prev_status;
    return;
  end if;

  if v_prev_status <> 'authorized' then
    raise exception 'invalid state % (expected authorized)', v_prev_status
      using errcode = 'P0001';
  end if;

  update orders
    set status                 = 'cancelled',
        cancelled_by_customer  = true,
        client_modified_at     = now(),
        payment_cancelled_at   = now(),
        rejection_reason       = 'Cancelado por el cliente'
    where id = p_order_id;

  return query select p_order_id, v_prev_status, 'cancelled'::text;
end;
$$;

revoke all on function cancel_order_by_customer(uuid, text) from public;
grant execute on function cancel_order_by_customer(uuid, text) to service_role;

-- ════════════════════════════════════════════════════════════════
-- reserve_stock(p_items jsonb)
-- Decrementa stock atómicamente con check stock >= qty. Si CUALQUIER
-- item no tiene stock suficiente, raise → rollback de toda la operación
-- (BEGIN/EXCEPTION del caller).
-- ════════════════════════════════════════════════════════════════
create or replace function reserve_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
begin
  for item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, qty int)
  loop
    if item.qty is null or item.qty <= 0 then
      raise exception 'invalid qty % for product %', item.qty, item.product_id
        using errcode = 'P0001';
    end if;

    update products
      set stock = stock - item.qty
      where id = item.product_id
        and stock >= item.qty;

    if not found then
      raise exception 'insufficient stock for %', item.product_id
        using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

revoke all on function reserve_stock(jsonb) from public;
grant execute on function reserve_stock(jsonb) to service_role;

-- ════════════════════════════════════════════════════════════════
-- restore_stock(p_items jsonb)
-- Inverso de reserve_stock: incrementa stock. Usado para revertir tras
-- un fallo de Redsys posterior a una RPC accept_order/etc, o como
-- helper genérico de devolución/cancelación.
-- ════════════════════════════════════════════════════════════════
create or replace function restore_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
begin
  for item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, qty int)
  loop
    if item.qty is null or item.qty <= 0 then
      continue;
    end if;

    update products
      set stock = coalesce(stock, 0) + item.qty
      where id = item.product_id;
  end loop;
end;
$$;

revoke all on function restore_stock(jsonb) from public;
grant execute on function restore_stock(jsonb) to service_role;
