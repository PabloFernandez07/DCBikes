# Plan de pruebas — Auditoría legal V3 (48 hallazgos)

> **Cómo usar este documento.** Pruébalo en este orden: PREFLIGHT → PREVIEW → PRODUCCIÓN → RECURRENTE. No pases a PRODUCCIÓN sin tener todos los ✅ de PREVIEW. Anota fecha, persona y resultado en cada checkbox.

---

## FASE 0 · PREFLIGHT (antes de cualquier deploy)

### 0.1 · Variables de entorno en Supabase

`Supabase Dashboard → Project Settings → Edge Functions → Secrets`:

- [ ] `ORDER_TOKEN_SECRET` definido (cualquier string aleatorio >32 chars). **CRÍTICO**: si falta, todas las funciones de tokens caen al primer request.
- [ ] `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` presentes (ya deberían estar).
- [ ] `RESEND_API_KEY` presente.

```bash
# Generar secret si necesario:
openssl rand -hex 32
```

### 0.2 · Vault secrets (S-02)

`Supabase Dashboard → SQL Editor`:

```sql
-- Solo si NO están creados:
select vault.create_secret('<tu_service_role_key>', 'service_role_key');
select vault.create_secret('<tu_project_ref>',      'supabase_project_ref');
select vault.create_secret('<random_hex_64>',       'order_cron_secret');
select vault.create_secret('<random_hex_64>',       'data_retention_cron_secret');

-- Verificar:
select name from vault.secrets order by name;
```

- [ ] 4 secretos creados en Vault
- [ ] Env vars `ORDER_CRON_SECRET` y `DATA_RETENTION_CRON_SECRET` en Edge Functions Secrets con los **mismos valores** que el Vault

### 0.3 · Storage buckets

`Supabase Dashboard → Storage → New bucket`:

- [ ] Bucket `order-contracts` (privado, 5 MB, MIME `application/pdf`)
- [ ] Bucket `legal-templates` (privado, 2 MB, MIME `application/pdf`)
- [ ] Subir manualmente `public/devoluciones-formulario.pdf` → `legal-templates/devoluciones-formulario.pdf`

Verificación SQL:
```sql
select id, name, public, file_size_limit
from storage.buckets
where id in ('order-contracts','legal-templates');
-- Esperado: 2 filas, public=false
```

### 0.4 · Aplicar migraciones

```bash
cd dc-bikes-web
supabase db push
```

- [ ] Migraciones 0020 → 0027 aplicadas sin errores
- [ ] Verificar:
  ```sql
  select version from supabase_migrations.schema_migrations
  where version >= '0020' order by version;
  -- Esperado: 0020, 0021, 0022, 0023, 0024, 0025, 0026, 0027
  ```

### 0.5 · Tests automáticos locales

```bash
cd dc-bikes-web
pnpm install
pnpm tsc --noEmit       # Sin errores
pnpm build              # Build limpio
```

- [ ] TypeScript sin errores
- [ ] Build sin warnings críticos

---

## FASE 1 · DEPLOY A PREVIEW

Push a una rama de preview (NO a main de producción). Vercel autodespliega.

- [ ] URL preview obtenida: `https://dc-bikes-web-git-<branch>.vercel.app`
- [ ] Edge Functions desplegadas: `supabase functions deploy --no-verify-jwt` para las nuevas (`google-avatar-proxy`, `generate-order-contract`)

---

## FASE 2 · TESTS FUNCIONALES (en PREVIEW)

### Bloque A · Privacidad

#### P-01 · Avatares Google sin tracking

1. Abre navegador en **incógnito** (sin extensiones).
2. Visita `<preview>/` (home).
3. Abre DevTools → Network → filtrar por `googleusercontent`.

- [ ] **0 requests** a `lh3.googleusercontent.com` (o cualquier `lh*`).
- [ ] Las imágenes de avatares cargan desde `/functions/v1/google-avatar-proxy?url=...`.
- [ ] Avatares visibles en las reseñas (UX no regresa).

