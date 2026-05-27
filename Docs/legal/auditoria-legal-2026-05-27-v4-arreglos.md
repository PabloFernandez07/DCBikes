# Prompt de arreglos · Auditoría legal V4 · DC Bikes Cantabria

> **Cómo usar este archivo**: pégalo en una nueva sesión de Claude (o pásaselo a una instancia que vaya a implementar). Es auto-contenido — el modelo receptor entenderá contexto, qué arreglar y por qué.

---

## 0 · Contexto

- **Stack**: React + TypeScript (Vite) · Supabase (Postgres + Edge Functions Deno + Storage + Vault) · Vercel · Resend · Redsys TPV · Cloudflare Turnstile · Google Maps/Places.
- **Negocio**: e-commerce de ciclismo en El Astillero (Cantabria). Microempresa declarada (art. 4.1 Ley 11/2023).
- **Estado tras 4 auditorías**: V1 + V2 + V3 con 93 hallazgos acumulados; V3 cerró 35 de 48 (72,9 %). V4 detecta **66 hallazgos** distribuidos en 4 bloques: regresión V3 (10 + 9 parciales), accesibilidad (17), DPA/cadena encargados (14), operativa/integridad (16).
- **Bloque V4 destacado**: detecta race conditions críticas (O-01), ausencia de audit_log central (O-03), no implementación de Verifactu real (C-01 parcial), 3 funciones con CORS wildcard residual (S-01 parcial), y datos fiscales del titular SIN rellenar en producción (P-03/L-01/C-13).
- **Veredicto**: NO APTO. Pero con **3 h de Sprint 0 + designación administrativa del titular** pasa a APTO CON SALVEDADES.

---

## 1 · Sprint 0 — Desbloqueo (1–2 días, ~3 h código + acciones admin)

### 1.1 · `P-03 / L-01 / C-13 / V4-10` · Rellenar settings del titular y placeholders

**Acción del titular** (no es código):

1. Pregunta al titular: razón social/nombre completo del autónomo, NIF/CIF, dirección postal, forma jurídica, inscripción registral si SL, email de contacto verificado, teléfono.
2. SQL directo:
   ```sql
   update settings set value = '"<RAZÓN_SOCIAL>"'::jsonb            where key = 'legal_company_name';
   update settings set value = '"<NIF/CIF>"'::jsonb                  where key = 'legal_company_cif';
   update settings set value = '"<DIRECCIÓN POSTAL>"'::jsonb         where key = 'legal_company_address';
   update settings set value = '"<Empresario individual | S.L.>"'::jsonb where key = 'legal_forma_juridica';
   update settings set value = '"<No aplica (art. 19 CCom) | RM Santander, Tomo X Folio Y Hoja Z>"'::jsonb where key = 'legal_inscripcion';
   update settings set value = '"info@dcbikescantabria.es"'::jsonb   where key = 'store_contact_email';
   update settings set value = '"verifactu"'::jsonb                  where key = 'verifactu_mode';
   ```
3. Reemplazar en `Docs/legal/rat-2026.md:14-19` los `[PENDIENTE]` por valores reales.
4. Reemplazar en `Docs/legal/procedimiento-brechas.md:148-191` todos los `[PENDIENTE]` y `{email_dpo}` con datos del responsable designado.

### 1.2 · `S-07` · Designar formalmente responsable de privacidad

Microempresa no requiere DPO formal (RGPD art. 37). El titular firma un documento interno designándose como responsable de privacidad y de respuesta a brechas:

```markdown
# Designación responsable de privacidad — DC Bikes Cantabria

Yo, [Nombre completo], en calidad de [titular / administrador único],
designo a [Nombre] como responsable de la gestión de la privacidad
y de la respuesta a brechas de seguridad en DC Bikes Cantabria, con:

- Email: dpo@dcbikescantabria.es (o info@dcbikescantabria.es)
- Teléfono móvil 24/7 (para incidentes): +34 XXX XXX XXX
- Función: receptor de alertas de brechas, decisor sobre notificación
  a AEPD (RGPD art. 33) y comunicación a interesados (art. 34).

Fecha y firma: __________________
```

