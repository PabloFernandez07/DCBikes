-- 0060_products_flavor.sql
-- Variante por SABOR (nutrición): añade dimensión de sabor a productos.
-- Igual que color/talla: las filas comparten model_group y se diferencian por
-- flavor. La ficha muestra 1 tarjeta con selector de sabor.
alter table public.products add column if not exists flavor text;
