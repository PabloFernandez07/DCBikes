// scripts/rebuild-images-xlsx.mjs
//
// Reconstruye Docs/Productos_imagenes.xlsx a partir de la caché de imágenes
// (Docs/.image-harvest-cache.json) que se va rellenando manualmente o por
// el harvester. 1 fila por producto del catálogo, columnas Imagen_1..N con
// URLs distintas. No necesita ninguna API: solo lee la caché.
//
// USO:  node scripts/rebuild-images-xlsx.mjs

import XLSX from 'xlsx'
import { readFileSync, existsSync } from 'node:fs'

const SRC = 'Docs/Productos_importar_ADAPTADO.xlsx'
const OUT = 'Docs/Productos_imagenes.xlsx'
const CACHE = 'Docs/.image-harvest-cache.json'
const MAX_IMAGES = 10

const wb = XLSX.readFile(SRC)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Productos'] ?? wb.Sheets[wb.SheetNames[0]], { defval: '' })
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}

const catalog = rows.map((r) => ({
  nombre: String(r['Nombre'] ?? r['Nombre Artículo'] ?? '').trim(),
  familia: String(r['Familia'] ?? '').trim(),
  ean: String(r['EAN'] ?? '').trim(),
}))
const cacheKey = (p) => `${p.nombre}__${p.ean}`

const header = ['Nombre', 'Familia', 'EAN', 'NumImagenes']
for (let i = 1; i <= MAX_IMAGES; i++) header.push(`Imagen_${i}`)

const out = catalog.map((p) => {
  const c = cache[cacheKey(p)]
  const imgs = (c?.images ?? []).map((x) => (typeof x === 'string' ? x : x.url)).filter(Boolean)
  const row = { Nombre: p.nombre, Familia: p.familia, EAN: p.ean, NumImagenes: imgs.length }
  for (let i = 0; i < MAX_IMAGES; i++) row[`Imagen_${i + 1}`] = imgs[i] ?? ''
  return row
})

const ws = XLSX.utils.json_to_sheet(out, { header })
ws['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 14 }, { wch: 6 }, ...Array(MAX_IMAGES).fill({ wch: 62 })]
const owb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(owb, ws, 'Imagenes')
XLSX.writeFile(owb, OUT)

const withImg = out.filter((r) => r.NumImagenes > 0).length
console.log(`OK -> ${OUT} · ${out.length} filas · con imagen: ${withImg}`)
