# Designación interna del responsable de privacidad — DC Bikes Cantabria

**Fecha de designación:** 2026-05-27
**Vigencia:** indefinida hasta nueva designación expresa.
**Base legal:** designación voluntaria interna, sin obligación de DPO formal del art. 37 RGPD ni del art. 34 LOPDGDD.

---

## 1. Justificación legal

El **artículo 37.1 RGPD** y el **artículo 34 LOPDGDD** no obligan a DC Bikes Cantabria a designar un Delegado de Protección de Datos (DPD/DPO) porque concurren las siguientes circunstancias:

- No se trata de una autoridad u organismo público.
- La actividad principal **no consiste en operaciones de tratamiento que requieran observación habitual y sistemática a gran escala** de los interesados (art. 37.1.b RGPD). Las ventas online de bicicletas a clientes minoristas en Cantabria suponen un volumen acotado, sin perfilado ni rastreo cross-site.
- La actividad principal **no consiste en el tratamiento a gran escala de categorías especiales de datos** (art. 9 RGPD) ni de datos relativos a condenas e infracciones (art. 10 RGPD).
- DC Bikes Cantabria no está incluida en ninguno de los supuestos adicionales del **art. 34 LOPDGDD** (colegios profesionales, centros educativos, entidades aseguradoras, financieras, etc.).

**No obstante**, conforme al **art. 37.4 RGPD** y a las buenas prácticas recomendadas por la AEPD, el responsable del tratamiento designa **voluntariamente** una persona de contacto interno (responsable de privacidad) con las funciones descritas más abajo, con el fin de canalizar el ejercicio de derechos de los interesados y mantener la organización en cumplimiento del RGPD.

Esta figura **no tiene la consideración legal de DPD/DPO**: no se comunica a la AEPD, no es nombre y apellidos en el registro público de DPDs, ni se beneficia de las garantías de independencia del art. 38 RGPD. Es una **figura interna operativa**, sin perjuicio de que pueda formalizarse como DPO en el futuro si el negocio crece y se activan los supuestos del art. 37.1 RGPD.

---

## 2. Datos del responsable de privacidad designado

| Campo | Valor |
|---|---|
| Nombre y apellidos | [Pendiente confirmación titular — `settings.legal_company_name` vacío en el momento de la auditoría V5; rellenar con el nombre del titular persona física] |
| Cargo / relación con la organización | Titular del negocio (persona física empresaria individual) |
| Email de contacto público | info@dcbikescantabria.es |
| Teléfono de contacto | [Pendiente confirmación titular — `settings.store_phone` no consultado en la auditoría V5] |
| Dirección postal | [Pendiente confirmación titular — `settings.legal_company_address` vacío en el momento de la auditoría V5] |

> Cuando el titular complete los valores en `/admin/configuracion → Facturación`, este documento debe actualizarse sustituyendo los marcadores `[Pendiente confirmación titular …]` por los valores reales y firmarse de nuevo.

---

## 3. Funciones del responsable de privacidad designado

El responsable de privacidad designado asume las siguientes funciones, sin perjuicio de la responsabilidad última del responsable del tratamiento conforme al art. 5.2 RGPD ("responsabilidad proactiva"):

1. **Recepción y gestión de solicitudes de derechos del interesado** (arts. 15-22 RGPD):
   - Derecho de acceso (art. 15) — proporcionar copia de los datos personales objeto de tratamiento y la información del art. 13/14.
   - Derecho de rectificación (art. 16).
   - Derecho de supresión / "derecho al olvido" (art. 17), conforme al procedimiento descrito en `Docs/legal/procedimiento-supresion.md`.
   - Derecho a la limitación del tratamiento (art. 18).
   - Derecho de portabilidad (art. 20).
   - Derecho de oposición (art. 21).
   - Derecho a no ser objeto de decisiones automatizadas (art. 22) — actualmente no aplica porque no se realizan tratamientos automatizados con efectos significativos.
   - Plazo de respuesta: **1 mes** desde la recepción, prorrogable 2 meses adicionales en supuestos complejos (art. 12.3 RGPD).

