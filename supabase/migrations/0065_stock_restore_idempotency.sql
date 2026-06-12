-- ════════════════════════════════════════════════════════════════
-- 0065_stock_restore_idempotency.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría técnica 2026-06-12 · BUG-C2 + BUG-M3
--
-- 1) orders.stock_restored_at — marca idempotente de restauración de
--    stock. order-place reserva stock al crear el pedido; hasta ahora
--    existían VARIOS caminos que llamaban a restore_stock (order-reject,
--    customer-order-cancel, order-auto-cancel, revert de captura KO en
--    order-accept) sin coordinación: pedidos fallidos/abandonados nunca
--    liberaban stock y algunos caminos podían restaurarlo DOS veces.
--
--    El nuevo helper compartido restoreStockOnce() (edge functions,
--    _shared/stock-restore.ts) hace un UPDATE condicional:
--        SET stock_restored_at = now() WHERE id = ? AND stock_restored_at IS NULL
--    y SOLO si consiguió marcar la fila (count=1) llama a la RPC
--    restore_stock. Una segunda llamada (concurrente o posterior) ve la
--    marca y no duplica. NULL = stock aún comprometido al pedido.
--
-- 2) stock_alerts.send_attempts — BUG-M3: send-stock-alert sella
--    notified_at ANTES de enviar (anti-carrera, correcto), pero si
--    Resend fallaba la alerta moría para siempre. Ahora, tras un fallo
--    de envío se revierte notified_at a NULL y se incrementa
--    send_attempts; al alcanzar 5 intentos la alerta queda sellada
--    definitivamente (abandono con log).
--
-- Idempotente (IF NOT EXISTS).
-- ════════════════════════════════════════════════════════════════

-- ─── 1) Idempotencia de restauración de stock ────────────────────
alter table orders
  add column if not exists stock_restored_at timestamptz;

comment on column orders.stock_restored_at is
  'Marca idempotente de restauración de stock (BUG-C2). NULL = el stock reservado en order-place sigue comprometido al pedido. Se sella vía restoreStockOnce() ANTES de llamar a restore_stock; garantiza que ningún camino (reject/cancel/auto-cancel/delete/payment_failed) restaure dos veces.';

-- Índice para la nueva rama del cron order-auto-cancel: pedidos
-- pending/payment_failed antiguos (stock zombi) escaneados por created_at.
create index if not exists idx_orders_stale_unpaid
  on orders(created_at)
  where status in ('pending', 'payment_failed') and deleted_at is null;

-- ─── 2) Reintentos de envío de avisos de stock ───────────────────
alter table stock_alerts
  add column if not exists send_attempts int not null default 0;

comment on column stock_alerts.send_attempts is
  'Número de intentos de envío del email de aviso (BUG-M3). Si el envío vía Resend falla se revierte notified_at a NULL y se incrementa; con send_attempts >= 5 la alerta se abandona (notified_at queda sellado).';