#### P-02 · Consent persistente mapa

1. Incógnito → `/contacto`.
2. Banner cookies aparece (técnicas + mapa opcional).
3. Click "Cargar mapa".
4. Verifica que iframe Google Maps carga.
5. **Recarga la página (F5)**.
6. Mapa carga automáticamente sin volver a clicar.
7. DevTools → Application → Local Storage → `dcbikes_cookie_consent`:
   - [ ] `thirdParty: true`
   - [ ] `cookies_version` presente y == `COOKIES_VERSION` actual

#### P-03 · NIF en Footer + Privacy + LegalNotice

**Con settings vacíos (estado inicial):**

- [ ] Footer NO muestra bloque legal (NIF/dirección) — debe estar oculto, no inventado.
- [ ] `/aviso-legal` muestra `[Pendiente de cumplimentar por el titular]` en rojo en forma jurídica e inscripción.
- [ ] `/privacidad` "Responsable" muestra `[Pendiente]` en rojo.

**Con settings rellenos** (rellenar en `/admin/configuracion → Facturación` y volver):

- [ ] Footer muestra `legal_company_name`, NIF, dirección.
- [ ] `/aviso-legal` muestra valores reales sin rojo.
- [ ] `/privacidad` muestra valores reales.

#### P-04 · Cloudflare en RAT/Cookies/Privacy

- [ ] `/privacidad` §7 lista **Cloudflare, Inc. (EE.UU., DPF UE-EE.UU.)** como encargado.
- [ ] `/cookies` categoría A incluye filas `__cf_bm` y `cf_clearance` con proveedor Cloudflare.
- [ ] `Docs/legal/rat-2026.md` entrada 2.3 documenta Turnstile.
- [ ] `QuoteModal` (formulario de presupuesto) muestra texto "Verificación anti-fraude vía Cloudflare Turnstile" junto al widget.

#### P-05 · Toggle marketing eliminado

- [ ] Banner cookies (expandido): NO existe toggle "Cookies de marketing".
- [ ] Solo aparecen: Esenciales (siempre on), Analítica (off, futuro), Terceros funcionales (mapa).

#### P-06 · Banner literal real

- [ ] El texto del banner dice exactamente: *"Esta web usa cookies y almacenamiento técnicos imprescindibles... En la página de contacto cargamos opcionalmente el mapa de Google Maps si das tu consentimiento. No usamos cookies de marketing ni analítica de terceros."*
- [ ] **No menciona** "cookies de terceros" de forma genérica.

#### P-07 · Tabla Cookies actualizada

- [ ] `/cookies` no lista cookies obsoletas (NID antigua, 1P_JAR, etc. — depende de inventario).
- [ ] Incluye fila para `__cf_bm` y `cf_clearance`.
- [ ] **Pendiente fase 2**: tras aceptar mapa, inventariar cookies reales en DevTools y actualizar tabla.

#### P-08 · Token 30d justificado

- [ ] `/cookies` categoría A tiene texto explicando duración 30d de `dcbikes_last_order` con referencia art. 5.1.c RGPD.

#### P-09 · Cron purge analytics

- [ ] Verificar cron:
  ```sql
  select jobname, schedule from cron.job where jobname = 'purge-analytics-13m';
  -- Esperado: 1 fila, schedule = '30 3 * * *'
  ```
- [ ] **Tras 24h**, verificar ejecución:
  ```sql
  select jobname, last_run, last_run_status from cron.job
  left join cron.job_run_details using (jobid)
  where jobname = 'purge-analytics-13m' order by last_run desc limit 1;
  ```
- [ ] Si `product_views` o `search_queries` no existen, el cron emite `NOTICE` sin error.

#### P-10 · Drop fila marketing opt-in

- [ ] `/privacidad` tabla de tratamientos NO incluye fila "Comunicaciones comerciales (opt-in)".

#### P-11 · Versiones unificadas