Guardar en `Docs/legal/designacion-responsable-privacidad.md`.

### 1.3 · `S-01 + V4-06 + V4-09` · Cerrar CORS wildcard residual (3 funciones)

**Archivo**: `supabase/functions/_shared/email-utils.ts`.

```ts
// ELIMINAR el export deprecado:
// export const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', ... }

// Hacer req OBLIGATORIO en jsonOk/jsonError:
export function jsonOk(data: Record<string, unknown>, req: Request): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
  })
}
export function jsonError(message: string, status: number, req: Request): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
  })
}
```

**Archivos a refactorizar** (eliminar `CORS_HEADERS` local y pasar `req`):

1. `supabase/functions/quote-submit/index.ts:21-25` — eliminar la constante local + reemplazar `jsonRes` por `jsonOk(...,req)`.
2. `supabase/functions/cron-healthcheck/index.ts:23-28` — idem.
3. `supabase/functions/google-avatar-proxy/index.ts:50` — usar `buildCorsHeaders(req)` también en respuesta binaria:
   ```ts
   return new Response(body, {
     status: 200,
     headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400', ...buildCorsHeaders(req) },
   })
   ```
4. Eliminar imports inútiles de `CORS_HEADERS` en `customer-order-detail/index.ts:23`, `data-retention-cron/index.ts:28`, `order-place/index.ts:28`, `order-public-get/index.ts:25`.

Verificación: `grep -r "CORS_HEADERS" supabase/functions/` debe devolver vacío tras refactor.

### 1.4 · `V4-04` · Gate `verifactu_mode` en `order-place`

**Archivo**: `supabase/functions/order-place/index.ts:434-440`.

```diff
- const legalReady = legalCompanyName && legalCompanyCif && legalCompanyAddress
+ const verifactuMode = String(settings.verifactu_mode ?? '').trim()
+ const legalReady =
+   legalCompanyName && legalCompanyCif && legalCompanyAddress &&
+   ['verifactu', 'no_verifactu'].includes(verifactuMode)
  if (!legalReady) {
    return jsonError('Tienda no operativa temporalmente. Estamos completando la configuración fiscal.', 503, req)
  }
```

### 1.5 · `V4-02` · Token en `confirmationUrl` del primer email

**Archivo**: `supabase/functions/send-order-confirmation-customer/index.ts:87-89`.

```diff
- // TODO Fase E: signed token. Por ahora linkamos sin token.
- const confirmationUrl = `${siteUrl}/pedido/confirmacion?id=${order.id}`
+ const { generateOrderToken } = await import('../_shared/order-token.ts')
+ const token = await generateOrderToken(order.id, order.customer_email)
+ const confirmationUrl = `${siteUrl}/pedido/confirmacion?id=${order.id}&token=${token}`
```

---

## 2 · Sprint 1 — Críticos V4 (2 semanas, ~30 h)

### 2.1 · `O-01` · Optimistic locking en todas las transiciones de estado

**Archivos**: `order-accept`, `order-reject`, `customer-order-cancel`, `redsys-notification`, `order-delete`.

Patrón universal:

```ts
const { data: updated, error: uErr } = await supabase
  .from('orders')
  .update(updatePayload)
  .eq('id', orderId)
  .eq('status', expectedStatus)  // ← AÑADIR optimistic lock
  .select('id')                   // ← devuelve filas afectadas

if (uErr || !updated || updated.length === 0) {
  // El estado cambió entre LOAD y UPDATE. Revertir Redsys si aplica.
  if (capturedRedsys) {
    await runRedsysOperation({ config, redsysOrderId, op: { kind: 'cancel', amountCents: order.total_cents } })
    await logPayment(supabase, orderId, 'cancel', /*…*/, '9')
  }
  return jsonError('conflicto de concurrencia: el pedido cambió de estado durante la operación', 409, req)
}
```

