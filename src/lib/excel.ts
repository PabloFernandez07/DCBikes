import * as XLSX from 'xlsx'

export interface RawRow {
  [key: string]: string | number | null
}

export interface ColumnMapping {
  name:            string | null
  sku:             string | null
  brand:           string | null
  short_description: string | null
  description:     string | null
  cost_price:      string | null
  retail_price:    string | null
  stock:           string | null
  category_slug:   string | null
  active:          string | null
}

export interface ProductDraft {
  name:             string
  slug:             string
  sku:              string | null
  brand:            string | null
  short_description:string | null
  description:      string | null
  cost_price:       number | null
  retail_price:     number
  stock:            number
  category_slug:    string | null
  active:           boolean
  _errors:          string[]
}

export function parseFile(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data   = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb     = XLSX.read(data, { type: 'array' })
        const sheet  = wb.Sheets[wb.SheetNames[0]]
        const rows   = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null })
        resolve(rows)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export function detectColumns(rows: RawRow[]): string[] {
  if (!rows.length) return []
  return Object.keys(rows[0])
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function toNum(val: string | number | null): number | null {
  if (val === null || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'))
  return isNaN(n) ? null : n
}

export function mapRows(rows: RawRow[], mapping: ColumnMapping): ProductDraft[] {
  return rows.map((row) => {
    const errors: string[] = []
    const get = (col: string | null) => (col ? row[col] ?? null : null)

    const name = String(get(mapping.name) ?? '').trim()
    if (!name) errors.push('Nombre vacío')

    const retailRaw = toNum(get(mapping.retail_price))
    if (retailRaw === null) errors.push('PVP inválido o vacío')

    const stockVal = toNum(get(mapping.stock))
    const activeRaw = get(mapping.active)
    const active =
      activeRaw === null
        ? true
        : ['1', 'true', 'sí', 'si', 'yes'].includes(String(activeRaw).toLowerCase())

    return {
      name,
      slug:              slugify(name),
      sku:               get(mapping.sku) ? String(get(mapping.sku)).trim() : null,
      brand:             get(mapping.brand) ? String(get(mapping.brand)).trim() : null,
      short_description: get(mapping.short_description) ? String(get(mapping.short_description)).trim() : null,
      description:       get(mapping.description)       ? String(get(mapping.description)).trim()       : null,
      cost_price:        toNum(get(mapping.cost_price)),
      retail_price:      retailRaw ?? 0,
      stock:             stockVal ?? 0,
      category_slug:     get(mapping.category_slug) ? String(get(mapping.category_slug)).trim() : null,
      active,
      _errors:           errors,
    }
  })
}
