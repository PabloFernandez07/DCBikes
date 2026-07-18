import { clsx } from 'clsx'
import { Bike } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Product, ProductImage } from '@/lib/database.types'

interface ProductCardProps {
  product: Product
  images: ProductImage[]
  /**
   * Destino de la tarjeta, p.ej. `/producto/<slug>`.
   *
   * ES UN ENLACE DE VERDAD, no un onClick. Antes la tarjeta era un
   * `<article onClick role="button">` y en TODO el sitio no había ni un solo
   * `<a href="/producto/...">`: las 114 fichas eran páginas huérfanas, sin un
   * enlace que las descubriera ni que les pasara autoridad. Google las trataba
   * como irrelevantes y les daba el mínimo presupuesto de rastreo.
   *
   * De paso arregla lo obvio: abrir en pestaña nueva, copiar la dirección, ver
   * el destino en la barra de estado, y el teclado sin necesitar onKeyDown.
   */
  href: string
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
  /** ¿Producto de ocasión / segunda mano? */
  secondHand?: boolean
  /**
   * Carga la imagen ya, sin esperar a que la tarjeta se acerque al viewport.
   *
   * En el catálogo el lazy es lo correcto: hay decenas de productos y no tiene
   * sentido bajarlos todos. Pero en la home son 4 tarjetas fijas que el usuario
   * SIEMPRE va a ver, y con el hero de 500vh por delante hay tiempo de sobra
   * para descargarlas. Si se dejan en lazy, llegan justo cuando el usuario está
   * pasando por encima y el navegador tiene que pintarlas en caliente: eso es
   * lo que hacía que el scroll diera un tirón al salir del hero.
   */
  eager?: boolean
}

function fmt(n: number) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 0 })
}

export function ProductCard({
  product,
  images,
  href,
  displayName,
  fromPrice,
  variantCount,
  onlineAvailable,
  allOutOfStock,
  secondHand,
  eager = false,
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
    <Link
      to={href}
      className={clsx(
        'rv group relative block bg-[var(--color-card)] rounded-2xl overflow-hidden',
        'border border-transparent transition-all duration-300',
        'hover:border-[rgba(196,162,207,0.35)] hover:shadow-[0_0_30px_rgba(196,162,207,0.12)] hover:-translate-y-1',
      )}
    >
      <div className="aspect-square bg-white overflow-hidden relative">
        {mainImage ? (
          <img
            src={mainImage.publicUrl}
            alt={mainImage.alt ?? cardName}
            className="w-full h-full object-contain p-4 sm:p-8 transition-transform duration-500 group-hover:scale-105"
            loading={eager ? 'eager' : 'lazy'}
            // La decodificación fuera del hilo principal: aunque la imagen
            // llegue tarde, pintarla no roba un frame al scroll.
            decoding="async"
            // Baja prioridad: que se descargue mientras el usuario mira el
            // hero, sin competir con el vídeo ni con la primera pintada.
            fetchPriority={eager ? 'low' : undefined}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--color-mid)]">
            <Bike size={48} strokeWidth={1} aria-hidden="true" />
          </div>
        )}
        {(hasDiscount || secondHand) && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
            {hasDiscount && (
              <span className="bg-[var(--color-brand-red)] text-white text-xs font-[var(--font-cond)] font-bold tracking-wide px-2 py-1 rounded-lg">
                -{pct}%
              </span>
            )}
            {secondHand && (
              <span className="bg-amber-500 text-[var(--color-ink)] text-[10px] font-[var(--font-cond)] font-bold tracking-widest uppercase px-2 py-1 rounded-md">
                ♻️ Ocasión
              </span>
            )}
          </div>
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
          {/* M-2 (Ómnibus, art. 20.1 TRLGDCU): en el card NO se muestra precio tachado
              porque no disponemos del precio mínimo de 30 días por producto (sería N+1
              llamadas a get_min_price_last_30d). El badge "-X%" + precio final es legal;
              el precio de referencia completo se muestra en la ficha del producto. */}
          {hasMultipleSizes && (
            <span className="ml-auto text-[10px] font-[var(--font-cond)] uppercase tracking-widest text-[var(--color-cream-dim)] bg-[var(--color-card-hover)] px-1.5 py-0.5 rounded">
              {variantCount} opciones
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-0 rounded-2xl ring-2 ring-[var(--color-lavender)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
    </Link>
  )
}
