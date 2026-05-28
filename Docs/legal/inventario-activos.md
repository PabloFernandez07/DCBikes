---
title: Inventario de activos de información
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Inventario de activos de información — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 32 RGPD (medidas de seguridad); buena práctica de gestión de activos (ISO 27001 A.5.9 como referencia).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].

---

## 1. Objeto

Relación de los **activos de información** que soportan el tratamiento de datos personales, su propietario, criticidad y datos que contienen. Base para el análisis de riesgos (`Docs/legal/analisis-riesgos.md`) y el plan de continuidad (`Docs/legal/plan-continuidad.md`).

## 2. Activos de software / servicios

| Activo | Tipo | Proveedor | Datos personales | Criticidad |
|---|---|---|---|---|
| Base de datos PostgreSQL | Servicio gestionado | Supabase | Pedidos, clientes, facturas, sesiones, consentimientos, brechas | Alta |
| Edge functions / backend | Cómputo | Supabase / Vercel | Datos en tránsito | Alta |
| Hosting web | Hosting | Vercel | Logs de petición | Media |
| Email transaccional | SaaS | Resend | Email, contenido de mensajes | Media |
| Pasarela de pago | SaaS | Redsys | Datos de pago tokenizados | Alta |
| Dominio DNS | Servicio | Registrador de dominio | — | Alta (control de acceso) |

## 3. Activos de datos (tablas principales)

| Tabla | Contenido | Sensibilidad | Inmutable |
|---|---|---|---|
| `orders` / `order_items` | Pedidos y líneas | Alta | No (anonimizable) |
| `invoices` | Facturas | Alta (fiscal) | Sí |
| `payments_log` | Log de pagos | Alta | Sí |
| `order_status_history` | Audit trail pedidos | Media | Sí |
| `quote_requests` | Presupuestos | Media | No (anonimizable) |
| `customer_sessions` | Sesiones | Media | No (purgable) |
| `consent_audit` | Consentimientos | Alta (prueba) | Sí |
| `data_breaches` | Brechas | Alta | Permanente |
| `admin_users` | Allowlist admin | Alta | No |
| `product_price_history` | Histórico de precios | Baja | Sí |

## 4. Activos de credenciales / secretos

- Claves de servicio Supabase (`service_role`), secretos de cron (`CRON_SECRET`), claves Redsys, API key Resend. Gestionados vía vault; rotación según `Docs/runbooks/secret-rotation.md`. **Nunca** en el repositorio.

## 5. Propietario y responsabilidad

Propietario de todos los activos: el responsable del tratamiento (titular). Designación interna de privacidad en `Docs/legal/designacion-responsable-privacidad.md`.

## 6. Revisión

Revisión trimestral y ante el alta/baja de cualquier proveedor o tabla (ver `Docs/runbooks/legal-quarterly-review.md`).
