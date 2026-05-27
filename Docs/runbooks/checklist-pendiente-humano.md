# Checklist pendiente — solo acciones humanas (auditoría V3)

> **Lo automatizable ya está verificado.** Este documento solo lista lo que necesita navegador, panel Supabase, panel Vercel, decisiones de negocio, o validación con el titular. El plan completo de pruebas con verificaciones automáticas está en `testing-plan-auditoria-v3.md`.

Estado de la última verificación automática: **2026-05-27** · todos los archivos, grep checks, typecheck y migraciones ✅.

---

## 🚨 BLOQUEANTE — completar ANTES del próximo deploy de Edge Functions

### 1. Env var `ORDER_TOKEN_SECRET`

`Supabase Dashboard → Project Settings → Edge Functions → Secrets`

- [ ] Crear/verificar `ORDER_TOKEN_SECRET` con valor ≥32 chars aleatorios.
  ```bash
  openssl rand -hex 32   # generar localmente, copiar al panel
  ```

**Sin esto, `_shared/order-token.ts` lanza error al import → caen TODAS las funciones que generan/verifican tokens (magic link, customer access, pedidos).**

### 2. Env vars cron (deben coincidir con Vault)

- [ ] `ORDER_CRON_SECRET` en Edge Functions Secrets (mismo valor que `vault.create_secret`)
- [ ] `DATA_RETENTION_CRON_SECRET` en Edge Functions Secrets

---

## 🔧 Setup Supabase (panel) — antes de aceptar pedidos en prod

### 3. Settings legales (`/admin/configuracion → Facturación`)

Hasta que estos NO estén rellenos, `order-place` devuelve **503** a todo pedido (gate L-02 activo, intencional).

- [ ] `legal_company_name` — razón social o nombre autónomo
- [ ] `legal_company_cif` — NIF/CIF
- [ ] `legal_company_address` — dirección postal completa
- [ ] `legal_forma_juridica` — "Empresario individual" o "Sociedad Limitada"
- [ ] `legal_inscripcion` — "No aplica (art. 19 CCom)" o "Inscrita en RM Santander, Tomo X Folio Y Hoja Z"
- [ ] `store_contact_email` — confirmar `info@dcbikescantabria.es` o ajustar
- [ ] `dpo_contact_email` — para alertas de error fatal Redsys (S-12). Si no se rellena, alerta se omite silenciosamente.

### 4. Setting Verifactu (`/admin/configuracion`)

Hasta que NO se decida, `generate-invoice-pdf` devuelve **503** a toda factura.

- [ ] `verifactu_mode` = `"verifactu"` **(recomendado microempresa)** o `"no_verifactu"`
  - `verifactu`: QR + leyenda VERI*FACTU en PDF, marca `aeat_status='pending_send'` (envío real-time queda TODO fase 2).
  - `no_verifactu`: solo hash + previous_hash local, sin QR.

### 5. Vault secrets (SQL Studio)

```sql
select vault.create_secret('<tu_service_role_key>', 'service_role_key');
select vault.create_secret('<tu_project_ref>',      'supabase_project_ref');
select vault.create_secret('<random_hex_64>',       'order_cron_secret');
select vault.create_secret('<random_hex_64>',       'data_retention_cron_secret');

-- verificar:
select name from vault.secrets order by name;
```

- [ ] 4 secretos creados.

### 6. Buckets Storage

`Supabase Dashboard → Storage`

- [ ] Bucket `order-contracts` (privado, 5 MB, MIME `application/pdf`)
- [ ] Bucket `legal-templates` (privado, 2 MB, MIME `application/pdf`)
- [ ] Subir `public/devoluciones-formulario.pdf` → `legal-templates/devoluciones-formulario.pdf`
  > El PDF está regenerado con el dominio correcto (`info@dcbikescantabria.es`).

### 7. Aplicar migraciones

```bash
cd dc-bikes-web
supabase db push   # aplica 0020 → 0027 en orden
```

Ventana recomendada: baja actividad (0024 hace drop+recreate de policies = ventana de segundos).

- [ ] Migraciones aplicadas. Verificar:
  ```sql
  select version from supabase_migrations.schema_migrations where version >= '0020' order by version;
  -- Esperado: 0020-0027 (8 filas)
  ```

---

## 🌐 Tests visuales en navegador (preview o producción)

> Lo único que requiere ojos humanos. Hacer en **incógnito** para no contaminar consent previo.

### 8. Privacidad

