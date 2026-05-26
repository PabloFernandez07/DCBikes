-- DC Bikes Cantabria — Carrito Fase A
-- Añade campos para "comprar online", agrupación por talla y datos extra de producto.
-- NO modifica columnas existentes (cost_price, retail_price, etc.).

alter table products
  add column if not exists is_purchasable boolean default false,
  add column if not exists size_label     text,
  add column if not exists model_group    text,
  add column if not exists weight_grams   int,
  add column if not exists ean            text;

-- Índices selectivos (parciales) para queries del catálogo y agrupador admin.
create index if not exists idx_products_model_group
  on products(model_group)
  where model_group is not null;

create index if not exists idx_products_is_purchasable
  on products(is_purchasable)
  where is_purchasable = true;

create index if not exists idx_products_ean
  on products(ean)
  where ean is not null;
