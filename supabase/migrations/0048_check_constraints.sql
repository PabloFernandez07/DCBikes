-- ════════════════════════════════════════════════════════════════
-- 0048_check_constraints.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · Q-25 (integridad de datos a nivel BD)
--
-- Defensa en profundidad: validar a nivel de base de datos invariantes que
-- hoy solo se garantizan en la capa de aplicación. RGPD art. 5.1.d
-- (exactitud) + art. 5.1.f (integridad): los datos personales deben ser
-- exactos y mantenerse íntegros.
--
-- 1. quote_requests.status ∈ {new, read, replied, archived}
--    (valores reales usados por src/pages/admin/Quotes.tsx; hoy es text
--    con default 'new' sin restricción → cualquier string).
-- 2. Formato de email en orders.customer_email y quote_requests.email
--    mediante regex pragmática (no RFC 5322 completo: evita basura
--    evidente sin rechazar direcciones válidas legítimas).
--
-- Las constraints se crean NOT VALID y se validan en un paso aparte para
-- no bloquear la tabla en exclusiva durante un escaneo largo. Si hay filas
-- preexistentes que incumplen, VALIDATE fallará y deberán corregirse antes
-- de reintentar (ver Docs/runbooks/legal-quarterly-review.md).
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- 1. quote_requests.status — dominio cerrado
-- ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quote_requests_status_check'
  ) then
    alter table quote_requests
      add constraint quote_requests_status_check
      check (status in ('new','read','replied','archived')) not valid;
  end if;
end $$;

alter table quote_requests validate constraint quote_requests_status_check;

-- ────────────────────────────────────────────────────────────────
-- 2. Formato de email — orders.customer_email
-- ────────────────────────────────────────────────────────────────
-- Regex pragmática: <local>@<dominio>.<tld>, sin espacios, con al menos
-- un punto en el dominio. Coherente con la normalización a minúsculas de
-- 0043_customer_email_lowercase_check.sql.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_customer_email_format_check'
  ) then
    alter table orders
      add constraint orders_customer_email_format_check
      check (customer_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') not valid;
  end if;
end $$;

alter table orders validate constraint orders_customer_email_format_check;

-- ────────────────────────────────────────────────────────────────
-- 3. Formato de email — quote_requests.email
-- ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quote_requests_email_format_check'
  ) then
    alter table quote_requests
      add constraint quote_requests_email_format_check
      check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') not valid;
  end if;
end $$;

alter table quote_requests validate constraint quote_requests_email_format_check;
