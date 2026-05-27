# Protocolo — Requerimientos de autoridades

**Objeto**: definir cómo responder a una solicitud de cesión de datos personales formulada por una autoridad pública (judicial, policial, administrativa) sobre clientes, pedidos o tratamientos de DC Bikes Cantabria.

**Normas de referencia**:

- Reglamento (UE) 2016/679 (RGPD), arts. 6.1.c, 6.1.e y 23.
- Ley Orgánica 3/2018 de Protección de Datos Personales y Garantía de los Derechos Digitales (LOPDGDD), arts. 11, 19, 23.
- Ley de Enjuiciamiento Criminal (LECrim), arts. 588 bis y ss. (medidas tecnológicas de investigación).
- Ley 25/2007 sobre conservación de datos relativos a comunicaciones electrónicas (sólo operadores; no afecta a DC Bikes directamente, pero sí marca el marco de referencia).

---

## 1. Quién está autorizado a solicitar datos

Solo las siguientes autoridades pueden requerir cesión de datos personales sin consentimiento del interesado:

| Autoridad | Tipo de orden requerido |
|-----------|--------------------------|
| Juzgados (Instrucción, Penal, Civil, Mercantil) | Auto judicial motivado |
| Tribunales (TS, TSJ, AP) | Auto / sentencia |
| Fiscalía | Decreto motivado (algunos supuestos) |
| Policía Judicial (Policía Nacional, Guardia Civil, Mossos, Ertzaintza, Policía Foral) | Diligencia policial **autorizada por instrucción judicial previa** o, en supuestos urgentes, comunicación posterior al juez |
| AEPD (Agencia Española de Protección de Datos) | Requerimiento formal en procedimiento sancionador o investigador |
| Inspección de Trabajo, Hacienda, Servicio de Vigilancia Aduanera | Requerimiento dentro del ámbito de sus competencias |

### Lo que NO debe atenderse

- Llamadas o emails sin documento oficial adjunto.
- Solicitudes de terceros (abogados, particulares, prensa) que no aporten orden judicial.
- Peticiones de fuerzas y cuerpos de seguridad que no concreten la base legal habilitante.
- Solicitudes anónimas o desde direcciones no institucionales.

> **Una solicitud verbal nunca es suficiente.** Siempre debe exigirse por escrito con cabecera oficial y referencia del procedimiento.

---

## 2. Procedimiento ante un requerimiento

### Paso 1 — Recepción

1. Anotar fecha, hora y canal de recepción (email, registro presencial, burofax, comparecencia presencial).
2. Identificar al funcionario o autoridad firmante (nombre, cargo, número de carné si comparece en persona).
3. Pedir copia íntegra del documento, incluido sello de salida del organismo emisor.

### Paso 2 — Verificación de autenticidad

- Comprobar que el documento tiene **CSV (Código Seguro de Verificación)** y/o sello electrónico verificable en la sede electrónica del organismo emisor.
- Si hay dudas, llamar a la centralita oficial del juzgado/comisaría — **no al número que aparezca en el requerimiento** (evitar ingeniería social).
- Verificar que el procedimiento existe y la persona firmante tiene atribuida competencia.

### Paso 3 — Análisis de proporcionalidad y alcance

Antes de ceder, valorar:

- ¿La solicitud especifica claramente qué datos se piden y de qué persona?
- ¿La base legal habilitante está identificada (art. 6 RGPD)?
- ¿Es proporcional al fin? (No procede entregar bases de datos completas si se pide un único cliente).

Si la petición es desproporcionada o ambigua, **se contesta solicitando concreción**, no se rechaza.

### Paso 4 — Plazo de respuesta

- **Urgencia 24 h** (riesgo grave para la vida o investigación criminal en curso): contactar inmediatamente al abogado de confianza. Si no es viable, ceder los datos estrictamente requeridos y documentar la urgencia.
- **No urgente**: dispone el titular de un plazo razonable (10 días naturales suelen ser aceptables; el propio requerimiento suele indicarlo).
- En requerimientos AEPD: el plazo viene fijado, normalmente 10 días hábiles.

### Paso 5 — Ejecución de la cesión

- Extraer solo los datos solicitados, no la base de datos completa.
- Si la cesión incluye datos de varios clientes, anonimizar a los no relevantes.
- Enviar por canal seguro:
  - Email cifrado a la dirección oficial del organismo.
  - Comparecencia presencial con copia en pendrive entregada al funcionario (con acuse de recibo firmado).
  - Lexnet (si se está habilitado como representante).
- **Nunca** enviar por canal no oficial (WhatsApp, etc.).

