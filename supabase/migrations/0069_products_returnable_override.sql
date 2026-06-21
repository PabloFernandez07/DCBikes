-- 0069_products_returnable_override.sql
-- Override de "devolvible" POR PRODUCTO sobre el flag de categoría.
--
-- products.is_returnable (nullable):
--   true  → el producto SE PUEDE devolver, ignore lo que diga la categoría.
--   false → el producto NO se puede devolver, ignore la categoría.
--   null  → hereda de la categoría (categories.is_returnable). Comportamiento
--           por defecto (no rompe nada de lo existente).
--
-- Elegibilidad efectiva = coalesce(products.is_returnable, categories.is_returnable, false).
-- Hay que reflejarlo en la RPC create_return_request (aquí) y en la edge
-- function customer-return-eligibility (cambio aparte).

alter table products
  add column if not exists is_returnable boolean;
comment on column products.is_returnable is
  'Override de devolución por producto: true=devolvible, false=no devolvible, null=hereda de la categoría.';

-- ════════════════════════════════════════════════════════════════
-- create_return_request — recreada con override por producto.
-- Único cambio respecto a 0068: la elegibilidad usa
-- coalesce(p.is_returnable, c.is_returnable, false) en vez de
-- coalesce(c.is_returnable, false).
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

    -- El order_item debe pertenecer al pedido y ser devolvible. Devolvible =
    -- coalesce(products.is_returnable, categories.is_returnable, false): el
    -- override por producto manda sobre el flag de la categoría. LEFT JOIN por
    -- si el producto fue borrado (product_id set null) → NO elegible.
    select oi.id, oi.product_name, oi.product_size_label, oi.unit_price_cents,
           oi.quantity as bought_qty,
           coalesce(p.is_returnable, c.is_returnable, false) as is_returnable
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
  select not exists (
    select 1
      from order_items oi
      join products p   on p.id = oi.product_id
      join categories c on c.id = p.category_id
      where oi.order_id = p_order_id
        and coalesce(p.is_returnable, c.is_returnable, false) = true
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
