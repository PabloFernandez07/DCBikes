import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, Archive, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ProductForm } from '@/components/admin/ProductForm'
import { BulkActionsBar, type BulkAction } from '@/components/admin/BulkActionsBar'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import type { Product, Category } from '@/lib/database.types'
import type { ProductFormValues } from '@/components/admin/ProductForm'
import { normalizeDecimalEs } from '@/schemas/product'

const PAGE_SIZE_OPTIONS = [10, 50, 100] as const

type StockFilter = '' | 'in' | 'out' | 'low'
type ImageFilter = '' | 'with' | 'without'

// IDs (distinct) de productos que tienen al menos una imagen. Se usa para el
// filtro "con/sin imágenes" (las imágenes viven en otra tabla, product_images).
async function fetchImageProductIds(): Promise<string[]> {
  const set = new Set<string>()
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('product_images')
      .select('product_id')
      .range(from, from + size - 1)
    if (error) break
    const rows = (data as { product_id: string | null }[]) ?? []
    for (const r of rows) if (r.product_id) set.add(r.product_id)
    if (rows.length < size) break
  }
  return Array.from(set)
}

type SortKey =
  | 'recent'
  | 'name_asc'
  | 'name_desc'
  | 'price_asc'
  | 'price_desc'
  | 'stock_asc'
  | 'stock_desc'
  | 'category_asc'
  | 'category_desc'
  | 'online_asc'
  | 'online_desc'
  | 'active_asc'
  | 'active_desc'

interface SortOption {
  value: SortKey
  label: string
  column: string
  ascending: boolean
  referencedTable?: string
}

const SORT_OPTIONS: SortOption[] = [
  { value: 'recent', label: 'Más recientes', column: 'created_at', ascending: false },
  { value: 'name_asc', label: 'Nombre A–Z', column: 'name', ascending: true },
  { value: 'name_desc', label: 'Nombre Z–A', column: 'name', ascending: false },
  { value: 'price_asc', label: 'Precio: menor a mayor', column: 'retail_price', ascending: true },
  { value: 'price_desc', label: 'Precio: mayor a menor', column: 'retail_price', ascending: false },
  { value: 'stock_asc', label: 'Stock: menor a mayor', column: 'stock', ascending: true },
  { value: 'stock_desc', label: 'Stock: mayor a menor', column: 'stock', ascending: false },
  { value: 'category_asc', label: 'Categoría A–Z', column: 'name', ascending: true, referencedTable: 'categories' },
  { value: 'category_desc', label: 'Categoría Z–A', column: 'name', ascending: false, referencedTable: 'categories' },
  { value: 'online_desc', label: 'Online primero', column: 'is_purchasable', ascending: false },
  { value: 'online_asc', label: 'Sin online primero', column: 'is_purchasable', ascending: true },
  { value: 'active_desc', label: 'Activos primero', column: 'active', ascending: false },
  { value: 'active_asc', label: 'Inactivos primero', column: 'active', ascending: true },
]

// Cabeceras de tabla clicables → par de claves de orden (asc/desc) para alternar.
type SortableField = 'name' | 'category' | 'price' | 'stock' | 'online' | 'active'
const SORTABLE_COLUMNS: Record<SortableField, { asc: SortKey; desc: SortKey }> = {
  name: { asc: 'name_asc', desc: 'name_desc' },
  category: { asc: 'category_asc', desc: 'category_desc' },
  price: { asc: 'price_asc', desc: 'price_desc' },
  stock: { asc: 'stock_asc', desc: 'stock_desc' },
  online: { asc: 'online_asc', desc: 'online_desc' },
  active: { asc: 'active_asc', desc: 'active_desc' },
}

interface ProductWithCategory extends Product {
  categories: Pick<Category, 'name'> | null
}

// Cada acción (salvo eliminar) se traduce en un UPDATE de un único campo.
const BULK_PATCH: Record<Exclude<BulkAction, 'delete'>, Partial<Product>> = {
  activate: { active: true },
  deactivate: { active: false },
  feature: { featured: true },
  unfeature: { featured: false },
  enable_online: { is_purchasable: true },
  disable_online: { is_purchasable: false },
}

