import { useState } from 'react'
import { X, Plus, Loader2, Wand2 } from 'lucide-react'
import type { Database } from '@/lib/database.types'
import { supabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/hooks/useToast'
import { KNOWN_COLORS, colorHex, isLightColor } from '@/lib/variant-colors'

type Product = Database['public']['Tables']['products']['Row']

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Genera variantes de color (y opcionalmente talla) clonando un producto base.
 * No cambia el modelo de datos: cada variante sigue siendo una fila en `products`
 * compartiendo `model_group`. Idempotente: no duplica combinaciones que ya existen
 * en el grupo. El stock arranca en 0 y EAN/SKU vacíos (se rellenan luego/por TPV).
 */
export function ColorVariantGenerator({
  open,
  baseProduct,
  onClose,
  onDone,
}: {
  open: boolean
  baseProduct: Product
  onClose: () => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [colors, setColors] = useState<string[]>([])
  const [sizes, setSizes] = useState<string[]>([])
  const [colorInput, setColorInput] = useState('')
  const [sizeInput, setSizeInput] = useState('')
  const [running, setRunning] = useState(false)

  const reset = () => {
    setColors([])
    setSizes([])
    setColorInput('')
    setSizeInput('')
  }

  const addColor = () => {
    const v = colorInput.trim()
    if (v && !colors.some(c => c.toLowerCase() === v.toLowerCase())) {
      setColors(p => [...p, v])
    }
    setColorInput('')
  }
  const addSize = () => {
    const v = sizeInput.trim()
    if (v && !sizes.some(s => s.toLowerCase() === v.toLowerCase())) {
      setSizes(p => [...p, v])
    }
    setSizeInput('')
  }

  const totalCombos = colors.length * (sizes.length || 1)

  const handleGenerate = async () => {
    if (colors.length === 0) {
      toast.error('Añade al menos un color')
      return
    }
    setRunning(true)
    try {
      const group = baseProduct.model_group?.trim() || slugify(baseProduct.name)

      // 1) Asegura que el producto base pertenece al grupo (si no tenía).
      if (!baseProduct.model_group?.trim()) {
        await supabase.from('products').update({ model_group: group }).eq('id', baseProduct.id)
      }

      // 2) Combinaciones que YA existen en el grupo → no las duplicamos.
      const { data: existing } = await supabase
        .from('products')
        .select('color, size_label')
        .eq('model_group', group)
      const existingSet = new Set(
        (existing ?? []).map(r => {
          const row = r as { color: string | null; size_label: string | null }
          return `${(row.color ?? '').toLowerCase()}|${(row.size_label ?? '').toLowerCase()}`
        }),
      )

      // Si no se indican tallas, usamos la talla del producto base (puede ser null).
      const sizesToUse: (string | null)[] = sizes.length ? sizes : [baseProduct.size_label ?? null]

      let created = 0
      let skipped = 0
      for (const color of colors) {
        for (const size of sizesToUse) {
          const key = `${color.toLowerCase()}|${(size ?? '').toLowerCase()}`
          if (existingSet.has(key)) {
            skipped++
            continue
          }
          const baseSlug = slugify(`${baseProduct.name} ${color} ${size ?? ''}`)
          const payload = {
            name: baseProduct.name,
            category_id: baseProduct.category_id,
            brand: baseProduct.brand,
            short_description: baseProduct.short_description,
            description: baseProduct.description,
            retail_price: baseProduct.retail_price,
            discount_percent: baseProduct.discount_percent,
            featured: baseProduct.featured,
            active: baseProduct.active,
            is_purchasable: baseProduct.is_purchasable,
            is_returnable: baseProduct.is_returnable,
            weight_grams: baseProduct.weight_grams,
            flavor: baseProduct.flavor,
            color,
            size_label: size,
            model_group: group,
            ean: null,
            sku: null,
            stock: 0,
            slug: baseSlug,
          }
          // INSERT con reintento de slug (puede colisionar con otro producto).
          let attempt = 1
          let slug = baseSlug
          while (true) {
            const { error } = await supabase.from('products').insert({ ...payload, slug })
            if (!error) {
              created++
              existingSet.add(key)
              break
            }
            const conflict =
              (error as { code?: string }).code === '23505' &&
              /slug/i.test((error as { message?: string }).message ?? '')
            if (!conflict || attempt >= 10) throw error
            attempt++
            slug = `${baseSlug}-${attempt}`
          }
        }
      }

      toast.success(
        `${created} variante${created === 1 ? '' : 's'} creada${created === 1 ? '' : 's'}` +
          (skipped ? ` · ${skipped} ya existían` : ''),
      )
      reset()
      onDone()
    } catch (err) {
      toast.error('Error al generar variantes: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setRunning(false)
    }
  }

  return (
    <Modal open={open} onClose={running ? () => {} : onClose} title="Generar variantes de color">
      <div className="space-y-5">
        <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
          Crea las variantes de <strong className="text-[var(--color-cream)]">{baseProduct.name}</strong> en
          varios colores (y tallas) de golpe. Se clonan los datos de este producto; tú solo
          rellenas el stock y las fotos después. No se duplican las que ya existan.
        </p>

        {/* Colores */}
        <div className="space-y-2">
          <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
            Colores
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              list="known-colors-gen"
              value={colorInput}
              onChange={e => setColorInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addColor()
                }
              }}
              placeholder="Negro, Rojo, Azul marino…"
              className="flex-1 bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg px-3 py-2 text-sm text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
            />
            <datalist id="known-colors-gen">
              {KNOWN_COLORS.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <Button variant="secondary" size="sm" type="button" onClick={addColor}>
              <Plus size={14} aria-hidden="true" />
              Añadir
            </Button>
          </div>
          {colors.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {colors.map(c => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-xs text-[var(--color-cream)]"
                >
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{
                      backgroundColor: colorHex(c),
                      border: isLightColor(c) ? '1px solid var(--color-mid)' : 'none',
                    }}
                    aria-hidden="true"
                  />
                  {c}
                  <button
                    type="button"
                    onClick={() => setColors(prev => prev.filter(x => x !== c))}
                    className="text-[var(--color-mid)] hover:text-[var(--color-brand-red)]"
                    aria-label={`Quitar ${c}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tallas (opcional) */}
        <div className="space-y-2">
          <label className="text-[10px] font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
            Tallas (opcional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={sizeInput}
              onChange={e => setSizeInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addSize()
                }
              }}
              placeholder="S, M, L, 42… (vacío = misma talla que el base)"
              className="flex-1 bg-[var(--color-ink)] border border-[var(--color-card-hover)] rounded-lg px-3 py-2 text-sm text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
            />
            <Button variant="secondary" size="sm" type="button" onClick={addSize}>
              <Plus size={14} aria-hidden="true" />
              Añadir
            </Button>
          </div>
          {sizes.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {sizes.map(s => (
                <span
                  key={s}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--color-ink)] border border-[var(--color-card-hover)] text-xs text-[var(--color-cream)]"
                >
                  {s}
                  <button
                    type="button"
                    onClick={() => setSizes(prev => prev.filter(x => x !== s))}
                    className="text-[var(--color-mid)] hover:text-[var(--color-brand-red)]"
                    aria-label={`Quitar ${s}`}
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--color-card-hover)]">
          <p className="text-xs text-[var(--color-mid)] font-[var(--font-body)]">
            {totalCombos > 0
              ? `Se crearán hasta ${totalCombos} variante${totalCombos === 1 ? '' : 's'} (las que ya existan se omiten).`
              : 'Añade colores para empezar.'}
          </p>
          <div className="flex gap-2 shrink-0">
            <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={running}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={handleGenerate}
              disabled={running || colors.length === 0}
            >
              {running ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Wand2 size={14} aria-hidden="true" />}
              Generar variantes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
