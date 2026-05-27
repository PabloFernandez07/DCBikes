# Análisis previo DPIA — Evaluación de la necesidad

**Norma de referencia**: Reglamento (UE) 2016/679 (RGPD), arts. 35 y 36; Lista de la AEPD de tratamientos que requieren EIPD (Resolución de 7 de mayo de 2019); Directrices del CEPD WP248rev.01.

**Conclusión**: tras analizar los tratamientos efectuados por DC Bikes Cantabria, **NO procede realizar Evaluación de Impacto formal (DPIA / EIPD)**. La presente decisión queda motivada y registrada conforme al principio de responsabilidad proactiva (art. 5.2 y art. 24 RGPD).

---

## 1. Tratamientos analizados

| ID | Descripción | Finalidad | Base legal | Volumen anual estimado |
|----|-------------|-----------|------------|-------------------------|
| T1 | Gestión de pedido + factura (web + tienda física) | Ejecución contrato + obligación fiscal | art. 6.1.b y 6.1.c RGPD | ~ 200 – 500 pedidos |
| T2 | Marketing (formulario newsletter, captación de reseñas Google) | Comunicaciones comerciales sobre productos propios | art. 6.1.a y 6.1.f RGPD | < 200 contactos |
| T3 | Soporte y solicitudes (quote_requests, formularios de contacto) | Atención al cliente | art. 6.1.b RGPD precontractual | < 300 solicitudes |

(Detalle pormenorizado en `rat-2026.md` — gestionado por S2-Q2.)

---

## 2. Análisis art. 35.3 RGPD — Casos en que la DPIA es obligatoria

El art. 35.3 establece **tres** supuestos en los que la DPIA es preceptiva:

### a) Evaluación sistemática y exhaustiva de aspectos personales basada en tratamiento automatizado, incluida la elaboración de perfiles, sobre la que se basen decisiones que produzcan efectos jurídicos o afecten significativamente

| Pregunta | Respuesta DC Bikes |
|----------|---------------------|
| ¿Existe perfilado automatizado? | No |
| ¿Hay decisiones con efectos jurídicos o significativos basadas en algoritmos? | No |
| ¿Se segmentan clientes mediante ML/IA para ofertas? | No |
| ¿Se realiza scoring crediticio? | No (la pasarela Redsys gestiona el cobro; DC Bikes no evalúa solvencia) |

**Conclusión a)**: NO concurre.

### b) Tratamiento a gran escala de las categorías especiales de datos (art. 9) o relativos a condenas penales (art. 10)

| Pregunta | Respuesta DC Bikes |
|----------|---------------------|
| ¿Se tratan datos de salud? | No (consultas comerciales sobre bicicletas no se consideran datos de salud) |
| ¿Origen racial, opiniones políticas, orientación sexual? | No |
| ¿Datos biométricos para identificación unívoca? | No |
| ¿Condenas o infracciones penales? | No |

**Conclusión b)**: NO concurre.

### c) Observación sistemática a gran escala de una zona de acceso público

| Pregunta | Respuesta DC Bikes |
|----------|---------------------|
| ¿Hay videovigilancia con grabación? | Pendiente confirmar con titular si la tienda física tiene cámaras. **Si las hay**, deberá documentarse aparte y valorarse independientemente con la lista AEPD. |
| ¿Tracking de geolocalización del cliente? | No (Google Analytics está deshabilitado tras la auditoría v3) |
| ¿Cookies de seguimiento de terceros? | No (solo cookies técnicas y consent banner) |

**Conclusión c)**: NO concurre con la información actual. Reabrir el análisis si se instala videovigilancia.

---

## 3. Análisis lista AEPD (criterios complementarios)

La AEPD publicó (Resolución 7 mayo 2019) un listado de tratamientos que **siempre** requieren DPIA en España. Repasamos los aplicables:

