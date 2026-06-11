-- 0064_drop_settings_public_read_legacy.sql
-- Hallazgo derivado de C-1 (auditoría legal 2026-06-11): en producción
-- sobrevivía la política heredada `public_read_settings` (0001) con
-- USING (true) para el rol public — la 0030 creó las políticas de admin
-- pero no eliminó esta, así que TODA la tabla settings era legible por
-- cualquier visitante anónimo, incluyendo claves sensibles:
--   quote_destination_email / order_notification_emails / reply_from_email
--     → emails internos del titular (riesgo de spam/phishing dirigido)
--   redsys_*, verifactu_*, invoice_*, order_series_prefix, require_payment_otp
--     → configuración interna de pagos y facturación
--
-- Con la whitelist de 0062 ya en vigor, esta política sobra: el público
-- conserva exactamente las claves no sensibles y los admins su acceso
-- completo (settings_select_admin, 0030).

drop policy if exists public_read_settings on settings;
