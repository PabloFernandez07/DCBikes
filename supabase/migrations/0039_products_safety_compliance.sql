-- 0039_products_safety_compliance.sql
-- X-04 · Conformidad y seguridad de productos (Reg. UE 2023/988 GPSR)
--
-- Añade tres columnas a `products` para registrar:
--   • Marcado CE (boolean): conformidad UE.
--   • Normas técnicas aplicables (text[]): p.ej. EN 1078 cascos, EN 14781 bicicletas.
--   • Fabricante o representante UE (text): nombre comercial registrado.
--
-- Estos campos son opcionales por producto; los productos sin información no
-- renderizan la sección "Conformidad y seguridad" en la ficha pública.

alter table products
  add column if not exists ce_marking boolean not null default false,
  add column if not exists safety_standards text[] not null default array[]::text[],
  add column if not exists manufacturer_eu text;

create index if not exists products_ce_marking_idx
  on products(ce_marking)
  where ce_marking = true;

comment on column products.ce_marking is
  'X-04: marcado CE conformidad UE (Reg. UE 2023/988 General Product Safety)';
comment on column products.safety_standards is
  'X-04: normas técnicas aplicables (ej. EN 1078 cascos, EN 14781 bicicletas)';
comment on column products.manufacturer_eu is
  'X-04: nombre fabricante o representante UE registrado';
