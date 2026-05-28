---
title: Casos de prueba manuales — Auditoría legal V5
version: 2026-05-27-v5
audit: V5
total_cases: 122
ejecutable_sin_codigo: true
---

# Casos de prueba manuales — Auditoría legal V5 · DC Bikes Cantabria

> Un caso de prueba por cada uno de los **122 hallazgos** de la auditoría V5. Cada caso está pensado para que **el titular pueda ejecutarlo sin abrir el código**, usando el navegador, el SQL Editor de Supabase Studio y, cuando aplica, `curl` o las DevTools del navegador.

## Cómo usar este documento

1. Trabaja sprint por sprint, de arriba abajo.
2. En cada caso, sigue los pasos del icono que corresponda.
3. Marca el resultado al final del caso: `✅` si pasa, `❌` si falla, `⏳` si está pendiente o bloqueado.
4. Donde leas `TODO verificar`, falta confirmar un dato exacto del entorno (URL, nombre de tabla, etc.); confírmalo antes de dar el caso por válido.

## Leyenda de iconos

| Icono | Significado | Dónde se ejecuta |
|-------|-------------|------------------|
| 🌐 | Navegador | Abrir la web pública o el panel `/admin` en un navegador |
| 🗄️ | SQL | Supabase Studio → SQL Editor (pegar y ejecutar la consulta) |
| ⚙️ | API / DevTools | `curl` desde terminal o pestaña Network/Console de las DevTools (F12) |

## Estados

- `✅` Pasa · `❌` Falla · `⏳` Pendiente o bloqueado

---

## Índice

