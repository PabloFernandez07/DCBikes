-- 0023_verifactu.sql
-- Cierre del hallazgo C-01 (auditoría legal V3): RD 1007/2023 Verifactu.
-- Schema neutro que soporta tanto modo Verifactu (envío real-time AEAT)
-- como modo no-Verifactu (registro firmado local).
-- La modalidad concreta la decide settings.verifactu_mode.

alter table invoices
  add column if not exists hash text,
  add column if not exists previous_hash text,
  add column if not exists signature text,
  add column if not exists qr_payload text,
  add column if not exists verifactu_mode text
    check (verifactu_mode in ('verifactu','no_verifactu')),
  add column if not exists aeat_sent_at timestamptz,
  add column if not exists aeat_csv text,
  add column if not exists aeat_status text;

create index if not exists invoices_previous_hash_idx on invoices(previous_hash);
create index if not exists invoices_aeat_status_idx on invoices(aeat_status)
  where aeat_status is not null;

comment on column invoices.hash is 'SHA-256 de campos firmados + previous_hash, encadena la cadena de facturas';
comment on column invoices.previous_hash is 'hash de la factura inmediatamente anterior (NULL para la primera)';
comment on column invoices.verifactu_mode is 'verifactu (envío real-time AEAT) o no_verifactu (registro firmado local)';
comment on column invoices.aeat_status is 'pending_send | sent | failed | not_applicable (solo si verifactu_mode=verifactu)';
