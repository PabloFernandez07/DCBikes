import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { trackSearch } from '@/lib/analytics'
import { ProductCard } from '@/components/public/ProductCard'
import { SearchBar } from '@/components/public/SearchBar'
import type { Category, Product, ProductImage } from '@/lib/database.types'
import { SEO } from '@/components/layout/SEO'
import { cleanGroupName } from '@/lib/variant-colors'

type SortKey = 'name' | 'price_asc' | 'price_desc' | 'discount' | 'newest'

/**
 * PERF-M2a: columnas que el catálogo usa de verdad, en vez de `select('*')`.
 * - ProductCard lee: name, brand, retail_price, discount_percent.
 * - El agrupado/orden (buildCatalogCards/sortCards) usa: id, slug, name,
 *   size_label, model_group, retail_price, discount_percent, stock,
 *   is_purchasable, created_at.
 * - category_id se usa para derivar las categorías activas (PERF-M2b).
 * Evita arrastrar description, safety_standards, ean, etc. en el payload.
 */
const CATALOG_COLUMNS =
  'id,slug,name,brand,retail_price,discount_percent,stock,is_purchasable,size_label,model_group,created_at,category_id'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name',       label: 'Nombre A–Z' },
  { key: 'price_asc',  label: 'Precio: menor a mayor' },
  { key: 'price_desc', label: 'Precio: mayor a menor' },
  { key: 'discount',   label: 'Ofertas primero' },
  { key: 'newest',     label: 'Más recientes' },
]

/**
 * Una "card del catálogo" es un grupo (model_group) o un producto suelto.
 * Internamente normalizamos todo a una estructura uniforme.
 */
interface CatalogCard {
  /** Producto padre del grupo (primero ordenado o el suelto) usado para imagen/slug/nombre */
  parent: Product
  /** Variantes del grupo. Si producto suelto, length === 1 */
  variants: Product[]
  /** Nombre limpio derivado del grupo (sin sufijo de talla cuando aplica) */
  displayName: string
  /** Precio mínimo (con descuento aplicado por variante si lo hubiera) */
  minPrice: number
  /** Precio máximo (idem) */
  maxPrice: number
  /** Todas las variantes con stock 0 */
  allOutOfStock: boolean
  /** Alguna variante con is_purchasable=true */
  onlineAvailable: boolean
}

function effectivePrice(p: Product): number {
  return p.discount_percent && p.discount_percent > 0
    ? p.retail_price * (1 - p.discount_percent / 100)
    : p.retail_price
}


function buildCatalogCards(products: Product[]): CatalogCard[] {
  const grouped = new Map<string, Product[]>()
  const individuals: Product[] = []

  for (const p of products) {
    if (p.model_group) {
      const list = grouped.get(p.model_group) ?? []
      list.push(p)
      grouped.set(p.model_group, list)
    } else {
      individuals.push(p)
    }
  }

  const cards: CatalogCard[] = []

  for (const [, variants] of grouped) {
    // Padre: el primero con imagen sería ideal, pero como no tenemos imágenes
    // aquí, usamos simplemente el primero por nombre (estable).
    const sortedByName = [...variants].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    const parent = sortedByName[0]
    const displayName = cleanGroupName(parent.name, parent.size_label)
    const prices = variants.map(effectivePrice)
    const minPrice = Math.min(...prices)
    const maxPrice = Math.max(...prices)
    const allOutOfStock = variants.every(v => v.stock <= 0)
    const onlineAvailable = variants.some(v => v.is_purchasable)
    cards.push({
      parent,
      variants,
      displayName,
      minPrice,
      maxPrice,
      allOutOfStock,
      onlineAvailable,
    })
  }

  for (const p of individuals) {
    cards.push({
      parent: p,
      variants: [p],
      displayName: p.name,
      minPrice: effectivePrice(p),
      maxPrice: effectivePrice(p),
      allOutOfStock: p.stock <= 0,
      onlineAvailable: p.is_purchasable,
    })
  }

  return cards
}

