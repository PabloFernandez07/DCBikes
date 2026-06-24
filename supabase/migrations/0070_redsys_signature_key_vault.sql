-- 0070_redsys_signature_key_vault.sql
-- Clave de firma SHA-256 de Redsys (TPV) gestionada desde el admin, almacenada
-- CIFRADA en Supabase Vault. El valor nunca se expone al frontend.
--
--   set_redsys_secret_key(text)   admin-only  → guarda/actualiza la clave en Vault
--   redsys_secret_key_is_set()    admin-only  → ¿hay clave configurada? (boolean)
--   get_redsys_secret_key()       service_role → devuelve la clave descifrada (backend)
--
-- redsys-config.ts lee get_redsys_secret_key() (Vault) y, si no hay, cae a la
-- env var REDSYS_SECRET_KEY (compatibilidad previa).

create or replace function public.set_redsys_secret_key(p_key text)
returns void language plpgsql security definer set search_path = public, vault, pg_temp as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_key is null or length(btrim(p_key)) = 0 then
    raise exception 'clave vacia' using errcode = 'P0001';
  end if;
  select id into v_id from vault.secrets where name = 'redsys_secret_key';
  if v_id is null then
    perform vault.create_secret(btrim(p_key), 'redsys_secret_key', 'Clave de firma SHA-256 Redsys (TPV)');
  else
    perform vault.update_secret(v_id, btrim(p_key), 'redsys_secret_key', 'Clave de firma SHA-256 Redsys (TPV)');
  end if;
end; $$;
revoke all on function public.set_redsys_secret_key(text) from public, anon;
grant execute on function public.set_redsys_secret_key(text) to authenticated;

create or replace function public.redsys_secret_key_is_set()
returns boolean language plpgsql security definer set search_path = public, vault, pg_temp as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  return exists (select 1 from vault.secrets where name = 'redsys_secret_key');
end; $$;
revoke all on function public.redsys_secret_key_is_set() from public, anon;
grant execute on function public.redsys_secret_key_is_set() to authenticated;

create or replace function public.get_redsys_secret_key()
returns text language sql security definer set search_path = public, vault, pg_temp as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'redsys_secret_key' limit 1;
$$;
revoke all on function public.get_redsys_secret_key() from public, anon, authenticated;
grant execute on function public.get_redsys_secret_key() to service_role;
