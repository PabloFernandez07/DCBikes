import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Tag, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { trackProductView } from '@/lib/analytics'
import { ImageCarousel } from '@/components/ui/ImageCarousel'
import { Button } from '@/components/ui/Button'
import { QuoteModal } from '@/components/public/QuoteModal'
import type { Product, ProductImage, Category } from '@/lib/database.types'

function useReveal() {
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
  }, [])
  return ref
}

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<Product | null>(null)
  const [images, setImages] = useState<ProductImage[]>([])
  const [category, setCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const pageRef = useReveal()

  useEffect(() => {
    if (!slug) return
    setLoading(true)

    supabase
      .from('products')
      .select('*')
      .eq('slug', slug)
      .eq('active', true)
      .single()
      .then(({ data }) => {
        if (!data) { navigate('/catalogo'); return }
        setProduct(data)
        trackProductView(data.id)

        supabase
          .from('product_images')
          .select('*')
          .eq('product_id', data.id)
          .order('sort_order')
          .then(({ data: imgs }) => setImages(imgs ?? []))

        supabase
          .from('categories')
          .select('*')
          .eq('id', data.category_id)
          .single()
          .then(({ data: cat }) => setCategory(cat))

        setLoading(false)
      })
  }, [slug, navigate])

  const carouselImages = images.map(img => ({
    url: img.storage_path,
    alt: img.alt ?? product?.name ?? 'Producto',
  }))

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
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

  if (!product) return null

  return (
    <div ref={pageRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
        <span className="text-[var(--color-lavender)]">{product.name}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
        {/* Images */}
        <div className="rv">
          <ImageCarousel images={carouselImages} />
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
            {product.name}
          </h1>

          {/* Brand */}
          {product.brand && (
            <p className="font-[var(--font-cond)] text-base text-[var(--color-mid)] tracking-wide">
              {product.brand}
            </p>
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="font-[var(--font-display)] text-4xl text-[var(--color-lavender)] tracking-wide">
              {product.retail_price.toLocaleString('es-ES', { minimumFractionDigits: 0 })} €
            </span>
            <span className="text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-wide">PVP</span>
          </div>

          {/* Stock */}
          <div className="flex items-center gap-2">
            <Package size={14} className={product.stock > 0 ? 'text-green-400' : 'text-[var(--color-brand-red)]'} />
            <span className={`font-[var(--font-cond)] text-sm tracking-wide ${product.stock > 0 ? 'text-green-400' : 'text-[var(--color-brand-red)]'}`}>
              {product.stock > 0 ? `${product.stock} unidad${product.stock !== 1 ? 'es' : ''} disponible${product.stock !== 1 ? 's' : ''}` : 'Sin stock'}
            </span>
          </div>

          {/* Description */}
          {(product.description ?? product.short_description) && (
            <div className="border-t border-[var(--color-card)] pt-6">
              <p className="text-[var(--color-mid)] font-[var(--font-body)] text-base leading-relaxed whitespace-pre-line">
                {product.description ?? product.short_description}
              </p>
            </div>
          )}

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setQuoteOpen(true)}
              className="flex-1 font-[var(--font-display)] tracking-widest text-lg"
            >
              Pedir presupuesto
            </Button>
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

      {quoteOpen && <QuoteModal productId={product.id} onClose={() => setQuoteOpen(false)} />}
    </div>
  )
}
