# Auditoría legal exhaustiva — DC Bikes Cantabria (dc-bikes-cantabria.vercel.app)

**Auditor:** Letrado especialista en Derecho Digital y Consumo
**Fecha de auditoría:** 26 de mayo de 2026
**Versión de código auditada:** rama de producción, migraciones 0001–0008
**Marco normativo aplicado:** RGPD · LOPDGDD · LSSI-CE · RDL 1/2007 (LGDCU) · Reglamento (UE) 524/2013 · RDL 7/2021 · RDL 5/2023 (Omnibus) · Reglamento de Facturación (RD 1619/2012) · Guía AEPD Cookies (julio 2023)

---

## 0. Resumen ejecutivo

### Veredicto: **NO APTO para puesta en producción comercial** — pero con base sólida.

La aplicación demuestra una arquitectura técnica seria y madura (RLS, tokens hasheados, anti-fraude, pasarela TPV con pre-autorización, rate-limiting, anti-enumeración, logs de pagos auditables, etc.). Sin embargo, contiene **cinco incumplimientos legales graves** que la AEPD y/o cualquier OMIC (Oficina Municipal de Información al Consumidor) detectarían en una inspección rutinaria. Tres de ellos podrían acarrear sanciones individuales **iguales o superiores a 30.000 €** por la AEPD si la web está en producción y recibe denuncia formal.

### Top 5 riesgos legales más graves (orden de severidad)

| # | Riesgo | Norma | Sanción AEPD/Consumo orientativa |
|---|--------|-------|----------------------------------|
| **1** | **Aviso legal incompleto** (NIF, forma jurídica, inscripción registral en blanco) | Art. 10 LSSI-CE | 30.000 €–150.000 € (infracción grave) |
| **2** | **Banner de cookies sin botón "Rechazar todas" al mismo nivel visual que "Aceptar todas"** | Guía AEPD Cookies 2023 + Sentencia CJUE Planet49 (C-673/17) | 30.000 €–150.000 € por infracción del art. 22.2 LSSI-CE |
| **3** | **Google Fonts cargado sin consentimiento previo** (envía IP al servidor de Google) | Art. 22.2 LSSI-CE + art. 6 RGPD + Sentencia LG München I 3 O 17493/20 | 30.000 €–60.000 € |
| **4** | **Botón de pago no rotulado con la fórmula obligatoria "Pedido con obligación de pago"** | Art. 98.2 RDL 1/2007 (reformado por RDL 7/2021) | Sanción Consumo + **el contrato NO obliga al consumidor** (efecto demoledor) |
| **5** | **Aviso legal afirma "no realiza venta online directa"** mientras existe checkout funcional con cobro | Art. 10 LSSI-CE + art. 60 RDL 1/2007 (información precontractual desleal) | Calificable como práctica engañosa — art. 5 LCD |

### Sanción potencial acumulada estimada

Si la AEPD inspeccionase hoy y aplicase el art. 83.5 RGPD con criterio orientativo (no agravado): **70.000 € – 200.000 €**. Estimación conservadora, sin tener en cuenta atenuantes propios de microempresa (que rebajan típicamente al 50–60 % de la horquilla).

---

## 1. Identificación del responsable del tratamiento

**Norma de referencia:** art. 13.1.a RGPD · art. 10 LSSI-CE · art. 97 RDL 1/2007.

### Hallazgos

| Verificación | Resultado | Evidencia |
|---|---|---|
| Identificación titular en Aviso Legal | ⚠️ PARCIAL | `LegalNotice.tsx:127-165` muestra `<Pending>` en NIF, forma jurídica, inscripción si `legal_nif`/`legal_forma_juridica`/`legal_inscripcion` no están seteados en Supabase. **Si no se ha rellenado el panel admin, esos datos NO aparecen en producción.** |
| NIF/CIF visible | ❌ CRÍTICO | Depende de configuración admin. Sin rellenar, infringe art. 10.1.a LSSI-CE |
| Domicilio | ✅ Sí (fallback: "C. la Cantábrica, bloque 2 n, 1 BAJO, 39610 El Astillero, Cantabria") |
| Email contacto | ✅ Sí (`info@dcbikescantabria.es`) — `PrivacyPolicy.tsx:70` |
| Teléfono | ⚠️ Solo si está seteado en settings (mismo `Pending`) |
| Inscripción registral | ⚠️ `LegalNotice.tsx:163` exige rellenarlo. Si autónomo, debe ponerse "No aplica" expresamente |

### Acción correctiva inmediata

Antes de cualquier despliegue público:
1. Rellenar **obligatoriamente** en `/admin/settings` los campos `legal_nif`, `legal_forma_juridica`, `legal_inscripcion`, `store_phone`, `legal_company_name`, `legal_company_cif`, `legal_company_address`.
2. Si es **autónomo**, no procede inscripción registral, pero debe figurar literalmente: *"Empresario individual no inscrito en Registro Mercantil (art. 19 Código de Comercio)"*.
3. Añadir en la BD un check de validación en `Settings.tsx` que bloquee el botón "Activar tienda online" hasta que todos los campos legales estén cumplimentados.

### ¿DPO obligatorio? — Art. 37 RGPD

**No es obligatorio**. La obligación se aplica a:
- Autoridades/organismos públicos.
- Actividades principales que requieran observación habitual y sistemática a gran escala.
- Tratamientos a gran escala de categorías especiales (art. 9) o datos penales (art. 10).

DC Bikes Cantabria, con 1-5 pedidos/día, no entra en ninguno de estos supuestos. **Conclusión: no se requiere designar DPO**, aunque la política de privacidad no lo menciona expresamente. Recomendación: añadir mención.

---

## 2. Cookies y tecnologías similares

**Norma de referencia:** art. 22.2 LSSI-CE · Guía AEPD Cookies (julio 2023) · Sentencia CJUE C-673/17 Planet49.

### 2.1 Banner — Análisis funcional (`CookieBanner.tsx`)

| Requisito Guía AEPD 2023 | Implementación actual | Veredicto |
|---|---|---|
| Banner aparece ANTES de instalar cookies no esenciales | Aparece tras 800 ms (`useEffect` línea 34), pero **Google Fonts ya se ha cargado** porque el `@import` en `src/index.css:1` y los `<link rel="preconnect">` en `index.html` se ejecutan inmediatamente | ❌ **INCUMPLE** |
| "Aceptar" y "Rechazar" deben estar al **mismo nivel visual** | "Aceptar todas" es `variant="primary"` (botón sólido lavanda); "Solo esenciales" es `variant="ghost"` (botón transparente, menos contraste). Visualmente, "Aceptar" es claramente más prominente | ❌ **INCUMPLE — uno de los hallazgos AEPD más sancionados en 2024-2025** |
| El botón debe rotularse **"Rechazar todas"** o equivalente claro, no "Solo esenciales" | Texto actual: "Solo esenciales" | ⚠️ Aceptable pero la AEPD prefiere "Rechazar todas" |
| Configuración granular accesible desde el banner | Sí, expandible con flecha | ✅ |
| Toggles NO pre-marcados | El state inicial es `{ essential: true, analytics: true, marketing: false }` (línea 28). **`analytics` está pre-marcado en true.** Si el usuario abre el panel y pulsa "Guardar preferencias" sin tocar nada, está consintiendo analítica sin acción afirmativa | ❌ **INCUMPLE art. 4.11 RGPD** (consentimiento = acción afirmativa) |
| Posibilidad de retirar consentimiento tan fácil como darlo | Sí, en `/cookies` hay botón "Restablecer preferencias" (`CookiePolicy.tsx:262-270`) | ✅ |
| Banner persiste hasta acción afirmativa | Sí, no se cierra automáticamente | ✅ |
| Plazo de re-solicitud máximo recomendado | localStorage no caduca automáticamente. La Guía AEPD recomienda **renovar consentimiento cada 24 meses como máximo** (apartado 6.2) | ⚠️ Falta TTL |

