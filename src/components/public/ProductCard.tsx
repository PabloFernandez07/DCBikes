import { clsx } from 'clsx'
import { Bike } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Product, ProductImage } from '@/lib/database.types'

interface ProductCardProps {
  product: Product
  images: ProductImage[]
  onClick: () => void
  /** Override del nombre mostrado (ej. nombre limpio del grupo) */
  displayName?: string
  /** Si se pasa, muestra "desde X €" con este precio mínimo */
  fromPrice?: number
  /** Total de variantes del grupo (>=2 muestra badge "X tallas") */
  variantCount?: number
  /** ¿Alguna variante con is_purchasable=true? */
  onlineAvailable?: boolean
  /** ¿Todas las variantes sin stock? */
  allOutOfStock?: boolean
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0 })
}

export function ProductCard({
  product,
  images,
  onClick,
  displayName,
  fromPrice,
  variantCount,
  onlineAvailable,
  allOutOfStock,
}: ProductCardProps) {
  const mainImageRow = images.find(img => img.sort_order === 0) ?? images[0]
  const mainImage = mainImageRow
    ? { ...mainImageRow, publicUrl: supabase.storage.from('product-images').getPublicUrl(mainImageRow.storage_path).data.publicUrl }
    : null
  const pct = product.discount_percent
  const hasDiscount = pct != null && pct > 0
  const baseFinal = hasDiscount ? product.retail_price * (1 - pct / 100) : product.retail_price
  const finalPrice = fromPrice ?? baseFinal
  const showFromPrice = fromPrice != null && fromPrice !== baseFinal
  const hasMultipleSizes = (variantCount ?? 0) >= 2
  const cardName = displayName ?? product.name

  return (
    <article
      onClick={onClick}
      className={clsx(
        'rv group relative bg-[var(--color-card)] rounded-2xl overflow-hidden cursor-pointer',
        'border border-transparent transition-all duration-300',
        'hover:border-[rgba(196,162,207,0.35)] hover:shadow-[0_0_30px_rgba(196,162,207,0.12)] hover:-translate-y-1',
      )}
      tabIndex={0}
      role="button"
      onKeyDown={e => e.key === 'Enter' && onClick()}
      aria-label={`Ver ${cardName}`}
    >
      <div className="aspect-square bg-white overflow-hidden relative">
        {mainImage ? (
          <img
            src={mainImage.publicUrl}
            alt={mainImage.alt ?? cardName}
            className="w-full h-full object-contain p-4 sm:p-8 transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-mid)]">
            <Bike size={48} strokeWidth={1} aria-hidden="true" />
          </div>
        )}
        {hasDiscount && (
          <span className="absolute top-2 left-2 bg-[var(--color-brand-red)] text-white text-xs font-[var(--font-cond)] font-bold tracking-wide px-2 py-1 rounded-lg">
            -{pct}%
          </span>
        )}
        {/* Badges esquina superior derecha */}
        <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
          {allOutOfStock && (
            <span className="bg-[var(--color-ink)]/85 text-[var(--color-brand-red)] text-[10px] font-[var(--font-cond)] font-bold tracking-widest uppercase px-2 py-1 rounded-md border border-[var(--color-brand-red)]/40">
              Sin stock
            </span>
          )}
          {onlineAvailable && !allOutOfStock && (
            <span className="bg-[var(--color-lavender)] text-[var(--color-ink)] text-[10px] font-[var(--font-cond)] font-bold tracking-widest uppercase px-2 py-1 rounded-md">
              Comprar online
            </span>
          )}
        </div>
      </div>

      <div className="p-4 flex flex-col gap-1">
        <p className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
          {product.brand ?? 'DC Bikes'}
        </p>
        <h3 className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] leading-tight line-clamp-2">
          {cardName}
        </h3>
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          {showFromPrice && (
            <span className="text-[10px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-mid)]">
              desde
            </span>
          )}
          <span className="font-[var(--font-display)] text-xl text-[var(--color-lavender)] tracking-wide">
            {fmt(finalPrice)} €
          </span>
          {hasDiscount && !showFromPrice && (
            <span className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] line-through">
              {fmt(product.retail_price)} €
            </span>
          )}
          {hasMultipleSizes && (
            <span className="ml-auto text-[10px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-cream-dim)] bg-[var(--color-card-hover)] px-1.5 py-0.5 rounded">
              {variantCount} opciones
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--color-lavender)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </article>
  )
}
