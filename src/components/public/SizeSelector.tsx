import { clsx } from 'clsx'
import type { Product } from '@/lib/database.types'
import { colorHex, isLightColor } from '@/lib/variant-colors'

interface SizeSelectorProps {
  variants: Product[]
  selectedVariant: Product | null
  onSelect: (variant: Product) => void
}

const sz = (p: Product) => p.size_label?.trim() ?? null

/**
 * Selector de variantes en 2 ejes: COLOR (puntitos) + TALLA (pills).
 *
 * - Una opción sin stock se muestra atenuada con tooltip "Sin stock", pero sigue
 *   siendo seleccionable (para poder pedir "Avísame cuando esté disponible").
 * - Una combinación color+talla que no existe en catálogo sale atenuada con
 *   tooltip "No disponible" y NO es seleccionable.
 * - El eje de color solo aparece si hay 2+ colores; el de talla si hay 2+ tallas.
 *   Así sigue funcionando igual para grupos de solo-talla o solo-color.
 */
export function SizeSelector({ variants, selectedVariant, onSelect }: SizeSelectorProps) {
  if (variants.length < 2) return null

  const colors: string[] = []
  for (const v of variants) if (v.color && !colors.includes(v.color)) colors.push(v.color)
  const sizes: string[] = []
  for (const v of variants) { const s = sz(v); if (s && !sizes.includes(s)) sizes.push(s) }
  const flavors: string[] = []
  for (const v of variants) if (v.flavor && !flavors.includes(v.flavor)) flavors.push(v.flavor)

  const hasColors = colors.length >= 2
  const hasSizes = sizes.length >= 2
  const hasFlavors = flavors.length >= 2

  const selColor = selectedVariant?.color ?? null
  const selSize = sz(selectedVariant ?? ({} as Product))

  const find = (color: string | null, size: string | null) =>
    variants.find(v => (v.color ?? null) === color && sz(v) === size) ?? null

  const flavorVariant = (f: string) =>
    variants.find(v => v.flavor === f && (!hasColors || v.color === selColor) && (!hasSizes || sz(v) === selSize)) ??
    variants.find(v => v.flavor === f) ??
    null

  const colorHasStock = (c: string) => variants.some(v => v.color === c && v.stock > 0)

  const pickColor = (c: string) => {
    const same = selSize ? find(c, selSize) : null
    const target =
      (same && same.stock > 0 ? same : null) ??
      variants.find(v => v.color === c && v.stock > 0) ??
      same ??
      variants.find(v => v.color === c)
    if (target) onSelect(target)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── COLOR ── */}
      {hasColors && (
        <div className="flex flex-col gap-3">
          <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
            Color{selColor ? <span className="text-[var(--color-mid)] normal-case tracking-normal">: {selColor}</span> : null}
          </span>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Color">
            {colors.map(c => {
              const isSel = c === selColor
              const avail = colorHasStock(c)
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  title={avail ? c : `${c} — Sin stock`}
                  aria-label={avail ? c : `${c}, sin stock`}
                  onClick={() => pickColor(c)}
                  className={clsx(
                    'relative w-9 h-9 rounded-full p-0.5 border-2 transition-all duration-200 cursor-pointer',
                    isSel
                      ? 'border-[var(--color-lavender)] ring-2 ring-[rgba(196,162,207,0.4)]'
                      : 'border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.6)]',
                    !avail && 'opacity-40',
                  )}
                >
                  <span
                    className="block w-full h-full rounded-full"
                    style={{ background: colorHex(c), boxShadow: isLightColor(c) ? 'inset 0 0 0 1px rgba(0,0,0,0.15)' : 'none' }}
                  />
                  {!avail && (
                    <span className="absolute left-1/2 top-1/2 w-[120%] h-[2px] bg-[var(--color-brand-red)] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── SABOR ── */}
      {hasFlavors && (
        <div className="flex flex-col gap-3">
          <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
            Sabor{selectedVariant?.flavor ? <span className="text-[var(--color-mid)] normal-case tracking-normal">: {selectedVariant.flavor}</span> : null}
          </span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sabor">
            {flavors.map(f => {
              const v = flavorVariant(f)
              const exists = !!v
              const inStock = !!v && v.stock > 0
              const isSel = exists && selectedVariant?.id === v!.id
              const title = !exists ? 'No disponible' : inStock ? '' : 'Sin stock'
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  aria-disabled={!exists}
                  title={title}
                  onClick={() => exists && onSelect(v!)}
                  className={clsx(
                    'px-4 py-2 rounded-xl text-sm font-[var(--font-cond)] tracking-wide border transition-all duration-200',
                    isSel
                      ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)] font-semibold'
                      : !exists
                        ? 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] opacity-30 cursor-not-allowed line-through'
                        : !inStock
                          ? 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] opacity-45 cursor-pointer line-through'
                          : 'bg-transparent text-[var(--color-cream)] border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.5)] hover:text-[var(--color-lavender)] cursor-pointer',
                  )}
                >
                  {f}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TALLA ── */}
      {hasSizes && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-[var(--font-cond)] text-sm uppercase tracking-widest text-[var(--color-cream-dim)]">
              Talla
            </span>
            {selectedVariant && (
              <span className="text-xs font-[var(--font-cond)] tracking-wide text-[var(--color-mid)]">
                {selectedVariant.stock > 0
                  ? `${selectedVariant.stock} disponible${selectedVariant.stock !== 1 ? 's' : ''}`
                  : 'Sin stock'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Talla">
            {sizes.map(size => {
              const v = hasColors ? find(selColor, size) : variants.find(x => sz(x) === size)
              const exists = !!v
              const inStock = !!v && v.stock > 0
              const isSel = exists && selectedVariant?.id === v!.id
              const title = !exists ? 'No disponible en este color' : inStock ? '' : 'Sin stock'
              return (
                <button
                  key={size}
                  type="button"
                  role="radio"
                  aria-checked={isSel}
                  aria-disabled={!exists}
                  title={title}
                  onClick={() => exists && onSelect(v!)}
                  className={clsx(
                    'min-w-[3.5rem] px-4 py-2 rounded-xl text-sm font-[var(--font-cond)] tracking-wide border transition-all duration-200',
                    isSel
                      ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)] font-semibold'
                      : !exists
                        ? 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] opacity-30 cursor-not-allowed line-through'
                        : !inStock
                          ? 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] opacity-45 cursor-pointer line-through'
                          : 'bg-transparent text-[var(--color-cream)] border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.5)] hover:text-[var(--color-lavender)] cursor-pointer',
                  )}
                >
                  {size}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Solo color (sin tallas): mostrar stock del color elegido */}
      {hasColors && !hasSizes && selectedVariant && (
        <span className={clsx('font-[var(--font-cond)] text-sm tracking-wide', selectedVariant.stock > 0 ? 'text-green-400' : 'text-[var(--color-brand-red)]')}>
          {selectedVariant.stock > 0
            ? `${selectedVariant.stock} unidad${selectedVariant.stock !== 1 ? 'es' : ''} disponible${selectedVariant.stock !== 1 ? 's' : ''}`
            : 'Sin stock'}
        </span>
      )}
    </div>
  )
}