// Textos del modal de confirmación por acción.
const BULK_META: Record<
  BulkAction,
  { title: string; message: (n: number) => string; confirmLabel: string; danger: boolean }
> = {
  activate: {
    title: 'Activar productos',
    message: n => `Se marcarán ${n} ${n === 1 ? 'producto' : 'productos'} como visibles en la web.`,
    confirmLabel: 'Activar',
    danger: false,
  },
  deactivate: {
    title: 'Desactivar productos',
    message: n => `Se ocultarán ${n} ${n === 1 ? 'producto' : 'productos'} de la web (dejarán de mostrarse a los clientes).`,
    confirmLabel: 'Desactivar',
    danger: false,
  },
  feature: {
    title: 'Destacar productos',
    message: n => `Se marcarán ${n} ${n === 1 ? 'producto' : 'productos'} como destacados.`,
    confirmLabel: 'Destacar',
    danger: false,
  },
  unfeature: {
    title: 'Quitar destacado',
    message: n => `Se quitará el destacado de ${n} ${n === 1 ? 'producto' : 'productos'}.`,
    confirmLabel: 'Quitar destacado',
    danger: false,
  },
  enable_online: {
    title: 'Activar venta online',
    message: n => `Se marcarán ${n} ${n === 1 ? 'producto' : 'productos'} como comprables online. Los clientes podrán añadirlos al carrito.`,
    confirmLabel: 'Activar online',
    danger: false,
  },
  disable_online: {
    title: 'Desactivar venta online',
    message: n => `Se desactivará "Comprar online" en ${n} ${n === 1 ? 'producto' : 'productos'}. Solo aparecerán como consulta para tienda.`,
    confirmLabel: 'Desactivar online',
    danger: false,
  },
  delete: {
    title: 'Eliminar productos',
    message: n => `Se eliminarán definitivamente ${n} ${n === 1 ? 'producto' : 'productos'}, junto con sus imágenes y avisos de stock. El histórico de pedidos y facturas se conserva. Esta acción no se puede deshacer.`,
    confirmLabel: 'Eliminar',
    danger: true,
  },
}

