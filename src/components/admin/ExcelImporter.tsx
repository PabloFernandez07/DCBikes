import { useState, useRef } from 'react'
import { clsx } from 'clsx'
import { Upload, AlertTriangle, CheckCircle, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import type { Database } from '@/lib/database.types'

type ProductUpdate = Database['public']['Tables']['products']['Update']

type Step = 'drop' | 'map' | 'validate' | 'import'

// Todas las columnas mapeables (alineadas con el Excel productos-importar.xlsx
// generado por scripts/generate-import-excel.mjs, pero también admiten nombres
// alternativos vía autoMap).
type ColumnKey =
  | 'nombre'
  | 'familia'
  | 'tipo'
  | 'marca'
  | 'descripcion_corta'
  | 'descripcion_completa'
  | 'sku'
  | 'ean'
  | 'pvp'
  | 'coste'
  | 'stock'
  | 'talla'
  | 'grupo_modelo'
  | 'color'
  | 'peso_gramos'
  | 'activo'
  | 'comprar_online'
  | 'ignorar'

interface ColumnMap {
  [detectedCol: string]: ColumnKey
}

interface RawRow {
  [key: string]: string | number | boolean | null
}

interface MappedRow {
  nombre: string
  familia: string                // se resuelve a category_id
  tipo: string                   // Tienda/Taller (controla activo si no se sobrescribe)
  marca: string
  descripcion_corta: string
  descripcion_completa: string
  sku: string
  ean: string
  pvp: number | null
  coste: number | null
  stock: number
  talla: string
  grupo_modelo: string
  color: string
  peso_gramos: number | null
  activo: boolean
  comprar_online: boolean
  _errors: string[]
  _rowIdx: number
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  nombre: 'Nombre',
  familia: 'Familia / Categoría',
  tipo: 'Tipo (Tienda/Taller)',
  marca: 'Marca',
  descripcion_corta: 'Descripción corta',
  descripcion_completa: 'Descripción completa',
  sku: 'Referencia (SKU)',
  ean: 'EAN',
  pvp: 'PVP c/IVA',
  coste: 'Coste s/IVA',
  stock: 'Stock',
  talla: 'Talla',
  grupo_modelo: 'Grupo modelo',
  color: 'Color',
  peso_gramos: 'Peso (g)',
  activo: 'Activo (visible web)',
  comprar_online: 'Comprar online',
  ignorar: 'Ignorar',
}

const COLUMN_OPTIONS: ColumnKey[] = [
  'nombre', 'familia', 'tipo', 'marca',
  'descripcion_corta', 'descripcion_completa',
  'sku', 'ean',
  'pvp', 'coste', 'stock',
  'talla', 'grupo_modelo', 'color', 'peso_gramos',
  'activo', 'comprar_online',
  'ignorar',
]

function autoMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  // El orden importa: patrones más específicos primero.
  const matches: Array<[RegExp, ColumnKey]> = [
    [/comprar\s*online|online|purchasable/i, 'comprar_online'],
    [/desc.*(corta|breve|short)/i, 'descripcion_corta'],
    [/desc.*(completa|larga|long)|^descripcion$|^descripción$/i, 'descripcion_completa'],
    [/grupo\s*modelo|model.?group/i, 'grupo_modelo'],
    [/peso|weight/i, 'peso_gramos'],
    [/coste|cost/i, 'coste'],
    [/pvp|price|precio/i, 'pvp'],
    [/^talla$|^size$/i, 'talla'],
    [/^color$|colour/i, 'color'],
    [/sku|ref|referencia/i, 'sku'],
    [/ean|barcode|barras/i, 'ean'],
    [/marca|brand/i, 'marca'],
    [/familia|family|categor/i, 'familia'],
    [/^tipo$|type/i, 'tipo'],
    [/stock|cantidad|qty/i, 'stock'],
    [/activo|active|enabled/i, 'activo'],
    [/nombre|name|articulo|artículo|product/i, 'nombre'],
  ]
  for (const h of headers) {
    const found = matches.find(([re]) => re.test(h))
    map[h] = found ? found[1] : 'ignorar'
  }
  return map
}

