-- 0034_advisory_locks_invoices.sql
-- Hallazgo Q-10 (auditoría V5): blindar las funciones de generación de número
-- correlativo de factura (B2C y B2B) frente a concurrencia.
--
-- Problema: aunque el upsert con `on conflict ... do update set last_number =
-- last_number + 1` es atómico a nivel de fila, varias transacciones que se
-- ejecuten *en paralelo dentro del mismo año* pueden serializarse de forma
-- inesperada cuando el handler de la edge function reintenta tras un error
-- transitorio. La AEAT exige series correlativas SIN saltos ni duplicados
-- (RD 1619/2012 art. 6.1.b + Reglamento de Facturación). Para evitar esa
-- ventana de carrera reforzamos cada función con un `pg_advisory_xact_lock`
-- por (serie, año) que se mantiene hasta el COMMIT y serializa de forma
-- explícita todas las llamadas a la misma serie/año.
--
-- El lock se libera automáticamente al finalizar la transacción
-- (advisory_xact_lock), por lo que no es necesario unlock manual.
--
-- Idempotente: usamos CREATE OR REPLACE FUNCTION; firma, security y
-- search_path se conservan idénticos a 0011_invoice_series_split.sql.

create or replace function next_b2c_invoice_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next int;
begin
  -- Lock por (serie B2C, año) hasta el COMMIT: serializa cualquier intento
  -- concurrente de obtener el siguiente correlativo del mismo año.
  perform pg_advisory_xact_lock(hashtext('inv_b2c_' || p_year));

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
  -- Lock por (serie B2B, año) hasta el COMMIT.
  perform pg_advisory_xact_lock(hashtext('inv_b2b_' || p_year));

  insert into invoice_counter_b2b (year, last_number) values (p_year, 1)
  on conflict (year) do update
    set last_number = invoice_counter_b2b.last_number + 1
  returning last_number into v_next;
  return v_next;
end;
$$;

-- Re-asegurar grants explícitos (idempotente; 0011 ya los definía pero
-- mantenemos aquí por trazabilidad: CREATE OR REPLACE preserva privilegios
-- existentes pero conviene declararlos otra vez para futuras reaplicaciones).
revoke all on function next_b2c_invoice_number(int) from public;
revoke all on function next_b2b_invoice_number(int) from public;
grant execute on function next_b2c_invoice_number(int) to service_role;
grant execute on function next_b2b_invoice_number(int) to service_role;

comment on function next_b2c_invoice_number(int) is
  'Devuelve el siguiente correlativo B2C del año dado. Serializado por advisory_xact_lock (Q-10).';
comment on function next_b2b_invoice_number(int) is
  'Devuelve el siguiente correlativo B2B del año dado. Serializado por advisory_xact_lock (Q-10).';
