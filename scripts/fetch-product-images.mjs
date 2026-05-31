// scripts/fetch-product-images.mjs
//
// Recorre el catálogo y busca, por cada producto, todas las imágenes posibles
// (URLs distintas) usando un buscador de imágenes real. Vuelca un Excel con
// 1 fila por producto y columnas Imagen_1..Imagen_N.
//
// PROVEEDORES (elige uno, vía variables de entorno):
//   • Google Custom Search (recomendado, gratis 100/día):
//       GOOGLE_CSE_KEY=...   (API key de Google Cloud, API "Custom Search API")
//       GOOGLE_CSE_CX=...    (ID del buscador en https://programmablesearchengine.google.com,
//                             con "Buscar en toda la web" + "Búsqueda de imágenes" ON)
//   • SerpAPI (de pago, más cobertura):
//       SERPAPI_KEY=...
//
// USO:
//   GOOGLE_CSE_KEY=xxx GOOGLE_CSE_CX=yyy node scripts/fetch-product-images.mjs
//   node scripts/fetch-product-images.mjs --limit 50        (solo los primeros 50)
//   node scripts/fetch-product-images.mjs --start 100 --limit 100
//   node scripts/fetch-product-images.mjs --stock           (solo productos con stock>0)
//
// Es REANUDABLE: guarda lo encontrado en Docs/.image-harvest-cache.json. Si se
// agota la cuota diaria, vuelve a ejecutarlo mañana y continúa donde lo dejó.

import XLSX from 'xlsx'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SRC = 'Docs/Productos_importar_ADAPTADO.xlsx'
const OUT = 'Docs/Productos_imagenes.xlsx'
const CACHE = 'Docs/.image-harvest-cache.json'
const MAX_IMAGES = 10            // columnas Imagen_1..Imagen_10
const THROTTLE_MS = 250          // pausa entre llamadas a la API
const MIN_BEFORE_EAN = 4         // si la búsqueda por nombre da menos, prueba por EAN

// ── Args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
const START = parseInt(getArg('--start') ?? '0', 10)
const LIMIT = getArg('--limit') ? parseInt(getArg('--limit'), 10) : Infinity
const ONLY_STOCK = args.includes('--stock')

// ── Proveedor ────────────────────────────────────────────────────────────────
const GOOGLE_KEY = process.env.GOOGLE_CSE_KEY
const GOOGLE_CX = process.env.GOOGLE_CSE_CX
const SERPAPI_KEY = process.env.SERPAPI_KEY

const provider = GOOGLE_KEY && GOOGLE_CX ? 'google' : SERPAPI_KEY ? 'serpapi' : null
if (!provider) {
  console.error(`
❌ Falta configurar un proveedor de búsqueda de imágenes.

  Opción A (Google, gratis 100/día):
    1) Crea un proyecto en https://console.cloud.google.com y activa "Custom Search API".
    2) Crea una API key.
    3) Crea un buscador en https://programmablesearchengine.google.com
       → activa "Buscar en toda la web" y "Búsqueda de imágenes". Copia el ID (cx).
    4) Ejecuta:
       GOOGLE_CSE_KEY=tu_key GOOGLE_CSE_CX=tu_cx node scripts/fetch-product-images.mjs

  Opción B (SerpAPI, de pago):
    SERPAPI_KEY=tu_key node scripts/fetch-product-images.mjs
`)
  process.exit(1)
}

// ── Utilidades ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Clave de dedupe: sin querystring, en minúsculas. Evita duplicar la misma
// imagen servida con distintos parámetros de tamaño.
function dedupeKey(url) {
  try {
    const u = new URL(url)
    return (u.origin + u.pathname).toLowerCase()
  } catch {
    return url.toLowerCase().split('?')[0]
  }
}

function cleanQuery(name) {
  return name.replace(/\s+/g, ' ').trim()
}

// ── Búsqueda por proveedor ────────────────────────────────────────────────────
async function searchGoogle(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_KEY}&cx=${GOOGLE_CX}&searchType=image&num=10&q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (res.status === 429 || res.status === 403) {
    const body = await res.text()
    throw Object.assign(new Error('quota'), { quota: true, body })
  }
  if (!res.ok) throw new Error(`Google CSE HTTP ${res.status}`)
  const json = await res.json()
  return (json.items ?? []).map((it) => ({ url: it.link, source: it.displayLink ?? '' }))
}

async function searchSerpapi(query) {
  const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`SerpAPI HTTP ${res.status}`)
  const json = await res.json()
  return (json.images_results ?? []).map((it) => ({ url: it.original, source: it.source ?? '' }))
}

