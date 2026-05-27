# Prompt de arreglos · Auditoría legal V5 (definitiva) · DC Bikes Cantabria

> **Uso**: pega este archivo a una nueva sesión de Claude. Es auto-contenido. La V5 detecta **122 hallazgos nuevos** + verifica que **65/66 hallazgos V4 persisten** porque no se aplicaron. Total a resolver: ~187 puntos.

---

## 0 · Contexto

- **Proyecto**: `dc-bikes-web` (e-commerce ciclismo Cantabria).
- **Stack**: React + TypeScript + Vite · Supabase (Postgres + Edge Functions Deno + Storage + Vault) · Vercel · Resend · Redsys · Cloudflare Turnstile · Google APIs.
- **Estado actual**: V1+V2+V3+V4 con 159 hallazgos acumulados. Cliente confirmó haber rellenado settings fiscales (cierra parcialmente P-03/L-01/C-13/C-02 del V3). Resto de V4 sin tocar (CORS residual, audit_log central, Verifactu real, accesibilidad WCAG, cadena DPA, DPIA, etc.).
- **V5 detecta**: 122 hallazgos nuevos (23 críticos · 44 altos · 37 medios · 18 bajos) en 4 ámbitos: Frontend (F), Backend (B), Schema+Docs (Q), Áreas ciegas + verificación V4 (X).
- **Veredicto V5**: NO APTO. 23 críticos bloquean apertura. Plan integrado a 4 sprints.

---

## 1 · Sprint 0 — EMERGENCIA (24–48 h, ~10 h código + acciones admin)

Cierra los 23 críticos más bloqueantes. Algunos requieren acción del titular (no son código).

### 1.1 · `Q-01` · ROTAR SECRETOS Y BORRAR ARCHIVO EN PLANO **(HOY)**

**Acción del titular (no código):**

1. **Rotar `SERVICE_ROLE_KEY`** en Supabase Dashboard → Project Settings → API → "Reset service_role key".
2. **Rotar `ORDER_CRON_SECRET`** y `DATA_RETENTION_CRON_SECRET`:
   ```bash
   openssl rand -hex 32  # nuevo valor
   ```
   Actualizar Vault de Supabase + env vars Edge Functions.
3. **Borrar archivo en plano**:
   ```bash
   shred -u "Docs/runbooks/secretos-generados-RECUPERAR.txt"
   # En Windows PowerShell:
   Remove-Item -Force "Docs\runbooks\secretos-generados-RECUPERAR.txt"
   ```
4. Crear `Docs/runbooks/secret-rotation.md` con periodicidad trimestral + procedimiento sin archivos en disco.

### 1.2 · `Q-02` · Fix cron analytics (columna inexistente)

**Migración nueva** `supabase/migrations/0028_fix_analytics_purge.sql`:

```sql
create or replace function purge_analytics_older_than_13_months()
returns void language plpgsql security definer set search_path = public as $$
declare
  cutoff timestamptz := now() - interval '13 months';
begin
  if to_regclass('public.product_views') is not null then
    delete from product_views where viewed_at < cutoff;
  end if;
  if to_regclass('public.search_queries') is not null then
    delete from search_queries where searched_at < cutoff;
  end if;
end $$;

-- Verificar invocando inmediatamente
do $$ begin perform purge_analytics_older_than_13_months(); end $$;
```

### 1.3 · `Q-03 + Q-07` · RLS inmutabilidad payments_log / invoices / order_status_history

**Migración nueva** `0029_rls_immutable_logs.sql`:

```sql
-- payments_log: solo SELECT + INSERT, sin UPDATE ni DELETE
drop policy if exists payments_log_admin on payments_log;
create policy payments_log_admin_select on payments_log for select to authenticated using (is_admin());
create policy payments_log_admin_insert on payments_log for insert to authenticated with check (is_admin());

-- invoices: idem (RD 1007/2023 Verifactu inalterabilidad)
drop policy if exists invoices_admin on invoices;
create policy invoices_admin_select on invoices for select to authenticated using (is_admin());
create policy invoices_admin_insert on invoices for insert to authenticated with check (is_admin());

-- order_status_history: idem (audit trail)
drop policy if exists order_status_history_admin on order_status_history;
create policy osh_admin_select on order_status_history for select to authenticated using (is_admin());
create policy osh_admin_insert on order_status_history for insert to authenticated with check (is_admin());
```

### 1.4 · `Q-06 + Q-08 + Q-09` · RLS settings, categories, products, counters con is_admin()

**Migración nueva** `0030_rls_admin_only.sql`:

