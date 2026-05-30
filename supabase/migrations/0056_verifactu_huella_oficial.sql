-- 0056_verifactu_huella_oficial.sql
--
-- Reescribe append_invoice_chained para calcular la HUELLA con el formato
-- OFICIAL de la AEAT (Verifactu, "Detalle de las especificaciones técnicas para
-- generación de la huella o hash de los registros de facturación", v0.1.2).
--
-- Cadena RegistroAlta (orden y nombres EXACTOS, separador '&', UTF-8):
--   IDEmisorFactura={NIF}&NumSerieFactura={num}&FechaExpedicionFactura={DD-MM-YYYY}
--   &TipoFactura={F1|F2}&CuotaTotal={x.xx}&ImporteTotal={x.xx}&Huella={anterior}
--   &FechaHoraHusoGenRegistro={YYYY-MM-DDThh:mm:ss+hh:mm}
--   → SHA-256 en HEX MAYÚSCULAS (64 chars).
--
-- Validado contra los 3 vectores oficiales del PDF de la AEAT (casos 1, 2 y 3).
--
-- Guardamos además los valores EXACTOS usados (fecha expedición, fecha-hora de
-- generación con huso, tipo F1/F2) para que el envío a la AEAT construya el XML
-- con cadenas idénticas y la huella case byte a byte.
--
-- TipoFactura: completa (B2B) → F1 ; simplificada (B2C) → F2.

-- Columnas para reproducir el registro exacto en el envío AEAT.
alter table public.invoices
  add column if not exists vf_fecha_expedicion text,
  add column if not exists vf_fecha_hora_gen   text,
  add column if not exists vf_tipo_factura      text;

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
  v_prev_hash  text;
  v_issued_at  timestamptz := now();
  v_fecha_exp  text;
  v_fecha_gen  text;
  v_tipo       text;
  v_cuota      text;
  v_importe    text;
  v_off        text;
  v_payload    text;
  v_hash       text;
  v_id         uuid;
begin
  perform pg_advisory_xact_lock(hashtext('invoices_chain'));

  -- Cabeza actual de la cadena (última factura emitida, cualquier serie).
  select i.hash
    into v_prev_hash
    from invoices i
   order by i.issued_at desc, i.id desc
   limit 1;

  -- Formateo en huso horario de Madrid (Europe/Madrid) para esta transacción.
  set local timezone = 'Europe/Madrid';
  v_fecha_exp := to_char(v_issued_at, 'DD-MM-YYYY');
  v_off := to_char(v_issued_at, 'OF');            -- '+01' / '+02'
  if length(v_off) = 3 then v_off := v_off || ':00'; end if;
  v_fecha_gen := to_char(v_issued_at, 'YYYY-MM-DD"T"HH24:MI:SS') || v_off;

  -- F1 = factura completa (B2B) · F2 = factura simplificada (B2C).
  v_tipo := case when p_invoice_type = 'b2b' then 'F1' else 'F2' end;

  -- Importes con punto decimal y 2 decimales (123.45). La AEAT ignora ceros a
  -- la derecha, pero usamos 2 decimales de forma consistente.
  v_cuota   := to_char(round(p_tax_cents::numeric / 100, 2),   'FM999999999990.00');
  v_importe := to_char(round(p_total_cents::numeric / 100, 2), 'FM999999999990.00');

  -- Cadena oficial de la huella (RegistroAlta).
  v_payload :=
    'IDEmisorFactura='        || trim(p_issuer_cif) ||
    '&NumSerieFactura='       || trim(p_invoice_number) ||
    '&FechaExpedicionFactura='|| v_fecha_exp ||
    '&TipoFactura='           || v_tipo ||
    '&CuotaTotal='            || v_cuota ||
    '&ImporteTotal='          || v_importe ||
    '&Huella='                || coalesce(v_prev_hash, '') ||
    '&FechaHoraHusoGenRegistro=' || v_fecha_gen;

  v_hash := upper(encode(digest(convert_to(v_payload, 'UTF8'), 'sha256'), 'hex'));

  insert into invoices (
    order_id, invoice_number, invoice_type, pdf_storage_path, issued_at,
    issuer_company_name, issuer_cif, issuer_address,
    base_cents, tax_cents, total_cents,
    hash, previous_hash, qr_payload, verifactu_mode, aeat_status,
    vf_fecha_expedicion, vf_fecha_hora_gen, vf_tipo_factura
  ) values (
    p_order_id, p_invoice_number, p_invoice_type, p_pdf_storage_path, v_issued_at,
    p_issuer_company_name, p_issuer_cif, p_issuer_address,
    p_base_cents, p_tax_cents, p_total_cents,
    v_hash, v_prev_hash, p_qr_payload, p_verifactu_mode, p_aeat_status,
    v_fecha_exp, v_fecha_gen, v_tipo
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
