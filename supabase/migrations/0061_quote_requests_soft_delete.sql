-- 0061_quote_requests_soft_delete.sql
-- Papelera reversible para consultas (quote_requests).
--
-- El admin "elimina" una consulta marcando deleted_at = now() (UPDATE), y puede
-- restaurarla poniéndolo a NULL. NO se añade ninguna policy DELETE: el borrado es
-- lógico y reversible, y se apoya en la policy de UPDATE ya existente
-- (auth_quotes_u). Así conservamos la prueba de consentimiento RGPD hasta que el
-- cron de retención/anonimización procese la fila, igual que con el resto.

alter table quote_requests
  add column if not exists deleted_at timestamptz;

-- El listado del admin filtra por deleted_at IS NULL en el caso común (bandeja
-- activa). Índice parcial para que ese filtro sea barato.
create index if not exists quote_requests_deleted_idx
  on quote_requests (deleted_at)
  where deleted_at is null;

comment on column quote_requests.deleted_at is
  'Papelera reversible: timestamp en que el admin envió la consulta a la papelera. NULL = activa.';