```sql
-- settings: requiere is_admin()
drop policy if exists auth_settings on settings;
create policy settings_select_admin on settings for select to authenticated using (is_admin());
create policy settings_modify_admin on settings for all to authenticated using (is_admin()) with check (is_admin());

-- categories / products / product_images: requiere is_admin()
drop policy if exists auth_categories on categories;
drop policy if exists auth_products on products;
drop policy if exists auth_images on product_images;
create policy categories_modify on categories for all to authenticated using (is_admin()) with check (is_admin());
create policy products_modify   on products   for all to authenticated using (is_admin()) with check (is_admin());
create policy images_modify     on product_images for all to authenticated using (is_admin()) with check (is_admin());

-- order_counter / invoice_counter: solo service_role
drop policy if exists order_counter_admin on order_counter;
drop policy if exists invoice_counter_admin on invoice_counter;
create policy order_counter_service on order_counter for all to service_role using (true) with check (true);
create policy invoice_counter_service on invoice_counter for all to service_role using (true) with check (true);
```

### 1.5 · `B-01` · Escape HTML en send-quote-email

**Archivo**: `supabase/functions/send-quote-email/index.ts:93-102`.

```ts
import { escapeHtml } from '../_shared/email-utils.ts'

const safeEmail = escapeHtml(quote.email)
const safePhone = (quote.phone ?? '').replace(/[^\d+\s\-()]/g, '')  // sanea tel
const safeMsg = escapeHtml(quote.message ?? '—').replace(/\n/g, '<br>')

// y en el HTML usar siempre:
// <td>...<a href="mailto:${safeEmail}">${safeEmail}</a></td>
// <td><a href="tel:${safePhone}">${escapeHtml(safePhone)}</a></td>
// <td>${safeMsg}</td>
```

### 1.6 · `B-02 + B-04` · Auth interna en send-customer-magic-link (y todos los send-*)

**Archivo**: `supabase/functions/send-customer-magic-link/index.ts`.

```ts
// Header validator al inicio del handler
const internalSecret = Deno.env.get('INTERNAL_INVOKE_SECRET') ?? ''
const receivedSecret = req.headers.get('x-internal-secret') ?? ''
if (!internalSecret || !timingSafeEq(receivedSecret, internalSecret)) {
  return jsonError('forbidden', 403, req)
}

// Y validar token contra BD
const { data: session } = await supabase
  .from('customer_sessions')
  .select('id')
  .eq('token_hash', await sha256(token))
  .eq('email', email.toLowerCase())
  .gt('expires_at', new Date().toISOString())
  .maybeSingle()
if (!session) return jsonError('invalid token', 400, req)
```

Aplicar **el mismo header `x-internal-secret`** a TODOS los `send-*` y pasar el secret desde los `supabase.functions.invoke(...)` callers.

### 1.7 · `B-03` · Turnstile fail-closed

**Archivo**: `supabase/functions/quote-submit/index.ts:38-44`.

```diff
- if (!secret) {
-   console.warn('[quote-submit] TURNSTILE_SECRET no configurado — verificación captcha omitida')
-   return true
- }
+ if (!secret) {
+   console.error('[quote-submit] TURNSTILE_SECRET MISSING — refusing all submissions')
+   // Alertar al DPO si aplica
+   return false  // fail-closed
+ }
```

### 1.8 · `F-03` · Unificar key de CIF en una sola fuente

1. Crear `src/hooks/useLegalIdentity.ts`:
   ```ts
   import { useEffect, useState } from 'react'
   import { supabase } from '@/lib/supabase'

   export interface LegalIdentity {
     companyName: string | null
     cif: string | null
     address: string | null
     formaJuridica: string | null
     inscripcion: string | null
   }

   export function useLegalIdentity() {
     const [data, setData] = useState<LegalIdentity | null>(null)
     useEffect(() => {
       supabase.from('settings').select('key,value')
         .in('key', ['legal_company_name', 'legal_company_cif', 'legal_company_address', 'legal_forma_juridica', 'legal_inscripcion'])
         .then(({ data: rows }) => {
           const map = Object.fromEntries((rows ?? []).map(r => [r.key, r.value]))
           setData({
             companyName: map.legal_company_name ?? null,
             cif: map.legal_company_cif ?? null,
             address: map.legal_company_address ?? null,
             formaJuridica: map.legal_forma_juridica ?? null,
             inscripcion: map.legal_inscripcion ?? null,
           })
         })
     }, [])
     return data
   }
   ```
