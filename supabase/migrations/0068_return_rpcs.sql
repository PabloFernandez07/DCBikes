-- ════════════════════════════════════════════════════════════════
-- 0068_return_rpcs.sql
-- ────────────────────────────────────────────────────────────────
-- Devoluciones (RMA) · transiciones de estado atómicas.
--
-- Mismo patrón que 0031_atomic_order_transitions.sql:
--   1. SELECT ... FOR UPDATE   → lock pesimista de la fila
--   2. Validar estado actual contra estado esperado
--   3. UPDATE                  → realizar transición
--   4. RETURN la fila / un resumen
--
-- Todas SECURITY DEFINER + search_path = public, pg_temp para evitar
-- inyección por search_path. GRANT EXECUTE solo a service_role: las edge
-- functions admin/cliente llaman con service_role (bypassan RLS) y NO se
-- exponen a anon/authenticated.
--
-- Estados de order_returns:
--   requested → approved → received → refunded
--   requested → rejected
--   (cancelled lo gestiona el cliente/admin, no estas RPCs)
--
-- DEPENDE de las tablas/funciones creadas en 0066 (order_returns,
-- order_return_items, next_return_number, categories.is_returnable,
-- orders.delivered_at). Si esta migración se aplica suelta fallará: aplicar
-- siempre el lote 0066 → 0067 → 0068 en orden.
--
-- Columnas referenciadas (definidas en 0066), por si el lote de migración
-- necesita reconciliar nombres:
--   order_returns(
--     id, order_id, return_number, status, customer_email,
--     reason_code, reason_text, store_pays_return, is_full_order,
--     refund_items_cents, refund_shipping_cents, refund_total_cents,
--     redsys_response_code, credit_invoice_id,
--     admin_decision_by, admin_decision_at, admin_decision_note,
--     received_by, received_at, refunded_at, created_at)
--   order_return_items(
--     id, return_id, order_item_id, quantity, line_refund_cents,
--     product_name, product_size_label, unit_price_cents)
--
-- FLUJO DEL TITULAR: el reembolso ocurre al marcar RECIBIDO, no al aprobar.
--   approve_return        → solo calcula importes + aprueba (NO mueve dinero).
--   mark_return_received  → transición atómica approved→received (NO stock).
--   El edge function admin-return-mark-received encadena DESPUÉS:
--     mark_return_received → runRedsysOperation refund →
--     generate-credit-invoice → set_return_refunded.
-- ════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- create_return_request(p_order_id, p_customer_email, p_items,
--                       p_reason_code, p_reason_text)
-- Inserta la solicitud RMA (status='requested') + sus líneas y devuelve la
-- fila completa de order_returns (con return_number). Lock pesimista sobre el
-- pedido para serializar comprobaciones de cantidad ya devuelta.
--
-- p_items = jsonb array [{ "order_item_id": uuid, "quantity": int }, ...]
--
-- Lanza excepción (errcode P0001) con mensaje claro si algo no es elegible;
-- el edge function lo traduce a 422.
-- ════════════════════════════════════════════════════════════════
create or replace function create_return_request(
  p_order_id       uuid,
  p_customer_email text,
  p_items          jsonb,
  p_reason_code    text,
  p_reason_text    text
)
returns order_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status         text;
  v_email          text;
  v_delivered_at   timestamptz;
  v_deleted_at     timestamptz;
  v_shipping_cents int;
  v_store_pays     boolean;
  v_is_full        boolean;
  v_return_number  text;
  v_return         order_returns;
  v_item           record;
  v_oi             record;
  v_already        int;
  v_remaining      int;
