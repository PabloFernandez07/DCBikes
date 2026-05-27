# Plan de continuidad — Sucesión, cesión de actividad o cierre

**Objeto**: definir cómo proceder ante un cese de actividad, transmisión del negocio o sucesión del titular de DC Bikes Cantabria, garantizando los derechos de los interesados (RGPD) y el cumplimiento de las obligaciones fiscales y comerciales.

**Normas de referencia**:

- Reglamento (UE) 2016/679 (RGPD), arts. 5.1.e, 13, 14, 17, 20, 21.
- Ley General Tributaria 58/2003 (LGT), art. 70 (plazo de conservación 4 años).
- Real Decreto Legislativo 1/2010 Ley de Sociedades de Capital (LSC) — disolución y liquidación.
- Real Decreto Legislativo 5/2000 (LISOS), retención laboral si hubiera personal contratado.
- Ley 7/2012 de medidas para la prevención y lucha contra el fraude fiscal, art. 7 (retención 10 años en facturas).

---

## 1. Supuestos contemplados

| Supuesto | Características | Acción dominante |
|----------|------------------|-------------------|
| **Cese total de actividad** | El titular deja de operar y no transmite el negocio | Anonimización / supresión + retención obligatoria |
| **Transmisión del negocio (in vivo)** | Cambio de titular, mantenimiento de marca y clientela | Cesión a sucesor con CCT + información a interesados |
| **Sucesión mortis causa** | Fallecimiento del titular; herederos asumen actividad | Continuidad de tratamientos con notificación a interesados |
| **Fusión por cambio de forma jurídica** | Autónomo → SL u otra | CCT entre antigua y nueva entidad + notificación |

---

## 2. Cese total de actividad

### 2.1. Plazo de aviso a clientes

- Comunicación **con al menos 1 mes de antelación** al cese efectivo.
- Canales: email a clientes registrados, banner en la web, comunicación en tienda física, redes sociales oficiales.
- Contenido del aviso:
  - Fecha exacta de cese.
  - Instrucciones para descargar datos personales (RGPD art. 20, portabilidad).
  - Política de retención que se aplicará sobre los datos no descargados.
  - Plazo y forma para ejercitar derechos pendientes (acceso, supresión).
  - Información sobre obligaciones fiscales pendientes (entrega de factura final, devoluciones, garantías).

### 2.2. Portabilidad activa

Habilitar (si no existe ya) descarga vía `/mis-pedidos → Descargar mis datos` (RGPD art. 20). El interesado recibe un JSON/PDF con:

- Datos personales del cliente.
- Histórico de pedidos.
- Facturas en PDF.
- Solicitudes de presupuesto.
- Consentimientos.

Esta funcionalidad debe estar operativa **antes** del cese efectivo y mantenerse al menos durante el período de aviso de 1 mes.

### 2.3. Supresión / anonimización tras el cese

Una vez transcurrido el plazo de portabilidad:

1. Ejecutar `data-retention-cron` con purga manual o anonimización selectiva.
2. Datos **anonimizables** (mantenibles para estadística): pedidos > 4 años (LGT cumplida), quote_requests anonimizadas.
3. Datos **suprimibles inmediatamente**: customer_sessions, marketing consents revocados, datos analíticos.
4. Datos **bajo retención obligatoria** (no se pueden borrar todavía):

| Categoría | Plazo de retención | Norma |
|-----------|---------------------|-------|
| Facturas y libros contables | 4 años | LGT art. 70 |
| Facturas (recibos / pagos B2B) | 6 años | Código de Comercio art. 30 |
| Justificantes documentales prevención blanqueo | 10 años | Ley 7/2012 art. 7 |
| Logs Verifactu | mínimo 4 años | RD 1007/2023 |

### 2.4. Custodia post-cese de datos retenidos

Designar un **responsable de custodia** durante el plazo de retención obligatoria. Opciones:

- El propio ex-titular (lo más común para autónomos).
- Un gestor fiscal contratado al efecto (con DPA — encargo del tratamiento).
- Un sucesor o albacea (si hay sucesión).

Documentar la designación en un acta firmada y comunicarla a la AEPD si concurren circunstancias relevantes (no es obligatorio en todo caso).

### 2.5. Cierre técnico de infraestructuras

| Sistema | Acción al cese |
|---------|----------------|
| Supabase | Exportar dump completo cifrado → eliminar proyecto cuando expire la retención obligatoria |
| Resend | Cancelar API key, exportar logs de envío si procede |
| Vercel | Despublicar dominio, mantener una página estática informativa durante 6 meses, después dar de baja proyecto |
| Cloudflare | Mantener DNS durante 6 meses tras el cese, después transferir o liberar dominio |
| Google Business Profile | Marcar como "permanentemente cerrado" (no eliminar — preserva reseñas históricas) |
| Cuentas bancarias y Redsys | Cancelar TPV; cuenta bancaria asociada solo tras cierre fiscal completo |

### 2.6. Revocación de DPAs

Notificar formalmente a cada encargado del tratamiento la finalización del contrato y solicitar:

- Confirmación de eliminación de los datos.
- Plazo concreto de eliminación (suele ser 30 – 90 días).
- Certificado de destrucción si lo proporciona el encargado.

DPAs en vigor a fecha actual:

- Supabase Inc. (BD + auth + storage + functions)
- Resend (email transaccional)
- Vercel (hosting y edge)
- Cloudflare (DNS, WAF)
- Google (Business Profile API)

---

## 3. Transmisión del negocio (cesión a sucesor)

### 3.1. Requisitos previos

- **Contrato de cesión empresarial** entre titular cedente y sucesor adquirente, donde se especifique:
  - Inventario de activos transmitidos.
  - Activos intangibles: dominio web, marca, fondo de comercio.
  - Tratamiento de la base de datos de clientes.
  - Asunción del rol de responsable del tratamiento por parte del sucesor.