2. Sustituir lecturas en `LegalNotice.tsx`, `PrivacyPolicy.tsx`, `TermsOfSale.tsx`, `Footer.tsx` por `useLegalIdentity()`.
3. Eliminar la key legacy `legal_nif` de `Settings.tsx` y de cualquier código que la lea.
4. Si en BD hay valor en `legal_nif`, migrar manualmente: `UPDATE settings SET value = (SELECT value FROM settings WHERE key='legal_nif') WHERE key='legal_company_cif' AND value IN ('""', NULL);`

### 1.9 · `F-04` · Eliminar dark pattern accepted_approval_flow

**Archivos**: `src/pages/public/Checkout.tsx:681-698` + `src/schemas/checkout.ts:103-114`.

```diff
- accepted_approval_flow: z.boolean().refine(v => v === true, 'Debes aceptar el plazo de confirmación de 48h'),
+ // accepted_approval_flow eliminado — la cláusula 48h se incorpora a Términos
```

En `Checkout.tsx`: eliminar el checkbox completo (líneas 681-698). Asegurar que la cláusula 4.5 de Términos cubre el plazo 48h. Si se quiere mantener visualización, hacerlo como párrafo informativo no-interactivo.

### 1.10 · `F-05` · Reescribir declaración de accesibilidad

**Archivo**: `src/pages/public/LegalNotice.tsx:274-291`.

```diff
- DC Bikes Cantabria se acoge a la exención prevista en el artículo 4.1 de la Ley 11/2023...
- La obligación de cumplir con los requisitos de accesibilidad WCAG 2.1 AA establecidos por
- dicha ley no resulta de aplicación al presente sitio web.
+ DC Bikes Cantabria trabaja para cumplir progresivamente los requisitos de accesibilidad
+ WCAG 2.1 AA exigidos por el Reglamento (UE) 2019/882 y la Ley 11/2023, vigentes para
+ servicios de comercio electrónico desde el 28 de junio de 2025. Esta web está en
+ proceso de adaptación.
+
+ Si encuentras una barrera de accesibilidad, contacta con info@dcbikescantabria.es;
+ responderemos en plazo máximo de 14 días naturales. También puedes presentar
+ reclamación ante la AESIA (Agencia Española de Supervisión de la Inteligencia Artificial,
+ órgano competente) o ante la Defensoría del Pueblo.
```

Planificar auditoría WCAG 2.1 AA con plan de remediación documentado.

### 1.11 · `X-20` · Bump legal-versions.ts a V5

**Archivo**: `src/lib/legal-versions.ts`.

```diff
- export const LAST_AUDIT_DATE = '2026-05-27' // V3
+ export const LAST_AUDIT_DATE = '2026-05-27'
+ export const AUDIT_VERSION = 'V5'
+
+ // Changelog:
+ //   2026-05-26  V1  → 27 hallazgos iniciales (cookies, aviso legal, ODR)
+ //   2026-05-26  V2  → 18 hallazgos adicionales (admin model, signed URLs)
+ //   2026-05-27  V3  → 48 hallazgos (Verifactu, Omnibus, accesibilidad)
+ //   2026-05-27  V4  → 66 hallazgos (DSA, DPIA, race conditions, audit log)
+ //   2026-05-27  V5  → 122 hallazgos (definitiva: RLS, secretos, dark patterns, DSA)

- export const TERMS_VERSION = '2026-05-26-v1'
- export const PRIVACY_VERSION = '2026-05-26-v1'
- export const COOKIES_VERSION = '2026-05-26-v1'
+ export const TERMS_VERSION = '2026-05-27-v5'
+ export const PRIVACY_VERSION = '2026-05-27-v5'
+ export const COOKIES_VERSION = '2026-05-27-v5'
+ export const RETURNS_VERSION = '2026-05-27-v5'
```

### 1.12 · `X-21 + Q-16 + V4-10` · Rellenar [PENDIENTE] en RAT y procedimiento-brechas

**Manualmente con los datos reales del titular**:
- `Docs/legal/rat-2026.md:14-19` — sustituir todos los `[PENDIENTE]` por la razón social/NIF/dirección reales.
- `Docs/legal/procedimiento-brechas.md:148-191` — sustituir `[PENDIENTE]` y `{email_dpo}` por designación firmada del responsable.
- Adicionalmente: si el titular es la misma persona que lleva los datos, crear `Docs/legal/designacion-responsable-privacidad.md` firmado.

---

## 2 · Sprint 1 — Críticos restantes (2 semanas, ~35 h)

