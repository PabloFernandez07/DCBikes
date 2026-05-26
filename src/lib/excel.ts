/**
 * Importer del Excel real del cliente DC Bikes (Catálogo de 1.816 productos).
 *
 * Hoja esperada: `Catálogo` (con tilde). Si no existe, cae al primer sheet.
 * Cabeceras esperadas (fila 1): Nombre Artículo, Tipo, Familia, PVP c/IVA,
 * Coste s/IVA, Stock, EAN ... (otras columnas se ignoran).
 *
 * Reglas de import (Fase A del plan):
 *   - Tipo='Taller'                                  → active=false, is_purchasable=false
 *   - Familia='Alquiler' (sea cual sea el Tipo)      → active=false, is_purchasable=false
 *   - Tipo='Tienda' AND Familia!='Alquiler'          → active=true,  is_purchasable=false
 *     (admin lo activa producto a producto desde admin/products).
 *
 * Soporta dry-run: `analyzeWorkbook()` devuelve estadísticas sin escribir nada.
 * La persistencia real (insert/update vía Supabase) se hará en otra capa
 * (importer UI) consumiendo `ProductDraft[]` que producimos aquí.
 */

import * as XLSX from 'xlsx'
import { detectSize, slugify } from './excel-grouping'

// ─── Tipos públicos ─────────────────────────────────────────────────────────

export interface RawRow {
  [key: string]: string | number | null | undefined
}

/** Borrador de producto listo para insert/update en Supabase. */
export interface ProductDraft {
  // Identidad
  name: string
  slug: string
  ean: string | null
  sku: string | null
  // Catálogo
  category_name: string | null   // se resuelve a category_id en la capa de persistencia
  brand: string | null
  retail_price: number
  cost_price: number | null
  stock: number
  // Agrupación / talla
  size_label: string | null
  model_group: string | null
  // Visibilidad
  active: boolean
  is_purchasable: boolean
  // Diagnóstico
  source_row: number             // número de fila en el Excel (1-based, incluye cabecera)
  rule: 'letter_end' | 'number_end' | 'letter_mid' | 'talla_prefix' | 'none'
  errors: string[]
}

export interface ImportSummary {
  total_rows: number
  valid: number
  invalid: number
  by_type: Record<string, number>             // Tipo del Excel ("Tienda", "Taller", ...)
  by_family: Record<string, number>           // Familia (futuras categorías)
  active_count: number
  inactive_count: number
  with_size: number
  without_size: number
  groups: Array<{ model_group: string; variants: number; sample_name: string }>
  size_samples: Array<{ name: string; size_label: string; model_group: string | null; rule: string }>
  error_samples: Array<{ row: number; name: string; errors: string[] }>
  unique_categories: string[]
}

// ─── Lectura de fichero ─────────────────────────────────────────────────────

const SHEET_PREFERRED = ['Catálogo', 'Catalogo', 'CATÁLOGO', 'CATALOGO']

function pickSheetName(wb: XLSX.WorkBook): string {
  for (const candidate of SHEET_PREFERRED) {
    if (wb.SheetNames.includes(candidate)) return candidate
  }
  return wb.SheetNames[0]
}

export async function parseFile(file: File): Promise<RawRow[]> {
  const buf = await file.arrayBuffer()
  return parseArrayBuffer(buf)
}

export function parseArrayBuffer(buf: ArrayBuffer): RawRow[] {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const sheetName = pickSheetName(wb)
  const sheet = wb.Sheets[sheetName]

  // Algunos Excel del cliente tienen una fila-título antes de las cabeceras reales
  // ("Catálogo completo con cálculo de rentabilidad" ocupa la fila 1, cabeceras en fila 2).
  // Detectamos eso leyendo en modo "header:1" y buscando la primera fila que contenga
  // un token reconocible como cabecera.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null })
  const HEADER_TOKENS = ['Nombre Artículo', 'Nombre Articulo', 'Tipo', 'Familia', 'PVP c/IVA']
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(matrix.length, 10); i++) {
    const row = matrix[i] ?? []
    const asStrings = row.map((c) => (c == null ? '' : String(c).trim()))
    const hit = asStrings.some((cell) => HEADER_TOKENS.includes(cell))
    if (hit) { headerRowIdx = i; break }
  }

  return XLSX.utils.sheet_to_json<RawRow>(sheet, {
    defval: null,
    range: headerRowIdx, // sheet_to_json usa esta fila como cabecera
  })
}

// ─── Normalización de cabeceras ────────────────────────────────────────────

