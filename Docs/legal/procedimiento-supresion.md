# Procedimiento de atención al derecho de supresión (art. 17 RGPD)

**DC Bikes Cantabria** — documento operativo interno
**Última actualización:** 2026-05-26
**Responsable:** administrador de la tienda
**Plazo legal de respuesta:** 1 mes desde la recepción (art. 12.3 RGPD), prorrogable a 3 meses en casos complejos previa notificación al interesado.

---

## 1. Marco legal

El derecho de supresión (también llamado "derecho al olvido") está regulado en el **artículo 17 del Reglamento (UE) 2016/679 (RGPD)**. Otorga al interesado el derecho a obtener, sin dilación indebida, la supresión de sus datos personales cuando concurra alguna de las circunstancias del art. 17.1 (datos ya no necesarios, retirada del consentimiento, tratamiento ilícito, etc.).

Este derecho **NO es absoluto**. El art. 17.3 enumera las excepciones que permiten al responsable denegar — total o parcialmente — la supresión. Para una tienda online, la excepción más relevante es:

> **Art. 17.3.b RGPD** — "para el cumplimiento de una obligación legal que requiera el tratamiento de datos impuesta por el Derecho de la Unión o de los Estados miembros que se aplique al responsable del tratamiento".

En el caso de DC Bikes Cantabria, esta excepción se materializa en:

- **Art. 30 del Código de Comercio** — obligación de conservar libros, correspondencia, documentación y justificantes durante **seis años** desde el último asiento.
- **Art. 66 de la Ley General Tributaria** — plazo de prescripción de cuatro años para la determinación de la deuda tributaria, ampliable cuando hay procedimientos en curso.
- **RD 1619/2012** (Reglamento de Facturación) — conservación de facturas durante los plazos del CCom y la LGT.

Por tanto, los datos contables y de facturación de pedidos con menos de 6 años de antigüedad **deben conservarse** aunque el cliente solicite su supresión.

---

## 2. Flujo de procesamiento (6 pasos)

### Paso 1 — Recepción de la solicitud

La solicitud puede llegar por cualquier canal: email a `info@dcbikescantabria.es`, formulario web, correo postal, o llamada telefónica.

**Acción:** registrar inmediatamente la entrada en la tabla `data_subject_requests` con los siguientes campos mínimos:

- `request_type = 'erasure'`
- `requester_email`
- `requester_full_name` (si se conoce)
- `request_received_at = now()` (timestamp de recepción)
- `request_channel` (`email`, `form`, `postal`, `phone`)
- `request_text` (copia literal de la petición original)
- `outcome = 'pending'`

> Importante: el plazo legal de 1 mes empieza a contar **desde la recepción**, no desde la verificación de identidad.

### Paso 2 — Verificar identidad del solicitante

Antes de actuar, debemos asegurarnos razonablemente de que la persona que solicita la supresión es realmente el titular de los datos (art. 12.6 RGPD).

**Métodos aceptables** (en orden de simplicidad):

1. **Coincidencia con email de pedido existente** — si el `requester_email` coincide con el `customer_email` de pedidos en BD, el envío del email desde esa dirección es prueba suficiente en la mayoría de casos.
2. **Documento de identidad adjunto** — DNI/NIE escaneado o foto legible. Sólo debemos cotejar nombre/apellidos; el documento se destruye tras la verificación (no se almacena).
3. **Llamada de confirmación** al teléfono asociado al pedido más reciente.

Si la solicitud llega desde un email distinto al de los pedidos, debemos pedir aclaración o documento identificativo antes de actuar (art. 12.6 RGPD permite suspender el plazo en este caso).

**Acción:** actualizar el registro con:
- `identity_verified = true`
- `identity_verified_at = now()`
- `identity_verification_method`

### Paso 3 — Determinar plazo de conservación obligatorio

Buscar todos los pedidos asociados al solicitante (`customer_email` o NIF en factura). Para cada pedido, calcular la antigüedad desde `created_at`.

El umbral es **6 años**:
- Pedidos con `created_at < now() - interval '6 years'` → supresión total permitida.
- Pedidos con `created_at >= now() - interval '6 years'` → conservación parcial obligatoria (art. 17.3.b).