### 2.1 · `B-05 + B-06 + B-07` · Optimistic locking + RPC transaccional

**Patrón universal** para `order-accept`, `order-reject`, `customer-order-cancel`, `order-mark-shipped`, `redsys-notification`:

```ts
const { data: updRows, error: uErr } = await supabase
  .from('orders')
  .update(updatePayload)
  .eq('id', orderId)
  .eq('status', expectedStatus)  // ← optimistic lock
  .select('id')

if (uErr || !updRows || updRows.length !== 1) {
  // El estado cambió entre LOAD y UPDATE. Revertir Redsys si aplica.
  if (capturedRedsys) {
    await runRedsysOperation({ config, redsysOrderId, op: { kind: 'cancel', amountCents: order.total_cents } })
    await logPayment(supabase, orderId, 'cancel', /* result */, '9')
  }
  return jsonError('conflicto de concurrencia', 409, req)
}
```

**Mejor**: RPC PL/pgSQL atómica con `SELECT FOR UPDATE`:

```sql
-- 0031_atomic_order_transitions.sql
create or replace function accept_order(p_order_id uuid, p_admin_id uuid)
returns table(order_id uuid, prev_status text, new_status text)
language plpgsql security definer set search_path = public as $$
declare
  o orders;
begin
  select * into o from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if o.status <> 'authorized' then raise exception 'invalid state %', o.status; end if;
  update orders set status='accepted', accepted_by=p_admin_id, accepted_at=now() where id=p_order_id;
  return query select o.id, o.status, 'accepted'::text;
end $$;
```

Solo invocar Redsys **después** de la RPC. Si Redsys falla, llamar a `reject_order` para revertir.

**Reserva stock atómica** (B-07):

```sql
create or replace function reserve_stock(p_items jsonb)
returns void language plpgsql security definer as $$
declare item record;
begin
  for item in select * from jsonb_to_recordset(p_items) as x(product_id uuid, qty int) loop
    update products set stock = stock - item.qty
      where id = item.product_id and stock >= item.qty;
    if not found then raise exception 'insufficient stock for %', item.product_id; end if;
  end loop;
end $$;
```

### 2.2 · `Q-04` · Crear tabla consent_audit inmutable

```sql
-- 0032_consent_audit_table.sql
create table consent_audit (
  id           bigserial primary key,
  order_id     uuid references orders(id) on delete set null,
  customer_email text not null,
  consent_type text not null check (consent_type in ('terms','privacy','cookies','marketing')),
  consent_version text not null,
  consent_action text not null check (consent_action in ('grant','revoke')),
  ip_address   text,
  user_agent   text,
  occurred_at  timestamptz not null default now()
);

create index consent_audit_email_idx on consent_audit(customer_email);
create index consent_audit_order_idx on consent_audit(order_id);

alter table consent_audit enable row level security;
create policy consent_audit_admin_select on consent_audit for select to authenticated using (is_admin());
-- NO update, NO delete → inmutable
revoke all on consent_audit from authenticated, anon;
grant insert, select on consent_audit to service_role;
```

En `order-place`: hacer `INSERT INTO consent_audit` por cada checkbox aceptado. En la página de revocación: insertar `consent_action = 'revoke'`.

### 2.3 · `Q-05` · Audit log central

Crear migración `0033_audit_log.sql` exactamente como propuso V4 (tabla central + triggers en `settings`, `admin_users`, `data_breaches`, `products.retail_price`). Ver V4-arreglos.md sección 2.3 para SQL completo.

### 2.4 · `F-01` · Rediseñar consentimientos del checkout

**Archivos**: `Checkout.tsx`, `schemas/checkout.ts`.

```diff
- accepted_terms: z.boolean().refine(v => v === true, 'Debes aceptar los Términos y Condiciones'),
- accepted_privacy: z.boolean().refine(v => v === true, 'Debes aceptar la Política de Privacidad'),
- accepted_approval_flow: z.boolean().refine(v => v === true, 'Debes aceptar el plazo de confirmación de 48h'),
+ accepted_terms: z.boolean().refine(v => v === true, 'Debes aceptar los Términos y Condiciones'),
+ read_privacy: z.boolean().refine(v => v === true, 'Confirma haber leído la Política de Privacidad'),
```

