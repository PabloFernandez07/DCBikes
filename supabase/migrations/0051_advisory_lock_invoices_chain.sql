-- ════════════════════════════════════════════════════════════════
-- 0051_advisory_lock_invoices_chain.sql
-- ────────────────────────────────────────────────────────────────
-- Auditoría legal V5 · Sprint 3 · B-28
--
-- Blinda la CADENA DE HASH de facturas (Verifactu, RD 1007/2023; columnas
-- invoices.hash / invoices.previous_hash de 0023_verifactu.sql) frente a
-- condiciones de carrera.
--
-- Problema (TOCTOU): generate-invoice-pdf hacía
--   1) SELECT hash FROM invoices ORDER BY issued_at DESC LIMIT 1   (lee cabeza)
--   2) hash = SHA-256( ... | previous_hash )                       (calcula)
--   3) INSERT INTO invoices (..., hash, previous_hash)             (inserta)
-- en pasos separados y SIN transacción común. Dos facturas emitidas en
-- paralelo pueden leer la MISMA cabeza en (1) y crear una BIFURCACIÓN de la
-- cadena: ambas apuntan al mismo previous_hash y la cadena deja de ser una
-- secuencia lineal verificable, lo que invalida el registro de facturación
-- exigido por el RD 1007/2023.
--
-- Solución: esta RPC ejecuta los tres pasos en UNA SOLA TRANSACCIÓN tras
-- adquirir `pg_advisory_xact_lock(hashtext('invoices_chain'))`. El lock
-- serializa de forma explícita cualquier intento concurrente de añadir a la
-- cadena y se libera automáticamente al COMMIT/ROLLBACK (xact_lock), por lo
-- que no requiere unlock manual. El hash se calcula DENTRO de la transacción
-- bloqueada con el previous_hash recién leído → imposible bifurcar.
--
-- El payload del hash es idéntico al que calculaba la edge function:
--   invoice_number | issued_at_iso | issuer_cif | buyer_nif | total_cents | previous_hash
-- (previous_hash vacío '' cuando es la primera factura de la cadena).
-- ════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

create or replace function append_invoice_chained(
  p_order_id            uuid,
  p_invoice_number      text,
  p_invoice_type        text,
  p_pdf_storage_path    text,
  p_issuer_company_name text,
  p_issuer_cif          text,
  p_issuer_address      text,
  p_base_cents          int,
  p_tax_cents           int,
  p_total_cents         int,
  p_buyer_nif           text,
  p_qr_payload          text,
  p_verifactu_mode      text,
  p_aeat_status         text
)
returns table (
  invoice_id    uuid,
  hash          text,
  previous_hash text,
  issued_at     timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prev_hash text;
  v_issued_at timestamptz := now();
  v_issued_iso text;
  v_payload   text;
  v_hash      text;
begin
  -- Serializa toda la operación de "añadir a la cadena" hasta el COMMIT.
  perform pg_advisory_xact_lock(hashtext('invoices_chain'));

  -- Cabeza actual de la cadena (última factura emitida, cualquier serie).
  select i.hash
    into v_prev_hash
    from invoices i
   order by i.issued_at desc, i.id desc
   limit 1;

  -- ISO-8601 con milisegundos y 'Z' (equivalente a Date.toISOString() en JS).
  v_issued_iso := to_char(v_issued_at at time zone 'UTC',
                          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  v_payload := concat_ws('|',
    p_invoice_number,
    v_issued_iso,
    p_issuer_cif,
    coalesce(p_buyer_nif, ''),
    p_total_cents::text,
    coalesce(v_prev_hash, '')
  );

  -- SHA-256 hex en minúsculas (idéntico a crypto.subtle.digest en la función).
  v_hash := encode(digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex');

  insert into invoices (
    order_id, invoice_number, invoice_type, pdf_storage_path, issued_at,
    issuer_company_name, issuer_cif, issuer_address,
    base_cents, tax_cents, total_cents,
    hash, previous_hash, qr_payload, verifactu_mode, aeat_status
  ) values (
    p_order_id, p_invoice_number, p_invoice_type, p_pdf_storage_path, v_issued_at,
    p_issuer_company_name, p_issuer_cif, p_issuer_address,
    p_base_cents, p_tax_cents, p_total_cents,
    v_hash, v_prev_hash, p_qr_payload, p_verifactu_mode, p_aeat_status
  )
  returning id, hash, previous_hash, issued_at
       into invoice_id, hash, previous_hash, issued_at;

  return next;
end;
$$;

revoke all on function append_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text
) from public;
grant execute on function append_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text
) to service_role;

comment on function append_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text
) is
  'Añade una factura a la cadena de hash Verifactu de forma atómica y serializada por pg_advisory_xact_lock(hashtext(''invoices_chain'')). Calcula hash + previous_hash dentro de la transacción bloqueada para evitar bifurcaciones (B-28, RD 1007/2023).';