> Nota técnica: la mayoría de los pedidos con más de 6 años ya estarán anonimizados automáticamente por el cron `data-retention-cron` (migración `0012_data_retention_cron.sql`). En la práctica, sólo encontraremos pedidos vivos con menos de 6 años.

### Paso 4 — Decidir alcance de la actuación

#### 4.a) Todos los pedidos tienen más de 6 años

Acción: **anonimización TOTAL ya realizada** por el cron diario. No queda dato personal alguno. Confirmar que efectivamente todos los pedidos del solicitante están anonimizados (`anonymized_at IS NOT NULL`) y proceder al Paso 5.

#### 4.b) Alguno o todos los pedidos tienen menos de 6 años

Acción: **anonimización PARCIAL**. Para cada pedido afectado:

**Mantener** (obligación legal — art. 17.3.b RGPD + art. 30 CCom + art. 66 LGT):
- `order_number`
- `total_cents`, `subtotal_cents`, `shipping_cents`, `tax_rate`
- `invoice_number`, `invoice_business_name`, `invoice_cif`, `invoice_address` (si el pedido tiene factura B2B)
- Líneas de pedido (`order_items`) y `invoices` asociadas
- Fechas: `created_at`, `payment_captured_at`, etc.

**Borrar/anonimizar**:

| Campo | Nuevo valor |
|---|---|
| `customer_first_name` | `'Anonimizado'` |
| `customer_last_name` | `''` |
| `customer_email` | `'anonimizado@anonimizado.local'` |
| `customer_phone` | `NULL` |
| `shipping_address` | `NULL` |
| `shipping_city` | `NULL` |
| `shipping_postal_code` | `NULL` |
| `shipping_province` | `NULL` |
| `shipping_notes` | `NULL` |
| `consent_ip` | `NULL` |
| `consent_user_agent` | `NULL` |

> Si el pedido tiene factura B2B (`needs_invoice = true`), los campos `invoice_*` deben conservarse intactos porque son los datos fiscales del cliente (no del consumidor final). En ese caso, el solicitante debe contactar con su propia gestoría si quiere modificar los datos fiscales.

### Paso 5 — Confirmar al solicitante por escrito

Responder al solicitante por email (o el canal por el que se recibió) en un plazo **máximo de 1 mes** desde la recepción (art. 12.3 RGPD). Si la solicitud es compleja, se puede prorrogar 2 meses adicionales **notificándolo al interesado dentro del primer mes**.

Usar la plantilla del apartado 4 de este documento.

### Paso 6 — Registrar la resolución

Actualizar el registro en `data_subject_requests`:

- `outcome` →
  - `'granted_full'` si se borró/anonimizó todo,
  - `'granted_partial'` si se aplicó conservación parcial,
  - `'denied_legal_obligation'` si toda la solicitud chocó con obligación legal (poco habitual),
  - `'denied_other'` si se denegó por otro motivo (citar art. del RGPD).
- `outcome_reason` — explicación breve.
- `actions_taken` — descripción libre con detalle de qué pedidos se tocaron y qué campos.
- `resolved_at = now()`
- `resolved_by = auth.uid()` (admin que ejecuta la acción).

Conservar copia del email enviado al solicitante (carpeta `Sent` del buzón) como prueba de cumplimiento ante una eventual inspección de la AEPD.

---

## 3. Tabla decisional

| Antigüedad pedido | Acción técnica | Justificación legal |
|---|---|---|
| **> 6 años** | Anonimización TOTAL (ya realizada por cron `data-retention-cron`) | Plazo legal de conservación cumplido |
| **< 6 años** | Anonimización PARCIAL: mantener datos contables/factura, borrar datos identificativos no esenciales | Art. 17.3.b RGPD + art. 30 CCom + art. 66 LGT |

---

## 4. Plantilla de email de respuesta

