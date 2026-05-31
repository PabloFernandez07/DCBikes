import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Pencil, Archive } from 'lucide-react'
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

const PAGE_SIZE = 20

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
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [onlyOnline, setOnlyOnline] = useState(false)
  const [onlyGrouped, setOnlyGrouped] = useState(false)
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
    if (onlyOnline) {
      query = query.eq('is_purchasable', true)
    }
    if (onlyGrouped) {
      query = query.not('model_group', 'is', null)
    }

    const { data, count } = await query
    setProducts((data as ProductWithCategory[]) ?? [])
    setTotal(count ?? 0)
    setLoading(false)
  }, [page, search, categoryFilter, onlyOnline, onlyGrouped])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  useEffect(() => {
    supabase.from('categories').select('*').order('sort_order').then(({ data }) => {
      setCategories(data ?? [])
    })
  }, [])

  // Reset bulk selection when filters change (the visible page changed).
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, search, categoryFilter, onlyOnline, onlyGrouped])

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
      retail_price: Number(values.retail_price),
      discount_percent: values.discount_percent ? Number(values.discount_percent) : null,
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
            <Plus size={16} aria-hidden="true" /> Nuevo producto
          </Button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-mid)]" aria-hidden="true" />
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
              <table className="w-full text-sm">
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
                    <th className="px-3 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Nombre</th>
                    <th className="px-3 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden md:table-cell">Categoría</th>
                    <th className="px-3 py-3.5 text-center text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden lg:table-cell">Talla</th>
                    <th className="px-3 py-3.5 text-left text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden lg:table-cell">Grupo</th>
                    <th className="px-3 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">PVP</th>
                    <th className="px-3 py-3.5 text-right text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide hidden sm:table-cell">Stock</th>
                    <th className="px-3 py-3.5 text-center text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Online</th>
                    <th className="px-3 py-3.5 text-center text-[var(--color-mid)] font-[var(--font-cond)] tracking-wide">Activo</th>
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
