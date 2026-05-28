-- ════════════════════════════════════════════════════════════════
-- 0049_validate_vat_rate_limit.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · X-08
--
-- Rate limit por IP/hora sobre el endpoint público `validate-vat`.
-- Sin auth: cualquiera puede consultar el VIES a través de nuestra
-- edge function. Para no convertirnos en proxy de scraping del VIES
-- (y por las cuotas de la Comisión Europea) limitamos a 10 req/h/IP.
--
-- Implementación bucket por hora (mismo patrón que order_public_get_rate):
--   PK = (ip_address, bucket_hour)
--   INSERT count=1; en colisión, SELECT + UPDATE count+1. Si pasa de 10 → 429.
--
-- La tabla se purga vía cron (data-retention-cron): buckets >24h
-- se pueden borrar sin pérdida de información útil.
-- ════════════════════════════════════════════════════════════════

create table if not exists validate_vat_rate (
  ip_address    text        not null,
  bucket_hour   timestamptz not null,
  request_count int         not null default 0,
  primary key (ip_address, bucket_hour)
);

create index if not exists validate_vat_rate_bucket_idx
  on validate_vat_rate(bucket_hour);

alter table validate_vat_rate enable row level security;

-- Sin policies: INSERT/UPDATE/SELECT solo vía service_role (la edge
-- function). Ningún rol cliente debe ver buckets de otros IPs.
revoke all on validate_vat_rate from authenticated, anon;