begin
  -- ── Lock + validación del pedido ────────────────────────────────
  select status, customer_email, delivered_at, deleted_at, shipping_cents
    into v_status, v_email, v_delivered_at, v_deleted_at, v_shipping_cents
    from orders
    where id = p_order_id
    for update;

  if not found then
    raise exception 'order not found' using errcode = 'P0002';
  end if;

  if v_deleted_at is not null then
    raise exception 'order not eligible: deleted' using errcode = 'P0001';
  end if;

  if lower(v_email) <> lower(coalesce(p_customer_email, '')) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_status <> 'delivered' or v_delivered_at is null then
    raise exception 'order not eligible: not delivered' using errcode = 'P0001';
  end if;

  if now() > v_delivered_at + interval '15 days' then
    raise exception 'order not eligible: return window expired (15 days)'
      using errcode = 'P0001';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'no items to return' using errcode = 'P0001';
  end if;

  -- store_pays_return: la tienda asume el porte de la devolución solo si el
  -- motivo es responsabilidad de la tienda (defecto/daño/artículo erróneo).
  v_store_pays := coalesce(p_reason_code, '') in ('defective', 'damaged', 'wrong_item');

  -- ── Crear cabecera (status='requested') ─────────────────────────
  -- return_number correlativo anual atómico (DEV-2026-0001).
  v_return_number := 'DEV-' || extract(year from now())::int
                     || '-' || lpad(next_return_number(extract(year from now())::int)::text, 4, '0');

  insert into order_returns (
    order_id, return_number, status, customer_email,
    reason_code, reason_text, store_pays_return, is_full_order
  ) values (
    p_order_id, v_return_number, 'requested', lower(v_email),
    nullif(p_reason_code, ''), nullif(p_reason_text, ''), v_store_pays, false
  )
  returning * into v_return;

  -- ── Validar e insertar cada línea ───────────────────────────────
  for v_item in
    select * from jsonb_to_recordset(p_items) as x(order_item_id uuid, quantity int)
  loop
    if v_item.order_item_id is null then
      raise exception 'invalid item: missing order_item_id' using errcode = 'P0001';
    end if;
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'invalid quantity for item %', v_item.order_item_id
        using errcode = 'P0001';
    end if;

    -- El order_item debe pertenecer al pedido y su producto a una categoría
    -- devolvible (categories.is_returnable = true). LEFT JOIN a products por
    -- si el producto fue borrado (product_id set null): entonces NO elegible.
    select oi.id, oi.product_name, oi.product_size_label, oi.unit_price_cents,
           oi.quantity as bought_qty,
           coalesce(c.is_returnable, false) as is_returnable
      into v_oi
      from order_items oi
      left join products p   on p.id = oi.product_id
      left join categories c on c.id = p.category_id
      where oi.id = v_item.order_item_id
        and oi.order_id = p_order_id;

    if not found then
      raise exception 'item % does not belong to order', v_item.order_item_id
        using errcode = 'P0001';
    end if;

    if not v_oi.is_returnable then
      raise exception 'item % is not returnable', v_item.order_item_id
        using errcode = 'P0001';
    end if;

    -- Cantidad ya devuelta en RMAs vivos (no rechazados/cancelados) de este
    -- mismo order_item, incluyendo el que acabamos de crear (aún sin líneas).
    select coalesce(sum(ri.quantity), 0)
      into v_already
      from order_return_items ri
      join order_returns r on r.id = ri.return_id
      where ri.order_item_id = v_item.order_item_id
        and r.status not in ('rejected', 'cancelled');

    v_remaining := v_oi.bought_qty - v_already;
    if v_item.quantity > v_remaining then
      raise exception
        'item % quantity % exceeds returnable remaining %',
        v_item.order_item_id, v_item.quantity, v_remaining
        using errcode = 'P0001';
    end if;

    insert into order_return_items (
      return_id, order_item_id, quantity, line_refund_cents,
      product_name, product_size_label, unit_price_cents
    ) values (
      v_return.id, v_item.order_item_id, v_item.quantity,
      v_oi.unit_price_cents * v_item.quantity,
      v_oi.product_name, v_oi.product_size_label, v_oi.unit_price_cents
    );
  end loop;

  -- ── is_full_order: ¿quedan todos los items elegibles del pedido
  --    devueltos en su totalidad tras esta solicitud? ───────────────
  -- Hay items elegibles pendientes si existe algún order_item devolvible cuya
  -- cantidad comprada supera la suma de cantidades en RMAs vivos.
  select not exists (
    select 1
      from order_items oi
      join products p   on p.id = oi.product_id
      join categories c on c.id = p.category_id
      where oi.order_id = p_order_id
        and c.is_returnable = true
        and oi.quantity > (
          select coalesce(sum(ri.quantity), 0)
            from order_return_items ri
            join order_returns r on r.id = ri.return_id
            where ri.order_item_id = oi.id
              and r.status not in ('rejected', 'cancelled')
        )
  )
  into v_is_full;

  update order_returns
    set is_full_order = v_is_full
    where id = v_return.id
    returning * into v_return;

  return v_return;
