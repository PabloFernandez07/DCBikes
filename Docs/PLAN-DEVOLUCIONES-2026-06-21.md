# Plan de implementación — Devoluciones (RMA) · DC Bikes

Blueprint del arquitecto senior (2026-06-21). Spec acordado con el titular + diseño técnico sobre el código real.

## Spec acordado
- Devolvible = productos de **categorías marcadas como devolvibles** (flag nuevo `categories.is_returnable`, default false). Bicis/nutrición fuera.
- Plazo **15 días naturales desde la entrega** (≥ mínimo legal 14).
- Solo pedidos **entregados/recogidos**.
- Inician **cliente (Mis pedidos) y admin**.
- **Parcial** (items concretos).
- Reembolso **automático Redsys (refund type 3) al aprobar** + **producto + envío original** (envío solo si pedido entero).
- Stock **nunca automático** (admin a mano al recibir).
- Envío de la devolución: **cliente, salvo defecto/error** (informa al admin).
- **Factura rectificativa (abono) automática** al reembolsar (VeriFactu, TipoFactura R1, importes negativos).
- Motivo: **lista** + texto libre opcional.

## Modelo de datos (migración 0066 + 0067)
- `categories.is_returnable` (flag).
- `orders.delivered_at` (NUEVO — no existía; backfill desde history).
- `order_returns` (cabecera RMA: estados requested→approved/rejected→received→refunded/cancelled, motivo, importes, reembolso Redsys, factura rectificativa, auditoría).
- `order_return_items` (líneas, cantidad por item).
- `return_counter` + `next_return_number` (correlativo DEV-2026-NNNN).
- invoices: quitar UNIQUE(order_id), ampliar tipos (rectificativa_b2c/b2b), columnas `rectifies_invoice_id`/`return_id`, contadores de rectificativas, RPC `append_credit_invoice_chained`.
- RLS patrón inmutable: admin SELECT, mutación solo service_role vía RPC/edge function.

## Edge functions
Cliente (magic-link): `customer-return-eligibility`, `customer-return-request`.
Admin: `admin-return-list/get/approve/reject/mark-received`.
Internas: `generate-credit-invoice`, `send-return-{requested-customer,requested-admin,approved-customer,rejected-customer}`.
Helper Redsys `refund` (type 3, éxito 0900) en `_shared/order-admin.ts`.

## Frontend
- Admin Categorías: checkbox "Admite devolución".
- Cliente: botón "Solicitar devolución" en Mis pedidos + `ReturnRequestModal`.
- Admin: `/admin/devoluciones` (lista) + `/admin/devoluciones/:id` (gestionar: aprobar/rechazar/recibir).

## Reparto en 8 lotes paralelos (propiedad exclusiva de archivos)
- LOTE-0: migración 0066 (tablas, flag, delivered_at, RLS, contador) — BLOQUEANTE.
- LOTE-FACT: migración 0067 (rectificativa + RPC abono).
- LOTE-1: Redsys refund + RPCs de estado (order-admin.ts + SQL RPCs).
- LOTE-2: edge functions cliente + delivered_at en order-mark-delivered.
- LOTE-3: edge functions admin.
- LOTE-4: generate-credit-invoice.
- LOTE-5: emails + TODAS las entradas config.toml.
- LOTE-FE-CAT / LOTE-FE-CLIENTE / LOTE-FE-ADMIN: frontend.

## Riesgos / decisiones del titular
1. **Permiso de devoluciones en el terminal Redsys**: el banco debe habilitarlo; sin él, el refund real (prod) falla. En test/mock funciona.
2. **14 vs 15 días**: 15 es legal (por encima del mínimo); actualizar la página /devoluciones y el email para que sean coherentes.
3. Reembolso "al aprobar" (antes de recibir físicamente) es decisión del titular — generoso, leve riesgo.
