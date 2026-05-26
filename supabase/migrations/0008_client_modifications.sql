-- DC Bikes Cantabria — Carrito Feature O
-- Modificaciones por parte del cliente (cancelación + cambio dirección).
--
-- Permite al cliente:
--   1. Cancelar un pedido en estado 'authorized' (libera pre-auth Redsys).
--   2. Modificar la dirección de envío en pedidos pending/authorized/accepted
--      con delivery_method='shipping'.
--
-- Las edge functions correspondientes (customer-order-cancel /
-- customer-order-update-address) son las únicas que tocan estos campos.
-- Auditamos el cambio en order_status_history (reason="…por el cliente").

alter table orders
  add column if not exists client_modified_at timestamptz;

alter table orders
  add column if not exists cancelled_by_customer boolean default false;

-- Índice parcial para consultas "pedidos modificados por cliente recientemente"
-- (admin dashboard, métricas). Solo indexa filas con valor → coste mínimo.
create index if not exists idx_orders_client_modified
  on orders(client_modified_at desc)
  where client_modified_at is not null;
