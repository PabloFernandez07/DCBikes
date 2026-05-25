import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, Archive } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ProductForm } from '@/components/admin/ProductForm'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui/Toast'
import type { Product, Category } from '@/lib/database.types'
import type { ProductFormValues } from '@/components/admin/ProductForm'

const PAGE_SIZE = 20

interface ProductWithCategory extends Product {
  categories: Pick<Category, 'name'> | null
}

export default function ProductsList() {
  const navigate = useNavigate()
  const { toasts, toast, dismiss } = useToast()
  const [products, setProducts] = useState<ProductWithCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('products')
      .select('*, categories(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`)
    }
    if (categoryFilter) {
      query = query.eq('category_id', categoryFilter)
    }

    const { data, count } = await query
    setProducts((data as ProductWithCategory[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, categoryFilter])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order').then(({ data }) => {
      setCategories(data ?? [])
    })
  }, [])

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
      brand: values.brand || null,
      short_description: values.short_description || null,
      description: values.description || null,
      retail_price: Number(values.retail_price),
      stock: Number(values.stock),
      featured: values.featured,
      active: values.active,
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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-[var(--font-display)] text-[var(--color-cream)] tracking-widest">
              PRODUCTOS
            </h1>
            <p className="text-sm text-[var(--color-mid)] font-[var(--font-body)]">{total} en total</p>
          </div>
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} /> Nuevo producto
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)]" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="w-full bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl pl-9 pr-4 py-2.5 text-sm text-[var(--color-cream)] placeholder-[var(--color-mid)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(0) }}
            className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-cream)] focus:outline-none focus:border-[var(--color-lavender)] transition-colors"
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="bg-[var(--color-card)] border border-[var(--color-card-hover)] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-[var(--color-lavender)] border-t-transparent animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-card-hover)]">
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide w-14">Img</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Nombre</th>
                    <th className="px-4 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden md:table-cell">Categoría</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">PVP</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden sm:table-cell">Stock</th>
                    <th className="px-4 py-3.5 text-center text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Activo</th>
                    <th className="px-4 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      onToggleActive={() => handleToggleActive(p)}
                      onEdit={() => navigate(`/admin/productos/${p.id}`)}
                      onArchive={() => handleArchive(p)}
                    />
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-[var(--color-mid)] font-[var(--font-body)]">
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

      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </>
  )
}

function ProductRow({
  product,
  onToggleActive,
  onEdit,
  onArchive,
}: {
  product: ProductWithCategory
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
    <tr className="border-b border-[var(--color-card-hover)]/40 last:border-0 hover:bg-[var(--color-card-hover)]/30 transition-colors">
      <td className="px-4 py-3">
        <div className="w-10 h-10 rounded-lg bg-[var(--color-ink)] overflow-hidden flex items-center justify-center">
          {thumb ? (
            <img src={thumb} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[var(--color-mid)] text-xs">—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="font-[var(--font-body)] text-[var(--color-cream)] font-medium leading-tight">{product.name}</p>
        {product.sku && (
          <p className="text-xs text-[var(--color-mid)] mt-0.5">{product.sku}</p>
        )}
      </td>
      <td className="px-4 py-3 text-[var(--color-mid)] font-[var(--font-body)] hidden md:table-cell">
        {product.categories?.name ?? '—'}
      </td>
      <td className="px-4 py-3 text-right font-[var(--font-cond)] font-semibold text-[var(--color-cream)]">
        {product.retail_price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
      </td>
      <td className="px-4 py-3 text-right text-[var(--color-cream-dim)] font-[var(--font-body)] hidden sm:table-cell">
        {product.stock}
      </td>
      <td className="px-4 py-3 text-center">
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
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-lavender)] hover:bg-[var(--color-lavender)]/10 transition-colors"
            aria-label="Editar"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="p-2 rounded-lg text-[var(--color-mid)] hover:text-[var(--color-brand-red)] hover:bg-[var(--color-brand-red)]/10 transition-colors"
            aria-label="Archivar"
          >
            <Archive size={15} />
          </button>
        </div>
      </td>
    </tr>
  )
}
