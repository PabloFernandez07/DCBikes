-- 0011_invoice_series_split.sql
-- Separa la serie correlativa de facturación B2C (FAC-{year}-N) de B2B (FAC-B-{year}-N).
-- Recomendación AEAT: distinguir series simplificadas (B2C) de completas (B2B).
--
-- Compatibilidad: la tabla `invoice_counter` original y `next_invoice_number(int)`
-- se mantienen como fallback. La migración semilla la serie B2C con el último
-- valor histórico para que no haya saltos en el correlativo público.

-- ════════════════════════════════════════════════════════════════
-- ─── Tablas contador B2C / B2B ──────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create table if not exists invoice_counter_b2c (
  year        int primary key,
  last_number int not null default 0
);

create table if not exists invoice_counter_b2b (
  year        int primary key,
  last_number int not null default 0
);

-- Migrar el counter actual a la serie B2C (asumimos que la mayoría hasta ahora
-- era B2C; las facturas B2B previas mantienen su numeración heredada bajo el
-- prefijo "FAC" sin el sufijo "-B", pero las nuevas usarán las series separadas).
insert into invoice_counter_b2c (year, last_number)
select year, last_number from invoice_counter
on conflict (year) do update
  set last_number = greatest(invoice_counter_b2c.last_number, excluded.last_number);

-- ════════════════════════════════════════════════════════════════
-- ─── Funciones atómicas ─────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
create or replace function next_b2c_invoice_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into invoice_counter_b2c (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = invoice_counter_b2c.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

create or replace function next_b2b_invoice_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  insert into invoice_counter_b2b (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = invoice_counter_b2b.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

revoke all on function next_b2c_invoice_number(int) from public;
revoke all on function next_b2b_invoice_number(int) from public;
grant execute on function next_b2c_invoice_number(int) to service_role;
grant execute on function next_b2b_invoice_number(int) to service_role;

-- ════════════════════════════════════════════════════════════════
-- ─── RLS ────────────────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
alter table invoice_counter_b2c enable row level security;
alter table invoice_counter_b2b enable row level security;

drop policy if exists invoice_counter_b2c_admin on invoice_counter_b2c;
create policy invoice_counter_b2c_admin on invoice_counter_b2c
  for all to service_role using (true) with check (true);

drop policy if exists invoice_counter_b2b_admin on invoice_counter_b2b;
create policy invoice_counter_b2b_admin on invoice_counter_b2b
  for all to service_role using (true) with check (true);

-- ════════════════════════════════════════════════════════════════
-- ─── Documentación ──────────────────────────────────────────────
-- ════════════════════════════════════════════════════════════════
comment on table invoice_counter_b2c is 'Serie correlativa B2C: FAC-{year}-N (recomendación AEAT)';
comment on table invoice_counter_b2b is 'Serie correlativa B2B: FAC-B-{year}-N (recomendación AEAT)';
