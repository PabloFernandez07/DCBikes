---
title: Test de Interés Legítimo (LIA) — Reseñas de Google en Home
version: 2026-05-27-v5
audit: V5
norma: Reglamento (UE) 2016/679 (RGPD), art. 6.1.f y considerando 47
hallazgo: F-22
---

# Test de Interés Legítimo (LIA) — Reseñas de Google en la Home

**Norma de referencia**: Reglamento (UE) 2016/679 (RGPD), art. 6.1.f ("interés legítimo") y considerando 47; Directrices del CEPD/WP29 sobre la antigua Directiva 95/46 (WP217) en cuanto al test de ponderación; Reglamento (UE) 2022/2065 (DSA) en lo relativo a contenido de terceros.

**Tratamiento evaluado**: publicación en la página de inicio (`Home.tsx`) de reseñas reales escritas por clientes en Google Maps / Google Business Profile, incluyendo el **nombre público del autor**, el **texto de la reseña**, la **puntuación en estrellas** y, en su caso, el **avatar público** proporcionado por Google.

**Conclusión anticipada**: el interés legítimo de DC Bikes Cantabria en mostrar estas reseñas **PREVALECE** sobre los derechos e intereses de los autores, siempre que se mantengan las medidas mitigadoras descritas en el paso 3. Esta valoración queda registrada conforme al principio de responsabilidad proactiva (art. 5.2 y art. 24 RGPD).

---

## Paso 1 · Identificación del interés legítimo (test de finalidad)

| Pregunta | Respuesta DC Bikes |
|----------|--------------------|
| ¿Cuál es el interés perseguido? | Informar a los clientes potenciales de la experiencia real de otros clientes con la tienda y el taller, reforzando la transparencia comercial y la confianza. |
| ¿Es un interés lícito y legítimo? | Sí. La promoción de la propia actividad comercial mediante prueba social veraz es un interés reconocido (considerando 47 RGPD, que cita expresamente el marketing directo como posible interés legítimo). |
| ¿Es real y actual, no especulativo? | Sí. Las reseñas se obtienen de un perfil de Google Business activo y se muestran en producción. |
| ¿Existe una alternativa con base de consentimiento? | No de forma proporcionada: las reseñas ya son públicas en Google Maps y exigir consentimiento individual a cada autor sería desproporcionado e impracticable. |

**Resultado del paso 1**: existe un interés legítimo claro, lícito, real y actual. **SUPERADO**.

---

## Paso 2 · Test de necesidad (proporcionalidad del medio)

| Pregunta | Respuesta DC Bikes |
|----------|--------------------|
| ¿El tratamiento es necesario para alcanzar el interés? | Sí. Mostrar las reseñas en la home es el medio directo y eficaz para transmitir prueba social en el momento de mayor intención de compra. |
| ¿Existe una vía menos invasiva igualmente eficaz? | Se valoró: (a) mostrar solo la puntuación media sin nombres ni texto, y (b) enlazar a Google sin incrustar. Ambas reducen materialmente el efecto de confianza buscado. La incrustación con datos mínimos es la opción menos invasiva que sigue siendo eficaz. |
| ¿Se tratan más datos de los imprescindibles? | No. Solo se muestran datos que **el propio autor ya hizo públicos** en Google (nombre público, texto, estrellas, avatar). No se infiere, enriquece ni combina con otros datos. No se almacena ningún dato adicional del autor. |
| ¿El alcance es proporcionado? | Sí. Se muestra un número limitado de reseñas seleccionadas, sin segmentación ni perfilado. |

**Resultado del paso 2**: el tratamiento es necesario y se limita al mínimo imprescindible (minimización, art. 5.1.c RGPD). **SUPERADO**.

---

## Paso 3 · Test de ponderación (balance de intereses)

Se contraponen el interés de DC Bikes (paso 1) y los derechos, libertades e intereses de los autores de las reseñas.

### 3.1 · Naturaleza de los datos

