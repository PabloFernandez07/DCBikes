---
title: Plan de continuidad y recuperación
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Plan de continuidad y recuperación — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 32.1.c RGPD (capacidad de restaurar disponibilidad y acceso) y 32.1.d (verificación periódica).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].
**Activos:** ver `Docs/legal/inventario-activos.md`.

---

## 1. Objeto

Garantizar la **continuidad del servicio** y la **recuperación de los datos** ante incidentes que afecten a la disponibilidad (caída de proveedor, borrado accidental, ataque, error de despliegue).

## 2. Objetivos de recuperación

| Métrica | Objetivo | Justificación |
|---|---|---|
| RTO (tiempo de recuperación) | ≤ 24 h | Comercio minorista; tolerancia razonable a interrupción breve |
| RPO (pérdida máxima de datos) | ≤ 24 h | Cubierto por backups diarios del proveedor de BD |

## 3. Copias de seguridad

- **Base de datos:** backups automáticos gestionados por Supabase (point-in-time recovery según plan contratado). Verificar política de retención del plan.
- **Código:** versionado en el repositorio (infraestructura como código: migraciones en `supabase/migrations/`).
- **Secretos:** custodiados en vault; rotación documentada (`Docs/runbooks/secret-rotation.md`).

## 4. Escenarios y respuesta

| Escenario | Respuesta | Runbook |
|---|---|---|
| Borrado accidental de datos | Restaurar desde PITR del proveedor | (Soporte Supabase) |
| Lista `admin_users` vaciada / pérdida de acceso admin | Recuperación vía `service_role` | `Docs/runbooks/admin-recovery.md` |
| Caída de hosting (Vercel) | Re-despliegue / failover | `Docs/runbooks/` despliegue |
| Compromiso de secretos | Rotación inmediata | `Docs/runbooks/secret-rotation.md` |
| Brecha de seguridad | Procedimiento de brechas | `Docs/legal/procedimiento-brechas.md` |
| Cese de un proveedor / subencargado | Sustitución | `Docs/legal/politica-subencargados.md`, `sucesion-empresa-cierre.md` |

## 5. Continuidad ante cese de actividad

En caso de cierre o sucesión empresarial, se aplica el procedimiento de `Docs/legal/sucesion-empresa-cierre.md`, asegurando la conservación de obligaciones fiscales y la supresión del resto de datos.

## 6. Pruebas y verificación

- Verificación periódica de que los backups son restaurables (art. 32.1.d).
- Ensayo del procedimiento de recuperación de admin (`admin-recovery.md`) al menos una vez al año.

## 7. Revisión

Revisión trimestral y tras cualquier incidente (ver `Docs/runbooks/legal-quarterly-review.md`).