function sortCards(cards: CatalogCard[], sort: SortKey): CatalogCard[] {
  const arr = [...cards]
  switch (sort) {
    case 'price_asc':
      return arr.sort((a, b) => a.minPrice - b.minPrice)
    case 'price_desc':
      return arr.sort((a, b) => b.maxPrice - a.maxPrice)
    case 'discount':
      return arr.sort((a, b) => (b.parent.discount_percent ?? 0) - (a.parent.discount_percent ?? 0))
    case 'newest':
      return arr.sort((a, b) => new Date(b.parent.created_at).getTime() - new Date(a.parent.created_at).getTime())
    default:
      return arr.sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'))
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
  const catScrollRef = useRef<HTMLDivElement>(null)
  const scrollCats = (dx: number) => catScrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' })
  // Estado de scroll: si hay contenido desbordado a izquierda/derecha (para
  // mostrar flechas y degradados solo cuando realmente hace falta desplazar).
  const [catScroll, setCatScroll] = useState({ left: false, right: false })
  const updateCatScroll = useCallback(() => {
    const el = catScrollRef.current
    if (!el) return
    const left = el.scrollLeft > 4
    const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 4
    setCatScroll(s => (s.left === left && s.right === right ? s : { left, right }))
  }, [])
  const [sort, setSort] = useState<SortKey>('name')
  const [sortOpen, setSortOpen] = useState(false)
  const gridRef = useReveal([products, loading])

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  // IDs de categorías que tienen al menos un producto ACTIVO (visible en web).
  // Solo esas se muestran como filtro, para no saturar con categorías vacías.
  //
  // PERF-M2b: en vez del antiguo bucle paginado extra que recorría TODOS los
  // productos solo para leer category_id, derivamos el set de la carga SIN
  // filtros (la inicial trae el catálogo completo; ver query de productos más
  // abajo). Solo se recalcula cuando no hay filtros activos para que las
  // pills no desaparezcan al filtrar. Limitación: cubre los primeros 1000
  // productos (límite por defecto de PostgREST), el mismo que ya aplicaba a
  // la query principal del grid.
  const [activeCatIds, setActiveCatIds] = useState<Set<string>>(new Set())

  const visibleCategories = useMemo(
    () => categories.filter(c => activeCatIds.has(c.id)),
    [categories, activeCatIds],
  )

  useEffect(() => {
    updateCatScroll()
    const el = catScrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateCatScroll, { passive: true })
    window.addEventListener('resize', updateCatScroll)
    return () => {
      el.removeEventListener('scroll', updateCatScroll)
      window.removeEventListener('resize', updateCatScroll)
    }
  }, [updateCatScroll, visibleCategories, products])

  // PERF-M5: contador de secuencia para descartar respuestas obsoletas. Si
  // el usuario cambia término/categoría con una query en vuelo, la respuesta
  // antigua puede llegar DESPUÉS de la nueva y pisar el estado. El debounce
  // de la búsqueda (400 ms) ya lo aplica SearchBar antes de llamar a
  // onSearch, así que aquí solo llega un término "asentado" por tecleo.
  const requestSeqRef = useRef(0)

  useEffect(() => {
    setLoading(true)
    const seq = ++requestSeqRef.current
    let query = supabase.from('products').select(CATALOG_COLUMNS).eq('active', true)
    if (selectedCategory) query = query.eq('category_id', selectedCategory)
    if (search.trim()) query = query.ilike('name', `%${search.trim()}%`)
    query.then(({ data }) => {
      if (seq !== requestSeqRef.current) return // respuesta obsoleta: descartada
      const prods = ((data as unknown) as Product[] | null) ?? []
      setProducts(prods)
      setLoading(false)
      // PERF-M2b: con la carga completa (sin filtros) derivamos qué
      // categorías tienen productos activos, sin query extra.
      if (!selectedCategory && !search.trim()) {
        const set = new Set<string>()
        for (const p of prods) if (p.category_id) set.add(p.category_id)
        setActiveCatIds(set)
      }
      // Solo se registra la búsqueda de la respuesta vigente → trackSearch
      // queda debounced de serie (una inserción por término asentado).
      if (search.trim()) trackSearch(search.trim(), prods.length)
    })
  }, [search, selectedCategory])

  useEffect(() => {
    if (products.length === 0) { setImages([]); return }
    const ids = products.map(p => p.id)
    supabase.from('product_images').select('*').in('product_id', ids)
      .then(({ data }) => setImages(data ?? []))
  }, [products])

  const cards = useMemo(() => buildCatalogCards(products), [products])
  const sortedCards = useMemo(() => sortCards(cards, sort), [cards, sort])

  // PERF-M2c: pre-indexamos las imágenes por product_id (ya ordenadas por
  // sort_order) UNA vez por cambio de `images`, en vez de filtrar + ordenar
  // el array global por cada card en cada render (O(cards × imágenes)).
  const imagesByProduct = useMemo(() => {
    const map = new Map<string, ProductImage[]>()
    for (const img of images) {
      const list = map.get(img.product_id)
      if (list) list.push(img)
      else map.set(img.product_id, [img])
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order)
    }
    return map
  }, [images])

  // Para que la imagen del card pueda venir de cualquier variante del grupo
  // (no solo del padre), permitimos buscar imágenes entre todas las variantes
  // y, si el padre no tiene foto, devolver las del primer producto del grupo
  // que tenga.
  const getProductImagesForCard = (card: CatalogCard) => {
    for (const variant of card.variants) {
      const imgs = imagesByProduct.get(variant.id)
      if (imgs && imgs.length > 0) return imgs
    }
    return []
  }

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
        url="https://dcbikescantabria.com/catalogo"
        breadcrumbs={[
          { name: "Inicio", url: "https://dcbikescantabria.com" },
          { name: "Catálogo", url: "https://dcbikescantabria.com/catalogo" },
        ]}
      />
      {/* Header */}
      <section className="relative py-12 md:py-20 overflow-hidden border-b border-[var(--color-card)]">
        <span className="absolute right-0 top-1/2 -translate-y-1/2 font-[var(--font-display)] text-[18vw] leading-none text-[rgba(196,162,207,0.03)] select-none pointer-events-none" aria-hidden="true">
          CATÁLOGO
        </span>
        <div className="w-full px-4 sm:px-6 lg:px-8 relative">
          <p className="font-[var(--font-cond)] text-sm tracking-widest uppercase text-[var(--color-lavender)] mb-3">
            Bicicletas & Accesorios
          </p>
          <h1 className="font-[var(--font-display)] text-6xl sm:text-7xl md:text-8xl lg:text-[9rem] text-[var(--color-cream)] tracking-wide leading-none">
            CATÁLOGO
          </h1>
          <p className="mt-4 text-[var(--color-mid)] font-[var(--font-body)] text-base">
            {loading ? '—' : `${cards.length} ${cards.length === 1 ? 'modelo' : 'modelos'}`}
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
              <SlidersHorizontal size={15} className="text-[var(--color-lavender)]" aria-hidden="true" />
              <span>{SORT_OPTIONS.find(o => o.key === sort)?.label}</span>
              <ChevronDown size={14} className={clsx('ml-auto transition-transform', sortOpen && 'rotate-180')} aria-hidden="true" />
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
                    {opt.key === 'discount' && <span aria-hidden="true">🏷️ </span>}
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Category pills — carrusel horizontal de una sola línea */}
        <div className="relative mb-6">
          {/* Degradados en los bordes — solo cuando hay contenido desbordado */}
          {catScroll.left && (
            <div className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10 bg-gradient-to-r from-[var(--color-ink)] to-transparent" aria-hidden="true" />
          )}
          {catScroll.right && (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10 bg-gradient-to-l from-[var(--color-ink)] to-transparent" aria-hidden="true" />
          )}

          {/* Flechas de scroll (solo escritorio, solo si hay desbordamiento) */}
          {catScroll.left && (
            <button
              type="button"
              aria-label="Categorías anteriores"
              onClick={() => scrollCats(-320)}
              className="hidden md:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-8 h-8 rounded-full bg-[var(--color-card)] border border-[var(--color-card-hover)] text-[var(--color-cream-dim)] shadow-md hover:border-[rgba(196,162,207,0.45)] hover:text-[var(--color-lavender)] transition-all duration-200"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          )}
          {catScroll.right && (
            <button
              type="button"
              aria-label="Categorías siguientes"
              onClick={() => scrollCats(320)}
              className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 items-center justify-center w-8 h-8 rounded-full bg-[var(--color-card)] border border-[var(--color-card-hover)] text-[var(--color-cream-dim)] shadow-md hover:border-[rgba(196,162,207,0.45)] hover:text-[var(--color-lavender)] transition-all duration-200"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}

          <div
            ref={catScrollRef}
            className="flex items-center gap-1.5 overflow-x-auto scroll-smooth snap-x px-0.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={clsx(
                'shrink-0 snap-start whitespace-nowrap px-4 py-2 rounded-full text-sm font-[var(--font-cond)] tracking-wide transition-all duration-200',
                selectedCategory === null
                  ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] shadow-[0_6px_18px_-7px_rgba(196,162,207,0.55)]'
                  : 'text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)]/60',
              )}
            >
              Todos
            </button>
            {hasOffers && (
              <button
                type="button"
                onClick={() => { setSelectedCategory(null); setSort('discount') }}
                className={clsx(
                  'shrink-0 snap-start whitespace-nowrap px-4 py-2 rounded-full text-sm font-[var(--font-cond)] tracking-wide transition-all duration-200 flex items-center gap-1.5',
                  sort === 'discount' && selectedCategory === null
                    ? 'bg-[var(--color-brand-red)] text-white shadow-[0_6px_18px_-7px_rgba(214,69,69,0.6)]'
                    : 'text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)]/60',
                )}
              >
                <span aria-hidden="true">🏷️</span> Ofertas
              </button>
            )}
            {visibleCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={clsx(
                  'shrink-0 snap-start whitespace-nowrap px-4 py-2 rounded-full text-sm font-[var(--font-cond)] tracking-wide transition-all duration-200',
                  selectedCategory === cat.id
                    ? 'bg-[var(--color-lavender)] text-[var(--color-ink)] shadow-[0_6px_18px_-7px_rgba(196,162,207,0.55)]'
                    : 'text-[var(--color-mid)] hover:text-[var(--color-cream)] hover:bg-[var(--color-card)]/60',
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
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
              <X size={12} aria-hidden="true" />
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
          ) : sortedCards.length === 0 ? (
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
              {sortedCards.map((card, i) => {
                const hasPriceRange = card.minPrice !== card.maxPrice
                return (
                  <div key={card.parent.id} className="rv" style={{ transitionDelay: `${(i % 8) * 40}ms` }}>
                    <ProductCard
                      product={card.parent}
                      images={getProductImagesForCard(card)}
                      onClick={() => navigate(`/producto/${card.parent.slug}`)}
                      displayName={card.displayName}
                      fromPrice={hasPriceRange ? card.minPrice : undefined}
                      variantCount={card.variants.length}
                      onlineAvailable={card.onlineAvailable}
                      allOutOfStock={card.allOutOfStock}
                    />
                  </div>
                )
              })}
            </div>
          )}

          {!loading && sortedCards.length > 0 && (
            <p className="mt-10 text-center text-[var(--color-mid)] font-[var(--font-cond)] text-sm tracking-widest uppercase">
              — {sortedCards.length} {sortedCards.length === 1 ? 'modelo' : 'modelos'} —
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
