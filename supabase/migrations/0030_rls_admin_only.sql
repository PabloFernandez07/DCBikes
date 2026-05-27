-- 0030_rls_admin_only.sql
-- Hallazgos Q-06 + Q-08 + Q-09 (auditoría V5): blindaje RLS de tablas de
-- configuración, catálogo e infraestructura interna.
--
-- Estado previo (heredado de 0001_initial.sql + 0003_orders_schema.sql):
--   settings           "auth_settings"          → auth.role()='authenticated' (no is_admin)
--   categories         "auth_categories"        → auth.role()='authenticated' (no is_admin)
--   products           "auth_products"          → auth.role()='authenticated' (no is_admin)
--   product_images     "auth_images"            → auth.role()='authenticated' (no is_admin)
--   order_counter      order_counter_admin      → FOR ALL TO authenticated
--   invoice_counter    invoice_counter_admin    → FOR ALL TO authenticated
--
-- Problema: cualquier usuario authenticated (incluyendo customers via magic
-- link en el futuro o usuarios mal aprovisionados) podía modificar settings,
-- catálogo o contadores. Q-08/Q-09 exigen restringir a is_admin() y bloquear
-- order_counter/invoice_counter a SOLO service_role (las edge functions ya
-- los manipulan vía service_role bypass).

-- ════════════════════════════════════════════════════════════════
-- ─── settings: solo is_admin() ──────────────────────────────────
-- ════════════════════════════════════════════════════════════════
drop policy if exists auth_settings on settings;
drop policy if exists settings_select_admin on settings;
drop policy if exists settings_modify_admin on settings;

create policy settings_select_admin on settings
  for select to authenticated
  using (is_admin());

create policy settings_modify_admin on settings
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── categories: lectura pública + escritura is_admin() ─────────
-- ════════════════════════════════════════════════════════════════
-- (public_read_categories permanece intacto: lectura pública del catálogo)
drop policy if exists auth_categories on categories;
drop policy if exists categories_admin on categories;

create policy categories_admin on categories
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── products: lectura pública + escritura is_admin() ───────────
-- ════════════════════════════════════════════════════════════════
-- (public_read_products permanece intacto: lectura pública active=true)
drop policy if exists auth_products on products;
drop policy if exists products_admin on products;

create policy products_admin on products
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── product_images: lectura pública + escritura is_admin() ─────
-- ════════════════════════════════════════════════════════════════
-- (public_read_images permanece intacto)
drop policy if exists auth_images on product_images;
drop policy if exists product_images_admin on product_images;

create policy product_images_admin on product_images
  for all to authenticated
  using (is_admin())
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── order_counter: SOLO service_role ───────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Tabla interna manipulada únicamente por next_order_number() en edge
-- functions con service_role. Bloquear acceso desde authenticated.
drop policy if exists order_counter_admin on order_counter;
drop policy if exists order_counter_service on order_counter;

create policy order_counter_service on order_counter
  for all to service_role
  using (true)
  with check (true);

-- ════════════════════════════════════════════════════════════════
-- ─── invoice_counter: SOLO service_role ─────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Tabla legacy (las series activas son invoice_counter_b2c/b2b ya en
-- 0011_invoice_series_split.sql, restringidas a service_role). Aplicamos
-- el mismo patrón al counter legacy para uniformidad.
drop policy if exists invoice_counter_admin on invoice_counter;
drop policy if exists invoice_counter_service on invoice_counter;

create policy invoice_counter_service on invoice_counter
  for all to service_role
  using (true)
  with check (true);

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on table settings is
  'Configuración global. Escritura/lectura solo is_admin() (Q-06 V5).';
comment on table order_counter is
  'Contador correlativo pedidos. Solo service_role (Q-08 V5). Manipulado por next_order_number().';
comment on table invoice_counter is
  'Contador legacy de facturas. Solo service_role (Q-09 V5). Las series activas son invoice_counter_b2c/b2b.';
