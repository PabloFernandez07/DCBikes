---
title: Política de subencargados del tratamiento
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Política de subencargados del tratamiento — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 28 RGPD (encargado del tratamiento), apartados 2 y 4.
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].

---

## 1. Objeto

DC Bikes Cantabria recurre a **encargados del tratamiento** (proveedores que tratan datos personales por cuenta del responsable). Algunos de ellos, a su vez, subcontratan a **subencargados**. Esta política regula su autorización, control y la obligación de información al responsable.

## 2. Autorización general de subencargados (art. 28.2 RGPD)

El responsable otorga **autorización general** a los encargados listados en el inventario de DPA (ver `Docs/legal/registro-dpas.md`) para recurrir a subencargados, con la obligación de:

1. Informar de cualquier alta o sustitución de subencargado con antelación razonable.
2. Imponer al subencargado, por contrato, las mismas obligaciones de protección de datos.
3. Permitir al responsable oponerse a un nuevo subencargado.

## 3. Inventario de encargados y subencargados principales

| Encargado | Servicio | Rol | Ubicación tratamiento | Subencargados conocidos |
|---|---|---|---|---|
| Supabase | Base de datos y backend | Encargado | UE (región configurada) | Proveedores de infraestructura cloud del encargado |
| Vercel | Hosting y edge functions | Encargado | UE / global (edge) | Proveedores de CDN/cloud del encargado |
| Resend | Envío de email transaccional | Encargado | EE. UU. / UE | Proveedores de entrega de correo |
| Redsys | Pasarela de pago | Corresponsable / encargado según operación | España (UE) | Entidades del sistema de pagos |

> Los datos exactos (versión de DPA, fecha de firma, garantías de transferencia) se mantienen en `Docs/legal/registro-dpas.md` y `Docs/legal/tias-transferencias.md`.

## 4. Control y vigilancia

- Revisión periódica de las páginas de subencargados de cada proveedor.
- Verificación de que cada subencargado fuera del EEE cuenta con garantías adecuadas (cláusulas contractuales tipo, decisión de adecuación) — ver `Docs/legal/tias-transferencias.md`.
- Registro de cualquier cambio en el control de versiones de este repositorio.

## 5. Derecho de oposición

Si el responsable se opone a un nuevo subencargado y el encargado no ofrece alternativa, se evaluará la sustitución del encargado conforme al procedimiento de continuidad (ver `Docs/legal/plan-continuidad.md`).