UI:
```tsx
<label>
  <input type="checkbox" {...register('accepted_terms')} />
  <span>He leído y acepto los <Link to="/terminos-venta">Términos y Condiciones de Venta</Link>
  (incluida la cláusula 4.5 sobre el plazo de confirmación de 48h).</span>
</label>

<p className="text-xs text-muted">
  Tus datos se tratan en base a la ejecución del contrato (RGPD art. 6.1.b).
  Consulta nuestra <Link to="/privacidad">Política de Privacidad</Link>.
</p>

<label>
  <input type="checkbox" {...register('read_privacy')} />
  <span>Confirmo haber leído la Política de Privacidad.</span>
</label>
```

### 2.5 · `F-02` · Política privacidad: completar tabla encargados

En `src/pages/public/PrivacyPolicy.tsx` sección 7, expandir la tabla con:
- **Qué datos recibe cada encargado** (nombre, email, IP, contenido PDF, etc.).
- **Base concreta de transferencia**: DPF (si está en lista activa) o CCT 2021/914.
- Verificar HOY en `https://www.dataprivacyframework.gov/list` la certificación de Resend, Vercel, Cloudflare, Google.
- Si Resend NO está en DPF: mantener solo CCT.

### 2.6 · `F-06` · QuoteModal: granular + Turnstile diferido

**Archivo**: `src/components/public/QuoteModal.tsx`.

```tsx
// Cargar Turnstile diferido (al primer foco en input)
const [turnstileLoaded, setTurnstileLoaded] = useState(false)
const onFirstFocus = () => setTurnstileLoaded(true)
// ...
<input onFocus={onFirstFocus} ... />
{turnstileLoaded && <Turnstile siteKey={...} />}

// Texto del checkbox de privacidad
<label>
  <input type="checkbox" {...register('privacy')} />
  <span>He leído y acepto la <Link to="/privacidad">Política de Privacidad</Link>.
  Mis datos serán procesados por: DC Bikes (Supabase EU-Irlanda), Resend (EE.UU., CCT 2021/914)
  para enviarte respuesta por email, y Cloudflare (EE.UU., DPF) para verificación anti-fraude.</span>
</label>
```

### 2.7 · `B-08` · Fix google-reviews

**Archivo**: `supabase/functions/google-reviews/index.ts:1-10`.

```diff
- // ReferenceError: corsPreflightResponse is not defined
+ import { buildCorsHeaders, corsPreflightResponse, jsonError, jsonOk } from '../_shared/email-utils.ts'
- // Eliminar CORS local wildcard
+ // Usar buildCorsHeaders(req) en todas las respuestas
```

### 2.8 · `X-01` · Punto contacto DSA

**Archivo**: `src/pages/public/LegalNotice.tsx`. Añadir sección 9:

```jsx
<section id="dsa" className="space-y-3">
  <h2 className="text-xl font-bold">9. Punto de contacto único (Reglamento UE 2022/2065 - DSA)</h2>
  <p>
    Conforme al artículo 11 del Reglamento (UE) 2022/2065 (Ley de Servicios Digitales), designamos como
    punto de contacto único para autoridades, usuarios y la Comisión Europea:
  </p>
  <ul>
    <li><strong>Email</strong>: <a href="mailto:dsa@dcbikescantabria.es">dsa@dcbikescantabria.es</a></li>
    <li><strong>Idiomas de comunicación</strong>: Español e Inglés</li>
    <li><strong>Mecanismo notice-and-action</strong>: para denunciar contenido ilícito (reseñas inadecuadas, etc.),
        envía un email a la dirección anterior con asunto "DSA notice". Te responderemos sin demora indebida.</li>
  </ul>
</section>
```

### 2.9 · `X-10` · Endpoint customer-data-export

**Edge Function nueva** `supabase/functions/customer-data-export/index.ts`:

```ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders, jsonError, jsonOk, maskEmail } from '../_shared/email-utils.ts'
import { verifyCustomerSession } from '../_shared/customer-session.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: buildCorsHeaders(req) })
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? ''
  const session = await verifyCustomerSession(token)
  if (!session) return jsonError('unauthorized', 401, req)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const [orders, quotes, consents, sessions] = await Promise.all([
    supabase.from('orders').select('*').eq('customer_email', session.email),
    supabase.from('quote_requests').select('*').eq('email', session.email),
    supabase.from('consent_audit').select('*').eq('customer_email', session.email),
    supabase.from('customer_sessions').select('id,created_at,expires_at,ip_address,user_agent').eq('email', session.email),
  ])

  // Registrar en data_subject_requests
  await supabase.from('data_subject_requests').insert({
    type: 'access', requester_email: session.email, status: 'fulfilled', resolved_at: new Date().toISOString(),
  })

  console.log(`[customer-data-export] email=${maskEmail(session.email)} orders=${orders.data?.length}`)

  return jsonOk({
    exported_at: new Date().toISOString(),
    customer_email: session.email,
    orders: orders.data ?? [],
    quote_requests: quotes.data ?? [],
    consent_audit: consents.data ?? [],
    sessions: sessions.data ?? [],
  }, req)
})
```