### 2.2 Política de cookies — Análisis de contenido (`CookiePolicy.tsx`)

**Inventario auditado vs. inventario real de cookies/tecnologías:**

| Cookie/tecnología | Está en la web | Está en política | Veredicto |
|---|---|---|---|
| `dcbikes_cookie_consent` (localStorage) | ✅ | ✅ | ✅ |
| `sb-*` (Supabase auth) | Solo en /admin | ✅ | ✅ |
| `dcb_session` (sessionStorage, analytics) | ✅ | ✅ (como `dcbikes_session`) | ⚠️ Nombre incorrecto en política (es `dcb_session`, no `dcbikes_session`) — `analytics.ts:3` |
| `dcbikes_last_order` (localStorage) | ✅ (`Checkout.tsx:158`) | ❌ NO LISTADA | ❌ Falta |
| `dcbikes_customer_session` (localStorage, magic link) | ✅ | ❌ NO LISTADA | ❌ Falta |
| `dcbikes_pending_order` (localStorage) | ✅ (`OrderConfirmation.tsx:76`) | ❌ NO LISTADA | ❌ Falta |
| Cookies del carrito Zustand persistido | ✅ (`cartStore.ts:111`) | ❌ NO LISTADA | ❌ Falta |
| **Google Fonts** (fonts.googleapis.com + fonts.gstatic.com) | ✅ (preconnect en `index.html` + `@import` en `index.css`) | ❌ NO LISTADO | ❌ **CRÍTICO** |
| **Google Maps embed iframe** | ✅ (`Contact.tsx:255`) — con consentimiento previo (✅ correcto) | ✅ | ✅ |
| **Redsys** (sis.redsys.es cookies sesión pago) | ✅ | ✅ — bien categorizado como exento (art. 22.2 LSSI-CE) | ✅ |
| Vercel Analytics | No detectado en código | — | ✅ |
| `dcb_groupings_confirmed` (admin) | ✅ (`Groupings.tsx:28`) | ❌ — pero es admin, exenta | ⚠️ Mencionar |

### 2.3 Hallazgo crítico Google Fonts

**Evidencia:**
```html
<!-- index.html líneas 9-10 -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```
```css
/* src/index.css línea 1 */
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&...');
```

**Análisis jurídico:** Cuando el navegador del visitante hace la solicitud HTTP a `fonts.googleapis.com`, **envía a Google la dirección IP, el User-Agent y la URL de referencia**. Esto constituye una comunicación de datos personales (la IP es dato personal según CJUE C-582/14 Breyer) a un tercer responsable en EE. UU. sin base legal alguna, **antes** de cualquier banner.

La **sentencia del Landgericht München I de 20 de enero de 2022** (asunto 3 O 17493/20) condenó al titular de un sitio web por exactamente este hecho a indemnizar 100 € + costas al demandante particular. La AEPD ha mantenido criterio análogo en resoluciones recientes (ej. PS/00069/2023).

**Solución técnica:** autohospedar las fuentes (`@fontsource/bebas-neue`, `@fontsource/barlow-condensed`, `@fontsource/barlow`) — son paquetes npm que sirven los .woff2 desde tu propio dominio. Cambio de 5 líneas, sin impacto visual.

### 2.4 Categorización incorrecta de Google Maps

`Contact.tsx:57`:
```tsx
const [mapsEnabled, setMapsEnabled] = useState(cookieConsent?.marketing ?? false)
```

Google Maps embed se condiciona al consentimiento de **marketing**, pero según AEPD una funcionalidad como un mapa es **cookie funcional/de terceros**, no de marketing. Si el usuario rechaza marketing pero acepta funcionales/terceros, debería poderse cargar. Recomendación: categoría propia "terceros" o "funcionales-terceros".

### 2.5 Acción correctiva consolidada — Sección 2

1. **Cambiar `analytics: true` → `analytics: false`** en el state inicial de `CookieBanner.tsx:27`.
2. **Sustituir botón "Solo esenciales"** por **"Rechazar todas"**, con la **MISMA variante visual** que "Aceptar todas" (ambos `variant="primary"` con el mismo contraste, mismo tamaño, mismo estilo).
3. **Autohospedar Google Fonts** mediante `@fontsource/*` (eliminar `@import` y `preconnect`).
4. Añadir TTL de 12 meses al `dcbikes_cookie_consent` para forzar renovación anual.
5. Listar **todas** las cookies/localStorage en `CookiePolicy.tsx`, incluyendo las del carrito, las de magic link y las de pedidos.
6. Categorizar Google Maps como "terceros" o "funcionales", no como "marketing".

---

## 3. Política de privacidad — Checklist art. 13 RGPD

Auditoría exhaustiva sobre `PrivacyPolicy.tsx`:

| Mención obligatoria art. 13 RGPD | Estado actual | Comentario |
|---|---|---|
| **Identidad del responsable** (13.1.a) | ⚠️ Falta CIF/NIF (no se renderiza en `PrivacyPolicy.tsx`, solo en LegalNotice) | Añadir bloque con razón social, CIF y dirección |
| **Datos contacto DPO** (13.1.b) | ❌ No mencionado | Añadir: "No se ha designado DPO al no ser obligatorio (art. 37 RGPD)" |
| **Fines del tratamiento** (13.1.c) | ✅ Sí (sección 3) | Bien |
| **Base jurídica** (13.1.c) | ✅ Sí (sección 4) | Correcto: 6.1.a, 6.1.b, 6.1.c |
| **Interés legítimo si aplica** (13.1.d) | N/A | No se invoca 6.1.f |
| **Destinatarios** (13.1.e) | ⚠️ Parcial — sección 7 menciona Supabase, Resend, Redsys, **pero NO Vercel** (hosting) ni Google (Fonts) | ❌ Faltan |
| **Transferencias internacionales** (13.1.f) | ⚠️ Mención genérica a CCT 2021/914 | OK pero impreciso: dice "Supabase, Inc. — UE (región eu-west) — CCT", siendo que Supabase Inc. es entidad de Delaware, EE. UU. La afirmación "región eu-west" minimiza el hecho de la transferencia |
| **Plazo de conservación** (13.2.a) | ✅ Sí (tabla sección 5) | Bien — 6 años contabilidad ajustado a Cód. Comercio + LGT |
| **Derechos del interesado** (13.2.b) | ⚠️ Falta el derecho a la **limitación del tratamiento** (art. 18 RGPD) y a **no ser objeto de decisiones automatizadas** (art. 22) | Añadir ambos |
| **Derecho retirar consentimiento** (13.2.c) | ✅ Sí | Bien |
| **Derecho reclamar ante AEPD** (13.2.d) | ✅ Sí (con enlace aepd.es) | Bien |
| **¿Obligatorio proporcionar datos? Consecuencias?** (13.2.e) | ⚠️ Implícito en sección 4 ("sin estos datos no es posible procesar el pedido"), pero no se dedica sección expresa | Mejorable |
| **¿Decisiones automatizadas / perfilado?** (13.2.f) | ❌ No mencionado | Añadir: "No se realizan decisiones automatizadas ni elaboración de perfiles" |

