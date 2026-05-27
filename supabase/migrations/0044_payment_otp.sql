-- ════════════════════════════════════════════════════════════════
-- 0044_payment_otp.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 2 · X-17
--
-- OTP de 6 dígitos por email antes de redirigir a Redsys. Capa extra
-- de seguridad solicitada por el titular para que el envío de credenciales
-- bancarias quede precedido de una prueba "algo que sabes" (ligada al
-- buzón del comprador).
--
-- Modelo:
--   • Generamos un OTP de 6 dígitos en send-payment-otp.
--   • Persistimos SHA-256 hex en payment_otp_hash (nunca el OTP en claro).
--   • Caducidad fija de 5 minutos en payment_otp_expires_at.
--   • payment_otp_attempts: contador de intentos fallidos. ≥5 → bloqueo
--     permanente del OTP hasta que se solicite uno nuevo (lo único que
--     resetea attempts es la emisión de un nuevo OTP).
--   • payment_otp_verified_at: timestamp de la verificación exitosa. Al
--     marcarlo NOT NULL, el hash se borra (defensa frente a leaks de DB).
--
-- Setting global require_payment_otp = "false" por defecto: el flujo está
-- DESACTIVADO hasta que S2-B2 acople el redirect en order-place. Esto
-- permite desplegar la infraestructura sin romper el checkout actual.
-- ════════════════════════════════════════════════════════════════

alter table orders
  add column if not exists payment_otp_hash text,
  add column if not exists payment_otp_expires_at timestamptz,
  add column if not exists payment_otp_attempts int not null default 0,
  add column if not exists payment_otp_verified_at timestamptz;

-- Índice parcial sobre expires_at: solo los OTP activos. Permite
-- consultas eficientes para crons de limpieza (opcional, S3) y para
-- futuras métricas de OTP caducados.
create index if not exists orders_payment_otp_expires_idx
  on orders(payment_otp_expires_at)
  where payment_otp_expires_at is not null;

-- Setting global para activar/desactivar el flujo. S2-B2 lo leerá en
-- order-place para decidir si redirige a /pedido/:id/otp o directamente
-- a Redsys. Se inserta como JSON string para mantener consistencia con
-- el resto de settings ("true" / "false" como texto JSON).
insert into settings(key, value)
values ('require_payment_otp', '"false"'::jsonb)
on conflict (key) do nothing;

comment on column orders.payment_otp_hash is
  'X-17: SHA-256 hex (64 chars) del OTP de 6 dígitos enviado por email. Se borra (NULL) tras verificación exitosa.';
comment on column orders.payment_otp_expires_at is
  'X-17: timestamp de caducidad del OTP. Por defecto now() + 5min en send-payment-otp.';
comment on column orders.payment_otp_attempts is
  'X-17: contador de intentos de verificación fallidos. Tras 5 → bloqueo permanente del OTP hasta nueva emisión.';
comment on column orders.payment_otp_verified_at is
  'X-17: timestamp de verificación exitosa. NOT NULL => OTP ya consumido, no reutilizable.';