Aplicar en:
- `order-accept/index.ts:108` → `.eq('status', 'authorized')`
- `order-reject/index.ts:82-90` → `.eq('status', 'authorized')`
- `customer-order-cancel/index.ts:152-161` → `.eq('status', 'authorized')`
- `redsys-notification/index.ts:309-312` → `.eq('status', 'pending')`
- `order-delete/index.ts:81-86` → añadir `.in('status', ['pending','payment_failed'])`

### 2.2 · `O-02` · Anti-replay webhook Redsys

**Archivo**: `supabase/functions/redsys-notification/index.ts`.

1. Validar timestamp `Ds_Date`/`Ds_Hour` antes de procesar:

```ts
const dsDate = String(params['Ds_Date'] ?? '')
const dsHour = String(params['Ds_Hour'] ?? '')
if (dsDate && dsHour) {
  const [d, m, y] = decodeURIComponent(dsDate).split('/')
  const [hh, mm] = dsHour.split(':')
  const txDate = new Date(`${y}-${m}-${d}T${hh}:${mm}:00+01:00`)
  const ageMin = (Date.now() - txDate.getTime()) / 60000
  if (ageMin > 30) {
    console.warn(`[redsys-notification] timestamp antiguo · ${ageMin.toFixed(0)} min`)
    await supabase.from('payments_log').insert({ operation_type: 'replay_suspect', raw_payload: { age_min: ageMin } })
    return new Response('replay rejected', { status: 403 })
  }
}
```

2. Migración dedup:

```sql
-- 0029_redsys_dedup.sql
create table if not exists redsys_notification_dedup (
  ds_order text not null,
  ds_authorization_code text not null default '',
  received_at timestamptz not null default now(),
  primary key (ds_order, ds_authorization_code)
);
-- Purgar entradas >7d para no crecer indefinidamente
create index redsys_dedup_received_at on redsys_notification_dedup(received_at);
```

```ts
const { error: dedupErr } = await supabase
  .from('redsys_notification_dedup')
  .insert({ ds_order: outcome.redsysOrderId, ds_authorization_code: outcome.authCode ?? '' })
if (dedupErr?.code === '23505') {  // unique_violation
  return jsonOk({ duplicate: true }, req)  // ya procesado
}
```

### 2.3 · `O-03` · Audit log central

**Migración nueva** `supabase/migrations/0028_audit_log.sql`:

```sql
create table audit_log (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references auth.users(id),
  actor_email  text,
  action       text not null,
  resource     text not null,
  before_value jsonb,
  after_value  jsonb,
  ip_address   text,
  user_agent   text,
  request_id   text
);

create index audit_log_actor_idx    on audit_log(actor_id, occurred_at desc);
create index audit_log_resource_idx on audit_log(resource, occurred_at desc);
create index audit_log_action_idx   on audit_log(action, occurred_at desc);

alter table audit_log enable row level security;
create policy audit_log_admin_read on audit_log
  for select to authenticated using (is_admin());
revoke all on audit_log from authenticated, anon;
grant insert, select on audit_log to service_role;

create or replace function fn_audit_changes() returns trigger language plpgsql security definer as $$
begin
  insert into audit_log(actor_id, action, resource, before_value, after_value)
  values (
    auth.uid(),
    TG_OP || '.' || TG_TABLE_NAME,
    TG_TABLE_NAME || ':' || coalesce(NEW.key::text, NEW.id::text, OLD.id::text),
    case when TG_OP <> 'INSERT' then to_jsonb(OLD) end,
    case when TG_OP <> 'DELETE' then to_jsonb(NEW) end
  );
  return coalesce(NEW, OLD);
end; $$;

create trigger audit_settings       after insert or update or delete on settings       for each row execute function fn_audit_changes();
create trigger audit_admin_users    after insert or update or delete on admin_users    for each row execute function fn_audit_changes();
create trigger audit_data_breaches  after insert or update             on data_breaches for each row execute function fn_audit_changes();
create trigger audit_products_price after update of retail_price       on products      for each row execute function fn_audit_changes();
```