- [ ] Cabecera/footer de `/cookies`, `/privacidad`, `/terminos`, `/aviso-legal` muestran misma fecha de versión (`2026-05-27-v1` o equivalente).

#### P-12 · Versionado consent (re-consent)

- [ ] **Test crítico**: usuario que tenía consent guardado de antes del deploy abre la web → banner **reaparece**. Su consent previo se invalidó porque `cookies_version` cambió.

### Bloque B · LSSI / Identificación

#### L-01 + L-03 · Identificación prestador

Ver P-03 arriba.

#### L-02 · Gate fiscal pedido

**Con settings vacíos**:

1. Añadir producto al carrito → checkout → enviar pedido.

- [ ] Respuesta **503** con mensaje *"Tienda no operativa temporalmente. Estamos completando la configuración fiscal."*
- [ ] UI muestra el mensaje al usuario (no error genérico).

**Con settings rellenos**: pedido procesa normalmente (test en P-03 sección "con settings rellenos").

#### L-04 · Email fallback correcto

- [ ] Buscar en `/terminos` cualquier mailto: → debe ser `info@dcbikescantabria.es` (NO `dcbikes.es`).
- [ ] Hacer pedido test → email recibido → footer/links muestran dominio `dcbikescantabria.es`.

#### L-05 + C-07 + C-08 · Contrato + form desistimiento adjuntos

**Requiere buckets configurados (0.3)** + **settings legales rellenos**.

1. Crear pedido test completo (checkout → pago Redsys sandbox o flujo normal).
2. Esperar email "Pedido recibido".

- [ ] Email tiene **3 adjuntos**: factura.pdf + contrato-pedido-XXX.pdf + formulario-desistimiento.pdf.
- [ ] Abrir `contrato-pedido-XXX.pdf`:
  - [ ] Datos del vendedor (legal_company_*).
  - [ ] Datos del comprador.
  - [ ] Productos y total.
  - [ ] Cláusulas legales (desistimiento 14d, garantía 3a, ODR, idioma).
  - [ ] Versión de términos visible (`TERMS_VERSION`).
- [ ] Verificar en Supabase Storage: bucket `order-contracts/{order_id}.pdf` existe.

#### L-06 · Info bajo precio

- [ ] Ficha de producto cualquiera: bajo el precio aparece *"IVA incluido · Plazo de entrega 2-5 días laborables (Península)"*.

#### L-07 · OrderConfirmation archivable

1. Tras pedido test, llegada a `/pedido-confirmado?order_id=...&token=...`.

- [ ] Muestra: nº pedido, fecha, lista productos, subtotal, envío, total, dirección envío.
- [ ] Sección "Información importante" con: desistimiento, garantía 3a, ODR link, idioma español.
- [ ] Botón "Guardar / Imprimir PDF" → al clicar abre diálogo de imprimir (CSS `@media print` aplicado).

#### L-08 · Idioma declarado

- [ ] `/terminos` cláusula 12: *"El contrato se celebra en español..."*

### Bloque C · Consumo / Facturación

#### C-01 · Verifactu

**Con `verifactu_mode = null` (estado inicial)**:

1. Intentar emitir factura.
- [ ] Respuesta **503** *"Modo Verifactu no configurado..."*.

**Con `verifactu_mode = 'verifactu'`**:

1. Rellenar setting en panel admin.
2. Emitir factura para pedido test.
- [ ] PDF tiene QR en esquina inferior derecha.
- [ ] PDF muestra leyenda "Factura verificable en sede.agenciatributaria.gob.es — VERI*FACTU".
- [ ] Tabla `invoices`: el registro tiene `hash` (64 chars hex), `previous_hash` (igual al hash de la factura anterior o NULL si es la primera), `qr_payload` (URL AEAT), `aeat_status='pending_send'`.
- [ ] **Segunda factura**: `previous_hash` == hash de la primera (encadenamiento verificable).

