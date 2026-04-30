import { useState, useRef } from 'react'
import { read as xlsxRead, utils } from 'xlsx'
import { clsx } from 'clsx'
import { Upload, AlertTriangle, CheckCircle, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

type Step = 'drop' | 'map' | 'validate' | 'import'

type ColumnKey =
  | 'nombre'
  | 'sku'
  | 'marca'
  | 'descripcion'
  | 'precio_coste'
  | 'pvp'
  | 'stock'
  | 'categoria_slug'
  | 'activo'
  | 'ignorar'

interface ColumnMap {
  [detectedCol: string]: ColumnKey
}

interface RawRow {
  [key: string]: string | number | boolean | null
}

interface MappedRow {
  nombre: string
  sku: string
  marca: string
  descripcion: string
  precio_coste: number | null
  pvp: number | null
  stock: number
  categoria_slug: string
  activo: boolean
  _errors: string[]
  _rowIdx: number
}

const COLUMN_LABELS: Record<ColumnKey, string> = {
  nombre: 'Nombre',
  sku: 'SKU',
  marca: 'Marca',
  descripcion: 'Descripción',
  precio_coste: 'Precio coste',
  pvp: 'PVP',
  stock: 'Stock',
  categoria_slug: 'Categoría slug',
  activo: 'Activo',
  ignorar: 'Ignorar',
}

function autoMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const matches: Array<[RegExp, ColumnKey]> = [
    [/nombre|name|product/i, 'nombre'],
    [/sku|ref/i, 'sku'],
    [/marca|brand/i, 'marca'],
    [/desc/i, 'descripcion'],
    [/coste|cost/i, 'precio_coste'],
    [/pvp|price|precio/i, 'pvp'],
    [/stock|cantidad|qty/i, 'stock'],
    [/categ|slug/i, 'categoria_slug'],
    [/activo|active|enabled/i, 'activo'],
  ]
  for (const h of headers) {
    const found = matches.find(([re]) => re.test(h))
    map[h] = found ? found[1] : 'ignorar'
  }
  return map
}

function parseRows(rawRows: RawRow[], colMap: ColumnMap): MappedRow[] {
  return rawRows.map((raw, idx) => {
    const get = (key: ColumnKey): string => {
      const col = Object.entries(colMap).find(([, v]) => v === key)?.[0]
      return col != null && raw[col] != null ? String(raw[col]).trim() : ''
    }
    const errors: string[] = []
    const pvpRaw = get('pvp')
    const pvp = pvpRaw ? Number(pvpRaw) : null
    if (!pvp || isNaN(pvp)) errors.push('PVP vacío o inválido')
    if (!get('nombre')) errors.push('Nombre vacío')
    return {
      nombre: get('nombre'),
      sku: get('sku'),
      marca: get('marca'),
      descripcion: get('descripcion'),
      precio_coste: get('precio_coste') ? Number(get('precio_coste')) : null,
      pvp,
      stock: Number(get('stock')) || 0,
      categoria_slug: get('categoria_slug'),
      activo: ['1', 'true', 'si', 'yes'].includes(get('activo').toLowerCase()),
      _errors: errors,
      _rowIdx: idx + 1,
    }
  })
}

