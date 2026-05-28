-- ════════════════════════════════════════════════════════════════
-- 0046_price_history_metadata.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · Q-23 (trazabilidad de cambios de precio)
--
-- Omnibus / RDL 1/2007 art. 20.1 exige mostrar el precio mínimo de los
-- últimos 30 días al anunciar un descuento. Para que el histórico tenga
-- valor probatorio frente a inspección de consumo, cada cambio debe ser
-- atribuible (quién) y justificable (por qué).
--
-- Añadimos:
--   changed_by    uuid → auth.users (admin que provocó el cambio; NULL si
--                        el cambio vino del trigger automático/backfill).
--   change_reason text → motivo libre ('alta','revisión proveedor',
--                        'promoción', 'corrección', ...).
--
-- Si la tabla no existe (entorno que no aplicó 0022), se crea aquí con su
-- RLS y restricciones de inmutabilidad. El histórico de precios NO debe
-- poder modificarse ni borrarse: solo INSERT (vía trigger) + SELECT.
-- ════════════════════════════════════════════════════════════════

create table if not exists product_price_history (
  id             bigserial primary key,
  product_id     uuid not null references products(id) on delete cascade,
  price          numeric(10,2) not null,
  effective_from timestamptz not null default now(),
  effective_to   timestamptz
);

create index if not exists price_history_product_idx
  on product_price_history(product_id, effective_from desc);

-- ────────────────────────────────────────────────────────────────
-- Nuevas columnas de trazabilidad (idempotente).
-- ────────────────────────────────────────────────────────────────
alter table product_price_history
  add column if not exists changed_by    uuid references auth.users(id) on delete set null,
  add column if not exists change_reason text;

-- ════════════════════════════════════════════════════════════════
-- ─── RLS: histórico inmutable ───────────────────────────────────
-- ════════════════════════════════════════════════════════════════
alter table product_price_history enable row level security;

-- Lectura: pública (información obligatoria por ley Omnibus).
drop policy if exists price_history_public_read on product_price_history;
create policy price_history_public_read on product_price_history
  for select to anon, authenticated using (true);

-- Inmutabilidad: revocamos UPDATE/DELETE a authenticated.
-- El INSERT lo realiza el trigger fn_record_price_change (SECURITY DEFINER)
-- y, en su caso, service_role. No hay policy de UPDATE/DELETE: con RLS
-- activado y sin policy permisiva, ambas operaciones quedan denegadas para
-- authenticated/anon. service_role bypassa RLS para correcciones puntuales
-- justificadas, que deben documentarse en change_reason.
revoke update, delete on product_price_history from authenticated;
revoke update, delete on product_price_history from anon;

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on table product_price_history is
  'Histórico de precios por producto (Omnibus / RDL 1/2007 art. 20.1). Inmutable: solo SELECT público + INSERT vía trigger.';
comment on column product_price_history.changed_by is
  'Admin (auth.users) que provocó el cambio; NULL si automático/backfill (Q-23 V5).';
comment on column product_price_history.change_reason is
  'Motivo del cambio de precio para trazabilidad ante inspección de consumo (Q-23 V5).';
