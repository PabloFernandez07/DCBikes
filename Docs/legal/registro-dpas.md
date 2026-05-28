---
title: Registro de acuerdos de encargo de tratamiento (DPA)
version: 2026-05-27-v5
audit: V5
last_updated: 2026-05-27
---

# Registro de acuerdos de encargo de tratamiento (DPA) — DC Bikes Cantabria

**Última actualización:** 2026-05-27 (auditoría V5)
**Base legal:** Artículo 28.3 RGPD (contrato de encargo de tratamiento).
**Responsable del tratamiento:** [Pendiente confirmación titular — `settings.legal_company_name` vacío].

---

## 1. Objeto

Este registro documenta los **Data Processing Agreements (DPA)** suscritos (o aceptados vía términos del proveedor) con cada encargado del tratamiento, conforme al art. 28.3 RGPD.

## 2. Inventario de DPA

| Encargado | Servicio | Instrumento de DPA | Versión / referencia | Estado | Categorías de datos | Pendiente |
|---|---|---|---|---|---|---|
| Supabase | BD + backend | DPA del proveedor (incorporado en ToS) | [Pendiente verificar versión vigente] | Aceptado vía ToS | Pedidos, clientes, sesiones | Confirmar fecha de aceptación |
| Vercel | Hosting / edge | DPA del proveedor | [Pendiente verificar versión vigente] | Aceptado vía ToS | Logs de petición, datos en tránsito | Confirmar fecha |
| Resend | Email transaccional | DPA del proveedor | [Pendiente verificar versión vigente] | Aceptado vía ToS | Email, contenido del mensaje | Confirmar fecha + región |
| Redsys | Pasarela de pago | Contrato de adhesión TPV + condiciones de servicio | [Pendiente referencia contrato banco adquirente] | Pendiente confirmación | Datos de pago tokenizados | Adjuntar contrato firmado |

## 3. Contenido mínimo exigido a cada DPA (art. 28.3)

Cada DPA debe recoger:

- a) Objeto, duración, naturaleza y finalidad del tratamiento.
- b) Tipo de datos personales y categorías de interesados.
- c) Obligación de tratar solo según instrucciones documentadas.
- d) Confidencialidad del personal autorizado.
- e) Medidas de seguridad (art. 32).
- f) Condiciones para recurrir a subencargados (ver `Docs/legal/politica-subencargados.md`).
- g) Asistencia al responsable en derechos de los interesados.
- h) Asistencia en seguridad, brechas y DPIA.
- i) Supresión o devolución de datos al finalizar.
- j) Puesta a disposición de información para auditorías.

## 4. Acciones pendientes

- [ ] Verificar y registrar la versión y fecha de aceptación de cada DPA de proveedor.
- [ ] Adjuntar/archivar el contrato TPV de Redsys con el banco adquirente.
- [ ] Reconciliar este registro con `Docs/legal/tias-transferencias.md` para los encargados con tratamiento fuera del EEE.

## 5. Revisión

Revisión trimestral (ver `Docs/runbooks/legal-quarterly-review.md`).
