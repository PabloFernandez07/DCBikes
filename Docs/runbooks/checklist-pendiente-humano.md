# Checklist pendiente — versión final (solo lo que YO no puedo hacer)

> **Estado al 2026-05-27**: yo (Claude) he ejecutado automáticamente todo lo no humano:
> migraciones aplicadas, Vault + Edge Functions secrets configurados, buckets creados,
> PDF subido, 35 Edge Functions desplegadas con CORS preflight dinámico verificado por curl.
>
> Solo queda lo que requiere navegador, decisión de negocio, o panel manual.

---

## 🚨 CRÍTICO — completar antes de aceptar pedidos reales

### 1. Settings legales (panel admin `/admin/configuracion → Facturación`)

**El gate L-02 está activo**: `order-place` devuelve **503** a todo pedido hasta que estos settings estén rellenos. Es comportamiento intencional.

- [ ] `legal_company_name` — razón social o nombre completo del autónomo
- [ ] `legal_company_cif` — NIF/CIF real del titular
- [ ] `legal_company_address` — dirección postal completa
- [ ] `legal_forma_juridica` — "Empresario individual" o "Sociedad Limitada"
- [ ] `legal_inscripcion` — "No aplica (art. 19 CCom)" si autónomo / "RM Santander, Tomo X Folio Y Hoja Z" si SL

### 2. Setting Verifactu (decisión legal del titular)

`generate-invoice-pdf` devuelve **503** hasta que se elija modo:

- [ ] `verifactu_mode` = `"verifactu"` **(recomendado microempresa)** o `"no_verifactu"`

`"verifactu"`: AEAT recibe los datos en tiempo real, PDF lleva QR + leyenda VERI*FACTU. (Envío real-time queda como fase 2 — schema y código preparados pero la integración SOAP con AEAT no está hecha.)

`"no_verifactu"`: firma local + remisión a requerimiento.

### 3. Confirmación con titular (C-06)

- [ ] La cláusula en `/devoluciones` dice que las bicis a medida se venden en tienda presencial con presupuesto firmado. **Confirmar que esto refleja la realidad operativa.** Si NO se vende ese servicio, eliminar/ajustar el texto.

---

## ✅ YA EJECUTADO POR MÍ (puedes verificarlo en panel)

- ✅ **Migraciones 0020-0027 aplicadas** (8 nuevas): drop legacy invoice, cron Vault, price history Omnibus, Verifactu, RLS data_breaches, purge analytics, anonymize admins, IP rate-limit index.
- ✅ **Vault secrets creados** (4): `service_role_key`, `supabase_project_ref`, `order_cron_secret`, `data_retention_cron_secret`.
- ✅ **Edge Functions secrets** (3): `ORDER_TOKEN_SECRET`, `ORDER_CRON_SECRET`, `DATA_RETENTION_CRON_SECRET`.
- ✅ **Buckets Storage**: `order-contracts` (privado, 5 MB, PDF) + `legal-templates` (privado, 2 MB, PDF).
- ✅ **PDF subido**: `legal-templates/devoluciones-formulario.pdf` (regenerado con dominio correcto).
- ✅ **35 Edge Functions desplegadas** (incl. nuevas `google-avatar-proxy` y `generate-order-contract`).
- ✅ **CORS preflight dinámico verificado**: evil.com bloqueado, dcbikescantabria.es / vercel.app permitidos (verificado con curl).
- ✅ **Cron jobs activos**: 3 jobs (order-auto-cancel-job 30min, data-retention-cron-job 03:00, purge-analytics-13m 03:30).
- ✅ **Setting `dpo_contact_email`** = `pablofr070703@gmail.com` (tu admin email — ajustar si designas DPO distinto).

**Secretos generados están en `Docs/runbooks/secretos-generados-RECUPERAR.txt`** (gitignored, NO se commiteó). Cópialos a tu gestor de contraseñas y borra el archivo local.

---

## 🔐 Rotar tokens expuestos en esta sesión

Los siguientes tokens pasaron por la conversación y deben rotarse:

