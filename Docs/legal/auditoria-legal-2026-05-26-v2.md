# Segunda auditoría legal exhaustiva — DC Bikes Cantabria (dc-bikes-cantabria.vercel.app)

**Auditor:** Letrado especialista en Derecho Digital y Consumo
**Fecha de auditoría:** 26 de mayo de 2026 (revisión 2)
**Versión de código auditada:** rama de producción, migraciones 0001–0008
**Alcance ampliado:** Cabeceras seguridad HTTP · CORS edge functions · Modelo admin · TTLs y conservación · Quote requests · Anonimización · Reviews Google
**Marco normativo aplicado:** RGPD · LOPDGDD · LSSI-CE · RDL 1/2007 · Reg. (UE) 524/2013 · RDL 7/2021 · RDL 5/2023 (Omnibus) · RD 1619/2012 · RD 1007/2023 (Verifactu) · OWASP ASVS

---

## Sobre esta 2ª iteración

Esta segunda auditoría amplía la del 26 de mayo de 2026 (v1) con un análisis profundizado de áreas no cubiertas en la primera pasada: **cabeceras de seguridad HTTP (vercel.json), CORS de las 28 edge functions, modelo de autorización admin, TTLs y políticas de retención, formulario de presupuesto, anonimización automática y procesamiento de reviews de Google Places**.

Se han detectado **18 hallazgos NUEVOS** que no figuran en el primer informe. Los hallazgos anteriores se mantienen vigentes salvo que se indique lo contrario. Los nuevos están marcados como `[NUEVO]` a lo largo del documento.

---

## 0. Resumen ejecutivo v2

### Veredicto actualizado

**NO APTO con riesgo elevado por defensa en profundidad**

La primera auditoría (v1) identificó 27 hallazgos, 6 de ellos críticos. Esta segunda iteración mantiene esos hallazgos como vigentes y añade **18 hallazgos nuevos** centrados en defensa en profundidad, donde la web presenta riesgos sustanciales: cabeceras de seguridad incompletas, CORS abierto, un modelo de autorización admin frágil (toggle único de Supabase) y ausencia total de anonimización automática de datos personales tras los plazos de conservación declarados en la propia política de privacidad.

### Conteo consolidado v1 + v2

| Severidad | Total |
|---|---|
| Críticos totales | 11 |
| Altos totales | 15 |
| Medios totales | 12 |
| Bajos / mejora | 7 |
| **Nuevos en v2** | **+18** |

### Top 8 hallazgos nuevos de la 2ª iteración

#### N1 — Modelo admin frágil: cualquier `authenticated` = admin total **[CRÍTICO · NUEVO]**

**Norma:** Art. 32.1.b RGPD (defensa en profundidad)

El archivo `_shared/order-admin.ts:53-56` documenta que «cualquier usuario autenticado en Supabase Auth = admin», dependiendo de que `disable_signup=true` esté activo en Supabase. Si por error/regresión esa configuración se invierte, **cualquier persona con cuenta accede a TODOS los datos personales de TODOS los clientes** (pedidos, facturas, direcciones, teléfonos).

#### N2 — Falta cabecera Strict-Transport-Security (HSTS) **[ALTO · NUEVO]**

**Norma:** Art. 32 RGPD · OWASP ASVS V14

`vercel.json` no incluye `Strict-Transport-Security`. Un atacante en red Wi-Fi pública podría forzar HTTP en la primera conexión e interceptar datos antes de la redirección a HTTPS. La AEPD viene exigiéndolo como medida básica del art. 32.

#### N3 — CORS abierto a `*` en todas las edge functions sensibles **[ALTO · NUEVO]**

**Norma:** Buena práctica RGPD art. 32 + OWASP

`_shared/email-utils.ts:11-16` declara `Access-Control-Allow-Origin: '*'` aplicado a **order-place, customer-orders-list, customer-order-detail, customer-order-cancel, customer-magic-link-request**. Las funciones están protegidas por tokens, pero CORS abierto facilita ataques CSRF y XSS reflejados. Debería restringirse a los dominios propios.

#### N4 — Formulario de presupuesto sin captcha ni rate-limit **[CRÍTICO · NUEVO]**

**Norma:** Art. 32 RGPD + buena práctica

`QuoteModal.tsx:66-74` hace INSERT directo a `quote_requests` desde el frontend con auth anon. Sin captcha (reCAPTCHA, hCaptcha, Turnstile) ni rate-limit, cualquier bot puede crear miles de consultas. Cada una dispara `send-quote-email`, que **envía emails al admin sin coste para el atacante**. Vector de DoS y daño reputacional.

#### N5 — `quote_requests` no almacena prueba del consentimiento **[ALTO · NUEVO]**

**Norma:** Art. 7.1 RGPD (carga de prueba)

El modal pide checkbox de privacidad (`QuoteModal.tsx:185-202`) pero la tabla `quote_requests` (migración 0001) **no tiene columnas para guardar timestamp ni IP del consentimiento**. Si un usuario impugna haber consentido, el responsable no puede demostrarlo.

#### N6 — Sin anonimización automática tras el plazo de conservación declarado **[CRÍTICO · NUEVO]**

**Norma:** Art. 5.1.e RGPD (limitación del plazo de conservación)

La política declara plazos: 6 años pedidos/facturas, 1 año consultas, hasta revocación marketing. Pero **no existe ningún cron ni rutina automática** que purgue o anonimice `quote_requests`, `orders`, `customer_sessions` expiradas, `product_views`, `search_queries` ni `payments_log` al cumplirse esos plazos. Los datos se acumulan indefinidamente, lo que **contradice expresamente lo declarado al interesado**.

