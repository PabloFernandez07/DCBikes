// scripts/_merge-images.mjs — helper de uso interno.
// Lee Docs/_img-batch.json = { "<substr del nombre>": ["url1","url2",...], ... }
// y mergea en Docs/.image-harvest-cache.json (empareja por coincidencia de
// nombre en Productos_importar_ADAPTADO.xlsx). Luego: node scripts/rebuild-images-xlsx.mjs
import XLSX from 'xlsx'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SRC = 'Docs/Productos_importar_ADAPTADO.xlsx'
const CACHE = 'Docs/.image-harvest-cache.json'
const BATCH = process.argv[2] || 'Docs/_img-batch.json'

const wb = XLSX.readFile(SRC)
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Productos'], { defval: '' })
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
const batch = JSON.parse(readFileSync(BATCH, 'utf8'))
const key = (r) => `${String(r.Nombre).trim()}__${String(r.EAN).trim()}`

let ok = 0, miss = 0
for (const [substr, urls] of Object.entries(batch)) {
  const r = rows.find((x) => String(x.Nombre).toUpperCase() === substr.toUpperCase())
        || rows.find((x) => String(x.Nombre).toUpperCase().includes(substr.toUpperCase()))
  if (!r) { console.log('  NO MATCH:', substr); miss++; continue }
  const seen = new Set()
  const imgs = []
  for (const u of urls) {
    const k = u.split('?')[0].toLowerCase()
    if (seen.has(k)) continue
    seen.add(k); imgs.push({ url: u, source: 'web' })
  }
  cache[key(r)] = { nombre: r.Nombre, familia: r.Familia, ean: String(r.EAN), images: imgs }
  console.log('  OK:', r.Nombre, '=>', imgs.length)
  ok++
}
writeFileSync(CACHE, JSON.stringify(cache))
console.log(`Merge: ${ok} ok, ${miss} sin match. Total cache: ${Object.keys(cache).length}`)
