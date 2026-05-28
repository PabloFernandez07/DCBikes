---
title: Transferencias internacionales y análisis de impacto (TIA)
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Transferencias internacionales de datos y Transfer Impact Assessment (TIA) — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Capítulo V RGPD (arts. 44-49); sentencia C-311/18 (Schrems II); recomendaciones EDPB 01/2020.
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].

---

## 1. Objeto

Documenta las **transferencias internacionales de datos personales** a terceros países (fuera del EEE) y el análisis del impacto de dichas transferencias (TIA), exigido tras Schrems II cuando la garantía utilizada son las Cláusulas Contractuales Tipo (CCT/SCC).

## 2. Mapa de transferencias

| Encargado | ¿Transfiere fuera del EEE? | País destino | Garantía aplicada | Evaluación |
|---|---|---|---|---|
| Supabase | Según región del proyecto | UE (si región UE) | N/A si la región es UE | Verificar región configurada |
| Vercel | Posible (red edge global) | Global | CCT (SCC 2021) + medidas | TIA requerido — ver §4 |
| Resend | Sí (infra en EE. UU.) | EE. UU. | CCT (SCC 2021) + DPF si aplica | TIA requerido — ver §4 |
| Redsys | No (España) | España (UE) | N/A | No procede |

> Confirmar con el inventario de DPA (`Docs/legal/registro-dpas.md`) la versión exacta de las garantías de cada proveedor.

## 3. Garantías admisibles (orden de preferencia)

1. **Decisión de adecuación** (art. 45) — p. ej. EU-US Data Privacy Framework para entidades certificadas en EE. UU.
2. **Cláusulas Contractuales Tipo** (art. 46.2.c) — módulos SCC 2021.
3. **Excepciones del art. 49** — solo para casos puntuales y no sistemáticos.

## 4. Estructura del Transfer Impact Assessment (TIA)

Para cada transferencia basada en CCT:

1. **Cartografía de la transferencia:** datos, finalidad, encargado, subencargados, destino.
2. **Garantía empleada:** SCC + módulo aplicable.
3. **Evaluación de la legislación del país destino:** posibilidad de acceso gubernamental desproporcionado.
4. **Medidas suplementarias:** cifrado en tránsito y en reposo, seudonimización, minimización (solo se transfiere el dato imprescindible).
5. **Conclusión:** nivel de riesgo residual y decisión (mantener, reforzar medidas o suspender).

## 5. Conclusiones por proveedor

- **Resend / Vercel (EE. UU. / global):** transferencia sustentada en SCC 2021 + cifrado TLS en tránsito y minimización (solo email y contenido del mensaje transaccional). Riesgo residual: **bajo-medio**. Acción: confirmar adhesión al EU-US DPF para reducir a bajo.
- **Supabase:** si la región es UE, **no hay transferencia internacional**. Acción prioritaria: verificar y fijar región UE.

## 6. Acciones pendientes

- [ ] Confirmar región del proyecto Supabase (objetivo: UE).
- [ ] Verificar certificación DPF de Resend y Vercel.
- [ ] Formalizar y archivar el TIA completo por cada proveedor con transferencia.

## 7. Revisión

Revisión trimestral o ante cambios regulatorios (ver `Docs/runbooks/legal-quarterly-review.md`).
