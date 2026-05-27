# Prompt de arreglos · Auditoría legal V3 · DC Bikes Cantabria

> **Cómo usar este archivo**: pégalo en una sesión nueva de Claude (o pásaselo como input a una instancia que vaya a implementar). Está pensado para que el modelo:
> 1. Entienda el contexto del proyecto sin más explicación.
> 2. Conozca exactamente qué hay que arreglar, en qué archivo y por qué.
> 3. Pueda priorizar e ir por sprints sin tener que releer las 3 auditorías previas.

---

## 0 · Contexto del proyecto

- **Stack**: React + TypeScript (Vite) · Supabase (Postgres + Edge Functions Deno + Storage) · Vercel · Resend · Redsys TPV · Cloudflare Turnstile · Google Maps/Places (reseñas).
- **Negocio**: tienda online de ciclismo en El Astillero (Cantabria). Las bicicletas se venden en tienda física; online se vende ropa, accesorios y componentes.
- **Estado legal**: tras auditorías v1 (27 hallazgos) y v2 (18 hallazgos), el cliente ha implementado correcciones sustanciales. Esta es la **V3**, que identifica 48 hallazgos residuales o nuevos: **11 críticos, 17 altos, 13 medios, 7 bajos**.
- **Veredicto**: NO APTO para apertura comercial al público sin cerrar los críticos.
- **Causa raíz dominante**: los settings `legal_company_name | legal_company_cif | legal_company_address | legal_forma_juridica | legal_inscripcion` siguen vacíos en producción y degradan en cascada Aviso Legal, Términos, RAT, emails y facturación.

---

## 1 · Sprint 0 — Bloqueantes absolutos (24–48 h, ~6 h de código)

Resuélvelos en este orden. Tras Sprint 0, los 11 críticos quedan reducidos a Verifactu (C-01), CORS (S-01), CSP (S-03), Google avatars (P-01), Omnibus (C-04) — Sprint 1.

### 1.1 · `L-01 + L-02 + C-02 + P-03` · Datos fiscales (4 críticos cerrados con 1 acción)

**Acción:**

1. Pregunta al titular (Pablo / contacto del cliente) los datos legales reales: razón social o nombre completo del autónomo, NIF/CIF, dirección postal, forma jurídica, inscripción registral si SL.
2. Rellena los settings vía SQL o vía panel `/admin/configuracion`:
   ```sql
   update settings set value = '"<RAZÓN_SOCIAL_REAL>"'::jsonb where key = 'legal_company_name';
   update settings set value = '"<NIF/CIF>"'::jsonb where key = 'legal_company_cif';
   update settings set value = '"<DIRECCIÓN POSTAL COMPLETA>"'::jsonb where key = 'legal_company_address';
   update settings set value = '"<Empresario individual | Sociedad Limitada>"'::jsonb where key = 'legal_forma_juridica';
   update settings set value = '"<No aplica (art. 19 CCom) | Inscrita en RM Santander, Tomo X Folio Y Hoja Z>"'::jsonb where key = 'legal_inscripcion';
   ```
3. Edita `supabase/migrations/0004_settings_carrito_seed.sql:22-24` para **no** sembrar los campos legales como string vacío (deja la línea `insert` solo para los demás keys).
4. Añade gate en `supabase/functions/order-place/index.ts` antes de aceptar el pedido:
   ```ts
   const legalReady =
     typeof settings.legal_company_name === 'string' && settings.legal_company_name.trim().length > 0 &&
     typeof settings.legal_company_cif === 'string' && settings.legal_company_cif.trim().length > 0 &&
     typeof settings.legal_company_address === 'string' && settings.legal_company_address.trim().length > 0
   if (!legalReady) {
     return jsonError('Tienda no operativa temporalmente. Estamos completando la configuración fiscal.', 503)
   }
   ```
5. Actualiza `Docs/legal/rat-2026.md` líneas 12-17 con los datos reales, añade fecha y firma.
6. Añade el NIF al footer de la web (`Footer.tsx`) y al apartado "Responsable" de `PrivacyPolicy.tsx:67-76`.

### 1.2 · `P-02` · "Cargar mapa" debe persistir consentimiento

**Archivos**: `src/components/layout/CookieBanner.tsx`, `src/pages/public/Contact.tsx`.

