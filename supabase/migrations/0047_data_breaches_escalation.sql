-- ════════════════════════════════════════════════════════════════
-- 0047_data_breaches_escalation.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · Q-24 (trazabilidad de escalado de brechas)
--
-- El registro interno de brechas (0010_data_breaches.sql) ya cubre la
-- detección, evaluación de riesgo y notificación a AEPD (art. 33) y a
-- afectados (art. 34). Falta dejar constancia del escalado interno previo
-- a esas notificaciones, exigido por el procedimiento de brechas
-- (Docs/legal/procedimiento-brechas.md) para demostrar diligencia y el
-- cumplimiento del plazo de 72 horas del art. 33.1 RGPD.
--
-- Añadimos dos sellos temporales:
--   internally_escalated_at      → momento en que la brecha se escaló al
--                                  responsable del tratamiento internamente.
--   legal_counsel_contacted_at   → momento en que se contactó asesoría
--                                  legal externa (si procede).
-- ════════════════════════════════════════════════════════════════

alter table data_breaches
  add column if not exists internally_escalated_at    timestamptz,
  add column if not exists legal_counsel_contacted_at  timestamptz;

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on column data_breaches.internally_escalated_at is
  'Momento del escalado interno al responsable del tratamiento (Q-24 V5; diligencia art. 33.1 RGPD).';
comment on column data_breaches.legal_counsel_contacted_at is
  'Momento del contacto con asesoría legal externa, si procede (Q-24 V5).';
