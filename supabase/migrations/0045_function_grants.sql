-- ════════════════════════════════════════════════════════════════
-- 0045_function_grants.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · Q-22 (least privilege en funciones)
--
-- Endurecimiento del privilegio EXECUTE de todas las funciones
-- SECURITY DEFINER del esquema. Por defecto PostgreSQL concede EXECUTE
-- a PUBLIC en cada función nueva, lo que permitiría que cualquier rol
-- (incluido anon) invocase RPCs internas que bypassan RLS.
--
-- Esta migración re-asienta de forma idempotente:
--   1. REVOKE ALL ... FROM public   → quita el grant implícito a PUBLIC.
--   2. GRANT EXECUTE al rol mínimo necesario por función.
--
-- Política de grants:
--   is_admin(uuid)                         → anon, authenticated, service_role
--     (se evalúa dentro de RLS policies ejecutadas por anon/authenticated;
--      service_role lo usa en edge functions).
--   Resto de SECURITY DEFINER que bypassan RLS o tocan contadores/locks
--   fiscales y de retención                → SOLO service_role.
--
-- Las funciones de transición de pedido (accept/reject/mark_shipped/
-- cancel_order_by_customer), stock (reserve/restore), contadores de
-- factura (next_b2c/next_b2b), lock de retención (try_data_retention_lock),
-- anonimización de quotes (anonymize_old_quote_messages) y purga de
-- analytics (purge_analytics_older_than_13_months) ya recibieron sus grants
-- en sus migraciones de origen (0011/0028/0031/0034/0035/0040). Aquí los
-- re-afirmamos como defensa en profundidad: si una migración futura usa
-- CREATE OR REPLACE sin reasignar grants, este archivo documenta el estado
-- esperado y puede re-ejecutarse sin efectos colaterales.
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- is_admin(uuid) — evaluada por anon/authenticated dentro de RLS
-- ────────────────────────────────────────────────────────────────
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;

-- ────────────────────────────────────────────────────────────────
-- Transiciones de estado de pedido — solo service_role
-- ────────────────────────────────────────────────────────────────
revoke all on function accept_order(uuid, uuid) from public;
grant execute on function accept_order(uuid, uuid) to service_role;

revoke all on function reject_order(uuid, uuid, text) from public;
grant execute on function reject_order(uuid, uuid, text) to service_role;

revoke all on function mark_shipped_order(uuid, uuid, text, text) from public;
grant execute on function mark_shipped_order(uuid, uuid, text, text) to service_role;

revoke all on function cancel_order_by_customer(uuid, text) from public;
grant execute on function cancel_order_by_customer(uuid, text) to service_role;

-- ────────────────────────────────────────────────────────────────
-- Reserva / restauración de stock — solo service_role
-- ────────────────────────────────────────────────────────────────
revoke all on function reserve_stock(jsonb) from public;
grant execute on function reserve_stock(jsonb) to service_role;

revoke all on function restore_stock(jsonb) from public;
grant execute on function restore_stock(jsonb) to service_role;

-- ────────────────────────────────────────────────────────────────
-- Contadores de factura — solo service_role (inmutabilidad fiscal)
-- ────────────────────────────────────────────────────────────────
revoke all on function next_b2c_invoice_number(int) from public;
grant execute on function next_b2c_invoice_number(int) to service_role;

revoke all on function next_b2b_invoice_number(int) from public;
grant execute on function next_b2b_invoice_number(int) to service_role;

-- ────────────────────────────────────────────────────────────────
-- Lock de retención de datos (RGPD art. 5.1.e) — solo service_role
-- ────────────────────────────────────────────────────────────────
revoke all on function try_data_retention_lock() from public;
grant execute on function try_data_retention_lock() to service_role;

-- ────────────────────────────────────────────────────────────────
-- Anonimización de mensajes de presupuesto — solo service_role
-- ────────────────────────────────────────────────────────────────
revoke all on function anonymize_old_quote_messages() from public;
grant execute on function anonymize_old_quote_messages() to service_role;

-- ────────────────────────────────────────────────────────────────
-- Purga de analytics > 13 meses — solo service_role
-- ────────────────────────────────────────────────────────────────
revoke all on function purge_analytics_older_than_13_months() from public;
grant execute on function purge_analytics_older_than_13_months() to service_role;

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on function public.is_admin(uuid) is
  'Devuelve true si el usuario está en admin_users. EXECUTE: anon/authenticated/service_role (Q-22 V5).';
