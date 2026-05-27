-- ════════════════════════════════════════════════════════════════
-- 0043_customer_email_lowercase_check.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 2 · B-18
--
-- Garantiza que todo customer_email en orders, quote_requests y
-- customer_sessions esté almacenado en minúsculas. Sin esto, dos
-- pedidos con el mismo email pero capitalización distinta se
-- consideran de "clientes distintos" → fugas potenciales en consultas
-- públicas (`order-public-get`), duplicidad en consent_audit, y
-- divergencias en flujos magic-link.
--
-- Pasos:
--   1. Normalizar filas existentes con UPDATE ... = lower(...).
--   2. Añadir CHECK constraint NOT VALID (para no bloquear el deploy
--      si quedaran filas no normalizadas por timing).
--   3. VALIDATE CONSTRAINT — esto chequea TODAS las filas y bloquea
--      si alguna no cumple (debe pasar tras el UPDATE).
-- ════════════════════════════════════════════════════════════════

-- ── 1. Normalizar datos existentes ──────────────────────────────
update orders
  set customer_email = lower(customer_email)
  where customer_email <> lower(customer_email);

update quote_requests
  set email = lower(email)
  where email <> lower(email);

update customer_sessions
  set email = lower(email)
  where email <> lower(email);

-- ── 2. CHECK constraints ─────────────────────────────────────────

alter table orders
  drop constraint if exists orders_customer_email_lower;
alter table orders
  add constraint orders_customer_email_lower
  check (customer_email = lower(customer_email)) not valid;
alter table orders
  validate constraint orders_customer_email_lower;

alter table quote_requests
  drop constraint if exists quote_requests_email_lower;
alter table quote_requests
  add constraint quote_requests_email_lower
  check (email = lower(email)) not valid;
alter table quote_requests
  validate constraint quote_requests_email_lower;

alter table customer_sessions
  drop constraint if exists customer_sessions_email_lower;
alter table customer_sessions
  add constraint customer_sessions_email_lower
  check (email = lower(email)) not valid;
alter table customer_sessions
  validate constraint customer_sessions_email_lower;