/** Resuelve el nombre real de la cabecera para una variante esperada. */
function findHeader(row: RawRow, candidates: string[]): string | null {
  const keys = Object.keys(row)
  for (const c of candidates) {
    // Exact match.
    const exact = keys.find((k) => k.trim() === c)
    if (exact) return exact
    // Case-insensitive + sin acentos match.
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const target = norm(c)
    const fuzzy = keys.find((k) => norm(k) === target)
    if (fuzzy) return fuzzy
  }
  return null
}

const HEADER_CANDIDATES = {
  name: ['Nombre Artículo', 'Nombre Articulo', 'Nombre', 'Artículo', 'Articulo'],
  type: ['Tipo'],
  family: ['Familia'],
  retail_price: ['PVP c/IVA', 'PVP', 'Precio'],
  cost_price: ['Coste s/IVA', 'Coste', 'Coste sin IVA'],
  stock: ['Stock', 'Existencias'],
  ean: ['EAN', 'Código EAN', 'Codigo EAN', 'EAN13'],
  sku: ['SKU', 'Referencia', 'Código', 'Codigo'],
  brand: ['Marca', 'Brand'],
}

interface HeaderMap {
  name: string | null
  type: string | null
  family: string | null
  retail_price: string | null
  cost_price: string | null
  stock: string | null
  ean: string | null
  sku: string | null
  brand: string | null
}

export function detectHeaders(rows: RawRow[]): HeaderMap {
  if (!rows.length) {
    return {
      name: null, type: null, family: null, retail_price: null, cost_price: null,
      stock: null, ean: null, sku: null, brand: null,
    }
  }
  const sample = rows[0]
  return {
    name:          findHeader(sample, HEADER_CANDIDATES.name),
    type:          findHeader(sample, HEADER_CANDIDATES.type),
    family:        findHeader(sample, HEADER_CANDIDATES.family),
    retail_price:  findHeader(sample, HEADER_CANDIDATES.retail_price),
    cost_price:    findHeader(sample, HEADER_CANDIDATES.cost_price),
    stock:         findHeader(sample, HEADER_CANDIDATES.stock),
    ean:           findHeader(sample, HEADER_CANDIDATES.ean),
    sku:           findHeader(sample, HEADER_CANDIDATES.sku),
    brand:         findHeader(sample, HEADER_CANDIDATES.brand),
  }
}

// ─── Coerciones ─────────────────────────────────────────────────────────────