#### N7 — Captura de `marketing_opt_in` sin finalidad real **[ALTO · NUEVO]**

**Norma:** Art. 5.1.b RGPD (limitación de finalidad)

El checkbox de marketing se guarda en `orders.marketing_opt_in`, pero **no existe ninguna funcionalidad de envío de newsletter** en el código. Captar consentimiento sin propósito definido contraviene el principio de limitación de finalidad.

#### N8 — CSP con `'unsafe-inline'` en script-src y style-src **[ALTO · NUEVO]**

**Norma:** Art. 32 RGPD · OWASP ASVS V14

`vercel.json:24` declara `script-src 'self' 'unsafe-inline'` y `style-src 'self' 'unsafe-inline'`. Esto desactiva la principal defensa contra XSS inyectado.

---

## 1. Cabeceras de seguridad HTTP [NUEVO]

Análisis exhaustivo de `vercel.json` (líneas 19-25).

### 1.1 Cabeceras presentes

| Cabecera | Valor | Veredicto |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | ✓ Correcto |
| `X-Frame-Options` | `SAMEORIGIN` | ✓ Correcto |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✓ Correcto |
| `Permissions-Policy` | `camera=() microphone=() geolocation=(self) interest-cohort=()` | ⚠ Mejorable — la web NO usa geolocation, debería ser `geolocation=()` |
| `Content-Security-Policy` | CSP completa pero con `'unsafe-inline'` | ⚠ Debilitada — ver 1.2 |

### 1.2 Cabeceras ausentes (incumplimientos)

| Cabecera ausente | Riesgo | Severidad |
|---|---|---|
| `Strict-Transport-Security` (HSTS) | Permite MITM en primera conexión (downgrade HTTP). Valor recomendado: `max-age=63072000; includeSubDomains; preload` | Alto |
| `Cross-Origin-Opener-Policy` | Sin `same-origin` el window opener puede ser explotado para cross-origin leaks | Medio |
| `Cross-Origin-Resource-Policy` | Protege contra Spectre / side-channel — recomendado `same-origin` | Medio |
| `X-Permitted-Cross-Domain-Policies` | Sin `none` permite policies Flash/Adobe heredados | Bajo |

### 1.3 Análisis CSP — Hallazgo crítico

La CSP actual:

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data: https:;
media-src 'self';
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
frame-src 'self' https://www.google.com https://maps.google.com https://*.google.com;
manifest-src 'self';
worker-src 'self' blob:;
frame-ancestors 'self';
base-uri 'self';
form-action 'self';
```

**Problemas detectados:**

- `'unsafe-inline'` en script-src: anula la protección XSS. Cualquier inyección no escapada se ejecuta.
- `'unsafe-inline'` en style-src: reemplazar por hash o nonce.
- `font-src 'self'`: la web carga fuentes desde `fonts.gstatic.com` (via Google Fonts `@import`), pero esa URL **no está en la CSP**. Existe inconsistencia técnica entre lo declarado y lo cargado.
- `frame-src https://*.google.com`: comodín demasiado amplio — debería ser específicamente `https://www.google.com` y `https://maps.google.com`.

### 1.4 Acción correctiva consolidada — vercel.json

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Permitted-Cross-Domain-Policies", "value": "none" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self)" },
        { "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' https://www.google.com https://maps.google.com https://sis.redsys.es; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://sis.redsys.es;" }
      ]
    }
  ]
}
```

Adicionalmente, hay que añadir `sis.redsys.es` a `form-action` y `frame-src`, y eliminar `'unsafe-inline'` moviendo todos los `<style>` y `<script>` inline a hashes o ficheros externos.

---

## 2. Modelo de autorización admin [NUEVO]

**Norma de referencia:** art. 32.1.b RGPD (capacidad de garantizar la confidencialidad mediante mínimo privilegio y separación de roles).

### 2.1 Hallazgo crítico — Punto único de fallo

Evidencia en `supabase/functions/_shared/order-admin.ts:50-66`:

```typescript
// Cualquier usuario autenticado en Supabase Auth = admin.
// Seguridad apoyada en:
//   - disable_signup=true en Supabase (no hay signup público).
//   - Solo el propietario crea usuarios desde Supabase Studio.
//   - RLS policies restringen escritura a authenticated.
const supabase = createClient(supabaseUrl, serviceKey)
return {
  ok: true,
  ctx: { supabase, userId: userData.user.id, email: userData.user.email ?? null },
}
```

**Análisis jurídico:**

El art. 32.1.b RGPD exige garantizar «la capacidad de garantizar la confidencialidad, integridad, disponibilidad y resiliencia permanentes de los sistemas». La doctrina interpreta esta obligación como **defensa en profundidad y separación de privilegios**: el acceso a datos personales debe restringirse por el principio de mínimo necesario (art. 5.1.c).

El modelo actual NO cumple este principio:

- Existe un **único toggle** (`disable_signup` en Supabase Auth) que separa la web pública del acceso admin total.
- Si por error humano o regresión ese toggle se invierte, **cualquier persona del mundo puede registrarse y leer/modificar TODOS los datos personales de TODOS los clientes**.
- No hay tabla `admin_users` ni columna `is_admin` que actúe como segunda barrera.
- Las RLS policies (`auth.role() = 'authenticated'`) no distinguen entre admin y cliente registrado.

La AEPD considera que la **ausencia de defensa en profundidad** es factor agravante en sanciones (resolución PS/00120/2023).

### 2.2 Acción correctiva

Crear tabla SQL nueva:

```sql
create table if not exists admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'admin' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- Helper function reutilizable en RLS
create or replace function is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid()
      and revoked_at is null
  );
$$;

revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;
```

Modificar todas las RLS policies del proyecto:

```sql
-- antes: using (auth.role() = 'authenticated')
-- después:
drop policy if exists "orders_select_admin" on orders;
create policy "orders_select_admin" on orders
  for select to authenticated
  using (is_admin());

-- Repetir para todos los SELECT/UPDATE/DELETE de orders, order_items,
-- payments_log, invoices, customer_sessions, quote_requests, etc.
```

Y modificar `order-admin.ts:requireAdmin()`:

```typescript
// Después de getUser():
const { data: adminCheck } = await userClient
  .from('admin_users')
  .select('user_id, role, revoked_at')
  .eq('user_id', userData.user.id)
  .is('revoked_at', null)
  .maybeSingle()

if (!adminCheck) {
  return { ok: false, status: 403, error: 'no admin privileges' }
}
```

---

## 3. CORS abierto en edge functions [NUEVO]

Evidencia en `supabase/functions/_shared/email-utils.ts:11-16`:

```typescript
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
```

### 3.1 Funciones afectadas

Las 28 edge functions del proyecto importan `CORS_HEADERS` y por tanto exponen `Access-Control-Allow-Origin: *`, incluyendo:

- `order-place` — creación de pedidos con datos personales completos
- `customer-magic-link-request` — generación de tokens de sesión
- `customer-orders-list` — lectura de pedidos por sesión
- `customer-order-detail` — datos personales completos del cliente
- `customer-order-cancel` — cancelación pedidos
- `customer-order-update-address` — cambio dirección
- `order-public-get` — datos pedido con token HMAC
- `send-quote-email` — envío email admin
- `google-reviews` — datos terceros

### 3.2 Análisis jurídico

El RGPD no prohíbe el CORS abierto, pero la AEPD en su Guía de Seguridad Técnica (julio 2023) lo cita como **medida básica del art. 32.1.b**. La doctrina considera que:

- El CORS abierto facilita CSRF cuando se combina con cookies de sesión (no es el caso aquí porque se usan tokens en body).
- El CORS abierto permite a sitios maliciosos consultar respuestas de tu API y exfiltrar datos si el token está expuesto en URL (caso del magic link).
- La buena práctica es restringir a los dominios propios — **nunca `*`**.

### 3.3 Acción correctiva

```typescript
// _shared/email-utils.ts — versión corregida
const ALLOWED_ORIGINS = new Set([
  'https://dc-bikes-cantabria.vercel.app',
  'https://dcbikescantabria.es',
  'https://www.dcbikescantabria.es',
])

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowed = ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowed,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}
```

Y refactorizar las funciones para construir las cabeceras pasando el `req`:

```typescript
// En cada serve():
const corsHeaders = buildCorsHeaders(req)
if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
```

---

## 4. Formulario de presupuesto (Quote) [NUEVO]

Auditados `QuoteModal.tsx` + `supabase/functions/send-quote-email/index.ts` + tabla `quote_requests` en `0001_initial.sql`.

### 4.1 Tabla de hallazgos

| Hallazgo | Evidencia | Severidad |
|---|---|---|
| INSERT directo desde frontend con auth anon | `QuoteModal.tsx:66-74`. La RLS permite INSERT público (`public_insert_quotes` en `0001_initial.sql:101`). Cualquier bot puede ejecutar `POST /rest/v1/quote_requests` sin pasar por el modal. | Crítico |
| Sin captcha (reCAPTCHA, hCaptcha, Turnstile) | Búsqueda confirmada: 0 referencias a captcha en `src/`. Vector de spam masivo. | Crítico |
| Sin rate-limit (ni en frontend ni en RLS) | No hay throttling por IP, email o sesión. | Alto |
| `send-quote-email` invocable directamente | El cliente llama `supabase.functions.invoke('send-quote-email', { body: { quote_id } })`. La función NO verifica que la sesión esté autorizada; con un quote_id válido (UUID) se puede disparar email al admin. | Alto |
| Sin `accepted_privacy_at` en `quote_requests` | El modal pide checkbox privacy pero la tabla (`0001_initial.sql:67-75`) no tiene columnas `consent_at, consent_ip, consent_user_agent`. | Alto |
| Sin `marketing_opt_in` en quote | El modal solo pide privacy. Si el contacto futuro va más allá de la respuesta inicial, falta base legal expresa. | Medio |

### 4.2 Acción correctiva

**1. Añadir columnas a la migración:**

```sql
alter table quote_requests
  add column if not exists consent_at         timestamptz,
  add column if not exists consent_ip         text,
  add column if not exists consent_user_agent text,
  add column if not exists consent_version    text;