**Veredicto sección 3:** **APTO CON RESERVAS**. Política redactada con bastante rigor, pero le faltan 3 menciones obligatorias del art. 13 (Vercel/Google entre encargados, derecho de limitación y de no decisiones automatizadas, y mención DPO/no DPO).

---

## 4. Encargados del tratamiento — Art. 28 RGPD

| Proveedor | DPA disponible | Mecanismo transferencia | Mencionado en política | Sub-encargados accesibles |
|---|---|---|---|---|
| **Vercel** (hosting frontend) | ✅ Vercel DPA con CCT 2021/914 (https://vercel.com/legal/dpa) | CCT 2021/914 (módulo 2) | ❌ **NO MENCIONADO** en `PrivacyPolicy.tsx` | Sí, en privacy.vercel.com |
| **Supabase Inc.** (BD + auth + storage + edge) | ✅ DPA (https://supabase.com/dpa) | CCT 2021/914 (módulo 2 + 3 — subprocesador AWS) | ✅ Mencionado, **pero descripción imprecisa** ("UE región eu-west") | Sí (https://supabase.com/dpa subprocesadores) |
| **Resend, Inc.** (email transaccional) | ✅ DPA (https://resend.com/legal/dpa) | CCT 2021/914 | ✅ Mencionado correctamente | Sí |
| **Redsys** (CIF B85955367, ESP) | ✅ Encargado nacional, sin transferencia | Sin transferencia internacional | ✅ Mencionado y descrito correctamente | N/A |
| **Google LLC** (Fonts + Maps) | ✅ DPA (https://privacy.google.com/businesses/processorterms/) | CCT 2021/914 | ❌ **NO MENCIONADO como encargado** — sólo cookies Maps en política de cookies | Sí |

### Acción correctiva sección 4

1. **Antes de la primera venta**, firmar electrónicamente los DPA de Vercel, Supabase, Resend y Google (la firma se hace simplemente aceptando los Términos de la plataforma; verificar fecha de aceptación).
2. **Añadir Vercel y Google** a la tabla de encargados en `PrivacyPolicy.tsx:236-267`.
3. **Sustituir descripción Supabase**: en lugar de "UE (región eu-west)" — que sugiere encargado europeo — usar el texto correcto:
   > *"Supabase, Inc. (Delaware, EE. UU.) — Almacenamiento de base de datos, autenticación y storage en región europea (eu-west-1, Irlanda). Transferencia internacional amparada por Cláusulas Contractuales Tipo (Decisión (UE) 2021/914) y compromisos contractuales de procesamiento en territorio EEE."*
4. Mantener internamente un **registro fechado** de los DPA aceptados (PDF descargado o captura del email de confirmación) por si la AEPD lo solicita.

---

## 5. Consentimiento y bases jurídicas en el checkout

Análisis sobre `Checkout.tsx` + `order-place/index.ts` + `0003_orders_schema.sql`.

| Aspecto | Implementación | Veredicto |
|---|---|---|
| Checkboxes terms/privacy NO pre-marcados | ✅ `Checkout.tsx:577-625` — todos los `<input type="checkbox">` sin `defaultChecked`; schema Zod default false | ✅ Bien |
| Separación entre ejecución contrato (6.1.b) y consentimiento marketing (6.1.a) | ✅ Sí — `accepted_terms`, `accepted_privacy` y `accepted_approval_flow` son obligatorios; `marketing_opt_in` es separado y opcional | ✅ Excelente |
| Marketing opt-in claramente opcional | ✅ `Checkout.tsx:647-656` — visualmente separado, sin "*", etiquetado "(opcional)" | ✅ |
| Captura de prueba del consentimiento | ⚠️ Se guarda `accepted_terms_at` y `accepted_privacy_at` (timestamp UTC) en `orders` tabla, pero **NO se guarda IP del cliente**, **NI User-Agent**, **NI versión de los textos legales aceptados** | ⚠️ Insuficiencia probatoria |
| Minimización de datos (art. 5.1.c) | ✅ Solo se piden datos imprescindibles para envío y facturación | ✅ |
| Validación CIF en B2B | ⚠️ `Checkout.tsx:510` solo placeholder, no hay validación algorítmica del CIF (módulo 11). No es ilegal, pero genera datos incorrectos en facturas | Recomendación: añadir validación Zod |

### Hallazgo medio — Insuficiencia probatoria del consentimiento

El art. 7.1 RGPD exige que el responsable **pueda demostrar que el interesado consintió**. Un simple `accepted_terms_at: timestamp` no acredita quién consintió ni qué texto exacto se aceptó. Si en 2027 el cliente impugna el contrato, el responsable debe poder demostrar:
- IP desde la que se envió el formulario
- User-Agent del navegador
- Versión exacta de los términos vigentes en ese momento (hash del texto o número de versión)

### Acción correctiva sección 5

Añadir a la migración orders y al `order-place/index.ts`:
```sql
ALTER TABLE orders ADD COLUMN consent_ip text;
ALTER TABLE orders ADD COLUMN consent_user_agent text;
ALTER TABLE orders ADD COLUMN consent_terms_version text;
ALTER TABLE orders ADD COLUMN consent_privacy_version text;
```
Y en `order-place/index.ts` extraer `x-forwarded-for`/`user-agent` (como ya se hace en `customer-magic-link-request/index.ts:90-93`) y guardarlos junto con un identificador de versión de los textos legales (por ejemplo, un hash SHA-256 del cuerpo HTML de las páginas, almacenado como setting).

---

## 6. Contratación electrónica — RDL 1/2007 + LSSI-CE

### 6.1 Información precontractual (art. 60 RDL 1/2007)

El art. 60 exige proporcionar al consumidor, **antes** de la formalización, más de 20 piezas de información. Auditamos las que tienen presencia en el checkout:

| Información obligatoria | Visible antes del botón | Comentario |
|---|---|---|
| Identidad del empresario | ⚠️ Solo en footer/links (no en el propio checkout) | Recomendación: añadir bloque resumen vendedor en aside |
| Dirección postal | ⚠️ En footer | Aceptable |
| Características principales del bien | ✅ Items del carrito visibles | OK |
| Precio total incluido impuestos | ✅ `Checkout.tsx:712-720` | OK |
| Gastos adicionales (envío) | ✅ Sí, antes del botón | OK |
| Procedimiento de pago | ⚠️ Mencionado vagamente ("se reservará el importe en tu tarjeta") | Mejorable |
| Plazo de entrega | ❌ **NO consta** en el checkout (sólo en Términos de venta) | ❌ Incumple art. 60.2.g |
| Derecho de desistimiento + formulario tipo | ⚠️ Solo por link a Términos | Debería estar más visible |
| Garantía 3 años | ❌ NO visible en checkout | ❌ |
| Servicios postventa y garantías comerciales | ❌ NO visible | ❌ |
| Mecanismos extrajudiciales reclamación (ODR) | ❌ NO visible en checkout | ❌ |

### 6.2 Botón de pedido — Art. 98.2 RDL 1/2007 (clave)

> *"Si la realización de un pedido se hace activando un botón […], el botón […] se etiquetará de manera fácilmente legible únicamente con la expresión 'pedido con obligación de pago' o una formulación análoga no ambigua".*

**Sanción si se incumple:** según el último párrafo del art. 98.2: *"si el empresario no cumple con este apartado, el consumidor y usuario no quedará obligado por el contrato o pedido"*.

Esto significa que **el contrato es inválido para el consumidor**, que puede revocarlo sin ser tratado como desistimiento. Es el incumplimiento con peor consecuencia jurídica del informe.

**Evidencia actual:**
```tsx
// Checkout.tsx:669 y 730
<Button type="submit" variant="primary" size="lg" ...>
  Tramitar pedido
</Button>
```

**"Tramitar pedido" NO es fórmula inequívoca**. La AEPC y la Audiencia Provincial de Madrid (Sentencia 256/2019) consideran insuficientes formulaciones como "Continuar", "Finalizar", "Comprar" sin más, o "Tramitar pedido".

### Acción correctiva sección 6 — CRÍTICA

Cambiar texto botones en `Checkout.tsx:669` y `Checkout.tsx:730` a:

> **"Realizar pedido con obligación de pago"**

o como alternativa aceptada por doctrina:

> **"Comprar ahora — pedido con obligación de pago"**

NO usar nunca: "Tramitar", "Continuar", "Confirmar", "Finalizar", "Procesar pago".

Igualmente añadir un bloque informativo precontractual en `Checkout.tsx` justo encima del botón de pago, con:
- Identidad y CIF del vendedor
- Plazo de entrega estimado
- Coste total con impuestos
- Garantía legal 3 años
- Derecho desistimiento 14 días naturales + link al formulario
- Enlace ODR ec.europa.eu/odr

### 6.3 Confirmación del pedido (art. 98.4 LSSI-CE + art. 98 RDL 1/2007)

Auditado `send-order-confirmation-customer/index.ts`. **Defectos detectados en el email:**

| Mención obligatoria | Estado |
|---|---|
| Confirmación recepción pedido | ✅ |
| Número de pedido | ✅ |
| Resumen items, totales, IVA | ✅ |
| Identidad completa vendedor (razón social + CIF + domicilio) | ❌ Solo aparece dirección, no CIF ni razón social |
| Derecho de desistimiento + formulario adjunto | ❌ No se menciona en el email |
| Información sobre ODR (art. 14 Reglamento 524/2013) | ❌ **NO está el enlace ec.europa.eu/odr** |
| Garantía legal 3 años | ❌ No se menciona |
| Soporte duradero | ✅ Email (la AEPC y el TJUE — sentencia C-49/11 Content Services — han confirmado que el email constituye soporte duradero) |

### 6.4 Acción correctiva 6.3

Modificar `email-template.ts` para añadir en el footer:

```text
DC Bikes Cantabria · CIF [B-XXXXXXXX] · Dirección [...]

Derecho de desistimiento: dispone de 14 días naturales desde la recepción
del producto para desistir del contrato. Formulario: [enlace al PDF].

Resolución alternativa de litigios: puede acudir a la Plataforma Europea ODR
en https://ec.europa.eu/consumers/odr/

Garantía legal por falta de conformidad: 3 años (art. 120 RDL 1/2007).
```

---

## 7. Derecho de desistimiento — art. 102-108 RDL 1/2007

Auditado `Returns.tsx`:

| Verificación | Estado | Comentario |
|---|---|---|
| Plazo 14 días naturales correctamente informado | ✅ | Sección 1 |
| Inicio del plazo (recepción posesión material) | ✅ | Sección 1 |
| Formulario tipo Anexo B (Directiva 2011/83/UE) descargable | ✅ | `/devoluciones-formulario.pdf` |
| Procedimiento por declaración inequívoca | ✅ | Sección 2 |
| Excepciones art. 103 listadas correctamente | ✅ | Sección 5 |
| Quién paga porte devolución | ✅ | Sección 6 |
| Plazo reembolso 14 días naturales | ✅ | Sección 3 |
| Mismo medio de pago | ✅ | Sección 3 |
| Derecho de retención hasta recepción/prueba (art. 76) | ✅ | Sección 3 |
| Garantía 3 años (RDL 7/2021) | ✅ | Sección 7 |
| Mención disminución valor producto (art. 108) | ✅ | Sección 4 |

**Veredicto sección 7:** **APTA**. La política de devoluciones es la pieza mejor redactada del proyecto. Ningún hallazgo crítico.

Sugerencia menor: añadir el "modelo de formulario de desistimiento" como bloque de texto directo en la página (además del PDF), porque algunos usuarios no pueden abrir PDFs y la jurisprudencia (TJUE C-922/19) ha valorado positivamente la facilidad de ejercicio.

---

## 8. Resolución extrajudicial de conflictos

| Verificación | Estado | Evidencia |
|---|---|---|
| Enlace VISIBLE a ec.europa.eu/odr en la web | ✅ | `TermsOfSale.tsx:367` y `Returns.tsx:295` |
| Enlace en email de confirmación | ❌ | `email-template.ts` no lo incluye |
| Mención Junta Arbitral / Dirección General Consumo Cantabria | ✅ | `TermsOfSale.tsx:378` y `Returns.tsx:305` |
| Mención adhesión a sistema arbitral | ⚠️ Si la empresa NO está adherida a Consumo, debe indicarse expresamente | Acción correctiva |

**Acción correctiva 8.1:** indicar en `TermsOfSale.tsx` sección 10: *"DC Bikes Cantabria [no está adherida / está adherida] al Sistema Arbitral de Consumo."* (decisión del titular).

**Acción correctiva 8.2:** añadir enlace ODR al footer de todos los emails transaccionales.

---

## 9. Facturación electrónica y conservación

Auditado `generate-invoice-pdf/index.ts` + `0003_orders_schema.sql`.

### Cumplimiento RD 1619/2012 (Reglamento de Facturación)

| Mención obligatoria | Implementado en PDF | Línea |
|---|---|---|
| Número correlativo | ✅ Función `next_invoice_number()` atómica | `0003_orders_schema.sql:187-202` |
| Fecha de emisión | ✅ | `generate-invoice-pdf:298` |
| Fecha de operación (si distinta) | ⚠️ Solo aparece "Fecha pedido" — debería decir "Fecha operación" expresamente | Mejorable |
| NIF del emisor | ✅ | Línea 293 |
| Razón social del emisor | ✅ | Línea 284 |
| Domicilio del emisor | ✅ | Línea 307 |
| NIF del receptor (obligatorio B2B) | ✅ | Línea 357 |
| Razón social del receptor (B2B) | ✅ | Línea 350 |
| Domicilio del receptor | ✅ B2B / dirección envío B2C | Línea 365 |
| Descripción de la operación | ✅ Por línea de item | Línea 502 |
| Base imponible | ✅ | Línea 606 |
| Tipo IVA aplicable | ✅ | Línea 619 |
| Cuota IVA | ✅ | Línea 624 |
| Total | ✅ | Línea 641 |
| Serie diferenciada B2C vs B2B | ❌ El campo `invoice_type` se guarda pero el **número correlativo es único** (`next_invoice_number(year)`). Mezclar B2C y B2B en la misma serie no es ilegal pero dificulta auditoría AEAT. Recomendación: dos series independientes | Mejorable |

### Conservación 6 años (vs. 4 años LGT)

Política privacidad cita: "6 años (art. 30 Código de Comercio y art. 29 LGT)".

**Análisis correcto:** el art. 30 CCom obliga a 6 años; el art. 66 LGT obliga a 4 años. **Se aplica el más restrictivo de los exigibles, es decir, 6 años**. Política coherente con la doctrina mayoritaria.

### Verifactu / TicketBAI / SII

- **TicketBAI**: solo aplica en País Vasco. **No aplica** a empresa en Cantabria. ✅
- **SII (Suministro Inmediato Información AEAT)**: solo obligatorio para grandes empresas (> 6 M€ facturación) o sujetos a IVA mensual. **No aplica** a microempresa con 1-5 pedidos/día. ✅
- **Verifactu (RD 1007/2023)**: obligatorio desde **1 de enero de 2026** para sujetos del Impuesto sobre Sociedades, y desde **1 de julio de 2026** para autónomos en estimación directa. ⚠️ **APLICA potencialmente a DC Bikes Cantabria desde julio de 2026** (si es autónomo en estimación directa).

### Acción correctiva sección 9

1. **Verificar urgentemente la forma jurídica del titular** (autónomo, S.L., S.A., comunidad de bienes). Esto determina si Verifactu aplica desde enero o julio de 2026.
2. Si aplica Verifactu: el PDF generado actualmente **NO incluye huella/hash + QR + leyenda VERI*FACTU obligatorios**. Hay que adaptar `generate-invoice-pdf/index.ts` para generar registros con encadenamiento (hash anterior → hash actual), enviar al servicio AEAT, e incluir el código QR en el PDF. Esfuerzo estimado: 20-30 h de desarrollo + 5 h consultoría asesor fiscal.
3. Separar series facturación B2B vs B2C (dos funciones RPC `next_b2b_invoice_number(year)` y `next_b2c_invoice_number(year)`).

---

## 10. Seguridad del tratamiento — Art. 32 RGPD

| Medida art. 32 | Implementación | Veredicto |
|---|---|---|
| Cifrado en tránsito | ✅ HTTPS (Vercel automático) | ✅ |
| Cifrado en reposo | ✅ Supabase encryption-at-rest (AES-256) por defecto | ✅ |
| Pseudonimización datos sensibles | ⚠️ Email cliente en `orders.customer_email` en plano. No es categoría especial, pero es buena práctica hash + token | Mejora opcional |
| Magic link tokens hasheados | ✅ SHA-256 hex, 256 bits entropía, TTL 24h | ✅ Excelente |
| Política contraseñas admin | ❌ No detectada — Supabase Auth por defecto permite contraseñas débiles | Acción correctiva |
| 2FA admin | ❌ No habilitado | Acción correctiva |
| Backups | ⚠️ Supabase ofrece backups automáticos (free: 1 día, pro: 7 días). Si el plan es Free, **no hay backups suficientes según art. 32.1.c (disponibilidad y resiliencia)** | Verificar plan |
| Política rotación logs | ⚠️ `payments_log.raw_payload` JSONB se conserva indefinidamente. Puede contener datos personales que tras 6 años deberían anonimizarse | Acción correctiva |
| Tests de seguridad (art. 32.1.d) | ❌ No detectados | Recomendable pentest anual |

### Acción correctiva sección 10

1. **Habilitar 2FA obligatorio para los usuarios admin** en Supabase Auth (`Settings → Auth → Multi-Factor Authentication`).
2. Configurar **política de contraseñas fuerte**: mínimo 12 caracteres, complejidad, no reutilización.
3. Si el plan Supabase es Free, **migrar a Pro** (25 $/mes) para tener PITR (Point-In-Time Recovery) 7 días. La AEPD considera la **disponibilidad** parte del art. 32 — un crash sin backup sería brecha notificable.
4. Configurar un cron mensual de anonimización de `payments_log.raw_payload` para registros > 6 años (campo nuevo `anonymized_at`).

---

## 11. Brechas de seguridad — Art. 33-34 RGPD

**Estado actual: NULO.**

- ❌ No hay procedimiento documentado de notificación a AEPD en 72h.
- ❌ No hay procedimiento de comunicación a afectados.
- ❌ No hay registro interno de brechas (obligatorio incluso aunque no se notifiquen — art. 33.5).

### Acción correctiva sección 11

Crear un documento interno `docs/legal/procedimiento-brechas.md` que incluya:
- Cadena de decisión (quién evalúa, en qué plazo)
- Plantilla de comunicación AEPD (formulario 040 vía sede electrónica)
- Plantilla de comunicación a afectados
- Tabla de evaluación de riesgo (CNIL-style)

Crear una tabla SQL `data_breaches` para el registro interno:
```sql
CREATE TABLE data_breaches (
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
```

---

## 12. Registro de actividades de tratamiento — Art. 30 RGPD

DC Bikes Cantabria **está obligada** a llevar registro, pese a ser microempresa, porque:
- El tratamiento de pedidos online **no es ocasional** (es la actividad principal).
- Trata datos a escala empresarial (todos los clientes).

**Estado actual:** No detectado en el repositorio.

### Acción correctiva sección 12

Cumplimentar la **plantilla oficial AEPD** (descargable en https://www.aepd.es/guias/plantilla-rat.pdf) con los tratamientos:

1. **Gestión de pedidos online** (6.1.b)
2. **Facturación y obligaciones fiscales** (6.1.c)
3. **Atención al cliente (formulario contacto)** (6.1.a)
4. **Marketing — newsletter** (6.1.a)
5. **Cookies analíticas** (6.1.a)

Almacenar el RAT firmado en `docs/legal/rat-2026.pdf`. Actualizar anualmente.

---

## 13. Datos de menores

**Estado actual:** Nada detectado en el código, ni en `PrivacyPolicy.tsx`, ni en `Checkout.tsx`.

El art. 7 LOPDGDD establece como **edad mínima 14 años** para consentir el tratamiento de datos. Por debajo, se requiere consentimiento del titular de la patria potestad.

Aunque el e-commerce de bicicletas no se dirige específicamente a menores, es razonable presumir que algunos usuarios menores puedan registrarse. Además, el RDL 1/2007 art. 28 considera *consumidores* sólo a personas físicas con capacidad para contratar — los menores de 18 años requieren tutela legal para contratos onerosos no domésticos (art. 1263 Cc).

### Acción correctiva sección 13

Añadir cláusula en `TermsOfSale.tsx` sección 2:

> *"Para realizar pedidos a través de esta tienda online es necesario tener cumplidos 18 años o, en su defecto, contar con la autorización expresa de los progenitores o representantes legales. Al marcar la casilla de aceptación de los términos, el cliente declara cumplir este requisito."*

Y añadir en `PrivacyPolicy.tsx` sección nueva:

> *"Tratamiento de datos de menores: el sitio no se dirige a menores de 14 años. En caso de detectar un tratamiento de datos de menores sin la autorización requerida, procederemos a su supresión inmediata. Si es titular de la patria potestad y detecta tal situación, contáctenos en info@dcbikescantabria.es."*

---

## 14. Marketing y comunicaciones comerciales — Art. 21 LSSI-CE

### Auditoría

| Requisito | Implementación |
|---|---|
| Opt-in expreso para newsletter | ✅ Checkbox `marketing_opt_in` separado y no obligatorio | ✅ |
| Doble opt-in (envío email confirmación + click) | ❌ **No implementado**. El opt-in en checkout marca `marketing_opt_in=true` directamente sin confirmar | ⚠️ Recomendado |
| Unsubscribe funcional en cada email | ❌ **El email-template.ts NO incluye link unsubscribe** porque solo se envían emails **transaccionales** (no comerciales). Aceptable. Pero si en el futuro se mandan newsletters, será obligatorio | OK por ahora |
| Identificación "publicidad/promocional" en asunto | N/A | OK |
| Emails transaccionales sin contenido comercial | ✅ Revisados: no incluyen ofertas/promociones | ✅ |
| Excepción comunicaciones a clientes existentes (art. 21.2 LSSI-CE) | N/A — no se mandan comerciales | OK |

### Recomendación

Cuando se quiera empezar a enviar newsletters/comerciales:
1. Implementar doble opt-in: email automático con link de confirmación tras checkout.
2. Generar token único por suscripción para el link unsubscribe.
3. Una sola tabla `newsletter_subscribers(email, confirmed_at, unsubscribed_at, unsubscribe_token)`.

---

## 15. Magic link "Mis pedidos" — Análisis específico

Auditados `customer-magic-link-request/index.ts`, `_shared/customer-session.ts`, `0007_customer_sessions.sql`, `MyOrdersRequestAccess.tsx`.

| Aspecto | Implementación | Veredicto |
|---|---|---|
| Entropía token | 32 bytes random (256 bits) → 64 chars hex | ✅ Excelente |
| Almacenamiento | SHA-256 hash, **nunca token plano en BD** | ✅ Excelente |
| TTL | 24h | ✅ Adecuado |
| Single-use vs reusable | Reusable durante el TTL (decisión documentada y razonable) | ✅ |
| Revocabilidad | Manual vía DELETE FROM customer_sessions | ⚠️ No hay UI admin |
| Rate-limit | 5/hora/email | ✅ Bien |
| Anti-enumeración | Respuesta idéntica si email existe o no | ✅ Excelente |
| IP / UA logueados | ✅ `customer_sessions.ip_address`, `customer_sessions.user_agent` | ✅ |
| Email magic link incluye política privacidad | ✅ Footer con links | ✅ |
| Token NO contiene email/info sensible | ✅ Token aleatorio puro | ✅ |
| Acceso solo desde edge function con service_role | ✅ RLS sin policies para anon | ✅ |
| Cookies/localStorage de sesión cliente listadas en política | ❌ `dcbikes_customer_session` (`MyOrdersRequestAccess.tsx:7`) **NO está listada** en política de cookies | ❌ Listar |

### Acción correctiva sección 15

1. Añadir `dcbikes_customer_session` a la política de cookies como esencial.
2. Considerar añadir UI admin que muestre sesiones activas por cliente y permita revocar (DELETE) — útil ante peticiones del cliente "ha sido robado mi email, quiero invalidar todos los accesos".

---

## 16. Pasarela de pago — Alcance PCI-DSS

| Verificación | Resultado |
|---|---|
| ¿Se almacena PAN/CVV en sistemas propios? | ✅ NO. Confirmado en `orders` schema — solo `payment_pre_auth_id` (Ds_Merchant_Order, 12 chars, no es PAN) |
| ¿Hay handover completo a Redsys? | ✅ Sí. El formulario Redsys se envía al endpoint Redsys, el navegador navega a sis.redsys.es. Vuelve por webhook |
| SAQ aplicable | **SAQ A** (E-commerce con pasarela tercerizada que aloja la página de pago) |
| Tokenización | N/A — no se tokenizan tarjetas en sistemas propios |
| Política privacidad menciona Redsys correctamente | ✅ `PrivacyPolicy.tsx:259-289` — descripción completa con CIF y enlace política Redsys |

**Veredicto:** SAQ A aplicable. Cumplimiento PCI-DSS satisfactorio.

### Acción menor

El comerciante debe **autocertificarse anualmente** en SAQ A (cuestionario simplificado, ~30 preguntas, gratuito) y enviar el certificado a su entidad adquirente (probablemente la entidad bancaria que contrata Redsys). Esto es responsabilidad del comerciante, no del desarrollador.

---

## 17. Accesibilidad — Real Decreto 1112/2018

**¿Aplica DC Bikes Cantabria?**

El RD 1112/2018 transpone la Directiva (UE) 2016/2102 y se aplica a:
- Sector público (siempre)
- Sector privado: **solo cuando se trata de servicios esenciales** o si la empresa supera ciertos umbrales

DC Bikes Cantabria es **microempresa privada que NO presta servicios esenciales** → **NO aplica el RD 1112/2018**.

**Sin embargo**, aplica la **Ley 11/2023** (transposición Directiva de Accesibilidad EAA 2019/882), vigente desde **28 de junio de 2025**, que obliga a las empresas privadas que prestan determinados servicios (entre ellos, **comercio electrónico al consumidor**) a cumplir requisitos de accesibilidad WCAG 2.1 nivel AA.

**Excepción microempresas:** la Ley 11/2023 art. 4 excluye a las empresas con **< 10 trabajadores Y facturación anual < 2 M €**. Si DC Bikes Cantabria cumple ambos criterios, queda **EXENTA**.

### Acción correctiva sección 17

1. **Verificar plantilla** y facturación de DC Bikes Cantabria.
2. Si es microempresa: añadir en `LegalNotice.tsx` una sección 8 nueva:
   > *"Accesibilidad: Esta tienda online es operada por una microempresa que queda fuera del ámbito de aplicación de la Ley 11/2023 (art. 4.1). No obstante, aplicamos prácticas básicas de accesibilidad y agradecemos cualquier sugerencia de mejora."*
3. Si NO es microempresa (≥10 empleados o ≥2M€ facturación): obligatorio realizar **auditoría WCAG 2.1 AA**. Es un proyecto serio (40-80 h de remediación) — fuera del alcance de esta auditoría legal pero es un GAP CRÍTICO.

---

## 18. SEO, prerender y exposición de datos personales

### 18.1 robots.txt

`public/robots.txt`:
```
Disallow: /admin/
Disallow: /api/
Disallow: /carrito
Disallow: /checkout
Disallow: /pedido/
Disallow: /mock-redsys-pago/
Disallow: /mis-pedidos
Disallow: /mis-pedidos/
```

✅ Correctamente bloquea rutas con datos personales.

### 18.2 sitemap.xml

✅ Solo incluye rutas públicas (/ /catalogo /taller /contacto /devoluciones /terminos-venta). **No expone rutas privadas.**

### 18.3 noindex en páginas internas

✅ `MyOrdersRequestAccess.tsx:70`, `MyOrdersSession.tsx:129,154`, `MyOrderDetailCustomer.tsx:425` todas usan `<SEO noIndex />` que renderiza `<meta name="robots" content="noindex, nofollow" />`.

⚠️ `Checkout.tsx:204-208` **NO usa noIndex**. Aunque está en robots.txt, la doctrina AEPD considera mejor doble protección. Acción correctiva: añadir `noIndex` al SEO de Checkout, Cart, OrderConfirmation, PaymentError, RedsysRedirecting, MockRedsysPayment.

### 18.4 prerender script

No revisado en profundidad (`scripts/prerender.mjs`). Recomendación: verificar manualmente que el script no prerendere ninguna URL con `[id]` dinámico de pedido (`/pedido/confirmacion?id=...`).

---

## 19. Plan de acción priorizado

| # | Hallazgo | Severidad | Norma incumplida | Acción concreta | Esfuerzo |
|---|---|---|---|---|---|
| 1 | Aviso legal con NIF/CIF/forma jurídica/inscripción vacíos | **CRÍTICO** | Art. 10 LSSI-CE | Rellenar settings + bloquear publicación si pendiente | 1 h |
| 2 | Aviso legal afirma "no realiza venta online directa" | **CRÍTICO** | Art. 10 LSSI-CE + art. 5 LCD | Reescribir secciones 2 y 3 de `LegalNotice.tsx` | 2 h |
| 3 | Botón "Tramitar pedido" sin fórmula "con obligación de pago" | **CRÍTICO** | Art. 98.2 RDL 1/2007 | Cambiar texto botón Checkout y MockRedsysPayment | 30 min |
| 4 | Banner cookies: "Aceptar todas" más prominente que "Solo esenciales" | **CRÍTICO** | Guía AEPD Cookies 2023 + CJUE Planet49 | Igualar variant primary ambos botones; renombrar a "Rechazar todas" | 1 h |
| 5 | Google Fonts cargado sin consentimiento | **CRÍTICO** | Art. 22.2 LSSI-CE + art. 6 RGPD | Autohospedar con `@fontsource/*` | 1 h |
| 6 | Toggle "Cookies analíticas" pre-marcado en true | **CRÍTICO** | Art. 4.11 RGPD | Cambiar default a false en `CookieBanner.tsx:27` | 5 min |
| 7 | Política privacidad no menciona Vercel y Google como encargados | **ALTO** | Art. 13.1.e RGPD + art. 28 | Añadir filas en tabla encargados | 30 min |
| 8 | Descripción Supabase impreciso ("UE región eu-west") | **ALTO** | Art. 13.1.f RGPD | Reescribir como entidad USA con CCT | 15 min |
| 9 | No se captura IP/UA/versión textos al consentir | **ALTO** | Art. 7.1 RGPD | Migración SQL + modificar `order-place/index.ts` | 2 h |
| 10 | Email confirmación sin enlace ODR ni CIF | **ALTO** | Art. 14 R. 524/2013 + art. 10 LSSI-CE | Modificar `email-template.ts` footer | 1 h |
| 11 | Email confirmación sin info desistimiento | **ALTO** | Art. 98 RDL 1/2007 | Añadir bloque informativo al body de cada email transaccional | 1 h |
| 12 | Política cookies con inventario incompleto (faltan ≥5 localStorage) | **ALTO** | Guía AEPD apartado 4 | Actualizar tabla `CookiePolicy.tsx` | 1 h |
| 13 | Sin registro de actividades (art. 30 RGPD) | **ALTO** | Art. 30 RGPD | Cumplimentar plantilla AEPD y archivar | 4 h |
| 14 | Sin procedimiento brechas (art. 33-34) | **ALTO** | Art. 33-34 RGPD | Documento + tabla SQL | 4 h |
| 15 | Admin sin 2FA obligatorio | **MEDIO** | Art. 32.1.b RGPD | Configurar Supabase Auth | 30 min |
| 16 | Política sin mención DPO ni decisiones automatizadas | **MEDIO** | Art. 13.1.b + 13.2.f RGPD | Añadir secciones | 30 min |
| 17 | Política sin derecho de limitación tratamiento | **MEDIO** | Art. 18 RGPD | Añadir en sección Derechos | 15 min |
| 18 | Política sin mención específica menores | **MEDIO** | Art. 7 LOPDGDD | Añadir cláusula | 15 min |
| 19 | Sin cláusula 18 años Términos venta | **MEDIO** | Art. 1263 Cc + art. 28 RDL 1/2007 | Añadir cláusula en TermsOfSale.tsx sección 2 | 15 min |
| 20 | Categorización Google Maps como "marketing" | **MEDIO** | Buena práctica AEPD | Crear categoría "terceros" o "funcionales-terceros" | 1 h |
| 21 | Verifactu — verificar aplicabilidad y, si aplica, adaptar PDF | **MEDIO** | RD 1007/2023 | Verificar forma jurídica + adaptar generador PDF + AEAT | 20-30 h |
| 22 | Series correlativas B2C/B2B unificadas | **BAJO** | Recomendación AEAT | Dos funciones RPC separadas | 2 h |
| 23 | localStorage `dcbikes_cookie_consent` sin TTL 12 meses | **BAJO** | Guía AEPD apartado 6.2 | Añadir `savedAt` y validación | 1 h |
| 24 | Pages Checkout/Cart sin noIndex meta tag | **BAJO** | Doble protección recomendada | Añadir `noIndex` en `<SEO />` | 30 min |
| 25 | Validación algorítmica CIF | **BAJO/MEJORA** | Buena calidad de datos | Añadir Zod refine con check módulo 11 | 1 h |
| 26 | Anonimización logs > 6 años | **BAJO/MEJORA** | Art. 5.1.e RGPD principio minimización | Cron mensual | 4 h |
| 27 | Auditoría WCAG 2.1 AA si NO es microempresa | **POTENCIALMENTE CRÍTICO** | Ley 11/2023 EAA | Verificar plantilla y facturación; si aplica, auditoría externa | 40-80 h |

**Esfuerzo total estimado para alcanzar APTO (excluyendo Verifactu y accesibilidad):** **27-35 horas de desarrollo**.

---

## 20. Anexos

### Anexo A — Textos legales que requieren reescritura

| Archivo | Sección | Motivo |
|---|---|---|
| `src/pages/public/LegalNotice.tsx` | Sección 1 | Falta rellenar settings legales |
| `src/pages/public/LegalNotice.tsx` | Sección 3 ("Actividad") | Contradice tienda online — reescribir |
| `src/pages/public/PrivacyPolicy.tsx` | Sección 7 | Añadir Vercel + Google; reescribir descripción Supabase |
| `src/pages/public/PrivacyPolicy.tsx` | Sección 6 | Añadir derecho limitación + decisiones automatizadas |
| `src/pages/public/PrivacyPolicy.tsx` | Sección nueva | Añadir mención DPO y menores |
| `src/pages/public/CookiePolicy.tsx` | Tabla "Esenciales" | Añadir todas las localStorage detectadas |
| `src/pages/public/CookiePolicy.tsx` | Tabla nueva | Añadir Google Fonts (o eliminar la dependencia) |
| `src/pages/public/TermsOfSale.tsx` | Sección 2 | Añadir cláusula 18 años |
| `src/pages/public/TermsOfSale.tsx` | Sección 10 | Indicar adhesión/no adhesión arbitral consumo |
| `src/components/layout/CookieBanner.tsx` | Estado inicial + estructura visual | Reescritura completa con "Rechazar todas" y default false |

### Anexo B — Borrador de cláusula de cookies (banner principal corregido)

```tsx
// Reescribir en CookieBanner.tsx el bloque flex justify-end
<div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
  <Button
    variant="primary"
    size="sm"
    onClick={() => save('essential')}
    className="flex-1 sm:flex-none text-xs font-[var(--font-cond)] tracking-wide"
  >
    Rechazar todas
  </Button>
  <Button
    variant="primary"
    size="sm"
    onClick={() => save('all')}
    className="flex-1 sm:flex-none text-xs font-[var(--font-cond)] tracking-wide"
  >
    Aceptar todas
  </Button>
  <button
    type="button"
    onClick={() => setExpanded(v => !v)}
    className="px-3 py-2 rounded-lg text-sm text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-ink)] transition-colors"
  >
    Configurar
  </button>
</div>
```

Y estado inicial:
```tsx
const [prefs, setPrefs] = useState<CookiePreferences>({
  essential: true,
  analytics: false,   // ⬅ FALSE por defecto (art. 4.11 RGPD)
  marketing: false,
})
```

### Anexo C — Borrador de información precontractual al pie del Checkout

Insertar en `Checkout.tsx` justo encima del botón "Tramitar pedido":

```tsx
<div className="text-[11px] text-[var(--color-mid)] space-y-1.5 leading-relaxed">
  <p>
    <strong className="text-[var(--color-cream-dim)]">Vendedor:</strong> {companyName} · CIF {cif} · {address}
  </p>
  <p>
    <strong className="text-[var(--color-cream-dim)]">Plazo de entrega:</strong> 2-5 días laborables tras la aceptación del pedido.
  </p>
  <p>
    <strong className="text-[var(--color-cream-dim)]">Total con impuestos:</strong> {fmtEuros(totalCents)} € (IVA {taxRate}% incluido).
  </p>
  <p>
    <strong className="text-[var(--color-cream-dim)]">Derecho de desistimiento:</strong> 14 días naturales desde la recepción.
    <Link to="/devoluciones" className="text-[var(--color-lavender)] underline">Más info</Link>.
  </p>
  <p>
    <strong className="text-[var(--color-cream-dim)]">Garantía legal:</strong> 3 años por falta de conformidad (RDL 1/2007).
  </p>
  <p>
    <strong className="text-[var(--color-cream-dim)]">Reclamaciones:</strong> {storeEmail} · Plataforma ODR Comisión Europea: <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener" className="text-[var(--color-lavender)] underline">ec.europa.eu/odr</a>
  </p>
</div>

<Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="...">
  Realizar pedido con obligación de pago
</Button>
```

### Anexo D — Borrador de email confirmación pedido conforme art. 98 RDL 1/2007

Añadir al final del `bodyHtml` en `send-order-confirmation-customer/index.ts`:

```html
<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />

<h3 style="margin:0 0 10px 0;font-size:14px;color:#0F0F12">Información legal del pedido</h3>

<table style="width:100%;font-size:12px;color:#555;line-height:1.65">
  <tr><td style="padding:2px 0"><strong>Vendedor:</strong></td><td>${escapeHtml(legalCompanyName)}</td></tr>
  <tr><td style="padding:2px 0"><strong>CIF:</strong></td><td>${escapeHtml(legalCompanyCif)}</td></tr>
  <tr><td style="padding:2px 0"><strong>Dirección:</strong></td><td>${escapeHtml(legalCompanyAddress)}</td></tr>
  <tr><td style="padding:2px 0"><strong>Atención cliente:</strong></td><td>${escapeHtml(storeEmail)}</td></tr>
</table>

<p style="margin:14px 0 4px 0;font-size:12px;color:#555">
  <strong>Derecho de desistimiento:</strong> dispone de 14 días naturales desde la recepción del
  producto para desistir del contrato sin justificación (art. 102 RDL 1/2007).
  Descargue el formulario en <a href="${siteUrl}/devoluciones-formulario.pdf" style="color:#A788B5">desistimiento</a>.
</p>

<p style="margin:8px 0 4px 0;font-size:12px;color:#555">
  <strong>Garantía legal:</strong> los productos disponen de garantía por falta de conformidad de
  3 años desde la entrega (art. 120 RDL 1/2007, redacción RDL 7/2021).
</p>

<p style="margin:8px 0 4px 0;font-size:12px;color:#555">
  <strong>Resolución de conflictos:</strong> Plataforma europea ODR de la Comisión:
  <a href="https://ec.europa.eu/consumers/odr/" style="color:#A788B5">ec.europa.eu/consumers/odr</a>.
  También puede acudir a la Dirección General de Consumo del Gobierno de Cantabria.
</p>

<p style="margin:8px 0 0 0;font-size:12px;color:#555">
  <strong>Protección de datos:</strong> sus datos se tratan para gestionar el pedido (art. 6.1.b
  RGPD) y se conservan 6 años (obligación legal). Más información en nuestra
  <a href="${siteUrl}/privacidad" style="color:#A788B5">política de privacidad</a>.
</p>
```

---

## Conclusión final

DC Bikes Cantabria parte de una **base técnica muy sólida** — RLS bien configurado, tokens criptográficamente fuertes, pre-autorización Redsys, anti-fraude, anti-enumeración. La arquitectura no es el problema.

El problema es que **el cumplimiento legal aún no está terminado**. De los 27 hallazgos:
- **6 críticos** bloquean la puesta en producción comercial.
- **11 altos** generan riesgo regulatorio inmediato si entra en producción.
- **10 medios/bajos** son refinamientos profesionales.

Con **27-35 horas de trabajo de desarrollo + 2-3 horas de revisión del titular** (rellenar settings, firmar DPAs, decidir adhesión arbitral), la web pasaría de **NO APTO** a **APTO** para producción comercial. La única excepción es Verifactu, que requiere su propio proyecto de adaptación si la forma jurídica del titular lo exige a partir de julio 2026.

**Próximo paso recomendado:** ejecutar los hallazgos 1-6 (críticos) y 7-14 (altos) en un único sprint legal. Esto produce el cumplimiento mínimo "publicable". El resto se aborda en un segundo sprint o se va asumiendo gradualmente.

---

*Informe emitido el 26 de mayo de 2026. Auditoría sustantiva basada en revisión directa del repositorio. Las referencias normativas citadas están vigentes a la fecha de emisión. La normativa puede sufrir modificaciones posteriores — particularmente en materia de Verifactu y EAA, donde hay calendarios de aplicación en curso.*
