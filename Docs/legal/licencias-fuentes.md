---
title: Licencias de fuentes tipográficas
version: 2026-05-27-v5
audit: V5
hallazgo: F-23
---

# Licencias de fuentes tipográficas — DC Bikes Cantabria

**Norma de referencia**: SIL Open Font License (OFL) versión 1.1, de 26 de febrero de 2007 (SIL International). Texto íntegro: <https://openfontlicense.org/open-font-license-official-text/>.

**Propósito**: documentar las fuentes web utilizadas en `dc-bikes-web`, su licencia, autoría y el cumplimiento de las condiciones de uso. Ambas fuentes se distribuyen bajo SIL OFL 1.1, lo que permite su uso comercial, incrustación y autohospedaje sin coste ni regalías, siempre que se respeten las condiciones de la licencia.

---

## 1 · Fuentes utilizadas

| Fuente | Uso en el sitio | Autoría | Fundición | Licencia |
|--------|-----------------|---------|-----------|----------|
| **Bebas Neue** | Titulares y elementos de marca (display) | Ryoichi Tsunekawa | Dharma Type | SIL Open Font License 1.1 |
| **Barlow** | Texto de cuerpo e interfaz | Jeremy Tribby | — (proyecto independiente) | SIL Open Font License 1.1 |

---

## 2 · Modo de distribución — autohospedaje

Ambas fuentes se sirven **autohospedadas** mediante los paquetes de [Fontsource](https://fontsource.org/):

- `@fontsource/bebas-neue`
- `@fontsource/barlow`

El autohospedaje evita la transferencia de IPs de los visitantes a servidores de terceros (p. ej. Google Fonts), lo que **refuerza el cumplimiento del RGPD** al no producirse una comunicación de datos personales a un proveedor externo por la mera carga de la tipografía. Los archivos de fuente se empaquetan en el bundle de la aplicación y se sirven desde el mismo dominio.

---

## 3 · Condiciones de la SIL OFL 1.1 y cumplimiento

La OFL 1.1 permite usar, estudiar, modificar y redistribuir las fuentes, incluso con fines comerciales, bajo las siguientes condiciones, todas cumplidas por DC Bikes:

| Condición OFL 1.1 | Cumplimiento en DC Bikes |
|-------------------|--------------------------|
| 1. No vender las fuentes por sí solas. | Las fuentes se incrustan en el sitio web; no se comercializan de forma aislada. |
| 2. Los archivos originales o derivados deben distribuirse con esta licencia y la nota de copyright. | Los paquetes `@fontsource/*` incluyen el archivo `LICENSE` (OFL 1.1) en `node_modules`; no se modifican los archivos de fuente. |
| 3. No usar el nombre reservado (Reserved Font Name) en derivados sin permiso. | DC Bikes **no** crea versiones derivadas ni renombra las fuentes. |
| 4. Los derivados deben distribuirse bajo OFL. | No procede: no se generan derivados. |

> **Nota legal**: la OFL **no exige** mostrar una atribución visible en la propia página web. Sin embargo, mantener la atribución es una buena práctica y, en el caso de Bebas Neue, Dharma Type **recomienda** acreditar al autor.

---

## 4 · Atribución recomendada

Aunque no es obligatoria en la interfaz pública, se recomienda incluir la siguiente atribución en este documento, en los créditos del proyecto o en un archivo `THIRD-PARTY-NOTICES`:

```
Bebas Neue — © Ryoichi Tsunekawa (Dharma Type). SIL Open Font License 1.1.
Barlow — © Jeremy Tribby. SIL Open Font License 1.1.
Texto de la licencia: https://openfontlicense.org/open-font-license-official-text/
```

---

## 5 · Verificación

Para confirmar que las copias de licencia siguen presentes tras una reinstalación de dependencias:

```bash
# Comprobar la licencia OFL incluida en cada paquete
ls node_modules/@fontsource/bebas-neue/LICENSE
ls node_modules/@fontsource/barlow/LICENSE
```

Si alguno de los archivos `LICENSE` faltara, no redistribuir el bundle hasta restaurarlo, ya que la condición 2 de la OFL exige conservar la nota de copyright y la licencia junto a los archivos de fuente.

---

**Versión 2026-05-27 V5 · Hallazgo F-23 · Bebas Neue + Barlow bajo SIL OFL 1.1 · autohospedadas vía @fontsource**