### Paso 6 — Documentación interna

Registrar en hoja interna (futura tabla `authority_requests`):

- Fecha de recepción.
- Autoridad y procedimiento de referencia.
- Datos solicitados (descripción).
- Datos efectivamente cedidos.
- Fecha y canal de respuesta.
- Notas sobre la cláusula gag (si la hubiera).

Conservar 5 años (plazo análogo a procedimientos AEPD).

---

## 3. Comunicación con el interesado

### Regla general

El RGPD (arts. 13 y 14) exige informar al interesado sobre los destinatarios de sus datos personales. Por defecto, **sí procede notificar** al cliente que su información ha sido cedida.

### Excepciones (cláusula gag o reserva)

No se informa cuando:

- La orden lo prohíbe expresamente (cláusula de reserva o "gag").
- La comunicación pondría en riesgo la investigación.
- La AEPD lo solicita en investigación interna.
- La ley aplicable establece reserva (p.ej. art. 588 ter d LECrim para medidas de investigación tecnológica).

En estos casos:

- Documentar la base de la reserva en el registro.
- Mantener la confidencialidad hasta que cese la obligación de reserva.
- Cuando cese, informar al interesado con carácter retroactivo.

---

## 4. Datos que pueden requerirse y dónde están

| Categoría | Tablas / sistemas |
|-----------|-------------------|
| Identidad y contacto de cliente | `orders` (cliente_*), `quote_requests` (nombre, email, teléfono) |
| Histórico de compras | `orders`, `order_items` |
| Conexiones e IPs | `customer_sessions` (sujetas a retención corta — 30 días) |
| Consentimientos | `consent_audit` |
| Solicitudes de derechos | `data_subject_requests` |
| Comunicaciones (formularios) | `quote_requests.message` (anonimizado tras 1 año por X-12) |
| Facturas y datos fiscales | `invoices`, `invoice_items` |
| Logs administrativos | `audit_log` |

> Si los datos solicitados han sido **anonimizados o purgados** por aplicación de retención RGPD (art. 5.1.e), se responde formalmente al organismo que la información no está disponible y se indica la base normativa que motivó la eliminación.

---

## 5. Plantilla de respuesta a la autoridad

```
[Datos titular emisor]
[Fecha]

Al [Juzgado / Comisaría / AEPD]
Asunto: Respuesta a [referencia del requerimiento]

En atención al requerimiento de fecha [fecha], registro [número], relativo al
procedimiento [referencia], remito la siguiente información:

  Cliente:           [Nombre y NIF]
  Período solicitado: [fechas]
  Datos cedidos:
    1. [Listado concreto]
    2. ...
    3. ...

Los datos se ceden conforme al art. 6.1.c RGPD (cumplimiento de obligación legal)
y/o art. 6.1.e RGPD (interés público), en relación con [norma habilitante concreta].

Se hace constar que [datos x] no figuran en nuestros sistemas por haber sido
suprimidos en aplicación del principio de limitación de la conservación
(art. 5.1.e RGPD), procedimiento documentado en nuestra política de retención.

Quedo a disposición para cualquier aclaración adicional.

Atentamente,

[Firma del titular]
[NIF]
[Nombre comercial: DC Bikes Cantabria]
```

---

## 6. Coordinación con asesoramiento jurídico

- **Contacto de abogado de confianza**: [Pendiente designar bufete colaborador]
- Cuando consultar al abogado (incluso fuera de la urgencia):
  - Primera vez que se recibe un requerimiento.
  - Cláusula gag presente.
  - Petición desproporcionada o ambigua.
  - Datos solicitados afectan a categorías especiales (art. 9 RGPD) — no es habitual en DC Bikes pero podría darse en consultas de salud, etc.

---

## 7. Capacitación

- El titular debe leer este protocolo al inicio de su designación.
- Si se delega gestión administrativa en personal externo (gestor fiscal, etc.), entregar copia explicativa.
- Revisión anual del protocolo dentro de la auditoría legal.

---

## 8. Coordinación con otros procedimientos

- Si el requerimiento revela una **brecha previa no detectada**, activar `procedimiento-brechas.md`.
- Si genera la necesidad de **suspender una supresión en curso**, coordinarlo con `procedimiento-supresion.md` (gestionado por S2-Q2).
- Si la autoridad requiere informe DPIA, mostrar `analisis-dpia.md`.

---

**Versión**: 1.0
**Fecha de creación**: 2026-05-27
**Próxima revisión**: 2027-01-01 o ante recepción del primer requerimiento real
**Responsable**: titular DC Bikes Cantabria