### 2.4 · `C-01` · Completar Verifactu (XAdES + envío AEAT) [con asesoría fiscal]

**Decisión bloqueante**: el titular debe decidir con asesoría fiscal modo Verifactu (envío AEAT real-time, gratuito) vs no_verifactu (registro local firmado XAdES). Para microempresa: **modo Verifactu recomendado**.

Mientras se completa: **deshabilitar emisión de facturas y emitir solo tickets simplificados &lt; 400 €** modificando `generate-invoice-pdf/index.ts:174-178`:

```ts
if (verifactuMode === 'verifactu' && !aeatIntegrationReady) {
  return jsonError('Sistema de facturación Verifactu en mantenimiento. Contacta con la tienda.', 503, req)
}
```

Para implementación completa (sprint dedicado de 2-4 semanas):

1. **SOAP AEAT Suministro Inmediato Verifactu** — endpoint:
   - Pruebas: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/RegFactuSistemaFacturacion/VerifactuSOAP`
   - Producción: `https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/RegFactuSistemaFacturacion/VerifactuSOAP`
   - Operación `RegFactuSistemaFacturacion` con XML firmado XAdES-BES con certificado del titular.
2. Implementar en nueva Edge Function `verifactu-send/index.ts` que:
   - Recibe `invoice_id`.
   - Lee la factura de BD.
   - Construye el XML según XSD oficial.
   - Firma con `xmldsigjs` o equivalente Deno usando certificado almacenado en Vault.
   - Envía SOAP a AEAT.
   - Persiste `aeat_csv` (Código Seguro de Verificación), `aeat_sent_at`, `aeat_status='sent'`.
3. Invocar `verifactu-send` al final de `generate-invoice-pdf` después de persistir la fila `invoices`.

### 2.5 · `D-01 + D-02 + D-09` · Documentación RGPD profunda

#### D-01 · Armonizar PolPriv ↔ RAT (Supabase region)

`Docs/legal/rat-2026.md`:43, 60, 91, 125, 142 — reemplazar:

```diff
- Sí, a Estados Unidos: Resend, Supabase, Vercel
+ Sí, transferencia internacional limitada al acceso remoto de soporte por personal de
+ Supabase Inc. (Delaware, EE.UU.), Vercel Inc. (EE.UU.), Resend Inc. (EE.UU.) y Cloudflare Inc. (EE.UU.).
+ Los datos en reposo se almacenan en eu-west-1 (Irlanda, EEE). Base legal: CCT 2021/914
+ módulos 2 y 3 + DPF UE-EE.UU. (donde aplique). TIA documentada en registro-dpas-firmados.md.
```

#### D-02 · Crear `Docs/legal/politica-subencargados.md`

```markdown
# Política de subencargados (Sub-processors) — DC Bikes Cantabria

## 1. Autorización general escrita (CCT 2021/914 cláusula 9.a opción 2)

DC Bikes Cantabria autoriza con carácter general a sus encargados principales
a recurrir a sub-encargados de tratamiento, sujeto a las siguientes condiciones:

1. El encargado principal mantendrá una lista pública actualizada de sus
   sub-encargados (URLs en sección 3).
2. Notificará a DC Bikes Cantabria con al menos 30 días de antelación la
   incorporación o sustitución de cualquier sub-encargado material.
3. DC Bikes Cantabria podrá oponerse motivadamente en el plazo de 15 días
   naturales desde la notificación; la oposición fundamentada habilita la
   rescisión de la relación con el encargado principal sin penalización.
4. Cada sub-encargado quedará obligado por las mismas garantías contractuales
   que el encargado principal (art. 28.4 RGPD).

## 2. Sub-encargados conocidos a fecha 2026-05-27

