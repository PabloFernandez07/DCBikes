-- 0038_storage_buckets_rls.sql
-- Hallazgo Q-15 (auditoría V5): declarar buckets de Storage como código
-- versionado (no clic en Studio) y aplicar RLS sobre storage.objects.
--
-- Buckets:
--   invoices   → private. Solo admin (is_admin()) lee y escribe.
--   contracts  → private. Solo admin.
--   avatars    → public read (necesario para mostrar avatar de cliente en UI
--                pública), escritura restringida a admin (el upload real lo
--                hace una edge function con service_role; los admins pueden
--                gestionar manualmente).
--
-- Idempotente:
--   * INSERT con ON CONFLICT en storage.buckets.
--   * DROP POLICY IF EXISTS antes de CREATE POLICY.
--
-- Nota: la migración asume la función pública `is_admin()` declarada en
-- 0013_admin_users.sql.

-- ════════════════════════════════════════════════════════════════
-- ─── Declaración de buckets ─────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values
  ('invoices',  'invoices',  false),
  ('contracts', 'contracts', false),
  ('avatars',   'avatars',   true)
on conflict (id) do update
  set public = excluded.public;

-- ════════════════════════════════════════════════════════════════
-- ─── RLS storage.objects · invoices (admin only) ────────────────
-- ════════════════════════════════════════════════════════════════
drop policy if exists invoices_admin_select on storage.objects;
create policy invoices_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'invoices' and is_admin());

drop policy if exists invoices_admin_modify on storage.objects;
create policy invoices_admin_modify on storage.objects
  for all to authenticated
  using (bucket_id = 'invoices' and is_admin())
  with check (bucket_id = 'invoices' and is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── RLS storage.objects · contracts (admin only) ───────────────
-- ════════════════════════════════════════════════════════════════
drop policy if exists contracts_admin_select on storage.objects;
create policy contracts_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'contracts' and is_admin());

drop policy if exists contracts_admin_modify on storage.objects;
create policy contracts_admin_modify on storage.objects
  for all to authenticated
  using (bucket_id = 'contracts' and is_admin())
  with check (bucket_id = 'contracts' and is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── RLS storage.objects · avatars (lectura pública, escritura admin)
-- ════════════════════════════════════════════════════════════════
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists avatars_admin_modify on storage.objects;
create policy avatars_admin_modify on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and is_admin())
  with check (bucket_id = 'avatars' and is_admin());

comment on policy invoices_admin_select on storage.objects is
  'Q-15: facturas privadas, lectura admin (is_admin()).';
comment on policy contracts_admin_select on storage.objects is
  'Q-15: contratos privados, lectura admin (is_admin()).';
comment on policy avatars_public_read on storage.objects is
  'Q-15: avatares públicos en lectura. Escritura restringida a admin (avatars_admin_modify).';
