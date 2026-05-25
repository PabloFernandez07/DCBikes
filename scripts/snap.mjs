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

// Permite saltar snap explícitamente (útil en Vercel/CI donde Chromium puede no estar disponible)
if (process.env.SKIP_SNAP === '1' || process.env.VERCEL === '1') {
  console.log('\n📸 Snap saltado (entorno CI/Vercel). dist/ contiene HTMLs con meta tags pero sin DOM real.\n')
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

  const rootHtml = await page.evaluate(() => {
    const root = document.querySelector('#root')
    return root ? root.innerHTML : ''
  })

  return rootHtml
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
  for (const route of ROUTES) {
    const targetPath = join(dist, route.file)
    if (!existsSync(targetPath)) {
      console.log(`  ⚠  ${route.path.padEnd(15)} → no existe ${route.file}, saltando`)
      continue
    }

    const rootHtml = await captureRoute(page, route)
    if (!rootHtml || rootHtml.length < 100) {
      console.log(`  ⚠  ${route.path.padEnd(15)} → root vacío o muy pequeño (${rootHtml.length} bytes), no se sustituye`)
      continue
    }

    const original = readFileSync(targetPath, 'utf-8')
    const patched = injectRoot(original, rootHtml)
    writeFileSync(targetPath, patched, 'utf-8')

    const kb = (rootHtml.length / 1024).toFixed(1)
    totalKb += parseFloat(kb)
    console.log(`  ✓  ${route.path.padEnd(15)} → ${kb} KB de HTML inyectados`)
  }

  console.log(`\n✅  ${ROUTES.length} rutas con DOM real capturado (${totalKb.toFixed(1)} KB total).\n`)
} finally {
  await browser.close()
  server.close()
}