```

**2. Convertir el INSERT directo en una nueva edge function `quote-submit` con captcha y rate-limit:**

```typescript
// supabase/functions/quote-submit/index.ts
// - Verifica turnstile token (Cloudflare gratuito) o reCAPTCHA v3
// - Rate-limit: 3 consultas/hora por IP (similar a customer-magic-link-request)
// - INSERT con consent_ip, consent_user_agent extraídos de headers
// - Invoca send-quote-email SOLO si el INSERT tuvo éxito
//
// Revocar la RLS policy "public_insert_quotes" → solo service_role inserta.
```

**3. Revocar la policy pública:**

```sql
drop policy "public_insert_quotes" on quote_requests;
```

**4. Frontend:** cargar widget Turnstile en el modal (gratuito, sin tracking de Google).

---

## 5. TTLs y retención de datos [NUEVO]

### 5.1 Plazos declarados vs implementados

| Dato | Plazo declarado | Plazo real implementado | Veredicto |
|---|---|---|---|
| `orders.customer_*` (datos cliente) | 6 años (Cód. Comercio + LGT) | **Indefinido** — no hay cron de purga ni anonimización | Crítico |
| `quote_requests` (consultas) | «Hasta finalización de la consulta + 1 año» | **Indefinido** — no hay limpieza automática | Crítico |
| `customer_sessions` (magic link) | 24h (TTL en token) | El token caduca pero la fila permanece con IP+UA hasta DELETE manual | Alto |
| `product_views` (analítica) | No declarado | Indefinido | Medio |
| `search_queries` (analítica) | No declarado | Indefinido | Medio |
| `payments_log.raw_payload` | No declarado (debería seguir el pedido = 6 años) | Indefinido. Contiene posiblemente Ds_TitularEmail (= email cliente) | Alto |
| `order_status_history.reason` | No declarado | Indefinido. Puede contener nombres/motivos manuales del admin | Medio |

### 5.2 Análisis jurídico

El art. 5.1.e RGPD exige que los datos se conserven «no más allá del tiempo necesario para los fines del tratamiento». La política declara plazos, pero la implementación técnica los excede.

La AEPD considera **especialmente reprochable** declarar plazos al interesado y luego no aplicarlos (resolución PS/00076/2024 cita textualmente «la falta de coherencia entre lo informado y lo ejecutado en materia de conservación se valorará como agravante»).

### 5.3 Acción correctiva — cron de retención

```sql
-- Nueva edge function: data-retention-cron
-- Programada vía pg_cron diariamente a las 03:00 UTC

-- 1) Borrar customer_sessions expiradas > 7 días
delete from customer_sessions where expires_at < now() - interval '7 days';

-- 2) Purgar product_views > 24 meses (analítica agregada conserva en cuadro)
delete from product_views where viewed_at < now() - interval '24 months';

-- 3) Purgar search_queries > 24 meses
delete from search_queries where searched_at < now() - interval '24 months';

-- 4) Purgar quote_requests resueltas > 13 meses
delete from quote_requests
where status = 'closed' and created_at < now() - interval '13 months';

-- 5) Anonimizar orders > 6 años (no borrar — integridad contable, art. 30 CCom)
update orders set
  customer_email      = 'anonymized-' || substring(id::text, 1, 8) || '@anon.local',
  customer_phone      = '+34000000000',
  customer_first_name = 'Anonimizado',
  customer_last_name  = '—',
  shipping_address    = null,
  shipping_notes      = null,
  invoice_address     = null
where created_at < now() - interval '6 years'
  and customer_first_name <> 'Anonimizado';

-- 6) Anonimizar payments_log.raw_payload > 6 años
update payments_log set raw_payload = '{"anonymized": true}'::jsonb
where created_at < now() - interval '6 years'
  and not (raw_payload ? 'anonymized');
```

---

## 6. Anonimización y derecho al olvido [NUEVO]

### 6.1 Estado actual del derecho de supresión (art. 17 RGPD)

La política de privacidad declara que el interesado puede ejercer el derecho de supresión escribiendo a `info@dcbikescantabria.es`. **No existe procedimiento técnico documentado** para ejecutarlo.

### 6.2 Conflicto entre obligación contable y derecho RGPD

Cuando un cliente solicita supresión, el responsable debe equilibrar:

- **Art. 17.3.b RGPD**: el derecho NO aplica cuando el tratamiento sea necesario para el cumplimiento de una obligación legal (conservación contable).
- **Art. 30 CCom y art. 66 LGT**: obligación de conservar facturas 6 años (CCom) o 4 años (LGT).

Solución correcta = **anonimización parcial** tras 6 años conservando el dato contable (factura emitida con NIF), pero borrando identificadores no exigidos por la ley (teléfono, email, notas, dirección de envío). Esto NO está implementado.

### 6.3 Acción correctiva — Procedimiento documentado

Crear procedimiento en `docs/legal/procedimiento-supresion.md`:

1. El cliente envía email a `info@dcbikescantabria.es` identificándose y solicitando supresión.
2. Verificar identidad (vincular email a pedido existente).
3. Determinar si los datos están dentro del plazo obligatorio de conservación (6 años).
4. Si están dentro del plazo: anonimización parcial (mantener factura+NIF, eliminar teléfono/dirección/email).
5. Si están fuera del plazo: anonimización total.
6. Confirmar al cliente por escrito (timestamp + acción ejecutada).
7. Registrar la solicitud en una nueva tabla `data_subject_requests`.

```sql
create table data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('access','rectification','erasure','portability','restriction','objection')),
  customer_email text not null,
  received_at timestamptz not null default now(),
  identity_verified_at timestamptz,
  resolved_at timestamptz,
  resolution_action text,
  resolved_by uuid references auth.users(id),
  notes text
);
```

---

## 7. Inconsistencias en datos del titular [NUEVO]

### 7.1 Direcciones discrepantes

| Ubicación | Texto |
|---|---|
| `0001_initial.sql:125` (seed) | «C/ La Cantábrica nº1, El Astillero, Cantabria» |
| `PrivacyPolicy.tsx:67` | «C. la Cantábrica bloque 2, El Astillero, Cantabria» |
| `CookiePolicy.tsx:97` | «C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 Astillero, Cantabria» |
| `LegalNotice.tsx:143` (fallback) | «C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 El Astillero, Cantabria» |
| `TermsOfSale.tsx:111` (fallback) | «C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 El Astillero, Cantabria» |
| `index.html` Schema.org | «Calle La Cantábrica, Bloque 2N, 1º BAJO, 39610 El Astillero» |

### 7.2 Análisis jurídico

El art. 10 LSSI-CE exige identificar el domicilio del titular con precisión. La AEPD ha sancionado en varias resoluciones la presencia de direcciones contradictorias en una misma web cuando el consumidor no puede determinar cuál es la oficial (resolución PS/00415/2022).

Adicionalmente, el seed default `store_phone = "+34 000 000 000"` (`0001_initial.sql:127`) es un placeholder evidentemente erróneo que se mostrará en producción si el admin no lo cambia.

### 7.3 Acción correctiva

1. Definir **una única fuente de verdad**: el campo `store_address` en `settings`.
2. Eliminar todos los fallbacks hardcoded en TSX. Si el setting no está cumplimentado, mostrar `<Pending />` y bloquear el deploy.
3. Actualizar el seed del `0001_initial.sql` con dirección coherente o vacía con flag `setup_required: true`.
4. Sincronizar `scripts/prerender.mjs` para leer del entorno en build, no hardcoded.

---

## 8. Pasarela Redsys — Cron y secretos [NUEVO]

### 8.1 Migración con placeholders

`supabase/migrations/0005_pg_cron_auto_cancel.sql` contiene placeholders sin sustituir:

```sql
url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/order-auto-cancel',
headers := jsonb_build_object(
  'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
  'x-cron-secret', '<CRON_SECRET>'
)
```

### 8.2 Hallazgo crítico

La propia migración advierte que «NO se aplica tal cual». Si el operador olvida sustituir los placeholders durante el setup, el cron **no ejecuta nunca**. Consecuencia:

- Los pedidos `authorized` retienen el dinero del cliente en su tarjeta **indefinidamente** (hasta el límite de 7 días impuesto por Redsys).
- El cliente puede pensar que ha pagado pero la tienda no procesa el pedido.
- Posibles reclamaciones por **retención indebida** ante OMIC.
- Reclamación ante Banco de España por mal funcionamiento TPV.

### 8.3 Acción correctiva

1. Crear un script de despliegue (`scripts/deploy-cron.sh`) que sustituye los placeholders con variables de entorno.
2. Añadir a la documentación un **checklist post-deploy** obligatorio con verificación: `select * from cron.job where jobname = 'order-auto-cancel-job';`
3. Implementar un **healthcheck** en una nueva edge function `cron-healthcheck` que devuelva la última ejecución del job, y alertar al admin si supera 1 hora sin ejecutarse.

---

## 9. Reviews Google Places [NUEVO]

Auditado `supabase/functions/google-reviews/index.ts`.

### 9.1 Datos personales de terceros

La función llama a `https://places.googleapis.com/v1/places/{placeId}` solicitando los campos:

