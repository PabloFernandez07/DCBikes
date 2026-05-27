-- 0036_customer_sessions_purged_at.sql
-- Hallazgo Q-12 (auditoría V5): introducir patrón soft-purge en
-- `customer_sessions` para conservar trazabilidad mínima (id + created_at +
-- purged_at) tras 30 días y mantener un hard-delete diferido a 90 días.
--
-- Motivación: una sesión expirada >30d ya no debe contener PII (email
-- cliente, ip, user_agent) pero conviene poder demostrar a una auditoría
-- AEPD que la sesión existió y fue purgada en tiempo. Por eso vaciamos
-- los campos sensibles (UPDATE) en lugar de DELETE inmediato. El borrado
-- físico se aplica más adelante (90 días) por minimización RGPD.
--
-- Idempotente: usamos IF NOT EXISTS para que se pueda reaplicar sin error.

alter table customer_sessions
  add column if not exists purged_at timestamptz;

-- Índice parcial: solo nos interesan las filas NO purgadas (las purgadas
-- son cola de borrado y a corto plazo se eliminarán físicamente). El
-- predicado `where purged_at is null` mantiene el índice pequeño.
create index if not exists customer_sessions_purged_at_idx
  on customer_sessions (purged_at)
  where purged_at is null;

comment on column customer_sessions.purged_at is
  'Soft-purge timestamp: cuando se anonimizó la sesión (Q-12). NULL = activa o pendiente de purga. El hard-delete ocurre tras 90d.';
