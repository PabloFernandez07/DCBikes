# Procedimiento DSA — Notice & Action

**Norma de referencia**: Reglamento (UE) 2022/2065 del Parlamento Europeo y del Consejo, de 19 de octubre de 2022, relativo a un mercado único de servicios digitales (DSA), art. 16 ("Mecanismos de notificación y acción").

**Ámbito de aplicación en DC Bikes Cantabria**: la web aloja contenido publicado por terceros (reseñas de Google embebidas en la home) y permite comunicación cliente↔tienda (formularios de presupuesto). En cuanto microempresa (Recomendación UE 2003/361), DC Bikes está exenta de varias obligaciones del DSA (informe de transparencia, sistemas internos de reclamación complejos), pero el mecanismo de denuncia del art. 16 sigue siendo aplicable.

---

## 1. Canal de recepción

- **Buzón único**: `dsa@dcbikescantabria.es`
- **Acceso**: enlace público desde la home (junto a las reseñas) y desde el footer.
- **Formato del subject recomendado**: `DSA notice — [descripción]` o `DSA notice — reseña #N` cuando se trate de una reseña concreta.
- **Idioma**: español o inglés.

El buzón debe revisarse al menos cada **48 horas hábiles**.

---

## 2. Contenido mínimo exigible al denunciante (art. 16.2 DSA)

Una notificación es válida cuando incluye:

1. **Motivación suficiente** de por qué el contenido se considera ilícito.
2. **URL exacta o referencia inequívoca** del contenido (en reseñas: nombre del autor, fecha aproximada o copia literal del texto).
3. **Nombre y datos de contacto** del denunciante (excepto si la denuncia versa sobre contenido relacionado con los arts. 3 a 7 de la Directiva 2011/93/UE — abusos a menores —, en cuyo caso puede ser anónima).
4. **Declaración** de que la información de la notificación es exacta y completa, hecha de buena fe.

Si falta algún elemento esencial se solicita complemento al denunciante. La notificación se considera presentada en su forma original a efectos del plazo solo cuando esté completa.

---

## 3. Plazos de revisión

| Fase | Plazo | Responsable |
|------|-------|-------------|
| Acuse de recibo automático | 24 h | sistema email |
| Triaje (válida / incompleta / fraudulenta) | 3 días hábiles | titular |
| Decisión motivada | sin demora indebida, **máx. 14 días naturales** desde notificación completa | titular |
| Notificación de la decisión al denunciante | inmediata tras decisión | titular |
| Notificación al autor del contenido (si procede) | inmediata tras decisión | titular |

La condición de microempresa permite no informar en tiempo real, pero el plazo de 14 días se considera el límite máximo razonable. En denuncias urgentes (contenido manifiestamente ilícito: amenazas, datos personales filtrados, contenido infantil) la decisión es inmediata.

---

## 4. Criterios de valoración

El titular evalúa cada denuncia bajo tres ejes:

### Mantener (no acción)
- Opinión legítima protegida por la libertad de expresión (art. 20 CE).
- Crítica subjetiva proporcionada al servicio prestado.
- No hay infracción identificable de ley aplicable, T&C de Google o políticas DC Bikes.

### Suspender visibilidad (acción intermedia)
- Contenido cuestionable en revisión.
- Mientras se contacta al autor pidiendo aclaración.

### Retirar (acción)
- Difamación o calumnia (arts. 205 y 208 CP).
- Revelación de datos personales sin consentimiento (arts. 5/6 RGPD).
- Amenazas, discurso de odio (Ley 19/2007 contra la violencia y el racismo).
- Suplantación de identidad.
- Contenido protegido por propiedad intelectual sin autorización.
- Spam comercial manifiesto.

> **Importante**: las reseñas en Google Maps están alojadas en infraestructura de Google. DC Bikes no puede retirar la reseña directamente; el procedimiento es solicitar la retirada a Google a través de sus mecanismos oficiales (Google Maps → tres puntos → "Marcar como inapropiada") **y** dejar de incrustarla en la web propia mediante exclusión configurable en `useGoogleReviews` (filtro por author_name o time).

---

## 5. Comunicación al denunciante

Toda decisión debe motivarse por escrito, incluyendo (art. 17 DSA):

