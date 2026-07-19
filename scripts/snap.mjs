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
import { execSync } from 'node:child_process'
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
  // `networkidle0` NO sirve aquí: la portada se descarga un MP4 de 9,4 MB y
  // mantiene peticiones abiertas, así que la espera se iba a los 30 s y
  // reventaba con TimeoutError. Y hasta ahora ESE era el mecanismo real por el
  // que la captura acababa esperando a la pantalla de carga — por accidente.
  // Se sustituye por lo que de verdad importa, que además es explícito y más
  // rápido: DOM listo -> React ha montado -> la cortina se ha ido.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Esperar a que React monte algo dentro del root (cualquier elemento)
  await page.waitForFunction(
    () => document.querySelector('#root')?.children.length > 0,
    { timeout: 15000 },
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

// ─── Arranque del navegador, con escalada y diagnóstico ───────────────────────
//
// En el contenedor de build de Vercel esto falla, y el mensaje de puppeteer
// ("Failed to launch the browser process: Code: 127") NO dice por qué. 127 es el
// código con el que el shell responde "no pude ejecutar el binario", y en un
// contenedor pelado casi siempre significa que faltan librerías de sistema —
// pero también podría ser que el binario no esté o no tenga permiso de
// ejecución, y confundirlos cuesta un ciclo de deploy por cada suposición.
//
// Así que este bloque NO adivina: mide (ldd + ejecutar el binario a pelo para
// leer su stderr de verdad), deja el diagnóstico en el log del build, y escala
// de lo más barato a lo más caro. Todos los caminos acaban en exit 0: un snap
// que no arranca deja el HTML con solo meta tags, que es lo que ya había.

function correr(cmd, { timeout = 180000 } = {}) {
  try {
    return { ok: true, salida: execSync(cmd, { encoding: 'utf-8', stdio: 'pipe', timeout }) }
  } catch (e) {
    return { ok: false, salida: [e.stdout, e.stderr, e.message].filter(Boolean).join('\n') }
  }
}

const recorta = (s, n = 400) => (s || '').trim().split('\n').slice(0, 6).join('\n     ').slice(0, n)

/** Instala un navegador de puppeteer y devuelve su ruta (la imprime al instalar). */
function instalarNavegador(nombre) {
  const r = correr(`npx --yes puppeteer browsers install ${nombre}`)
  console.log(`   install ${nombre}: ${r.ok ? 'ok' : 'FALLÓ'}`)
  if (!r.ok) { console.log(`     ${recorta(r.salida)}`); return null }
  // Formato de salida: "chrome@148.0.7778.97 /ruta/al/chrome". Se corta por el
  // PRIMER espacio tras el "nombre@version", no por el último: en Windows la
  // ruta lleva espacios ("...\Skills Claude\...") y un split(/\s+/).pop() se
  // quedaba con el último trozo del nombre de carpeta.
  const linea = r.salida.trim().split('\n').map(l => l.trim()).reverse().find(l => /^\S+@\S+\s+\S/.test(l))
  const ruta = linea ? linea.replace(/^\S+@\S+\s+/, '').trim() : null
  console.log(`     -> ${ruta ?? '(no pude extraer la ruta)'}`)
  return ruta
}

function diagnosticar(ruta) {
  console.log('\n   ── diagnóstico del entorno ─────────────────────────')
  console.log(`   uid: ${correr('id -u').salida.trim()}  (0 = root, hace falta para instalar paquetes)`)
  console.log(`   gestor: ${correr('command -v dnf || command -v yum || echo NINGUNO').salida.trim()}`)
  if (ruta) {
    console.log(`   binario: ${ruta}`)
    console.log(`   existe: ${existsSync(ruta)}`)
    const ldd = correr(`ldd ${JSON.stringify(ruta)}`)
    const faltan = [...new Set(
      ldd.salida.split('\n').filter(l => /not found/.test(l))
        .map(l => l.trim().split(/\s+/)[0]),
    )]
    console.log(faltan.length
      ? `   librerías QUE FALTAN (${faltan.length}): ${faltan.join(' ')}`
      : `   ldd: ninguna marcada "not found"${ldd.ok ? '' : ' (ldd falló: ' + recorta(ldd.salida, 120) + ')'}`)
    // El stderr de verdad sale ejecutando el binario, no a través de puppeteer.
    const v = correr(`${JSON.stringify(ruta)} --version`, { timeout: 30000 })
    console.log(`   --version: ${v.ok ? v.salida.trim() : 'FALLA -> ' + recorta(v.salida, 300)}`)
    console.log('   ────────────────────────────────────────────────────\n')
    return faltan
  }
  console.log('   ────────────────────────────────────────────────────\n')
  return []
}

/**
 * Paquetes de sistema para que arranque el Chrome headless de puppeteer.
 *
 * MEDIDO en el build de Vercel (Amazon Linux 2023, uid 0, /usr/bin/dnf), no
 * supuesto: `ldd` sobre el binario solo daba CUATRO librerías por "not found" —
 * libnspr4.so, libnss3.so, libnssutil3.so y libsmime3.so — y las cuatro salen de
 * `nss` y `nspr`. El resto de la imagen ya trae lo que Chrome pide.
 *
 * Por eso se prueba primero el par mínimo. No es por los ~14 s que se ahorran,
 * es por FRAGILIDAD: `dnf install` falla ENTERO si uno solo de los nombres no
 * existe en el repo, así que una lista de 22 son 22 formas de romperse el día
 * que Amazon renombre un paquete. La lista larga queda de red por si otra imagen
 * de build pide más cosas; si se llega a usar, el log lo dirá.
 */
const PAQUETES_MINIMOS = 'nss nspr'
const PAQUETES_AMPLIOS = [
  'nss', 'nspr', 'atk', 'at-spi2-atk', 'at-spi2-core', 'cups-libs', 'libdrm',
  'libX11', 'libXcomposite', 'libXdamage', 'libXext', 'libXfixes', 'libXrandr',
  'libXi', 'libxcb', 'libxkbcommon', 'mesa-libgbm', 'pango', 'cairo',
  'alsa-lib', 'expat', 'dbus-libs',
].join(' ')

function instalarPaquetes(lista) {
  console.log(`   dnf install -y ${lista}`)
  const r = correr(`dnf install -y ${lista} 2>&1 || yum install -y ${lista} 2>&1`)
  console.log(`   resultado: ${r.ok ? 'ok' : 'FALLÓ'}\n     ${recorta(r.salida, 400)}`)
  return r.ok
}

const lanzar = (opciones = {}) => puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  ...opciones,
})