UI en `/mis-pedidos`: botón "Descargar mis datos" que llame al endpoint y descargue el JSON.

---

## 3 · Sprint 2 — Altos (3 semanas, ~50 h)

44 altos repartidos. Aplica los siguientes en este orden:

### Frontend (F-07 a F-17)
- F-07: añadir checkbox privacidad en `MyOrdersRequestAccess.tsx`.
- F-08: `controls` + `prefers-reduced-motion` en vídeos `Contact.tsx`.
- F-09: eliminar `https://lh3.googleusercontent.com` del CSP img-src en `vercel.json`.
- F-10: reducir delay del banner a 0 ms.
- F-11: `Configurar` con `variant="secondary"` (mismo peso visual).
- F-12: limpiar contradicción bicis online entre `Returns.tsx` y `TermsOfSale.tsx`.
- F-13: usar `isValidSpanishId()` también en `schemas/settings.ts`.
- F-14: unificar referencia legal en `OrderConfirmation.tsx` y `TermsOfSale.tsx` ("arts. 114–127 RDL 1/2007").
- F-15: añadir `confirm()` antes de `reload()` en `CookiePolicy.tsx`.
- F-16: añadir enlace "Accesibilidad" al `Footer.tsx`.
- F-17: replicar total visible en móvil junto al botón submit.

### Backend (B-09 a B-18)
- B-09: refactor CORS dinámico — eliminar `CORS_HEADERS` export y `cron-healthcheck`/`quote-submit`/`google-avatar-proxy` con `buildCorsHeaders(req)`.
- B-10: `maskEmail(session.email)` en TODOS los `console.*` que lo referencien.
- B-11: NO loguear ninguna parte del `RESEND_API_KEY`.
- B-12: helper `timingSafeEq()` para comparar secretos en `order-auto-cancel`, `cron-healthcheck`, `data-retention-cron`.
- B-13: validar `Ds_Amount === order.total_cents` en `redsys-notification`.
- B-14: anti-replay timestamp + tabla `redsys_notification_dedup`.
- B-15: rate-limit por IP en `order-public-get` (30 req/min).
- B-16: eliminar `shipping_city` y `shipping_postal_code` del payload de `order-public-get`.
- B-17: crear `deno.json` + `import_map.json` + `deno.lock` con SHA-256.
- B-18: constraint SQL `customer_email = lower(customer_email)`.

### Schema (Q-08 a Q-19)
- Q-08/Q-09: ya en Sprint 0 (0030_rls_admin_only.sql).
- Q-10: añadir `pg_advisory_xact_lock(hashtext('inv_b2c_' || p_year))` en las funciones de correlativo.
- Q-11: `pg_try_advisory_lock(hashtext('data-retention-cron'))` al inicio del cron.
- Q-12: añadir `purged_at` a `customer_sessions` + cron purga.
- Q-13: mover `.template.sql` a `Docs/historic/` o reemplazar contenido por comentario.
- Q-14: `alter table quote_requests add column revoked_at, purged_at` + extender retention cron.
- Q-15: declarar buckets en migración SQL + RLS con `is_admin()`.
- Q-16: cubierto Sprint 0.
- Q-17: actualizar RAT con plazos diferenciados (LGT 4 años, art. 70 RDL 1/2007 5 años, Ley 7/2012 10 años para >25 K€).
- Q-18: cubierto Sprint 0.
- Q-19: añadir cláusula PITR al procedimiento supresión.

### Áreas (X-02 a X-25)
- X-02: botón "Reportar contenido" junto a reseñas + crear `Docs/legal/procedimiento-dsa-notice-action.md`.
- X-03: crear `Docs/legal/preparacion-crea-y-crece.md` con roadmap Facturae.
- X-04: migración `products.ce_marking`, `safety_standards`, `manufacturer_eu` + render en `ProductDetail.tsx`.
- X-05: alta titular en Ecoembes + nº adherido en footer y factura.
- X-11: añadir leyenda "Reseñas reales publicadas en Google Maps. DC Bikes no las modera." en `Home.tsx`.
- X-12: trigger SQL que anonimice `quote_requests.message` tras 1 año.
- X-16: crear `Docs/legal/protocolo-requerimientos-autoridades.md`.
- X-17: OTP de 6 dígitos por email antes de Redsys (opcional, decisión del titular).
- X-22: crear `Docs/legal/analisis-dpia.md` aunque conclusión sea "no procede".
- X-25: crear `Docs/legal/sucesion-empresa-cierre.md`.

