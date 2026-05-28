---
title: Análisis de riesgos del tratamiento
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Análisis de riesgos del tratamiento — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículos 24 y 32 RGPD (enfoque basado en el riesgo).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].
**Activos evaluados:** ver `Docs/legal/inventario-activos.md`.

---

## 1. Metodología

Evaluación cualitativa: cada riesgo se valora por **probabilidad** (baja/media/alta) e **impacto** (bajo/medio/alto) sobre los derechos y libertades de los interesados. El **riesgo residual** es el resultante tras aplicar las medidas existentes.

## 2. Matriz de riesgos

| # | Riesgo | Activo afectado | Prob. | Impacto | Medidas mitigadoras | Riesgo residual |
|---|---|---|---|---|---|---|
| R-1 | Acceso no autorizado al panel admin | BD / `admin_users` | Baja | Alto | Allowlist `is_admin()`, OTP en pago, RLS estricto | Bajo |
| R-2 | Fuga de datos por RLS mal configurado | Tablas con PII | Baja | Alto | Endurecimiento RLS (0029/0030), grants mínimos (0045) | Bajo |
| R-3 | Manipulación de logs fiscales | `invoices`, `payments_log` | Muy baja | Alto | Inmutabilidad por RLS (0029) | Muy bajo |
| R-4 | Race condition en contadores de factura | `invoice_counter_*` | Media | Medio | Advisory locks (0034) | Bajo |
| R-5 | Conservación excesiva de datos | `orders`, `quote_requests`, analytics | Media | Medio | Política de conservación + cron de retención | Bajo |
| R-6 | Transferencia internacional sin garantía | Resend / Vercel | Media | Medio | SCC + cifrado + minimización (TIA) | Bajo-medio |
| R-7 | Compromiso de secretos | Credenciales | Baja | Alto | Vault + rotación (`secret-rotation.md`) | Bajo |
| R-8 | Inyección por search_path en funciones | Funciones SECURITY DEFINER | Baja | Medio | `search_path` fijo (0031, 0049) | Bajo |
| R-9 | Datos inexactos (email mal formado) | `orders`, `quote_requests` | Media | Bajo | CHECK constraints (0043, 0048) | Muy bajo |
| R-10 | Pérdida de disponibilidad | BD / hosting | Baja | Medio | Backups del proveedor + plan de continuidad | Bajo |

## 3. Riesgos con acción pendiente

- **R-6 (transferencias):** confirmar región UE de Supabase y certificación DPF de Resend/Vercel para reducir a **bajo** (ver `Docs/legal/tias-transferencias.md`).

## 4. Conclusión

No se identifican riesgos residuales **altos**. El nivel de riesgo global del tratamiento es **bajo**, coherente con el resumen de DPIA (`Docs/legal/dpia-resumen.md`). No procede consulta previa a la AEPD (art. 36).

## 5. Revisión

Revisión trimestral y ante cambios sustanciales del tratamiento o incidentes (ver `Docs/runbooks/legal-quarterly-review.md`).