1. Expón desde el módulo de banner una función pública:
   ```ts
   // CookieBanner.tsx (o un nuevo src/lib/cookie-consent.ts)
   export function setThirdPartyConsent(value: boolean) {
     const current = readStored() ?? { essential: true, analytics: false, marketing: false, thirdParty: false }
     const next = { ...current, thirdParty: value, savedAt: new Date().toISOString() }
     localStorage.setItem('dcbikes_cookie_consent', JSON.stringify(next))
     window.dispatchEvent(new CustomEvent('cookie-consent-change', { detail: next }))
   }
   ```
2. En `Contact.tsx:274-280`, sustituye `onClick={() => setMapsEnabled(true)}` por:
   ```tsx
   onClick={() => { setThirdPartyConsent(true); setMapsEnabled(true) }}
   ```

### 1.3 · `C-03` · Eliminar función de correlativo antigua

**Archivos**: nueva migración `supabase/migrations/0019_drop_legacy_invoice_number.sql`.

```sql
-- 0019_drop_legacy_invoice_number.sql
-- Cierre del hallazgo C-03 (auditoría v3): doble función de correlativo.
revoke execute on function next_invoice_number(int) from service_role;
drop function if exists next_invoice_number(int);
-- invoice_counter queda como tabla de histórico (read-only desde aplicación).
```

Test de verificación posterior: dos llamadas paralelas a `next_b2c_invoice_number(2026)` deben devolver números distintos y consecutivos.

### 1.4 · `S-02` · Verificar cron y mover secretos a Vault

**Acción inmediata** (verificación):

```sql
select jobname, schedule, last_run, last_run_status
from cron.job
left join cron.job_run_details using (jobid)
order by last_run desc nulls last;
```

Si `last_run` es null para `order-auto-cancel` o `data-retention-cron`, los placeholders `<SERVICE_ROLE_KEY>` y `<CRON_SECRET>` no se sustituyeron → el cron no se ejecuta → incumple RGPD art. 5.1.e.

**Migración correctiva**: renombra las migraciones afectadas a `.template.sql` (excluidas de `db push`) y usa Vault:

```sql
-- Ejecutar manualmente en SQL Studio (no commitear):
select vault.create_secret('<SERVICE_ROLE_KEY_REAL>', 'service_role_key');
select vault.create_secret('<CRON_SECRET_REAL>', 'order_cron_secret');

-- Nueva versión del cron consume vault.decrypted_secrets:
select cron.schedule(
  'order-auto-cancel',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/order-auto-cancel',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'order_cron_secret')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

### 1.5 · `L-04` · Email fallback con dominio incorrecto

**Archivo**: `src/pages/public/TermsOfSale.tsx:114`.

```diff
- const email = s.quote_destination_email ?? 'info@dcbikes.es'
+ const email = s.quote_destination_email ?? 'info@dcbikescantabria.es'
```

Adicionalmente, migrar el email hardcoded en `supabase/functions/send-order-confirmation-customer/index.ts:129` a settings (`store_contact_email`).

---

## 2 · Sprint 1 — Críticos restantes (7 días, ~24 h)

### 2.1 · `P-01` · Avatares Google sin consent

**Archivos**: `src/pages/public/Home.tsx`, `src/hooks/useGoogleReviews.ts`.

**Opción A (recomendada)** — proxy via Edge Function:

1. Nueva función `supabase/functions/google-avatar-proxy/index.ts` que recibe `?url=https://lh3.googleusercontent.com/...`, valida que el host pertenece a Google, descarga la imagen en backend (sin enviar IP del usuario) y la devuelve con `Cache-Control: public, max-age=86400`.
2. En `useGoogleReviews.ts:24-26`, transformar `r.authorAttribution?.photoUri` a `/functions/v1/google-avatar-proxy?url=<encoded>`.

**Opción B** — gating con placeholder:

```tsx
// Home.tsx
import { useCookieConsent } from '@/hooks/useCookieConsent'
const { thirdParty } = useCookieConsent()
{thirdParty
  ? <img src={review.profile_photo_url} referrerPolicy="no-referrer" />
  : <div className="avatar-placeholder">Cargar avatares de Google requiere aceptar cookies de terceros. <button onClick={openCookieBanner}>Configurar</button></div>}
```

Añadir esta categoría a Política de Cookies como "Imágenes de Google (avatares de reseñas)".

