/**
 * Snap — captura el DOM renderizado de cada ruta y lo inyecta en los HTML pre-renderizados.
 *
 * Reemplaza `<div id="root"></div>` por el contenido real que produce React tras montar.
 * Crawlers básicos (Bing, Yandex, scrapers IA) ven contenido sin necesidad de ejecutar JS.
 *
 * Pipeline:
 *   1. Levanta un servidor HTTP estático sobre dist/ (puerto local)
 *   2. Abre Puppeteer (Chromium headless)
 *   3. Para cada ruta, navega → espera React → extrae #root.innerHTML
 *   4. Inyecta el HTML capturado en el dist/{ruta}/index.html (que ya tiene meta tags por prerender.mjs)
 *
 * Uso: node scripts/snap.mjs  (se llama automáticamente desde "npm run build")
 */

import http from 'node:http'
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Válvula de escape manual. YA NO se salta en Vercel: ese `|| VERCEL === '1'`
// significaba que la captura de DOM NUNCA había corrido en producción — se
// servían 12 KB con `<div id="root"></div>` vacío mientras en local eran 91 KB,
// así que las landings de SEO tenían meta tags perfectos y cero texto. Google
// renderiza JS y acababa viéndolas; Bing y los crawlers de IA, no.
//
// Si Chromium no arranca en el contenedor de build, más abajo se sale con
// exit 0: un snap fallido NO tumba el deploy, solo deja el HTML sin cuerpo,
// que es exactamente lo que había hasta ahora.
if (process.env.SKIP_SNAP === '1') {
  console.log('\n📸 Snap saltado (SKIP_SNAP=1). dist/ contiene HTMLs con meta tags pero sin DOM real.\n')
  process.exit(0)
}

let puppeteer
try {
  puppeteer = (await import('puppeteer')).default
} catch (err) {
  console.warn('\n⚠️  Puppeteer no disponible (¿olvidaste "pnpm install"?). Snap saltado, build continúa.\n')
  process.exit(0)
}

const __dir = dirname(fileURLToPath(import.meta.url))
const dist  = join(__dir, '..', 'dist')
const PORT  = 4789

const ROUTES = [
  { path: '/',            file: 'index.html' },
  { path: '/catalogo',    file: 'catalogo/index.html' },
  { path: '/taller',      file: 'taller/index.html' },
  { path: '/contacto',    file: 'contacto/index.html' },
  { path: '/aviso-legal', file: 'aviso-legal/index.html' },
  { path: '/privacidad',  file: 'privacidad/index.html' },
  { path: '/cookies',     file: 'cookies/index.html' },
  // Landings SEO
  { path: '/bicicletas-giant',                 file: 'bicicletas-giant/index.html' },
  { path: '/bicicletas-liv',                   file: 'bicicletas-liv/index.html' },
  { path: '/bicicletas-stevens',               file: 'bicicletas-stevens/index.html' },
  { path: '/bicicletas-electricas',            file: 'bicicletas-electricas/index.html' },
  { path: '/bicicletas-montana',               file: 'bicicletas-montana/index.html' },
  { path: '/bicicletas-carretera',             file: 'bicicletas-carretera/index.html' },
  { path: '/tienda-bicicletas-el-astillero',   file: 'tienda-bicicletas-el-astillero/index.html' },
  { path: '/tienda-bicicletas-santander',      file: 'tienda-bicicletas-santander/index.html' },
  { path: '/preguntas-frecuentes',             file: 'preguntas-frecuentes/index.html' },
]

const MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.avif':  'image/avif',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
  '.xml':   'application/xml; charset=utf-8',
  '.txt':   'text/plain; charset=utf-8',
}

// ─── Servidor estático con SPA fallback ───────────────────────────────────────

function serveStatic(req, res) {
  try {
    const url = decodeURIComponent(req.url.split('?')[0])
    let filePath = join(dist, url)

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
    if (!existsSync(filePath)) {
      // SPA fallback al index principal (que ya está pre-renderizado)
      filePath = join(dist, 'index.html')
    }

    const ext = extname(filePath).toLowerCase()
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
    res.end(readFileSync(filePath))
  } catch (err) {
    res.writeHead(500)
    res.end(String(err))
  }
}

// ─── Captura de DOM por ruta ──────────────────────────────────────────────────

