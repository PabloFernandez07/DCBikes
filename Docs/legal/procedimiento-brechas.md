# Procedimiento de gestión de brechas de seguridad — DC Bikes Cantabria

**Última actualización:** 2026-05-26
**Base legal:** Artículos 33 y 34 del Reglamento (UE) 2016/679 (RGPD).
**Responsable del tratamiento:** *[Titular DC Bikes Cantabria]*.
**Ámbito:** todo incidente que afecte a datos personales tratados por DC Bikes Cantabria.

---

## 1. Definición de brecha de seguridad

Conforme al **artículo 4.12 RGPD**, se considera "violación de la seguridad de los datos personales" toda violación de la seguridad que ocasione:

- la **destrucción**,
- la **pérdida**,
- la **alteración accidental o ilícita**,
- la **comunicación no autorizada**, o
- el **acceso no autorizado**

a datos personales transmitidos, conservados o tratados de otra forma.

Ejemplos prácticos en el contexto de DC Bikes Cantabria:

- Acceso no autorizado al panel `/admin` (credenciales filtradas).
- Filtración accidental de un fichero de pedidos por error humano (envío del CSV equivocado).
- Borrado accidental e irrecuperable de la base de datos.
- Compromiso de la cuenta Supabase, Vercel, Resend o del dominio.
- Robo o pérdida de un dispositivo desde el que se accede al panel admin sin 2FA.
- Phishing exitoso contra el responsable que derive en acceso a la cuenta.

---

## 2. Cadena de decisión

La cadena se ejecuta paso a paso. Los plazos son **máximos legales**; siempre que sea posible, deben acortarse.

### Paso 1 — Detección (T+0)

**¿Quién?** Cualquier persona con acceso a los sistemas (el titular, colaboradores, asesoría, o incluso clientes que reporten un comportamiento extraño).

**¿Cómo?**

- Alertas automáticas: logs de Supabase, logs de Vercel, alertas de Resend (bounces masivos anómalos), alertas de Redsys.
- Denuncia de un cliente o tercero.
- Detección durante una auditoría interna.
- Aviso de un proveedor o encargado del tratamiento (por ej. Supabase notifica una vulnerabilidad).

**Acción inmediata:** registrar fecha y hora exactas de la detección. **Este momento marca el inicio del plazo de 72h del art. 33 RGPD.**

### Paso 2 — Evaluación del riesgo (T+0 a T+24h)

**¿Quién?** El responsable del tratamiento (el titular del negocio).

**¿Qué hace?**

1. Reúne toda la información disponible: qué datos están afectados, cuántos interesados, qué sistema, durante cuánto tiempo.
2. Aplica la **matriz de evaluación de riesgo** (apartado 3).
3. Decide:
   - **Riesgo bajo/medio:** registrar internamente. Valorar caso por caso si procede notificación.
   - **Riesgo alto o crítico:** notificación obligatoria a AEPD (art. 33) y a los afectados (art. 34).

### Paso 3 — Contención (en las primeras 24h)

**¿Quién?** El responsable, con apoyo técnico si procede.

**Acciones de contención típicas:**

- Cambiar todas las contraseñas y revocar todos los tokens activos (Supabase, Vercel, Resend, Redsys, dominio).
- Cerrar la brecha técnica concreta (parchear, restringir acceso, bloquear IP).
- Restaurar desde copia de seguridad si hay pérdida/alteración.
- Revocar sesiones activas (`customer_sessions`, sesiones admin).
- Documentar todo lo realizado en el registro interno.

### Paso 4 — Notificación a la AEPD (≤ 72h desde la detección)

**¿Quién?** El responsable del tratamiento.

**¿Cuándo procede?** Siempre que la brecha pueda suponer un **riesgo para los derechos y libertades de las personas físicas** (criterio del art. 33.1 RGPD). En la práctica, ante la duda, notificar.

**¿Cómo se notifica?** Ver apartado 5.

### Paso 5 — Notificación a los afectados (sin dilación indebida)

**¿Quién?** El responsable del tratamiento.

**¿Cuándo procede?** Solo cuando la brecha entrañe un **alto riesgo** para los derechos y libertades de los interesados (art. 34.1 RGPD).

**¿Cómo?** Email directo a cada afectado usando la plantilla del apartado 4. Si no es posible una comunicación individualizada (porque el coste sería desproporcionado o no se dispone de un canal directo), se admite comunicación pública (art. 34.3.c RGPD).

---

## 3. Matriz de evaluación de riesgo

Modelo orientativo basado en la metodología de la CNIL francesa y compatible con las directrices del Comité Europeo de Protección de Datos (EDPB Guidelines 9/2022).

