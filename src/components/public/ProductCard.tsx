import { clsx } from 'clsx'
import { Bike } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Product, ProductImage } from '@/lib/database.types'

interface ProductCardProps {
  product: Product
  images: ProductImage[]
  onClick: () => void
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0 })
}

export function ProductCard({ product, images, onClick }: ProductCardProps) {
  const mainImageRow = images.find(img => img.sort_order === 0) ?? images[0]
  const mainImage = mainImageRow
    ? { ...mainImageRow, publicUrl: supabase.storage.from('product-images').getPublicUrl(mainImageRow.storage_path).data.publicUrl }
    : null
  const pct = product.discount_percent
  const hasDiscount = pct != null && pct > 0
  const finalPrice = hasDiscount
    ? product.retail_price * (1 - pct / 100)
    : product.retail_price

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
      aria-label={`Ver ${product.name}`}
    >
      <div className="aspect-square bg-[var(--color-ink)] overflow-hidden relative">
        {mainImage ? (
          <img
            src={mainImage.publicUrl}
            alt={mainImage.alt ?? product.name}
            className="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-mid)]">
            <Bike size={48} strokeWidth={1} />
          </div>
        )}
        {hasDiscount && (
          <span className="absolute top-2 left-2 bg-[var(--color-brand-red)] text-white text-xs font-[var(--font-cond)] font-bold tracking-wide px-2 py-1 rounded-lg">
            -{pct}%
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col gap-1">
        <p className="text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-mid)]">
          {product.brand ?? 'DC Bikes'}
        </p>
        <h3 className="font-[var(--font-cond)] text-base font-semibold text-[var(--color-cream)] leading-tight line-clamp-2">
          {product.name}
        </h3>
        <div className="mt-2 flex items-baseline gap-2 flex-wrap">
          <span className="font-[var(--font-display)] text-xl text-[var(--color-lavender)] tracking-wide">
            {fmt(finalPrice)} €
          </span>
          {hasDiscount && (
            <span className="font-[var(--font-cond)] text-sm text-[var(--color-mid)] line-through">
              {fmt(product.retail_price)} €
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--color-lavender)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </article>
  )
}
