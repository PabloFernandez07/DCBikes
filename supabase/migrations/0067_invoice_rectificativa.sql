-- 0067_invoice_rectificativa.sql
--
-- Soporte de FACTURAS RECTIFICATIVAS (abonos) para devoluciones.
--
-- Una factura rectificativa anula total o parcialmente una factura ordinaria
-- emitida previamente. En la práctica:
--   · Lleva su PROPIA serie correlativa (R-FAC-{year}-N para B2C, R-FAC-B-{year}-N
--     para B2B), separada de las series ordinarias.
--   · Sus importes (base/cuota/total) son NEGATIVOS (es un abono).
--   · Para la AEAT es TipoFactura 'R1' (rectificación por error fundado en
--     derecho / art. 80 LIVA), y es un registro MÁS de la misma cadena global
--     VeriFactu: encadena su huella sobre la última factura emitida, igual que
--     una ordinaria.
--   · Un mismo pedido puede tener ahora factura ordinaria + rectificativa(s),
--     por lo que se retira el UNIQUE(order_id).
--
-- Esta migración asume que 0066_order_returns.sql ya creó la tabla
-- public.order_returns (referenciada en la FK return_id).

-- ════════════════════════════════════════════════════════════════
-- ─── 1. Permitir varias facturas por pedido ─────────────────────
-- ════════════════════════════════════════════════════════════════
-- Quitamos el UNIQUE(order_id): un pedido puede tener factura ordinaria y,
-- tras una devolución, una o varias rectificativas. Lo sustituimos por un
-- índice NO único para mantener el rendimiento en los lookups por pedido.
alter table public.invoices
  drop constraint if exists invoices_order_id_key;

create index if not exists idx_invoices_order_id on public.invoices(order_id);

-- ════════════════════════════════════════════════════════════════
-- ─── 2. Ampliar tipos de factura ────────────────────────────────
-- ════════════════════════════════════════════════════════════════
-- Añadimos los tipos rectificativos manteniendo los ordinarios (b2c/b2b).
alter table public.invoices
  drop constraint if exists invoices_invoice_type_check;

alter table public.invoices
  add constraint invoices_invoice_type_check
  check (invoice_type = any (array[
    'b2c'::text, 'b2b'::text,
    'rectificativa_b2c'::text, 'rectificativa_b2b'::text
  ]));

-- ════════════════════════════════════════════════════════════════
-- ─── 3. Permitir importes negativos (abonos) ────────────────────
-- ════════════════════════════════════════════════════════════════
-- Las rectificativas llevan base/cuota/total NEGATIVOS, así que retiramos los
-- CHECK >= 0 originales. La validación de signo se delega al RPC que las emite.
alter table public.invoices
  drop constraint if exists invoices_base_cents_check,
  drop constraint if exists invoices_tax_cents_check,
  drop constraint if exists invoices_total_cents_check;

-- ════════════════════════════════════════════════════════════════
-- ─── 4. Trazabilidad rectificativa → ordinaria / devolución ─────
-- ════════════════════════════════════════════════════════════════
alter table public.invoices
  add column if not exists rectifies_invoice_id uuid
    references public.invoices(id) on delete restrict,
  add column if not exists return_id uuid
    references public.order_returns(id) on delete set null;

comment on column public.invoices.rectifies_invoice_id is
  'Factura ordinaria que esta rectificativa anula/abona (NULL en ordinarias)';
comment on column public.invoices.return_id is
  'Devolución (order_returns) que originó esta rectificativa';

create index if not exists idx_invoices_rectifies_invoice_id
  on public.invoices(rectifies_invoice_id)
  where rectifies_invoice_id is not null;

-- ════════════════════════════════════════════════════════════════
-- ─── 5. Contadores de serie rectificativa B2C / B2B ─────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists invoice_counter_rect_b2c (
  year        int primary key,
  last_number int not null default 0
);

create table if not exists invoice_counter_rect_b2b (
  year        int primary key,
  last_number int not null default 0
);

