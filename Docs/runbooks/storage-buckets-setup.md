# Storage Buckets — Setup Runbook

**Sprint 2 — Hallazgos L-05 / C-07 / C-08**
**Fecha:** 2026-05-27

## Contexto legal

- **L-05**: el comprador debe recibir el contrato en "soporte duradero" (art. 98 RDL 1/2007). El PDF generado por `generate-order-contract` es ese soporte.
- **C-07 / C-08**: el email de confirmación debe adjuntar el formulario oficial de desistimiento (Anexo I RDL 1/2007).

Los PDFs se almacenan en dos buckets **privados** de Supabase Storage. Ninguno es público: las Edge Functions acceden con `service_role`.

---

## Buckets a configurar manualmente en Supabase Dashboard

### `order-contracts` (privado)

Almacena el contrato de cada pedido generado por `generate-order-contract`.

1. Supabase Dashboard → Storage → **New bucket**
2. **Name**: `order-contracts`
3. **Public**: No (desactivado)
4. **File size limit**: 5 MB
5. **Allowed MIME types**: `application/pdf`
6. Guardar.

> Las Edge Functions acceden mediante `service_role`, por lo que no se necesitan políticas RLS adicionales para los documentos de clientes. Si en el futuro se habilita acceso autenticado por usuario, añadir una política SELECT con `auth.uid()::text = (split_part(name, '/', 1))` o similar.

### `legal-templates` (privado)

Almacena plantillas legales versionadas (formulario de desistimiento, etc.).

1. Supabase Dashboard → Storage → **New bucket**
2. **Name**: `legal-templates`
3. **Public**: No (desactivado)
4. **File size limit**: 2 MB
5. **Allowed MIME types**: `application/pdf`
6. Guardar.

---

## Subir el formulario de desistimiento

El formulario oficial de la UE (Anexo I RDL 1/2007) debe subirse al bucket `legal-templates`.

**Opción A — Dashboard (manual):**

1. Dashboard → Storage → `legal-templates`
2. Upload → seleccionar el archivo `public/devoluciones-formulario.pdf` del proyecto
3. El path resultante debe ser exactamente: `devoluciones-formulario.pdf`

**Opción B — Supabase CLI:**

```bash
supabase storage cp public/devoluciones-formulario.pdf ss:///legal-templates/devoluciones-formulario.pdf
```

> Si el formulario se actualiza (nueva versión legal), reemplazar el archivo en el mismo path. El bucket usa upsert implícito desde el Dashboard; con CLI, usar `--overwrite`.

---

## Verificación en SQL Editor

```sql
-- Confirmar que existen los dos buckets y son privados
SELECT id, name, public, file_size_limit
FROM storage.buckets
WHERE id IN ('order-contracts', 'legal-templates');
-- Esperado: 2 filas con public = false
```

```sql
-- Confirmar que el formulario de desistimiento existe
SELECT name, metadata
FROM storage.objects
WHERE bucket_id = 'legal-templates'
  AND name = 'devoluciones-formulario.pdf';
-- Esperado: 1 fila
```

---

## Checklist operativo

- [ ] Crear bucket `order-contracts` (privado, 5 MB, application/pdf)
- [ ] Crear bucket `legal-templates` (privado, 2 MB, application/pdf)
- [ ] Subir `devoluciones-formulario.pdf` a `legal-templates/devoluciones-formulario.pdf`
- [ ] Crear pedido de prueba y verificar que existe `order-contracts/{order_id}.pdf`
- [ ] Confirmar que el email de confirmación al cliente llega con 2 adjuntos:
  - `contrato-pedido-{order_number}.pdf`
  - `formulario-desistimiento.pdf`
- [ ] Revisar logs de la Edge Function `send-order-confirmation-customer`:
  `contract=true · withdrawal=true`

---

## Comportamiento si los buckets no existen

Las Edge Functions son **best-effort** respecto a los adjuntos:

- Si `order-contracts/{order_id}.pdf` no existe (bucket no creado o generación fallida), el email se envía igualmente **sin el adjunto de contrato**. El log mostrará `contract=false`.
- Si `legal-templates/devoluciones-formulario.pdf` no existe (archivo no subido), el email se envía igualmente **sin el formulario de desistimiento**. El log mostrará `withdrawal=false`.

En ambos casos el pedido se procesa con normalidad. Los adjuntos faltantes quedan registrados en los logs de Supabase Functions para revisión posterior.

> Mientras los buckets no estén creados, el email de confirmación ya cumple parcialmente el art. 98 RDL 1/2007 mediante el bloque HTML legal incluido en el cuerpo. La creación de los buckets y la subida del formulario eliminan los hallazgos L-05, C-07 y C-08 completamente.
