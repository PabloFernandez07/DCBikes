-- 0057_performance_indexes.sql
--
-- Optimización de rendimiento: índices ADITIVOS sobre claves foráneas y columnas
-- de filtro frecuentes que faltaban. No cambia esquema, datos ni lógica — solo
-- acelera lecturas. Todos CREATE INDEX IF NOT EXISTS (idempotente).
--
-- Auditoría previa: el esquema ya estaba bien indexado (orders, order_items,
-- invoices, customer_sessions). Estos son los que faltaban.

-- ── Alto impacto (catálogo / ficha de producto) ──
-- product_images.product_id: se consulta al pintar cada ficha y el catálogo.
create index if not exists idx_product_images_product_id
  on public.product_images (product_id);

-- products.category_id: filtrado de catálogo por categoría.
create index if not exists idx_products_category_id
  on public.products (category_id);

-- ── Analítica / retención (crons de purga por fecha) ──
create index if not exists idx_product_views_product_id
  on public.product_views (product_id);
create index if not exists idx_product_views_viewed_at
  on public.product_views (viewed_at);
create index if not exists idx_search_queries_searched_at
  on public.search_queries (searched_at);

-- ── Presupuestos ──
create index if not exists idx_quote_requests_product_id
  on public.quote_requests (product_id);

-- ── Claves foráneas de administración (bajo tráfico, pero buena práctica:
--    aceleran joins y comprobaciones de borrado) ──
create index if not exists idx_order_status_history_changed_by
  on public.order_status_history (changed_by);
create index if not exists idx_orders_accepted_by
  on public.orders (accepted_by);
create index if not exists idx_admin_users_granted_by
  on public.admin_users (granted_by);
create index if not exists idx_data_breaches_reported_by
  on public.data_breaches (reported_by);
create index if not exists idx_data_subject_requests_resolved_by
  on public.data_subject_requests (resolved_by);
create index if not exists idx_product_price_history_changed_by
  on public.product_price_history (changed_by);