- [ ] `/` — avatares Google cargan, **DevTools → Network**: 0 requests a `lh*.googleusercontent.com` (todos pasan por proxy).
- [ ] `/contacto` — pulsar "Cargar mapa", recargar (F5), mapa sigue cargando → consent persiste (P-02).
- [ ] Banner cookies muestra literal nuevo: "Cookies técnicas y mapa opcional", menciona Cloudflare Turnstile, NO menciona marketing (P-06).
- [ ] Banner expandido: **NO existe** toggle "Cookies de marketing" (P-05).
- [ ] Usuario con consent guardado de antes ve el banner **reaparecer** al primer acceso post-deploy (P-12 versionado).

### 9. Identificación prestador

**Con settings vacíos:**
- [ ] Footer NO muestra bloque legal (no inventa NIF).
- [ ] `/aviso-legal` muestra `[Pendiente]` en rojo en forma jurídica e inscripción.
- [ ] `/privacidad` "Responsable" muestra `[Pendiente]` en rojo.

**Tras rellenar settings (paso 3):**
- [ ] Mismos sitios muestran valores reales.

### 10. Banner anti-fraude

- [ ] `/contacto` formulario presupuesto (QuoteModal) muestra texto "Verificación anti-fraude vía Cloudflare Turnstile" con link a `/cookies` (P-04).

### 11. Producto y precio

- [ ] Ficha producto cualquiera: muestra "IVA incluido · Plazo de entrega 2-5 días laborables (Península)" bajo el precio (L-06).
- [ ] Producto con descuento: muestra 3 líneas — precio actual, precio anterior (mínimo 30d), % descuento (C-04).

### 12. Checkout >400€

- [ ] Añadir producto >400€ al carrito → checkout: campo NIF/DNI marcado como **obligatorio** con asterisco rojo y texto explicativo (C-09).
- [ ] Intentar enviar sin DNI → bloqueado en cliente (toast/error).

### 13. Flujo E2E completo

**Requiere settings + buckets + Verifactu configurados.**

1. [ ] Hacer un pedido test (Redsys sandbox o pago real test).
2. [ ] Email confirmación recibido con **3 adjuntos**: factura.pdf + contrato-pedido-XXX.pdf + formulario-desistimiento.pdf.
3. [ ] Abrir contrato PDF: ve datos vendedor, comprador, productos, cláusulas legales, versión TERMS_VERSION.
4. [ ] Llegar a `/pedido-confirmado` con detalle archivable + botón "Imprimir PDF" (L-07).
5. [ ] Si `verifactu_mode='verifactu'`: factura PDF tiene QR + leyenda VERI*FACTU.
6. [ ] Admin acepta pedido → email "Pedido aceptado" tiene CTA "Ver mis pedidos" (NO signed URL directo, S-05).
7. [ ] Verificar BD: `select hash, previous_hash from invoices order by issued_at desc limit 2;` — segunda fila tiene `previous_hash` = hash de la primera (C-01 hash chain).

### 14. Admin brechas

- [ ] Login como admin → `/admin/brechas` — tabla carga, formulario "Nueva brecha" funciona, edit funciona, **NO existe botón Eliminar** (S-07).
- [ ] Login como usuario normal → `/admin/brechas` redirige o muestra "no autorizado".

### 15. Magic link URL clean

- [ ] Solicitar magic link en `/mis-pedidos` → recibir email → click enlace.
- [ ] Tras cargar la página, URL en barra cambia de `?token=xxx` a `/mis-pedidos/sesion` sin params (S-08 fase 1).
- [ ] DevTools → Elements: `<meta name="referrer" content="no-referrer">` presente.

### 16. Smoke test CORS (terminal)

Sustituye `<tu>` por el ref real del proyecto Supabase:

```bash
# Origin malicioso → no eco
curl -i -H "Origin: https://evil.com" \
  https://<tu>.supabase.co/functions/v1/order-public-get 2>&1 | grep -i "access-control-allow-origin"
# Esperado: header ausente o no eco https://evil.com

# Origin legítimo → eco
curl -i -H "Origin: https://dcbikescantabria.es" \
  https://<tu>.supabase.co/functions/v1/order-public-get 2>&1 | grep -i "access-control-allow-origin"
# Esperado: Access-Control-Allow-Origin: https://dcbikescantabria.es
```

- [ ] Smoke test pasa.

### 17. Rate-limit IP magic link

```bash
for i in {1..25}; do
  curl -X POST https://<tu>.supabase.co/functions/v1/customer-magic-link-request \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test+$i@example.com\"}" -s -o /dev/null -w "%{http_code}\n"
done
```

- [ ] Primeros 20: 200. Request 21+: **429**.

---

## 📊 Monitoring post-deploy

### Primeras 24h