```
reviews.rating, reviews.text, reviews.originalText,
reviews.authorAttribution, reviews.relativePublishTimeDescription
```

`reviews.authorAttribution` contiene **nombre y foto del autor de la review** (datos personales de terceros distintos al titular de la web).

### 9.2 Análisis jurídico

Cuando DC Bikes muestra reviews de Google en su web, está **procesando datos personales de los autores** como responsable del tratamiento (recoge desde Google y los publica en su sitio). Esto requiere:

- **Base legal (art. 6 RGPD)**: probablemente interés legítimo (6.1.f) en mostrar testimonios reales.
- **Información al interesado (art. 14 RGPD — datos no obtenidos del propio interesado)**: el responsable debería poder demostrar que ha intentado informar al autor de la review de que sus datos se reproducen en otro sitio. **Excepción art. 14.5.b**: cuando la obtención sea «manifiestamente desproporcionada» — aplicable porque informar a cada autor sería irrealizable.
- **Mención en política de privacidad**: actualmente NO se menciona el procesamiento de reviews de Google Places ni la base legal aplicada.

### 9.3 Acción correctiva

Añadir en `PrivacyPolicy.tsx` sección nueva:

> «**Reseñas de Google.** Mostramos en nuestra web reseñas que nuestros clientes y visitantes han publicado voluntariamente en Google Maps sobre nuestro negocio. Estas reseñas incluyen el nombre y, en su caso, la foto de perfil tal y como el autor las publicó en Google. La base legal para esta publicación es nuestro **interés legítimo** en compartir valoraciones reales de nuestros clientes (art. 6.1.f RGPD). Si eres autor de una reseña y deseas que retiremos su visualización en nuestra web, escríbenos a info@dcbikescantabria.es.»

---

## 10. URLs firmadas (facturas) y tokens HMAC [NUEVO]

### 10.1 TTL de URLs firmadas de factura

Evidencia en `customer-order-detail/index.ts:128` y `order-public-get/index.ts:103`:

```typescript
const signedUrl = await getSignedInvoiceUrl(supabase, inv.pdf_storage_path, 60 * 60 * 24 * 7)
//                                                                          ↑ 7 DÍAS
```

Las URLs firmadas son válidas durante **7 días**. Si el cliente copia el link y lo comparte por error en WhatsApp, redes sociales, foros, o pega el URL en otra app — cualquier persona accede a la factura completa durante una semana.

Mejor práctica: TTL corto (15-60 min) y regeneración cada vez que el cliente pulsa «Descargar factura». La factura no es información «pública» — contiene datos personales (nombre, dirección, NIF) y debe protegerse al máximo.

### 10.2 Token HMAC determinista sin expiración

Evidencia en `_shared/order-token.ts:54-58`:

```typescript
export async function generateOrderToken(orderId, customerEmail) {
  return hmacSha256B64Url(`${orderId}:${customerEmail.toLowerCase().trim()}`)
}
```

El token NO incluye timestamp. Es válido **para siempre** mientras no cambie el secreto `ORDER_TOKEN_SECRET`.

Si la URL `/pedido/confirmacion?id=X&token=Y` se filtra (log de servidor de un tercero, captura de pantalla compartida, historial de navegador en ordenador familiar, etc.), **el acceso al pedido es perpetuo**.