- [Sprint 0 — Emergencia (críticos)](#sprint-0--emergencia-criticos)
- [Sprint 1 — Críticos restantes](#sprint-1--criticos-restantes)
- [Sprint 2 — Altos](#sprint-2--altos)
- [Sprint 3 — Medios y bajos](#sprint-3--medios-y-bajos)
- [Resumen de cobertura](#resumen-de-cobertura)

---

## Sprint 0 — Emergencia (críticos)

### Q-01 · Rotación de secretos y borrado del archivo en plano
**Severidad** Crítica · **Sprint** 0

- ⚙️ Comprueba que el archivo `Docs/runbooks/secretos-generados-RECUPERAR.txt` ya **no existe** en el disco (búscalo en el explorador de archivos o con `ls Docs/runbooks/`).
- 🌐 En Supabase Dashboard → Project Settings → API, verifica que la `service_role key` fue reseteada después del 2026-05-27 (TODO verificar fecha de rotación).
- 🌐 Abre `Docs/runbooks/secret-rotation.md` y confirma que existe y describe rotación trimestral sin archivos en disco.

**Resultado esperado**: no hay secretos en plano en el repo; el runbook de rotación existe; las claves fueron rotadas.

`✅ ❌ ⏳`

### Q-02 · Cron de analítica purga sin error de columna inexistente
**Severidad** Crítica · **Sprint** 0

- 🗄️ Ejecuta: `select purge_analytics_older_than_13_months();` — debe completar sin error.
- 🗄️ Verifica la definición: `select pg_get_functiondef('purge_analytics_older_than_13_months()'::regprocedure);` y comprueba que usa `viewed_at` y `searched_at` (no columnas inexistentes).

**Resultado esperado**: la función ejecuta sin error de "column does not exist".

`✅ ❌ ⏳`

### Q-03 · RLS de inmutabilidad en payments_log
**Severidad** Crítica · **Sprint** 0

- 🗄️ Lista políticas: `select policyname, cmd from pg_policies where tablename = 'payments_log';` — deben existir solo `select` e `insert` para admin, **sin** `update` ni `delete`.

**Resultado esperado**: no hay política de UPDATE ni DELETE sobre `payments_log`.

`✅ ❌ ⏳`

### Q-04 · Tabla consent_audit inmutable (verificación temprana)
**Severidad** Crítica · **Sprint** 0/1

- 🗄️ `select policyname, cmd from pg_policies where tablename = 'consent_audit';` — debe existir solo `select` (admin) e `insert` (service_role), sin update/delete.
- 🗄️ Confirma que existe: `select to_regclass('public.consent_audit');` (no nulo).

**Resultado esperado**: `consent_audit` existe y es inmutable. (Implementación completa en Sprint 1, ver Q-04 Sprint 1.)

`✅ ❌ ⏳`

### Q-05 · Audit log central (verificación temprana)
**Severidad** Crítica · **Sprint** 0/1

- 🗄️ `select to_regclass('public.audit_log');` debe devolver la tabla. (Detalle completo en Sprint 1.)

**Resultado esperado**: la tabla `audit_log` existe.

`✅ ❌ ⏳`

### Q-06 · RLS settings exige is_admin()
**Severidad** Crítica · **Sprint** 0

- 🗄️ `select policyname, qual from pg_policies where tablename = 'settings';` — las políticas deben referenciar `is_admin()`.
- 🌐 Inicia sesión como usuario **no admin** (TODO verificar disponer de uno) e intenta modificar settings: debe ser rechazado.

**Resultado esperado**: solo administradores pueden leer/modificar `settings`.

`✅ ❌ ⏳`

### Q-07 · RLS inmutabilidad invoices y order_status_history
**Severidad** Crítica · **Sprint** 0

- 🗄️ `select policyname, cmd from pg_policies where tablename in ('invoices','order_status_history');` — solo `select`/`insert`, sin update/delete (inalterabilidad Verifactu RD 1007/2023).

**Resultado esperado**: ambas tablas son inmutables vía RLS.

`✅ ❌ ⏳`

### Q-08 · RLS categories/products/product_images exige is_admin()
**Severidad** Crítica · **Sprint** 0

- 🗄️ `select tablename, policyname, qual from pg_policies where tablename in ('categories','products','product_images');` — deben exigir `is_admin()`.

**Resultado esperado**: catálogo solo modificable por admin.

`✅ ❌ ⏳`

### Q-09 · RLS counters solo service_role
**Severidad** Crítica · **Sprint** 0

- 🗄️ `select tablename, roles from pg_policies where tablename in ('order_counter','invoice_counter');` — el rol debe ser `service_role`.

**Resultado esperado**: los contadores no son accesibles por roles autenticados/anon.

`✅ ❌ ⏳`

### B-01 · Escape HTML en send-quote-email (anti-XSS en email)
**Severidad** Crítica · **Sprint** 0

- 🌐 Envía un presupuesto desde `/contacto` (QuoteModal) con un mensaje que contenga `<script>alert(1)</script>` y un email/teléfono con caracteres especiales.
- ⚙️ Revisa el email recibido (bandeja del destinatario interno): el `<script>` debe verse como **texto literal escapado**, no ejecutarse ni romper el HTML.

**Resultado esperado**: el contenido del usuario aparece escapado; los saltos de línea se ven como `<br>`.

`✅ ❌ ⏳`

### B-02 · Auth interna en send-customer-magic-link
**Severidad** Crítica · **Sprint** 0

- ⚙️ Invoca directamente la función sin la cabecera `x-internal-secret`:
  ```bash
  curl -i -X POST "https://TODO-PROJECT.supabase.co/functions/v1/send-customer-magic-link" \
    -H "Content-Type: application/json" -d '{"email":"test@example.com"}'
  ```
- Debe responder **403 forbidden**.

**Resultado esperado**: sin el secreto interno se rechaza con 403.

`✅ ❌ ⏳`

### B-03 · Turnstile fail-closed
**Severidad** Crítica · **Sprint** 0

- 🗄️/⚙️ Con `TURNSTILE_SECRET` ausente (entorno de prueba, TODO verificar), envía un presupuesto: la función `quote-submit` debe **rechazar** el envío (no aceptarlo).

**Resultado esperado**: sin secreto de captcha, ningún envío se acepta (fail-closed).

`✅ ❌ ⏳`

### B-04 · Cabecera x-internal-secret en todos los send-*
**Severidad** Crítica · **Sprint** 0

- ⚙️ Repite la prueba de B-02 contra cada función `send-*` (TODO verificar lista: send-order-confirmation, send-quote-email, etc.) sin la cabecera. Todas deben responder 403.

**Resultado esperado**: ninguna función `send-*` es invocable externamente sin el secreto.

`✅ ❌ ⏳`

### F-03 · Fuente única para el CIF (useLegalIdentity)
**Severidad** Crítica · **Sprint** 0

- 🌐 Abre Aviso Legal, Política de Privacidad, Términos de Venta y el Footer; el **CIF/razón social** debe coincidir exactamente en las cuatro vistas.
- 🗄️ `select key from settings where key = 'legal_nif';` — la key legacy `legal_nif` no debe usarse ya (debe estar migrada a `legal_company_cif`).

**Resultado esperado**: un único valor de CIF en todas las páginas; no hay lectura de `legal_nif`.

`✅ ❌ ⏳`

### F-04 · Eliminado el dark pattern accepted_approval_flow
**Severidad** Crítica · **Sprint** 0

- 🌐 En `/checkout`, comprueba que **no existe** un checkbox obligatorio separado "Acepto el plazo de confirmación de 48h".
- 🌐 Verifica que la cláusula 4.5 de Términos de Venta cubre el plazo de 48h.

**Resultado esperado**: el checkbox dark pattern desaparece; la cláusula 48h vive en Términos.

`✅ ❌ ⏳`

### F-05 · Declaración de accesibilidad reescrita
**Severidad** Crítica · **Sprint** 0

- 🌐 En Aviso Legal, lee la sección de accesibilidad: debe indicar **adaptación progresiva a WCAG 2.1 AA**, mencionar el Reglamento (UE) 2019/882 y la Ley 11/2023, un email de contacto (`info@dcbikescantabria.es`) con plazo de 14 días y la vía de reclamación (AESIA / Defensoría del Pueblo).
- Debe **NO** apelar a la exención del art. 4.1 de la Ley 11/2023.

**Resultado esperado**: declaración de adaptación progresiva, sin exención.

`✅ ❌ ⏳`

### Q-16 · [PENDIENTE] del RAT resueltos (verificación cruzada)
**Severidad** Crítica · **Sprint** 0

- 🌐 Abre `Docs/legal/rat-2026.md` y busca la cadena `[PENDIENTE]`: no debe aparecer ninguna ocurrencia. (Solapa con X-21; se verifica de forma independiente porque Q-16 audita específicamente el RAT.)

**Resultado esperado**: el RAT no contiene marcadores pendientes.

`✅ ❌ ⏳`

### Q-18 · designación de responsable de privacidad firmada (verificación cruzada)
**Severidad** Crítica · **Sprint** 0

- 🌐 Abre `Docs/legal/designacion-responsable-privacidad.md` y confirma que está completo y firmado (datos reales del titular, sin `[PENDIENTE]`).

**Resultado esperado**: designación firmada y sin marcadores.

`✅ ❌ ⏳`

### X-20 · legal-versions.ts actualizado a V5
**Severidad** Crítica · **Sprint** 0

- 🌐 En el Footer y en los pies de las páginas legales, las versiones deben ser `2026-05-27-v5` (Términos, Privacidad, Cookies, Devoluciones).

**Resultado esperado**: todas las versiones legales muestran v5.

`✅ ❌ ⏳`

### X-21 · RAT y procedimiento-brechas sin [PENDIENTE]
**Severidad** Crítica · **Sprint** 0

- 🌐 Abre `Docs/legal/rat-2026.md` y `Docs/legal/procedimiento-brechas.md`: no debe quedar ningún `[PENDIENTE]` ni `{email_dpo}` sin sustituir por datos reales (TODO verificar que el titular ya los rellenó).
- 🌐 Confirma que existe `Docs/legal/designacion-responsable-privacidad.md`.

**Resultado esperado**: documentos sin marcadores pendientes; designación firmada presente.

`✅ ❌ ⏳`

---

## Sprint 1 — Críticos restantes

### B-05 · Optimistic locking en order-accept
**Severidad** Crítica · **Sprint** 1

- ⚙️ Simula dos aceptaciones concurrentes del mismo pedido (dos `curl` casi simultáneos o doble clic en `/admin`). La segunda debe responder **409 conflicto de concurrencia**.

**Resultado esperado**: solo una transición tiene éxito; la otra recibe 409.

`✅ ❌ ⏳`

### B-06 · Reversión Redsys ante conflicto
**Severidad** Crítica · **Sprint** 1

- ⚙️ En el escenario de conflicto de B-05 con un pago capturado, verifica que se ejecuta la cancelación en Redsys.
- 🗄️ `select * from payments_log where order_id = 'TODO-UUID' order by created_at;` — debe haber un registro de `cancel`.

**Resultado esperado**: si el estado cambió, el cargo se revierte y queda registrado.

`✅ ❌ ⏳`

### B-07 · Reserva de stock atómica
**Severidad** Crítica · **Sprint** 1

- 🗄️ Con un producto a `stock = 1`, lanza dos `select reserve_stock('[{"product_id":"TODO","qty":1}]'::jsonb);` concurrentes. Solo uno debe tener éxito; el otro debe lanzar `insufficient stock`.

**Resultado esperado**: nunca queda stock negativo.

`✅ ❌ ⏳`

### Q-04 · Tabla consent_audit operativa (inserciones en checkout)
**Severidad** Crítica · **Sprint** 1

- 🌐 Realiza un pedido aceptando los consentimientos.
- 🗄️ `select consent_type, consent_action, consent_version from consent_audit where customer_email = 'TODO-email' order by occurred_at;` — debe haber filas `grant` por cada checkbox.

**Resultado esperado**: cada consentimiento del checkout queda auditado.

`✅ ❌ ⏳`

### Q-05 · Audit log central con triggers
**Severidad** Crítica · **Sprint** 1

- 🗄️ Cambia un valor en `settings` (como admin) y luego `select * from audit_log order by id desc limit 5;` — debe registrar el cambio.
- 🗄️ Repite cambiando `products.retail_price` y verifica el registro.

**Resultado esperado**: los cambios en tablas sensibles quedan en `audit_log`.

`✅ ❌ ⏳`

### F-01 · Consentimientos del checkout rediseñados
**Severidad** Crítica · **Sprint** 1

- 🌐 En `/checkout`: debe haber un checkbox "acepto los Términos" (que menciona la cláusula 4.5) y un checkbox "confirmo haber leído la Política de Privacidad". El texto debe indicar base legal art. 6.1.b.

**Resultado esperado**: dos consentimientos claros; privacidad como confirmación de lectura, no como base de consentimiento forzado.

`✅ ❌ ⏳`

### F-02 · Tabla de encargados completa en Privacidad
**Severidad** Crítica · **Sprint** 1

- 🌐 En Política de Privacidad, sección 7: cada encargado (Supabase, Resend, Vercel, Cloudflare, Google) debe indicar **qué datos recibe** y su **base de transferencia** (DPF o CCT 2021/914).
- 🌐 Contrasta la certificación DPF en <https://www.dataprivacyframework.gov/list> (TODO verificar estado actual de cada proveedor).

**Resultado esperado**: tabla de encargados completa y exacta.

`✅ ❌ ⏳`

### F-06 · QuoteModal granular con Turnstile diferido
**Severidad** Crítica · **Sprint** 1

- 🌐 Abre el QuoteModal: el widget de Turnstile **no** debe cargarse hasta el primer foco en un input.
- ⚙️ En DevTools → Network, confirma que el script de Turnstile se descarga solo tras el foco.
- 🌐 El checkbox de privacidad debe enumerar los procesadores (Supabase EU, Resend EE.UU. CCT, Cloudflare DPF).

**Resultado esperado**: carga diferida + consentimiento informado granular.

`✅ ❌ ⏳`

### B-08 · google-reviews sin ReferenceError de CORS
**Severidad** Crítica · **Sprint** 1

- ⚙️ `curl -i "https://TODO-PROJECT.supabase.co/functions/v1/google-reviews"` — debe responder 200 (o el error de negocio esperado), **no** un 500 por `corsPreflightResponse is not defined`.

**Resultado esperado**: la función responde sin error de referencia.

`✅ ❌ ⏳`

### X-01 · Punto de contacto único DSA en Aviso Legal
**Severidad** Crítica · **Sprint** 1

- 🌐 En Aviso Legal, sección 9: debe figurar el punto de contacto DSA (`dsa@dcbikescantabria.es`), los idiomas (español/inglés) y el mecanismo notice-and-action.

**Resultado esperado**: sección DSA presente y completa.

`✅ ❌ ⏳`

### X-10 · Endpoint customer-data-export (derecho de acceso)
**Severidad** Crítica · **Sprint** 1

- 🌐 Inicia sesión en `/mis-pedidos` y pulsa "Descargar mis datos": debe descargarse un JSON con pedidos, presupuestos, consentimientos y sesiones del cliente.
- 🗄️ `select * from data_subject_requests where requester_email = 'TODO-email' order by created_at desc limit 1;` — debe quedar registrada la solicitud de acceso.

**Resultado esperado**: el cliente obtiene su export y queda registrado.

`✅ ❌ ⏳`

---

## Sprint 2 — Altos

### F-07 · Checkbox de privacidad en MyOrdersRequestAccess
**Severidad** Alta · **Sprint** 2

- 🌐 En la página de solicitud de acceso a pedidos, debe existir un checkbox de privacidad obligatorio antes de enviar.

**Resultado esperado**: no se puede solicitar acceso sin aceptar privacidad.

`✅ ❌ ⏳`

### F-08 · controls + prefers-reduced-motion en vídeos de Contact
**Severidad** Alta · **Sprint** 2

- 🌐 En `/contacto`, los vídeos deben tener controles visibles.
- 🌐 Activa "reducir movimiento" en el SO y recarga: el vídeo no debe autorreproducirse.

**Resultado esperado**: vídeos accesibles y respetuosos con preferencias de movimiento.

`✅ ❌ ⏳`

### F-09 · CSP img-src sin lh3.googleusercontent.com
**Severidad** Alta · **Sprint** 2

- ⚙️ En DevTools → Network, inspecciona la cabecera `Content-Security-Policy` de la respuesta: `img-src` **no** debe incluir `https://lh3.googleusercontent.com`.

**Resultado esperado**: el dominio de avatares de Google no está en el CSP de imágenes.

`✅ ❌ ⏳`

### F-10 · Delay del banner de cookies a 0 ms
**Severidad** Alta · **Sprint** 2

- 🌐 Borra cookies y recarga: el banner de cookies debe aparecer de inmediato, sin retardo.

**Resultado esperado**: banner inmediato.

`✅ ❌ ⏳`

### F-11 · Botón "Configurar" con mismo peso visual
**Severidad** Alta · **Sprint** 2

- 🌐 En el banner de cookies, "Configurar" y "Aceptar" deben tener un peso visual equivalente (no dark pattern). "Configurar" usa `variant="secondary"`.

**Resultado esperado**: opciones equilibradas visualmente.

`✅ ❌ ⏳`

### F-12 · Coherencia bicis online entre Returns y Términos
**Severidad** Alta · **Sprint** 2

- 🌐 Compara la política sobre venta/devolución de bicicletas online en Devoluciones y en Términos de Venta: no debe haber contradicción.

**Resultado esperado**: ambos textos son coherentes.

`✅ ❌ ⏳`

### F-13 · isValidSpanishId() en el schema de settings
**Severidad** Alta · **Sprint** 2

- 🌐 En `/admin/configuracion`, intenta guardar un CIF inválido: debe rechazarse con validación.

**Resultado esperado**: el CIF se valida también en el formulario de settings.

`✅ ❌ ⏳`

### F-14 · Referencia legal unificada en garantía
**Severidad** Alta · **Sprint** 2

- 🌐 En Confirmación de Pedido y en Términos de Venta, la referencia legal de garantía debe ser idéntica: "arts. 114–127 RDL 1/2007".

**Resultado esperado**: misma cita legal en ambos sitios.

`✅ ❌ ⏳`

### F-15 · confirm() antes de reload en CookiePolicy
**Severidad** Alta · **Sprint** 2

- 🌐 En la página de Cookies, al revocar el consentimiento debe aparecer un `confirm()` antes de recargar.

**Resultado esperado**: se pide confirmación antes de recargar.

`✅ ❌ ⏳`

### F-16 · Enlace "Accesibilidad" en el Footer
**Severidad** Alta · **Sprint** 2

- 🌐 El Footer debe incluir un enlace "Accesibilidad" que lleve a la declaración correspondiente.

**Resultado esperado**: enlace de accesibilidad visible.

`✅ ❌ ⏳`

### F-17 · Total visible junto al botón submit en móvil
**Severidad** Alta · **Sprint** 2

- 🌐 En móvil (DevTools modo responsive), en `/checkout` el importe total debe verse junto al botón de pagar.

**Resultado esperado**: total visible al confirmar en móvil.

`✅ ❌ ⏳`

### B-09 · CORS dinámico (sin CORS_HEADERS export)
**Severidad** Alta · **Sprint** 2

- ⚙️ `curl -i -X OPTIONS` contra `cron-healthcheck`, `quote-submit` y `google-avatar-proxy` con `Origin` no permitido: la respuesta **no** debe devolver `Access-Control-Allow-Origin: *`.

**Resultado esperado**: CORS construido por origen, sin wildcard.

`✅ ❌ ⏳`

### B-10 · maskEmail en todos los logs
**Severidad** Alta · **Sprint** 2

- ⚙️ En Supabase → Edge Functions → Logs, busca emails en claro: no debe aparecer ningún email completo (deben verse enmascarados, p. ej. `t***@e***.com`).

**Resultado esperado**: ningún email en claro en logs.

`✅ ❌ ⏳`

### B-11 · No loguear RESEND_API_KEY
**Severidad** Alta · **Sprint** 2

- ⚙️ En los logs de Edge Functions, busca cualquier fragmento de la `RESEND_API_KEY`: no debe aparecer ninguna porción.

**Resultado esperado**: la API key no se loguea jamás.

`✅ ❌ ⏳`

### B-12 · timingSafeEq al comparar secretos
**Severidad** Alta · **Sprint** 2

- ⚙️ Invoca `order-auto-cancel`, `cron-healthcheck` y `data-retention-cron` con un secreto incorrecto: deben rechazar con 401/403 (comparación en tiempo constante).

**Resultado esperado**: comparación de secretos resistente a timing.

`✅ ❌ ⏳`

### B-13 · Validar Ds_Amount == order.total_cents
**Severidad** Alta · **Sprint** 2

- ⚙️ Simula una notificación Redsys con un importe distinto al del pedido: debe rechazarse.

**Resultado esperado**: importes discordantes se rechazan.

`✅ ❌ ⏳`

### B-14 · Anti-replay de notificaciones Redsys
**Severidad** Alta · **Sprint** 2

- ⚙️ Reenvía dos veces la misma notificación Redsys: la segunda debe ignorarse (deduplicación).
- 🗄️ `select count(*) from redsys_notification_dedup where TODO-id;` — debe haber una sola entrada.

**Resultado esperado**: notificaciones repetidas no se reprocesan.

`✅ ❌ ⏳`

### B-15 · Rate-limit en order-public-get
**Severidad** Alta · **Sprint** 2

- ⚙️ Lanza más de 30 peticiones/min desde la misma IP a `order-public-get`: a partir del límite debe responder 429.

**Resultado esperado**: rate-limit de 30 req/min por IP.

`✅ ❌ ⏳`

### B-16 · order-public-get sin ciudad ni CP
**Severidad** Alta · **Sprint** 2

- ⚙️ `curl` a `order-public-get` de un pedido: el JSON **no** debe incluir `shipping_city` ni `shipping_postal_code`.

**Resultado esperado**: el payload no expone datos de envío sensibles.

`✅ ❌ ⏳`

### B-17 · deno.json + import_map + deno.lock con SHA-256
**Severidad** Alta · **Sprint** 2

- 🌐 Comprueba que existen `supabase/functions/deno.json`, `import_map.json` y `deno.lock` con hashes SHA-256 (TODO verificar rutas exactas).

**Resultado esperado**: dependencias Deno fijadas e íntegras.

`✅ ❌ ⏳`

### B-18 · Constraint customer_email en minúsculas
**Severidad** Alta · **Sprint** 2

- 🗄️ Intenta `insert into orders (customer_email, ...) values ('MAYUS@Example.com', ...);` — debe rechazarse por el constraint `customer_email = lower(customer_email)`.

**Resultado esperado**: emails siempre en minúsculas.

`✅ ❌ ⏳`

### Q-10 · advisory lock en correlativo de factura
**Severidad** Alta · **Sprint** 2

- 🗄️ Inspecciona la función de correlativo: `select pg_get_functiondef('TODO-fn'::regprocedure);` debe incluir `pg_advisory_xact_lock(hashtext('inv_b2c_' || p_year))`.

**Resultado esperado**: numeración de factura sin huecos ni duplicados bajo concurrencia.

`✅ ❌ ⏳`

### Q-11 · advisory lock en data-retention-cron
**Severidad** Alta · **Sprint** 2

- 🗄️ La función del cron de retención debe usar `pg_try_advisory_lock(hashtext('data-retention-cron'))` al inicio (TODO verificar nombre de función).

**Resultado esperado**: el cron no se solapa consigo mismo.

`✅ ❌ ⏳`

### Q-12 · customer_sessions con purged_at + cron de purga
**Severidad** Alta · **Sprint** 2

- 🗄️ `select column_name from information_schema.columns where table_name='customer_sessions' and column_name='purged_at';` — debe existir.

**Resultado esperado**: las sesiones de cliente se purgan y se marca `purged_at`.

`✅ ❌ ⏳`

### Q-13 · Limpieza del archivo .template.sql
**Severidad** Alta · **Sprint** 2

- 🌐 Comprueba que el `.template.sql` se ha movido a `Docs/historic/` o su contenido se ha reemplazado por un comentario (TODO verificar ubicación).

**Resultado esperado**: no hay SQL plantilla activo con datos sensibles.

`✅ ❌ ⏳`

### Q-14 · quote_requests con revoked_at + purged_at
**Severidad** Alta · **Sprint** 2

- 🗄️ `select column_name from information_schema.columns where table_name='quote_requests' and column_name in ('revoked_at','purged_at');` — ambas columnas presentes.

**Resultado esperado**: presupuestos sujetos a retención y revocación.

`✅ ❌ ⏳`

### Q-15 · Buckets declarados en migración con RLS is_admin()
**Severidad** Alta · **Sprint** 2

- 🗄️ `select id, public from storage.buckets;` — los buckets deben estar declarados (TODO verificar nombres) y sus políticas exigir `is_admin()`.

**Resultado esperado**: buckets versionados en migración y protegidos.

`✅ ❌ ⏳`

### Q-17 · RAT con plazos de conservación diferenciados
**Severidad** Alta · **Sprint** 2

- 🌐 En `rat-2026.md`, verifica plazos diferenciados: LGT 4 años, art. 70 RDL 1/2007 5 años, Ley 7/2012 10 años para importes >25.000 €.

**Resultado esperado**: plazos de conservación correctos y diferenciados.

`✅ ❌ ⏳`

### Q-19 · Cláusula PITR en procedimiento de supresión
**Severidad** Alta · **Sprint** 2

- 🌐 En `procedimiento-supresion.md` debe figurar una cláusula sobre los backups Point-In-Time Recovery (ventana de retención y su efecto en la supresión).

**Resultado esperado**: el procedimiento de supresión contempla PITR.

`✅ ❌ ⏳`

### X-02 · Botón "Reportar contenido" en reseñas + procedimiento DSA
**Severidad** Alta · **Sprint** 2

- 🌐 Junto a las reseñas en la home debe haber un botón "Reportar contenido".
- 🌐 Confirma que existe `Docs/legal/procedimiento-dsa-notice-action.md`.

**Resultado esperado**: mecanismo notice-and-action accesible y documentado.

`✅ ❌ ⏳`

### X-03 · Documento de preparación Crea y Crece
**Severidad** Alta · **Sprint** 2

- 🌐 Comprueba que existe `Docs/legal/preparacion-crea-y-crece.md` con roadmap Facturae.

**Resultado esperado**: roadmap de factura electrónica B2B documentado.

`✅ ❌ ⏳`

### X-04 · Marcado CE y normas de seguridad en producto
**Severidad** Alta · **Sprint** 2

- 🗄️ `select column_name from information_schema.columns where table_name='products' and column_name in ('ce_marking','safety_standards','manufacturer_eu');` — presentes.
- 🌐 En la ficha de producto, deben renderizarse estos datos.

**Resultado esperado**: información de seguridad CE visible en producto.

`✅ ❌ ⏳`

### X-05 · Alta Ecoembes + número de adherido
**Severidad** Alta · **Sprint** 2

- 🌐 En el footer y en la factura debe figurar el número de adherido SCRAP/Ecoembes (TODO verificar número real del titular).

**Resultado esperado**: número de adherido visible.

`✅ ❌ ⏳`

### X-11 · Leyenda de no-moderación en reseñas
**Severidad** Alta · **Sprint** 2

- 🌐 En la home, junto a las reseñas, debe leerse "Reseñas reales publicadas en Google Maps. DC Bikes no las modera."

**Resultado esperado**: leyenda de no-moderación visible.

`✅ ❌ ⏳`

### X-12 · Anonimización de quote_requests.message tras 1 año
**Severidad** Alta · **Sprint** 2

- 🗄️ Verifica que existe el trigger/función que anonimiza `quote_requests.message` cuando supera 1 año (TODO verificar nombre del trigger).

**Resultado esperado**: mensajes antiguos anonimizados automáticamente.

`✅ ❌ ⏳`

### X-16 · Protocolo de requerimientos de autoridades
**Severidad** Alta · **Sprint** 2

- 🌐 Comprueba que existe `Docs/legal/protocolo-requerimientos-autoridades.md`.

**Resultado esperado**: protocolo documentado.

`✅ ❌ ⏳`

### X-17 · OTP de 6 dígitos antes de Redsys (opcional)
**Severidad** Alta · **Sprint** 2

- 🌐 Si el titular activó el OTP, en checkout debe pedirse un código de 6 dígitos enviado por email antes de Redsys (decisión del titular; TODO verificar si se activó).

**Resultado esperado**: OTP funcional si está activado, o decisión documentada de no activarlo.

`✅ ❌ ⏳`

### X-22 · Documento de análisis DPIA
**Severidad** Alta · **Sprint** 2

- 🌐 Comprueba que existe `Docs/legal/analisis-dpia.md` (aunque la conclusión sea "no procede").

**Resultado esperado**: análisis DPIA documentado y motivado.

`✅ ❌ ⏳`

### X-25 · Documento de sucesión/cierre de empresa
**Severidad** Alta · **Sprint** 2

- 🌐 Comprueba que existe `Docs/legal/sucesion-empresa-cierre.md`.

**Resultado esperado**: plan de sucesión/cierre documentado.

`✅ ❌ ⏳`

---

## Sprint 3 — Medios y bajos

### F-18 · aria-describedby en botón "Cargar mapa"
**Severidad** Media · **Sprint** 3

- ⚙️ En DevTools → Elements, el botón "Cargar mapa" debe tener `aria-describedby` apuntando a un texto explicativo.

**Resultado esperado**: el botón es descriptivo para lectores de pantalla.

`✅ ❌ ⏳`

### F-19 · Inventario de cookies de Maps actualizado
**Severidad** Media · **Sprint** 3

- ⚙️ Carga el mapa y en DevTools → Application → Cookies compara las cookies reales con las declaradas en la política de cookies.

**Resultado esperado**: el inventario coincide con las cookies reales.

`✅ ❌ ⏳`

### F-20 · JSON-LD Product/Offer en ficha de producto
**Severidad** Media · **Sprint** 3

- ⚙️ En el HTML de la ficha de producto debe existir un bloque `<script type="application/ld+json">` con `Product` y `Offer` (verificable con el Rich Results Test de Google — TODO verificar).

**Resultado esperado**: datos estructurados presentes.

`✅ ❌ ⏳`

### F-21 · RETURNS_VERSION en Returns
**Severidad** Media · **Sprint** 3

- 🌐 El pie de la página de Devoluciones debe mostrar `RETURNS_VERSION` (2026-05-27-v5).

**Resultado esperado**: versión de devoluciones visible y correcta.

`✅ ❌ ⏳`

### F-22 · LIA de reseñas de Google documentado
**Severidad** Media · **Sprint** 3

- 🌐 Comprueba que existe `Docs/legal/lia-google-reviews.md` con el test de 3 pasos y conclusión "PREVALECE".

**Resultado esperado**: LIA documentado.

`✅ ❌ ⏳`

### F-23 · Licencias de fuentes documentadas
**Severidad** Media · **Sprint** 3

- 🌐 Comprueba que existe `Docs/legal/licencias-fuentes.md` con Bebas Neue y Barlow bajo SIL OFL 1.1.

**Resultado esperado**: licencias de fuentes documentadas.

`✅ ❌ ⏳`

### F-24 · prefers-reduced-motion en splash + botón "Saltar"
**Severidad** Media · **Sprint** 3

- 🌐 Con "reducir movimiento" activado, el splash no debe animarse; debe existir un botón "Saltar".

**Resultado esperado**: splash accesible.

`✅ ❌ ⏳`

### F-25 · aria-required en Field
**Severidad** Media · **Sprint** 3

- ⚙️ En DevTools, los campos obligatorios deben tener `aria-required="true"`.

**Resultado esperado**: campos requeridos anunciados a lectores de pantalla.

`✅ ❌ ⏳`

### F-26 · Fecha "última revisión legal" en Footer
**Severidad** Media · **Sprint** 3

- 🌐 El Footer debe mostrar la fecha de última revisión legal.

**Resultado esperado**: fecha de revisión visible.

`✅ ❌ ⏳`

### F-27 · aria-hidden en iconos lucide (grupo 1)
**Severidad** Baja · **Sprint** 3

- ⚙️ Los iconos decorativos lucide deben tener `aria-hidden="true"` (revisar en DevTools una muestra representativa).

**Resultado esperado**: iconos decorativos ocultos a lectores de pantalla.

`✅ ❌ ⏳`

### F-28 · aria-hidden en iconos lucide (grupo 2)
**Severidad** Baja · **Sprint** 3

- ⚙️ Continúa la revisión de F-27 en el resto de vistas (cabecera, fichas, panel admin).

**Resultado esperado**: cobertura completa de iconos decorativos.

`✅ ❌ ⏳`

### F-29 · aria-hidden en emojis decorativos
**Severidad** Baja · **Sprint** 3

- ⚙️ Los emojis decorativos deben ir envueltos con `aria-hidden="true"`.

**Resultado esperado**: emojis no leídos por lectores de pantalla.

`✅ ❌ ⏳`

### F-30 · Emoji 📊 sustituido por SVG en CookieBanner
**Severidad** Baja · **Sprint** 3

- 🌐 En el banner de cookies, el icono de analítica debe ser un SVG, no el emoji 📊.

**Resultado esperado**: icono SVG en lugar de emoji.

`✅ ❌ ⏳`

### B-19 · generate-order-contract vía invoke interno
**Severidad** Media · **Sprint** 3

- ⚙️ Verifica que la generación de contrato usa `supabase.functions.invoke('generate-order-contract')` y no un `fetch` externo (revisión de logs/Network).

**Resultado esperado**: invocación interna, sin salto externo.

`✅ ❌ ⏳`

### B-20 · Log de order_id truncado en mock
**Severidad** Media · **Sprint** 3

- ⚙️ En logs, el `order_id` del mock debe aparecer truncado a 8 caracteres.

**Resultado esperado**: identificadores truncados en logs.

`✅ ❌ ⏳`

### B-21 · Restitución de stock atómica
**Severidad** Media · **Sprint** 3

- 🗄️ Cancela un pedido y verifica que el stock se incrementa de forma atómica (`update products set stock = stock + p_qty`).

**Resultado esperado**: el stock se restituye correctamente.

`✅ ❌ ⏳`

### B-22 · Gate verifactu_mode en order-place
**Severidad** Media · **Sprint** 3

- 🗄️ `select value from settings where key='verifactu_mode';` y verifica que `order-place` respeta el modo (TODO verificar comportamiento esperado por modo).

**Resultado esperado**: el flujo respeta el modo Verifactu configurado.

`✅ ❌ ⏳`

### B-23 · Retención extendida a campos PII en historial
**Severidad** Media · **Sprint** 3

- 🗄️ Verifica que el `data-retention-cron` también anonimiza `order_status_history.reason` y `order_items.product_name` (TODO verificar lógica).

**Resultado esperado**: PII residual en historial también se purga.

`✅ ❌ ⏳`

### B-24 · No persistir direcciones en claro en reason
**Severidad** Media · **Sprint** 3

- 🗄️ `select reason from order_status_history order by created_at desc limit 20;` — no deben aparecer direcciones en claro.

**Resultado esperado**: el diff de cambios no expone direcciones.

`✅ ❌ ⏳`

### B-25 · JSON.parse anti-prototype-pollution + límite 64 KB
**Severidad** Media · **Sprint** 3

- ⚙️ Envía a settings un JSON con clave `__proto__` y otro de >64 KB: ambos deben rechazarse.

**Resultado esperado**: parser endurecido y con límite de tamaño.

`✅ ❌ ⏳`

### B-26 · upsert:false + nombre versionado en contrato
**Severidad** Media · **Sprint** 3

- ⚙️ Genera el contrato dos veces: no debe sobrescribir el anterior; el nombre debe incluir versión.

**Resultado esperado**: contratos no se sobreescriben.

`✅ ❌ ⏳`

### B-27 · content-length cap en endpoints públicos
**Severidad** Media · **Sprint** 3

- ⚙️ Envía un cuerpo muy grande a `order-place`, `quote-submit` y `customer-magic-link-request`: deben rechazarse por exceder el límite.

**Resultado esperado**: cuerpos sobredimensionados se rechazan.

`✅ ❌ ⏳`

### B-28 · advisory lock en cadena de hash de invoices
**Severidad** Media · **Sprint** 3

- 🗄️ La generación del hash de factura debe usar `pg_advisory_xact_lock(hashtext('invoices_chain'))` (verificar definición de la función).

**Resultado esperado**: la cadena de hash es consistente bajo concurrencia.

`✅ ❌ ⏳`

### B-29 · Errores 500 sin filtrar detalle al cliente
**Severidad** Baja · **Sprint** 3

- ⚙️ Provoca un error interno: la respuesta al cliente debe ser genérica ("internal error"); el detalle solo en `console.error`.

**Resultado esperado**: no se filtra el detalle del error.

`✅ ❌ ⏳`

### B-30 · getSiteUrl() lanza error si falta config
**Severidad** Baja · **Sprint** 3

- ⚙️ Con la URL del sitio sin configurar (entorno de prueba), la función debe lanzar error explícito en lugar de usar un valor por defecto silencioso.

**Resultado esperado**: fallo explícito si falta la URL.

`✅ ❌ ⏳`

### B-31 · content-length cap en google-avatar-proxy
**Severidad** Baja · **Sprint** 3

- ⚙️ Solicita al proxy un recurso sobredimensionado: debe rechazarse.

**Resultado esperado**: el proxy limita el tamaño.

`✅ ❌ ⏳`

### B-32 · escapeHtml en cantidad por defensa
**Severidad** Baja · **Sprint** 3

- ⚙️ Verifica que la cantidad de línea se escapa con `escapeHtml(String(it.quantity))` en los emails (defensa en profundidad).

**Resultado esperado**: cantidad escapada.

`✅ ❌ ⏳`

### B-33 · CORS en respuesta 403 de redsys-notification
**Severidad** Baja · **Sprint** 3

- ⚙️ Provoca un 403 en `redsys-notification`: la respuesta debe incluir `buildCorsHeaders(req)`.

**Resultado esperado**: la respuesta 403 lleva cabeceras CORS.

`✅ ❌ ⏳`

### B-34 · Validación fuerte de email en parseEmailCsv
**Severidad** Baja · **Sprint** 3

- ⚙️ Pasa un CSV con un email mal formado: debe rechazarse.

**Resultado esperado**: emails inválidos descartados.

`✅ ❌ ⏳`

### Q-20 · consent_audit como tabla separada
**Severidad** Media · **Sprint** 3

- 🗄️ Confirma que `consent_audit` es una tabla independiente (no columnas en `orders`): `select to_regclass('public.consent_audit');`.

**Resultado esperado**: tabla de consentimientos separada.

`✅ ❌ ⏳`

### Q-21 · set_updated_at con search_path seguro
**Severidad** Media · **Sprint** 3

- 🗄️ `select pg_get_functiondef('set_updated_at()'::regprocedure);` — debe incluir `security invoker set search_path = public, pg_temp`.

**Resultado esperado**: trigger con search_path fijado.

`✅ ❌ ⏳`

### Q-22 · Campos de escalado en data_breaches
**Severidad** Media · **Sprint** 3

- 🗄️ `select column_name from information_schema.columns where table_name='data_breaches' and column_name in ('internally_escalated_at','legal_counsel_contacted_at');` — presentes.

**Resultado esperado**: campos de trazabilidad de escalado presentes.

`✅ ❌ ⏳`

### Q-23 · Procedimiento de recovery de admin_users
**Severidad** Media · **Sprint** 3

- 🌐 Verifica que está documentado el procedimiento para recuperar acceso si `admin_users` queda vacío vía service_role (TODO verificar documento).

**Resultado esperado**: recovery documentado.

`✅ ❌ ⏳`

### Q-24 · revoke all + grant execute en SECURITY DEFINER
**Severidad** Media · **Sprint** 3

- 🗄️ Para cada función SECURITY DEFINER, verifica que tiene `revoke all` + `grant execute` explícito (revisar privilegios con `\df+` o consulta a `information_schema.routine_privileges`).

**Resultado esperado**: privilegios mínimos explícitos.

`✅ ❌ ⏳`

### Q-25 · changed_by y change_reason en product_price_history
**Severidad** Media · **Sprint** 3

- 🗄️ `select column_name from information_schema.columns where table_name='product_price_history' and column_name in ('changed_by','change_reason');` — presentes.

**Resultado esperado**: trazabilidad de cambios de precio.

`✅ ❌ ⏳`

### Q-26 · 11 documentos legales faltantes creados
**Severidad** Media · **Sprint** 3

- 🌐 Verifica la presencia de los documentos legales faltantes (DPIA, política de conservación, sub-encargados, registro de DPAs, TIAs, etc.) en `Docs/legal/` (TODO verificar lista completa de los 11).

**Resultado esperado**: documentación legal completa.

`✅ ❌ ⏳`

### Q-27 · Mención AEPD + plazos en plantilla de supresión
**Severidad** Media · **Sprint** 3

- 🌐 En `procedimiento-supresion.md` / plantilla, debe mencionarse el derecho ante la AEPD y los plazos.

**Resultado esperado**: plantilla con mención a la AEPD.

`✅ ❌ ⏳`

### Q-28 · CHECK constraint en quote_requests.status
**Severidad** Media · **Sprint** 3

- 🗄️ Intenta `update quote_requests set status='valor_invalido' where id='TODO';` — debe rechazarse por el CHECK.

**Resultado esperado**: estados inválidos rechazados.

`✅ ❌ ⏳`

### Q-29 · CHECK regexp en emails
**Severidad** Baja · **Sprint** 3

- 🗄️ Inserta un email con formato inválido en `orders.customer_email` o `quote_requests.email`: debe rechazarse por el CHECK regexp.

**Resultado esperado**: formato de email validado en BD.

`✅ ❌ ⏳`

### Q-30 · Migración no-op 0026 eliminada
**Severidad** Baja · **Sprint** 3

- 🌐 Comprueba que la migración 0026 no-op ha sido eliminada del directorio `supabase/migrations/`.

**Resultado esperado**: no queda la migración vacía.

`✅ ❌ ⏳`

### Q-31 · Cabecera de migración 0027 corregida
**Severidad** Baja · **Sprint** 3

- 🌐 Abre la migración 0027 y comprueba que su cabecera/comentario es correcto.

**Resultado esperado**: cabecera corregida.

`✅ ❌ ⏳`

### X-06 · tax_rate_pct por línea
**Severidad** Media · **Sprint** 3

- 🗄️ Verifica que existe `tax_rate_pct` por línea de pedido y que el catálogo está categorizado fiscalmente (TODO verificar con asesoría).

**Resultado esperado**: IVA por línea implementado.

`✅ ❌ ⏳`

### X-07 · Validación país=ES y CP no canario en checkout
**Severidad** Media · **Sprint** 3

- 🌐 En `/checkout`, intenta un CP canario (35xxx/38xxx) o país distinto de ES: debe rechazarse según el schema.

**Resultado esperado**: solo destinos peninsulares ES válidos (según schema actual).

`✅ ❌ ⏳`

### X-08 · validate-vat con VIES + B2B solo NIF español
**Severidad** Media · **Sprint** 3

- ⚙️ Invoca `validate-vat` con un NIF español válido (200) y uno inválido (rechazo); B2B debe restringirse a NIF español (TODO verificar comportamiento).

**Resultado esperado**: validación VIES operativa.

`✅ ❌ ⏳`

### X-09 · Cláusula 12 "idioma español único" en Términos
**Severidad** Media · **Sprint** 3

- 🌐 En Términos de Venta, debe existir la cláusula 12 sobre idioma español como único válido del contrato.

**Resultado esperado**: cláusula de idioma presente.

`✅ ❌ ⏳`

### X-13 · Precio mínimo 30 días en ficha de producto
**Severidad** Media · **Sprint** 3

- 🌐 En la ficha de un producto con descuento, debe mostrarse el precio mínimo de los últimos 30 días (Omnibus).

**Resultado esperado**: precio mínimo 30d visible en descuentos.

`✅ ❌ ⏳`

### X-14 · Tooltip "Al hacer click sales del sitio" en redes
**Severidad** Media · **Sprint** 3

- 🌐 Pasa el cursor por los iconos de redes sociales del footer: debe mostrarse el aviso de salida del sitio.

**Resultado esperado**: aviso de enlace externo.

`✅ ❌ ⏳`

### X-15 · Eliminada la mención a Bizum en Términos
**Severidad** Media · **Sprint** 3

- 🌐 En Términos de Venta, no debe haber mención a Bizum como medio de pago.

**Resultado esperado**: sin referencia a Bizum.

`✅ ❌ ⏳`

### X-18 · Turnstile en MyOrdersRequestAccess
**Severidad** Media · **Sprint** 3

- 🌐 La página de solicitud de acceso a pedidos debe incluir el widget Turnstile.

**Resultado esperado**: captcha presente en la solicitud de acceso.

`✅ ❌ ⏳`

### X-19 · Documento de política de sub-encargados
**Severidad** Media · **Sprint** 3

- 🌐 Comprueba que existe `Docs/legal/politica-subencargados.md` (cubierto por el bloque Q-26). Debe enumerar los sub-encargados de cada encargado y la base de transferencia.

**Resultado esperado**: política de sub-encargados documentada.

`✅ ❌ ⏳`

### X-23 · PrivacyPolicy describe consent_audit
**Severidad** Media · **Sprint** 3

- 🌐 En Política de Privacidad debe describirse el registro de consentimientos (`consent_audit`): qué se guarda y por qué.

**Resultado esperado**: privacidad describe la auditoría de consentimientos.

`✅ ❌ ⏳`

### X-24 · aria-label en SVG de redes del footer
**Severidad** Baja · **Sprint** 3

- ⚙️ En DevTools, los SVG de Instagram/Facebook del footer deben tener `aria-label="Instagram"` / `aria-label="Facebook"`.

**Resultado esperado**: enlaces de redes etiquetados.

`✅ ❌ ⏳`

### X-26 · Matriz "anonimizar vs conservar" en supresión
**Severidad** Baja · **Sprint** 3

- 🌐 En `procedimiento-supresion.md` debe figurar una matriz de qué anonimizar y qué conservar.

**Resultado esperado**: matriz presente.

`✅ ❌ ⏳`

### X-27 · Condiciones de servicios de taller en Workshop
**Severidad** Baja · **Sprint** 3

- 🌐 En la página de Taller deben constar condiciones específicas de los servicios de taller.

**Resultado esperado**: condiciones de taller documentadas.

`✅ ❌ ⏳`

---

## Resumen de cobertura

| Sprint | Hallazgos cubiertos | Nº de casos |
|--------|---------------------|-------------|
| Sprint 0 — Emergencia | Q-01..Q-09, Q-16, Q-18, B-01..B-04, F-03..F-05, X-20, X-21 | 20 |
| Sprint 1 — Críticos restantes | B-05..B-08, Q-04, Q-05, F-01, F-02, F-06, X-01, X-10 | 12 |
| Sprint 2 — Altos | F-07..F-17, B-09..B-18, Q-10..Q-15, Q-17, Q-19, X-02..X-05, X-11, X-12, X-16, X-17, X-22, X-25 | 43 |
| Sprint 3 — Medios y bajos | F-18..F-30, B-19..B-34, Q-20..Q-31, X-06..X-09, X-13..X-15, X-18, X-19, X-23, X-24, X-26, X-27 | 49 |
| **TOTAL** | **122 hallazgos V5** | **122** |

> Nota: algunos hallazgos (Q-04, Q-05) tienen una verificación temprana en Sprint 0 y la completa en Sprint 1; se cuentan una sola vez en el sprint donde se implementan por completo. Los marcadores `TODO verificar` señalan datos del entorno (URLs de proyecto, nombres exactos de funciones/tablas, números de adherido) que deben confirmarse contra el entorno real antes de dar el caso por cerrado.

---

**Versión 2026-05-27 V5 · 122 casos de prueba manuales · ejecutables por el titular sin abrir código**
