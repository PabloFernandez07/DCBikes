-- 0026_admin_users_anonymize_comments.sql
-- Cierre del hallazgo S-15 (auditoria legal V3): nombres reales de admin
-- presentes en comentarios SQL de la migración 0013_admin_users.sql.
--
-- La migración 0013 ya está aplicada en producción; este archivo no modifica
-- ninguna fila de la BD. Los comentarios PII han sido reemplazados por
-- identificadores genéricos (admin-1, admin-2) en 0013_admin_users.sql y el
-- mapeo real se ha movido a Docs/runbooks/admin-users-seed.md.template
-- (gitignoreado si contiene datos reales; solo el template se commitea).
--
-- NO-OP SQL: archivo documental.
do $$
begin
  raise notice 'S-15: nombres de admin movidos de 0013_admin_users.sql:38-41 a Docs/runbooks/admin-users-seed.md.template (fuera del repo publico si contiene datos reales)';
end $$;