**Con `verifactu_mode = 'no_verifactu'`**:
- [ ] PDF sin QR ni leyenda Verifactu.
- [ ] BD: `hash` y `previous_hash` registrados (audit trail local), `aeat_status='not_applicable'`.

#### C-02 · Datos fiscales gate

Cubierto por L-02.

#### C-03 · Drop legacy invoice_number

```sql
select proname from pg_proc where proname = 'next_invoice_number';
-- Esperado: 0 filas (la función fue dropeada).

-- Verificar que next_b2c_invoice_number sigue funcionando:
select next_b2c_invoice_number(2026);
select next_b2c_invoice_number(2026);
-- Esperado: 2 llamadas devuelven N y N+1.
```

#### C-04 · Precio referencia 30d Omnibus

1. Aplicar descuento a un producto desde admin (cambia `retail_price` a uno menor).
2. Visitar ficha del producto.

- [ ] Se muestran 3 líneas:
  - Precio actual: X €
  - Precio anterior (mínimo últimos 30 días): Y €
  - Z% de descuento
- [ ] Verificar SQL:
  ```sql
  select * from product_price_history
  where product_id = '<uuid>'
  order by effective_from desc;
  -- Esperado: al menos 2 filas (backfill + cambio reciente)
  ```

#### C-05 · Plazos no abusivos

- [ ] `/terminos` sección envíos: texto *"Plazo máximo de entrega: 30 días naturales..."* con referencia art. 66 bis RDL 1/2007.

#### C-06 · Personalización Returns

- [ ] `/devoluciones` o `/returns`: cláusula sobre bicicletas a medida (art. 103.c).
- [ ] **CONFIRMAR con titular**: si la web NO vende bicis a medida online, este texto debe matizarse o eliminarse. Decisión del cliente.

#### C-07 · Formulario desistimiento adjunto

Cubierto por L-05.

#### C-09 · NIF >400€

1. Ir a checkout con un producto >400€.

- [ ] El campo NIF/DNI aparece con asterisco rojo (obligatorio).
- [ ] Texto explicativo: *"Obligatorio para operaciones superiores a 400 € (RD 1619/2012 art. 7.1)."*
- [ ] Intentar enviar sin DNI → bloqueado en cliente (toast/error).
- [ ] Si se bypasea el cliente y se llama directamente la Edge Function `generate-invoice-pdf` sin DNI → respuesta **400** *"Operación >400€ requiere NIF/DNI..."*.

2. Con DNI válido (8 dígitos + letra) → factura emite OK, PDF muestra NIF del receptor.

#### C-10 · URL ODR correcta

- [ ] `rtk grep -rn "ec.europa.eu/odr" .` debe devolver **0 resultados**.
- [ ] `rtk grep -rn "ec.europa.eu/consumers/odr/" .` debe devolver matches en `TermsOfSale.tsx`, emails confirmación, etc.
- [ ] Email confirmación pedido tiene link funcional a `https://ec.europa.eu/consumers/odr/`.

#### C-11 · Techo coste envío

- [ ] `/terminos` §6 incluye: *"hasta 30 kg y 120×80×60 cm... Sin sobrecostes adicionales no informados antes de la confirmación."*

#### C-12 · IVA multi-tipo en factura

**Estado actual** (items sin `tax_rate` propio): el bloque muestra IVA mono-tipo como antes. **Forward-compatible**: cuando algún `order_item` tenga `tax_rate` propio, aparecerá desglose multi-tipo automáticamente.

- [ ] Generar factura → bloque "Desglose IVA" muestra al menos 1 línea con tipo IVA correcto.

#### C-13 · Inscripción registral

Cubierto por L-03 + checklist admin.

### Bloque D · Seguridad

#### S-01 · CORS dinámico

