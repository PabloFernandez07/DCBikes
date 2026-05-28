---
title: Política de seguridad de la información
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Política de seguridad de la información — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 32 RGPD (seguridad del tratamiento); ENS como marco de referencia (no obligatorio para entidad privada).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].

---

## 1. Objeto y alcance

Define las medidas técnicas y organizativas para garantizar la **confidencialidad, integridad, disponibilidad y resiliencia** de los sistemas que tratan datos personales (web, backend Supabase, hosting Vercel, email Resend, pasarela Redsys).

## 2. Control de acceso

- Separación de privilegios: rol `authenticated` ≠ administrador; la condición de admin se controla por la allowlist `admin_users` y la función `is_admin()` (migración 0013).
- RLS activo y restrictivo en todas las tablas sensibles (0029, 0030).
- RPCs internas y contadores fiscales accesibles **solo por `service_role`** (0031, 0034, 0045).
- Acceso al panel `/admin` protegido; flujos de pago sensibles con OTP (0044).

## 3. Cifrado

- **En tránsito:** TLS en todas las comunicaciones (web, API, email).
- **En reposo:** cifrado gestionado por los proveedores (Supabase/Vercel).
- Secretos gestionados vía vault (ver `Docs/runbooks/cron-vault-setup.md`, `Docs/runbooks/secret-rotation.md`).

## 4. Integridad e inmutabilidad

- Logs de pago, facturas e historial de estado son **inmutables** por RLS (0029) — solo SELECT/INSERT.
- Historial de precios inmutable con trazabilidad de autor y motivo (0046).
- Audit log de operaciones administrativas (0033).

## 5. Disponibilidad y resiliencia

- Copias de seguridad gestionadas por el proveedor de BD.
- Idempotencia y locks de advisory en operaciones críticas (contadores de factura, retención) para evitar corrupción por concurrencia (0034, 0035).
- Plan de continuidad documentado en `Docs/legal/plan-continuidad.md`.

## 6. Cabeceras y endurecimiento web

- Política de seguridad de contenido (CSP) — ver `Docs/runbooks/csp-rollout.md`.
- Protección anti-CSRF y rate-limiting (p. ej. `order_public_get`, magic-link).

## 7. Gestión de secretos y rotación

Rotación periódica de credenciales y secretos según `Docs/runbooks/secret-rotation.md`. Ningún secreto real se commitea al repositorio.

## 8. Brechas de seguridad

Detección, registro, escalado y notificación según `Docs/legal/procedimiento-brechas.md` y la tabla `data_breaches` (0010, 0024, 0047).

## 9. Personal

Acceso al panel limitado a las personas estrictamente necesarias (ver `admin_users`), con deber de confidencialidad.

## 10. Revisión

Revisión trimestral y tras cualquier incidente de seguridad relevante (ver `Docs/runbooks/legal-quarterly-review.md`).
