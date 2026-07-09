-- 0072_products_second_hand.sql
-- Producto de ocasión / segunda mano. Muestra la etiqueta «Ocasión» en el
-- catálogo y la ficha, y permite filtrar el catálogo por ocasión.
alter table products
  add column if not exists is_second_hand boolean not null default false;
comment on column products.is_second_hand is
  'Producto de ocasión / segunda mano. Etiqueta en catálogo/ficha + filtro.';