```bash
# Desde terminal:
# 1. Origin no permitido → no eco
curl -i -H "Origin: https://evil.com" \
  https://<tu-proyecto>.supabase.co/functions/v1/order-public-get \
  | grep -i "access-control-allow-origin"
# Esperado: header ausente o no eco https://evil.com

# 2. Origin válido → eco
curl -i -H "Origin: https://dcbikescantabria.es" \
  https://<tu-proyecto>.supabase.co/functions/v1/order-public-get \
  | grep -i "access-control-allow-origin"
# Esperado: Access-Control-Allow-Origin: https://dcbikescantabria.es
```

- [ ] Test 1 sin eco al origen malicioso.
- [ ] Test 2 con eco al origen legítimo.
- [ ] Smoke test funcional: hacer una compra completa desde el frontend (la propia web). Si CORS estuviera roto, fallarían las llamadas → no se completaría.

#### S-02 · Cron secrets Vault

```sql
-- Verificar crons creados con la nueva versión:
select jobname, schedule, command from cron.job
where jobname in ('order-auto-cancel-job', 'data-retention-cron-job');

-- Tras 35 min, verificar ejecución:
select jobname, last_run, last_run_status, return_message
from cron.job left join cron.job_run_details using (jobid)
where jobname in ('order-auto-cancel-job', 'data-retention-cron-job')
order by last_run desc nulls last limit 5;
```

- [ ] `last_run` no nulo.
- [ ] `last_run_status = 'succeeded'`.

#### S-03 · CSP Report-Only

```bash
curl -sI https://<preview>/ | grep -i "content-security-policy"
# Esperado: Content-Security-Policy-Report-Only (NO Content-Security-Policy)
```

- [ ] Header es `Content-Security-Policy-Report-Only`.
- [ ] Valor NO contiene `'unsafe-inline'` en `script-src` ni `style-src`.
- [ ] `report-uri /api/csp-report;` presente.
- [ ] Navegar 5 min, hacer pedido, abrir DevTools → Console:
  - [ ] Pueden aparecer warnings CSP. **Registrarlos** en hoja aparte.
  - [ ] Tras 7 días sin warnings críticos: cambiar header a `Content-Security-Policy` enforcing (fase 2).

#### S-04 · Token 7d + secret obligatorio

```bash
# Confirmar env var:
supabase secrets list | grep ORDER_TOKEN_SECRET
# Esperado: la línea existe
```

- [ ] Tokens nuevos caducan a las 7 días (no 30).
- [ ] Tokens legacy (formato sin `.`) → rechazados → usuario solicita nuevo magic link.

#### S-05 · Signed URL fuera del email

1. Hacer pedido test, pago, recibir email `send-order-accepted-customer`.

- [ ] Email contiene CTA "Ver mis pedidos" → URL = `https://dcbikescantabria.es/mis-pedidos` (NO signed URL).
- [ ] **NO** aparece link tipo `https://...storage/v1/object/sign/...`.
- [ ] El adjunto PDF de factura se sigue recibiendo.

#### S-06 · RLS data_breaches

```sql
-- Como usuario normal autenticado (no admin):
select * from data_breaches;
-- Esperado: 0 filas o error.

-- Como admin:
select * from data_breaches;
-- Esperado: filas devueltas.

-- Verificar policies:
select polname, polcmd from pg_policy where polrelid = 'data_breaches'::regclass;
-- Esperado: solo policies data_breaches_admin_{select,insert,update}, todas con is_admin().
```

#### S-07 · UI admin/brechas

1. Login como admin → ir a `/admin/brechas`.

- [ ] Página carga con tabla (vacía si no hay brechas).
- [ ] Botón "Nueva brecha" abre modal con formulario.
- [ ] Crear brecha test: rellenar y guardar.
- [ ] Tabla muestra la nueva fila.
- [ ] Editar brecha test → actualiza.
- [ ] **NO existe botón "Eliminar"** (audit trail inmutable).

2. Login como usuario normal → ir a `/admin/brechas`.

- [ ] Redirige o muestra "No autorizado" (gate de admin funciona).

#### S-08 · Magic link URL clean