export default function ProductsList() {
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()
  const [products, setProducts] = useState<ProductWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  // `searchInput` refleja lo tecleado; `search` (con debounce de 300 ms) es lo
  // que dispara la query. Sin esto se lanzaba 1 query por tecla (PERF-M5).
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [onlyOnline, setOnlyOnline] = useState(false)
  const [onlyGrouped, setOnlyGrouped] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('')
  const [imageFilter, setImageFilter] = useState<ImageFilter>('')
  const [sortKey, setSortKey] = useState<SortKey>('recent')
  const [pageSize, setPageSize] = useState<number>(50)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [pendingBulk, setPendingBulk] = useState<BulkAction | null>(null)
  const [bulkRunning, setBulkRunning] = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const sort = SORT_OPTIONS.find(s => s.value === sortKey) ?? SORT_OPTIONS[0]
    let query = supabase
      .from('products')
      .select('*, categories(name)', { count: 'exact' })
      .order(
        sort.column,
        sort.referencedTable
          ? { ascending: sort.ascending, referencedTable: sort.referencedTable }
          : { ascending: sort.ascending },
      )
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`)
    }
    if (categoryFilter) {
      query = query.eq('category_id', categoryFilter)
    }
    if (onlyOnline) {
      query = query.eq('is_purchasable', true)
    }
    if (onlyGrouped) {
      query = query.not('model_group', 'is', null)
    }

    // Rango de precio (PVP). Solo se aplica si el valor es un número válido.
    const min = parseFloat(minPrice.replace(',', '.'))
    const max = parseFloat(maxPrice.replace(',', '.'))
    if (Number.isFinite(min)) {
      query = query.gte('retail_price', min)
    }
    if (Number.isFinite(max)) {
      query = query.lte('retail_price', max)
    }

    // Filtro de stock.
    if (stockFilter === 'in') {
      query = query.gt('stock', 0)
    } else if (stockFilter === 'out') {
      query = query.eq('stock', 0)
    } else if (stockFilter === 'low') {
      query = query.gt('stock', 0).lte('stock', 5)
    }

    // Filtro por imágenes (con/sin foto). Se obtienen los IDs con imagen y se
    // filtra por inclusión o exclusión sobre esa lista.
    if (imageFilter) {
      const idsWithImages = await fetchImageProductIds()
      if (imageFilter === 'with') {
        if (idsWithImages.length === 0) {
          setProducts([])
          setTotal(0)
          setLoading(false)
          return
        }
        query = query.in('id', idsWithImages)
      } else if (idsWithImages.length > 0) {
        query = query.not('id', 'in', `(${idsWithImages.join(',')})`)
      }
    }

    const { data, count } = await query
    setProducts((data as ProductWithCategory[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, pageSize, search, categoryFilter, onlyOnline, onlyGrouped, minPrice, maxPrice, stockFilter, imageFilter, sortKey])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Debounce de la búsqueda: confirma el término (y resetea la página) cuando
  // el usuario deja de teclear durante 300 ms.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order').then(({ data }) => {
      setCategories(data ?? [])
    })
  }, [])

  // Reset bulk selection when filters change (the visible page changed).
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, pageSize, search, categoryFilter, onlyOnline, onlyGrouped, minPrice, maxPrice, stockFilter, imageFilter, sortKey])

  const handleToggleActive = async (product: Product) => {
    const { error } = await supabase
      .from('products')
      .update({ active: !product.active })
      .eq('id', product.id)
    if (!error) {
      setProducts(prev =>
        prev.map(p => (p.id === product.id ? { ...p, active: !product.active } : p)),
      )
    }
  }

  const handleArchive = async (product: Product) => {
    const { error } = await supabase
      .from('products')
      .update({ active: false })
      .eq('id', product.id)
    if (!error) {
      setProducts(prev =>
        prev.map(p => (p.id === product.id ? { ...p, active: false } : p)),
      )
      toast.success('Producto archivado')
    }
  }

  const handleCreate = async (values: ProductFormValues) => {
    setSaving(true)
    const { error } = await supabase.from('products').insert({
      name: values.name,
      slug: values.slug,
      category_id: values.category_id,
      sku: values.sku || null,
      ean: values.ean || null,
      brand: values.brand || null,
      short_description: values.short_description || null,
      description: values.description || null,
      // normalizeDecimalEs: el schema acepta coma decimal ("12,50"), la
      // conversión a número debe aceptarla igual o guardaríamos NaN.
      retail_price: Number(normalizeDecimalEs(values.retail_price)),
      discount_percent: values.discount_percent ? Number(normalizeDecimalEs(values.discount_percent)) : null,
      stock: Number(values.stock),
      featured: values.featured,
      active: values.active,
      is_purchasable: values.is_purchasable,
      size_label: values.size_label?.trim() ? values.size_label.trim() : null,
      model_group: values.model_group?.trim() ? values.model_group.trim() : null,
      weight_grams: values.weight_grams ? Number(values.weight_grams) : null,
    })
    setSaving(false)
    if (error) {
      toast.error('Error al crear el producto: ' + error.message)
    } else {
      toast.success('Producto creado')
      setModalOpen(false)
      fetchProducts()
    }
  }

  // ─── Bulk selection ─────────────────────────────────────────────────
  const visibleIds = useMemo(() => products.map(p => p.id), [products])
  const allSelected =
    visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const someSelected = visibleIds.some(id => selectedIds.has(id))

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleIds))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runBulk = async () => {
    if (!pendingBulk || selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkRunning(true)

    let error: { message: string } | null = null
    if (pendingBulk === 'delete') {
      const res = await supabase.from('products').delete().in('id', ids)
      error = res.error
    } else {
      const res = await supabase.from('products').update(BULK_PATCH[pendingBulk]).in('id', ids)
      error = res.error
    }

    setBulkRunning(false)
    if (error) {
      toast.error('Error en la acción en lote: ' + error.message)
      setPendingBulk(null)
      return
    }

    const n = ids.length
    if (pendingBulk === 'delete') {
      toast.success(`${n} ${n === 1 ? 'producto eliminado' : 'productos eliminados'}`)
      setSelectedIds(new Set())
      fetchProducts()
    } else {
      const patch = BULK_PATCH[pendingBulk]
      toast.success(`${n} ${n === 1 ? 'producto actualizado' : 'productos actualizados'}`)
      setProducts(prev =>
        prev.map(p => (selectedIds.has(p.id) ? { ...p, ...patch } : p)),
      )
      setSelectedIds(new Set())
    }
    setPendingBulk(null)
  }

  // Click en cabecera: primera vez ordena ascendente; siguiente click alterna.
  const handleSort = (field: SortableField) => {
    const { asc, desc } = SORTABLE_COLUMNS[field]
    setSortKey(prev => (prev === asc ? desc : asc))
    setPage(0)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
              PRODUCTOS
            </h1>
            <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">{total} en total</p>
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)} className="shrink-0">
            <Plus size={16} aria-hidden="true" /> <span className="hidden sm:inline">Nuevo producto</span><span className="sm:hidden">Nuevo</span>
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)]" aria-hidden="true" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="w-full bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(0) }}
            className="w-full sm:w-auto bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Rango de precio (PVP) */}
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="€ mín"
              aria-label="Precio mínimo"
              value={minPrice}
              onChange={e => { setMinPrice(e.target.value); setPage(0) }}
              className="flex-1 sm:flex-none sm:w-24 bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
            />
            <span className="text-[var(--color-mid)] text-sm" aria-hidden="true">–</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="€ máx"
              aria-label="Precio máximo"
              value={maxPrice}
              onChange={e => { setMaxPrice(e.target.value); setPage(0) }}
              className="flex-1 sm:flex-none sm:w-24 bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-3 py-2.5 text-sm text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
            />
          </div>

          {/* Filtro de stock */}
          <select
            value={stockFilter}
            onChange={e => { setStockFilter(e.target.value as StockFilter); setPage(0) }}
            aria-label="Filtrar por stock"
            className="w-full sm:w-auto bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            <option value="">Cualquier stock</option>
            <option value="in">Con stock</option>
            <option value="out">Sin stock</option>
            <option value="low">Stock bajo (≤5)</option>
          </select>

          {/* Filtro por imágenes */}
          <select
            value={imageFilter}
            onChange={e => { setImageFilter(e.target.value as ImageFilter); setPage(0) }}
            aria-label="Filtrar por imágenes"
            className="w-full sm:w-auto bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            <option value="">Con y sin imágenes</option>
            <option value="with">Con imágenes</option>
            <option value="without">Sin imágenes</option>
          </select>

          {/* Ordenación */}
          <select
            value={sortKey}
            onChange={e => { setSortKey(e.target.value as SortKey); setPage(0) }}
            aria-label="Ordenar productos"
            className="w-full sm:w-auto bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>Orden: {o.label}</option>
            ))}
          </select>

          <FilterToggle
            label="Solo online"
            checked={onlyOnline}
            onChange={v => { setOnlyOnline(v); setPage(0) }}
          />
          <FilterToggle
            label="Solo agrupados"
            checked={onlyGrouped}
            onChange={v => { setOnlyGrouped(v); setPage(0) }}
          />

          {/* Tamaño de página */}
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}
            aria-label="Productos por página"
            className="w-full sm:w-auto sm:ml-auto bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            {PAGE_SIZE_OPTIONS.map(n => (
              <option key={n} value={n}>{n} por página</option>
            ))}
          </select>
        </div>

        {selectedIds.size > 0 && (
          <BulkActionsBar
            count={selectedIds.size}
            onAction={setPendingBulk}
            onClear={() => setSelectedIds(new Set())}
            disabled={bulkRunning}
          />
        )}

        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-3 py-3.5 w-10">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos"
                        checked={allSelected}
                        ref={el => {
                          if (el) el.indeterminate = !allSelected && someSelected
                        }}
                        onChange={toggleSelectAll}
                        className="accent-[var(--color-lavender)] cursor-pointer"
                      />
                    </th>
                    <th className="px-3 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-14">Img</th>
                    <SortTh label="Nombre" field="name" sortKey={sortKey} onSort={handleSort} />
                    <SortTh label="Categoría" field="category" sortKey={sortKey} onSort={handleSort} className="hidden md:table-cell" />
                    <th className="px-3 py-3.5 text-center text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden lg:table-cell">Talla</th>
                    <th className="px-3 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden lg:table-cell">Grupo</th>
                    <SortTh label="PVP" field="price" sortKey={sortKey} onSort={handleSort} align="right" />
                    <SortTh label="Stock" field="stock" sortKey={sortKey} onSort={handleSort} align="right" className="hidden sm:table-cell" />
                    <SortTh label="Online" field="online" sortKey={sortKey} onSort={handleSort} align="center" />
                    <SortTh label="Activo" field="active" sortKey={sortKey} onSort={handleSort} align="center" />
                    <th className="px-3 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      selected={selectedIds.has(p.id)}
                      onToggleSelected={() => toggleOne(p.id)}
                      onToggleActive={() => handleToggleActive(p)}
                      onEdit={() => navigate(`/admin/productos/${p.id}`)}
                      onArchive={() => handleArchive(p)}
                    />
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-5 py-10 text-center text-[var(--color-mid)] font-[var(--font-body)]">
                        No se encontraron productos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Anterior
            </Button>
            <span className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nuevo producto"
        size="lg"
      >
        <ProductForm
          onSave={handleCreate}
          onCancel={() => setModalOpen(false)}
          loading={saving}
        />
      </Modal>

      <Modal
        open={pendingBulk !== null}
        onClose={() => (bulkRunning ? undefined : setPendingBulk(null))}
        title={pendingBulk ? BULK_META[pendingBulk].title : 'Confirmar acción en lote'}
        size="sm"
      >
        {pendingBulk && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-cream-dim)] font-[var(--font-body)] leading-relaxed">
              {BULK_META[pendingBulk].message(selectedIds.size)}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--color-card-hover)]">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPendingBulk(null)}
                disabled={bulkRunning}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant={BULK_META[pendingBulk].danger ? 'danger' : 'primary'}
                loading={bulkRunning}
                onClick={runBulk}
              >
                {BULK_META[pendingBulk].confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

function SortTh({
  label,
  field,
  sortKey,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string
  field: SortableField
  sortKey: SortKey
  onSort: (field: SortableField) => void
  align?: 'left' | 'center' | 'right'
  className?: string
}) {
  const col = SORTABLE_COLUMNS[field]
  const isAsc = sortKey === col.asc
  const isDesc = sortKey === col.desc
  const active = isAsc || isDesc

  return (
    <th
      className={clsx(
        'px-3 py-3.5 font-[var(--font-cond)] tracking-wide',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={`Ordenar por ${label}`}
        className={clsx(
          'inline-flex items-center gap-1 transition-colors hover:text-[var(--color-cream)]',
          align === 'right' && 'flex-row-reverse',
          align === 'center' && 'w-full justify-center',
          active ? 'text-[var(--color-lavender)]' : 'text-[var(--color-mid)]',
        )}
      >
        {label}
        {isAsc ? (
          <ChevronUp size={13} aria-hidden="true" />
        ) : isDesc ? (
          <ChevronDown size={13} aria-hidden="true" />
        ) : (
          <ChevronsUpDown size={13} aria-hidden="true" className="opacity-40" />
        )}
      </button>
    </th>
  )
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-xl bg-[var(--color-card)] border border-[var(--color-card-hover)] hover:border-[var(--color-mid)]/60 transition-colors">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-[var(--color-lavender)]' : 'bg-[var(--color-mid)]/40',
        )}
      >
        <span
          className={clsx(
            'inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-3.5' : 'translate-x-0.5',
          )}
        />
      </button>
      <span className="text-xs font-[var(--font-cond)] text-[var(--color-cream-dim)] tracking-wide whitespace-nowrap">
        {label}
      </span>
    </label>
  )
}

function ProductRow({
  product,
  selected,
  onToggleSelected,
  onToggleActive,
  onEdit,
  onArchive,
}: {
  product: ProductWithCategory
  selected: boolean
  onToggleSelected: () => void
  onToggleActive: () => void
  onEdit: () => void
  onArchive: () => void
}) {
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('product_images')
      .select('storage_path')
      .eq('product_id', product.id)
      .order('sort_order')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const { data: url } = supabase.storage.from('product-images').getPublicUrl(data.storage_path)
          setThumb(url.publicUrl)
        }
      })
  }, [product.id])

  return (
    <tr
      className={clsx(
        'border-b border-[var(--color-card-hover)]/40 last:border-0 transition-colors',
        selected
          ? 'bg-[var(--color-lavender)]/10 hover:bg-[var(--color-lavender)]/15'
          : 'hover:bg-[var(--color-card-hover)]/30',
      )}
    >
      <td className="px-3 py-3">
        <input
          type="checkbox"
          aria-label={`Seleccionar ${product.name}`}
          checked={selected}
          onChange={onToggleSelected}
          className="accent-[var(--color-lavender)] cursor-pointer"
        />
      </td>
      <td className="px-3 py-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-ink)] overflow-hidden flex items-center justify-center">
          {thumb ? (
            <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[var(--color-mid)] text-xs">—</span>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="font-[var(--font-body)] text-[var(--color-cream)] font-medium leading-tight">{product.name}</p>
        {product.sku && (
          <p className="text-xs text-[var(--color-mid)] mt-0.5">{product.sku}</p>
        )}
      </td>
      <td className="px-3 py-3 text-[var(--color-mid)] font-[var(--font-body)] hidden md:table-cell">
        {product.categories?.name ?? '—'}
      </td>
      <td className="px-3 py-3 text-center font-[var(--font-cond)] text-[var(--color-cream-dim)] hidden lg:table-cell">
        {product.size_label ? (
          <span className="inline-flex items-center justify-center min-w-7 px-2 py-0.5 rounded-md bg-[var(--color-ink)] text-xs">
            {product.size_label}
          </span>
        ) : (
          <span className="text-[var(--color-mid)]">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-[var(--color-mid)] font-[var(--font-body)] text-xs hidden lg:table-cell">
        {product.model_group ? (
          <span className="font-mono text-[var(--color-lavender)]/80">{product.model_group}</span>
        ) : (
          <span>—</span>
        )}
      </td>
      <td className="px-3 py-3 text-right font-[var(--font-cond)] font-semibold text-[var(--color-cream)]">
        {product.retail_price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
      </td>
      <td className="px-3 py-3 text-right text-[var(--color-cream-dim)] font-[var(--font-body)] hidden sm:table-cell">
        {product.stock}
      </td>
      <td className="px-3 py-3 text-center">
        <OnlineBadge active={product.is_purchasable} />
      </td>
      <td className="px-3 py-3 text-center">
        <button
          type="button"
          role="switch"
          aria-checked={product.active}
          onClick={onToggleActive}
          className={clsx(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200',
            product.active ? 'bg-[var(--color-lavender)]' : 'bg-[var(--color-card-hover)]',
          )}
        >
          <span
            className={clsx(
              'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200',
              product.active ? 'translate-x-4' : 'translate-x-0.5',
            )}
          />
        </button>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors"
            aria-label="Editar"
          >
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-colors"
            aria-label="Archivar"
          >
            <Archive size={15} aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function OnlineBadge({ active }: { active: boolean }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-[var(--font-cond)] font-semibold tracking-wider uppercase',
        active
          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
          : 'bg-[var(--color-card-hover)] text-[var(--color-mid)] border border-transparent',
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          active ? 'bg-emerald-400' : 'bg-[var(--color-mid)]',
        )}
      />
      {active ? 'Online' : 'Off'}
    </span>
  )
}
