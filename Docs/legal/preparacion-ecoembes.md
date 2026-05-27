# Preparación — Alta SCRAP envases (Ecoembes)

**Norma de referencia**: Ley 7/2022, de 8 de abril, de residuos y suelos contaminados para una economía circular, art. 6 (responsabilidad ampliada del productor para envases) y Real Decreto 1055/2022, de 27 de diciembre, de envases y residuos de envases.

**Estado del proyecto**: pendiente de alta. DC Bikes Cantabria, al expedir productos en cajas de cartón y, ocasionalmente, plástico de protección, queda incluida en el ámbito subjetivo del SCRAP (Sistema Colectivo de Responsabilidad Ampliada del Productor).

---

## 1. ¿Quién está obligado?

Todo sujeto que **ponga en el mercado español productos envasados** queda obligado a:

1. Adherirse a un SCRAP autorizado, o
2. Implantar un Sistema Individual (inviable para microempresas).

Esto incluye:

- Comerciantes minoristas que envasen para envío al cliente (caso DC Bikes en pedidos online).
- Importadores que reciban producto ya envasado y lo redistribuyan.

La obligación es **independiente del volumen**: incluso un autónomo con pocos envíos al año debe adherirse, aunque la cuota se calcula proporcional al peso de envases puestos en el mercado.

---

## 2. SCRAP autorizado relevante para DC Bikes

| SCRAP | Material | Coste indicativo (autónomo, baja escala) |
|-------|----------|-------------------------------------------|
| **Ecoembes** | Envases ligeros (cartón, plástico, brik, metal ligero) | 50 – 200 €/año |
| Ecovidrio | Vidrio | N/A para DC Bikes |
| Recyclia / Ecolec | RAEE | N/A salvo para componentes electrónicos de bicis eléctricas — pendiente análisis separado |

DC Bikes usa **cartón** (cajas de transporte) y **plástico** (films, burbuja, bridas) → procede alta en **Ecoembes**.

---

## 3. Procedimiento de alta

### 3.1. Documentación necesaria

- DNI/NIE del titular (autónomo) o CIF de la sociedad.
- Datos fiscales completos (mismos que en `/admin/configuracion → datos fiscales`).
- Estimación del peso anual de envases (kg) por material:
  - Cartón
  - Plástico flexible
  - Plástico rígido
- Volumen de unidades estimado.

### 3.2. Flujo

1. Acceder al portal Ecoembes: <https://www.ecoembes.com>.
2. Sección **"Adhiérete"** → formulario de alta.
3. Cumplimentar declaración inicial: estimación de pesos por material.
4. Recibir contrato de adhesión y firmarlo (electrónicamente).
5. Recibir número de adherido.
6. Pago de la primera tarifa (anual, prorrateable al alta).
7. Declaración anual antes del 31 de marzo del año siguiente, con peso real puesto en el mercado durante el ejercicio anterior.

### 3.3. Plazo realista

- Tramitación: 2 – 4 semanas desde envío de la solicitud.
- Coste primer año: prorrateado a partir del alta.

---

## 4. Coste estimado para DC Bikes (autónomo, baja escala)

Para un volumen orientativo de **50–150 pedidos anuales online** con embalaje medio de 1 kg de cartón + 0,2 kg de plástico por envío:

| Material | Peso anual estimado | Tarifa Ecoembes 2024 (€/kg) | Coste anual |
|----------|---------------------|------------------------------|-------------|
| Cartón | 50 – 150 kg | ~ 0,03 €/kg | 2 – 5 € |
| Plástico flexible | 10 – 30 kg | ~ 0,40 €/kg | 4 – 12 € |
| **Cuota mínima de adhesión** | n/a | n/a | **50 – 100 €** |

Resultado realista: **50 – 120 €/año** dominado por la cuota mínima de adhesión, no por el volumen.

> Las tarifas Ecoembes se publican anualmente y varían por material. Revisar tabla vigente antes del alta.

---

## 5. Cambios derivados en la web y operativa

### 5.1. Número de adherido en la documentación

Una vez asignado, debe figurar:

- **En el footer público** de la web (sección legal, junto a NIF/IAE).
- **En cada factura B2B y B2C** generada por el sistema.
- **En los albaranes y etiquetas de envío** (recomendado, no obligatorio para envíos nacionales).

### 5.2. Persistencia técnica

Campo a crear en `settings` (cuando se realice el alta):

```sql
-- Pendiente — añadir al panel /admin/configuracion:
-- ecoembes_adheration_number text
-- ecoembes_signed_at         timestamptz
```

El front debe renderizarlo solo si está completado (mismo patrón que `legal_company_*`).

### 5.3. Etiquetado de los envases (símbolo del punto verde / SDDR)

A partir de 2025, RD 1055/2022 exige símbolos de reciclabilidad estandarizados en los envases. DC Bikes los recibe ya impresos del fabricante de la bicicleta o del componente; en el embalaje propio (caja personalizada o pegatina) procede añadir símbolo cuando exista.

---

## 6. Declaración anual

Cada ejercicio, antes del **31 de marzo del año siguiente**, debe presentarse a Ecoembes una declaración con:

- Peso real de envases puestos en el mercado por material.
- Justificación de variaciones significativas respecto a la estimación.
- Pago de la regularización (positiva o negativa según ajuste).

Recomendación operativa: llevar registro mensual interno del peso de cajas y embalajes utilizados (hoja de cálculo o tabla `packaging_log` futura).

---

## 7. Sanciones por incumplimiento

Ley 7/2022, art. 108: el incumplimiento de la responsabilidad ampliada del productor es **infracción grave**, con multas de 9.001 € a 1.200.000 €. En la práctica, para microempresas la sanción se modula significativamente, pero la exposición existe.

---

## 8. Acción inmediata recomendada

- [ ] Decisión del titular sobre cuándo realizar el alta (recomendable: **antes del 2026-12-31** para regularizar el ejercicio 2026 completo).
- [ ] Estimar pesos del último año para preparar la declaración inicial.
- [ ] Reservar partida presupuestaria anual (~100 €).
- [ ] Tras alta: cumplimentar campo `ecoembes_adheration_number` en `/admin/configuracion`.
- [ ] Actualizar plantilla de factura y footer público con el número.

---

**Versión**: 1.0
**Fecha de creación**: 2026-05-27
**Próxima revisión**: 2026-12-31 (decisión de alta) o ante cambios regulatorios
**Responsable**: titular DC Bikes Cantabria
