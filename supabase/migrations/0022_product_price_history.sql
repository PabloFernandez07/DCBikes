-- 0022_product_price_history.sql
-- Cierre del hallazgo C-04 (auditoría legal V3): Omnibus / RDL 1/2007 art. 20.1.
-- Mantiene historial de precios por variante (products.id) para mostrar el mínimo
-- de los últimos 30 días como referencia cuando se anuncia un descuento.
--
-- NOTA: El esquema usa la tabla `products` (no product_variants).
-- retail_price es numeric(10,2) en euros — se almacena igual aquí.

create table if not exists product_price_history (
  id             bigserial primary key,
  product_id     uuid not null references products(id) on delete cascade,
  price          numeric(10,2) not null,
  effective_from timestamptz not null default now(),
  effective_to   timestamptz
);

create index if not exists price_history_product_idx
  on product_price_history(product_id, effective_from desc);

-- RLS: lectura pública del histórico de precios (información obligatoria por ley).
alter table product_price_history enable row level security;

drop policy if exists price_history_public_read on product_price_history;
create policy price_history_public_read on product_price_history
  for select to anon, authenticated using (true);

-- Trigger: registra cambios de retail_price en products
create or replace function fn_record_price_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into product_price_history(product_id, price)
    values (NEW.id, NEW.retail_price);
  elsif TG_OP = 'UPDATE' and OLD.retail_price is distinct from NEW.retail_price then
    update product_price_history
       set effective_to = now()
     where product_id = NEW.id and effective_to is null;
    insert into product_price_history(product_id, price)
    values (NEW.id, NEW.retail_price);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_price_history on products;
create trigger trg_price_history
  after insert or update of retail_price on products
  for each row execute function fn_record_price_change();

-- Función helper: mínimo precio últimos 30 días (NULL si no hay historial).
create or replace function get_min_price_last_30d(p_product_id uuid) returns numeric
language sql stable
security definer
set search_path = public
as $$
  select min(price)
  from product_price_history
  where product_id = p_product_id
    and effective_from > now() - interval '30 days';
$$;

grant execute on function get_min_price_last_30d(uuid) to anon, authenticated;

-- Backfill: para cada producto existente, registra el precio actual como punto inicial.
-- Usa updated_at o created_at como fecha efectiva para aproximar el historial real.
insert into product_price_history(product_id, price, effective_from)
select id, retail_price, coalesce(updated_at, created_at, now())
from products
where not exists (
  select 1 from product_price_history h where h.product_id = products.id
);
