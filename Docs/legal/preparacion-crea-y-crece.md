# Preparación — Facturación electrónica B2B (Ley 18/2022 Crea y Crece)

**Norma de referencia**: Ley 18/2022, de 28 de septiembre, de creación y crecimiento de empresas ("Crea y Crece"), art. 12, que modifica el art. 2bis de la Ley 56/2007 de Medidas de Impulso de la Sociedad de la Información para extender la obligación de factura electrónica a todas las relaciones B2B.

**Estado del proyecto**: pendiente de implementación. Las facturas actuales se generan en PDF + entrada Verifactu (AEAT), pero no en formato estructurado Facturae con firma XAdES.

---

## 1. Obligación y calendario

La obligación de emitir y recibir facturas electrónicas en operaciones entre empresarios y profesionales (B2B) en territorio español entra en vigor de forma escalonada, **a contar desde la publicación del Reglamento de desarrollo** (todavía no publicado en BOE a fecha del presente documento — 2026-05-27):

| Tramo | Facturación anual del emisor | Plazo desde Reglamento |
|-------|------------------------------|-------------------------|
| 1 | > 8.000.000 € | 1 año |
| 2 | ≤ 8.000.000 € (resto, incluye autónomos) | 2 años |

**DC Bikes Cantabria** opera como autónomo de baja escala, por lo que se encuadra en el Tramo 2. Plazo estimado de entrada en vigor: **finales de 2026 o primer semestre de 2027**, sujeto a la publicación efectiva del Reglamento y posibles prórrogas.

> **Acción pendiente**: validar fechas exactas tras publicación del Reglamento en BOE. Subscribirse al canal de la AEAT y de la Agencia Estatal del BOE para alertas.

---

## 2. Requisitos técnicos

### 2.1. Formato

- **Estándar oficial**: Facturae 3.2.x (XML estructurado según especificación del Ministerio de Asuntos Económicos y Transformación Digital).
- **Firma electrónica**: XAdES (XML Advanced Electronic Signatures) — perfil mínimo XAdES-BES; recomendable XAdES-T para sellado de tiempo.
- **Certificado**: del titular o representante legal de la entidad emisora, emitido por prestador cualificado (FNMT, Camerfirma, ACA, etc.).

### 2.2. Plataformas de intercambio

El emisor debe enviar la factura por una de estas vías:

1. **FACeB2B** — plataforma pública gestionada por la Secretaría General de Administración Digital. Gratuita. Limitaciones de volumen y de comodidad de uso.
2. **Plataformas privadas** acreditadas. Ejemplos:
   - B2BRouter — interconexión universal, ~10-20 €/mes para volumen bajo.
   - EDICOM, SERES, Pimero u otros proveedores EDI.
3. **Plataforma propia** que cumpla los requisitos de interoperabilidad establecidos por el Reglamento.

Para DC Bikes (volumen bajo), las opciones razonables son **FACeB2B** (coste cero) o **B2BRouter** (mejor UX por cuota mensual reducida).

### 2.3. Sistema de información del estado de la factura

La normativa exige reportar al receptor el estado de la factura (aceptada, rechazada, pagada, impagada). Esto puede hacerse:

- Manualmente desde la propia plataforma elegida.
- Automatizado mediante API si la plataforma lo permite.

---

## 3. Estado actual del proyecto DC Bikes

| Componente | Estado actual | Requerido por Crea y Crece |
|------------|---------------|----------------------------|
| Generación factura PDF | Implementado (jsPDF + Verifactu) | Insuficiente: hace falta XML estructurado |
| Numeración correlativa | Implementado (serie partida `0011`) | OK — reutilizable |
| Cálculo IVA | Implementado | OK |
| Datos fiscales del emisor | Pendiente cumplimentación admin | Crítico — sin esto no hay factura válida |
| Datos fiscales del receptor B2B | Capturado en `quote_requests`/`orders` | OK |
| Firma XAdES | **No implementado** | Crítico |
| Envío FACeB2B / B2BRouter | **No implementado** | Crítico |
| Registro de estados | **No implementado** | Crítico |

---

## 4. Tareas pendientes (roadmap)

### Fase 1 — Investigación (Q3 2026, antes de la publicación del Reglamento)

- [ ] Confirmar fechas definitivas del Reglamento de desarrollo (BOE).
- [ ] Decidir plataforma: FACeB2B vs. B2BRouter (análisis coste/UX).
- [ ] Solicitar al titular el certificado digital cualificado de persona física actualizado.

### Fase 2 — Implementación (6 meses antes de la fecha límite)

- [ ] Añadir biblioteca de generación Facturae XML al backend (p.ej. `node-facturae` o cliente externo del proveedor).
- [ ] Añadir firma XAdES vía servicio externo o local (`xadesjs`, `node-xades`).
- [ ] Integrar API de FACeB2B o B2BRouter para envío.
- [ ] Crear panel en `/admin` para consultar estados (enviada, aceptada, pagada).
- [ ] Añadir campo `facturae_xml_url` en `invoices` para guardar copia del XML firmado.
- [ ] Crear migración SQL para tabla `invoice_b2b_events` (envío, ACK, rechazo, pago).

### Fase 3 — Validación (1 mes antes)

- [ ] Pruebas con receptor real (cliente B2B beta).
- [ ] Verificación de la firma XAdES por validador externo.
- [ ] Documentación del flujo en `Docs/legal/factura-electronica-flujo.md`.
- [ ] Formación al titular sobre uso del panel.

### Fase 4 — Vigilancia continua

- [ ] Suscripción a actualizaciones de la AEAT y de la plataforma elegida.
- [ ] Revisión anual de cumplimiento dentro de la auditoría legal.

---

## 5. Coste estimado

| Concepto | Coste anual estimado |
|----------|----------------------|
| Certificado digital cualificado | 14 – 35 € |
| Plataforma B2BRouter (volumen bajo) | 120 – 240 € |
| FACeB2B (alternativa) | 0 € |
| Desarrollo integración (one-shot) | 8 – 16 h de trabajo interno |
| Mantenimiento | despreciable |

---

## 6. Excepciones y casos límite

- **Facturas B2C** (consumidores finales): no afectadas por Crea y Crece. Siguen siendo facturas ordinarias en PDF o ticket.
- **Operaciones intracomunitarias B2B**: aplica obligación interna española + reglas IVA UE; en el medio plazo VIDA (VAT in the Digital Age, paquete UE) impondrá factura electrónica también a nivel comunitario en 2030.
- **Microoperaciones** (importe < umbral): la Ley 18/2022 no establece umbral de exención; toda factura B2B queda incluida.

---

**Versión**: 1.0
**Fecha de creación**: 2026-05-27
**Próxima revisión**: tras publicación del Reglamento de desarrollo o, en su defecto, 2027-01-01
**Responsable**: titular DC Bikes Cantabria
