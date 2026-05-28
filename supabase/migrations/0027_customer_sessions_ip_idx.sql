-- 0027_customer_sessions_ip_idx.sql
--
-- S-09 (auditoría legal V3): índice compuesto en customer_sessions(ip_address, created_at)
-- para hacer eficiente el rate-limit por IP en customer-magic-link-request.
--
-- La columna ip_address ya existe desde 0007_customer_sessions.sql.
-- Añadimos únicamente el índice que necesita la query:
--   SELECT count(*) FROM customer_sessions
--   WHERE ip_address = $1 AND created_at >= $2
--
-- Con el índice idx_customer_sessions_ip_created, Postgres puede satisfacer
-- esta query con un index range scan en lugar de seq scan sobre la tabla entera.

create index if not exists idx_customer_sessions_ip_created
  on customer_sessions(ip_address, created_at desc);
