-- 0020_drop_legacy_invoice_number.sql
-- Cierre del hallazgo C-03 (auditoría legal V3): doble función de correlativo de factura.
-- next_invoice_number(int) era la versión legacy no atómica.
-- next_b2c_invoice_number(int) (migración 0011_invoice_series_split.sql) es la sustituta correcta.
-- Mantener ambas crea riesgo de uso accidental del legacy y duplicación de correlativos.

revoke execute on function next_invoice_number(int) from service_role;
drop function if exists next_invoice_number(int);

-- invoice_counter queda como tabla de histórico (read-only desde aplicación).
-- No se altera ni eliminan filas existentes.
