-- ════════════════════════════════════════════════════════════════
-- 0050_verifactu_columns.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · B-22
--
-- Prepara el modelo de datos para la futura integración Verifactu real
-- (RD 1007/2023 · envío SOAP a la AEAT), manteniendo el gate cerrado.
--
-- Estado del ciclo de vida de envío AEAT por factura (independiente del
-- campo legacy `aeat_status` que ya existía):
--   • disabled  → modo no_verifactu activo; no se enviará a la AEAT.
--   • pending   → factura emitida con modo verifactu; pendiente de envío.
--   • sent      → confirmada por la AEAT.
--   • failed    → el envío falló; reintentable por el cron.
--   • retired   → factura anulada/retirada del registro.
--
-- El cron `verifactu-send-cron` recorrerá las filas en estado `pending`
-- (cuando el titular active `verifactu_mode='verifactu'` con asesoría
-- fiscal). Mientras tanto el gate permanece en `no_verifactu`.
-- ════════════════════════════════════════════════════════════════

alter table invoices
  add column if not exists verifactu_status text not null default 'disabled'
    check (verifactu_status in ('disabled', 'pending', 'sent', 'failed', 'retired')),
  add column if not exists verifactu_sent_at timestamptz,
  add column if not exists verifactu_response_xml text;

-- Gate global del modo Verifactu. Por defecto desactivado: las facturas se
-- emiten con QR/hash/cadena pero SIN envío a la AEAT hasta que el titular
-- contrate asesoría fiscal y cambie este valor a 'verifactu'.
insert into settings (key, value)
values ('verifactu_mode', '"no_verifactu"'::jsonb)
on conflict (key) do nothing;
