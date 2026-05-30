-- 0038_storage_buckets_rls.sql
-- Hallazgo Q-15 (auditoría V5): declarar buckets de Storage como código
-- versionado (no clic en Studio).
--
-- Buckets:
--   invoices   → PRIVADO. Facturas PDF.
--   contracts  → PRIVADO. Contratos/justificantes PDF.
--   avatars    → PÚBLICO (lectura). Avatares de reseñas/clientes en UI pública.
--
-- Idempotente: INSERT con ON CONFLICT en storage.buckets.

insert into storage.buckets (id, name, public) values
  ('invoices',  'invoices',  false),
  ('contracts', 'contracts', false),
  ('avatars',   'avatars',   true)
on conflict (id) do update
  set public = excluded.public;

-- ════════════════════════════════════════════════════════════════
-- RLS sobre storage.objects — NO se aplica desde migración (decisión 2026-05-30)
-- ════════════════════════════════════════════════════════════════
-- `storage.objects` pertenece a `supabase_storage_admin`; ni `postgres` (que es
-- quien ejecuta migraciones / Management API / SQL Editor) puede crear policies
-- sobre ella ni asumir ese rol → "ERROR: must be owner of relation objects".
--
-- No es necesario aplicarlas porque el modelo de seguridad ya es correcto:
--   1. RLS está ACTIVADO en storage.objects (deny-by-default).
--   2. invoices/contracts son buckets PRIVADOS → sin política, NINGÚN cliente
--      (anon/authenticated) puede leer ni escribir. Quedan totalmente cerrados.
--   3. Todo acceso legítimo a esos buckets se hace desde Edge Functions con
--      service_role (que bypassa RLS): generación de PDF, y descarga firmada
--      vía customer-request-invoice / admin-generate-invoice. El navegador NUNCA
--      firma URLs de estos buckets directamente.
--   4. avatars es público → lectura pública (comportamiento deseado) sin policy.
--
-- Si en el futuro se quisiera permitir acceso directo de admins desde el
-- navegador (createSignedUrl) a invoices/contracts, habría que crear estas
-- policies MANUALMENTE en el Dashboard → Storage → [bucket] → Policies
-- (la UI usa un servicio privilegiado), por ejemplo:
--   - invoices/contracts: SELECT y ALL to authenticated  USING (is_admin())
--   - avatars: SELECT to anon, authenticated  USING (true); ALL admin
-- Hoy NO hace falta.
