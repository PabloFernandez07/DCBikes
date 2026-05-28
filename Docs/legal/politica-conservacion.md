---
title: Política de conservación y supresión de datos
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Política de conservación y supresión de datos — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 5.1.e RGPD (limitación del plazo de conservación), artículo 32 LOPDGDD, normativa fiscal y mercantil aplicable.
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío; usar valor de `/admin/configuracion → Facturación` una vez relleno].

---

## 1. Principio general

Los datos personales se conservan **únicamente durante el tiempo necesario** para los fines del tratamiento y, posteriormente, durante los plazos de prescripción legal aplicables, tras lo cual se **suprimen o anonimizan** de forma irreversible.

## 2. Tabla de plazos de conservación

| Categoría de dato | Finalidad | Plazo de conservación | Fundamento | Mecanismo de supresión |
|---|---|---|---|---|
| Pedidos y datos de cliente (guest checkout) | Ejecución del contrato de compraventa | 6 años desde la entrega | Art. 30 Código de Comercio | Anonimización vía `data-retention-cron` (`orders.anonymized_at`) |
| Facturas emitidas (B2C/B2B) | Obligación fiscal | 6 años (mercantil) / mín. 4 años (Ley 58/2003 LGT) | Art. 30 CCom + art. 66 LGT | Tabla `invoices` inmutable (RLS solo SELECT/INSERT); no se borra antes del plazo |
| Log de pagos Redsys | Conciliación y prueba de pago | 6 años | Art. 30 CCom | Tabla `payments_log` inmutable |
| Historial de estado de pedido | Audit trail (art. 5.1.f) | Vinculado al pedido | RGPD art. 5.1.f | Tabla `order_status_history` inmutable |
| Solicitudes de presupuesto (`quote_requests`) | Atención comercial | 12 meses sin actividad | Interés legítimo + minimización | Anonimización vía `anonymize_old_quote_messages()` |
| Sesiones de cliente (`customer_sessions`) | Autenticación magic-link | Purga periódica (`purged_at`) | Minimización art. 5.1.c | `data-retention-cron` |
| Eventos de analítica | Métricas agregadas | 13 meses máximo | Minimización | `purge_analytics_older_than_13_months()` |
| Registro de consentimientos (`consent_audit`) | Prueba del consentimiento (art. 7.1) | Mientras dure el tratamiento + plazo de prescripción | RGPD art. 7.1 | Inmutable |
| Registro de brechas (`data_breaches`) | Obligación art. 33.5 | Permanente | RGPD art. 33.5 | No se suprime |

## 3. Procedimiento automatizado de supresión

La supresión y anonimización se ejecutan mediante tareas programadas (`pg_cron` + edge function `data-retention-cron`), protegidas por un lock de advisory (`try_data_retention_lock()`) para evitar ejecuciones concurrentes. Ver `Docs/runbooks/cron-vault-setup.md`.

## 4. Anonimización vs. supresión

- **Supresión:** eliminación física del registro cuando no existe obligación legal de conservación.
- **Anonimización:** cuando el dato debe conservarse a efectos estadísticos o por integridad referencial (p. ej. pedidos para histórico contable), los identificadores personales se sustituyen de forma irreversible, dejando el registro no atribuible a una persona física.

## 5. Revisión

Esta política se revisa trimestralmente junto con el resto de documentación legal (ver `Docs/runbooks/legal-quarterly-review.md`).