export function ExcelImporter() {
  const [step, setStep] = useState<Step>('drop')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<RawRow[]>([])
  const [colMap, setColMap] = useState<ColumnMap>({})
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([])
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(0)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const wb = xlsxRead(e.target?.result, { type: 'binary' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = utils.sheet_to_json<RawRow>(ws, { defval: '' })
      if (data.length === 0) return
      const hdrs = Object.keys(data[0])
      setHeaders(hdrs)
      setRawRows(data)
      setColMap(autoMap(hdrs))
      setStep('map')
    }
    reader.readAsBinaryString(file)
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
    const valid = mappedRows.filter(r => r._errors.length === 0)
    let count = 0

    for (const row of valid) {
      let categoryId: string | null = null

      if (row.categoria_slug) {
        const { data } = await supabase
          .from('categories')
          .select('id')
          .eq('slug', row.categoria_slug)
          .maybeSingle()
        categoryId = data?.id ?? null
      }

      if (!categoryId) {
        const { data: cats } = await supabase
          .from('categories')
          .select('id')
          .order('sort_order')
          .limit(1)
        categoryId = cats?.[0]?.id ?? ''
      }

      const slug = row.nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const payload = {
        name: row.nombre,
        slug,
        sku: row.sku || null,
        brand: row.marca || null,
        description: row.descripcion || null,
        short_description: null as string | null,
        cost_price: row.precio_coste,
        retail_price: row.pvp!,
        stock: row.stock,
        category_id: categoryId,
        active: row.activo,
        featured: false,
      }

      if (row.sku) {
        await supabase
          .from('products')
          .upsert(payload, { onConflict: 'sku' })
      } else {
        await supabase.from('products').insert(payload)
      }

      count++
      setImported(count)
    }

    setImporting(false)
  }

  const reset = () => {
    setStep('drop')
    setHeaders([])
    setRawRows([])
    setColMap({})
    setMappedRows([])
    setImported(0)
  }

  if (step === 'drop') {
    return (
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all duration-200',
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
        <Upload size={40} className="mx-auto mb-4 text-[var(--color-mid)]" />
        <p className="text-lg font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
          Arrastra tu archivo Excel o CSV
        </p>
        <p className="text-sm text-[var(--color-mid)] mt-2">XLS, XLSX, CSV admitidos</p>
      </div>
    )
  }

  if (step === 'map') {
    const colOptions: ColumnKey[] = [
      'nombre', 'sku', 'marca', 'descripcion',
      'precio_coste', 'pvp', 'stock', 'categoria_slug', 'activo', 'ignorar',
    ]
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
            Paso 2: Mapear columnas
          </h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            <X size={15} /> Cancelar
          </Button>
        </div>

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
                      {colOptions.map(k => (
                        <option key={k} value={k}>{COLUMN_LABELS[k]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] text-xs">
                    {rawRows.slice(0, 3).map((r, i) => (
                      <span key={i} className="mr-2 opacity-70">{String(r[h] ?? '')}</span>
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

  if (step === 'validate') {
    const valid = mappedRows.filter(r => r._errors.length === 0)
    const invalid = mappedRows.filter(r => r._errors.length > 0)

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
            Paso 3: Validación
          </h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            <X size={15} /> Cancelar
          </Button>
        </div>

        <div className="flex gap-4">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-lavender)]/10 border border-[var(--color-lavender)]/20">
            <CheckCircle size={16} className="text-[var(--color-lavender)]" />
            <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">
              {valid.length} listos para importar
            </span>
          </div>
          {invalid.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-brand-red)]/10 border border-[var(--color-brand-red)]/20">
              <AlertTriangle size={16} className="text-[var(--color-brand-red)]" />
              <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">
                {invalid.length} con errores (se saltarán)
              </span>
            </div>
          )}
        </div>

        <div className="bg-[var(--color-card)] rounded-xl overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-card)]">
              <tr className="border-b border-[var(--color-card-hover)]">
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">#</th>
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Nombre</th>
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">SKU</th>
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">PVP</th>
                <th className="px-4 py-3 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Estado</th>
              </tr>
            </thead>
            <tbody>
              {mappedRows.map(row => (
                <tr
                  key={row._rowIdx}
                  className={clsx(
                    'border-b border-[var(--color-card-hover)]/50 last:border-0',
                    row._errors.length > 0 && 'bg-[var(--color-brand-red)]/5',
                  )}
                >
                  <td className="px-4 py-3 text-[var(--color-mid)]">{row._rowIdx}</td>
                  <td className="px-4 py-3 text-[var(--color-cream-dim)]">{row.nombre || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-mid)]">{row.sku || '—'}</td>
                  <td className="px-4 py-3 text-[var(--color-cream-dim)]">
                    {row.pvp != null ? `${row.pvp} €` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {row._errors.length > 0 ? (
                      <span className="text-xs text-[var(--color-brand-red)]">
                        {row._errors.join(', ')}
                      </span>
                    ) : (
                      <CheckCircle size={14} className="text-[var(--color-lavender)]" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setStep('map')}>Volver</Button>
          <Button variant="primary" onClick={handleImport} disabled={valid.length === 0}>
            Importar {valid.length} productos
          </Button>
        </div>
      </div>
    )
  }

  const valid = mappedRows.filter(r => r._errors.length === 0)

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
        Paso 4: Importando...
      </h3>

      <div className="space-y-3">
        <div className="flex justify-between text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <span>{imported} de {valid.length} productos importados</span>
          <span>{Math.round((imported / valid.length) * 100)}%</span>
        </div>
        <div className="h-2.5 w-full bg-[var(--color-card)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-lavender)] rounded-full transition-all duration-300"
            style={{ width: `${(imported / valid.length) * 100}%` }}
          />
        </div>
      </div>

      {!importing && imported > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-[var(--color-lavender)]/10 border border-[var(--color-lavender)]/20">
          <CheckCircle size={20} className="text-[var(--color-lavender)]" />
          <p className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">
            Importación completada: {imported} productos procesados
          </p>
        </div>
      )}

      {!importing && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={reset}>Nueva importación</Button>
        </div>
      )}
    </div>
  )
}
