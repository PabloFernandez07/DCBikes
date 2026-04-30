import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { trackSearch } from '@/lib/analytics'
import { ProductCard } from '@/components/public/ProductCard'
import { CategoryFilter } from '@/components/public/CategoryFilter'
import { SearchBar } from '@/components/public/SearchBar'
import type { Category, Product, ProductImage } from '@/lib/database.types'

function SkeletonCard() {
  return (
    <div className="bg-[var(--color-card)] rounded-2xl overflow-hidden animate-pulse">
      <div className="aspect-square bg-[var(--color-ink)]" />
      <div className="p-4 flex flex-col gap-2">
        <div className="h-3 w-16 bg-[var(--color-mid)]/30 rounded" />
        <div className="h-5 w-3/4 bg-[var(--color-mid)]/30 rounded" />
        <div className="h-6 w-24 bg-[var(--color-mid)]/20 rounded mt-1" />
      </div>
    </div>
  )
}

function useReveal(deps: unknown[]) {
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
  }, deps)
  return ref
}

export default function Catalog() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [images, setImages] = useState<ProductImage[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const gridRef = useReveal([products, loading])

  useEffect(() => {
    supabase
      .from('categories')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('products').select('*').eq('active', true)
    if (selectedCategory) query = query.eq('category_id', selectedCategory)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    query.order('name').then(({ data }) => {
      const prods = data ?? []
      setProducts(prods)
      setLoading(false)
      if (search.trim()) trackSearch(search.trim(), prods.length)
    })
  }, [search, selectedCategory])

  useEffect(() => {
    if (products.length === 0) { setImages([]); return }
    const ids = products.map(p => p.id)
    supabase
      .from('product_images')
      .select('*')
      .in('product_id', ids)
      .then(({ data }) => setImages(data ?? []))
  }, [products])

  const getProductImages = (productId: string) =>
    images.filter(img => img.product_id === productId).sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="mb-10">
        <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-2">
          Bicicletas & Accesorios
        </p>
        <h1 className="font-[var(--font-display)] text-6xl text-[var(--color-cream)] tracking-wide">
          CATÁLOGO
        </h1>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 mb-10">
        <SearchBar onSearch={setSearch} />
        <CategoryFilter
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />
      </div>

      {/* Grid */}
      <div ref={gridRef}>
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <span className="text-6xl">🚲</span>
            <h3 className="font-[var(--font-cond)] text-2xl text-[var(--color-cream)]">Sin resultados</h3>
            <p className="text-[var(--color-mid)] text-sm">
              No encontramos productos con esos filtros.{' '}
              <button
                className="text-[var(--color-lavender)] hover:underline"
                onClick={() => { setSearch(''); setSelectedCategory(null) }}
              >
                Limpiar filtros
              </button>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
            {products.map((product, i) => (
              <div key={product.id} className="rv" style={{ transitionDelay: `${(i % 8) * 50}ms` }}>
                <ProductCard
                  product={product}
                  images={getProductImages(product.id)}
                  onClick={() => navigate(`/producto/${product.slug}`)}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && (
          <p className="mt-8 text-center text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-wide">
            {products.length} {products.length === 1 ? 'producto' : 'productos'}
          </p>
        )}
      </div>
    </div>
  )
}
