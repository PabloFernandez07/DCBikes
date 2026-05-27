-- 0029_rls_immutable_logs.sql
-- Hallazgos Q-03 + Q-07 (auditoría V5): inmutabilidad legal de logs de pago,
-- facturas y historial de estado de pedidos.
--
-- Estado previo (de 0013_admin_users.sql):
--   payments_log_admin           FOR ALL  → permite UPDATE/DELETE
--   invoices_admin               FOR ALL  → permite UPDATE/DELETE
--   order_status_history_admin   FOR ALL  → permite UPDATE/DELETE
--
-- Requisito legal:
--   - RD 1007/2023 (Verifactu) + Ley 7/2012: registros fiscales inmutables.
--   - Audit trail RGPD art. 5.1.f (integridad): order_status_history no debe
--     poder reescribirse o borrarse desde admin.
--
-- Tras esta migración los admin SOLO podrán SELECT + INSERT. Edge functions
-- con service_role siguen bypassando RLS para casos puntuales (anonimización
-- vía data-retention-cron sobre orders, no sobre estos logs).

-- ════════════════════════════════════════════════════════════════
-- ─── payments_log ───────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
drop policy if exists payments_log_admin on payments_log;

create policy payments_log_select_admin on payments_log
  for select to authenticated
  using (is_admin());

create policy payments_log_insert_admin on payments_log
  for insert to authenticated
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── invoices ───────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
drop policy if exists invoices_admin on invoices;

create policy invoices_select_admin on invoices
  for select to authenticated
  using (is_admin());

create policy invoices_insert_admin on invoices
  for insert to authenticated
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── order_status_history ───────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
drop policy if exists order_status_history_admin on order_status_history;

create policy order_status_history_select_admin on order_status_history
  for select to authenticated
  using (is_admin());

create policy order_status_history_insert_admin on order_status_history
  for insert to authenticated
  with check (is_admin());

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on table payments_log is
  'Log de pagos. Inmutable por RLS: solo SELECT + INSERT desde authenticated/is_admin(). RD 1007/2023.';
comment on table invoices is
  'Facturas emitidas. Inmutable por RLS: solo SELECT + INSERT desde authenticated/is_admin(). Ley 7/2012.';
comment on table order_status_history is
  'Historial de estado de pedidos. Inmutable por RLS: solo SELECT + INSERT desde authenticated/is_admin(). Audit trail RGPD 5.1.f.';