```
Asunto: Tu solicitud de supresión de datos — DC Bikes Cantabria

Hola [NOMBRE],

Hemos recibido tu solicitud de ejercicio del derecho de supresión recogido en
el art. 17 del Reglamento General de Protección de Datos (RGPD).

Tras verificar tu identidad, hemos procedido a:

[CASO 1 — Anonimización total]
Eliminar tus datos personales de nuestra base de datos. Los registros
relativos a pedidos anteriores se han anonimizado de forma irreversible y
ya no permiten identificarte.

[CASO 2 — Anonimización parcial]
Eliminar tus datos identificativos no esenciales (dirección, teléfono, email
y notas) de los pedidos con menos de 6 años de antigüedad. Conforme al
art. 17.3.b RGPD, debemos conservar los datos fiscales y de facturación de
estos pedidos durante 6 años desde la fecha del pedido (art. 30 del Código
de Comercio + art. 66 de la Ley General Tributaria). Estos datos no son
visibles ni accesibles para ningún tercero y se eliminarán automáticamente
una vez transcurrido el plazo legal.

Si tienes cualquier duda, puedes responder a este email. También puedes
presentar una reclamación ante la Agencia Española de Protección de Datos
(https://www.aepd.es) si consideras que tu derecho no ha sido respetado.

Atentamente,
DC Bikes Cantabria
```

---

## 5. Cómo ejecutar la anonimización parcial técnicamente

### Opción A — Supabase Studio (recomendado)

1. Acceder a Supabase Studio → SQL Editor.
2. Identificar los `id` de pedidos afectados:

```sql
select id, order_number, created_at, customer_email
from orders
where customer_email = 'cliente@example.com'
  and anonymized_at is null
  and created_at >= now() - interval '6 years';
```

3. Ejecutar la anonimización parcial:

```sql
update orders
set
  customer_first_name = 'Anonimizado',
  customer_last_name = '',
  customer_email = 'anonimizado@anonimizado.local',
  customer_phone = null,
  shipping_address = null,
  shipping_city = null,
  shipping_postal_code = null,
  shipping_province = null,
  shipping_notes = null,
  consent_ip = null,
  consent_user_agent = null,
  anonymized_at = now()
where id in ('uuid-1', 'uuid-2', '...');
```

4. Registrar la solicitud y resolución en `data_subject_requests` (puede hacerse en la misma sesión SQL o vía panel admin si existe).

### Opción B — Panel admin

Si en el futuro se implementa una sección "Solicitudes RGPD" en `/admin/...`, esta debe permitir:

1. Listar todas las solicitudes con `outcome = 'pending'`.
2. Mostrar los pedidos asociados al `requester_email`.
3. Botón "Anonimizar parcialmente" que ejecute el UPDATE anterior bajo confirmación.
4. Botón "Marcar como resuelta" que rellene `outcome`, `actions_taken`, `resolved_at`, `resolved_by`.

> Implementación de UI: pendiente. Hasta entonces, se trabaja vía Studio.

---

## 6. Backups y plazos de recuperación temporal (PITR)

Supabase mantiene backups automáticos del proyecto con una ventana de Point In Time Recovery (PITR) de 7 días (plan Pro) o más según el plan contratado. Esto significa que aunque ejecutemos un DELETE / UPDATE de anonimización inmediatamente al recibir una solicitud de supresión, los datos originales pueden permanecer recuperables dentro de la ventana PITR.

Implicaciones para el interesado:
- La anonimización ESTRUCTURAL (en la BD viva) se aplica en plazo máximo de 1 mes (RGPD art. 12.3).
- La eliminación COMPLETA incluyendo backups requiere esperar al ciclo de retención de backups (7 días con plan Pro, ampliable).
- En casos excepcionales (orden judicial, retirada de denuncia explícita) podemos solicitar a Supabase la purga forzada del PITR, pero NO está incluido en el procedimiento estándar.

Esta cláusula se ajusta a la posición de la AEPD (Resolución 02316/2021 y similares) sobre el deber de informar al interesado del alcance temporal real del derecho de supresión cuando intervienen sistemas de backup automatizados.

---

## 7. Referencias

- Reglamento (UE) 2016/679 (RGPD), arts. 12, 17, 18, 19.
- Ley Orgánica 3/2018 (LOPDGDD).
- Código de Comercio, art. 30.
- Ley General Tributaria, art. 66.
- RD 1619/2012 (Reglamento de Facturación).
- AEPD — "Guía para el cumplimiento del deber de informar" y "Guía sobre el uso de cookies".
