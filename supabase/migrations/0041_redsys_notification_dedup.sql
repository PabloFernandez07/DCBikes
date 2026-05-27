-- ════════════════════════════════════════════════════════════════
-- 0041_redsys_notification_dedup.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 2 · B-14
--
-- Tabla anti-replay para callbacks de Redsys. Cada notificación legítima
-- de Redsys lleva un Ds_MerchantParameters único (codifica Ds_Order +
-- Ds_Response + Ds_Date + Ds_Hour + ...). Si calculamos sha256(payload)
-- y lo insertamos como UNIQUE constraint, podemos detectar y descartar
-- silenciosamente:
--   • Reintentos de Redsys tras error 5xx nuestro (no son fraude pero
--     deben procesarse una sola vez para no duplicar emails / stock).
--   • Ataques de replay deliberados con el mismo Ds_MerchantParameters
--     + Ds_Signature válida.
--
-- Política inmutable: UPDATE/DELETE revocados a todos los roles. Solo
-- service_role puede INSERT (la edge function `redsys-notification`).
-- Solo `is_admin()` puede SELECT para auditoría.
-- ════════════════════════════════════════════════════════════════

create table if not exists redsys_notification_dedup (
  id                   bigserial primary key,
  merchant_params_hash text not null unique,  -- sha256 hex del Ds_MerchantParameters
  ds_order             text,
  ds_response          text,
  received_at          timestamptz not null default now()
);

create index if not exists redsys_dedup_received_idx
  on redsys_notification_dedup(received_at desc);

alter table redsys_notification_dedup enable row level security;

-- Limpieza de policies previas (idempotencia).
drop policy if exists redsys_dedup_admin_select on redsys_notification_dedup;

-- Admin puede leer todo (auditoría / forense).
create policy redsys_dedup_admin_select
  on redsys_notification_dedup
  for select
  to authenticated
  using (is_admin());

-- Inmutabilidad: ningún rol cliente puede UPDATE/DELETE. INSERT solo
-- vía service_role (la edge function), nunca expuesto a anon/auth.
revoke update, delete on redsys_notification_dedup from authenticated, anon;
revoke insert on redsys_notification_dedup from authenticated, anon;
