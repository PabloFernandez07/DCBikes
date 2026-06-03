import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import { Upload, FolderUp, X, CheckCircle, AlertTriangle, Download, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

type Step = 'select' | 'review' | 'uploading' | 'done'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB por imagen
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']
const CONCURRENCY = 4

interface ProductLite {
  id: string
  name: string
  slug: string
  sku: string | null
  ean: string | null
}

type MatchReason = 'ean' | 'sku' | 'nombre'

interface FileMatch {
  file: File
  productId: string | null
  productName: string | null
  reason: MatchReason | null
  tooBig: boolean
}

// ─── Helpers de normalización ───────────────────────────────────────────────
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
function baseName(filename: string): string {
  const noExt = filename.replace(/\.[^.]+$/, '')
  // Quita sufijos de orden típicos: -1, _2, (3), -copia, -copy, espacios finales
  return noExt
    .replace(/[\s_-]*\((\d+)\)\s*$/, '')
    .replace(/[\s_-]+(\d{1,2}|copia|copy)\s*$/i, '')
    .trim()
}

// ─── Carga de catálogo (paginada) ─────────────────────────────────────────────
async function fetchAllProducts(): Promise<ProductLite[]> {
  const all: ProductLite[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('products')
      .select('id,name,slug,sku,ean')
      .range(from, from + size - 1)
    if (error) throw error
    const rows = (data as ProductLite[]) ?? []
    all.push(...rows)
    if (rows.length < size) break
  }
  return all
}

async function fetchProductsWithImages(): Promise<Set<string>> {
  const set = new Set<string>()
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('product_images')
      .select('product_id')
      .range(from, from + size - 1)
    if (error) throw error
    const rows = (data as { product_id: string | null }[]) ?? []
    for (const r of rows) if (r.product_id) set.add(r.product_id)
    if (rows.length < size) break
  }
  return set
}

// ─── Índices de búsqueda ──────────────────────────────────────────────────────
interface Indexes {
  byEan: Map<string, ProductLite>
  bySku: Map<string, ProductLite>
  bySlug: Map<string, ProductLite>
}
function buildIndexes(products: ProductLite[]): Indexes {
  const byEan = new Map<string, ProductLite>()
  const bySku = new Map<string, ProductLite>()
  const bySlug = new Map<string, ProductLite>()
  for (const p of products) {
    if (p.ean) {
      const e = p.ean.replace(/\D/g, '')
      if (e.length >= 8 && !byEan.has(e)) byEan.set(e, p)
    }
    if (p.sku) {
      const s = p.sku.toUpperCase().replace(/[^A-Z0-9]/g, '')
      if (s && !bySku.has(s)) bySku.set(s, p)
    }
    const slug = p.slug || slugify(p.name)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, p)
  }
  return { byEan, bySku, bySlug }
}

function matchFile(file: File, idx: Indexes): FileMatch {
  const tooBig = file.size > MAX_BYTES
  const base = baseName(file.name)

  // 1) EAN: cualquier secuencia de 8-14 dígitos dentro del nombre del archivo.
  const digitRuns = file.name.match(/\d{8,14}/g) ?? []
  for (const run of digitRuns) {
    const p = idx.byEan.get(run)
    if (p) return { file, productId: p.id, productName: p.name, reason: 'ean', tooBig }
  }

  // 2) SKU exacto (normalizado).
  const skuKey = base.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (skuKey) {
    const p = idx.bySku.get(skuKey)
    if (p) return { file, productId: p.id, productName: p.name, reason: 'sku', tooBig }
  }

  // 3) Nombre/slug.
  const slugKey = slugify(base)
  if (slugKey) {
    const p = idx.bySlug.get(slugKey)
    if (p) return { file, productId: p.id, productName: p.name, reason: 'nombre', tooBig }
  }

  return { file, productId: null, productName: null, reason: null, tooBig }
}