| Severidad de los datos | Probabilidad → | **Baja** | **Media** | **Alta** |
|---|---|---|---|---|
| **Baja** (datos básicos: nombre, email; pocos afectados) | | Bajo | Bajo | Medio |
| **Media** (datos de contacto + dirección + historial de pedidos) | | Bajo | Medio | Alto |
| **Alta** (datos de pago, masivos, o categorías especiales art. 9) | | Medio | Alto | **Crítico** |

**Criterio de actuación:**

- **Bajo:** registro interno. No notificación.
- **Medio:** registro interno. Valoración caso por caso de notificación a AEPD. Habitualmente sí se notifica.
- **Alto:** notificación a AEPD obligatoria (art. 33). **Comunicación a afectados obligatoria** (art. 34).
- **Crítico:** notificación a AEPD obligatoria + comunicación a afectados obligatoria + revisión profunda de las medidas técnicas y organizativas del art. 32 RGPD.

**Factores que aumentan la severidad:**

- Volumen alto de afectados.
- Inclusión de datos económicos o que permitan suplantación.
- Imposibilidad de revertir el daño.
- Persistencia de los datos en circulación (publicación, indexación).
- Especial vulnerabilidad de los interesados (menores, personas en situación de discapacidad, etc.).

---

## 4. Plantilla — Notificación a la AEPD (sede electrónica)

Conforme al **art. 33 RGPD**, usar el **Formulario 040** en https://sedeagpd.gob.es. El texto siguiente sirve como borrador para cubrir los campos del formulario.

```
NOTIFICACIÓN DE BRECHA DE SEGURIDAD — art. 33 RGPD

Naturaleza de la brecha:
  [Descripción técnica: qué sistema, tipo de incidente — acceso no autorizado / pérdida /
   alteración / filtración. Origen detectado. Duración estimada de la exposición.]

Categorías de datos personales afectados:
  [p.ej: nombre completo, dirección de email, dirección postal, historial de pedidos]

Número aproximado de interesados afectados:
  [número estimado]

Número aproximado de registros de datos afectados:
  [número estimado]

Consecuencias probables:
  [Riesgo evaluado para los interesados: suplantación de identidad, phishing, acceso a
   historial de compras, impacto económico, etc.]

Medidas adoptadas o propuestas:
  - Contención técnica: [descripción]
  - Mitigación: [descripción]
  - Medidas organizativas adicionales: [descripción]

Datos de contacto del responsable / DPO:
  Nombre: [PENDIENTE — designar DPO o responsable; añadir nombre]
  Email:  [PENDIENTE — añadir email de contacto]
  Teléfono: [PENDIENTE — añadir teléfono]
```

> **DPO / Responsable de privacidad:** `[PENDIENTE — designar DPO o responsable del tratamiento; añadir nombre, email y teléfono antes de la primera notificación real a la AEPD]`

---

## 4b. Plantilla email a usuarios afectados (art. 34 — solo alto riesgo)

```
Asunto: [Importante] Incidente de seguridad relacionado con tus datos personales

Estimado/a {nombre}:

Te informamos de un incidente de seguridad detectado el {fecha} que ha podido
afectar a los siguientes datos personales tuyos: {datos_categorías}.

{descripción_breve}.

Medidas que hemos adoptado:
  {medidas}

Te recomendamos:
  {recomendaciones — p.ej. estar atento/a a posibles intentos de phishing y no reutilizar contraseñas}

Si tienes preguntas, contacta con nuestro responsable de privacidad en {email_dpo}.
Tienes derecho a presentar reclamación ante la AEPD (https://www.aepd.es).

Atentamente,
{Responsable} — DC Bikes Cantabria
```

**Variables a sustituir:**

- `{nombre}`: nombre del cliente.
- `{fecha}`: fecha en la que se detectó la brecha.
- `{datos_categorías}`: ej. "tu nombre, email y dirección de envío".
- `{descripción_breve}`: una o dos frases neutras y claras sobre qué ha pasado.
- `{medidas}`: ej. "Hemos cambiado todas las contraseñas, revocado todas las sesiones activas y notificado a la AEPD".
- `{recomendaciones}`: ej. "Te recomendamos estar atento/a a posibles intentos de phishing en los próximos días y no reutilizar contraseñas".
- `{email_dpo}`: email del responsable o DPO (ver designación en la sección anterior).

**Buenas prácticas para el envío:**

- Enviar desde el dominio corporativo (info@dcbikescantabria.es) — nunca desde un dominio nuevo o sospechoso.
- Lenguaje claro y comprensible (art. 12 RGPD). Evitar tecnicismos.
- No minimizar el incidente.
- No incluir enlaces de "verificación" — el cliente, si quiere, accede directamente desde la web.

---

## 5. Pasos para la notificación a la AEPD