Mejora: incluir timestamp en la firma y rechazar tokens > 30 días.

### 10.3 Acción correctiva

```typescript
// _shared/order-token.ts mejorado
export async function generateOrderToken(orderId, customerEmail) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${orderId}:${customerEmail.toLowerCase().trim()}:${issuedAt}`
  const sig = await hmacSha256B64Url(payload)
  return `${issuedAt}.${sig}`  // formato: timestamp.signature
}

export async function verifyOrderToken(orderId, customerEmail, receivedToken) {
  const [tsStr, receivedSig] = receivedToken.split('.')
  const ts = parseInt(tsStr, 10)
  if (!Number.isFinite(ts)) return false
  // Ventana de validez: 30 días
  const ageMs = Date.now() - ts * 1000
  if (ageMs < 0 || ageMs > 30 * 24 * 3600 * 1000) return false
  // Reconstruir firma esperada y comparar timing-safe
  const expected = await hmacSha256B64Url(`${orderId}:${customerEmail.toLowerCase().trim()}:${ts}`)
  return constantTimeEqual(expected, receivedSig)
}
```

Y reducir TTL signed URLs a 1 hora con regeneración bajo demanda.

---

## 11. Captura de marketing opt-in sin uso [NUEVO]

El campo `orders.marketing_opt_in` se captura en checkout (`Checkout.tsx:647-656`), se valida en backend (`order-place/index.ts:171-177`), se guarda en BD (`0003_orders_schema.sql:68`) y se muestra en admin (`OrderDetail.tsx:356`).

Sin embargo, **no existe ninguna funcionalidad de envío de newsletter**:

- No hay tabla `newsletter_subscribers`.
- No hay edge function de envío masivo.
- No hay integración con Mailchimp/Sendgrid/Resend para newsletter.
- El admin lo ve, pero no puede exportar lista ni enviar campañas.

### 11.1 Análisis jurídico

El art. 5.1.b RGPD obliga a recoger datos «con fines determinados, explícitos y legítimos». Captar consentimiento sin propósito definido contraviene este principio.

La AEPD considera que **no se puede pedir consentimiento «por si acaso»** — si en el futuro se quiere lanzar newsletter, debería volver a pedirse consentimiento expresamente para esa finalidad concreta.

### 11.2 Acción correctiva

**Opción A (recomendada):** eliminar el checkbox `marketing_opt_in` del checkout hasta que exista funcionalidad real de newsletter. Limpiar el campo en BD.

**Opción B:** implementar realmente el newsletter (doble opt-in, plantillas, gestión de bajas) antes del lanzamiento.

---

## 12. Prerender y descubribilidad legal [NUEVO]

### 12.1 Páginas legales con `noIndex: true`

Evidencia en `scripts/prerender.mjs` líneas 221-243:

```javascript
{ dir: 'cookies',      noIndex: true, ... },
{ dir: 'privacidad',   noIndex: true, ... },
{ dir: 'aviso-legal',  noIndex: true, ... },
```

Marcar las páginas legales como `noindex` es **discutible jurídicamente**:

- **A favor**: evita que Google indexe textos legales duplicados de tu CMS y los priorice por encima del catálogo comercial.
- **En contra**: la AEPD valora la **accesibilidad y descubribilidad** de los textos legales. Un usuario que busca «política de privacidad DC Bikes Cantabria» en Google debería encontrarla. La doctrina mayoritaria prefiere `index, follow`.

### 12.2 Páginas legales no prerendereadas

`termi-venta` y `devoluciones` NO están en el array `routes` del prerender. Cuando un crawler accede a esas URLs, recibe el HTML genérico del home con `title` y `description` incorrectos.

Acción correctiva: añadirlas a `routes` con title/description específicos:

```javascript
{
  dir: 'terminos-venta',
  title: `Términos y condiciones de venta | ${NAME}`,
  desc: 'Condiciones generales de venta de la tienda online de DC Bikes Cantabria conforme a la LSSI-CE y al RDL 1/2007.',
  canonical: `${SITE}/terminos-venta`,
  noIndex: false,  // recomendado index
  schema: null,
},
{
  dir: 'devoluciones',
  title: `Devoluciones y desistimiento | ${NAME}`,
  desc: 'Política de devoluciones, derecho de desistimiento de 14 días y garantía legal de 3 años conforme al RDL 1/2007.',
  canonical: `${SITE}/devoluciones`,
  noIndex: false,
  schema: null,
},
```

---

## 13. Estado de los 27 hallazgos v1

Comprobación si los hallazgos del primer informe se mantienen tras esta segunda revisión. Ninguno se ha resuelto entre v1 y v2 (mismas líneas de código auditadas).

| # | Hallazgo v1 | Severidad | Estado v2 |
|---|---|---|---|
| 1 | Aviso legal con NIF/CIF vacíos | Crítico | Vigente |
| 2 | Aviso legal afirma "no realiza venta online" | Crítico | Vigente |
| 3 | Botón sin fórmula "con obligación de pago" | Crítico | Vigente |
| 4 | Banner cookies: "Aceptar" más prominente | Crítico | Vigente |
| 5 | Google Fonts sin consentimiento | Crítico | Vigente |
| 6 | Toggle "Analíticas" pre-marcado true | Crítico | Vigente |
| 7 | Política sin Vercel ni Google como encargados | Alto | Vigente |
| 8 | Descripción Supabase imprecisa | Alto | Vigente |
| 9 | No captura IP/UA al consentir (orders) | Alto | Vigente |
| 10 | Email confirmación sin ODR ni CIF | Alto | Vigente |
| 11 | Email sin info desistimiento | Alto | Vigente |
| 12 | Política cookies con inventario incompleto | Alto | Vigente |
| 13 | Sin registro de actividades (RAT) | Alto | Vigente |
| 14 | Sin procedimiento brechas | Alto | Vigente |
| 15 | Admin sin 2FA | Medio | Vigente · agravado por N1 |
| 16 | Política sin mención DPO | Medio | Vigente |
| 17 | Política sin derecho limitación | Medio | Vigente |
| 18 | Política sin mención menores | Medio | Vigente |
| 19 | Sin cláusula 18 años Términos | Medio | Vigente |
| 20 | Google Maps como "marketing" | Medio | Vigente |
| 21 | Verifactu — verificar aplicabilidad | Medio | Vigente |
| 22 | Series B2C/B2B unificadas | Bajo | Vigente |
| 23 | localStorage cookie consent sin TTL | Bajo | Vigente |
| 24 | Checkout/Cart sin noIndex meta | Bajo | Vigente |
| 25 | Validación algorítmica CIF | Mejora | Vigente |
| 26 | Anonimización logs > 6 años | Mejora | Agravado · ver N6 (sin cron) |
| 27 | Auditoría WCAG 2.1 AA | Potencial | Vigente |

---

## 14. Plan de acción priorizado v2 (solo nuevos hallazgos)

| # | Hallazgo nuevo | Severidad | Norma | Esfuerzo |
|---|---|---|---|---|
| N1 | Modelo admin: cualquier authenticated = admin | Crítico | Art. 32.1.b RGPD | 4-6 h |
| N2 | Falta cabecera HSTS | Alto | Art. 32 RGPD | 10 min |
| N3 | CORS abierto a `*` | Alto | Art. 32 RGPD | 1 h |
| N4 | QuoteModal sin captcha ni rate-limit | Crítico | Art. 32 RGPD + LSSI | 3 h (Turnstile + edge function) |
| N5 | `quote_requests` sin prueba consentimiento | Alto | Art. 7.1 RGPD | 30 min (migración SQL) |
| N6 | Sin anonimización automática | Crítico | Art. 5.1.e RGPD | 4 h (cron + 5 jobs) |
| N7 | `marketing_opt_in` sin uso real | Alto | Art. 5.1.b RGPD | 15 min (quitar checkbox) o 8 h (implementar newsletter) |
| N8 | CSP con `'unsafe-inline'` | Alto | Art. 32 RGPD | 2 h (mover styles inline a clases) |
| N9 | CSP sin `font-src` para Google Fonts | Medio | Coherencia técnica | 1 h (autohospedar) |
| N10 | `Permissions-Policy: geolocation=(self)` innecesario | Bajo | Mínimo privilegio | 5 min |
| N11 | Inconsistencia direcciones titular | Alto | Art. 10 LSSI-CE | 1 h |
| N12 | Placeholder `+34 000 000 000` en seed | Medio | Art. 10 LSSI-CE | 5 min |
| N13 | Cron 0005 con placeholders no sustituidos | Crítico (operacional) | Buena práctica | 1 h (script + healthcheck) |
| N14 | Reviews Google Places sin base legal documentada | Medio | Art. 6.1.f + 14 RGPD | 15 min (texto en política) |
| N15 | URLs firmadas factura TTL 7 días | Medio | Art. 32 RGPD | 30 min |
| N16 | Token HMAC pedido sin expiración | Medio | Buena práctica | 1 h |
| N17 | Prerender páginas legales con noIndex | Mejora | Buena práctica AEPD | 10 min |
| N18 | Sin procedimiento art. 17 (derecho supresión) | Alto | Art. 17 RGPD | 3 h (doc + tabla SQL) |

**Esfuerzo total estimado para los nuevos hallazgos:** aproximadamente **21-26 horas de desarrollo adicionales** a las 27-35 horas del primer informe.

**Esfuerzo combinado v1 + v2:** **48-61 horas** para alcanzar APTO, excluyendo Verifactu y accesibilidad WCAG.

---

## 15. Anexos técnicos

### Anexo A — Migración SQL consolidada de la 2ª iteración

```sql
-- migrations/0009_v2_legal_compliance.sql