### 3.2. Cesión de la base de datos de clientes

Es la fase más sensible desde el punto de vista RGPD. Procede:

1. **Análisis de base legal**: el RGPD no contempla expresamente la cesión por sucesión, pero la AEPD admite que el sucesor asuma la posición del cedente cuando hay continuidad sustancial del negocio (mismo objeto, misma actividad, mismo tipo de clientes).
2. **Información previa al interesado** (art. 13 RGPD):
   - Identidad del nuevo responsable.
   - Datos de contacto del nuevo DPD (si lo hubiera).
   - Período transitorio (típicamente 30 días).
3. **Plazo de oposición**: ofrecer al interesado un mínimo de **30 días naturales** para oponerse a la cesión. Si se opone, sus datos se suprimen del sucesor antes de la entrega.
4. **Forma de comunicación**: email a la dirección registrada + banner en web durante el período transitorio.

### 3.3. Plantilla de aviso al cliente

```
Asunto: Cambio de titular en DC Bikes Cantabria

Hola [Nombre],

Te informamos de que a partir del [fecha] DC Bikes Cantabria pasará a ser
gestionada por [nuevo titular / nueva entidad], que asume todas las
obligaciones comerciales y de protección de datos de la entidad anterior.

Qué cambia:
- Razón social y NIF del responsable del tratamiento.
- Datos de contacto:
  · Email general: [nuevo email]
  · Email para protección de datos: [nuevo email DPD]

Qué no cambia:
- El servicio, marca, equipo de tienda y atención.
- Tus pedidos, facturas y garantías en curso.
- La finalidad para la que recogimos tus datos.

Si no deseas que tus datos pasen al nuevo titular, puedes oponerte
respondiendo a este email antes del [fecha + 30 días]. En ese caso, tus
datos serán suprimidos antes de la transferencia (salvo las facturas, que
deben conservarse por obligación fiscal según LGT art. 70).

Para más información:
[enlace a política de privacidad actualizada]

Atentamente,
DC Bikes Cantabria
[Titular saliente] · [Titular entrante]
```

### 3.4. Acta de entrega de la base de datos

Documentar internamente, firmada por cedente y adquirente, conteniendo:

- Fecha y hora de la entrega.
- Volumen entregado (n.º de filas por tabla).
- Hash SHA-256 del dump entregado.
- Garantías técnicas (cifrado, canal de transmisión).
- Compromiso del adquirente de mantener la base legal y los derechos del interesado.

---

## 4. Sucesión mortis causa

### 4.1. Hechos relevantes

- El fallecimiento del titular implica extinción de la personalidad jurídica del autónomo.
- El RGPD (art. 2.2) no protege datos de fallecidos, pero la LOPDGDD (art. 3) permite a herederos ejercer derechos respecto a los datos del causante cuando lo soliciten.
- Los datos de los **clientes** siguen plenamente protegidos.

### 4.2. Continuidad provisional

Hasta la aceptación formal de la herencia o la decisión de cese, debe nombrarse un **albacea o gestor provisional** que:

- Mantenga la actividad mínima imprescindible (atención a clientes activos, garantías).
- No realice nuevas captaciones de datos.
- Coordine con asesoría fiscal el cierre o continuidad.

### 4.3. Decisión de los herederos

| Decisión | Procedimiento |
|----------|----------------|
| Continuidad | Aplicar procedimiento de transmisión (sección 3) |
| Cese | Aplicar procedimiento de cese (sección 2) con plazo flexible (la AEPD acepta dilatación si está justificada por trámite hereditario) |

---

## 5. Cambio de forma jurídica (autónomo → sociedad)

- Comunicación a clientes en plazo razonable (1 mes).
- Cesión a la nueva entidad mediante acta interna.
- El RGPD ve a la sociedad nueva como un nuevo responsable distinto, aunque haya continuidad sustancial.
- Actualizar todas las cláusulas legales, políticas y avisos legales con los nuevos datos identificativos.

---

## 6. Coordinación con otros documentos

- `procedimiento-supresion.md` — para ejecución técnica de borrados (S2-Q2).
- `procedimiento-brechas.md` — si la transmisión genera incidente (acceso indebido durante traspaso).
- `protocolo-requerimientos-autoridades.md` — si un requerimiento llega durante el período transitorio.
- `rat-2026.md` — debe actualizarse con el nuevo responsable tras la cesión (S2-Q2).
- `handover-admin.md` — instrucciones técnicas de traspaso de credenciales.

---

## 7. Lista de verificación rápida

### Cese
- [ ] Notificación a clientes (>30 días antes).
- [ ] Portabilidad activa en web.
- [ ] Backup cifrado de datos a retener.
- [ ] Designación de custodio post-cese.
- [ ] Revocación formal de DPAs.
- [ ] Cierre de infraestructuras técnicas.
- [ ] Cierre fiscal con asesor.
- [ ] Comunicación AEPD si aplica (registro RAT marcado como inactivo).

### Cesión
- [ ] Contrato de cesión firmado entre cedente y adquirente.
- [ ] Aviso a clientes con plazo de oposición.
- [ ] Acta de entrega de base de datos con hash.
- [ ] Actualización de política de privacidad y aviso legal con nuevo responsable.
- [ ] Notificación a encargados de tratamiento del cambio de responsable.
- [ ] Actualización de RAT y registro de consentimientos.

---

**Versión**: 1.0
**Fecha de creación**: 2026-05-27
**Próxima revisión**: 2027-01-01 o ante cualquier circunstancia que active el plan
**Responsable**: titular DC Bikes Cantabria