const search = provider === 'google' ? searchGoogle : searchSerpapi

// Recoge imágenes distintas para un producto (nombre + fallback por EAN).
async function harvest(name, ean) {
  const seen = new Set()
  const images = []
  const pushAll = (results) => {
    for (const r of results) {
      if (!r.url || !/^https?:\/\//i.test(r.url)) continue
      const k = dedupeKey(r.url)
      if (seen.has(k)) continue
      seen.add(k)
      images.push(r)
      if (images.length >= MAX_IMAGES) break
    }
  }

  pushAll(await search(cleanQuery(name)))
  await sleep(THROTTLE_MS)

  if (images.length < MIN_BEFORE_EAN && ean) {
    try {
      pushAll(await search(String(ean).trim()))
      await sleep(THROTTLE_MS)
    } catch (e) {
      if (e.quota) throw e
    }
  }
  return images.slice(0, MAX_IMAGES)
}

// ── Carga catálogo + caché ─────────────────────────────────────────────────────
const wb = XLSX.readFile(SRC)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Productos'] ?? wb.Sheets[wb.SheetNames[0]], { defval: '' })

let catalog = rows.map((r, i) => ({
  idx: i,
  nombre: String(r['Nombre'] ?? r['Nombre Artículo'] ?? '').trim(),
  familia: String(r['Familia'] ?? '').trim(),
  ean: String(r['EAN'] ?? '').trim(),
  stock: Math.max(0, Math.trunc(Number(r['Stock']) || 0)),
}))
if (ONLY_STOCK) catalog = catalog.filter((p) => p.stock > 0)

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
const cacheKey = (p) => `${p.nombre}__${p.ean}`

// ── Bucle principal ─────────────────────────────────────────────────────────────
const slice = catalog.slice(START, START + (LIMIT === Infinity ? catalog.length : LIMIT))
console.log(`Proveedor: ${provider} · productos a procesar: ${slice.length} (de ${catalog.length})`)

let processed = 0
let quotaHit = false
for (const p of slice) {
  const key = cacheKey(p)
  if (cache[key]) { processed++; continue } // ya cacheado → saltar
  if (!p.nombre) { continue }
  try {
    const imgs = await harvest(p.nombre, p.ean)
    cache[key] = { nombre: p.nombre, familia: p.familia, ean: p.ean, images: imgs }
    processed++
    if (processed % 10 === 0) {
      writeFileSync(CACHE, JSON.stringify(cache))
      console.log(`  ${processed}/${slice.length} — última: "${p.nombre}" (${imgs.length} imgs)`)
    }
  } catch (e) {
    if (e.quota) {
      console.warn(`\n⚠ Cuota diaria agotada tras ${processed} productos. Progreso guardado. Reanuda mañana con el mismo comando.`)
      quotaHit = true
      break
    }
    console.warn(`  ! error en "${p.nombre}": ${e.message}`)
    cache[key] = { nombre: p.nombre, familia: p.familia, ean: p.ean, images: [] }
  }
}
writeFileSync(CACHE, JSON.stringify(cache))

// ── Escribir Excel (1 fila por producto) ─────────────────────────────────────────
const header = ['Nombre', 'Familia', 'EAN', 'NumImagenes']
for (let i = 1; i <= MAX_IMAGES; i++) header.push(`Imagen_${i}`)

const out = catalog.map((p) => {
  const c = cache[cacheKey(p)]
  const imgs = (c?.images ?? []).map((x) => x.url)
  const row = {
    Nombre: p.nombre,
    Familia: p.familia,
    EAN: p.ean,
    NumImagenes: imgs.length,
  }
  for (let i = 0; i < MAX_IMAGES; i++) row[`Imagen_${i + 1}`] = imgs[i] ?? ''
  return row
})

const outWs = XLSX.utils.json_to_sheet(out, { header })
outWs['!cols'] = [{ wch: 42 }, { wch: 20 }, { wch: 15 }, { wch: 6 }, ...Array(MAX_IMAGES).fill({ wch: 60 })]
const outWb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(outWb, outWs, 'Imagenes')
XLSX.writeFile(outWb, OUT)

const withImg = out.filter((r) => r.NumImagenes > 0).length
console.log(`\nOK -> ${OUT}`)
console.log(`Productos en el Excel: ${out.length} · con al menos 1 imagen: ${withImg}`)
if (quotaHit) console.log('(Faltan productos por cuota — reanuda y se completarán.)')
