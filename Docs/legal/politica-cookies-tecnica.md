---
title: Política de cookies (documentación técnica)
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Política de cookies — documentación técnica — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 22.2 LSSI-CE (Ley 34/2002); RGPD; Guía de cookies de la AEPD (2023).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].

---

## 1. Objeto

Inventario técnico de las cookies y tecnologías de almacenamiento utilizadas en la web, su finalidad, base de consentimiento y duración. Sirve de soporte al banner de consentimiento y a la política de cookies de cara al usuario.

## 2. Principio de consentimiento

- Solo se instalan cookies **técnicas/necesarias** sin consentimiento previo (art. 22.2 LSSI, excepción de comunicación o servicio solicitado).
- Cualquier cookie **analítica, de personalización o de terceros** requiere **consentimiento previo, informado y granular**, revocable con la misma facilidad con la que se otorga.
- El consentimiento se registra (auditoría) — ver tabla `consent_audit` y migración 0032.

## 3. Inventario de cookies y almacenamiento

| Nombre / patrón | Tipo | Finalidad | Titular | Duración | ¿Requiere consentimiento? |
|---|---|---|---|---|---|
| Cookie de sesión de checkout | Técnica | Mantener el carrito y la sesión de compra | Propia | Sesión | No |
| Token de sesión de cliente (magic-link) | Técnica | Autenticación del cliente | Propia | Según expiración del token | No |
| Preferencia de consentimiento de cookies | Técnica | Recordar la elección del usuario | Propia | 6-12 meses | No |
| Token CSRF / seguridad | Técnica | Protección frente a CSRF | Propia | Sesión | No |
| Analítica de producto (si se activa) | Analítica | Métricas de uso agregadas | Propia / proveedor | ≤ 13 meses | **Sí** |

> Si en el futuro se incorporan cookies de terceros (publicidad, redes sociales, mapas embebidos), deben añadirse a esta tabla **antes** de su despliegue y reflejarse en el banner.

## 4. Almacenamiento local (no-cookie)

Cualquier uso de `localStorage`/`sessionStorage` que almacene datos no estrictamente necesarios se equipara a cookie no técnica a efectos de consentimiento (criterio AEPD).

## 5. Relación con la analítica

Los eventos de analítica se seudonimizan y se purgan a los **13 meses** (`purge_analytics_older_than_13_months()`, migraciones 0025/0028). La activación de analítica está condicionada al consentimiento.

## 6. Revisión

Revisión trimestral y ante la incorporación de cualquier nueva tecnología de seguimiento (ver `Docs/runbooks/legal-quarterly-review.md`).
