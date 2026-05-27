import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Tag, Package, ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackProductView } from '@/lib/analytics'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import { Button } from '@/components/ui/Button'
import { QuoteModal } from '@/components/public/QuoteModal'
import { SizeSelector } from '@/components/public/SizeSelector'
import { useProductGroup } from '@/hooks/useProductGroup'
import { useCartStore } from '@/stores/cartStore'
import { useUiStore } from '@/stores/uiStore'
import type { ProductImage, Category } from '@/lib/database.types'
import { SEO } from '@/components/layout/SEO'

function useReveal(deps: unknown[] = []) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.1 },
    )
    el.querySelectorAll('.rv').forEach(el => obs.observe(el))
    return () => obs.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const {
    parentProduct,
    variants,
    selectedVariant,
    setSelectedVariant,
    loading,
    error,
  } = useProductGroup(slug)

  const [images, setImages] = useState<ProductImage[]>([])
  const [category, setCategory] = useState<Category | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [minPrice30d, setMinPrice30d] = useState<number | null>(null)
  const pageRef = useReveal([parentProduct, selectedVariant?.id])

  // IMPORTANTE: los hooks de stores deben ir antes de cualquier return condicional
  // (los `if (loading) return ...` más abajo) para no romper las Rules of Hooks.
  const addItem = useCartStore(s => s.addItem)
  const openCart = useUiStore(s => s.openCart)

  // Si error o no encuentra: redirect.
  useEffect(() => {
    if (!loading && (error || !parentProduct)) {
      navigate('/catalogo')
    }
  }, [loading, error, parentProduct, navigate])

  // Track view del producto seleccionado.
  useEffect(() => {
    if (selectedVariant) trackProductView(selectedVariant.id)
  }, [selectedVariant?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch imágenes de TODAS las variantes (algunas pueden compartir, otras no).
  useEffect(() => {
    if (variants.length === 0) {
      setImages([])
      return
    }
    const ids = variants.map(v => v.id)
    supabase
      .from('product_images')
      .select('*')
      .in('product_id', ids)
      .order('sort_order')
      .then(({ data }) => setImages(data ?? []))
  }, [variants])

  // Fetch categoría del padre.
  useEffect(() => {
    if (!parentProduct?.category_id) {
      setCategory(null)
      return
    }
    supabase
      .from('categories')
      .select('*')
      .eq('id', parentProduct.category_id)
      .single()
      .then(({ data }) => setCategory(data))
  }, [parentProduct?.category_id])

  // Omnibus / RDL 1/2007 art. 20.1 — mínimo precio últimos 30 días.
  // Se recarga al cambiar de variante (selectedVariant.id).
  useEffect(() => {
    if (!selectedVariant?.id) {
      setMinPrice30d(null)
      return
    }
    supabase
      .rpc('get_min_price_last_30d', { p_product_id: selectedVariant.id })
      .then(({ data }) => setMinPrice30d(data ?? null))
  }, [selectedVariant?.id])

  // Galería sincronizada con la variante seleccionada:
  //   1. Si la variante seleccionada tiene fotos propias → esas.
  //   2. Si no, fotos del padre del grupo.
  //   3. Si no, primera variante con fotos.
  //   4. Si nadie tiene fotos → array vacío (placeholder en el carousel).
  // Esto permite que al cambiar de talla/color (variante) la galería refleje
  // el aspecto real de esa unidad concreta cuando difiere visualmente.
  const galleryImages = (() => {
    if (!parentProduct) return []
    if (selectedVariant) {
      const variantImgs = images.filter(img => img.product_id === selectedVariant.id)
      if (variantImgs.length > 0) return variantImgs
    }
    const parentImgs = images.filter(img => img.product_id === parentProduct.id)
    if (parentImgs.length > 0) return parentImgs
    for (const v of variants) {
      const imgs = images.filter(img => img.product_id === v.id)
      if (imgs.length > 0) return imgs
    }
    return []
  })()

  const carouselImages = galleryImages.map(img => {
    const { data } = supabase.storage.from('product-images').getPublicUrl(img.storage_path)
    return { url: data.publicUrl, alt: img.alt ?? parentProduct?.name ?? 'Producto' }
  })

  if (loading || !parentProduct || !selectedVariant) {
    return (
      <div className="w-full px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid lg:grid-cols-2 gap-12 animate-pulse">
          <div className="aspect-square bg-[var(--color-card)] rounded-2xl" />
          <div className="flex flex-col gap-4">
            <div className="h-4 w-24 bg-[var(--color-card)] rounded" />
            <div className="h-10 w-3/4 bg-[var(--color-card)] rounded" />
            <div className="h-8 w-32 bg-[var(--color-card)] rounded" />
            <div className="h-24 bg-[var(--color-card)] rounded" />
          </div>
        </div>
      </div>
    )
  }

  const showSizeSelector = variants.length >= 2

  // Nombre limpio: si hay grupo, parent.name suele venir con la talla del primer
  // producto. Para la H1, si hay grupo y el padre tiene size_label, lo quitamos.
  const displayName = (() => {
    if (!showSizeSelector) return parentProduct.name
    const size = parentProduct.size_label
    if (!size) return parentProduct.name
    const escaped = size.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return (
      parentProduct.name.replace(new RegExp(`\\s*[-_,/]?\\s*${escaped}\\s*$`, 'i'), '').trim() ||
      parentProduct.name
    )
  })()

  const pct = selectedVariant.discount_percent
  const hasDiscount = pct != null && pct > 0
  const finalPrice = hasDiscount
    ? selectedVariant.retail_price * (1 - pct / 100)
    : selectedVariant.retail_price
  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 0 })

  const isPurchasable = selectedVariant.is_purchasable
  const inStock = selectedVariant.stock > 0

  const handleAddToCart = () => {
    // Selecciona la primera imagen disponible para el snapshot.
    const firstImage = carouselImages[0]
    addItem(
      selectedVariant.id,
      {
        name: selectedVariant.name,
        size_label: selectedVariant.size_label,
        unit_price_cents: Math.round(finalPrice * 100),
        image_url: firstImage?.url ?? null,
        sku: selectedVariant.sku,
        slug: selectedVariant.slug,
        stock_at_add: selectedVariant.stock,
      },
      1,
    )
    openCart()
  }

  return (
    <div ref={pageRef} className="w-full px-4 sm:px-6 lg:px-8 py-10">
      <SEO
        title={displayName}
        description={parentProduct.short_description ?? `${displayName} disponible en DC Bikes Cantabria, El Astillero. ${parentProduct.brand ? `Marca: ${parentProduct.brand}.` : ''} Consulta precio y disponibilidad.`}
        url={`https://dc-bikes-cantabria.vercel.app/producto/${parentProduct.slug}`}
        type="product"
        breadcrumbs={[
          { name: "Inicio", url: "https://dc-bikes-cantabria.vercel.app" },
          { name: "Catálogo", url: "https://dc-bikes-cantabria.vercel.app/catalogo" },
          ...(category ? [{ name: category.name, url: "https://dc-bikes-cantabria.vercel.app/catalogo" }] : []),
          { name: displayName, url: `https://dc-bikes-cantabria.vercel.app/producto/${parentProduct.slug}` },
        ]}
      />
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 mb-8 text-sm text-[var(--color-mid)] font-[var(--font-cond)]" aria-label="Navegación de migas">
        <Link to="/" className="hover:text-[var(--color-cream)] transition-colors">Inicio</Link>
        <span>/</span>
        <Link to="/catalogo" className="hover:text-[var(--color-cream)] transition-colors">Catálogo</Link>
        {category && (
          <>
            <span>/</span>
            <span className="text-[var(--color-cream-dim)]">{category.name}</span>
          </>
        )}
        <span>/</span>
        <span className="text-[var(--color-lavender)]">{displayName}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
        {/* Images — key cambia al seleccionar otra variante para que el
            carousel se remonte y vuelva al primer slide automáticamente. */}
        <div className="rv">
          <ImageCarousel key={selectedVariant.id} images={carouselImages} />
        </div>

        {/* Info */}
        <div className="rv flex flex-col gap-6" style={{ transitionDelay: '100ms' }}>
          {/* Category badge */}
          {category && (
            <span className="inline-flex items-center gap-1.5 text-xs font-[var(--font-cond)] tracking-widest uppercase text-[var(--color-lavender)] bg-[rgba(196,162,207,0.1)] px-3 py-1.5 rounded-full w-fit">
              <Tag size={12} />
              {category.name}
            </span>
          )}

          {/* Name */}
          <h1 className="font-[var(--font-display)] text-5xl text-[var(--color-cream)] leading-tight tracking-wide">
            {displayName}
          </h1>

          {/* Brand */}
          {parentProduct.brand && (
            <p className="font-[var(--font-cond)] text-base text-[var(--color-mid)] tracking-wide">
              {parentProduct.brand}
            </p>
          )}

          {/* Price */}
          <div className="flex flex-col gap-1">
            {hasDiscount && (
              <div className="flex items-center gap-2">
                <span className="bg-[var(--color-brand-red)] text-white text-sm font-[var(--font-cond)] font-bold tracking-wide px-2.5 py-1 rounded-lg">
                  -{pct}% DESCUENTO
                </span>
              </div>
            )}
            <div className="flex items-baseline gap-3">
              <span className="font-[var(--font-display)] text-4xl text-[var(--color-lavender)] tracking-wide">
                {fmt(finalPrice)} €
              </span>
              {hasDiscount && (
                <span className="font-[var(--font-cond)] text-xl text-[var(--color-mid)] line-through">
                  {fmt(selectedVariant.retail_price)} €
                </span>
              )}
            </div>
            {!hasDiscount && (
              <span className="text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-wide">PVP</span>
            )}
            {/* Omnibus / RDL 1/2007 art. 20.1 — precio de referencia obligatorio */}
            {hasDiscount && minPrice30d != null && (
              <div className="mt-2 space-y-1 text-sm font-[var(--font-cond)]">
                <div className="text-[var(--color-mid)] tracking-wide">
                  Precio anterior (mín. últimos 30 días):{' '}
                  <span className="text-[var(--color-cream-dim)]">{fmt(minPrice30d)} €</span>
                </div>
                {minPrice30d > finalPrice && (
                  <div className="text-green-400 font-bold tracking-wide">
                    Ahorras un {Math.round((1 - finalPrice / minPrice30d) * 100)}% respecto al precio anterior
                  </div>
                )}
              </div>
            )}
          </div>

          {/* L-06 — Info precontractual mínima (art. 97 RDL 1/2007): IVA + plazo */}
          <p className="text-sm text-gray-500 mt-1">
            IVA incluido · Plazo de entrega 2-5 días laborables (Península)
          </p>

          {/* Size selector (solo si hay 2+ variantes) */}
          {showSizeSelector && (
            <div className="border-t border-[var(--color-card)] pt-6">
              <SizeSelector
                variants={variants}
                selectedVariant={selectedVariant}
                onSelect={setSelectedVariant}
              />
            </div>
          )}

          {/* Stock (solo si NO hay selector — el selector ya muestra "X disponibles") */}
          {!showSizeSelector && (
            <div className="flex items-center gap-2">
              <Package size={14} className={inStock ? 'text-green-400' : 'text-[var(--color-brand-red)]'} />
              <span className={`font-[var(--font-cond)] text-sm tracking-wide ${inStock ? 'text-green-400' : 'text-[var(--color-brand-red)]'}`}>
                {inStock
                  ? `${selectedVariant.stock} unidad${selectedVariant.stock !== 1 ? 'es' : ''} disponible${selectedVariant.stock !== 1 ? 's' : ''}`
                  : 'Sin stock'}
              </span>
            </div>
          )}

          {/* Description */}
          {(parentProduct.description ?? parentProduct.short_description) && (
            <div className="border-t border-[var(--color-card)] pt-6">
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed whitespace-pre-line">
                {parentProduct.description ?? parentProduct.short_description}
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {isPurchasable && inStock ? (
              <Button
                variant="primary"
                size="lg"
                onClick={handleAddToCart}
                className="flex-1 font-[var(--font-display)] tracking-widest text-lg"
              >
                <ShoppingCart size={18} />
                Añadir al carrito
              </Button>
            ) : !isPurchasable ? (
              <Button
                variant="primary"
                size="lg"
                onClick={() => setQuoteOpen(true)}
                className="flex-1 font-[var(--font-display)] tracking-widest text-lg"
              >
                Consultar en tienda
              </Button>
            ) : (
              <div className="flex-1 flex flex-col gap-1">
                <Button
                  variant="primary"
                  size="lg"
                  disabled
                  className="w-full font-[var(--font-display)] tracking-widest text-lg"
                >
                  Sin stock
                </Button>
                <span className="text-xs font-[var(--font-cond)] text-[var(--color-mid)] tracking-wide text-center">
                  Consulta disponibilidad en tienda
                </span>
              </div>
            )}
            <Button
              variant="secondary"
              size="lg"
              onClick={() => navigate('/catalogo')}
            >
              <ChevronLeft size={18} />
              Volver
            </Button>
          </div>
        </div>
      </div>

      {quoteOpen && (
        <QuoteModal
          productId={selectedVariant.id}
          product={{
            name: selectedVariant.name,
            brand: selectedVariant.brand,
            retail_price: selectedVariant.retail_price,
            discount_percent: selectedVariant.discount_percent,
          }}
          onClose={() => setQuoteOpen(false)}
        />
      )}
    </div>
  )
}