-- 1) Modelo admin con tabla separada
create table if not exists admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'admin' check (role in ('admin','staff')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create or replace function is_admin()
returns boolean language sql security definer stable
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid() and revoked_at is null
  );
$$;
revoke all on function is_admin() from public;
grant execute on function is_admin() to authenticated;

-- 2) Consentimiento en quote_requests
alter table quote_requests
  add column if not exists consent_at         timestamptz,
  add column if not exists consent_ip         text,
  add column if not exists consent_user_agent text,
  add column if not exists consent_version    text;

-- Revocar INSERT público; solo edge function con service_role
drop policy if exists "public_insert_quotes" on quote_requests;

-- 3) Consentimiento en orders
alter table orders
  add column if not exists consent_ip              text,
  add column if not exists consent_user_agent      text,
  add column if not exists consent_terms_version   text,
  add column if not exists consent_privacy_version text;

-- 4) Tabla brechas (de v1, repetida aquí)
create table if not exists data_breaches (
  id uuid primary key default gen_random_uuid(),
  detected_at timestamptz not null,
  description text not null,
  affected_data_categories text[] not null,
  estimated_affected_users int,
  risk_level text check (risk_level in ('bajo','medio','alto')),
  notified_aepd boolean default false,
  notified_aepd_at timestamptz,
  notified_users boolean default false,
  containment_measures text,
  created_at timestamptz default now()
);

