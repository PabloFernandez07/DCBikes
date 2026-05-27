-- ════════════════════════════════════════════════════════════════
-- 0042_order_public_get_rate_limit.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 2 · B-15
--
-- Rate limit por IP/minuto sobre el endpoint público `order-public-get`.
-- Sin auth, cualquiera con link puede consultar pedidos: hay que mitigar
-- ataques de enumeración / scraping masivo de tokens.
--
-- Implementación bucket por minuto:
--   PK = (ip_address, bucket_minute)
--   UPSERT con `request_count = request_count + 1`. Si pasa de 30 → 429.
--
-- La tabla se purga vía cron (data-retention-cron) — buckets >24h se
-- pueden borrar sin pérdida de información útil.
-- ════════════════════════════════════════════════════════════════

create table if not exists order_public_get_rate (
  ip_address    text        not null,
  bucket_minute timestamptz not null,
  request_count int         not null default 0,
  primary key (ip_address, bucket_minute)
);

create index if not exists order_public_get_rate_bucket_idx
  on order_public_get_rate(bucket_minute);

alter table order_public_get_rate enable row level security;

-- Sin policies: INSERT/UPDATE/SELECT solo vía service_role (la edge
-- function). Ningún rol cliente debe ver buckets de otros IPs.
revoke all on order_public_get_rate from authenticated, anon;