let browser
let rutaChrome = null
try { rutaChrome = puppeteer.executablePath() } catch { /* aún no instalado */ }

const intentos = [
  {
    nombre: 'chrome tal cual',
    run: async () => lanzar(),
  },
  {
    nombre: 'descargar chrome y reintentar',
    run: async () => {
      const r = instalarNavegador('chrome')
      if (r) rutaChrome = r
      return lanzar()
    },
  },
  {
    nombre: 'instalar nss+nspr (dnf) y reintentar',
    run: async () => {
      const faltan = diagnosticar(rutaChrome)
      if (!faltan.length) console.log('   (ldd no señala nada; se instala igual por si el fallo es de otro tipo)')
      instalarPaquetes(PAQUETES_MINIMOS)
      return lanzar()
    },
  },
  {
    nombre: 'instalar la lista amplia de librerías y reintentar',
    run: async () => {
      // Solo se llega aquí si esta imagen de build pide más que nss+nspr. Si
      // aparece en el log, hay que mirar qué librerías da ldd por "not found"
      // arriba y ajustar PAQUETES_MINIMOS.
      diagnosticar(rutaChrome)
      instalarPaquetes(PAQUETES_AMPLIOS)
      return lanzar()
    },
  },
  {
    nombre: 'chrome-headless-shell (binario mínimo)',
    run: async () => {
      const ruta = instalarNavegador('chrome-headless-shell')
      if (!ruta) throw new Error('no se pudo instalar chrome-headless-shell')
      diagnosticar(ruta)
      return lanzar({ executablePath: ruta, headless: 'shell' })
    },
  },
]

for (const intento of intentos) {
  try {
    console.log(`▶ intento: ${intento.nombre}`)
    browser = await intento.run()
    console.log(`✔ ARRANCÓ con: ${intento.nombre}\n`)
    break
  } catch (err) {
    console.warn(`✘ ${intento.nombre} -> ${err.message.split('\n')[0]}`)
  }
}

if (!browser) {
  diagnosticar(rutaChrome)
  console.warn('\n⚠️  Ningún intento arrancó el navegador.')
  console.warn('   Snap saltado. dist/ contiene HTMLs con meta tags pero sin DOM real')
  console.warn('   (exactamente lo que había antes: esto no rompe nada).\n')
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

    // Una ruta que peta NO puede tumbar el deploy: se queda sin cuerpo y ya.
    // Sin esto, un TimeoutError de page.goto salía del bucle, del try/finally y
    // del proceso con código != 0, y Vercel lo daba por build fallido.
    let rootHtml = '', motivo = null
    try {
      ({ html: rootHtml, motivo } = await captureRoute(page, route))
    } catch (err) {
      motivo = `error capturando (${err.message.split('\n')[0].slice(0, 80)})`
    }
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
} catch (err) {
  // Red de seguridad final. El snap es una MEJORA sobre un HTML que ya es
  // válido: si algo aquí explota, el deploy debe seguir adelante con el HTML de
  // solo meta tags. Que un adorno tumbe una publicación es peor que no tenerlo.
  console.warn(`\n⚠️  Snap abortado por un error inesperado: ${String(err).split('\n')[0]}`)
  console.warn('   El deploy sigue: dist/ conserva los HTML con meta tags.\n')
} finally {
  await browser.close().catch(() => {})
  server.close()
}
process.exit(0)