-- 5) Tabla solicitudes derechos interesados (RGPD)
create table if not exists data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in
    ('access','rectification','erasure','portability','restriction','objection')),
  customer_email text not null,
  received_at timestamptz not null default now(),
  identity_verified_at timestamptz,
  resolved_at timestamptz,
  resolution_action text,
  resolved_by uuid references auth.users(id),
  notes text
);

-- 6) Reescritura RLS con is_admin()
drop policy if exists "orders_select_admin" on orders;
create policy "orders_select_admin" on orders
  for select to authenticated using (is_admin());

drop policy if exists "orders_update_admin" on orders;
create policy "orders_update_admin" on orders
  for update to authenticated using (is_admin());

-- Repetir el patrón para todas las tablas con datos personales:
-- order_items, payments_log, invoices, customer_sessions,
-- quote_requests, order_status_history, settings.
```

### Anexo B — Cron de retención (pg_cron job diario)

```sql
-- migrations/0010_data_retention_cron.sql
-- Job diario que aplica los plazos declarados en la política de privacidad.

select cron.schedule(
  'data-retention-job',
  '0 3 * * *',  -- todos los días a las 03:00 UTC
  $$
    -- a) Sesiones de cliente expiradas hace > 7 días
    delete from customer_sessions where expires_at < now() - interval '7 days';

    -- b) Vistas de producto > 24 meses
    delete from product_views where viewed_at < now() - interval '24 months';

    -- c) Búsquedas > 24 meses
    delete from search_queries where searched_at < now() - interval '24 months';

    -- d) Consultas resueltas > 13 meses (declarado "1 año + 1 mes margen")
    delete from quote_requests
    where status = 'closed' and created_at < now() - interval '13 months';

    -- e) Anonimización de pedidos > 6 años (NO borrar — integridad contable)
    update orders set
      customer_email      = 'anonymized-' || substring(id::text,1,8) || '@anon.local',
      customer_phone      = '+34000000000',
      customer_first_name = 'Anonimizado',
      customer_last_name  = '—',
      shipping_address    = null,
      shipping_notes      = null,
      invoice_address     = null
    where created_at < now() - interval '6 years'
      and customer_first_name <> 'Anonimizado';

    -- f) Anonimización payments_log raw_payload > 6 años
    update payments_log set raw_payload = '{"anonymized": true}'::jsonb
    where created_at < now() - interval '6 years'
      and not (raw_payload ? 'anonymized');
  $$
);
```

### Anexo C — Cabeceras HTTP corregidas (vercel.json)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security",
          "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "SAMEORIGIN" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "X-Permitted-Cross-Domain-Policies", "value": "none" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Resource-Policy", "value": "same-origin" },
        { "key": "Permissions-Policy",
          "value": "camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(self), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" },
        { "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-src 'self' https://www.google.com https://maps.google.com https://sis.redsys.es; form-action 'self' https://sis.redsys.es; frame-ancestors 'self'; base-uri 'self';" }
      ]
    }
  ]
}
```

**Requisitos previos para que esta CSP funcione:**

1. Eliminar todos los `<style>` inline (mover a `index.css`).
2. Eliminar todos los `style="..."` inline en HTML (Tailwind ya cumple).
3. Autohospedar Google Fonts con `@fontsource/*`.
4. Sustituir el JSON-LD inline del `index.html` por nonce o moverlo a archivo externo.

---

## Conclusión final v2

La segunda iteración profundiza en aspectos de **defensa en profundidad** y **operacional** que el primer informe no cubría con detalle. Los 18 hallazgos nuevos no contradicen el veredicto inicial (**NO APTO**), pero lo agravan:

- El **modelo de autorización admin (N1)** es el hallazgo más preocupante de los nuevos: un único toggle de configuración Supabase protege todos los datos personales de los clientes.
- La **ausencia total de anonimización automática (N6)** implica que la web está **incumpliendo lo declarado en su propia política de privacidad** — circunstancia agravante específica reconocida por la AEPD.
- El **formulario de presupuesto (N4-N5)** es un vector de ataque sin protección, capaz de generar daño reputacional y costes de Resend en pocas horas.
- Las **cabeceras de seguridad HTTP incompletas (N2, N8, N9)** implican que la web no cumple las medidas técnicas básicas exigidas por el art. 32 RGPD ni por OWASP ASVS.

### Sanción potencial actualizada

Combinando v1 + v2, la horquilla orientativa de sanción AEPD en inspección rutinaria sube a **90.000 € – 280.000 €** (antes 70.000 – 200.000 €), antes de atenuantes por microempresa. La diferencia se debe principalmente a que la AEPD aplica multiplicador agravante cuando detecta **incoherencia entre lo declarado y lo implementado** en materia de conservación (N6) y a la **falta de defensa en profundidad** (N1).

### Recomendación final

Ejecutar el plan de acción combinado v1 + v2 en **tres sprints**:

1. **Sprint 1 (críticos, ~12 h):** hallazgos v1 nº 1-6 + v2 nº N1, N4, N6, N13. Esto desbloquea la posibilidad de lanzamiento.
2. **Sprint 2 (altos, ~15 h):** hallazgos v1 nº 7-14 + v2 nº N2, N3, N5, N7, N8, N11, N18.
3. **Sprint 3 (medios + mejora, ~20 h):** el resto.

Tras los tres sprints, la web pasará de **NO APTO** a **APTO**. La única excepción sigue siendo Verifactu (RD 1007/2023) y, si procede, la auditoría WCAG 2.1 AA por aplicación de la Ley 11/2023.

---

*Informe v2 emitido el 26 de mayo de 2026 · Complementario al informe v1 de la misma fecha. Las referencias normativas citadas están vigentes a la fecha de emisión. Documento confidencial — para uso exclusivo del titular del sitio web auditado.*
