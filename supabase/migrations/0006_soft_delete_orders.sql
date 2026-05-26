-- DC Bikes Cantabria — Carrito Feature M
-- Soft-delete de pedidos pendientes (status='pending' o 'payment_failed').
--
-- Por qué soft-delete (no DELETE físico):
--   1. Mantener integridad referencial con order_items / payments_log /
--      order_status_history sin borrar el rastro de auditoría contable.
--   2. Permite recuperar el pedido si el admin lo elimina por error.
--   3. Cumple buenas prácticas GDPR: el dato permanece purgable a futuro vía
--      una rutina específica (TTL), no por acción casual de la UI admin.
--
-- Idempotente con IF NOT EXISTS.

alter table orders
  add column if not exists deleted_at timestamptz;

-- Índice parcial para listados admin "activos" (excluye soft-deleted).
-- Ordena por created_at desc para alinearse con el dashboard.
create index if not exists idx_orders_active
  on orders(created_at desc)
  where deleted_at is null;

-- Nota: las RLS policies existentes ya permiten UPDATE a authenticated, así
-- que el soft-delete (UPDATE deleted_at) funciona sin tocar policies. Los
-- listados admin deberán filtrar `.is('deleted_at', null)` explícitamente.
