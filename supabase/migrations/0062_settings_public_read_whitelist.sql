-- 0062_settings_public_read_whitelist.sql
-- C-1 (auditoría legal 2026-06-11): lectura pública de settings restringida
-- por whitelist de claves NO sensibles.
--
-- Por qué: la LSSI-CE art. 10 obliga a que CUALQUIER visitante (rol anon, sin
-- login) pueda leer la identidad del titular (denominación, NIF, domicilio,
-- datos de inscripción y contacto) directamente desde la web. Tras la
-- migración 0030 (Q-06 V5) la tabla `settings` quedó con SELECT solo
-- is_admin(), por lo que el frontend público no puede renderizar el Aviso
-- Legal ni los datos de tienda/envío desde la base de datos.
--
-- Solución: política SELECT adicional para anon y authenticated limitada a
-- una whitelist EXACTA de claves públicas. Las políticas RLS son permisivas
-- (se combinan con OR), así que los admins conservan lectura completa vía
-- `settings_select_admin` (0030) y el resto de roles solo ve la whitelist.
--
-- NUNCA exponer (quedan fuera de la whitelist a propósito):
--   redsys_*            → credenciales de pasarela de pago
--   verifactu_*         → configuración fiscal interna / certificados
--   order_notification_emails, quote_destination_email, reply_from_email
--                       → direcciones internas (riesgo spam/phishing dirigido)
--   invoice_*           → series de facturación internas
--   order_series_prefix → numeración interna de pedidos
--
-- Si en el futuro se añade una clave pública nueva, hay que ampliar la
-- whitelist en una migración nueva (fail-closed por defecto).

drop policy if exists settings_select_public_whitelist on settings;

create policy settings_select_public_whitelist on settings
  for select
  to anon, authenticated
  using (
    key = any(array[
      -- Identidad del titular (LSSI-CE art. 10)
      'legal_company_name',
      'legal_company_cif',
      'legal_company_address',
      'legal_forma_juridica',
      'legal_inscripcion',
      'legal_contact_email',
      -- Datos de la tienda física (contacto / cómo llegar)
      'store_name',
      'store_address',
      'store_phone',
      'store_schedule',
      'maps_link',
      'social_instagram',
      'social_facebook',
      -- Condiciones comerciales mostradas en checkout y Términos de Venta
      'shipping_flat_rate_cents',
      'shipping_free_threshold_cents',
      'tax_rate_default',
      'pickup_deadline_days',
      'order_auto_cancel_hours'
    ])
  );

comment on policy settings_select_public_whitelist on settings is
  'C-1: lectura pública (anon+authenticated) limitada a claves no sensibles. '
  'LSSI-CE art. 10: la identidad del titular debe ser accesible sin login. '
  'Claves sensibles (redsys_*, verifactu_*, emails internos, invoice_*) '
  'siguen siendo solo is_admin() vía settings_select_admin (0030).';