**Plazo:** 72 horas desde el conocimiento de la brecha (art. 33.1 RGPD). Si se excede, el responsable debe justificar el retraso.

**Procedimiento:**

1. Acceder a la **Sede Electrónica de la AEPD**: https://sedeagpd.gob.es
2. Identificarse con certificado electrónico, Cl@ve o DNI electrónico.
3. Buscar y cumplimentar el **Formulario 040 — "Notificación de quiebras de seguridad de los datos personales"**.
4. Información mínima a aportar (art. 33.3 RGPD):
   - Descripción de la naturaleza de la brecha.
   - Categorías y número aproximado de interesados afectados.
   - Categorías y número aproximado de registros de datos personales afectados.
   - Nombre y datos de contacto del responsable (o DPD, si lo hubiera).
   - Descripción de las posibles consecuencias.
   - Medidas adoptadas o propuestas para poner remedio a la brecha y, en su caso, mitigar los efectos negativos.
5. Si en el momento de notificar no se dispone de toda la información, puede notificarse **de manera escalonada** (art. 33.4 RGPD), aportando inicialmente lo que se conoce y completando posteriormente.
6. Conservar el justificante de la notificación y el número de expediente asignado por la AEPD (registrarlo en el campo `aepd_case_number` de la tabla `data_breaches`).

---

## 6. Registro interno obligatorio

Conforme al **artículo 33.5 RGPD**, el responsable debe **documentar cualquier brecha de seguridad**, con independencia de si se notifica o no a la AEPD. La documentación debe permitir a la autoridad de control verificar el cumplimiento.

En este proyecto, el registro se materializa en la tabla **`data_breaches`** de la base de datos (definida en la migración `0010_data_breaches.sql`). Para **cada** brecha detectada, debe crearse un registro con:

- Fecha y hora de detección.
- Descripción.
- Fuente (logs, denuncia, etc.).
- Categorías de datos afectados y número estimado de afectados.
- Si afecta a categorías especiales (art. 9 RGPD).
- Nivel de riesgo evaluado y su justificación.
- Si se notificó a la AEPD (fecha + nº expediente).
- Si se notificó a los afectados (fecha + método).
- Medidas de contención.
- Estado de resolución.

**Este registro es obligatorio incluso para incidentes de riesgo bajo que no se notifiquen.**

---

## 7. Política de retención del registro de brechas

El registro de brechas se conserva durante todo el periodo en que la documentación pueda ser requerida por la autoridad de control y, como mínimo, **el periodo de prescripción de las posibles infracciones LOPDGDD (3 años para infracciones leves, art. 78 LOPDGDD)**, prolongándose hasta el cierre definitivo del expediente si se hubiera abierto procedimiento.

> *Nota técnica: la política de retención automatizada (purga selectiva de campos sensibles tras los plazos legales) se incorporará en una migración futura, gestionada por otro flujo de trabajo del proyecto. Hasta entonces, la retención se gestiona manualmente conforme a este procedimiento.*

---

## 8. Alertas técnicas a configurar (TODO operativo del cliente)

Las siguientes actividades deben monitorizarse y generar una alerta automática al email del DPO / responsable. **Esto es un TODO operativo pendiente de implementar por el titular del proyecto.** Hasta que estén configuradas, la detección es manual.

| Señal a monitorizar | Sistema | Umbral sugerido |
|---|---|---|
| Tasa de error elevada en Edge Functions (Supabase) | Supabase logs | > 5% de 5xx en 10 min |
| Fallos de firma Redsys (posible manipulación de parámetros) | Vercel logs / Edge Fn | > 3 fallos en 5 min |
| Cron de retención devuelve `unauthorized` o falla | Supabase cron | Cualquier fallo |
| Accesos fallidos al panel `/admin/login` | Supabase auth logs | > 10 intentos en 5 min |
| Queries lentas o inusuales en `data_breaches` / `orders` | Supabase advisors | Revisar semanalmente |
| Cambios masivos en tablas críticas (DELETE / UPDATE sin WHERE) | Supabase logs | Cualquier evento |

**Implementación recomendada:**

1. Activar las **alertas de Supabase** (Dashboard → Settings → Alerts) para error rate de Edge Functions.
2. Configurar un webhook o integración de Vercel con un canal de notificaciones (email, Slack, PagerDuty).
3. Añadir un health-check del cron de retención que envíe email al DPO si falla tres ejecuciones consecutivas.

---

## 9. Revisión del procedimiento

Este procedimiento se revisa:

- **Al menos una vez al año.**
- Tras cada brecha real, para incorporar lecciones aprendidas.
- Cuando cambien los proveedores o el stack técnico de forma sustancial.
- Cuando se publiquen nuevas directrices de la AEPD o del EDPB que afecten a este procedimiento.

---

**Última actualización:** 2026-05-26.
