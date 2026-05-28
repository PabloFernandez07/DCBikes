---
title: Resumen ejecutivo de la evaluación de impacto (DPIA)
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Resumen ejecutivo de la evaluación de impacto (DPIA) — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 35 RGPD (evaluación de impacto relativa a la protección de datos).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].
**Documento de detalle:** ver `Docs/legal/analisis-dpia.md`.

---

## 1. ¿Es obligatoria una DPIA?

El art. 35.1 RGPD exige DPIA cuando un tratamiento entrañe **alto riesgo** para los derechos y libertades. Los tratamientos de DC Bikes Cantabria son los propios de un **comercio minorista online**: gestión de pedidos, pagos y atención comercial.

**Conclusión:** **No concurren** los supuestos de tratamiento a gran escala de categorías especiales, observación sistemática a gran escala ni elaboración de perfiles con efectos jurídicos (lista del art. 35.3 ni la lista de la AEPD). **La DPIA no es legalmente obligatoria**, pero se realiza una **evaluación de impacto simplificada** voluntaria como buena práctica.

## 2. Tratamientos evaluados

| Tratamiento | Datos | Riesgo inherente | Riesgo residual (tras medidas) |
|---|---|---|---|
| Gestión de pedidos / guest checkout | Identificativos, contacto, dirección | Medio | Bajo |
| Pagos (Redsys) | Datos de pago tokenizados | Medio-alto | Bajo (tokenización, no se almacena PAN) |
| Atención comercial (presupuestos) | Email, teléfono, mensaje | Bajo | Bajo |
| Analítica | Eventos seudonimizados | Bajo | Muy bajo (purga 13 meses) |

## 3. Principales medidas mitigadoras

- RLS estricto por `is_admin()` y aislamiento de RPCs internas a `service_role` (migraciones 0029-0031, 0045).
- Inmutabilidad de logs fiscales y de pago (0029).
- Cifrado en tránsito (TLS) y en reposo (proveedores).
- Minimización y plazos de conservación con supresión/anonimización automatizada (ver `Docs/legal/politica-conservacion.md`).
- 2FA/OTP en el flujo de pago sensible (0044).

## 4. Riesgo residual global

**Bajo.** No se identifican riesgos altos no mitigados que obliguen a consulta previa a la AEPD (art. 36).

## 5. Revisión

La evaluación se revisa ante cualquier cambio sustancial del tratamiento y, en todo caso, en la revisión trimestral (ver `Docs/runbooks/legal-quarterly-review.md`).
