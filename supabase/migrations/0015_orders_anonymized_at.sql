-- 0015_orders_anonymized_at.sql
-- Idempotencia del cron: la columna anonymized_at evita reanonimizar
-- órdenes que ya fueron procesadas en `data-retention-cron`.
--
-- Las órdenes con más de 6 años se anonimizan (no se borran — conservación
-- contable AEAT). Se conservan totales, fechas y order_number; se eliminan
-- email, teléfono, nombre, dirección de envío e IP/UA de consentimiento.

alter table orders
  add column if not exists anonymized_at timestamptz;

create index if not exists idx_orders_anonymized_pending
  on orders(created_at)
  where anonymized_at is null;

comment on column orders.anonymized_at is 'Marca temporal de anonimización por retención (>6a). NULL = no anonimizado todavía.';