1. Solicitar magic link (`/mis-pedidos` → introducir email).
2. Abrir email → click en enlace.

- [ ] URL inicial: `/mis-pedidos/sesion?token=xxx`.
- [ ] **Tras carga**, la URL en la barra del navegador cambia a `/mis-pedidos/sesion` (sin `?token=`).
- [ ] `<meta name="referrer" content="no-referrer">` presente en el `<head>` (DevTools → Elements).

#### S-09 · Rate-limit IP

```bash
# Lanzar 25 requests rápidos desde misma IP:
for i in {1..25}; do
  curl -X POST https://<tu>.supabase.co/functions/v1/customer-magic-link-request \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test+$i@example.com\"}" -s -o /dev/null -w "%{http_code}\n"
done
```

- [ ] Primeros 20: 200.
- [ ] Request 21+: **429** ("Demasiadas solicitudes").
- [ ] Tras 1 hora, vuelve a permitir.

#### S-10 · PII en logs

`Supabase Dashboard → Edge Functions → Logs`:

- [ ] Buscar logs recientes → NO debe aparecer email completo (`user@example.com`).
- [ ] Esperado: `u***@example.com`.
- [ ] IPs: no completas (`192.168.1.x` en vez de `192.168.1.42`).

#### S-12 · Redsys alerta error fatal

**Test difícil de provocar (requiere forzar excepción en redsys-notification).** En su lugar:

- [ ] Inspección estática: leer `supabase/functions/redsys-notification/index.ts` → el catch fatal persiste en `payments_log` con `operation_type='notification'` y campo `warning='fatal_error'` en payload, además de intentar enviar email a `dpo_contact_email` o fallback.

#### S-13 · Permissions-Policy

```bash
curl -sI https://<preview>/ | grep -i "permissions-policy"
# Esperado: contiene payment=(self), usb=(), serial=(), gyroscope=(), accelerometer=(),
#           magnetometer=(), fullscreen=(self), autoplay=(self), camera=(), microphone=(),
#           geolocation=(), interest-cohort=()
```

- [ ] Header presente y completo.

#### S-14 · COEP credentialless

```bash
curl -sI https://<preview>/ | grep -i "cross-origin-embedder"
# Esperado: Cross-Origin-Embedder-Policy: credentialless
```

- [ ] Header presente.
- [ ] Iframes funcionan (verificar `/contacto` con mapa cargado, `QuoteModal` con Turnstile).

#### S-15 · UUIDs admin anonimizados

```bash
rtk grep -rn "Pablo\|María\|Juan" supabase/migrations/
# Esperado: 0 resultados con nombres reales
```

- [ ] `0013_admin_users.sql` comentarios sustituidos por iniciales o `(ver runbook)`.
- [ ] `Docs/runbooks/admin-users-seed.md` NO commiteado (en `.gitignore`).
- [ ] `Docs/runbooks/admin-users-seed.md.template` SÍ commiteado.

---

## FASE 3 · TESTS DE REGRESIÓN (golden path completo)

Hacer un pedido E2E completo en preview con settings rellenos y `verifactu_mode='verifactu'`:

1. [ ] Home carga, avatares Google visibles vía proxy.
2. [ ] Banner cookies aparece, click "Aceptar técnicas".
3. [ ] Navegar catálogo, ver ficha de producto con descuento — muestra precio anterior 30d.
4. [ ] Añadir al carrito.
5. [ ] Checkout — rellenar datos. Si total >400€ → NIF obligatorio.
6. [ ] Procesar pago (Redsys sandbox).
7. [ ] Llegar a `/pedido-confirmado` con detalle archivable.
8. [ ] Recibir email confirmación con 3 adjuntos.
9. [ ] Admin acepta pedido → email "Pedido aceptado" sin signed URL en body.
10. [ ] Generar factura → PDF con QR Verifactu + hash chain.
11. [ ] Visitar `/contacto`, aceptar mapa → consent persiste tras F5.
12. [ ] Solicitar magic link en `/mis-pedidos`, recibir email, abrir → URL se limpia tras consumir token.