### 2.2 · `C-01` · Verifactu (RD 1007/2023)

**Migración nueva** `0020_verifactu.sql`:

```sql
alter table invoices
  add column hash text,
  add column previous_hash text,
  add column signature text,
  add column qr_payload text,
  add column verifactu_mode text check (verifactu_mode in ('verifactu','no_verifactu')),
  add column aeat_sent_at timestamptz,
  add column aeat_csv text,
  add column aeat_status text;

create index if not exists invoices_previous_hash_idx on invoices(previous_hash);
```

**En `supabase/functions/generate-invoice-pdf/index.ts`**, antes del `insert` en `invoices`:

```ts
import { crypto } from 'https://deno.land/std@0.177.0/crypto/mod.ts'

async function computeHash(invoice: { number: string; issuedAt: string; sellerNif: string; buyerNif: string | null; totalCents: number; previousHash: string | null }): Promise<string> {
  const payload = [invoice.number, invoice.issuedAt, invoice.sellerNif, invoice.buyerNif ?? '', invoice.totalCents, invoice.previousHash ?? ''].join('|')
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Antes del INSERT:
const { data: prev } = await supabase.from('invoices').select('hash').order('issued_at', { ascending: false }).limit(1).maybeSingle()
const hash = await computeHash({ ...invoice, previousHash: prev?.hash ?? null })
const qrPayload = `https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=${companyCif}&numserie=${number}&fecha=${issued}&importe=${total}`
```

Dibujar QR en el PDF (usar `https://esm.sh/qrcode@1.5.3`) y añadir leyenda "Factura verificable en sede.agenciatributaria.gob.es — VERI*FACTU" si se elige modo Verifactu.

**Decisión pendiente con cliente**: ¿modo Verifactu (envío real-time a AEAT) o no-Verifactu (registro firmado local + remisión a requerimiento)? Recomendado **modo Verifactu** para microempresa.

### 2.3 · `C-04` · Precio de referencia 30 días (Omnibus)

**Migración nueva** `0021_product_price_history.sql`:

```sql
create table product_price_history (
  id bigserial primary key,
  variant_id uuid not null references product_variants(id) on delete cascade,
  price_cents int not null,
  effective_from timestamptz not null default now(),
  effective_to timestamptz
);
create index price_history_variant_idx on product_price_history(variant_id, effective_from desc);

create or replace function fn_record_price_change() returns trigger as $$
begin
  if (TG_OP = 'UPDATE' and old.retail_price is distinct from new.retail_price) or TG_OP = 'INSERT' then
    update product_price_history set effective_to = now() where variant_id = new.id and effective_to is null;
    insert into product_price_history(variant_id, price_cents) values (new.id, new.retail_price);
  end if;
  return new;
end $$ language plpgsql;

create trigger trg_price_history before insert or update of retail_price on product_variants
  for each row execute function fn_record_price_change();

create or replace function get_min_price_last_30d(p_variant_id uuid) returns int as $$
  select coalesce(min(price_cents), null)
  from product_price_history
  where variant_id = p_variant_id and effective_from > now() - interval '30 days';
$$ language sql stable;
```

**En `src/pages/public/ProductDetail.tsx:153-258`**, mostrar dos líneas si hay descuento:

```tsx
{hasDiscount && minPrice30d != null && (
  <>
    <div>Precio actual: <b>{fmt(finalPrice)} €</b></div>
    <div className="text-muted">Precio anterior (mínimo últimos 30 días): {fmt(minPrice30d)} €</div>
    <div>{Math.round((1 - finalPrice / minPrice30d) * 100)}% de descuento</div>
  </>
)}
```

Si el producto no tiene 30 días en catálogo, no anunciar descuento o anclar al precio de lanzamiento documentado.

### 2.4 · `S-01` · Refactor CORS dinámico

**Archivo**: `supabase/functions/_shared/email-utils.ts`.

```ts
// Elimina export de CORS_HEADERS. Refactoriza:
export function jsonOk(data: Record<string, unknown>, req: Request): Response {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...buildCorsHeaders(req) },
  })
}
export function jsonError(message: string, status = 500, req?: Request): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...(req ? buildCorsHeaders(req) : {}) },
  })
}
```

Y actualiza **todas** las llamadas (~40 sites) en `supabase/functions/**/index.ts` para pasar `req`. Buscar: `jsonError(`, `jsonOk(`.

