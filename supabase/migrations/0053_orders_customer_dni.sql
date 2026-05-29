-- 0053_orders_customer_dni.sql
--
-- Añade la columna customer_dni a orders. El checkout ya capturaba el NIF/DNI
-- del comprador (B2C) y todo el backend lo esperaba (generate-invoice-pdf C-09:
-- NIF obligatorio en facturas simplificadas > 400 €, RD 1619/2012 art. 7.1;
-- generate-order-contract; customer-request-invoice), pero la columna nunca se
-- había creado y order-place no lo persistía. Sin ella, leer el pedido fallaba
-- (500 "error leyendo el pedido") al solicitar la factura.
--
-- Idempotente.

alter table public.orders
  add column if not exists customer_dni text;

comment on column public.orders.customer_dni is
  'NIF/DNI del comprador (B2C). Obligatorio en facturas simplificadas > 400 € (RD 1619/2012 art. 7.1). Opcional para importes menores.';