| Encargado principal | Sub-encargado | País | Función |
|---|---|---|---|
| Supabase, Inc. | Amazon Web Services, Inc. | EE.UU. (eu-west-1 EEE para almacén) | Infraestructura |
| Supabase, Inc. | Fly.io | EE.UU. | Edge runtime |
| Supabase, Inc. | Cloudflare, Inc. | EE.UU. (red global) | DNS, CDN |
| Vercel Inc. | Amazon Web Services, Inc. | EE.UU. | Infraestructura |
| Vercel Inc. | Cloudflare, Inc. | EE.UU. | CDN |
| Resend, Inc. | Amazon Web Services (SES) | EE.UU. | SMTP delivery |
| Cloudflare, Inc. | (red propia) | EE.UU./global | — |

## 3. Listas públicas de sub-encargados (siempre vigentes)

- Supabase: https://supabase.com/dpa
- Vercel: https://vercel.com/legal/subprocessors
- Resend: https://resend.com/legal/subprocessors
- Cloudflare: https://www.cloudflare.com/cloudflare-customer-subprocessors/

## 4. Procedimiento de oposición del responsable

Email a info@dcbikescantabria.es asunto "Oposición sub-encargado [nombre]"
con motivación razonada. Plazo de respuesta: 5 días hábiles.
```

Y `Docs/legal/registro-dpas-firmados.md`:

```markdown
# Registro de DPAs firmados — DC Bikes Cantabria

| Encargado | DPA firmado | Versión | URL | Fecha verificación | Subencargados conocidos | TIA |
|---|---|---|---|---|---|---|
| Supabase, Inc. | Sí | 2024-01 | https://supabase.com/dpa | 2026-05-27 | AWS, Fly.io, Cloudflare | Sí (Docs/legal/tia-supabase.md) |
| Vercel Inc. | Sí | 2024-08 | https://vercel.com/legal/dpa | 2026-05-27 | AWS, Cloudflare | Sí |
| Resend, Inc. | Sí | 2024-06 | https://resend.com/legal/dpa | 2026-05-27 | AWS SES | Sí |
| Cloudflare, Inc. | Sí | 2024-03 | https://www.cloudflare.com/dpa/ | 2026-05-27 | — | Sí |
| Redsys S.L. | Por contrato comercial | — | (proveedor TPV) | 2026-05-27 | — | N/A intra-UE |

Revisión semestral. Próxima: 2026-11-27.
```

Añadir párrafo en `src/pages/public/PrivacyPolicy.tsx` sección 7 tras la tabla:

```jsx
<p className="text-sm text-[var(--color-mid)]">
  Cada uno de los encargados anteriores puede recurrir a sub-encargados bajo autorización
  general escrita conforme a la cláusula 9.a CCT 2021/914. Las listas públicas
  actualizadas están disponibles en las URLs de cada proveedor (ver
  Docs/legal/politica-subencargados.md). Puedes obtener copia gratuita de las CCT o
  del DPF aplicable solicitándolo a info@dcbikescantabria.es.
</p>
```

#### D-09 · Política de conservación campo a campo

Crear `Docs/legal/politica-conservacion-datos.md`:

```markdown
# Política de conservación de datos — DC Bikes Cantabria

| Categoría / Campo | Plazo | Base legal | Acción a vencimiento |
|---|---|---|---|
| `orders.customer_first_name`, `last_name` | 6 años | LGT art. 66 (factura) | Anonimizar |
| `orders.customer_email` | 6 años | LGT art. 66 + RDL 1/2007 art. 70 | Anonimizar |
| `orders.customer_phone` | 3 años | art. 1964.2 CC (reclamaciones) | Anonimizar |
| `orders.customer_dni` (B2C >400€) | 6 años | RD 1619/2012 | Anonimizar |
| `orders.shipping_address_*` | 1 año post-entrega | Reclamaciones envío | Eliminar |
| `orders.shipping_notes` | 30 días post-entrega | Operativa | Eliminar |
| `quote_requests` (mensaje) | 1 año | Interés legítimo seguimiento | Eliminar |
| `quote_requests` revocado | inmediato | RGPD art. 17 | Eliminar en <30 días |
| `consent_audit` IP+UA | 6 años | RGPD art. 7.1 (demostrar consent) | No purgar (inmutable) |
| `magic_link_tokens.hash` | 24 h post-uso | OWASP A07 | Eliminar |
| `audit_log.ip_address` | 1 año | RGPD art. 32.1.b | Anonimizar |
| `payment_logs.raw_payload` | 6 años | LGT + PCI-DSS Req. 10.7 | Conservar |
| `product_views.session_id` | 13 meses | RAT 2.4 declarado | Anonimizar |
| `email_bounce_log.email` | 1 año | Reputación SPF/DKIM | Eliminar |