// ─── Parsers ──────────────────────────────────────────────────────────────
function toStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}
/**
 * Parsea números en formato es-ES (TPVinforpyme) sin corromper precios.
 * El bug clásico: "1.299,95" → replace(',','.') → "1.299.95" → parseFloat →
 * 1.299 (una bici de 1.300 € se importaba a 1,30 €).
 *
 * Casos de prueba:
 *   "1.299,95" → 1299.95  (punto = miles, coma = decimal)
 *   "12,5"     → 12.5     (coma decimal simple)
 *   "1.299"    → 1299     (patrón claro de miles: grupos de 3)
 *   "12.50"    → 12.5     (un único punto con ≤2 decimales = decimal)
 *   "0.123"    → 0.123    (no puede ser miles: parte entera "0")
 *   "1.299.95" → null     (incoherente: mejor rechazar que corromper)
 */
function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).replace(/[€\s]/g, '')
  if (s === '') return null
  if (s.includes(',')) {
    // Hay coma → formato es-ES: la coma es el decimal y TODOS los puntos
    // son separadores de miles. Más de una coma es inválido.
    if ((s.match(/,/g) ?? []).length > 1) return null
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes('.')) {
    // Sin coma: decidir si los puntos son miles o decimal.
    if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) {
      // Patrón inequívoco de miles es-ES ("1.299", "1.234.567").
      s = s.replace(/\./g, '')
    } else if ((s.match(/\./g) ?? []).length > 1) {
      // Varios puntos que no cuadran como miles ("1.299.95") → inválido.
      return null
    }
    // Un único punto que no es miles ("12.50", "0.123") → decimal, se deja.
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
/**
 * Normaliza un EAN para comparar/guardar. Los EAN llegan a veces como número
 * desde el Excel (pierden los ceros a la izquierda), por eso forzamos String,
 * nos quedamos solo con dígitos y, si quedaron 12 (EAN-13 sin su cero
 * inicial), lo restauramos.
 */
function normalizeEan(v: unknown): string {
  if (v == null) return ''
  const digits = String(v).trim().replace(/\D/g, '')
  if (digits.length === 12) return digits.padStart(13, '0')
  return digits
}
function toBool(v: unknown, fallback = false): boolean {
  if (v == null || v === '') return fallback
  const s = String(v).trim().toLowerCase()
  if (['1', 'true', 'si', 'sí', 'yes', 'y', 'verdadero'].includes(s)) return true
  if (['0', 'false', 'no', 'n', 'falso'].includes(s)) return false
  return fallback
}

function parseRows(rawRows: RawRow[], colMap: ColumnMap): MappedRow[] {
  return rawRows.map((raw, idx) => {
    const get = (key: ColumnKey): unknown => {
      const col = Object.entries(colMap).find(([, v]) => v === key)?.[0]
      return col != null ? raw[col] : null
    }
    const errors: string[] = []

    const nombre = toStr(get('nombre'))
    const tipo = toStr(get('tipo'))
    const familia = toStr(get('familia'))
    const pvp = toNum(get('pvp'))

    if (!nombre) errors.push('Nombre vacío')
    if (pvp == null || pvp <= 0) errors.push('PVP vacío o ≤ 0')

    // Activo: si no se mapea columna explícita, derivar de Tipo/Familia.
    let activo: boolean
    const activoCol = Object.entries(colMap).find(([, v]) => v === 'activo')
    if (activoCol) {
      activo = toBool(raw[activoCol[0]], false)
    } else {
      const isTaller = tipo.toUpperCase() === 'TALLER'
      const isAlquiler = familia.toUpperCase() === 'ALQUILER'
      const isTienda = tipo.toUpperCase() === 'TIENDA'
      activo = isTienda && !isAlquiler && !isTaller
    }

    // Comprar online: default false. Admin lo activa producto a producto desde admin.
    const comprarOnline = toBool(get('comprar_online'), false)

    return {
      nombre,
      familia,
      tipo,
      marca: toStr(get('marca')),
      descripcion_corta: toStr(get('descripcion_corta')),
      descripcion_completa: toStr(get('descripcion_completa')),
      sku: toStr(get('sku')),
      ean: normalizeEan(get('ean')),
      pvp,
      coste: toNum(get('coste')),
      stock: Math.max(0, Math.trunc(toNum(get('stock')) ?? 0)),
      talla: toStr(get('talla')),
      grupo_modelo: toStr(get('grupo_modelo')),
      color: toStr(get('color')),
      peso_gramos: toNum(get('peso_gramos')),
      activo,
      comprar_online: comprarOnline,
      _errors: errors,
      _rowIdx: idx + 1,
    }
  })
}