async function captureRoute(page, route) {
  const url = `http://localhost:${PORT}${route.path}`
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 })
  // Esperar a que React monte algo dentro del root (cualquier elemento)
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length > 0,
    { timeout: 10000 },
  ).catch(() => {})

  // Pequeño respiro para animaciones de entrada y data fetching ligero
  await new Promise(r => setTimeout(r, 800))

  // Y AHORA lo que de verdad hay que esperar: que la pantalla de carga se haya
  // ido. Tapa la ventana entera, y en la portada se queda hasta que el hero
  // precarga su vídeo — bastante más de los 800 ms de arriba. Capturar con ella
  // puesta hornea la cortina en el HTML estático: el crawler vería una pantalla
  // de carga como TODO el contenido de la página, y el visitante se la comería
  // pintada antes de que React monte.
  //
  // El tope de 15 s cubre el peor caso del hero (12 s de su red de seguridad).
  await page.waitForFunction(() => !document.querySelector('[data-splash]'), { timeout: 15000 })
    .catch(() => {})

  const { html, conSplash } = await page.evaluate(() => {
    const root = document.querySelector('#root')
    return { html: root ? root.innerHTML : '', conSplash: !!document.querySelector('[data-splash]') }
  })

  // Si sigue ahí, se descarta la captura entera. Mejor quedarse con el HTML de
  // solo-meta —que es lo que había— que publicar una cortina como contenido.
  if (conSplash) return { html: '', motivo: 'la pantalla de carga seguía puesta' }
  return { html, motivo: null }
}

function injectRoot(html, rootHtml) {
  // Reemplazar el div vacío preservando atributos. Tolera espacios/saltos.
  return html.replace(
    /<div id="root">\s*<\/div>/,
    `<div id="root">${rootHtml}</div>`,
  )
}

// ─── Ejecución ────────────────────────────────────────────────────────────────

const basePath = join(dist, 'index.html')
if (!existsSync(basePath)) {
  console.error('❌  No se encontró dist/index.html. Ejecuta antes "vite build && node scripts/prerender.mjs".')
  process.exit(1)
}

const server = http.createServer(serveStatic)
await new Promise(resolve => server.listen(PORT, resolve))
console.log(`\n📸 Capturando DOM renderizado…`)
console.log(`   Servidor estático: http://localhost:${PORT}\n`)

let browser
try {
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
} catch (err) {
  console.warn(`\n⚠️  No se pudo lanzar Chromium: ${err.message.split('\n')[0]}`)
  console.warn(`   Snap saltado. dist/ contiene HTMLs con meta tags pero sin DOM real.\n`)
  server.close()
  process.exit(0)
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })

  let totalKb = 0
  let capturadas = 0
  const fallidas = []
  for (const route of ROUTES) {
    const targetPath = join(dist, route.file)
    if (!existsSync(targetPath)) {
      console.log(`  ⚠  ${route.path.padEnd(28)} → no existe ${route.file}, saltando`)
      fallidas.push(route.path)
      continue
    }

    const { html: rootHtml, motivo } = await captureRoute(page, route)
    if (motivo) {
      console.log(`  ⚠  ${route.path.padEnd(28)} → ${motivo}, NO se sustituye`)
      fallidas.push(route.path)
      continue
    }
    if (!rootHtml || rootHtml.length < 100) {
      console.log(`  ⚠  ${route.path.padEnd(28)} → root vacío o muy pequeño (${rootHtml.length} bytes), no se sustituye`)
      fallidas.push(route.path)
      continue
    }

    const original = readFileSync(targetPath, 'utf-8')
    const patched = injectRoot(original, rootHtml)
    writeFileSync(targetPath, patched, 'utf-8')

    const kb = (rootHtml.length / 1024).toFixed(1)
    totalKb += parseFloat(kb)
    capturadas++
    console.log(`  ✓  ${route.path.padEnd(28)} → ${kb} KB de HTML inyectados`)
  }

  // El contador dice las que SE CAPTURARON, no las que se intentaron. Antes
  // imprimía siempre ROUTES.length aunque se hubieran saltado la mitad, y esa
  // línea en verde es justo lo que hace que nadie mire el log.
  console.log(`\n✅  ${capturadas}/${ROUTES.length} rutas con DOM real capturado (${totalKb.toFixed(1)} KB total).`)
  if (fallidas.length) console.log(`   Sin cuerpo (solo meta tags): ${fallidas.join(', ')}`)
  console.log('')
} finally {
  await browser.close()
  server.close()
}