---

## 4 · Sprint 3 — Medios y bajos (3-4 semanas, ~35 h)

### Frontend medios (F-18 a F-26)
- F-18: `aria-describedby` en botón "Cargar mapa".
- F-19: actualizar inventario cookies Maps con DevTools real.
- F-20: añadir JSON-LD Product/Offer en `ProductDetail.tsx`.
- F-21: usar `RETURNS_VERSION` en `Returns.tsx`.
- F-22: crear `Docs/legal/lia-google-reviews.md` con test 3 pasos.
- F-23: documentar licencias Bebas Neue / Barlow.
- F-24: respetar `prefers-reduced-motion` en splash + botón "Saltar".
- F-25: `aria-required` en `Field.tsx`.
- F-26: añadir fecha "última revisión legal" al `Footer.tsx`.

### Frontend bajos (F-27 a F-30)
- F-27/F-28/F-29: `aria-hidden="true"` en TODOS los iconos lucide y emojis decorativos.
- F-30: sustituir emoji 📊 por icono SVG en `CookieBanner.tsx`.

### Backend medios (B-19 a B-28)
- B-19: usar `supabase.functions.invoke('generate-order-contract')` en lugar de fetch externo.
- B-20: loguear solo `mockBody.order_id?.slice(0, 8)`.
- B-21: RPC `update products set stock = stock + p_qty where id = p_id` atómica.
- B-22: gate `verifactu_mode` en `order-place` + crear `verifactu-send-cron` (cuando XAdES esté).
- B-23: extender `data-retention-cron` a `order_status_history.reason`, `order_items.product_name`.
- B-24: NO persistir diff con direcciones en claro en `order_status_history.reason`.
- B-25: `JSON.parse` con replacer anti-prototype-pollution + límite 64 KB en settings.
- B-26: `upsert: false` en `generate-order-contract` + nombre con versión.
- B-27: content-length cap en `order-place`, `quote-submit`, `customer-magic-link-request`.
- B-28: `pg_advisory_xact_lock(hashtext('invoices_chain'))` antes de generar hash.

### Backend bajos (B-29 a B-34)
- B-29: `jsonError('internal error', 500, req)` + loguear detalle solo a `console.error`.
- B-30: `getSiteUrl()` con `throw` si falta.
- B-31: content-length cap en `google-avatar-proxy`.
- B-32: `escapeHtml(String(it.quantity))` por defensa.
- B-33: añadir `buildCorsHeaders(req)` a la respuesta 403 de `redsys-notification`.
- B-34: validar formato fuerte de email en `parseEmailCsv`.

### Schema medios (Q-20 a Q-28)
- Q-20: tabla `consent_audit` separada (ya en Sprint 1 Q-04).
- Q-21: `set_updated_at()` con `security invoker set search_path = public, pg_temp`.
- Q-22: añadir `internally_escalated_at`, `legal_counsel_contacted_at` a `data_breaches`.
- Q-23: documentar procedimiento recovery `admin_users` vacío vía service_role.
- Q-24: `revoke all` + `grant execute` explícito en TODAS las funciones SECURITY DEFINER.
- Q-25: añadir `changed_by` y `change_reason` a `product_price_history`.
- Q-26: crear 11 documentos legales faltantes (DPIA, política conservación, sub-encargados, registro DPAs, TIAs, etc.).
- Q-27: añadir mención derecho AEPD + plazos en plantilla supresión.
- Q-28: CHECK constraint en `quote_requests.status`.

### Schema bajos (Q-29 a Q-31)
- Q-29: CHECK regexp en `customer_email`, `quote_requests.email`.
- Q-30: eliminar migración no-op 0026.
- Q-31: corregir cabecera 0027.