- Los datos son **datos personales ordinarios** (nombre público, opinión). **No** se tratan categorías especiales del art. 9 RGPD.
- Los datos **ya son públicos**: el autor los publicó voluntariamente en una plataforma abierta (Google Maps) accesible a cualquier persona. Esto reduce sensiblemente la expectativa de privacidad.

### 3.2 · Expectativas razonables del interesado

- Quien publica una reseña pública de un negocio puede **razonablemente esperar** que dicho negocio la reproduzca en sus canales (web, redes), pues esa es una práctica comercial habitual y notoria.
- La reproducción es **fiel y sin alteración**: no se edita el texto ni se descontextualiza, lo que respeta la integridad de la opinión del autor.

### 3.3 · Impacto y riesgo para el interesado

- **Riesgo BAJO**. No hay decisiones automatizadas, perfilado, ni efectos jurídicos sobre el autor.
- No se difunden datos de contacto del autor (email, teléfono, dirección); únicamente el nombre público que el propio autor eligió mostrar en Google.
- El daño potencial (exposición ligeramente mayor del nombre ya público) es marginal frente al beneficio informativo.

### 3.4 · Medidas mitigadoras adoptadas (salvaguardas)

Para reforzar el balance a favor del tratamiento, DC Bikes implementa:

1. **Leyenda de no-moderación**: junto a las reseñas en `Home.tsx` se muestra el texto *"Reseñas reales publicadas en Google Maps. DC Bikes no las modera."* (hallazgo X-11), dejando claro que el origen y la autoría son del cliente y de Google, no de la tienda.
2. **Botón "Reportar contenido" (DSA)**: enlace visible junto a las reseñas que permite a cualquier persona —incluido el propio autor— solicitar la retirada o señalar contenido ilícito conforme al art. 16 del Reglamento (UE) 2022/2065 (procedimiento detallado en `procedimiento-dsa-notice-action.md`, hallazgo X-02).
3. **Derecho de oposición efectivo y de fácil ejercicio**: cualquier autor puede oponerse a la reproducción de su reseña escribiendo a **dsa@dcbikescantabria.es**; DC Bikes retirará la reseña de la home sin demora indebida. Este canal se documenta en la Política de Privacidad.
4. **Datos mínimos**: no se almacena ni enriquece ningún dato del autor más allá de lo estrictamente mostrado (minimización del paso 2).
5. **Fidelidad**: las reseñas se reproducen sin edición, preservando el contexto original.

### 3.5 · Resultado de la ponderación

Sopesando que (i) los datos ya son públicos, (ii) son ordinarios y no sensibles, (iii) el riesgo para el autor es bajo y sin efectos jurídicos, (iv) las expectativas razonables del autor son compatibles con la reproducción, y (v) existen medidas mitigadoras efectivas (leyenda de no-moderación, botón de reporte DSA y derecho de oposición de fácil ejercicio), el interés legítimo de DC Bikes Cantabria **PREVALECE** sobre los derechos e intereses de los autores.

---

## 4 · Conclusión y registro

| Concepto | Determinación |
|----------|---------------|
| Base jurídica aplicable | Interés legítimo (art. 6.1.f RGPD) |
| Test de finalidad | Superado |
| Test de necesidad | Superado |
| Test de ponderación | Favorable a DC Bikes con medidas mitigadoras |
| **Veredicto** | **El interés legítimo PREVALECE. El tratamiento es lícito.** |

La presente valoración debe **revisarse**: (a) cada vez que cambie sustancialmente la forma de mostrar las reseñas, (b) si se recibe una oposición o denuncia DSA que altere el balance, y (c) en la revisión legal trimestral (`Docs/runbooks/legal-quarterly-review.md`).

**Información a los interesados**: el ejercicio de oposición y la condición de interés legítimo como base del tratamiento se reflejan en la Política de Privacidad (`PrivacyPolicy.tsx`) y en el RAT (`rat-2026.md`).

---

**Versión 2026-05-27 V5 · Hallazgo F-22 · Test LIA reseñas Google · Conclusión: el interés legítimo PREVALECE**