Revisión: anual o ante cambios materiales en el RAT.
```

Actualizar `supabase/functions/data-retention-cron/index.ts` para aplicar plazos diferenciados.

---

## 3 · Sprint 2 — Altos V4 (3 semanas, ~35 h)

### 3.1 · Bloque O (operativa)

- **O-04** — Mover lectura admin de pedidos a Edge Function `admin-order-detail` con `audit_log.insert({action: 'order.read', resource: orderId})`.
- **O-05** — RLS de `consent_audit`: solo SELECT para admin, sin UPDATE/DELETE policy.
- **O-06** — Crear `Docs/legal/plan-continuidad.md` con RTO 24h, RPO 1h (PITR) o 24h (sin PITR); backup off-platform mensual con `pg_dump` a S3/B2 cifrado.
- **O-07** — Configurar UptimeRobot gratuito → `cron-healthcheck` cada 15min + dead-man-switch en deadmanssnitch.com.
- **O-08** — DNS records (registrador del dominio):
  ```
  @                  IN TXT "v=spf1 include:_spf.resend.com -all"
  resend._domainkey  IN CNAME resend._domainkey.dcbikescantabria.com.resend.com.
  _dmarc             IN TXT "v=DMARC1; p=quarantine; rua=mailto:dpo@dcbikescantabria.es; ruf=mailto:dpo@dcbikescantabria.es; fo=1; pct=100"
  ```
  Validar con https://www.mail-tester.com (≥9/10) y https://mxtoolbox.com.
- **O-09** — Implementar `supabase/functions/resend-bounce-handler/index.ts` con verificación HMAC svix (NO dejar TODO) + tabla `email_bounce_log` + marcar `email_blocked_at` en `orders` si bounce hard.

### 3.2 · Bloque D (cadena encargados)

- **D-03** — Verificar en https://www.dataprivacyframework.gov/list que Resend Inc. está activo. Si no: eliminar mención DPF de `rat-2026.md:154`, mantener solo CCT.
- **D-04** — Añadir tratamiento 2.X en RAT: "Reseñas y avatares de Google" con base art. 6.1.f (LIA en `lia-google-reviews.md`) y destinatario Google LLC.
- **D-05** — Crear `Docs/legal/analisis-dpia.md` con tabla de aplicación WP248rev01 a cada tratamiento del RAT. Conclusión esperada: NO procede DPIA, pero documentar el análisis con firma.
- **D-06** — Reescribir `src/pages/public/TermsOfSale.tsx` con sección "1.bis Tipos de cliente: B2C / B2B" y marcar cláusulas con `[Solo B2C]` / `[Solo B2B]`:
  - Sección 8 (Garantía): bloque B2C 3 años + bloque B2B 6 meses (art. 342 CCo, art. 1484 CC).
  - Sección 9 (Desistimiento): añadir párrafo *"[Solo B2C]. El derecho de desistimiento del art. 102 RDL 1/2007 NO aplica a clientes profesionales conforme al art. 59 RDL 1/2007."*
  - Sección 10 (Jurisdicción): separar B2C (domicilio consumidor art. 90) y B2B (Juzgados de Santander, libre pacto).
  En `Checkout.tsx`: si `needs_invoice = true`, mostrar aviso "Compra profesional: no aplica desistimiento legal".
- **D-10** — Crear `Docs/legal/politica-cesion-acceso-datos.md` con flujo: recepción → validación → asesoría → respuesta → registro en audit_log. Plantillas de respuesta.

### 3.3 · Bloque A (accesibilidad — críticos y altos)

- **A-01** — Skip-link en `src/App.tsx`:
  ```tsx
  <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--color-lavender)] focus:text-[var(--color-ink)] focus:rounded-lg">
    Saltar al contenido principal
  </a>
  ```
  + `<main id="main-content" tabIndex={-1}>`.
- **A-02** — Aclarar `--color-mid` a `#9587A0` o crear `--color-text-secondary: #ADA1B8`; auditar globalmente.
- **A-03** — Añadir `controls` a los 6 vídeos en `Contact.tsx:421-433`; respetar `prefers-reduced-motion`:
  ```tsx
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  <video controls={reducedMotion} autoPlay={!reducedMotion} muted loop playsInline preload="metadata" aria-label={`Vídeo ${n} de la tienda DC Bikes`}>
  ```
