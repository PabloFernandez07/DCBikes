---
title: Procedimiento de gestión de derechos de los interesados
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Procedimiento de gestión de derechos de los interesados — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículos 15 a 22 RGPD; artículos 13 a 18 LOPDGDD.
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].
**Canal de ejercicio:** info@dcbikescantabria.es.

---

## 1. Derechos cubiertos

| Derecho | Artículo RGPD | Aplicación en DC Bikes |
|---|---|---|
| Acceso | 15 | Copia de pedidos, presupuestos y consentimientos asociados al interesado |
| Rectificación | 16 | Corrección de datos de contacto/envío |
| Supresión ("olvido") | 17 | Sujeto a obligaciones de conservación fiscal/mercantil (ver §4) |
| Limitación | 18 | Marcado del tratamiento como restringido |
| Portabilidad | 20 | Exportación en formato estructurado (JSON/CSV) |
| Oposición | 21 | Cese de tratamientos basados en interés legítimo |
| Decisiones automatizadas | 22 | No se realizan decisiones automatizadas con efectos jurídicos |

## 2. Recepción y verificación de identidad

1. La solicitud llega por el canal publicado (email) o formulario.
2. Se **verifica la identidad** del solicitante de forma proporcionada (sin exceso de datos), p. ej. confirmando el email asociado al pedido.
3. Se registra la solicitud (tabla `data_subject_requests`, migración 0016).

## 3. Plazos

- Respuesta en **un mes** desde la recepción (art. 12.3).
- Prórroga de hasta **dos meses** adicionales si la solicitud es compleja, informando al interesado en el primer mes.
- Si no se atiende: informar de los motivos y del derecho a reclamar ante la AEPD.

## 4. Particularidad de la supresión

La supresión **no es absoluta**: los datos vinculados a facturas y pedidos deben conservarse por obligación fiscal/mercantil (ver `Docs/legal/politica-conservacion.md`). En estos casos se aplica **limitación del tratamiento** y, cumplido el plazo legal, **anonimización irreversible**. Procedimiento operativo en `Docs/legal/procedimiento-supresion.md`.

## 5. Registro y trazabilidad

Cada solicitud y su resolución se registran en `data_subject_requests` con fecha de entrada, tipo, estado y fecha de resolución, garantizando la rendición de cuentas (art. 5.2).

## 6. Gratuidad

El ejercicio de derechos es **gratuito**, salvo solicitudes manifiestamente infundadas o excesivas (art. 12.5).

## 7. Revisión

Revisión trimestral (ver `Docs/runbooks/legal-quarterly-review.md`).