// ─── Helper: categoría auto-crear ────────────────────────────────────────
async function resolveCategoryId(familia: string, cache: Map<string, string>): Promise<string | null> {
  if (!familia) return null
  const key = familia.toLowerCase().trim()
  if (cache.has(key)) return cache.get(key)!

  const slug = familia
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // Lookup por slug primero
  const { data: existing, error: lookupErr } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (lookupErr) console.warn('[Import] lookup categoría falló', familia, lookupErr)
  if (existing?.id) {
    cache.set(key, existing.id)
    return existing.id
  }

  // Crear nueva
  const { data: max } = await supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sortOrder = (max?.sort_order ?? 0) + 1

  const { data: created, error: insertErr } = await supabase
    .from('categories')
    .insert({ slug, name: familia, sort_order: sortOrder })
    .select('id')
    .single()
  if (insertErr) {
    console.error('[Import] no se pudo crear categoría', familia, insertErr)
    // Si fue conflict de slug, intentar release race-safe: relookup.
    const { data: retry } = await supabase
      .from('categories').select('id').eq('slug', slug).maybeSingle()
    if (retry?.id) {
      cache.set(key, retry.id)
      return retry.id
    }
    return null
  }
  if (created?.id) {
    cache.set(key, created.id)
    return created.id
  }
  return null
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Componente ──────────────────────────────────────────────────────────
export function ExcelImporter() {
  const [step, setStep] = useState<Step>('drop')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [colMap, setColMap] = useState<ColumnMap>({})
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [importErrors, setImportErrors] = useState<Array<{ name: string; error: string }>>([])
  const [dragging, setDragging] = useState(false)
  // Si está marcado, el UPDATE de productos existentes sobrescribe el stock
  // con el del Excel. Desmarcado, el stock de la web no se toca.
  const [updateStock, setUpdateStock] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    // Import dinámico: xlsx pesa ~113 KB gz y solo hace falta al procesar un
    // archivo, no al entrar en cualquier ruta /admin (PERF-M4).
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    // Buscar hoja "Productos" (generada por nuestro script) o caer a la primera.
    const sheetName = wb.SheetNames.includes('Productos')
      ? 'Productos'
      : wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' })
    if (data.length === 0) return
    const hdrs = Object.keys(data[0])
    setHeaders(hdrs)
    setRawRows(data)
    setColMap(autoMap(hdrs))
    setStep('map')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleValidate = () => {
    setMappedRows(parseRows(rawRows, colMap))
    setStep('validate')
  }

  const handleImport = async () => {
    setImporting(true)
    setStep('import')
    setImportErrors([])
    const valid = mappedRows.filter(r => r._errors.length === 0)
    let count = 0
    const categoryCache = new Map<string, string>()
    const errors: Array<{ name: string; error: string }> = []

    // Columnas realmente presentes en el Excel (mapeadas a algo ≠ ignorar).
    // En UPDATE solo se escriben los campos cuya columna existe de verdad:
    // reimportar el catálogo del TPV no debe machacar datos gestionados a
    // mano desde el admin (BUG-A6).
    const presentKeys = new Set<ColumnKey>(
      Object.values(colMap).filter(k => k !== 'ignorar'),
    )

    for (const row of valid) {
      try {
        // La categoría solo se resuelve (y auto-crea) si el Excel trae la
        // columna Familia. Para INSERT es obligatoria; para UPDATE, opcional.
        let categoryId: string | null = null
        if (presentKeys.has('familia') && row.familia) {
          categoryId = await resolveCategoryId(row.familia, categoryCache)
        }

        const baseSlug = slugify(row.nombre) || `producto-${row._rowIdx}`

        // Payload completo: solo para INSERT (producto nuevo, defaults seguros).
        const buildPayload = (slug: string, catId: string) => ({
          name: row.nombre,
          slug,
          sku: row.sku || null,
          brand: row.marca || null,
          short_description: row.descripcion_corta || null,
          description: row.descripcion_completa || null,
          retail_price: row.pvp ?? 0,
          stock: row.stock,
          category_id: catId,
          active: row.activo,
          featured: false,
          // Campos Fase A:
          ean: row.ean || null,
          size_label: row.talla || null,
          model_group: row.grupo_modelo || null,
          weight_grams: row.peso_gramos,
          is_purchasable: row.comprar_online,
          discount_percent: null,
        })

        // Buscar existente con prioridad EAN → SKU → slug. El EAN es la clave
        // real del catálogo del TPV; el slug solo como último recurso (dos
        // productos distintos con el mismo nombre se fusionarían, BUG-M1).
        // `products.sku`/`ean` NO tienen UNIQUE constraint en BD, por eso no
        // usamos upsert(onConflict) — devuelve error 42P10.
        let existingId: string | null = null
        if (row.ean) {
          const { data: byEan } = await supabase
            .from('products')
            .select('id')
            .eq('ean', row.ean)
            .limit(1)
          if (byEan?.[0]?.id) existingId = byEan[0].id
        }
        if (!existingId && row.sku) {
          const { data: bySku } = await supabase
            .from('products')
            .select('id')
            .eq('sku', row.sku)
            .maybeSingle()
          if (bySku?.id) existingId = bySku.id
        }
        if (!existingId) {
          const { data: bySlug } = await supabase
            .from('products')
            .select('id')
            .eq('slug', baseSlug)
            .maybeSingle()
          if (bySlug?.id) existingId = bySlug.id
        }

        if (existingId) {
          // UPDATE parcial — solo campos con columna presente en el Excel.
          // No se toca el slug (rompería enlaces) ni `featured`/`discount_percent`
          // (se gestionan a mano en el admin y el TPV no los conoce).
          const updatePayload: ProductUpdate = {}
          if (presentKeys.has('nombre')) updatePayload.name = row.nombre
          if (presentKeys.has('sku')) updatePayload.sku = row.sku || null
          if (presentKeys.has('marca')) updatePayload.brand = row.marca || null
          if (presentKeys.has('descripcion_corta')) updatePayload.short_description = row.descripcion_corta || null
          if (presentKeys.has('descripcion_completa')) updatePayload.description = row.descripcion_completa || null
          if (presentKeys.has('pvp')) updatePayload.retail_price = row.pvp ?? 0
          if (presentKeys.has('ean')) updatePayload.ean = row.ean || null
          if (presentKeys.has('talla')) updatePayload.size_label = row.talla || null
          if (presentKeys.has('grupo_modelo')) updatePayload.model_group = row.grupo_modelo || null
          if (presentKeys.has('peso_gramos')) updatePayload.weight_grams = row.peso_gramos
          if (presentKeys.has('familia') && categoryId) updatePayload.category_id = categoryId
          // Stock: solo si el admin marcó "Actualizar stock desde el Excel".
          if (updateStock && presentKeys.has('stock')) updatePayload.stock = row.stock
          // `active` derivado de Tipo/Familia NO se aplica en UPDATE: solo se
          // escribe si el Excel trae la columna Activo de forma explícita.
          if (presentKeys.has('activo')) updatePayload.active = row.activo
          // `is_purchasable` NUNCA se toca en UPDATE salvo columna explícita:
          // antes se escribía siempre (false si faltaba la columna) y cada
          // reimport desactivaba la compra online de todo el catálogo.
          if (presentKeys.has('comprar_online')) updatePayload.is_purchasable = row.comprar_online

          if (Object.keys(updatePayload).length > 0) {
            const { error } = await supabase
              .from('products')
              .update(updatePayload)
              .eq('id', existingId)
            if (error) throw error
          }
        } else {
          if (!categoryId) {
            errors.push({ name: row.nombre, error: 'No se pudo crear/asociar categoría' })
            continue
          }
          // INSERT — slug puede colisionar con otro producto que tenga el mismo
          // nombre normalizado. Reintentamos con sufijo -2, -3, etc.
          let attemptSlug = baseSlug
          let attempt = 1
          while (true) {
            const { error } = await supabase
              .from('products')
              .insert(buildPayload(attemptSlug, categoryId))
            if (!error) break
            const isSlugConflict = (error as { code?: string }).code === '23505'
              && /slug/i.test((error as { message?: string }).message ?? '')
            if (!isSlugConflict || attempt >= 10) throw error
            attempt++
            attemptSlug = `${baseSlug}-${attempt}`
          }
        }

        count++
        setImported(count)
      } catch (err) {
        // Supabase devuelve objetos { message, code, details, hint }. NO son
        // instanceof Error, por eso String(err) → '[object Object]'.
        // Loggeamos el objeto completo a consola para inspección y formateamos
        // un mensaje legible para la UI.
        console.error('[Import] Error en producto:', row.nombre, err, 'payload:', row)
        const errAny = err as { message?: string; details?: string; hint?: string; code?: string }
        const parts: string[] = []
        if (errAny?.message) parts.push(errAny.message)
        if (errAny?.details) parts.push(errAny.details)
        if (errAny?.hint) parts.push('(' + errAny.hint + ')')
        if (errAny?.code) parts.push('[' + errAny.code + ']')
        const msg = parts.length ? parts.join(' · ') : (err instanceof Error ? err.message : 'Error desconocido (ver consola)')
        errors.push({ name: row.nombre, error: msg })
      }
    }

    setImportErrors(errors)
    setImporting(false)
  }

  const reset = () => {
    setStep('drop')
    setHeaders([])
    setRawRows([])
    setColMap({})
    setMappedRows([])
    setImported(0)
    setImportErrors([])
    setUpdateStock(true)
  }

  // ── Step 1: drop ───────────────────────────────────────────────────────
  if (step === 'drop') {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-8 sm:p-16 text-center cursor-pointer transition-all duration-200',
          dragging
            ? 'border-[var(--color-lavender)] bg-[var(--color-lavender)]/10'
            : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60 hover:bg-[var(--color-card)]/20',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <Upload size={40} className="mx-auto mb-4 text-[var(--color-mid)]" aria-hidden="true" />
        <p className="text-lg font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
          Arrastra tu archivo Excel o CSV
        </p>
        <p className="text-sm text-[var(--color-mid)] mt-2">XLS, XLSX, CSV admitidos</p>
        <p className="text-xs text-[var(--color-mid)]/70 mt-4 font-[var(--font-body)]">
          El importador autodetecta las columnas. Soporta el formato
          productos-importar.xlsx generado por el script o cualquier Excel
          con cabeceras claras.
        </p>
      </div>
    )
  }

  // ── Step 2: map columns ────────────────────────────────────────────────
  if (step === 'map') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
            Paso 2: Mapear columnas
          </h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            <X size={15} aria-hidden="true" /> Cancelar
          </Button>
        </div>

        <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
          Detectamos {headers.length} columnas en {rawRows.length} filas. Revisa
          el mapeo automático y ajusta si hace falta. Marca como
          <span className="mx-1 px-1.5 py-0.5 rounded bg-[var(--color-card-hover)] text-[var(--color-cream-dim)]">Ignorar</span>
          las que no quieras importar.
        </p>

        <div className="bg-[var(--color-card)] rounded-xl overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-card-hover)]">
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">
                  Columna detectada
                </th>
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">
                  Mapear a
                </th>
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">
                  Primeras 3 filas
                </th>
              </tr>
            </thead>
            <tbody>
              {headers.map(h => (
                <tr key={h} className="border-b border-[var(--color-card-hover)]/50 last:border-0">
                  <td className="px-4 py-3 text-[var(--color-cream-dim)] font-[var(--font-body)]">{h}</td>
                  <td className="px-4 py-3">
                    <select
                      value={colMap[h] ?? 'ignorar'}
                      onChange={e => setColMap(prev => ({ ...prev, [h]: e.target.value as ColumnKey }))}
                      className="bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg px-3 py-1.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)]"
                    >
                      {COLUMN_OPTIONS.map(k => (
                        <option key={k} value={k}>{COLUMN_LABELS[k]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] text-xs">
                    {rawRows.slice(0, 3).map((r, i) => (
                      <span key={i} className="mr-2 opacity-70 max-w-[160px] inline-block truncate align-middle">
                        {String(r[h] ?? '')}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={reset}>Cancelar</Button>
          <Button variant="primary" onClick={handleValidate}>
            Validar datos ({rawRows.length} filas)
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 3: validate ───────────────────────────────────────────────────
  if (step === 'validate') {
    const valid = mappedRows.filter(r => r._errors.length === 0)
    const invalid = mappedRows.filter(r => r._errors.length > 0)
    const withShortDesc = valid.filter(r => r.descripcion_corta).length
    const withSize = valid.filter(r => r.talla).length
    const withGroup = valid.filter(r => r.grupo_modelo).length
    const onlineCount = valid.filter(r => r.comprar_online).length

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
            Paso 3: Validación
          </h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            <X size={15} aria-hidden="true" /> Cancelar
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-lavender)]/10 border border-[var(--color-lavender)]/20">
            <CheckCircle size={16} className="text-[var(--color-lavender)]" aria-hidden="true" />
            <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">
              {valid.length} listos para importar
            </span>
          </div>
          {invalid.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-brand-red)]/10 border border-[var(--color-brand-red)]/20">
              <AlertTriangle size={16} className="text-[var(--color-brand-red)]" aria-hidden="true" />
              <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">
                {invalid.length} con errores (se saltarán)
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-card-hover)]/40">
            <span className="text-xs text-[var(--color-mid)] font-[var(--font-cond)]">
              {withShortDesc} con descripción · {withSize} con talla · {withGroup} agrupados · {onlineCount} online
            </span>
          </div>
        </div>

        <div className="bg-[var(--color-card)] rounded-xl overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-card)]">
              <tr className="border-b border-[var(--color-card-hover)]">
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">#</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Nombre</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Familia</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">SKU</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">PVP</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Talla</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Stock</th>
                <th className="px-3 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Estado</th>
              </tr>
            </thead>
            <tbody>
              {mappedRows.slice(0, 200).map(row => (
                <tr
                  key={row._rowIdx}
                  className={clsx(
                    'border-b border-[var(--color-card-hover)]/50 last:border-0',
                    row._errors.length > 0 && 'bg-[var(--color-brand-red)]/5',
                  )}
                >
                  <td className="px-3 py-3 text-[var(--color-mid)]">{row._rowIdx}</td>
                  <td className="px-3 py-3 text-[var(--color-cream-dim)] truncate max-w-[260px]" title={row.nombre}>
                    {row.nombre || '—'}
                  </td>
                  <td className="px-3 py-3 text-[var(--color-mid)] text-xs">{row.familia || '—'}</td>
                  <td className="px-3 py-3 text-[var(--color-mid)] text-xs">{row.sku || '—'}</td>
                  <td className="px-3 py-3 text-[var(--color-cream-dim)] tabular-nums">
                    {row.pvp != null ? `${row.pvp.toFixed(2)} €` : '—'}
                  </td>
                  <td className="px-3 py-3 text-[var(--color-cream-dim)] text-xs">{row.talla || '—'}</td>
                  <td className="px-3 py-3 text-[var(--color-cream-dim)] tabular-nums">{row.stock}</td>
                  <td className="px-3 py-3">
                    {row._errors.length > 0 ? (
                      <span className="text-xs text-[var(--color-brand-red)]">
                        {row._errors.join(', ')}
                      </span>
                    ) : (
                      <CheckCircle size={14} className="text-[var(--color-lavender)]" role="img" aria-label="Fila válida" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {mappedRows.length > 200 && (
            <p className="px-3 py-2 text-xs text-[var(--color-mid)] border-t border-[var(--color-card-hover)] bg-[var(--color-card)]">
              Mostrando 200 de {mappedRows.length} filas en preview. El import procesará todas.
            </p>
          )}
        </div>

        {/* Control de stock en UPDATE: por defecto el Excel del TPV manda,
            pero el admin puede proteger el stock gestionado desde la web. */}
        {Object.values(colMap).includes('stock') && (
          <div className="space-y-1.5">
            <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={updateStock}
                onChange={e => setUpdateStock(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--color-lavender)] cursor-pointer"
              />
              <span className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
                Actualizar stock desde el Excel en productos existentes
              </span>
            </label>
            {updateStock && (
              <p className="flex items-center gap-1.5 text-xs text-amber-400/90 font-[var(--font-body)] pl-7">
                <AlertTriangle size={13} aria-hidden="true" />
                El stock del Excel sobrescribirá el stock actual de la web (incluidas ventas posteriores al export del TPV).
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setStep('map')}>Volver</Button>
          <Button variant="primary" onClick={handleImport} disabled={valid.length === 0}>
            Importar {valid.length} productos
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 4: import (running / done) ────────────────────────────────────
  const valid = mappedRows.filter(r => r._errors.length === 0)

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
        {importing ? 'Paso 4: Importando…' : 'Importación completada'}
      </h3>

      <div className="space-y-3">
        <div className="flex justify-between text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <span>{imported} / {valid.length} importados</span>
          {importErrors.length > 0 && (
            <span className="text-[var(--color-brand-red)]">{importErrors.length} con error</span>
          )}
        </div>
        <div className="h-2 bg-[var(--color-card)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-lavender)] transition-all"
            style={{ width: `${valid.length ? (imported / valid.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {importErrors.length > 0 && (
        <div className="bg-[var(--color-brand-red)]/5 border border-[var(--color-brand-red)]/20 rounded-xl p-4 max-h-60 overflow-auto">
          <p className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-brand-red)] mb-2">
            ERRORES DURANTE EL IMPORT
          </p>
          <ul className="space-y-1.5 text-xs font-[var(--font-body)]">
            {importErrors.slice(0, 50).map((e, i) => (
              <li key={i} className="text-[var(--color-cream-dim)]">
                <span className="text-[var(--color-cream)]">{e.name}:</span>{' '}
                <span className="text-[var(--color-mid)]">{e.error}</span>
              </li>
            ))}
            {importErrors.length > 50 && (
              <li className="text-[var(--color-mid)]">… y {importErrors.length - 50} más</li>
            )}
          </ul>
        </div>
      )}

      {!importing && (
        <div className="flex justify-end gap-3">
          <Button variant="primary" onClick={reset}>Importar otro archivo</Button>
        </div>
      )}
    </div>
  )
}
