import { useEffect, useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, X, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { trackSearch } from '@/lib/analytics'
import { ProductCard } from '@/components/public/ProductCard'
import { SearchBar } from '@/components/public/SearchBar'
import type { Category, Product, ProductImage } from '@/lib/database.types'
import { SEO } from '@/components/layout/SEO'

type SortKey = 'name' | 'price_asc' | 'price_desc' | 'discount' | 'newest'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name',       label: 'Nombre A–Z' },
  { key: 'price_asc',  label: 'Precio: menor a mayor' },
  { key: 'price_desc', label: 'Precio: mayor a menor' },
  { key: 'discount',   label: 'Ofertas primero' },
  { key: 'newest',     label: 'Más recientes' },
]

function sortProducts(products: Product[], sort: SortKey): Product[] {
  const arr = [...products]
  switch (sort) {
    case 'price_asc':
      return arr.sort((a, b) => {
        const pa = a.discount_percent ? a.retail_price * (1 - a.discount_percent / 100) : a.retail_price
        const pb = b.discount_percent ? b.retail_price * (1 - b.discount_percent / 100) : b.retail_price
        return pa - pb
      })
    case 'price_desc':
      return arr.sort((a, b) => {
        const pa = a.discount_percent ? a.retail_price * (1 - a.discount_percent / 100) : a.retail_price
        const pb = b.discount_percent ? b.retail_price * (1 - b.discount_percent / 100) : b.retail_price
        return pb - pa
      })
    case 'discount':
      return arr.sort((a, b) => (b.discount_percent ?? 0) - (a.discount_percent ?? 0))
    case 'newest':
      return arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    default:
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }
}

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
  const [sort, setSort] = useState<SortKey>('name')
  const [sortOpen, setSortOpen] = useState(false)
  const gridRef = useReveal([products, loading])

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  useEffect(() => {
    setLoading(true)
    let query = supabase.from('products').select('*').eq('active', true)
    if (selectedCategory) query = query.eq('category_id', selectedCategory)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    query.then(({ data }) => {
      const prods = data ?? []
      setProducts(prods)
      setLoading(false)
      if (search.trim()) trackSearch(search.trim(), prods.length)
    })
  }, [search, selectedCategory])

  useEffect(() => {
    if (products.length === 0) { setImages([]); return }
    const ids = products.map(p => p.id)
    supabase.from('product_images').select('*').in('product_id', ids)
      .then(({ data }) => setImages(data ?? []))
  }, [products])

  const sorted = useMemo(() => sortProducts(products, sort), [products, sort])

  const getProductImages = (productId: string) =>
    images.filter(img => img.product_id === productId).sort((a, b) => a.sort_order - b.sort_order)

  const hasOffers = products.some(p => p.discount_percent && p.discount_percent > 0)
  const activeFilters = [
    selectedCategory && categories.find(c => c.id === selectedCategory)?.name,
    search.trim() && `"${search.trim()}"`,
  ].filter(Boolean)

  const clearAll = () => { setSearch(''); setSelectedCategory(null) }

  return (
    <div className="w-full">
      <SEO
        title="Catálogo"
        description="Explora nuestra selección de bicicletas de montaña, carretera, urbanas y eléctricas. Giant, Liv, Stevens y más marcas en El Astillero, Cantabria."
        url="https://dc-bikes-cantabria.vercel.app/catalogo"
        breadcrumbs={[
          { name: "Inicio", url: "https://dc-bikes-cantabria.vercel.app" },
          { name: "Catálogo", url: "https://dc-bikes-cantabria.vercel.app/catalogo" },
        ]}
      />
      {/* Header */}
      <section className="relative py-20 overflow-hidden border-b border-[var(--color-card)]">
        <span className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[18vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none" aria-hidden="true">
          CATÁLOGO
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Bicicletas & Accesorios
          </p>
          <h1 className="font-[var(--font-display)] text-8xl lg:text-[9rem] text-[var(--color-cream)] tracking-wide leading-none">
            CATÁLOGO
          </h1>
          <p className="mt-4 text-[var(--color-mid)] font-[var(--font-body)] text-base">
            {loading ? '—' : `${products.length} ${products.length === 1 ? 'producto' : 'productos'}`}
            {selectedCategory && ` · ${categories.find(c => c.id === selectedCategory)?.name}`}
          </p>
        </div>
      </section>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls bar */}
        <div className="flex flex-col lg:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="flex-1">
            <SearchBar onSearch={setSearch} />
          </div>

          {/* Sort dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setSortOpen(v => !v)}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[rgba(196,162,207,0.3)] text-[var(--color-cream-dim)] font-[var(--font-cond)] text-sm tracking-wide transition-all w-full lg:w-auto"
            >
              <SlidersHorizontal size={15} className="text-[var(--color-lavender)]" />
              <span>{SORT_OPTIONS.find(o => o.key === sort)?.label}</span>
              <ChevronDown size={14} className={clsx('ml-auto transition-transform', sortOpen && 'rotate-180')} />
            </button>
            {sortOpen && (
              <div className="absolute right-0 top-full mt-2 z-20 bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl shadow-xl overflow-hidden min-w-[220px]">
                {SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => { setSort(opt.key); setSortOpen(false) }}
                    className={clsx(
                      'w-full text-left px-4 py-3 text-sm font-[var(--font-cond)] tracking-wide transition-colors',
                      sort === opt.key
                        ? 'text-[var(--color-lavender)] bg-[rgba(196,162,207,0.08)]'
                        : 'text-[var(--color-cream-dim)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card-hover)]',
                    )}
                  >
                    {opt.key === 'discount' && '🏷️ '}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className={clsx(
              'px-4 py-1.5 rounded-full text-sm font-[var(--font-cond)] tracking-wide transition-all duration-200 border',
              selectedCategory === null
                ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)]'
                : 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] hover:text-[var(--color-cream)] hover:border-[rgba(196,162,207,0.3)]',
            )}
          >
            Todos
          </button>
          {hasOffers && (
            <button
              type="button"
              onClick={() => { setSelectedCategory(null); setSort('discount') }}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm font-[var(--font-cond)] tracking-wide transition-all duration-200 border flex items-center gap-1.5',
                sort === 'discount' && selectedCategory === null
                  ? 'bg-[var(--color-brand-red)] text-white border-[var(--color-brand-red)]'
                  : 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] hover:text-[var(--color-cream)] hover:border-[var(--color-brand-red)]/50',
              )}
            >
              🏷️ Ofertas
            </button>
          )}
          {categories.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={clsx(
                'px-4 py-1.5 rounded-full text-sm font-[var(--font-cond)] tracking-wide transition-all duration-200 border',
                selectedCategory === cat.id
                  ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] border-[var(--color-lavender)]'
                  : 'bg-transparent text-[var(--color-mid)] border-[var(--color-card-hover)] hover:text-[var(--color-cream)] hover:border-[rgba(196,162,207,0.3)]',
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Active filters */}
        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-xs text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Filtros activos:</span>
            {activeFilters.map(f => (
              <span key={f} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[rgba(196,162,207,0.1)] border border-[rgba(196,162,207,0.2)] text-xs font-[var(--font-cond)] text-[var(--color-lavender)] tracking-wide">
                {f}
              </span>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-mid)] hover:text-[var(--color-brand-red)] font-[var(--font-cond)] tracking-wide transition-colors"
            >
              <X size={12} />
              Limpiar todo
            </button>
          </div>
        )}

        {/* Grid */}
        <div ref={gridRef}>
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
              <span className="font-[var(--font-display)] text-8xl text-[rgba(196,162,207,0.1)]">?</span>
              <h3 className="font-[var(--font-display)] text-3xl text-[var(--color-cream)] tracking-wide">SIN RESULTADOS</h3>
              <p className="text-[var(--color-mid)] text-sm font-[var(--font-body)]">
                No encontramos productos con esos filtros.
              </p>
              <button
                className="mt-2 px-5 py-2 rounded-xl border border-[rgba(196,162,207,0.3)] text-[var(--color-lavender)] font-[var(--font-cond)] text-sm tracking-wide hover:bg-[rgba(196,162,207,0.08)] transition-colors"
                onClick={clearAll}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {sorted.map((product, i) => (
                <div key={product.id} className="rv" style={{ transitionDelay: `${(i % 8) * 40}ms` }}>
                  <ProductCard
                    product={product}
                    images={getProductImages(product.id)}
                    onClick={() => navigate(`/producto/${product.slug}`)}
                  />
                </div>
              ))}
            </div>
          )}

          {!loading && sorted.length > 0 && (
            <p className="mt-10 text-center text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-widest uppercase">
              — {sorted.length} {sorted.length === 1 ? 'producto' : 'productos'} —
            </p>
          )}
        </div>
      </div>

      {/* Click outside to close sort dropdown */}
      {sortOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setSortOpen(false)} />
      )}
    </div>
  )
}