- **A-04** — Migrar `Modal.tsx` a `@radix-ui/react-dialog` o instalar `focus-trap-react` con retorno de foco.
- **A-05** — `CartDrawer.tsx` con atributo `inert` cuando cerrado.
- **A-06** — CookieBanner: handler Escape, mover foco al banner al aparecer, `aria-labelledby` en switches, corregir lógica icono Chevron.
- **A-07** — Refactor `ProductCard.tsx`: usar `<Link>` que cubra la card en lugar de `<article role="button">`.
- **A-08** — Añadir `role="alert" aria-live="assertive"` a todos los mensajes de error de formulario en QuoteModal, MyOrdersRequestAccess, Checkout, Field.tsx.
- **A-09** — `<h1 className="sr-only">DC Bikes Cantabria — Tienda de bicicletas y taller en El Astillero</h1>` en Home.

---

## 4 · Sprint 3 — Medios y bajos (3 semanas, ~30 h)

### Resumen ejecutable

**Operativa (O-10 a O-16)**:
- O-10: helper `jsonInternalError(err, req)` que retorna `Error interno (ref ${uuid})` y loguea stack a console.
- O-11: rate-limit en `order-place` (5 órdenes / 10 min por IP+email).
- O-12: rate-limit en `customer-order-detail` (30 req/min por IP).
- O-13: matriz retención logs en `Docs/legal/retencion-logs-proveedores.md` + cron mensual purga Resend.
- O-14: cron diario reconciliación `products.stock` vs `sum(order_items where status not in cancelled,rejected)`.
- O-15: header `List-Unsubscribe: <mailto:bajas@dcbikescantabria.es>, <https://dcbikescantabria.es/baja?u={UUID}>`.
- O-16: feature flag `ENABLE_MOCK_REDSYS` que deshabilita `__mock` en prod.

**DPA (D-07, D-08, D-11, D-12, D-13, D-14)**:
- D-07: nota en RAT 2.2 sobre tratamiento de autónomos persona física vs jurídica.
- D-08: añadir en PolPriv §7 frase "Puedes obtener copia gratuita de las CCT en info@dcbikescantabria.es".
- D-11: en RAT, ampliar descripción Vercel con logs runtime + edge cache.
- D-12: crear `Docs/legal/lia-google-reviews.md` con test tres pasos.
- D-13: condicionar iframe Google Maps en `Contact.tsx` al consent (placeholder hasta aceptar) — **importante**: hoy carga sin consent.
- D-14: crear `Docs/legal/politica-cookies-tecnicas.md` interno con inventario.

**Accesibilidad (A-10 a A-17)**:
- A-10: indicador required `<span aria-hidden>*</span><span class="sr-only"> (obligatorio)</span>` + leyenda al inicio formulario.
- A-11: `aria-hidden="true"` en todos los emojis decorativos.
- A-12: hook `useReducedMotion` aplicado a `useCountUp`, `SplashScreen`, carrusel reviews, `scrollTo({behavior})`.
- A-13: `alt=""` decorativo en galería tienda o alt informativo único.
- A-14: validación Zod en `ImageUploader.tsx` admin para hacer `alt` obligatorio.
- A-15: aumentar stepper CartDrawer a `p-2.5` (36×36 px).
- A-16: sección "Reclamaciones de accesibilidad" en `LegalNotice.tsx` con email dedicado y plazos 20 días hábiles.
- A-17: refactor `Cart.tsx` lista items a `<ul role="list"><li>`.

