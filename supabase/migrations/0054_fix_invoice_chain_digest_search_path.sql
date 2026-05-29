-- 0054_fix_invoice_chain_digest_search_path.sql
--
-- Fix: append_invoice_chained (0051) llama a digest() de pgcrypto para el hash
-- de la cadena Verifactu, pero la función es SECURITY DEFINER con
-- `set search_path = public, pg_temp` (endurecimiento Q-21). pgcrypto vive en el
-- esquema `extensions`, que no estaba en el search_path → al emitir factura:
--   "fallo al persistir factura: function digest(bytea, unknown) does not exist".
--
-- Añadimos `extensions` al search_path para que digest() sea localizable.
-- (Alternativa equivalente: cualificar como extensions.digest() en el cuerpo.)

alter function public.append_invoice_chained(
  uuid, text, text, text, text, text, text, int, int, int, text, text, text, text
) set search_path = public, extensions, pg_temp;