`buildCorsHeaders` ya devuelve allowlist. Para endpoints admin, considerar lista más estricta (solo dominio del panel).

### 2.5 · `S-03` · CSP sin `unsafe-inline`

**Archivo**: `vercel.json:28`.

Estrategia escalonada:

1. Activa **CSP en Report-Only** primero, sin tirar nada:
   ```json
   { "key": "Content-Security-Policy-Report-Only",
     "value": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; img-src 'self' data: https://lh3.googleusercontent.com https://maps.gstatic.com; font-src 'self'; connect-src 'self' https://*.supabase.co https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://www.google.com; report-uri /api/csp-report;" }
   ```
2. Recopila violaciones durante ~7 días.
3. Si Vite emite estilos inline en build de producción, configura `build.cssCodeSplit: false` o usa `vite-plugin-csp` para emitir hashes.
4. Cuando el report quede limpio, sustituye `Content-Security-Policy-Report-Only` → `Content-Security-Policy` y elimina `'unsafe-inline'`.

---

## 3 · Sprint 2 — Altos (14–21 días, ~30 h)

### 3.1 · Privacidad

- **P-04 (Turnstile)**: añadir Cloudflare, Inc. (EE.UU.) a tabla "Encargados de tratamiento" en `PrivacyPolicy.tsx` §7 con base legal art. 6.1.b/f RGPD + DPF UE-EE.UU.; añadir a Política de Cookies categoría A con justificación anti-fraude (art. 22.2 LSSI); añadir entrada 2.3 en `Docs/legal/rat-2026.md`.
- **P-05 (toggle marketing fantasma)**: eliminar el toggle `marketing` de `CookieBanner.tsx:199-205`. Si en el futuro hay newsletter, reintroducir con doble opt-in declarado.
- **P-06 (banner mentiroso)**: reescribir literal banner: *"Esta web usa cookies y almacenamiento técnicos imprescindibles. En /contacto cargamos opcionalmente el mapa de Google si das consentimiento. No usamos cookies de marketing ni analítica de terceros."*
- **P-07 (cookies Maps obsoletas)**: con navegador limpio, visitar `/contacto`, aceptar mapa, inventariar cookies depositadas (DevTools → Application → Cookies). Actualizar tabla en `CookiePolicy.tsx:167-180`. Añadir fila Cloudflare (`__cf_bm`, `cf_clearance`). Establecer recordatorio trimestral.

### 3.2 · LSSI / Contratación electrónica

- **L-03 (forma jurídica)**: eliminar defaults cosméticos en `LegalNotice.tsx:122-131, 156-165`; si setting vacío → placeholder rojo "Pendiente" (no autoasumir autónomo).
- **L-05 (soporte duradero)**: generar al hacer `order-place` un PDF inmutable con los términos en versión `TERMS_VERSION`, almacenar en bucket privado `order-contracts/{order_id}.pdf`, adjuntar al email de confirmación.

### 3.3 · Consumo / Facturación

- **C-05 (plazos abusivos)**: en `TermsOfSale.tsx:293-296` cambiar literal a *"Plazo máximo de entrega: 30 días naturales desde aceptación (art. 66 bis RDL 1/2007). Plazo habitual 2-5 días laborables Península. Si no se cumple, derecho a emplazar a entrega en plazo adicional y, en su defecto, a resolución y reembolso íntegro."*
- **C-06 (personalización)**: confirmar con cliente el ámbito real. Si bicis online → añadir párrafo en `Returns.tsx`: *"No procede desistimiento sobre bicicletas montadas a medida con componentes seleccionados (talla cuadro, manillar, sillín, transmisión). Estas ventas se realizan en tienda presencial con presupuesto firmado."*
- **C-07 (formulario desistimiento adjunto)**: en `supabase/functions/send-order-confirmation-customer/index.ts` adjuntar `public/devoluciones-formulario.pdf` igual que se adjunta la factura en `send-order-accepted-customer/index.ts:169-171`.
- **C-08 (soporte duradero)**: cubierto por L-05 (mismo PDF).
- **C-09 (factura >400€ B2C)**: en `Checkout.tsx`, si `subtotal_cents + shipping_cents > 40000`, forzar campo `customer_dni` obligatorio. En `generate-invoice-pdf/index.ts`:
  ```ts
  const isHighValueB2C = !isB2B && order.total_cents > 40000
  if (isHighValueB2C && !order.customer_dni) {
    return jsonError('Operación >400€ requiere NIF/DNI del comprador (RD 1619/2012 art. 7.1)', 400)
  }
  ```
  Mostrar NIF del receptor en el PDF cuando `customer_dni` exista.