- [ ] **Supabase access token** (`sbp_...` en `.env.local`): revocar en https://supabase.com/dashboard/account/tokens y generar uno nuevo.
- [ ] **Vercel API token** (`vcp_...` en `.env.local`): revocar en https://vercel.com/account/tokens y generar uno nuevo.

(El `SERVICE_ROLE_KEY` y `ORDER_TOKEN_SECRET` están solo en Vault/Edge Functions secrets y en `secretos-generados-RECUPERAR.txt` local, no en la conversación — no necesitan rotarse salvo que sospeches filtración.)

---

## 🌐 Tests visuales que YO no puedo hacer (~30 min)

Tras rellenar settings legales + verifactu_mode + deploy Vercel:

### Privacidad
- [ ] `/` (incógnito): avatares Google cargan, DevTools → Network: 0 requests a `lh*.googleusercontent.com`.
- [ ] `/contacto`: click "Cargar mapa", recargar (F5), mapa persiste.
- [ ] Banner cookies: literal nuevo, sin toggle "marketing", menciona Cloudflare Turnstile.
- [ ] Usuario con consent guardado de antes → banner reaparece (P-12).

### Identificación
- [ ] Footer muestra NIF/dirección rellenos.
- [ ] `/aviso-legal` y `/privacidad` muestran datos reales (no `[Pendiente]`).

### Flujo E2E completo
- [ ] Pedido test → email con 3 adjuntos (factura + contrato + formulario desistimiento).
- [ ] Contrato PDF tiene datos vendedor/comprador, cláusulas, versión TERMS_VERSION.
- [ ] `/pedido-confirmado` muestra detalle archivable + botón "Imprimir PDF".
- [ ] Factura PDF tiene QR Verifactu (si elegiste `verifactu`) + hash chain (verificable en SQL: segunda factura `previous_hash` = `hash` de la primera).
- [ ] Admin acepta pedido → email "Pedido aceptado" lleva a `/mis-pedidos` (no signed URL).

### Admin
- [ ] `/admin/brechas` carga, formulario "Nueva brecha" funciona, NO existe botón Eliminar.
- [ ] Usuario normal → `/admin/brechas` redirige.

### Magic link
- [ ] Solicitar magic link, abrir desde email → URL se limpia (sin `?token=`).
- [ ] `<meta name="referrer" content="no-referrer">` presente en `<head>`.

---

## 📊 Monitoring primera semana

- [ ] Vercel Dashboard → Logs → filtrar `[CSP-REPORT]` → registrar violaciones (si llegan).
- [ ] Supabase → Edge Functions → Logs → error rate < 1%.
- [ ] SQL: `select last_run_status, count(*) from cron.job_run_details where start_time > now() - interval '24h' group by 1` → todos `succeeded`.
- [ ] SQL: `select count(*) from data_breaches where resolution_status != 'resolved'` = 0.

---

## 🎯 TODOs fase 2 (cuando tengas margen)

- [ ] **S-03**: tras 7d sin violaciones CSP, cambiar header de `Content-Security-Policy-Report-Only` → `Content-Security-Policy` (vercel.json línea 29).
- [ ] **C-01 fase 2**: integración real-time AEAT (SOAP) + firma XAdES (RD 1007/2023 art. 8).
- [ ] **S-08 fase 2**: cookie HttpOnly Secure SameSite=Strict tras magic link.
- [ ] **S-01 fase 2**: modo strict en `buildCorsHeaders` para endpoints admin.
- [ ] **P-07 fase 2**: inventariar cookies vivas tras aceptar mapa Google.
- [ ] **L-07 webhook**: configurar webhook Resend bounce/spam → alerta DPO.

---

## 🔁 Recurrentes (trimestral)

Ver `Docs/runbooks/legal-quarterly-review.md`. Próxima revisión: 30 sep 2026.

---

**Tu trabajo restante**: ~1 h máx — rellenar settings reales, decidir verifactu, smoke test visual, rotar tokens. Todo lo automatizable ya está hecho.
