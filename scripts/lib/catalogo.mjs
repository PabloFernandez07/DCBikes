/**
 * Catálogo para los scripts de build (sitemap y prerender).
 *
 * POR QUÉ EXISTE ESTE FICHERO: el sitemap y la ficha elegían el representante de
 * un grupo de tallas con criterios DISTINTOS —el sitemap alfabéticamente por
 * nombre, la app por orden de talla (useProductGroup.ts)—, así que en un grupo
 * S/M/L el sitemap mandaba a Google la variante "L" y esa página se
 * canonicalizaba a la "S", que no estaba en el sitemap. Google lo lee como
 * "URL enviada no seleccionada como canónica" y la excluye. Con un único sitio
 * donde se decide el representante, sitemap y canonical no pueden discrepar.
 *
 * `elegirRepresentante` DEBE seguir dando el mismo resultado que
 * `sortVariantsBySize` de src/hooks/useProductGroup.ts. Si cambia allí, cambia
 * aquí (no se puede importar: aquello es TS del bundle y esto corre en Node).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORDEN_TALLA_LETRA = { XXS: 0, XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7 }

/** Espejo de sortVariantsBySize (useProductGroup.ts): letras, números, otras, sin talla. */
export function ordenarPorTalla(variantes) {
  const letras = []
  const numeros = []
  const otras = []
  const sinTalla = []

  for (const v of variantes) {
    const t = v.size_label?.trim().toUpperCase()
    if (!t) sinTalla.push(v)
    else if (t in ORDEN_TALLA_LETRA) letras.push(v)
    else if (/^\d+(\.\d+)?$/.test(t)) numeros.push(v)
    else otras.push(v)
  }

  letras.sort((a, b) => ORDEN_TALLA_LETRA[(a.size_label ?? '').toUpperCase()] - ORDEN_TALLA_LETRA[(b.size_label ?? '').toUpperCase()])
  numeros.sort((a, b) => parseFloat(a.size_label ?? '0') - parseFloat(b.size_label ?? '0'))
  otras.sort((a, b) => (a.size_label ?? '').localeCompare(b.size_label ?? '', 'es'))

  return [...letras, ...numeros, ...otras, ...sinTalla]
}

/** El representante de un grupo es el primero por orden de talla, igual que el `parent` de la ficha. */
export function elegirRepresentante(grupo) {
  return ordenarPorTalla(grupo)[0] ?? grupo[0]
}

/**
 * Mete .env.local en process.env si las variables no vienen ya del entorno.
 *
 * Vite carga .env.local para el bundle, pero NO para los scripts de Node del
 * prebuild/postbuild: corren en otro proceso. Por eso un `npm run build` en
 * local se quedaba sin credenciales y reescribía el sitemap con 15 URLs en vez
 * de 129, sobre un fichero versionado. En Vercel no hace nada (las variables ya
 * están en el entorno) y jamás pisa una variable existente.
 */
function cargarEnvLocal() {
  if (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) return
  const ruta = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local')
  if (!existsSync(ruta)) return
  for (const linea of readFileSync(ruta, 'utf-8').split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (!m) continue
    const valor = m[2].trim().replace(/^["'](.*)["']$/, '$1')
    if (!(m[1] in process.env)) process.env[m[1]] = valor
  }
}

const COLUMNAS =
  'slug,name,brand,short_description,description,retail_price,discount_percent,stock,ean,sku,' +
  'is_second_hand,is_purchasable,model_group,size_label,' +
  'product_images(storage_path,alt,sort_order),categories(name,slug)'

/**
 * Trae los productos activos y devuelve UNA entrada por URL indexable: el
 * representante de cada grupo de tallas más los productos sueltos.
 *
 * `obligatorio` (true en CI/Vercel) hace que un fallo REVIENTE el build en vez
 * de devolver una lista vacía. Es deliberado: degradar en silencio aquí
 * significaba publicar un sitemap con 113 URLs menos, o —peor, desde que el
 * fallback de la SPA es noindex— desindexar el catálogo entero sin que salte
 * ninguna alarma. Más vale un deploy fallido que quedarse fuera de Google, que
 * el deploy anterior sigue sirviendo mientras tanto.
 */
export async function traerCatalogo({ obligatorio = false } = {}) {
  cargarEnvLocal()
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  const rendirse = (motivo) => {
    if (obligatorio) {
      console.error(`\n❌  catálogo: ${motivo}`)
      console.error('    Este build es de CI/producción y NO puede publicarse sin las fichas.')
      console.error('    Revisa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en el entorno.\n')
      process.exit(1)
    }
    console.warn(`catálogo: ${motivo} → sigo sin fichas de producto (build local)`)
    return { productos: [], baseImagenes: '' }
  }

  if (!url || !key) return rendirse('sin credenciales de Supabase')

  let filas
  try {
    const res = await fetch(
      `${url}/rest/v1/products?select=${encodeURIComponent(COLUMNAS)}&active=eq.true&order=name`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    )
    if (!res.ok) return rendirse(`la API respondió ${res.status}`)
    filas = await res.json()
  } catch (err) {
    return rendirse(`error de red → ${String(err)}`)
  }

  if (!Array.isArray(filas) || filas.length === 0) return rendirse('la API devolvió 0 productos activos')

  const grupos = new Map()
  const sueltos = []
  for (const p of filas) {
    if (!p.slug) continue
    if (p.model_group && p.model_group.trim()) {
      const g = grupos.get(p.model_group) ?? []
      g.push(p)
      grupos.set(p.model_group, g)
    } else {
      sueltos.push(p)
    }
  }

  const productos = [...[...grupos.values()].map(elegirRepresentante), ...sueltos]
  // Orden estable por slug: así dos builds seguidos generan el sitemap y las
  // rutas en el mismo orden y los diffs no salen revueltos.
  productos.sort((a, b) => a.slug.localeCompare(b.slug, 'es'))

  return { productos, baseImagenes: `${url}/storage/v1/object/public/product-images/` }
}

/** URL pública de la primera imagen del producto, o null si no tiene. */
export function portadaDe(producto, baseImagenes) {
  const imgs = producto.product_images ?? []
  if (!imgs.length || !baseImagenes) return null
  const primera = [...imgs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]
  return primera?.storage_path ? baseImagenes + primera.storage_path : null
}

/** Precio final aplicando el descuento, igual que ProductDetail.tsx:138. */
export function precioFinal(p) {
  const pct = p.discount_percent
  return pct != null && pct > 0 ? p.retail_price * (1 - pct / 100) : p.retail_price
}