- [ ] `Vercel Dashboard → Logs` filtrado `[CSP-REPORT]` — registrar violaciones.
- [ ] `Supabase → Edge Functions → Logs` — error rate <1%, sin spikes.
- [ ] `select count(*) from orders where created_at > now() - interval '24 hours'` — actividad normal.
- [ ] `select last_run_status, count(*) from cron.job_run_details where start_time > now() - interval '24 hours' group by 1` — todos `succeeded`.

### Primera semana

- [ ] CSP report log limpio o catalogado.
- [ ] `select count(*) from data_breaches where status != 'closed'` = 0.
- [ ] Cron `purge-analytics-13m` ejecutándose diariamente (verificar `cron.job_run_details`).

---

## 🎯 Fase 2 — TODOs documentados (próximas iteraciones)

Cuando tengas margen, completar:

- [ ] **S-03 fase 2**: tras 7 días sin violaciones CSP críticas, cambiar `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (enforcing) en `vercel.json` línea 29.
- [ ] **S-08 fase 2**: Edge Function nueva `customer-session-exchange` que valida token y devuelve cookie HttpOnly Secure SameSite=Strict.
- [ ] **C-01 fase 2 (Verifactu activo)**: integración real-time con AEAT (SOAP/REST). Schema y código ya preparados — falta la integración con el endpoint AEAT.
- [ ] **C-01 fase 2 (firma)**: implementar firma XAdES sobre los datos firmados (RD 1007/2023 art. 8).
- [ ] **S-01 fase 2**: extender `_shared/email-utils.ts → buildCorsHeaders` con modo strict (allowlist más restrictiva) para endpoints admin (`order-accept`, `order-reject`, `order-delete`, etc.).
- [ ] **P-07 fase 2**: tras aceptar mapa en `/contacto` con navegador limpio, inventariar cookies depositadas en DevTools → Application → Cookies. Actualizar tabla en `src/pages/public/CookiePolicy.tsx`.
- [ ] **L-07 webhook**: configurar webhook Resend en Dashboard → Webhooks. Apuntar a Edge Function (a crear) que detecte bounce/spam y alerte por email a DPO. Ver `Docs/runbooks/resend-webhook-setup.md`.

---

## 🤔 Confirmaciones con titular

- [ ] **C-06 personalización**: la cláusula en `Returns.tsx` dice que las bicicletas a medida se venden en tienda presencial con presupuesto firmado. **Confirmar que esto refleja la realidad operativa del titular.** Si NO se ofrece ese servicio, ajustar/eliminar el texto.
- [ ] **Designar DPO**: nombre, email y teléfono. Documentar en `Docs/legal/procedimiento-brechas.md`.
- [ ] **Webhook Resend**: ¿el cliente quiere implementarlo en esta iteración o queda fase 2?

---

## 🔁 Tareas recurrentes (trimestral)

Ver `Docs/runbooks/legal-quarterly-review.md`:

- [ ] Q3 2026 (30 sep): revisión cookies, encargados, brechas, versionado.
- [ ] Q4 2026 (31 dic): idem.
- [ ] ...

---

## ✅ YA VERIFICADO AUTOMÁTICAMENTE (no requiere acción)

Para constancia, los siguientes hallazgos están confirmados estáticamente con grep / file checks / typecheck:

- **Existencia de archivos**: google-avatar-proxy, generate-order-contract, csp-report, Brechas.tsx, 8 migraciones nuevas (0020-0027), 2 templates renombradas (0005, 0012).
- **Patrones en código**: `setThirdPartyConsent`, `legalReady` gate, `verifactu_mode`, `maskEmail`/`maskIp`, `COOKIES_VERSION`, TTL 7d, `ORDER_TOKEN_SECRET` throw, Cloudflare en Privacy/Cookies/RAT, "art. 66 bis", "español", "IVA incluido", "30 kg".
- **vercel.json**: `Content-Security-Policy-Report-Only`, `Cross-Origin-Embedder-Policy: credentialless`, `Permissions-Policy` ampliada con payment/usb/serial/etc., 0 ocurrencias `'unsafe-inline'`.
- **CORS refactor**: 168 ocurrencias de `jsonOk/jsonError` con `req` propagado en 30 archivos (verificado con grep).
- **URL ODR correcta**: 0 ocurrencias de `ec.europa.eu/odr` sin `/consumers/` en código (src, supabase, scripts).
- **Email fallback correcto**: 0 ocurrencias de `info@dcbikes.es` en código activo (corregido en Returns.tsx + scripts/generate-returns-pdf.mjs + PDF regenerado).
- **TypeScript**: `tsc --noEmit` sin errores.
- **Git**: 20 commits, push a `origin/main` OK.

**Tiempo activo estimado pendiente del cliente: 1-2 h** (setup Supabase) + **1-2 h** (smoke tests navegador) = **3-4 h total** para cerrar la apertura comercial.