| Criterio AEPD | Aplica a DC Bikes |
|---------------|-------------------|
| Datos de niños y adolescentes a gran escala | No |
| Datos de salud, biométricos, genéticos | No |
| Tratamiento con tecnologías "particularmente invasivas" (drones, IoT, IA generativa con datos personales) | No |
| Geolocalización continua | No |
| Transferencias internacionales fuera del EEE sin garantías | No (Supabase EU + Resend EU + Vercel EU + Cloudflare con SCCs) |
| Tratamiento masivo de datos para fines distintos al original | No |
| Tratamiento basado en interés legítimo cuando afecte a grupos vulnerables | No |
| Combinación / cruce de datasets cuando ambos no se obtuvieron del interesado | No |

**Conclusión lista AEPD**: NO concurre.

---

## 4. Análisis WP248rev.01 (criterios CEPD)

El antiguo Grupo del Artículo 29 (hoy CEPD) propuso 9 criterios; cuando concurren **dos o más**, la DPIA es muy recomendable. Repasamos:

| Criterio | DC Bikes |
|----------|----------|
| 1. Evaluación o puntuación | No |
| 2. Decisiones automatizadas con efecto legal o significativo | No |
| 3. Observación sistemática | No |
| 4. Datos sensibles o altamente personales | No |
| 5. Tratamiento a gran escala | No (microempresa; volumen < 1.000 interesados activos) |
| 6. Combinación o concordancia de datasets | No |
| 7. Datos relativos a personas vulnerables | No |
| 8. Uso innovador o aplicación de nuevas soluciones tecnológicas | No (stack convencional) |
| 9. El tratamiento impide ejercer un derecho o usar un servicio | No |

**Conclusión WP248**: cero criterios coincidentes. La DPIA no es obligatoria ni recomendable.

---

## 5. Decisión motivada

Por todo lo anterior, **se acuerda no realizar Evaluación de Impacto formal** sobre los tratamientos T1, T2 y T3 descritos.

Las garantías ya implantadas en el proyecto cubren los riesgos identificados:

- **Registro de Actividades de Tratamiento (RAT 2026)** — `rat-2026.md` (S2-Q2).
- **Procedimiento de brechas de seguridad** — `procedimiento-brechas.md`.
- **Procedimiento de supresión / derechos del interesado** — `procedimiento-supresion.md` (S2-Q2).
- **Política de retención y purga automática** — crons `data-retention-cron`, anonimización X-12.
- **Procedimiento DSA** — `procedimiento-dsa-notice-action.md`.
- **Protocolo requerimientos autoridades** — `protocolo-requerimientos-autoridades.md`.
- **Cifrado en tránsito** (HTTPS obligatorio) y **en reposo** (Supabase EU).
- **Control de acceso administrativo** con RLS y `admin_users`.

---

## 6. Revaluación

Esta decisión se revisa **anualmente** (próxima fecha objetivo: 2027-05-27) y, **de forma extraordinaria**, ante:

- Apertura de tienda física con videovigilancia.
- Lanzamiento de programa de fidelización con perfilado de clientes.
- Integración de servicios IA/ML para recomendaciones automáticas.
- Tratamiento de datos de menores como público objetivo.
- Cambios en proveedores con consecuencias en transferencias internacionales.
- Crecimiento de volumen > 10.000 interesados activos.
- Publicación de nuevos criterios por la AEPD o el CEPD.
- Recepción de requerimiento de autoridad que cuestione la conclusión.

---

## 7. Trazabilidad

| Campo | Valor |
|-------|-------|
| Fecha de la decisión | 2026-05-27 |
| Responsable de la decisión | Titular DC Bikes Cantabria |
| Base documental | RAT-2026, presente documento |
| Próxima revisión planificada | 2027-05-27 |
| Versión | 1.0 |

---

**Nota**: este análisis no sustituye a una DPIA cuando ésta sea legalmente exigible. Si en alguna revaluación se concluye lo contrario, debe abrirse procedimiento DPIA siguiendo metodología del CEPD (WP248rev.01) o la herramienta CNIL PIA.