create or replace function next_rect_b2c_invoice_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into invoice_counter_rect_b2c (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = invoice_counter_rect_b2c.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

create or replace function next_rect_b2b_invoice_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into invoice_counter_rect_b2b (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = invoice_counter_rect_b2b.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

revoke all on function next_rect_b2c_invoice_number(int) from public;
revoke all on function next_rect_b2b_invoice_number(int) from public;
grant execute on function next_rect_b2c_invoice_number(int) to service_role;
grant execute on function next_rect_b2b_invoice_number(int) to service_role;

-- RLS de los contadores rectificativos (mismo patrón que las series ordinarias).
alter table invoice_counter_rect_b2c enable row level security;
alter table invoice_counter_rect_b2b enable row level security;

drop policy if exists invoice_counter_rect_b2c_admin on invoice_counter_rect_b2c;
create policy invoice_counter_rect_b2c_admin on invoice_counter_rect_b2c
  for all to service_role using (true) with check (true);

drop policy if exists invoice_counter_rect_b2b_admin on invoice_counter_rect_b2b;
create policy invoice_counter_rect_b2b_admin on invoice_counter_rect_b2b
  for all to service_role using (true) with check (true);

comment on table invoice_counter_rect_b2c is 'Serie correlativa rectificativa B2C: R-FAC-{year}-N';
comment on table invoice_counter_rect_b2b is 'Serie correlativa rectificativa B2B: R-FAC-B-{year}-N';

-- ════════════════════════════════════════════════════════════════
-- ─── 6. RPC append_credit_invoice_chained ───────────────────────
-- ════════════════════════════════════════════════════════════════
-- Clon de append_invoice_chained (0056) adaptado a la factura rectificativa:
--   · TipoFactura AEAT = 'R1' (rectificativa). La cadena de la huella usa el
--     mismo formato oficial RegistroAlta; sólo cambia el valor de TipoFactura.
--   · Acepta importes NEGATIVOS (base/cuota/total son un abono).
--   · Persiste rectifies_invoice_id y return_id para la trazabilidad.
--   · Encadena sobre la MISMA cadena global de huella: lee la última factura
--     emitida (cualquier serie, incluidas las ordinarias) y encadena su hash.
-- La firma replica la de append_invoice_chained y añade 2 parámetros finales
-- (p_rectifies_invoice_id, p_return_id) para que el lote de generate-credit-invoice
-- la invoque igual que el de la factura ordinaria.
create or replace function append_credit_invoice_chained(
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
  p_aeat_status         text,
  p_rectifies_invoice_id uuid,
  p_return_id            uuid
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

  -- Cabeza actual de la cadena global (última factura emitida, cualquier serie:
  -- ordinaria o rectificativa). La rectificativa es un registro más de la cadena.
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

  -- TipoFactura AEAT 'R1': rectificativa (art. 80 LIVA). Mismo valor para B2C/B2B.
  v_tipo := 'R1';

  -- Importes con punto decimal y 2 decimales. round() preserva el signo, de modo
  -- que los abonos se serializan negativos (p.ej. -123.45) en la cadena de huella.
  v_cuota   := to_char(round(p_tax_cents::numeric / 100, 2),   'FM999999999990.00');
  v_importe := to_char(round(p_total_cents::numeric / 100, 2), 'FM999999999990.00');

  -- Cadena oficial de la huella (RegistroAlta), idéntica a la ordinaria salvo
  -- TipoFactura. round() puede devolver '-0.00' para importe cero; lo normalizamos.
  if v_cuota = '-0.00'   then v_cuota   := '0.00'; end if;
  if v_importe = '-0.00' then v_importe := '0.00'; end if;

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
    vf_fecha_expedicion, vf_fecha_hora_gen, vf_tipo_factura,
    rectifies_invoice_id, return_id
  ) values (
    p_order_id, p_invoice_number, p_invoice_type, p_pdf_storage_path, v_issued_at,
    p_issuer_company_name, p_issuer_cif, p_issuer_address,
    p_base_cents, p_tax_cents, p_total_cents,
    v_hash, v_prev_hash, p_qr_payload, p_verifactu_mode, p_aeat_status,
    v_fecha_exp, v_fecha_gen, v_tipo,
    p_rectifies_invoice_id, p_return_id
  )
  returning id into v_id;

  invoice_id    := v_id;
  hash          := v_hash;
  previous_hash := v_prev_hash;
  issued_at     := v_issued_at;
  return next;
end;
$$;

revoke all on function append_credit_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text, uuid, uuid
) from public;
grant execute on function append_credit_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text, uuid, uuid
) to service_role;
