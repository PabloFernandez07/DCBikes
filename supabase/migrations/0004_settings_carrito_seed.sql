-- DC Bikes Cantabria — Seed de settings para el carrito de compra (Fase J).
--
-- Inserta las 13 keys del plan de carrito con valores por defecto sensatos.
-- Idempotente: si la admin ya las personalizó desde el panel, NO se sobrescriben.
--
-- Convención de tipos en `settings.value` (jsonb):
--   - Números enteros / decimales → almacenados como número JSON (`690`, `21.00`).
--   - Strings                     → almacenados como string JSON (`'"FAC"'`).

insert into settings (key, value) values
  -- ─── E-commerce ──────────────────────────────────────────────
  ('shipping_flat_rate_cents',      '690'::jsonb),         -- 6,90 €
  ('shipping_free_threshold_cents', '5000'::jsonb),        -- 50 €
  ('order_auto_cancel_hours',       '48'::jsonb),          -- 48 h (max 144 por límite Redsys 7d)
  ('order_notification_emails',     '""'::jsonb),          -- CSV de emails admin (vacío por defecto)
  ('pickup_deadline_days',          '15'::jsonb),          -- 15 días para recoger en tienda

  -- ─── Facturación ─────────────────────────────────────────────
  ('tax_rate_default',              '21.00'::jsonb),       -- IVA 21 %
  ('invoice_series_prefix',         '"FAC"'::jsonb),
  ('order_series_prefix',           '"ORD"'::jsonb),
  -- Datos legales (legal_company_*) NO se siembran como string vacío:
  -- el cliente debe rellenarlos en /admin/configuracion antes de aceptar pedidos.
  -- order-place/index.ts hace gate y devuelve 503 si están vacíos.
  ('store_contact_email',           '"info@dcbikescantabria.es"'::jsonb),

  -- ─── Pasarela Redsys (no credenciales) ───────────────────────
  ('redsys_environment',            '"test"'::jsonb),      -- 'test' | 'prod'
  ('redsys_merchant_name',          '"DC Bikes Cantabria"'::jsonb),

  -- ─── Verifactu (RD 1007/2023) ────────────────────────────────
  -- verifactu_mode debe rellenarlo el administrador antes de emitir facturas.
  -- Se siembra como null para forzar decisión consciente:
  --   'verifactu'    → envío real-time a AEAT + QR + leyenda
  --   'no_verifactu' → registro firmado local + remisión a requerimiento
  ('verifactu_mode',                'null'::jsonb)
on conflict (key) do nothing;