- Hechos y circunstancias en que se basa la decisión.
- Si hubo medios automatizados implicados (en nuestro caso, **no**).
- Base legal o contractual de la decisión.
- Información clara sobre vías de recurso disponibles.

### Plantilla — Decisión de mantener contenido

```
Asunto: Re: DSA notice — [referencia]

Hola [Nombre],

Hemos recibido tu notificación del [fecha] sobre el contenido [identificación] y hemos
completado nuestra revisión conforme al art. 16 del Reglamento (UE) 2022/2065 (DSA).

Decisión: MANTENER el contenido en su forma actual.

Motivación: tras analizar el contenido, no apreciamos infracción de la legislación
aplicable ni de las políticas de Google Maps. Consideramos que [explicación concreta:
opinión protegida / sin datos personales / sin amenazas / etc.].

Recursos disponibles:
1. Reclamación a Google directamente desde la propia ficha de Google Maps
   (botón "Marcar como inapropiada").
2. Reclamación al Coordinador de Servicios Digitales español
   (CNMC — https://www.cnmc.es).
3. Reclamación judicial ante los tribunales ordinarios.
4. Mediación vía órgano extrajudicial certificado por el coordinador.

Quedamos a tu disposición.

Atentamente,
DC Bikes Cantabria
```

### Plantilla — Decisión de retirar contenido

```
Asunto: Re: DSA notice — [referencia]

Hola [Nombre],

Hemos recibido tu notificación del [fecha]. Tras la revisión:

Decisión: SOLICITAR RETIRADA del contenido a Google y SUSPENDER su incrustación en
nuestra web mientras Google resuelve.

Motivación: el contenido infringe [norma concreta: art. X del RGPD / art. Y CP / etc.]
porque [hecho probatorio].

Acciones tomadas:
- Reporte formal al equipo de Google Maps (referencia interna: [ID]).
- Exclusión inmediata del carrusel público de reseñas en dcbikescantabria.es.

Quedamos a tu disposición.

Atentamente,
DC Bikes Cantabria
```

---

## 6. Comunicación al autor del contenido (cuando proceda)

Si el autor de la reseña es identificable y la decisión es retirar/suspender, debe comunicársele:

- La medida adoptada.
- La motivación.
- Su derecho a réplica (10 días naturales para alegar).
- Vías de recurso (igual que al denunciante).

En reseñas anónimas (Google) sin contacto directo, esta comunicación no es viable y se documenta así en el registro interno.

---

## 7. Registro interno

Cada notificación debe registrarse durante **5 años** (plazo análogo al de la AEPD para procedimientos sancionadores). Se almacena en formato estructurado, prevista la tabla futura `dsa_notices`:

```sql
-- PENDIENTE (no creada todavía):
-- create table dsa_notices (
--   id uuid primary key default gen_random_uuid(),
--   received_at timestamptz not null default now(),
--   complainant_email text,
--   content_ref text not null,             -- URL, ID reseña, etc.
--   reason text not null,
--   triage_status text check (triage_status in ('valid','incomplete','fraudulent')),
--   decision text check (decision in ('keep','suspend','remove','pending')),
--   decided_at timestamptz,
--   notified_complainant_at timestamptz,
--   notified_author_at timestamptz,
--   notes text,
--   created_at timestamptz not null default now()
-- );
```

Mientras la tabla no exista, el registro se lleva en hoja de cálculo cifrada gestionada por el titular.

---

## 8. Salvaguardas contra abuso (art. 23 DSA)

Si se detecta uso indebido del canal (denuncias manifiestamente infundadas, en serie o de mala fe), el titular puede:

- Advertir previamente al usuario.
- Suspender temporalmente el procesamiento de futuras notificaciones de esa fuente.

Estas decisiones se documentan también en el registro.

---

## 9. Mantenimiento del procedimiento

- **Revisión anual** por el titular (fecha objetivo: cada 1 de enero).
- **Revisión extraordinaria** ante cambios regulatorios o incidentes significativos.
- **Coordinación** con el procedimiento de brechas (`procedimiento-brechas.md`) si la denuncia revela una filtración de datos.

---

**Versión**: 1.0
**Fecha de creación**: 2026-05-27
**Próxima revisión**: 2027-01-01
**Responsable**: titular DC Bikes Cantabria
