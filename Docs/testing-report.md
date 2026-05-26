# QA Evidence-Based Report — DC Bikes carrito de compra

**Branch**: `feature/carrito-compra`
**Project ref**: `zdfzxjnuksuyagdqoouu`
**Verification date**: 2026-05-26
**Mode**: Read-only audit, no commits made.

---

## SECCIÓN A — Verificaciones automatizadas

| # | Check | Resultado | Detalle |
|---|---|---|---|
| A.1 | `npx tsc -b --noEmit` | ✅ OK | exit 0, sin errores. |
| A.1 | `npm run build` | ✅ OK | 2505 módulos, prerender 7 rutas, snap 7 rutas. Total JS gz: ~480 kB. Bundle más grande `react-vendor` 553 kB (167 kB gz). |
| A.1 | `npx eslint .` | ⚠️ FAIL | **58 errores, 5 warnings**. Mayoría: `react-hooks/set-state-in-effect` (28+), `no-irregular-whitespace`, varios `no-useless-assignment`, `@typescript-eslint/no-unused-vars`, `react-refresh/only-export-components`. **Hay 1 `no-constant-binary-expression` real en `ProductForm.tsx:60` que sí es bug de lógica**. |
| A.2 | 14 tablas esperadas | ✅ OK | Todas presentes + `product_views` bonus. |
| A.2 | Columnas `orders.deleted_at / client_modified_at / cancelled_by_customer` | ✅ OK | Presentes con tipos correctos. |
| A.2 | Columnas `products.is_purchasable / size_label / model_group / weight_grams / ean` | ✅ OK | Presentes. |
| A.2 | Bucket `invoices` privado, `product-images` público | ✅ OK | Confirmado vía `storage.buckets`. |
| A.2 | Settings keys core | ✅ OK | 23 keys seedeadas. |
| A.3 | 30 edge functions ACTIVE | ✅ OK | Smoke tests devuelven 400/401/404 esperados, ninguna 500/404 ruta. |
| A.3 | `verify_jwt` admin functions | ❌ FAIL | Todas las funciones admin tienen `verify_jwt: false`. La auth se hace dentro del código con `requireAdmin`, pero ese helper sólo valida `authenticated`, no rol admin. **Ver Bug #2**. |
| A.4 | Cada `functions.invoke()` del frontend tiene función desplegada | ⚠️ OK con 1 excepción | `order-mark-delivered` está desplegada pero **NUNCA invocada** desde frontend (Bug #5). |
| A.4 | Tipos TS sincronizados con SQL | ⚠️ FAIL parcial | `customer_sessions` no aparece en `src/lib/database.types.ts`. Sólo se usa server-side. |
| A.5 | Rutas en `App.tsx` y `AdminRoutes.tsx` | ✅ OK | Todas las importaciones resuelven. |
| A.6 | Prerender SEO 7 rutas | ✅ OK | Títulos únicos, descriptions, robots correcto (noindex en /privacidad, /cookies, /aviso-legal), canonical, OG tags. |
| A.7 | `public/sitemap.xml` | ⚠️ WARN | **Incluye 3 URLs marcadas noindex** (`/cookies`, `/privacidad`, `/aviso-legal`). **Falta**: `/devoluciones`, `/terminos-venta`. |
| A.7 | `public/robots.txt` | ⚠️ WARN | Permite indexar `/checkout`, `/carrito`, `/mock-redsys-pago`, `/pedido/*`, `/mis-pedidos/*`. |
| A.8 | RLS: `customer_sessions`, `invoices`, `orders` cerradas a anon | ✅ OK | curl con ANON_KEY devuelve `[]` (RLS bloquea). |
| A.8 | RLS: `settings` lectura pública | ❌ FAIL | Anon ve `[]`. Footer, useShopSettings, Contact, LegalNotice rotos para público. **Ver Bug #1**. |
| A.8 | RLS: tablas authenticated-only no distinguen admin de cliente | ❌ FAIL | Ningún policy chequea rol admin. **Ver Bug #2**. |
| A.9 | `next_order_number(2026)` atómico incrementa | ✅ OK | 10 → 11 entre dos llamadas. |
| A.9 | `next_invoice_number(2026)` existe | ✅ OK | Devuelve 1 (no se ha usado). |
| Extra | `pg_cron` extension | ❌ FAIL | NO instalada. **Migración `0005_pg_cron_auto_cancel.sql` NUNCA aplicada**. Auto-cancel no corre. |
| Extra | `disable_signup` Supabase Auth | ❌ FAIL | `disable_signup=false`. Cualquiera puede crear usuario → escala a admin (Bug #2). |
| Extra | Datos legales seedeados | ⚠️ WARN | `legal_company_name`, `legal_company_cif`, `legal_company_address` **vacíos**. Primer `order-accept` fallará al generar factura. |

---

## SECCIÓN B — Bugs y riesgos encontrados

### 🔴 Bug #1 — RLS bloquea lectura anon de `settings` (CRÍTICO)
- **Causa**: única policy `auth_settings` con `qual: (auth.role() = 'authenticated')`. Sin policy de lectura pública.
- **Impacto**: Footer sin Instagram/Facebook/dirección/teléfono. Contacto vacío. Páginas legales sin razón social/CIF. **`useShopSettings` cae a defaults** (envío 6,90€ y umbral 50€ aunque admin haya puesto otro valor).
- **Evidencia**: `curl /rest/v1/settings -H "Authorization: Bearer <ANON_KEY>"` → `[]`.
- **Fix**:
  ```sql
  CREATE POLICY "public_read_settings" ON settings FOR SELECT TO public USING (true);
  ```

### 🔴 Bug #2 — Sin verificación de rol admin: cualquier user de Auth = admin total (CRÍTICO P0)
- **Causa**: `requireAdmin` solo valida `authenticated`. `ProtectedRoute` idem. Todas las RLS authenticated-only. `disable_signup=false`.
- **Cadena de explotación**:
  1. Atacante hace `supabase.auth.signUp()` desde consola → recibe sesión.
  2. Navega a `/admin` → ProtectedRoute lo deja.
  3. Llama `order-accept`, `order-delete`, `order-mark-shipped` → `requireAdmin` la acepta.
  4. Lee/modifica products, settings, quote_requests (PII).
- **Fix**:
  1. `disable_signup = true` en Supabase Auth.
  2. Allowlist `ADMIN_EMAILS` env-var, comparar en `requireAdmin` + `ProtectedRoute`.
  3. Refactor policies RLS: `auth.jwt() ->> 'email' = ANY(admin_emails_array)` o custom claim `is_admin`.

### 🔴 Bug #3 — `redsys-notification` con flag `__mock` sin verificar modo (CRÍTICO P0)
- **Causa**: líneas 76-91 aceptan `{__mock:true, order_id, authorized}` **sin chequear `config.mode === 'mock'`**. Función expuesta sin `verify_jwt`.
- **Cadena**:
  1. En producción (Redsys real), atacante POST al webhook con `__mock` + UUID de pedido en `pending`.
  2. Pedido pasa a `authorized` sin que Redsys haya cobrado.
  3. Admin lo acepta → factura emitida → mercancía enviada → fraude.
- **Mitigación parcial**: check de `pending` da ventana corta — pero como **pg_cron no corre** (Bug #4), pedidos abandonados quedan pending para siempre.
- **Fix**:
  ```ts
  if (mockBody?.__mock) {
    const config = await loadRedsysConfig(supabase)
    if (config.mode !== 'mock') return null
    // ...
  }
  ```

### 🟠 Bug #4 — `pg_cron` no instalado: auto-cancel no corre (ALTO)
- **Causa**: extensión `pg_cron` no instalada. Migración 0005 nunca aplicada (es template con placeholders).
- **Impacto**:
  - Pedidos abandonados en `pending` para siempre.
  - Stock decrementado nunca se restaura.
  - Amplifica ventana del Bug #3 a infinito.
- **Fix**: Supabase Studio → Database → Extensions: habilitar `pg_cron` + `pg_net`. Ejecutar migración 0005 con valores reales.

### 🟡 Bug #5 — `order-mark-delivered` es código muerto, frontend hace UPDATE directo (MEDIO)
- **Causa**: `OrderActionsBar.tsx:267-282` hace `supabase.from('orders').update({ status: 'delivered' })` directo, saltándose la edge function que valida transiciones.
- **Impacto**: Admin (o cualquier authenticated) puede pasar a `delivered` desde cualquier estado.
- **Fix**: Usar `supabase.functions.invoke('order-mark-delivered', {body: {order_id}})`.

### 🟡 Bug #6 — Email-bomb y abuso de `send-order-*` (MEDIO)
- **Causa**: 11 funciones `send-order-*` + `generate-invoice-pdf` con `verify_jwt: false` aceptan `order_id` sin firma.
- **Impacto**: Spam emails al cliente, regeneración de PDF (puede duplicar facturas).
- **Fix**: Añadir `verify_jwt: true` o exigir HMAC del `order_id` como `order-public-get`.

### 🟡 Bug #7 — Sitemap incluye URLs noindex (MEDIO SEO)
- `/cookies`, `/privacidad`, `/aviso-legal` tienen `noindex` pero están en sitemap.xml.
- Faltan `/devoluciones`, `/terminos-venta`.
- **Fix**: editar `scripts/generate-sitemap.mjs`.

### 🟢 Bug #8 — `robots.txt` permite indexar /checkout, /carrito, /pedido/*, /mis-pedidos/* (BAJO)
- **Fix**:
  ```
  Disallow: /carrito
  Disallow: /checkout
  Disallow: /pedido/
  Disallow: /mock-redsys-pago/
  Disallow: /mis-pedidos/
  ```

### 🟢 Bug #9 — `customer_sessions` ausente de `database.types.ts` (BAJO)
- Solo afecta drift de tipos. No rompe nada hoy.
- **Fix**: `supabase gen types typescript`.

### 🔴 Bug #10 — Datos legales vacíos: primer `order-accept` fallará con factura (CRÍTICO operacional)
- **Causa**: `legal_company_name/cif/address` están en blanco. `generate-invoice-pdf` devuelve 400.
- **Fix 30 segundos**: rellenar `/admin/configuracion → Facturación` con datos reales.

### 🟢 Bug #11 — Rollback de stock no transaccional (BAJO)
- `rollbackReserved` hace read-then-update sin lock.
- Aceptable para volumen previsto (1-5 pedidos/día).

### 🟢 Bug #12 — Bundle JS: `react-vendor` 553 kB / `xlsx` 332 kB (BAJO)
- xlsx solo carga en /admin. Aceptable.

### 🟡 Bug #13 — 58 errores ESLint (MIXTO)
- 1 `no-constant-binary-expression` en `ProductForm.tsx:60` — **revisar, posible bug lógica**.
- 5 `no-irregular-whitespace` en `pdf-utils.ts` y `Modal.tsx`.
- Resto: falsos positivos o cosmético.

### 🟢 Riesgo #14 — Magic-link sin marcar `used_at` (DISEÑO)
- Token reusable durante TTL 24h por decisión de UX. Si email comprometido en 24h → tercero accede.
- **Mejora opcional**: rotar token o invalidar al cerrar sesión.

### 🟢 Riesgo #15 — Sin auditoría visible de acciones admin
- `order_status_history` registra `changed_by` UUID, pero no hay panel humano-legible.

---

## SECCIÓN D — Veredicto final

### ¿Listo para producción?
**NO. Bloqueado por 3 issues P0 de seguridad y 1 funcional.**

### Bloqueantes go-live (must-fix antes del primer cliente real)
1. **Bug #2** — Sin verificación admin + signups abiertos → cualquier user = admin total.
2. **Bug #3** — `__mock` activable en producción → fraude monetario directo.
3. **Bug #1** — RLS settings bloquea anon → footer, contacto, legal, shipping rotos.
4. **Bug #10** — Datos legales vacíos → primer factura no se genera.

### Top 5 recomendaciones antes del despliegue
1. **Cerrar Bug #2**: deshabilitar signup, allowlist ADMIN_EMAILS, refactorizar policies RLS por rol.
2. **Cerrar Bug #3**: gating del mock branch a `config.mode === 'mock'` + secret header.
3. **Cerrar Bug #1**: policy `public_read_settings` con `select to public using (true)`.
4. **Activar pg_cron (Bug #4)** y aplicar migración 0005 con valores reales.
5. **Rellenar datos legales** en `/admin/configuracion → Facturación`.

### Estimación de tiempo
- **Bloqueantes (1-4)**: ~1 jornada laboral.
- **Bug #5, #7, #8 + ProductForm.tsx:60**: 3-4h.
- **Bug #6 (HMAC en send-order-*)**: 2-3h (opcional pre go-live).

Tras eso, el carrito quedaría listo para soft-launch en modo Redsys=test con tarjetas de prueba antes de producción real.
