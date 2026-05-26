-- DC Bikes Cantabria — Carrito Feature N
-- Sesiones de cliente para magic link "Mis pedidos".
--
-- Flujo:
--   1. Cliente pide acceso → POST customer-magic-link-request { email }.
--   2. Edge function genera token random 32 bytes hex, hashea SHA-256,
--      INSERTa fila en customer_sessions con token_hash + expires_at (24h).
--   3. Envía email con URL: /mis-pedidos/sesion?token={token_plano}.
--   4. Frontend llama customer-orders-list { token }. Edge function hashea
--      el token recibido y busca por token_hash. Si existe + no expirado,
--      devuelve los pedidos del email asociado.
--
-- Por qué guardar el HASH y no el token plano:
--   Defensa en profundidad. Si un atacante consigue acceso de lectura a la
--   tabla customer_sessions (leak BD, dump, query injection), los hashes son
--   inútiles sin reversa (SHA-256 sobre 32 bytes random no es bruteforceable).
--
-- Por qué token reusable (no one-shot used_at):
--   Si el cliente abre el email en una pestaña y vuelve más tarde dentro de
--   las 24h, debe poder seguir consultando sin pedir otro link. La protección
--   viene del TTL corto (24h) + posibilidad de revocación manual (DELETE
--   FROM customer_sessions WHERE email=...).

create table if not exists customer_sessions (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  token_hash   text not null,             -- SHA-256 hex del token (64 chars)
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  used_at      timestamptz,               -- reservado: ahora null (token reusable)
  ip_address   text,
  user_agent   text
);

-- Lookup por email (rate-limit: contar sesiones recientes del email).
create index if not exists idx_customer_sessions_email
  on customer_sessions(email);

-- Lookup por token_hash (validación). Originalmente parcial con
-- `where expires_at > now()`, pero Postgres rechaza funciones no-IMMUTABLE
-- en predicados de índice (42P17). Como las sesiones tienen TTL corto (24h)
-- y se pueden purgar con cron, un índice completo es perfectamente eficiente.
create index if not exists idx_customer_sessions_token_hash
  on customer_sessions(token_hash);

-- ════════════════════════════════════════════════════════════════
-- RLS — anon NO tiene policies (sin acceso directo desde JS público)
-- ════════════════════════════════════════════════════════════════
alter table customer_sessions enable row level security;

-- Las Edge Functions usan service_role → bypassan RLS automáticamente.
-- authenticated (admin) puede leer para soporte (ver sesiones de un cliente).
drop policy if exists customer_sessions_admin_all on customer_sessions;
create policy customer_sessions_admin_all
  on customer_sessions
  for all
  to authenticated
  using (true)
  with check (true);

-- anon: sin policy → cero acceso. Solo las edge functions con service_role
-- pueden crear/validar sesiones, lo que evita enumeración o creación masiva
-- desde el frontend.
