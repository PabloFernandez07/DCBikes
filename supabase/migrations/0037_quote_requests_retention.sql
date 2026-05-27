-- 0037_quote_requests_retention.sql
-- Hallazgo Q-14 (auditoría V5): plazos de conservación y revocación para
-- `quote_requests` (formulario de presupuesto público).
--
-- Base legal: el tratamiento del formulario de contacto/presupuesto se basa
-- en consentimiento del interesado (RGPD art. 6.1.a) o, si llega a derivar
-- en operación comercial, en medidas precontractuales (art. 6.1.b). En
-- ambos casos:
--   * Cuando el interesado revoca el consentimiento → debemos purgar
--     "sin dilación indebida" (RGPD art. 17.1.b). Aplicamos 7 días.
--   * Si la quote no deriva en pedido, conservamos los datos mínimos
--     necesarios solo durante el periodo razonable de contacto. Aplicamos
--     13 meses (alineado con la política general de retention) y
--     anonimizamos el mensaje libre (que es el campo con mayor riesgo
--     de PII no estructurada).
--
-- Idempotente.

alter table quote_requests
  add column if not exists revoked_at timestamptz;

alter table quote_requests
  add column if not exists purged_at timestamptz;

-- revoked_at: solo interesan las filas con revocación pendiente o
-- ya procesada (no NULL). Índice parcial para mantenerlo pequeño.
create index if not exists quote_requests_revoked_idx
  on quote_requests (revoked_at)
  where revoked_at is not null;

-- purged_at: el cron procesará las filas TODAVÍA no purgadas. El predicado
-- inverso al anterior nos da una cola eficiente para el job de retention.
create index if not exists quote_requests_purged_idx
  on quote_requests (purged_at)
  where purged_at is null;

comment on column quote_requests.revoked_at is
  'Timestamp en el que el interesado revocó el consentimiento. Dispara purga inmediata (Q-14).';
comment on column quote_requests.purged_at is
  'Timestamp en el que el cron anonimizó la quote. NULL = aún contiene message original (Q-14).';