2. **Coordinación de la respuesta a brechas de seguridad de datos personales**, conforme al `Docs/legal/procedimiento-brechas.md`:
   - Recepción del aviso de brecha.
   - Evaluación de riesgo según la matriz del apartado 3 de dicho procedimiento.
   - Notificación a la AEPD en plazo de 72 horas (art. 33 RGPD) cuando proceda.
   - Comunicación a los interesados afectados cuando exista alto riesgo (art. 34 RGPD).
   - Registro interno en la tabla `data_breaches`.

3. **Mantenimiento del Registro de Actividades de Tratamiento (RAT)** actualizado, conforme al `Docs/legal/rat-2026.md` y al art. 30 RGPD. Revisión mínima anual y obligatoria ante cualquier cambio sustancial (nuevos tratamientos, nuevos encargados, modificación de bases jurídicas, cambios normativos).

4. **Supervisión de los contratos con encargados del tratamiento** conforme al art. 28 RGPD:
   - Verificación de la existencia y vigencia del DPA con cada encargado listado en la sección 3 del RAT.
   - Comprobación de las garantías de transferencia internacional (cláusulas contractuales tipo, EU-US DPF, decisiones de adecuación) en proveedores fuera del EEE.
   - Revaluación cuando un encargado cambie de jurisdicción o pierda su certificación.

5. **Punto de contacto público del responsable del tratamiento** para los interesados y, en su caso, para la AEPD. El email `info@dcbikescantabria.es` se mantendrá publicado en la Política de Privacidad, en el Aviso Legal y en el footer del sitio web, y será atendido en plazo razonable.

6. **Revisión periódica del cumplimiento** del RGPD, la LOPDGDD y normativas conexas (LSSI, RDL 1/2007, Ley 18/2022, Reg. UE 2022/2065 DSA, Reg. UE 2019/882 accesibilidad), apoyándose en las auditorías legales periódicas registradas en `Docs/legal/auditoria-legal-*.md`.

---

## 4. Recursos y autonomía

Conforme al art. 38.2 RGPD (aplicado por analogía aunque no se trate de DPO formal), el responsable del tratamiento se compromete a:

- Facilitar al responsable de privacidad designado el acceso a los datos personales y a las operaciones de tratamiento necesarios para el desempeño de sus funciones.
- No instruirle en el ejercicio de las funciones de modo contrario al RGPD ni penalizarle por el desempeño de las mismas.
- Atender sus recomendaciones técnicas en materia de protección de datos.

Como en este caso la figura coincide con la del propio titular (persona física empresaria individual), la autonomía es estructural: el titular decide sobre el cumplimiento normativo en su propia organización.

---

## 5. Comunicación a los interesados

La existencia del responsable de privacidad designado, su email de contacto y sus funciones se comunican a los interesados:

- En la **Política de Privacidad** (`/privacidad`), en la sección de "Datos del responsable y contacto".
- En el **Aviso Legal** (`/aviso-legal`).
- En la **plantilla de respuesta a brechas** del `procedimiento-brechas.md`, sección 4b.

---

## 6. Vigencia, revocación y nueva designación

Esta designación tiene **vigencia indefinida** hasta que:

- El titular designe expresamente una persona distinta como responsable de privacidad (mediante nueva versión de este documento).
- Se active alguno de los supuestos del art. 37.1 RGPD o art. 34 LOPDGDD que obliguen a designar DPO formal — en cuyo caso se sustituirá esta figura por la designación oficial comunicada a la AEPD.
- Cese la actividad de DC Bikes Cantabria, conforme al `Docs/legal/sucesion-empresa-cierre.md` (cuando se elabore).

---

## 7. Firma del responsable del tratamiento

Por la presente, el responsable del tratamiento de DC Bikes Cantabria designa internamente como responsable de privacidad a la persona indicada en la sección 2 de este documento, con las funciones descritas en la sección 3, durante la vigencia indicada en la sección 6.

| Concepto | Valor |
|---|---|
| Lugar | Cantabria, España |
| Fecha | 2026-05-27 |
| Nombre y apellidos del titular | [Pendiente confirmación titular — settings.legal_company_name vacío] |
| NIF/DNI | [Pendiente confirmación titular — settings.legal_company_cif vacío] |
| Firma | _________________________________ |

---

**Documento elaborado conforme a:**
- Reglamento (UE) 2016/679 (RGPD), arts. 24, 30, 37, 38.
- Ley Orgánica 3/2018 (LOPDGDD), art. 34.
- Directrices del Comité Europeo de Protección de Datos (EDPB) y guías de la AEPD aplicables.