---

## FASE 4 · DEPLOY A PRODUCCIÓN

Solo cuando TODOS los ✅ de FASE 2 + FASE 3 están marcados.

- [ ] Merge a `main` con todos los commits del plan (ya hecho).
- [ ] `git push origin main` (ya hecho).
- [ ] Vercel autodespliega producción.
- [ ] `supabase functions deploy` para nuevas (`google-avatar-proxy`, `generate-order-contract`).
- [ ] `supabase db push` para migraciones 0020-0027 (en ventana de baja actividad).
- [ ] Smoke test rápido en producción: home carga, hacer un pedido test, recibir email.

---

## FASE 5 · MONITORING POST-DEPLOY

### Primeras 24 horas

- [ ] `Vercel Dashboard → Logs` filtrado `[CSP-REPORT]` — recopilar violaciones.
- [ ] `Supabase Dashboard → Edge Functions → Logs` — error rate <1%.
- [ ] `select count(*) from orders where created_at > now() - interval '24 hours'` — actividad normal.
- [ ] `select last_run_status, count(*) from cron.job_run_details where start_time > now() - interval '24 hours' group by 1` — todos `succeeded`.

### Primeros 7 días

- [ ] CSP report log limpio → preparar fase 2 (enforcing).
- [ ] Brechas registradas en `/admin/brechas`: 0 (esperado).
- [ ] Magic link rate-limit: revisar `select count(*) from customer_sessions where created_at > now() - interval '7 days'` — patrones normales.

### Fase 2 — CSP enforcing

Tras 7 días sin violaciones críticas:

1. Editar `vercel.json`:
   ```diff
   - "key": "Content-Security-Policy-Report-Only",
   + "key": "Content-Security-Policy",
   ```
2. Deploy preview, smoke test cross-browser (Chrome, Firefox, Safari).
3. Deploy producción.

---

## FASE 6 · ACCIONES RECURRENTES

### Trimestrales (ver `Docs/runbooks/legal-quarterly-review.md`)

- [ ] Inventariar cookies vivas tras aceptar mapa Google (P-07 fase 2).
- [ ] Revisar `data_breaches` — todas closed.
- [ ] Revisar encargados de tratamiento en `PrivacyPolicy §7` vs servicios reales.
- [ ] Bumpear `*_VERSION` en `legal-versions.ts` si hubo cambios sustantivos → fuerza re-consent.

### Cuando sea aplicable

- [ ] **C-06**: confirmar con titular si la web vende bicis a medida online. Ajustar `Returns.tsx` si no.
- [ ] **C-01 fase 2**: implementar envío real-time AEAT cuando AEAT publique especificación final + firma XAdES.
- [ ] **S-01 fase 2**: extender `buildCorsHeaders` con modo strict para endpoints admin.
- [ ] **S-08 fase 2**: cookie HttpOnly Secure SameSite=Strict tras validar magic link (Edge Function nueva).
- [ ] **L-07**: configurar webhook Resend bounce/spam → alerta DPO.

---

## Resumen ejecutivo del plan

| Fase | Acciones | Estimación |
|---|---|---|
| 0 — Preflight | Vault + buckets + env vars + migraciones | 30 min |
| 1 — Deploy preview | Push branch, autodeploy Vercel | 10 min |
| 2 — Tests funcionales | 48 hallazgos individuales | 3-4 horas |
| 3 — Tests regresión | Golden path E2E | 30 min |
| 4 — Deploy prod | Merge + funcs + db push | 20 min |
| 5 — Monitoring | 7 días pasivo + chequeos puntuales | continuo |
| 6 — Recurrente | Trimestrales + fases 2 | continuo |

**Total tiempo activo de pruebas: ~5 horas.** Recomendado hacerlo en una sesión enfocada con asistencia del titular para rellenar settings reales y confirmar C-06.