### 3.4 · Seguridad

- **S-04 (token pedido 30d → 7d, eliminar legacy)**: en `_shared/order-token.ts:25` cambiar TTL a `7 * 24 * 60 * 60 * 1000`. Eliminar rama legacy (líneas 117-122) hoy. Hacer `ORDER_TOKEN_SECRET` obligatoria: `if (!Deno.env.get('ORDER_TOKEN_SECRET')) throw new Error('ORDER_TOKEN_SECRET requerida')`. Verificar en producción que la env var está definida.
- **S-05 (signed URL en email)**: en `send-order-accepted-customer/index.ts:81`, **eliminar la signed URL del cuerpo** del email; el adjunto PDF basta. Si el cliente quiere ver factura en navegador, redirigirlo a `/mis-pedidos` (magic link). En `_shared/email-utils.ts:193` bajar default a `60 * 60` (1 h) y obligar a pasar TTL explícito.
- **S-06 (RLS data_breaches)**: ejecutar:
  ```sql
  select polname, polcmd, polqual from pg_policy where polrelid = 'data_breaches'::regclass;
  ```
  Verificar que SOLO existen las policies con `is_admin()`. Si queda residuo:
  ```sql
  drop policy if exists data_breaches_admin_select on data_breaches;
  drop policy if exists data_breaches_admin_insert on data_breaches;
  drop policy if exists data_breaches_admin_update on data_breaches;
  create policy data_breaches_admin_select on data_breaches for select to authenticated using (is_admin());
  create policy data_breaches_admin_insert on data_breaches for insert to authenticated with check (is_admin());
  create policy data_breaches_admin_update on data_breaches for update to authenticated using (is_admin()) with check (is_admin());
  ```
- **S-07 (procedimiento brechas operativo)**: crear UI `/admin/brechas` con tabla CRUD sobre `data_breaches` (solo `is_admin()`). Revisar `Docs/legal/procedimiento-brechas.md` y asegurar que: detección → triaje 24h → contención → evaluación riesgo → decisión AEPD 72h → comunicación afectados si alto riesgo → cierre, con plantilla de notificación AEPD y email a usuarios. Designar DPO/responsable con contacto. Configurar alertas (error rate, fallos firma Redsys, cron unauthorized) → email DPO.

---

## 4 · Sprint 3 — Medios y bajos (30 días, ~20 h)

### Privacidad
- **P-08**: añadir nota en categoría A de `CookiePolicy.tsx` justificando duración 30d del token `dcbikes_last_order`.
- **P-09**: cron Supabase `purge-analytics-13m` que elimina/anonimiza `product_views` y `search_queries` >13 meses, **o** ajustar RAT 2.4 al plazo real.
- **P-10**: eliminar fila "Comunicaciones comerciales (opt-in)" de `PrivacyPolicy.tsx:182-185` mientras no exista tratamiento real.
- **P-11**: unificar `legal-versions.ts` añadiendo `COOKIES_VERSION` y leer la fecha en cada política.
- **P-12**: añadir `cookies_version` a `StoredConsent` y a `legal-versions.ts`; al cambiar, `readStored()` devuelve null.

### LSSI
- **L-06**: en `ProductDetail.tsx` mostrar siempre bajo precio: *"IVA incluido · Plazo de entrega 2-5 días laborables (Península)"*.
- **L-07**: `OrderConfirmation.tsx` debe mostrar detalle archivable (número, productos, IVA, dirección, derecho de desistimiento, link a formulario, garantía, ODR) + botón "Descargar PDF". Configurar webhook Resend para detectar rebote.
- **L-08**: añadir cláusula 12 en `TermsOfSale.tsx`: *"El contrato se celebra en español, lengua única para formalización y atención al cliente."*

