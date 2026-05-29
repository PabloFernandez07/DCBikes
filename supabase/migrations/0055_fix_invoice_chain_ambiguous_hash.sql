-- 0055_fix_invoice_chain_ambiguous_hash.sql
--
-- Fix: append_invoice_chained (0051) usaba
--   returning id, hash, previous_hash, issued_at
--     into invoice_id, hash, previous_hash, issued_at;
-- Los nombres de salida (hash, previous_hash, issued_at) coinciden con columnas
-- de la tabla invoices → "column reference \"hash\" is ambiguous" en el RETURNING.
--
-- Solución: los valores hash/previous_hash/issued_at ya están en variables
-- locales (v_hash, v_prev_hash, v_issued_at) calculadas antes del INSERT; solo
-- recuperamos `id` del INSERT y asignamos el resto a los parámetros de salida.
-- Mantiene el search_path con `extensions` (fix 0054 para digest()/pgcrypto).

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
set search_path = public, extensions, pg_temp
as $$
declare
  v_prev_hash text;
  v_issued_at timestamptz := now();
  v_issued_iso text;
  v_payload   text;
  v_hash      text;
  v_id        uuid;
begin
  perform pg_advisory_xact_lock(hashtext('invoices_chain'));

  select i.hash
    into v_prev_hash
    from invoices i
   order by i.issued_at desc, i.id desc
   limit 1;

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
  returning id into v_id;

  invoice_id    := v_id;
  hash          := v_hash;
  previous_hash := v_prev_hash;
  issued_at     := v_issued_at;
  return next;
end;
$$;

revoke all on function append_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text
) from public;
grant execute on function append_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text
) to service_role;