**Regresión (V4-03, V4-05, V4-08)**:
- V4-03: `purgeRevokedConsents()` en `data-retention-cron` cruzando `consent_audit.revoked=true` con `quote_requests`.
- V4-05: JSON.stringify replacer que elimine email/phone del payload de error.
- V4-08: mover seed UUIDs admin de `0013_admin_users.sql:38-41` a runbook fuera del repo.

---

## 5 · Tabla resumen de hallazgos V4

| ID | Sev. | Bloque | Resumen | Archivo principal |
|---|---|---|---|---|
| **V3-PARCIALES** | | | | |
| P-03/L-01/C-13 | Crit/Bajo | Admin | Datos fiscales sin populated | settings (SQL) |
| C-01 | Crit | Verifactu | Falta XAdES + envío AEAT | `generate-invoice-pdf` |
| S-01 | Crit | Sec | CORS wildcard en 3 funciones | `_shared/email-utils.ts` |
| S-03 | Alto | Sec | CSP Report-Only sin endpoint | `vercel.json` |
| S-07 | Alto | Sec | DPO sin designar | docs |
| S-08 | Med | Sec | Magic-link en localStorage | `MyOrdersSession.tsx` |
| C-12 | Med | Factura | Multi-IVA preparado, falta tax_rate_pct por línea | `order_items` |
| **V4 REGRESIÓN** | | | | |
| V4-01 | Med | Sec | google-avatar-proxy sin rate-limit | `google-avatar-proxy` |
| V4-02 | Bajo | LSSI | Token ausente en confirmationUrl | `send-order-confirmation-customer` |
| V4-03 | Med | Privacidad | Sin purga al revocar consent | `data-retention-cron` |
| V4-04 | Alto | Operativa | verifactu_mode='null' permite pedidos | `order-place` |
| V4-05 | Bajo | Logs | order_number en console.log | `redsys-notification` |
| V4-06 | Med | Sec | CORS_HEADERS @deprecated aún importado | varias |
| V4-07 | Med | LSSI | Contrato PDF non-blocking puede no existir | `order-place`, `send-…` |
| V4-08 | Bajo | Sec | UUIDs admin en migración | `0013_admin_users.sql` |
| V4-09 | Bajo | Sec | quote-submit con jsonRes local | `quote-submit` |
| V4-10 | Med | Docs | procedimiento-brechas placeholders | docs |
| **V4 ACCESIBILIDAD (A-01..A-17)** | 3 crit / 5 alto / 8 med / 1 bajo | A11y | RD 1112/2018 + Ley 11/2023 | varios |
| **V4 DPA (D-01..D-14)** | 3 crit / 5 alto / 4 med / 2 bajo | DPA | Subencargados + DPIA + B2B | docs + PolPriv + TermsOfSale |
| **V4 OPERATIVA (O-01..O-16)** | 3 crit / 6 alto / 5 med / 2 bajo | Operativa | Race + audit_log + DR + email | edge functions + migraciones |

---

## 6 · Sugerencia de invocación

Pegar este archivo a una nueva sesión de Claude con prompt:

> Soy desarrollador del proyecto **DC Bikes Cantabria** (e-commerce React + Supabase + Vercel para tienda de ciclismo en El Astillero). Te paso el resultado de la auditoría legal **V4** (66 hallazgos). Aplica los arreglos por sprints, empezando por el **Sprint 0 (desbloqueo)** que son 3 h de código + acciones administrativas del titular. Detente al final de cada sprint para que pueda revisar. No avances al siguiente sin mi confirmación.
>
> [pegar contenido de este archivo]

---

**Fin del prompt · Versión 2026-05-27 V4 · 66 hallazgos · 4 sprints · ~100 h trabajo total estimado**