### Consumo
- **C-10**: buscar y reemplazar `https://ec.europa.eu/odr` → `https://ec.europa.eu/consumers/odr/` en `TermsOfSale.tsx:374-381`, `send-order-confirmation-customer/index.ts:157`.
- **C-11**: declarar en `TermsOfSale.tsx` §6: *"Tarifa plana válida para paquetes hasta 30 kg y 120×80×60 cm. Sin sobrecostes adicionales no informados antes de la confirmación."*
- **C-12**: refactor `computeTaxBreakdown` para aceptar `tax_rate` por `order_item`; resumen agrupado por tipo IVA al final del PDF.
- **C-13**: rellenar `legal_inscripcion` con valor real.

### Seguridad
- **S-08**: tras validar magic link en `/mis-pedidos/sesion?token=...`, intercambiar por cookie HttpOnly Secure SameSite=Strict y redirigir a `/mis-pedidos` sin token. Endurecer `Referrer-Policy: no-referrer` en esa ruta vía meta tag.
- **S-09**: en `customer-magic-link-request/index.ts:53-66` añadir rate-limit por IP (20 req/h) además del actual por email; considerar Turnstile en el formulario.
- **S-10**: helper `maskEmail()` en `_shared/email-utils.ts`; sustituir todos los `${email}` en `console.log` por `${maskEmail(email)}`. IPs: truncar último octeto o hash con sal rotada.
- **S-11**: cubierto por S-01.
- **S-12**: en `redsys-notification/index.ts:359-362`, antes de devolver 200, persistir en `payments_log` con `operation_type='fatal_error'` y disparar alerta.
- **S-13**: en `vercel.json:27` ampliar Permissions-Policy: `payment=(self), usb=(), serial=(), gyroscope=(), accelerometer=(), magnetometer=(), fullscreen=(self), autoplay=(self)`.
- **S-14**: añadir cabecera `Cross-Origin-Embedder-Policy: credentialless` en `vercel.json`.
- **S-15**: mover seed de UUIDs de `0013_admin_users.sql:38-41` a un runbook fuera del repo, o sustituir nombres por iniciales en comentarios.

---

## 5 · Tabla resumen de hallazgos