function toStr(val: unknown): string | null {
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  return s === '' ? null : s
}

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return Number.isFinite(val) ? val : null
  const cleaned = String(val).replace(/[€\s]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

function toInt(val: unknown): number | null {
  const n = toNum(val)
  if (n === null) return null
  return Math.trunc(n)
}

// ─── Mapeo principal ────────────────────────────────────────────────────────

/**
 * Convierte filas crudas del Excel en `ProductDraft[]`.
 * No escribe en BD. Aplica reglas de visibilidad y heurística de tallas.
 */
export function mapRows(rows: RawRow[], headers?: HeaderMap): ProductDraft[] {
  const h = headers ?? detectHeaders(rows)
  const drafts: ProductDraft[] = []
  const slugCounter = new Map<string, number>()

  rows.forEach((row, idx) => {
    const sourceRow = idx + 2 // +1 por 1-based, +1 por cabecera
    const errors: string[] = []

    const name = h.name ? toStr(row[h.name]) : null
    if (!name) {
      // Fila vacía: la saltamos silenciosamente si TODO el resto también está vacío.
      const anyValue = Object.values(row).some((v) => v !== null && v !== '' && v !== undefined)
      if (!anyValue) return
      errors.push('Nombre vacío')
    }

    const type = h.type ? toStr(row[h.type]) : null
    const family = h.family ? toStr(row[h.family]) : null
    const retailPrice = h.retail_price ? toNum(row[h.retail_price]) : null
    const costPrice = h.cost_price ? toNum(row[h.cost_price]) : null
    const stock = h.stock ? (toInt(row[h.stock]) ?? 0) : 0
    const ean = h.ean ? toStr(row[h.ean]) : null
    const sku = h.sku ? toStr(row[h.sku]) : null
    const brand = h.brand ? toStr(row[h.brand]) : null

    if (retailPrice === null || retailPrice <= 0) {
      errors.push('PVP inválido o vacío')
    }

    // Reglas de visibilidad
    const typeUpper = (type ?? '').toUpperCase()
    const familyUpper = (family ?? '').toUpperCase()
    const isTaller = typeUpper === 'TALLER'
    const isAlquiler = familyUpper === 'ALQUILER'
    const isTienda = typeUpper === 'TIENDA'

    let active = false
    let isPurchasable = false
    if (isTaller || isAlquiler) {
      active = false
      isPurchasable = false
    } else if (isTienda) {
      active = true
      isPurchasable = false // admin lo activa después producto a producto
    } else {
      // Tipo desconocido: por seguridad → inactivo.
      active = false
      isPurchasable = false
    }

    // Detectar talla / agrupación
    const detection = name ? detectSize(name) : {
      size_label: null, model_group: null, cleaned_name: '', rule: 'none' as const,
    }

    // Slug único (sufijo numérico anti-colisión, local al batch).
    const baseSlug = slugify(name ?? `producto-${sourceRow}`)
    const usedCount = slugCounter.get(baseSlug) ?? 0
    slugCounter.set(baseSlug, usedCount + 1)
    const slug = usedCount === 0 ? baseSlug : `${baseSlug}-${usedCount + 1}`

    drafts.push({
      name: name ?? '',
      slug,
      ean,
      sku,
      category_name: family, // se mapea a category_id en la capa que escriba a BD
      brand,
      retail_price: retailPrice ?? 0,
      cost_price: costPrice,
      stock,
      size_label: detection.size_label,
      model_group: detection.model_group,
      active,
      is_purchasable: isPurchasable,
      source_row: sourceRow,
      rule: detection.rule,
      errors,
    })
  })

  return drafts
}

// ─── Dry-run / preview ──────────────────────────────────────────────────────

/**
 * Analiza el workbook sin escribir nada. Devuelve estadísticas para mostrar
 * en la UI antes de confirmar el import.
 */
export function analyzeWorkbook(rows: RawRow[]): ImportSummary {
  const headers = detectHeaders(rows)
  const drafts = mapRows(rows, headers)

  const byType: Record<string, number> = {}
  const byFamily: Record<string, number> = {}
  let active = 0
  let inactive = 0
  let withSize = 0
  let withoutSize = 0

  const groupMap = new Map<string, { variants: number; sample_name: string }>()
  const sizeSamples: ImportSummary['size_samples'] = []
  const errorSamples: ImportSummary['error_samples'] = []
  let invalid = 0

  for (const d of drafts) {
    // Tipo (lo recuperamos vía rule? no — lo extraemos del nombre de categoría no es fiable).
    // Mejor: re-extraer del row crudo no es necesario, agrupamos por category_name.
    if (d.category_name) {
      byFamily[d.category_name] = (byFamily[d.category_name] ?? 0) + 1
    }
    if (d.active) active++; else inactive++
    if (d.size_label) {
      withSize++
      if (sizeSamples.length < 20) {
        sizeSamples.push({
          name: d.name,
          size_label: d.size_label,
          model_group: d.model_group,
          rule: d.rule,
        })
      }
    } else {
      withoutSize++
    }
    if (d.model_group) {
      const existing = groupMap.get(d.model_group)
      if (existing) {
        existing.variants++
      } else {
        groupMap.set(d.model_group, { variants: 1, sample_name: d.name })
      }
    }
    if (d.errors.length) {
      invalid++
      if (errorSamples.length < 20) {
        errorSamples.push({ row: d.source_row, name: d.name, errors: d.errors })
      }
    }
  }

  // Conteo por Tipo: necesitamos volver a las filas crudas porque ya no está en draft.
  for (const row of rows) {
    if (headers.type) {
      const t = toStr(row[headers.type]) ?? '(vacío)'
      byType[t] = (byType[t] ?? 0) + 1
    }
  }

  const groups = Array.from(groupMap.entries())
    .map(([model_group, info]) => ({ model_group, ...info }))
    .filter((g) => g.variants >= 2) // grupo "real" = 2+ variantes
    .sort((a, b) => b.variants - a.variants)
    .slice(0, 50) // top 50 para preview

  const uniqueCategories = Array.from(
    new Set(drafts.map((d) => d.category_name).filter((c): c is string => Boolean(c))),
  ).sort()

  return {
    total_rows: rows.length,
    valid: drafts.length - invalid,
    invalid,
    by_type: byType,
    by_family: byFamily,
    active_count: active,
    inactive_count: inactive,
    with_size: withSize,
    without_size: withoutSize,
    groups,
    size_samples: sizeSamples,
    error_samples: errorSamples,
    unique_categories: uniqueCategories,
  }
}

// ─── Helpers públicos extra ────────────────────────────────────────────────

export { slugify, detectSize }