### Áreas medios y bajos (X-06 a X-27)
- X-06: implementar `tax_rate_pct` por línea (V3 C-12) + categorizar catálogo con asesoría.
- X-07: validar país=ES + CP no canario en `checkout.ts` schema.
- X-08: Edge Function `validate-vat` consumiendo VIES + restringir B2B a NIF español.
- X-09: añadir cláusula 12 "idioma español único" en `TermsOfSale.tsx`.
- X-13: render precio mínimo 30d en `ProductDetail.tsx` (V3 C-04 final).
- X-14: añadir tooltip "Al hacer click sales del sitio" en redes sociales.
- X-15: eliminar mención Bizum de `TermsOfSale.tsx:267`.
- X-18: añadir Turnstile a `MyOrdersRequestAccess.tsx`.
- X-19: crear `Docs/legal/politica-subencargados.md` (cubierto por Q-26).
- X-23: actualizar `PrivacyPolicy.tsx` para describir `consent_audit`.
- X-24: añadir `aria-label="Instagram"` / `aria-label="Facebook"` en SVG del footer.
- X-26: añadir matriz "qué anonimizar vs qué conservar" en `procedimiento-supresion.md`.
- X-27: añadir condiciones específicas servicios taller en `Workshop.tsx`.

---

## 5 · V4 retomado en paralelo (~100 h adicionales)

Los **65/66 hallazgos V4 persisten** y deben aplicarse junto a V5:

- **V4 Críticos restantes**: O-01 (race conditions universales — solapa con B-05), O-02 (anti-replay Redsys — solapa con B-14), O-03 (audit_log — solapa con Q-05), C-01 (Verifactu XAdES + AEAT real), S-01 (CORS — solapa con B-09).
- **V4 Bloque A (accesibilidad)**: A-01 a A-17 (skip-link, contraste, focus-trap, ARIA live, semantica h1, etc.).
- **V4 Bloque D (cadena encargados)**: D-01 a D-14 (subencargados, DPIA, B2C/B2B, política conservación, etc.).
- **V4 Bloque O (operativa)**: O-04 a O-16 (audit lectura PII, RLS consent_audit, backups/DR, SPF/DKIM/DMARC, resend-bounce-handler, etc.).

Consultar `auditoria-legal-2026-05-27-v4-arreglos.md` para detalles.

---

## 6 · Tabla resumen V5 — 122 hallazgos

| Bloque | Crit | Alto | Medio | Bajo | Total | Tiempo |
|---|---|---|---|---|---|---|
| F · Frontend | 6 | 11 | 9 | 4 | 30 | ~25 h |
| B · Backend | 7 | 11 | 10 | 6 | 34 | ~40 h |
| Q · Schema + Docs | 7 | 11 | 9 | 4 | 31 | ~30 h |
| X · Áreas ciegas | 3 | 11 | 9 | 4 | 27 | ~30 h |
| **TOTAL V5** | **23** | **44** | **37** | **18** | **122** | **~125 h** |
| **V4 sin aplicar** | 11 | 17 | 13 | 7 | 65 | ~100 h |
| **GRAN TOTAL** | **34** | **61** | **50** | **25** | **187** | **~225 h** |

---

## 7 · Acciones administrativas del titular (no son código)

1. **HOY**: rotar `SERVICE_ROLE_KEY` + `ORDER_CRON_SECRET` en Supabase Dashboard. Borrar `secretos-generados-RECUPERAR.txt` del disco.
2. **Esta semana**: rellenar `[PENDIENTE]` en `rat-2026.md` y `procedimiento-brechas.md`. Firmar `designacion-responsable-privacidad.md`.
3. **2 semanas**: gestionar **alta SCRAP envases** con Ecoembes (autónomo: cuota proporcional).
4. **2 semanas**: confirmar certificación CE/EN 1078 con proveedores de cascos.
5. **1 mes**: asesoría fiscal para categorización **IVA reducido** (productos elegibles) + roadmap **Crea y Crece** (Facturae B2B).
6. **2 meses**: decisión Verifactu (modo `verifactu` envío AEAT real-time vs `no_verifactu` con XAdES local) — requiere asesoría fiscal + integración SOAP AEAT.
7. **Trimestral**: rotación de secretos documentada (`secret-rotation.md`).

---

## 8 · Sugerencia de invocación

Pegar este archivo a una nueva sesión de Claude con prompt:

> Soy desarrollador del proyecto **DC Bikes Cantabria** (e-commerce React + Supabase + Vercel). Te paso la auditoría legal definitiva **V5** (122 hallazgos nuevos + 65 V4 pendientes = 187 puntos totales). Aplica los arreglos por sprints, **empezando obligatoriamente por el Sprint 0 (EMERGENCIA)** que son ~10 h de código + acciones administrativas del titular. Detente al final de cada sprint para que pueda revisar y confirmar. No avances al siguiente sin mi aprobación explícita.
>
> [pegar contenido de este archivo]

---

**Fin del prompt · Versión 2026-05-27 V5 (definitiva) · 122 hallazgos nuevos + 65 V4 pendientes · 4 sprints · ~225 h trabajo total estimado**
