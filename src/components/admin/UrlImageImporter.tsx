import { useState, useRef, useCallback } from 'react'
import { clsx } from 'clsx'
import { Upload, X, CheckCircle, AlertTriangle, Download, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'

type Step = 'select' | 'review' | 'running' | 'done'
const MAX_IMAGES = 10
const CONCURRENCY = 3

interface ProductLite {
  id: string
  name: string
  slug: string
  ean: string | null
}

interface RowMatch {
  nombre: string
  ean: string
  urls: string[]
  productId: string | null
  hasImages: boolean
}

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function fetchAllProducts(): Promise<ProductLite[]> {
  const all: ProductLite[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('products').select('id,name,slug,ean').range(from, from + size - 1)
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
      .from('product_images').select('product_id').range(from, from + size - 1)
    if (error) throw error
    const rows = (data as { product_id: string | null }[]) ?? []
    for (const r of rows) if (r.product_id) set.add(r.product_id)
    if (rows.length < size) break
  }
  return set
}

export function UrlImageImporter() {
  const [step, setStep] = useState<Step>('select')
  const [loading, setLoading] = useState(false)
  const [matches, setMatches] = useState<RowMatch[]>([])
  const [notFound, setNotFound] = useState<string[]>([])
  const [replace, setReplace] = useState(false)
  const [processed, setProcessed] = useState(0)
  const [uploaded, setUploaded] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [errors, setErrors] = useState<Array<{ producto: string; error: string }>>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    setLoading(true)
    try {
      // Import dinámico: xlsx pesa ~113 KB gz y solo hace falta al procesar
      // un archivo, no al entrar en cualquier ruta /admin (PERF-M4).
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets['Imagenes'] ?? wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const [products, withImages] = await Promise.all([fetchAllProducts(), fetchProductsWithImages()])
      const byEan = new Map<string, ProductLite>()
      const byName = new Map<string, ProductLite>()
      const bySlug = new Map<string, ProductLite>()
      for (const p of products) {
        if (p.ean) { const e = p.ean.replace(/\D/g, ''); if (e && !byEan.has(e)) byEan.set(e, p) }
        const n = p.name.trim().toUpperCase(); if (!byName.has(n)) byName.set(n, p)
        const sl = p.slug || slugify(p.name); if (sl && !bySlug.has(sl)) bySlug.set(sl, p)
      }

      const result: RowMatch[] = []
      const missing: string[] = []
      for (const r of rows) {
        const nombre = String(r['Nombre'] ?? '').trim()
        const ean = String(r['EAN'] ?? '').trim()
        if (!nombre) continue
        const urls: string[] = []
        for (let i = 1; i <= MAX_IMAGES; i++) {
          const u = String(r[`Imagen_${i}`] ?? '').trim()
          if (/^https?:\/\//i.test(u)) urls.push(u)
        }
        if (urls.length === 0) continue

        let p: ProductLite | undefined
        const eDigits = ean.replace(/\D/g, '')
        if (eDigits) p = byEan.get(eDigits)
        if (!p) p = byName.get(nombre.toUpperCase())
        if (!p) p = bySlug.get(slugify(nombre))

        if (!p) { missing.push(nombre); continue }
        result.push({ nombre, ean, urls, productId: p.id, hasImages: withImages.has(p.id) })
      }

      setMatches(result)
      setNotFound(missing)
      setStep('review')
    } catch (err) {
      setErrors([{ producto: 'archivo', error: err instanceof Error ? err.message : String(err) }])
      setStep('review')
    } finally {
      setLoading(false)
    }
  }, [])

  const willProcess = matches.filter(m => replace || !m.hasImages)
  const skippedHasImages = matches.filter(m => !replace && m.hasImages)
  const totalUrls = willProcess.reduce((a, m) => a + m.urls.length, 0)

  const run = async () => {
    setStep('running')
    setProcessed(0); setUploaded(0); setSkipped(0); setErrors([])
    const localErrors: Array<{ producto: string; error: string }> = []
    let up = 0, sk = 0, done = 0
    const queue = [...willProcess]

    const worker = async () => {
      while (queue.length > 0) {
        const m = queue.shift()
        if (!m || !m.productId) continue
        try {
          const { data, error } = await supabase.functions.invoke('import-product-images', {
            body: { product_id: m.productId, product_name: m.nombre, urls: m.urls, replace },
          })
          if (error) throw error
          const d = data as { uploaded?: number; skipped?: number; errors?: Array<{ url: string; error: string }> }
          up += d.uploaded ?? 0
          sk += d.skipped ?? 0
          if (d.errors && d.errors.length > 0) {
            localErrors.push({ producto: m.nombre, error: `${d.errors.length} img fallaron (${d.errors[0].error})` })
          }
        } catch (err) {
          localErrors.push({ producto: m.nombre, error: err instanceof Error ? err.message : String(err) })
        } finally {
          done++
          setProcessed(done); setUploaded(up); setSkipped(sk)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, willProcess.length) }, worker))
    setErrors(localErrors)
    setStep('done')
  }

  const downloadNotFound = () => {
    const csv = ['nombre', ...notFound].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'no-encontrados.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const reset = () => {
    setStep('select'); setMatches([]); setNotFound([]); setReplace(false)
    setProcessed(0); setUploaded(0); setSkipped(0); setErrors([])
  }

  // ── select ──
  if (step === 'select') {
    return (
      <div className="space-y-4">
        <div
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-[var(--color-card)] hover:border-[var(--color-mid)]/60 rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-colors"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {loading ? (
            <Loader2 size={40} className="mx-auto mb-4 text-[var(--color-lavender)] animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={40} className="mx-auto mb-4 text-[var(--color-mid)]" aria-hidden="true" />
          )}
          <p className="text-lg font-[var(--font-cond)] text-[var(--color-cream)] tracking-wide">
            Sube el Excel de URLs (Productos_imagenes.xlsx)
          </p>
          <p className="text-sm text-[var(--color-mid)] mt-2">
            Lee las columnas Imagen_1..10, empareja cada fila con su producto y descarga las fotos al servidor
          </p>
        </div>
      </div>
    )
  }

  // ── review ──
  if (step === 'review') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">Revisión</h3>
          <Button variant="ghost" size="sm" onClick={reset}><X size={15} aria-hidden="true" /> Empezar de nuevo</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Chip tone="ok" label={`${willProcess.length} productos a procesar`} />
          <Chip tone="muted" label={`${totalUrls} imágenes`} />
          {skippedHasImages.length > 0 && <Chip tone="muted" label={`${skippedHasImages.length} ya tienen foto (se saltan)`} />}
          {notFound.length > 0 && <Chip tone="warn" label={`${notFound.length} sin producto`} />}
        </div>
        <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
          <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)}
            className="w-4 h-4 rounded accent-[var(--color-lavender)] cursor-pointer" />
          <span className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
            Reemplazar imágenes existentes (si no, se saltan los productos que ya tienen foto)
          </span>
        </label>
        <div className="bg-[var(--color-card)] rounded-xl overflow-auto max-h-80 border border-[var(--color-card-hover)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-card)]">
              <tr className="border-b border-[var(--color-card-hover)]">
                <th className="px-3 py-2.5 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Producto</th>
                <th className="px-3 py-2.5 text-right text-[var(--color-mid)] font-[var(--font-cond)]">Imágenes</th>
                <th className="px-3 py-2.5 text-left text-[var(--color-mid)] font-[var(--font-cond)]">Estado</th>
              </tr>
            </thead>
            <tbody>
              {matches.slice(0, 300).map((m, i) => (
                <tr key={i} className="border-b border-[var(--color-card-hover)]/40 last:border-0">
                  <td className="px-3 py-2 text-[var(--color-cream-dim)] truncate max-w-[320px]" title={m.nombre}>{m.nombre}</td>
                  <td className="px-3 py-2 text-right text-[var(--color-cream-dim)] tabular-nums">{m.urls.length}</td>
                  <td className="px-3 py-2 text-xs">
                    {m.hasImages && !replace
                      ? <span className="text-[var(--color-mid)]">ya tiene foto</span>
                      : <span className="text-[var(--color-lavender)]">se subirá</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          {notFound.length > 0
            ? <Button variant="ghost" size="sm" onClick={downloadNotFound}><Download size={14} aria-hidden="true" /> No encontrados ({notFound.length})</Button>
            : <span />}
          <div className="flex gap-3 ml-auto">
            <Button variant="ghost" onClick={reset}>Cancelar</Button>
            <Button variant="primary" onClick={run} disabled={willProcess.length === 0}>
              Descargar y asignar {totalUrls} imágenes
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── running / done ──
  const total = willProcess.length
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-[var(--font-cond)] font-semibold text-[var(--color-cream)] tracking-wide">
        {step === 'running' ? 'Descargando y asignando…' : 'Importación completada'}
      </h3>
      <div className="space-y-3">
        <div className="flex justify-between text-sm text-[var(--color-cream-dim)] font-[var(--font-body)]">
          <span>{processed} / {total} productos · {uploaded} imágenes subidas</span>
          {errors.length > 0 && <span className="text-[var(--color-brand-red)]">{errors.length} con error</span>}
        </div>
        <div className="h-2 bg-[var(--color-card)] rounded-full overflow-hidden">
          <div className="h-full bg-[var(--color-lavender)] transition-all" style={{ width: `${total ? (processed / total) * 100 : 0}%` }} />
        </div>
      </div>
      {step === 'done' && (
        <>
          <div className="flex flex-wrap gap-3">
            <Chip tone="ok" label={`${uploaded} imágenes subidas`} />
            {skipped > 0 && <Chip tone="muted" label={`${skipped} saltadas (ya tenían)`} />}
            {errors.length > 0 && <Chip tone="warn" label={`${errors.length} productos con error`} />}
          </div>
          {errors.length > 0 && (
            <div className="bg-[var(--color-brand-red)]/5 border border-[var(--color-brand-red)]/20 rounded-xl p-4 max-h-52 overflow-auto">
              <ul className="space-y-1 text-xs font-[var(--font-body)]">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i} className="text-[var(--color-cream-dim)]"><span className="text-[var(--color-cream)]">{e.producto}:</span> <span className="text-[var(--color-mid)]">{e.error}</span></li>
                ))}
              </ul>
            </div>
          )}
          <Button variant="primary" size="sm" onClick={reset}>Importar otro Excel</Button>
        </>
      )}
    </div>
  )
}

function Chip({ tone, label }: { tone: 'ok' | 'warn' | 'muted'; label: string }) {
  return (
    <div className={clsx(
      'flex items-center gap-2 px-4 py-2.5 rounded-xl border',
      tone === 'ok' && 'bg-[var(--color-lavender)]/10 border-[var(--color-lavender)]/20',
      tone === 'warn' && 'bg-amber-500/10 border-amber-500/20',
      tone === 'muted' && 'bg-[var(--color-card-hover)]/40 border-transparent',
    )}>
      {tone === 'ok' && <CheckCircle size={16} className="text-[var(--color-lavender)]" aria-hidden="true" />}
      {tone === 'warn' && <AlertTriangle size={16} className="text-amber-400" aria-hidden="true" />}
      <span className="text-sm font-[var(--font-cond)] text-[var(--color-cream)]">{label}</span>
    </div>
  )
}
