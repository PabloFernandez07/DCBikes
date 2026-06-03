// Genera el formulario oficial UE de desistimiento (Anexo B Directiva 2011/83/UE)
// como PDF en public/devoluciones-formulario.pdf.
//
// Ejecutar puntualmente: `node scripts/generate-returns-pdf.mjs`
// No se incluye en el build automático.

import puppeteer from 'puppeteer'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const outPath = path.resolve(__dirname, '..', 'public', 'devoluciones-formulario.pdf')

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Formulario de desistimiento — DC Bikes Cantabria</title>
<style>
  @page { size: A4; margin: 25mm; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #111;
    font-size: 11.5pt;
    line-height: 1.55;
  }
  h1 {
    font-size: 16pt;
    text-align: center;
    margin: 0 0 4pt 0;
    letter-spacing: 0.5pt;
  }
  .subtitle {
    text-align: center;
    font-size: 10pt;
    color: #555;
    margin-bottom: 22pt;
    font-style: italic;
  }
  .recipient {
    margin-bottom: 18pt;
    padding: 10pt 12pt;
    border-left: 3pt solid #333;
    background: #f5f5f5;
    font-size: 11pt;
  }
  .recipient strong { display: block; margin-bottom: 4pt; }
  .field {
    margin: 10pt 0;
  }
  .field-label {
    font-weight: bold;
    font-size: 10.5pt;
    margin-bottom: 2pt;
  }
  .field-line {
    border-bottom: 1pt solid #444;
    height: 14pt;
    margin-top: 2pt;
  }
  .field-line-double {
    border-bottom: 1pt solid #444;
    height: 14pt;
    margin-top: 2pt;
    margin-bottom: 6pt;
  }
  .notes {
    margin-top: 22pt;
    font-size: 9.5pt;
    color: #555;
    border-top: 1pt solid #ccc;
    padding-top: 8pt;
  }
  .footer {
    margin-top: 30pt;
    text-align: center;
    font-size: 8.5pt;
    color: #888;
  }
</style>
</head>
<body>
  <h1>FORMULARIO DE DESISTIMIENTO</h1>
  <p class="subtitle">
    Anexo B · Directiva 2011/83/UE — transpuesto al art. 102 y ss. del Real Decreto Legislativo 1/2007
  </p>

  <div class="recipient">
    <strong>A la atención de:</strong>
    DC Bikes Cantabria<br />
    C. la Cantábrica, bloque 2 n, 1 BAJO<br />
    39610 El Astillero · Cantabria · España<br />
    Correo electrónico: info@dcbikescantabria.com
  </div>

  <p>
    Por la presente le comunico/comunicamos<sup>(*)</sup> que desisto de mi/desistimos
    de nuestro<sup>(*)</sup> contrato de venta del siguiente bien/prestación del siguiente servicio<sup>(*)</sup>:
  </p>

  <div class="field">
    <div class="field-label">Número de pedido:</div>
    <div class="field-line"></div>
  </div>

  <div class="field">
    <div class="field-label">Producto(s):</div>
    <div class="field-line-double"></div>
    <div class="field-line"></div>
  </div>

  <div class="field">
    <div class="field-label">Pedido el<sup>(*)</sup> / recibido el<sup>(*)</sup>:</div>
    <div class="field-line"></div>
  </div>

  <div class="field">
    <div class="field-label">Nombre del consumidor o de los consumidores:</div>
    <div class="field-line"></div>
  </div>

  <div class="field">
    <div class="field-label">Domicilio del consumidor o de los consumidores:</div>
    <div class="field-line-double"></div>
    <div class="field-line"></div>
  </div>

  <div class="field">
    <div class="field-label">
      Firma del consumidor o de los consumidores (solo si el presente formulario se presenta en papel):
    </div>
    <div class="field-line" style="margin-top: 18pt;"></div>
  </div>

  <div class="field">
    <div class="field-label">Fecha:</div>
    <div class="field-line"></div>
  </div>

  <p class="notes">
    <sup>(*)</sup> Táchese lo que no proceda.
  </p>

  <div class="footer">
    DC Bikes Cantabria — Formulario oficial de desistimiento conforme al RDL 1/2007 y Directiva 2011/83/UE
  </div>
</body>
</html>`

const browser = await puppeteer.launch({ headless: 'new' })
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
  })
  console.log(`PDF generado en: ${outPath}`)
} finally {
  await browser.close()
}