end;
$$;

revoke all on function create_return_request(uuid, text, jsonb, text, text) from public;
grant execute on function create_return_request(uuid, text, jsonb, text, text) to service_role;


-- ════════════════════════════════════════════════════════════════
-- approve_return(p_return_id, p_admin_id)
-- requested → approved. Idempotente: si ya approved/received/refunded
-- devuelve el estado actual sin error.
--
-- Calcula y persiste los importes del reembolso (NO mueve dinero):
--   refund_items_cents    = SUM(line_refund_cents) de sus líneas.
--   refund_shipping_cents = orders.shipping_cents SOLO si is_full_order, si no 0.
--   refund_total_cents    = items + shipping, con clamp: nunca mayor que
--                           order.total_cents - (ya reembolsado en RMAs
--                           'refunded' previos del mismo pedido).
-- ════════════════════════════════════════════════════════════════
create or replace function approve_return(
  p_return_id uuid,
  p_admin_id  uuid
)
returns order_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return         order_returns;
  v_order_total    int;
  v_order_shipping int;
  v_items_cents    int;
  v_shipping_cents int;
  v_already_refund int;
  v_cap            int;
  v_total          int;
begin
  select * into v_return
    from order_returns
    where id = p_return_id
    for update;

  if not found then
    raise exception 'return not found' using errcode = 'P0002';
  end if;

  -- Idempotente: ya pasó de 'requested'.
  if v_return.status in ('approved', 'received', 'refunded') then
    return v_return;
  end if;

  if v_return.status <> 'requested' then
    raise exception 'invalid state % (expected requested)', v_return.status
      using errcode = 'P0001';
  end if;

  -- Importe de los items de esta RMA.
  select coalesce(sum(line_refund_cents), 0)
    into v_items_cents
    from order_return_items
    where return_id = p_return_id;

  -- Datos del pedido + reembolsado previo (RMAs ya 'refunded' del pedido).
  select o.total_cents, o.shipping_cents
    into v_order_total, v_order_shipping
    from orders o
    where o.id = v_return.order_id;

  v_shipping_cents := case when v_return.is_full_order then coalesce(v_order_shipping, 0) else 0 end;

  select coalesce(sum(refund_total_cents), 0)
    into v_already_refund
    from order_returns
    where order_id = v_return.order_id
      and status = 'refunded'
      and id <> p_return_id;

  -- Clamp: el total devuelto del pedido nunca puede superar su total_cents.
  v_cap := greatest(coalesce(v_order_total, 0) - v_already_refund, 0);
  v_total := least(v_items_cents + v_shipping_cents, v_cap);

  update order_returns
    set status                = 'approved',
        refund_items_cents    = v_items_cents,
        refund_shipping_cents = v_shipping_cents,
        refund_total_cents    = v_total,
        admin_decision_by     = p_admin_id,
        admin_decision_at     = now()
    where id = p_return_id
    returning * into v_return;

  return v_return;
end;
$$;

revoke all on function approve_return(uuid, uuid) from public;
grant execute on function approve_return(uuid, uuid) to service_role;


