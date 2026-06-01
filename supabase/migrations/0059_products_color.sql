-- 0059_products_color.sql
-- Variantes color × talla (Opción B): añade dimensión de color a productos.
-- Un "grupo" (model_group) puede tener varias tallas Y varios colores; cada fila
-- product es una combinación (color, size_label). La web muestra 1 tarjeta y
-- dentro selector de color + talla.
alter table public.products add column if not exists color text;

-- Índice para el fetch de variantes por grupo (useProductGroup).
create index if not exists idx_products_model_group
  on public.products (model_group)
  where model_group is not null;