| ID | Severidad | Bloque | Resumen | Archivo principal |
|---|---|---|---|---|
| P-01 | CRÍTICO | Privacidad | Avatares Google sin consent | `Home.tsx`, `useGoogleReviews.ts` |
| P-02 | CRÍTICO | Privacidad | "Cargar mapa" sin persistir consent | `Contact.tsx`, `CookieBanner.tsx` |
| P-03 | CRÍTICO | Privacidad | NIF ausente en RAT/AvisoLegal/Privacidad | `rat-2026.md`, `LegalNotice.tsx`, `PrivacyPolicy.tsx` |
| P-04 | ALTO | Privacidad | Turnstile sin documentar | `QuoteModal.tsx`, `PrivacyPolicy.tsx`, `rat-2026.md` |
| P-05 | ALTO | Privacidad | Toggle "marketing" sin uso | `CookieBanner.tsx` |
| P-06 | ALTO | Privacidad | Banner: "cookies de terceros" falso | `CookieBanner.tsx` |
| P-07 | ALTO | Privacidad | Cookies Maps obsoletas + falta Cloudflare | `CookiePolicy.tsx` |
| P-08 | MEDIO | Privacidad | Token 30d sin justificar | `CookiePolicy.tsx` |
| P-09 | MEDIO | Privacidad | Plazo dcb_session vs realidad | `rat-2026.md`, cron nuevo |
| P-10 | MEDIO | Privacidad | Marketing opt-in inexistente | `PrivacyPolicy.tsx` |
| P-11 | BAJO | Privacidad | Fechas desalineadas | `legal-versions.ts`, políticas |
| P-12 | BAJO | Privacidad | Sin versionado consent cookies | `CookieBanner.tsx` |
| L-01 | CRÍTICO | LSSI | Identificación prestador vacía | `0004_settings_carrito_seed.sql`, `LegalNotice.tsx` |
| L-02 | CRÍTICO | LSSI | Factura imposible sin datos | `order-place/index.ts` |
| L-03 | ALTO | LSSI | Forma jurídica asumida | `LegalNotice.tsx:122-165` |
| L-04 | ALTO | LSSI | Email fallback `@dcbikes.es` | `TermsOfSale.tsx:114` |
| L-05 | ALTO | LSSI | Soporte duradero modificable | `send-order-confirmation-customer/index.ts` |
| L-06 | MEDIO | LSSI | Pre-contractual ficha débil | `ProductDetail.tsx` |
| L-07 | MEDIO | LSSI | Confirmación solo por email | `OrderConfirmation.tsx` |
| L-08 | BAJO | LSSI | Idioma no declarado | `TermsOfSale.tsx` |
| C-01 | CRÍTICO | Consumo | No cumple Verifactu | `0020_verifactu.sql`, `generate-invoice-pdf` |
| C-02 | CRÍTICO | Consumo | Datos fiscales vacíos | `order-place/index.ts`, settings |
| C-03 | CRÍTICO | Consumo | Doble RPC correlativo | nueva `0019_drop_legacy_invoice_number.sql` |
| C-04 | CRÍTICO | Consumo | Descuentos sin 30d Omnibus | `0021_product_price_history.sql`, `ProductDetail.tsx` |
| C-05 | ALTO | Consumo | Plazos orientativos abusivos | `TermsOfSale.tsx:293-296` |
| C-06 | ALTO | Consumo | Personalización opaca | `Returns.tsx:213-214` |
| C-07 | ALTO | Consumo | Form desistimiento no adjunto | `send-order-confirmation-customer/index.ts` |
| C-08 | ALTO | Consumo | Soporte duradero modificable | cubierto por L-05 |
| C-09 | ALTO | Consumo | Factura simplificada >400€ sin NIF | `Checkout.tsx`, `generate-invoice-pdf` |
| C-10 | MEDIO | Consumo | URL ODR inconsistente | `TermsOfSale.tsx`, emails |
| C-11 | MEDIO | Consumo | Sin techo coste envío | `TermsOfSale.tsx` |
| C-12 | MEDIO | Consumo | IVA mono-tipo en breakdown | `generate-invoice-pdf` |
| C-13 | BAJO | Consumo | Inscripción registral pendiente | settings |
| S-01 | CRÍTICO | Seguridad | CORS wildcard global | `_shared/email-utils.ts` + ~40 sites |
| S-02 | CRÍTICO | Seguridad | pg_cron con placeholders/secretos | `0005`, `0012` migraciones |
| S-03 | ALTO | Seguridad | CSP unsafe-inline persiste | `vercel.json:28` |
| S-04 | ALTO | Seguridad | Token pedido 30d + secreto débil | `_shared/order-token.ts` |
| S-05 | ALTO | Seguridad | Signed URL factura en email 7d | `send-order-accepted-customer`, `email-utils.ts` |
| S-06 | ALTO | Seguridad | RLS data_breaches verificable | `pg_policy` audit |
| S-07 | ALTO | Seguridad | Procedimiento brechas inoperante | UI admin nueva + `procedimiento-brechas.md` |
| S-08 | MEDIO | Seguridad | Magic link token en URL | `customer-magic-link-request`, `MyOrdersRequestAccess` |
| S-09 | MEDIO | Seguridad | Rate-limit magic link sin IP | `customer-magic-link-request` |
| S-10 | MEDIO | Seguridad | Logs con PII | varios `console.log` |
| S-11 | MEDIO | Seguridad | CORS wildcard endpoints públicos | cubierto por S-01 |
| S-12 | MEDIO | Seguridad | redsys-notification silencia errores | `redsys-notification/index.ts:359-362` |
| S-13 | BAJO | Seguridad | Permissions-Policy parcial | `vercel.json:27` |
| S-14 | BAJO | Seguridad | Falta COEP | `vercel.json` |
| S-15 | BAJO | Seguridad | UUIDs admin en migración | `0013_admin_users.sql:38-41` |

---

## 6 · Sugerencia de invocación

Al pegar este archivo en una nueva sesión de Claude:

> Soy desarrollador del proyecto **DC Bikes Cantabria** (e-commerce React + Supabase + Vercel para tienda de ciclismo en El Astillero). Te paso el resultado de la auditoría legal V3 (48 hallazgos). Aplica los arreglos por sprints, empezando por el **Sprint 0 (bloqueantes)**. Detente al final de cada sprint para que pueda revisar. No avances al siguiente sin mi confirmación.
>
> [pegar contenido de este archivo]

---

**Fin del prompt · Versión 2026-05-27 · 48 hallazgos · 4 sprints · ~80 h trabajo total estimado**