// ─── Descarga de CSV ──────────────────────────────────────────────────────────
function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Componente ────────────────────────────────────────────────────────────────
export function BulkImageUploader() {
  const [step, setStep] = useState<Step>('select')
  const [dragging, setDragging] = useState(false)
  const [loadingCatalog, setLoadingCatalog] = useState(false)
  const [matches, setMatches] = useState<FileMatch[]>([])
  const [products, setProducts] = useState<ProductLite[]>([])
  const [withImages, setWithImages] = useState<Set<string>>(new Set())
  const [appendExisting, setAppendExisting] = useState(false)
  const [uploaded, setUploaded] = useState(0)
  const [errors, setErrors] = useState<Array<{ file: string; error: string }>>([])
  const [uploadedProductIds, setUploadedProductIds] = useState<Set<string>>(new Set())

  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  // ── Cargar catálogo + emparejar ──────────────────────────────────────────
  const handleFiles = useCallback(async (files: File[]) => {
    const images = files.filter(f => ALLOWED.includes(f.type))
    if (images.length === 0) return

    setLoadingCatalog(true)
    try {
      const [prods, imgSet] = await Promise.all([fetchAllProducts(), fetchProductsWithImages()])
      setProducts(prods)
      setWithImages(imgSet)
      const idx = buildIndexes(prods)
      const result = images.map(f => matchFile(f, idx))
      setMatches(result)
      setStep('review')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrors([{ file: 'catálogo', error: msg }])
      setStep('review')
    } finally {
      setLoadingCatalog(false)
    }
  }, [])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  // ── Resumen del review ─────────────────────────────────────────────────────
  const matched = matches.filter(m => m.productId && !m.tooBig)
  const unmatched = matches.filter(m => !m.productId && !m.tooBig)
  const oversize = matches.filter(m => m.tooBig)

  // Archivos que se subirán según la regla de "ya tiene foto".
  const willUpload = matched.filter(m =>
    appendExisting ? true : !withImages.has(m.productId as string),
  )
  const skippedHasImage = matched.filter(
    m => !appendExisting && withImages.has(m.productId as string),
  )
  const distinctProducts = new Set(willUpload.map(m => m.productId as string)).size

  // ── Subida ─────────────────────────────────────────────────────────────────
  const runUpload = async () => {
    setStep('uploading')
    setUploaded(0)
    setErrors([])
    const localErrors: Array<{ file: string; error: string }> = []
    const doneProducts = new Set<string>()

    // sort_order incremental por producto dentro de este lote.
    const sortCounter = new Map<string, number>()
    const queue = [...willUpload]
    let done = 0

    const worker = async () => {
      while (queue.length > 0) {
        const m = queue.shift()
        if (!m || !m.productId) continue
        const productId = m.productId
        const ext = (m.file.name.split('.').pop() || 'jpg').toLowerCase()
        const id = crypto.randomUUID()
        const path = `${productId}/${id}.${ext}`
        const sortOrder = sortCounter.get(productId) ?? 0
        sortCounter.set(productId, sortOrder + 1)
        try {
          const up = await supabase.storage
            .from('product-images')
            .upload(path, m.file, { upsert: false, contentType: m.file.type })
          if (up.error) throw up.error
          const ins = await supabase.from('product_images').insert({
            id,
            product_id: productId,
            storage_path: path,
            alt: m.productName,
            sort_order: appendExisting ? 100 + sortOrder : sortOrder,
          })
          if (ins.error) throw ins.error
          doneProducts.add(productId)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          localErrors.push({ file: m.file.name, error: msg })
        } finally {
          done++
          setUploaded(done)
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, willUpload.length) }, worker))

    setErrors(localErrors)
    setUploadedProductIds(doneProducts)
    setStep('done')
  }

  // ── Descargas de informe ─────────────────────────────────────────────────────
  const downloadMissing = () => {
    const covered = new Set<string>([...withImages, ...uploadedProductIds])
    const rows: string[][] = [['nombre', 'ean', 'slug']]
    for (const p of products) {
      if (!covered.has(p.id)) rows.push([p.name, p.ean ?? '', p.slug])
    }
    downloadCsv('productos-sin-foto.csv', rows)
  }
  const downloadUnmatched = () => {
    const rows: string[][] = [['archivo']]
    for (const m of unmatched) rows.push([m.file.name])
    downloadCsv('archivos-no-emparejados.csv', rows)
  }

  const reset = () => {
    setStep('select')
    setMatches([])
    setProducts([])
    setWithImages(new Set())
    setUploaded(0)
    setErrors([])
    setUploadedProductIds(new Set())
    setAppendExisting(false)
  }

  // ── STEP: select ──────────────────────────────────────────────────────────
  if (step === 'select') {
    return (
      <div className="space-y-4">
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={clsx(
            'border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all duration-200',
            dragging
              ? 'border-[var(--color-lavender)] bg-[var(--color-lavender)]/10'
              : 'border-[var(--color-card)] hover:border-[var(--color-mid)]/60',
          )}
        >
          <Upload size={40} className="mx-auto mb-4 text-[var(--color-mid)]" aria-hidden="true" />
          <p className="text-lg font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
            Arrastra aquí las fotos, o elige una opción
          </p>
          <p className="text-sm text-[var(--color-mid)] mt-2">
            JPG, PNG o WEBP · máx. 10 MB por imagen
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={e => handleFiles(Array.from(e.target.files ?? []))}
            />
            <input
              ref={el => {
                folderInputRef.current = el
                if (el) el.setAttribute('webkitdirectory', '')
              }}
              type="file"
              multiple
              className="hidden"
              onChange={e => handleFiles(Array.from(e.target.files ?? []))}
            />
            <Button variant="primary" onClick={() => fileInputRef.current?.click()} disabled={loadingCatalog}>
              {loadingCatalog ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
              Seleccionar archivos
            </Button>
            <Button variant="secondary" onClick={() => folderInputRef.current?.click()} disabled={loadingCatalog}>
              <FolderUp size={16} aria-hidden="true" />
              Seleccionar carpeta
            </Button>
          </div>
          {loadingCatalog && (
            <p className="text-xs text-[var(--color-lavender)] mt-4">Cargando catálogo y emparejando…</p>
          )}
        </div>

        <div className="bg-[var(--color-card)]/50 border border-[var(--color-card-hover)] rounded-xl p-4 text-sm text-[var(--color-mid)] font-[var(--font-body)] leading-relaxed">
          <p className="text-[var(--color-cream-dim)] font-[var(--font-cond)] tracking-wide mb-1">Cómo se emparejan las fotos</p>
          Cada archivo se asocia a su producto por <strong className="text-[var(--color-cream-dim)]">EAN</strong> (basta con que el código de barras aparezca en el nombre del archivo, p. ej. <code>4524667345527.jpg</code> o <code>giant_4524667345527_1.jpg</code>). Como respaldo se usa el SKU o el nombre. Puedes subir varias fotos por producto añadiendo un sufijo <code>-1</code>, <code>-2</code>… Los archivos que no casen con ningún producto se listan aparte para que los revises.
        </div>
      </div>
    )
  }

  // ── STEP: review ────────────────────────────────────────────────────────────
  if (step === 'review') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
            Revisión de emparejado
          </h3>
          <Button variant="ghost" size="sm" onClick={reset}>
            <X size={15} aria-hidden="true" /> Empezar de nuevo
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <StatChip tone="ok" label={`${willUpload.length} fotos se subirán`} />
          <StatChip tone="muted" label={`${distinctProducts} productos`} />
          {skippedHasImage.length > 0 && (
            <StatChip tone="muted" label={`${skippedHasImage.length} ya tienen foto (se saltan)`} />
          )}
          {unmatched.length > 0 && (
            <StatChip tone="warn" label={`${unmatched.length} sin emparejar`} />
          )}
          {oversize.length > 0 && (
            <StatChip tone="warn" label={`${oversize.length} superan 10 MB`} />
          )}
        </div>

        <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
          <input
            type="checkbox"
            checked={appendExisting}
            onChange={e => setAppendExisting(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--color-lavender)] cursor-pointer"
          />
          <span className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Añadir fotos también a productos que ya tienen imagen (por defecto se saltan)
          </span>
        </label>

        <div className="bg-[var(--color-card)] rounded-xl overflow-auto max-h-96 border border-[var(--color-card-hover)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-card)]">
              <tr className="border-b border-[var(--color-card-hover)]">
                <th className="px-3 py-2.5 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Archivo</th>
                <th className="px-3 py-2.5 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Producto</th>
                <th className="px-3 py-2.5 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Emparejado por</th>
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, 300).map((m, i) => (
                <tr key={i} className="border-b border-[var(--color-card-hover)]/40 last:border-0">
                  <td className="px-3 py-2 text-[var(--color-cream-dim)] truncate max-w-[240px]" title={m.file.name}>
                    {m.file.name}
                  </td>
                  <td className="px-3 py-2 text-[var(--color-cream-dim)] truncate max-w-[280px]" title={m.productName ?? ''}>
                    {m.tooBig ? (
                      <span className="text-[var(--color-brand-red)]">Supera 10 MB</span>
                    ) : m.productName ? (
                      m.productName
                    ) : (
                      <span className="text-amber-400">Sin emparejar</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {m.reason ? (
                      <span className="uppercase tracking-wide text-[var(--color-lavender)]">{m.reason}</span>
                    ) : (
                      <span className="text-[var(--color-mid)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {matches.length > 300 && (
            <p className="px-3 py-2 text-xs text-[var(--color-mid)] border-t border-[var(--color-card-hover)]">
              Mostrando 300 de {matches.length}. Se procesarán todas.
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-between gap-3">
          {unmatched.length > 0 ? (
            <Button variant="ghost" size="sm" onClick={downloadUnmatched}>
              <Download size={14} aria-hidden="true" /> Descargar no emparejados ({unmatched.length})
            </Button>
          ) : <span />}
          <div className="flex gap-3 ml-auto">
            <Button variant="ghost" onClick={reset}>Cancelar</Button>
            <Button variant="primary" onClick={runUpload} disabled={willUpload.length === 0}>
              Subir {willUpload.length} fotos
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── STEP: uploading / done ──────────────────────────────────────────────────
  const total = willUpload.length
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
        {step === 'uploading' ? 'Subiendo imágenes…' : 'Subida completada'}
      </h3>

      <div className="space-y-3">
        <div className="flex justify-between text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <span>{uploaded} / {total} subidas</span>
          {errors.length > 0 && (
            <span className="text-[var(--color-brand-red)]">{errors.length} con error</span>
          )}
        </div>
        <div className="h-2 bg-[var(--color-card)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-lavender)] transition-all"
            style={{ width: `${total ? (uploaded / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {step === 'done' && (
        <>
          <div className="flex flex-wrap gap-3">
            <StatChip tone="ok" label={`${uploaded - errors.length} fotos subidas`} />
            <StatChip tone="muted" label={`${uploadedProductIds.size} productos con foto nueva`} />
            {unmatched.length > 0 && <StatChip tone="warn" label={`${unmatched.length} archivos sin emparejar`} />}
          </div>

          {errors.length > 0 && (
            <div className="bg-[var(--color-brand-red)]/5 border border-[var(--color-brand-red)]/20 rounded-xl p-4 max-h-52 overflow-auto">
              <p className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-brand-red)] mb-2">ERRORES</p>
              <ul className="space-y-1 text-xs font-[var(--font-body)]">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="text-[var(--color-cream-dim)]">
                    <span className="text-[var(--color-cream)]">{e.file}:</span> <span className="text-[var(--color-mid)]">{e.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" size="sm" onClick={downloadMissing}>
              <Download size={14} aria-hidden="true" /> Descargar productos sin foto
            </Button>
            {unmatched.length > 0 && (
              <Button variant="ghost" size="sm" onClick={downloadUnmatched}>
                <Download size={14} aria-hidden="true" /> Descargar no emparejados
              </Button>
            )}
            <Button variant="primary" size="sm" onClick={reset} className="ml-auto">
              Subir más fotos
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function StatChip({ tone, label }: { tone: 'ok' | 'warn' | 'muted'; label: string }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-2 px-4 py-2.5 rounded-xl border',
        tone === 'ok' && 'bg-[var(--color-lavender)]/10 border-[var(--color-lavender)]/20',
        tone === 'warn' && 'bg-amber-500/10 border-amber-500/20',
        tone === 'muted' && 'bg-[var(--color-card-hover)]/40 border-transparent',
      )}
    >
      {tone === 'ok' && <CheckCircle size={16} className="text-[var(--color-lavender)]" aria-hidden="true" />}
      {tone === 'warn' && <AlertTriangle size={16} className="text-amber-400" aria-hidden="true" />}
      <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">{label}</span>
    </div>
  )
}