-- ════════════════════════════════════════════════════════════════
-- reject_return(p_return_id, p_admin_id, p_note)
-- requested → rejected. Idempotente si ya rejected.
-- ════════════════════════════════════════════════════════════════
create or replace function reject_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_note      text
)
returns order_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return order_returns;
begin
  select * into v_return
    from order_returns
    where id = p_return_id
    for update;

  if not found then
    raise exception 'return not found' using errcode = 'P0002';
  end if;

  if v_return.status = 'rejected' then
    return v_return;
  end if;

  if v_return.status <> 'requested' then
    raise exception 'invalid state % (expected requested)', v_return.status
      using errcode = 'P0001';
  end if;

  update order_returns
    set status              = 'rejected',
        admin_decision_by   = p_admin_id,
        admin_decision_at   = now(),
        admin_decision_note = nullif(p_note, '')
    where id = p_return_id
    returning * into v_return;

  return v_return;
end;
$$;

revoke all on function reject_return(uuid, uuid, text) from public;
grant execute on function reject_return(uuid, uuid, text) to service_role;


-- ════════════════════════════════════════════════════════════════
-- mark_return_received(p_return_id, p_admin_id)
-- approved → received. Idempotente si ya received/refunded.
--
-- Solo transiciona estado de forma atómica. NO toca stock (el admin lo
-- repone a mano) y NO mueve dinero: el reembolso Redsys + la factura
-- rectificativa los hace el edge function admin-return-mark-received DESPUÉS
-- de esta RPC, cerrando luego con set_return_refunded.
-- ════════════════════════════════════════════════════════════════
create or replace function mark_return_received(
  p_return_id uuid,
  p_admin_id  uuid
)
returns order_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return order_returns;
begin
  select * into v_return
    from order_returns
    where id = p_return_id
    for update;

  if not found then
    raise exception 'return not found' using errcode = 'P0002';
  end if;

  -- Idempotente: ya recibido o ya reembolsado.
  if v_return.status in ('received', 'refunded') then
    return v_return;
  end if;

  if v_return.status <> 'approved' then
    raise exception 'invalid state % (expected approved)', v_return.status
      using errcode = 'P0001';
  end if;

  update order_returns
    set status      = 'received',
        received_by = p_admin_id,
        received_at = now()
    where id = p_return_id
    returning * into v_return;

  return v_return;
end;
$$;

revoke all on function mark_return_received(uuid, uuid) from public;
grant execute on function mark_return_received(uuid, uuid) to service_role;


-- ════════════════════════════════════════════════════════════════
-- set_return_refunded(p_return_id, p_redsys_code, p_credit_invoice_id)
-- received → refunded. Idempotente si ya refunded.
--
-- La llama el edge function tras un refund Redsys OK + la factura
-- rectificativa generada. Persiste el código de respuesta Redsys y la
-- factura de abono asociada.
-- ════════════════════════════════════════════════════════════════
create or replace function set_return_refunded(
  p_return_id         uuid,
  p_redsys_code       text,
  p_credit_invoice_id uuid
)
returns order_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_return order_returns;
begin
  select * into v_return
    from order_returns
    where id = p_return_id
    for update;

  if not found then
    raise exception 'return not found' using errcode = 'P0002';
  end if;

  if v_return.status = 'refunded' then
    return v_return;
  end if;

  if v_return.status <> 'received' then
    raise exception 'invalid state % (expected received)', v_return.status
      using errcode = 'P0001';
  end if;

  update order_returns
    set status               = 'refunded',
        redsys_response_code = nullif(p_redsys_code, ''),
        credit_invoice_id    = p_credit_invoice_id,
        refunded_at          = now()
    where id = p_return_id
    returning * into v_return;

  return v_return;
end;
$$;

revoke all on function set_return_refunded(uuid, text, uuid) from public;
grant execute on function set_return_refunded(uuid, text, uuid) to service_role;
